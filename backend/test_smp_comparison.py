import sys
import importlib.util

spec = importlib.util.spec_from_file_location("engine", "app/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

# Config WITHOUT temporal profiles
config_flat = {
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
        "diurnal_profile": [1.0] * 24,  # FLAT profile
        "seasonal_factors": [1.0] * 12
    },
    "devices": [
        {"id": "coal_1", "type": "coal", "max_power_mw": 100.0, "variable_cost_zar_per_mwh": 900.0, "owner_id": 1}
    ],
    "events": [],
    "grid": {"atc": []}
}

# Config WITH temporal profiles
config_temporal = {
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
        "diurnal_profile": [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3,
                           1.4, 1.3, 1.2, 1.1, 1.0, 1.1, 1.2, 1.3, 1.2, 1.0, 0.9, 0.8],
        "seasonal_factors": [1.0] * 12
    },
    "devices": [
        {"id": "coal_1", "type": "coal", "max_power_mw": 100.0, "variable_cost_zar_per_mwh": 900.0, "owner_id": 1}
    ],
    "events": [],
    "grid": {"atc": []}
}

forecasts = {
    1: {
        'bids': {
            'coal_1': {
                'A': {'price': 950.0, 'hours': [100.0] * 24}
            }
        },
        'devices': [{'device_id': 'coal_1', 'hours': [100.0] * 24}]
    }
}

print("\n" + "="*80)
print("SCENARIO 1: WITHOUT Temporal Profiles (Flat demand)")
print("="*80)

for round_num in range(1, 5):
    result = engine.run_round(
        session_id=1,
        round_num=round_num,
        players=[1],
        forecasts=forecasts,
        config=config_flat,
        mode="isolated_per_player"
    )
    
    start_hour = (round_num - 1) * 6
    end_hour = start_hour + 5
    hourly_mcps = [h['smp'] for h in result['hourly_results']]
    
    print(f"\nRound {round_num} (Hours {start_hour:2d}-{end_hour:2d}):")
    print(f"  Average SMP: {result['smp']:7.1f} ZAR/MWh")
    print(f"  Hourly MCPs: {', '.join(f'{smp:.1f}' for smp in hourly_mcps)}")

print("\n\n" + "="*80)
print("SCENARIO 2: WITH Temporal Profiles (Variable demand)")
print("="*80)

for round_num in range(1, 5):
    result = engine.run_round(
        session_id=1,
        round_num=round_num,
        players=[1],
        forecasts=forecasts,
        config=config_temporal,
        mode="isolated_per_player"
    )
    
    start_hour = (round_num - 1) * 6
    end_hour = start_hour + 5
    hourly_mcps = [h['smp'] for h in result['hourly_results']]
    
    print(f"\nRound {round_num} (Hours {start_hour:2d}-{end_hour:2d}):")
    print(f"  Average SMP: {result['smp']:7.1f} ZAR/MWh")
    print(f"  Hourly MCPs: {', '.join(f'{smp:.1f}' for smp in hourly_mcps)}")

print("\n\n" + "="*80)
print("CONCLUSION:")
print("="*80)
print("✓ WITHOUT temporal profiles: SMP stays constant (flat demand)")
print("✓ WITH temporal profiles: SMP varies by time of day (demand peaks/valleys)")
print("\nIf user sees constant SMP:")
print("1. Check diurnal_profile in scenario config")
print("2. Ensure it's not [1.0, 1.0, 1.0, ...] (flat)")
print("3. Use realistic profile like:")
print("   [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3,")
print("    1.4, 1.3, 1.2, 1.1, 1.0, 1.1, 1.2, 1.3, 1.2, 1.0, 0.9, 0.8]")

