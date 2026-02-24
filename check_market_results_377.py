import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session
import json
app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=377).first()
    # Check if there's a market_results field
    # Try different possible locations
    from app.models import Result
    result = Result.query.filter_by(session_id=377, player_id=1, round_num=1).first()
    if result:
        hourly = result.data.get('hourly_results', [])
        if hourly:
            h0 = hourly[0]
            print(f"Hour 0 from result.data.hourly_results:")
            print(json.dumps(h0, indent=2))
