#!/usr/bin/env python3
"""Debug script to check market structure calculation"""

import sys
import os

# Add backend to path
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

# Import just the functions we need (avoid loading Flask app)
import importlib.util
spec = importlib.util.spec_from_file_location("engine", os.path.join(backend_path, 'app', 'engine.py'))
engine = importlib.util.module_from_spec(spec)
sys.modules['engine'] = engine
spec.loader.exec_module(engine)

generate_curves_from_config = engine.generate_curves_from_config
clear_market = engine.clear_market

# Load a sample scenario config
sample_config = {
    "market": {
        "base_price": 1000,
        "base_volume_mwh": 20000,
        "price_floor": -500,
        "price_cap": 5000,
        "generator_mix": {"coal": 300, "gas": 150, "pv": 250, "wind": 200, "hydro": 100},
        "consumer_mix": {"industrial": 400, "household": 500, "agriculture": 100}
    },
    "environment": {
        "seed": "test123"
    }
}

print("=" * 80)
print("MARKET STRUCTURE DEBUG")
print("=" * 80)

# Generate curves
supply, demand = generate_curves_from_config(sample_config, seed="test123", hour_of_day=12, month_of_year=6)

print(f"\nSupply curve ({len(supply)} steps):")
print("Price (ZAR/MWh) | Volume (MWh)")
for i, (price, volume) in enumerate(supply[:5]):
    print(f"  {price:7.1f} | {volume:8.1f}")
print(f"  ... ({len(supply) - 10} more)")
for i, (price, volume) in enumerate(supply[-5:]):
    print(f"  {price:7.1f} | {volume:8.1f}")

print(f"\nDemand curve ({len(demand)} steps):")
print("Price (ZAR/MWh) | Volume (MWh)")
for i, (price, volume) in enumerate(demand[:5]):
    print(f"  {price:7.1f} | {volume:8.1f}")
print(f"  ... ({len(demand) - 10} more)")
for i, (price, volume) in enumerate(demand[-5:]):
    print(f"  {price:7.1f} | {volume:8.1f}")

# Clear market
smp, volume = clear_market(supply, demand, price_floor=-500, price_cap=5000)

print(f"\nMarket Clearing:")
print(f"  SMP: {smp:.2f} ZAR/MWh")
print(f"  Volume: {volume:.2f} MWh")

# Check monotonicity
supply_prices = [p for p, v in supply]
demand_prices = [p for p, v in demand]

supply_monotonic = all(supply_prices[i] <= supply_prices[i+1] for i in range(len(supply_prices)-1))
demand_monotonic = all(demand_prices[i] >= demand_prices[i+1] for i in range(len(demand_prices)-1))

print(f"\nMonotonicity check:")
print(f"  Supply ascending: {supply_monotonic}")
print(f"  Demand descending: {demand_monotonic}")

if not supply_monotonic:
    print("  ❌ Supply is NOT monotonic!")
if not demand_monotonic:
    print("  ❌ Demand is NOT monotonic!")
if supply_monotonic and demand_monotonic:
    print("  ✅ Both curves are monotonic")

print("\n" + "=" * 80)
