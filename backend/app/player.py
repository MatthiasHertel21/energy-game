from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone
import os, json

from .extensions import db, socketio
from .models import Forecast, Session, Scenario, CohortMember, SessionPlayerType, SessionStatus
from .models import CampaignScenario, Campaign, PlayerProgress, PlayerProgressStatus, Cohort
from .models import SessionAllowedType, Result, ActivityLog
from .utils import log_activity

try:
    from .device_types import validate_forecast_constraints
except ImportError:
    # Fallback if device_types not available
    def validate_forecast_constraints(device: dict, forecast_mw: list) -> list:
        return []


ns = Namespace("player", description="Player endpoints")

forecast_in = ns.model(
    "ForecastIn",
    {
        "session_id": fields.Integer(required=True),
        "round_num": fields.Integer(required=True),
        "hours": fields.List(fields.Float, required=True, description="Array of MWh values"),
    },
)

forecast_full_in = ns.model(
    "ForecastFullIn",
    {
        "session_id": fields.Integer(required=True),
        "hours": fields.List(fields.Float, required=True, description="Full horizon forecast values (MWh)"),
    },
)


@ns.route("/forecast")
class ForecastAPI(Resource):
    @jwt_required()
    @ns.expect(forecast_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
            # If payload includes per-device hours, validate each; also compute aggregate
            per_device = data.get("devices") if isinstance(data, dict) else None
            if isinstance(per_device, list) and per_device:
                # map config by id
                cfg_by_id = {d.get("id"): d for d in devices_cfg if isinstance(d, dict)}
                agg = None
                validation_errors = []
                for item in per_device:
                    did = item.get("device_id")
                    hours = item.get("hours") or []
                    dev = cfg_by_id.get(did)
                    if not dev:
                        validation_errors.append(f"Unknown device_id: {did}")
                        continue
                    errs = validate_forecast_constraints(dev, hours)
                    validation_errors.extend(errs)
                    # build aggregate for compatibility (sum)
                    agg = _sum_series(agg, hours)
                if validation_errors:
                    return {"error": "Forecast validation failed", "details": validation_errors}, HTTPStatus.BAD_REQUEST
                # replace hours slice with aggregate for compatibility
                data["hours"] = agg or data["hours"]
            
            if devices_cfg and not (isinstance(per_device, list) and per_device):
                validation_errors = []
                for device in devices_cfg:
                    errors = validate_forecast_constraints(device, data["hours"])
                    if errors:
                        validation_errors.extend([f"{device.get('type', 'Device')}: {err}" for err in errors])
                
                if validation_errors:
                    return {
                        "error": "Forecast validation failed",
                        "details": validation_errors
                    }, HTTPStatus.BAD_REQUEST
        
        f = Forecast(session_id=data["session_id"], player_id=player_id, round_num=data["round_num"], data={"hours": data["hours"]})
        db.session.add(f)
        db.session.commit()
        
        # Log forecast submission activity
        try:
            session = Session.query.get(data["session_id"])
            log_activity(
                player_id, 
                "forecast_submit", 
                session_id=data["session_id"],
                cohort_id=session.cohort_id if session else None,
                details={"round": data["round_num"], "forecast_count": len(data["hours"])}
            )
        except Exception:
            pass  # Don't fail forecast if logging fails
        
        socketio.emit("player_submit", {"session_id": f.session_id, "player_id": player_id}, namespace="/trainer")
        return {"status": "ok", "id": f.id}, HTTPStatus.CREATED


@ns.route("/forecast/full")
class ForecastFull(Resource):
    @jwt_required()
    @ns.expect(forecast_full_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
            per_device = data.get("devices") if isinstance(data, dict) else None
            if isinstance(per_device, list) and per_device:
                cfg_by_id = {d.get("id"): d for d in devices_cfg if isinstance(d, dict)}
                agg = None
                validation_errors = []
                for item in per_device:
                    did = item.get("device_id")
                    hours = item.get("hours") or []
                    dev = cfg_by_id.get(did)
                    if not dev:
                        validation_errors.append(f"Unknown device_id: {did}")
                        continue
                    errs = validate_forecast_constraints(dev, hours)
                    validation_errors.extend(errs)
                    agg = _sum_series(agg, hours)
                if validation_errors:
                    return {"error": "Forecast validation failed", "details": validation_errors}, HTTPStatus.BAD_REQUEST
                data["hours"] = agg or data["hours"]
            
            if devices_cfg and not (isinstance(per_device, list) and per_device):
                validation_errors = []
                for device in devices_cfg:
                    errors = validate_forecast_constraints(device, data["hours"])
                    if errors:
                        validation_errors.extend([f"{device.get('type', 'Device')}: {err}" for err in errors])
                
                if validation_errors:
                    return {
                        "error": "Forecast validation failed",
                        "details": validation_errors
                    }, HTTPStatus.BAD_REQUEST
        
        # upsert by (session_id, player_id, round_num=0)
        f = Forecast.query.filter_by(session_id=data["session_id"], player_id=player_id, round_num=0).first()
        if not f:
            f = Forecast(session_id=data["session_id"], player_id=player_id, round_num=0, data={"hours": data["hours"]})
        else:
            f.data = {"hours": data["hours"]}
        db.session.add(f)
        db.session.commit()
        return {"status": "ok", "id": f.id}

    @jwt_required()
    def get(self):
        session_id = request.args.get("session_id", type=int)
        if not session_id:
            return {"error": "session_id required"}, HTTPStatus.BAD_REQUEST
        player_id = int(get_jwt_identity())
        f = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=0).first()
        return {"hours": (f.data.get("hours") if f else None)}


# --- Helpers for player type selection / device filtering ---
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:  # pragma: no cover
    _redis_client = None


def _filter_devices_by_selected_type(session_id: int, player_id: int, config: dict, devices: list[dict]) -> list[dict]:
    """If a player has selected a player_type for this session, filter devices to those allowed for that type."""
    if not devices:
        return devices
    try:
        pts = config.get("player_types") or []
        if not pts or _redis_client is None:
            # try DB selection
            try:
                sel_db = SessionPlayerType.query.filter_by(session_id=session_id, user_id=player_id).first()
                if not sel_db:
                    return devices
                sel = sel_db.type_id
            except Exception:
                return devices
        else:
            sel_key = f"session:{session_id}:selected:{player_id}"
            sel_raw = _redis_client.get(sel_key)
            if not sel_raw:
                return devices
            sel = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
        mapping = {pt.get("id"): set(pt.get("devices") or []) for pt in pts if isinstance(pt, dict)}
        allowed_ids = mapping.get(sel)
        if not allowed_ids:
            return devices
        filtered = [d for d in devices if d.get("id") in allowed_ids]
        return filtered if filtered else devices
    except Exception:
        return devices


def _sum_series(base: list | None, add: list | None) -> list:
    a = base or []
    b = add or []
    n = max(len(a), len(b))
    out = [0.0]*n
    for i in range(n):
        out[i] = (a[i] if i < len(a) else 0.0) + (b[i] if i < len(b) else 0.0)
    return out


solo_in = ns.model(
    "SoloSessionCreate",
    {
        "scenario_id": fields.Integer(required=True),
        "campaign_id": fields.Integer(required=False, description="Optional campaign context for progress tracking"),
    },
)


@ns.route("/solo-sessions")
class SoloSessions(Resource):
    @jwt_required()
    @ns.expect(solo_in, validate=True)
    def post(self):
        """Start a solo session (isolated_per_player) if allowed by any published campaign mapping."""
        uid = int(get_jwt_identity())
        body = request.json or {}
        scenario_id = int(body.get("scenario_id"))
        campaign_id = body.get("campaign_id")

        # Validate mapping: published campaign with solo_enabled
        q = (
            db.session.query(CampaignScenario, Campaign)
            .join(Campaign, Campaign.id == CampaignScenario.campaign_id)
            .filter(CampaignScenario.scenario_id == scenario_id, Campaign.published == True, CampaignScenario.solo_enabled == True)
        )
        if campaign_id:
            q = q.filter(Campaign.id == int(campaign_id))
        mapping = q.order_by(CampaignScenario.order_index.asc()).first()
        if not mapping:
            return {"error": "Solo not allowed for this scenario"}, HTTPStatus.FORBIDDEN
        cs, camp = mapping

        # Ensure a minimal cohort exists for the player (trainer_id can be self)
        c = Cohort(name=f"Solo {uid}", trainer_id=uid)
        db.session.add(c)
        db.session.flush()  # get id

        # Add player as cohort member
        cm = CohortMember(cohort_id=c.id, user_id=uid)
        db.session.add(cm)

        # Create session (start immediately; scheduler will run rounds)
        from datetime import datetime
        s = Session(
            cohort_id=c.id,
            scenario_id=scenario_id,
            mode="isolated_per_player",
            status=SessionStatus.running,
            started_at=datetime.utcnow(),
        )
        db.session.add(s)
        db.session.flush()

        # Progress → in_progress
        try:
            pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=camp.id, scenario_id=scenario_id).first()
            if not pp:
                from datetime import datetime
                pp = PlayerProgress(user_id=uid, campaign_id=camp.id, scenario_id=scenario_id, status=PlayerProgressStatus.in_progress, started_at=datetime.utcnow())
            else:
                from datetime import datetime
                pp.status = PlayerProgressStatus.in_progress
                pp.started_at = pp.started_at or datetime.utcnow()
            db.session.add(pp)
        except Exception:
            pass

        db.session.commit()
        # Start rounds in background
        from .scheduler import run_rounds
        from .extensions import socketio
        socketio.start_background_task(run_rounds, s.id)
        return {"session_id": s.id, "status": "running"}, HTTPStatus.CREATED


