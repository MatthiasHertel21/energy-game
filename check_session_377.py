import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app, db
from app.models import Session, Player, Device, Scenario, Round, Forecast
import json

app = create_app()
with app.app_context():
    session_obj = Session.query.filter_by(id=377).first()
    if not session_obj:
        print("Session 377 not found")
        sys.exit(1)
    
    print(f"\n=== SESSION 377 ===")
    print(f"Scenario: {session_obj.scenario.name if session_obj.scenario else 'N/A'}")
    print(f"Status: {session_obj.status}")
    
    # Get rounds
    rounds = Round.query.filter_by(session_id=377).order_by(Round.round_number).all()
    print(f"Rounds: {len(rounds)}")
    
    for rnd in rounds:
        print(f"\n--- Round {rnd.round_number} ---")
        print(f"Status: {rnd.status}")
        if rnd.market_results:
            mr = rnd.market_results if isinstance(rnd.market_results, dict) else json.loads(rnd.market_results)
            print(f"Market cleared: {mr.get('status', 'unknown')}")
            if 'hourly_results' in mr:
                print(f"Hours cleared: {len(mr['hourly_results'])}")
    
    # Get players and devices
    players = Player.query.filter_by(session_id=377).all()
    print(f"\n=== PLAYERS ({len(players)}) ===")
    
    for p in players:
        print(f"\nPlayer {p.player_number}: {p.name}")
        devices = Device.query.filter_by(player_id=p.id).all()
        print(f"  Devices ({len(devices)}):")
        for d in devices:
            print(f"    - {d.subtype}: {d.capacity_mw} MW (ID: {d.id})")
            
            # Check forecasts for R1
            forecasts = Forecast.query.filter_by(
                device_id=d.id,
                round_number=1
            ).order_by(Forecast.hour).all()
            
            if forecasts:
                print(f"      R1 Forecasts: {len(forecasts)} hours")
                for f in forecasts[:3]:  # Show first 3 hours
                    bids = f.bids or f.data.get('bids', {})
                    dam_bid = bids.get('DAM', {}) if bids else {}
                    print(f"        Hour {f.hour}: DAM bids = {dam_bid}")

