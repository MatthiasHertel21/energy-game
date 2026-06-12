import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session
app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=377).first()
    config = s.scenario.config
    rounds = config.get('rounds', [])
    print(f"Number of rounds configured: {len(rounds)}")
    for i, r in enumerate(rounds):
        events = r.get('events', [])
        print(f"Round {i+1}: {len(events)} events")
        for e in events:
            print(f"  - {e.get('type', 'unknown')}: {e.get('description', 'N/A')}")
