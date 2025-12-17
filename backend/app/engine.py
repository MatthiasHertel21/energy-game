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


def clear_market(supply: List[Tuple[float, float]], demand: List[Tuple[float, float]],
                 price_floor: float = -500.0, price_cap: float = 5000.0) -> Tuple[float, float]:
    # supply: list of (price, volume) ascending price
    # demand: list of (price, volume) descending price (WTP)
    s = sorted(supply, key=lambda x: x[0])
    d = sorted(demand, key=lambda x: x[0], reverse=True)

    i = j = 0
    cum_s = cum_d = 0.0
    mcp = 0.0
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
            # Set MCP to the supply price of the marginal unit (uniform pricing)
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

    mcp = marginal_supply_price
    price = max(price_floor, min(price_cap, mcp))
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


def generate_curves_from_config(cfg: dict, seed: Optional[str] = None) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
    """
    Step-wise supply and demand curves around base points influenced by config.
    Adds seed-based jitter based on average variability across player types.
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
        supply.append((p_s, v))
        demand.append((p_d, v))
    
    # Ensure strict monotonicity: sort supply ascending, demand descending by price
    supply = sorted(supply, key=lambda x: x[0])
    demand = sorted(demand, key=lambda x: x[0], reverse=True)
    
    return supply, demand


def build_supply_from_bids(player_forecasts: Dict[int, dict], hour_idx: int, 
                           synthetic_supply: List[Tuple[float, float]], 
                           config: dict) -> Tuple[List[Tuple[float, float]], List[dict]]:
    """
    Merge player bids with synthetic supply curve for market clearing.
    
    Args:
        player_forecasts: Dict of {player_id: forecast_data_with_bids}
        hour_idx: Hour index within the round (0-based)
        synthetic_supply: Base supply curve from config
        config: Scenario configuration
    
    Returns:
        Tuple of (combined_supply_curve, bid_metadata_list)
    """
    # Check if bidding is enabled
    if not config.get("market", {}).get("enable_player_bidding", False):
        return synthetic_supply, []
    
    supply_bids = []
    
    # Collect all player device bids for this hour
    for player_id, forecast_data in player_forecasts.items():
        bids_data = forecast_data.get('bids')
        if not bids_data:
            continue
        
        for device_id, device_bids in bids_data.items():
            for bid_label in ['A', 'B', 'C']:
                if bid_label not in device_bids:
                    continue
                
                bid = device_bids[bid_label]
                hours = bid.get('hours', [])
                if hour_idx >= len(hours):
                    continue
                
                quantity = float(hours[hour_idx])
                price = float(bid.get('price', 0))
                
                if quantity > 0:
                    supply_bids.append({
                        'price': price,
                        'quantity': quantity,
                        'player_id': player_id,
                        'device_id': device_id,
                        'bid_label': bid_label
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


def track_bid_dispatch(supply_bids: List[dict], mcp: float, volume: float, 
                       synthetic_supply: List[Tuple[float, float]]) -> Dict[int, Dict[str, Dict[str, dict]]]:
    """
    Track which player bids were dispatched during market clearing.
    
    Args:
        supply_bids: List of bid metadata from build_supply_from_bids
        mcp: Market clearing price
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
    
    # Simulate dispatch
    remaining_demand = volume
    dispatch_tracking = {}
    
    for price, quantity, player_id, device_id, bid_label in all_supply:
        if remaining_demand <= 0:
            break
        
        if price > mcp:
            break  # Too expensive
        
        if player_id is None:
            # Synthetic supply, skip tracking
            dispatched = min(quantity, remaining_demand)
            remaining_demand -= dispatched
            continue
        
        # Player bid
        dispatched = min(quantity, remaining_demand)
        remaining_demand -= dispatched
        
        if player_id not in dispatch_tracking:
            dispatch_tracking[player_id] = {}
        if device_id not in dispatch_tracking[player_id]:
            dispatch_tracking[player_id][device_id] = {}
        
        dispatch_tracking[player_id][device_id][bid_label] = {
            'mw_offered': quantity,
            'mw_dispatched': round(dispatched, 3),
            'price_bid': price,
            'mcp': mcp
        }
    
    return dispatch_tracking


def apply_events(price: float, volume: float, events: list[dict]) -> Tuple[float, float]:
    mul = 1.0
    add_v = 0.0
    for e in events or []:
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


