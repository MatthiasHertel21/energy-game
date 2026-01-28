from http import HTTPStatus
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from .extensions import db, socketio
from .scheduler import run_rounds
from .models import Session, SessionStatus, Scenario, Campaign, SessionAllowedType, SessionPlayerType, ActivityLog, User, CohortMember, Forecast
from .utils import role_required, log_activity
import os, json
from datetime import datetime
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:
    _redis_client = None


ns = Namespace("sessions", description="Trainer session control")

session_in = ns.model(
    "SessionCreate",
    {
        "cohort_id": fields.Integer(required=True),
        "scenario_id": fields.Integer(required=True),
        "mode": fields.String(required=False, enum=["isolated_per_player", "shared_market"], description="Market mode"),
        "force_navigate": fields.Boolean(required=False, description="If true, push players of the cohort to the briefing page"),
    },
)

broadcast_in = ns.model("Broadcast", {"message": fields.String(required=True)})


def emit_trainer(event: str, payload: dict):
    socketio.emit(event, payload, namespace="/trainer")


@ns.route("")
class Sessions(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(session_in, validate=True)
    def post(self):
        data = request.json
        # Guard: prevent starting a new session if this cohort already has an active one
        try:
            existing = (
                db.session.query(Session.id)
                .filter(
                    Session.cohort_id == int(data["cohort_id"]),
                    Session.status.in_([SessionStatus.created, SessionStatus.running, SessionStatus.paused]),
                )
                .first()
            )
            if existing:
                return {"error": "An active scenario for this cohort already exists."}, HTTPStatus.CONFLICT
        except Exception:
            pass
        s = Session(
            cohort_id=data["cohort_id"],
            scenario_id=data["scenario_id"],
            status=SessionStatus.running,
            started_at=datetime.utcnow(),
            mode=data.get("mode") or "shared_market",  # Default to shared_market for trainer sessions
        )
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_started", {"session_id": s.id})
        # start background round timer
        socketio.start_background_task(run_rounds, s.id, current_app._get_current_object())
        # Optional: force navigate cohort players to briefing
        try:
            if bool(data.get("force_navigate")) and _redis_client is not None:
                url = f"/briefing/{s.id}"
                key = f"cohort:{s.cohort_id}:force_nav"
                _redis_client.setex(key, 300, url)
                # Inform trainer namespace for visibility
                emit_trainer("navigate", {"cohort_id": s.cohort_id, "url": url})
        except Exception:
            pass
        return {"id": s.id, "status": s.status.value}, HTTPStatus.CREATED


@ns.route("/active")
class ActiveSession(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self):
        from flask import request as _rq
        cid = _rq.args.get("cohort_id", type=int)
        if not cid:
            return {"error": "cohort_id required"}, HTTPStatus.BAD_REQUEST
        row = (
            db.session.query(Session)
            .filter(
                Session.cohort_id == cid,
                Session.status.in_([SessionStatus.created, SessionStatus.running, SessionStatus.paused]),
            )
            .order_by(Session.started_at.desc().nullslast(), Session.id.desc())
            .first()
        )
        if not row:
            return {"active": None}
        sc = Scenario.query.get(row.scenario_id) if row.scenario_id else None
        campaign = Campaign.query.get(sc.campaign_id) if sc and sc.campaign_id else None
        return {
            "active": {
                "id": row.id,
                "scenario_id": row.scenario_id,
                "scenario_name": sc.name if sc else None,
                "campaign_id": campaign.id if campaign else None,
                "campaign_name": campaign.name if campaign else None,
                "status": row.status.value if row.status else None,
                "mode": row.mode,
                "started_at": row.started_at.isoformat() + "Z" if row.started_at else None,
            }
        }


@ns.route("/<int:sid>")
class SessionItem(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get(s.scenario_id)
        campaign = Campaign.query.get(sc.campaign_id) if sc and sc.campaign_id else None
        config = (sc.config or {}) if sc else {}
        general = config.get("general", {})
        market = config.get("market", {})
        return {
            "id": s.id,
            "status": s.status.value,
            "scenario_id": s.scenario_id,
            "current_round": s.current_round,
            "general": general,
            "market": market,
            "mode": s.mode,
            "scenario_name": (sc.name if sc else None),
            "campaign_id": campaign.id if campaign else None,
            "campaign_name": campaign.name if campaign else None,
        }


participants_out = ns.model(
    "Participants",
    {
        "participants": fields.List(fields.Raw(description="{ user_id, email, name, status, selected_type, joined_at }")),
        "summary": fields.Raw(description="{ total, joined, pending, by_type }"),
    },
)


@ns.route("/<int:sid>/participants")
class SessionParticipants(Resource):
    @jwt_required()
    @ns.marshal_with(participants_out)
    def get(self, sid: int):
        """List participants for a session: joined (selected a type) and pending (cohort members without selection)."""
        s = Session.query.get_or_404(sid)
        # Get cohort members
        members = db.session.query(CohortMember.user_id, User.email).join(User, User.id == CohortMember.user_id).filter(CohortMember.cohort_id == s.cohort_id).all()
        member_ids = [uid for (uid, _) in members]
        # Get selected types
        sel = db.session.query(SessionPlayerType).filter_by(session_id=sid).all()
        selected_by_user = {row.user_id: row for row in sel}
        # Check for forecasts to determine "playing" status
        forecast_users = set(uid for (uid,) in db.session.query(Forecast.player_id).filter_by(session_id=sid).distinct().all())
        out = []
        by_type = {}
        joined = 0
        for uid, email in members:
            row = selected_by_user.get(uid)
            if row:
                # Determine status: playing if has forecasts, otherwise joined
                has_forecast = uid in forecast_users
                status = "playing" if has_forecast else "joined"
                joined += 1
                t = row.type_id
                by_type[t] = by_type.get(t, 0) + 1
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": email,
                    "status": status,
                    "selected_type": row.type_id,
                    "joined_at": getattr(row, 'created_at', None),
                })
            else:
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": email,
                    "status": "pending",
                })
        return {
            "participants": out,
            "summary": {"total": len(member_ids), "joined": joined, "pending": max(0, len(member_ids) - joined), "by_type": by_type},
        }


