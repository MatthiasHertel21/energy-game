from __future__ import annotations

from typing import List, Tuple, Dict, Optional
import math
import random
import hashlib

# Import for DA baseline loading
try:
    from app.models import Forecast
    from app.extensions import db
except ImportError:
    Forecast = None
    db = None

try:
    from app.device_types import get_curtailment_priority
except ImportError:
    # Fallback if device_types not available
    def get_curtailment_priority(device: dict) -> int:
        return 2  # default medium priority


# Linear Congruential Generator (LCG) matching d3.randomLcg
class LCG:
    """
    Linear Congruential Generator matching d3.randomLcg behavior.
    This ensures backend generates identical random sequences to frontend.
    
    d3.randomLcg uses: X_n+1 = (a * X_n) mod m
    where a = 0x5DEECE66D (from java.util.Random) and m = 2^48
    """
    def __init__(self, seed: float):
        # d3.randomLcg expects seed in [0, 1), multiplies by 2^48
        # We use integer seed directly
        self.seed = int(seed) & 0xFFFFFFFFFFFF  # 48-bit mask
        self.a = 0x5DEECE66D
        self.c = 0xB
        self.m = 1 << 48  # 2^48
    
    def random(self) -> float:
        """Return random float in [0, 1)"""
        self.seed = (self.a * self.seed + self.c) % self.m
        return self.seed / self.m


# Global RNG instance
_rng: Optional[LCG] = None


def seeded(seed_str: str):
    """
    Seed RNG using same logic as KSE frontend (ASCII sum mod 2147483647).
    This ensures backend generates identical curves to frontend preview.
    """
    global _rng
    # Match KSE.jsx: const seedNum = seedStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    seed_num = sum(ord(c) for c in seed_str)
    normalized_seed = (seed_num % 2147483647) / 2147483647
    _rng = LCG(normalized_seed * (1 << 48))  # Convert to 48-bit seed


def rng_uniform(low: float = 0.0, high: float = 1.0) -> float:
    """Return random uniform value in [low, high)"""
    global _rng
    if _rng is None:
        seeded("default")
    return low + (_rng.random() * (high - low))


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


def get_mix_profile_factor(mix_entry: dict, hour_of_day: int, month: int) -> float:
    """Return combined hourly/seasonal profile factor from a mix entry."""
    if not isinstance(mix_entry, dict):
        return 1.0
    factor = 1.0
    profile = mix_entry.get("profile")
    if isinstance(profile, list) and len(profile) > 0 and hour_of_day is not None:
        try:
            factor *= float(profile[hour_of_day % len(profile)])
        except Exception:
            pass
    seasonal = mix_entry.get("seasonal_profile")
    if isinstance(seasonal, list) and len(seasonal) > 0 and month is not None:
        try:
            factor *= float(seasonal[(month - 1) % len(seasonal)])
        except Exception:
            pass
    return factor


def calculate_idp(cleared_bids: List[Tuple[float, float]], smp: float, 
                  cap_percent: float = 5.0) -> float:
    """
    Calculate Intra-Day Price (IDP) as volume-weighted average with ±cap% of SMP.
    
    SAWEM Market Code Rev 2.1: IDP is the volume-weighted average of all cleared 
    ID trades, capped at ±5% of the Day-Ahead SMP to prevent extreme deviations.
    
    Args:
        cleared_bids: List of (price, volume) tuples that cleared in ID market
        smp: Day-Ahead System Marginal Price (reference price)
        cap_percent: Maximum deviation from SMP in percent (default 5%)
    
    Returns:
        Intra-Day Price (IDP) in ZAR/MWh
    
    Examples:
        >>> calculate_idp([(450, 100), (460, 50), (440, 50)], smp=450)
        450.0  # (450*100 + 460*50 + 440*50) / 200 = 450
        
        >>> calculate_idp([(500, 100)], smp=450, cap_percent=5)
        472.5  # Capped at 450 * 1.05
    """
    if not cleared_bids:
        return smp  # No ID trades → use DA price
    
    # Calculate volume-weighted average
    total_volume = sum(vol for _, vol in cleared_bids)
    if total_volume == 0:
        return smp
    
    weighted_sum = sum(price * vol for price, vol in cleared_bids)
    vwap = weighted_sum / total_volume
    
    # Apply ±cap_percent constraint
    cap_multiplier = 1 + cap_percent / 100
    min_price = smp / cap_multiplier
    max_price = smp * cap_multiplier
    
    capped_idp = max(min_price, min(max_price, vwap))
    return round(capped_idp, 2)


def clear_market(supply: List[Tuple[float, float]], demand: List[Tuple[float, float]],
                 price_floor: float = -500.0, price_cap: float = 5000.0,
                 supply_metadata: Optional[List[dict]] = None) -> Tuple[float, float]:
    """
    Market clearing with Pro-rata Tie-Breaking and Inflexible Units Filter.
    
    Args:
        supply: List of (price, volume) tuples, ascending price
        demand: List of (price, volume) tuples, descending price (WTP)
        price_floor: Minimum allowed price
        price_cap: Maximum allowed price
        supply_metadata: Optional list of bid metadata for inflexible units filter
    
    Returns:
        Tuple of (price, volume)
    
    Features:
    - Pro-rata allocation when multiple bids have identical price
    - Inflexible units (must-run, at min_load) are skipped for SMP determination
    """
    # supply: list of (price, volume) ascending price
    # demand: list of (price, volume) descending price (WTP)
    s = sorted(supply, key=lambda x: x[0])
    d = sorted(demand, key=lambda x: x[0], reverse=True)

    i = j = 0
    cum_s = cum_d = 0.0
    smp = 0.0
    marginal_supply_price = 0.0  # Track the last supply price that was dispatched
    last_flexible_price = 0.0  # Track last flexible unit price for SMP
    
    while i < len(s) and j < len(d):
        p_s, v_s = s[i]
        p_d, v_d = d[j]
        
        # Check for tie-breaking: multiple supply bids at same price
        if p_s <= p_d:
            # Collect all supply bids at the same price for pro-rata allocation
            tie_bids = [(i, p_s, v_s)]
            k = i + 1
            while k < len(s) and abs(s[k][0] - p_s) < 1e-6:
                tie_bids.append((k, s[k][0], s[k][1]))
                k += 1
            
            # Total volume available at this price level
            total_tie_volume = sum(bid[2] for bid in tie_bids)
            
            # Check if this is a flexible unit (for SMP determination)
            # A unit is inflexible if:
            # 1. It's marked as must_run (Nuclear)
            # 2. It's at minimum load (detected via metadata)
            is_flexible = True
            if supply_metadata and i < len(supply_metadata):
                meta = supply_metadata[i]
                if meta and isinstance(meta, dict):
                    # Check must_run flag (Nuclear is must-run)
                    device_type = meta.get('device_type', '').lower()
                    if device_type == 'nuclear' or meta.get('must_run', False):
                        is_flexible = False
                    # Check if at minimum load
                    if meta.get('at_min_load', False):
                        is_flexible = False
            
            if len(tie_bids) == 1:
                # No tie, normal allocation
                take = min(v_s, v_d)
                cum_s += take
                cum_d += take
                v_s -= take
                v_d -= take
                marginal_supply_price = p_s
                if is_flexible:
                    last_flexible_price = p_s
                
                if abs(v_s) < 1e-9:
                    i += 1
                else:
                    s[i] = (p_s, v_s)
                if abs(v_d) < 1e-9:
                    j += 1
                else:
                    d[j] = (p_d, v_d)
            else:
                # Pro-rata allocation across tied bids
                if total_tie_volume <= v_d:
                    # All tied bids can be satisfied
                    cum_s += total_tie_volume
                    cum_d += total_tie_volume
                    v_d -= total_tie_volume
                    marginal_supply_price = p_s
                    if is_flexible:
                        last_flexible_price = p_s
                    i = k  # Skip all tied bids
                    
                    if abs(v_d) < 1e-9:
                        j += 1
                    else:
                        d[j] = (p_d, v_d)
                else:
                    # Partial allocation pro-rata
                    for bid_idx, bid_price, bid_vol in tie_bids:
                        pro_rata_share = (bid_vol / total_tie_volume) * v_d
                        cum_s += pro_rata_share
                        cum_d += pro_rata_share
                        remaining = bid_vol - pro_rata_share
                        if bid_idx < len(s):
                            s[bid_idx] = (bid_price, remaining)
                    marginal_supply_price = p_s
                    if is_flexible:
                        last_flexible_price = p_s
                    v_d = 0.0
                    j += 1
                    i = k
        else:
            # no overlap at this step; advance the cheaper side
            i += 1

    # Use last flexible unit price for SMP (inflexible units don't set SMP)
    smp = last_flexible_price if last_flexible_price > 0 else marginal_supply_price
    price = max(price_floor, min(price_cap, smp))
    vol = round(min(cum_s, cum_d), 3)
    return round(price, 1), vol