@ns.route("/active-session")
class ActiveSession(Resource):
    @jwt_required()
    def get(self):
        """Get the currently active session for the player with time remaining."""
        player_id = int(get_jwt_identity())
        
        # Find running session where player is a cohort member
        session = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == player_id,
                Session.status == SessionStatus.running
            )
            .order_by(Session.started_at.desc())
            .first()
        )
        
        if not session:
            return {"session_id": None, "message": "No active session"}
        
        scenario = Scenario.query.get(session.scenario_id)
        if not scenario:
            return {"error": "Scenario not found"}, HTTPStatus.NOT_FOUND
        
        config = scenario.config or {}
        general = config.get("general", {})
        
        # Time remaining is tracked live via WebSocket ticks; return None initially to avoid false "time is up"
        time_remaining = None

        return {
            "session_id": session.id,
            "round": session.current_round,
            "time_remaining": time_remaining,
            "forecast_horizon_hours": general.get("forecast_horizon_hours", 48),
            "freeze_hours": general.get("freeze_hours", 6),
            "scenario_name": scenario.name,
            "status": session.status.value
        }


@ns.route("/sessions/<int:sid>")
class PlayerSessionItem(Resource):
    @jwt_required()
    def delete(self, sid: int):
        """Delete a solo session if it belongs to the current user."""
        uid = int(get_jwt_identity())
        session = Session.query.get_or_404(sid)
        
        # Validate: must be isolated_per_player AND user must be member
        if session.mode != "isolated_per_player":
            return {"error": "Can only delete solo sessions"}, HTTPStatus.FORBIDDEN
        
        member = CohortMember.query.filter_by(cohort_id=session.cohort_id, user_id=uid).first()
        if not member:
            return {"error": "Not your session"}, HTTPStatus.FORBIDDEN
        
        # Delete forecasts
        Forecast.query.filter_by(session_id=sid).delete()
        
        # Delete session
        db.session.delete(session)
        db.session.commit()
        
        return "", HTTPStatus.NO_CONTENT