def preview_from_config(cfg: dict, seed: str = "preview", round_num: int | None = None) -> dict:
    # use provided seed consistently across generation
    seeded(seed)
    supply, demand = generate_curves_from_config(cfg, seed=seed)
    price, vol = clear_market(supply, demand,
                              price_floor=cfg.get("market", {}).get("price_floor", -500),
                              price_cap=cfg.get("market", {}).get("price_cap", 5000))
    events = cfg.get("events", [])
    if round_num is not None:
        events = select_events_for_round(events, int(round_num))
    price, vol = apply_events(price, vol, events)
    return {"mcp": round(price, 1), "volume": round(vol, 3)}


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
    Compute basic market results for a round. Supports both legacy (quantity-only) and multi-bid pricing.
    
    Args:
        forecasts: Dict of {player_id: forecast_data}
                  forecast_data can be:
                    - List[float] (legacy: quantity-only)
                    - Dict with 'hours' and optional 'bids' keys
    
    Returns:
        Dict with mcp, volume, round_kpis, and optionally bid_dispatch
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
    
    # Generate synthetic supply/demand
    synthetic_supply, demand = generate_curves_from_config(config, seed=seed)
    
    # Check if multi-bid pricing is enabled
    enable_bidding = config.get("market", {}).get("enable_player_bidding", False)
    bid_dispatch_tracking = {}
    
    if enable_bidding:
        # Build supply from player bids (merged with synthetic)
        # For round-based clearing, we use the first hour of the round
        supply, supply_bids = build_supply_from_bids(normalized_forecasts, base_idx, synthetic_supply, config)
    else:
        supply = synthetic_supply
        supply_bids = []
    
    # Market clearing
    price, vol = clear_market(supply, demand,
                              price_floor=config.get("market", {}).get("price_floor", -500),
                              price_cap=config.get("market", {}).get("price_cap", 5000))
    
    # Track bid dispatch if bidding enabled
    if enable_bidding and supply_bids:
        bid_dispatch_tracking = track_bid_dispatch(supply_bids, price, vol, synthetic_supply)
        try:
            current_app.logger.info(f"[ENGINE] Bid dispatch tracking: {len(bid_dispatch_tracking)} players, {sum(len(v) for v in bid_dispatch_tracking.values())} devices")
        except:
            print(f"[ENGINE] Bid dispatch tracking: {len(bid_dispatch_tracking)} players, {sum(len(v) for v in bid_dispatch_tracking.values())} devices")
    
    # Apply only events active for this round
    round_events = select_events_for_round(config.get("events", []), round_num)
    price, vol = apply_events(price, vol, round_events)

    per_player = {}
    plans = {}
    total_planned = 0.0
    
    # Calculate planned quantities
    for pid in players:
        forecast_data = normalized_forecasts.get(pid, {})
        h = forecast_data.get('hours', [])
        
        if enable_bidding and forecast_data.get('bids'):
            # Sum all bids for this player
            planned = 0.0
            for device_id, device_bids in forecast_data['bids'].items():
                for bid_label in ['A', 'B', 'C']:
                    if bid_label in device_bids:
                        bid_hours = device_bids[bid_label].get('hours', [])
                        window = bid_hours[base_idx: base_idx + span] if bid_hours else [0.0] * span
                        planned += sum(window)
        else:
            # Legacy: use hours array
            window = h[base_idx: base_idx + span] if h else [0.0] * span
            planned = sum(window)
        
        plans[pid] = planned
        total_planned += planned
    dispatch_factor = 1.0
    if mode == "shared_market" and total_planned > 0:
        # pro‑rata dispatch if planned exceeds market volume
        dispatch_factor = min(1.0, vol / total_planned)
    # configurable actual vs forecast deviation (pct) from config.environment.actual_noise_pct, default 5%
    try:
        noise_pct = float((config.get("environment", {}) or {}).get("actual_noise_pct", 5))
    except Exception:
        noise_pct = 5.0
    frac = max(0.0, min(1.0, noise_pct / 100.0))
    # Calculate per-player KPIs
    for pid in players:
        planned = plans.get(pid, 0.0)
        
        # For bid-based dispatch, use tracked dispatch quantity
        if enable_bidding and pid in bid_dispatch_tracking:
            dispatched = 0.0
            for device_id, device_dispatch in bid_dispatch_tracking[pid].items():
                for bid_label, bid_info in device_dispatch.items():
                    dispatched += bid_info['mw_dispatched']
        else:
            dispatched = planned * dispatch_factor
        
        noise = random.uniform(-frac, frac) * max(1.0, dispatched)
        actual = max(0.0, dispatched + noise)
        imbalance_cost = settle_balancing(dispatched, actual)
        
        # Revenue: Uniform MCP for all dispatched MWh
        revenue = round(dispatched * price, 0)
        
        # Fuel cost: Based on dispatched quantity and device variable costs
        fuel = 0  # TODO: Calculate from device.variable_cost_zar_per_mwh
        
        curtailment_amount = max(0.0, planned - dispatched)
        devices = config.get("devices", [])
        curtailed, cong_signal = apply_grid(dispatched, config.get("grid", {}).get("atc", []), devices=devices)
        curtailment_cost = round((curtailment_amount + curtailed) * price, 0)
        congestion_revenue = round(dispatched * price * cong_signal, 0)
        
        # Profit calculation
        profit = revenue - fuel - imbalance_cost - curtailment_cost + congestion_revenue
        
        per_player[pid] = {
            "planned_mwh": round(planned, 3),
            "dispatched_mwh": round(dispatched, 3),
            "actual_mwh": round(actual, 3),
            "revenue_zar": revenue,
            "imbalance_cost_zar": imbalance_cost,
            "curtailment_cost_zar": curtailment_cost,
            "congestion_revenue_zar": congestion_revenue,
            "profit_zar": profit,
        }

    result = {
        "mcp": round(price, 1),
        "volume": round(vol, 3),
        "round_kpis": per_player,
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