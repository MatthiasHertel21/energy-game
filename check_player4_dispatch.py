#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import db, Result
import json

app = create_app()
with app.app_context():
    # Get Player 4's result from Session 31
    result = db.session.query(Result).filter_by(
        session_id=31, 
        player_id=4
    ).order_by(Result.round_num.desc()).first()
    
    if not result:
        print("No result for Player 4 in Session 31")
        sys.exit(1)
    
    print(f"Session 31, Round {result.round_num}, Player {result.player_id}\n")
    
    # Check bid_dispatch column
    if result.bid_dispatch:
        bd = json.loads(result.bid_dispatch) if isinstance(result.bid_dispatch, str) else result.bid_dispatch
        print(f"bid_dispatch structure: {type(bd)}")
        print(f"bid_dispatch keys (should be device IDs): {list(bd.keys())}\n")
        
        for device_id, lots in list(bd.items())[:2]:
            print(f"Device '{device_id}':")
            print(f"  Lot keys: {list(lots.keys())}")
            for lot, lot_data in lots.items():
                print(f"    Lot {lot}: offered={lot_data.get('mw_offered', 0):.1f}, dispatched={lot_data.get('mw_dispatched', 0):.1f}, "
                      f"price_bid={lot_data.get('price_bid', 0):.1f}, mcp={lot_data.get('mcp', 0):.1f}")
                
                # BUG CHECK
                if lot_data.get('price_bid', 0) < lot_data.get('mcp', 0) and lot_data.get('mw_dispatched', 0) > 0:
                    print(f"      ⚠️ BUG: Consumer bid {lot_data['price_bid']} < MCP {lot_data['mcp']:.1f} but got dispatched!")
            print()
    else:
        print("⚠️ bid_dispatch column is NULL!")
