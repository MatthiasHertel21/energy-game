"""Check scenario config for session 377"""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app
from app.models import Session
import json

app = create_app()
with app.app_context():
    session = Session.query.filter_by(id=377).first()
    if not session:
        print("Session 377 not found")
        sys.exit(1)
    
    config = session.scenario.config
    
    # Check market settings
    market_config = config.get('market', {})
    print("=== MARKET CONFIG ===")
    print(f"enable_player_bidding: {market_config.get('enable_player_bidding', False)}")
    print(f"use_synthetic_supply_with_bidding: {market_config.get('use_synthetic_supply_with_bidding', False)}")
    
    # Check device settings
    devices = config.get('devices', [])
    print(f"\n=== DEVICES ({len(devices)}) ===")
    for d in devices:
        device_type = d.get('type', 'unknown')
        if 'load' in device_type.lower():
            continue  # Skip consumers
        
        print(f"\nDevice: {d.get('name', 'unnamed')} (ID: {d.get('id', 'no-id')})")
        print(f"  Type: {device_type}")
        print(f"  Capacity: {d.get('capacity_mw', 'N/A')} MW")
        print(f"  enable_multi_bid: {d.get('enable_multi_bid', 'NOT SET')}")

