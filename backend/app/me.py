from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, text

from .extensions import db
from .models import Session, Scenario, CohortMember, Cohort, SessionStatus, User, Result, SessionPlayerType
from .kpi_schema import canonicalize_kpis
import os
import json
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:
    _redis_client = None


ns = Namespace("me", description="Current user endpoints")


@ns.route("/sessions")
class MySessions(Resource):
    @jwt_required()
    def get(self):
        uid = int(get_jwt_identity())
        # sessions for cohorts the user is a member of (include completed sessions for replay)
        from .models import CampaignScenario
        q = (
            db.session.query(Session, Scenario, Cohort)
            .join(Scenario, Scenario.id == Session.scenario_id)
            .join(Cohort, Cohort.id == Session.cohort_id)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(CohortMember.user_id == uid)
            .filter(Session.status.in_([
                SessionStatus.created, 
                SessionStatus.briefing,
                SessionStatus.running, 
                SessionStatus.round_active,
                SessionStatus.round_results,
                SessionStatus.paused,
                SessionStatus.scenario_complete,
                SessionStatus.ended
            ]))
            .order_by(Session.id.desc())
        )
        out = []
        rows = q.all()
        session_ids = [s.id for s, _, _ in rows]
        scenario_ids = {sc.id for _, sc, _ in rows}

        # --- Batch all per-session lookups once (RULE 1: no N+1 in the loop) ---
        # Player type per session for this user.
        spt_by_session = {}
        if session_ids:
            for spt in SessionPlayerType.query.filter(
                SessionPlayerType.session_id.in_(session_ids),
                SessionPlayerType.user_id == uid,
            ).all():
                spt_by_session[spt.session_id] = spt
        # Campaign mapping for scenarios that lack a direct campaign_id.
        campaign_by_scenario = {}
        if scenario_ids:
            for cs in CampaignScenario.query.filter(
                CampaignScenario.scenario_id.in_(scenario_ids)
            ).all():
                campaign_by_scenario.setdefault(cs.scenario_id, cs.campaign_id)
        # Challenge points: select ONLY `data` (never the large bid_dispatch blob),
        # batched across all sessions, grouped by session in Python.
        points_by_session = {}
        if session_ids:
            for r in (
                db.session.query(Result.session_id, Result.data)
                .filter(Result.player_id == uid, Result.session_id.in_(session_ids))
                .all()
            ):
                if r.data and "challenge_result" in r.data:
                    cr = r.data["challenge_result"]
                    if isinstance(cr, dict) and "challenges" in cr:
                        acc = points_by_session.get(r.session_id, 0)
                        for ch_result in cr["challenges"]:
                            if ch_result.get("achieved"):
                                acc += ch_result.get("points", 0)
                        points_by_session[r.session_id] = acc

        for s, sc, ch in rows:
            config = sc.config or {}
            general = config.get("general", {})
            market = config.get("market", {})
            max_rounds = general.get("rounds", 10)
            # next_round_at: estimate based on round_span_hours
            round_span_hours = general.get("round_span_hours", 6)
            next_round_at = None
            if s.status == SessionStatus.running and s.started_at:
                from datetime import timedelta
                elapsed_rounds = s.current_round - 1
                next_round_at = (s.started_at + timedelta(hours=elapsed_rounds * round_span_hours)).isoformat()
            
            # Get campaign_id from CampaignScenario mapping (scenarios may not have campaign_id directly)
            campaign_id = sc.campaign_id
            if not campaign_id:
                campaign_id = campaign_by_scenario.get(sc.id)
            
            # Get player type for this user in this session
            player_type_name = None
            spt = spt_by_session.get(s.id)
            if spt and spt.type_id:
                player_types = config.get("player_types", [])
                for pt in player_types:
                    if pt.get("id") == spt.type_id:
                        player_type_name = pt.get("name")
                        break
            
            # Challenge points for this user (pre-aggregated above)
            total_points = points_by_session.get(s.id, 0)
            
            out.append({
                "id": s.id,
                "scenario_id": s.scenario_id,
                "scenario_name": sc.name,
                "campaign_id": campaign_id,
                "cohort_name": ch.name,
                "status": s.status.value,
                "current_round": s.current_round,
                "max_rounds": max_rounds,
                "mode": s.mode,
                "next_round_at": next_round_at,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "general": general,
                "market": market,
                "player_type": player_type_name,
                "total_points": total_points,
            })
        return out


