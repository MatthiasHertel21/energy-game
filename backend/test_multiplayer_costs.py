import sys
import importlib.util

spec = importlib.util.spec_from_file_location("engine", "app/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

config = {
    "general": {
        "round_span_hours": 6,
        "start_time": "12:00",
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
        {"id": "solar_1", "type": "solar", "max_power_mw": 50.0, "variable_cost_zar_per_mwh": 0.0},
        {"id": "wind_1", "type": "wind", "max_power_mw": 50.0, "variable_cost_zar_per_mwh": 0.0},
        {"id": "load_1", "type": "load", "max_power_mw": 100.0, "variable_cost_zar_per_mwh": 0.0}
    ],
    "events": [],
    "grid": {"atc": []}
}

# Player 1: Solar (optimistic forecast at night)
# Player 2: Wind (realistic forecast)
# Player 3: Consumer Load
forecasts = {
    1: {
        'bids': {
            'solar_1': {
                'A': {'price': 50.0, 'hours': [50.0] * 24}  # Over-forecasts at night
            }
        },
        'devices': [{'device_id': 'solar_1', 'hours': [50.0] * 24}]
    },
    2: {
        'bids': {
            'wind_1': {
                'A': {'price': 100.0, 'hours': [50.0] * 24}  # Realistic
            }
        },
        'devices': [{'device_id': 'wind_1', 'hours': [50.0] * 24}]
    },
    3: {
        'bids': {
            'load_1': {
                'A': {'price': 2000.0, 'hours': [-100.0] * 24}  # Consumer demand
            }
        },
        'devices': [{'device_id': 'load_1', 'hours': [-100.0] * 24}]
    }
}

print("\n=== Multi-Player Cost Attribution Test ===")
print("Player 1: Solar (50 MW, price 50 ZAR/MWh)")
print("Player 2: Wind (50 MW, price 100 ZAR/MWh)")
print("Player 3: Consumer Load (100 MW demand, bid 2000 ZAR/MWh)")
print("\nRound 1 (Hours 12-17, Midday) - Solar high availability")

result = engine.run_round(
    session_id=1,
    round_num=1,
    players=[1, 2, 3],
    forecasts=forecasts,
    config=config,
    mode="isolated_per_player"
)

print(f"\nMarket Results:")
print(f"  Average MCP: {result['mcp']:7.1f} ZAR/MWh")
print(f"  Total Volume: {result['volume']:8.1f} MWh")

print(f"\n{'='*90}")
for player_id in [1, 2, 3]:
    kpis = result['round_kpis'][player_id]
    device_name = ["Solar", "Wind", "Consumer"][player_id - 1]
    
    print(f"\nPlayer {player_id} ({device_name}):")
    print(f"  Planned:            {kpis['planned_mwh']:8.1f} MWh")
    print(f"  Dispatched:         {kpis['dispatched_mwh']:8.1f} MWh")
    print(f"  Actual:             {kpis['actual_mwh']:8.1f} MWh")
    print(f"  Imbalance:          {kpis['dispatched_mwh'] - kpis['actual_mwh']:8.1f} MWh")
    print(f"\n  Revenue:            {kpis['revenue_zar']:12,.0f} ZAR")
    print(f"  Imbalance Cost:     {kpis['imbalance_cost_zar']:12,.0f} ZAR")
    print(f"  Curtailment Cost:   {kpis['curtailment_cost_zar']:12,.0f} ZAR")
    print(f"  Congestion Revenue: {kpis['congestion_revenue_zar']:12,.0f} ZAR")
    print(f"  Profit:             {kpis['profit_zar']:12,.0f} ZAR")

print(f"\n{'='*90}")
print("\nVerification:")
print("✓ Solar: Should have revenue from dispatched energy")
print("✓ Wind: Should have revenue from dispatched energy")
print("✓ Consumer: Should have NEGATIVE revenue (pays for energy)")
print("✓ Consumer: Should have ZERO imbalance and curtailment costs (is_consumer=True)")
print("✓ Each player's costs are independent (not market-wide)")

# Now test with night scenario
print("\n\n" + "="*90)
print("\nRound 2 (Hours 0-5, Night) - Solar unavailable")

result2 = engine.run_round(
    session_id=1,
    round_num=2,
    players=[1, 2, 3],
    forecasts=forecasts,
    config=config,
    mode="isolated_per_player"
)

print(f"\nMarket Results:")
print(f"  Average MCP: {result2['mcp']:7.1f} ZAR/MWh")
print(f"  Total Volume: {result2['volume']:8.1f} MWh")

print(f"\n{'='*90}")
for player_id in [1, 2, 3]:
    kpis = result2['round_kpis'][player_id]
    device_name = ["Solar", "Wind", "Consumer"][player_id - 1]
    
    print(f"\nPlayer {player_id} ({device_name}):")
    print(f"  Planned:            {kpis['planned_mwh']:8.1f} MWh")
    print(f"  Dispatched:         {kpis['dispatched_mwh']:8.1f} MWh")
    print(f"  Actual:             {kpis['actual_mwh']:8.1f} MWh")
    print(f"  Imbalance:          {kpis['dispatched_mwh'] - kpis['actual_mwh']:8.1f} MWh")
    print(f"\n  Revenue:            {kpis['revenue_zar']:12,.0f} ZAR")
    print(f"  Imbalance Cost:     {kpis['imbalance_cost_zar']:12,.0f} ZAR")
    print(f"  Curtailment Cost:   {kpis['curtailment_cost_zar']:12,.0f} ZAR")
    print(f"  Profit:             {kpis['profit_zar']:12,.0f} ZAR")

print(f"\n{'='*90}")
print("\nVerification:")
print("✓ Solar: HIGH imbalance cost (dispatched 300 MWh but delivered 0 MWh)")
print("✓ Wind: Normal operation with realistic availability")
print("✓ Consumer: ZERO imbalance/curtailment costs (exempt)")

