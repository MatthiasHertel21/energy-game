#!/usr/bin/env python3
from app import create_app, db
from app.models import Result
import json

app = create_app()

with app.app_context():
    # Query results for Session 353
    round1 = Result.query.filter_by(session_id=353, round_num=1).first()
    round2 = Result.query.filter_by(session_id=353, round_num=2).first()
    
    print("=" * 80)
    print("RESULTS FOR SESSION 353")
    print("=" * 80)
    print()
    
    if round1:
        print("ROUND 1:")
        print("-" * 80)
        print(f"Result ID: {round1.id} | Player: {round1.player_id}")
        if round1.data and 'kpis' in round1.data:
            kpis = round1.data['kpis']
            print("\nKPIs:")
            for key, value in sorted(kpis.items()):
                if isinstance(value, (int, float)):
                    print(f"  {key}: {value:,.2f}")
                else:
                    print(f"  {key}: {value}")
        if round1.bid_dispatch:
            print(f"\nBid Dispatch: YES ({len(round1.bid_dispatch)} devices)")
        else:
            print("\nBid Dispatch: NO")
        print()
    
    if round2:
        print("ROUND 2:")
        print("-" * 80)
        print(f"Result ID: {round2.id} | Player: {round2.player_id}")
        if round2.data and 'kpis' in round2.data:
            kpis = round2.data['kpis']
            print("\nKPIs:")
            for key, value in sorted(kpis.items()):
                if isinstance(value, (int, float)):
                    print(f"  {key}: {value:,.2f}")
                else:
                    print(f"  {key}: {value}")
        if round2.bid_dispatch:
            print(f"\nBid Dispatch: YES ({len(round2.bid_dispatch)} devices)")
        else:
            print("\nBid Dispatch: NO")
