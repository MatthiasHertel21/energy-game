from app import create_app
from app.models import Session
import json

app = create_app()
with app.app_context():
    s = Session.query.get(28)
    if s:
        scenario = s.scenario
        config = scenario.config if isinstance(scenario.config, dict) else json.loads(scenario.config)
        enable_bidding = config.get("market", {}).get("enable_player_bidding", False)
        print(f"Session {s.id}, Scenario: {s.scenario_id}")
        print(f"config.get('market', {{}}): {config.get('market', {})}")
        print(f"enable_player_bidding from market: {enable_bidding}")
        print(f"Full market config: {json.dumps(config.get('market', {}), indent=2)}")
    else:
        print("Session 28 not found")
