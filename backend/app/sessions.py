from http import HTTPStatus
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from .extensions import db, socketio
from .scheduler import run_rounds
from .models import Session, SessionStatus, Scenario, Campaign, SessionAllowedType, SessionPlayerType, ActivityLog, User, CohortMember, Forecast
from .utils import role_required, log_activity
from .kpi_schema import canonicalize_kpis
from .engine import _summarize_battery_player_kpis
import os, json
from datetime import datetime
from typing import Any
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:
    _redis_client = None


ns = Namespace("sessions", description="Trainer session control")

session_in = ns.model(
    "SessionCreate",
    {
        "cohort_id": fields.Integer(required=True),
        "scenario_id": fields.Integer(required=True),
        "mode": fields.String(required=False, enum=["isolated_per_player", "shared_market"], description="Market mode"),
        "force_navigate": fields.Boolean(required=False, description="If true, push players of the cohort to the briefing page"),
    },
)

broadcast_in = ns.model("Broadcast", {"message": fields.String(required=True)})


def emit_trainer(event: str, payload: dict):
    socketio.emit(event, payload, namespace="/trainer")


def _normalize_market_role(value):
    role = str(value or "").strip().lower()
    if not role:
        return None
    if "consumer" in role or "buyer" in role:
        return "consumer"
    if "producer" in role or "generator" in role or "seller" in role:
        return "producer"
    return None


def _infer_role_from_player_type(config: dict, player_type_id):
    type_id = str(player_type_id or "").strip()
    if not type_id:
        return None

    try:
        from .engine import detect_player_role
    except Exception:
        return None

    cfg_devices = config.get("devices") or []
    cfg_player_types = config.get("player_types") or []
    devices_by_id = {
        str(device.get("id")): device
        for device in cfg_devices
        if isinstance(device, dict) and device.get("id") is not None
    }
    player_type_cfg = next(
        (
            item for item in cfg_player_types
            if isinstance(item, dict) and str(item.get("id") or "") == type_id
        ),
        None,
    )
    if not player_type_cfg:
        return None

    player_devices = [
        devices_by_id[str(device_id)]
        for device_id in (player_type_cfg.get("devices") or [])
        if str(device_id) in devices_by_id
    ]
    if not player_devices:
        return None

    return _normalize_market_role(detect_player_role(player_devices))


def _resolve_market_role(config: dict, player_type_id, raw_role, revenue_hint=0.0):
    normalized = _normalize_market_role(raw_role)
    if normalized:
        return normalized

    normalized = _infer_role_from_player_type(config, player_type_id)
    if normalized:
        return normalized

    return "consumer" if float(revenue_hint or 0.0) < 0 else "producer"


def _safe_market_number(value):
    try:
        num = float(value or 0.0)
    except Exception:
        return 0.0
    if num != num:
        return 0.0
    return num


def _get_market_status_for_round(config: dict, market_key: str, round_num: int):
    markets_cfg = (config or {}).get("markets", {})
    round_idx = max(0, int(round_num or 1) - 1)
    market_data = markets_cfg.get(market_key, [])

    if isinstance(market_data, list):
        return market_data[round_idx] if round_idx < len(market_data) else "market_code"
    if isinstance(market_data, dict):
        trading_array = market_data.get("trading", [])
        if isinstance(trading_array, list):
            return trading_array[round_idx] if round_idx < len(trading_array) else "market_code"
    return "market_code"


def _strip_intraday_hourly_metadata(rows: Any):
    if not isinstance(rows, list):
        return []

    stripped_rows = []
    for row in rows:
        if not isinstance(row, dict):
            stripped_rows.append(row)
            continue
        cleaned = dict(row)
        cleaned.pop("idp", None)
        cleaned.pop("id_trade_count", None)
        cleaned.pop("id_volume_mwh", None)
        stripped_rows.append(cleaned)
    return stripped_rows


def _summarize_device_settlement(device_hourly_breakdown: Any):
    if not isinstance(device_hourly_breakdown, dict):
        return None

    hourly: dict[int, dict[str, float]] = {}
    row_count = 0
    has_split_fields = False

    for rows in device_hourly_breakdown.values():
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            hour = row.get("hour")
            if hour is None:
                continue
            try:
                hour = int(hour)
            except Exception:
                continue

            row_count += 1
            da_revenue_present = row.get("da_revenue_zar") is not None
            id_revenue_present = row.get("id_revenue_zar") is not None
            da_revenue = _safe_market_number(row.get("da_revenue_zar"))
            id_revenue = _safe_market_number(row.get("id_revenue_zar"))
            revenue = _safe_market_number(row.get("revenue_zar"))
            if da_revenue_present or id_revenue_present:
                has_split_fields = True
                if abs(revenue - (da_revenue + id_revenue)) > 1.0:
                    return None

            variable_cost = _safe_market_number(row.get("variable_cost_zar"))
            fixed_cost = _safe_market_number(row.get("fixed_cost_zar"))
            imbalance_cost = _safe_market_number(row.get("imbalance_cost_zar"))
            battery_charge_cost = _safe_market_number(row.get("battery_charge_cost_zar"))
            congestion_revenue = _safe_market_number(row.get("congestion_revenue_zar"))
            atc_cost = _safe_market_number(row.get("network_shortfall_cost_zar"))
            if abs(atc_cost) < 1e-9:
                atc_cost = _safe_market_number(row.get("atc_dispatch_cost_zar"))
            if abs(atc_cost) < 1e-9:
                atc_cost = _safe_market_number(row.get("grid_constraint_cost_zar"))

            expected_profit = (
                revenue
                - variable_cost
                - fixed_cost
                - imbalance_cost
                - battery_charge_cost
                - atc_cost
                + congestion_revenue
            )
            if abs(_safe_market_number(row.get("profit_zar")) - expected_profit) > 1.0:
                return None

            bucket = hourly.setdefault(
                hour,
                {
                    "hour": hour,
                    "planned_mw": 0.0,
                    "dispatched_mw": 0.0,
                    "actual_mw": 0.0,
                    "imbalance_mwh": 0.0,
                    "revenue_zar": 0.0,
                    "da_revenue_zar": 0.0,
                    "id_revenue_zar": 0.0,
                    "da_dispatched_mwh": 0.0,
                    "id_dispatched_mwh": 0.0,
                    "variable_cost_zar": 0.0,
                    "fixed_cost_zar": 0.0,
                    "imbalance_cost_zar": 0.0,
                    "battery_charge_cost_zar": 0.0,
                    "atc_dispatch_cost_zar": 0.0,
                    "grid_constraint_cost_zar": 0.0,
                    "congestion_revenue_zar": 0.0,
                    "profit_zar": 0.0,
                    "co2_emissions_kg": 0.0,
                },
            )
            bucket["planned_mw"] += _safe_market_number(row.get("planned_mw"))
            bucket["dispatched_mw"] += _safe_market_number(row.get("total_dispatched_mwh", row.get("dispatched_mw")))
            bucket["actual_mw"] += _safe_market_number(row.get("actual_mw"))
            bucket["imbalance_mwh"] += _safe_market_number(row.get("imbalance_mwh"))
            bucket["revenue_zar"] += revenue
            bucket["da_revenue_zar"] += da_revenue
            bucket["id_revenue_zar"] += id_revenue
            bucket["da_dispatched_mwh"] += _safe_market_number(row.get("da_dispatched_mwh"))
            bucket["id_dispatched_mwh"] += _safe_market_number(row.get("id_dispatched_mwh"))
            bucket["variable_cost_zar"] += variable_cost
            bucket["fixed_cost_zar"] += fixed_cost
            bucket["imbalance_cost_zar"] += imbalance_cost
            bucket["battery_charge_cost_zar"] += battery_charge_cost
            bucket["atc_dispatch_cost_zar"] += atc_cost
            bucket["grid_constraint_cost_zar"] += atc_cost
            bucket["congestion_revenue_zar"] += congestion_revenue
            bucket["profit_zar"] += _safe_market_number(row.get("profit_zar"))
            bucket["co2_emissions_kg"] += _safe_market_number(row.get("co2_kg", row.get("co2_emissions_kg")))

    if row_count == 0 or not has_split_fields:
        return None

    hourly_rows = []
    for hour in sorted(hourly):
        bucket = hourly[hour]
        hourly_rows.append({
            "hour": hour,
            "planned_mw": round(bucket["planned_mw"], 3),
            "dispatched_mw": round(bucket["dispatched_mw"], 3),
            "actual_mw": round(bucket["actual_mw"], 3),
            "imbalance_mwh": round(bucket["imbalance_mwh"], 3),
            "revenue_zar": round(bucket["revenue_zar"], 0),
            "da_revenue_zar": round(bucket["da_revenue_zar"], 0),
            "id_revenue_zar": round(bucket["id_revenue_zar"], 0),
            "da_dispatched_mwh": round(bucket["da_dispatched_mwh"], 3),
            "id_dispatched_mwh": round(bucket["id_dispatched_mwh"], 3),
            "variable_cost_zar": round(bucket["variable_cost_zar"], 0),
            "fixed_cost_zar": round(bucket["fixed_cost_zar"], 0),
            "imbalance_cost_zar": round(bucket["imbalance_cost_zar"], 2),
            "battery_charge_cost_zar": round(bucket["battery_charge_cost_zar"], 2),
            "atc_dispatch_cost_zar": round(bucket["atc_dispatch_cost_zar"], 0),
            "grid_constraint_cost_zar": round(bucket["grid_constraint_cost_zar"], 0),
            "congestion_revenue_zar": round(bucket["congestion_revenue_zar"], 0),
            "profit_zar": round(bucket["profit_zar"], 0),
            "co2_emissions_kg": round(bucket["co2_emissions_kg"], 2),
        })

    return {
        "hourly_rows": hourly_rows,
        "planned_mwh": round(sum(row["planned_mw"] for row in hourly_rows), 3),
        "dispatched_mwh": round(sum(row["dispatched_mw"] for row in hourly_rows), 3),
        "actual_mwh": round(sum(row["actual_mw"] for row in hourly_rows), 3),
        "imbalance_mwh": round(sum(row["imbalance_mwh"] for row in hourly_rows), 3),
        "revenue_zar": round(sum(row["revenue_zar"] for row in hourly_rows), 0),
        "da_volume_mwh": round(sum(row["da_dispatched_mwh"] for row in hourly_rows), 3),
        "id_delta_mwh": round(sum(row["id_dispatched_mwh"] for row in hourly_rows), 3),
        "da_revenue_zar": round(sum(row["da_revenue_zar"] for row in hourly_rows), 0),
        "id_revenue_zar": round(sum(row["id_revenue_zar"] for row in hourly_rows), 0),
        "variable_cost_zar": round(sum(row["variable_cost_zar"] for row in hourly_rows), 0),
        "fixed_cost_zar": round(sum(row["fixed_cost_zar"] for row in hourly_rows), 0),
        "imbalance_cost_zar": round(sum(row["imbalance_cost_zar"] for row in hourly_rows), 2),
        "battery_charge_cost_zar": round(sum(row["battery_charge_cost_zar"] for row in hourly_rows), 2),
        "atc_dispatch_cost_zar": round(sum(row["atc_dispatch_cost_zar"] for row in hourly_rows), 0),
        "grid_constraint_cost_zar": round(sum(row["grid_constraint_cost_zar"] for row in hourly_rows), 0),
        "congestion_revenue_zar": round(sum(row["congestion_revenue_zar"] for row in hourly_rows), 0),
        "profit_zar": round(sum(row["profit_zar"] for row in hourly_rows), 0),
        "co2_emissions_kg": round(sum(row["co2_emissions_kg"] for row in hourly_rows), 2),
    }


def _merge_hourly_breakdown(existing_rows: Any, derived_rows: list[dict]):
    existing_by_hour = {}
    if isinstance(existing_rows, list):
        for row in existing_rows:
            if isinstance(row, dict) and row.get("hour") is not None:
                existing_by_hour[row.get("hour")] = dict(row)

    for row in derived_rows:
        merged = dict(existing_by_hour.get(row["hour"], {}))
        merged.update(row)
        existing_by_hour[row["hour"]] = merged

    return [existing_by_hour[hour] for hour in sorted(existing_by_hour)]


def _backfill_kpis_from_device_settlement(kpis: dict):
    device_hourly_breakdown = kpis.get("device_hourly_breakdown") if isinstance(kpis.get("device_hourly_breakdown"), dict) else {}
    device_settlement_summary = _summarize_device_settlement(device_hourly_breakdown)
    if device_settlement_summary and (
        abs(float(kpis.get("revenue_zar") or 0.0) - float(device_settlement_summary["revenue_zar"])) >= 0.5
        or abs(float(kpis.get("profit_zar") or 0.0) - float(device_settlement_summary["profit_zar"])) >= 0.5
        or abs(float(kpis.get("imbalance_cost_zar") or 0.0) - float(device_settlement_summary["imbalance_cost_zar"])) >= 0.5
        or abs(float(kpis.get("co2_emissions_kg") or 0.0) - float(device_settlement_summary["co2_emissions_kg"])) >= 0.5
        or abs(float(kpis.get("dispatched_mwh") or 0.0) - float(device_settlement_summary["dispatched_mwh"])) >= 0.5
    ):
        kpis["hourly_breakdown"] = _merge_hourly_breakdown(
            kpis.get("hourly_breakdown"),
            device_settlement_summary["hourly_rows"],
        )
        for key in [
            "planned_mwh",
            "dispatched_mwh",
            "actual_mwh",
            "imbalance_mwh",
            "revenue_zar",
            "variable_cost_zar",
            "fixed_cost_zar",
            "imbalance_cost_zar",
            "battery_charge_cost_zar",
            "atc_dispatch_cost_zar",
            "grid_constraint_cost_zar",
            "congestion_revenue_zar",
            "profit_zar",
            "co2_emissions_kg",
        ]:
            kpis[key] = device_settlement_summary[key]
    return kpis


def _reconcile_device_hourly_breakdown_with_balancing(device_hourly_breakdown: Any, balancing_map: dict[str, dict[Any, dict]]):
    if not isinstance(device_hourly_breakdown, dict) or not isinstance(balancing_map, dict):
        return device_hourly_breakdown

    for dev_id, rows in device_hourly_breakdown.items():
        if not isinstance(rows, list):
            continue
        bal_by_hour = balancing_map.get(str(dev_id))
        if not isinstance(bal_by_hour, dict):
            continue

        for entry in rows:
            if not isinstance(entry, dict):
                continue
            hour_idx = entry.get("hour")
            if hour_idx is None:
                continue
            bal = bal_by_hour.get(hour_idx)
            if not isinstance(bal, dict):
                continue

            field_map = {
                "da_dispatched_mwh": "da_dispatched_mwh",
                "id_dispatched_mwh": "id_dispatched_mwh",
                "total_dispatched_mwh": "total_dispatched_mwh",
                "actual_mw": "actual_mwh",
                "imbalance_mwh": "imbalance_mwh",
                "imbalance_cost_zar": "balancing_cost_zar",
            }
            for dest_key, source_key in field_map.items():
                source_value = bal.get(source_key)
                if source_value is None:
                    continue
                current_value = entry.get(dest_key)
                if current_value is None or abs(_safe_market_number(current_value) - _safe_market_number(source_value)) > 1e-6:
                    entry[dest_key] = source_value
                    entry["_settlement_backfill_required"] = True

            total_dispatched = entry.get("total_dispatched_mwh")
            if total_dispatched is not None and (
                entry.get("dispatched_mw") is None
                or abs(_safe_market_number(entry.get("dispatched_mw")) - _safe_market_number(total_dispatched)) > 1e-6
            ):
                entry["dispatched_mw"] = total_dispatched
                entry["_settlement_backfill_required"] = True

            if "network_shortfall_mwh" in entry:
                entry["network_shortfall_mwh"] = 0.0
                entry["_settlement_backfill_required"] = True
            if "network_shortfall_cost_zar" in entry:
                entry["network_shortfall_cost_zar"] = 0.0
                entry["_settlement_backfill_required"] = True

    return device_hourly_breakdown


def _build_balancing_map(raw_details: Any):
    balancing_by_dev = (raw_details.get("balancing") or {}) if isinstance(raw_details, dict) else {}
    balancing_map = {}
    if isinstance(balancing_by_dev, dict):
        for dev_id, rows in balancing_by_dev.items():
            if not isinstance(rows, list):
                continue
            by_hour = {}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                hour_idx = row.get("hour_idx", row.get("scenario_hour_idx", row.get("hour")))
                if hour_idx is None:
                    continue
                try:
                    by_hour[int(hour_idx)] = row
                except Exception:
                    continue
            balancing_map[str(dev_id)] = by_hour
    return balancing_map


def _repair_device_settlement_kpis(
    kpis: dict,
    raw_details: Any,
    cfg_devices: list[dict] | None = None,
    player_device_ids: set[str] | None = None,
    da_smp: float | None = None,
    use_da_baseline_settlement: bool = True,
):
    device_hourly_breakdown = kpis.get("device_hourly_breakdown") if isinstance(kpis.get("device_hourly_breakdown"), dict) else {}
    if not device_hourly_breakdown:
        return kpis

    cfg_devices = cfg_devices or []
    player_device_ids = player_device_ids or set()
    device_type_by_id = {str(d.get("id")): str(d.get("type", "")).lower() for d in cfg_devices if isinstance(d, dict) and d.get("id")}
    balancing_map = _build_balancing_map(raw_details)

    _reconcile_device_hourly_breakdown_with_balancing(device_hourly_breakdown, balancing_map)

    effective_da_smp = da_smp if use_da_baseline_settlement else None

    total_revenue = 0.0
    for dev_id, rows in device_hourly_breakdown.items():
        dev_id_s = str(dev_id)
        if player_device_ids and dev_id_s not in player_device_ids:
            continue
        if not isinstance(rows, list):
            continue

        is_load = "load" in device_type_by_id.get(dev_id_s, "")
        sign = -1.0 if is_load else 1.0
        bal_by_hour = balancing_map.get(dev_id_s, {})

        for entry in rows:
            if not isinstance(entry, dict):
                continue
            hour_idx = entry.get("hour")
            bal = bal_by_hour.get(hour_idx) if hour_idx is not None else None

            if bal and entry.get("da_dispatched_mwh") is None:
                entry["da_dispatched_mwh"] = bal.get("da_dispatched_mwh", 0.0)
            if bal and entry.get("id_dispatched_mwh") is None:
                entry["id_dispatched_mwh"] = bal.get("id_dispatched_mwh", 0.0)
            if bal and entry.get("total_dispatched_mwh") is None:
                entry["total_dispatched_mwh"] = bal.get("total_dispatched_mwh", 0.0)

            dispatched_hint = entry.get("total_dispatched_mwh")
            if dispatched_hint is None:
                dispatched_hint = entry.get("dispatched_mw")
            try:
                dispatched_hint = float(dispatched_hint or 0.0)
            except Exception:
                dispatched_hint = 0.0

            try:
                revenue_existing = float(entry.get("revenue_zar") or 0.0)
            except Exception:
                revenue_existing = 0.0

            current_market_price_hint = entry.get("market_price_zar", entry.get("smp"))
            try:
                current_market_price_hint = float(current_market_price_hint or 0.0)
            except Exception:
                current_market_price_hint = 0.0

            stale_baseline_price = False
            if effective_da_smp is None and current_market_price_hint > 0:
                try:
                    existing_da_price = float(entry.get("da_price_zar") or 0.0)
                except Exception:
                    existing_da_price = 0.0
                stale_baseline_price = abs(existing_da_price - current_market_price_hint) > 1e-6

            settlement_backfill_required = bool(entry.pop("_settlement_backfill_required", False))
            needs_revenue_backfill = (
                entry.get("revenue_zar") is None
                or entry.get("da_revenue_zar") is None
                or entry.get("id_revenue_zar") is None
                or (abs(revenue_existing) < 1e-9 and abs(dispatched_hint) >= 1e-9)
                or settlement_backfill_required
                or stale_baseline_price
            )

            if needs_revenue_backfill:
                market_price = entry.get("market_price_zar", entry.get("smp"))
                try:
                    market_price = float(market_price or 0.0)
                except Exception:
                    market_price = 0.0

                da_price = effective_da_smp if effective_da_smp is not None else market_price
                id_price = market_price

                try:
                    da_mwh = float(entry.get("da_dispatched_mwh") or 0.0)
                    id_mwh = float(entry.get("id_dispatched_mwh") or 0.0)
                except Exception:
                    da_mwh = 0.0
                    id_mwh = 0.0

                if da_mwh == 0.0 and id_mwh == 0.0:
                    try:
                        fallback_total = float(entry.get("total_dispatched_mwh") or entry.get("dispatched_mw") or 0.0)
                    except Exception:
                        fallback_total = 0.0

                    if effective_da_smp is not None:
                        da_mwh = fallback_total
                        id_mwh = 0.0
                    else:
                        id_mwh = fallback_total
                        da_mwh = 0.0

                    entry["da_dispatched_mwh"] = entry.get("da_dispatched_mwh", round(da_mwh, 3))
                    entry["id_dispatched_mwh"] = entry.get("id_dispatched_mwh", round(id_mwh, 3))
                    entry["total_dispatched_mwh"] = entry.get("total_dispatched_mwh", round(da_mwh + id_mwh, 3))

                da_rev = sign * da_mwh * da_price
                id_rev = sign * id_mwh * id_price
                entry["da_price_zar"] = round(da_price, 2)
                entry["id_price_zar"] = round(id_price, 2)
                entry["da_revenue_zar"] = round(da_rev, 2)
                entry["id_revenue_zar"] = round(id_rev, 2)
                entry["revenue_zar"] = round(da_rev + id_rev, 2)
                variable_cost = _safe_market_number(entry.get("variable_cost_zar"))
                fixed_cost = _safe_market_number(entry.get("fixed_cost_zar"))
                imbalance_cost = _safe_market_number(entry.get("imbalance_cost_zar"))
                battery_charge_cost = _safe_market_number(entry.get("battery_charge_cost_zar"))
                congestion_revenue = _safe_market_number(entry.get("congestion_revenue_zar"))
                atc_cost = _safe_market_number(entry.get("network_shortfall_cost_zar"))
                if abs(atc_cost) < 1e-9:
                    atc_cost = _safe_market_number(entry.get("atc_dispatch_cost_zar"))
                if abs(atc_cost) < 1e-9:
                    atc_cost = _safe_market_number(entry.get("grid_constraint_cost_zar"))
                entry["profit_zar"] = round(
                    (da_rev + id_rev)
                    - variable_cost
                    - fixed_cost
                    - imbalance_cost
                    - battery_charge_cost
                    - atc_cost
                    + congestion_revenue,
                    2,
                )

            try:
                total_revenue += float(entry.get("revenue_zar") or 0.0)
            except Exception:
                pass

    if abs(float(kpis.get("revenue_zar") or 0.0)) < 1e-9 and abs(total_revenue) >= 1e-9:
        kpis["revenue_zar"] = total_revenue

    return _backfill_kpis_from_device_settlement(kpis)


def _filter_device_details_for_current_scope(details: Any, allowed_device_ids: set[str], device_hourly_breakdown: Any, current_round_num: int | None = None):
    if not isinstance(details, dict):
        return {}

    valid_hours_by_device = {}
    if isinstance(device_hourly_breakdown, dict):
        for device_id, rows in device_hourly_breakdown.items():
            hours = set()
            for row in rows or []:
                if not isinstance(row, dict):
                    continue
                hour_value = row.get("hour")
                try:
                    if hour_value is not None:
                        hours.add(int(hour_value))
                except Exception:
                    continue
            valid_hours_by_device[str(device_id)] = hours

    filtered = {}
    for section_key, section_value in details.items():
        if not isinstance(section_value, dict):
            filtered[section_key] = section_value
            continue

        section_filtered = {}
        for device_id, rows in section_value.items():
            device_id_str = str(device_id)
            if allowed_device_ids and device_id_str not in allowed_device_ids:
                continue
            if not isinstance(rows, list):
                section_filtered[device_id] = rows
                continue

            valid_hours = valid_hours_by_device.get(device_id_str, set())
            valid_hour_list = sorted(valid_hours)
            scoped_rows = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if not valid_hours:
                    scoped_rows.append(row)
                    continue

                explicit_hour = row.get("scenario_hour_idx", row.get("hour_idx", row.get("hour")))
                explicit_hour_value = None
                try:
                    if explicit_hour is not None:
                        explicit_hour_value = int(explicit_hour)
                except Exception:
                    explicit_hour_value = None

                if explicit_hour_value in valid_hours:
                    scoped_rows.append(row)
                    continue

                row_round_num = row.get("round_num")
                try:
                    row_round_num = int(row_round_num) if row_round_num is not None else None
                except Exception:
                    row_round_num = None

                if current_round_num is not None and row_round_num is not None and row_round_num != current_round_num:
                    continue

                row_offset = row.get("round_hour_offset", row.get("hour_offset", row.get("hour")))
                try:
                    row_offset = int(row_offset) if row_offset is not None else None
                except Exception:
                    row_offset = None

                if row_offset is not None and 0 <= row_offset < len(valid_hour_list):
                    normalized_hour = valid_hour_list[row_offset]
                    normalized_row = dict(row)
                    normalized_row["scenario_hour_idx"] = normalized_hour
                    normalized_row["hour_idx"] = normalized_hour
                    if "hour" in normalized_row:
                        normalized_row["hour"] = normalized_hour
                    scoped_rows.append(normalized_row)
                    continue

                if current_round_num is not None and row_round_num == current_round_num:
                    scoped_rows.append(row)

            if scoped_rows:
                section_filtered[device_id] = scoped_rows

        filtered[section_key] = section_filtered

    return filtered


def _detail_maps_equal(left: Any, right: Any) -> bool:
    try:
        return json.dumps(left or {}, sort_keys=True) == json.dumps(right or {}, sort_keys=True)
    except Exception:
        return False


def _get_player_type_cfg(config: dict, player_type_id):
    type_id = str(player_type_id or "").strip()
    if not type_id:
        return None

    for player_type in (config.get("player_types") or []):
        if isinstance(player_type, dict) and str(player_type.get("id") or "") == type_id:
            return player_type
    return None


def _get_player_devices_for_type(config: dict, player_type_id):
    player_type_cfg = _get_player_type_cfg(config, player_type_id)
    if not player_type_cfg:
        return []

    device_ids = {str(device_id) for device_id in (player_type_cfg.get("devices") or [])}
    return [
        device for device in (config.get("devices") or [])
        if isinstance(device, dict) and str(device.get("id") or "") in device_ids
    ]


def _device_capacity_mw(device: dict) -> float:
    for key in ["max_power_mw", "capacity_mw", "power_mw", "peak_load_mw", "baseline_load_mw", "capacity"]:
        value = device.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except Exception:
            return 0.0
    return 0.0


def _device_market_role(device: dict) -> str:
    dtype = str(device.get("type") or "").lower()
    category = str(device.get("category") or "").lower()
    if not category:
        if dtype in ["coal", "gas", "hydro", "nuclear", "solar", "wind", "pv"]:
            category = "generator"
        elif "load" in dtype:
            category = "load"
    if category in ["generator", "renewable"]:
        return "producer"
    if category == "load":
        return "consumer"
    return "unknown"


def _compute_challenge_capacity_scale(config: dict, mode: str, player_type_id, role: str) -> float:
    normalized_role = _normalize_market_role(role)
    if mode != "shared_market" or normalized_role not in {"producer", "consumer"}:
        return 1.0

    devices_cfg = [device for device in (config.get("devices") or []) if isinstance(device, dict)]
    player_devices = _get_player_devices_for_type(config, player_type_id)
    if not player_devices:
        return 1.0

    total_role_capacity = sum(
        _device_capacity_mw(device) for device in devices_cfg if _device_market_role(device) == normalized_role
    )
    player_capacity = sum(_device_capacity_mw(device) for device in player_devices)
    if total_role_capacity <= 0:
        return 1.0
    return max(0.0, min(1.0, player_capacity / total_role_capacity))


def _repair_challenge_result(config: dict, mode: str, player_type_id, role: str, round_num: int, current_kpis: dict, all_round_kpis: list[dict], stored_result):
    challenges = config.get("challenges") or []
    normalized_role = _normalize_market_role(role)
    if not challenges or normalized_role not in {"producer", "consumer"}:
        return stored_result

    if isinstance(stored_result, dict):
        stored_rows = stored_result.get("results")
        if isinstance(stored_rows, list) and stored_rows:
            return stored_result

    try:
        from .engine import evaluate_challenges
    except Exception:
        return stored_result

    round_kpis = list(all_round_kpis or [])
    if current_kpis:
        if round_kpis:
            round_kpis[-1] = current_kpis
        else:
            round_kpis = [current_kpis]

    return evaluate_challenges(
        challenges=challenges,
        player_kpis=current_kpis or {},
        role=normalized_role,
        round_num=round_num,
        all_round_kpis=round_kpis,
        capacity_scale=_compute_challenge_capacity_scale(config, mode, player_type_id, normalized_role),
        player_type_id=player_type_id,
    )


def _build_market_summary(total_volume_mwh, player_rows):
    real_producer_volume = 0.0
    real_consumer_volume = 0.0
    producer_ids = set()
    consumer_ids = set()

    for row in player_rows or []:
        if not isinstance(row, dict):
            continue
        role = _normalize_market_role(row.get("player_role"))
        dispatched_mwh = max(0.0, _safe_market_number(row.get("dispatched_mwh")))
        player_id = row.get("player_id")

        if role == "consumer":
            real_consumer_volume += dispatched_mwh
            if player_id is not None:
                consumer_ids.add(player_id)
        else:
            real_producer_volume += dispatched_mwh
            if player_id is not None:
                producer_ids.add(player_id)

    total_volume_mwh = max(
        0.0,
        _safe_market_number(total_volume_mwh),
        real_producer_volume,
        real_consumer_volume,
    )
    synthetic_producer_volume = max(0.0, total_volume_mwh - real_producer_volume)
    synthetic_consumer_volume = max(0.0, total_volume_mwh - real_consumer_volume)

    def pct(value):
        return round((value / total_volume_mwh * 100.0), 1) if total_volume_mwh > 0 else 0.0

    return {
        "total_volume_mwh": round(total_volume_mwh, 3),
        "real_players": {
            "count": len(producer_ids | consumer_ids),
            "producer_count": len(producer_ids),
            "consumer_count": len(consumer_ids),
            "producer_dispatched_mwh": round(real_producer_volume, 3),
            "consumer_dispatched_mwh": round(real_consumer_volume, 3),
            "producer_share_pct": pct(real_producer_volume),
            "consumer_share_pct": pct(real_consumer_volume),
        },
        "synthetic_market": {
            "producer_dispatched_mwh": round(synthetic_producer_volume, 3),
            "consumer_dispatched_mwh": round(synthetic_consumer_volume, 3),
            "producer_share_pct": pct(synthetic_producer_volume),
            "consumer_share_pct": pct(synthetic_consumer_volume),
        },
    }


def _infer_zone_from_player_type(config: dict, player_type_id):
    zones = max(1, int(((config.get("grid") or {}).get("zones", 1)) or 1)) if isinstance(config, dict) else 1
    try:
        legacy_zone = int(((config.get("general") or {}).get("player_zone", 1)) or 1) if isinstance(config, dict) else 1
    except Exception:
        legacy_zone = 1

    type_id = str(player_type_id or "").strip()
    if not type_id or not isinstance(config, dict):
        return max(1, min(zones, legacy_zone))

    for item in (config.get("player_types") or []):
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "") != type_id:
            continue
        try:
            zone = int(item.get("zone", legacy_zone) or legacy_zone)
        except Exception:
            zone = legacy_zone
        return max(1, min(zones, zone))

    return max(1, min(zones, legacy_zone))


def _extract_price_points(result_data):
    payload = result_data or {}
    price_points = []
    hourly_results = payload.get("hourly_results")
    if isinstance(hourly_results, list):
        for item in hourly_results:
            if not isinstance(item, dict):
                continue
            if "smp" not in item and "mcp" not in item:
                continue
            price_points.append(_safe_market_number(item.get("smp", item.get("mcp"))))

    if not price_points and ("smp" in payload or "mcp" in payload):
        price_points.append(_safe_market_number(payload.get("smp", payload.get("mcp"))))

    return price_points


def _build_price_stats(price_points):
    cleaned = []
    for value in price_points or []:
        try:
            num = float(value)
        except Exception:
            continue
        if num == num:
            cleaned.append(num)

    if not cleaned:
        return {
            "count": 0,
            "min_zar_per_mwh": 0.0,
            "max_zar_per_mwh": 0.0,
            "avg_zar_per_mwh": 0.0,
        }

    return {
        "count": len(cleaned),
        "min_zar_per_mwh": round(min(cleaned), 2),
        "max_zar_per_mwh": round(max(cleaned), 2),
        "avg_zar_per_mwh": round(sum(cleaned) / len(cleaned), 2),
    }


def _build_zone_breakdown(zone_entries, link_entries, player_rows):
    zone_map = {}

    def ensure_zone(zone_id):
        return zone_map.setdefault(zone_id, {
            "local_generation_mwh": 0.0,
            "local_demand_mwh": 0.0,
            "imports_mwh": 0.0,
            "exports_mwh": 0.0,
            "losses_mwh": 0.0,
            "unserved_demand_mwh": 0.0,
            "balancing_cost_zar": 0.0,
            "balancing_support_mwh": 0.0,
            "production_cost_zar": 0.0,
            "profit_zar": 0.0,
            "atc_dispatch_cost_zar": 0.0,
            "grid_curtailed_mwh": 0.0,
            "network_shortfall_mwh": 0.0,
            "player_ids": set(),
            "producer_ids": set(),
            "consumer_ids": set(),
            "binding_links": set(),
        })

    for zone_entry in zone_entries or []:
        if not isinstance(zone_entry, dict):
            continue
        try:
            zone_id = int(zone_entry.get("zone_id", 0) or 0)
        except Exception:
            zone_id = 0
        if zone_id <= 0:
            continue
        bucket = ensure_zone(zone_id)
        bucket["local_generation_mwh"] += _safe_market_number(zone_entry.get("local_generation_mwh"))
        bucket["local_demand_mwh"] += _safe_market_number(zone_entry.get("local_demand_mwh"))
        bucket["imports_mwh"] += _safe_market_number(zone_entry.get("imports_mwh"))
        bucket["exports_mwh"] += _safe_market_number(zone_entry.get("exports_mwh"))
        bucket["losses_mwh"] += _safe_market_number(zone_entry.get("losses_mwh"))
        bucket["unserved_demand_mwh"] += _safe_market_number(zone_entry.get("unserved_demand_mwh"))
        bucket["balancing_cost_zar"] += _safe_market_number(zone_entry.get("extra_cost_total_zar"))
        bucket["balancing_support_mwh"] += _safe_market_number(zone_entry.get("balancing_support_mwh"))

    for player_row in player_rows or []:
        if not isinstance(player_row, dict):
            continue
        try:
            zone_id = int(player_row.get("zone_id", 0) or 0)
        except Exception:
            zone_id = 0
        if zone_id <= 0:
            continue

        bucket = ensure_zone(zone_id)
        player_id = player_row.get("player_id")
        role = _normalize_market_role(player_row.get("player_role"))
        if player_id is not None:
            bucket["player_ids"].add(player_id)
            if role == "consumer":
                bucket["consumer_ids"].add(player_id)
            else:
                bucket["producer_ids"].add(player_id)

        if role == "producer":
            bucket["production_cost_zar"] += _safe_market_number(player_row.get("variable_cost_zar"))

        bucket["profit_zar"] += _safe_market_number(player_row.get("profit_zar"))
        bucket["atc_dispatch_cost_zar"] += _safe_market_number(
            player_row.get("atc_dispatch_cost_zar")
            if player_row.get("atc_dispatch_cost_zar") is not None
            else player_row.get("grid_constraint_cost_zar")
        )
        bucket["grid_curtailed_mwh"] += max(0.0, _safe_market_number(player_row.get("grid_curtailed_mwh")))
        bucket["network_shortfall_mwh"] += max(0.0, _safe_market_number(player_row.get("network_shortfall_mwh")))

    for link_entry in link_entries or []:
        if not isinstance(link_entry, dict) or not link_entry.get("binding"):
            continue
        try:
            from_zone = int(link_entry.get("from_zone", 0) or 0)
            to_zone = int(link_entry.get("to_zone", 0) or 0)
        except Exception:
            continue
        if from_zone <= 0 or to_zone <= 0:
            continue
        label = f"{from_zone}->{to_zone}"
        ensure_zone(from_zone)["binding_links"].add(label)
        ensure_zone(to_zone)["binding_links"].add(label)

    zone_breakdown = []
    for zone_id in sorted(zone_map.keys()):
        bucket = zone_map[zone_id]
        local_demand_mwh = bucket["local_demand_mwh"]
        consumer_count = len(bucket["consumer_ids"])
        balancing_cost_zar = bucket["balancing_cost_zar"]
        zone_breakdown.append({
            "zone_id": zone_id,
            "player_count": len(bucket["player_ids"]),
            "producer_count": len(bucket["producer_ids"]),
            "consumer_count": consumer_count,
            "production_cost_zar": round(bucket["production_cost_zar"], 2),
            "profit_zar": round(bucket["profit_zar"], 2),
            "atc_dispatch_cost_zar": round(bucket["atc_dispatch_cost_zar"], 2),
            "balancing_cost_zar": round(balancing_cost_zar, 2),
            "balancing_cost_per_kwh_zar": round((balancing_cost_zar / (local_demand_mwh * 1000.0)) if local_demand_mwh > 1e-9 else 0.0, 4),
            "balancing_cost_per_customer_zar": round((balancing_cost_zar / consumer_count) if consumer_count > 0 else 0.0, 2),
            "grid_curtailed_mwh": round(bucket["grid_curtailed_mwh"], 3),
            "unserved_demand_mwh": round(bucket["unserved_demand_mwh"], 3),
            "network_shortfall_mwh": round(bucket["network_shortfall_mwh"], 3),
            "balancing_support_mwh": round(bucket["balancing_support_mwh"], 3),
            "local_generation_mwh": round(bucket["local_generation_mwh"], 3),
            "local_demand_mwh": round(local_demand_mwh, 3),
            "imports_mwh": round(bucket["imports_mwh"], 3),
            "exports_mwh": round(bucket["exports_mwh"], 3),
            "losses_mwh": round(bucket["losses_mwh"], 3),
            "binding_link_count": len(bucket["binding_links"]),
            "binding_links": sorted(bucket["binding_links"]),
        })

    return zone_breakdown


def _enrich_market_summary(summary, price_points=None, zone_entries=None, link_entries=None, player_rows=None):
    enriched = dict(summary or {})
    enriched["price_stats"] = _build_price_stats(price_points or [])
    enriched["zone_breakdown"] = _build_zone_breakdown(zone_entries or [], link_entries or [], player_rows or [])
    return enriched


@ns.route("")
class Sessions(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(session_in, validate=True)
    def post(self):
        data = request.json
        # Guard: prevent starting a new session if this cohort already has an active one
        try:
            existing = (
                db.session.query(Session.id)
                .filter(
                    Session.cohort_id == int(data["cohort_id"]),
                    Session.status.in_([SessionStatus.created, SessionStatus.running, SessionStatus.paused]),
                )
                .first()
            )
            if existing:
                return {"error": "An active scenario for this cohort already exists."}, HTTPStatus.CONFLICT
        except Exception:
            pass
        s = Session(
            cohort_id=data["cohort_id"],
            scenario_id=data["scenario_id"],
            status=SessionStatus.running,
            started_at=datetime.utcnow(),
            mode=data.get("mode") or "shared_market",  # Default to shared_market for trainer sessions
        )
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_started", {"session_id": s.id})
        # start background round timer
        socketio.start_background_task(run_rounds, s.id, current_app._get_current_object())
        # Force navigate cohort players to briefing for shared_market (or if explicitly enabled)
        try:
            if (data.get("mode") or "shared_market") == "shared_market" or bool(data.get("force_navigate")):
                url = f"/briefing/{s.id}"
                key = f"cohort:{s.cohort_id}:force_nav"
                if _redis_client is not None:
                    _redis_client.setex(key, 300, url)
                # Inform trainer namespace for visibility
                emit_trainer("navigate", {"cohort_id": s.cohort_id, "url": url})
        except Exception:
            pass
        return {"id": s.id, "status": s.status.value}, HTTPStatus.CREATED


@ns.route("/active")
class ActiveSession(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self):
        from flask import request as _rq
        cid = _rq.args.get("cohort_id", type=int)
        if not cid:
            return {"error": "cohort_id required"}, HTTPStatus.BAD_REQUEST
        row = (
            db.session.query(Session)
            .filter(
                Session.cohort_id == cid,
                Session.status.in_(
                    [
                        SessionStatus.created,
                        SessionStatus.briefing,
                        SessionStatus.running,
                        SessionStatus.round_active,
                        SessionStatus.round_closing,
                        SessionStatus.calculating,
                        SessionStatus.round_results,
                        SessionStatus.paused,
                    ]
                ),
            )
            .order_by(Session.started_at.desc().nullslast(), Session.id.desc())
            .first()
        )
        if not row:
            return {"active": None}
        sc = Scenario.query.get(row.scenario_id) if row.scenario_id else None
        campaign = Campaign.query.get(sc.campaign_id) if sc and sc.campaign_id else None
        return {
            "active": {
                "id": row.id,
                "scenario_id": row.scenario_id,
                "scenario_name": sc.name if sc else None,
                "campaign_id": campaign.id if campaign else None,
                "campaign_name": campaign.name if campaign else None,
                "status": row.status.value if row.status else None,
                "mode": row.mode,
                "started_at": row.started_at.isoformat() + "Z" if row.started_at else None,
            }
        }


@ns.route("/<int:sid>")
class SessionItem(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get(s.scenario_id)
        campaign = Campaign.query.get(sc.campaign_id) if sc and sc.campaign_id else None
        config = (sc.config or {}) if sc else {}
        general = config.get("general", {})
        market = config.get("market", {})
        markets = config.get("markets", {})  # Per-round market availability
        return {
            "id": s.id,
            "status": s.status.value,
            "scenario_id": s.scenario_id,
            "current_round": s.current_round,
            "general": general,
            "market": market,
            "markets": markets,
            "player_input": config.get("player_input", {}),
            "mode": s.mode,
            "scenario_name": (sc.name if sc else None),
            "campaign_id": campaign.id if campaign else None,
            "campaign_name": campaign.name if campaign else None,
        }


participants_out = ns.model(
    "Participants",
    {
        "participants": fields.List(fields.Raw(description="{ user_id, email, name, status, selected_type, joined_at }")),
        "summary": fields.Raw(description="{ total, joined, pending, by_type }"),
    },
)


@ns.route("/<int:sid>/participants")
class SessionParticipants(Resource):
    @jwt_required()
    @ns.marshal_with(participants_out)
    def get(self, sid: int):
        """List participants for a session: joined (selected a type) and pending (cohort members without selection)."""
        s = Session.query.get_or_404(sid)
        # Get cohort members
        members = db.session.query(CohortMember.user_id, User.email).join(User, User.id == CohortMember.user_id).filter(CohortMember.cohort_id == s.cohort_id).all()
        member_ids = [uid for (uid, _) in members]
        # Get selected types
        sel = db.session.query(SessionPlayerType).filter_by(session_id=sid).all()
        selected_by_user = {row.user_id: row for row in sel}
        # Check for forecasts to determine "playing" status
        forecast_users = set(uid for (uid,) in db.session.query(Forecast.player_id).filter_by(session_id=sid).distinct().all())
        out = []
        by_type = {}
        joined = 0
        for uid, email in members:
            row = selected_by_user.get(uid)
            if row:
                # Determine status: playing if has forecasts, otherwise joined
                has_forecast = uid in forecast_users
                status = "playing" if has_forecast else "joined"
                joined += 1
                t = row.type_id
                by_type[t] = by_type.get(t, 0) + 1
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": email,
                    "status": status,
                    "selected_type": row.type_id,
                    "joined_at": getattr(row, 'created_at', None),
                })
            else:
                out.append({
                    "user_id": uid,
                    "email": email,
                    "name": email,
                    "status": "pending",
                })
        return {
            "participants": out,
            "summary": {"total": len(member_ids), "joined": joined, "pending": max(0, len(member_ids) - joined), "by_type": by_type},
        }


@ns.route("/<int:sid>/briefing")
class SessionBriefing(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get_or_404(s.scenario_id)
        cfg = sc.config or {}
        campaign = Campaign.query.get(sc.campaign_id) if sc.campaign_id else None
        briefing = {
            "name": sc.name,
            "description": cfg.get("general", {}).get("description", ""),
            "campaign_name": campaign.name if campaign else None,
            "campaign_id": campaign.id if campaign else None,
            "general": cfg.get("general", {}),
            "market": cfg.get("market", {}),      # Market parameters (base_price, etc.)
            "markets": cfg.get("markets", {}),    # Per-round availability (dam/idm arrays)
            "player_input": cfg.get("player_input", {}),
            "grid": cfg.get("grid", {}),
            "events": cfg.get("events", []),
            "objectives": cfg.get("objectives", ""),
            "roles": cfg.get("roles", []),
            "player_types": cfg.get("player_types", []),
            "devices": cfg.get("devices", []),
            "challenges": cfg.get("challenges", []),
        }
        # include allowed types + remaining capacities from Redis if available
        if True:
            key_allowed = f"session:{sid}:allowed_types"
            key_counts = f"session:{sid}:type_counts"
            # selected type for current user
            try:
                uid = get_jwt().get("sub")
            except Exception:
                uid = None
            key_sel = f"session:{sid}:selected:{uid}" if uid is not None else None
            # Prefer DB if available
            try:
                allowed_rows = SessionAllowedType.query.filter_by(session_id=sid).all()
                if allowed_rows:
                    # counts from DB
                    counts_db = (
                        db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
                        .filter(SessionPlayerType.session_id == sid)
                        .group_by(SessionPlayerType.type_id)
                        .all()
                    )
                    counts = {k: int(v) for k, v in counts_db}
                    allowed = []
                    for row in allowed_rows:
                        used = int(counts.get(row.type_id, 0))
                        remaining = (max(0, (row.max_players or 0) - used) if isinstance(row.max_players, int) else None)
                        allowed.append({"type_id": row.type_id, "max_players": row.max_players, "remaining": remaining})
                    briefing["allowed_player_types"] = allowed
                    if uid is not None:
                        sel = SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).first()
                        if sel:
                            briefing["selected_type"] = sel.type_id
                    current_app.logger.info(
                        "briefing allowed_types (session=%s user=%s rows=%s selected=%s)",
                        sid,
                        uid,
                        len(allowed_rows),
                        briefing.get("selected_type"),
                    )
                else:
                    raise RuntimeError("no DB rows")
            except Exception:
                if _redis_client:
                    allowed_raw = _redis_client.get(key_allowed)
                    counts_raw = _redis_client.get(key_counts)
                    selected = _redis_client.get(key_sel) if key_sel else None
                    try:
                        allowed = json.loads(allowed_raw or b"null") if allowed_raw is not None else None
                    except Exception:
                        allowed = None
                    try:
                        counts = json.loads(counts_raw or b"{}") if counts_raw is not None else {}
                    except Exception:
                        counts = {}
                    if allowed:
                        for item in allowed:
                            tid = item.get("type_id")
                            cap = item.get("max_players")
                            used = int(counts.get(tid, 0))
                            if isinstance(cap, int) and cap >= 0:
                                item["remaining"] = max(0, cap - used)
                            else:
                                item["remaining"] = None
                        briefing["allowed_player_types"] = allowed
                    if selected:
                        val = selected.decode() if isinstance(selected, (bytes, bytearray)) else str(selected)
                        briefing["selected_type"] = val
                    current_app.logger.info(
                        "briefing allowed_types(redis) session=%s user=%s cached=%s selected=%s",
                        sid,
                        uid,
                        len(briefing.get("allowed_player_types", []) or []),
                        briefing.get("selected_type"),
                    )
        # Log first-time session join for current user (idempotent)
        try:
            uid = get_jwt().get("sub")
            if uid:
                exists = (
                    ActivityLog.query.filter_by(user_id=int(uid), session_id=sid, action_type="session_join").first()
                )
                if not exists:
                    log_activity(int(uid), "session_join", session_id=sid, cohort_id=s.cohort_id)
        except Exception:
            pass
        return briefing


@ns.route("/<int:sid>/status")
class SessionStatusMatrix(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get_or_404(s.scenario_id)
        general = (sc.config or {}).get("general", {})
        rounds = int(general.get("rounds", 4))
        # players in cohort
        from .models import CohortMember, User, Forecast
        players = (
            db.session.query(User.id, User.email)
            .join(CohortMember, CohortMember.user_id == User.id)
            .filter(CohortMember.cohort_id == s.cohort_id)
            .all()
        )
        # map selected types per player (if any)
        sel_rows = db.session.query(SessionPlayerType.user_id, SessionPlayerType.type_id).filter_by(session_id=sid).all()
        sel_map = {uid: tid for (uid, tid) in sel_rows}
        out_players = []
        for pid, email in players:
            status = []
            for r in range(1, rounds + 1):
                exists = db.session.query(Forecast.id).filter_by(session_id=sid, player_id=pid, round_num=r).first() is not None
                status.append({"round": r, "submitted": bool(exists)})
            out_players.append({"player_id": pid, "email": email, "type": sel_map.get(pid), "status": status})
        return {"rounds": rounds, "players": out_players}


    @ns.route("/<int:sid>/replay")
    class SessionReplay(Resource):
        @jwt_required()
        def get(self, sid: int):
            s = Session.query.get_or_404(sid)
            sc = Scenario.query.get_or_404(s.scenario_id)
            # collect per-round results
            from .models import Result
            rows = (
                db.session.query(Result)
                .filter(Result.session_id == sid)
                .order_by(Result.round_num.asc(), Result.player_id.asc())
                .all()
            )
            rounds_map = {}
            for r in rows:
                rm = rounds_map.setdefault(r.round_num, {"round": r.round_num, "smp": None, "volume": None, "players": []})
                rm["smp"] = rm["smp"] or (r.data or {}).get("smp")
                rm["volume"] = rm["volume"] or (r.data or {}).get("volume")
                rm["players"].append({"player_id": r.player_id, "kpis": (r.data or {}).get("kpis", {})})
            out = [rounds_map[k] for k in sorted(rounds_map.keys())]
            return {"session": {"id": s.id, "scenario": sc.name, "general": (sc.config or {}).get("general", {})}, "rounds": out}


@ns.route("/<int:sid>/pause")
class Pause(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.paused
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_paused", {"session_id": s.id})
        socketio.emit("session_paused", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
        return {"status": s.status.value}


@ns.route("/<int:sid>/resume")
class Resume(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.running
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_resumed", {"session_id": s.id})
        socketio.emit("session_resumed", {"session_id": s.id}, namespace="/game", to=f"session-{s.id}")
        return {"status": s.status.value}


@ns.route("/<int:sid>/end")
class End(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def patch(self, sid: int):
        s = Session.query.get_or_404(sid)
        s.status = SessionStatus.ended
        db.session.add(s)
        db.session.commit()
        emit_trainer("session_ended", {"session_id": s.id})
        return {"status": s.status.value}


@ns.route("/<int:sid>/force-round-end")
class ForceRoundEnd(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        s = Session.query.get_or_404(sid)
        if s.status not in [SessionStatus.running, SessionStatus.round_active, SessionStatus.paused]:
            return {"error": "Round can only be ended early while active."}, HTTPStatus.BAD_REQUEST

        forced_via = "redis"
        if _redis_client is not None:
            try:
                _redis_client.setex(f"session:{sid}:force_end_round", 120, "1")
            except Exception:
                forced_via = "status_fallback"
        else:
            forced_via = "status_fallback"

        if forced_via == "status_fallback":
            # Fallback path when Redis signal is unavailable:
            # mark session as round_closing so scheduler exits countdown and proceeds.
            s.status = SessionStatus.round_closing
            db.session.add(s)
            db.session.commit()

        emit_trainer("round_end", {"session_id": sid, "forced": True})
        socketio.emit("round_end", {"session_id": sid, "forced": True}, namespace="/game", to=f"session-{sid}")
        return {"status": "ok", "forced": True, "via": forced_via}


@ns.route("/<int:sid>/extend-timer")
class ExtendTimer(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        s = Session.query.get_or_404(sid)

        if s.status not in [SessionStatus.running, SessionStatus.round_active, SessionStatus.paused]:
            return {"error": "Timer can only be extended during an active round."}, HTTPStatus.BAD_REQUEST

        body = request.json or {}
        try:
            seconds = int(body.get("seconds", 60))
        except Exception:
            seconds = 60

        seconds = max(1, min(3600, seconds))

        if _redis_client is None:
            return {"error": "Timer extension unavailable (Redis not configured)."}, HTTPStatus.SERVICE_UNAVAILABLE

        key = f"session:{sid}:timer_extend_sec"
        try:
            _redis_client.incrby(key, seconds)
            _redis_client.expire(key, 7200)
        except Exception:
            return {"error": "Failed to extend timer."}, HTTPStatus.INTERNAL_SERVER_ERROR

        emit_trainer("timer_extended", {"session_id": sid, "seconds": seconds})
        socketio.emit("timer_extended", {"session_id": sid, "seconds": seconds}, namespace="/game", to=f"session-{sid}")
        return {"status": "ok", "extended_by_seconds": seconds}


@ns.route("/<int:sid>/freeze")
class FreezeSession(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        """Lock/freeze editing for all players in shared mode."""
        s = Session.query.get_or_404(sid)
        body = request.json or {}
        frozen = bool(body.get("frozen", True))
        s.frozen = frozen
        db.session.add(s)
        db.session.commit()
        socketio.emit("session_frozen", {"session_id": sid, "frozen": frozen}, namespace="/game", to=f"session-{sid}")
        emit_trainer("session_frozen", {"session_id": sid, "frozen": frozen})
        return {"status": "ok", "frozen": frozen}


@ns.route("/<int:sid>/round-results/<int:round_num>")
class RoundResults(Resource):
    @jwt_required()
    def get(self, sid: int, round_num: int):
        """Get individual KPIs and ranking for a specific round."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get all results for this round
        results = Result.query.filter_by(session_id=sid, round_num=round_num).all()
        if not results:
            return {"error": "No results found for this round"}, HTTPStatus.NOT_FOUND
        
        # IMPORTANT: Round results must only reflect data from the requested round.
        # Do not inject DAM data from other rounds (e.g. round 1) into this payload,
        # otherwise KPI cards and detailed hourly tables use different data scopes.
        
        # Get session config for scoring weights
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        weights = config.get("scoring", {}).get("weights", {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1})
        idm_trading_enabled = round_num > 1 and _get_market_status_for_round(config, "idm", round_num) != "off"
        
        # Get DA baseline forecasts for DA/ID breakdown
        from .models import Forecast
        da_baselines = Forecast.query.filter_by(session_id=sid, is_da_baseline=True).all()
        da_baseline_by_player = {}  # player_id -> combined hourly data
        for f in da_baselines:
            pid = f.player_id
            da_hours_range = f.data.get("da_baseline_hours", {})
            da_start = da_hours_range.get("start", 0)
            da_end = da_hours_range.get("end", len(f.data.get("hours", [])))
            
            if pid not in da_baseline_by_player:
                da_baseline_by_player[pid] = {}
            
            # Store baseline hours
            hours = f.data.get("hours", [])
            if "aggregate" not in da_baseline_by_player[pid]:
                da_baseline_by_player[pid]["aggregate"] = [0.0] * max(len(hours), 72)
            
            for h in range(da_start, min(da_end, len(hours))):
                if h < len(da_baseline_by_player[pid]["aggregate"]):
                    da_baseline_by_player[pid]["aggregate"][h] = hours[h]
        
        # Get current (final) forecasts for comparison
        current_forecasts = Forecast.query.filter_by(session_id=sid, round_num=round_num).all()
        current_by_player = {}
        for f in current_forecasts:
            current_by_player[f.player_id] = f.data.get("hours", [])
        
        # Get active events for this round (use select_events_for_round logic)
        from .engine import select_events_for_round
        events = config.get("events", [])
        active_round_events = select_events_for_round(events, round_num)
        
        active_events = []
        for evt in active_round_events:
            active_events.append({
                "name": evt.get("name", "Event"),
                "description": evt.get("description", ""),
                "type": evt.get("type", "systemic"),
                "multiplier": evt.get("multiplier", 1.0),
                "additive": evt.get("additive", 0),
                "target": evt.get("target", "all"),
                "target_id": evt.get("target_id", "")
            })

        # Calculate total score for each player (normalized to 0-100)
        ranking = []
        my_result = None
        
        for r in results:
            # Resolve player type early so downstream KPI backfills can scope to the
            # player's configured device set.
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{r.player_id}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=r.player_id).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass

            kpis = canonicalize_kpis(r.data.get("kpis", {}))
            player_device_ids = set()
            device_settlement_summary = None

            # Backfill legacy KPI/device-hour settlement fields from available per-device balancing + prices.
            # Older stored results may contain dispatched quantities and prices but miss explicit revenue fields,
            # causing KPI revenue=0 while detail views compute non-zero values.
            try:
                cfg_devices = (config.get("devices") or []) if isinstance(config, dict) else []
                device_type_by_id = {str(d.get("id")): str(d.get("type", "")).lower() for d in cfg_devices if isinstance(d, dict) and d.get("id")}

                cfg_player_types = (config.get("player_types") or []) if isinstance(config, dict) else []
                if player_type:
                    pt_cfg = next((pt for pt in cfg_player_types if isinstance(pt, dict) and pt.get("id") == player_type), None)
                    if pt_cfg and isinstance(pt_cfg.get("devices"), list):
                        player_device_ids.update({str(x) for x in pt_cfg.get("devices") if x})
                if not player_device_ids and isinstance(kpis.get("device_hourly_breakdown"), dict):
                    player_device_ids.update({str(x) for x in kpis.get("device_hourly_breakdown", {}).keys()})

                raw_details = (r.data or {}).get("device_hourly_details") or {}
                balancing_by_dev = (raw_details.get("balancing") or {}) if isinstance(raw_details, dict) else {}
                balancing_map = {}
                if isinstance(balancing_by_dev, dict):
                    for dev_id, rows in balancing_by_dev.items():
                        if not isinstance(rows, list):
                            continue
                        by_hour = {}
                        for row in rows:
                            if not isinstance(row, dict):
                                continue
                            h = row.get("hour_idx")
                            if h is None:
                                continue
                            by_hour[h] = row
                        balancing_map[str(dev_id)] = by_hour

                da_smp = (r.data or {}).get("da_baseline_metadata", {}).get("da_smp")
                da_smp = float(da_smp) if isinstance(da_smp, (int, float)) else None
                use_da_baseline_settlement = bool(idm_trading_enabled)

                # If older results don't include device_hourly_breakdown at all, reconstruct a minimal one
                # from available device_hourly_details (balancing + co2). This keeps frontend tables and
                # KPI totals consistent without requiring a full recompute.
                device_hourly_breakdown = kpis.get("device_hourly_breakdown") if isinstance(kpis.get("device_hourly_breakdown"), dict) else {}
                if not device_hourly_breakdown:
                    co2_by_dev = (raw_details.get("co2") or {}) if isinstance(raw_details, dict) else {}
                    co2_map = {}
                    if isinstance(co2_by_dev, dict):
                        for dev_id, rows in co2_by_dev.items():
                            if not isinstance(rows, list):
                                continue
                            by_hour = {}
                            for row in rows:
                                if not isinstance(row, dict):
                                    continue
                                h = row.get("hour_idx")
                                if h is None:
                                    continue
                                val = row.get("co2_kg")
                                if val is None:
                                    val = row.get("emissions_kg")
                                by_hour[h] = val
                            co2_map[str(dev_id)] = by_hour

                    hours = []
                    hourly_breakdown = kpis.get("hourly_breakdown")
                    if isinstance(hourly_breakdown, list) and hourly_breakdown:
                        for row in hourly_breakdown:
                            if not isinstance(row, dict):
                                continue
                            h = row.get("hour")
                            if h is None:
                                continue
                            hours.append(h)

                    if not hours:
                        hour_set = set()
                        for dev_id, by_hour in balancing_map.items():
                            if player_device_ids and str(dev_id) not in player_device_ids:
                                continue
                            if isinstance(by_hour, dict):
                                hour_set.update(by_hour.keys())
                        try:
                            hours = sorted({int(h) for h in hour_set if h is not None})
                        except Exception:
                            hours = sorted([h for h in hour_set if h is not None])

                    if player_device_ids:
                        candidate_device_ids = sorted(player_device_ids)
                    elif balancing_map:
                        candidate_device_ids = sorted(balancing_map.keys())
                    else:
                        candidate_device_ids = sorted(device_type_by_id.keys())

                    rebuilt = {}
                    for dev_id in candidate_device_ids:
                        dev_id_s = str(dev_id)
                        bal_by_hour = balancing_map.get(dev_id_s, {})
                        co2_by_hour = co2_map.get(dev_id_s, {})
                        rows = []
                        for h in hours:
                            bal = bal_by_hour.get(h, {}) if isinstance(bal_by_hour, dict) else {}
                            try:
                                da_mwh = float(bal.get("da_dispatched_mwh") or 0.0)
                            except Exception:
                                da_mwh = 0.0
                            try:
                                id_mwh = float(bal.get("id_dispatched_mwh") or 0.0)
                            except Exception:
                                id_mwh = 0.0
                            try:
                                total_mwh = float(bal.get("total_dispatched_mwh") or (da_mwh + id_mwh))
                            except Exception:
                                total_mwh = da_mwh + id_mwh
                            planned_mw = bal.get("planned_mw")
                            if planned_mw is None:
                                planned_mw = bal.get("planned_mwh")

                            rows.append({
                                "hour": h,
                                "planned_mw": planned_mw,
                                "da_dispatched_mwh": da_mwh,
                                "id_dispatched_mwh": id_mwh,
                                "total_dispatched_mwh": total_mwh,
                                "co2_kg": co2_by_hour.get(h, 0.0),
                            })

                        if rows:
                            rebuilt[dev_id_s] = rows

                    if rebuilt:
                        kpis["device_hourly_breakdown"] = rebuilt
                        device_hourly_breakdown = rebuilt
                if device_hourly_breakdown:
                    _reconcile_device_hourly_breakdown_with_balancing(device_hourly_breakdown, balancing_map)
                    battery_summary = _summarize_battery_player_kpis(device_hourly_breakdown, cfg_devices)
                    if battery_summary["soc_start_pct"] is not None:
                        kpis["battery_charged_mwh"] = round(battery_summary["charged_mwh"], 3)
                        kpis["battery_discharged_mwh"] = round(battery_summary["discharged_mwh"], 3)
                        kpis["battery_charge_cost_zar"] = round(battery_summary["charge_cost_zar"], 2)
                        kpis["battery_arbitrage_revenue_zar"] = round(battery_summary["arbitrage_revenue_zar"], 0)
                        kpis["battery_soc_start_pct"] = battery_summary["soc_start_pct"]
                        kpis["battery_soc_end_pct"] = battery_summary["soc_end_pct"]

                    total_revenue = 0.0
                    for dev_id, rows in device_hourly_breakdown.items():
                        dev_id_s = str(dev_id)
                        if player_device_ids and dev_id_s not in player_device_ids:
                            continue
                        if not isinstance(rows, list):
                            continue

                        is_load = "load" in device_type_by_id.get(dev_id_s, "")
                        sign = -1.0 if is_load else 1.0
                        bal_by_hour = balancing_map.get(dev_id_s, {})

                        for entry in rows:
                            if not isinstance(entry, dict):
                                continue
                            hour_idx = entry.get("hour")
                            bal = bal_by_hour.get(hour_idx) if hour_idx is not None else None

                            # Fill DA/ID dispatched from balancing when missing
                            if bal and entry.get("da_dispatched_mwh") is None:
                                entry["da_dispatched_mwh"] = bal.get("da_dispatched_mwh", 0.0)
                            if bal and entry.get("id_dispatched_mwh") is None:
                                entry["id_dispatched_mwh"] = bal.get("id_dispatched_mwh", 0.0)
                            if bal and entry.get("total_dispatched_mwh") is None:
                                entry["total_dispatched_mwh"] = bal.get("total_dispatched_mwh", 0.0)

                            # Compute/recompute settlement values when missing OR suspiciously zero despite dispatched volume.
                            # Legacy rows may carry revenue_zar=0 with missing DA/ID split fields while dispatched_mw is populated.
                            dispatched_hint = entry.get("total_dispatched_mwh")
                            if dispatched_hint is None:
                                dispatched_hint = entry.get("dispatched_mw")
                            try:
                                dispatched_hint = float(dispatched_hint or 0.0)
                            except Exception:
                                dispatched_hint = 0.0

                            try:
                                revenue_existing = float(entry.get("revenue_zar") or 0.0)
                            except Exception:
                                revenue_existing = 0.0

                            current_market_price_hint = entry.get("market_price_zar", entry.get("smp"))
                            try:
                                current_market_price_hint = float(current_market_price_hint or 0.0)
                            except Exception:
                                current_market_price_hint = 0.0

                            stale_baseline_price = False
                            if (not use_da_baseline_settlement) and current_market_price_hint > 0:
                                try:
                                    existing_da_price = float(entry.get("da_price_zar") or 0.0)
                                except Exception:
                                    existing_da_price = 0.0
                                stale_baseline_price = abs(existing_da_price - current_market_price_hint) > 1e-6

                            settlement_backfill_required = bool(entry.pop("_settlement_backfill_required", False))
                            needs_revenue_backfill = (
                                entry.get("revenue_zar") is None
                                or entry.get("da_revenue_zar") is None
                                or entry.get("id_revenue_zar") is None
                                or (abs(revenue_existing) < 1e-9 and abs(dispatched_hint) >= 1e-9)
                                or settlement_backfill_required
                                or stale_baseline_price
                            )

                            if needs_revenue_backfill:
                                market_price = entry.get("market_price_zar", entry.get("smp"))
                                try:
                                    market_price = float(market_price or 0.0)
                                except Exception:
                                    market_price = 0.0

                                da_price = da_smp if use_da_baseline_settlement and da_smp is not None else market_price
                                id_price = market_price

                                try:
                                    da_mwh = float(entry.get("da_dispatched_mwh") or 0.0)
                                    id_mwh = float(entry.get("id_dispatched_mwh") or 0.0)
                                except Exception:
                                    da_mwh = 0.0
                                    id_mwh = 0.0

                                # Fallback for legacy rows without DA/ID split
                                if da_mwh == 0.0 and id_mwh == 0.0:
                                    try:
                                        fallback_total = float(entry.get("total_dispatched_mwh") or entry.get("dispatched_mw") or 0.0)
                                    except Exception:
                                        fallback_total = 0.0

                                    # Prefer DA assignment when DA reference price exists;
                                    # otherwise treat as ID quantity.
                                    if use_da_baseline_settlement and da_smp is not None:
                                        da_mwh = fallback_total
                                        id_mwh = 0.0
                                    else:
                                        id_mwh = fallback_total
                                        da_mwh = 0.0

                                    entry["da_dispatched_mwh"] = entry.get("da_dispatched_mwh", round(da_mwh, 3))
                                    entry["id_dispatched_mwh"] = entry.get("id_dispatched_mwh", round(id_mwh, 3))
                                    entry["total_dispatched_mwh"] = entry.get("total_dispatched_mwh", round(da_mwh + id_mwh, 3))

                                da_rev = sign * da_mwh * da_price
                                id_rev = sign * id_mwh * id_price
                                entry["da_price_zar"] = round(da_price, 2)
                                entry["id_price_zar"] = round(id_price, 2)
                                entry["da_revenue_zar"] = round(da_rev, 2)
                                entry["id_revenue_zar"] = round(id_rev, 2)
                                entry["revenue_zar"] = round(da_rev + id_rev, 2)
                                variable_cost = _safe_market_number(entry.get("variable_cost_zar"))
                                fixed_cost = _safe_market_number(entry.get("fixed_cost_zar"))
                                imbalance_cost = _safe_market_number(entry.get("imbalance_cost_zar"))
                                battery_charge_cost = _safe_market_number(entry.get("battery_charge_cost_zar"))
                                congestion_revenue = _safe_market_number(entry.get("congestion_revenue_zar"))
                                atc_cost = _safe_market_number(entry.get("network_shortfall_cost_zar"))
                                if abs(atc_cost) < 1e-9:
                                    atc_cost = _safe_market_number(entry.get("atc_dispatch_cost_zar"))
                                if abs(atc_cost) < 1e-9:
                                    atc_cost = _safe_market_number(entry.get("grid_constraint_cost_zar"))
                                entry["profit_zar"] = round(
                                    (da_rev + id_rev)
                                    - variable_cost
                                    - fixed_cost
                                    - imbalance_cost
                                    - battery_charge_cost
                                    - atc_cost
                                    + congestion_revenue,
                                    2,
                                )

                            try:
                                total_revenue += float(entry.get("revenue_zar") or 0.0)
                            except Exception:
                                pass

                    # Backfill top-level revenue KPI if it looks missing
                    if abs(float(kpis.get("revenue_zar") or 0.0)) < 1e-9 and abs(total_revenue) >= 1e-9:
                        kpis["revenue_zar"] = total_revenue

                    _backfill_kpis_from_device_settlement(kpis)
            except Exception:
                # Never fail the endpoint due to best-effort backfill
                pass
            profit = float(kpis.get("profit_zar", 0) or kpis.get("profit", 0))
            resolved_role = _resolve_market_role(config, player_type, r.data.get("player_role"), kpis.get("revenue_zar", 0))
            # Use MWh quantities for scoring (not costs), with fallback to cost/cost-based values for old sessions
            _imb = kpis.get("imbalance_mwh")
            imbalance = float(_imb) if _imb is not None else float(kpis.get("imbalance_cost_zar", 0) / 1000 or kpis.get("imbalance", 0))
            _curt = kpis.get("curtailment_mwh")
            curtailment = float(_curt) if _curt is not None else float(kpis.get("curtailment_cost_zar", 0) / 1000 or kpis.get("curtailment", 0))
            
            # Total score (weighted sum, imbalance/curtailment are penalties so negative)
            raw_score = (
                profit * weights.get("profit", 0.6) -
                abs(imbalance) * weights.get("imbalance", 0.3) * 1000 -  # Convert MWh penalty to ZAR scale
                abs(curtailment) * weights.get("curtailment", 0.1) * 1000  # Convert MWh penalty to ZAR scale
            )
            # Normalize to 0-100 scale (typical profit range: -5M to +5M ZAR)
            # Map -5M → 0, 0 → 50, +5M → 100
            total_score = max(0, min(100, (raw_score + 5000000) / 100000))
            
            # Get player info
            user = User.query.get(r.player_id)
            player_email = user.email if user else f"Player {r.player_id}"
            
            # Get player type
            # player_type already resolved above
            
            raw_bid_dispatch = r.data.get("bid_dispatch")
            if raw_bid_dispatch is None:
                # Legacy fallback only when no explicit DAM dispatch is present
                raw_bid_dispatch = {} if r.data.get("dam_bid_dispatch") is not None else (r.bid_dispatch or {})

            raw_device_hourly_details = r.data.get("device_hourly_details", r.data.get("dam_device_hourly_details", {}))
            raw_dam_device_hourly_details = r.data.get("dam_device_hourly_details", {})
            raw_idm_device_hourly_details = r.data.get("idm_device_hourly_details", raw_device_hourly_details)
            current_device_hourly_breakdown = kpis.get("device_hourly_breakdown") if isinstance(kpis.get("device_hourly_breakdown"), dict) else {}
            scoped_device_hourly_details = _filter_device_details_for_current_scope(
                raw_device_hourly_details,
                player_device_ids,
                current_device_hourly_breakdown,
                r.round_num,
            )
            scoped_dam_device_hourly_details = _filter_device_details_for_current_scope(
                raw_dam_device_hourly_details,
                player_device_ids,
                current_device_hourly_breakdown,
                r.round_num,
            )
            scoped_idm_device_hourly_details = _filter_device_details_for_current_scope(
                raw_idm_device_hourly_details,
                player_device_ids,
                current_device_hourly_breakdown,
                r.round_num,
            )
            if r.round_num > 1 and (scoped_device_hourly_details or raw_idm_device_hourly_details):
                scoped_dam_device_hourly_details = {}
            if scoped_device_hourly_details:
                scoped_idm_device_hourly_details = {}
            elif _detail_maps_equal(scoped_idm_device_hourly_details, scoped_device_hourly_details):
                scoped_idm_device_hourly_details = {}

            player_round_results = (
                Result.query
                .filter_by(session_id=sid, player_id=r.player_id)
                .filter(Result.round_num <= round_num)
                .order_by(Result.round_num)
                .all()
            )
            all_round_kpis = [((row.data or {}).get("kpis") or {}) for row in player_round_results if row.data]
            challenge_result = _repair_challenge_result(
                config,
                session.mode,
                player_type,
                resolved_role,
                r.round_num,
                kpis,
                all_round_kpis,
                r.data.get("challenge_result"),
            )

            player_hourly_results = r.data.get("hourly_results", [])
            player_idm_hourly_results = r.data.get("idm_hourly_results", r.data.get("hourly_results", []))
            if not idm_trading_enabled:
                player_hourly_results = _strip_intraday_hourly_metadata(player_hourly_results)
                player_idm_hourly_results = []

            player_data = {
                "player_id": r.player_id,
                "email": player_email,
                "type": player_type,
                "kpis": kpis,
                "profit": profit,
                "variable_cost": float(kpis.get("variable_cost_zar", 0)),
                "imbalance": imbalance,
                "curtailment": curtailment,
                "total_score": round(total_score, 2),
                "smp": r.data.get("smp", r.data.get("mcp")),
                "volume": r.data.get("volume"),
                "bid_dispatch": raw_bid_dispatch,
                "dam_bid_dispatch": r.data.get("dam_bid_dispatch", {}),
                "idm_bid_dispatch": r.data.get("idm_bid_dispatch", raw_bid_dispatch),
                "hourly_results": player_hourly_results,
                "dam_hourly_results": r.data.get("dam_hourly_results", []),
                "idm_hourly_results": player_idm_hourly_results,
                "hourly_breakdown": kpis.get("hourly_breakdown", []),  # Include detailed hourly breakdown
                "device_hourly_breakdown": kpis.get("device_hourly_breakdown", {}),  # Per-device hourly breakdown
                "device_hourly_details": scoped_device_hourly_details,  # NEW: Device-level CO2/balancing
                "dam_device_hourly_details": scoped_dam_device_hourly_details,
                "idm_device_hourly_details": scoped_idm_device_hourly_details,
                "challenge_result": challenge_result,
                "player_role": resolved_role,
                "no_clearing": bool(r.data.get("no_clearing", False)),
                "no_clearing_reason": r.data.get("reason"),
                "zone_results": r.data.get("zone_results", []),
                "link_results": r.data.get("link_results", []),
                "player_zone_info": (r.data.get("player_zone_info_by_player", {}) or {}).get(r.player_id) or (r.data.get("player_zone_info_by_player", {}) or {}).get(str(r.player_id)) or {},
                "balancing_settings": {
                    "up_price_zar_per_mwh": float((config.get("balancing") or {}).get("up_price_zar_per_mwh", 1200.0) or 1200.0),
                    "down_price_zar_per_mwh": float((config.get("balancing") or {}).get("down_price_zar_per_mwh", 800.0) or 800.0),
                }
            }
            if idm_trading_enabled:
                player_data["idp"] = r.data.get("idp")
                player_data["id_volume_mwh"] = r.data.get("id_volume_mwh", 0)
                player_data["id_trade_count"] = r.data.get("id_trade_count", 0)
            
            # Calculate DA/ID breakdown for this player
            da_hours = da_baseline_by_player.get(r.player_id, {}).get("aggregate", [])
            current_hours = current_by_player.get(r.player_id, [])
            base_mcp = float(r.data.get("smp", r.data.get("mcp", 0)) or 450)
            
            # Price differentiation: DA trades at stable price, ID at premium/discount
            # id_price_spread_percent: positive = ID more expensive (buying penalty), negative = ID discount
            id_price_spread = config.get("id_price_spread_percent", 0)  # Default: same price
            da_price = base_mcp  # DA market clears at SMP
            id_price = base_mcp * (1 + id_price_spread / 100)  # ID market has spread
            
            # Sum volumes WITH sign: positive = producer (sells), negative = consumer (buys)
            da_volume_signed = sum(v for v in da_hours if isinstance(v, (int, float)))
            current_volume_signed = sum(v for v in current_hours if isinstance(v, (int, float)))
            id_delta_signed = current_volume_signed - da_volume_signed
            
            # Absolute volumes for display
            da_volume_abs = sum(abs(v) for v in da_hours if isinstance(v, (int, float)))
            current_volume_abs = sum(abs(v) for v in current_hours if isinstance(v, (int, float)))
            
            # Determine player type: producer (positive) or consumer (negative)
            is_consumer = current_volume_signed < 0
            
            # Revenue attribution with separate prices
            # Prefer engine settlement metadata so KPI and DA/ID breakdown share the same basis.
            # Fallback to forecast-based approximation for legacy rows.
            da_meta_players = (r.data or {}).get("da_baseline_metadata", {}).get("players", {})
            da_meta = da_meta_players.get(r.player_id) or da_meta_players.get(str(r.player_id)) or {}

            if da_meta:
                da_volume_signed = float(da_meta.get("da_volume_mwh", da_volume_signed) or 0.0)
                id_delta_signed = float(da_meta.get("id_delta_mwh", id_delta_signed) or 0.0)
                current_volume_signed = da_volume_signed + id_delta_signed
                da_volume_abs = abs(da_volume_signed)
                current_volume_abs = abs(current_volume_signed)
                da_revenue = float(da_meta.get("da_revenue_zar", 0.0) or 0.0)
                id_revenue = float(da_meta.get("id_revenue_zar", 0.0) or 0.0)

                if device_settlement_summary:
                    repaired_total_revenue = float(device_settlement_summary.get("revenue_zar", 0.0) or 0.0)
                    meta_total_revenue = da_revenue + id_revenue
                    if abs(meta_total_revenue - repaired_total_revenue) >= 0.5:
                        volume_sign = -1.0 if resolved_role == "consumer" else 1.0
                        da_volume_signed = volume_sign * float(device_settlement_summary.get("da_volume_mwh", abs(da_volume_signed)) or 0.0)
                        id_delta_signed = volume_sign * float(device_settlement_summary.get("id_delta_mwh", abs(id_delta_signed)) or 0.0)
                        current_volume_signed = da_volume_signed + id_delta_signed
                        da_volume_abs = abs(da_volume_signed)
                        current_volume_abs = abs(current_volume_signed)
                        da_revenue = float(device_settlement_summary.get("da_revenue_zar", da_revenue) or 0.0)
                        id_revenue = float(device_settlement_summary.get("id_revenue_zar", id_revenue) or 0.0)
            else:
                # Producer: positive volume = positive revenue (sells electricity)
                # Consumer: negative volume = negative revenue (pays for electricity)
                da_revenue = da_volume_signed * da_price
                id_revenue = id_delta_signed * id_price  # ID delta valued at ID price
            
            # Hourly breakdown per day (for detailed view)
            hourly_detail = []
            daily_summary = {}
            max_hours = max(len(da_hours), len(current_hours))
            for h in range(max_hours):
                da_val = da_hours[h] if h < len(da_hours) else 0
                current_val = current_hours[h] if h < len(current_hours) else 0
                delta = current_val - da_val
                day = h // 24 + 1  # Day 1, 2, 3...
                
                hourly_detail.append({
                    "hour": h,
                    "day": day,
                    "hour_of_day": h % 24,
                    "da_mwh": round(da_val, 2),
                    "id_mwh": round(current_val, 2),
                    "delta_mwh": round(delta, 2),
                    "is_da_locked": da_val != 0  # DA was committed for this hour
                })
                
                # Aggregate by day
                if day not in daily_summary:
                    daily_summary[day] = {"da_mwh": 0, "id_mwh": 0, "delta_mwh": 0}
                daily_summary[day]["da_mwh"] += abs(da_val)
                daily_summary[day]["id_mwh"] += abs(current_val)
                daily_summary[day]["delta_mwh"] += delta
            
            # Total revenue = DA portion at DA price + ID delta at ID price
            total_revenue = da_revenue + id_revenue
            
            player_data["da_id_breakdown"] = {
                "is_consumer": is_consumer,
                "da_volume_mwh": round(da_volume_abs, 2),  # Absolute for display
                "da_volume_signed_mwh": round(da_volume_signed, 2),  # With sign for calculations
                "id_delta_mwh": round(id_delta_signed, 2),  # Signed delta
                "final_volume_mwh": round(current_volume_abs, 2),  # Absolute for display
                "final_volume_signed_mwh": round(current_volume_signed, 2),  # With sign
                "da_price_zar": round(da_price, 2),
                "id_price_zar": round(id_price, 2),
                "id_price_spread_percent": id_price_spread,
                "da_revenue_zar": round(da_revenue, 0),  # Negative for consumers
                "id_revenue_zar": round(id_revenue, 0),  # Negative if buying more
                "total_revenue_zar": round(total_revenue, 0),
                "has_baseline": len(da_hours) > 0,
                "hourly_detail": hourly_detail,
                "daily_summary": [{"day": d, **v} for d, v in sorted(daily_summary.items())]
            }
            
            ranking.append(player_data)
            if r.player_id == player_id:
                my_result = player_data
        
        # Sort by total score descending
        ranking.sort(key=lambda x: x["total_score"], reverse=True)
        
        # Add rank to each player
        for idx, p in enumerate(ranking):
            p["rank"] = idx + 1

        reference_result_data = next(
            ((r.data or {}) for r in results if isinstance(r.data, dict)),
            {},
        )

        round_total_volume = max(
            (_safe_market_number((r.data or {}).get("volume")) for r in results),
            default=0.0,
        )
        round_market_rows = [
            {
                "player_id": row.get("player_id"),
                "player_role": row.get("player_role"),
                "dispatched_mwh": (row.get("kpis") or {}).get("dispatched_mwh"),
                "zone_id": (row.get("player_zone_info") or {}).get("zone_id"),
                "variable_cost_zar": (row.get("kpis") or {}).get("variable_cost_zar"),
                "profit_zar": (row.get("kpis") or {}).get("profit_zar"),
                "atc_dispatch_cost_zar": (row.get("kpis") or {}).get("atc_dispatch_cost_zar"),
                "grid_constraint_cost_zar": (row.get("kpis") or {}).get("grid_constraint_cost_zar"),
                "grid_curtailed_mwh": (row.get("kpis") or {}).get("grid_curtailed_mwh"),
                "network_shortfall_mwh": (row.get("kpis") or {}).get("network_shortfall_mwh"),
            }
            for row in ranking
        ]
        market_summary = _build_market_summary(round_total_volume, round_market_rows)
        market_summary = _enrich_market_summary(
            market_summary,
            price_points=_extract_price_points(reference_result_data),
            zone_entries=reference_result_data.get("zone_results", []),
            link_entries=reference_result_data.get("link_results", []),
            player_rows=round_market_rows,
        )
        market_summary["active_events_count"] = len(active_events)
        
        return {
            "round": round_num,
            "my_result": my_result,
            "ranking": ranking,
            "active_events": active_events,
            "weights": weights,
            "market_summary": market_summary,
        }


@ns.route("/<int:sid>/latest-round-results")
class LatestRoundResults(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get the latest available round results for the current player."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get the latest result for this player in this session
        latest_result = (
            Result.query
            .filter_by(session_id=sid, player_id=player_id)
            .order_by(Result.round_num.desc())
            .first()
        )
        
        if not latest_result:
            return {"error": "No results found"}, HTTPStatus.NOT_FOUND
        
        # Get the round-results endpoint handler to reuse the logic
        rr = RoundResults()
        return rr.get(sid, latest_result.round_num)


@ns.route("/<int:sid>/final-results")
class FinalResults(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get cumulative KPIs and final ranking across all rounds."""
        from .models import Result
        player_id = int(get_jwt_identity())
        
        # Get session config
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        weights = config.get("scoring", {}).get("weights", {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1})
        
        # Get all results for this session
        results = Result.query.filter_by(session_id=sid).order_by(Result.player_id, Result.round_num).all()
        
        # Aggregate by player
        player_totals = {}
        player_bid_aggregates = {}  # Aggregate bid dispatch across all rounds
        round_market_totals = {}
        for r in results:
            pid = r.player_id
            if pid not in player_totals:
                player_totals[pid] = {
                    "profit": 0,
                    "revenue": 0,
                    "planned_mwh": 0,
                    "variable_cost": 0,
                    "fixed_cost": 0,
                    "imbalance_cost": 0,
                    "atc_dispatch_cost": 0,
                    "curtailment_cost": 0,
                    "congestion_revenue": 0,
                    "co2_emissions": 0,
                    "imbalance": 0,
                    "curtailment": 0,
                    "dispatched_mwh": 0,
                    "grid_curtailed_mwh": 0,
                    "network_shortfall_mwh": 0,
                    "rounds": 0,
                    "player_role": None,
                }

            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{pid}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=pid).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            cfg_devices = (config.get("devices") or []) if isinstance(config, dict) else []
            cfg_player_types = (config.get("player_types") or []) if isinstance(config, dict) else []
            player_device_ids = set()
            if player_type:
                pt_cfg = next((pt for pt in cfg_player_types if isinstance(pt, dict) and pt.get("id") == player_type), None)
                if pt_cfg and isinstance(pt_cfg.get("devices"), list):
                    player_device_ids.update({str(x) for x in pt_cfg.get("devices") if x})
            kpis = _repair_device_settlement_kpis(
                canonicalize_kpis(r.data.get("kpis", {})),
                (r.data or {}).get("device_hourly_details") or {},
                cfg_devices=cfg_devices,
                player_device_ids=player_device_ids,
                da_smp=((r.data or {}).get("da_baseline_metadata") or {}).get("da_smp"),
                use_da_baseline_settlement=idm_trading_enabled,
            )
            resolved_role = _resolve_market_role(config, player_type, r.data.get("player_role"), kpis.get("revenue_zar", 0))
            player_totals[pid]["player_role"] = player_totals[pid]["player_role"] or resolved_role
            player_totals[pid]["profit"] += float(kpis.get("profit_zar", 0))
            player_totals[pid]["revenue"] += float(kpis.get("revenue_zar", 0))
            player_totals[pid]["planned_mwh"] += float(kpis.get("planned_mwh", 0))
            player_totals[pid]["variable_cost"] += float(kpis.get("variable_cost_zar", 0))
            player_totals[pid]["fixed_cost"] += float(kpis.get("fixed_cost_zar", 0))
            player_totals[pid]["imbalance_cost"] += float(kpis.get("imbalance_cost_zar", 0))
            player_totals[pid]["atc_dispatch_cost"] += float(kpis.get("atc_dispatch_cost_zar", kpis.get("grid_constraint_cost_zar", 0)))
            player_totals[pid]["curtailment_cost"] += float(kpis.get("curtailment_cost_zar", 0))
            player_totals[pid]["congestion_revenue"] += float(kpis.get("congestion_revenue_zar", 0))
            player_totals[pid]["co2_emissions"] += float(kpis.get("co2_emissions_kg", 0))
            # Use MWh quantities (not costs), with fallback for old sessions
            _imb2 = kpis.get("imbalance_mwh")
            player_totals[pid]["imbalance"] += float(_imb2) if _imb2 is not None else float(kpis.get("imbalance_cost_zar", 0) / 1000)
            _curt2 = kpis.get("curtailment_mwh")
            player_totals[pid]["curtailment"] += float(_curt2) if _curt2 is not None else float(kpis.get("curtailment_cost_zar", 0) / 1000)
            player_totals[pid]["dispatched_mwh"] += float(kpis.get("dispatched_mwh", 0))
            player_totals[pid]["grid_curtailed_mwh"] += float(kpis.get("grid_curtailed_mwh", 0) or 0)
            player_totals[pid]["network_shortfall_mwh"] += float(kpis.get("network_shortfall_mwh", 0) or 0)
            player_totals[pid]["rounds"] += 1

            round_bucket = round_market_totals.setdefault(r.round_num, {
                "total_volume_mwh": 0.0,
                "real_producer_mwh": 0.0,
                "real_consumer_mwh": 0.0,
                "price_points": [],
                "zone_entries": [],
                "link_entries": [],
            })
            round_bucket["total_volume_mwh"] = max(
                round_bucket["total_volume_mwh"],
                _safe_market_number((r.data or {}).get("volume")),
            )
            if not round_bucket["price_points"]:
                round_bucket["price_points"] = _extract_price_points(r.data or {})
            if not round_bucket["zone_entries"]:
                round_bucket["zone_entries"] = list((r.data or {}).get("zone_results") or [])
            if not round_bucket["link_entries"]:
                round_bucket["link_entries"] = list((r.data or {}).get("link_results") or [])
            dispatched_mwh = max(0.0, _safe_market_number(kpis.get("dispatched_mwh")))
            if resolved_role == "consumer":
                round_bucket["real_consumer_mwh"] += dispatched_mwh
            else:
                round_bucket["real_producer_mwh"] += dispatched_mwh
            
            # Collect challenge results from each round
            if "challenge_history" not in player_totals[pid]:
                player_totals[pid]["challenge_history"] = []
            challenge_round_kpis = player_totals[pid].setdefault("_challenge_round_kpis", [])
            challenge_round_kpis.append(kpis)
            challenge_result = _repair_challenge_result(
                config,
                session.mode,
                player_type,
                resolved_role,
                r.round_num,
                kpis,
                challenge_round_kpis,
                r.data.get("challenge_result"),
            )
            if challenge_result:
                player_totals[pid]["challenge_history"].append({
                    "round": r.round_num,
                    "result": challenge_result
                })
            
            # Aggregate bid dispatch data across rounds using the same source that
            # RoundResults exposes as my_result.bid_dispatch.
            raw_bid_dispatch = (
                (r.data or {}).get("bid_dispatch")
                or (r.data or {}).get("dam_bid_dispatch")
                or (r.bid_dispatch or {})
            )

            if raw_bid_dispatch:
                if pid not in player_bid_aggregates:
                    player_bid_aggregates[pid] = {}
                
                for device_id, device_lots in raw_bid_dispatch.items():
                    if device_id not in player_bid_aggregates[pid]:
                        player_bid_aggregates[pid][device_id] = {}
                    
                    for lot_label, lot_data in device_lots.items():
                        if lot_label not in player_bid_aggregates[pid][device_id]:
                            player_bid_aggregates[pid][device_id][lot_label] = {
                                "mw_offered": 0,
                                "mw_dispatched": 0,
                                "total_revenue": 0,
                                "rounds_offered": 0
                            }
                        
                        agg = player_bid_aggregates[pid][device_id][lot_label]
                        if isinstance(lot_data, list):
                            # New format: hourly array per lot
                            offered_sum = 0.0
                            dispatched_sum = 0.0
                            revenue_sum = 0.0
                            has_offer = False
                            for hour_item in lot_data:
                                if not isinstance(hour_item, dict):
                                    continue
                                offered = float(hour_item.get("mw_offered", 0) or 0)
                                dispatched = float(hour_item.get("mw_dispatched", 0) or 0)
                                smp = float(hour_item.get("smp", 0) or 0)
                                offered_sum += offered
                                dispatched_sum += dispatched
                                revenue_sum += dispatched * smp
                                if offered > 0:
                                    has_offer = True
                            agg["mw_offered"] += offered_sum
                            agg["mw_dispatched"] += dispatched_sum
                            agg["total_revenue"] += revenue_sum
                            if has_offer:
                                agg["rounds_offered"] += 1
                        elif isinstance(lot_data, dict):
                            # Legacy format: single dict per lot
                            offered = float(lot_data.get("mw_offered", 0) or 0)
                            dispatched = float(lot_data.get("mw_dispatched", 0) or 0)
                            smp = float(lot_data.get("smp", 0) or 0)
                            agg["mw_offered"] += offered
                            agg["mw_dispatched"] += dispatched
                            agg["total_revenue"] += dispatched * smp
                            if offered > 0:
                                agg["rounds_offered"] += 1
        
        # Build final ranking
        ranking = []
        my_cumulative = None
        
        # Get number of completed rounds from persisted results rather than session.current_round.
        # current_round remains on the last playable round when the scenario is completed.
        num_rounds = max((int(r.round_num or 0) for r in results), default=0)
        
        for pid, totals in player_totals.items():
            # Calculate average score per round, normalized to 0-100
            raw_score = (
                totals["profit"] * weights.get("profit", 0.6) -
                abs(totals["imbalance"]) * weights.get("imbalance", 0.3) * 1000 -
                abs(totals["curtailment"]) * weights.get("curtailment", 0.1) * 1000
            )
            avg_score = raw_score / max(1, totals["rounds"])
            total_score = max(0, min(100, (avg_score + 5000000) / 100000))
            
            # Get player info
            user = User.query.get(pid)
            player_email = user.email if user else f"Player {pid}"
            
            # Get player type
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{pid}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=pid).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            player_data = {
                "player_id": pid,
                "email": player_email,
                "type": player_type,
                "zone_id": _infer_zone_from_player_type(config, player_type),
                "player_role": totals.get("player_role"),
                "total_profit": round(totals["profit"], 2),
                "total_revenue": round(totals["revenue"], 2),
                "total_planned_mwh": round(totals["planned_mwh"], 2),
                "total_variable_cost": round(totals["variable_cost"], 2),
                "total_fixed_cost": round(totals["fixed_cost"], 2),
                "total_imbalance_cost": round(totals["imbalance_cost"], 2),
                "total_atc_dispatch_cost": round(totals["atc_dispatch_cost"], 2),
                "total_curtailment_cost": round(totals["curtailment_cost"], 2),
                "total_congestion_revenue": round(totals["congestion_revenue"], 2),
                "total_co2_emissions": round(totals["co2_emissions"], 2),
                "total_imbalance": round(totals["imbalance"], 2),
                "total_curtailment": round(totals["curtailment"], 2),
                "total_dispatched_mwh": round(totals["dispatched_mwh"], 2),
                "total_grid_curtailed_mwh": round(totals["grid_curtailed_mwh"], 3),
                "total_network_shortfall_mwh": round(totals["network_shortfall_mwh"], 3),
                "total_score": round(total_score, 2),
                "rounds_played": totals["rounds"],
                "challenge_history": totals.get("challenge_history", [])
            }
            
            ranking.append(player_data)
            if pid == player_id:
                my_cumulative = player_data
        
        # Sort by total score descending
        ranking.sort(key=lambda x: x["total_score"], reverse=True)
        
        # Add rank
        for idx, p in enumerate(ranking):
            p["rank"] = idx + 1
        
        # Build round history for the current player
        round_history = []
        player_results = Result.query.filter_by(session_id=sid, player_id=player_id).order_by(Result.round_num).all()
        for r in player_results:
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{player_id}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=player_id).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            cfg_devices = (config.get("devices") or []) if isinstance(config, dict) else []
            cfg_player_types = (config.get("player_types") or []) if isinstance(config, dict) else []
            player_device_ids = set()
            if player_type:
                pt_cfg = next((pt for pt in cfg_player_types if isinstance(pt, dict) and pt.get("id") == player_type), None)
                if pt_cfg and isinstance(pt_cfg.get("devices"), list):
                    player_device_ids.update({str(x) for x in pt_cfg.get("devices") if x})
            kpis = _repair_device_settlement_kpis(
                canonicalize_kpis(r.data.get("kpis", {})),
                (r.data or {}).get("device_hourly_details") or {},
                cfg_devices=cfg_devices,
                player_device_ids=player_device_ids,
                da_smp=((r.data or {}).get("da_baseline_metadata") or {}).get("da_smp"),
                use_da_baseline_settlement=idm_trading_enabled,
            )
            # BUG FIX P1-2: Use MWh quantities consistently (not costs) for scoring
            _imb3 = kpis.get("imbalance_mwh")
            imbalance_mwh = float(_imb3) if _imb3 is not None else float(kpis.get("imbalance_cost_zar", 0) / 1000)
            _curt3 = kpis.get("curtailment_mwh")
            curtailment_mwh = float(_curt3) if _curt3 is not None else float(kpis.get("curtailment_cost_zar", 0) / 1000)
            
            raw_round_score = (
                float(kpis.get("profit_zar", 0)) * weights.get("profit", 0.6) -
                abs(imbalance_mwh) * weights.get("imbalance", 0.3) * 1000 -  # Convert MWh penalty to ZAR scale
                abs(curtailment_mwh) * weights.get("curtailment", 0.1) * 1000  # Convert MWh penalty to ZAR scale
            )
            round_score = max(0, min(100, (raw_round_score + 5000000) / 100000))
            atc_dispatch_cost = float(kpis.get("atc_dispatch_cost_zar", kpis.get("grid_constraint_cost_zar", 0)))
            total_costs_zar = round(
                abs(float(kpis.get("variable_cost_zar", 0)))
                + abs(float(kpis.get("fixed_cost_zar", 0)))
                + abs(float(kpis.get("imbalance_cost_zar", 0)))
                + abs(atc_dispatch_cost),
                2
            )
            round_history.append({
                "round_num": r.round_num,
                "profit": round(float(kpis.get("profit_zar", 0)), 2),
                "revenue_zar": round(float(kpis.get("revenue_zar", 0)), 2),
                "total_costs_zar": total_costs_zar,
                "co2_emissions_kg": round(float(kpis.get("co2_emissions_kg", 0)), 2),
                "imbalance_mwh": round(imbalance_mwh, 3),
                "imbalance_cost": round(float(kpis.get("imbalance_cost_zar", 0)), 2),
                "atc_dispatch_cost": round(atc_dispatch_cost, 2),
                "curtailment_mwh": round(curtailment_mwh, 3),
                "curtailment_cost": round(float(kpis.get("curtailment_cost_zar", 0)), 2),
                "dispatched_mwh": round(float(kpis.get("dispatched_mwh", 0)), 2),
                "planned_mwh": round(float(kpis.get("planned_mwh", 0)), 2),
                "total_score": round(round_score, 2),
                "smp": round(float(r.data.get("smp", r.data.get("mcp", 0)) or 0), 2),
            })
        
        # Add aggregated bid dispatch to my_cumulative
        my_bid_aggregate = player_bid_aggregates.get(player_id) if player_id in player_bid_aggregates else None
        scenario_total_volume = 0.0
        for bucket in round_market_totals.values():
            scenario_total_volume += max(
                bucket.get("total_volume_mwh", 0.0),
                bucket.get("real_producer_mwh", 0.0),
                bucket.get("real_consumer_mwh", 0.0),
            )

        scenario_price_points = []
        scenario_zone_entries = []
        scenario_link_entries = []
        for bucket in round_market_totals.values():
            scenario_price_points.extend(bucket.get("price_points", []))
            scenario_zone_entries.extend(bucket.get("zone_entries", []))
            scenario_link_entries.extend(bucket.get("link_entries", []))

        scenario_market_rows = [
            {
                "player_id": row.get("player_id"),
                "player_role": row.get("player_role"),
                "dispatched_mwh": row.get("total_dispatched_mwh"),
                "zone_id": row.get("zone_id"),
                "variable_cost_zar": row.get("total_variable_cost"),
                "profit_zar": row.get("total_profit"),
                "atc_dispatch_cost_zar": row.get("total_atc_dispatch_cost"),
                "grid_curtailed_mwh": row.get("total_grid_curtailed_mwh"),
                "network_shortfall_mwh": row.get("total_network_shortfall_mwh"),
            }
            for row in ranking
        ]
        market_summary = _build_market_summary(scenario_total_volume, scenario_market_rows)
        market_summary = _enrich_market_summary(
            market_summary,
            price_points=scenario_price_points,
            zone_entries=scenario_zone_entries,
            link_entries=scenario_link_entries,
            player_rows=scenario_market_rows,
        )
        market_summary["rounds_count"] = num_rounds
        
        return {
            "my_cumulative": my_cumulative,
            "final_ranking": ranking,
            "bid_dispatch_aggregate": my_bid_aggregate,
            "round_history": round_history,
            "weights": weights,
            "total_rounds": num_rounds,
            "market_summary": market_summary,
        }


@ns.route("/<int:sid>/advance-round")
class AdvanceRound(Resource):
    @jwt_required()
    def post(self, sid: int):
        """Player signals ready to advance to next round (solo & shared mode)."""
        player_id = int(get_jwt_identity())
        session = Session.query.get_or_404(sid)

        # In shared_market, advancement is trainer-controlled
        if session.mode == "shared_market":
            return {"error": "Trainer will start the next round."}, HTTPStatus.FORBIDDEN
        
        # Mark player as ready in Redis or DB
        if _redis_client:
            ready_key = f"session:{sid}:round_ready:{player_id}"
            _redis_client.set(ready_key, "1", ex=3600)
        
        # Check if all players are ready
        members = CohortMember.query.filter_by(cohort_id=session.cohort_id).all()
        member_ids = [m.user_id for m in members]
        
        ready_count = 0
        if _redis_client:
            for mid in member_ids:
                if _redis_client.get(f"session:{sid}:round_ready:{mid}"):
                    ready_count += 1
        
        # Solo mode: 1 player ready = advance immediately
        # Shared mode: all players ready = advance
        required_ready = 1 if session.mode == "isolated_per_player" else len(member_ids)
        
        if ready_count >= required_ready:
            # Clear ready flags
            if _redis_client:
                for mid in member_ids:
                    _redis_client.delete(f"session:{sid}:round_ready:{mid}")
            
            # Advance to next round or complete scenario
            scenario = Scenario.query.get(session.scenario_id)
            total_rounds = int((scenario.config or {}).get("general", {}).get("rounds", 4))
            current_round = session.current_round or 1
            
            if current_round < total_rounds:
                # Advance to next round
                session.current_round = current_round + 1
                session.status = SessionStatus.round_active
                db.session.add(session)
                db.session.commit()
                
                # Restart scheduler for next round
                socketio.start_background_task(run_rounds, sid, current_app._get_current_object())
            else:
                # All rounds complete - set to scenario_complete
                session.status = SessionStatus.scenario_complete
                db.session.add(session)
                db.session.commit()
                socketio.emit("scenario_complete", {"session_id": sid}, namespace="/trainer")
                socketio.emit("scenario_complete", {"session_id": sid}, namespace="/game", to=f"session-{sid}")
                
                # Mark player progress completed
                try:
                    from datetime import datetime
                    from .models import PlayerProgress, PlayerProgressStatus
                    players = [uid for (uid,) in db.session.query(CohortMember.user_id).filter_by(cohort_id=session.cohort_id).all()]
                    q = db.session.query(PlayerProgress).filter(PlayerProgress.scenario_id == session.scenario_id, PlayerProgress.user_id.in_(players))
                    for pp in q.all():
                        pp.status = PlayerProgressStatus.completed
                        pp.completed_at = datetime.utcnow()
                        db.session.add(pp)
                    db.session.commit()
                except Exception:
                    pass
        
        return {
            "status": "ok",
            "ready_count": ready_count,
            "total_players": len(member_ids)
        }


@ns.route("/<int:sid>/advance-round-force")
class AdvanceRoundForce(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        """Trainer forces advance to next round (shared mode)."""
        session = Session.query.get_or_404(sid)

        # Clear ready flags
        if _redis_client:
            members = CohortMember.query.filter_by(cohort_id=session.cohort_id).all()
            for m in members:
                _redis_client.delete(f"session:{sid}:round_ready:{m.user_id}")

        scenario = Scenario.query.get(session.scenario_id)
        total_rounds = int((scenario.config or {}).get("general", {}).get("rounds", 4))
        current_round = session.current_round or 1

        if current_round < total_rounds:
            session.current_round = current_round + 1
            session.status = SessionStatus.round_active
            db.session.add(session)
            db.session.commit()

            socketio.start_background_task(run_rounds, sid, current_app._get_current_object())
        else:
            session.status = SessionStatus.scenario_complete
            db.session.add(session)
            db.session.commit()
            socketio.emit("scenario_complete", {"session_id": sid}, namespace="/trainer")
            socketio.emit("scenario_complete", {"session_id": sid}, namespace="/game", to=f"session-{sid}")

        return {"status": "ok"}


@ns.route("/<int:sid>/rewind-round")
class RewindRound(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def post(self, sid: int):
        """Trainer moves back to previous round results (shared mode)."""
        session = Session.query.get_or_404(sid)
        current_round = session.current_round or 1
        if current_round <= 1:
            return {"error": "Already at round 1"}, HTTPStatus.BAD_REQUEST

        session.current_round = current_round - 1
        session.status = SessionStatus.round_results
        db.session.add(session)
        db.session.commit()

        socketio.emit("round_results_ready", {"session_id": sid, "round": session.current_round}, namespace="/trainer")
        socketio.emit("round_results_ready", {"session_id": sid, "round": session.current_round}, namespace="/game", to=f"session-{sid}")

        try:
            if _redis_client is not None:
                key = f"cohort:{session.cohort_id}:force_nav"
                _redis_client.setex(key, 300, f"/player?sessionId={sid}")
        except Exception:
            pass

        return {"status": "ok", "current_round": session.current_round}


@ns.route("/<int:sid>/start-briefing")
class StartBriefing(Resource):
    @jwt_required()
    def post(self, sid: int):
        """Player starts scenario from briefing screen (solo mode)."""
        session = Session.query.get_or_404(sid)
        
        # Only allow starting from briefing status
        if session.status != SessionStatus.briefing:
            return {"error": "Session not in briefing state"}, HTTPStatus.BAD_REQUEST
        
        # Set to round_active and restart scheduler
        session.status = SessionStatus.round_active
        session.current_round = 1
        db.session.add(session)

        # Progress → in_progress (set here, not on briefing open)
        try:
            uid = int(get_jwt_identity())
            from .models import PlayerProgress, PlayerProgressStatus, CampaignScenario
            cs = CampaignScenario.query.filter_by(scenario_id=session.scenario_id).first()
            campaign_id = cs.campaign_id if cs else None
            if campaign_id:
                pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=campaign_id, scenario_id=session.scenario_id).first()
                if not pp:
                    pp = PlayerProgress(user_id=uid, campaign_id=campaign_id, scenario_id=session.scenario_id, status=PlayerProgressStatus.in_progress, started_at=datetime.utcnow())
                elif pp.status != PlayerProgressStatus.completed:
                    pp.status = PlayerProgressStatus.in_progress
                    pp.started_at = pp.started_at or datetime.utcnow()
                db.session.add(pp)
        except Exception:
            current_app.logger.exception("failed to set player progress on start-briefing")

        db.session.commit()
        
        # Restart scheduler to begin first round
        socketio.start_background_task(run_rounds, sid, current_app._get_current_object())
        
        return {"status": "ok", "message": "Scenario started"}


@ns.route("/<int:sid>/submit-status")
class SubmitStatus(Resource):
    @jwt_required()
    def get(self, sid: int):
        """Get submit status per player type for waiting screen."""
        session = Session.query.get_or_404(sid)
        scenario = Scenario.query.get(session.scenario_id)
        config = scenario.config or {}
        player_types = config.get("player_types", [])
        type_name_map = {
            str(pt.get("id")): (pt.get("name") or pt.get("id"))
            for pt in player_types
            if pt.get("id")
        }
        current_round = session.current_round or 1
        
        # Get all cohort members
        members = CohortMember.query.filter_by(cohort_id=session.cohort_id).all()
        member_ids = [m.user_id for m in members]
        users = User.query.filter(User.id.in_(member_ids)).all() if member_ids else []
        users_by_id = {u.id: u for u in users}
        
        # Get player type selections
        type_map = {}
        for mid in member_ids:
            player_type = None
            if _redis_client:
                try:
                    sel_key = f"session:{sid}:selected:{mid}"
                    sel_raw = _redis_client.get(sel_key)
                    if sel_raw:
                        player_type = sel_raw.decode() if isinstance(sel_raw, (bytes, bytearray)) else str(sel_raw)
                except Exception:
                    pass
            if not player_type:
                try:
                    sel_db = SessionPlayerType.query.filter_by(session_id=sid, user_id=mid).first()
                    if sel_db:
                        player_type = sel_db.type_id
                except Exception:
                    pass
            
            if player_type:
                type_map[mid] = player_type
        
        # Count submits per type
        type_counts = {}
        for ptype in player_types:
            tid = ptype.get("id")
            type_counts[tid] = {"submitted": 0, "total": 0}
        
        players = []
        for mid, ptype in type_map.items():
            if ptype in type_counts:
                type_counts[ptype]["total"] += 1
                # Check if submitted
                forecast = Forecast.query.filter_by(
                    session_id=sid,
                    player_id=mid,
                    round_num=current_round
                ).first()
                submitted = bool(forecast)
                if forecast:
                    type_counts[ptype]["submitted"] += 1
                user = users_by_id.get(mid)
                player_name = (user.name or "").strip() if user and user.name else None
                players.append({
                    "player_id": mid,
                    "player_name": player_name or (user.email if user else f"Player {mid}"),
                    "player_email": user.email if user else None,
                    "type_id": ptype,
                    "type_name": type_name_map.get(str(ptype), ptype),
                    "submitted": submitted,
                })

        players.sort(key=lambda p: ((p.get("type_name") or ""), (p.get("player_name") or ""), p.get("player_id") or 0))
        
        return {
            "round": current_round,
            "by_type": type_counts,
            "players": players,
            "total_submitted": sum(t["submitted"] for t in type_counts.values()),
            "total_players": sum(t["total"] for t in type_counts.values())
        }


@ns.route("/<int:sid>/broadcast")
class Broadcast(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(broadcast_in, validate=True)
    def post(self, sid: int):
        msg = request.json["message"]
        # Send to trainer namespace
        emit_trainer("message", {"session_id": sid, "message": msg})
        # Also send to game namespace for players in this session
        socketio.emit("trainer_message", {"session_id": sid, "message": msg}, namespace="/game", to=f"session-{sid}")
        return {"status": "ok"}


allowed_types_in = ns.model("AllowedTypesIn", {
    "allowed": fields.List(fields.Raw, required=True, description="[{type_id, max_players?}]")
})

@ns.route("/<int:sid>/allowed-types")
class AllowedTypes(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(allowed_types_in, validate=True)
    def patch(self, sid: int):
        data = request.json or {}
        allowed = data.get("allowed") or []
        # basic validation
        norm = []
        seen = set()
        for it in allowed:
            tid = (it.get("type_id") or "").strip()
            if not tid:
                return {"error": "type_id required"}, HTTPStatus.BAD_REQUEST
            if tid in seen:
                return {"error": f"duplicate type_id: {tid}"}, HTTPStatus.BAD_REQUEST
            seen.add(tid)
            cap = it.get("max_players")
            if cap is not None:
                try:
                    cap = int(cap)
                    if cap < 0:
                        return {"error": "max_players must be >= 0"}, HTTPStatus.BAD_REQUEST
                except Exception:
                    return {"error": "max_players must be integer"}, HTTPStatus.BAD_REQUEST
            norm.append({"type_id": tid, "max_players": cap})
        # persist to DB (replace existing rows)
        try:
            SessionAllowedType.query.filter_by(session_id=sid).delete()
            for it in norm:
                db.session.add(SessionAllowedType(session_id=sid, type_id=it["type_id"], max_players=it.get("max_players")))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return {"error": "failed to persist allowed types"}, HTTPStatus.INTERNAL_SERVER_ERROR
        # compute remaining from DB counts
        counts_db = (
            db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
            .filter(SessionPlayerType.session_id == sid)
            .group_by(SessionPlayerType.type_id)
            .all()
        )
        counts = {k: int(v) for k, v in counts_db}
        for item in norm:
            used = int(counts.get(item["type_id"], 0))
            cap = item.get("max_players")
            item["remaining"] = (max(0, cap - used) if isinstance(cap, int) else None)
        return {"allowed": norm}

    @jwt_required()
    def get(self, sid: int):
        try:
            rows = SessionAllowedType.query.filter_by(session_id=sid).all()
            if not rows:
                return {"allowed": None}
            counts_db = (
                db.session.query(SessionPlayerType.type_id, db.func.count(SessionPlayerType.id))
                .filter(SessionPlayerType.session_id == sid)
                .group_by(SessionPlayerType.type_id)
                .all()
            )
            counts = {k: int(v) for k, v in counts_db}
            out = []
            for r in rows:
                used = int(counts.get(r.type_id, 0))
                remaining = (max(0, (r.max_players or 0) - used) if isinstance(r.max_players, int) else None)
                out.append({"type_id": r.type_id, "max_players": r.max_players, "remaining": remaining})
            return {"allowed": out}
        except Exception:
            return {"allowed": None}

select_in = ns.model("SelectTypeIn", {"type_id": fields.String(required=True)})

@ns.route("/<int:sid>/select-type")
class SelectType(Resource):
    @jwt_required()
    @ns.expect(select_in, validate=True)
    def post(self, sid: int):
        uid = get_jwt()["sub"]
        tid = (request.json or {}).get("type_id") or ""
        if not tid:
            current_app.logger.warning("select-type missing type_id user=%s session=%s", uid, sid)
            return {"error": "type_id required"}, HTTPStatus.BAD_REQUEST
        # idempotent via DB
        existing = SessionPlayerType.query.filter_by(session_id=sid, user_id=uid).first()
        if existing:
            current_app.logger.info(
                "select-type already set user=%s session=%s type=%s", uid, sid, existing.type_id
            )
            return {"status": "ok", "type_id": existing.type_id}
        # validate allowed + caps
        row = SessionAllowedType.query.filter_by(session_id=sid, type_id=tid).first()
        if not row:
            current_app.logger.warning(
                "select-type denied (not allowed) user=%s session=%s requested=%s", uid, sid, tid
            )
            return {"error": "type not allowed"}, HTTPStatus.FORBIDDEN
        if isinstance(row.max_players, int):
            used = db.session.query(db.func.count(SessionPlayerType.id)).filter_by(session_id=sid, type_id=tid).scalar() or 0
            if used >= row.max_players:
                current_app.logger.warning(
                    "select-type denied (capacity) user=%s session=%s requested=%s used=%s cap=%s",
                    uid,
                    sid,
                    tid,
                    used,
                    row.max_players,
                )
                return {"error": "type capacity reached"}, HTTPStatus.CONFLICT
        try:
            db.session.add(SessionPlayerType(session_id=sid, user_id=uid, type_id=tid))
            db.session.commit()
            current_app.logger.info(
                "select-type success user=%s session=%s type=%s", uid, sid, tid
            )
            # Log type selection activity
            try:
                s = Session.query.get(sid)
                log_activity(int(uid), "type_select", session_id=sid, cohort_id=(s.cohort_id if s else None), details={"type_id": tid})
            except Exception:
                pass
        except Exception:
            db.session.rollback()
            current_app.logger.exception(
                "select-type failed to store user=%s session=%s type=%s", uid, sid, tid
            )
            return {"error": "failed to store selection"}, HTTPStatus.INTERNAL_SERVER_ERROR
        return {"status": "ok", "type_id": tid}

@ns.route("/<int:sid>/activity")
class SessionActivity(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, sid: int):
        """Get activity timeline for a specific session."""
        # Validate session exists
        Session.query.get_or_404(sid)
        
        # Get query parameters
        action_type = request.args.get("action_type")
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        
        # Build query
        query = ActivityLog.query.filter_by(session_id=sid)
        
        if action_type:
            query = query.filter_by(action_type=action_type)
        
        # Get total count
        total = query.count()
        
        # Order and paginate
        query = query.order_by(ActivityLog.timestamp.desc())
        activities = query.limit(limit).offset(offset).all()
        
        result = []
        for activity in activities:
            user = User.query.get(activity.user_id)
            result.append({
                "id": activity.id,
                "timestamp": activity.timestamp.isoformat() + "Z" if activity.timestamp else None,
                "user_id": activity.user_id,
                "user_email": user.email if user else "Unknown",
                "user_name": user.email.split("@")[0] if user else "Unknown",
                "action_type": activity.action_type,
                "details": activity.details or {}
            })
        
        return {
            "activities": result,
            "total": total,
            "limit": limit,
            "offset": offset
        }
