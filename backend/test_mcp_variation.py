import sys
import importlib.util

spec = importlib.util.spec_from_file_location("engine", "app/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

config = {
    "general": {
        "round_span_hours": 6,
        "start_time": "00:00",
        "fake_date": "2025-01-15"
    },
    "market": {
        "base_price": 1000,
        "base_volume_mwh": 10000,
        "price_floor": -500,
        "price_cap": 5000,
        "enable_player_bidding": False
    },
    "environment": {
        "actual_noise_pct": 0,
        "diurnal_profile": [0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.95,
                           0.9, 0.95, 1.0, 1.1, 1.2, 1.25, 1.2, 1.1, 1.0, 0.95, 0.9, 0.85],
        "seasonal_factors": [1.1] * 12
    },
    "devices": [],
    "events": [],
    "grid": {"atc": []}
}

forecasts = {1: [100] * 24}

print("\n=== Testing MCP Variation with Temporal Profiles ===")

# Test 4 rounds to see MCP variation
for round_num in range(1, 5):
    result = engine.run_round(
        session_id=1,
        round_num=round_num,
        players=[1],
        forecasts=forecasts,
        config=config,
        mode="isolated_per_player"
    )
    
    base_idx = (round_num - 1) * 6
    hours = [base_idx + i for i in range(6)]
    factors = [config['environment']['diurnal_profile'][h % 24] * 1.1 for h in hours]
    
    print(f"\nRound {round_num} (hours {hours[0]}-{hours[-1]}):")
    print(f"  Temporal factors: {[f'{f:.2f}' for f in factors]}")
    print(f"  MCPs: {[h['mcp'] for h in result['hourly_results']]}")
    print(f"  Average MCP: {result['mcp']:.1f} ZAR/MWh")
    print(f"  Volume: {result['volume']:.1f} MWh")

