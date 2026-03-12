"""
Test Data Generator for Energy Game

Generates reproducible, capacity-safe test data for QA and debugging.
- Deterministic (same seed = same data)
- Respects device capacity limits
- Round-aware (only tradeable hours)
- Supports presets: conservative, balanced, aggressive
"""

import random
from typing import Dict, List, Tuple, Any, Optional


BID_LABELS = ["A", "B", "C", "D", "E"]


# Preset configurations
PRESETS = {
    'conservative': {
        'producer_utilization': (0.4, 0.7),  # Min, max utilization
        'consumer_utilization': (0.5, 0.8),
        'price_variance': 0.15,  # ±15% variance from base
        'bid_split': (0.5, 0.3, 0.2),  # A, B, C proportions
        'price_increment': 1.1  # B=A*1.1, C=B*1.1
    },
    'balanced': {
        'producer_utilization': (0.5, 0.9),
        'consumer_utilization': (0.6, 0.95),
        'price_variance': 0.25,
        'bid_split': (0.4, 0.35, 0.25),
        'price_increment': 1.15
    },
    'aggressive': {
        'producer_utilization': (0.7, 1.0),
        'consumer_utilization': (0.8, 1.0),
        'price_variance': 0.4,
        'bid_split': (0.35, 0.35, 0.3),
        'price_increment': 1.2
    }
}


def _get_device_bid_count(device: Dict[str, Any], scenario_config: Dict[str, Any]) -> int:
    if device.get('bid_count') is not None:
        try:
            count = int(device.get('bid_count'))
        except Exception:
            count = 0
        return max(0, min(len(BID_LABELS), count))

    if device.get('enable_multi_bid') is not None:
        return 3 if bool(device.get('enable_multi_bid')) else 0

    legacy_global = scenario_config.get('market', {}).get('enable_player_bidding')
    if legacy_global is None:
        legacy_global = scenario_config.get('general', {}).get('enable_multi_bid', False)
    return 3 if bool(legacy_global) else 0


def generate_test_data(
    devices: List[Dict[str, Any]],
    scenario_config: Dict[str, Any],
    session_id: int,
    round_num: int,
    tradeable_hours: List[int],
    preset: str = 'balanced',
    seed: Optional[int] = None,
    full_horizon: bool = False
) -> Dict[str, Any]:
    """
    Generate reproducible test data for a given round.
    
    Args:
        devices: List of device configurations
        scenario_config: Scenario configuration dict
        session_id: Session ID (used in seed generation)
        round_num: Current round number
        tradeable_hours: List of tradeable hour indices
        preset: 'conservative', 'balanced', or 'aggressive'
        seed: Random seed (if None, generates from session_id + round_num)
        full_horizon: If True, generate for all hours; if False, only tradeable hours
    
    Returns:
        Dict with 'device_hours', 'device_bids', 'aggregate_hours', 'seed_used'
    """
    
    # Initialize random generator with seed
    if seed is None:
        seed = (session_id * 1000 + round_num) % (2**31 - 1)
    
    rng = random.Random(seed)
    
    # Get preset config
    preset_config = PRESETS.get(preset, PRESETS['balanced'])
    
    # Determine which hours to generate
    horizon_hours = scenario_config.get('general', {}).get('forecast_horizon_hours', 48)
    if full_horizon:
        hours_to_generate = list(range(horizon_hours))
    else:
        hours_to_generate = tradeable_hours if tradeable_hours else []
    
    if not hours_to_generate:
        return {
            'device_hours': {},
            'device_bids': {},
            'aggregate_hours': [0.0] * horizon_hours,
            'seed_used': seed,
            'warnings': ['No tradeable hours available']
        }
    
    device_hours = {}
    device_bids = {}
    warnings = []
    
    for device in devices:
        device_id = device.get('id')
        device_type = (device.get('type', '') or '').lower()
        category = (device.get('category', '') or '').lower()
        
        is_consumer = category == 'load' or 'load' in device_type
        is_battery = device_type == 'battery'
        
        # Get effective capacity
        max_capacity = get_device_max_capacity(device)
        
        if max_capacity <= 0:
            warnings.append(f"{device_id}: Zero capacity, skipping")
            continue
        
        # Generate hourly profile
        hourly_values = [0.0] * horizon_hours
        
        for hour_idx in hours_to_generate:
            # Get device pattern modifier
            pattern_value = get_device_pattern(device, hour_idx)
            
            # Select utilization range based on device type
            if is_consumer:
                util_min, util_max = preset_config['consumer_utilization']
            else:
                util_min, util_max = preset_config['producer_utilization']
            
            # Random utilization within range
            utilization = rng.uniform(util_min, util_max)
            
            # Apply pattern (e.g., solar profile, load profile)
            effective_capacity = max_capacity * pattern_value
            
            # Generate value (capacity-safe)
            value = effective_capacity * utilization
            
            # Apply sign for consumers/batteries
            if is_consumer:
                value = abs(value)  # Consumers are positive (demand)
            elif is_battery and rng.random() < 0.3:  # 30% chance battery discharges
                value = -abs(value)  # Negative = discharge
            
            hourly_values[hour_idx] = round(value, 2)
        
        device_hours[device_id] = hourly_values
        
        bid_count = _get_device_bid_count(device, scenario_config)

        # Generate bids if explicit bidding is enabled for this device and device is not consumer
        if bid_count > 0 and not is_consumer:
            device_bids[device_id] = generate_bids(
                device=device,
                hourly_values=hourly_values,
                hours_to_generate=hours_to_generate,
                preset_config=preset_config,
                rng=rng,
                bid_count=bid_count
            )
    
    # Calculate aggregate (sum of all devices)
    aggregate_hours = [0.0] * horizon_hours
    for device_id, hours in device_hours.items():
        for i, val in enumerate(hours):
            aggregate_hours[i] += val
    
    aggregate_hours = [round(v, 2) for v in aggregate_hours]
    
    return {
        'device_hours': device_hours,
        'device_bids': device_bids,
        'aggregate_hours': aggregate_hours,
        'seed_used': seed,
        'preset': preset,
        'full_horizon': full_horizon,
        'hours_generated': len(hours_to_generate),
        'warnings': warnings
    }


