from app import create_app, db
from app.models import Scenario
from sqlalchemy.orm.attributes import flag_modified

app = create_app()
with app.app_context():
    scenario = db.session.query(Scenario).filter_by(name="Monday").first()
    
    if scenario:
        config = scenario.config
        
        print("=== BEFORE ===")
        print(f"general.rounds: {config['general']['rounds']}")
        print(f"structure.rounds: {config['structure']['rounds']}")
        print(f"DAM trading entries: {len(config['markets']['dam']['trading'])}")
        print(f"IDM trading entries: {len(config['markets']['idm']['trading'])}")
        print()
        
        # Fix structure.rounds to match general.rounds
        config['structure']['rounds'] = 6
        
        # Extend markets arrays to 6 entries (add 2 "Gated" entries)
        config['markets']['dam']['trading'] = ['on', 'on', 'on', 'on', 'on', 'on']
        config['markets']['dam']['clearing'] = ['off', 'on', 'on', 'on', 'on', 'on']
        config['markets']['idm']['trading'] = ['off', 'off', 'off', 'off', 'off', 'off']
        config['markets']['idm']['clearing'] = ['off', 'off', 'off', 'off', 'off', 'off']
        
        # Extend bal array to 6 entries
        if 'bal' in config['markets']:
            config['markets']['bal'] = ['off', 'market_code', 'market_code', 'market_code', 'market_code', 'market_code']
        
        flag_modified(scenario, 'config')
        db.session.commit()
        
        print("=== AFTER ===")
        print(f"general.rounds: {config['general']['rounds']}")
        print(f"structure.rounds: {config['structure']['rounds']}")
        print(f"DAM trading: {config['markets']['dam']['trading']}")
        print(f"DAM clearing: {config['markets']['dam']['clearing']}")
        print(f"IDM trading: {config['markets']['idm']['trading']}")
        print(f"IDM clearing: {config['markets']['idm']['clearing']}")
        print()
        print("✅ Scenario 'Monday' updated to 6 rounds!")
    else:
        print("❌ Scenario 'Monday' not found")
