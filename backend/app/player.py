from http import HTTPStatus
from flask import request, current_app
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
        "bids": fields.Raw(required=False, description="Multi-bid pricing structure (optional)"),
    },
)

forecast_full_in = ns.model(
    "ForecastFullIn",
    {
        "session_id": fields.Integer(required=True),
        "hours": fields.List(fields.Float, required=True, description="Full horizon forecast values (MWh)"),
        "bids": fields.Raw(required=False, description="Multi-bid pricing structure (optional)"),
    },
)


def _validate_bids_structure(bids_data: dict, config: dict) -> list:
    """
    Validate multi-bid pricing structure.
    
    Args:
        bids_data: Dict of {device_id: {bid_label: {price, hours}}}
        config: Scenario config
    
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    market_cfg = (config or {}).get("market", {})
    price_floor = float(market_cfg.get("price_floor", -500))
    price_cap = float(market_cfg.get("price_cap", 5000))
    general_cfg = (config or {}).get("general", {})
    horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
    
    if not isinstance(bids_data, dict):
        errors.append("Bids must be a dictionary")
        return errors
    
    for device_id, device_bids in bids_data.items():
        if not isinstance(device_bids, dict):
            errors.append(f"Device {device_id}: bids must be a dictionary")
            continue
        
        for bid_label in ['A', 'B', 'C']:
            if bid_label not in device_bids:
                continue
            
            bid = device_bids[bid_label]
            if not isinstance(bid, dict):
                errors.append(f"Device {device_id}, Bid {bid_label}: must be a dictionary")
                continue
            
            # Validate price
            if 'price' not in bid:
                errors.append(f"Device {device_id}, Bid {bid_label}: missing 'price' field")
                continue
            
            try:
                price = float(bid['price'])
                if price < price_floor or price > price_cap:
                    errors.append(
                        f"Device {device_id}, Bid {bid_label}: price {price} outside bounds [{price_floor}, {price_cap}]"
                    )
            except (ValueError, TypeError):
                errors.append(f"Device {device_id}, Bid {bid_label}: price must be a number")
            
            # Validate hours
            if 'hours' not in bid:
                errors.append(f"Device {device_id}, Bid {bid_label}: missing 'hours' field")
                continue
            
            hours = bid['hours']
            if not isinstance(hours, list):
                errors.append(f"Device {device_id}, Bid {bid_label}: hours must be a list")
                continue
            
            if len(hours) == 0:
                errors.append(f"Device {device_id}, Bid {bid_label}: hours cannot be empty")
                continue
            if horizon_hours > 0 and len(hours) != horizon_hours:
                errors.append(
                    f"Device {device_id}, Bid {bid_label}: hours length {len(hours)} must equal horizon {horizon_hours}"
                )
            
            # Validate each hour value
            for i, val in enumerate(hours):
                try:
                    float(val)
                except (ValueError, TypeError):
                    errors.append(f"Device {device_id}, Bid {bid_label}, hour {i}: must be a number")
                    break
    
    return errors


@ns.route("/forecast")
class ForecastAPI(Resource):
    @jwt_required()
    @ns.expect(forecast_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        per_device = data.get("devices") if isinstance(data, dict) else None
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            
            # Validate bids structure if provided
            bids_data = data.get("bids")
            if bids_data:
                bid_errors = _validate_bids_structure(bids_data, config)
                if bid_errors:
                    return {"error": "Bid validation failed", "details": bid_errors}, HTTPStatus.BAD_REQUEST
            
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
            # If payload includes per-device hours, validate each; also compute aggregate
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
        
        # Store forecast with optional bids
        forecast_data = {"hours": data["hours"]}
        if isinstance(per_device, list) and per_device:
            forecast_data["devices"] = per_device
        bids_data = data.get("bids")
        
        # Get session and scenario config for DA gate logic
        session = Session.query.get(data["session_id"])
        scenario = Scenario.query.get(session.scenario_id) if session else None
        
        # Calculate which hours are newly DA-committed based on gate logic
        is_da_baseline = False
        da_baseline_hours = None  # Which hours of this forecast become DA baseline
        
        if session and scenario:
            general_cfg = scenario.config.get("general", {})
            round_span = int(general_cfg.get("round_span_hours", 6))
            # Use forecast_horizon_hours for DA calculation (visible in chart)
            horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
            day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
            start_time_str = general_cfg.get("start_time") or "00:00"
            
            try:
                start_hour = int(start_time_str.split(":")[0])
            except:
                start_hour = 0
            
            current_round = data["round_num"]
            current_sim_hour = (current_round - 1) * round_span
            prev_sim_hour = (current_round - 2) * round_span if current_round > 1 else -1
            
            # Calculate first gate sim hour
            first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
            if first_gate_sim_hour <= 0:
                first_gate_sim_hour += 24
            
            # Hours until first midnight
            hours_until_first_midnight = (24 - start_hour) % 24
            if hours_until_first_midnight == 0:
                hours_until_first_midnight = 24
            
            # Check if we just passed a gate (between prev_sim_hour and current_sim_hour)
            def get_gate_count(sim_hour):
                if sim_hour < first_gate_sim_hour:
                    return 0
                return 1 + (sim_hour - first_gate_sim_hour) // 24
            
            prev_gate_count = get_gate_count(prev_sim_hour) if prev_sim_hour >= 0 else 0
            current_gate_count = get_gate_count(current_sim_hour)
            
            # Round 1 ALWAYS creates DA baseline for Day 1 (hours 0 to first_midnight)
            # This represents the initial DA position before any gate closure
            if current_round == 1:
                is_da_baseline = True
                # Day 1 = from scenario start to first midnight
                new_da_start = 0
                new_da_end = min(hours_until_first_midnight, horizon_hours)
                da_baseline_hours = {"start": new_da_start, "end": new_da_end}
            elif current_gate_count > prev_gate_count:
                # A new gate was just passed! Mark this forecast as DA baseline
                is_da_baseline = True
                # Calculate which hours are newly committed
                # Gate N commits day N+1 (hours from midnight N to midnight N+1)
                new_da_start = hours_until_first_midnight + (current_gate_count - 1) * 24
                new_da_end = min(hours_until_first_midnight + current_gate_count * 24, horizon_hours)
                if new_da_start < new_da_end:  # Only if there are hours to commit
                    da_baseline_hours = {"start": new_da_start, "end": new_da_end}
                else:
                    is_da_baseline = False  # No hours to commit
        
        # Save forecast
        f = Forecast(
            session_id=data["session_id"], 
            player_id=player_id, 
            round_num=data["round_num"], 
            data=forecast_data,
            bids=bids_data,
            is_da_baseline=is_da_baseline
        )
        
        # If this is a new DA baseline, store which hours it covers
        if is_da_baseline and da_baseline_hours:
            f.data["da_baseline_hours"] = da_baseline_hours
        
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
        
        # In solo mode, immediately end the round when player submits
        if session and session.mode == 'isolated_per_player':
            # Emit event to force timer to 0
            socketio.emit("tick", {"session_id": session.id, "remaining": 0}, namespace="/game", to=f"session-{session.id}")
        
        return {"status": "ok", "id": f.id}, HTTPStatus.CREATED


@ns.route("/forecast/full")
class ForecastFull(Resource):
    @jwt_required()
    @ns.expect(forecast_full_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        per_device = data.get("devices") if isinstance(data, dict) else None
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            
            # Validate bids structure if provided
            bids_data = data.get("bids")
            if bids_data:
                bid_errors = _validate_bids_structure(bids_data, config)
                if bid_errors:
                    return {"error": "Bid validation failed", "details": bid_errors}, HTTPStatus.BAD_REQUEST
            
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
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
        
        # Store both aggregate hours and per-device hours if provided
        forecast_data = {"hours": data["hours"]}
        if isinstance(per_device, list) and per_device:
            forecast_data["devices"] = per_device
        
        # Store bids if provided
        bids_data = data.get("bids")
        
        # Calculate DA baseline based on gate logic (same as /submit)
        session = Session.query.get(data["session_id"])
        scenario = Scenario.query.get(session.scenario_id) if session else None
        
        is_da_baseline = False
        da_baseline_hours = None
        
        if session and scenario:
            general_cfg = scenario.config.get("general", {})
            round_span = int(general_cfg.get("round_span_hours", 6))
            # Use forecast_horizon_hours for DA calculation (visible in chart)
            horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
            day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
            start_time_str = general_cfg.get("start_time") or "00:00"
            
            try:
                start_hour = int(start_time_str.split(":")[0])
            except:
                start_hour = 0
            
            current_round = session.current_round or 1
            current_sim_hour = (current_round - 1) * round_span
            prev_sim_hour = (current_round - 2) * round_span if current_round > 1 else -1
            
            first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
            if first_gate_sim_hour <= 0:
                first_gate_sim_hour += 24
            
            hours_until_first_midnight = (24 - start_hour) % 24
            if hours_until_first_midnight == 0:
                hours_until_first_midnight = 24
            
            def get_gate_count(sim_hour):
                if sim_hour < first_gate_sim_hour:
                    return 0
                return 1 + (sim_hour - first_gate_sim_hour) // 24
            
            prev_gate_count = get_gate_count(prev_sim_hour) if prev_sim_hour >= 0 else 0
            current_gate_count = get_gate_count(current_sim_hour)
            
            # Round 1 ALWAYS creates DA baseline for Day 1
            if current_round == 1:
                is_da_baseline = True
                new_da_start = 0
                new_da_end = min(hours_until_first_midnight, horizon_hours)
                da_baseline_hours = {"start": new_da_start, "end": new_da_end}
            elif current_gate_count > prev_gate_count:
                is_da_baseline = True
                new_da_start = hours_until_first_midnight + (current_gate_count - 1) * 24
                new_da_end = min(hours_until_first_midnight + current_gate_count * 24, horizon_hours)
                if new_da_start < new_da_end:
                    da_baseline_hours = {"start": new_da_start, "end": new_da_end}
                else:
                    is_da_baseline = False
        
        # Store DA baseline hours range if applicable
        if is_da_baseline and da_baseline_hours:
            forecast_data["da_baseline_hours"] = da_baseline_hours
        
        if not f:
            f = Forecast(
                session_id=data["session_id"], 
                player_id=player_id, 
                round_num=0, 
                data=forecast_data,
                bids=bids_data,
                is_da_baseline=is_da_baseline
            )
        else:
            f.data = forecast_data
            f.bids = bids_data
            if is_da_baseline:
                f.is_da_baseline = True
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
        if not f:
            return {"hours": None, "devices": None, "bids": None}
        return {
            "hours": f.data.get("hours") if f else None,
            "devices": f.data.get("devices") if f else None,
            "bids": f.bids if f else None
        }


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

        # Find or create a cohort for this user's solo sessions
        # Reuse existing solo cohort instead of creating new ones
        c = Cohort.query.filter_by(trainer_id=uid, name=f"Solo {uid}").first()
        if not c:
            c = Cohort(name=f"Solo {uid}", trainer_id=uid)
            db.session.add(c)
            db.session.flush()  # get id
            
            # Add player as cohort member
            cm = CohortMember(cohort_id=c.id, user_id=uid)
            db.session.add(cm)
        else:
            # Ensure player is member of their solo cohort
            existing_member = CohortMember.query.filter_by(cohort_id=c.id, user_id=uid).first()
            if not existing_member:
                cm = CohortMember(cohort_id=c.id, user_id=uid)
                db.session.add(cm)

        # Create session (start in briefing phase; scheduler waits for player start)
        from datetime import datetime
        s = Session(
            cohort_id=c.id,
            scenario_id=scenario_id,
            mode="isolated_per_player",
            status=SessionStatus.briefing,
            started_at=datetime.utcnow(),
            current_round=1,
        )
        db.session.add(s)
        db.session.flush()

        # Populate allowed_types from scenario config for isolated_per_player mode
        try:
            scen = Scenario.query.get(scenario_id)
            player_types = scen.config.get("player_types", []) if scen and scen.config else []
            for pt in player_types:
                type_id = pt.get("id")
                if type_id:
                    # max_players = 1 in isolated mode (each player picks their own type)
                    db.session.add(SessionAllowedType(session_id=s.id, type_id=type_id, max_players=1))
        except Exception:
            current_app.logger.exception(
                "failed to seed allowed types for solo session", extra={"session_id": s.id, "scenario_id": scenario_id}
            )
            pass  # Continue even if allowed_types setup fails

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
        # Start scheduler in background (will wait in briefing phase until player starts)
        from .scheduler import run_rounds
        from .extensions import socketio
        socketio.start_background_task(run_rounds, s.id, current_app._get_current_object())
        return {"session_id": s.id, "status": "briefing"}, HTTPStatus.CREATED


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


@ns.route("/da-baseline/<int:session_id>")
class DABaseline(Resource):
    @jwt_required()
    def get(self, session_id: int):
        """
        Get Day-Ahead baseline forecast for the current player with gate closure info.
        Returns the Round 1 forecast marked as is_da_baseline=True plus hour locking info.
        
        Response format:
        {
          "devices": {
            "device_1": [100, 100, 100, ...],  // DA position per hour
            "device_2": [50, 50, 50, ...]
          },
          "bids": {
            "device_1": {
              "A": {"price": 350, "hours": [50, 50, ...]},
              "B": {"price": 400, "hours": [30, 30, ...]},
              "C": {"price": 480, "hours": [20, 20, ...]}
            }
          },
          "aggregate": [150, 150, 150, ...],  // Sum across all devices
          "hour_status": ["locked", "locked", "da", "da", "id", "id", "future", "future", ...],
          "locked_until_hour": 6,  // Hours 0-5 are locked (already executed)
          "da_until_hour": 30,  // Hours 6-29 are DA (committed but tradeable as ID)
          "id_until_hour": 48   // Hours 30-47 are ID (still adjustable)
        }
        """
        player_id = int(get_jwt_identity())
        
        # Get session info for gate closure calculation
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        scenario = Scenario.query.get(session.scenario_id)
        if not scenario or not scenario.config:
            return {"error": "Scenario not found"}, HTTPStatus.NOT_FOUND
        
        general_cfg = scenario.config.get("general", {})
        round_span = int(general_cfg.get("round_span_hours", 6))
        # Use forecast_horizon_hours for DA calculation (visible in chart)
        horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
        day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))  # Gate closes at 12:00
        start_time_str = general_cfg.get("start_time") or "00:00"
        current_round = session.current_round or 1
        
        # Parse start time
        try:
            start_hour = int(start_time_str.split(":")[0])
        except:
            start_hour = 0
        
        # Calculate current simulation hour and clock time
        current_sim_hour = (current_round - 1) * round_span
        current_clock_hour = (start_hour + current_sim_hour) % 24
        
        # SIMPLE DA MARKET MODEL:
        # - Round 1: DA baseline for Day 1 (hours 0 to first midnight)
        # - Gate at 12:00 Day N: DA baseline for Day N+1 (next 24 hours after midnight)
        #
        # DA-committed = hours where DA position is fixed and cannot be changed
        # After Round 1, Day 1 is committed. After each gate, the next day is committed.
        
        locked_until_hour = current_sim_hour
        
        # Calculate which hours are DA-committed (cannot be changed)
        # Find hours since scenario start until first midnight
        hours_until_first_midnight = (24 - start_hour) % 24
        if hours_until_first_midnight == 0:
            hours_until_first_midnight = 24  # If start at 00:00, first midnight is 24h later
        
        # Gate hour relative to scenario start
        first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
        if first_gate_sim_hour <= 0:
            first_gate_sim_hour += 24  # Gate is on next day
        
        # DA-committed always starts at 0 (Day 1 is committed from Round 1)
        # Then extends with each gate
        da_committed_start = 0
        da_committed_end = hours_until_first_midnight  # Day 1 is always committed
        
        # Count how many gates have been passed
        if current_sim_hour >= first_gate_sim_hour:
            gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
            # Each gate commits one more day
            da_committed_end = min(hours_until_first_midnight + gate_count * 24, horizon_hours)
        
        # Clamp to valid range
        da_committed_start = max(0, da_committed_start)
        da_committed_end = min(da_committed_end, horizon_hours)
        
        # For API response
        da_until_hour = da_committed_end
        id_until_hour = horizon_hours
        
        # Find ALL DA baseline forecasts and combine them
        # Each gate creates a new DA baseline for different hours
        da_forecasts = Forecast.query.filter_by(
            session_id=session_id,
            player_id=player_id,
            is_da_baseline=True
        ).order_by(Forecast.round_num).all()
        
        if not da_forecasts:
            # No DA baseline exists yet
            # Build hour status based on gate logic
            hour_status = []
            for h in range(horizon_hours):
                if h < locked_until_hour:
                    hour_status.append("locked")
                elif da_committed_start <= h < da_committed_end:
                    hour_status.append("da")
                else:
                    hour_status.append("id")
            
            return {
                "devices": {},
                "bids": {},
                "aggregate": [],
                "hour_status": hour_status,
                "locked_until_hour": locked_until_hour,
                "da_committed_start": da_committed_start if da_committed_start < horizon_hours else -1,
                "da_committed_end": da_committed_end if da_committed_end > 0 else -1,
                "da_until_hour": da_until_hour,
                "id_until_hour": id_until_hour
            }, HTTPStatus.OK
        
        # Combine DA baselines from multiple gates
        # Each forecast covers specific hours (stored in da_baseline_hours)
        aggregate_hours = [0.0] * horizon_hours
        devices_by_id = {}
        bids_data = {}
        
        for da_forecast in da_forecasts:
            forecast_data = da_forecast.data or {}
            da_hours_range = forecast_data.get("da_baseline_hours", {"start": 0, "end": horizon_hours})
            da_start = da_hours_range.get("start", 0)
            da_end = da_hours_range.get("end", horizon_hours)
            
            # Copy aggregate hours for this range
            forecast_hours = forecast_data.get("hours", [])
            for h in range(da_start, min(da_end, len(forecast_hours), horizon_hours)):
                if h < len(forecast_hours):
                    aggregate_hours[h] = forecast_hours[h]
            
            # Copy device data for this range
            devices_data = forecast_data.get("devices", [])
            if isinstance(devices_data, list):
                for item in devices_data:
                    device_id = item.get("device_id")
                    hours = item.get("hours", [])
                    if device_id:
                        if device_id not in devices_by_id:
                            devices_by_id[device_id] = [0.0] * horizon_hours
                        for h in range(da_start, min(da_end, len(hours), horizon_hours)):
                            if h < len(hours):
                                devices_by_id[device_id][h] = hours[h]
            
            # Copy bids for this range
            forecast_bids = da_forecast.bids or {}
            for device_id, lots in forecast_bids.items():
                if device_id not in bids_data:
                    bids_data[device_id] = {}
                for lot_name, lot_data in lots.items():
                    lot_hours = lot_data.get('hours', [])
                    if lot_name not in bids_data[device_id]:
                        bids_data[device_id][lot_name] = {
                            'price': lot_data.get('price', 0),
                            'hours': [0.0] * horizon_hours
                        }
                    for h in range(da_start, min(da_end, len(lot_hours), horizon_hours)):
                        if h < len(lot_hours):
                            bids_data[device_id][lot_name]['hours'][h] = lot_hours[h]
        
        # Truncate to da_until_hour
        aggregate_hours = aggregate_hours[:da_until_hour]
        for device_id in devices_by_id:
            devices_by_id[device_id] = devices_by_id[device_id][:da_until_hour]
        for device_id in bids_data:
            for lot_name in bids_data[device_id]:
                bids_data[device_id][lot_name]['hours'] = bids_data[device_id][lot_name]['hours'][:da_until_hour]
        
        # Build hour status array based on REAL DA gate logic:
        # - "locked": Already delivered (past)
        # - "da": DA-committed (Gate passed, cannot change forecast for these hours)
        # - "id": ID-tradeable (can adjust forecast)
        hour_status = []
        for h in range(horizon_hours):
            if h < locked_until_hour:
                hour_status.append("locked")
            elif da_committed_start <= h < da_committed_end:
                # This hour is DA-committed (gate has passed for this delivery day)
                hour_status.append("da")
            else:
                # ID-tradeable (either before DA period or beyond it)
                hour_status.append("id")
        
        return {
            "devices": devices_by_id,
            "bids": bids_data,
            "aggregate": aggregate_hours,
            "hour_status": hour_status,
            "locked_until_hour": locked_until_hour,
            "da_committed_start": da_committed_start if da_committed_start < horizon_hours else -1,
            "da_committed_end": da_committed_end if da_committed_end > 0 else -1,
            "da_until_hour": da_until_hour,
            "id_until_hour": id_until_hour
        }, HTTPStatus.OK


@ns.route("/results/<int:session_id>")
class PlayerResults(Resource):
    @jwt_required()
    def get(self, session_id: int):
        """
        Get all round results for the current player in this session, including hourly_results.
        Returns SMP, volume, and hourly data for each completed round.
        """
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get all results for this player in this session
        results = Result.query.filter_by(session_id=session_id, player_id=player_id).order_by(Result.round_num).all()
        
        print(f"[PlayerResults] Session {session_id}, Player {player_id}: Found {len(results)} results")
        
        rounds_data = []
        all_hourly_results = []
        
        for result in results:
            if result.data:
                rounds_data.append({
                    "round": result.round_num,
                    "smp": result.data.get("smp", 0),
                    "volume": result.data.get("volume", 0),
                })
                
                # Collect hourly_results from this round
                hourly = result.data.get("hourly_results", [])
                if hourly:
                    print(f"[PlayerResults] Round {result.round_num}: {len(hourly)} hourly entries")
                    all_hourly_results.extend(hourly)
                else:
                    print(f"[PlayerResults] Round {result.round_num}: No hourly_results in data")
        
        print(f"[PlayerResults] Returning {len(all_hourly_results)} total hourly results")
        
        return {
            "rounds": rounds_data,
            "hourly_results": all_hourly_results
        }, HTTPStatus.OK


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