@ns.route("/reset-scenario")
class ResetScenario(Resource):
    @jwt_required()
    def post(self):
        """Reset all progress for the current player for a given campaign+scenario.

        Body: { campaign_id: int, scenario_id: int }
        - Set PlayerProgress to not_started, clear timestamps
        - Delete any solo sessions (isolated_per_player) of this player for the scenario, including forecasts/results
        - Remove related cohort(s) created for those solo sessions
        """
        body = request.json or {}
        uid = int(get_jwt_identity())
        campaign_id = body.get("campaign_id")
        scenario_id = body.get("scenario_id")
        if not campaign_id or not scenario_id:
            return {"error": "campaign_id and scenario_id required"}, HTTPStatus.BAD_REQUEST

        # Reset PlayerProgress
        pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=int(campaign_id), scenario_id=int(scenario_id)).first()
        if pp:
            pp.status = PlayerProgressStatus.not_started
            pp.started_at = None
            pp.completed_at = None
            db.session.add(pp)

        # Find solo sessions for this user and scenario
        solo_sessions = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == uid,
                Session.scenario_id == int(scenario_id),
                Session.mode == "isolated_per_player",
            )
            .all()
        )
        for s in solo_sessions:
            # Capture cohort before deleting session
            cohort_id = s.cohort_id
            sid = s.id
            # Delete forecasts and results tied to session
            Forecast.query.filter_by(session_id=sid).delete(synchronize_session=False)
            Result.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete player type selections/allowed types (if any)
            SessionPlayerType.query.filter_by(session_id=sid).delete(synchronize_session=False)
            SessionAllowedType.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete activity logs for this session
            ActivityLog.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete the session itself
            db.session.delete(s)
            db.session.flush()
            # Clean up cohort and its membership (solo cohorts are per-session)
            try:
                if cohort_id:
                    # Only delete cohort members if this is a solo cohort (trainer_id == player_id)
                    cohort = Cohort.query.get(cohort_id)
                    if cohort and cohort.trainer_id == uid:
                        # This is a solo cohort, safe to delete members
                        # Remove any activity logs tied to this cohort (may have session_id NULL)
                        ActivityLog.query.filter_by(cohort_id=cohort_id).delete(synchronize_session=False)
                        CohortMember.query.filter_by(cohort_id=cohort_id).delete(synchronize_session=False)
                        # Delete cohort only if no sessions remain for it
                        remaining = db.session.query(Session.id).filter_by(cohort_id=cohort_id).first()
                        if not remaining:
                            db.session.delete(cohort)
            except Exception:
                pass

        # Clean personal data in cohort sessions for this scenario (do not delete sessions)
        cohort_sessions = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == uid,
                Session.scenario_id == int(scenario_id),
                Session.mode != "isolated_per_player",
            )
            .all()
        )
        for s in cohort_sessions:
            sid = s.id
            # Remove this player's forecasts/results from the cohort session
            Forecast.query.filter_by(session_id=sid, player_id=uid).delete(synchronize_session=False)
            Result.query.filter_by(session_id=sid, player_id=uid).delete(synchronize_session=False)
            # Remove type selection for this player (if any)
            SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).delete(synchronize_session=False)
            # Remove player's activity logs for this session
            ActivityLog.query.filter_by(session_id=sid, user_id=uid).delete(synchronize_session=False)

        db.session.commit()
        return {"status": "ok"}
