#!/usr/bin/env python3
"""
Analyse Debug Report Round 1: Capacity vs Dispatch vs Actual
"""

print("=" * 80)
print("ANALYSE: ROUND 1 - COAL PLANT (600 MW CAPACITY)")
print("=" * 80)
print()

# Data from debug report
data = [
    {"hour": 0, "offered": 258.07, "dispatched": 258.07, "co2_dispatched": 579.33},
    {"hour": 1, "offered": 342.64, "dispatched": 342.64, "co2_dispatched": 660.42},
    {"hour": 2, "offered": 478.27, "dispatched": 478.27, "co2_dispatched": 792.55},
    {"hour": 3, "offered": 662.98, "dispatched": 662.98, "co2_dispatched": 977.26},
    {"hour": 4, "offered": 780.98, "dispatched": 780.98, "co2_dispatched": 1017.98},
    {"hour": 5, "offered": 800.00, "dispatched": 800.00, "co2_dispatched": 1003.95},
]

capacity = 600  # MW

print("COAL PLANT ANALYSIS:")
print("Capacity: 600 MW")
print()
print("| Hour | Offered (MW) | Dispatched (MW) | CO2-Dispatched (MWh) | Over Capacity? |")
print("|------|--------------|-----------------|----------------------|----------------|")

for d in data:
    over = "YES ❌" if d["dispatched"] > capacity else "NO ✓"
    print(f"| {d['hour']:4d} | {d['offered']:12.2f} | {d['dispatched']:15.2f} | {d['co2_dispatched']:20.2f} | {over:14s} |")

print()
print("KEY OBSERVATIONS:")
print("-" * 80)
print()
print("1. Hours 3-5: Offered/Dispatched EXCEED 600 MW capacity")
print("   - Hour 3: 662.98 MW dispatched (110.5% of capacity)")
print("   - Hour 4: 780.98 MW dispatched (130.2% of capacity)")
print("   - Hour 5: 800.00 MW dispatched (133.3% of capacity)")
print()
print("2. CO2-Dispatched shows CUMULATIVE values (MWh over time)")
print("   - Not actual hourly delivery!")
print("   - Cumulative pattern: 579 → 660 → 792 → 977 → 1017 → 1003")
print()
print("3. IMBALANCE from report:")
print("   - Hour 3: -96.15 MWh @ 800 ZAR/MWh = 76,920 ZAR penalty")
print("   - Hour 4: -16.02 MWh @ 800 ZAR/MWh = 12,820 ZAR penalty")
print("   - Hour 5: +72.73 MWh @ 1200 ZAR/MWh = 87,281 ZAR penalty")
print("   Total Imbalance Cost: 255,413 ZAR")
print()
print("4. CURTAILMENT COST: 473,156 ZAR")
print("   - Formula: (planned - dispatched + grid_curtailment) × SMP")
print("   - This is the opportunity cost of NOT selling more")
print()
print("=" * 80)
print("PROBLEM IDENTIFIED:")
print("=" * 80)
print()
print("❌ Market Clearing does NOT check device capacity!")
print()
print("   The auction accepts bids up to 800 MW even though:")
print("   - Device capacity is only 600 MW")
print("   - Physical delivery is limited")
print("   - Player pays heavy imbalance penalties")
print()
print("EXPECTED BEHAVIOR:")
print("✓ Market clearing should cap dispatch at device capacity (600 MW)")
print("✓ Over-bidding should be rejected or partially filled")
print("✓ Player should not be penalized for physical limits")
print()
