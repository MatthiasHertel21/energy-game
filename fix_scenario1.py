#!/usr/bin/env python3
"""Fix Scenario 1 configuration inconsistencies"""

import sys
sys.path.insert(0, 'backend')

from app import create_app, db
from app.models import Scenario

app = create_app()

with app.app_context():
    scenario = Scenario.query.get(1)
    if not scenario:
        print("❌ Scenario 1 not found")
        sys.exit(1)
    
    config = scenario.config
    
    # Fix structure
    if 'structure' not in config:
        config['structure'] = {}
    config['structure']['rounds'] = 4
    config['structure']['hours_per_round'] = 6
    
    # Fix IDM to match DAM (4 entries, all off for testing)
    markets = config.get('markets', {})
    idm = markets.get('idm', {})
    idm['trading'] = ['off', 'off', 'off', 'off']
    idm['clearing']= ['off', 'off', 'off', 'off']
    
    # Save changes
    scenario.config = config
    db.session.commit()
    
    print('✅ Scenario 1 "Monday" erfolgreich korrigiert:')
    print(f'   Runden: {config["structure"]["rounds"]}')
    print(f'   Stunden pro Runde: {config["structure"]["hours_per_round"]}')
    print(f'   DAM Trading: {markets["dam"]["trading"]}')
    print(f'   IDM Trading: {idm["trading"]}')
    print()
    print('⚠️  WICHTIG: Du musst eine NEUE Session erstellen!')
    print('   Alte Sessions (wie 226) behalten ihre alte Konfiguration.')
    print('   Die Fixes wirken nur für neue Sessions, die ab jetzt erstellt werden.')
