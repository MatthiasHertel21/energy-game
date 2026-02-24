"""Generate debug report for Session 377 Round 1"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session, Forecast, Result, User, SessionPlayerType
from app.debug_logger import get_debug_logger
import json

app = create_app()
with app.app_context():
    session = Session.query.get(377)
    if not session:
        print("Session 377 not found")
        sys.exit(1)
    
    # Get all player types for this session
    spts = SessionPlayerType.query.filter_by(session_id=377).all()
    print(f"Session 377 has {len(spts)} players")
    
    for spt in spts:
        user = User.query.get(spt.user_id)
        player_types = session.scenario.config.get('player_types', [])
        pt = next((p for p in player_types if p.get('id') == spt.type_id), None)
        
        if not pt:
            print(f"Could not find player type {spt.type_id}")
            continue
            
        player_type_name = pt.get('name', 'unknown')
        
        # Get forecast and result for Round 1
        forecast = Forecast.query.filter_by(
            session_id=377, 
            player_id=spt.user_id, 
            round_num=1
        ).first()
        
        result = Result.query.filter_by(
            session_id=377, 
            player_id=spt.user_id, 
            round_num=1
        ).first()
        
        if not (forecast and result):
            print(f"Player {spt.user_id}: Missing forecast or result")
            continue
        
        # Get devices for this player type
        devices_cfg = session.scenario.config.get('devices', [])
        device_ids = pt.get('devices', [])
        player_devices = [d for d in devices_cfg if d.get('id') in device_ids]
        
        print(f"\nPlayer {spt.user_id}: {user.email if user else 'Unknown'}")
        print(f"  Type: {player_type_name}")
        print(f"  Devices: {[d.get('name') for d in player_devices]}")
        
        # Check bids
        bids = forecast.bids or forecast.data.get('bids', {})
        print(f"  Has bids: {bool(bids)}")
        if bids:
            for device_id in device_ids:
                device_bids = bids.get(device_id, {})
                if device_bids:
                    dam_bids = device_bids.get('DAM', {})
                    print(f"    Device {device_id}: DAM bids for {len(dam_bids)} hours")
        
        # Check dispatch
        kpis = result.data.get('kpis', {})
        device_breakdown = kpis.get('device_hourly_breakdown', {})
        print(f"  Device breakdown keys: {list(device_breakdown.keys())}")
        
        # Generate debug report
        inputs = {
            "scenario_config": session.scenario.config,
            "devices": player_devices,
            "forecast_data": bids
        }
        
        calculations = {
            "hourly_results": result.data.get('hourly_results', [])
        }
        
        results = {
            "kpis": kpis,
            "bid_dispatch": {},
            "device_hourly_details": result.data.get('device_hourly_details', {})
        }
        
        logger = get_debug_logger()
        debug_file = logger.log_round_calculation(
            session_id=session.id,
            round_num=1,
            scenario_name=session.scenario.name,
            player_id=spt.user_id,
            player_email=user.email if user else 'unknown',
            player_type=player_type_name,
            inputs=inputs,
            calculations=calculations,
            results=results
        )
        
        print(f"  ✅ Debug report: {debug_file}")