@ns.route("/<int:sid>/briefing")
class SessionBriefing(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get_or_404(s.scenario_id)
        cfg = sc.config or {}
        briefing = {
            "name": sc.name,
            "description": cfg.get("general", {}).get("description", ""),
            "general": cfg.get("general", {}),
            "markets": cfg.get("market", {}),
            "grid": cfg.get("grid", {}),
            "events": cfg.get("events", []),
            "objectives": cfg.get("objectives", ""),
            "roles": cfg.get("roles", []),
            "player_types": cfg.get("player_types", []),
            "devices": cfg.get("devices", []),
        }
        # include allowed types + remaining capacities from Redis if available
        if True:
            key_allowed = f"session:{sid}:allowed_types"
            key_counts = f"session:{sid}:type_counts"
            # selected type for current user
            try:
                uid = get_jwt().get("sub")
            except Exception:
                uid = None
            key_sel = f"session:{sid}:selected:{uid}" if uid is not None else None
            # Prefer DB if available
            try:
                allowed_rows = SessionAllowedType.query.filter_by(session_id=sid).all()
                if allowed_rows:
                    # counts from DB
                    counts_db = (
                        db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
                        .filter(SessionPlayerType.session_id == sid)
                        .group_by(SessionPlayerType.type_id)
                        .all()
                    )
                    counts = {k: int(v) for k, v in counts_db}
                    allowed = []
                    for row in allowed_rows:
                        used = int(counts.get(row.type_id, 0))
                        remaining = (max(0, (row.max_players or 0) - used) if isinstance(row.max_players, int) else None)
                        allowed.append({"type_id": row.type_id, "max_players": row.max_players, "remaining": remaining})
                    briefing["allowed_player_types"] = allowed
                    if uid is not None:
                        sel = SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).first()
                        if sel:
                            briefing["selected_type"] = sel.type_id
                    current_app.logger.info(
                        "briefing allowed_types (session=%s user=%s rows=%s selected=%s)",
                        sid,
                        uid,
                        len(allowed_rows),
                        briefing.get("selected_type"),
                    )
                else:
                    raise RuntimeError("no DB rows")
            except Exception:
                if _redis_client:
                    allowed_raw = _redis_client.get(key_allowed)
                    counts_raw = _redis_client.get(key_counts)
                    selected = _redis_client.get(key_sel) if key_sel else None
                    try:
                        allowed = json.loads(allowed_raw or b"null") if allowed_raw is not None else None
                    except Exception:
                        allowed = None
                    try:
                        counts = json.loads(counts_raw or b"{}") if counts_raw is not None else {}
                    except Exception:
                        counts = {}
                    if allowed:
                        for item in allowed:
                            tid = item.get("type_id")
                            cap = item.get("max_players")
                            used = int(counts.get(tid, 0))
                            if isinstance(cap, int) and cap >= 0:
                                item["remaining"] = max(0, cap - used)
                            else:
                                item["remaining"] = None
                        briefing["allowed_player_types"] = allowed
                    if selected:
                        val = selected.decode() if isinstance(selected, (bytes, bytearray)) else str(selected)
                        briefing["selected_type"] = val
                    current_app.logger.info(
                        "briefing allowed_types(redis) session=%s user=%s cached=%s selected=%s",
                        sid,
                        uid,
                        len(briefing.get("allowed_player_types", []) or []),
                        briefing.get("selected_type"),
                    )
        # Log first-time session join for current user (idempotent)
        try:
            uid = get_jwt().get("sub")
            if uid:
                exists = (
                    ActivityLog.query.filter_by(user_id=int(uid), session_id=sid, action_type="session_join").first()
                )
                if not exists:
                    log_activity(int(uid), "session_join", session_id=sid, cohort_id=s.cohort_id)
        except Exception:
            pass
        return briefing