def get_device_max_capacity(device: Dict[str, Any]) -> float:
    """Get effective maximum capacity for a device."""
    device_type = (device.get('type', '') or '').lower()
    
    # Try various capacity fields
    capacity = (
        device.get('capacity_mw') or
        device.get('power_rating_mw') or
        device.get('peak_load_mw') or
        device.get('baseline_load_mw') or
        0.0
    )
    
    return float(capacity)


def get_device_pattern(device: Dict[str, Any], hour_idx: int) -> float:
    """
    Get hourly pattern multiplier for device (0.0 to 1.0).
    Simulates realistic profiles (solar, wind, load patterns).
    """
    device_type = (device.get('type', '') or '').lower()
    hour_of_day = hour_idx % 24
    
    # Solar pattern (0 at night, peak at noon)
    if 'solar' in device_type or 'pv' in device_type:
        if hour_of_day < 6 or hour_of_day >= 18:
            return 0.0
        # Bell curve: peak at 12:00
        normalized = (hour_of_day - 6) / 12.0  # 0 to 1
        return max(0.0, -(normalized - 0.5)**2 * 4 + 1.0)  # Inverted parabola
    
    # Wind pattern (variable)
    if 'wind' in device_type:
        # Pseudo-random but deterministic based on hour
        base = 0.5 + 0.3 * ((hour_of_day * 7) % 10) / 10.0
        return min(1.0, base)
    
    # Load pattern (high during day, low at night)
    if 'load' in device_type:
        if 6 <= hour_of_day < 22:
            return 0.7 + 0.3 * ((hour_of_day - 6) % 8) / 8.0
        else:
            return 0.4 + 0.2 * (hour_of_day % 6) / 6.0
    
    # Battery: constant capability
    if device_type == 'battery':
        return 1.0
    
    # Default: relatively flat with slight variation
    return 0.8 + 0.2 * (hour_of_day % 4) / 4.0


