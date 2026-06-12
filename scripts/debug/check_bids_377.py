"""Check bids structure for Session 377"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session, Forecast, SessionPlayerType
import json

app = create_app()
with app.app_context():
    session = Session.query.filter_by(id=377).first()
    spt = SessionPlayerType.query.filter_by(session_id=377).first()
    
    forecast = Forecast.query.filter_by(
        session_id=377, 
        player_id=spt.user_id, 
        round_num=1
    ).first()
    
    if not forecast:
        print("No forecast found")
        sys.exit(1)
    
    print("=== FORECAST BIDS STRUCTURE ===")
    print(f"forecast.bids type: {type(forecast.bids)}")
    print(f"forecast.bids value: {forecast.bids}")
    
    if forecast.bids:
        print(f"\nTop-level keys: {list(forecast.bids.keys())}")
        for device_id, device_data in forecast.bids.items():
            print(f"\n  Device: {device_id}")
            print(f"    Type: {type(device_data)}")
            print(f"    Keys: {list(device_data.keys()) if isinstance(device_data, dict) else 'Not a dict'}")
            if isinstance(device_data, dict):
                for market, market_data in device_data.items():
                    print(f"      {market}: {type(market_data)}")
                    if isinstance(market_data, dict):
                        print(f"        Keys: {list(market_data.keys())}")
                        print(f"        Hours: {len(market_data)}")
                        if len(market_data) > 0:
                            first_hour = list(market_data.keys())[0]
                            print(f"        Sample (hour {first_hour}): {market_data[first_hour]}")
    
    print("\n\n=== FORECAST.DATA['bids'] ===")
    data_bids = forecast.data.get('bids', {})
    print(f"Type: {type(data_bids)}")
    print(f"Value: {json.dumps(data_bids, indent=2)[:500]}")

