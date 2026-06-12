from app import create_app
from app.models import Result
import json

app = create_app()
with app.app_context():
    r2 = Result.query.filter_by(session_id=371, player_id=1, round_num=2).first()
    
    kpis = r2.data.get('kpis', {})
    
    print("=== ROUND 2 KPIs ===")
    print(f"Revenue:      {kpis.get('revenue_zar', 0):>12,.0f} ZAR")
    print(f"Profit:       {kpis.get('profit_zar', 0):>12,.0f} ZAR")
    print(f"Planned:      {kpis.get('planned_mwh', 0):>12,.2f} MWh")
    print(f"Dispatched:   {kpis.get('dispatched_mwh', 0):>12,.2f} MWh")
    print(f"Actual:       {kpis.get('actual_mwh', 0):>12,.2f} MWh")
    print(f"Imbalance:    {kpis.get('imbalance_cost_zar', 0):>12,.0f} ZAR")
    print(f"Curtailment:  {kpis.get('curtailment_cost_zar', 0):>12,.0f} ZAR")
    print(f"Variable Cost:{kpis.get('variable_cost_zar', 0):>12,.0f} ZAR")
    print(f"Fixed Cost:   {kpis.get('fixed_cost_zar', 0):>12,.0f} ZAR")
    
    print(f"\n=== DATA STRUCTURE ===")
    print(f"Keys: {list(r2.data.keys())}")
    print(f"bid_dispatch: {'YES' if 'bid_dispatch' in r2.data else 'NO'}")
    
    device_breakdown = kpis.get('device_hourly_breakdown', {})
    print(f"\n=== DEVICE BREAKDOWN ===")
    for dev_id, hours in device_breakdown.items():
        print(f"\nDevice {dev_id.split('_')[-1]}: {len(hours)} hours")
        if hours:
            h = hours[0]
            print(f"  First hour:")
            print(f"    DA Dispatch:    {h.get('da_dispatched_mwh', 'N/A')} MWh")
            print(f"    ID Dispatch:    {h.get('id_dispatched_mwh', 'N/A')} MWh")
            print(f"    Total Dispatch: {h.get('total_dispatched_mwh', 'N/A')} MWh")
            print(f"    Actual:         {h.get('actual_mwh', 'N/A')} MWh")
            print(f"    Imbalance:      {h.get('imbalance_mwh', 'N/A')} MWh")
    
    hourly = kpis.get('hourly_breakdown', [])
    print(f"\n=== HOURLY BREAKDOWN ({len(hourly)} hours) ===")
    for i, h in enumerate(hourly[:3]):
        print(f"Hour {i}: {h.get('hour_label', 'N/A')} - SMP: {h.get('smp', 0)} ZAR/MWh - Dispatch: {h.get('dispatched_mwh', 0):.2f} MWh")
