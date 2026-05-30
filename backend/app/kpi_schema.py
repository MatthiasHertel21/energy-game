import math


def to_float(value, default=0.0):
    try:
        num = float(value)
        if math.isfinite(num):
            return num
    except (TypeError, ValueError):
        pass
    return default


def canonicalize_kpis(kpis: dict | None):
    raw = dict(kpis or {})
    hourly_breakdown = raw.get("hourly_breakdown") if isinstance(raw.get("hourly_breakdown"), list) else []
    device_hourly_breakdown = raw.get("device_hourly_breakdown") if isinstance(raw.get("device_hourly_breakdown"), dict) else {}

    dispatched_from_breakdown = sum(
        to_float(hour.get("dispatched_mw", 0.0))
        for hour in hourly_breakdown
        if isinstance(hour, dict)
    )
    planned_from_breakdown = sum(
        to_float(hour.get("planned_mw", 0.0))
        for hour in hourly_breakdown
        if isinstance(hour, dict)
    )
    actual_from_breakdown = sum(
        to_float(hour.get("actual_mw", 0.0))
        for hour in hourly_breakdown
        if isinstance(hour, dict)
    )

    canonical = {
        "revenue_zar": to_float(raw.get("revenue_zar", 0.0)),
        "profit_zar": to_float(raw.get("profit_zar", 0.0)),
        "variable_cost_zar": to_float(raw.get("variable_cost_zar", 0.0)),
        "fixed_cost_zar": to_float(raw.get("fixed_cost_zar", 0.0)),
        "imbalance_cost_zar": to_float(raw.get("imbalance_cost_zar", 0.0)),
        "imbalance_mwh": to_float(raw.get("imbalance_mwh", 0.0)),
        "atc_dispatch_cost_zar": to_float(raw.get("atc_dispatch_cost_zar", raw.get("grid_constraint_cost_zar", 0.0))),
        "grid_constraint_cost_zar": to_float(raw.get("grid_constraint_cost_zar", raw.get("atc_dispatch_cost_zar", 0.0))),
        "curtailment_cost_zar": to_float(raw.get("curtailment_cost_zar", 0.0)),
        "curtailment_mwh": to_float(raw.get("curtailment_mwh", 0.0)),
        "congestion_revenue_zar": to_float(raw.get("congestion_revenue_zar", 0.0)),
        "battery_charge_cost_zar": to_float(raw.get("battery_charge_cost_zar", 0.0)),
        "co2_emissions_kg": to_float(raw.get("co2_emissions_kg", 0.0)),
        "network_shortfall_mwh": to_float(raw.get("network_shortfall_mwh", 0.0)),
        "zone_shortfall_mwh": to_float(raw.get("zone_shortfall_mwh", 0.0)),
        "planned_mwh": to_float(raw.get("planned_mwh", planned_from_breakdown)),
        "dispatched_mwh": to_float(raw.get("dispatched_mwh", dispatched_from_breakdown)),
        "actual_mwh": to_float(raw.get("actual_mwh", actual_from_breakdown)),
        "_kpi_schema": "canonical_v3",
    }

    if device_hourly_breakdown:
        revenue_from_devices = 0.0
        variable_cost_from_devices = 0.0
        fixed_cost_from_devices = 0.0
        imbalance_cost_from_devices = 0.0
        congestion_from_devices = 0.0
        imbalance_mwh_from_devices = 0.0
        co2_from_devices = 0.0
        battery_charge_cost_from_devices = 0.0
        eps = 1e-9
        for rows in device_hourly_breakdown.values():
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                row_revenue = row.get("revenue_zar")
                if row_revenue is None:
                    row_revenue = to_float(row.get("da_revenue_zar", 0.0)) + to_float(row.get("id_revenue_zar", 0.0))
                revenue_from_devices += to_float(row_revenue)
                variable_cost_from_devices += to_float(row.get("variable_cost_zar", 0.0))
                fixed_cost_from_devices += to_float(row.get("fixed_cost_zar", 0.0))
                imbalance_cost_from_devices += to_float(row.get("imbalance_cost_zar", 0.0))
                congestion_from_devices += to_float(row.get("congestion_revenue_zar", 0.0))
                imbalance_mwh_from_devices += to_float(row.get("imbalance_mwh", 0.0))
                co2_from_devices += to_float(row.get("co2_kg", row.get("co2_emissions_kg", 0.0)))
                battery_charge_cost_from_devices += to_float(row.get("battery_charge_cost_zar", 0.0))

        if abs(canonical["revenue_zar"]) < eps and abs(revenue_from_devices) >= eps:
            canonical["revenue_zar"] = revenue_from_devices
        if abs(canonical["variable_cost_zar"]) < eps and abs(variable_cost_from_devices) >= eps:
            canonical["variable_cost_zar"] = variable_cost_from_devices
        if abs(canonical["fixed_cost_zar"]) < eps and abs(fixed_cost_from_devices) >= eps:
            canonical["fixed_cost_zar"] = fixed_cost_from_devices
        if abs(canonical["imbalance_cost_zar"]) < eps and abs(imbalance_cost_from_devices) >= eps:
            canonical["imbalance_cost_zar"] = imbalance_cost_from_devices
        if abs(canonical["congestion_revenue_zar"]) < eps and abs(congestion_from_devices) >= eps:
            canonical["congestion_revenue_zar"] = congestion_from_devices
        if abs(canonical["imbalance_mwh"]) < eps and abs(imbalance_mwh_from_devices) >= eps:
            canonical["imbalance_mwh"] = imbalance_mwh_from_devices
        if abs(canonical["co2_emissions_kg"]) < eps and abs(co2_from_devices) >= eps:
            canonical["co2_emissions_kg"] = co2_from_devices
        if abs(canonical["battery_charge_cost_zar"]) < eps and abs(battery_charge_cost_from_devices) >= eps:
            canonical["battery_charge_cost_zar"] = battery_charge_cost_from_devices

        if abs(canonical["profit_zar"]) < eps and (
            abs(canonical["revenue_zar"]) >= eps
            or abs(canonical["variable_cost_zar"]) >= eps
            or abs(canonical["fixed_cost_zar"]) >= eps
            or abs(canonical["imbalance_cost_zar"]) >= eps
            or abs(canonical["atc_dispatch_cost_zar"]) >= eps
            or abs(canonical["congestion_revenue_zar"]) >= eps
        ):
            canonical["profit_zar"] = (
                canonical["revenue_zar"]
                - canonical["variable_cost_zar"]
                - canonical["fixed_cost_zar"]
                - canonical["imbalance_cost_zar"]
                - canonical["battery_charge_cost_zar"]
                - canonical["atc_dispatch_cost_zar"]
                + canonical["congestion_revenue_zar"]
            )

    raw.update(canonical)
    return raw
