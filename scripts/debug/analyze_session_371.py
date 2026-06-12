"""Analyze Session 371 Round 1"""
from app import create_app
from app.models import Session, Forecast, Result, User, SessionPlayerType
import json

app = create_app()
with app.app_context():
    # Load Session 371
    session = Session.query.get(371)
    if not session:
        print("❌ Session 371 not found")
        exit(1)
    
    print(f"✅ Session {session.id}: {session.scenario.name}")
    print(f"   Mode: {session.mode}")
    print(f"   Current Round: {session.current_round}")
    print(f"   Status: {session.status}")
    
    # Get forecasts for Round 1
    forecasts = Forecast.query.filter_by(
        session_id=session.id,
        round_num=1
    ).all()
    
    print(f"\n📊 Round 1 - Forecasts: {len(forecasts)}")
    for f in forecasts:
        user = User.query.get(f.player_id)
        print(f"   Player {f.player_id} ({user.email if user else 'unknown'})")
        
        # Check if debug_enabled
        if f.data and f.data.get('debug_enabled'):
            print(f"      ✅ Debug enabled")
        else:
            print(f"      ❌ Debug NOT enabled")
        
        # Check if bids exist
        if f.bids:
            print(f"      Bids: {len(f.bids)} devices")
            for dev_id in list(f.bids.keys())[:2]:
                lots = f.bids[dev_id].keys()
                print(f"         {dev_id}: lots {list(lots)}")
        else:
            print(f"      ⚠️  No bids (old format)")
    
    # Get results for Round 1
    results = Result.query.filter_by(
        session_id=session.id,
        round_num=1
    ).all()
    
    print(f"\n📈 Round 1 - Results: {len(results)}")
    for r in results:
        user = User.query.get(r.player_id)
        kpis = r.data.get('kpis', {})
        
        print(f"   Player {r.player_id} ({user.email if user else 'unknown'})")
        print(f"      Revenue: {kpis.get('revenue_zar', 0):,.0f} ZAR")
        print(f"      Profit: {kpis.get('profit_zar', 0):,.0f} ZAR")
        print(f"      Imbalance Cost: {kpis.get('imbalance_cost_zar', 0):,.0f} ZAR")
        
        # Check bid_dispatch
        if 'bid_dispatch' in r.data and r.data['bid_dispatch']:
            print(f"      ✅ Bid dispatch: {len(r.data['bid_dispatch'])} devices")
        else:
            print(f"      ❌ No bid dispatch data")
    
    # Show scenario config (bidding enabled?)
    config = session.scenario.config
    enable_bidding = config.get('market', {}).get('enable_player_bidding', False)
    print(f"\n⚙️  Scenario Config:")
    print(f"   enable_player_bidding: {enable_bidding}")
    
    devices = config.get('devices', [])
    print(f"   Devices: {len(devices)}")
    
    player_types = config.get('player_types', [])
    print(f"   Player Types: {len(player_types)}")
    
    # Show which player types players selected
    print(f"\n👥 Players:")
    for spt in SessionPlayerType.query.filter_by(session_id=session.id).all():
        user = User.query.get(spt.user_id)
        pt = next((p for p in player_types if p.get('id') == spt.type_id), None)
        pt_name = pt.get('name') if pt else 'unknown'
        
        if pt:
            device_ids = pt.get('devices', [])
            device_names = [d.get('name') for d in devices if d.get('id') in device_ids]
            print(f"   Player {spt.user_id} ({user.email if user else '?'}): {pt_name}")
            print(f"      Devices: {', '.join(device_names[:3])}")
