from app import create_app
from app.models import Result, Session
from sqlalchemy import desc
import json

app = create_app()
with app.app_context():
    s = Session.query.get(30)
    if s:
        r = Result.query.filter_by(session_id=30).order_by(desc(Result.created_at)).first()
        if r:
            print(f"Session {s.id}, Round {r.round_num}, Result ID {r.id}")
            print(f"\n=== Full Result.data structure ===")
            print(json.dumps(r.data, indent=2, default=str))
        else:
            print("No results found")
    else:
        print("Session 30 not found")
