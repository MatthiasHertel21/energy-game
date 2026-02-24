"""Generate debug report for Session 371 manually"""
from app import create_app
from app.models import Session, Forecast, Result, User, SessionPlayerType
from app.debug_logger import get_debug_logger

app = create_app()
with app.app_context():
    session = Session.query.get(371)
    result = Result.query.filter_by(session_id=371, player_id=1, round_num=1).first()
    forecast = Forecast.query.filter_by(session_id=371, player_id=1, round_num=1).first()
    
    if not (session and result and forecast):
        print("Error: Missing data")
        exit(1)
    
    print(f"Session {session.id}, Round 1, Player 1")
    print(f"Result data keys: {list(result.data.keys())}")
    
    # Get player info
    user = User.query.get(1)
    spt = SessionPlayerType.query.filter_by(session_id=371, user_id=1).first()
    
    player_types = session.scenario.config.get('player_types', [])
    pt = next((p for p in player_types if p.get('id') == spt.type_id), None) if spt else None
    player_type_name = pt.get('name') if pt else 'unknown'
    
    devices_cfg = session.scenario.config.get('devices', [])
    device_ids = pt.get('devices', []) if pt else []
    player_devices = [d for d in devices_cfg if d.get('id') in device_ids]
    
    print(f"Player: {user.email}, Type: {player_type_name}")
    print(f"Devices: {[d.get('name') for d in player_devices]}")
    
    # Prepare inputs
    inputs = {
        "scenario_config": session.scenario.config,
        "devices": player_devices,
        "forecast_data": forecast.bids or {}
    }
    
    # Prepare calculations
    calculations = {
        "hourly_results": result.data.get('hourly_results', [])
    }
    
    # Prepare results - use device_hourly_breakdown instead of bid_dispatch
    kpis = result.data.get('kpis', {})
    device_hourly_breakdown = kpis.get('device_hourly_breakdown', {})
    
    results = {
        "kpis": kpis,
        "bid_dispatch": {},
        "device_hourly_details": result.data.get('device_hourly_details', {})
    }
    
    print(f"\nGenerating debug report...")
    print(f"  device_hourly_breakdown devices: {list(device_hourly_breakdown.keys())}")
    print(f"  device_hourly_details keys: {list(results['device_hourly_details'].keys()) if results['device_hourly_details'] else 'None'}")
    
    # Generate debug report
    logger = get_debug_logger()
    debug_file = logger.log_round_calculation(
        session_id=session.id,
        round_num=1,
        scenario_name=session.scenario.name,
        player_id=1,
        player_email=user.email,
        player_type=player_type_name,
        inputs=inputs,
        calculations=calculations,
        results=results
    )
    
    print(f"\n✅ Debug report generated: {debug_file}")
    
    import os
    size = os.path.getsize(debug_file)
    print(f"   Size: {size:,} bytes ({size/1024:.1f} KB)")
