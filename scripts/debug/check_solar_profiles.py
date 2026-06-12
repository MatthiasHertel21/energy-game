import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session

SESSION_ID = 378

app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=SESSION_ID).first()
    if not s:
        print('Session not found')
        sys.exit(1)
    cfg = s.scenario.config or {}
    devices = cfg.get('devices') or []
    for d in devices:
        if (d.get('type') or '').lower() in ('solar','pv'):
            print('Device', d.get('id'))
            print('availability_profile:', d.get('availability_profile'))
            print('capacity_factor_pct:', d.get('capacity_factor_pct'))
            print('max_power_mw:', d.get('max_power_mw'))
            print('capacity_mw:', d.get('capacity_mw'))