@ns.route("/navigate")
class MyNavigate(Resource):
    @jwt_required()
    def get(self):
        """Return a force navigation URL for the current user if trainer initiated one for any of user's cohorts."""
        uid = int(get_jwt_identity())
        if not _redis_client:
            return {"url": None}
        # find cohort memberships
        cohort_ids = [row.cohort_id for row in CohortMember.query.filter_by(user_id=uid).all()]
        for cid in cohort_ids:
            key = f"cohort:{cid}:force_nav"
            try:
                val = _redis_client.get(key)
            except Exception:
                val = None
            if val:
                url = val.decode() if isinstance(val, (bytes, bytearray)) else str(val)
                return {"url": url}
        return {"url": None}


@ns.route("/profile")
class MyProfile(Resource):
    @jwt_required()
    def get(self):
        """Return user profile with statistics and performance data."""
        uid = int(get_jwt_identity())
        user = User.query.get(uid)
        
        if not user:
            return {"error": "User not found"}, 404
        
        # Get all sessions for cohorts the user is in
        sessions_query = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(CohortMember.user_id == uid)
        )
        
        all_sessions = sessions_query.all()
        active_sessions = [s for s in all_sessions if s.status in [SessionStatus.running, SessionStatus.round_active, SessionStatus.paused]]
        completed_sessions = [s for s in all_sessions if s.status in [SessionStatus.ended, SessionStatus.scenario_complete]]
        
        # Get player KPI totals via a server-side aggregation.
        # IMPORTANT: each result `data` row is ~200 KB. Loading the full blobs to
        # sum four scalar KPIs transferred >1 MB and parsed it in Python on every
        # poll (~1s/request, pinning the single eventlet worker). SUM the scalars
        # in Postgres instead so only per-session totals cross the wire.
        # profit/revenue/imbalance/curtailment are stored under the canonical kpis
        # keys, matching canonicalize_kpis (which does no remapping for them).
        stats_rows = db.session.execute(
            text(
                """
                SELECT session_id,
                       COUNT(*) AS rounds,
                       SUM(COALESCE((data #>> '{kpis,profit_zar}')::float8, 0)) AS profit,
                       SUM(COALESCE((data #>> '{kpis,revenue_zar}')::float8, 0)) AS revenue,
                       SUM(COALESCE((data #>> '{kpis,imbalance_cost_zar}')::float8, 0)) AS imbalance,
                       SUM(COALESCE((data #>> '{kpis,curtailment_cost_zar}')::float8, 0)) AS curtailment
                FROM results
                WHERE player_id = :uid
                GROUP BY session_id
                """
            ),
            {"uid": uid},
        ).fetchall()

        profit_by_session = {row.session_id: float(row.profit or 0) for row in stats_rows}
        total_profit = sum(profit_by_session.values())
        total_revenue = sum(float(row.revenue or 0) for row in stats_rows)
        total_imbalance = sum(float(row.imbalance or 0) for row in stats_rows)
        total_curtailment = sum(float(row.curtailment or 0) for row in stats_rows)
        total_rounds = sum(int(row.rounds or 0) for row in stats_rows)
        result_session_ids = list(profit_by_session.keys())
        
        # Calculate best rank (minimum rank value = best).
        # RULE 1 + memory: computing this in Python required loading EVERY player's
        # full result JSON for each of the user's sessions (~N players x R rounds x
        # ~8 KB) and running canonicalize_kpis on each. For a 100+ player session
        # that is ~9 MB transferred and parsed per /api/me/profile poll, which
        # pinned the single eventlet worker (multi-second responses, OOM under
        # load). Extract profit_zar server-side in Postgres and rank with a window
        # function so only the final scalar rank crosses the wire.
        #
        # RULE 1 + RULE 5: the ranking aggregation scans EVERY player's result in
        # each of this user's sessions (~N players x R rounds). Recomputing it on
        # every /api/me/profile poll pinned the single eventlet worker for ~8.8s.
        # Instead cache the full per-session ranking ({player_id: rank}) in Redis
        # (shared across all players in that session, TTL 90s) so the heavy query
        # runs at most once per session per 90s rather than once per poll. The
        # per-row regex was also dropped (profit_zar is always numeric) which cut
        # the cold query from ~8.8s to ~2.8s for 6 sessions.
        best_rank = None
        if result_session_ids:
            session_ids = list(result_session_ids)
            ranks_by_session = {}  # session_id -> {str(player_id): rank}
            missing = []
            for s_id in session_ids:
                cached = None
                if _redis_client is not None:
                    try:
                        raw = _redis_client.get(f"profile_rank:{s_id}")
                        if raw:
                            cached = json.loads(raw)
                    except Exception:
                        cached = None
                if cached is not None:
                    ranks_by_session[s_id] = cached
                else:
                    missing.append(s_id)

            if missing:
                rank_rows = db.session.execute(
                    text(
                        """
                        WITH per_player AS (
                            SELECT session_id, player_id,
                                   SUM(COALESCE((data #>> '{kpis,profit_zar}')::float8, 0)) AS profit
                            FROM results
                            WHERE session_id = ANY(:sids)
                            GROUP BY session_id, player_id
                        )
                        SELECT session_id, player_id,
                               RANK() OVER (PARTITION BY session_id ORDER BY profit DESC) AS rnk
                        FROM per_player
                        """
                    ),
                    {"sids": missing},
                ).fetchall()
                computed = {}
                for row in rank_rows:
                    computed.setdefault(row.session_id, {})[str(row.player_id)] = int(row.rnk)
                for s_id in missing:
                    s_ranks = computed.get(s_id, {})
                    ranks_by_session[s_id] = s_ranks
                    if _redis_client is not None:
                        try:
                            _redis_client.setex(f"profile_rank:{s_id}", 90, json.dumps(s_ranks))
                        except Exception:
                            pass

            uid_str = str(uid)
            user_ranks = [d[uid_str] for d in ranks_by_session.values() if uid_str in d]
            best_rank = min(user_ranks) if user_ranks else None
        
        # Get recent sessions with details.
        # RULE 1: batch the scenario, cohort and per-session profit lookups once
        # instead of querying inside the loop.
        recent_slice = sorted(all_sessions, key=lambda x: x.id, reverse=True)[:10]
        recent_ids = [s.id for s in recent_slice]
        scenario_ids = {s.scenario_id for s in recent_slice}
        cohort_ids = {s.cohort_id for s in recent_slice}
        scenarios_by_id = {
            sc.id: sc for sc in Scenario.query.filter(Scenario.id.in_(scenario_ids)).all()
        } if scenario_ids else {}
        cohorts_by_id = {
            c.id: c for c in Cohort.query.filter(Cohort.id.in_(cohort_ids)).all()
        } if cohort_ids else {}
        # Per-recent-session profit reuses the aggregation above (no extra
        # query and no 200 KB blob load).
        profit_by_recent_session = {
            s_id: profit_by_session[s_id]
            for s_id in recent_ids
            if s_id in profit_by_session
        }
        
        recent_sessions = []
        for s in recent_slice:
            scenario = scenarios_by_id.get(s.scenario_id)
            cohort = cohorts_by_id.get(s.cohort_id)
            has_results = s.id in profit_by_recent_session
            session_profit = profit_by_recent_session.get(s.id, 0)
            
            recent_sessions.append({
                "id": s.id,
                "scenario_name": scenario.name if scenario else "Unknown",
                "cohort_name": cohort.name if cohort else "Unknown",
                "status": s.status.value,
                "mode": s.mode,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "current_round": s.current_round,
                "profit": session_profit if has_results else None,
                "rank": None  # Will be calculated if needed
            })
        
        return {
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
                "created_at": user.created_at.isoformat() if hasattr(user, 'created_at') and user.created_at else None,
                "avatar_url": user.avatar_url if hasattr(user, 'avatar_url') else None,
                "name": user.name if hasattr(user, 'name') else None,
                "bio": user.bio if hasattr(user, 'bio') else None
            },
            "statistics": {
                "total_sessions": len(all_sessions),
                "active_sessions": len(active_sessions),
                "completed_sessions": len(completed_sessions),
                "total_rounds_played": total_rounds
            },
            "performance": {
                "total_profit_zar": round(total_profit, 2),
                "total_revenue_zar": round(total_revenue, 2),
                "total_imbalance_cost_zar": round(total_imbalance, 2),
                "total_curtailment_cost_zar": round(total_curtailment, 2),
                "avg_profit_per_session": round(total_profit / len(completed_sessions), 2) if completed_sessions else 0,
                "best_rank": best_rank
            },
            "recent_sessions": recent_sessions
        }

    @jwt_required()
    def put(self):
        """Update user profile (name and bio)."""
        uid = int(get_jwt_identity())
        user = User.query.get(uid)
        
        if not user:
            return {"error": "User not found"}, 404
        
        from flask import request
        data = request.get_json()
        
        if "name" in data:
            user.name = data["name"]
        if "bio" in data:
            user.bio = data["bio"]
        
        db.session.commit()
        
        return {
            "message": "Profile updated successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "bio": user.bio
            }
        }