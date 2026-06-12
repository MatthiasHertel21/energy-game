"""Test enhanced debug report for Round 1 with actual data."""
from app import create_app
from app.models import Session, Forecast
from app.engine import run_round
import json

app = create_app()
with app.app_context():
    # Load Session 361
    session = Session.query.get(361)
    if not session:
        print("Session 361 not found")
        exit(1)
    
    # Load forecasts for round 1
    forecasts = Forecast.query.filter_by(
        session_id=session.id,
        round_num=1
    ).all()
    
    print(f"Found {len(forecasts)} forecasts for round 1")
    
    if forecasts:
        forecast = forecasts[0]
        print(f"Using forecast from player {forecast.player_id}")
        
        # Force scheduler-like call with debug logger
        from app.debug_logger import get_debug_logger
        from app.models import User, SessionPlayerType
        
        # Get player info
        player_user = User.query.get(forecast.player_id)
        player_email = player_user.email if player_user else "unknown"
        
        # Get player type
        spt = SessionPlayerType.query.filter_by(
            session_id=session.id,
            user_id=forecast.player_id
        ).first()
        player_type_name = "unknown"
        player_types = session.scenario.config.get("player_types", [])
        if spt and spt.type_id:
            pt = next((p for p in player_types if p.get("id") == spt.type_id), None)
            if pt:
                player_type_name = pt.get("name", "unknown")
        
        # Get player devices
        devices_cfg = session.scenario.config.get("devices", [])
        if spt and spt.type_id:
            pt = next((p for p in player_types if p.get("id") == spt.type_id), None)
            device_ids = pt.get("devices", []) if pt else []
            player_devices = [d for d in devices_cfg if d.get("id") in device_ids]
        else:
            player_devices = []
        
        # Run round engine
        all_forecasts = {f.player_id: f.bids for f in forecasts}
        
        try:
            result = run_round(
                session_id=session.id,
                round_num=1,
                players=list(all_forecasts.keys()),
                forecasts=all_forecasts,
                config=session.scenario.config,
                mode=session.mode
            )
            
            # Get player-specific results
            player_kpis = result.get("round_kpis", {}).get(forecast.player_id, {})
            hourly_results = result.get("hourly_results", [])
            bid_dispatch = result.get("bid_dispatch", {}).get(forecast.player_id, {})
            device_hourly_details = result.get("device_hourly_details", {})
            
            print(f"\n✅ Engine results:")
            print(f"   Revenue: {player_kpis.get('revenue_zar', 0):,.0f} ZAR")
            print(f"   Profit: {player_kpis.get('profit_zar', 0):,.0f} ZAR")
            print(f"   Hourly results: {len(hourly_results)} hours")
            print(f"   Bid dispatch devices: {list(bid_dispatch.keys())}")
            print(f"   Device hourly details: CO2={len(device_hourly_details.get('co2', {}))} devices, Balancing={len(device_hourly_details.get('balancing', {}))} devices")
            
            # Generate debug report
            logger = get_debug_logger()
            
            inputs = {
                "scenario_config": session.scenario.config,
                "devices": player_devices,
                "forecast_data": forecast.bids or {}
            }
            
            calculations = {
                "hourly_results": hourly_results
            }
            
            results = {
                "kpis": player_kpis,
                "bid_dispatch": bid_dispatch,
                "device_hourly_details": device_hourly_details
            }
            
            debug_file = logger.log_round_calculation(
                session_id=session.id,
                round_num=1,
                scenario_name=session.scenario.name,
                player_id=forecast.player_id,
                player_email=player_email,
                player_type=player_type_name,
                inputs=inputs,
                calculations=calculations,
                results=results
            )
            
            print(f"\n✅ Debug report generated: {debug_file}")
            
            # Show report size
            import os
            size = os.path.getsize(debug_file)
            print(f"   Size: {size:,} bytes ({size/1024:.1f} KB)")
            
            # Show sample from bid_dispatch
            if bid_dispatch:
                for dev_id in list(bid_dispatch.keys())[:1]:
                    dev_data = bid_dispatch[dev_id]
                    if "A" in dev_data and isinstance(dev_data["A"], list):
                        print(f"\n   Sample bid_dispatch for {dev_id}, lot A:")
                        print(f"   Total hours: {len(dev_data['A'])}")
                        if len(dev_data["A"]) > 0:
                            sample = dev_data["A"][0]
                            print(f"   Hour 0: offered={sample.get('mw_offered'):.2f}, dispatched={sample.get('mw_dispatched'):.2f}, price={sample.get('price_bid'):.1f}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
