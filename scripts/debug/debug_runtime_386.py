"""Run engine.run_round for session 386 round 1 and generate debug report with live capacity debug."""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app, db
from app.models import Session, Forecast, User, SessionPlayerType, CohortMember
from app.engine import run_round
from app.debug_logger import get_debug_logger

SESSION_ID = 386
ROUND_NUM = 1

app = create_app()
with app.app_context():
    s = Session.query.get(SESSION_ID)
    if not s:
        print("Session not found")
        sys.exit(1)

    hours_span = int((s.scenario.config or {}).get("general", {}).get("round_span_hours", 6))
    rounds = int((s.scenario.config or {}).get("general", {}).get("rounds", 1))

    players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=s.cohort_id).all()]
    forecasts = {}
    for pid in players:
        full = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=0).first()
        current_round_forecast = Forecast.query.filter_by(session_id=s.id, player_id=pid, round_num=ROUND_NUM).first()
        current_bids = current_round_forecast.bids if current_round_forecast and current_round_forecast.bids else None
        current_devices = (current_round_forecast.data or {}).get("devices", []) if current_round_forecast else []

        if full and isinstance(full.data, dict):
            forecast_data = {
                'hours': list(full.data.get("hours", [])),
                'bids': current_bids,
                'devices': current_devices
            }
            forecasts[pid] = forecast_data
        else:
            total_hours = rounds * hours_span
            full_horizon = [0.0] * total_hours
            all_forecasts = (
                Forecast.query.filter_by(session_id=s.id, player_id=pid)
                .filter(Forecast.round_num > 0)
                .order_by(Forecast.round_num)
                .all()
            )
            for fc in all_forecasts:
                fc_hours = (fc.data or {}).get("hours", [])
                start_idx = (fc.round_num - 1) * hours_span
                for i, val in enumerate(fc_hours):
                    if start_idx + i < total_hours:
                        full_horizon[start_idx + i] = val
            forecasts[pid] = {'hours': full_horizon, 'bids': current_bids, 'devices': current_devices}

    res = run_round(s.id, ROUND_NUM, players, forecasts, s.scenario.config or {}, mode=s.mode or "isolated_per_player", seed=None)

    spt = SessionPlayerType.query.filter_by(session_id=s.id).first()
    if not spt:
        print("No SessionPlayerType found")
        sys.exit(1)

    user = User.query.get(spt.user_id)
    player_types = s.scenario.config.get('player_types', [])
    pt = next((p for p in player_types if p.get('id') == spt.type_id), None)
    player_type_name = pt.get('name', 'unknown') if pt else 'unknown'

    bids = forecasts[spt.user_id].get('bids') or {}
    devices_cfg = s.scenario.config.get('devices', [])
    device_ids = pt.get('devices', []) if pt else []
    player_devices = [d for d in devices_cfg if d.get('id') in device_ids]

    inputs = {
        "scenario_config": s.scenario.config,
        "devices": player_devices,
        "forecast_data": bids
    }

    calculations = {
        "hourly_results": res.get('hourly_results', [])
    }

    kpis = (res.get('round_kpis', {}) or {}).get(spt.user_id, {})
    results = {
        "kpis": kpis,
        "bid_dispatch": res.get('bid_dispatch', {}),
        "device_hourly_details": res.get('device_hourly_details', {})
    }

    logger = get_debug_logger()
    debug_file = logger.log_round_calculation(
        session_id=s.id,
        round_num=ROUND_NUM,
        scenario_name=s.scenario.name,
        player_id=spt.user_id,
        player_email=user.email if user else 'unknown',
        player_type=player_type_name,
        inputs=inputs,
        calculations=calculations,
        results=results
    )

    print(f"DEBUG_FILE={debug_file}")