@ns.route("/<int:sid>/status")
class SessionStatusMatrix(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get_or_404(s.scenario_id)
        general = (sc.config or {}).get("general", {})
        rounds = int(general.get("rounds", 4))
        # players in cohort
        from .models import CohortMember, User, Forecast
        players = (
            db.session.query(User.id, User.email)
            .join(CohortMember, CohortMember.user_id == User.id)
            .filter(CohortMember.cohort_id == s.cohort_id)
            .all()
        )
        # map selected types per player (if any)
        sel_rows = db.session.query(SessionPlayerType.user_id, SessionPlayerType.type_id).filter_by(session_id=sid).all()
        sel_map = {uid: tid for (uid, tid) in sel_rows}
        out_players = []
        for pid, email in players:
            status = []
            for r in range(1, rounds + 1):
                exists = db.session.query(Forecast.id).filter_by(session_id=sid, player_id=pid, round_num=r).first() is not None
                status.append({"round": r, "submitted": bool(exists)})
            out_players.append({"player_id": pid, "email": email, "type": sel_map.get(pid), "status": status})
        return {"rounds": rounds, "players": out_players}


    @ns.route("/<int:sid>/replay")
    class SessionReplay(Resource):
        @jwt_required()
        def get(self, sid: int):
            s = Session.query.get_or_404(sid)
            sc = Scenario.query.get_or_404(s.scenario_id)
            # collect per-round results
            from .models import Result
            rows = (
                db.session.query(Result)
                .filter(Result.session_id == sid)
                .order_by(Result.round_num.asc(), Result.player_id.asc())
                .all()
            )
            rounds_map = {}
            for r in rows:
                rm = rounds_map.setdefault(r.round_num, {"round": r.round_num, "mcp": None, "volume": None, "players": []})
                rm["mcp"] = rm["mcp"] or (r.data or {}).get("mcp")
                rm["volume"] = rm["volume"] or (r.data or {}).get("volume")
                rm["players"].append({"player_id": r.player_id, "kpis": (r.data or {}).get("kpis", {})})
            out = [rounds_map[k] for k in sorted(rounds_map.keys())]
            return {"session": {"id": s.id, "scenario": sc.name, "general": (sc.config or {}).get("general", {})}, "rounds": out}


@ns.route("/<int:sid>/pause")
class Pause(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.paused
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_paused", {"session_id": s.id})
        return {"status": s.status.value}


@ns.route("/<int:sid>/resume")
class Resume(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.running
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_resumed", {"session_id": s.id})
        return {"status": s.status.value}


@ns.route("/<int:sid>/end")
class End(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.ended
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_ended", {"session_id": s.id})
        return {"status": s.status.value}


@ns.route("/<int:sid>/force-round-end")
class ForceRoundEnd(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        # simple event to tell scheduler to skip to end: we set timer to zero by emitting round_end
        emit_trainer("round_end", {"session_id": sid, "forced": True})
        return {"status": "ok"}


@ns.route("/<int:sid>/freeze")
class FreezeSession(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        """Lock/freeze editing for all players in shared mode."""
        s = Session.query.get_or_404(sid)
        body = request.json or {}
        frozen = bool(body.get("frozen", True))
        s.frozen = frozen
        db.session.add(s)
        db.session.commit()
        socketio.emit("session_frozen", {"session_id": sid, "frozen": frozen}, namespace="/game", to=f"session-{sid}")
        emit_trainer("session_frozen", {"session_id": sid, "frozen": frozen})
        return {"status": "ok", "frozen": frozen}


@ns.route("/<int:sid>/round-results/<int:round_num>")
class RoundResults(Resource):
    @jwt_required()
    def get(self, sid: int, round_num: int):
        """Get individual KPIs and ranking for a specific round."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get all results for this round
        results = Result.query.filter_by(session_id=sid, round_num=round_num).all()
        if not results:
            return {"error": "No results found for this round"}, HTTPStatus.NOT_FOUND
        
        # Get session config for scoring weights
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        weights = config.get("scoring", {}).get("weights", {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1})
        
        # Get DA baseline forecasts for DA/ID breakdown
        from .models import Forecast
        da_baselines = Forecast.query.filter_by(session_id=sid, is_da_baseline=True).all()
        da_baseline_by_player = {}  # player_id -> combined hourly data
        for f in da_baselines:
            pid = f.player_id
            da_hours_range = f.data.get("da_baseline_hours", {})
            da_start = da_hours_range.get("start", 0)
            da_end = da_hours_range.get("end", len(f.data.get("hours", [])))
            
            if pid not in da_baseline_by_player:
                da_baseline_by_player[pid] = {}
            
            # Store baseline hours
            hours = f.data.get("hours", [])
            if "aggregate" not in da_baseline_by_player[pid]:
                da_baseline_by_player[pid]["aggregate"] = [0.0] * max(len(hours), 72)
            
            for h in range(da_start, min(da_end, len(hours))):
                if h < len(da_baseline_by_player[pid]["aggregate"]):
                    da_baseline_by_player[pid]["aggregate"][h] = hours[h]
        
        # Get current (final) forecasts for comparison
        current_forecasts = Forecast.query.filter_by(session_id=sid, round_num=round_num).all()
        current_by_player = {}
        for f in current_forecasts:
            current_by_player[f.player_id] = f.data.get("hours", [])
        
        # Get active events for this round (use select_events_for_round logic)
        from .engine import select_events_for_round
        events = config.get("events", [])
        active_round_events = select_events_for_round(events, round_num)
        
        active_events = []
        for evt in active_round_events:
            active_events.append({
                "name": evt.get("name", "Event"),
                "description": evt.get("description", ""),
                "type": evt.get("type", "systemic"),
                "multiplier": evt.get("multiplier", 1.0),
                "additive": evt.get("additive", 0),
                "target": evt.get("target", "all"),
                "target_id": evt.get("target_id", "")
            })
        
        # Calculate total score for each player (normalized to 0-100)
        ranking = []
        my_result = None
        
        for r in results:
            kpis = r.data.get("kpis", {})
            profit = float(kpis.get("profit_zar", 0) or kpis.get("profit", 0))
            imbalance = float(kpis.get("imbalance_cost_zar", 0) or kpis.get("imbalance", 0))
            curtailment = float(kpis.get("curtailment_cost_zar", 0) or kpis.get("curtailment", 0))
            
            # Total score (weighted sum, imbalance/curtailment are penalties so negative)
            raw_score = (
                profit * weights.get("profit", 0.6) -
                abs(imbalance) * weights.get("imbalance", 0.3) -
                abs(curtailment) * weights.get("curtailment", 0.1)
            )
            # Normalize to 0-100 scale (typical profit range: -5M to +5M ZAR)
            # Map -5M → 0, 0 → 50, +5M → 100
            total_score = max(0, min(100, (raw_score + 5000000) / 100000))
            
            # Get player info
            user = User.query.get(r.player_id)
            player_email = user.email if user else f"Player {r.player_id}"
            
            # Get player type
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{r.player_id}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=r.player_id).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            player_data = {
                "player_id": r.player_id,
                "email": player_email,
                "type": player_type,
                "kpis": kpis,
                "profit": profit,
                "variable_cost": float(kpis.get("variable_cost_zar", 0)),
                "imbalance": imbalance,
                "curtailment": curtailment,
                "total_score": round(total_score, 2),
                "mcp": r.data.get("mcp"),
                "volume": r.data.get("volume"),
                "bid_dispatch": r.bid_dispatch,  # Include lot dispatch tracking
                "hourly_breakdown": kpis.get("hourly_breakdown", [])  # Include detailed hourly breakdown
            }
            
            # Calculate DA/ID breakdown for this player
            da_hours = da_baseline_by_player.get(r.player_id, {}).get("aggregate", [])
            current_hours = current_by_player.get(r.player_id, [])
            base_mcp = float(r.data.get("mcp", 0) or 450)
            
            # Price differentiation: DA trades at stable price, ID at premium/discount
            # id_price_spread_percent: positive = ID more expensive (buying penalty), negative = ID discount
            id_price_spread = config.get("id_price_spread_percent", 0)  # Default: same price
            da_price = base_mcp  # DA market clears at MCP
            id_price = base_mcp * (1 + id_price_spread / 100)  # ID market has spread
            
            # Sum volumes WITH sign: positive = producer (sells), negative = consumer (buys)
            da_volume_signed = sum(v for v in da_hours if isinstance(v, (int, float)))
            current_volume_signed = sum(v for v in current_hours if isinstance(v, (int, float)))
            id_delta_signed = current_volume_signed - da_volume_signed
            
            # Absolute volumes for display
            da_volume_abs = sum(abs(v) for v in da_hours if isinstance(v, (int, float)))
            current_volume_abs = sum(abs(v) for v in current_hours if isinstance(v, (int, float)))
            
            # Determine player type: producer (positive) or consumer (negative)
            is_consumer = current_volume_signed < 0
            
            # Revenue attribution with separate prices
            # Producer: positive volume = positive revenue (sells electricity)
            # Consumer: negative volume = negative revenue (pays for electricity)
            da_revenue = da_volume_signed * da_price
            id_revenue = id_delta_signed * id_price  # ID delta valued at ID price
            
            # Hourly breakdown per day (for detailed view)
            hourly_detail = []
            daily_summary = {}
            max_hours = max(len(da_hours), len(current_hours))
            for h in range(max_hours):
                da_val = da_hours[h] if h < len(da_hours) else 0
                current_val = current_hours[h] if h < len(current_hours) else 0
                delta = current_val - da_val
                day = h // 24 + 1  # Day 1, 2, 3...
                
                hourly_detail.append({
                    "hour": h,
                    "day": day,
                    "hour_of_day": h % 24,
                    "da_mwh": round(da_val, 2),
                    "id_mwh": round(current_val, 2),
                    "delta_mwh": round(delta, 2),
                    "is_da_locked": da_val != 0  # DA was committed for this hour
                })
                
                # Aggregate by day
                if day not in daily_summary:
                    daily_summary[day] = {"da_mwh": 0, "id_mwh": 0, "delta_mwh": 0}
                daily_summary[day]["da_mwh"] += abs(da_val)
                daily_summary[day]["id_mwh"] += abs(current_val)
                daily_summary[day]["delta_mwh"] += delta
            
            # Total revenue = DA portion at DA price + ID delta at ID price
            total_revenue = da_revenue + id_revenue
            
            player_data["da_id_breakdown"] = {
                "is_consumer": is_consumer,
                "da_volume_mwh": round(da_volume_abs, 2),  # Absolute for display
                "da_volume_signed_mwh": round(da_volume_signed, 2),  # With sign for calculations
                "id_delta_mwh": round(id_delta_signed, 2),  # Signed delta
                "final_volume_mwh": round(current_volume_abs, 2),  # Absolute for display
                "final_volume_signed_mwh": round(current_volume_signed, 2),  # With sign
                "da_price_zar": round(da_price, 2),
                "id_price_zar": round(id_price, 2),
                "id_price_spread_percent": id_price_spread,
                "da_revenue_zar": round(da_revenue, 0),  # Negative for consumers
                "id_revenue_zar": round(id_revenue, 0),  # Negative if buying more
                "total_revenue_zar": round(total_revenue, 0),
                "has_baseline": len(da_hours) > 0,
                "hourly_detail": hourly_detail,
                "daily_summary": [{"day": d, **v} for d, v in sorted(daily_summary.items())]
            }
            
            ranking.append(player_data)
            if r.player_id == player_id:
                my_result = player_data
        
        # Sort by total score descending
        ranking.sort(key=lambda x: x["total_score"], reverse=True)
        
        # Add rank to each player
        for idx, p in enumerate(ranking):
            p["rank"] = idx + 1
        
        return {
            "round": round_num,
            "my_result": my_result,
            "ranking": ranking,
            "active_events": active_events,
            "weights": weights
        }


@ns.route("/<int:sid>/latest-round-results")
class LatestRoundResults(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get the latest available round results for the current player."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get the latest result for this player in this session
        latest_result = (
            Result.query
            .filter_by(session_id=sid, player_id=player_id)
            .order_by(Result.round_num.desc())
            .first()
        )
        
        if not latest_result:
            return {"error": "No results found"}, HTTPStatus.NOT_FOUND
        
        # Get the round-results endpoint handler to reuse the logic
        rr = RoundResults()
        return rr.get(sid, latest_result.round_num)


@ns.route("/<int:sid>/final-results")
class FinalResults(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get cumulative KPIs and final ranking across all rounds."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get session config
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        weights = config.get("scoring", {}).get("weights", {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1})
        
        # Get all results for this session
        results = Result.query.filter_by(session_id=sid).all()
        
        # Aggregate by player
        player_totals = {}
        player_bid_aggregates = {}  # Aggregate bid dispatch across all rounds
        for r in results:
            pid = r.player_id
            if pid not in player_totals:
                player_totals[pid] = {
                    "profit": 0,
                    "imbalance": 0,
                    "curtailment": 0,
                    "dispatched_mwh": 0,
                    "rounds": 0
                }
            
            kpis = r.data.get("kpis", {})
            player_totals[pid]["profit"] += float(kpis.get("profit_zar", 0))
            player_totals[pid]["imbalance"] += float(kpis.get("imbalance_cost_zar", 0))
            player_totals[pid]["curtailment"] += float(kpis.get("curtailment_cost_zar", 0))
            player_totals[pid]["dispatched_mwh"] += float(kpis.get("dispatched_mwh", 0))
            player_totals[pid]["rounds"] += 1
            
            # Aggregate bid dispatch data across rounds
            if r.bid_dispatch:
                if pid not in player_bid_aggregates:
                    player_bid_aggregates[pid] = {}
                
                for device_id, device_lots in r.bid_dispatch.items():
                    if device_id not in player_bid_aggregates[pid]:
                        player_bid_aggregates[pid][device_id] = {}
                    
                    for lot_label, lot_data in device_lots.items():
                        if lot_label not in player_bid_aggregates[pid][device_id]:
                            player_bid_aggregates[pid][device_id][lot_label] = {
                                "mw_offered": 0,
                                "mw_dispatched": 0,
                                "total_revenue": 0,
                                "rounds_offered": 0
                            }
                        
                        agg = player_bid_aggregates[pid][device_id][lot_label]
                        agg["mw_offered"] += lot_data.get("mw_offered", 0)
                        agg["mw_dispatched"] += lot_data.get("mw_dispatched", 0)
                        agg["total_revenue"] += lot_data.get("mw_dispatched", 0) * lot_data.get("mcp", 0)
                        if lot_data.get("mw_offered", 0) > 0:
                            agg["rounds_offered"] += 1
        
        # Build final ranking
        ranking = []
        my_cumulative = None
        
        # Get number of rounds for average calculation
        num_rounds = session.current_round - 1 if session.current_round else 1
        
        for pid, totals in player_totals.items():
            # Calculate average score per round, normalized to 0-100
            raw_score = (
                totals["profit"] * weights.get("profit", 0.6) -
                abs(totals["imbalance"]) * weights.get("imbalance", 0.3) -
                abs(totals["curtailment"]) * weights.get("curtailment", 0.1)
            )
            avg_score = raw_score / max(1, totals["rounds"])
            total_score = max(0, min(100, (avg_score / 5000)))
            
            # Get player info
            user = User.query.get(pid)
            player_email = user.email if user else f"Player {pid}"
            
            # Get player type
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{pid}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=pid).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            player_data = {
                "player_id": pid,
                "email": player_email,
                "type": player_type,
                "total_profit": round(totals["profit"], 2),
                "total_imbalance": round(totals["imbalance"], 2),
                "total_curtailment": round(totals["curtailment"], 2),
                "total_dispatched_mwh": round(totals["dispatched_mwh"], 2),
                "total_score": round(total_score, 2),
                "rounds_played": totals["rounds"]
            }
            
            ranking.append(player_data)
            if pid == player_id:
                my_cumulative = player_data
        
        # Sort by total score descending
        ranking.sort(key=lambda x: x["total_score"], reverse=True)
        
        # Add rank
        for idx, p in enumerate(ranking):
            p["rank"] = idx + 1
        
        # Build round history for the current player
        round_history = []
        player_results = Result.query.filter_by(session_id=sid, player_id=player_id).order_by(Result.round_num).all()
        for r in player_results:
            kpis = r.data.get("kpis", {})
            raw_round_score = (
                float(kpis.get("profit_zar", 0)) * weights.get("profit", 0.6) -
                abs(float(kpis.get("imbalance_cost_zar", 0))) * weights.get("imbalance", 0.3) -
                abs(float(kpis.get("curtailment_cost_zar", 0))) * weights.get("curtailment", 0.1)
            )
            round_score = max(0, min(100, (raw_round_score / 5000)))
            round_history.append({
                "round_num": r.round_num,
                "profit": round(float(kpis.get("profit_zar", 0)), 2),
                "imbalance": round(float(kpis.get("imbalance_cost_zar", 0)), 2),
                "curtailment": round(float(kpis.get("curtailment_cost_zar", 0)), 2),
                "dispatched_mwh": round(float(kpis.get("dispatched_mwh", 0)), 2),
                "total_score": round(round_score, 2)
            })
        
        # Add aggregated bid dispatch to my_cumulative
        my_bid_aggregate = player_bid_aggregates.get(player_id) if player_id in player_bid_aggregates else None
        
        return {
            "my_cumulative": my_cumulative,
            "final_ranking": ranking,
            "bid_dispatch_aggregate": my_bid_aggregate,
            "round_history": round_history,
            "weights": weights,
            "total_rounds": session.current_round - 1 if session.current_round else 0
        }


@ns.route("/<int:sid>/advance-round")
class AdvanceRound(Resource):
    @jwt_required()
    def post(self, sid: int):
        """Player signals ready to advance to next round (solo & shared mode)."""
        player_id = int(get_jwt_identity())
        
        # Mark player as ready in Redis or DB
        if _redis_client:
            ready_key = f"session:{sid}:round_ready:{player_id}"
            _redis_client.set(ready_key, "1", ex=3600)
        
        # Check if all players are ready
        session = Session.query.get_or_404(sid)
        members = CohortMember.query.filter_by(cohort_id=session.cohort_id).all()
        member_ids = [m.user_id for m in members]
        
        ready_count = 0
        if _redis_client:
            for mid in member_ids:
                if _redis_client.get(f"session:{sid}:round_ready:{mid}"):
                    ready_count += 1
        
        # Solo mode: 1 player ready = advance immediately
        # Shared mode: all players ready = advance
        required_ready = 1 if session.mode == "isolated_per_player" else len(member_ids)
        
        if ready_count >= required_ready:
            # Clear ready flags
            if _redis_client:
                for mid in member_ids:
                    _redis_client.delete(f"session:{sid}:round_ready:{mid}")
            
            # Advance to next round or complete scenario
            scenario = Scenario.query.get(session.scenario_id)
            total_rounds = int((scenario.config or {}).get("general", {}).get("rounds", 4))
            current_round = session.current_round or 1
            
            if current_round < total_rounds:
                # Advance to next round
                session.current_round = current_round + 1
                session.status = SessionStatus.round_active
                db.session.add(session)
                db.session.commit()
                
                # Restart scheduler for next round
                socketio.start_background_task(run_rounds, sid, current_app._get_current_object())
            else:
                # All rounds complete - set to scenario_complete
                session.status = SessionStatus.scenario_complete
                db.session.add(session)
                db.session.commit()
                socketio.emit("scenario_complete", {"session_id": sid}, namespace="/trainer")
                socketio.emit("scenario_complete", {"session_id": sid}, namespace="/game", to=f"session-{sid}")
                
                # Mark player progress completed
                try:
                    from datetime import datetime
                    from .models import PlayerProgress, PlayerProgressStatus
                    players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=session.cohort_id).all()]
                    q = db.session.query(PlayerProgress).filter(PlayerProgress.scenario_id == session.scenario_id, PlayerProgress.user_id.in_(players))
                    for pp in q.all():
                        pp.status = PlayerProgressStatus.completed
                        pp.completed_at = datetime.utcnow()
                        db.session.add(pp)
                    db.session.commit()
                except Exception:
                    pass
        
        return {
            "status": "ok",
            "ready_count": ready_count,
            "total_players": len(member_ids)
        }


@ns.route("/<int:sid>/start-briefing")
class StartBriefing(Resource):
    @jwt_required()
    def post(self, sid: int):
        """Player starts scenario from briefing screen (solo mode)."""
        session = Session.query.get_or_404(sid)
        
        # Only allow starting from briefing status
        if session.status != SessionStatus.briefing:
            return {"error": "Session not in briefing state"}, HTTPStatus.BAD_REQUEST
        
        # Set to round_active and restart scheduler
        session.status = SessionStatus.round_active
        session.current_round = 1
        db.session.add(session)
        db.session.commit()
        
        # Restart scheduler to begin first round
        socketio.start_background_task(run_rounds, sid, current_app._get_current_object())
        
        return {"status": "ok", "message": "Scenario started"}


@ns.route("/<int:sid>/submit-status")
class SubmitStatus(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get submit status per player type for waiting screen."""
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        player_types = config.get("player_types", [])
        current_round = session.current_round or 1
        
        # Get all cohort members
        members = CohortMember.query.filter_by(cohort_id=session.cohort_id).all()
        member_ids = [m.user_id for m in members]
        
        # Get player type selections
        type_map = {}
        for mid in member_ids:
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{mid}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=mid).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            if player_type:
                type_map[mid] = player_type
        
        # Count submits per type
        type_counts = {}
        for ptype in player_types:
            tid = ptype.get("id")
            type_counts[tid] = {"submitted": 0, "total": 0}
        
        for mid, ptype in type_map.items():
            if ptype in type_counts:
                type_counts[ptype]["total"] += 1
                # Check if submitted
                forecast = Forecast.query.filter_by(
                    session_id=sid,
                    player_id=mid,
                    round_num=current_round
                ).first()
                if forecast:
                    type_counts[ptype]["submitted"] += 1
        
        return {
            "round": current_round,
            "by_type": type_counts,
            "total_submitted": sum(t["submitted"] for t in type_counts.values()),
            "total_players": sum(t["total"] for t in type_counts.values())
        }


@ns.route("/<int:sid>/broadcast")
class Broadcast(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(broadcast_in, validate=True)
    def post(self, sid: int):
        msg = request.json["message"]
        # Send to trainer namespace
        emit_trainer("message", {"session_id": sid, "message": msg})
        # Also send to game namespace for players in this session
        socketio.emit("trainer_message", {"session_id": sid, "message": msg}, namespace="/game", to=f"session-{sid}")
        return {"status": "ok"}


allowed_types_in = ns.model("AllowedTypesIn", {
    "allowed": fields.List(fields.Raw, required=True, description="[{type_id, max_players?}]")
})

@ns.route("/<int:sid>/allowed-types")
class AllowedTypes(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(allowed_types_in, validate=True)
    def patch(self, sid: int):
        data = request.json or {}
        allowed = data.get("allowed") or []
        # basic validation
        norm = []
        seen = set()
        for it in allowed:
            tid = (it.get("type_id") or "").strip()
            if not tid:
                return {"error": "type_id required"}, HTTPStatus.BAD_REQUEST
            if tid in seen:
                return {"error": f"duplicate type_id: {tid}"}, HTTPStatus.BAD_REQUEST
            seen.add(tid)
            cap = it.get("max_players")
            if cap is not None:
                try:
                    cap = int(cap)
                    if cap < 0:
                        return {"error": "max_players must be >= 0"}, HTTPStatus.BAD_REQUEST
                except Exception:
                    return {"error": "max_players must be integer"}, HTTPStatus.BAD_REQUEST
            norm.append({"type_id": tid, "max_players": cap})
        # persist to DB (replace existing rows)
        try:
            SessionAllowedType.query.filter_by(session_id=sid).delete()
            for it in norm:
                db.session.add(SessionAllowedType(session_id=sid, type_id=it["type_id"], max_players=it.get("max_players")))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return {"error": "failed to persist allowed types"}, HTTPStatus.INTERNAL_SERVER_ERROR
        # compute remaining from DB counts
        counts_db = (
            db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
            .filter(SessionPlayerType.session_id == sid)
            .group_by(SessionPlayerType.type_id)
            .all()
        )
        counts = {k: int(v) for k, v in counts_db}
        for item in norm:
            used = int(counts.get(item["type_id"], 0))
            cap = item.get("max_players")
            item["remaining"] = (max(0, cap - used) if isinstance(cap, int) else None)
        return {"allowed": norm}

    @jwt_required()
    def get(self, sid: int):
        try:
            rows = SessionAllowedType.query.filter_by(session_id=sid).all()
            if not rows:
                return {"allowed": None}
            counts_db = (
                db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
                .filter(SessionPlayerType.session_id == sid)
                .group_by(SessionPlayerType.type_id)
                .all()
            )
            counts = {k: int(v) for k, v in counts_db}
            out = []
            for r in rows:
                used = int(counts.get(r.type_id, 0))
                remaining = (max(0, (r.max_players or 0) - used) if isinstance(r.max_players, int) else None)
                out.append({"type_id": r.type_id, "max_players": r.max_players, "remaining": remaining})
            return {"allowed": out}
        except Exception:
            return {"allowed": None}

select_in = ns.model("SelectTypeIn", {"type_id": fields.String(required=True)})

@ns.route("/<int:sid>/select-type")
class SelectType(Resource):
    @jwt_required()
    @ns.expect(select_in, validate=True)
    def post(self, sid: int):
        uid = get_jwt()["sub"]
        tid = (request.json or {}).get("type_id") or ""
        if not tid:
            current_app.logger.warning("select-type missing type_id user=%s session=%s", uid, sid)
            return {"error": "type_id required"}, HTTPStatus.BAD_REQUEST
        # idempotent via DB
        existing = SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).first()
        if existing:
            current_app.logger.info(
                "select-type already set user=%s session=%s type=%s", uid, sid, existing.type_id
            )
            return {"status": "ok", "type_id": existing.type_id}
        # validate allowed + caps
        row = SessionAllowedType.query.filter_by(session_id=sid, type_id=tid).first()
        if not row:
            current_app.logger.warning(
                "select-type denied (not allowed) user=%s session=%s requested=%s", uid, sid, tid
            )
            return {"error": "type not allowed"}, HTTPStatus.FORBIDDEN
        if isinstance(row.max_players, int):
            used = db.session.query(db.func.count(SessionPlayerType.id)).filter_by(session_id=sid, type_id=tid).scalar() or 0
            if used >= row.max_players:
                current_app.logger.warning(
                    "select-type denied (capacity) user=%s session=%s requested=%s used=%s cap=%s",
                    uid,
                    sid,
                    tid,
                    used,
                    row.max_players,
                )
                return {"error": "type capacity reached"}, HTTPStatus.CONFLICT
        try:
            db.session.add(SessionPlayerType(session_id=sid, user_id=uid, type_id=tid))
            db.session.commit()
            current_app.logger.info(
                "select-type success user=%s session=%s type=%s", uid, sid, tid
            )
            # Log type selection activity
            try:
                s = Session.query.get(sid)
                log_activity(int(uid), "type_select", session_id=sid, cohort_id=(s.cohort_id if s else None), details={"type_id": tid})
            except Exception:
                pass
        except Exception:
            db.session.rollback()
            current_app.logger.exception(
                "select-type failed to store user=%s session=%s type=%s", uid, sid, tid
            )
            return {"error": "failed to store selection"}, HTTPStatus.INTERNAL_SERVER_ERROR
        return {"status": "ok", "type_id": tid}

@ns.route("/<int:sid>/activity")
class SessionActivity(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, sid: int):
        """Get activity timeline for a specific session."""
        # Validate session exists
        Session.query.get_or_404(sid)
        
        # Get query parameters
        action_type = request.args.get("action_type")
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        
        # Build query
        query = ActivityLog.query.filter_by(session_id=sid)
        
        if action_type:
            query = query.filter_by(action_type=action_type)
        
        # Get total count
        total = query.count()
        
        # Order and paginate
        query = query.order_by(ActivityLog.timestamp.desc())
        activities = query.limit(limit).offset(offset).all()
        
        result = []
        for activity in activities:
            user = User.query.get(activity.user_id)
            result.append({
                "id": activity.id,
                "timestamp": activity.timestamp.isoformat() + "Z" if activity.timestamp else None,
                "user_id": activity.user_id,
                "user_email": user.email if user else "Unknown",
                "user_name": user.email.split("@")[0] if user else "Unknown",
                "action_type": activity.action_type,
                "details": activity.details or {}
            })
        
        return {
            "activities": result,
            "total": total,
            "limit": limit,
            "offset": offset
        }
