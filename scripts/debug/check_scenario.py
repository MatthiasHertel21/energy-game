from app import create_app
from app.models import Session
import json

app = create_app()
with app.app_context():
    s = Session.query.get(28)
    if s:
        scenario = s.scenario
        config = scenario.config if isinstance(scenario.config, dict) else json.loads(scenario.config)
        devices = config.get('devices', [])
        print(f"Session {s.id}, Scenario: {s.scenario_id}")
        print(f"enable_player_bidding: {config.get('general', {}).get('enable_player_bidding')}")
        print(f"Total devices: {len(devices)}")
        print("\nDevice details:")
        for d in devices:
            print(f"  ID: {d['id']}, Type: {d.get('type')}, owner_id: {d.get('owner_id')}, player_id: {d.get('player_id')}")
    else:
        print("Session 28 not found")
