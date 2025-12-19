#!/usr/bin/env python3
"""
Debug script to trace demand dispatch logic for Session 31
"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import db, Session, Result
import json

app = create_app()
with app.app_context():
    # Get Session 31, Round 2 (latest round)
    session = Session.query.get(31)
    if not session:
        print("Session 31 not found")
        sys.exit(1)
    
    # Get latest result (Round 2)
    result = Result.query.filter_by(session_id=31).order_by(Result.round_num.desc()).first()
    if not result:
        print("No results found for Session 31")
        sys.exit(1)
    
    print(f"Session 31, Round {result.round_num}")
    
    # Get config and forecasts
    config = json.loads(session.scenario.data) if session.scenario and session.scenario.data else {}
    forecasts = json.loads(result.forecasts) if result.forecasts else {}
    
    # Get player 4 (consumer-only)
    player_id = 4
    if str(player_id) not in forecasts:
        print(f"Player {player_id} not found in forecasts")
        sys.exit(1)
    
    player_forecast = forecasts[str(player_id)]
    print(f"\nPlayer {player_id} forecast:")
    print(f"Has bids: {'bids' in player_forecast}")
    
    if 'bids' in player_forecast:
        bids = player_forecast['bids']
        print(f"Number of devices: {len(bids)}")
        
        for device_id, device_bids in bids.items():
            print(f"\n  Device: {device_id}")
            for lot in ['A', 'B', 'C']:
                if lot in device_bids:
                    lot_data = device_bids[lot]
                    price = lot_data.get('price', 0)
                    hours = lot_data.get('hours', [])
                    total_mw = sum(hours) if hours else 0
                    print(f"    Lot {lot}: Price={price} ZAR/MWh, Total MW={total_mw:.1f}")
    
    # Now check the result KPIs
    kpis = result.data.get('kpis', {})
    player_kpis = kpis.get(str(player_id), {})
    
    print(f"\nPlayer {player_id} KPIs:")
    print(f"  Planned: {player_kpis.get('planned_mwh', 0):.1f} MWh")
    print(f"  Dispatched: {player_kpis.get('dispatched_mwh', 0):.1f} MWh")
    print(f"  Revenue: ZAR {player_kpis.get('revenue_zar', 0):,.2f}")
    
    # Check hourly breakdown
    hourly = player_kpis.get('hourly_breakdown', [])
    if hourly:
        print(f"\nFirst hour breakdown:")
        h0 = hourly[0]
        print(f"  Hour 0: MCP={h0.get('mcp', 0):.2f}, Planned={h0.get('planned', 0):.1f}, Dispatched={h0.get('dispatched', 0):.1f}")
    
    # Check bid_dispatch_summary
    bid_summary = result.data.get('bid_dispatch_summary', {})
    if str(player_id) in bid_summary:
        player_bids = bid_summary[str(player_id)]
        print(f"\nBid dispatch summary:")
        for device_id, device_dispatch in player_bids.items():
            print(f"\n  Device: {device_id}")
            for lot, lot_info in device_dispatch.items():
                offered = lot_info.get('mw_offered', 0)
                dispatched = lot_info.get('mw_dispatched', 0)
                price_bid = lot_info.get('price_bid', 0)
                mcp = lot_info.get('mcp', 0)
                pct = (dispatched / offered * 100) if offered > 0 else 0
                print(f"    Lot {lot}: Bid={price_bid} ZAR/MWh, MCP={mcp:.1f}, Offered={offered:.1f} MW, Dispatched={dispatched:.1f} MW ({pct:.0f}%)")
                
                # This is the bug check: 
                if price_bid < mcp and dispatched > 0:
                    print(f"      ⚠️ BUG: Bid price {price_bid} < MCP {mcp:.1f} but got dispatched!")
