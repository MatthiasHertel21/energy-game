"""Create new test session."""
from app import create_app
from app.models import Session, Scenario, User, db, SessionPlayerType, SessionStatus

app = create_app()
with app.app_context():
    # Monday scenario, admin user
    scenario = Scenario.query.filter_by(name="Monday").first()
    admin = User.query.filter_by(email="admin@fastbreak.one").first()
    
    # Create session with proper status
    session = Session(
        scenario_id=scenario.id,
        mode="isolated_per_player",
        current_round=1,
        status=SessionStatus.created
    )
    db.session.add(session)
    db.session.commit()
    
    # Assign Classic Provider type
    player_types = scenario.config.get("player_types", [])
    classic_provider = next((pt for pt in player_types if "Provider" in pt.get("name", "")), None)
    
    spt = SessionPlayerType(
        session_id=session.id,
        user_id=admin.id,
        type_id=classic_provider.get("id")
    )
    db.session.add(spt)
    db.session.commit()
    
    print(f"{session.id}")  # Output just the ID for scripting
