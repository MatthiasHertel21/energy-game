from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt

from .extensions import db, socketio
from .scheduler import run_rounds
from .models import Session, SessionStatus, Scenario, SessionAllowedType, SessionPlayerType, ActivityLog, User, CohortMember
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
        s = Session(
            cohort_id=data["cohort_id"],
            scenario_id=data["scenario_id"],
            status=SessionStatus.running,
            started_at=datetime.utcnow(),
            mode=data.get("mode") or "isolated_per_player",
        )
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_started", {"session_id": s.id})
        # start background round timer
        socketio.start_background_task(run_rounds, s.id)
        return {"id": s.id, "status": s.status.value}, HTTPStatus.CREATED


@ns.route("/<int:sid>")
class SessionItem(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get(s.scenario_id)
        general = (sc.config or {}).get("general", {}) if sc else {}
        return {"id": s.id, "status": s.status.value, "scenario_id": s.scenario_id, "current_round": s.current_round, "general": general, "mode": s.mode, "scenario_name": (sc.name if sc else None)}


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
        members = db.session.query(CohortMember.user_id, User.email, User.name).join(User, User.id == CohortMember.user_id).filter(CohortMember.cohort_id == s.cohort_id).all()
        member_ids = [uid for (uid, _, _) in members]
        # Get selected types
        sel = db.session.query(SessionPlayerType).filter_by(session_id=sid).all()
        selected_by_user = {row.user_id: row for row in sel}
        out = []
        by_type = {}
        joined = 0
        for uid, email, name in members:
            row = selected_by_user.get(uid)
            if row:
                status = "joined"
                joined += 1
                t = row.type_id
                by_type[t] = by_type.get(t, 0) + 1
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": name,
                    "status": status,
                    "selected_type": row.type_id,
                    "joined_at": getattr(row, 'created_at', None),
                })
            else:
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": name,
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
            "general": cfg.get("general", {}),
            "markets": cfg.get("market", {}),
            "grid": cfg.get("grid", {}),
            "events": cfg.get("events", []),
            "objectives": cfg.get("objectives", ""),
            "roles": cfg.get("roles", []),
            "player_types": cfg.get("player_types", []),
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


@ns.route("/<int:sid>/broadcast")
class Broadcast(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(broadcast_in, validate=True)
    def post(self, sid: int):
        msg = request.json["message"]
        emit_trainer("message", {"session_id": sid, "message": msg})
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
            return {"error": "type_id required"}, HTTPStatus.BAD_REQUEST
        # idempotent via DB
        existing = SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).first()
        if existing:
            return {"status": "ok", "type_id": existing.type_id}
        # validate allowed + caps
        row = SessionAllowedType.query.filter_by(session_id=sid, type_id=tid).first()
        if not row:
            return {"error": "type not allowed"}, HTTPStatus.FORBIDDEN
        if isinstance(row.max_players, int):
            used = db.session.query(db.func.count(SessionPlayerType.id)).filter_by(session_id=sid, type_id=tid).scalar() or 0
            if used >= row.max_players:
                return {"error": "type capacity reached"}, HTTPStatus.CONFLICT
        try:
            db.session.add(SessionPlayerType(session_id=sid, user_id=uid, type_id=tid))
            db.session.commit()
            # Log type selection activity
            try:
                s = Session.query.get(sid)
                log_activity(int(uid), "type_select", session_id=sid, cohort_id=(s.cohort_id if s else None), details={"type_id": tid})
            except Exception:
                pass
        except Exception:
            db.session.rollback()
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
