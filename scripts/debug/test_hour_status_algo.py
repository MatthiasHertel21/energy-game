#!/usr/bin/env python3
"""Test the new two-stage hour_status algorithm."""

import sys
sys.path.insert(0, '/app')

from app import create_app, db
from app.models import Session

app = create_app()
with app.app_context():
    # Test Session 251 in different rounds
    session = db.session.get(Session, 251)
    if not session:
        print("❌ Session 251 not found")
        sys.exit(1)
    
    print(f"=== Testing Session {session.id} ===")
    print(f"Scenario: {session.scenario.name}")
    print(f"Current Round: {session.current_round}\n")
    
    # Import the function
    from app.player import generate_market_timeline
    
    # Test different rounds
    for round_num in [1, 2, 3]:
        print(f"--- Round {round_num} ---")
        timeline = generate_market_timeline(session, round_num)
        
        if "error" in timeline:
            print(f"❌ Error: {timeline['error']}")
            continue
        
        hour_status = timeline.get("hour_status", [])
        if not hour_status:
            print("❌ No hour_status generated")
            continue
        
        # Count status types
        from collections import Counter
        status_counts = Counter(hour_status)
        
        print(f"Hour status summary (first 96 hours):")
        for status, count in sorted(status_counts.items()):
            print(f"  {status}: {count} hours")
        
        # Show first 72 hours in detail
        print(f"\nFirst 72 hours:")
        for i in range(0, min(72, len(hour_status)), 24):
            day_num = (i // 24) + 1
            day_status = hour_status[i:i+24]
            unique_status = list(dict.fromkeys(day_status))
            print(f"  Day {day_num} (h{i}-{i+23}): {', '.join(unique_status)}")
        
        print()
    
    print("✓ Algorithm test complete")
