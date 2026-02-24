"""Generate debug report for Session 386 Round 1 and summarize capacity debug."""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session, Forecast, Result, User, SessionPlayerType
from app.debug_logger import get_debug_logger

SESSION_ID = 386
ROUND_NUM = 1

app = create_app()
with app.app_context():
    session = Session.query.get(SESSION_ID)
    if not session:
        print(f"Session {SESSION_ID} not found")
        sys.exit(1)

    spt = SessionPlayerType.query.filter_by(session_id=SESSION_ID).first()
    if not spt:
        print("No SessionPlayerType found")
        sys.exit(1)

    user = User.query.get(spt.user_id)
    player_types = session.scenario.config.get('player_types', [])
    pt = next((p for p in player_types if p.get('id') == spt.type_id), None)
    player_type_name = pt.get('name', 'unknown') if pt else 'unknown'

    forecast = Forecast.query.filter_by(session_id=SESSION_ID, player_id=spt.user_id, round_num=ROUND_NUM).first()
    result = Result.query.filter_by(session_id=SESSION_ID, player_id=spt.user_id, round_num=ROUND_NUM).first()

    if not (forecast and result):
        print("Missing forecast or result")
        sys.exit(1)

    bids = forecast.bids or forecast.data.get('bids', {})
    devices_cfg = session.scenario.config.get('devices', [])
    device_ids = pt.get('devices', []) if pt else []
    player_devices = [d for d in devices_cfg if d.get('id') in device_ids]

    inputs = {
        "scenario_config": session.scenario.config,
        "devices": player_devices,
        "forecast_data": bids
    }

    calculations = {
        "hourly_results": result.data.get('hourly_results', [])
    }

    kpis = result.data.get('kpis', {})
    results = {
        "kpis": kpis,
        "bid_dispatch": {},
        "device_hourly_details": result.data.get('device_hourly_details', {})
    }

    logger = get_debug_logger()
    debug_file = logger.log_round_calculation(
        session_id=session.id,
        round_num=ROUND_NUM,
        scenario_name=session.scenario.name,
        player_id=spt.user_id,
        player_email=user.email if user else 'unknown',
        player_type=player_type_name,
        inputs=inputs,
        calculations=calculations,
        results=results
    )

    print(f"DEBUG_FILE={debug_file}")

    # Print capacity debug for first device and first 6 hours
    device_breakdown = kpis.get('device_hourly_breakdown', {})
    if device_breakdown:
        first_device = list(device_breakdown.keys())[0]
        print(f"\nDevice breakdown sample: {first_device}")
        for entry in device_breakdown[first_device][:6]:
            cap_debug = entry.get('capacity_debug', {})
            print({
                'hour': entry.get('hour'),
                'base': entry.get('base_capacity_mw'),
                'effective': entry.get('effective_capacity_mw'),
                'cap_debug': cap_debug
            })

