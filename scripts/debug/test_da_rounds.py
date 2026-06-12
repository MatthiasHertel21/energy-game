#!/usr/bin/env python3
"""Test that DA trading is correctly assigned to next day in each round."""
import sys
sys.path.insert(0, '/home/ga/energy-game/backend')

from app import create_app, db
from app.models import Session

app = create_app()
with app.app_context():
    session = db.session.get(Session, 251)
    if not session:
        print("Session 251 not found")
        sys.exit(1)
    
    scenario = db.session.get(type(session.scenario), session.scenario_id)
    config = scenario.config
    general = config.get("general", {})
    start_hour = int(general.get("start_time", "00:00").split(":")[0])
    round_span = general.get("round_span", 24)
    
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    print(f"Session 251 (Scenario: {scenario.name})")
    print(f"Start hour: {start_hour}")
    print(f"Hours until first midnight: {hours_until_first_midnight}")
    print(f"Round span: {round_span}")
    print()
    
    # Test DA day calculation for each round
    for round_num in [1, 2, 3, 4]:
        current_sim_hour = (round_num - 1) * round_span
        
        # Round 1: DA for Day 2
        if round_num == 1:
            da_day_start = hours_until_first_midnight
            da_day_end = da_day_start + 24
            da_day_num = 2
        else:
            # Round 2+: DA for next day
            da_day_start = hours_until_first_midnight + (round_num - 1) * 24
            da_day_end = da_day_start + 24
            da_day_num = round_num + 1
        
        print(f"Round {round_num} (current_sim_hour = {current_sim_hour}):")
        print(f"  → DA trading for Day {da_day_num}")
        print(f"  → DA hours: {da_day_start}-{da_day_end - 1}")
        print()
