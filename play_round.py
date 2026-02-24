"""Play one round and analyze debug report."""
from app import create_app
from app.models import Session, Forecast, Result, db
from app.scheduler import handle_round_timeout
import json

app = create_app()

def play_round(session_id, round_num):
    """Play one round and return debug report path."""
    with app.app_context():
        session = Session.query.get(session_id)
        if not session:
            print(f"❌ Session {session_id} not found")
            return None
        
        print(f"\n{'='*80}")
        print(f"🎮 ROUND {round_num} - Session {session_id}")
        print(f"{'='*80}\n")
        
        # Update session to current round
        session.current_round = round_num
        db.session.commit()
        
        # Get player devices and create basic forecast with debug enabled
        from app.models import SessionPlayerType
        spt = SessionPlayerType.query.filter_by(session_id=session_id).first()
        
        if not spt:
            print("❌ No player type assigned")
            return None
        
        player_id = spt.user_id
        player_type_id = spt.type_id
        
        # Get devices for this player type
        player_types = session.scenario.config.get("player_types", [])
        pt = next((p for p in player_types if p.get("id") == player_type_id), None)
        
        if not pt:
            print("❌ Player type config not found")
            return None
        
        device_ids = pt.get("devices", [])
        devices = session.scenario.config.get("devices", [])
        player_devices = [d for d in devices if d.get("id") in device_ids]
        
        print(f"👤 Player: {spt.user_id} ({pt.get('name')})")
        print(f"🔧 Devices: {len(player_devices)} devices")
        
        # Check if forecast exists
        forecast = Forecast.query.filter_by(
            session_id=session_id,
            player_id=player_id,
            round_num=round_num
        ).first()
        
        if not forecast:
            # Create simple forecast (empty bids - will use synthetic)
            forecast = Forecast(
                session_id=session_id,
                player_id=player_id,
                round_num=round_num,
                data={
                    "debug_enabled": True,
                    "hours": [0] * 60,
                    "bids": {}
                },
                bids={}
            )
            db.session.add(forecast)
            
            # Mark as DA baseline for Round 1
            if round_num == 1:
                forecast.is_da_baseline = True
            
            db.session.commit()
            print(f"✅ Created empty forecast with debug enabled")
        else:
            # Enable debug
            if forecast.data:
                forecast.data["debug_enabled"] = True
            else:
                forecast.data = {"debug_enabled": True}
            db.session.commit()
            print(f"✅ Using existing forecast, debug enabled")
        
        # Trigger round calculation
        print(f"\n⚙️  Running market clearing...")
        handle_round_timeout(session_id)
        
        # Check for debug report
        import os
        import glob
        
        debug_dir = "/app/debug"
        scenario_name = session.scenario.name.replace(" ", "_")
        player_type_name = pt.get("name", "player").replace(" ", "_")
        
        # Find latest debug report for this round
        pattern = f"{debug_dir}/*{scenario_name}*{player_type_name}*round{round_num}.md"
        reports = glob.glob(pattern)
        
        if reports:
            latest_report = max(reports, key=os.path.getmtime)
            print(f"\n📊 Debug report generated: {latest_report}")
            return latest_report
        else:
            print(f"\n⚠️  No debug report found (pattern: {pattern})")
            return None


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python play_round.py <session_id> <round_num>")
        sys.exit(1)
    
    session_id = int(sys.argv[1])
    round_num = int(sys.argv[2])
    
    report_path = play_round(session_id, round_num)
    
    if report_path:
        print(f"\n✅ Round {round_num} completed successfully!")
        print(f"📄 Debug report: {report_path}")
    else:
        print(f"\n❌ Round {round_num} failed or no debug report generated")
        sys.exit(1)
