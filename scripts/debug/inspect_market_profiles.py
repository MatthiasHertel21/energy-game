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
    market = (s.scenario.config or {}).get('market', {}) or {}
    keys = [k for k in market.keys() if 'profile' in k or 'mix' in k]
    print('market keys with profile/mix:', keys)
    for k in keys:
        val = market.get(k)
        print('\n', k, ':', type(val))
        print(json.dumps(val, indent=2)[:800])
