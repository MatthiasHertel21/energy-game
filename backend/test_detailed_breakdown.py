import sys
import importlib.util
import json

spec = importlib.util.spec_from_file_location("engine", "app/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

config = {
    "general": {
        "round_span_hours": 6,
        "start_time": "00:00",
        "fake_date": "2025-06-15"
    },
    "market": {
        "base_price": 1000,
        "base_volume_mwh": 10000,
        "price_floor": -500,
        "price_cap": 5000,
        "enable_player_bidding": True
    },
    "environment": {
        "actual_noise_pct": 0,
        "diurnal_profile": [1.0] * 24,
        "seasonal_factors": [1.0] * 12
    },
    "devices": [
        {"id": "solar_1", "type": "solar", "max_power_mw": 100.0, "variable_cost_zar_per_mwh": 0.0, "owner_id": 1}
    ],
    "events": [],
    "grid": {"atc": []}
}

forecasts = {
    1: {
        'bids': {
            'solar_1': {
                'A': {'price': 50.0, 'hours': [100.0] * 24}
            }
        },
        'devices': [{'device_id': 'solar_1', 'hours': [100.0] * 24}]
    }
}

print("\n=== Detailed Hourly Breakdown Test ===")
print("Solar bids 100 MW constant during night (hours 0-5)")

result = engine.run_round(
    session_id=1,
    round_num=1,
    players=[1],
    forecasts=forecasts,
    config=config,
    mode="isolated_per_player"
)

kpis = result['round_kpis'][1]
print(f"\nRound Summary:")
print(f"  Total Planned:      {kpis['planned_mwh']:8.1f} MWh")
print(f"  Total Dispatched:   {kpis['dispatched_mwh']:8.1f} MWh")
print(f"  Total Actual:       {kpis['actual_mwh']:8.1f} MWh")
print(f"  Total Revenue:      {kpis['revenue_zar']:12,.0f} ZAR")
print(f"  Total Imbalance:    {kpis['imbalance_cost_zar']:12,.0f} ZAR")
print(f"  Total Curtailment:  {kpis['curtailment_cost_zar']:12,.0f} ZAR")
print(f"  Total Profit:       {kpis['profit_zar']:12,.0f} ZAR")

print(f"\n{'='*120}")
print(f"{'Hour':<6} {'MCP':>8} {'Planned':>9} {'Dispatch':>9} {'Actual':>9} {'Imbal.':>9} {'Revenue':>12} {'Imbal.Cost':>12} {'Curtail':>9}")
print(f"{'':>6} {'ZAR/MWh':>8} {'MW':>9} {'MW':>9} {'MW':>9} {'MWh':>9} {'ZAR':>12} {'ZAR':>12} {'Cost ZAR':>9}")
print(f"{'='*120}")

total_revenue = 0
total_imb_cost = 0
total_curt_cost = 0

for hour_data in kpis['hourly_breakdown']:
    total_revenue += hour_data['revenue_zar']
    total_imb_cost += hour_data['imbalance_cost_zar']
    total_curt_cost += hour_data['curtailment_cost_zar']
    
    print(f"{hour_data['hour']:6d} {hour_data['mcp']:8.1f} {hour_data['planned_mw']:9.1f} "
          f"{hour_data['dispatched_mw']:9.1f} {hour_data['actual_mw']:9.1f} "
          f"{hour_data['imbalance_mwh']:9.1f} {hour_data['revenue_zar']:12,.0f} "
          f"{hour_data['imbalance_cost_zar']:12,.0f} {hour_data['curtailment_cost_zar']:9,.0f}")

print(f"{'='*120}")
print(f"{'TOTAL':>6} {' ':>8} {' ':>9} {' ':>9} {' ':>9} {' ':>9} "
      f"{total_revenue:12,.0f} {total_imb_cost:12,.0f} {total_curt_cost:9,.0f}")

print(f"\n\nVerification:")
print(f"  Sum of hourly revenue:     {total_revenue:12,.0f} ZAR")
print(f"  Round KPI revenue:         {kpis['revenue_zar']:12,.0f} ZAR")
print(f"  Match: {'✓' if abs(total_revenue - kpis['revenue_zar']) < 1 else '✗'}")
print(f"\n  Sum of hourly imbalance:   {total_imb_cost:12,.0f} ZAR")
print(f"  Round KPI imbalance:       {kpis['imbalance_cost_zar']:12,.0f} ZAR")
print(f"  Match: {'✓' if abs(total_imb_cost - kpis['imbalance_cost_zar']) < 1 else '✗'}")

print("\n\nJSON Export Sample (first 2 hours):")
print(json.dumps(kpis['hourly_breakdown'][:2], indent=2))

