from http import HTTPStatus
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone
import math
import os, json

from .extensions import db, socketio
from .models import Forecast, Session, Scenario, CohortMember, SessionPlayerType, SessionStatus
from .models import CampaignScenario, Campaign, PlayerProgress, PlayerProgressStatus, Cohort
from .models import SessionAllowedType, Result, ActivityLog, User, Role
from .utils import log_activity

# Import baseline generation from engine
try:
    from .engine import generate_device_baseline
except ImportError:
    def generate_device_baseline(device: dict, player_count: int, hour: int, start_time: str) -> float:
        return 0.0

# Import device validation
try:
    from .device_types import validate_forecast_constraints, validate_bid_monotonicity
except ImportError:
    # Fallback if device_types not available
    def validate_forecast_constraints(device: dict, forecast_mw: list) -> list:
        return []
    def validate_bid_monotonicity(bids: dict, direction: str = "nondecreasing") -> list:
        return []

# Import test data generator
try:
    from .test_data_generator import generate_test_data, validate_capacity
except ImportError:
    # Fallback if test_data_generator not available
    def generate_test_data(*args, **kwargs):
        return {"error": "Test data generator not available"}
    def validate_capacity(*args, **kwargs):
        return {"valid": False, "errors": ["Validator not available"]}


ns = Namespace("player", description="Player endpoints")


def _normalize_market_status(status_value) -> str:
    value = str(status_value or "market_code").strip().lower()
    mapping = {
        "on": "on",
        "enabled": "on",
        "off": "off",
        "disabled": "off",
        "market_code": "market_code",
        "marketcode": "market_code",
        "gated": "market_code",
    }
    return mapping.get(value, "market_code")


def _normalize_boolean_flag(value, fallback: bool = False) -> bool:
    if value is None:
        return fallback
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on", "enabled"}:
            return True
        if normalized in {"false", "0", "no", "off", "disabled", ""}:
            return False
    return bool(value)


BID_LABELS = ["A", "B", "C", "D", "E"]


def _normalize_bid_count(value, fallback: int = 0) -> int:
    try:
        normalized = int(value)
    except Exception:
        normalized = int(fallback)
    return max(0, min(len(BID_LABELS), normalized))


def _get_device_bid_count(device: dict | None, legacy_global_enabled: bool = False) -> int:
    device = device or {}
    if device.get("bid_count") is not None:
        return _normalize_bid_count(device.get("bid_count"), 0)
    if device.get("enable_multi_bid") is not None:
        return 3 if _normalize_boolean_flag(device.get("enable_multi_bid"), False) else 0
    return 3 if legacy_global_enabled else 0


def _get_bid_labels(device_bids: dict | None = None, device: dict | None = None, legacy_global_enabled: bool = False) -> list[str]:
    labels = []
    configured_count = _get_device_bid_count(device, legacy_global_enabled)
    if configured_count > 0:
        labels.extend(BID_LABELS[:configured_count])

    if isinstance(device_bids, dict):
        for label in BID_LABELS:
            if label in device_bids and label not in labels:
                labels.append(label)
        for label in device_bids.keys():
            if label not in labels:
                labels.append(label)

    return labels


def _config_uses_explicit_bids(config: dict, bids_payload=None) -> bool:
    legacy_global_enabled = _normalize_boolean_flag((config or {}).get("market", {}).get("enable_player_bidding", False), False)
    for device in (config or {}).get("devices", []) or []:
        if _get_device_bid_count(device, legacy_global_enabled) > 0:
            return True
    return bool(bids_payload)


def _normalize_player_input_scope(config: dict) -> dict:
    general_cfg = (config or {}).get("general", {}) or {}
    player_input = (config or {}).get("player_input", {}) or {}
    round_span = max(1, int(general_cfg.get("round_span_hours", 6) or 6))
    mode = str(player_input.get("mode") or "all_hours").strip().lower()
    if mode not in {"all_hours", "first_hour", "first_two_hours", "first_three_hours", "custom_offsets"}:
        mode = "all_hours"

    raw_offsets = player_input.get("editable_offsets", [])
    custom_offsets = []
    if isinstance(raw_offsets, list):
        for value in raw_offsets:
            try:
                normalized = int(value)
            except Exception:
                continue
            if 0 <= normalized < round_span and normalized not in custom_offsets:
                custom_offsets.append(normalized)
    custom_offsets.sort()

    if mode == "first_hour":
        editable_offsets = [0]
    elif mode == "first_two_hours":
        editable_offsets = [offset for offset in [0, 1] if offset < round_span]
    elif mode == "first_three_hours":
        editable_offsets = [offset for offset in [0, 1, 2] if offset < round_span]
    elif mode == "custom_offsets":
        editable_offsets = custom_offsets or [0]
    else:
        editable_offsets = list(range(round_span))

    return {
        "mode": mode,
        "editable_offsets": editable_offsets,
        "hide_non_editable_hours": bool(player_input.get("hide_non_editable_hours", False)),
        "allow_other_rounds_editing": player_input.get("allow_other_rounds_editing", True) is not False,
        "round_span_hours": round_span,
    }


def _is_player_input_hour_allowed(config: dict, hour_idx: int, current_round: int | None = None) -> bool:
    try:
        normalized_hour = int(hour_idx)
    except Exception:
        return False
    if normalized_hour < 0:
        return False
    scope = _normalize_player_input_scope(config)
    if not scope["allow_other_rounds_editing"] and current_round is not None:
        try:
            normalized_round = max(1, int(current_round))
        except Exception:
            normalized_round = None
        if normalized_round is not None:
            hour_round = (normalized_hour // scope["round_span_hours"]) + 1
            if hour_round != normalized_round:
                return False
    if scope["mode"] == "all_hours":
        return True
    return (normalized_hour % scope["round_span_hours"]) in set(scope["editable_offsets"])


def _get_player_input_allowed_hours(config: dict, current_round: int | None = None) -> list[int]:
    general_cfg = (config or {}).get("general", {}) or {}
    horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)) or 24)
    return [hour_idx for hour_idx in range(horizon_hours) if _is_player_input_hour_allowed(config, hour_idx, current_round)]


def _zero_hidden_series(series, config: dict, round_num: int | None = None) -> list[float]:
    values = list(series or [])
    scope = _normalize_player_input_scope(config)
    if not scope["hide_non_editable_hours"]:
        return values

    if round_num is not None and len(values) <= scope["round_span_hours"]:
        round_start = (max(1, int(round_num)) - 1) * scope["round_span_hours"]
        return [
            (float(value or 0) if _is_player_input_hour_allowed(config, round_start + idx, round_num) else 0.0)
            for idx, value in enumerate(values)
        ]

    return [
        (float(value or 0) if _is_player_input_hour_allowed(config, idx, round_num) else 0.0)
        for idx, value in enumerate(values)
    ]


def _zero_hidden_device_payload(devices_payload, config: dict, round_num: int | None = None):
    if not isinstance(devices_payload, list):
        return devices_payload
    scope = _normalize_player_input_scope(config)
    if not scope["hide_non_editable_hours"]:
        return devices_payload

    normalized = []
    for entry in devices_payload:
        if not isinstance(entry, dict):
            continue
        normalized.append({
            **entry,
            "hours": _zero_hidden_series(entry.get("hours", []), config, round_num)
        })
    return normalized


def _zero_hidden_bids_payload(bids_payload, config: dict, round_num: int | None = None):
    if not isinstance(bids_payload, dict):
        return bids_payload
    scope = _normalize_player_input_scope(config)
    if not scope["hide_non_editable_hours"]:
        return bids_payload

    normalized = {}
    for device_id, lots in bids_payload.items():
        if not isinstance(lots, dict):
            continue
        normalized[device_id] = {}
        for lot_name, lot in lots.items():
            if not isinstance(lot, dict):
                continue
            normalized[device_id][lot_name] = {
                **lot,
                "hours": _zero_hidden_series(lot.get("hours", []), config, round_num)
            }
    return normalized


def _normalize_submitted_bids_payload(bids_payload, config: dict, round_num: int | None = None):
    if not _config_uses_explicit_bids(config, bids_payload):
        return {}
    return _zero_hidden_bids_payload(bids_payload, config, round_num)


def _validate_auto_bid_payload(devices_payload, cfg_by_id: dict[str, dict]) -> list[str]:
    errors = []
    if not isinstance(devices_payload, list):
        return errors

    for entry in devices_payload:
        if not isinstance(entry, dict):
            continue
        auto_bid = entry.get("auto_bid")
        if auto_bid is None:
            continue
        did = entry.get("device_id")
        if not isinstance(auto_bid, dict):
            errors.append(f"Device {did or '?'}: auto_bid must be an object")
            continue

        if not _normalize_boolean_flag(auto_bid.get("enabled"), False):
            continue

        dev = cfg_by_id.get(did)
        if not dev:
            errors.append(f"Unknown device_id: {did}")
            continue

        device_type = str(dev.get("type", "")).lower()
        if device_type != "battery":
            errors.append(f"Device {did}: auto_bid is only supported for battery devices")
            continue
        if not _normalize_boolean_flag(dev.get("auto_bid_allowed"), False):
            errors.append(f"Device {did}: auto_bid is not enabled in the scenario for this device")
            continue

        for field_name in ("buy_threshold_zar_mwh", "sell_threshold_zar_mwh"):
            if field_name not in auto_bid:
                errors.append(f"Device {did}: auto_bid.{field_name} is required when auto_bid is enabled")
                continue
            try:
                value = float(auto_bid.get(field_name))
            except (TypeError, ValueError):
                errors.append(f"Device {did}: auto_bid.{field_name} must be numeric")
                continue
            if not math.isfinite(value):
                errors.append(f"Device {did}: auto_bid.{field_name} must be finite")

    return errors

forecast_in = ns.model(
    "ForecastIn",
    {
        "session_id": fields.Integer(required=True),
        "round_num": fields.Integer(required=True),
        "hours": fields.List(fields.Float, required=True, description="Array of MWh values"),
        "devices": fields.List(fields.Raw, required=False, description="Per-device forecast payload including optional auto_bid metadata"),
        "bids": fields.Raw(required=False, description="Multi-bid pricing structure (optional)"),
        "debug": fields.Boolean(required=False, description="Enable debug logging for this forecast (admin only)"),
    },
)

forecast_full_in = ns.model(
    "ForecastFullIn",
    {
        "session_id": fields.Integer(required=True),
        "hours": fields.List(fields.Float, required=True, description="Full horizon forecast values (MWh)"),
        "devices": fields.List(fields.Raw, required=False, description="Per-device full-horizon forecast payload including optional auto_bid metadata"),
        "bids": fields.Raw(required=False, description="Multi-bid pricing structure (optional)"),
    },
)


def _calculate_next_id_gate(current_hour: int, id_gate_interval: int, id_gate_base: int) -> int:
    """
    Calculate the next ID gate hour after the given current hour.
    
    ID gates occur at regular intervals (e.g., every 4 hours at 00:00, 04:00, 08:00, ...).
    
    Args:
        current_hour: Current hour (0-23 or simulation hour index)
        id_gate_interval: Hours between gates (e.g., 4)
        id_gate_base: First gate hour of day (e.g., 0 for 00:00)
    
    Returns:
        Next gate hour (can be same day or next day)
    
    Example:
        current_hour=10, interval=4, base=0 → returns 12 (next gate at 12:00)
        current_hour=22, interval=4, base=0 → returns 24 (00:00 next day)
    """
    hour_of_day = current_hour % 24
    
    # Find next gate within same day
    next_gate_hour = id_gate_base
    while next_gate_hour <= hour_of_day:
        next_gate_hour += id_gate_interval
    
    # If next gate is beyond 24h, it's tomorrow
    if next_gate_hour >= 24:
        next_gate_hour = 24 + id_gate_base
    
    # Convert back to simulation hour
    days_offset = current_hour // 24
    return days_offset * 24 + next_gate_hour


def _get_tradeable_hours(session: Session, round_num: int) -> list:
    """
    Get list of tradeable hour indices for the current round (gate closure enforcement).
    
    SAWEM Market Code Rev 2.1: Hours past gate closure are locked and cannot be modified.
    Uses flexible ID gate timing (configurable interval) instead of fixed freeze_hours.
    
    New: Respects markets config (on/off/market_code) per round.
    
    Args:
        session: Current session
        round_num: Current round number
    
    Returns:
        List of hour indices that can still be traded (not past gate)
    
    Example:
        Round 3, gate at 12:00, round_span=6 → current sim hour = 12
        Hours 0-11 are locked (past gate), hours 12+ are tradeable
    """
    if not session or not session.scenario:
        return []  # Safety: no scenario, no trading allowed
    
    scenario = session.scenario
    general_cfg = scenario.config.get("general", {})
    markets_cfg = scenario.config.get("markets", {})
    
    round_span = int(general_cfg.get("round_span_hours", 6))
    horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
    day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
    id_gate_interval = int(general_cfg.get("id_gate_interval_hours", 4))
    id_gate_base = int(general_cfg.get("id_gate_base_hour", 0))
    start_time_str = general_cfg.get("start_time") or "00:00"
    
    try:
        start_hour = int(start_time_str.split(":")[0])
    except:
        start_hour = 0
    
    current_sim_hour = (round_num - 1) * round_span
    
    # Check markets config for this round (0-indexed)
    # Support both legacy (array) and new (object with trading/clearing) formats
    round_idx = round_num - 1
    
    def get_market_status(market_key, aspect='trading'):
        """Get market status with backward compatibility.
        Legacy: markets.dam = [status, ...]
        New: markets.dam.trading = [status, ...]
        """
        market_data = markets_cfg.get(market_key, [])
        if isinstance(market_data, list):
            # Legacy format: single array
            raw = market_data[round_idx] if round_idx < len(market_data) else "market_code"
            return _normalize_market_status(raw)
        elif isinstance(market_data, dict):
            # New format: { trading: [...], clearing: [...] }
            aspect_array = market_data.get(aspect, [])
            raw = aspect_array[round_idx] if round_idx < len(aspect_array) else "market_code"
            return _normalize_market_status(raw)
        return _normalize_market_status("market_code")
    
    dam_status = get_market_status("dam", "trading")
    idm_status = get_market_status("idm", "trading")
    
    # If both DAM and IDM are "off" for this round, no trading allowed (except forecast)
    if dam_status == "off" and idm_status == "off":
        return []
    
    # If DAM or IDM is "on" (always active), ignore gate hours
    if dam_status == "on" or idm_status == "on":
        return list(range(horizon_hours))
    
    # Default: "market_code" behavior (existing gate logic)
    # Calculate first gate closure time
    first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
    if first_gate_sim_hour <= 0:
        first_gate_sim_hour += 24
    
    # Hours until first midnight
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    # Calculate which hour index is currently at gate
    def get_gate_hour_index():
        if current_sim_hour < first_gate_sim_hour:
            # Before first gate: no hours locked yet
            return -1
        # Gates occur every 24 hours: first at first_gate_sim_hour, then +24, +48, ...
        gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
        # Gate N locks hours from 0 to (hours_until_first_midnight + (N-1)*24)
        locked_until = hours_until_first_midnight + (gate_count - 1) * 24
        return locked_until
    
    locked_until_hour = get_gate_hour_index()
    
    # Round 1 special case: DA baseline or zero baseline
    # All hours tradeable in Round 1 for initial setup
    if round_num == 1:
        tradeable = list(range(horizon_hours))
    else:
        # Round 2+: gate closures lock the delivered horizon cumulatively.
        # `get_gate_hour_index()` returns the last horizon-relative hour that is
        # already locked for the current simulation time.
        tradeable = [h for h in range(horizon_hours) if h > locked_until_hour]
    
    allowed_hours = set(_get_player_input_allowed_hours(scenario.config or {}, round_num))
    return [h for h in tradeable if h in allowed_hours]


def generate_market_timeline(session: Session, round_num: int) -> dict:
    """
    Generate detailed market phase timeline for a specific round based on scenario configuration.
    
    Uses the same gate logic as _get_tradeable_hours() and hour_status calculation
    to ensure consistency across the application.
    
    New: Respects markets config (on/off/market_code) per round.
    
    Returns a structured timeline showing which hours fall into which market phases:
    1. Delivered (Past): Already delivered hours (locked)
    2. Committed Position: DA-committed, ID gate closed (not editable)
    3. ID Trading Open: DA-committed, ID gate open (editable)
    4. DA Trading Open: DA market open for trading
    5. Too Early: Beyond trading horizon
    
    Args:
        session: Current session
        round_num: Current round number
    
    Returns:
        Dict with timeline information including phases array
    """
    if not session or not session.scenario:
        return {"error": "No scenario configured"}
    
    scenario = session.scenario
    general_cfg = scenario.config.get("general", {})
    markets_cfg = scenario.config.get("markets", {})
    
    round_span = int(general_cfg.get("round_span_hours", 6))
    horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
    day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
    freeze_hours = int(general_cfg.get("freeze_hours", 6))  # Legacy support
    id_gate_interval = int(general_cfg.get("id_gate_interval_hours", 4))
    id_gate_base = int(general_cfg.get("id_gate_base_hour", 0))
    day_one_baseline_mode = general_cfg.get("day_one_baseline_mode", 
                                             general_cfg.get("first_round_baseline_mode", "preset"))  # Backward compat
    start_time_str = general_cfg.get("start_time") or "00:00"
    
    try:
        start_hour = int(start_time_str.split(":")[0])
    except:
        start_hour = 0
    
    current_sim_hour = (round_num - 1) * round_span
    
    # Check markets config for this round (0-indexed)
    # Reuse get_market_status helper (defined in _get_tradeable_hours)
    round_idx = round_num - 1
    
    def get_market_status(market_key, aspect='trading'):
        """Get market status with backward compatibility."""
        market_data = markets_cfg.get(market_key, [])
        if isinstance(market_data, list):
            raw = market_data[round_idx] if round_idx < len(market_data) else "market_code"
            return _normalize_market_status(raw)
        elif isinstance(market_data, dict):
            aspect_array = market_data.get(aspect, [])
            raw = aspect_array[round_idx] if round_idx < len(aspect_array) else "market_code"
            return _normalize_market_status(raw)
        return _normalize_market_status("market_code")
    
    dam_status = get_market_status("dam", "trading")
    idm_status = get_market_status("idm", "trading")
    
    # Calculate common variables needed for all paths
    first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
    if first_gate_sim_hour <= 0:
        first_gate_sim_hour += 24
    
    hours_until_first_midnight = (24 - start_hour) % 24
    if hours_until_first_midnight == 0:
        hours_until_first_midnight = 24
    
    # Calculate locked_until_hour
    def get_locked_until():
        if round_num == 1:
            return -1
        if current_sim_hour < first_gate_sim_hour:
            return -1
        gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
        locked_until = hours_until_first_midnight + (gate_count - 1) * 24
        return locked_until
    
    locked_until_hour = get_locked_until()
    
    # Calculate DA-committed range
    da_committed_start = 0
    da_committed_end = hours_until_first_midnight
    if round_num > 1 and current_sim_hour >= first_gate_sim_hour:
        gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
        da_committed_end = min(hours_until_first_midnight + gate_count * 24, horizon_hours)
    da_committed_start = max(0, da_committed_start)
    da_committed_end = min(horizon_hours, da_committed_end)
    
    # ============================================================
    # TWO-STAGE ALGORITHM: Marking → Assignment
    # ============================================================
    
    # IDM Freeze configuration
    id_freeze_hours = int(general_cfg.get("id_freeze_hours", 0))
    
    # Current hour of day and gate status
    hour_of_day = (start_hour + current_sim_hour) % 24
    
    # Day boundaries (CORRECTED: Based on current_sim_hour, NOT round_num)
    # Days are independent of rounds! A round can span multiple days or be shorter than a day.
    # Day 1: h 0 - hours_until_first_midnight
    # Day 2: h hours_until_first_midnight - hours_until_first_midnight+24
    # Day N: h hours_until_first_midnight + (N-2)*24 - hours_until_first_midnight + (N-1)*24
    
    if current_sim_hour < hours_until_first_midnight:
        # We're still in Day 1
        current_day_start = 0
        current_day_end = hours_until_first_midnight
        next_day_start = hours_until_first_midnight
        next_day_end = hours_until_first_midnight + 24
    else:
        # We're in Day 2+
        days_since_start = (current_sim_hour - hours_until_first_midnight) // 24
        current_day_start = hours_until_first_midnight + days_since_start * 24
        current_day_end = current_day_start + 24
        next_day_start = current_day_end
        next_day_end = next_day_start + 24
    
    day_one_baseline_mode = general_cfg.get("day_one_baseline_mode",
                                             general_cfg.get("first_round_baseline_mode", "preset"))
    
    # ============================================================
    # STAGE 1: MARKING (Mark hours as DAM/IDM enabled/disabled)
    # ============================================================
    
    # Initialize all hours as disabled
    dam_enabled_hours = [False] * horizon_hours
    idm_enabled_hours = [False] * horizon_hours
    mark_as_r1_special = {}  # Flag for Round 1 Day 1 cyan color
    
    # --- DAM Marking ---
    
    # 2.1: Round 1 + edit_round_one → Day 1 (current day) = DAM enabled
    if round_num == 1 and day_one_baseline_mode == "edit_round_one":
        for h in range(min(hours_until_first_midnight, horizon_hours)):
            dam_enabled_hours[h] = True
            mark_as_r1_special[h] = True
    
    # 2.2-2.4: DAM for next day (all rounds)
    if dam_status == "on":
        # DAM "enabled" (always on) → next day tradeable
        for h in range(next_day_start, min(next_day_end, horizon_hours)):
            dam_enabled_hours[h] = True
    
    elif dam_status == "market_code":
        # DAM "gated" → next day tradeable if before gate hour
        if hour_of_day < day_ahead_gate_hour:
            for h in range(next_day_start, min(next_day_end, horizon_hours)):
                dam_enabled_hours[h] = True
    
    # dam_status == "off" → nothing marked (already False)
    
    # --- IDM Marking ---
    
    if idm_status == "on":
        # IDM "enabled" (always on) → current day + next day from (now + freeze) onwards
        id_start = current_sim_hour + id_freeze_hours
        for h in range(id_start, min(next_day_end, horizon_hours)):
            idm_enabled_hours[h] = True
    
    elif idm_status == "market_code":
        # IDM "gated" → between ID gates (with freeze)
        next_id_gate = _calculate_next_id_gate(current_sim_hour, id_gate_interval, id_gate_base)
        gate_after_next = next_id_gate + id_gate_interval
        
        # Hours between next gate and gate after next are tradeable (can span days)
        for h in range(next_id_gate, min(gate_after_next, horizon_hours)):
            idm_enabled_hours[h] = True
    
    # idm_status == "off" → nothing marked (already False)
    
    # ============================================================
    # STAGE 2: ASSIGNMENT (Convert markings to final status)
    # ============================================================
    
    hour_status = []
    
    for h in range(horizon_hours):
        # 3.1: Past → "locked"
        if h < current_sim_hour:
            hour_status.append("locked")
        
        # 3.2: DAM enabled → "da" or "da_r1" (overrides IDM)
        elif dam_enabled_hours[h]:
            if mark_as_r1_special.get(h, False):
                hour_status.append("da_r1")  # Cyan: Round 1 Day 1 special
            else:
                hour_status.append("da")     # Yellow: Normal DA
        
        # 3.3: IDM enabled → "id"
        elif idm_enabled_hours[h]:
            hour_status.append("id")         # Orange: ID market
        
        # 3.4: Otherwise → "forecast"
        else:
            hour_status.append("forecast")   # Light blue: Forecast only
    
    # Get tradeable hours for editability check
    tradeable_hours = _get_tradeable_hours(session, round_num)
    
    # Build phases by grouping consecutive hours with same status
    phases = []
    if len(hour_status) > 0:
        current_status = hour_status[0]
        phase_start = 0
        
        for h in range(1, len(hour_status) + 1):
            # Check if we need to start a new phase
            if h == len(hour_status) or hour_status[h] != current_status:
                # Close current phase
                is_editable = any(hr in tradeable_hours for hr in range(phase_start, h))
                
                phase_info = {
                    "name": current_status,
                    "start_hour": phase_start,
                    "end_hour": h,
                    "editable": is_editable,
                    "market_type": "none" if current_status in ["locked", "future"] else current_status
                }
                
                # Add label, description, and color based on status
                if current_status == "locked":
                    phase_info.update({
                        "label": "Delivered (Past)",
                        "description": "Already delivered - cannot be modified",
                        "color": "#9e9e9e"
                    })
                elif current_status == "id":
                    if is_editable:
                        phase_info.update({
                            "label": "ID Trading Open",
                            "description": "DA-committed, ID trading open - can submit/modify ID offers",
                            "color": "#fff3e0"
                        })
                    else:
                        phase_info.update({
                            "label": "Committed Position",
                            "description": "DA-committed, ID gate closed - cannot modify",
                            "color": "#ffcc80"
                        })
                elif current_status == "da":
                    phase_info.update({
                        "label": "DA Trading Open",
                        "description": "Day-Ahead market open - can submit/modify DA offers",
                        "color": "#e3f2fd"
                    })
                else:  # forecast
                    phase_info.update({
                        "label": "Forecast",
                        "description": "Forward planning - always editable for strategic forecasting",
                        "color": "#f3e5f5"
                    })
                
                phases.append(phase_info)
                
                # Start new phase if not at end
                if h < len(hour_status):
                    current_status = hour_status[h]
                    phase_start = h
    
    return {
        "round": round_num,
        "current_sim_hour": current_sim_hour,
        "horizon_hours": horizon_hours,
        "phases": phases,
        "hour_status": hour_status,
        "locked_until_hour": locked_until_hour,
        "da_committed_start": da_committed_start,
        "da_committed_end": da_committed_end,
        "da_gate_sim_hour": first_gate_sim_hour,
        "id_gate_offset": freeze_hours,
        "tradeable_hours": tradeable_hours,
        "config": {
            "round_span": round_span,
            "da_gate_hour": day_ahead_gate_hour,
            "freeze_hours": freeze_hours,
            "start_hour": start_hour
        }
    }


def _validate_bids_structure(bids_data: dict, config: dict) -> list:
    """
    Validate multi-bid pricing structure.
    
    Args:
        bids_data: Dict of {device_id: {bid_label: {price, hours}}}
        config: Scenario config
    
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    market_cfg = (config or {}).get("market", {})
    price_floor = float(market_cfg.get("price_floor", -500))
    price_cap = float(market_cfg.get("price_cap", 5000))
    general_cfg = (config or {}).get("general", {})
    horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
    
    if not isinstance(bids_data, dict):
        errors.append("Bids must be a dictionary")
        return errors
    
    devices_cfg = (config or {}).get("devices", [])
    device_map = {d.get("id"): d for d in devices_cfg if isinstance(d, dict)}
    legacy_global_enabled = _normalize_boolean_flag((config or {}).get("market", {}).get("enable_player_bidding", False), False)

    def _is_load_device(dev: dict) -> bool:
        if not dev:
            return False
        dtype = (dev.get("type") or "").lower()
        category = (dev.get("category") or "").lower()
        if category == "load":
            return True
        return "load" in dtype

    for device_id, device_bids in bids_data.items():
        if not isinstance(device_bids, dict):
            errors.append(f"Device {device_id}: bids must be a dictionary")
            continue

        device_cfg = device_map.get(device_id, {})
        allowed_labels = set(_get_bid_labels(device_bids, device_cfg, legacy_global_enabled))
        
        for bid_label, bid in device_bids.items():
            if bid_label not in allowed_labels:
                errors.append(f"Device {device_id}, Bid {bid_label}: bid label is not allowed for this device")
                continue

            if not isinstance(bid, dict):
                errors.append(f"Device {device_id}, Bid {bid_label}: must be a dictionary")
                continue
            
            # Validate price
            if 'price' not in bid:
                errors.append(f"Device {device_id}, Bid {bid_label}: missing 'price' field")
                continue
            
            try:
                price = float(bid['price'])
                if price < price_floor or price > price_cap:
                    errors.append(
                        f"Device {device_id}, Bid {bid_label}: price {price} outside bounds [{price_floor}, {price_cap}]"
                    )
            except (ValueError, TypeError):
                errors.append(f"Device {device_id}, Bid {bid_label}: price must be a number")
            
            # Validate hours
            if 'hours' not in bid:
                errors.append(f"Device {device_id}, Bid {bid_label}: missing 'hours' field")
                continue
            
            hours = bid['hours']
            if not isinstance(hours, list):
                errors.append(f"Device {device_id}, Bid {bid_label}: hours must be a list")
                continue
            
            if len(hours) == 0:
                errors.append(f"Device {device_id}, Bid {bid_label}: hours cannot be empty")
                continue
            if horizon_hours > 0 and len(hours) != horizon_hours:
                errors.append(
                    f"Device {device_id}, Bid {bid_label}: hours length {len(hours)} must equal horizon {horizon_hours}"
                )
            
            # Validate each hour value
            for i, val in enumerate(hours):
                try:
                    float(val)
                except (ValueError, TypeError):
                    errors.append(f"Device {device_id}, Bid {bid_label}, hour {i}: must be a number")
                    break
        
        # Validate bid price monotonicity (SAWEM Market Code requirement)
        direction = "nonincreasing" if _is_load_device(device_cfg) else "nondecreasing"
        monotonicity_errors = validate_bid_monotonicity(device_bids, direction=direction)
        if monotonicity_errors:
            for err in monotonicity_errors:
                errors.append(f"Device {device_id}: {err}")
    
    return errors


@ns.route("/market-timeline/<int:session_id>/<int:round_num>")
class MarketTimelineAPI(Resource):
    @jwt_required()
    def get(self, session_id: int, round_num: int):
        """
        Get detailed market phase timeline for a specific round.
        
        Returns structured information about which hours fall into which market phases:
        - Delivered (past)
        - Committed Position (locked for editing)
        - ID Trading Open (editable ID offers)
        - DA Trading Open (editable DA offers)
        - Too Early (beyond horizon)
        """
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        timeline = generate_market_timeline(session, round_num)
        return timeline, HTTPStatus.OK


@ns.route("/market-structure/<int:session_id>/<int:round_num>/<int:hour>")
class MarketStructureAPI(Resource):
    @jwt_required()
    def get(self, session_id: int, round_num: int, hour: int):
        """
        Get market structure (supply/demand curves + SMP) for a specific session, round, and hour.
        
        Returns hourly-specific market curves based on:
        - Generator mix with time-dependent profiles (solar, wind, etc.)
        - Consumer mix with time-dependent load profiles
        - Scenario seed for reproducibility
        
        Query parameters:
        - hour: Hour index within the round (0-based)
        """
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        scenario = Scenario.query.get(session.scenario_id)
        if not scenario:
            return {"error": "Scenario not found"}, HTTPStatus.NOT_FOUND
        
        cfg = scenario.config or {}
        
        # Import engine functions
        from .engine import generate_curves_from_config, clear_market, extract_hour_of_day, extract_month
        from datetime import date
        
        # Extract hour of day and month from session/scenario
        start_time = cfg.get("general", {}).get("start_time", "02:00")
        # Use scenario's fake_date or fall back to today's date
        fake_date = cfg.get("general", {}).get("fake_date") or date.today().strftime("%Y-%m-%d")
        
        hour_of_day = extract_hour_of_day(hour, start_time)
        month_of_year = extract_month(fake_date)
        
        # Get seed from scenario or use session-specific seed
        seed = cfg.get("environment", {}).get("seed") or f"session_{session_id}_round_{round_num}"
        
        # Generate hourly-specific curves
        supply, demand = generate_curves_from_config(
            cfg, 
            seed=seed, 
            hour_of_day=hour_of_day, 
            month_of_year=month_of_year
        )
        
        # Clear market to get SMP
        price_floor = cfg.get("market", {}).get("price_floor", -500)
        price_cap = cfg.get("market", {}).get("price_cap", 5000)
        smp, volume = clear_market(supply, demand, price_floor=price_floor, price_cap=price_cap)
        
        # Return data in format expected by frontend
        return {
            "supply": [{"price": p, "volume": v} for p, v in supply],
            "demand": [{"price": p, "volume": v} for p, v in demand],
            "smp": smp,
            "volume": volume,
            "hour": hour,
            "hour_of_day": hour_of_day,
            "round_num": round_num
        }, HTTPStatus.OK


@ns.route("/forecast")
class ForecastAPI(Resource):
    @jwt_required()
    @ns.expect(forecast_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        per_device = data.get("devices") if isinstance(data, dict) else None
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            if isinstance(data, dict):
                data["hours"] = _zero_hidden_series(data.get("hours", []), config, data.get("round_num"))
                if isinstance(data.get("devices"), list):
                    data["devices"] = _zero_hidden_device_payload(data.get("devices"), config, data.get("round_num"))
                    per_device = data.get("devices")
                if data.get("bids") is not None:
                    data["bids"] = _normalize_submitted_bids_payload(data.get("bids"), config, data.get("round_num"))
            
            # SAWEM Gate Closure Enforcement: Check if forecast modifies locked hours
            general_cfg = config.get("general", {})
            round_span = int(general_cfg.get("round_span_hours", 6))
            tradeable_hours = _get_tradeable_hours(session, data["round_num"])
            tradeable_set = set(tradeable_hours)
            
            # Get previous forecast to detect modifications
            prev_forecast = Forecast.query.filter_by(
                session_id=data["session_id"],
                player_id=player_id
            ).order_by(Forecast.round_num.desc()).first()
            
            if prev_forecast and prev_forecast.data and data.get("round_num", 1) > 1:
                prev_hours = prev_forecast.data.get("hours", [])
                new_hours = data.get("hours", [])

                locked_modified = []

                # If we are receiving a round slice (span-sized), align indices to global hours
                if len(new_hours) <= round_span and len(prev_hours) <= round_span:
                    start_idx = (data.get("round_num", 1) - 1) * round_span
                    # Always allow modification of the current round's delivery window regardless
                    # of the ID gate position – gate closure only protects *previous* round hours.
                    current_round_hours = set(range(start_idx, start_idx + round_span))
                    allowed_set = tradeable_set.union(current_round_hours)

                    # Prefer previous submission for the same round if it exists
                    prev_same_round = Forecast.query.filter_by(
                        session_id=data["session_id"],
                        player_id=player_id,
                        round_num=data.get("round_num", 1)
                    ).order_by(Forecast.id.desc()).first()
                    prev_slice = prev_same_round.data.get("hours", []) if prev_same_round and prev_same_round.data else []

                    max_check = min(len(prev_slice), len(new_hours)) if prev_slice else len(new_hours)
                    for i in range(max_check):
                        global_idx = start_idx + i
                        if global_idx not in allowed_set:
                            prev_val = prev_slice[i] if prev_slice and i < len(prev_slice) else None
                            if prev_val is None:
                                if abs(new_hours[i]) > 0.01:
                                    locked_modified.append(global_idx)
                            elif abs(prev_val - new_hours[i]) > 0.01:
                                locked_modified.append(global_idx)
                else:
                    # Full-horizon payload: compare by absolute index
                    max_check = min(len(prev_hours), len(new_hours))
                    for h in range(max_check):
                        if h not in tradeable_set:
                            if abs(prev_hours[h] - new_hours[h]) > 0.01:  # Allow tiny floating point errors
                                locked_modified.append(h)

                if locked_modified:
                    return {
                        "error": "Gate closure violation: Cannot modify hours past gate closure",
                        "details": {
                            "locked_hours_modified": locked_modified,
                            "tradeable_hours": tradeable_hours,
                            "message": f"Hours {locked_modified} are past gate closure and cannot be modified"
                        }
                    }, HTTPStatus.BAD_REQUEST
            
            # Validate bids structure if provided
            bids_data = data.get("bids")
            if bids_data:
                bid_errors = _validate_bids_structure(bids_data, config)
                if bid_errors:
                    return {"error": "Bid validation failed", "details": bid_errors}, HTTPStatus.BAD_REQUEST
            
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
            # If payload includes per-device hours, validate each; also compute aggregate
            if isinstance(per_device, list) and per_device:
                # map config by id
                cfg_by_id = {d.get("id"): d for d in devices_cfg if isinstance(d, dict)}
                agg = None
                validation_errors = []
                validation_errors.extend(_validate_auto_bid_payload(per_device, cfg_by_id))
                for item in per_device:
                    did = item.get("device_id")
                    hours = item.get("hours") or []
                    dev = cfg_by_id.get(did)
                    if not dev:
                        validation_errors.append(f"Unknown device_id: {did}")
                        continue
                    errs = validate_forecast_constraints(dev, hours)
                    validation_errors.extend(errs)
                    # build aggregate for compatibility (sum)
                    agg = _sum_series(agg, hours)
                if validation_errors:
                    return {"error": "Forecast validation failed", "details": validation_errors}, HTTPStatus.BAD_REQUEST
                # replace hours slice with aggregate for compatibility
                data["hours"] = agg or data["hours"]
            
            if devices_cfg and not (isinstance(per_device, list) and per_device):
                validation_errors = []
                for device in devices_cfg:
                    errors = validate_forecast_constraints(device, data["hours"])
                    if errors:
                        validation_errors.extend([f"{device.get('type', 'Device')}: {err}" for err in errors])
                
                if validation_errors:
                    return {
                        "error": "Forecast validation failed",
                        "details": validation_errors
                    }, HTTPStatus.BAD_REQUEST
        
        # Store forecast with optional bids
        forecast_data = {"hours": data["hours"]}
        if isinstance(per_device, list) and per_device:
            forecast_data["devices"] = per_device
        bids_data = data.get("bids")
        
        # Get session and scenario config for DA gate logic
        session = Session.query.get(data["session_id"])
        scenario = Scenario.query.get(session.scenario_id) if session else None
        
        # Calculate which hours are newly DA-committed based on gate logic
        is_da_baseline = False
        da_baseline_hours = None  # Which hours of this forecast become DA baseline
        
        if session and scenario:
            general_cfg = scenario.config.get("general", {})
            round_span = int(general_cfg.get("round_span_hours", 6))
            # Use forecast_horizon_hours for DA calculation (visible in chart)
            horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
            day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
            start_time_str = general_cfg.get("start_time") or "00:00"
            
            try:
                start_hour = int(start_time_str.split(":")[0])
            except:
                start_hour = 0
            
            current_round = data["round_num"]
            current_sim_hour = (current_round - 1) * round_span
            prev_sim_hour = (current_round - 2) * round_span if current_round > 1 else -1
            
            # Calculate first gate sim hour
            first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
            if first_gate_sim_hour <= 0:
                first_gate_sim_hour += 24
            
            # Hours until first midnight
            hours_until_first_midnight = (24 - start_hour) % 24
            if hours_until_first_midnight == 0:
                hours_until_first_midnight = 24
            
            # Check if we just passed a gate (between prev_sim_hour and current_sim_hour)
            def get_gate_count(sim_hour):
                if sim_hour < first_gate_sim_hour:
                    return 0
                return 1 + (sim_hour - first_gate_sim_hour) // 24
            
            prev_gate_count = get_gate_count(prev_sim_hour) if prev_sim_hour >= 0 else 0
            current_gate_count = get_gate_count(current_sim_hour)
            
            # Round 1 ALWAYS creates DA baseline for Day 1 (hours 0 to first_midnight)
            # This represents the initial DA position before any gate closure
            if current_round == 1:
                is_da_baseline = True
                # Day 1 = from scenario start to first midnight
                new_da_start = 0
                new_da_end = min(hours_until_first_midnight, horizon_hours)
                da_baseline_hours = {"start": new_da_start, "end": new_da_end}
            elif current_gate_count > prev_gate_count:
                # A new gate was just passed! Mark this forecast as DA baseline
                is_da_baseline = True
                # Calculate which hours are newly committed
                # Gate N commits day N+1 (hours from midnight N to midnight N+1)
                new_da_start = hours_until_first_midnight + (current_gate_count - 1) * 24
                new_da_end = min(hours_until_first_midnight + current_gate_count * 24, horizon_hours)
                if new_da_start < new_da_end:  # Only if there are hours to commit
                    da_baseline_hours = {"start": new_da_start, "end": new_da_end}
                else:
                    is_da_baseline = False  # No hours to commit
        
        # Save forecast
        f = Forecast(
            session_id=data["session_id"], 
            player_id=player_id, 
            round_num=data["round_num"], 
            data=forecast_data,
            bids=bids_data,
            is_da_baseline=is_da_baseline
        )
        
        # If this is a new DA baseline, store which hours it covers
        if is_da_baseline and da_baseline_hours:
            f.data["da_baseline_hours"] = da_baseline_hours
        
        # Store debug flag if requested (admin only)
        if data.get("debug"):
            f.data["debug_enabled"] = True
        
        db.session.add(f)
        db.session.commit()
        
        # Log forecast submission activity
        try:
            session = Session.query.get(data["session_id"])
            log_activity(
                player_id, 
                "forecast_submit", 
                session_id=data["session_id"],
                cohort_id=session.cohort_id if session else None,
                details={"round": data["round_num"], "forecast_count": len(data["hours"])}
            )
        except Exception:
            pass  # Don't fail forecast if logging fails
        
        socketio.emit("player_submit", {"session_id": f.session_id, "player_id": player_id}, namespace="/trainer")
        
        # In solo mode, immediately end the round when player submits
        if session and session.mode == 'isolated_per_player':
            # Emit event to force timer to 0
            socketio.emit("tick", {"session_id": session.id, "remaining": 0}, namespace="/game", to=f"session-{session.id}")
        
        return {"status": "ok", "id": f.id}, HTTPStatus.CREATED


@ns.route("/forecast/full")
class ForecastFull(Resource):
    @jwt_required()
    @ns.expect(forecast_full_in, validate=True)
    def post(self):
        data = request.json
        player_id = int(get_jwt_identity())
        per_device = data.get("devices") if isinstance(data, dict) else None
        
        # Validate forecast against device constraints if devices are defined
        session = Session.query.get(data["session_id"])
        if session and session.scenario:
            config = session.scenario.config or {}
            if isinstance(data, dict):
                data["hours"] = _zero_hidden_series(data.get("hours", []), config, session.current_round if session else None)
                if isinstance(data.get("devices"), list):
                    data["devices"] = _zero_hidden_device_payload(data.get("devices"), config, session.current_round if session else None)
                    per_device = data.get("devices")
                if data.get("bids") is not None:
                    data["bids"] = _normalize_submitted_bids_payload(data.get("bids"), config, session.current_round if session else None)
            
            # Validate bids structure if provided
            bids_data = data.get("bids")
            if bids_data:
                bid_errors = _validate_bids_structure(bids_data, config)
                if bid_errors:
                    return {"error": "Bid validation failed", "details": bid_errors}, HTTPStatus.BAD_REQUEST
            
            devices_cfg = config.get("devices", [])
            devices_cfg = _filter_devices_by_selected_type(session.id, player_id, config, devices_cfg)
            if isinstance(per_device, list) and per_device:
                cfg_by_id = {d.get("id"): d for d in devices_cfg if isinstance(d, dict)}
                agg = None
                validation_errors = []
                validation_errors.extend(_validate_auto_bid_payload(per_device, cfg_by_id))
                for item in per_device:
                    did = item.get("device_id")
                    hours = item.get("hours") or []
                    dev = cfg_by_id.get(did)
                    if not dev:
                        validation_errors.append(f"Unknown device_id: {did}")
                        continue
                    errs = validate_forecast_constraints(dev, hours)
                    validation_errors.extend(errs)
                    agg = _sum_series(agg, hours)
                if validation_errors:
                    return {"error": "Forecast validation failed", "details": validation_errors}, HTTPStatus.BAD_REQUEST
                data["hours"] = agg or data["hours"]
            
            if devices_cfg and not (isinstance(per_device, list) and per_device):
                validation_errors = []
                for device in devices_cfg:
                    errors = validate_forecast_constraints(device, data["hours"])
                    if errors:
                        validation_errors.extend([f"{device.get('type', 'Device')}: {err}" for err in errors])
                
                if validation_errors:
                    return {
                        "error": "Forecast validation failed",
                        "details": validation_errors
                    }, HTTPStatus.BAD_REQUEST
        
        # upsert by (session_id, player_id, round_num=0)
        f = Forecast.query.filter_by(session_id=data["session_id"], player_id=player_id, round_num=0).first()
        
        # Store both aggregate hours and per-device hours if provided
        forecast_data = {"hours": data["hours"]}
        if isinstance(per_device, list) and per_device:
            forecast_data["devices"] = per_device
        
        # Store bids if provided
        bids_data = data.get("bids")
        
        # Calculate DA baseline based on gate logic (same as /submit)
        session = Session.query.get(data["session_id"])
        scenario = Scenario.query.get(session.scenario_id) if session else None
        
        is_da_baseline = False
        da_baseline_hours = None
        
        if session and scenario:
            general_cfg = scenario.config.get("general", {})
            round_span = int(general_cfg.get("round_span_hours", 6))
            # Use forecast_horizon_hours for DA calculation (visible in chart)
            horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
            day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))
            start_time_str = general_cfg.get("start_time") or "00:00"
            
            try:
                start_hour = int(start_time_str.split(":")[0])
            except:
                start_hour = 0
            
            current_round = session.current_round or 1
            current_sim_hour = (current_round - 1) * round_span
            prev_sim_hour = (current_round - 2) * round_span if current_round > 1 else -1
            
            first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
            if first_gate_sim_hour <= 0:
                first_gate_sim_hour += 24
            
            hours_until_first_midnight = (24 - start_hour) % 24
            if hours_until_first_midnight == 0:
                hours_until_first_midnight = 24
            
            def get_gate_count(sim_hour):
                if sim_hour < first_gate_sim_hour:
                    return 0
                return 1 + (sim_hour - first_gate_sim_hour) // 24
            
            prev_gate_count = get_gate_count(prev_sim_hour) if prev_sim_hour >= 0 else 0
            current_gate_count = get_gate_count(current_sim_hour)
            
            # Round 1 ALWAYS creates DA baseline for Day 1
            if current_round == 1:
                is_da_baseline = True
                new_da_start = 0
                new_da_end = min(hours_until_first_midnight, horizon_hours)
                da_baseline_hours = {"start": new_da_start, "end": new_da_end}
            elif current_gate_count > prev_gate_count:
                is_da_baseline = True
                new_da_start = hours_until_first_midnight + (current_gate_count - 1) * 24
                new_da_end = min(hours_until_first_midnight + current_gate_count * 24, horizon_hours)
                if new_da_start < new_da_end:
                    da_baseline_hours = {"start": new_da_start, "end": new_da_end}
                else:
                    is_da_baseline = False
        
        # Store DA baseline hours range if applicable
        if is_da_baseline and da_baseline_hours:
            forecast_data["da_baseline_hours"] = da_baseline_hours
        
        if not f:
            f = Forecast(
                session_id=data["session_id"], 
                player_id=player_id, 
                round_num=0, 
                data=forecast_data,
                bids=bids_data,
                is_da_baseline=is_da_baseline
            )
        else:
            f.data = forecast_data
            f.bids = bids_data
            if is_da_baseline:
                f.is_da_baseline = True
        db.session.add(f)
        db.session.commit()
        return {"status": "ok", "id": f.id}

    @jwt_required()
    def get(self):
        session_id = request.args.get("session_id", type=int)
        if not session_id:
            return {"error": "session_id required"}, HTTPStatus.BAD_REQUEST
        player_id = int(get_jwt_identity())
        f = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=0).first()
        if not f:
            return {"hours": None, "devices": None, "bids": None}
        return {
            "hours": f.data.get("hours") if f else None,
            "devices": f.data.get("devices") if f else None,
            "bids": f.bids if f else None
        }


# --- Helpers for player type selection / device filtering ---
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:  # pragma: no cover
    _redis_client = None


def _filter_devices_by_selected_type(session_id: int, player_id: int, config: dict, devices: list[dict]) -> list[dict]:
    """If a player has selected a player_type for this session, filter devices to those allowed for that type."""
    if not devices:
        return devices
    try:
        pts = config.get("player_types") or []
        if not pts or _redis_client is None:
            # try DB selection
            try:
                sel_db = SessionPlayerType.query.filter_by(session_id=session_id, user_id=player_id).first()
                if not sel_db:
                    return devices
                sel = sel_db.type_id
            except Exception:
                return devices
        else:
            sel_key = f"session:{session_id}:selected:{player_id}"
            sel_raw = _redis_client.get(sel_key)
            if not sel_raw:
                return devices
            sel = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
        mapping = {pt.get("id"): set(pt.get("devices") or []) for pt in pts if isinstance(pt, dict)}
        allowed_ids = mapping.get(sel)
        if not allowed_ids:
            return devices
        filtered = [d for d in devices if d.get("id") in allowed_ids]
        return filtered if filtered else devices
    except Exception:
        return devices


def _sum_series(base: list | None, add: list | None) -> list:
    a = base or []
    b = add or []
    n = max(len(a), len(b))
    out = [0.0]*n
    for i in range(n):
        out[i] = (a[i] if i < len(a) else 0.0) + (b[i] if i < len(b) else 0.0)
    return out


solo_in = ns.model(
    "SoloSessionCreate",
    {
        "scenario_id": fields.Integer(required=True),
        "campaign_id": fields.Integer(required=False, description="Optional campaign context for progress tracking"),
    },
)


@ns.route("/solo-sessions")
class SoloSessions(Resource):
    @jwt_required()
    @ns.expect(solo_in, validate=True)
    def post(self):
        """Start a solo session (isolated_per_player) if allowed by any published campaign mapping."""
        uid = int(get_jwt_identity())
        body = request.json or {}
        scenario_id = int(body.get("scenario_id"))
        campaign_id = body.get("campaign_id")

        # Validate mapping: published campaign with solo_enabled
        q = (
            db.session.query(CampaignScenario, Campaign)
            .join(Campaign, Campaign.id == CampaignScenario.campaign_id)
            .filter(CampaignScenario.scenario_id == scenario_id, Campaign.published == True, CampaignScenario.solo_enabled == True)
        )
        if campaign_id:
            q = q.filter(Campaign.id == int(campaign_id))
        mapping = q.order_by(CampaignScenario.order_index.asc()).first()
        if not mapping:
            return {"error": "Solo not allowed for this scenario"}, HTTPStatus.FORBIDDEN
        cs, camp = mapping

        # Find or create a cohort for this user's solo sessions
        # Reuse existing solo cohort instead of creating new ones
        c = Cohort.query.filter_by(trainer_id=uid, name=f"Solo {uid}").first()
        if not c:
            c = Cohort(name=f"Solo {uid}", trainer_id=uid)
            db.session.add(c)
            db.session.flush()  # get id
            
            # Add player as cohort member
            cm = CohortMember(cohort_id=c.id, user_id=uid)
            db.session.add(cm)
        else:
            # Ensure player is member of their solo cohort
            existing_member = CohortMember.query.filter_by(cohort_id=c.id, user_id=uid).first()
            if not existing_member:
                cm = CohortMember(cohort_id=c.id, user_id=uid)
                db.session.add(cm)

        # Create session (start in briefing phase; scheduler waits for player start)
        from datetime import datetime
        s = Session(
            cohort_id=c.id,
            scenario_id=scenario_id,
            mode="isolated_per_player",
            status=SessionStatus.briefing,
            started_at=datetime.utcnow(),
            current_round=1,
        )
        db.session.add(s)
        db.session.flush()

        # Populate allowed_types from scenario config for isolated_per_player mode
        try:
            scen = Scenario.query.get(scenario_id)
            player_types = scen.config.get("player_types", []) if scen and scen.config else []
            for pt in player_types:
                type_id = pt.get("id")
                if type_id:
                    # max_players = 1 in isolated mode (each player picks their own type)
                    db.session.add(SessionAllowedType(session_id=s.id, type_id=type_id, max_players=1))
        except Exception:
            current_app.logger.exception(
                "failed to seed allowed types for solo session", extra={"session_id": s.id, "scenario_id": scenario_id}
            )
            pass  # Continue even if allowed_types setup fails

        # Progress → in_progress
        try:
            pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=camp.id, scenario_id=scenario_id).first()
            if not pp:
                from datetime import datetime
                pp = PlayerProgress(user_id=uid, campaign_id=camp.id, scenario_id=scenario_id, status=PlayerProgressStatus.in_progress, started_at=datetime.utcnow())
            else:
                from datetime import datetime
                pp.status = PlayerProgressStatus.in_progress
                pp.started_at = pp.started_at or datetime.utcnow()
            db.session.add(pp)
        except Exception:
            pass

        db.session.commit()
        # Start scheduler in background (will wait in briefing phase until player starts)
        from .scheduler import run_rounds
        from .extensions import socketio
        socketio.start_background_task(run_rounds, s.id, current_app._get_current_object())
        return {"session_id": s.id, "status": "briefing"}, HTTPStatus.CREATED


@ns.route("/active-session")
class ActiveSession(Resource):
    @jwt_required()
    def get(self):
        """Get the currently active session for the player with time remaining."""
        player_id = int(get_jwt_identity())
        
        # Find running session where player is a cohort member
        session = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == player_id,
                Session.status == SessionStatus.running
            )
            .order_by(Session.started_at.desc())
            .first()
        )
        
        if not session:
            return {"session_id": None, "message": "No active session"}
        
        scenario = Scenario.query.get(session.scenario_id)
        if not scenario:
            return {"error": "Scenario not found"}, HTTPStatus.NOT_FOUND
        
        config = scenario.config or {}
        general = config.get("general", {})
        
        # Time remaining is tracked live via WebSocket ticks; return None initially to avoid false "time is up"
        time_remaining = None

        return {
            "session_id": session.id,
            "round": session.current_round,
            "time_remaining": time_remaining,
            "forecast_horizon_hours": general.get("forecast_horizon_hours", 48),
            "freeze_hours": general.get("freeze_hours", 6),
            "scenario_name": scenario.name,
            "status": session.status.value
        }


@ns.route("/sessions/<int:sid>")
class PlayerSessionItem(Resource):
    @jwt_required()
    def delete(self, sid: int):
        """Delete a solo session if it belongs to the current user."""
        uid = int(get_jwt_identity())
        session = Session.query.get_or_404(sid)
        
        # Validate: must be isolated_per_player AND user must be member
        if session.mode != "isolated_per_player":
            return {"error": "Can only delete solo sessions"}, HTTPStatus.FORBIDDEN
        
        member = CohortMember.query.filter_by(cohort_id=session.cohort_id, user_id=uid).first()
        if not member:
            return {"error": "Not your session"}, HTTPStatus.FORBIDDEN
        
        # Delete forecasts
        Forecast.query.filter_by(session_id=sid).delete()
        
        # Delete session
        db.session.delete(session)
        db.session.commit()
        
        return "", HTTPStatus.NO_CONTENT


@ns.route("/da-baseline/<int:session_id>")
class DABaseline(Resource):
    @jwt_required()
    def get(self, session_id: int):
        """
        Get Day-Ahead baseline forecast for the current player with gate closure info.
        Returns the Round 1 forecast marked as is_da_baseline=True plus hour locking info.
        
        Response format:
        {
          "devices": {
            "device_1": [100, 100, 100, ...],  // DA position per hour
            "device_2": [50, 50, 50, ...]
          },
          "bids": {
            "device_1": {
              "A": {"price": 350, "hours": [50, 50, ...]},
              "B": {"price": 400, "hours": [30, 30, ...]},
              "C": {"price": 480, "hours": [20, 20, ...]}
            }
          },
          "aggregate": [150, 150, 150, ...],  // Sum across all devices
          "hour_status": ["locked", "locked", "da", "da", "id", "id", "future", "future", ...],
          "locked_until_hour": 6,  // Hours 0-5 are locked (already executed)
          "da_until_hour": 30,  // Hours 6-29 are DA (committed but tradeable as ID)
          "id_until_hour": 48   // Hours 30-47 are ID (still adjustable)
        }
        """
        player_id = int(get_jwt_identity())
        
        # Get session info for gate closure calculation
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        scenario = Scenario.query.get(session.scenario_id)
        if not scenario or not scenario.config:
            return {"error": "Scenario not found"}, HTTPStatus.NOT_FOUND
        
        general_cfg = scenario.config.get("general", {})
        markets_cfg = scenario.config.get("markets", {})
        round_span = int(general_cfg.get("round_span_hours", 6))
        # Use forecast_horizon_hours for DA calculation (visible in chart)
        horizon_hours = int(general_cfg.get("forecast_horizon_hours", general_cfg.get("horizon_hours", 24)))
        day_ahead_gate_hour = int(general_cfg.get("day_ahead_gate_hour", 12))  # Gate closes at 12:00
        start_time_str = general_cfg.get("start_time") or "00:00"
        current_round = session.current_round or 1
        
        # Check markets config for this round (0-indexed)
        round_idx = current_round - 1
        
        def get_market_status(market_key, aspect='trading'):
            """Get market status with backward compatibility."""
            market_data = markets_cfg.get(market_key, [])
            if isinstance(market_data, list):
                raw = market_data[round_idx] if round_idx < len(market_data) else "market_code"
                return _normalize_market_status(raw)
            elif isinstance(market_data, dict):
                aspect_array = market_data.get(aspect, [])
                raw = aspect_array[round_idx] if round_idx < len(aspect_array) else "market_code"
                return _normalize_market_status(raw)
            return _normalize_market_status("market_code")
        
        dam_status = get_market_status("dam", "trading")
        idm_status = get_market_status("idm", "trading")
        
        # Parse start time
        try:
            start_hour = int(start_time_str.split(":")[0])
        except:
            start_hour = 0
        
        # Calculate current simulation hour and clock time
        current_sim_hour = (current_round - 1) * round_span
        current_clock_hour = (start_hour + current_sim_hour) % 24
        
        # SIMPLE DA MARKET MODEL:
        # - Round 1: DA baseline for Day 1 (hours 0 to first midnight)
        # - Gate at 12:00 Day N: DA baseline for Day N+1 (next 24 hours after midnight)
        #
        # DA-committed = hours where DA position is fixed and cannot be changed
        # After Round 1, Day 1 is committed. After each gate, the next day is committed.
        
        locked_until_hour = current_sim_hour
        
        # Calculate which hours are DA-committed (cannot be changed)
        # Find hours since scenario start until first midnight
        hours_until_first_midnight = (24 - start_hour) % 24
        if hours_until_first_midnight == 0:
            hours_until_first_midnight = 24  # If start at 00:00, first midnight is 24h later
        
        # Gate hour relative to scenario start
        first_gate_sim_hour = (day_ahead_gate_hour - start_hour) % 24
        if first_gate_sim_hour <= 0:
            first_gate_sim_hour += 24  # Gate is on next day
        
        # DA-committed always starts at 0 (Day 1 is committed from Round 1)
        # Then extends with each gate
        da_committed_start = 0
        da_committed_end = hours_until_first_midnight  # Day 1 is always committed
        
        # Count how many gates have been passed
        if current_sim_hour >= first_gate_sim_hour:
            gate_count = 1 + (current_sim_hour - first_gate_sim_hour) // 24
            # Each gate commits one more day
            da_committed_end = min(hours_until_first_midnight + gate_count * 24, horizon_hours)
        
        # Clamp to valid range
        da_committed_start = max(0, da_committed_start)
        da_committed_end = min(da_committed_end, horizon_hours)
        
        # For API response
        da_until_hour = da_committed_end
        id_until_hour = horizon_hours
        
        # Find ALL DA baseline forecasts and combine them
        # Each gate creates a new DA baseline for different hours
        da_forecasts = Forecast.query.filter_by(
            session_id=session_id,
            player_id=player_id,
            is_da_baseline=True
        ).order_by(Forecast.round_num).all()
        
        if not da_forecasts:
            # No DA baseline exists yet
            # Build hour status based on Day 1 Baseline mode
            day_one_baseline_mode = general_cfg.get("day_one_baseline_mode", 
                                                     general_cfg.get("first_round_baseline_mode", "preset"))  # Backward compat
            
            hour_status = []
            for h in range(horizon_hours):
                if h < locked_until_hour:
                    hour_status.append("locked")
                elif current_round == 1 and h < hours_until_first_midnight:
                    # Round 1, Day 1: Depends on mode
                    if day_one_baseline_mode == "edit_round_one":
                        hour_status.append("da_r1")  # Editable (special Round 1 Day 1)
                    else:
                        # "zero" or "preset": locked (not editable)
                        hour_status.append("locked")
                elif current_round == 1:
                    # Round 1, beyond Day 1: Not yet tradeable
                    hour_status.append("forecast")
                elif da_committed_start <= h < da_committed_end:
                    # DA-committed → ID market (cannot change DA position)
                    hour_status.append("id")
                else:
                    # Beyond current trading horizon
                    hour_status.append("forecast")
            
            # FILTER hour_status based on markets config to prevent showing disabled markets
            if idm_status == "off":
                # Replace 'id' with appropriate alternative
                hour_status = [
                    'locked' if h == 'id' and idx < da_committed_end else
                    'forecast' if h == 'id' else
                    h
                    for idx, h in enumerate(hour_status)
                ]
            
            if dam_status == "off":
                # Replace 'da' with appropriate alternative
                # BUT: keep 'da_r1' (Round 1 Day 1 special opening) unchanged
                hour_status = [
                    'forecast' if h == 'da' else h
                    for h in hour_status
                ]
            
            # Auto-generate baseline for Round 1 if configured
            if current_round == 1 and day_one_baseline_mode in ["zero", "preset"]:
                # Generate automatic baseline ONLY for Day 1 (DA market)
                # Beyond Day 1, leave empty so players can plan ahead
                devices_config = scenario.config.get("devices", [])
                start_time = general_cfg.get("start_time", "00:00")
                
                # Count players for capacity division (multiplayer mode)
                from .models import SessionPlayerType
                player_count = SessionPlayerType.query.filter_by(session_id=session_id).count()
                if player_count == 0:
                    player_count = 1  # Fallback for solo mode
                
                devices_by_id = {}
                aggregate_hours = [0.0] * horizon_hours
                
                # Only generate baseline for Day 1 (up to first midnight)
                baseline_end = hours_until_first_midnight
                
                for device in devices_config:
                    device_id = device.get("id")
                    if not device_id:
                        continue
                    
                    device_hours = []
                    for h in range(horizon_hours):
                        if h < baseline_end:
                            # Generate baseline for Day 1 only
                            if day_one_baseline_mode == "zero":
                                # Zero baseline: all hours are 0
                                value = 0.0
                            else:  # "preset"
                                # Preset: generate realistic baseline
                                value = generate_device_baseline(device, player_count, h, start_time)
                        else:
                            # Beyond Day 1: leave at 0 for player planning
                            value = 0.0
                        
                        device_hours.append(value)
                        aggregate_hours[h] += value
                    
                    devices_by_id[device_id] = device_hours
                
                return {
                    "devices": devices_by_id,
                    "bids": {},
                    "aggregate": aggregate_hours,
                    "hour_status": hour_status,
                    "locked_until_hour": locked_until_hour,
                    "da_committed_start": da_committed_start if da_committed_start < horizon_hours else -1,
                    "da_committed_end": da_committed_end if da_committed_end > 0 else -1,
                    "da_until_hour": da_until_hour,
                    "id_until_hour": id_until_hour,
                    "auto_generated": True,
                    "baseline_mode": day_one_baseline_mode
                }, HTTPStatus.OK
            
            return {
                "devices": {},
                "bids": {},
                "aggregate": [],
                "hour_status": hour_status,
                "locked_until_hour": locked_until_hour,
                "da_committed_start": da_committed_start if da_committed_start < horizon_hours else -1,
                "da_committed_end": da_committed_end if da_committed_end > 0 else -1,
                "da_until_hour": da_until_hour,
                "id_until_hour": id_until_hour
            }, HTTPStatus.OK
        
        # Combine DA baselines from multiple gates
        # Each forecast covers specific hours (stored in da_baseline_hours)
        aggregate_hours = [0.0] * horizon_hours
        devices_by_id = {}
        bids_data = {}
        
        for da_forecast in da_forecasts:
            forecast_data = da_forecast.data or {}
            da_hours_range = forecast_data.get("da_baseline_hours", {"start": 0, "end": horizon_hours})
            da_start = da_hours_range.get("start", 0)
            da_end = da_hours_range.get("end", horizon_hours)
            
            # Copy aggregate hours for this range
            forecast_hours = forecast_data.get("hours", [])
            for h in range(da_start, min(da_end, len(forecast_hours), horizon_hours)):
                if h < len(forecast_hours):
                    aggregate_hours[h] = forecast_hours[h]
            
            # Copy device data for this range
            devices_data = forecast_data.get("devices", [])
            if isinstance(devices_data, list):
                for item in devices_data:
                    device_id = item.get("device_id")
                    hours = item.get("hours", [])
                    if device_id:
                        if device_id not in devices_by_id:
                            devices_by_id[device_id] = [0.0] * horizon_hours
                        for h in range(da_start, min(da_end, len(hours), horizon_hours)):
                            if h < len(hours):
                                devices_by_id[device_id][h] = hours[h]
            
            # Copy bids for this range
            forecast_bids = da_forecast.bids or {}
            for device_id, lots in forecast_bids.items():
                if device_id not in bids_data:
                    bids_data[device_id] = {}
                for lot_name, lot_data in lots.items():
                    lot_hours = lot_data.get('hours', [])
                    if lot_name not in bids_data[device_id]:
                        bids_data[device_id][lot_name] = {
                            'price': lot_data.get('price', 0),
                            'hours': [0.0] * horizon_hours
                        }
                    for h in range(da_start, min(da_end, len(lot_hours), horizon_hours)):
                        if h < len(lot_hours):
                            bids_data[device_id][lot_name]['hours'][h] = lot_hours[h]
        
        # Truncate to da_until_hour
        aggregate_hours = aggregate_hours[:da_until_hour]
        for device_id in devices_by_id:
            devices_by_id[device_id] = devices_by_id[device_id][:da_until_hour]
        for device_id in bids_data:
            for lot_name in bids_data[device_id]:
                bids_data[device_id][lot_name]['hours'] = bids_data[device_id][lot_name]['hours'][:da_until_hour]
        
        # ============================================================
        # TWO-STAGE ALGORITHM: Marking → Assignment (same as generate_market_timeline)
        # ============================================================
        
        # IDM Freeze configuration
        id_freeze_hours = int(general_cfg.get("id_freeze_hours", 0))
        id_gate_interval = int(general_cfg.get("id_gate_interval_hours", 4))
        id_gate_base = int(general_cfg.get("id_gate_base_hour", 0))
        
        # Current hour of day and gate status
        hour_of_day = (start_hour + current_sim_hour) % 24
        
        # Day boundaries (time-based, works for any round span)
        if current_sim_hour < hours_until_first_midnight:
            # Still in Day 1
            current_day_start = 0
            current_day_end = hours_until_first_midnight
            next_day_start = hours_until_first_midnight
            next_day_end = hours_until_first_midnight + 24
        else:
            # Day 2+: Calculate based on simulation time
            days_since_start = (current_sim_hour - hours_until_first_midnight) // 24
            current_day_start = hours_until_first_midnight + days_since_start * 24
            current_day_end = current_day_start + 24
            next_day_start = current_day_end
            next_day_end = next_day_start + 24
        
        day_one_baseline_mode = general_cfg.get("day_one_baseline_mode", 
                                                 general_cfg.get("first_round_baseline_mode", "preset"))
        
        # Initialize marking arrays
        dam_enabled_hours = [False] * horizon_hours
        idm_enabled_hours = [False] * horizon_hours
        mark_as_r1_special = {}
        
        # --- DAM Marking ---
        
        # Round 1 + edit_round_one → Day 1 = DAM enabled
        if current_round == 1 and day_one_baseline_mode == "edit_round_one":
            for h in range(min(hours_until_first_midnight, horizon_hours)):
                dam_enabled_hours[h] = True
                mark_as_r1_special[h] = True
        
        # DAM for next day
        if dam_status == "on":
            for h in range(next_day_start, min(next_day_end, horizon_hours)):
                dam_enabled_hours[h] = True
        elif dam_status == "market_code":
            if hour_of_day < day_ahead_gate_hour:
                for h in range(next_day_start, min(next_day_end, horizon_hours)):
                    dam_enabled_hours[h] = True
        
        # --- IDM Marking ---
        
        if idm_status == "on":
            id_start = current_sim_hour + id_freeze_hours
            for h in range(id_start, min(current_day_end, horizon_hours)):
                idm_enabled_hours[h] = True
        elif idm_status == "market_code":
            next_id_gate = _calculate_next_id_gate(current_sim_hour, id_gate_interval, id_gate_base)
            gate_after_next = next_id_gate + id_gate_interval
            for h in range(next_id_gate, min(gate_after_next, current_day_end, horizon_hours)):
                idm_enabled_hours[h] = True
        
        # --- Assignment ---
        
        hour_status = []
        for h in range(horizon_hours):
            if h < current_sim_hour:
                hour_status.append("locked")
            elif dam_enabled_hours[h]:
                if mark_as_r1_special.get(h, False):
                    hour_status.append("da_r1")
                else:
                    hour_status.append("da")
            elif idm_enabled_hours[h]:
                hour_status.append("id")
            else:
                hour_status.append("forecast")
        
        # No additional filtering needed - marking stage already respects dam_status/idm_status
        
        # Generate market timeline for detailed phase information
        timeline = generate_market_timeline(session, current_round)
        
        # ============================================================
        # GET CURRENT COMMITTED POSITION (for ID area visualization)
        # ============================================================
        # Get the latest forecast for this player to show the current committed position
        # (used to calculate green/red ID areas for hours before the next ID gate)
        current_forecast = Forecast.query.filter_by(
            session_id=session_id,
            player_id=player_id
        ).order_by(Forecast.round_num.desc(), Forecast.id.desc()).first()
        
        current_position_devices = {}
        current_position_bids = {}
        current_position_aggregate = [0.0] * horizon_hours
        
        if current_forecast and current_forecast.data:
            forecast_data = current_forecast.data
            
            # Extract device hours
            devices_data = forecast_data.get("devices", [])
            if isinstance(devices_data, list):
                for item in devices_data:
                    device_id = item.get("device_id")
                    device_hours = item.get("hours", [])
                    if device_id and device_hours:
                        current_position_devices[device_id] = device_hours[:horizon_hours]
                        # Pad if shorter
                        while len(current_position_devices[device_id]) < horizon_hours:
                            current_position_devices[device_id].append(0.0)
            
            # Extract bid hours
            bids_list = forecast_data.get("bids", [])
            if isinstance(bids_list, list):
                for bid_item in bids_list:
                    device_id = bid_item.get("device_id")
                    lot_name = bid_item.get("lot_name", "A")
                    lot_hours = bid_item.get("hours", [])
                    lot_price = bid_item.get("price", 0)
                    
                    if device_id:
                        if device_id not in current_position_bids:
                            current_position_bids[device_id] = {}
                        current_position_bids[device_id][lot_name] = {
                            'price': lot_price,
                            'hours': lot_hours[:horizon_hours]
                        }
                        # Pad if shorter
                        while len(current_position_bids[device_id][lot_name]['hours']) < horizon_hours:
                            current_position_bids[device_id][lot_name]['hours'].append(0.0)
            
            # Extract aggregate hours
            aggregate_data = forecast_data.get("hours", [])
            if aggregate_data:
                for h in range(min(len(aggregate_data), horizon_hours)):
                    current_position_aggregate[h] = aggregate_data[h]
        
        return {
            "devices": devices_by_id,
            "bids": bids_data,
            "aggregate": aggregate_hours,
            "hour_status": hour_status,
            "locked_until_hour": locked_until_hour,
            "da_committed_start": da_committed_start if da_committed_start < horizon_hours else -1,
            "da_committed_end": da_committed_end if da_committed_end > 0 else -1,
            "da_until_hour": da_until_hour,
            "id_until_hour": id_until_hour,
            "market_timeline": timeline,
            # Current committed position (last saved forecast)
            "current_position": {
                "devices": current_position_devices,
                "bids": current_position_bids,
                "aggregate": current_position_aggregate
            }
        }, HTTPStatus.OK


@ns.route("/results/<int:session_id>")
class PlayerResults(Resource):
    @jwt_required()
    def get(self, session_id: int):
        """
        Get all round results for the current player in this session, including hourly_results.
        Returns SMP, volume, and hourly data for each completed round.
        """
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get all results for this player in this session
        results = Result.query.filter_by(session_id=session_id, player_id=player_id).order_by(Result.round_num).all()
        
        print(f"[PlayerResults] Session {session_id}, Player {player_id}: Found {len(results)} results")
        
        rounds_data = []
        all_hourly_results = []
        all_dam_hourly_results = []
        all_idm_hourly_results = []
        
        for result in results:
            if result.data:
                rounds_data.append({
                    "round": result.round_num,
                    "smp": result.data.get("smp", 0),
                    "volume": result.data.get("volume", 0),
                })
                
                # Collect hourly_results from this round
                hourly = result.data.get("hourly_results", [])
                if hourly:
                    print(f"[PlayerResults] Round {result.round_num}: {len(hourly)} hourly entries")
                    all_hourly_results.extend(hourly)
                else:
                    print(f"[PlayerResults] Round {result.round_num}: No hourly_results in data")

                dam_hourly = result.data.get("dam_hourly_results", [])
                if dam_hourly:
                    all_dam_hourly_results.extend(dam_hourly)

                idm_hourly = result.data.get("idm_hourly_results", [])
                if idm_hourly:
                    all_idm_hourly_results.extend(idm_hourly)
        
        print(f"[PlayerResults] Returning {len(all_hourly_results)} total hourly results")
        
        return {
            "rounds": rounds_data,
            "hourly_results": all_hourly_results,
            "dam_hourly_results": all_dam_hourly_results,
            "idm_hourly_results": all_idm_hourly_results
        }, HTTPStatus.OK


@ns.route("/reset-scenario")
class ResetScenario(Resource):
    @jwt_required()
    def post(self):
        """Reset all progress for the current player for a given campaign+scenario.

        Body: { campaign_id: int, scenario_id: int }
        - Set PlayerProgress to not_started, clear timestamps
        - Delete any solo sessions (isolated_per_player) of this player for the scenario, including forecasts/results
        - Remove related cohort(s) created for those solo sessions
        """
        body = request.json or {}
        uid = int(get_jwt_identity())
        campaign_id = body.get("campaign_id")
        scenario_id = body.get("scenario_id")
        if not campaign_id or not scenario_id:
            return {"error": "campaign_id and scenario_id required"}, HTTPStatus.BAD_REQUEST

        # Reset PlayerProgress
        pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=int(campaign_id), scenario_id=int(scenario_id)).first()
        if pp:
            pp.status = PlayerProgressStatus.not_started
            pp.started_at = None
            pp.completed_at = None
            db.session.add(pp)

        # Find solo sessions for this user and scenario
        solo_sessions = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == uid,
                Session.scenario_id == int(scenario_id),
                Session.mode == "isolated_per_player",
            )
            .all()
        )
        for s in solo_sessions:
            # Capture cohort before deleting session
            cohort_id = s.cohort_id
            sid = s.id
            # Delete forecasts and results tied to session
            Forecast.query.filter_by(session_id=sid).delete(synchronize_session=False)
            Result.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete player type selections/allowed types (if any)
            SessionPlayerType.query.filter_by(session_id=sid).delete(synchronize_session=False)
            SessionAllowedType.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete activity logs for this session
            ActivityLog.query.filter_by(session_id=sid).delete(synchronize_session=False)
            # Delete the session itself
            db.session.delete(s)
            db.session.flush()
            # Clean up cohort and its membership (solo cohorts are per-session)
            try:
                if cohort_id:
                    # Only delete cohort members if this is a solo cohort (trainer_id == player_id)
                    cohort = Cohort.query.get(cohort_id)
                    if cohort and cohort.trainer_id == uid:
                        # This is a solo cohort, safe to delete members
                        # Remove any activity logs tied to this cohort (may have session_id NULL)
                        ActivityLog.query.filter_by(cohort_id=cohort_id).delete(synchronize_session=False)
                        CohortMember.query.filter_by(cohort_id=cohort_id).delete(synchronize_session=False)
                        # Delete cohort only if no sessions remain for it
                        remaining = db.session.query(Session.id).filter_by(cohort_id=cohort_id).first()
                        if not remaining:
                            db.session.delete(cohort)
            except Exception:
                pass

        # Clean personal data in cohort sessions for this scenario (do not delete sessions)
        cohort_sessions = (
            db.session.query(Session)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(
                CohortMember.user_id == uid,
                Session.scenario_id == int(scenario_id),
                Session.mode != "isolated_per_player",
            )
            .all()
        )
        for s in cohort_sessions:
            sid = s.id
            # Remove this player's forecasts/results from the cohort session
            Forecast.query.filter_by(session_id=sid, player_id=uid).delete(synchronize_session=False)
            Result.query.filter_by(session_id=sid, player_id=uid).delete(synchronize_session=False)
            # Remove type selection for this player (if any)
            SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).delete(synchronize_session=False)
            # Remove player's activity logs for this session
            ActivityLog.query.filter_by(session_id=sid, user_id=uid).delete(synchronize_session=False)

        db.session.commit()
        return {"status": "ok"}


# ============================================================================
# Debug Panel v2 Endpoints (Admin only)
# ============================================================================

@ns.route("/generate-test-data/<int:session_id>")
class GenerateTestData(Resource):
    @jwt_required()
    def post(self, session_id):
        """
        Generate reproducible test data for QA/debugging (Admin only).
        
        Body:
            {
                "preset": "conservative" | "balanced" | "aggressive",
                "seed": int (optional, auto-generated if not provided),
                "full_horizon": bool (default: false, only tradeable hours)
            }
        
        Returns:
            {
                "device_hours": {...},
                "device_bids": {...},
                "aggregate_hours": [...],
                "seed_used": int,
                "preset": str,
                "full_horizon": bool,
                "hours_generated": int,
                "warnings": [...]
            }
        """
        # Admin check
        uid = int(get_jwt_identity())
        user = db.session.query(db.Model.metadata.tables['user']).filter_by(id=uid).first() if hasattr(db.Model.metadata.tables, 'user') else None
        user_email = user.email if user and hasattr(user, 'email') else None
        
        if user_email != 'admin@fastbreak.one':
            return {"error": "Admin access required"}, HTTPStatus.FORBIDDEN
        
        # Get session
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        if not session.scenario:
            return {"error": "No scenario configured"}, HTTPStatus.BAD_REQUEST
        
        # Parse request body
        body = request.json or {}
        preset = body.get('preset', 'balanced')
        seed = body.get('seed')  # Optional
        full_horizon = body.get('full_horizon', False)
        
        if preset not in ['conservative', 'balanced', 'aggressive']:
            return {"error": f"Invalid preset: {preset}"}, HTTPStatus.BAD_REQUEST
        
        # Get scenario config and devices
        scenario_config = session.scenario.config
        devices = scenario_config.get('devices', [])
        
        if not devices:
            return {"error": "No devices configured in scenario"}, HTTPStatus.BAD_REQUEST
        
        # Determine current round
        round_num = scenario_config.get('current_round', 1)
        
        # Calculate tradeable hours
        tradeable_hours = _get_tradeable_hours(session, round_num)
        
        # Generate test data
        try:
            result = generate_test_data(
                devices=devices,
                scenario_config=scenario_config,
                session_id=session_id,
                round_num=round_num,
                tradeable_hours=tradeable_hours,
                preset=preset,
                seed=seed,
                full_horizon=full_horizon
            )
            
            return result, HTTPStatus.OK
        
        except Exception as e:
            return {"error": f"Failed to generate test data: {str(e)}"}, HTTPStatus.INTERNAL_SERVER_ERROR


@ns.route("/validate-capacity/<int:session_id>")
class ValidateCapacity(Resource):
    @jwt_required()
    def post(self, session_id):
        """
        Validate capacity constraints for given forecast data (Admin only).
        
        Body:
            {
                "device_hours": {...},
                "device_bids": {...} (optional)
            }
        
        Returns:
            {
                "valid": bool,
                "errors": [...],
                "warnings": [...]
            }
        """
        # Admin check
        uid = int(get_jwt_identity())
        user = User.query.get(uid)
        
        if not user or user.role != Role.admin:
            return {"error": "Admin access required"}, HTTPStatus.FORBIDDEN
        
        # Get session
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        if not session.scenario:
            return {"error": "No scenario configured"}, HTTPStatus.BAD_REQUEST
        
        # Parse request body
        body = request.json or {}
        device_hours = body.get('device_hours', {})
        device_bids = body.get('device_bids', {})
        
        # Get scenario config and devices
        scenario_config = session.scenario.config
        devices = scenario_config.get('devices', [])
        round_num = scenario_config.get('current_round', 1)
        
        # Calculate tradeable hours
        tradeable_hours = _get_tradeable_hours(session, round_num)
        
        # Validate
        try:
            result = validate_capacity(
                device_hours=device_hours,
                device_bids=device_bids,
                devices=devices,
                tradeable_hours=tradeable_hours
            )
            
            return result, HTTPStatus.OK
        
        except Exception as e:
            return {"error": f"Validation failed: {str(e)}"}, HTTPStatus.INTERNAL_SERVER_ERROR


@ns.route("/debug-report-url/<int:session_id>")
class DebugReportUrl(Resource):
    @jwt_required()
    def get(self, session_id):
        """
        Get URL to latest debug report for a session (Admin only).
        
        Returns:
            {
                "url": str | null,
                "filename": str | null,
                "round": int | null
            }
        """
        # Admin check
        uid = int(get_jwt_identity())
        user = User.query.get(uid)
        
        if not user or user.role != Role.admin:
            return {"error": "Admin access required"}, HTTPStatus.FORBIDDEN
        
        # Get session
        session = Session.query.get(session_id)
        if not session:
            return {"error": "Session not found"}, HTTPStatus.NOT_FOUND
        
        # Find latest result with debug report
        latest_result = (
            Result.query
            .filter_by(session_id=session_id)
            .filter(Result.data.op('->>')('debug_report').isnot(None))
            .order_by(Result.round_num.desc())
            .first()
        )
        
        if not latest_result:
            return {
                "url": None,
                "filename": None,
                "round": None,
                "message": "No debug report found for this session"
            }, HTTPStatus.OK
        
        # Extract debug report filename from result data
        debug_filename = latest_result.data.get('debug_report')
        
        if not debug_filename:
            return {
                "url": None,
                "filename": None,
                "round": latest_result.round_num,
                "message": "Debug report filename not found in result data"
            }, HTTPStatus.OK
        
        # Construct URL (assuming reports are served from /debug/)
        debug_url = f"/debug/{debug_filename}"
        
        return {
            "url": debug_url,
            "filename": debug_filename,
            "round": latest_result.round_num
        }, HTTPStatus.OK
