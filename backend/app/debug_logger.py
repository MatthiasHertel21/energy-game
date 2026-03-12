"""
Debug Logger for Calculation Engine
Creates structured markdown files with complete round calculation details.
FORENSIC VERSION: Enhanced with reconciliation, DA/ID transparency, and audit trails.
"""
import os
import json
from datetime import datetime
from typing import Dict, List, Any


BID_LABELS = ["A", "B", "C", "D", "E"]
LOT_DISPLAY_NAMES = {
    "A": "Base",
    "B": "Mid",
    "C": "Peak",
    "D": "Reserve",
    "E": "Flex",
}


def _get_present_bid_labels(lots: Dict[str, Any] | None) -> List[str]:
    if not isinstance(lots, dict):
        return []
    labels = [label for label in BID_LABELS if label in lots]
    labels.extend([label for label in lots.keys() if label not in labels])
    return labels


def format_unified_hour(hour_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format hour data with unified structure for forensic traceability.
    
    Returns dict with:
    - scenario_hour_idx: Absolute hour in scenario (0-59 for 60h scenario)
    - round_hour_offset: Hour within current round (0-5 for 6h round)
    - round_num: Current round number
    - hour_of_day: Clock time 0-23
    - display_label: H19 (19:00)
    """
    # Extract from various possible formats (preserve explicit 0 values)
    scenario_hour_idx = hour_data.get('scenario_hour_idx')
    if scenario_hour_idx is None:
        scenario_hour_idx = hour_data.get('hour_idx')
    if scenario_hour_idx is None:
        scenario_hour_idx = hour_data.get('hour')
    if scenario_hour_idx is None:
        scenario_hour_idx = 0

    round_hour_offset = hour_data.get('round_hour_offset')
    if round_hour_offset is None:
        round_hour_offset = hour_data.get('hour_offset')
    if round_hour_offset is None:
        round_hour_offset = 0

    round_num = hour_data.get('round_num', 1)

    hour_of_day = hour_data.get('hour_of_day')
    if hour_of_day is None:
        hour_of_day = scenario_hour_idx % 24
    
    return {
        'scenario_hour_idx': scenario_hour_idx,
        'round_hour_offset': round_hour_offset,
        'round_num': round_num,
        'hour_of_day': hour_of_day,
        'display_label': f'H{scenario_hour_idx} ({hour_of_day:02d}:00)'
    }


class CalculationDebugLogger:
    """Generate structured debug logs for round calculations."""
    
    def __init__(self, debug_dir: str = "/app/debug"):
        self.debug_dir = debug_dir
        os.makedirs(debug_dir, exist_ok=True)
    
    def log_round_calculation(
        self,
        session_id: int,
        round_num: int,
        scenario_name: str,
        player_id: int,
        player_email: str,
        player_type: str,
        inputs: Dict[str, Any],
        calculations: Dict[str, Any],
        results: Dict[str, Any]
    ):
        """
        Create a debug markdown file for a round calculation.
        
        Filename format: YYYYMMDD-scenarioX-playertypeX-roundX.md
        """
        timestamp = datetime.now()
        date_str = timestamp.strftime("%Y%m%d")
        time_str = timestamp.strftime("%H%M%S")
        
        # Clean scenario/player names for filename
        scenario_clean = scenario_name.replace(" ", "_").replace("/", "_")[:30]
        player_type_clean = player_type.replace(" ", "_")[:20] if player_type else "player"
        
        filename = f"{date_str}-{scenario_clean}-{player_type_clean}-round{round_num}.md"
        filepath = os.path.join(self.debug_dir, filename)
        
        # Generate markdown content
        content = self._generate_markdown(
            session_id, round_num, timestamp, scenario_name,
            player_id, player_email, player_type,
            inputs, calculations, results
        )
        
        # Write file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return filepath
    
    def _generate_markdown(
        self,
        session_id: int,
        round_num: int,
        timestamp: datetime,
        scenario_name: str,
        player_id: int,
        player_email: str,
        player_type: str,
        inputs: Dict[str, Any],
        calculations: Dict[str, Any],
        results: Dict[str, Any]
    ) -> str:
        """Generate markdown content."""
        
        # Build device capacity lookup
        device_capacities = {}
        if "devices" in inputs:
            for dev in inputs["devices"]:
                # Handle both device objects and device IDs (strings)
                if isinstance(dev, str):
                    continue  # Skip device IDs, we'll get capacity from breakdown
                dev_id = dev.get("id")
                capacity = dev.get("capacity_mw") or dev.get("max_power_mw")
                if dev_id and capacity:
                    device_capacities[dev_id] = float(capacity)
        
        md = []
        md.append("# Calculation Debug Log\n")
        md.append(f"**Session:** {session_id} | **Round:** {round_num} | **Time:** {timestamp.strftime('%Y-%m-%d %H:%M:%S')}\n")
        md.append(f"**Scenario:** {scenario_name}\n")
        md.append(f"**Player:** {player_email} (ID: {player_id}) | **Type:** {player_type}\n")
        md.append("\n---\n\n")
        
        # === SECTION 1: SCENARIO CONFIG ===
        md.append("## 1. Scenario Configuration\n\n")
        
        if "scenario_config" in inputs and inputs["scenario_config"]:
            config = inputs["scenario_config"]
            md.append("### Market Settings\n\n")
            md.append("| Parameter | Value |\n")
            md.append("|-----------|-------|\n")
            
            # P3 FIX: More robust config value extraction
            market = config.get("market", {})
            general = config.get("general", {})
            
            price_floor = market.get('price_floor') or market.get('price_floor_zar_mwh') or general.get('price_floor_zar_mwh') or general.get('price_floor')
            price_cap = market.get('price_cap') or market.get('price_cap_zar_mwh') or general.get('price_cap_zar_mwh') or general.get('price_cap')
            bal_up = market.get('balancing_price_up') or market.get('balancing_price_up_zar_mwh') or general.get('balancing_price_up_zar_mwh') or general.get('balancing_price_up')
            bal_down = market.get('balancing_price_down') or market.get('balancing_price_down_zar_mwh') or general.get('balancing_price_down_zar_mwh') or general.get('balancing_price_down')
            id_spread = market.get('id_price_spread_percent') or general.get('id_price_spread_percent')
            
            # Format numbers with thousand separators
            pf_str = f"{price_floor:,.0f}" if isinstance(price_floor, (int, float)) else price_floor
            pc_str = f"{price_cap:,.0f}" if isinstance(price_cap, (int, float)) else price_cap
            bu_str = f"{bal_up:,.0f}" if isinstance(bal_up, (int, float)) else bal_up
            bd_str = f"{bal_down:,.0f}" if isinstance(bal_down, (int, float)) else bal_down
            
            md.append(f"| Price Floor | {pf_str} ZAR/MWh |\n")
            md.append(f"| Price Cap | {pc_str} ZAR/MWh |\n")
            md.append(f"| Balancing Price (Up) | {bu_str} ZAR/MWh |\n")
            md.append(f"| Balancing Price (Down) | {bd_str} ZAR/MWh |\n")
            md.append(f"| IDM Price Spread | {id_spread}% |\n")
            
            # Add general settings
            md.append(f"| Rounds | {general.get('rounds', 'N/A')} |\n")
            md.append(f"| Round Duration | {general.get('round_duration_seconds', 'N/A')} sec |\n")
            md.append(f"| Horizon Hours | {general.get('forecast_horizon_hours', general.get('horizon_hours', 'N/A'))} |\n")
            md.append("\n")
        
        # === SECTION 2: PLAYER DEVICES ===
        md.append("## 2. Player Devices\n\n")
        
        if "devices" in inputs:
            devices = inputs["devices"]
            # Check if devices are IDs or objects
            if devices and isinstance(devices[0], str):
                md.append("*Device IDs:* " + ", ".join(devices) + "\n\n")
            else:
                md.append("| Device ID | Name | Type | Capacity (MW) | CO2 Rate (kg/MWh) |\n")
                md.append("|-----------|------|------|---------------|-------------------|\n")
                for dev in devices:
                    dev_id = dev.get("id", "?")
                    dev_name = dev.get("name", "?")
                    dev_type = dev.get("type", "?")
                    capacity = dev.get("capacity_mw", dev.get("max_power_mw", "?"))
                    # P2-B FIX: CO2 rate with multiple fallbacks
                    co2_rate = dev.get("co2_rate") or dev.get("co2_emissions_kg_per_mwh") or dev.get("co2_kg_per_mwh") or 0.0
                    capacity_str = f"{capacity:,.1f}" if isinstance(capacity, (int, float)) else str(capacity)
                    co2_str = f"{co2_rate:,.1f}" if isinstance(co2_rate, (int, float)) else str(co2_rate)
                    md.append(f"| {dev_id} | {dev_name} | {dev_type} | {capacity_str} | {co2_str} |\n")
                md.append("\n")
        
        # === SECTION 3: MARKET PHASES ===
        md.append("## 3. Market Phases & Editability\n\n")
        
        if "scenario_config" in inputs and inputs["scenario_config"]:
            config = inputs["scenario_config"]
            forecast_phases = config.get("forecast_phases", [])
            
            if forecast_phases:
                md.append("| Round | Phase | DAM Editable | IDM Editable | Start Hour | Duration (h) |\n")
                md.append("|-------|-------|--------------|--------------|------------|--------------|\n")
                
                for phase in forecast_phases:
                    round_no = phase.get("round", "?")
                    phase_name = phase.get("phase", "?")
                    dam_edit = "✓" if phase.get("dam_editable", False) else "✗"
                    idm_edit = "✓" if phase.get("idm_editable", False) else "✗"
                    start_hour = phase.get("start_hour", 0)
                    hours = phase.get("hours", 0)
                    md.append(f"| {round_no} | {phase_name} | {dam_edit} | {idm_edit} | {start_hour} | {hours} |\n")
                md.append("\n")
            else:
                md.append("*No forecast phases configured*\n\n")
        
        # === SECTION 4: PLAYER FORECASTS (INPUTS) ===
        md.append("## 4. Player Forecast Submission\n\n")
        
        if "forecast_data" in inputs and inputs["forecast_data"]:
            forecast = inputs["forecast_data"]
            
            # Per device, per lot - NOW SHOW ALL HOURS
            for dev_id, dev_forecast in forecast.items():
                md.append(f"### Device: {dev_id}\n\n")
                lot_labels = _get_present_bid_labels(dev_forecast)
                if not lot_labels:
                    continue
                
                # Check structure: single price or price array?
                first_lot = dev_forecast.get(lot_labels[0], {})
                has_price_array = "prices" in first_lot
                
                if has_price_array:
                    # Old structure: prices array, amounts array
                    total_hours = max(len(dev_forecast.get(label, {}).get("prices", [])) for label in lot_labels)
                    md.append(f"**All {total_hours} Hours:**\n\n")
                    headers = ["Hour"]
                    separators = ["------"]
                    for label in lot_labels:
                        title = LOT_DISPLAY_NAMES.get(label, f"Lot {label}")
                        headers.extend([f"{title} Price", f"{title} Amount"])
                        separators.extend(["------------", "-------------"])
                    md.append(f"| {' | '.join(headers)} |\n")
                    md.append(f"| {' | '.join(separators)} |\n")
                    
                    for hour in range(total_hours):
                        row = [f"H{hour} ({hour:02d}:00)"]
                        for label in lot_labels:
                            prices = dev_forecast.get(label, {}).get("prices", [])
                            amounts = dev_forecast.get(label, {}).get("amounts", [])
                            row.append(prices[hour] if hour < len(prices) else "-")
                            row.append(amounts[hour] if hour < len(amounts) else "-")
                        md.append(f"| {' | '.join(map(str, row))} |\n")
                else:
                    # New structure: single price, hours array
                    total_hours = max(len(dev_forecast.get(label, {}).get("hours", [])) for label in lot_labels)
                    price_summary = " | ".join(
                        f"{LOT_DISPLAY_NAMES.get(label, f'Lot {label}')} = {dev_forecast.get(label, {}).get('price', 'N/A')} ZAR/MWh"
                        for label in lot_labels
                    )
                    md.append(f"**Prices:** {price_summary}\n\n")
                    md.append(f"**All {total_hours} Hours:**\n\n")
                    headers = ["Hour"] + [f"{LOT_DISPLAY_NAMES.get(label, f'Lot {label}')} (MW)" for label in lot_labels]
                    separators = ["------"] + ["-----------" for _ in lot_labels]
                    md.append(f"| {' | '.join(headers)} |\n")
                    md.append(f"| {' | '.join(separators)} |\n")
                    
                    for hour in range(total_hours):
                        row = [f"H{hour} ({hour:02d}:00)"]
                        for label in lot_labels:
                            hours = dev_forecast.get(label, {}).get("hours", [])
                            row.append(f"{hours[hour]:.2f}" if hour < len(hours) else "-")
                        md.append(f"| {' | '.join(row)} |\n")
                md.append("\n")
        
        # === SECTION 5: MARKET CLEARING RESULTS ===
        md.append("## 5. Market Clearing Results\n\n")
        
        if "hourly_results" in calculations:
            hourly = calculations["hourly_results"]  # ALL HOURS
            md.append(f"**All {len(hourly)} Hours:**\n\n")
            md.append("| Scenario Hour | Round Hour | Hour of Day | SMP (ZAR/MWh) | Volume (MWh) |\n")
            md.append("|---------------|------------|-------------|---------------|---------------|\n")
            for h in hourly:
                h_unified = format_unified_hour(h)
                smp = h.get("smp", 0)
                volume = h.get("volume", 0)
                md.append(f"| {h_unified['display_label']} | {h_unified['round_hour_offset']} | {h_unified['hour_of_day']:02d}:00 | {smp:,.1f} | {volume:,.2f} |\n")
            md.append("\n")
        
        # === SECTION 5A: MARKET BID OVERVIEW (DAM & IDM) ===
        md.append("## 5a. Market Bid Overview (All Scenario Hours)\n\n")
        md.append("*Bids submitted up to round start, market trading status, and clearing status for each hour*\n\n")
        
        # Query all forecasts for this session up to current round
        try:
            from .models import Forecast
            from sqlalchemy import and_
            
            # Get all forecasts for this session up to and including current round
            all_forecasts = Forecast.query.filter(
                and_(
                    Forecast.session_id == session_id,
                    Forecast.round_num <= round_num
                )
            ).order_by(Forecast.round_num, Forecast.submitted_at).all()
            
            # Get scenario config for market timeline
            config_data = inputs.get("scenario_config", {})
            general_cfg = config_data.get("general", {})
            markets_cfg = config_data.get("markets", {})
            horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
            round_span = int(general_cfg.get("round_span_hours", 6))
            
            # Determine market status helper
            def get_market_status_for_round(market_key, round_idx):
                """Get trading/clearing status for a market at a specific round."""
                market = markets_cfg.get(market_key, {})
                if isinstance(market, dict):
                    trading = market.get("trading", [])
                    clearing = market.get("clearing", [])
                else:
                    # Legacy format
                    trading = market if isinstance(market, list) else []
                    clearing = trading
                
                # Get status for this round (0-indexed)
                trading_status = trading[round_idx] if round_idx < len(trading) else "market_code"
                clearing_status = clearing[round_idx] if round_idx < len(clearing) else "market_code"
                return trading_status, clearing_status
            
            # Build bid accumulator: {hour: {player: {device: {market: bids}}}}
            hour_bids = {}
            for fc in all_forecasts:
                if not fc.bids:
                    continue
                fc_round = fc.round_num
                fc_player = fc.player_id
                
                # Round 1 = DAM, Round >1 = IDM
                market_type = "DAM" if fc_round == 1 else "IDM"
                
                for dev_id, dev_bids in fc.bids.items():
                    # Each device has lots A, B, C with hours arrays
                    for lot_label in ["A", "B", "C"]:
                        if lot_label not in dev_bids:
                            continue
                        lot_data = dev_bids[lot_label]
                        price = lot_data.get("price", 0)
                        hours_arr = lot_data.get("hours", [])
                        
                        for hour_idx, amount in enumerate(hours_arr):
                            if amount == 0:
                                continue
                            if hour_idx not in hour_bids:
                                hour_bids[hour_idx] = {}
                            if fc_player not in hour_bids[hour_idx]:
                                hour_bids[hour_idx][fc_player] = {}
                            if dev_id not in hour_bids[hour_idx][fc_player]:
                                hour_bids[hour_idx][fc_player][dev_id] = {"DAM": [], "IDM": []}
                            
                            hour_bids[hour_idx][fc_player][dev_id][market_type].append({
                                "lot": lot_label,
                                "price": price,
                                "amount": amount,
                                "round": fc_round
                            })
            
            # BUG FIX N1: Extract actually cleared hours from engine results (volume > 0)
            # instead of using pauschale round arithmetic
            cleared_hours_this_round = set()
            if "hourly_results" in calculations:
                hourly = calculations["hourly_results"]
                for h in hourly:
                    hour_offset = h.get("hour_offset", h.get("hour_idx"))
                    volume = h.get("volume", 0)
                    if volume > 0 and hour_offset is not None:
                        cleared_hours_this_round.add(hour_offset)
            
            # Build clearing status for each hour
            base_idx_this_round = (round_num - 1) * round_span
            
            # === DAM Table ===
            md.append("### Day-Ahead Market (DAM)\n\n")
            md.append("*Bids submitted in Round 1, cleared in Round 1*\n\n")
            md.append("| Hour | Trading Status (R1) | Expected Clearing | Actual Clearing | Match | Total Bids | Players | Devices |\n")
            md.append("|------|---------------------|-------------------|-----------------|-------|------------|---------|----------|\n")
            
            for hour_idx in range(horizon_hours):
                # Get market status for Round 1 (DAM is always Round 1)
                trading_status, clearing_status = get_market_status_for_round("dam", 0)  # Round 1 = index 0
                
                # FORENSIC: Expected status (timeline-based)
                if hour_idx < base_idx_this_round:
                    expected_clear = "Cleared (Past)"
                elif hour_idx in cleared_hours_this_round and round_num == 1:
                    expected_clear = f"Clearing R{round_num}"
                elif round_num == 1:
                    expected_clear = f"Clearing R{round_num}"
                else:
                    expected_clear = "Cleared (R1)"
                
                # FORENSIC: Actual status (data-based)
                if hour_idx in cleared_hours_this_round:
                    actual_clear = f"Cleared R{round_num}"
                elif hour_idx < base_idx_this_round:
                    actual_clear = "Cleared (Past)"
                else:
                    actual_clear = "Not Cleared Yet"
                
                # FORENSIC: Status match validation
                if hour_idx in cleared_hours_this_round and round_num == 1:
                    status_match = "✓"
                elif hour_idx not in cleared_hours_this_round and round_num > 1:
                    status_match = "✓"
                elif hour_idx not in cleared_hours_this_round and round_num == 1:
                    status_match = "<span style='color: orange;'>⚠️ WARN</span>"
                else:
                    status_match = "✓"
                
                # Count DAM bids for this hour
                dam_bids_count = 0
                players_with_bids = set()
                devices_with_bids = set()
                if hour_idx in hour_bids:
                    for player_id, player_devs in hour_bids[hour_idx].items():
                        for dev_id, markets in player_devs.items():
                            if markets["DAM"]:
                                dam_bids_count += len(markets["DAM"])
                                players_with_bids.add(player_id)
                                devices_with_bids.add(dev_id)
                
                # Trading status display
                trade_display = "✓ Open" if trading_status in ["on", "market_code"] else "✗ Closed"
                time_str = f"({hour_idx:02d}:00)"
                
                md.append(f"| H{hour_idx} {time_str} | {trade_display} | {expected_clear} | {actual_clear} | {status_match} | {dam_bids_count} | {len(players_with_bids)} | {len(devices_with_bids)} |\n")
            md.append("\n")
            
            # === IDM Table ===
            md.append("### Intraday Market (IDM)\n\n")
            md.append("*Bids submitted in Rounds 2+, cleared progressively*\n\n")
            md.append("| Hour | Trading Status (Current) | Clearing Status | Total Bids | Players | Devices |\n")
            md.append("|------|--------------------------|-----------------|------------|---------|----------|\n")
            
            for hour_idx in range(horizon_hours):
                # Get market status for current round
                round_idx = round_num - 1
                trading_status, clearing_status = get_market_status_for_round("idm", round_idx)
                
                # BUG FIX N1: Determine clearing status from ACTUAL cleared hours
                if hour_idx in cleared_hours_this_round:
                    clear_stat = f"⏳ Clearing R{round_num}" if round_num > 1 else "⏸ Future (R2+)"
                elif hour_idx < base_idx_this_round:
                    clear_stat = "✓ Cleared (Past)"
                else:
                    clear_stat = "⏸ Future"
                
                # Count IDM bids
                idm_bids_count = 0
                players_with_bids = set()
                devices_with_bids = set()
                if hour_idx in hour_bids:
                    for player_id, player_devs in hour_bids[hour_idx].items():
                        for dev_id, markets in player_devs.items():
                            if markets["IDM"]:
                                idm_bids_count += len(markets["IDM"])
                                players_with_bids.add(player_id)
                                devices_with_bids.add(dev_id)
                
                # Trading status
                trade_display = "✓ Open" if trading_status in ["on", "market_code"] else "✗ Closed"
                time_str = f"({hour_idx:02d}:00)"
                
                md.append(f"| H{hour_idx} {time_str} | {trade_display} | {clear_stat} | {idm_bids_count} | {len(players_with_bids)} | {len(devices_with_bids)} |\n")
            md.append("\n")
            
        except Exception as e:
            md.append(f"*Error generating market bid overview: {e}*\n\n")

        # === SECTION 5B: ROUND EVENTS & CHALLENGES ===
        md.append("## 5b. Round Events & Challenges\n\n")

        # Events active in this round (data-based)
        active_events = []
        try:
            from .engine import select_events_for_round
            config = inputs.get("scenario_config", {}) if isinstance(inputs, dict) else {}
            events_cfg = config.get("events", []) if isinstance(config, dict) else []
            active_events = select_events_for_round(events_cfg, round_num)
        except Exception:
            active_events = []

        if active_events:
            md.append("### Events Active This Round\n\n")
            md.append("| Name | Type | Target | Trigger | Duration |\n")
            md.append("|------|------|--------|---------|----------|\n")
            for evt in active_events:
                name = evt.get("name", "Event")
                evt_type = evt.get("type", evt.get("event_type", "-"))
                target = evt.get("target", "all")
                target_id = evt.get("target_id", "-")
                trigger_type = evt.get("trigger_type", "round")
                trigger_value = evt.get("trigger_value", "-")
                duration = evt.get("duration_rounds", 1)
                target_display = f"{target}:{target_id}" if target_id not in [None, "", "-"] else target
                md.append(f"| {name} | {evt_type} | {target_display} | {trigger_type}={trigger_value} | {duration} |\n")
            md.append("\n")
        else:
            md.append("*No active events for this round*\n\n")

        # Challenges for this round
        challenge_result = results.get("challenge_result") if isinstance(results, dict) else None
        challenge_items = challenge_result.get("results", []) if isinstance(challenge_result, dict) else []
        round_challenges = [c for c in challenge_items if c.get("per_round")]
        scenario_challenges = [c for c in challenge_items if not c.get("per_round")]

        md.append("### Round-Based Challenges\n\n")
        if round_challenges:
            md.append("| Challenge | Metric | Target | Actual | Result | Points |\n")
            md.append("|-----------|--------|--------|--------|--------|--------|\n")
            for c in round_challenges:
                name = c.get("name", c.get("challenge_id", "Challenge"))
                metric = c.get("metric", "-")
                target = c.get("target", "-")
                actual = c.get("actual", "-")
                passed = "✓" if c.get("passed") else "✗"
                points = f"{c.get('points', 0)}/{c.get('max_points', 0)}"
                md.append(f"| {name} | {metric} | {target} | {actual} | {passed} | {points} |\n")
            md.append("\n")
        else:
            md.append("*No round-based challenges evaluated*\n\n")

        md.append("### Scenario-Based Challenges (Progress)\n\n")
        if scenario_challenges:
            md.append("| Challenge | Metric | Target | Actual | Result | Points |\n")
            md.append("|-----------|--------|--------|--------|--------|--------|\n")
            for c in scenario_challenges:
                name = c.get("name", c.get("challenge_id", "Challenge"))
                metric = c.get("metric", "-")
                target = c.get("target", "-")
                actual = c.get("actual", "-")
                passed = "✓" if c.get("passed") else "✗"
                points = f"{c.get('points', 0)}/{c.get('max_points', 0)}"
                md.append(f"| {name} | {metric} | {target} | {actual} | {passed} | {points} |\n")
            md.append("\n")
        else:
            md.append("*No scenario-based challenges evaluated*\n\n")
        
        # === SECTION 6: DISPATCH DETAILS ===
        md.append("## 6. Device Dispatch Details\n\n")
        
        # Check if we have bid_dispatch data with actual content
        has_bid_dispatch_data = False
        if "bid_dispatch" in results and results["bid_dispatch"]:
            bid_dispatch = results["bid_dispatch"]
            
            # Check if there's at least one device with data
            for dev_id, dev_data in bid_dispatch.items():
                if dev_data and any(dev_data.get(lot) for lot in _get_present_bid_labels(dev_data)):
                    has_bid_dispatch_data = True
                    break
            
            if has_bid_dispatch_data:
                for dev_id, dev_data in bid_dispatch.items():
                    md.append(f"### Device: {dev_id}\n\n")
                    
                    # Get device capacity for highlighting
                    dev_capacity = device_capacities.get(dev_id)
                    
                    # Show ALL hours for each lot
                    for lot_label in _get_present_bid_labels(dev_data):
                        lot_name = LOT_DISPLAY_NAMES.get(lot_label, f"Lot {lot_label}")
                        if lot_label in dev_data and isinstance(dev_data[lot_label], list) and len(dev_data[lot_label]) > 0:
                            total_hours = len(dev_data[lot_label])
                            md.append(f"**{lot_name} Lot (All {total_hours} Hours):**\n\n")
                            md.append("| Hour | Offered (MW) | Dispatched (MW) | Price Bid | SMP | Acceptance |\n")
                            md.append("|------|--------------|-----------------|-----------|-----|------------|\n")
                            
                            for lot_hour in dev_data[lot_label]:
                                h_unified = format_unified_hour(lot_hour)
                                offered = lot_hour.get("mw_offered", 0)
                                dispatched = lot_hour.get("mw_dispatched", 0)
                                price_bid = lot_hour.get("price_bid", 0)
                                smp = lot_hour.get("smp", 0)
                                ratio = lot_hour.get("acceptance_ratio", 0)
                                
                                # Red highlighting if exceeds capacity
                                offered_str = f"{offered:,.2f}"
                                dispatched_str = f"{dispatched:,.2f}"
                                
                                if dev_capacity:
                                    if offered > dev_capacity:
                                        offered_str = f'<span style="color: red; font-weight: bold;">{offered:,.2f}</span>'
                                    if dispatched > dev_capacity:
                                        dispatched_str = f'<span style="color: red; font-weight: bold;">{dispatched:,.2f}</span>'
                                
                                md.append(f"| {h_unified['display_label']} | {offered_str} | {dispatched_str} | {price_bid:,.1f} | {smp:,.1f} | {ratio:.1%} |\n")
                            md.append("\n")
        
        # BUG FIX P1-1: Show balancing details when bid_dispatch not available or empty
        # This ensures imbalance costs are always auditable
        if not has_bid_dispatch_data and "device_hourly_details" in results and "balancing" in results["device_hourly_details"]:
            md.append("*Showing balancing/imbalance details (full bid dispatch data not available)*\n\n")
            balancing_data = results["device_hourly_details"]["balancing"]
            
            for dev_id, dev_entries in balancing_data.items():
                if not dev_entries:
                    continue
                    
                md.append(f"### Device: {dev_id}\n\n")
                md.append("| Scenario Hour | Round Hour | DA Dispatch | ID Dispatch | Total Commit | Actual | Imbalance | Cost (ZAR) |\n")
                md.append("|---------------|------------|-------------|-------------|--------------|--------|-----------|------------|\n")
                
                for entry in dev_entries:
                    h_unified = format_unified_hour(entry)
                    da_disp = entry.get("da_dispatched_mwh", 0)
                    id_disp = entry.get("id_dispatched_mwh", 0)
                    total_disp = entry.get("total_dispatched_mwh", 0)
                    actual = entry.get("actual_mwh", 0)
                    imbalance = entry.get("imbalance_mwh", 0)
                    cost = entry.get("balancing_cost_zar", 0)
                    
                    md.append(f"| {h_unified['display_label']} | {h_unified['round_hour_offset']} | {da_disp:.3f} | {id_disp:.3f} | {total_disp:.3f} | {actual:.3f} | {imbalance:.3f} | {cost:,.2f} |\n")
                
                md.append("\n")
        
        # === SECTION 7: CAPACITY ANALYSIS (per Device) ===
        md.append("## 7. Capacity Analysis (per Device)\n\n")
        
        # P1-C FIX: Check if bid_dispatch has actual data
        has_capacity_data = False
        if "bid_dispatch" in results and results["bid_dispatch"] and device_capacities:
            bid_dispatch = results["bid_dispatch"]
            
            # Check if there's at least one device with data
            for dev_id, dev_data in bid_dispatch.items():
                if dev_data and any(dev_data.get(lot) for lot in _get_present_bid_labels(dev_data)):
                    has_capacity_data = True
                    break
            
            if has_capacity_data:
                md.append("*Shows device capacity vs. total offered bids to identify overbidding*\n\n")
            
                for dev_id, dev_data in bid_dispatch.items():
                    dev_capacity = device_capacities.get(dev_id)
                    if not dev_capacity:
                        continue
                    
                    md.append(f"### Device: {dev_id} (Capacity: {dev_capacity:.1f} MW)\n\n")
                    
                    # Aggregate total offered per hour across all lots
                    total_hours = 0
                    hourly_totals = {}  # {hour_offset: total_offered}
                    
                    for lot_label in _get_present_bid_labels(dev_data):
                        if lot_label in dev_data and isinstance(dev_data[lot_label], list):
                            for lot_hour in dev_data[lot_label]:
                                hour = lot_hour.get('hour_offset', 0)
                                offered = lot_hour.get('mw_offered', 0)
                                
                                if hour not in hourly_totals:
                                    hourly_totals[hour] = 0.0
                                hourly_totals[hour] += offered
                    
                    if not hourly_totals:
                        md.append("*No bid data available*\n\n")
                        continue
                    
                    # Show capacity comparison for all hours
                md.append("| Scenario Hour | Round Hour | Hour of Day | Total Offered (MW) | Capacity (MW) | Overbid (MW) | Status |\n")
                md.append("|---------------|------------|-------------|--------------------|---------------|--------------|--------|\n")
                
                # P2-A FIX: Build hour mapping for unified labels
                hour_metadata = {}  # {hour_offset: unified_hour}
                if "bid_dispatch" in results and results["bid_dispatch"]:
                    for dev_id, dev_data in results["bid_dispatch"].items():
                        for lot_label in _get_present_bid_labels(dev_data):
                            if lot_label in dev_data and isinstance(dev_data[lot_label], list):
                                for lot_hour in dev_data[lot_label]:
                                    h_offset = lot_hour.get('hour_offset', 0)
                                    if h_offset not in hour_metadata:
                                        hour_metadata[h_offset] = format_unified_hour(lot_hour)
                                break  # Only need one lot to get hour metadata
                        break  # Only need one device
                
                for hour in sorted(hourly_totals.keys()):
                    total_offered = hourly_totals[hour]
                    overbid = max(0, total_offered - dev_capacity)
                    
                    # Get unified hour labels
                    h_unified = hour_metadata.get(hour, {
                        'scenario_hour_idx': hour,
                        'round_hour_offset': hour,
                        'hour_of_day': hour % 24,
                        'display_label': f'H{hour}'
                    })
                    
                    status = "✓ OK"
                    offered_str = f"{total_offered:.2f}"
                    overbid_str = "-"
                    
                    if overbid > 0:
                        status = '<span style="color: red; font-weight: bold;">⚠ OVERBID</span>'
                        offered_str = f'<span style="color: red; font-weight: bold;">{total_offered:.2f}</span>'
                        overbid_str = f'<span style="color: red; font-weight: bold;">{overbid:.2f}</span>'
                    
                    md.append(f"| {h_unified['display_label']} | {h_unified['round_hour_offset']} | {h_unified['hour_of_day']:02d}:00 | {offered_str} | {dev_capacity:.2f} | {overbid_str} | {status} |\n")
                
                md.append("\n")
        
        # === SECTION 8: FINANCIAL RESULTS (KPIs) ===
        md.append("## 8. Financial Results (KPIs)\n\n")
        
        if "kpis" in results:
            kpis = results["kpis"]
            md.append("| Metric | Value |\n")
            md.append("|--------|-------|\n")
            
            # Support both variants: with _zar suffix (normal) and without (clearing disabled)
            revenue = kpis.get('revenue_zar', kpis.get('revenue', 0))
            variable_cost = kpis.get('variable_cost_zar', kpis.get('variable_cost', 0))
            fixed_cost = kpis.get('fixed_cost_zar', kpis.get('fixed_cost', 0))
            imbalance_cost = kpis.get('imbalance_cost_zar', kpis.get('imbalance_cost', 0))
            curtailment_cost = kpis.get('curtailment_cost_zar', kpis.get('curtailment_cost', 0))
            congestion_revenue = kpis.get('congestion_revenue_zar', kpis.get('congestion_revenue', 0))
            co2_emissions = kpis.get('co2_emissions_kg', 0)
            profit = kpis.get('profit_zar', kpis.get('net_profit', 0))
            
            md.append(f"| Revenue | {revenue:,.0f} ZAR |\n")
            md.append(f"| Variable Cost | {variable_cost:,.0f} ZAR |\n")
            md.append(f"| Fixed Cost | {fixed_cost:,.0f} ZAR |\n")
            md.append(f"| Imbalance Cost | {imbalance_cost:,.0f} ZAR |\n")
            md.append(f"| Curtailment Cost | {curtailment_cost:,.0f} ZAR |\n")
            md.append(f"| Congestion Revenue | {congestion_revenue:,.0f} ZAR |\n")
            md.append(f"| CO2 Emissions | {co2_emissions:,.0f} kg |\n")
            md.append(f"| **Net Profit** | **{profit:,.0f} ZAR** |\n")
            md.append("\n")

            # Explain KPI math with round numbers
            md.append("### KPI Calculation Notes\n\n")
            md.append("- Revenue = sum of cleared energy * SMP (DA + ID if applicable)\n")
            md.append("- Variable Cost = sum(device dispatched MWh * variable_cost_zar_per_mwh)\n")
            md.append("- Fixed Cost = sum(device fixed_cost_zar_per_hour)\n")
            md.append("- Imbalance Cost = imbalance_mwh * balancing_price (up/down)\n")
            md.append("- Curtailment Cost = curtailment_mwh * price (info-only if not charged)\n")
            md.append("- Net Profit = Revenue - Variable Cost - Fixed Cost - Imbalance Cost + Congestion Revenue\n\n")

            planned_mwh = kpis.get("planned_mwh", 0)
            dispatched_mwh = kpis.get("dispatched_mwh", 0)
            actual_mwh = kpis.get("actual_mwh", 0)
            imbalance_mwh = kpis.get("imbalance_mwh", 0)
            curtailment_mwh = kpis.get("curtailment_mwh", 0)

            md.append("| KPI Input | Value |\n")
            md.append("|-----------|-------|\n")
            md.append(f"| Planned MWh | {planned_mwh:,.3f} |\n")
            md.append(f"| Dispatched MWh | {dispatched_mwh:,.3f} |\n")
            md.append(f"| Actual MWh | {actual_mwh:,.3f} |\n")
            md.append(f"| Imbalance MWh | {imbalance_mwh:,.3f} |\n")
            md.append(f"| Curtailment MWh | {curtailment_mwh:,.3f} |\n")
            md.append("\n")
        
        # === SECTION 9: DEVICE CAPACITY & HOURLY DETAILS ===
        md.append("## 9. Device Capacity & Hourly Details\n\n")

        # Capacity debug from device_hourly_breakdown
        if "kpis" in results:
            kpis = results.get("kpis", {})
            device_hourly_breakdown = kpis.get("device_hourly_breakdown", {})
            debug_info = kpis.get("debug_info", {}) if isinstance(kpis, dict) else {}
            device_type_map = debug_info.get("device_type_map", {}) if isinstance(debug_info, dict) else {}

            if device_hourly_breakdown:
                md.append("### Device Capacity Summary\n\n")
                md.append("*Netto-Kapazität und Kapazitätsquelle (KSI) für jedes Gerät*\n\n")
                md.append("| Device ID | Type | Net Capacity (MW) | KSI (Mix Key) | Availability Source |\n")
                md.append("|-----------|------|-------------------|---------------|---------------------|\n")
                
                # Collect summary from first hour of each device
                for dev_id, hours in device_hourly_breakdown.items():
                    if hours and len(hours) > 0:
                        first_hour = hours[0]
                        dev_type = device_type_map.get(dev_id, "-")
                        net_capacity = first_hour.get("base_capacity_mw", 0)
                        cap_debug = first_hour.get("capacity_debug", {}) if isinstance(first_hour, dict) else {}
                        mix_key = cap_debug.get("mix_key", "-")
                        avail_source = cap_debug.get("availability_source", "-")
                        md.append(f"| {dev_id} | {dev_type} | {net_capacity:.1f} | {mix_key} | {avail_source} |\n")
                md.append("\n")
                
                md.append("### Hourly Capacity Breakdown (All Devices, All Hours)\n\n")
                md.append("*Effektive Kapazität pro Stunde mit vollständigen Berechnungsdetails*\n\n")

                for dev_id, hours in device_hourly_breakdown.items():
                    if not hours:
                        continue
                    md.append(f"**Device: {dev_id}** ({len(hours)} hours)\n\n")
                    md.append("| Hour | Base MW | Effective MW | Source | Mix Key | Hr | Month | Mix Hr | Mix Season | Profile | Cap % | Avail | Avail MW | Ev Mult | Ev Add |\n")
                    md.append("|------|---------|--------------|--------|---------|----|-------|--------|------------|---------|-------|-------|----------|--------|--------|\n")

                    for hour_entry in hours:
                        cap_debug = hour_entry.get("capacity_debug", {}) if isinstance(hour_entry, dict) else {}
                        h_unified = format_unified_hour(hour_entry if isinstance(hour_entry, dict) else {})
                        base_cap = hour_entry.get("base_capacity_mw", 0)
                        eff_cap = hour_entry.get("effective_capacity_mw", 0)
                        source = cap_debug.get("availability_source", "-")
                        mix_key = cap_debug.get("mix_key", "-")
                        hr = cap_debug.get("hour_of_day", "-")
                        month = cap_debug.get("month", "-")
                        mix_hr = cap_debug.get("mix_profile_factor", "-")
                        mix_season = cap_debug.get("mix_seasonal_factor", "-")
                        profile = cap_debug.get("availability_profile_factor", "-")
                        cap_pct = cap_debug.get("capacity_factor_pct", "-")
                        avail = cap_debug.get("availability_factor", "-")
                        avail_mw = cap_debug.get("available_capacity_mw", "-")
                        ev_mult = cap_debug.get("event_mult", "-")
                        ev_add = cap_debug.get("event_add", "-")

                        md.append(
                            f"| {h_unified['display_label']} | {base_cap} | {eff_cap} | {source} | {mix_key} | {hr} | {month} | {mix_hr} | {mix_season} | {profile} | {cap_pct} | {avail} | {avail_mw} | {ev_mult} | {ev_add} |\n"
                        )
                    md.append("\n")
        
        if "device_hourly_details" in results:
            details = results["device_hourly_details"]
            
            # CO2 - ALL HOURS WITH UNIFIED STRUCTURE
            if "co2" in details and details["co2"]:
                md.append("### CO2 Emissions (All Hours, All Devices)\n\n")
                for dev_id, dev_co2 in details["co2"].items():
                    if not dev_co2:  # Skip empty
                        continue
                    total_hours = len(dev_co2)
                    md.append(f"**Device: {dev_id}** ({total_hours} hours)\n\n")
                    md.append("| Scenario Hour | Round Offset | Hour of Day | CO2 (kg) | CO2 Rate (kg/MWh) | Dispatched (MWh) | Formula Check |\n")
                    md.append("|---------------|--------------|-------------|----------|-------------------|------------------|---------------|\n")
                    for hour_data in dev_co2:
                        # Use unified hour structure
                        h_unified = format_unified_hour(hour_data)
                        co2_kg = hour_data.get("co2_kg", 0)
                        co2_rate = hour_data.get("co2_rate", 0)
                        dispatched = hour_data.get("dispatched_mwh", 0)
                        
                        # FORENSIC: Verify formula
                        expected_co2 = dispatched * co2_rate
                        formula_match = "✓" if abs(co2_kg - expected_co2) < 0.1 else f"FAIL ({expected_co2:.1f})"
                        
                        md.append(f"| {h_unified['display_label']} | {h_unified['round_hour_offset']} | {h_unified['hour_of_day']:02d}:00 | {co2_kg:,.1f} | {co2_rate:,.1f} | {dispatched:,.2f} | {formula_match} |\n")
                    md.append("\n")
            
            # Balancing - ALL HOURS WITH FULL IMBALANCE BREAKDOWN (DAM + IDM)
            if "balancing" in details and details["balancing"]:
                md.append("### Balancing/Imbalance Breakdown (All Hours, All Devices)\n\n")
                # P1-B FIX: Dynamic header based on round number
                if round_num == 1:
                    md.append("*Shows DAM dispatch vs. actual delivery. For Round 1 (DAM only), DA Dispatch = Total Dispatch, ID Dispatch = 0.*\n\n")
                else:
                    md.append("*Shows DAM + IDM dispatch vs. actual delivery. DA Dispatch = Round 1 baseline, ID Dispatch = cumulative changes from Rounds 2+.*\n\n")
                for dev_id, dev_bal in details["balancing"].items():
                    if not dev_bal:  # Skip empty
                        continue
                    total_hours = len(dev_bal)
                    
                    # Get device capacity
                    dev_capacity = device_capacities.get(dev_id)
                    capacity_info = f" | Capacity: {dev_capacity:.1f} MW" if dev_capacity else ""
                    
                    # Check if we have DAM+IDM breakdown (new format with da_dispatched_mwh)
                    has_dam_idm_breakdown = any('da_dispatched_mwh' in h for h in dev_bal)
                    
                    md.append(f"**Device: {dev_id}** ({total_hours} hours{capacity_info})\n\n")
                    
                    if has_dam_idm_breakdown:
                        # NEW FORMAT: Show DAM + IDM breakdown
                        md.append("| Hour | DA Dispatch | ID Dispatch | Total Commit | Actual | Imbalance | Price | Cost (ZAR) |\n")
                        md.append("|------|-------------|-------------|--------------|--------|-----------|-------|------------|\n")
                        
                        for hour_data in dev_bal:
                            # Use unified hour structure
                            h_unified = format_unified_hour(hour_data)
                            da_dispatch = hour_data.get("da_dispatched_mwh", 0)
                            id_dispatch = hour_data.get("id_dispatched_mwh", 0)
                            total_dispatch = hour_data.get("total_dispatched_mwh", 0)
                            actual = hour_data.get("actual_mwh", 0)
                            imbalance = hour_data.get("imbalance_mwh", 0)
                            price = hour_data.get("balancing_price", 0)
                            cost = hour_data.get("balancing_cost_zar", 0)
                            
                            # FORENSIC: Validate DA-only in Round 1
                            validation = ""
                            if h_unified['round_num'] == 1:
                                if abs(da_dispatch - total_dispatch) > 0.001:
                                    validation = " ⚠️ FAIL: DA≠Total in Round 1"
                                if abs(id_dispatch) > 0.001:
                                    validation += " ⚠️ FAIL: ID>0 in Round 1"
                            
                            # Highlight significant imbalances
                            imbalance_str = f"{imbalance:,.3f}{validation}"
                            if abs(imbalance) > 0.1:
                                imbalance_str = f'<span style="color: orange; font-weight: bold;">{imbalance:,.3f}</span>{validation}'
                            if abs(imbalance) > 1.0:
                                imbalance_str = f'<span style="color: red; font-weight: bold;">{imbalance:,.3f}</span>{validation}'
                            
                            md.append(f"| {h_unified['display_label']} | {da_dispatch:,.3f} | {id_dispatch:,.3f} | {total_dispatch:,.3f} | {actual:,.3f} | {imbalance_str} | {price:,.0f} | {cost:,.0f} |\n")
                    else:
                        # OLD FORMAT: Simple imbalance
                        md.append("| Hour | Imbalance (MWh) | Overbid? | Price (ZAR/MWh) | Cost (ZAR) |\n")
                        md.append("|------|-----------------|----------|-----------------|------------|\n")
                        
                        for hour_data in dev_bal:
                            hour = hour_data.get("hour_offset", hour_data.get("hour", "?"))
                            imbalance = hour_data.get("imbalance_mwh", 0)
                            price = hour_data.get("balancing_price", 0)
                            cost = hour_data.get("balancing_cost_zar", 0)
                            dispatched = hour_data.get("dispatched_mwh", 0)
                            
                            # Check for overbid (dispatch exceeds capacity)
                            overbid_str = "-"
                            if dev_capacity and dispatched > dev_capacity:
                                excess = dispatched - dev_capacity
                                overbid_str = f'<span style="color: red; font-weight: bold;">YES (+{excess:.2f})</span>'
                            elif imbalance != 0:
                                overbid_str = "Noise"
                            
                            time_str = f"({hour:02d}:00)" if isinstance(hour, int) else ""
                            md.append(f"| H{hour} {time_str} | {imbalance:,.3f} | {overbid_str} | {price:,.1f} | {cost:,.0f} |\n")
                    
                    md.append("\n")
        
        # === FORENSIC SECTION: HOUR RECONCILIATION ===
        if "hour_reconciliation" in results and results["hour_reconciliation"]:
            md.append("## Forensic Analysis: Hour Reconciliation\n\n")
            md.append("*Verifies that clearing volume matches dispatch across all hours*\n\n")
            md.append("| Scenario Hour | Round Hour | Supply Offered | Supply Dispatched | Demand Offered | Clearing Volume | Player Dispatch Sum | Device Dispatch Sum | ΔClearing-Player | ΔClearing-Device | Status |\n")
            md.append("|---------------|------------|----------------|-------------------|----------------|-----------------|---------------------|---------------------|------------------|------------------|--------|\n")
            
            for recon in results["hour_reconciliation"]:
                h_unified = format_unified_hour(recon)
                supply_offered = recon.get('supply_offered_total_mw', 0)
                supply_dispatched = recon.get('supply_dispatched_total_mw', 0)
                demand_offered = recon.get('demand_offered_total_mw', 0)
                clearing_vol = recon.get('clearing_volume_mwh', 0)
                player_sum = recon.get('per_player_dispatched_sum_mwh', 0)
                device_sum = recon.get('per_device_dispatched_sum_mwh', 0)
                delta_player = recon.get('delta_clearing_vs_player', 0)
                delta_device = recon.get('delta_clearing_vs_device', 0)
                status = recon.get('status', 'UNKNOWN')
                
                # Color-code status
                status_display = status
                if status == 'FAIL':
                    status_display = f'<span style="color: red; font-weight: bold;">FAIL</span>'
                    issue = recon.get('issue', '')
                    if issue:
                        status_display += f' ({issue})'
                elif status == 'WARN':
                    status_display = f'<span style="color: orange;">WARN</span>'
                else:
                    status_display = '✓'
                
                md.append(f"| {h_unified['display_label']} | {h_unified['round_hour_offset']} | {supply_offered:,.2f} | {supply_dispatched:,.2f} | {demand_offered:,.2f} | {clearing_vol:,.2f} | {player_sum:,.2f} | {device_sum:,.2f} | {delta_player:,.3f} | {delta_device:,.3f} | {status_display} |\n")
            md.append("\n")
        
        # === FORENSIC SECTION: BASELINE LOOKUP TRACE ===
        if "baseline_lookup_trace" in results and results["baseline_lookup_trace"]:
            md.append("## Forensic Analysis: DA Baseline Lookup Trace\n\n")
            md.append("*Documents how Day-Ahead baseline was loaded for Intraday rounds*\n\n")
            trace = results["baseline_lookup_trace"]
            md.append(f"**Source Round:** {trace.get('source_round', 'N/A')}\n")
            md.append(f"**Source Session:** {trace.get('source_session_id', 'N/A')}\n")
            md.append(f"**Lookup Method:** {trace.get('lookup_method', 'N/A')}\n")
            md.append(f"**Timestamp:** {trace.get('timestamp', 'N/A')}\n\n")
            
            players_found = trace.get('players_found', [])
            md.append(f"**Players Found:** {len(players_found)}\n\n")
            
            devices_per_player = trace.get('devices_per_player', {})
            if devices_per_player:
                md.append("| Player ID | Devices Found |\n")
                md.append("|-----------|---------------|\n")
                for pid, devices in devices_per_player.items():
                    md.append(f"| {pid} | {', '.join(devices)} |\n")
            md.append("\n")
        
        md.append("---\n\n")
        
        # === FORENSIC SECTION: MACHINE-READABLE AUDIT APPENDIX ===
        if "debug_audit_payload" in results:
            md.append("## Machine-Readable Audit Payload\n\n")
            md.append("```json\n")
            md.append(json.dumps(results["debug_audit_payload"], indent=2))
            md.append("\n```\n\n")
        
        md.append(f"*Forensic debug log generated at {timestamp.isoformat()} | Version: forensic_v1*\n")
        
        return "".join(md)


# Global instance
_debug_logger = None


def get_debug_logger() -> CalculationDebugLogger:
    """Get or create the global debug logger instance."""
    global _debug_logger
    if _debug_logger is None:
        _debug_logger = CalculationDebugLogger()
    return _debug_logger