def generate_bids(
    device: Dict[str, Any],
    hourly_values: List[float],
    hours_to_generate: List[int],
    preset_config: Dict[str, Any],
    rng: random.Random,
    bid_count: int = 3
) -> Dict[str, Any]:
    """
    Generate bid structure (A-E lots) for a device.
    Ensures bid quantities sum to <= hourly capacity.
    """
    device_type = (device.get('type', '') or '').lower()
    base_cost = device.get('cost_per_mwh_zar', 300)
    
    # Determine base price based on device type
    if 'nuclear' in device_type:
        base_price = 150
    elif 'coal' in device_type:
        base_price = 250
    elif 'gas' in device_type or 'ccgt' in device_type:
        base_price = 400
    elif 'solar' in device_type or 'wind' in device_type:
        base_price = 50
    elif 'hydro' in device_type:
        base_price = 200
    else:
        base_price = float(base_cost)
    
    # Apply price variance
    price_var = preset_config['price_variance']
    price_multiplier = 1.0 + rng.uniform(-price_var, price_var)
    
    bid_count = max(1, min(len(BID_LABELS), int(bid_count or 1)))

    # Calculate lot prices (monotonic: A <= B <= ...)
    increment = preset_config['price_increment']
    lot_prices = []
    current_price = round(base_price * price_multiplier, 1)
    for _ in range(bid_count):
        lot_prices.append(current_price)
        current_price = round(current_price * increment, 1)
    
    split_base = list(preset_config['bid_split'])
    while len(split_base) < bid_count:
        split_base.append(max(split_base[-1] * 0.7, 0.02))
    split_base = split_base[:bid_count]
    split_total = sum(split_base) or 1.0
    split_base = [value / split_total for value in split_base]

    horizon = len(hourly_values)
    lot_hours = {label: [0.0] * horizon for label in BID_LABELS[:bid_count]}
    
    for hour_idx in hours_to_generate:
        total_offered = abs(hourly_values[hour_idx])

        allocated = 0.0
        labels = BID_LABELS[:bid_count]
        for index, label in enumerate(labels):
            if index == len(labels) - 1:
                quantity = round(max(0.0, total_offered - allocated), 2)
            else:
                quantity = round(total_offered * split_base[index], 2)
                allocated += quantity
            lot_hours[label][hour_idx] = quantity

    return {
        label: {'price': lot_prices[index], 'hours': lot_hours[label]}
        for index, label in enumerate(BID_LABELS[:bid_count])
    }


def validate_capacity(
    device_hours: Dict[str, List[float]],
    device_bids: Dict[str, Dict[str, Any]],
    devices: List[Dict[str, Any]],
    tradeable_hours: List[int]
) -> Dict[str, Any]:
    """
    Validate that generated data respects capacity constraints.
    
    Returns:
        Dict with 'valid': bool, 'errors': List[str], 'warnings': List[str]
    """
    errors = []
    warnings = []
    
    for device in devices:
        device_id = device.get('id')
        max_capacity = get_device_max_capacity(device)
        
        if device_id not in device_hours:
            continue
        
        hours = device_hours[device_id]
        
        # Check capacity limits
        for hour_idx in tradeable_hours:
            if hour_idx >= len(hours):
                continue
            
            offered = abs(hours[hour_idx])
            pattern = get_device_pattern(device, hour_idx)
            effective_cap = max_capacity * pattern
            
            if offered > effective_cap + 0.01:  # Small tolerance for rounding
                errors.append(
                    f"{device_id} Hour {hour_idx}: Offered {offered:.2f} MW exceeds "
                    f"effective capacity {effective_cap:.2f} MW"
                )
        
        # Check bid consistency
        if device_id in device_bids:
            bids = device_bids[device_id]
            bid_labels = [label for label in BID_LABELS if label in bids]
            for hour_idx in tradeable_hours:
                if hour_idx >= len(hours):
                    continue
                
                total_bid = sum(
                    (bids.get(label, {}).get('hours', [])[hour_idx] if hour_idx < len(bids.get(label, {}).get('hours', [])) else 0.0)
                    for label in bid_labels
                )
                
                offered = abs(hours[hour_idx])
                
                if abs(total_bid - offered) > 0.01:
                    warnings.append(
                        f"{device_id} Hour {hour_idx}: Bid sum {total_bid:.2f} MW != "
                        f"offered {offered:.2f} MW"
                    )
            
            # Check monotonicity
            for left_label, right_label in zip(bid_labels, bid_labels[1:]):
                left_price = bids.get(left_label, {}).get('price', 0)
                right_price = bids.get(right_label, {}).get('price', 0)
                if left_price > right_price:
                    errors.append(f"{device_id}: Price {left_label} ({left_price}) > Price {right_label} ({right_price})")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }
