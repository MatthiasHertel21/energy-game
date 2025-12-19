import sys
import importlib.util

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
        "actual_noise_pct": 0,  # No noise for clarity
        "diurnal_profile": [1.0] * 24,
        "seasonal_factors": [1.0] * 12
    },
    "devices": [
        {"id": "solar_1", "type": "solar", "max_power_mw": 100.0, "variable_cost_zar_per_mwh": 0.0}
    ],
    "events": [],
    "grid": {"atc": []}
}

# Solar bids 100 MW for all hours (unrealistic at night)
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

print("\n=== Detailed KPI Breakdown Test ===")
print("Solar plant bids 100 MW constant (including night)")

# Round 1: Night hours (0-5) - solar unavailable
result1 = engine.run_round(
    session_id=1,
    round_num=1,
    players=[1],
    forecasts=forecasts,
    config=config,
    mode="isolated_per_player"
)

print(f"\n=== Round 1 (Hours 0-5) - Night ===")
print("\nHourly Breakdown:")
for hr in result1['hourly_results']:
    hour_of_day = hr['hour_idx'] % 24
    avail = engine.SOLAR_AVAILABILITY[hour_of_day]
    print(f"  Hour {hr['hour_idx']:2d}: MCP={hr['mcp']:7.1f} ZAR/MWh, Vol={hr['volume']:7.1f} MWh, Solar Avail={avail:.2f}")

kpis = result1['round_kpis'][1]
print(f"\nRound KPIs:")
print(f"  Planned:     {kpis['planned_mwh']:8.1f} MWh  (6 hours × 100 MW)")
print(f"  Dispatched:  {kpis['dispatched_mwh']:8.1f} MWh  (accepted by market)")
print(f"  Actual:      {kpis['actual_mwh']:8.1f} MWh  (delivered with availability constraint)")
print(f"\nFinancial Breakdown:")
print(f"  Revenue:            {kpis['revenue_zar']:12,.0f} ZAR  (dispatched × MCP)")
print(f"  Imbalance Cost:     {kpis['imbalance_cost_zar']:12,.0f} ZAR  (dispatched - actual) × imbalance_price")
print(f"  Curtailment Cost:   {kpis['curtailment_cost_zar']:12,.0f} ZAR  (planned - dispatched) × MCP")
print(f"  Congestion Revenue: {kpis['congestion_revenue_zar']:12,.0f} ZAR")
print(f"  Profit:             {kpis['profit_zar']:12,.0f} ZAR  (revenue - costs)")

print(f"\nManual Verification:")
avg_mcp = result1['mcp']
dispatched = kpis['dispatched_mwh']
actual = kpis['actual_mwh']
imbalance = dispatched - actual
print(f"  Imbalance: {dispatched:.1f} - {actual:.1f} = {imbalance:.1f} MWh")
print(f"  Expected Imbalance Cost: {imbalance:.1f} × 800 ZAR/MWh = {imbalance * 800:,.0f} ZAR")
print(f"  Actual Imbalance Cost: {kpis['imbalance_cost_zar']:,.0f} ZAR")

# Round 3: Midday hours (12-17) - solar peak
result2 = engine.run_round(
    session_id=1,
    round_num=3,
    players=[1],
    forecasts=forecasts,
    config=config,
    mode="isolated_per_player"
)

print(f"\n\n=== Round 3 (Hours 12-17) - Midday ===")
print("\nHourly Breakdown:")
for hr in result2['hourly_results']:
    hour_of_day = hr['hour_idx'] % 24
    avail = engine.SOLAR_AVAILABILITY[hour_of_day]
    print(f"  Hour {hr['hour_idx']:2d}: MCP={hr['mcp']:7.1f} ZAR/MWh, Vol={hr['volume']:7.1f} MWh, Solar Avail={avail:.2f}")

kpis2 = result2['round_kpis'][1]
print(f"\nRound KPIs:")
print(f"  Planned:     {kpis2['planned_mwh']:8.1f} MWh")
print(f"  Dispatched:  {kpis2['dispatched_mwh']:8.1f} MWh")
print(f"  Actual:      {kpis2['actual_mwh']:8.1f} MWh")
print(f"\nFinancial Breakdown:")
print(f"  Revenue:            {kpis2['revenue_zar']:12,.0f} ZAR")
print(f"  Imbalance Cost:     {kpis2['imbalance_cost_zar']:12,.0f} ZAR")
print(f"  Curtailment Cost:   {kpis2['curtailment_cost_zar']:12,.0f} ZAR")
print(f"  Profit:             {kpis2['profit_zar']:12,.0f} ZAR")

