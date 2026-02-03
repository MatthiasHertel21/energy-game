from __future__ import annotations

from typing import List, Tuple, Dict, Optional
import math
import random
import hashlib

try:
    from app.device_types import get_curtailment_priority
except ImportError:
    # Fallback if device_types not available
    def get_curtailment_priority(device: dict) -> int:
        return 2  # default medium priority


def seeded(seed_str: str):
    seed = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % 2**32
    random.seed(seed)


def extract_hour_of_day(hour_idx: int, start_time: str) -> int:
    """Extract hour of day (0-23) from hour_idx and start_time."""
    try:
        start_hour = int(str(start_time).split(":")[0]) % 24
    except Exception:
        start_hour = 0
    return (start_hour + hour_idx) % 24


def extract_month(fake_date: str) -> int:
    """Extract month (1-12) from fake_date string."""
    try:
        month = int(str(fake_date).split("-")[1])
        return max(1, min(12, month))
    except Exception:
        return 1


# Realistic availability profiles for renewable energy sources
# Based on typical patterns: Solar peaks at midday, Wind more variable
SOLAR_AVAILABILITY = [0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.15, 0.35, 0.6, 0.78, 0.9, 0.92, 
                      0.9, 0.78, 0.6, 0.35, 0.15, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

WIND_AVAILABILITY = [0.7, 0.72, 0.75, 0.73, 0.7, 0.68, 0.65, 0.6, 0.55, 0.52, 0.5, 0.48,
                     0.47, 0.48, 0.5, 0.55, 0.62, 0.68, 0.73, 0.75, 0.76, 0.75, 0.73, 0.71]


def calculate_realistic_availability(device: dict, hour_of_day: int, config: dict) -> float:
    """
    Calculate realistic availability factor for a device at a given hour.
    
    For renewables (solar/wind): Returns 0.0-1.0 based on time of day
    For other devices: Returns 1.0 (always available)
    
    Args:
        device: Device configuration dict
        hour_of_day: Hour of day (0-23)
        config: Scenario config (for potential weather modifiers)
    
    Returns:
        Availability factor (0.0 = unavailable, 1.0 = fully available)
    """
    device_type = (device.get("type") or "").lower()
    
    # Solar: Zero at night, peaks at midday
    if device_type == "solar":
        return SOLAR_AVAILABILITY[hour_of_day % 24]
    
    # Wind: Variable but always some availability
    if device_type == "wind":
        return WIND_AVAILABILITY[hour_of_day % 24]
    
    # All other devices (coal, gas, hydro, nuclear, storage, loads): fully available
    return 1.0


def clear_market(supply: List[Tuple[float, float]], demand: List[Tuple[float, float]],
                 price_floor: float = -500.0, price_cap: float = 5000.0) -> Tuple[float, float]:
    # supply: list of (price, volume) ascending price
    # demand: list of (price, volume) descending price (WTP)
    s = sorted(supply, key=lambda x: x[0])
    d = sorted(demand, key=lambda x: x[0], reverse=True)

    i = j = 0
    cum_s = cum_d = 0.0
    smp = 0.0
    marginal_supply_price = 0.0  # Track the last supply price that was dispatched
    
    while i < len(s) and j < len(d):
        p_s, v_s = s[i]
        p_d, v_d = d[j]
        if p_s <= p_d:
            # market clears at this price level
            take = min(v_s, v_d)
            cum_s += take
            cum_d += take
            v_s -= take
            v_d -= take
            # Set SMP to the supply price of the marginal unit (uniform pricing)
            marginal_supply_price = p_s
            if abs(v_s) < 1e-9:
                i += 1
            else:
                s[i] = (p_s, v_s)
            if abs(v_d) < 1e-9:
                j += 1
            else:
                d[j] = (p_d, v_d)
        else:
            # no overlap at this step; advance the cheaper side
            i += 1

    smp = marginal_supply_price
    price = max(price_floor, min(price_cap, smp))
    vol = round(min(cum_s, cum_d), 3)
    return round(price, 1), vol


def _avg_variability(cfg: dict) -> Tuple[float, float]:
    """Return average capacity and marginal cost variability (as fractions 0..1) from player_types config."""
    pts = cfg.get("player_types") or []
    if not pts:
        return 0.0, 0.0
    cap = 0.0
    mc = 0.0
    n = 0
    for pt in pts:
        cap += max(0.0, float(pt.get("capacity_variability_pct", 0.0)))
        mc += max(0.0, float(pt.get("marginal_cost_variability_pct", 0.0)))
        n += 1
    if n == 0:
        return 0.0, 0.0
    return cap / n / 100.0, mc / n / 100.0


def generate_curves_from_config(cfg: dict, seed: Optional[str] = None, hour_of_day: Optional[int] = None, month_of_year: Optional[int] = None) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
    """
    Step-wise supply and demand curves around base points influenced by config.
    Adds seed-based jitter based on average variability across player types.
    Now supports device-specific availability/load profiles (hourly and seasonal).
    
    Args:
        cfg: Scenario configuration
        seed: Random seed for reproducibility
        hour_of_day: Hour (0-23) for applying device hourly profiles, None = use average
        month_of_year: Month (1-12) for applying device seasonal profiles, None = use average
    
    Returns:
        Tuple of (supply_curve, demand_curve)
    """
    market = cfg.get("market", {})
    base_price = float(market.get("base_price", 1000))
    base_vol = float(market.get("base_volume_mwh", 20000))
    steps = 20

    # Seed for reproducibility
    # Priority: explicit seed argument > cfg.environment.seed > default "preview"
    env_seed = seed if seed is not None else (cfg.get("environment", {}) or {}).get("seed") or "preview"
    seeded(str(env_seed))

    cap_var, mc_var = _avg_variability(cfg)  # 0..1

    # Build device-weighted profiles from generator_mix and consumer_mix
    supply_profile_factor = 1.0
    supply_seasonal_factor = 1.0
    demand_profile_factor = 1.0
    demand_seasonal_factor = 1.0
    
    if hour_of_day is not None:
        # Get profiles from generator_mix (market-level, not player devices)
        gen_mix = market.get("generator_mix", {})
        if gen_mix:
            # Default profiles by type (from DEVICE_SPECS)
            DEFAULT_GEN_PROFILES = {
                "coal": [1.0] * 24,
                "nuclear": [1.0] * 24,
                "gas": [0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.0, 1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8],
                "hydro": [0.7, 0.7, 0.7, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.7],
                "solar": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.4, 0.7, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.7, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                "pv": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.4, 0.7, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.7, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                "wind": [0.6, 0.65, 0.7, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.4, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.85, 0.8, 0.75, 0.7],
            }
            
            total_blocks = 0
            weighted_avail = 0.0
            for gen_type, value in gen_mix.items():
                # Support both old format (number) and new format (dict with blocks/profile/seasonal_profile)
                if isinstance(value, dict):
                    blocks = float(value.get("blocks", 0))
                    profile = value.get("profile") or DEFAULT_GEN_PROFILES.get(gen_type.lower(), [1.0] * 24)
                else:
                    blocks = float(value or 0)
                    profile = DEFAULT_GEN_PROFILES.get(gen_type.lower(), [1.0] * 24)
                
                if blocks > 0:
                    avail = profile[hour_of_day % len(profile)] if profile else 1.0
                    weighted_avail += blocks * avail
                    total_blocks += blocks
            
            if total_blocks > 0:
                supply_profile_factor = weighted_avail / total_blocks
    
    if month_of_year is not None:
        # Apply seasonal profiles from generator_mix
        gen_mix = market.get("generator_mix", {})
        if gen_mix:
            total_blocks = 0
            weighted_seasonal = 0.0
            for gen_type, value in gen_mix.items():
                if isinstance(value, dict):
                    blocks = float(value.get("blocks", 0))
                    seasonal_profile = value.get("seasonal_profile") or [1.0] * 12
                else:
                    blocks = float(value or 0)
                    seasonal_profile = [1.0] * 12
                
                if blocks > 0:
                    seasonal_factor = seasonal_profile[(month_of_year - 1) % len(seasonal_profile)] if seasonal_profile else 1.0
                    weighted_seasonal += blocks * seasonal_factor
                    total_blocks += blocks
            
            if total_blocks > 0:
                supply_seasonal_factor = weighted_seasonal / total_blocks
    
    if hour_of_day is not None:
        # Get profiles from consumer_mix
        cons_mix = market.get("consumer_mix", {})
        if cons_mix:
            DEFAULT_CONS_PROFILES = {
                "industrial": [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95],
                "household": [0.6, 0.6, 0.6, 0.6, 0.6, 0.65, 0.75, 0.85, 0.9, 0.85, 0.8, 0.75, 0.75, 0.75, 0.8, 0.85, 0.9, 1.0, 1.0, 0.95, 0.9, 0.85, 0.75, 0.7],
                "residential": [0.6, 0.6, 0.6, 0.6, 0.6, 0.65, 0.75, 0.85, 0.9, 0.85, 0.8, 0.75, 0.75, 0.75, 0.8, 0.85, 0.9, 1.0, 1.0, 0.95, 0.9, 0.85, 0.75, 0.7],
                "commercial": [0.3, 0.3, 0.3, 0.3, 0.4, 0.6, 0.8, 0.95, 1.0, 1.0, 1.0, 1.0, 0.95, 0.95, 1.0, 1.0, 0.95, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.3],
                "agriculture": [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95],
            }
            
            total_blocks = 0
            weighted_load = 0.0
            for cons_type, value in cons_mix.items():
                if isinstance(value, dict):
                    blocks = float(value.get("blocks", 0))
                    profile = value.get("profile") or DEFAULT_CONS_PROFILES.get(cons_type.lower(), [1.0] * 24)
                else:
                    blocks = float(value or 0)
                    profile = DEFAULT_CONS_PROFILES.get(cons_type.lower(), [1.0] * 24)
                
                if blocks > 0:
                    load_factor = profile[hour_of_day % len(profile)] if profile else 1.0
                    weighted_load += blocks * load_factor
                    total_blocks += blocks
            
            if total_blocks > 0:
                demand_profile_factor = weighted_load / total_blocks
    
    if month_of_year is not None:
        # Apply seasonal profiles from consumer_mix
        cons_mix = market.get("consumer_mix", {})
        if cons_mix:
            total_blocks = 0
            weighted_seasonal = 0.0
            for cons_type, value in cons_mix.items():
                if isinstance(value, dict):
                    blocks = float(value.get("blocks", 0))
                    seasonal_profile = value.get("seasonal_profile") or [1.0] * 12
                else:
                    blocks = float(value or 0)
                    seasonal_profile = [1.0] * 12
                
                if blocks > 0:
                    seasonal_factor = seasonal_profile[(month_of_year - 1) % len(seasonal_profile)] if seasonal_profile else 1.0
                    weighted_seasonal += blocks * seasonal_factor
                    total_blocks += blocks
            
            if total_blocks > 0:
                demand_seasonal_factor = weighted_seasonal / total_blocks

    supply: List[Tuple[float, float]] = []
    demand: List[Tuple[float, float]] = []
    for i in range(steps):
        # Base price ladder
        p_s = base_price - 400 + i * (800 / max(1, steps - 1))
        p_d = base_price + 400 - i * (800 / max(1, steps - 1))
        # Apply marginal cost variability as price jitter proportionally to ladder span
        if mc_var > 0:
            jitter_s = (random.uniform(-mc_var, mc_var)) * 50.0
            jitter_d = (random.uniform(-mc_var, mc_var)) * 50.0
            p_s = p_s + jitter_s
            p_d = p_d + jitter_d
        # Base volume per step
        v = base_vol / steps
        # Apply capacity variability as volume jitter
        if cap_var > 0:
            v = max(0.0, v * (1.0 + random.uniform(-cap_var, cap_var)))
        
        # Apply device-specific profiles (both hourly and seasonal)
        supply.append((p_s, v * supply_profile_factor * supply_seasonal_factor))
        demand.append((p_d, v * demand_profile_factor * demand_seasonal_factor))
    
    # Ensure strict monotonicity: sort supply ascending, demand descending by price
    supply = sorted(supply, key=lambda x: x[0])
    demand = sorted(demand, key=lambda x: x[0], reverse=True)
    
    return supply, demand


def build_supply_from_bids(player_forecasts: Dict[int, dict], hour_idx: int, 
                           synthetic_supply: List[Tuple[float, float]], 
                           config: dict, round_events: list = None) -> Tuple[List[Tuple[float, float]], List[dict]]:
    """
    Merge player bids with synthetic supply curve for market clearing.
    Includes both multi-bid devices (3 lots) and classic devices (implicit single bid at marginal cost).
    
    Args:
        player_forecasts: Dict of {player_id: forecast_data_with_bids}
        hour_idx: Hour index within the round (0-based)
        synthetic_supply: Base supply curve from config
        config: Scenario configuration
        round_events: List of active events for this round (optional)
    
    Returns:
        Tuple of (combined_supply_curve, bid_metadata_list)
    """
    # Check if global bidding setting is enabled (campaign-wide)
    global_bidding_enabled = config.get("market", {}).get("enable_player_bidding", False)
    
    # Build device map for quick lookup
    # Device-level enable_multi_bid: If set, overrides global for that device
    # - True: Device uses 3 lots (A/B/C) in bidding
    # - False/None: Device uses implicit single bid at marginal cost (CLASSIC)
    devices = {d['id']: d for d in config.get('devices', [])}
    
    supply_bids = []
    
    # Collect all player device bids for this hour
    for player_id, forecast_data in player_forecasts.items():
        bids_data = forecast_data.get('bids', {})
        devices_data = forecast_data.get('devices', [])
        
        # Build a set of device IDs from all sources
        device_ids_from_bids = set(bids_data.keys()) if bids_data else set()
        
        # Get device IDs from forecast devices data
        if isinstance(devices_data, list):
            device_ids_from_forecast = {d.get('device_id') for d in devices_data if d.get('device_id')}
        elif isinstance(devices_data, dict):
            device_ids_from_forecast = set(devices_data.keys())
        else:
            device_ids_from_forecast = set()
        
        # Process all devices (from either bids or forecasts)
        all_device_ids = device_ids_from_bids | device_ids_from_forecast
        
        for device_id in all_device_ids:
            device = devices.get(device_id, {})
            device_type = device.get('type', '').lower()
            
            # Skip consumer devices (loads) - they belong in demand curve, not supply
            if 'load' in device_type:
                continue
            
            # Check if any event affects this device's capacity
            capacity_multiplier = 1.0
            if round_events:
                for event in round_events:
                    event_target = event.get("target", "all")
                    event_target_id = str(event.get("target_id", "")).lower()
                    
                    # Check if event should be applied
                    apply_event = False
                    
                    if event_target == "all":
                        apply_event = True
                    elif event_target == "device":
                        # Check if event targets this specific device
                        if event_target_id == str(device_id).lower():
                            apply_event = True
                        # Check if event targets this device type
                        elif event_target_id == device_type:
                            apply_event = True
                    elif event_target == "player":
                        # Check if event targets this player
                        if event_target_id == str(player_id).lower():
                            apply_event = True
                    # Note: zone filtering would require zone info per device
                    
                    if apply_event:
                        capacity_multiplier *= float(event.get("multiplier", 1.0))
            
            device_bidding_enabled = device.get('enable_multi_bid')
            
            # Use device-level setting if specified, otherwise fall back to global
            if device_bidding_enabled is None:
                device_bidding_enabled = global_bidding_enabled
            
            # Multi-bid enabled: use 3 lots (A/B/C)
            if device_bidding_enabled and device_id in device_ids_from_bids:
                device_bids = bids_data.get(device_id, {})
                for bid_label in ['A', 'B', 'C']:
                    if bid_label not in device_bids:
                        continue
                    
                    bid = device_bids[bid_label]
                    hours = bid.get('hours', [])
                    if hour_idx >= len(hours):
                        continue
                    
                    quantity = float(hours[hour_idx]) * capacity_multiplier
                    price = float(bid.get('price', 0))
                    
                    if quantity > 0:
                        supply_bids.append({
                            'price': price,
                            'quantity': quantity,
                            'player_id': player_id,
                            'device_id': device_id,
                            'bid_label': bid_label
                        })
            else:
                # Classic device: use forecast quantity at marginal cost
                # Get device-level forecast from the devices array
                if isinstance(devices_data, dict):
                    device_forecast = devices_data.get(device_id, [])
                elif isinstance(devices_data, list):
                    # List format: [{"device_id": "...", "hours": [...]}]
                    device_entry = next((d for d in devices_data if d.get('device_id') == device_id), None)
                    device_forecast = device_entry.get('hours', []) if device_entry else []
                else:
                    device_forecast = []
                
                if not device_forecast or hour_idx >= len(device_forecast):
                    continue
                
                quantity = float(device_forecast[hour_idx]) * capacity_multiplier
                price = float(device.get('cost_per_mwh_zar', 0))
                
                if quantity > 0:
                    supply_bids.append({
                        'price': price,
                        'quantity': quantity,
                        'player_id': player_id,
                        'device_id': device_id,
                        'bid_label': 'CLASSIC'  # Marker for implicit bids
                    })
    
    # Sort supply_bids by price (merit order - ascending)
    supply_bids = sorted(supply_bids, key=lambda x: x['price'])
    
    # Merge player bids with synthetic supply
    combined_supply = []
    
    # Add synthetic supply steps
    for price, quantity in synthetic_supply:
        combined_supply.append((price, quantity))
    
    # Add sorted player bids
    for bid in supply_bids:
        combined_supply.append((bid['price'], bid['quantity']))
    
    # Sort combined supply by price (merit order - ascending)
    combined_supply = sorted(combined_supply, key=lambda x: x[0])
    
    return combined_supply, supply_bids


def build_demand_from_bids(player_forecasts: Dict[int, dict], hour_idx: int,
                           synthetic_demand: List[Tuple[float, float]],
                           config: dict, round_events: list = None) -> Tuple[List[Tuple[float, float]], List[dict]]:
    """
    Merge player demand bids with synthetic demand curve for market clearing.
    Includes both multi-bid consumer devices (3 lots with WTP) and classic consumer devices (implicit WTP).
    
    Args:
        player_forecasts: Dict of {player_id: forecast_data_with_bids}
        hour_idx: Hour index within the round (0-based)
        synthetic_demand: Base demand curve from config
        config: Scenario configuration
        round_events: List of active events for this round (optional)
    
    Returns:
        Tuple of (combined_demand_curve, bid_metadata_list)
    """
    # Check if global bidding setting is enabled (campaign-wide)
    global_bidding_enabled = config.get("market", {}).get("enable_player_bidding", False)
    
    # Build device map for quick lookup
    # Device-level enable_multi_bid: If set, overrides global for that device
    # - True: Device uses 3 lots (A/B/C) in bidding
    # - False/None: Device uses implicit single bid at marginal cost (CLASSIC)
    devices = {d['id']: d for d in config.get('devices', [])}
    
    demand_bids = []
    
    # Collect all player consumer device bids for this hour
    for player_id, forecast_data in player_forecasts.items():
        bids_data = forecast_data.get('bids', {})
        devices_data = forecast_data.get('devices', [])
        
        # Build a set of device IDs from all sources
        device_ids_from_bids = set(bids_data.keys()) if bids_data else set()
        
        # Get device IDs from forecast devices data
        if isinstance(devices_data, list):
            device_ids_from_forecast = {d.get('device_id') for d in devices_data if d.get('device_id')}
        elif isinstance(devices_data, dict):
            device_ids_from_forecast = set(devices_data.keys())
        else:
            device_ids_from_forecast = set()
        
        # Process all devices (from either bids or forecasts)
        all_device_ids = device_ids_from_bids | device_ids_from_forecast
        
        for device_id in all_device_ids:
            device = devices.get(device_id, {})
            device_type = device.get('type', '').lower()
            
            # Skip non-consumer devices
            if 'load' not in device_type:
                continue
            
            # Check if any event affects this device's capacity
            capacity_multiplier = 1.0
            if round_events:
                for event in round_events:
                    event_target = event.get("target", "all")
                    event_target_id = str(event.get("target_id", "")).lower()
                    
                    # Check if event should be applied
                    apply_event = False
                    
                    if event_target == "all":
                        apply_event = True
                    elif event_target == "device":
                        # Check if event targets this specific device
                        if event_target_id == str(device_id).lower():
                            apply_event = True
                        # Check if event targets this device type
                        elif event_target_id == device_type:
                            apply_event = True
                    elif event_target == "player":
                        # Check if event targets this player
                        if event_target_id == str(player_id).lower():
                            apply_event = True
                    # Note: zone filtering would require zone info per device
                    
                    if apply_event:
                        capacity_multiplier *= float(event.get("multiplier", 1.0))
            
            device_bidding_enabled = device.get('enable_multi_bid')
            
            # Use device-level setting if specified, otherwise fall back to global
            if device_bidding_enabled is None:
                device_bidding_enabled = global_bidding_enabled
            
            # Multi-bid enabled: use 3 lots (A/B/C) with willingness-to-pay
            if device_bidding_enabled and device_id in device_ids_from_bids:
                device_bids = bids_data.get(device_id, {})
                for bid_label in ['A', 'B', 'C']:
                    if bid_label not in device_bids:
                        continue
                    
                    bid = device_bids[bid_label]
                    hours = bid.get('hours', [])
                    if hour_idx >= len(hours):
                        continue
                    
                    quantity = float(hours[hour_idx]) * capacity_multiplier
                    price = float(bid.get('price', 0))  # Willingness-to-pay
                    
                    if quantity > 0:
                        demand_bids.append({
                            'price': price,
                            'quantity': quantity,
                            'player_id': player_id,
                            'device_id': device_id,
                            'bid_label': bid_label
                        })
            else:
                # Classic consumer device: use forecast quantity at implicit WTP
                if isinstance(devices_data, dict):
                    device_forecast = devices_data.get(device_id, [])
                elif isinstance(devices_data, list):
                    # List format: [{"device_id": "...", "hours": [...]}]
                    device_entry = next((d for d in devices_data if d.get('device_id') == device_id), None)
                    device_forecast = device_entry.get('hours', []) if device_entry else []
                else:
                    device_forecast = []
                
                if not device_forecast or hour_idx >= len(device_forecast):
                    continue
                
                quantity = float(device_forecast[hour_idx]) * capacity_multiplier
                # Use value_of_lost_load as max price consumer is willing to pay
                # Lower default (1500) to prevent consumers from buying at any price
                price = float(device.get('value_of_lost_load', device.get('willingness_to_pay', 1500)))
                
                if quantity > 0:
                    demand_bids.append({
                        'price': price,
                        'quantity': quantity,
                        'player_id': player_id,
                        'device_id': device_id,
                        'bid_label': 'CLASSIC'  # Marker for implicit bids
                    })
    
    # Sort demand_bids by price (descending - highest WTP first)
    demand_bids = sorted(demand_bids, key=lambda x: x['price'], reverse=True)
    
    # DEBUG: Log demand bid prices
    print(f"[DEMAND_DEBUG] Sorted demand_bids ({len(demand_bids)} bids):")
    for i, bid in enumerate(demand_bids[:10]):  # First 10
        print(f"  #{i}: price={bid['price']:.1f}, qty={bid['quantity']:.1f}, player={bid['player_id']}, device={bid['device_id']}, lot={bid['bid_label']}")
    
    # Merge player bids with synthetic demand
    combined_demand = []
    
    # Add synthetic demand steps
    for price, quantity in synthetic_demand:
        combined_demand.append((price, quantity))
    
    # Add sorted player demand bids
    for bid in demand_bids:
        combined_demand.append((bid['price'], bid['quantity']))
    
    # Sort combined demand by price (descending - highest WTP first)
    combined_demand = sorted(combined_demand, key=lambda x: x[0], reverse=True)
    
    return combined_demand, demand_bids


def track_bid_dispatch(supply_bids: List[dict], smp: float, volume: float, 
                       synthetic_supply: List[Tuple[float, float]]) -> Dict[int, Dict[str, Dict[str, dict]]]:
    """
    Track which player bids were dispatched during market clearing.
    
    Args:
        supply_bids: List of bid metadata from build_supply_from_bids
        smp: Market clearing price
        volume: Total cleared volume
        synthetic_supply: Synthetic supply curve
    
    Returns:
        Dict of {player_id: {device_id: {bid_label: dispatch_info}}}
    """
    # Sort all supply (synthetic + bids) by price
    all_supply = [(p, q, None, None, None) for p, q in synthetic_supply]  # (price, qty, player, device, label)
    for bid in supply_bids:
        all_supply.append((bid['price'], bid['quantity'], bid['player_id'], bid['device_id'], bid['bid_label']))
    
    all_supply = sorted(all_supply, key=lambda x: x[0])
    
    # Initialize dispatch tracking with ALL bids (including 0% dispatched)
    dispatch_tracking = {}
    for bid in supply_bids:
        player_id = bid['player_id']
        device_id = bid['device_id']
        bid_label = bid['bid_label']
        
        if player_id not in dispatch_tracking:
            dispatch_tracking[player_id] = {}
        if device_id not in dispatch_tracking[player_id]:
            dispatch_tracking[player_id][device_id] = {}
        
        dispatch_tracking[player_id][device_id][bid_label] = {
            'mw_offered': bid['quantity'],
            'mw_dispatched': 0.0,  # Will be updated if dispatched
            'price_bid': bid['price'],
            'smp': smp
        }
    
    # Simulate dispatch
    remaining_demand = volume
    
    for price, quantity, player_id, device_id, bid_label in all_supply:
        if remaining_demand <= 0:
            break
        
        if price > smp:
            break  # Too expensive
        
        if player_id is None:
            # Synthetic supply, skip tracking
            dispatched = min(quantity, remaining_demand)
            remaining_demand -= dispatched
            continue
        
        # Player bid - update dispatched amount (already initialized above)
        dispatched = min(quantity, remaining_demand)
        remaining_demand -= dispatched
        
        dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = round(dispatched, 3)
    
    return dispatch_tracking


def track_demand_dispatch(demand_bids: List[dict], smp: float, volume: float,
                          synthetic_demand: List[Tuple[float, float]]) -> Dict[int, Dict[str, Dict[str, dict]]]:
    """
    Track which consumer bids were served during market clearing.
    
    Args:
        demand_bids: List of demand bid metadata from build_demand_from_bids
        smp: Market clearing price
        volume: Total cleared volume
        synthetic_demand: Synthetic demand curve
    
    Returns:
        Dict of {player_id: {device_id: {bid_label: dispatch_info}}}
    """
    # Sort all demand (synthetic + bids) by price (descending - highest WTP first)
    all_demand = [(p, q, None, None, None) for p, q in synthetic_demand]  # (price, qty, player, device, label)
    for bid in demand_bids:
        all_demand.append((bid['price'], bid['quantity'], bid['player_id'], bid['device_id'], bid['bid_label']))
    
    all_demand = sorted(all_demand, key=lambda x: x[0], reverse=True)
    
    print(f"[DEMAND_DISPATCH_DEBUG] SMP={smp:.1f}, volume={volume:.1f}, total_demand_bids={len(all_demand)}")
    
    # Initialize dispatch tracking with ALL bids (including 0% dispatched)
    dispatch_tracking = {}
    for bid in demand_bids:
        player_id = bid['player_id']
        device_id = bid['device_id']
        bid_label = bid['bid_label']
        
        if player_id not in dispatch_tracking:
            dispatch_tracking[player_id] = {}
        if device_id not in dispatch_tracking[player_id]:
            dispatch_tracking[player_id][device_id] = {}
        
        dispatch_tracking[player_id][device_id][bid_label] = {
            'mw_offered': bid['quantity'],
            'mw_dispatched': 0.0,  # Will be updated if dispatched
            'price_bid': bid['price'],
            'smp': smp
        }
    
    # Dispatch consumer bids based on willingness-to-pay vs SMP
    # Note: We don't track remaining_supply because player bids compete with synthetic demand
    # in market clearing, but for tracking purposes we only check if their WTP >= SMP
    
    for idx, (price, quantity, player_id, device_id, bid_label) in enumerate(all_demand):
        if price < smp:
            print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: price {price:.1f} < smp {smp:.1f}, not served")
            # Don't break - continue checking other bids (they might have higher prices)
            if player_id is not None:
                # Mark as not served
                dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = 0.0
            continue
        
        if player_id is None:
            # Synthetic demand, skip tracking
            print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Synthetic demand, price={price:.1f}, qty={quantity:.1f}, served")
            continue
        
        # Player consumer bid with WTP >= SMP - fully served
        print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Player {player_id}, device={device_id}, lot={bid_label}, price={price:.1f} >= smp {smp:.1f}, qty={quantity:.1f}, SERVED")
        
        dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = round(quantity, 3)
    
    return dispatch_tracking


def apply_events(price: float, volume: float, events: list[dict], player_id: str = None, zone: int = None, device_type: str = None) -> Tuple[float, float]:
    """
    Apply events to price and volume.
    
    Events are filtered by target:
    - target='all': Always applied
    - target='zone': Applied if zone matches target_id
    - target='player': Applied if player_id matches target_id
    - target='device': Applied if device_type matches target_id
    
    Type determines calculation method:
    - type='systemic': Uses multiplier (applied first)
    - Other types: Uses additive (applied second)
    """
    mul = 1.0
    add_v = 0.0
    
    for e in events or []:
        # Check target filtering
        target = e.get("target", "all")
        target_id = e.get("target_id", "")
        
        # Skip if target doesn't match
        if target == "zone" and zone is not None and str(zone) != str(target_id):
            continue
        if target == "player" and player_id is not None and str(player_id) != str(target_id):
            continue
        if target == "device" and device_type is not None and str(device_type) != str(target_id):
            continue
        # target='all' always applies
        
        # Apply event
        t = e.get("type", "systemic")
        if t == "systemic":
            mul *= float(e.get("multiplier", 1.0))
        else:
            add_v += float(e.get("additive", 0.0))
    
    return price * mul, max(0.0, volume + add_v)


def select_events_for_round(events: list[dict], round_num: int) -> list[dict]:
    """
    Filter the configured events to those active for the given round.
    Rules:
      - trigger_type == 'round': active if round_num in [start, start+duration-1],
        where start = trigger_value (default 1), duration_rounds default 1
      - trigger_type == 'prob': deterministic activation per round using a hash of
        (round_num, event key/name). Active if hash_float < trigger_value (0..1)
      - otherwise: include (backward compatibility)
    """
    active: list[dict] = []
    for e in events or []:
        trig = (e.get("trigger_type") or "round").strip().lower()
        if trig == "round":
            try:
                start = int(e.get("trigger_value", 1))
            except Exception:
                start = 1
            try:
                dur = int(e.get("duration_rounds", 1))
            except Exception:
                dur = 1
            if start <= round_num <= (start + max(1, dur) - 1):
                active.append(e)
        elif trig == "prob":
            try:
                p = float(e.get("trigger_value", 0.0))
            except Exception:
                p = 0.0
            key = e.get("key") or e.get("name") or "event"
            h = int(hashlib.sha256(f"event_prob_{round_num}_{key}".encode()).hexdigest(), 16)
            # map to [0,1)
            r = (h % 1000000) / 1000000.0
            if r < max(0.0, min(1.0, p)):
                active.append(e)
        else:
            # unknown/legacy → include
            active.append(e)
    return active


def preview_from_config(cfg: dict, seed: str = "preview", round_num: int | None = None, hour_of_day: int | None = None, month_of_year: int | None = None) -> dict:
    # use provided seed consistently across generation
    seeded(seed)
    supply, demand = generate_curves_from_config(cfg, seed=seed, hour_of_day=hour_of_day, month_of_year=month_of_year)
    price, vol = clear_market(supply, demand,
                              price_floor=cfg.get("market", {}).get("price_floor", -500),
                              price_cap=cfg.get("market", {}).get("price_cap", 5000))
    events = cfg.get("events", [])
    if round_num is not None:
        events = select_events_for_round(events, int(round_num))
    price, vol = apply_events(price, vol, events)
    return {"smp": round(price, 1), "volume": round(vol, 3)}


# Additional S2 features (simplified implementations)

def compute_idm_delta(da_hours: List[float], updated_forecast: List[float]) -> List[float]:
    return [u - d for d, u in zip(da_hours, updated_forecast)]


def settle_balancing(planned: float, actual: float, up_price: float = 1200.0, down_price: float = 800.0) -> float:
    imbalance = actual - planned
    if imbalance > 0:
        return round(imbalance * up_price, 0)
    else:
        return round(abs(imbalance) * down_price, 0)


def apply_grid(volume: float, atc: List[List[float]], losses: float = 0.02, devices: Optional[List[dict]] = None) -> Tuple[float, float]:
    """
    Return (curtailed_mwh, congestion_revenue_zar_per_mwh_equiv)
    
    If devices are provided, curtailment follows priority order:
    - Priority 1 (Solar/Wind/Loads) curtailed first
    - Priority 2 (Gas/Hydro/Battery) curtailed second
    - Priority 3 (Coal) curtailed third
    - Priority 4 (Nuclear) curtailed last (base load)
    
    Simplified: Sum of all ATC off-diagonals is total transferable cap.
    If planned volume > effective cap -> curtailment = diff, congestion revenue proportional to diff.
    """
    if not atc:
        return 0.0, 0.0
    z = len(atc)
    cap = sum(atc[i][j] for i in range(z) for j in range(z) if i != j) * (1.0 - losses)
    if cap <= 0:
        return round(volume, 3), 0.0
    if volume <= cap:
        return 0.0, 0.0
    
    curtailment_needed = max(0.0, volume - cap)
    
    # If devices provided, apply priority-based curtailment
    if devices:
        # Sort devices by priority (1=first, 4=last)
        sorted_devices = sorted(devices, key=lambda d: get_curtailment_priority(d))
        
        # For MVP, we just validate that devices are sorted correctly
        # Actual per-device curtailment would require per-device dispatch data
        # which is not yet available in the current engine architecture
        # This is a placeholder for future implementation
        pass
    
    # model a per-MWh congestion revenue signal proportional to congestion ratio
    cong_signal = min(1.0, curtailment_needed / max(1.0, volume))
    return round(curtailment_needed, 3), cong_signal


# Global storage model removed; use Battery device at player/device level instead.


def compute_zone_flows(atc: List[List[float]], net_pos: List[float], losses: float = 0.02) -> Tuple[List[float], List[float]]:
    """
    Given ATC matrix and per-zone net positions (+export / -import), compute
    curtailed export per zone and a simple congestion signal per zone.
    Returns (curtailed_by_zone, congestion_signal_by_zone [0..1]).
    Simplified: cap_out[i] = sum_j ATC[i][j]*(1-losses), curtailed[i] = max(0, export_i - cap_out[i]).
    Congestion signal = curtailed/export if export>0 else 0.
    """
    if not atc:
        z = len(net_pos)
        return [0.0]*z, [0.0]*z
    z = len(net_pos)
    cap_out = [sum(atc[i][j] for j in range(z) if i!=j)*(1.0-losses) for i in range(z)]
    curtailed = []
    signal = []
    for i in range(z):
        export_i = max(0.0, net_pos[i])
        curt = max(0.0, export_i - cap_out[i])
        curtailed.append(round(curt,3))
        sig = (curt/export_i) if export_i>0 else 0.0
        signal.append(sig)
    return curtailed, signal


def run_round(session_id: int, round_num: int, players: List[int], forecasts: Dict[int, dict], config: dict, mode: str = "isolated_per_player", seed: Optional[str] = None) -> dict:
    """
    Compute basic market results for a round with hourly market clearing.
    
    Args:
        forecasts: Dict of {player_id: forecast_data}
                  forecast_data can be:
                    - List[float] (legacy: quantity-only)
                    - Dict with 'hours' and optional 'bids' keys
    
    Returns:
        Dict with smp, volume, round_kpis, hourly_results, and optionally bid_dispatch
    """
    span = int(config.get("general", {}).get("round_span_hours", 6))
    base_idx = (round_num - 1) * span
    
    # Normalize forecasts to dict format
    normalized_forecasts = {}
    for pid, forecast in forecasts.items():
        if isinstance(forecast, list):
            # Legacy format: just quantities
            normalized_forecasts[pid] = {'hours': forecast, 'bids': None}
        elif isinstance(forecast, dict):
            normalized_forecasts[pid] = forecast
        else:
            normalized_forecasts[pid] = {'hours': [], 'bids': None}
    
    # Check if multi-bid pricing is enabled (campaign-wide setting)
    # NOTE: This controls the MARKET CLEARING MECHANISM (bid-based vs synthetic)
    # Device-level enable_multi_bid controls INPUT/UI only (3 lots vs 1 implicit bid)
    enable_bidding = config.get("market", {}).get("enable_player_bidding", False)
    print(f"[HOURLY_DEBUG] Engine started: enable_bidding={enable_bidding}")
    
    # Apply only events active for this round
    round_events = select_events_for_round(config.get("events", []), round_num)
    
    # Extract time information for device-specific profiles
    start_time = config.get("general", {}).get("start_time", "00:00")
    fake_date = config.get("general", {}).get("fake_date", "2025-01-01")
    month = extract_month(fake_date)
    
    # Initialize aggregators for round-level results
    hourly_results = []
    bid_dispatch_tracking = {}
    
    # Per-player aggregators
    per_player_planned = {pid: 0.0 for pid in players}
    per_player_dispatched = {pid: 0.0 for pid in players}
    per_player_actual = {pid: 0.0 for pid in players}
    per_player_revenue = {pid: 0.0 for pid in players}
    per_player_variable_cost = {pid: 0.0 for pid in players}  # NEW: Track variable/fuel costs
    per_player_imbalance_cost = {pid: 0.0 for pid in players}
    per_player_curtailment_cost = {pid: 0.0 for pid in players}
    per_player_congestion_revenue = {pid: 0.0 for pid in players}
    
    # Per-device hourly tracking for detailed breakdown
    per_device_hourly_planned = {}
    per_device_hourly_dispatched = {}
    per_device_hourly_actual = {}
    
    # Configurable actual vs forecast deviation (pct)
    try:
        noise_pct = float((config.get("environment", {}) or {}).get("actual_noise_pct", 5))
    except Exception:
        noise_pct = 5.0
    frac = max(0.0, min(1.0, noise_pct / 100.0))
    
    # HOURLY MARKET CLEARING: Loop over each hour in the round
    for hour_offset in range(span):
        hour_idx = base_idx + hour_offset
        
        # Calculate hour of day for device-specific profiles
        hour_of_day = extract_hour_of_day(hour_idx, start_time)
        
        # Generate supply/demand curves with device-specific hourly and seasonal profiles
        synthetic_supply, synthetic_demand = generate_curves_from_config(
            config, 
            seed=seed, 
            hour_of_day=hour_of_day, 
            month_of_year=month
        )
        
        # Build supply and demand curves for this specific hour
        if enable_bidding:
            supply, supply_bids = build_supply_from_bids(normalized_forecasts, hour_idx, synthetic_supply, config, round_events)
            demand, demand_bids = build_demand_from_bids(normalized_forecasts, hour_idx, synthetic_demand, config, round_events)
        else:
            supply = synthetic_supply
            supply_bids = []
            demand = synthetic_demand
            demand_bids = []
        
        # Market clearing for this hour
        price, vol = clear_market(supply, demand,
                                  price_floor=config.get("market", {}).get("price_floor", -500),
                                  price_cap=config.get("market", {}).get("price_cap", 5000))
        
        # Apply events to this hour's price and volume
        price, vol = apply_events(price, vol, round_events)
        
        # Track bid dispatch for this hour
        hour_bid_dispatch = {}
        if enable_bidding and (supply_bids or demand_bids):
            hour_bid_dispatch = track_bid_dispatch(supply_bids, price, vol, synthetic_supply)
            demand_dispatch = track_demand_dispatch(demand_bids, price, vol, synthetic_demand)
            
            # Merge demand dispatch
            for player_id, devices in demand_dispatch.items():
                if player_id not in hour_bid_dispatch:
                    hour_bid_dispatch[player_id] = {}
                for device_id, lots in devices.items():
                    if device_id not in hour_bid_dispatch[player_id]:
                        hour_bid_dispatch[player_id][device_id] = {}
                    hour_bid_dispatch[player_id][device_id].update(lots)
        
        # Calculate per-player quantities for this hour
        hour_plans = {}
        total_planned = 0.0
        
        for pid in players:
            forecast_data = normalized_forecasts.get(pid, {})
            h = forecast_data.get('hours', [])
            
            if enable_bidding and forecast_data.get('bids'):
                # Sum all bids for this player for this hour
                planned = 0.0
                for device_id, device_bids in forecast_data['bids'].items():
                    for bid_label in ['A', 'B', 'C']:
                        if bid_label in device_bids:
                            bid_hours = device_bids[bid_label].get('hours', [])
                            if hour_idx < len(bid_hours):
                                planned += float(bid_hours[hour_idx])
            else:
                # Legacy: use hours array
                if hour_idx < len(h):
                    planned = float(h[hour_idx])
                else:
                    planned = 0.0
            
            hour_plans[pid] = planned
            total_planned += planned
        
        dispatch_factor = 1.0
        if mode == "shared_market" and total_planned > 0:
            # pro-rata dispatch if planned exceeds market volume
            dispatch_factor = min(1.0, vol / total_planned)
        
        # Calculate per-player KPIs for this hour
        for pid in players:
            planned = hour_plans.get(pid, 0.0)
            
            # Get device config early (needed for capacity capping)
            devices_cfg = config.get("devices", [])
            
            # Track per-device planned/dispatched/actual for detailed breakdown
            # For bid-based dispatch, calculate planned and dispatched per device
            if enable_bidding:
                dispatched = 0.0
                device_forecast = normalized_forecasts.get(pid, {})
                device_bids_all = device_forecast.get('bids', {})
                
                if hour_offset == 0:  # Log once
                    print(f"[HOURLY_DEBUG] Player {pid}, hour_offset={hour_offset}: enable_bidding={enable_bidding}, has_device_forecast={bool(device_forecast)}, device_bids_all={device_bids_all}")
                
                # Get device IDs from bids (this is the authoritative source for player's devices)
                if device_bids_all:
                    if hour_offset == 0:  # Log once per round
                        print(f"[HOURLY_DEBUG] Player {pid}: Found {len(device_bids_all)} devices with bids")
                        print(f"[HOURLY_DEBUG] Device IDs: {list(device_bids_all.keys())}")
                    
                    for device_id in device_bids_all.keys():
                        # Initialize device tracking if needed
                        if device_id not in per_device_hourly_planned:
                            per_device_hourly_planned[device_id] = [0.0] * span
                            per_device_hourly_dispatched[device_id] = [0.0] * span
                            per_device_hourly_actual[device_id] = [0.0] * span
                            print(f"[HOURLY_DEBUG] Initialized tracking for device {device_id}")
                        
                        # Calculate planned from bids (sum of all lots for this hour)
                        device_bids = device_bids_all.get(device_id, {})
                        device_planned_h = 0.0
                        for bid_label in ['A', 'B', 'C']:
                            if bid_label in device_bids:
                                bid_hours = device_bids[bid_label].get('hours', [])
                                if hour_idx < len(bid_hours):
                                    device_planned_h += float(bid_hours[hour_idx])
                        
                        # Cap planned at device max_power (over-bidding allowed but capped)
                        device_cfg = next((d for d in devices_cfg if d.get('id') == device_id), None)
                        if device_cfg:
                            max_power = device_cfg.get('max_power_mw') or device_cfg.get('capacity_mw') or float('inf')
                            if device_planned_h > max_power:
                                if hour_offset == 0:  # Log once
                                    print(f"[CAPACITY_CAP] Device {device_id}: planned {device_planned_h:.1f} MW capped to max_power {max_power:.1f} MW")
                                device_planned_h = max_power
                        
                        per_device_hourly_planned[device_id][hour_offset] = device_planned_h
                        if hour_offset == 0:  # Log first hour
                            print(f"[HOURLY_DEBUG] Device {device_id}, hour {hour_offset}: planned={device_planned_h}")
                        
                        # Get dispatched from hour_bid_dispatch (if exists)
                        device_dispatched_h = 0.0
                        if pid in hour_bid_dispatch and device_id in hour_bid_dispatch[pid]:
                            device_dispatch = hour_bid_dispatch[pid][device_id]
                            device_dispatched_h = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        per_device_hourly_dispatched[device_id][hour_offset] = device_dispatched_h
                        dispatched += device_dispatched_h
            else:
                dispatched = planned * dispatch_factor
            
            # Determine if player is consumer or generator
            # Check devices from bid dispatch (devices_cfg already loaded above)
            is_consumer = False
            
            # Get player's device IDs from bid dispatch or forecasts
            player_device_ids = set()
            if enable_bidding and pid in hour_bid_dispatch:
                player_device_ids = set(hour_bid_dispatch[pid].keys())
            elif pid in normalized_forecasts:
                forecast_data = normalized_forecasts[pid]
                if 'bids' in forecast_data and forecast_data['bids'] is not None:
                    player_device_ids = set(forecast_data['bids'].keys())
            
            # Check if any of these devices are consumers (loads)
            for device_id in player_device_ids:
                device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                if device and 'load' in device.get('type', '').lower():
                    is_consumer = True
                    break
            
            # Apply realistic availability envelope per device
            # This enforces physical constraints (e.g., solar = 0 at night)
            # NOTE: Only for GENERATORS! Consumers don't have availability constraints.
            actual_before_envelope = dispatched
            
            if is_consumer:
                # Consumers: actual = dispatched with consumption noise
                # No availability envelope for demand side, but consumption varies
                if dispatched <= 0:
                    actual = 0.0
                else:
                    noise = random.uniform(-frac, frac) * max(1.0, dispatched)
                    actual = max(0.0, dispatched + noise)
                
                # Track consumer actual per device for hourly breakdown
                if enable_bidding and pid in hour_bid_dispatch:
                    # Distribute actual proportionally to each consumer device
                    total_dispatched = dispatched
                    for device_id, device_dispatch in hour_bid_dispatch[pid].items():
                        device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        if total_dispatched > 0:
                            device_actual = actual * (device_dispatched / total_dispatched)
                        else:
                            device_actual = 0.0
                        
                        # Track device actual
                        if device_id in per_device_hourly_actual:
                            per_device_hourly_actual[device_id][hour_offset] = device_actual
            elif enable_bidding and pid in hour_bid_dispatch:
                # Generators: Per-device envelope enforcement for multi-bid mode
                actual_constrained = 0.0
                for device_id, device_dispatch in hour_bid_dispatch[pid].items():
                    device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                    if device:
                        device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        availability = calculate_realistic_availability(device, hour_of_day, config)
                        max_available = device_dispatched * availability
                        device_actual = min(device_dispatched, max_available)
                        
                        actual_constrained += device_actual
                actual = actual_constrained
            else:
                # Generators: For aggregate mode, apply weighted average availability
                # (Conservative: use minimum availability of any renewable in config)
                min_availability = 1.0
                for device in devices_cfg:
                    avail = calculate_realistic_availability(device, hour_of_day, config)
                    if avail < min_availability:
                        min_availability = avail
                max_available = dispatched * min_availability
                actual = min(dispatched, max_available)
            
            # Add noise on top of envelope-constrained actual (only for generators - consumers already have noise)
            if not is_consumer:
                noise = random.uniform(-frac, frac) * max(1.0, actual)
                actual = max(0.0, actual + noise)
                
                # Update per-device actual with noise applied (proportionally)
                if enable_bidding and pid in hour_bid_dispatch:
                    for device_id, device_dispatch in hour_bid_dispatch[pid].items():
                        device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        if actual_constrained > 0:
                            # Proportionally distribute actual (with noise) to each device
                            device_actual_with_noise = actual * (device_dispatched / dispatched) if dispatched > 0 else 0.0
                        else:
                            device_actual_with_noise = 0.0
                        
                        # Track device actual with noise applied
                        if device_id in per_device_hourly_actual:
                            per_device_hourly_actual[device_id][hour_offset] = device_actual_with_noise
            
            # Revenue/Expense: Uniform SMP for all dispatched MWh
            # Generators earn revenue (positive), Consumers pay expenses (negative)
            if is_consumer:
                revenue = -round(dispatched * price, 0)  # Negative = expense
            else:
                revenue = round(dispatched * price, 0)  # Positive = revenue
            
            # Variable costs: Calculate fuel/operational costs for generators
            variable_cost = 0.0
            if not is_consumer and enable_bidding and pid in hour_bid_dispatch:
                # Calculate variable costs per device based on what was dispatched
                for device_id, device_dispatch in hour_bid_dispatch[pid].items():
                    device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                    if device:
                        device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        device_variable_cost = device.get('variable_cost_zar_per_mwh', 0.0)
                        variable_cost += round(device_dispatched * device_variable_cost, 0)
            
            # Imbalance settlement: For both GENERATORS and CONSUMERS
            # Generators: actual != dispatched → imbalance cost/revenue
            # Consumers: actual != dispatched → over/under consumption penalty
            imbalance_cost = settle_balancing(dispatched, actual)
            
            # Curtailment: Only for GENERATORS (planned > dispatched = not sold)
            # Consumers: No curtailment (less demand met = good, not a penalty)
            if is_consumer:
                curtailment_cost = 0  # Consumers have no curtailment
                congestion_revenue = 0  # No congestion for consumers
            else:
                curtailment_amount = max(0.0, planned - dispatched)
                devices = config.get("devices", [])
                curtailed, cong_signal = apply_grid(dispatched, config.get("grid", {}).get("atc", []), devices=devices)
                curtailment_cost = round((curtailment_amount + curtailed) * price, 0)
                congestion_revenue = round(dispatched * price * cong_signal, 0)
            
            # Accumulate hour results to player totals
            per_player_planned[pid] += planned
            per_player_dispatched[pid] += dispatched
            per_player_actual[pid] += actual
            per_player_revenue[pid] += revenue
            per_player_variable_cost[pid] += variable_cost
            per_player_imbalance_cost[pid] += imbalance_cost
            per_player_curtailment_cost[pid] += curtailment_cost
            per_player_congestion_revenue[pid] += congestion_revenue
        
        # Store hourly result
        hourly_results.append({
            "hour_idx": hour_idx,
            "hour_offset": hour_offset,
            "smp": round(price, 1),
            "volume": round(vol, 3),
        })
        
        # Merge hour bid dispatch into overall tracking
        for player_id, devices in hour_bid_dispatch.items():
            if player_id not in bid_dispatch_tracking:
                bid_dispatch_tracking[player_id] = {}
            for device_id, lots in devices.items():
                if device_id not in bid_dispatch_tracking[player_id]:
                    bid_dispatch_tracking[player_id][device_id] = {}
                # For hourly tracking, we need to aggregate or keep separate lots per hour
                # Here we'll merge by summing dispatch quantities and offered quantities
                for bid_label, bid_info in lots.items():
                    if bid_label not in bid_dispatch_tracking[player_id][device_id]:
                        bid_dispatch_tracking[player_id][device_id][bid_label] = {
                            'mw_offered': 0.0,
                            'mw_dispatched': 0.0,
                            'price_bid': bid_info.get('price_bid', 0.0),
                            'smp': bid_info.get('smp', 0.0),
                        }
                    # Accumulate both offered and dispatched quantities over all hours
                    bid_dispatch_tracking[player_id][device_id][bid_label]['mw_offered'] += bid_info.get('mw_offered', 0.0)
                    bid_dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] += bid_info.get('mw_dispatched', 0.0)
    
    # Calculate average SMP and total volume across all hours
    avg_mcp = sum(h['smp'] for h in hourly_results) / len(hourly_results) if hourly_results else 0.0
    total_volume = sum(h['volume'] for h in hourly_results)
    
    # Debug: Check state before building per-player KPIs
    print(f"[HOURLY_DEBUG] Building KPIs: enable_bidding={enable_bidding}, players={players}, per_device_keys={list(per_device_hourly_planned.keys())}")
    
    # Build per-player round KPIs with detailed breakdown
    per_player = {}
    for pid in players:
        # Profit calculation:
        # - Revenue: Market payment for dispatched energy (negative for consumers = expense)
        # - Variable Cost: Fuel/operational costs for generators (0 for consumers)
        # - Imbalance Cost: Penalty for deviation from dispatch
        # - Congestion Revenue: Grid congestion payments
        # Note: Curtailment is informational only, already reflected in lower revenue
        profit = (per_player_revenue[pid] - per_player_variable_cost[pid] - 
                  per_player_imbalance_cost[pid] + per_player_congestion_revenue[pid])
        
        # Build detailed hourly breakdown for this player
        hourly_breakdown = []
        for h_idx, hour_result in enumerate(hourly_results):
            hour_detail = {
                "hour": hour_result["hour_idx"],
                "smp": hour_result["smp"],
                "planned_mw": 0.0,
                "dispatched_mw": 0.0,
                "actual_mw": 0.0,
                "revenue_zar": 0.0,
                "imbalance_mwh": 0.0,
                "imbalance_cost_zar": 0.0,
                "curtailment_mwh": 0.0,
                "curtailment_cost_zar": 0.0,
            }
            
            # Sum contributions from all devices for this player in this hour
            # Get device IDs that we tracked for this player
            # Check if this player has submitted bids
            device_forecast = normalized_forecasts.get(pid, {})
            device_bids_all = device_forecast.get('bids', {})
            
            if device_bids_all:
                # Player submitted bids - use device IDs from bids
                player_device_ids = set(device_bids_all.keys())
                if h_idx == 0:  # Log once for first hour
                    print(f"[HOURLY_DEBUG] Building breakdown for player {pid}, hour {h_idx}: found {len(player_device_ids)} devices with bids")
                    print(f"[HOURLY_DEBUG] Device IDs from bids: {player_device_ids}")
            else:
                # No bids - use config to find player's devices
                devices_cfg = config.get("devices", [])
                player_device_ids = {d["id"] for d in devices_cfg if d.get("owner_id") == pid or d.get("player_id") == pid}
                if h_idx == 0:
                    print(f"[HOURLY_DEBUG] Building breakdown for player {pid}, hour {h_idx}: no bids, found {len(player_device_ids)} devices from config")
            
            if h_idx == 0:
                print(f"[HOURLY_DEBUG] per_device_hourly_planned keys: {list(per_device_hourly_planned.keys())}")
                print(f"[HOURLY_DEBUG] per_device_hourly_dispatched keys: {list(per_device_hourly_dispatched.keys())}")
            
            for dev_id in player_device_ids:
                # Get planned/dispatched/actual for this device in this hour
                planned_h = per_device_hourly_planned.get(dev_id, [0] * config["general"]["round_span_hours"])[h_idx]
                dispatched_h = per_device_hourly_dispatched.get(dev_id, [0] * config["general"]["round_span_hours"])[h_idx]
                actual_h = per_device_hourly_actual.get(dev_id, [0] * config["general"]["round_span_hours"])[h_idx]
                
                if h_idx == 0:  # Log first hour
                    print(f"[HOURLY_DEBUG] Device {dev_id}, hour {h_idx}: planned={planned_h}, dispatched={dispatched_h}, actual={actual_h}")
                
                hour_detail["planned_mw"] += planned_h
                hour_detail["dispatched_mw"] += dispatched_h
                hour_detail["actual_mw"] += actual_h
                
                # Revenue for this hour
                hour_detail["revenue_zar"] += dispatched_h * hour_result["smp"]
                
                # Check if consumer
                # Find device in config to check type
                devices_cfg = config.get("devices", [])
                device_cfg = next((d for d in devices_cfg if d["id"] == dev_id), None)
                is_consumer = device_cfg and 'load' in device_cfg.get('type', '').lower()
                
                # Imbalance calculation using same logic as settle_balancing
                # imbalance = actual - dispatched
                # If actual > dispatched (over-delivery/consumption): up_price = 1200 ZAR/MWh
                # If actual < dispatched (under-delivery/consumption): down_price = 800 ZAR/MWh
                imbalance_h = actual_h - dispatched_h
                if imbalance_h > 0:  # Over-delivery/consumption
                    hour_detail["imbalance_mwh"] += imbalance_h
                    hour_detail["imbalance_cost_zar"] += imbalance_h * 1200  # up_price
                elif imbalance_h < 0:  # Under-delivery/consumption
                    hour_detail["imbalance_mwh"] += abs(imbalance_h)
                    hour_detail["imbalance_cost_zar"] += abs(imbalance_h) * 800  # down_price
                
                if not is_consumer:
                    # Curtailment = planned - dispatched (not sold, informational only)
                    # This shows forgone revenue potential, but is NOT subtracted from profit
                    # because revenue is already based only on dispatched quantity
                    curtailment_h = planned_h - dispatched_h
                    if curtailment_h > 0:
                        hour_detail["curtailment_mwh"] += curtailment_h
                        hour_detail["curtailment_cost_zar"] += curtailment_h * hour_result["smp"]  # Informational: potential revenue
            
            hourly_breakdown.append(hour_detail)
        
        # Debug: Log summary after building all hours
        total_planned = sum(h["planned_mw"] for h in hourly_breakdown)
        total_dispatched = sum(h["dispatched_mw"] for h in hourly_breakdown)
        print(f"[HOURLY_DEBUG] Player {pid} breakdown complete: {len(hourly_breakdown)} hours, total_planned={total_planned:.2f}, total_dispatched={total_dispatched:.2f}")
        
        per_player[pid] = {
            "planned_mwh": round(per_player_planned[pid], 3),
            "dispatched_mwh": round(per_player_dispatched[pid], 3),
            "actual_mwh": round(per_player_actual[pid], 3),
            "revenue_zar": round(per_player_revenue[pid], 0),
            "variable_cost_zar": round(per_player_variable_cost[pid], 0),  # NEW: Fuel/operational costs
            "imbalance_cost_zar": round(per_player_imbalance_cost[pid], 0),
            "curtailment_cost_zar": round(per_player_curtailment_cost[pid], 0),
            "congestion_revenue_zar": round(per_player_congestion_revenue[pid], 0),
            "profit_zar": round(profit, 0),
            "hourly_breakdown": hourly_breakdown,  # NEW: Detailed per-hour breakdown
            "debug_info": {  # DEBUG: Add diagnostic info
                "enable_bidding": enable_bidding,
                "per_device_keys": list(per_device_hourly_planned.keys()),
                "breakdown_hours": len(hourly_breakdown),
                "breakdown_total_planned": total_planned,
                "breakdown_total_dispatched": total_dispatched,
            }
        }

    result = {
        "smp": round(avg_mcp, 1),
        "volume": round(total_volume, 3),
        "round_kpis": per_player,
        "hourly_results": hourly_results,
    }
    
    # Include bid dispatch tracking if bidding was enabled
    if enable_bidding and bid_dispatch_tracking:
        result["bid_dispatch"] = bid_dispatch_tracking
        try:
            current_app.logger.info(f"[ENGINE] Added bid_dispatch to result: {list(bid_dispatch_tracking.keys())}")
        except:
            print(f"[ENGINE] Added bid_dispatch to result: {list(bid_dispatch_tracking.keys())}")
    else:
        try:
            current_app.logger.warning(f"[ENGINE] No bid_dispatch: enable_bidding={enable_bidding}, tracking_empty={not bid_dispatch_tracking}")
        except:
            print(f"[ENGINE] No bid_dispatch: enable_bidding={enable_bidding}, tracking_empty={not bid_dispatch_tracking}")
    
    return result


