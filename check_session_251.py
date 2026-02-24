#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app, db
from app.models import Session, Scenario

app = create_app()
with app.app_context():
    session = Session.query.get(251)
    if not session:
        print("Session 251 not found")
        sys.exit(1)
    
    scenario = Scenario.query.get(session.scenario_id)
    config = scenario.config
    markets = config.get("markets", {})
    dam_config = markets.get("dam", {})
    
    print(f"Session 251: {session.name}")
    print(f"Scenario: {scenario.name}")
    print(f"Current Round: {session.current_round}")
    print(f"\nDAM config: {dam_config}")
    print(f"\nDAM trading: {dam_config.get('trading', [])}")
    print(f"DAM clearing: {dam_config.get('clearing', [])}")