def generate_curves_from_config(cfg: dict, seed: Optional[str] = None, hour_of_day: Optional[int] = None, month_of_year: Optional[int] = None) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
    """
    Step-wise supply and demand curves using detailed Merit Order by generator/consumer type.
    Matches the KSE Market & Preview visualization logic.
    
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
    price_floor = float(market.get("price_floor", -500))
    price_cap = float(market.get("price_cap", 5000))
    
    # Get jitter settings
    cap_jitter = max(0.0, min(0.5, float(market.get("random_capacity_pct", 0)) / 100.0))
    price_jitter = max(0.0, min(0.5, float(market.get("random_price_pct", 0)) / 100.0))

    # Seed for reproducibility
    # Include temporal context so each hour can produce different (but deterministic) curve samples.
    env_seed = seed if seed is not None else (cfg.get("environment", {}) or {}).get("seed") or "preview"
    seed_key = f"{env_seed}|h={hour_of_day if hour_of_day is not None else 'avg'}|m={month_of_year if month_of_year is not None else 'avg'}"
    seeded(str(seed_key))

    # Type-specific marginal cost ranges (ZAR/MWh) - Merit Order
    COST = {
        "pv": (0, 50),
        "wind": (50, 150),
        "hydro": (50, 200),
        "nuclear": (200, 400),
        "coal": (400, 700),
        "gas": (700, 1200),
    }
    
    # Build device-weighted profiles for hourly/seasonal adjustment
    supply_profile_factor = 1.0
    supply_seasonal_factor = 1.0
    demand_profile_factor = 1.0
    demand_seasonal_factor = 1.0
    
    # Apply hourly profiles if hour_of_day provided
    if hour_of_day is not None:
        gen_mix = market.get("generator_mix", {})
        if gen_mix:
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
    
    # Apply seasonal profiles if month_of_year provided
    if month_of_year is not None:
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
    
    # Build consumer profiles
    if hour_of_day is not None:
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
                    load = profile[hour_of_day % len(profile)] if profile else 1.0
                    weighted_load += blocks * load
                    total_blocks += blocks
            if total_blocks > 0:
                demand_profile_factor = weighted_load / total_blocks
    
    if month_of_year is not None:
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

    # ===== BUILD SUPPLY using Merit Order by type =====
    gen_mix = market.get("generator_mix", {})
    if not gen_mix:
        gen_mix = {"pv": 250, "wind": 200, "hydro": 100, "coal": 300, "gas": 150}
    
    total_blocks_supply = sum(max(0, float(v) if not isinstance(v, dict) else float(v.get("blocks", 0))) for v in gen_mix.values()) or 1.0
    
    supply_blocks = []
    for gen_type, value in gen_mix.items():
        n = int(max(0, float(value) if not isinstance(value, dict) else float(value.get("blocks", 0))))
        if n == 0:
            continue
        vol = base_vol * (float(value) if not isinstance(value, dict) else float(value.get("blocks", 0))) / total_blocks_supply
        avg_vol = vol / n
        p_min, p_max = COST.get(gen_type.lower(), (base_price - 500, base_price + 500))
        
        for i in range(n):
            # Volume jitter
            q_jitter = 1.0 + (rng_uniform(-cap_jitter, cap_jitter))
            q = max(0.0, avg_vol * q_jitter)
            
            # Price within type range + jitter
            base_p = p_min + rng_uniform(0.0, 1.0) * (p_max - p_min)
            p_jitter_factor = 1.0 + (rng_uniform(-price_jitter, price_jitter))
            p = max(price_floor, min(price_cap, base_p * p_jitter_factor))
            
            supply_blocks.append((p, q))
    
    # Normalize supply volumes to base_vol
    supply_sum = sum(q for p, q in supply_blocks) or 1.0
    supply = [(p, (q / supply_sum) * base_vol * supply_profile_factor * supply_seasonal_factor) for p, q in supply_blocks]
    supply = sorted(supply, key=lambda x: x[0])  # Sort by price ascending
    
    # ===== BUILD DEMAND using consumer types =====
    cons_mix = market.get("consumer_mix", {})
    if not cons_mix:
        cons_mix = {"industrial": 400, "household": 500, "agriculture": 100}
    
    total_blocks_demand = sum(max(0, float(v) if not isinstance(v, dict) else float(v.get("blocks", 0))) for v in cons_mix.values()) or 1.0
    
    demand_blocks = []
    for cons_type, value in cons_mix.items():
        n = int(max(0, float(value) if not isinstance(value, dict) else float(value.get("blocks", 0))))
        if n == 0:
            continue
        vol = base_vol * (float(value) if not isinstance(value, dict) else float(value.get("blocks", 0))) / total_blocks_demand
        
        for i in range(n):
            # Willingness to Pay decreases non-linearly
            t = (i / (n - 1)) if n > 1 else 0.0
            wtp_base = base_price + 400 - 800 * (t ** 2)  # Non-linear decrease
            
            # Type-specific adjustments
            if cons_type.lower() == "industrial":
                wtp_base += 100
            elif cons_type.lower() == "agriculture":
                wtp_base -= 100
            
            # Price jitter (reduced for demand)
            p_jitter_factor = 1.0 + (rng_uniform(-price_jitter * 0.5, price_jitter * 0.5))
            p = max(price_floor, min(price_cap, wtp_base * p_jitter_factor))
            
            # Volume jitter
            q_jitter = 1.0 + (rng_uniform(-cap_jitter, cap_jitter))
            q = max(0.0, (vol / n) * q_jitter)
            
            demand_blocks.append((p, q))
    
    # Normalize demand volumes to base_vol
    demand_sum = sum(q for p, q in demand_blocks) or 1.0
    demand = [(p, (q / demand_sum) * base_vol * demand_profile_factor * demand_seasonal_factor) for p, q in demand_blocks]
    demand = sorted(demand, key=lambda x: x[0], reverse=True)  # Sort by price descending
    
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
    
    def _extract_bid_price(bid: dict, default: float = 0.0) -> float:
        if not isinstance(bid, dict):
            return float(default)
        if bid.get('price') is not None:
            return float(bid.get('price', default))
        prices = bid.get('prices', [])
        if isinstance(prices, list) and len(prices) > hour_idx and prices[hour_idx] is not None:
            return float(prices[hour_idx])
        if isinstance(prices, list) and len(prices) > 0 and prices[0] is not None:
            return float(prices[0])
        return float(default)

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
                    
                    quantity = float(hours[hour_idx])
                    price = _extract_bid_price(bid, 0.0)
                    
                    # NEW: Allow negative deltas (ID rounds)
                    # Positive delta = sell more (Supply)
                    # Negative delta = buy back (will be added to Demand)
                    if quantity > 0:
                        supply_bids.append({
                            'price': price,
                            'quantity': quantity,
                            'player_id': player_id,
                            'device_id': device_id,
                            'bid_label': bid_label
                        })
                    elif quantity < 0:
                        # Negative delta: Generator buying back (reduce position)
                        # Will be handled in build_demand_from_bids
                        pass  # Handled separately
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
                
                quantity = float(device_forecast[hour_idx])
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
    
    # Synthetic supply is treated as pre-submitted and always participates in clearing.
    for price, quantity in synthetic_supply:
        combined_supply.append((price, quantity))
    print(f"[SUPPLY_DEBUG] hour_idx={hour_idx}: Added {len(synthetic_supply)} synthetic supply steps (total {sum(q for p,q in synthetic_supply):.1f} MW)")
    
    # Add sorted player bids
    for bid in supply_bids:
        combined_supply.append((bid['price'], bid['quantity']))
    
    # Sort combined supply by price (merit order - ascending)
    combined_supply = sorted(combined_supply, key=lambda x: x[0])
    
    # Debug output
    total_player_supply = sum(b['quantity'] for b in supply_bids)
    print(f"[SUPPLY_DEBUG] hour_idx={hour_idx}: Player bids: {len(supply_bids)} bids, {total_player_supply:.1f} MW total")
    if supply_bids:
        print(f"[SUPPLY_DEBUG] hour_idx={hour_idx}: Price range: {supply_bids[0]['price']:.1f} - {supply_bids[-1]['price']:.1f} ZAR/MWh")
    print(f"[SUPPLY_DEBUG] hour_idx={hour_idx}: Combined supply: {len(combined_supply)} steps, {sum(q for p,q in combined_supply):.1f} MW total")
    
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
    
    def _extract_bid_price(bid: dict, default: float = 0.0) -> float:
        if not isinstance(bid, dict):
            return float(default)
        if bid.get('price') is not None:
            return float(bid.get('price', default))
        prices = bid.get('prices', [])
        if isinstance(prices, list) and len(prices) > hour_idx and prices[hour_idx] is not None:
            return float(prices[hour_idx])
        if isinstance(prices, list) and len(prices) > 0 and prices[0] is not None:
            return float(prices[0])
        return float(default)

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
            
            device_bidding_enabled = device.get('enable_multi_bid')
            
            # Use device-level setting if specified, otherwise fall back to global
            if device_bidding_enabled is None:
                device_bidding_enabled = global_bidding_enabled
            
            # Check if this is a consumer device (load) or generator with negative delta (buy-back)
            is_consumer = 'load' in device_type
            is_generator = not is_consumer
            
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
                    
                    quantity = float(hours[hour_idx])
                    price = _extract_bid_price(bid, 0.0)
                    
                    # Consumer: positive quantity = demand
                    # Generator: negative quantity = buy back (demand)
                    if is_consumer and quantity > 0:
                        demand_bids.append({
                            'price': price,
                            'quantity': quantity,
                            'player_id': player_id,
                            'device_id': device_id,
                            'bid_label': bid_label
                        })
                    elif is_generator and quantity < 0:
                        # NEW: Generator buying back (negative delta in ID market)
                        demand_bids.append({
                            'price': price,
                            'quantity': abs(quantity),  # Convert to positive demand
                            'player_id': player_id,
                            'device_id': device_id,
                            'bid_label': bid_label,
                            'is_buyback': True  # Flag for tracking
                        })
                        print(f"[BUYBACK] Player {player_id}, Device {device_id}, Lot {bid_label}: Buying back {abs(quantity):.1f} MW @ {price:.1f} ZAR/MWh")
            elif is_consumer:
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
                
                quantity = float(device_forecast[hour_idx])
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
                       synthetic_supply: List[Tuple[float, float]], 
                       devices_cfg: List[dict] = None,
                       da_dispatch_this_hour: Dict[str, float] = None,
                       round_events: list = None,
                       player_type_by_player: Dict[int, str] = None,
                       use_synthetic: bool = True) -> Dict[int, Dict[str, Dict[str, dict]]]:
    """
    Track which player bids were dispatched during market clearing.
    
    Args:
        supply_bids: List of bid metadata from build_supply_from_bids
        smp: Market clearing price
        volume: Total cleared volume
        synthetic_supply: Synthetic supply curve (only used if use_synthetic=True)
        devices_cfg: List of device configurations for capacity validation
        da_dispatch_this_hour: Dict of {device_id: da_dispatched_mw} for capacity check
        player_type_by_player: Optional mapping {player_id: selected_type_id} for player-targeted events
        use_synthetic: Whether to include synthetic supply in dispatch simulation
    
    Returns:
        Dict of {player_id: {device_id: {bid_label: dispatch_info}}}
    """
    # Sort all supply (synthetic + bids) by price
    all_supply = []
    
    # Only add synthetic supply if explicitly requested (must match clearing behavior)
    if use_synthetic:
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
    
    # Track cumulative dispatch per device (across all lots) for capacity enforcement
    device_cumulative_dispatch = {}
    
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
        
        # Player bid - validate against device capacity before dispatch
        effective_quantity = quantity
        if devices_cfg:
            device = next((d for d in devices_cfg if d.get('id') == device_id), None)
            if device:
                # Use capacity_mw or max_power_mw, whichever is available
                base_capacity = device.get('capacity_mw') or device.get('max_power_mw') or float('inf')
                
                # Apply events to modify capacity (e.g. plant outage reduces capacity)
                device_type = device.get('type', '')
                event_mult, event_add = get_device_event_modifiers(
                    device,
                    device_type,
                    round_events,
                    player_id,
                    (player_type_by_player or {}).get(int(player_id))
                )
                max_capacity = (base_capacity * event_mult) + event_add
                max_capacity = max(0.0, max_capacity)  # Capacity can't be negative
                
                if event_mult != 1.0 or event_add != 0.0:
                    print(f"[EVENT_CAPACITY] Device {device_id}: Base={base_capacity:.1f} MW, Event mult={event_mult}, add={event_add} → Available={max_capacity:.1f} MW")
                
                # NEW: Cross-round capacity check (DA + ID <= capacity)
                da_dispatched = 0.0
                if da_dispatch_this_hour and device_id in da_dispatch_this_hour:
                    da_dispatched = da_dispatch_this_hour[device_id]
                
                # Available capacity for ID = total capacity - DA dispatch
                available_capacity = max_capacity - da_dispatched
                
                # BUGFIX: Track cumulative dispatch for this device across all lots
                already_dispatched_this_hour = device_cumulative_dispatch.get(device_id, 0.0)
                remaining_capacity = available_capacity - already_dispatched_this_hour
                
                if quantity > remaining_capacity:
                    if already_dispatched_this_hour > 0:
                        print(f"[CAPACITY_CAP] Device {device_id} Lot {bid_label}: Bid {quantity:.1f} MW + already dispatched {already_dispatched_this_hour:.1f} MW exceeds available capacity {available_capacity:.1f} MW, capping to {remaining_capacity:.1f} MW")
                    else:
                        print(f"[CAPACITY_CAP] Device {device_id} Lot {bid_label}: Bid {quantity:.1f} MW exceeds available capacity {available_capacity:.1f} MW (Total: {max_capacity:.1f}, DA: {da_dispatched:.1f}), capping to available")
                    effective_quantity = max(0, remaining_capacity)  # Can't dispatch negative
        
        dispatched = min(effective_quantity, remaining_demand)
        remaining_demand -= dispatched
        
        # Update cumulative dispatch tracking for this device
        if device_id not in device_cumulative_dispatch:
            device_cumulative_dispatch[device_id] = 0.0
        device_cumulative_dispatch[device_id] += dispatched
        
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
    all_demand = [(p, q, None, None, None, False) for p, q in synthetic_demand]  # (price, qty, player, device, label, is_buyback)
    for bid in demand_bids:
        all_demand.append((
            bid['price'],
            bid['quantity'],
            bid['player_id'],
            bid['device_id'],
            bid['bid_label'],
            bool(bid.get('is_buyback', False))
        ))
    
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
        
        is_buyback = bool(bid.get('is_buyback', False))
        offered_signed = -bid['quantity'] if is_buyback else bid['quantity']

        dispatch_tracking[player_id][device_id][bid_label] = {
            'mw_offered': bid['quantity'],
            'mw_offered_signed': offered_signed,
            'mw_dispatched': 0.0,  # Will be updated if dispatched
            'mw_dispatched_signed': 0.0,
            'price_bid': bid['price'],
            'smp': smp,
            'is_buyback': is_buyback
        }
    
    # Dispatch consumer bids based on willingness-to-pay vs SMP AND available volume
    # Track remaining volume for correct partial dispatch
    remaining_volume = volume
    
    for idx, (price, quantity, player_id, device_id, bid_label, is_buyback) in enumerate(all_demand):
        if price < smp:
            print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: price {price:.1f} < smp {smp:.1f}, not served")
            # Don't break - continue checking other bids (they might have higher prices)
            if player_id is not None:
                # Mark as not served
                dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = 0.0
            continue
        
        if player_id is None:
            # Synthetic demand - consume volume
            dispatched = min(quantity, remaining_volume)
            remaining_volume = max(0.0, remaining_volume - dispatched)
            print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Synthetic demand, price={price:.1f}, qty={quantity:.1f}, dispatched={dispatched:.1f}, remaining={remaining_volume:.1f}")
            continue
        
        # Player consumer bid with WTP >= SMP
        # Dispatch based on remaining volume (can be partial for marginal bids)
        if remaining_volume > 0:
            dispatched = min(quantity, remaining_volume)
            remaining_volume = max(0.0, remaining_volume - dispatched)
            dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = round(dispatched, 3)
            dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched_signed'] = round((-dispatched if is_buyback else dispatched), 3)
            
            if dispatched < quantity:
                print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Player {player_id}, device={device_id}, lot={bid_label}, price={price:.1f} >= smp {smp:.1f}, qty={quantity:.1f}, PARTIAL dispatch={dispatched:.1f}")
            else:
                print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Player {player_id}, device={device_id}, lot={bid_label}, price={price:.1f} >= smp {smp:.1f}, qty={quantity:.1f}, FULLY SERVED")
        else:
            # No remaining volume
            dispatch_tracking[player_id][device_id][bid_label]['mw_dispatched'] = 0.0
            print(f"[DEMAND_DISPATCH_DEBUG] #{idx}: Player {player_id}, device={device_id}, lot={bid_label}, price={price:.1f} >= smp {smp:.1f}, NO VOLUME remaining")
    
    return dispatch_tracking


def get_device_event_modifiers(device: dict, device_type: str, events: list[dict], player_id: int = None, player_type_id: str = None) -> Tuple[float, float]:
    """
    Get event modifiers (multiplier, additive) for a specific device.
    
    Events modify device capacity (generators) or demand (consumers) BEFORE market clearing.
    
    Args:
        device: Device configuration dict
        device_type: Device type (e.g. 'coal', 'wind', 'industrial_load')
        events: List of active events for this round
        player_id: Optional player ID for player-specific events
    
    Returns:
        Tuple of (multiplier, additive) where:
        - result = (original * multiplier) + additive
        - Example: capacity=500, multiplier=0.2, additive=-50 → (500 * 0.2) - 50 = 50 MW
    
    Event targeting:
    - target='all': Applied to all devices
    - target='player' + target_id='123': Applied only to player 123's devices
    - target='player' + target_id='ptype_abc': Applied to all devices of players with selected type ptype_abc
    - target='device' + target_id='coal': Applied to all coal-type devices
    - target='device' + target_id='device_abc': Applied to specific device ID
    """
    multiplier = 1.0
    additive = 0.0
    
    device_id = device.get('id', '')
    device_type_lower = device_type.lower()
    
    for event in events or []:
        target = event.get('target', 'all')
        target_id = str(event.get('target_id', '')).lower()
        
        apply_event = False
        
        if target == 'all':
            apply_event = True
        elif target == 'player':
            matches_player_id = player_id is not None and str(player_id).lower() == target_id
            matches_player_type = player_type_id is not None and str(player_type_id).lower() == target_id
            if matches_player_id or matches_player_type:
                apply_event = True
        elif target == 'device':
            # Match by device type (e.g. 'coal') or specific device ID
            if target_id == device_type_lower or target_id == device_id.lower():
                apply_event = True
        
        if apply_event:
            multiplier *= float(event.get('multiplier', 1.0))
            additive += float(event.get('additive', 0.0))
    
    return multiplier, additive


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
    # NOTE: Events are applied at device capacity level during clearing, not to price/volume after
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


def generate_device_baseline(device: dict, player_count: int, hour: int, start_time: str) -> float:
    """
    Generate default baseline forecast for a device in Round 1.
    
    Used when day_one_baseline_mode = "preset".
    Provides realistic baseline values based on device type and characteristics.
    In multiplayer mode, capacity is divided equally among players.
    
    Args:
        device: Device configuration dict
        player_count: Number of players sharing this device (for capacity division)
        hour: Hour index for time-dependent profiles
        start_time: Start time string (e.g., "02:00")
    
    Returns:
        Baseline power in MW for this hour
    """
    device_type = (device.get("type") or "").lower()
    capacity = float(device.get("max_power_mw") or device.get("capacity_mw") or 0)
    
    # Divide capacity among players in multiplayer mode
    player_capacity = capacity / max(1, player_count)
    
    # Generator types
    if device_type in ["solar", "wind"]:
        # Renewables: Use capacity factor and availability profile
        capacity_factor = float(device.get("capacity_factor_pct", 25)) / 100
        
        if device_type == "solar":
            hour_of_day = extract_hour_of_day(hour, start_time)
            availability = SOLAR_AVAILABILITY[hour_of_day]
            return player_capacity * availability
        elif device_type == "wind":
            hour_of_day = extract_hour_of_day(hour, start_time)
            availability = WIND_AVAILABILITY[hour_of_day]
            return player_capacity * availability
        else:
            return player_capacity * capacity_factor
    
    elif device_type in ["gas", "coal", "nuclear", "hydro"]:
        # Thermal generators: Use typical load between min and rated capacity
        min_load_pct = float(device.get("min_load_pct", 40)) / 100
        typical_load = 0.7  # 70% typical operational level
        return player_capacity * max(min_load_pct, typical_load)
    
    elif device_type == "battery":
        # Battery: Neutral baseline (0 = neither charging nor discharging)
        return 0.0
    
    elif "load" in device_type:
        # Load devices: Use baseline load
        baseline = float(device.get("baseline_load_mw", 0))
        
        # Optional: Apply load profile if available
        load_profile = device.get("load_profile")
        if load_profile and isinstance(load_profile, list) and len(load_profile) == 24:
            hour_of_day = extract_hour_of_day(hour, start_time)
            factor = load_profile[hour_of_day]
            return baseline * factor
        
        return baseline
    
    # Default: zero for unknown types
    return 0.0


def run_round(session_id: int, round_num: int, players: List[int], forecasts: Dict[int, dict], config: dict, mode: str = "isolated_per_player", seed: Optional[str] = None) -> dict:
    """
    Compute basic market results for a round with hourly market clearing.
    
    Market Clearing Logic:
    - DAM/IDM Dual Market Support with Tag 1 Sonderregel
    - Round 1 (Tag 1): DAM clears all hours 0-23 (full first day)
    - Round 2+: DAM and/or IDM clear round hours (6-11, 12-17, etc.) based on markets config
    - Each clearing uses ABSOLUTE bid values (not deltas)
    - Results stored separately: dam_bid_dispatch (DAM) + bid_dispatch (IDM)
    
    Args:
        forecasts: Dict of {player_id: forecast_data}
                  forecast_data can be:
                    - List[float] (legacy: quantity-only)
                    - Dict with 'hours' and optional 'bids' keys
    
    Returns:
        Dict with smp, volume, round_kpis, hourly_results, and optionally:
        - dam_bid_dispatch, dam_hourly_results, dam_device_hourly_details (DAM)
        - bid_dispatch, hourly_results, device_hourly_details (IDM)
    """
    general_cfg = config.get("general", {})
    player_type_by_player: Dict[int, str] = {}
    try:
        from .models import SessionPlayerType
        selected_types = (
            SessionPlayerType.query
            .filter(SessionPlayerType.session_id == session_id, SessionPlayerType.user_id.in_(players))
            .all()
        )
        for sel in selected_types:
            if sel and sel.user_id is not None and sel.type_id:
                player_type_by_player[int(sel.user_id)] = str(sel.type_id)
    except Exception:
        player_type_by_player = {}
    span = int(general_cfg.get("round_span_hours", 6))
    round_span = span  # Save original round_span for display
    start_time_str = general_cfg.get("start_time") or "00:00"
    try:
        start_hour = int(start_time_str.split(":")[0])
    except:
        start_hour = 0
    
    # Day 1 Baseline option (Zero, Preset, Edit Round 1)
    # - Zero: DAM offering = 0 for all day 1 hours (no DAM market, starts with IDM)
    # - Preset: DAM offering = device forecast before Round 1 (DAM closed before game starts)
    # - Edit Round 1: DAM clearing happens at END of Round 1 (DAM open during Round 1)
    day_1_baseline = general_cfg.get("day_1_baseline", general_cfg.get("day_one_baseline_mode", "Edit Round 1"))
    baseline_raw = str(day_1_baseline or "Edit Round 1").strip().lower()
    if baseline_raw in ["edit round 1", "edit_round_1", "editround1", "edit round1"]:
        baseline_mode = "edit_round_1"
    elif baseline_raw in ["preset"]:
        baseline_mode = "preset"
    elif baseline_raw in ["zero", "0"]:
        baseline_mode = "zero"
    else:
        baseline_mode = "edit_round_1"
    
    # DISPLAY vs GATE SEPARATION:
    # - display_base_idx, display_span: Hours cleared and shown in this round
    # - clearing_base_idx, clearing_span: Gate window metadata (controls timing of accepted updates)
    
    # Display hours: Always the round span hours
    display_base_idx = (round_num - 1) * round_span
    display_span = round_span
    
    # TAG 1 SONDERREGEL: Round 1 behavior depends on day_1_baseline setting
    if round_num == 1:
        # Calculate hours until end of day 1 (24:00)
        hours_in_day_1 = 24 - start_hour
        
        if baseline_mode == "edit_round_1":
            # Round 1 clears DAM for full day 1 at end of round
            clearing_base_idx = 0
            clearing_span = hours_in_day_1
            # Display: Show only current round span (not full day)
            display_base_idx = 0
            display_span = round_span
            print(f"[DAM_TAG1] Round 1 'Edit Round 1': Clearing DAM hours 0-{hours_in_day_1-1}, Display hours 0-{round_span-1}")
        else:
            # Zero/Preset: DAM was already "cleared" before Round 1
            # Round 1 is actually first IDM round, clearing updates to DAM baseline
            clearing_base_idx = 0
            clearing_span = round_span
            # Display: Normal round span
            display_base_idx = 0
            display_span = round_span
            print(f"[DAM_TAG1] Round 1 '{day_1_baseline}': DAM baseline pre-set, Clearing IDM hours 0-{round_span-1}, Display hours 0-{round_span-1}")
    else:
        # ROUND 2+ IDM GATE HOURS LOGIK:
        # - Clearing erfolgt beim Gate Close (zu Beginn der Round)
        # - Display: Round span hours (z.B. 6-11)
        # - Clearing: Gate window hours (z.B. 24-27)
        
        hours_in_day_1 = 24 - start_hour
        
        # Get IDM gate configuration
        id_gate_interval = int(general_cfg.get("id_gate_interval_hours", 4))
        id_gate_base = int(general_cfg.get("id_gate_base_hour", 0))
        
        # Display hours: Normal round span
        display_base_idx = (round_num - 1) * round_span
        display_span = round_span
        
        # Clearing hours: Gate window
        # Calculate current simulation hour based on gate intervals (not round_span!)
        # Round 2 starts at first gate after day 1
        # Round 3 starts at second gate after day 1, etc.
        current_sim_hour = hours_in_day_1 + (round_num - 2) * id_gate_interval
        
        # Calculate gate that closes NOW (at round start)
        # Gates occur at: id_gate_base, id_gate_base + interval, id_gate_base + 2*interval, ...
        # Find gate hour at or just after current_sim_hour
        gate_hour = id_gate_base
        while gate_hour < current_sim_hour:
            gate_hour += id_gate_interval
        
        # Gate closes now → clear hours from gate_hour to next gate
        clearing_base_idx = gate_hour
        clearing_span = id_gate_interval
        
        print(f"[IDM_GATE] Round {round_num}: Gate closes at sim_hour={gate_hour} (round starts at {current_sim_hour})")
        print(f"[IDM_GATE] Round {round_num}: Clearing IDM hours {clearing_base_idx}-{clearing_base_idx+clearing_span-1}")
        print(f"[IDM_GATE] Round {round_num}: Display hours {display_base_idx}-{display_base_idx+display_span-1}")
    
    # Market mode selection per round (trading config only)
    markets_cfg = config.get("markets", {})
    round_idx = round_num - 1
    
    def get_market_status(market_key):
        """Get market status from trading config with backward compatibility.
        Legacy: markets.dam = [status, ...]
        Current: markets.dam.trading = [status, ...]
        Old clearing arrays are intentionally ignored.
        """
        market_data = markets_cfg.get(market_key, [])
        if isinstance(market_data, list):
            # Legacy format: single array
            return market_data[round_idx] if round_idx < len(market_data) else "market_code"
        elif isinstance(market_data, dict):
            # Trading-only model
            trading_array = market_data.get("trading", [])
            return trading_array[round_idx] if round_idx < len(trading_array) else "market_code"
        return "market_code"
    
    dam_market_status = get_market_status("dam")
    idm_market_status = get_market_status("idm")
    
    print(f"[MARKET_CONFIG] Round {round_num}: DAM={dam_market_status}, IDM={idm_market_status}")
    
    # Determine primary market type for this round (used for loading baselines)
    if round_num == 1:
        primary_market = "dam"
    elif dam_market_status != "off" and idm_market_status == "off":
        primary_market = "dam"
    elif idm_market_status != "off":
        primary_market = "idm"
    else:
        primary_market = "idm"  # Default to IDM for round 2+
    
    print(f"[MARKET_CONFIG] Primary market for clearing: {primary_market}")

    # Round classification:
    # - absolute_clearing_round: use absolute bids/hours and DAM-style settlement
    # - id_delta_round: use delta vs DA baseline and ID-style settlement
    absolute_clearing_round = (
        (round_num == 1 and baseline_mode == "edit_round_1")
        or (round_num > 1 and dam_market_status != "off" and idm_market_status == "off")
    )
    id_delta_round = not absolute_clearing_round
    
    # SAWEM Delta-based Clearing: Load DA baseline for ID rounds
    # Also needed for Round 1 if day_1_baseline is Zero or Preset
    da_baseline_forecasts = {}
    da_baseline_bids = {}  # NEW: Store DA bids for delta calculation
    da_baseline_dispatch = {}  # NEW: Store DA dispatch for capacity check
    baseline_lookup_trace = None
    da_smp = None
    da_result_data = None
    
    # Day 1 Baseline: Zero or Preset modes require baseline before Round 1
    if round_num == 1 and baseline_mode in ["zero", "preset"]:
        print(f"[DAM_BASELINE] Round 1 with day_1_baseline={day_1_baseline}, setting up baseline")
        
        if baseline_mode == "zero":
            # Zero baseline: All forecasts = 0 for day 1
            hours_in_day_1 = 24 - start_hour
            for pid in players:
                da_baseline_forecasts[pid] = [0.0] * hours_in_day_1
                da_baseline_bids[pid] = {}
            da_smp = 0.0  # No DAM clearing occurred
            print(f"[DAM_BASELINE] Zero baseline: Set all DAM offerings to 0 for {hours_in_day_1} hours")
        
        elif baseline_mode == "preset":
            # Preset baseline: Use device capacity/forecast from config
            # Load player devices and calculate their default forecast
            devices_cfg = config.get("devices", [])
            from .device_types import enrich_device_with_defaults
            devices_cfg = [enrich_device_with_defaults(d) for d in devices_cfg]
            
            hours_in_day_1 = 24 - start_hour
            for pid in players:
                player_devices = [d for d in devices_cfg if d.get("owner_id") == pid or d.get("player_id") == pid]
                
                # Simple preset: Use device capacity as baseline
                preset_forecast = [0.0] * hours_in_day_1
                preset_bids = {}
                
                for device in player_devices:
                    device_id = device.get("id")
                    capacity = float(device.get("capacity_mw", device.get("max_power_mw", 0)))
                    
                    # Add device capacity to all hours (simple preset)
                    for h in range(hours_in_day_1):
                        preset_forecast[h] += capacity
                    
                    # Create preset bids (simple 3-lot split)
                    if capacity > 0:
                        preset_bids[device_id] = {
                            'A': {'hours': [capacity * 0.5] * hours_in_day_1, 'price': 300.0},
                            'B': {'hours': [capacity * 0.3] * hours_in_day_1, 'price': 400.0},
                            'C': {'hours': [capacity * 0.2] * hours_in_day_1, 'price': 500.0}
                        }
                
                da_baseline_forecasts[pid] = preset_forecast
                da_baseline_bids[pid] = preset_bids
            
            # TODO: Actually run DAM clearing with preset values to get da_smp
            # For now, use market preview to estimate SMP
            da_smp = 400.0  # Placeholder
            print(f"[DAM_BASELINE] Preset baseline: Generated DAM offerings from device capacities")
    
    if round_num > 1 and Forecast is not None:
        # Load DA baseline deterministically per player (latest marked baseline)
        try:
            da_forecasts = Forecast.query.filter_by(
                session_id=session_id,
                is_da_baseline=True
            ).filter(Forecast.round_num < round_num).order_by(Forecast.player_id, Forecast.submitted_at.asc(), Forecast.id.asc()).all()

            baseline_round_by_player = {}
            baselines_by_player = {}

            for f in da_forecasts:
                if f.player_id not in players:
                    continue
                payload = f.data or {}
                baseline_range = payload.get('da_baseline_hours') or {}
                start_idx = baseline_range.get('start')
                end_idx = baseline_range.get('end')
                hours = payload.get('hours', []) or []

                # Fallback for legacy rows without explicit range metadata
                if start_idx is None or end_idx is None:
                    start_idx = 0
                    end_idx = len(hours)

                start_idx = max(0, int(start_idx))
                end_idx = max(start_idx, int(end_idx))

                baselines_by_player.setdefault(f.player_id, []).append({
                    'round_num': f.round_num,
                    'start': start_idx,
                    'end': end_idx,
                    'hours': hours,
                    # Bids are stored in separate column in modern payloads
                    'bids': f.bids or payload.get('bids', {}) or {}
                })

            for pid in players:
                player_baselines = baselines_by_player.get(pid, [])
                if not player_baselines:
                    continue

                composed_hours = []
                composed_bids = {}

                for base in player_baselines:
                    base_hours = base.get('hours') or []
                    start_idx = base.get('start', 0)
                    end_idx = base.get('end', 0)

                    if end_idx > len(composed_hours):
                        composed_hours.extend([0.0] * (end_idx - len(composed_hours)))

                    for idx in range(start_idx, min(end_idx, len(base_hours))):
                        composed_hours[idx] = float(base_hours[idx] or 0.0)

                    base_bids = base.get('bids') or {}
                    if isinstance(base_bids, dict):
                        for device_id, device_bids in base_bids.items():
                            if not isinstance(device_bids, dict):
                                continue
                            if device_id not in composed_bids:
                                composed_bids[device_id] = {}

                            for bid_label, bid_payload in device_bids.items():
                                if not isinstance(bid_payload, dict):
                                    continue
                                bid_hours = bid_payload.get('hours', []) or []

                                if bid_label not in composed_bids[device_id]:
                                    composed_bids[device_id][bid_label] = {'hours': []}

                                target_hours = composed_bids[device_id][bid_label]['hours']
                                if end_idx > len(target_hours):
                                    target_hours.extend([0.0] * (end_idx - len(target_hours)))

                                for idx in range(start_idx, min(end_idx, len(bid_hours))):
                                    target_hours[idx] = float(bid_hours[idx] or 0.0)

                    baseline_round_by_player[pid] = base.get('round_num')

                da_baseline_forecasts[pid] = composed_hours
                da_baseline_bids[pid] = composed_bids
            
            # Load DA SMP and bid_dispatch from Round 1 results
            from app.models import Result
            da_result = Result.query.filter_by(
                session_id=session_id,
                round_num=1
            ).first()
            
            if da_result:
                da_result_data = da_result.data or {}
                da_smp = float(da_result_data.get('smp', 0))
                # NEW: Load DA dispatch for capacity validation
                # BUGFIX: Round 1 now stores as dam_bid_dispatch, not bid_dispatch
                da_baseline_dispatch = da_result_data.get('dam_bid_dispatch', da_result_data.get('bid_dispatch', {}))
                
                # FORENSIC: Trace baseline lookup
                baseline_lookup_trace = {
                    'source_round': 1,
                    'source_session_id': session_id,
                    'players_found': list(da_baseline_dispatch.keys()),
                    'devices_per_player': {pid: list(devices.keys()) for pid, devices in da_baseline_dispatch.items()},
                    'lookup_method': 'hour_idx_with_hour_offset_fallback',
                    'timestamp': da_result.created_at.isoformat() if hasattr(da_result, 'created_at') else None
                }
            
            print(f"[DELTA_CLEARING] Round {round_num}: Loaded DA baseline for {len(da_baseline_forecasts)} players, baseline_rounds={baseline_round_by_player}, DA SMP={da_smp}, DA dispatch={bool(da_baseline_dispatch)}")
            if baseline_lookup_trace is not None:
                print(f"[BASELINE_TRACE] Lookup trace: {baseline_lookup_trace}")
            else:
                print(f"[BASELINE_TRACE] Lookup trace: unavailable (no Round 1 result found)")
        except Exception as e:
            print(f"[DELTA_CLEARING] Warning: Could not load DA baseline: {e}")
    
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
    
    # Forecast preparation:
    # - absolute_clearing_round: use absolute forecast values
    # - id_delta_round: use DELTA (current_forecast - dam_offering)
    # - This implements the three timelines: Forecast, DAM offering, IDM offering
    clearing_forecasts = {}
    for pid in players:
        current_data = normalized_forecasts.get(pid, {'hours': [], 'bids': None})
        
        if absolute_clearing_round:
            # Absolute clearing: use submitted values as commitments for this clearing round
            clearing_forecasts[pid] = current_data
        else:
            # ID delta clearing: calculate delta to DA baseline
            # Get DAM offering from baseline (what was committed in DAM)
            dam_offering_hours = da_baseline_forecasts.get(pid, [])
            dam_offering_bids = da_baseline_bids.get(pid, {})
            
            # Calculate delta for hours array
            current_hours = current_data.get('hours', [])
            delta_hours = []
            for i in range(len(current_hours)):
                dam_value = float(dam_offering_hours[i]) if i < len(dam_offering_hours) else 0.0
                delta_value = float(current_hours[i]) - dam_value
                delta_hours.append(delta_value)
            
            # Calculate delta for bids (per device, per lot)
            delta_bids = {}
            if current_data.get('bids'):
                for device_id, device_bids in current_data['bids'].items():
                    delta_bids[device_id] = {}
                    dam_device_bids = dam_offering_bids.get(device_id, {}) if dam_offering_bids else {}
                    
                    for bid_label in ['A', 'B', 'C']:
                        if bid_label in device_bids:
                            current_bid = device_bids[bid_label]
                            dam_bid = dam_device_bids.get(bid_label, {}) if dam_device_bids else {}
                            
                            # Delta hours: current - dam
                            current_bid_hours = current_bid.get('hours', [])
                            dam_bid_hours = dam_bid.get('hours', []) if dam_bid else []
                            delta_bid_hours = []
                            for i in range(len(current_bid_hours)):
                                dam_h = float(dam_bid_hours[i]) if i < len(dam_bid_hours) else 0.0
                                delta_h = float(current_bid_hours[i]) - dam_h
                                delta_bid_hours.append(delta_h)
                            
                            # Keep prices from current bid (not delta)
                            if current_bid.get('price') is not None:
                                bid_price = float(current_bid.get('price', 0))
                            else:
                                current_prices = current_bid.get('prices', [])
                                bid_price = float(current_prices[0]) if isinstance(current_prices, list) and len(current_prices) > 0 else 0.0

                            delta_bids[device_id][bid_label] = {
                                'hours': delta_bid_hours,
                                'price': bid_price
                            }
            
            clearing_forecasts[pid] = {
                'hours': delta_hours,
                'bids': delta_bids if delta_bids else None,
                'da_hours': dam_offering_hours  # Store for settlement split
            }
            
            # Log delta calculation
            if delta_bids:
                total_delta = 0.0
                for device_id, device_bids in delta_bids.items():
                    for bid_label in ['A', 'B', 'C']:
                        if bid_label in device_bids:
                            hours = device_bids[bid_label].get('hours', [])
                            round_hours = hours[display_base_idx:display_base_idx+display_span] if len(hours) > display_base_idx else []
                            total_delta += sum(round_hours)
                print(f"[IDM_DELTA] Round {round_num}, Player {pid}: Total IDM delta for display hours {display_base_idx}-{display_base_idx+display_span-1}: {total_delta:.1f} MW (delta from DAM)")
        
        # Log for debugging
        if current_data.get('bids'):
            total_offered = 0.0
            for device_id, device_bids in current_data['bids'].items():
                for bid_label in ['A', 'B', 'C']:
                    if bid_label in device_bids:
                        hours = device_bids[bid_label].get('hours', [])
                        # Only sum hours for this round (display/clearing hours)
                        round_hours = hours[display_base_idx:display_base_idx+display_span] if len(hours) > display_base_idx else []
                        total_offered += sum(round_hours)
            print(f"[CLEARING] Round {round_num}, Player {pid}: Total forecast for display hours {display_base_idx}-{display_base_idx+display_span-1}: {total_offered:.1f} MW")
    
    # Use clearing_forecasts for market clearing (contains deltas for ID rounds)
    normalized_forecasts = clearing_forecasts

    def _extract_dispatch_for_hour(lot_hours, target_hour_idx, target_hour_offset):
        """Extract dispatched MWh for a specific scenario hour from lot hourly payload.

        Prefers explicit hour index matching and falls back to hour_offset indexing
        for legacy payloads.
        """
        if not isinstance(lot_hours, list):
            return 0.0

        # Preferred: explicit hour index in row payload
        for row in lot_hours:
            if not isinstance(row, dict):
                continue
            row_hour_idx = row.get('hour_idx', row.get('scenario_hour_idx'))
            if row_hour_idx is not None and int(row_hour_idx) == int(target_hour_idx):
                return float(row.get('mw_dispatched', 0.0) or 0.0)

        # Fallback 1: positional lookup by absolute scenario hour index
        # DA baseline payloads can be stored as full-horizon arrays without hour_idx fields.
        if 0 <= target_hour_idx < len(lot_hours):
            row = lot_hours[target_hour_idx]
            if isinstance(row, dict):
                return float(row.get('mw_dispatched', 0.0) or 0.0)

        # Fallback 2: positional lookup by round-local offset (legacy)
        if 0 <= target_hour_offset < len(lot_hours):
            row = lot_hours[target_hour_offset]
            if isinstance(row, dict):
                return float(row.get('mw_dispatched', 0.0) or 0.0)

        return 0.0

    def _get_da_player_dispatch_map(pid):
        """Normalize DA baseline dispatch payload to {device_id: {lot: [hourly_rows]}} for a player."""
        if not isinstance(da_baseline_dispatch, dict) or not da_baseline_dispatch:
            return {}

        # Shape 1: {player_id: {device_id: {lot: [..]}}}
        if pid in da_baseline_dispatch and isinstance(da_baseline_dispatch.get(pid), dict):
            return da_baseline_dispatch.get(pid) or {}
        if str(pid) in da_baseline_dispatch and isinstance(da_baseline_dispatch.get(str(pid)), dict):
            return da_baseline_dispatch.get(str(pid)) or {}

        # Shape 2: per-player row payload already sliced: {device_id: {lot: [..]}}
        sample_val = next((v for v in da_baseline_dispatch.values() if isinstance(v, dict)), None)
        is_device_lot_map = bool(sample_val) and any(isinstance(inner, list) for inner in sample_val.values())
        if is_device_lot_map:
            return da_baseline_dispatch

        return {}

    def _get_da_delivery_dispatch_mwh(pid, target_hour_idx, target_hour_offset):
        """Get total committed DA dispatch for the delivery hour for one player."""
        player_dispatch = _get_da_player_dispatch_map(pid)
        if not isinstance(player_dispatch, dict):
            return 0.0

        total = 0.0
        for _, lots in player_dispatch.items():
            if not isinstance(lots, dict):
                continue
            for _, lot_hours in lots.items():
                total += _extract_dispatch_for_hour(lot_hours, target_hour_idx, target_hour_offset)
        return total

    def _get_da_delivery_dispatch_by_device(pid, target_hour_idx, target_hour_offset):
        """Get DA committed dispatch per device for a delivery hour."""
        player_dispatch = _get_da_player_dispatch_map(pid)
        if not isinstance(player_dispatch, dict):
            return {}

        by_device = {}
        for device_id, lots in player_dispatch.items():
            if not isinstance(lots, dict):
                continue
            device_total = 0.0
            for _, lot_hours in lots.items():
                device_total += _extract_dispatch_for_hour(lot_hours, target_hour_idx, target_hour_offset)
            if device_total > 0:
                by_device[device_id] = device_total
        return by_device
    
    # Check if multi-bid pricing is enabled (campaign-wide setting)
    # NOTE: This controls the MARKET CLEARING MECHANISM (bid-based vs synthetic)
    # Device-level enable_multi_bid controls INPUT/UI only (3 lots vs 1 implicit bid)
    enable_bidding = config.get("market", {}).get("enable_player_bidding", False)
    print(f"[HOURLY_DEBUG] Engine started: enable_bidding={enable_bidding}")
    
    # Apply only events active for this round
    round_events = select_events_for_round(config.get("events", []), round_num)

    def _is_load_device(device_cfg: dict) -> bool:
        device_type = (device_cfg.get('type') or '').lower()
        category = (device_cfg.get('category') or '').lower()
        return ('load' in device_type) or (category == 'load')

    def _device_co2_rate_kg_per_mwh(device_cfg: dict) -> float:
        return float(device_cfg.get('co2_emissions_kg_per_mwh', device_cfg.get('co2_kg_per_mwh', 0.0)) or 0.0)

    def _device_capacity_mw(device_cfg: dict) -> float:
        for key in ['capacity_mw', 'max_power_mw', 'max_mw', 'capacity']:
            value = device_cfg.get(key)
            if value is not None:
                try:
                    return float(value)
                except Exception:
                    return 0.0
        return 0.0

    def _synthetic_supply_co2_rate(config_dict: dict, devices_cfg_list: List[dict]) -> float:
        market_dict = config_dict.get("market", {}) or {}
        explicit_rate = market_dict.get("synthetic_supply_co2_kg_per_mwh", market_dict.get("grid_co2_kg_per_mwh"))
        if explicit_rate is not None:
            try:
                return max(0.0, float(explicit_rate))
            except Exception:
                pass

        producer_devices = [device for device in devices_cfg_list if not _is_load_device(device)]
        total_capacity = 0.0
        weighted_co2 = 0.0
        for device in producer_devices:
            capacity = _device_capacity_mw(device)
            co2_rate = _device_co2_rate_kg_per_mwh(device)
            if capacity > 0:
                total_capacity += capacity
                weighted_co2 += capacity * co2_rate
        if total_capacity > 0:
            return weighted_co2 / total_capacity
        return 0.0

    from .device_types import enrich_device_with_defaults
    devices_cfg_enriched_for_co2 = [enrich_device_with_defaults(device) for device in config.get("devices", [])]
    synthetic_supply_co2_rate = _synthetic_supply_co2_rate(config, devices_cfg_enriched_for_co2)
    
    # Extract time information for device-specific profiles
    start_time = config.get("general", {}).get("start_time", "00:00")
    fake_date = config.get("general", {}).get("fake_date", "2025-01-01")
    month = extract_month(fake_date)
    
    # Initialize aggregators for round-level results
    hourly_results = []
    idp_hourly_metrics = []
    bid_dispatch_tracking = {}  # Will store hourly arrays: {player: {device: {lot: [hourly_data]}}}
    
    # NEW: Per-device hourly tracking for deep dive
    per_device_hourly_bids = {}  # {device_id: [{hour, lot_a_offered, lot_a_dispatched, ...}]}
    per_device_hourly_co2 = {}  # {device_id: [co2_kg per hour]}
    per_device_hourly_balancing = {}  # {device_id: [{hour, imbalance_mwh, cost}]}
    
    # Per-player aggregators
    per_player_planned = {pid: 0.0 for pid in players}
    per_player_dispatched = {pid: 0.0 for pid in players}
    per_player_actual = {pid: 0.0 for pid in players}
    per_player_revenue = {pid: 0.0 for pid in players}
    per_player_hourly_revenue = {pid: [0.0] * display_span for pid in players}
    per_player_hourly_variable_cost = {pid: [0.0] * display_span for pid in players}
    per_player_hourly_fixed_cost = {pid: [0.0] * display_span for pid in players}
    per_player_hourly_imbalance_cost = {pid: [0.0] * display_span for pid in players}
    per_player_hourly_congestion_revenue = {pid: [0.0] * display_span for pid in players}
    per_player_variable_cost = {pid: 0.0 for pid in players}  # Track variable/fuel costs
    per_player_fixed_cost = {pid: 0.0 for pid in players}  # Track fixed costs per hour
    per_player_imbalance_cost = {pid: 0.0 for pid in players}
    per_player_curtailment_cost = {pid: 0.0 for pid in players}
    per_player_congestion_revenue = {pid: 0.0 for pid in players}
    per_player_co2_emissions = {pid: 0.0 for pid in players}  # Track CO2 emissions in kg
    
    # Accumulator for bid dispatch data (lot-level dispatch tracking)
    all_bid_dispatch = {pid: {} for pid in players}  # {player_id: {device_id: {lot: [hourly_data]}}}
    
    # SAWEM Phase 2B: Delta-based settlement tracking
    per_player_da_volume = {pid: 0.0 for pid in players}
    per_player_id_delta = {pid: 0.0 for pid in players}
    per_player_da_revenue = {pid: 0.0 for pid in players}
    per_player_id_revenue = {pid: 0.0 for pid in players}
    
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
    
    # FORENSIC: Initialize tracking structures
    hour_reconciliation_data = []  # Track supply/demand balance per hour
    baseline_lookup_trace_list = []  # Track all baseline lookups
    
    # HOURLY MARKET CLEARING: Loop over each hour in the DISPLAY SPAN (round span hours)
    # Note: These hours may have been cleared in an earlier round (DAM) or now (IDM)
    for hour_offset in range(display_span):
        hour_idx = display_base_idx + hour_offset
        
        # Calculate hour of day for device-specific profiles
        hour_of_day = extract_hour_of_day(hour_idx, start_time)
        
        # FORENSIC: Create unified hour structure for this hour
        hour_structure = {
            'scenario_hour_idx': hour_idx,
            'round_hour_offset': hour_offset,
            'round_num': round_num,
            'hour_of_day': hour_of_day,
            'display_label': f'H{hour_idx} ({hour_of_day:02d}:00)'
        }
        
        # Generate supply/demand curves with device-specific hourly and seasonal profiles
        # Split capacity between DAM and IDM based on market config
        market_cfg = config.get("market", {})
        dam_capacity_pct = float(market_cfg.get("dam_synthetic_capacity_pct", 90.0))
        idm_capacity_pct = float(market_cfg.get("idm_synthetic_capacity_pct", 10.0))
        idm_price_discount_producer = float(market_cfg.get("idm_price_discount_producer_pct", 10.0))
        idm_price_markup_consumer = float(market_cfg.get("idm_price_markup_consumer_pct", 10.0))
        
        # Determine if this is DAM or IDM clearing
        is_dam_clearing = absolute_clearing_round
        is_gate_window_hour = (clearing_base_idx <= hour_idx < clearing_base_idx + clearing_span)
        # Product rule: in active rounds, display hours are always cleared.
        # Gate window only determines which updated offers are accepted at gate close.
        is_clearing_hour = True
        
        # Generate base curves
        base_supply, base_demand = generate_curves_from_config(
            config, 
            seed=seed, 
            hour_of_day=hour_of_day, 
            month_of_year=month
        )
        
        # Apply DAM/IDM split and price adjustment
        if is_dam_clearing:
            # DAM clearing → use DAM capacity/prices
            capacity_factor = dam_capacity_pct / 100.0
            synthetic_supply = [(price, qty * capacity_factor) for price, qty in base_supply]
            synthetic_demand = [(price, qty * capacity_factor) for price, qty in base_demand]
        else:
            # IDM clearing for this hour → use IDM capacity with price adjustment
            capacity_factor = idm_capacity_pct / 100.0
            
            # IDM Supply: Lower prices (discount for producers to incentivize sales)
            price_factor_supply = 1.0 - (idm_price_discount_producer / 100.0)
            synthetic_supply = [(price * price_factor_supply, qty * capacity_factor) for price, qty in base_supply]
            
            # IDM Demand: Higher prices (markup for consumers, more expensive)
            price_factor_demand = 1.0 + (idm_price_markup_consumer / 100.0)
            synthetic_demand = [(price * price_factor_demand, qty * capacity_factor) for price, qty in base_demand]
        
        if hour_offset == 0:  # Log first hour
            market_type = "DAM" if is_dam_clearing else "IDM"
            print(f"[SYNTHETIC_SPLIT] Hour {hour_idx}: {market_type}, capacity={capacity_factor*100:.0f}%, supply_steps={len(synthetic_supply)}, demand_steps={len(synthetic_demand)}")
            if id_delta_round:
                print(f"[IDM_GATE] Hour {hour_idx}: gate_window_match={is_gate_window_hour}")
        
        # Get device config for metadata building
        devices_cfg_for_clearing = config.get("devices", [])
        from .device_types import enrich_device_with_defaults
        devices_cfg_for_clearing = [enrich_device_with_defaults(d) for d in devices_cfg_for_clearing]
        
        # Build supply and demand curves for this specific hour
        supply_fallback_used = False
        if enable_bidding:
            supply, supply_bids = build_supply_from_bids(normalized_forecasts, hour_idx, synthetic_supply, config, round_events)
            demand, demand_bids = build_demand_from_bids(normalized_forecasts, hour_idx, synthetic_demand, config, round_events)

            # Fallback for empty supply curves:
            # - ID rounds: no positive deltas
            # - DAM/absolute rounds: no producer bids submitted
            if len(supply) == 0:
                if id_delta_round:
                    allow_supply_fallback = config.get("market", {}).get("id_fallback_to_synthetic_supply", True)
                    fallback_tag = "IDM_FALLBACK"
                else:
                    allow_supply_fallback = config.get("market", {}).get("dam_fallback_to_synthetic_supply", True)
                    fallback_tag = "DAM_FALLBACK"

                if allow_supply_fallback:
                    supply = synthetic_supply
                    supply_fallback_used = True
                    print(f"[{fallback_tag}] Round {round_num}, hour_idx={hour_idx}: Empty player supply curve, using synthetic supply fallback ({len(synthetic_supply)} steps)")
        else:
            supply = synthetic_supply
            supply_bids = []
            demand = synthetic_demand
            demand_bids = []
        
        # Market clearing for this hour
        # Build supply metadata for inflexible units filter
        supply_metadata = None
        if supply_bids:
            supply_metadata = []
            for bid in supply_bids:
                device_cfg_meta = next((d for d in devices_cfg_for_clearing if d.get('id') == bid.get('device_id')), None)
                if device_cfg_meta:
                    device_type = device_cfg_meta.get('type', '').lower()
                    at_min_load = False
                    # Check if bid represents minimum load
                    if bid.get('at_min_load', False):
                        at_min_load = True
                    supply_metadata.append({
                        'device_type': device_type,
                        'must_run': device_type == 'nuclear',
                        'at_min_load': at_min_load
                    })
                else:
                    supply_metadata.append(None)
        
        price, vol = clear_market(supply, demand,
                                  price_floor=config.get("market", {}).get("price_floor", -500),
                                  price_cap=config.get("market", {}).get("price_cap", 5000),
                                  supply_metadata=supply_metadata)
        
        # FORENSIC: Track reconciliation data for this hour
        supply_offered_total = sum(q for _, q in supply) if supply else 0.0
        supply_dispatched = vol  # Cleared volume
        demand_offered_total = sum(q for _, q in demand) if demand else 0.0
        
        reconciliation_entry = {
            **hour_structure,
            'supply_offered_total_mw': round(supply_offered_total, 3),
            'supply_dispatched_total_mw': round(supply_dispatched, 3),
            'demand_offered_total_mw': round(demand_offered_total, 3),
            'clearing_volume_mwh': round(vol, 3),
            'clearing_price_zar': round(price, 1),
            'supply_bids_count': len(supply),
            'demand_bids_count': len(demand)
        }
        
        # Debug output for market clearing
        if hour_offset == 0:  # Log first hour
            print(f"[MARKET_CLEAR_DEBUG] hour_idx={hour_idx}: SMP={price} ZAR/MWh, Volume={vol} MWh")
            print(f"[MARKET_CLEAR_DEBUG] hour_idx={hour_idx}: Supply steps: {len(supply)}, first={supply[0] if supply else 'N/A'}, last={supply[-1] if supply else 'N/A'}")
            print(f"[MARKET_CLEAR_DEBUG] hour_idx={hour_idx}: Demand steps: {len(demand)}, first={demand[0] if demand else 'N/A'}, last={demand[-1] if demand else 'N/A'}")
            # Show supply curve around clearing price
            relevant_supply = [(p, q) for p, q in supply if abs(p - price) < 100]
            if relevant_supply:
                print(f"[MARKET_CLEAR_DEBUG] hour_idx={hour_idx}: Supply near SMP ({price}): {relevant_supply[:5]}")
        
        # Track bid dispatch for this hour
        hour_bid_dispatch = {}
        if enable_bidding and (supply_bids or demand_bids):
            # Synthetic supply is always included in market clearing and must be
            # reflected in dispatch tracking for consistency.
            use_synthetic_in_dispatch = True
            
            # NEW: Extract DA dispatch for this hour for capacity validation
            da_dispatch_this_hour = {}
            if round_num > 1 and da_baseline_dispatch:
                for top_key, top_value in da_baseline_dispatch.items():
                    if not isinstance(top_value, dict):
                        continue

                    # Supports two payload shapes:
                    # 1) {player_id: {device_id: {A:[...],B:[...],C:[...]}}}
                    # 2) {device_id: {A:[...],B:[...],C:[...]}} (per-player row payload)
                    is_device_lots_map = any(isinstance(v, list) for v in top_value.values())

                    if is_device_lots_map:
                        device_entries = [(top_key, top_value)]
                    else:
                        device_entries = [
                            (device_id, lots)
                            for device_id, lots in top_value.items()
                            if isinstance(lots, dict)
                        ]

                    for device_id, lots in device_entries:
                        for lot_label, lot_hours in lots.items():
                            if isinstance(lot_hours, list) and hour_offset < len(lot_hours):
                                hour_data = lot_hours[hour_offset]
                                dispatched = hour_data.get('mw_dispatched', 0) if isinstance(hour_data, dict) else 0
                                if device_id not in da_dispatch_this_hour:
                                    da_dispatch_this_hour[device_id] = 0.0
                                da_dispatch_this_hour[device_id] += dispatched
            
            hour_bid_dispatch = track_bid_dispatch(
                supply_bids,
                price,
                vol,
                synthetic_supply,
                devices_cfg_for_clearing,
                da_dispatch_this_hour,
                round_events,
                player_type_by_player,
                use_synthetic_in_dispatch
            )
            demand_dispatch = track_demand_dispatch(demand_bids, price, vol, synthetic_demand)
            
            # Merge demand dispatch
            for player_id, devices in demand_dispatch.items():
                if player_id not in hour_bid_dispatch:
                    hour_bid_dispatch[player_id] = {}
                for device_id, lots in devices.items():
                    if device_id not in hour_bid_dispatch[player_id]:
                        hour_bid_dispatch[player_id][device_id] = {}
                    hour_bid_dispatch[player_id][device_id].update(lots)
            
            # Accumulate bid dispatch for all hours (for KPIs storage)
            for player_id, devices in hour_bid_dispatch.items():
                if player_id not in all_bid_dispatch:
                    all_bid_dispatch[player_id] = {}
                for device_id, lots in devices.items():
                    if device_id not in all_bid_dispatch[player_id]:
                        all_bid_dispatch[player_id][device_id] = {}
                    for lot_label, lot_data in lots.items():
                        if lot_label not in all_bid_dispatch[player_id][device_id]:
                            all_bid_dispatch[player_id][device_id][lot_label] = []
                        # Add hour_offset to lot_data for correct UI mapping
                        lot_data_with_hour = {**lot_data, 'hour_offset': hour_offset, 'hour_idx': hour_idx}
                        all_bid_dispatch[player_id][device_id][lot_label].append(lot_data_with_hour)
        
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
        hour_consumer_dispatched = {}
        hour_consumer_device_dispatch = {}
        hour_producer_dispatched_total = 0.0
        hour_producer_co2_total = 0.0

        for pid in players:
            planned = hour_plans.get(pid, 0.0)
            id_dispatched_only = 0.0
            
            # Get device config early (needed for capacity capping)
            devices_cfg = config.get("devices", [])
            # Enrich devices with defaults from DEVICE_SPECS (CO2 rates, etc.)
            from .device_types import enrich_device_with_defaults
            devices_cfg = [enrich_device_with_defaults(d) for d in devices_cfg]
            
            # Debug: Log first device's CO2 rate
            if hour_offset == 0 and pid == players[0] and devices_cfg:
                first_dev = devices_cfg[0]
                print(f"[CO2_DEBUG] First device: type={first_dev.get('type')}, co2_rate={first_dev.get('co2_emissions_kg_per_mwh', 'MISSING')}")
            
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
                            per_device_hourly_planned[device_id] = [0.0] * display_span
                            per_device_hourly_dispatched[device_id] = [0.0] * display_span
                            per_device_hourly_actual[device_id] = [0.0] * display_span
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

            # Keep ID-only dispatched before optional delivery-time DA fallback
            id_dispatched_only = dispatched

            # ID delta rounds: KPIs must reflect net commitment (DAM baseline + IDM delta)
            # Otherwise KPI cards (net) and device details (DAM + IDM) diverge by design.
            da_committed_by_device = {}
            da_committed_total = 0.0
            if round_num > 1 and id_delta_round:
                da_committed_by_device = _get_da_delivery_dispatch_by_device(pid, hour_idx, hour_offset) or {}
                da_committed_total = float(sum(da_committed_by_device.values())) if da_committed_by_device else 0.0

                if da_committed_total != 0.0:
                    # Add DA baseline to per-device planned/dispatched so breakdown + KPIs reconcile.
                    for device_id, da_mw in da_committed_by_device.items():
                        if device_id not in per_device_hourly_planned:
                            per_device_hourly_planned[device_id] = [0.0] * display_span
                        if device_id not in per_device_hourly_dispatched:
                            per_device_hourly_dispatched[device_id] = [0.0] * display_span
                        if device_id not in per_device_hourly_actual:
                            per_device_hourly_actual[device_id] = [0.0] * display_span

                        per_device_hourly_planned[device_id][hour_offset] = max(
                            float(per_device_hourly_planned[device_id][hour_offset] or 0.0),
                            float(da_mw)
                        )
                        per_device_hourly_dispatched[device_id][hour_offset] = (
                            float(per_device_hourly_dispatched[device_id][hour_offset] or 0.0) + float(da_mw)
                        )

                    # Net planned/dispatched for settlement KPIs
                    planned = float(planned) + float(da_committed_total)
                    dispatched = float(dispatched) + float(da_committed_total)
            
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
            if not player_device_ids:
                player_device_ids = {
                    d.get('id') for d in devices_cfg
                    if d.get('id') and (d.get('owner_id') == pid or d.get('player_id') == pid)
                }
            
            # Check if any of these devices are consumers (loads)
            for device_id in player_device_ids:
                device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                if device and 'load' in device.get('type', '').lower():
                    is_consumer = True
                    break

            # Ensure DA baseline devices are included in classification/allocations
            if round_num > 1 and id_delta_round and da_committed_by_device:
                player_device_ids.update(da_committed_by_device.keys())

            # Delivery-time fallback for ID delta rounds:
            # For non-clearing display hours, include committed DA dispatch in KPI/device totals
            # when no ID quantity was dispatched in this hour.
            is_delivery_hour = (id_delta_round and not is_clearing_hour)
            delivery_da_dispatch = _get_da_delivery_dispatch_mwh(pid, hour_idx, hour_offset) if is_delivery_hour else 0.0
            delivery_da_dispatch_by_device = _get_da_delivery_dispatch_by_device(pid, hour_idx, hour_offset) if is_delivery_hour else {}

            if is_delivery_hour and abs(dispatched) < 0.000001 and delivery_da_dispatch > 0:
                dispatched = float(delivery_da_dispatch)
                planned = max(float(planned), float(delivery_da_dispatch))

                # Populate per-device hourly planned/dispatched from DA commitments
                # so deep-dive and hourly breakdown align with header KPIs.
                for device_id, da_mw in delivery_da_dispatch_by_device.items():
                    if device_id not in per_device_hourly_planned:
                        per_device_hourly_planned[device_id] = [0.0] * display_span
                    if device_id not in per_device_hourly_dispatched:
                        per_device_hourly_dispatched[device_id] = [0.0] * display_span
                    if device_id not in per_device_hourly_actual:
                        per_device_hourly_actual[device_id] = [0.0] * display_span

                    per_device_hourly_planned[device_id][hour_offset] = max(
                        float(per_device_hourly_planned[device_id][hour_offset]),
                        float(da_mw)
                    )
                    per_device_hourly_dispatched[device_id][hour_offset] = float(da_mw)
            
            # Apply realistic availability envelope per device
            # This enforces physical constraints (e.g., solar = 0 at night)
            # NOTE: Only for GENERATORS! Consumers don't have availability constraints.
            actual_before_envelope = dispatched
            actual_constrained = 0.0
            device_ids_for_noise = set()
            
            if is_consumer:
                # Consumers: actual = dispatched with consumption noise
                # Events modify actual consumption (e.g. heatwave increases demand)
                if dispatched <= 0:
                    actual = 0.0
                else:
                    # Apply events to consumer demand (e.g. heatwave increases consumption)
                    event_mult = 1.0
                    event_add = 0.0
                    
                    if enable_bidding and pid in hour_bid_dispatch:
                        # Apply events per device
                        for device_id in hour_bid_dispatch[pid].keys():
                            device = next((d for d in devices_cfg if d.get('id') == device_id), None)
                            if device:
                                device_type = device.get('type', '')
                                dev_mult, dev_add = get_device_event_modifiers(
                                    device,
                                    device_type,
                                    round_events,
                                    pid,
                                    player_type_by_player.get(int(pid))
                                )
                                event_mult *= dev_mult
                                event_add += dev_add
                    
                    # Events modify the actual consumption (not the bid)
                    base_actual = dispatched
                    actual_with_events = (base_actual * event_mult) + event_add
                    
                    # Add noise on top of event-modified actual
                    noise = random.uniform(-frac, frac) * max(1.0, actual_with_events)
                    actual = max(0.0, actual_with_events + noise)
                    
                    if event_mult != 1.0 or event_add != 0.0:
                        print(f"[EVENT_DEMAND] Consumer {pid}: Dispatched={dispatched:.1f}, Event mult={event_mult}, add={event_add} → Actual={actual:.1f} MW")
                
                # Track consumer actual per device for hourly breakdown
                if enable_bidding and pid in hour_bid_dispatch:
                    # Distribute actual proportionally to each consumer device
                    total_dispatched = dispatched
                    device_ids_for_distribution = set(hour_bid_dispatch[pid].keys())
                    if round_num > 1 and id_delta_round and da_committed_by_device:
                        device_ids_for_distribution.update(da_committed_by_device.keys())

                    for device_id in device_ids_for_distribution:
                        device_dispatched = 0.0
                        if device_id in per_device_hourly_dispatched:
                            try:
                                device_dispatched = float(per_device_hourly_dispatched[device_id][hour_offset] or 0.0)
                            except Exception:
                                device_dispatched = 0.0
                        if total_dispatched > 0:
                            device_actual = actual * (device_dispatched / total_dispatched)
                        else:
                            device_actual = 0.0
                        
                        # Track device actual
                        if device_id in per_device_hourly_actual:
                            per_device_hourly_actual[device_id][hour_offset] = device_actual
                            
                            # NEW: Track balancing (imbalance) per consumer device per hour
                            # For ID delta rounds, imbalance is against DA + ID total dispatch
                            if absolute_clearing_round:
                                # Absolute-clearing rounds: pure DAM-style dispatch in this round
                                da_dispatched_for_device = device_dispatched
                                id_dispatched_for_device = 0.0
                            else:
                                # ID delta rounds: DA baseline (committed) + ID delta (net minus baseline)
                                da_dispatched_for_device = float((da_committed_by_device or {}).get(device_id, 0.0) or 0.0)
                                id_dispatched_for_device = float(device_dispatched) - da_dispatched_for_device
                                # Safety: avoid tiny negative due to float noise
                                if abs(id_dispatched_for_device) < 0.000001:
                                    id_dispatched_for_device = 0.0
                            
                            # Total committed = DA (Round 1) + ID (current round)
                            total_dispatched = da_dispatched_for_device + id_dispatched_for_device
                            device_imbalance_mwh = device_actual - total_dispatched
                            
                            if device_imbalance_mwh > 0:  # Over-consumption
                                device_imbalance_cost = device_imbalance_mwh * 1200  # up_price
                            elif device_imbalance_mwh < 0:  # Under-consumption
                                device_imbalance_cost = abs(device_imbalance_mwh) * 800  # down_price
                            else:
                                device_imbalance_cost = 0.0
                            
                            if device_id not in per_device_hourly_balancing:
                                per_device_hourly_balancing[device_id] = []
                            per_device_hourly_balancing[device_id].append({
                                'scenario_hour_idx': hour_idx,
                                'hour_idx': hour_idx,
                                'hour_offset': hour_offset,
                                'round_hour_offset': hour_offset,
                                'round_num': round_num,
                                'hour_of_day': hour_of_day,
                                'da_dispatched_mwh': round(da_dispatched_for_device, 3),
                                'id_dispatched_mwh': round(id_dispatched_for_device, 3),
                                'total_dispatched_mwh': round(total_dispatched, 3),
                                'actual_mwh': round(device_actual, 3),
                                'imbalance_mwh': round(device_imbalance_mwh, 3),
                                'balancing_cost_zar': round(device_imbalance_cost, 2),
                                'balancing_price': 1200 if device_imbalance_mwh > 0 else (800 if device_imbalance_mwh < 0 else 0)
                            })
            elif enable_bidding and pid in hour_bid_dispatch:
                # Generators: Per-device envelope enforcement for multi-bid mode
                device_ids_for_envelope = set(hour_bid_dispatch[pid].keys())
                if round_num > 1 and id_delta_round and da_committed_by_device:
                    device_ids_for_envelope.update(da_committed_by_device.keys())

                for device_id in device_ids_for_envelope:
                    device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                    if device:
                        device_dispatched = 0.0
                        if device_id in per_device_hourly_dispatched:
                            try:
                                device_dispatched = float(per_device_hourly_dispatched[device_id][hour_offset] or 0.0)
                            except Exception:
                                device_dispatched = 0.0
                        availability = calculate_realistic_availability(device, hour_of_day, config)
                        max_available = device_dispatched * availability
                        device_actual = min(device_dispatched, max_available)
                        
                        actual_constrained += device_actual
                actual = actual_constrained
                device_ids_for_noise = set(device_ids_for_envelope)
            elif round_num > 1 and id_delta_round:
                # ID-delta carry-over edge case:
                # If player has committed per-device dispatch (DA baseline and/or device-level dispatched)
                # but no hour_bid_dispatch entry for this hour, do NOT use global min-availability fallback.
                # Compute actual from player's committed devices with device-level availability.
                device_ids_for_envelope = set(da_committed_by_device.keys())
                for device_id in player_device_ids:
                    try:
                        dispatched_h = float(per_device_hourly_dispatched.get(device_id, [0.0] * display_span)[hour_offset] or 0.0)
                    except Exception:
                        dispatched_h = 0.0
                    if dispatched_h > 0.0:
                        device_ids_for_envelope.add(device_id)

                if device_ids_for_envelope:
                    for device_id in device_ids_for_envelope:
                        try:
                            device_dispatched = float(per_device_hourly_dispatched.get(device_id, [0.0] * display_span)[hour_offset] or 0.0)
                        except Exception:
                            device_dispatched = 0.0
                        if device_dispatched <= 0.0:
                            continue

                        device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                        availability = calculate_realistic_availability(device, hour_of_day, config) if device else 1.0
                        max_available = device_dispatched * availability
                        device_actual = min(device_dispatched, max_available)
                        actual_constrained += device_actual

                    actual = actual_constrained
                    device_ids_for_noise = set(device_ids_for_envelope)
                else:
                    # No player-specific committed devices: keep legacy aggregate fallback
                    min_availability = 1.0
                    for device in devices_cfg:
                        avail = calculate_realistic_availability(device, hour_of_day, config)
                        if avail < min_availability:
                            min_availability = avail
                    max_available = dispatched * min_availability
                    actual = min(dispatched, max_available)
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
            
            # NOTE: Events are now applied at capacity level in track_bid_dispatch,
            # not here at actual delivery. Actual follows dispatched with noise only.
            
            # Add noise on top of actual (only for generators - consumers already have noise)
            if not is_consumer:
                noise = random.uniform(-frac, frac) * max(1.0, actual)
                actual = max(0.0, actual + noise)
                
                # Update per-device actual with event and noise applied (proportionally)
                if device_ids_for_noise:
                    for device_id in device_ids_for_noise:
                        device_dispatched = 0.0
                        if device_id in per_device_hourly_dispatched:
                            try:
                                device_dispatched = float(per_device_hourly_dispatched[device_id][hour_offset] or 0.0)
                            except Exception:
                                device_dispatched = 0.0
                        if actual_constrained > 0:
                            # Proportionally distribute actual (with noise) to each device
                            device_actual_with_noise = actual * (device_dispatched / dispatched) if dispatched > 0 else 0.0
                        else:
                            device_actual_with_noise = 0.0
                        
                        # Track device actual with noise applied
                        if device_id not in per_device_hourly_actual:
                            per_device_hourly_actual[device_id] = [0.0] * display_span
                        per_device_hourly_actual[device_id][hour_offset] = device_actual_with_noise

                        # NEW: Track balancing (imbalance) per device per hour
                        # For ID delta rounds, imbalance is against DA + ID total dispatch
                        if absolute_clearing_round:
                            # Absolute-clearing rounds: pure DAM-style dispatch in this round
                            da_dispatched_for_device = device_dispatched
                            id_dispatched_for_device = 0.0
                        else:
                            # ID delta rounds: DA baseline (committed) + ID delta (net minus baseline)
                            da_dispatched_for_device = float((da_committed_by_device or {}).get(device_id, 0.0) or 0.0)
                            id_dispatched_for_device = float(device_dispatched) - da_dispatched_for_device
                            if abs(id_dispatched_for_device) < 0.000001:
                                id_dispatched_for_device = 0.0

                        # Total committed = DA (Round 1) + ID (current round)
                        total_dispatched = da_dispatched_for_device + id_dispatched_for_device
                        device_imbalance_mwh = device_actual_with_noise - total_dispatched

                        if device_imbalance_mwh > 0:  # Over-delivery
                            device_imbalance_cost = device_imbalance_mwh * 1200  # up_price
                        elif device_imbalance_mwh < 0:  # Under-delivery
                            device_imbalance_cost = abs(device_imbalance_mwh) * 800  # down_price
                        else:
                            device_imbalance_cost = 0.0

                        if device_id not in per_device_hourly_balancing:
                            per_device_hourly_balancing[device_id] = []
                        per_device_hourly_balancing[device_id].append({
                            'hour_idx': hour_idx,
                            'hour_offset': hour_offset,
                            'da_dispatched_mwh': round(da_dispatched_for_device, 3),
                            'id_dispatched_mwh': round(id_dispatched_for_device, 3),
                            'total_dispatched_mwh': round(total_dispatched, 3),
                            'actual_mwh': round(device_actual_with_noise, 3),
                            'imbalance_mwh': round(device_imbalance_mwh, 3),
                            'balancing_cost_zar': round(device_imbalance_cost, 2),
                            'balancing_price': 1200 if device_imbalance_mwh > 0 else (800 if device_imbalance_mwh < 0 else 0)
                        })
            
            # Settlement mode:
            # - absolute_clearing_round: normal revenue at current price
            # - id_delta_round: DA portion @ DA_SMP + ID delta @ current price
            if is_consumer:
                # Consumers pay (negative revenue)
                if absolute_clearing_round:
                    # DA: Simple calculation
                    revenue = -round(dispatched * price, 0)
                    # Track for metadata
                    per_player_da_volume[pid] += dispatched
                    per_player_da_revenue[pid] += revenue
                else:
                    # ID: Split settlement (use cleared DAM dispatch as baseline when available)
                    da_volume = float(da_committed_total or 0.0) if (round_num > 1 and id_delta_round) else 0.0
                    if da_volume == 0.0:
                        forecast_data = normalized_forecasts.get(pid, {})
                        da_hours = forecast_data.get('da_hours', [])
                        if hour_idx < len(da_hours):
                            da_volume = float(da_hours[hour_idx] or 0.0)

                    id_delta = float(id_dispatched_only or 0.0)
                    da_revenue = -round(da_volume * (da_smp or price), 0)
                    id_revenue = -round(id_delta * price, 0)
                    revenue = da_revenue + id_revenue

                    per_player_da_volume[pid] += da_volume
                    per_player_id_delta[pid] += id_delta
                    per_player_da_revenue[pid] += da_revenue
                    per_player_id_revenue[pid] += id_revenue

                    if hour_offset == 0:  # Log first hour
                        print(f"[DELTA_SETTLEMENT] Consumer {pid}, h={hour_idx}: DA={da_volume:.1f}@{da_smp or price:.1f}={da_revenue:.0f}, Delta={id_delta:.1f}@{price:.1f}={id_revenue:.0f}, Total={revenue:.0f}")
            else:
                # Generators earn (positive revenue)
                if absolute_clearing_round:
                    # DA: Simple calculation
                    revenue = round(dispatched * price, 0)
                    # Track for metadata
                    per_player_da_volume[pid] += dispatched
                    per_player_da_revenue[pid] += revenue
                else:
                    # ID: Split settlement (use cleared DAM dispatch as baseline when available)
                    da_volume = float(da_committed_total or 0.0) if (round_num > 1 and id_delta_round) else 0.0
                    if da_volume == 0.0:
                        forecast_data = normalized_forecasts.get(pid, {})
                        da_hours = forecast_data.get('da_hours', [])
                        if hour_idx < len(da_hours):
                            da_volume = float(da_hours[hour_idx] or 0.0)

                    id_delta = float(id_dispatched_only or 0.0)
                    da_revenue = round(da_volume * (da_smp or price), 0)
                    id_revenue = round(id_delta * price, 0)
                    revenue = da_revenue + id_revenue

                    per_player_da_volume[pid] += da_volume
                    per_player_id_delta[pid] += id_delta
                    per_player_da_revenue[pid] += da_revenue
                    per_player_id_revenue[pid] += id_revenue

                    if hour_offset == 0:  # Log first hour
                        print(f"[DELTA_SETTLEMENT] Generator {pid}, h={hour_idx}: DA={da_volume:.1f}@{da_smp or price:.1f}={da_revenue:.0f}, Delta={id_delta:.1f}@{price:.1f}={id_revenue:.0f}, Total={revenue:.0f}")
            
            # Variable costs and fixed costs: Calculate fuel/operational costs for generators
            variable_cost = 0.0
            fixed_cost = 0.0
            co2_emissions = 0.0
            if not is_consumer:
                # Fixed cost: charge every producer device in each clearing hour, regardless of dispatch
                if is_clearing_hour:
                    fixed_device_ids = set(player_device_ids)
                    if pid in normalized_forecasts:
                        forecast_data = normalized_forecasts[pid]
                        if isinstance(forecast_data, dict) and forecast_data.get('bids'):
                            fixed_device_ids.update(forecast_data['bids'].keys())
                    if enable_bidding and pid in hour_bid_dispatch:
                        fixed_device_ids.update(hour_bid_dispatch[pid].keys())
                    if not fixed_device_ids:
                        fixed_device_ids = {
                            d.get('id') for d in devices_cfg
                            if d.get('id') and (d.get('owner_id') == pid or d.get('player_id') == pid)
                        }

                    for device_id in fixed_device_ids:
                        device = next((d for d in devices_cfg if d.get('id') == device_id), None)
                        if not device:
                            continue
                        if 'load' in str(device.get('type', '')).lower():
                            continue
                        device_fixed_cost = float(device.get('fixed_cost_zar_per_hour', 0.0) or 0.0)
                        fixed_cost += round(max(0.0, device_fixed_cost), 0)

                if enable_bidding:
                    # Calculate variable costs and CO2 per device based on net committed dispatch
                    # (DAM baseline + IDM delta in ID rounds).
                    for device_id in player_device_ids:
                        device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                        if not device:
                            continue
                        if 'load' in str(device.get('type', '')).lower():
                            continue

                        try:
                            device_dispatched = float(per_device_hourly_dispatched.get(device_id, [0.0] * display_span)[hour_offset] or 0.0)
                        except Exception:
                            device_dispatched = 0.0

                        if abs(device_dispatched) < 0.000001:
                            continue

                        device_variable_cost = float(device.get('variable_cost_zar_per_mwh', 0.0) or 0.0)
                        variable_cost += round(device_dispatched * device_variable_cost, 0)

                        device_co2_rate = float(device.get('co2_emissions_kg_per_mwh', device.get('co2_kg_per_mwh', 0.0)) or 0.0)
                        device_co2_hour = device_dispatched * device_co2_rate
                        co2_emissions += device_co2_hour

                        if device_id not in per_device_hourly_co2:
                            per_device_hourly_co2[device_id] = []
                        per_device_hourly_co2[device_id].append({
                            'scenario_hour_idx': hour_idx,
                            'hour_idx': hour_idx,
                            'hour_offset': hour_offset,
                            'round_hour_offset': hour_offset,
                            'round_num': round_num,
                            'hour_of_day': hour_of_day,
                            'co2_kg': round(device_co2_hour, 2),
                            'co2_rate': device_co2_rate,
                            'dispatched_mwh': device_dispatched
                        })

                        if hour_offset == 0 and pid == players[0]:
                            print(f"[CO2_DEBUG] Device {device_id}: dispatched={device_dispatched:.1f}, co2_rate={device_co2_rate}, co2_total={co2_emissions:.1f}")
                elif is_delivery_hour and delivery_da_dispatch_by_device:
                    # Delivery-hour accounting: emissions from committed DA dispatch, even if no ID clearing now
                    for device_id, device_dispatched in delivery_da_dispatch_by_device.items():
                        device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                        if not device:
                            continue

                        device_co2_rate = device.get('co2_emissions_kg_per_mwh', device.get('co2_kg_per_mwh', 0.0))
                        device_co2_hour = float(device_dispatched) * float(device_co2_rate or 0.0)
                        co2_emissions += device_co2_hour

                        if device_id not in per_device_hourly_co2:
                            per_device_hourly_co2[device_id] = []
                        per_device_hourly_co2[device_id].append({
                            'scenario_hour_idx': hour_idx,
                            'hour_idx': hour_idx,
                            'hour_offset': hour_offset,
                            'round_hour_offset': hour_offset,
                            'round_num': round_num,
                            'hour_of_day': hour_of_day,
                            'co2_kg': round(device_co2_hour, 2),
                            'co2_rate': device_co2_rate,
                            'dispatched_mwh': float(device_dispatched)
                        })

                        if hour_offset == 0 and pid == players[0]:
                            print(f"[CO2_DELIVERY] Player {pid}, h={hour_idx}: total_co2={co2_emissions:.1f} kg from DA delivery dispatch")
                elif dispatched > 0:
                    # Fallback CO2 calculation when bidding is disabled: estimate from player's device portfolio
                    # Get player's devices from their player type
                    try:
                        from .models import SessionPlayerType
                        spt = SessionPlayerType.query.filter_by(session_id=session_id, user_id=pid).first()
                        if spt and spt.type_id:
                            pt_cfg = next((pt for pt in player_types_cfg if pt.get("id") == spt.type_id), None)
                            if pt_cfg:
                                device_ids = pt_cfg.get("devices", [])
                                player_devices = [d for d in devices_cfg if d.get("id") in device_ids]
                                # Calculate weighted average CO2 rate based on device capacities
                                total_capacity = 0.0
                                weighted_co2 = 0.0
                                for device in player_devices:
                                    device_type = device.get('type', '').lower()
                                    if 'generator' in device_type or 'renewable' in device_type:
                                        capacity = float(device.get('capacity_mw', device.get('max_mw', 0.0)))
                                        co2_rate = device.get('co2_emissions_kg_per_mwh', device.get('co2_kg_per_mwh', 0.0))
                                        total_capacity += capacity
                                        weighted_co2 += capacity * co2_rate
                                if total_capacity > 0:
                                    avg_co2_rate = weighted_co2 / total_capacity
                                    co2_emissions = dispatched * avg_co2_rate
                    except Exception as e:
                        print(f"[CO2_FALLBACK] Failed to estimate CO2 for player {pid}: {e}")
            
            # BUG FIX N3: Imbalance settlement only if market actually cleared (vol > 0)
            # Exception: Must-run units (nuclear) have imbalance even without market clearing
            # Generators: actual != dispatched → imbalance cost/revenue
            # Consumers: actual != dispatched → over/under consumption penalty
            imbalance_cost = 0.0
            
            # Check if this player has must-run devices
            has_must_run = False
            if enable_bidding and pid in hour_bid_dispatch:
                for device_id in hour_bid_dispatch[pid].keys():
                    device = next((d for d in devices_cfg if d.get("id") == device_id), None)
                    if device and device.get('must_run', False):
                        has_must_run = True
                        break
            
            # Only calculate imbalance if volume > 0 OR player has must-run units
            if vol > 0 or has_must_run:
                imbalance_cost = settle_balancing(dispatched, actual)
            # Else: No market clearing, no dispatch plan → no imbalance penalty
            
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
            if pid in per_player_hourly_revenue and 0 <= hour_offset < len(per_player_hourly_revenue[pid]):
                per_player_hourly_revenue[pid][hour_offset] += revenue
            per_player_variable_cost[pid] += variable_cost
            per_player_fixed_cost[pid] += fixed_cost
            per_player_imbalance_cost[pid] += imbalance_cost
            per_player_curtailment_cost[pid] += curtailment_cost
            per_player_congestion_revenue[pid] += congestion_revenue
            if 0 <= hour_offset < display_span:
                per_player_hourly_variable_cost[pid][hour_offset] += variable_cost
                per_player_hourly_fixed_cost[pid][hour_offset] += fixed_cost
                per_player_hourly_imbalance_cost[pid][hour_offset] += imbalance_cost
                per_player_hourly_congestion_revenue[pid][hour_offset] += congestion_revenue

            if is_consumer:
                hour_consumer_dispatched[pid] = max(0.0, float(dispatched))
                consumer_device_dispatch = {}
                if enable_bidding and pid in hour_bid_dispatch:
                    for device_id, device_dispatch in hour_bid_dispatch[pid].items():
                        device_dispatched = sum(bid_info.get('mw_dispatched', 0.0) for bid_info in device_dispatch.values())
                        if device_dispatched > 0:
                            consumer_device_dispatch[device_id] = float(device_dispatched)
                hour_consumer_device_dispatch[pid] = consumer_device_dispatch
            else:
                hour_producer_dispatched_total += max(0.0, float(dispatched))
                hour_producer_co2_total += max(0.0, float(co2_emissions))
                per_player_co2_emissions[pid] += co2_emissions

        # Consumer CO2 allocation:
        # Assign each consumer the market-average footprint of cleared energy in this hour
        # (total producer CO2 including synthetic supply share / cleared volume).
        if vol > 0 and hour_consumer_dispatched:
            synthetic_dispatched = max(0.0, float(vol) - hour_producer_dispatched_total)
            market_co2_total_kg = hour_producer_co2_total + (synthetic_dispatched * synthetic_supply_co2_rate)
            market_co2_intensity = market_co2_total_kg / float(vol)

            for consumer_pid, consumer_dispatched in hour_consumer_dispatched.items():
                consumer_co2_kg = max(0.0, float(consumer_dispatched)) * market_co2_intensity
                per_player_co2_emissions[consumer_pid] += consumer_co2_kg

                device_dispatch_map = hour_consumer_device_dispatch.get(consumer_pid, {})
                total_device_dispatched = sum(device_dispatch_map.values())
                if total_device_dispatched > 0:
                    for device_id, device_dispatched in device_dispatch_map.items():
                        device_co2_kg = consumer_co2_kg * (float(device_dispatched) / float(total_device_dispatched))
                        if device_id not in per_device_hourly_co2:
                            per_device_hourly_co2[device_id] = []
                        per_device_hourly_co2[device_id].append({
                            'scenario_hour_idx': hour_idx,
                            'hour_idx': hour_idx,
                            'hour_offset': hour_offset,
                            'round_hour_offset': hour_offset,
                            'round_num': round_num,
                            'hour_of_day': hour_of_day,
                            'co2_kg': round(device_co2_kg, 2),
                            'co2_rate': market_co2_intensity,
                            'dispatched_mwh': float(device_dispatched)
                        })
        
        # FORENSIC: Calculate per-player and per-device dispatch sums for reconciliation
        per_player_dispatched_sum = sum(per_player_dispatched.values())
        per_device_dispatched_sum = sum(
            sum(device_hours.values()) if isinstance(device_hours, dict) else 0
            for device_hours in per_device_hourly_dispatched.values()
        )
        
        # Add to reconciliation entry
        reconciliation_entry['per_player_dispatched_sum_mwh'] = round(per_player_dispatched_sum, 3)
        reconciliation_entry['per_device_dispatched_sum_mwh'] = round(per_device_dispatched_sum, 3)
        
        # Delta checks (FAIL/WARN thresholds)
        delta_clearing_vs_player = abs(vol - per_player_dispatched_sum)
        delta_clearing_vs_device = abs(vol - per_device_dispatched_sum)
        
        reconciliation_entry['delta_clearing_vs_player'] = round(delta_clearing_vs_player, 3)
        reconciliation_entry['delta_clearing_vs_device'] = round(delta_clearing_vs_device, 3)
        reconciliation_entry['status'] = 'PASS'
        
        if delta_clearing_vs_player > 0.001 or delta_clearing_vs_device > 0.001:
            reconciliation_entry['status'] = 'FAIL'
            reconciliation_entry['issue'] = f'Dispatch mismatch: clearing={vol}, player_sum={per_player_dispatched_sum}, device_sum={per_device_dispatched_sum}'
        
        hour_reconciliation_data.append(reconciliation_entry)
        
        # Store hourly result with unified hour structure
        hour_idp = round(price, 1)
        hour_id_trade_count = 0
        hour_id_volume_mwh = 0.0

        # Hourly IDP for intraday clearing hours (Round 2+ ID-delta market)
        if round_num > 1 and id_delta_round and is_clearing_hour and enable_bidding:
            load_device_ids = {
                d.get('id')
                for d in devices_cfg_for_clearing
                if isinstance(d, dict) and 'load' in str(d.get('type', '')).lower()
            }
            hour_id_cleared_bids = []
            for player_id, player_devices in hour_bid_dispatch.items():
                if not isinstance(player_devices, dict):
                    continue
                for device_id, lot_map in player_devices.items():
                    if device_id in load_device_ids or not isinstance(lot_map, dict):
                        continue
                    for _, lot_data in lot_map.items():
                        if not isinstance(lot_data, dict):
                            continue
                        dispatched = float(lot_data.get('mw_dispatched', 0.0) or 0.0)
                        price_bid = float(lot_data.get('price_bid', 0.0) or 0.0)
                        if dispatched > 0:
                            hour_id_cleared_bids.append((price_bid, dispatched))

            if hour_id_cleared_bids:
                hour_idp = float(calculate_idp(hour_id_cleared_bids, price, cap_percent=5.0))
                hour_id_trade_count = len(hour_id_cleared_bids)
                hour_id_volume_mwh = round(sum(vol for _, vol in hour_id_cleared_bids), 3)
            else:
                hour_idp = round(price, 1)
                hour_id_trade_count = 0
                hour_id_volume_mwh = 0.0

        idp_hourly_metrics.append({
            'hour_idx': hour_idx,
            'idp': float(hour_idp),
            'id_trade_count': int(hour_id_trade_count),
            'id_volume_mwh': float(hour_id_volume_mwh)
        })

        hourly_results.append({
            **hour_structure,
            "hour_idx": hour_idx,
            "hour_offset": hour_offset,
            "is_clearing_hour": bool(is_clearing_hour),
            "smp": round(price, 1),
            "idp": round(hour_idp, 2),
            "id_trade_count": int(hour_id_trade_count),
            "id_volume_mwh": round(hour_id_volume_mwh, 3),
            "volume": round(vol, 3),
        })
        
        # Store hour bid dispatch as hourly arrays (not aggregated)
        for player_id, devices in hour_bid_dispatch.items():
            if player_id not in bid_dispatch_tracking:
                bid_dispatch_tracking[player_id] = {}
            for device_id, lots in devices.items():
                if device_id not in bid_dispatch_tracking[player_id]:
                    bid_dispatch_tracking[player_id][device_id] = {}
                # Store hourly data for each lot
                for bid_label, bid_info in lots.items():
                    if bid_label not in bid_dispatch_tracking[player_id][device_id]:
                        bid_dispatch_tracking[player_id][device_id][bid_label] = []  # NEW: Array of hourly records
                    
                    # Append this hour's data
                    bid_dispatch_tracking[player_id][device_id][bid_label].append({
                        'hour_idx': hour_idx,
                        'hour_offset': hour_offset,
                        'mw_offered': round(bid_info.get('mw_offered', 0.0), 3),
                        'mw_offered_signed': round(bid_info.get('mw_offered_signed', bid_info.get('mw_offered', 0.0)), 3),
                        'mw_dispatched': round(bid_info.get('mw_dispatched', 0.0), 3),
                        'mw_dispatched_signed': round(bid_info.get('mw_dispatched_signed', bid_info.get('mw_dispatched', 0.0)), 3),
                        'price_bid': round(bid_info.get('price_bid', 0.0), 2),
                        'smp': round(price, 1),
                        'acceptance_ratio': round(bid_info.get('mw_dispatched', 0.0) / bid_info.get('mw_offered', 1.0) if bid_info.get('mw_offered', 0.0) > 0 else 0.0, 3),
                        'is_buyback': bool(bid_info.get('is_buyback', False))
                    })
    
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
        # - Fixed Cost: Hourly fixed costs for generators (0 for consumers)
        # - Imbalance Cost: Penalty for deviation from dispatch
        # - Congestion Revenue: Grid congestion payments
        # Note: Curtailment is informational only, already reflected in lower revenue
        profit = (per_player_revenue[pid] - per_player_variable_cost[pid] - per_player_fixed_cost[pid] - 
                  per_player_imbalance_cost[pid] + per_player_congestion_revenue[pid])
        
        # Build detailed hourly breakdown for this player
        hourly_breakdown = []
        for h_idx, hour_result in enumerate(hourly_results):
            hour_idx = hour_result.get("scenario_hour_idx", hour_result.get("hour_idx", hour_result.get("hour_offset", hour_result.get("hour", h_idx))))
            hour_detail = {
                "hour": hour_idx,
                "smp": hour_result["smp"],
                "planned_mw": 0.0,
                "dispatched_mw": 0.0,
                "actual_mw": 0.0,
                "revenue_zar": 0.0,
                "variable_cost_zar": 0.0,
                "fixed_cost_zar": 0.0,
                "imbalance_mwh": 0.0,
                "imbalance_cost_zar": 0.0,
                "curtailment_mwh": 0.0,
                "curtailment_cost_zar": 0.0,
                "congestion_revenue_zar": 0.0,
                "profit_zar": 0.0,
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
                # Enrich with defaults if missing
                from .device_types import enrich_device_with_defaults
                devices_cfg = [enrich_device_with_defaults(d) for d in devices_cfg]
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
                
                # Check if consumer
                # Find device in config to check type
                devices_cfg = config.get("devices", [])
                # Enrich with defaults if missing
                from .device_types import enrich_device_with_defaults
                devices_cfg = [enrich_device_with_defaults(d) for d in devices_cfg]
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
            
            if pid in per_player_hourly_revenue and h_idx < len(per_player_hourly_revenue[pid]):
                hour_detail["revenue_zar"] = round(per_player_hourly_revenue[pid][h_idx], 0)
            if pid in per_player_hourly_variable_cost and h_idx < len(per_player_hourly_variable_cost[pid]):
                hour_detail["variable_cost_zar"] = round(per_player_hourly_variable_cost[pid][h_idx], 0)
            if pid in per_player_hourly_fixed_cost and h_idx < len(per_player_hourly_fixed_cost[pid]):
                hour_detail["fixed_cost_zar"] = round(per_player_hourly_fixed_cost[pid][h_idx], 0)
            if pid in per_player_hourly_imbalance_cost and h_idx < len(per_player_hourly_imbalance_cost[pid]):
                hour_detail["imbalance_cost_zar"] = round(per_player_hourly_imbalance_cost[pid][h_idx], 0)
            if pid in per_player_hourly_congestion_revenue and h_idx < len(per_player_hourly_congestion_revenue[pid]):
                hour_detail["congestion_revenue_zar"] = round(per_player_hourly_congestion_revenue[pid][h_idx], 0)

            hour_detail["profit_zar"] = round(
                hour_detail["revenue_zar"]
                - hour_detail["variable_cost_zar"]
                - hour_detail["fixed_cost_zar"]
                - hour_detail["imbalance_cost_zar"]
                + hour_detail["congestion_revenue_zar"],
                0
            )

            hourly_breakdown.append(hour_detail)

        # Build per-device hourly breakdown for this player
        device_hourly_breakdown = {}
        device_forecast = normalized_forecasts.get(pid, {})
        device_bids_all = device_forecast.get('bids', {})
        devices_cfg = config.get("devices", [])

        player_device_ids = set(device_bids_all.keys()) if device_bids_all else set()

        # Add devices from player's submitted forecast devices (authoritative per-player device list)
        devices_data = device_forecast.get('devices', [])
        if isinstance(devices_data, list):
            player_device_ids.update({d.get('device_id') for d in devices_data if d.get('device_id')})
        elif isinstance(devices_data, dict):
            player_device_ids.update(set(devices_data.keys()))

        # Fallback to legacy owner/player_id on devices
        if not player_device_ids:
            player_device_ids = {d["id"] for d in devices_cfg if d.get("owner_id") == pid or d.get("player_id") == pid}

        for dev_id in player_device_ids:
            device_cfg = next((d for d in devices_cfg if d.get("id") == dev_id), None)
            device_hourly_breakdown[dev_id] = []
            if 'device_type_map' not in locals():
                device_type_map = {}
            if device_cfg:
                device_type_map[dev_id] = device_cfg.get('type', '')
            # Get balancing data if available (contains DA/ID dispatch breakdown)
            device_balancing = per_device_hourly_balancing.get(dev_id, [])
            device_co2_rows = per_device_hourly_co2.get(dev_id, [])
            
            print(f"[DEVICE_BREAKDOWN_DEBUG] Device {dev_id}: balancing_len={len(device_balancing)}, hourly_results_len={len(hourly_results)}")
            
            for h_idx, hour_result in enumerate(hourly_results):
                planned_h = per_device_hourly_planned.get(dev_id, [0] * span)[h_idx]
                dispatched_h = per_device_hourly_dispatched.get(dev_id, [0] * span)[h_idx]
                actual_h = per_device_hourly_actual.get(dev_id, [0] * span)[h_idx]

                total_qty = 0.0
                total_value = 0.0
                device_bids = device_bids_all.get(dev_id, {}) if device_bids_all else {}
                for bid_label in ["A", "B", "C"]:
                    bid = device_bids.get(bid_label, {}) if isinstance(device_bids, dict) else {}
                    price = float(bid.get("price", 0) or 0)
                    hours = bid.get("hours", []) if isinstance(bid, dict) else []
                    qty = float(hours[h_idx]) if h_idx < len(hours) else 0.0
                    if qty != 0:
                        qty_abs = abs(qty)
                        total_qty += qty_abs
                        total_value += qty_abs * price

                if total_qty > 0:
                    offer_price = total_value / total_qty
                else:
                    offer_price = None
                    if device_cfg:
                        offer_price = float(device_cfg.get("variable_cost_zar_per_mwh") or device_cfg.get("cost_per_mwh_zar") or 0.0)

                # Get DA/ID breakdown from balancing data if available
                # Must match by hour_idx, not array position!
                balancing_entry = None
                current_hour_idx = hour_result.get("scenario_hour_idx", hour_result.get("hour_idx", hour_result.get("hour_offset", hour_result.get("hour", h_idx))))
                if device_balancing:
                    for bal_entry in device_balancing:
                        if bal_entry.get("hour_idx") == current_hour_idx:
                            balancing_entry = bal_entry
                            break

                # Get CO2 entry for this hour (match by hour_idx)
                co2_entry = None
                if device_co2_rows:
                    for co2_row in device_co2_rows:
                        if not isinstance(co2_row, dict):
                            continue
                        if co2_row.get("hour_idx", co2_row.get("scenario_hour_idx")) == current_hour_idx:
                            co2_entry = co2_row
                            break
                
                # Extract hour_offset from hour_result for bid_dispatch lookup
                # Note: hour_result may not have hour_offset in older sessions, fallback to h_idx
                current_hour_offset = hour_result.get("hour_offset", h_idx)
                
                # Calculate device capacity (base and with profiles/events)
                base_capacity = 0.0
                effective_capacity = 0.0
                available_capacity = 0.0
                availability_factor = 1.0
                availability_source = None
                mix_key = None
                mix_profile_factor = None
                mix_seasonal_factor = None
                availability_profile_factor = None
                capacity_factor_pct = None
                event_mult = 1.0
                event_add = 0.0
                if device_cfg:
                    base_capacity = float(device_cfg.get('capacity_mw') or device_cfg.get('max_power_mw') or 0.0)

                    start_time = (config.get("general", {}) or {}).get("start_time", "00:00")
                    fake_date = (config.get("general", {}) or {}).get("fake_date", "")
                    hour_of_day = extract_hour_of_day(current_hour_idx, start_time)
                    month = extract_month(fake_date)

                    device_type = (device_cfg.get('type', '') or '').lower()
                    is_load = 'load' in device_type

                    market_cfg = config.get("market", {}) or {}
                    gen_mix = market_cfg.get("generator_mix", {}) or {}
                    cons_mix = market_cfg.get("consumer_mix", {}) or {}

                    mix_entry = None
                    if not is_load:
                        gen_key = device_type
                        if gen_key == "solar" and "pv" in gen_mix:
                            gen_key = "pv"
                        if gen_key in gen_mix:
                            mix_entry = gen_mix.get(gen_key)
                            mix_key = gen_key
                    else:
                        cons_key = None
                        if "industrial" in device_type:
                            cons_key = "industrial"
                        elif "residential" in device_type or "household" in device_type:
                            cons_key = "household"
                        elif "commercial" in device_type:
                            cons_key = "household"
                        elif "agriculture" in device_type:
                            cons_key = "agriculture"
                        if cons_key and cons_key in cons_mix:
                            mix_entry = cons_mix.get(cons_key)
                            mix_key = cons_key

                    use_mix_profile = False
                    if isinstance(mix_entry, dict):
                        profile = mix_entry.get("profile")
                        seasonal = mix_entry.get("seasonal_profile")
                        if (isinstance(profile, list) and len(profile) > 0) or (isinstance(seasonal, list) and len(seasonal) > 0):
                            use_mix_profile = True
                            availability_source = "consumer_mix" if is_load else "generator_mix"
                            mix_profile_factor = 1.0
                            mix_seasonal_factor = 1.0
                            if isinstance(profile, list) and len(profile) > 0:
                                try:
                                    mix_profile_factor = float(profile[hour_of_day % len(profile)])
                                except Exception:
                                    pass
                            if isinstance(seasonal, list) and len(seasonal) > 0:
                                try:
                                    mix_seasonal_factor = float(seasonal[(month - 1) % len(seasonal)])
                                except Exception:
                                    pass
                            availability_factor = mix_profile_factor * mix_seasonal_factor

                    if not use_mix_profile:
                        if not is_load:
                            profile = device_cfg.get('availability_profile')
                            if isinstance(profile, list) and len(profile) > 0:
                                availability_profile_factor = float(profile[hour_of_day % len(profile)])
                                availability_factor = availability_profile_factor
                                availability_source = "device_profile"
                            else:
                                availability_profile_factor = calculate_realistic_availability(device_cfg, hour_of_day, config)
                                availability_factor = availability_profile_factor
                                availability_source = "default"

                            capacity_factor_pct = device_cfg.get('capacity_factor_pct')
                            if capacity_factor_pct is not None:
                                try:
                                    availability_factor *= max(0.0, float(capacity_factor_pct) / 100.0)
                                except Exception:
                                    pass

                    available_capacity = base_capacity * availability_factor

                    # Apply event modifiers to get effective capacity
                    event_mult, event_add = get_device_event_modifiers(
                        device_cfg,
                        device_type,
                        round_events,
                        pid,
                        player_type_by_player.get(int(pid))
                    )
                    effective_capacity = (available_capacity * event_mult) + event_add
                    effective_capacity = max(0.0, effective_capacity)  # Can't be negative
                
                # Calculate total offered from all_bid_dispatch for correct hour
                total_offered_h = 0.0
                if pid in all_bid_dispatch and dev_id in all_bid_dispatch[pid]:
                    for lot_label, lot_list in all_bid_dispatch[pid][dev_id].items():
                        # Find lot data for current hour_offset
                        for lot_data in lot_list:
                            if lot_data.get('hour_offset') == current_hour_offset:
                                total_offered_h += lot_data.get('mw_offered', 0.0)
                                break
                
                # Calculate overbid and capacity_violation
                overbid_mw = max(0.0, total_offered_h - effective_capacity)
                capacity_violation = overbid_mw > 0.001  # Small epsilon for floating point
                
                # Build hour entry with DA/ID fields and capacity info
                hour_entry = {
                    "hour": current_hour_idx,
                    "hour_offset": current_hour_offset,
                    "base_capacity_mw": round(base_capacity, 3),
                    "effective_capacity_mw": round(effective_capacity, 3),
                    "total_offered_mw": round(total_offered_h, 3),
                    "overbid_mw": round(overbid_mw, 3),
                    "capacity_violation": capacity_violation,
                    "capacity_debug": {
                        "device_type": device_cfg.get('type', '') if device_cfg else None,
                        "mix_key": mix_key,
                        "availability_source": availability_source,
                        "hour_of_day": hour_of_day if device_cfg else None,
                        "month": month if device_cfg else None,
                        "mix_profile_factor": mix_profile_factor,
                        "mix_seasonal_factor": mix_seasonal_factor,
                        "availability_profile_factor": availability_profile_factor,
                        "capacity_factor_pct": capacity_factor_pct,
                        "availability_factor": round(availability_factor, 6),
                        "available_capacity_mw": round(available_capacity, 3),
                        "event_mult": event_mult,
                        "event_add": event_add,
                    },
                    "planned_mw": round(planned_h, 3),
                    "dispatched_mw": round(dispatched_h, 3),
                    "actual_mw": round(actual_h, 3),
                    "offer_price_zar": round(offer_price, 2) if offer_price is not None else None,
                    "market_price_zar": round(hour_result["smp"], 2),
                }
                
                # Add DA/ID breakdown if available, otherwise use simple imbalance
                if balancing_entry:
                    hour_entry["da_dispatched_mwh"] = balancing_entry.get('da_dispatched_mwh', 0.0)
                    hour_entry["id_dispatched_mwh"] = balancing_entry.get('id_dispatched_mwh', 0.0)
                    hour_entry["total_dispatched_mwh"] = balancing_entry.get('total_dispatched_mwh', 0.0)
                    hour_entry["imbalance_mwh"] = balancing_entry.get('imbalance_mwh', 0.0)
                    hour_entry["imbalance_cost_zar"] = balancing_entry.get('balancing_cost_zar', 0.0)
                else:
                    # Fallback when legacy/per-hour balancing details are missing:
                    # derive DA/ID dispatched split from delivery commitments and the
                    # device dispatched quantity so downstream settlement totals stay consistent.
                    fallback_total_dispatched = float(dispatched_h or 0.0)
                    fallback_da_dispatched = 0.0
                    fallback_id_dispatched = 0.0

                    if round_num > 1 and id_delta_round:
                        da_by_device = _get_da_delivery_dispatch_by_device(pid, current_hour_idx, current_hour_offset) or {}
                        try:
                            fallback_da_dispatched = float(da_by_device.get(dev_id, 0.0) or 0.0)
                        except Exception:
                            fallback_da_dispatched = 0.0
                        fallback_id_dispatched = fallback_total_dispatched - fallback_da_dispatched
                    else:
                        # Absolute clearing rounds: treat dispatched quantity as DA-dispatched.
                        fallback_da_dispatched = fallback_total_dispatched

                    hour_entry["da_dispatched_mwh"] = round(fallback_da_dispatched, 3)
                    hour_entry["id_dispatched_mwh"] = round(fallback_id_dispatched, 3)
                    hour_entry["total_dispatched_mwh"] = round(fallback_total_dispatched, 3)

                    # Fallback: simple calculation for devices without balancing data
                    hour_entry["imbalance_mwh"] = round(actual_h - dispatched_h, 3)
                    # Mirror settle_balancing price logic
                    imbalance_h = float(actual_h) - float(dispatched_h)
                    if imbalance_h > 0:
                        hour_entry["imbalance_cost_zar"] = round(imbalance_h * 1200.0, 2)
                    elif imbalance_h < 0:
                        hour_entry["imbalance_cost_zar"] = round(abs(imbalance_h) * 800.0, 2)
                    else:
                        hour_entry["imbalance_cost_zar"] = 0.0

                # Canonical financials / CO2 per device-hour: derived from the same DA/ID settlement basis
                device_type = (device_cfg.get('type', '') if device_cfg else '').lower()
                is_load = 'load' in device_type

                da_mwh = float(hour_entry.get('da_dispatched_mwh', 0.0) or 0.0)
                id_mwh = float(hour_entry.get('id_dispatched_mwh', 0.0) or 0.0)

                # Prices: DA uses da_smp when available, otherwise hour smp; ID uses hour smp (engine settlement basis)
                da_price = float((da_smp if da_smp is not None else hour_result.get('smp', 0.0)) or 0.0)
                id_price = float(hour_result.get('smp', 0.0) or 0.0)

                sign = -1.0 if is_load else 1.0
                da_revenue = sign * da_mwh * da_price
                id_revenue = sign * id_mwh * id_price
                revenue_total = da_revenue + id_revenue

                device_variable_cost = 0.0
                if not is_load and device_cfg:
                    device_variable_cost_rate = float(device_cfg.get('variable_cost_zar_per_mwh', device_cfg.get('cost_per_mwh_zar', 0.0)) or 0.0)
                    device_variable_cost = max(0.0, (da_mwh + id_mwh)) * max(0.0, device_variable_cost_rate)

                device_fixed_cost = 0.0
                if not is_load and device_cfg:
                    device_fixed_cost = max(0.0, float(device_cfg.get('fixed_cost_zar_per_hour', 0.0) or 0.0))

                # Congestion revenue: allocate player-hourly congestion proportionally by dispatched volume
                congestion_alloc = 0.0
                try:
                    player_hour_cong = float(per_player_hourly_congestion_revenue.get(pid, [0.0] * span)[h_idx] or 0.0)
                except Exception:
                    player_hour_cong = 0.0
                if player_hour_cong != 0.0:
                    # Compute total dispatched across the player's devices for this hour
                    total_disp = 0.0
                    for other_dev in player_device_ids:
                        try:
                            total_disp += float(per_device_hourly_dispatched.get(other_dev, [0.0] * span)[h_idx] or 0.0)
                        except Exception:
                            pass
                    if total_disp != 0.0:
                        congestion_alloc = player_hour_cong * (float(dispatched_h or 0.0) / float(total_disp))

                co2_kg = 0.0
                if isinstance(co2_entry, dict):
                    try:
                        co2_kg = float(co2_entry.get('co2_kg', 0.0) or 0.0)
                    except Exception:
                        co2_kg = 0.0

                profit_device = revenue_total - device_variable_cost - device_fixed_cost - float(hour_entry.get('imbalance_cost_zar', 0.0) or 0.0) + congestion_alloc

                hour_entry.update({
                    'da_price_zar': round(da_price, 2),
                    'id_price_zar': round(id_price, 2),
                    'da_revenue_zar': round(da_revenue, 2),
                    'id_revenue_zar': round(id_revenue, 2),
                    'revenue_zar': round(revenue_total, 2),
                    'variable_cost_zar': round(device_variable_cost, 2),
                    'fixed_cost_zar': round(device_fixed_cost, 2),
                    'congestion_revenue_zar': round(congestion_alloc, 2),
                    'profit_zar': round(profit_device, 2),
                    'co2_kg': round(co2_kg, 2),
                })
                
                device_hourly_breakdown[dev_id].append(hour_entry)

        # Derive canonical per-player hourly financials from device-hour settlement fields.
        # This prevents KPI drift when legacy per_player_hourly_* arrays are missing/zero (e.g. delta rounds).
        if isinstance(device_hourly_breakdown, dict) and hourly_breakdown:
            for h_idx in range(min(len(hourly_breakdown), len(hourly_results))):
                revenue_sum = 0.0
                variable_cost_sum = 0.0
                fixed_cost_sum = 0.0
                imbalance_cost_sum = 0.0
                congestion_sum = 0.0
                imbalance_mwh_sum = 0.0
                for _dev_id, rows in device_hourly_breakdown.items():
                    if not isinstance(rows, list) or h_idx >= len(rows):
                        continue
                    row = rows[h_idx] or {}
                    revenue_sum += float(row.get('revenue_zar', 0.0) or 0.0)
                    variable_cost_sum += float(row.get('variable_cost_zar', 0.0) or 0.0)
                    fixed_cost_sum += float(row.get('fixed_cost_zar', 0.0) or 0.0)
                    imbalance_cost_sum += float(row.get('imbalance_cost_zar', 0.0) or 0.0)
                    congestion_sum += float(row.get('congestion_revenue_zar', 0.0) or 0.0)
                    imbalance_mwh_sum += float(row.get('imbalance_mwh', 0.0) or 0.0)

                hourly_breakdown[h_idx]['revenue_zar'] = round(revenue_sum, 0)
                hourly_breakdown[h_idx]['variable_cost_zar'] = round(variable_cost_sum, 0)
                hourly_breakdown[h_idx]['fixed_cost_zar'] = round(fixed_cost_sum, 0)
                hourly_breakdown[h_idx]['imbalance_cost_zar'] = round(imbalance_cost_sum, 0)
                hourly_breakdown[h_idx]['congestion_revenue_zar'] = round(congestion_sum, 0)
                hourly_breakdown[h_idx]['imbalance_mwh'] = round(imbalance_mwh_sum, 3)
                hourly_breakdown[h_idx]['profit_zar'] = round(
                    revenue_sum
                    - variable_cost_sum
                    - fixed_cost_sum
                    - imbalance_cost_sum
                    + congestion_sum,
                    0
                )
        
        # Debug: Log summary after building all hours
        total_planned = sum(h["planned_mw"] for h in hourly_breakdown)
        total_dispatched = sum(h["dispatched_mw"] for h in hourly_breakdown)
        print(f"[HOURLY_DEBUG] Player {pid} breakdown complete: {len(hourly_breakdown)} hours, total_planned={total_planned:.2f}, total_dispatched={total_dispatched:.2f}")
        
        # Aggregate MWh quantities (not costs) from hourly_breakdown for KPIs
        total_revenue_from_details = sum(h.get("revenue_zar", 0.0) for h in hourly_breakdown)
        total_variable_cost_from_details = sum(h.get("variable_cost_zar", 0.0) for h in hourly_breakdown)
        total_fixed_cost_from_details = sum(h.get("fixed_cost_zar", 0.0) for h in hourly_breakdown)
        total_imbalance_cost_from_details = sum(h.get("imbalance_cost_zar", 0.0) for h in hourly_breakdown)
        total_congestion_revenue_from_details = sum(h.get("congestion_revenue_zar", 0.0) for h in hourly_breakdown)
        total_profit_from_details = sum(h.get("profit_zar", 0.0) for h in hourly_breakdown)
        total_planned_from_details = sum(h.get("planned_mw", 0.0) for h in hourly_breakdown)
        total_dispatched_from_details = sum(h.get("dispatched_mw", 0.0) for h in hourly_breakdown)
        total_actual_from_details = sum(h.get("actual_mw", 0.0) for h in hourly_breakdown)
        total_imbalance_mwh = sum(h.get("imbalance_mwh", 0) for h in hourly_breakdown)
        total_curtailment_mwh = sum(h.get("curtailment_mwh", 0) for h in hourly_breakdown)
        total_curtailment_cost_from_details = sum(h.get("curtailment_cost_zar", 0.0) for h in hourly_breakdown)

        total_co2_from_details = 0.0
        if isinstance(device_hourly_breakdown, dict):
            for _dev_id, rows in device_hourly_breakdown.items():
                if not isinstance(rows, list):
                    continue
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    total_co2_from_details += float(row.get('co2_kg', 0.0) or 0.0)
        
        per_player[pid] = {
            "planned_mwh": round(total_planned_from_details, 3),
            "dispatched_mwh": round(total_dispatched_from_details, 3),
            "actual_mwh": round(total_actual_from_details, 3),
            "revenue_zar": round(total_revenue_from_details, 0),
            "variable_cost_zar": round(total_variable_cost_from_details, 0),
            "fixed_cost_zar": round(total_fixed_cost_from_details, 0),
            "imbalance_cost_zar": round(total_imbalance_cost_from_details, 0),
            "imbalance_mwh": round(total_imbalance_mwh, 3),  # Quantity in MWh (not cost)
            "curtailment_cost_zar": round(total_curtailment_cost_from_details, 0),
            "curtailment_mwh": round(total_curtailment_mwh, 3),  # Quantity in MWh (not cost)
            "congestion_revenue_zar": round(total_congestion_revenue_from_details, 0),
            "co2_emissions_kg": round(total_co2_from_details, 2) if total_co2_from_details else round(per_player_co2_emissions[pid], 2),  # CO2 emissions in kg
            "profit_zar": round(total_profit_from_details, 0),
            "hourly_breakdown": hourly_breakdown,  # Detailed per-hour breakdown
            "device_hourly_breakdown": device_hourly_breakdown,  # Detailed per-device hourly breakdown
            "bid_dispatch": all_bid_dispatch.get(pid, {}),  # Lot-level dispatch tracking (A/B/C lots)
            "debug_info": {  # DEBUG: Add diagnostic info
                "enable_bidding": enable_bidding,
                "per_device_keys": list(per_device_hourly_planned.keys()),
                "breakdown_hours": len(hourly_breakdown),
                "breakdown_total_planned": total_planned,
                "breakdown_total_dispatched": total_dispatched,
                "device_type_map": device_type_map if 'device_type_map' in locals() else {},
            }
        }

    result = {
        "smp": round(avg_mcp, 1),
        "volume": round(total_volume, 3),
        "round_kpis": per_player,
        "hourly_results": hourly_results,
    }
    
    # SAWEM Phase 2B: Add delta metadata for ID rounds
    if round_num > 1:
        # Add DA baseline and delta information to result
        result["da_baseline_metadata"] = {
            "da_smp": da_smp if 'da_smp' in locals() else None,
            "players": {}
        }
        
        # Add per-player delta information
        for pid in players:
            if pid in per_player:
                da_volume = per_player_da_volume.get(pid, 0)
                id_delta = per_player_id_delta.get(pid, 0)
                da_revenue = per_player_da_revenue.get(pid, 0)
                id_revenue = per_player_id_revenue.get(pid, 0)
                
                result["da_baseline_metadata"]["players"][pid] = {
                    "da_volume_mwh": round(da_volume, 3),
                    "id_delta_mwh": round(id_delta, 3),
                    "total_volume_mwh": round(da_volume + id_delta, 3),
                    "da_revenue_zar": round(da_revenue, 0),
                    "id_revenue_zar": round(id_revenue, 0),
                    "total_revenue_zar": round(da_revenue + id_revenue, 0)
                }

        # NEW: Expose DA round data for UI (DAM vs IDM comparison)
        if da_result_data:
            result["dam_bid_dispatch"] = da_result_data.get("dam_bid_dispatch", da_result_data.get("bid_dispatch", {}))
            result["dam_device_hourly_details"] = da_result_data.get("dam_device_hourly_details", da_result_data.get("device_hourly_details", {}))
            result["dam_hourly_results"] = da_result_data.get("dam_hourly_results", da_result_data.get("hourly_results", []))
    
    # SAWEM Phase 2A: Calculate IDP for Intraday markets (round_num > 1)
    if round_num > 1:
        traded_hours = [m for m in idp_hourly_metrics if m.get('id_trade_count', 0) > 0]
        total_id_trade_count = sum(int(m.get('id_trade_count', 0)) for m in traded_hours)
        total_id_volume = sum(float(m.get('id_volume_mwh', 0.0)) for m in traded_hours)

        if total_id_trade_count > 0 and total_id_volume > 0:
            weighted_idp = sum(float(m.get('idp', avg_mcp)) * float(m.get('id_volume_mwh', 0.0)) for m in traded_hours) / total_id_volume
            result["idp"] = round(weighted_idp, 2)
            result["id_trade_count"] = total_id_trade_count
            result["id_volume_mwh"] = round(total_id_volume, 3)
        else:
            # No ID trades → IDP = SMP
            result["idp"] = round(avg_mcp, 1)
            result["id_trade_count"] = 0
            result["id_volume_mwh"] = 0.0
    
    # Include bid dispatch tracking if bidding was enabled
    # DUAL MARKET: 
    # - Round 1 "Edit Round 1" = DAM clearing → save as dam_bid_dispatch
    # - Round 1 Zero/Preset = IDM clearing → save as bid_dispatch
    # - Round 2+ = IDM clearing → save as bid_dispatch
    if enable_bidding and bid_dispatch_tracking:
        is_dam_clearing = (round_num == 1 and baseline_mode == "edit_round_1")
        
        if is_dam_clearing:
            # Round 1 "Edit Round 1": DAM clearing → save as dam_bid_dispatch
            result["dam_bid_dispatch"] = bid_dispatch_tracking
            result["dam_device_hourly_details"] = {
                "co2": per_device_hourly_co2,
                "balancing": per_device_hourly_balancing
            }
            result["dam_hourly_results"] = hourly_results
            try:
                current_app.logger.info(f"[ENGINE] Round 1 DAM: Added dam_bid_dispatch with {len(bid_dispatch_tracking)} players")
            except:
                print(f"[ENGINE] Round 1 DAM: Added dam_bid_dispatch with {len(bid_dispatch_tracking)} players")
        else:
            # Round 1 Zero/Preset OR Round 2+: IDM clearing → save as bid_dispatch
            result["bid_dispatch"] = bid_dispatch_tracking
            result["device_hourly_details"] = {
                "co2": per_device_hourly_co2,
                "balancing": per_device_hourly_balancing
            }
            # hourly_results already added to result above
            try:
                current_app.logger.info(f"[ENGINE] Round {round_num} IDM: Added bid_dispatch with {len(bid_dispatch_tracking)} players")
            except:
                print(f"[ENGINE] Round {round_num} IDM: Added bid_dispatch with {len(bid_dispatch_tracking)} players")
    else:
        # Even without bid dispatch tracking, keep hourly detail payloads available
        # (important for delivery-time CO2/balancing in rounds with no current ID clearing bids).
        if round_num > 1:
            result["device_hourly_details"] = {
                "co2": per_device_hourly_co2,
                "balancing": per_device_hourly_balancing
            }
        elif round_num == 1:
            # Preserve legacy single-market contract for round 1
            result["dam_device_hourly_details"] = {
                "co2": per_device_hourly_co2,
                "balancing": per_device_hourly_balancing
            }

        try:
            current_app.logger.warning(f"[ENGINE] No bid_dispatch: enable_bidding={enable_bidding}, tracking_empty={not bid_dispatch_tracking}")
        except:
            print(f"[ENGINE] No bid_dispatch: enable_bidding={enable_bidding}, tracking_empty={not bid_dispatch_tracking}")
    
    # FORENSIC: Add reconciliation and tracing data
    result["hour_reconciliation"] = hour_reconciliation_data
    if round_num > 1 and baseline_lookup_trace is not None:
        result["baseline_lookup_trace"] = baseline_lookup_trace
    
    # FORENSIC: Create machine-readable audit payload
    result["debug_audit_payload"] = {
        "hour_axis": [{
            'scenario_hour_idx': h['scenario_hour_idx'],
            'round_hour_offset': h['round_hour_offset'],
            'round_num': h['round_num'],
            'hour_of_day': h['hour_of_day'],
            'display_label': h['display_label']
        } for h in hourly_results],
        "reconciliation": hour_reconciliation_data,
        "device_balancing": per_device_hourly_balancing,
        "co2_emissions": per_device_hourly_co2,
        "version": "forensic_v1"
    }
    
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


def evaluate_challenges(
    challenges: List[dict],
    player_kpis: dict,
    role: str,
    round_num: int = None,
    all_round_kpis: List[dict] = None,
    capacity_scale: float = 1.0,
) -> dict:
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
            "total_cost": sum(r.get("variable_cost_zar", 0) + r.get("fixed_cost_zar", 0) + r.get("imbalance_cost_zar", 0) for r in all_round_kpis),
            "total_imbalance": sum(r.get("imbalance_mwh", 0) for r in all_round_kpis),
            "total_curtailment": sum(r.get("curtailment_mwh", 0) for r in all_round_kpis),
            "total_dispatched": sum(r.get("dispatched_mwh", 0) for r in all_round_kpis),
            "total_co2_emissions": sum(r.get("co2_emissions_kg", 0) for r in all_round_kpis),  # Total CO2 in kg
            "avg_profit_per_round": sum(r.get("profit_zar", 0) for r in all_round_kpis) / len(all_round_kpis) if all_round_kpis else 0,
            "avg_co2_per_round": sum(r.get("co2_emissions_kg", 0) for r in all_round_kpis) / len(all_round_kpis) if all_round_kpis else 0,
        }
    
    for challenge in challenges:
        challenge_id = challenge.get("id", "challenge_" + str(len(results)))
        name = challenge.get("name", "Challenge")
        metric = challenge.get("metric")
        operator = challenge.get("operator", ">=")
        target = challenge.get("target", 0)
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
            actual_value = player_kpis.get("variable_cost_zar", 0) + player_kpis.get("fixed_cost_zar", 0) + player_kpis.get("imbalance_cost_zar", 0)
        elif metric == "round_imbalance":
            actual_value = abs(player_kpis.get("planned_mwh", 0) - player_kpis.get("actual_mwh", 0))
        elif metric == "round_dispatched":
            actual_value = player_kpis.get("dispatched_mwh", 0)
        elif metric == "round_co2_emissions":
            actual_value = player_kpis.get("co2_emissions_kg", 0)
        elif metric == "round_co2_intensity":
            # CO2 intensity in kg/MWh
            dispatched = player_kpis.get("dispatched_mwh", 0)
            co2 = player_kpis.get("co2_emissions_kg", 0)
            actual_value = (co2 / dispatched) if dispatched > 0 else 0
        
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
        
        # Scale targets for capacity-dependent metrics (shared market)
        scale_metrics = {
            "round_profit",
            "round_revenue",
            "round_cost",
            "round_imbalance",
            "round_dispatched",
            "round_co2_emissions",
            "total_profit",
            "total_revenue",
            "total_cost",
            "total_imbalance",
            "total_curtailment",
            "total_dispatched",
            "total_co2_emissions",
            "avg_profit_per_round",
            "avg_co2_per_round",
            "procurement_cost",
        }

        scaled_target = target
        if capacity_scale and capacity_scale != 1.0 and metric in scale_metrics:
            if isinstance(target, list) and len(target) == 2:
                scaled_target = [float(target[0]) * capacity_scale, float(target[1]) * capacity_scale]
            else:
                scaled_target = float(target) * capacity_scale

        # Evaluate condition
        passed = False
        if operator == ">=":
            passed = actual_value >= float(scaled_target)
        elif operator == "<=":
            passed = actual_value <= float(scaled_target)
        elif operator == "==":
            passed = abs(actual_value - float(scaled_target)) < 0.01
        elif operator == "range":
            # target should be [min, max]
            if isinstance(scaled_target, list) and len(scaled_target) == 2:
                passed = scaled_target[0] <= actual_value <= scaled_target[1]
        
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
            "target": scaled_target,
            "base_target": target,
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
        "passed": all_required_passed,
        "capacity_scale": round(float(capacity_scale or 1.0), 3)
    }