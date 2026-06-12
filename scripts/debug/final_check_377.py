import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session, Forecast, SessionPlayerType, Result
app = create_app()
with app.app_context():
    spt = SessionPlayerType.query.filter_by(session_id=377).first()
    print(f"Player ID: {spt.user_id}")
    print(f"Type ID: {spt.type_id}")    
    result = Result.query.filter_by(session_id=377, player_id=spt.user_id, round_num=1).first()
    kpis = result.data.get('kpis', {})
    
    # Check if bid_dispatch exists
    bid_dispatch = kpis.get('bid_dispatch', {})
    print(f"\nKPIs keys: {list(kpis.keys())}")
    print(f"bid_dispatch type: {type(bid_dispatch)}")
    print(f"bid_dispatch keys: {list(bid_dispatch.keys()) if isinstance(bid_dispatch, dict) else 'N/A'}")
    
    if bid_dispatch:
        print(f"\nPlayer IDs in bid_dispatch: {list(bid_dispatch.keys())}")
        for pid, devices in bid_dispatch.items():
            print(f"Player {pid}: devices = {list(devices.keys())}")
            for did, lots in devices.items():
                print(f"  Device {did}: lots = {list(lots.keys())}")

