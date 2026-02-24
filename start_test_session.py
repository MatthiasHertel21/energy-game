"""Start a new test session for detailed round-by-round analysis."""
from app import create_app
from app.models import Session, Scenario, User, db, SessionPlayerType
import json

app = create_app()
with app.app_context():
    # Get Monday scenario
    scenario = Scenario.query.filter_by(name="Monday").first()
    if not scenario:
        print("❌ Monday scenario not found")
        exit(1)
    
    print(f"✅ Found scenario: {scenario.name} (ID: {scenario.id})")
    
    # Get admin user
    admin = User.query.filter_by(email="admin@fastbreak.one").first()
    if not admin:
        print("❌ Admin user not found")
        exit(1)
    
    print(f"✅ Found user: {admin.email} (ID: {admin.id})")
    
    # Create new session
    session = Session(
        scenario_id=scenario.id,
        mode="isolated_per_player",
        current_round=0,
        status="waiting"
    )
    db.session.add(session)
    db.session.commit()
    
    print(f"✅ Created session: {session.id}")
    
    # Assign player type
    player_types = scenario.config.get("player_types", [])
    classic_provider = next((pt for pt in player_types if "Provider" in pt.get("name", "")), None)
    
    if classic_provider:
        spt = SessionPlayerType(
            session_id=session.id,
            user_id=admin.id,
            type_id=classic_provider.get("id")
        )
        db.session.add(spt)
        db.session.commit()
        print(f"✅ Assigned player type: {classic_provider.get('name')}")
    
    # Enable debug for this session
    print(f"\n📋 Session Details:")
    print(f"   ID: {session.id}")
    print(f"   Scenario: {scenario.name}")
    print(f"   Mode: {session.mode}")
    print(f"   Player Type: {classic_provider.get('name') if classic_provider else 'None'}")
    print(f"   Rounds: {scenario.config.get('general', {}).get('rounds', 'Unknown')}")
    
    # Check if bidding enabled
    enable_bidding = scenario.config.get("market", {}).get("enable_player_bidding", False)
    print(f"   Bidding Enabled: {enable_bidding}")
    
    print(f"\n🎯 Next steps:")
    print(f"   1. Start session: Update status to 'active'")
    print(f"   2. Submit forecast with debug_enabled=True")
    print(f"   3. Run round and analyze debug report")
    
    print(f"\n💡 Use Session ID: {session.id}")
