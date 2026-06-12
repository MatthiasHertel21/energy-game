"""Check dispatch for session 377 round 1"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session, Result, SessionPlayerType
import json

app = create_app()
with app.app_context():
    spt = SessionPlayerType.query.filter_by(session_id=377).first()
    result = Result.query.filter_by(session_id=377, player_id=spt.user_id, round_num=1).first()
    
    if not result:
        print("No result found")
        sys.exit(1)
    
    kpis = result.data.get('kpis', {})
    device_breakdown = kpis.get('device_hourly_breakdown', {})
    
    print("=== DEVICE HOURLY BREAKDOWN ===")
    print(f"Devices: {list(device_breakdown.keys())}")
    
    for device_id, hours in device_breakdown.items():
        print(f"\n{device_id}:")
        print(f"  Hours: {len(hours)}")
        if len(hours) > 0:
            h0 = hours[0]
            print(f"  Hour 0 keys: {list(h0.keys())}")
            print(f"  Hour 0 data: {json.dumps(h0, indent=2)}")

