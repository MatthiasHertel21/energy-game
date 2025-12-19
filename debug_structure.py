#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import db, Session, Result
import json

app = create_app()
with app.app_context():
    session = db.session.query(Session).get(31)
    result = db.session.query(Result).filter_by(session_id=31).order_by(Result.round_num.desc()).first()
    
    if not result:
        print("No result")
        sys.exit(1)
    
    print(f"Session 31, Round {result.round_num}\n")
    
    # Get forecasts
    forecasts = json.loads(result.forecasts) if isinstance(result.forecasts, str) else result.forecasts
    
    print(f"Forecasts keys (players): {list(forecasts.keys())}")
    print()
    
    for player_id, forecast in forecasts.items():
        print(f"Player '{player_id}':")
        print(f"  Forecast keys: {list(forecast.keys())}")
        
        if 'bids' in forecast:
            bids = forecast['bids']
            print(f"  Bids (devices): {list(bids.keys())[:3]}...")  # First 3
    
    print("\n" + "="*60)
    print("Now checking bid_dispatch column...")
    
    if result.bid_dispatch:
        bd = json.loads(result.bid_dispatch) if isinstance(result.bid_dispatch, str) else result.bid_dispatch
        print(f"\nbid_dispatch keys (should be player IDs): {list(bd.keys())}")
        
        for key in list(bd.keys())[:2]:
            inner = bd[key]
            print(f"\n  '{key}' inner keys (should be device IDs): {list(inner.keys())[:3]}...")
