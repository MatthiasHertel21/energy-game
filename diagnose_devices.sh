#!/bin/bash

echo "=== DEVICE DIAGNOSTIC ==="
echo ""
echo "Checking all scenarios and their device configurations..."
echo ""

docker compose exec -T backend python3 << 'PYTHON_EOF'
from app import create_app, db
from app.models import Scenario
import json

app = create_app()
with app.app_context():
    scenarios = Scenario.query.all()
    
    for scenario in scenarios:
        print(f"\n{'='*60}")
        print(f"SCENARIO {scenario.id}: {scenario.name}")
        print(f"{'='*60}")
        
        config = scenario.config or {}
        player_types = config.get('player_types', [])
        devices = config.get('devices', [])
        
        print(f"\nTotal Devices in Scenario: {len(devices)}")
        print(f"Player Types: {len(player_types)}")
        
        if len(player_types) == 0:
            print("\n⚠️  No Player Types defined - Solo Mode")
            print("   → All devices should be visible to all players")
        else:
            print(f"\nPlayer Type Configuration:")
            for i, pt in enumerate(player_types):
                pt_devices = pt.get('devices', [])
                print(f"\n{i+1}. '{pt.get('name', 'N/A')}' (ID: {pt.get('id', 'N/A')})")
                print(f"   Assigned Devices: {len(pt_devices)}")
                for did in pt_devices:
                    dev = next((d for d in devices if d.get('id') == did), None)
                    if dev:
                        print(f"     • {did}: {dev.get('name', 'unnamed')} ({dev.get('type', 'unknown')})")
                    else:
                        print(f"     • {did}: ⚠️  NOT FOUND IN SCENARIO DEVICES!")
        
        print(f"\n\nAll Scenario Devices:")
        for dev in devices:
            assigned_to = []
            for pt in player_types:
                if dev.get('id') in pt.get('devices', []):
                    assigned_to.append(pt.get('name', pt.get('id')))
            
            assignment_str = f" → Assigned to: {', '.join(assigned_to)}" if assigned_to else " → Not assigned to any player type"
            print(f"  {dev.get('id')}: {dev.get('name', 'unnamed')} ({dev.get('type', 'unknown')}){assignment_str}")
PYTHON_EOF

echo ""
echo "=== ACTIVE SESSIONS ==="
echo ""

docker compose exec -T backend python3 << 'PYTHON_EOF'
from app import create_app, db
from app.models import Session, Scenario
import redis

app = create_app()
with app.app_context():
    # Get recent sessions
    sessions = Session.query.order_by(Session.id.desc()).limit(5).all()
    
    r = redis.from_url('redis://redis:6379/0')
    
    for session in sessions:
        scenario = Scenario.query.get(session.scenario_id)
        print(f"\nSession {session.id}: {session.status}")
        print(f"  Scenario: {scenario.name if scenario else 'N/A'}")
        
        # Check Redis for player type selections
        selection_key = f"session:{session.id}:player:*:type"
        keys = r.keys(selection_key)
        
        if keys:
            print(f"  Player Type Selections:")
            for key in keys:
                player_id = key.decode().split(':')[3]
                selected_type = r.get(key).decode()
                print(f"    Player {player_id}: {selected_type}")
        else:
            print(f"  No player type selections found (Solo mode or no selections yet)")
PYTHON_EOF

echo ""
echo "=== DIAGNOSTIC COMPLETE ==="
