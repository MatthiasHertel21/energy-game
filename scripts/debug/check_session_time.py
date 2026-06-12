import sys
sys.path.insert(0, '/home/ga/energy-game/backend')
from app import create_app
from app.models import Session, Round
app = create_app()
with app.app_context():
    s = Session.query.filter_by(id=377).first()
    r = Round.query.filter_by(session_id=377, round_number=1).first()
    if s:
        print(f"Session 377 created: {s.created_at}")
        print(f"Session status: {s.status}")
    if r:
        print(f"Round 1 created: {r.created_at}")
        print(f"Round 1 status: {r.status}")
        print(f"Round 1 completed: {r.completed_at}")
