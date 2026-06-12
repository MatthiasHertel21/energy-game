import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session
import json

SESSION_ID = 378

app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=SESSION_ID).first()
    if not s:
        print('Session not found')
        sys.exit(1)
    env = (s.scenario.config or {}).get('environment', {}) or {}
    print('environment.profile_preset:', env.get('profile_preset'))
    print('environment.diurnal_profile:', json.dumps(env.get('diurnal_profile'), indent=2)[:800])
