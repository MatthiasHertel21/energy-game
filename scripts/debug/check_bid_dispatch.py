#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import db, Result
import json

app = create_app()
with app.app_context():
    # Get latest result from Session 31
    result = db.session.query(Result).filter_by(session_id=31).order_by(Result.round_num.desc()).first()
    
    if not result:
        print("No result")
        sys.exit(1)
    
    print(f"Session 31, Round {result.round_num}")
    
    # Check bid_dispatch column
    if result.bid_dispatch:
        bd = json.loads(result.bid_dispatch) if isinstance(result.bid_dispatch, str) else result.bid_dispatch
        print(f"\nbid_dispatch column has {len(bd)} players:")
        for pid in bd.keys():
            print(f"  Player {pid}: {len(bd[pid])} devices")
    else:
        print("\n⚠️ bid_dispatch column is NULL or empty!")
    
    # Also check data field
    data = json.loads(result.data) if isinstance(result.data, str) else result.data
    
    if 'bid_dispatch' in data:
        bd2 = data['bid_dispatch']
        print(f"\ndata.bid_dispatch has {len(bd2)} players:")
        for pid in bd2.keys():
            print(f"  Player {pid}: {len(bd2[pid])} devices")
    else:
        print("\n⚠️ data.bid_dispatch does not exist!")
    
    print(f"\ndata keys: {list(data.keys())}")