# ============================================
# CHALLENGE SYSTEM
# ============================================

def detect_player_role(devices: List[dict]) -> str:
    """
    Detect player role based on devices.
    Returns: 'producer', 'consumer', or 'prosumer'
    Prosumer is treated as invalid (must be pure producer or consumer).
    """
    if not devices:
        return 'unknown'
    
    generator_count = 0
    load_count = 0
    
    for device in devices:
        device_type = (device.get('type') or '').lower()
        category = device.get('category', '').lower()
        
        # Infer category from type if not explicitly set
        if not category:
            if device_type in ['coal', 'gas', 'hydro', 'nuclear', 'solar', 'wind', 'pv']:
                category = 'generator'
            elif 'load' in device_type:
                category = 'load'
        
        if category in ['generator', 'renewable']:
            generator_count += 1
        elif category == 'load':
            load_count += 1
        # battery/storage doesn't count
    
    if generator_count > 0 and load_count > 0:
        return 'prosumer'  # Mixed - not allowed
    elif generator_count > 0:
        return 'producer'
    elif load_count > 0:
        return 'consumer'
    else:
        return 'unknown'


def evaluate_challenges(challenges: List[dict], player_kpis: dict, role: str, round_num: int = None, all_round_kpis: List[dict] = None) -> dict:
    """
    Evaluate challenges for a player.
    
    Args:
        challenges: List of challenge definitions from config
        player_kpis: KPIs for current round (from round_kpis)
        role: 'producer' or 'consumer'
        round_num: Current round number (for per_round challenges)
        all_round_kpis: List of all previous round KPIs (for cumulative metrics)
    
    Returns:
        {
            "results": [{"challenge_id": str, "name": str, "passed": bool, "actual": float, "target": float, "points": int}],
            "total_points": int,
            "max_points": int,
            "score": float,
            "passed": bool
        }
    """
    if not challenges:
        return {"results": [], "total_points": 0, "max_points": 0, "score": 100, "passed": True}
    
    results = []
    total_points = 0
    max_points = 0
    all_required_passed = True
    
    # Prepare cumulative KPIs if needed
    cumulative_kpis = {}
    if all_round_kpis:
        # Sum up all rounds
        cumulative_kpis = {
            "total_profit": sum(r.get("profit_zar", 0) for r in all_round_kpis),
            "total_revenue": sum(r.get("revenue_zar", 0) for r in all_round_kpis),
            "total_cost": sum(r.get("variable_cost_zar", 0) + r.get("imbalance_cost_zar", 0) for r in all_round_kpis),
            "total_imbalance": sum(abs(r.get("planned_mwh", 0) - r.get("actual_mwh", 0)) for r in all_round_kpis),
            "total_curtailment": sum(r.get("curtailment_cost_zar", 0) / 1000 for r in all_round_kpis),  # Approximate MWh from cost
            "total_dispatched": sum(r.get("dispatched_mwh", 0) for r in all_round_kpis),
            "avg_profit_per_round": sum(r.get("profit_zar", 0) for r in all_round_kpis) / len(all_round_kpis) if all_round_kpis else 0,
        }
    
    for challenge in challenges:
        challenge_id = challenge.get("id", "challenge_" + str(len(results)))
        name = challenge.get("name", "Challenge")
        metric = challenge.get("metric")
        operator = challenge.get("operator", ">=")
        target = float(challenge.get("target", 0))
        required = challenge.get("required", False)
        points = int(challenge.get("points", 0))
        per_round = challenge.get("per_round", False)
        applicable_to = challenge.get("applicable_to", ["producer", "consumer"])
        
        # Check if challenge applies to this role
        if isinstance(applicable_to, str):
            applicable_to = [applicable_to]
        if "all" not in applicable_to and role not in applicable_to:
            continue  # Skip this challenge
        
        max_points += points
        
        # Get actual value from KPIs
        actual_value = None
        
        # Round-level metrics
        if metric == "round_profit":
            actual_value = player_kpis.get("profit_zar", 0)
        elif metric == "round_revenue":
            actual_value = player_kpis.get("revenue_zar", 0)
        elif metric == "round_cost":
            actual_value = player_kpis.get("variable_cost_zar", 0) + player_kpis.get("imbalance_cost_zar", 0)
        elif metric == "round_imbalance":
            actual_value = abs(player_kpis.get("planned_mwh", 0) - player_kpis.get("actual_mwh", 0))
        elif metric == "round_dispatched":
            actual_value = player_kpis.get("dispatched_mwh", 0)
        
        # Cumulative metrics (require all_round_kpis)
        elif metric in cumulative_kpis:
            actual_value = cumulative_kpis[metric]
        
        # Producer-specific
        elif metric == "curtailment_rate" and role == "producer":
            dispatched = player_kpis.get("dispatched_mwh", 0)
            planned = player_kpis.get("planned_mwh", 1)  # avoid div by zero
            actual_value = max(0, (planned - dispatched) / planned * 100) if planned > 0 else 0
        
        # Consumer-specific
        elif metric == "procurement_cost" and role == "consumer":
            actual_value = player_kpis.get("variable_cost_zar", 0) + player_kpis.get("imbalance_cost_zar", 0)
        elif metric == "demand_coverage" and role == "consumer":
            planned = player_kpis.get("planned_mwh", 1)
            actual = player_kpis.get("actual_mwh", 0)
            actual_value = (actual / planned * 100) if planned > 0 else 0
        
        if actual_value is None:
            # Unknown metric, skip
            continue
        
        # Evaluate condition
        passed = False
        if operator == ">=":
            passed = actual_value >= target
        elif operator == "<=":
            passed = actual_value <= target
        elif operator == "==":
            passed = abs(actual_value - target) < 0.01
        elif operator == "range":
            # target should be [min, max]
            if isinstance(target, list) and len(target) == 2:
                passed = target[0] <= actual_value <= target[1]
        
        # Award points if passed
        earned_points = points if passed else 0
        total_points += earned_points
        
        # Track required challenges
        if required and not passed:
            all_required_passed = False
        
        results.append({
            "challenge_id": challenge_id,
            "name": name,
            "metric": metric,
            "operator": operator,
            "target": target,
            "actual": round(actual_value, 2),
            "passed": passed,
            "required": required,
            "points": earned_points,
            "max_points": points,
            "per_round": per_round
        })
    
    score = (total_points / max_points * 100) if max_points > 0 else 100
    
    return {
        "results": results,
        "total_points": total_points,
        "max_points": max_points,
        "score": round(score, 1),
        "passed": all_required_passed
    }