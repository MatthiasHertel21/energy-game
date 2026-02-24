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
        "curtailment_cost_zar": to_float(raw.get("curtailment_cost_zar", 0.0)),
        "curtailment_mwh": to_float(raw.get("curtailment_mwh", 0.0)),
        "congestion_revenue_zar": to_float(raw.get("congestion_revenue_zar", 0.0)),
        "co2_emissions_kg": to_float(raw.get("co2_emissions_kg", 0.0)),
        "planned_mwh": to_float(raw.get("planned_mwh", planned_from_breakdown)),
        "dispatched_mwh": to_float(raw.get("dispatched_mwh", dispatched_from_breakdown)),
        "actual_mwh": to_float(raw.get("actual_mwh", actual_from_breakdown)),
        "_kpi_schema": "canonical_v2",
    }

    raw.update(canonical)
    return raw
