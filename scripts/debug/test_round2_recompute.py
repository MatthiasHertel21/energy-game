#!/usr/bin/env python3
"""
Recompute Round 2 for Session 361 to test new SMP calculation logic.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app, db
from app.models import Session, Scenario, Result, Forecast, SessionPlayerType
from app.engine import run_round

def main():
    app = create_app()
    with app.app_context():
        session_id = 361
        round_num = 2
        
        # Get session and scenario
        session = db.session.get(Session, session_id)
        if not session:
            print(f"Session {session_id} not found")
            return
        
        scenario = db.session.get(Scenario, session.scenario_id)
        if not scenario:
            print(f"Scenario not found")
            return
        
        config = scenario.config or {}
        
        # Get players
        spts = SessionPlayerType.query.filter_by(session_id=session_id).all()
        player_ids = [spt.user_id for spt in spts]
        
        print(f"=== Recomputing Round {round_num} for Session {session_id} ===")
        print(f"Players: {player_ids}")
        
        # Get forecasts for round 2
        forecasts_raw = Forecast.query.filter_by(session_id=session_id, round_num=round_num).all()
        
        # Build normalized forecasts dict
        normalized_forecasts = {}
        for f in forecasts_raw:
            pid = f.player_id
            forecast_data = f.data or {}
            bids_data = f.bids or {}
            
            normalized_forecasts[pid] = {
                'hours': forecast_data.get('hours', []),
                'bids': bids_data,
                'devices': forecast_data.get('devices', []),
                'player_id': pid
            }
        
        print(f"\nNormalized forecasts for {len(normalized_forecasts)} players")
        
        # Run round with engine
        print("\nCalling run_round...")
        result = run_round(session_id, round_num, player_ids, normalized_forecasts, config)
        
        print(f"\n=== Round Results ===")
        print(f"SMP: {result.get('smp', 'N/A')} ZAR/MWh")
        print(f"Volume: {result.get('volume', 'N/A')} MWh")
        
        # Show per-player KPIs
        round_kpis = result.get('round_kpis', {})
        for pid, kpis in round_kpis.items():
            print(f"\nPlayer {pid}:")
            print(f"  Revenue: {kpis.get('revenue_zar', 0):.0f} ZAR")
            print(f"  Profit: {kpis.get('profit_zar', 0):.0f} ZAR")
            print(f"  Dispatched: {kpis.get('dispatched_mwh', 0):.1f} MWh")

if __name__ == '__main__':
    main()
