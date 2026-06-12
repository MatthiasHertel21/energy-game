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

    def walk(obj, path=''):
        if isinstance(obj, dict):
            for k, v in obj.items():
                next_path = f"{path}.{k}" if path else k
                if 'profile' in k.lower():
                    print(next_path)
                walk(v, next_path)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}[{i}]")

    walk(cfg)
