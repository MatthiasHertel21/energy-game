from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from .extensions import db
from .models import Session, Scenario, CohortMember, Cohort, SessionStatus, User, Result, SessionPlayerType
from .kpi_schema import canonicalize_kpis
import os
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
        for s, sc, ch in q.all():
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
                cs_mapping = CampaignScenario.query.filter_by(scenario_id=sc.id).first()
                if cs_mapping:
                    campaign_id = cs_mapping.campaign_id
            
            # Get player type for this user in this session
            player_type_name = None
            spt = SessionPlayerType.query.filter_by(session_id=s.id, user_id=uid).first()
            if spt and spt.type_id:
                player_types = config.get("player_types", [])
                for pt in player_types:
                    if pt.get("id") == spt.type_id:
                        player_type_name = pt.get("name")
                        break
            
            # Calculate challenge points for this user
            total_points = 0
            user_results = Result.query.filter_by(session_id=s.id, player_id=uid).all()
            for result in user_results:
                if result.data and "challenge_result" in result.data:
                    cr = result.data["challenge_result"]
                    if isinstance(cr, dict) and "challenges" in cr:
                        for ch_result in cr["challenges"]:
                            if ch_result.get("achieved"):
                                total_points += ch_result.get("points", 0)
            
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
        
        # Get player results for KPI aggregation
        results = Result.query.filter_by(player_id=uid).all()
        
        total_profit = 0
        total_revenue = 0
        total_imbalance = 0
        total_curtailment = 0
        total_rounds = len(results)
        
        for r in results:
            if r.data and "kpis" in r.data:
                kpis = canonicalize_kpis(r.data["kpis"])
                total_profit += kpis.get("profit_zar", 0)
                total_revenue += kpis.get("revenue_zar", 0)
                total_imbalance += kpis.get("imbalance_cost_zar", 0)
                total_curtailment += kpis.get("curtailment_cost_zar", 0)
        
        # Calculate best rank (minimum rank value = best)
        best_rank = None
        if results:
            # Get all session IDs where user has results
            session_ids = list(set(r.session_id for r in results))
            for sid in session_ids:
                # Get all results for this session with aggregated profits
                session_results = Result.query.filter_by(session_id=sid).all()
                # Calculate total profit per player for ranking
                player_profits = {}
                for res in session_results:
                    if res.data and "kpis" in res.data:
                        kpis = canonicalize_kpis(res.data["kpis"])
                        player_profits[res.player_id] = player_profits.get(res.player_id, 0) + kpis.get("profit_zar", 0)
                
                # Sort by profit
                sorted_players = sorted(player_profits.items(), key=lambda x: x[1], reverse=True)
                # Find user's rank (1-indexed)
                for idx, (pid, _) in enumerate(sorted_players, start=1):
                    if pid == uid:
                        if best_rank is None or idx < best_rank:
                            best_rank = idx
                        break
        
        # Get recent sessions with details
        recent_sessions = []
        for s in sorted(all_sessions, key=lambda x: x.id, reverse=True)[:10]:
            scenario = Scenario.query.get(s.scenario_id)
            cohort = Cohort.query.get(s.cohort_id)
            
            # Get user's results for this session and sum up profit
            session_results = Result.query.filter_by(session_id=s.id, player_id=uid).all()
            session_profit = 0
            for result in session_results:
                if result.data and "kpis" in result.data:
                    kpis = canonicalize_kpis(result.data["kpis"])
                    session_profit += kpis.get("profit_zar", 0)
            
            recent_sessions.append({
                "id": s.id,
                "scenario_name": scenario.name if scenario else "Unknown",
                "cohort_name": cohort.name if cohort else "Unknown",
                "status": s.status.value,
                "mode": s.mode,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "current_round": s.current_round,
                "profit": session_profit if session_results else None,
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