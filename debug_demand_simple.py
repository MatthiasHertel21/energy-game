#!/usr/bin/env python3
"""
Simple debug - just check the bid dispatch data
"""
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
        print("No result found")
        sys.exit(1)
    
    print(f"Session 31, Round {result.round_num}\n")
    
    # Parse result data
    data = json.loads(result.data) if isinstance(result.data, str) else result.data
    
    # Get bid dispatch summary
    bid_summary = data.get('bid_dispatch_summary', {})
    
    # Get Player 4
    player_id = '4'
    if player_id not in bid_summary:
        print(f"Player {player_id} not in bid_dispatch_summary")
        print(f"Available players: {list(bid_summary.keys())}")
        sys.exit(1)
    
    player_bids = bid_summary[player_id]
    
    # Get KPIs for MCP
    kpis = data.get('kpis', {})
    player_kpis = kpis.get(player_id, {})
    hourly = player_kpis.get('hourly_breakdown', [])
    mcp_first_hour = hourly[0].get('mcp', 0) if hourly else 0
    
    print(f"Player 4 Bid Dispatch (MCP first hour: {mcp_first_hour:.1f} ZAR/MWh):\n")
    
    for device_id, device_dispatch in player_bids.items():
        print(f"Device: {device_id}")
        
        for lot in ['A', 'B', 'C']:
            if lot in device_dispatch:
                lot_info = device_dispatch[lot]
                offered = lot_info.get('mw_offered', 0)
                dispatched = lot_info.get('mw_dispatched', 0)
                price_bid = lot_info.get('price_bid', 0)
                mcp = lot_info.get('mcp', 0)
                pct = (dispatched / offered * 100) if offered > 0 else 0
                
                status = ""
                if price_bid < mcp and dispatched > 0:
                    status = " ⚠️ BUG: Bid < MCP but dispatched!"
                elif price_bid >= mcp and dispatched == 0:
                    status = " ⚠️ BUG: Bid >= MCP but NOT dispatched!"
                
                print(f"  Lot {lot}: Bid={price_bid:4.0f} ZAR/MWh, MCP={mcp:.1f}, "
                      f"Offered={offered:6.1f} MW, Dispatched={dispatched:6.1f} MW ({pct:3.0f}%){status}")
        print()
