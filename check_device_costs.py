from app import create_app
from app.models import Session
import json

app = create_app()
with app.app_context():
    s = Session.query.get(30)
    if s:
        scenario = s.scenario
        config = scenario.config if isinstance(scenario.config, dict) else json.loads(scenario.config)
        devices = config.get('devices', [])
        
        print(f"Session {s.id}, Scenario: {s.scenario_id}")
        print(f"Total devices: {len(devices)}\n")
        
        for d in devices:
            print(f"=== Device: {d['id']} ===")
            print(f"  Type: {d.get('type')}")
            print(f"  Name: {d.get('name', 'N/A')}")
            print(f"  Owner ID: {d.get('owner_id')}")
            print(f"  Player ID: {d.get('player_id')}")
            print(f"  Capacity: {d.get('capacity_mw', 'N/A')} MW")
            print(f"  Variable Cost: {d.get('variable_cost_zar_per_mwh', 'N/A')} ZAR/MWh")
            print(f"  Fixed Cost: {d.get('fixed_cost_zar_per_year', 'N/A')} ZAR/year")
            print(f"  Min Generation: {d.get('min_generation_mw', 'N/A')}")
            print(f"  Max Generation: {d.get('max_generation_mw', 'N/A')}")
            print()
    else:
        print("Session 30 not found")
