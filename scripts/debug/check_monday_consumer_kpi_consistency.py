#!/usr/bin/env python3
"""Automated KPI consistency check for Monday scenario (consumer role).

Validates that KPI totals can be reconstructed from hourly and device-level detail rows
within practical rounding tolerances.
"""

import contextlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, "backend")
import app.engine as engine


def load_monday_config() -> dict:
    for candidate in [Path("debug/monday_scenario.json"), Path("monday_scenario.json")]:
        if candidate.exists():
            raw = json.loads(candidate.read_text())
            return raw["scenario"]["config"]
    raise FileNotFoundError("Could not find debug/monday_scenario.json or monday_scenario.json")


def find_consumer_type(config: dict) -> dict:
    for player_type in config.get("player_types", []):
        text = (str(player_type.get("name", "")) + " " + str(player_type.get("description", ""))).lower()
        if "consumer" in text:
            return player_type
    raise ValueError("No consumer player type found in Monday scenario")


def build_consumer_forecast(config: dict, consumer_type: dict) -> dict:
    forecast_horizon = int(config.get("general", {}).get("forecast_horizon_hours", 60))
    consumer_device_ids = set(consumer_type.get("devices", []))
    devices = [device for device in config.get("devices", []) if device.get("id") in consumer_device_ids]

    bids = {}
    device_rows = []
    for device in devices:
        device_id = device["id"]
        baseline = float(device.get("baseline_load_mw", device.get("capacity_mw", 100)))
        peak = float(device.get("peak_load_mw", baseline))
        volume = min(max(baseline * 0.95, 1.0), peak)
        hours = [round(volume, 2)] * forecast_horizon

        bids[device_id] = {
            "A": {"price": 900.0, "hours": hours},
            "B": {"price": 1200.0, "hours": [0.0] * forecast_horizon},
            "C": {"price": 1600.0, "hours": [0.0] * forecast_horizon},
        }
        device_rows.append({"device_id": device_id, "hours": hours})

    return {101: {"bids": bids, "devices": device_rows}}


def row_sums(device_hourly_breakdown: dict, key: str) -> float:
    return sum(
        float(row.get(key, 0) or 0)
        for rows in (device_hourly_breakdown or {}).values()
        for row in (rows or [])
    )


def hourly_sums(hourly_breakdown: list, key: str) -> float:
    return sum(float(hour.get(key, 0) or 0) for hour in (hourly_breakdown or []))


def within_tolerance(metric_name: str, kpi_value: float, detail_value: float) -> tuple[bool, float]:
    diff = abs(float(kpi_value or 0) - float(detail_value or 0))
    if (
        metric_name.endswith("_zar")
        or "revenue" in metric_name
        or "cost" in metric_name
        or "profit" in metric_name
        or "congestion" in metric_name
    ):
        return diff <= 2.0, diff
    return diff <= 0.01, diff


def main() -> int:
    config = load_monday_config()
    consumer_type = find_consumer_type(config)
    forecasts = build_consumer_forecast(config, consumer_type)

    total_rounds = int(config.get("general", {}).get("rounds", 6))
    all_ok = True
    max_diff = 0.0

    print("SCENARIO=Monday ROLE=Consumer CHECK=KPI_FROM_DETAIL")

    for round_num in range(1, total_rounds + 1):
        with contextlib.redirect_stdout(io.StringIO()):
            result = engine.run_round(
                session_id=999300 + round_num,
                round_num=round_num,
                players=[101],
                forecasts=forecasts,
                config=config,
                mode="isolated_per_player",
            )

        kpis = (result.get("round_kpis", {}) or {}).get(101, {})
        hourly_breakdown = kpis.get("hourly_breakdown", []) or []
        device_hourly_breakdown = kpis.get("device_hourly_breakdown", {}) or {}

        checks = [
            ("planned_mwh", kpis.get("planned_mwh"), hourly_sums(hourly_breakdown, "planned_mw")),
            ("dispatched_mwh", kpis.get("dispatched_mwh"), hourly_sums(hourly_breakdown, "dispatched_mw")),
            ("actual_mwh", kpis.get("actual_mwh"), hourly_sums(hourly_breakdown, "actual_mw")),
            ("revenue_zar", kpis.get("revenue_zar"), hourly_sums(hourly_breakdown, "revenue_zar")),
            ("profit_zar", kpis.get("profit_zar"), hourly_sums(hourly_breakdown, "profit_zar")),
            ("planned_mwh_dev", kpis.get("planned_mwh"), row_sums(device_hourly_breakdown, "planned_mw")),
            ("dispatched_mwh_dev", kpis.get("dispatched_mwh"), row_sums(device_hourly_breakdown, "dispatched_mw")),
            ("actual_mwh_dev", kpis.get("actual_mwh"), row_sums(device_hourly_breakdown, "actual_mw")),
            ("revenue_zar_dev", kpis.get("revenue_zar"), row_sums(device_hourly_breakdown, "revenue_zar")),
            ("variable_cost_zar", kpis.get("variable_cost_zar"), row_sums(device_hourly_breakdown, "variable_cost_zar")),
            ("fixed_cost_zar", kpis.get("fixed_cost_zar"), row_sums(device_hourly_breakdown, "fixed_cost_zar")),
            ("imbalance_cost_zar", kpis.get("imbalance_cost_zar"), row_sums(device_hourly_breakdown, "imbalance_cost_zar")),
            ("congestion_revenue_zar", kpis.get("congestion_revenue_zar"), row_sums(device_hourly_breakdown, "congestion_revenue_zar")),
            ("profit_zar_dev", kpis.get("profit_zar"), row_sums(device_hourly_breakdown, "profit_zar")),
            ("co2_emissions_kg", kpis.get("co2_emissions_kg"), row_sums(device_hourly_breakdown, "co2_kg")),
        ]

        mismatches = []
        for metric_name, kpi_value, detail_value in checks:
            ok, diff = within_tolerance(metric_name, kpi_value, detail_value)
            max_diff = max(max_diff, diff)
            if not ok:
                mismatches.append((metric_name, kpi_value, detail_value, diff))

        if mismatches:
            all_ok = False

        status = "PASS" if not mismatches else "FAIL"
        print(
            f"Round {round_num}: {status} mismatches={len(mismatches)} "
            f"revenue={float(kpis.get('revenue_zar', 0)):.2f} "
            f"dispatched={float(kpis.get('dispatched_mwh', 0)):.3f} "
            f"planned={float(kpis.get('planned_mwh', 0)):.3f}"
        )
        for metric_name, kpi_value, detail_value, diff in mismatches[:5]:
            print(
                f"  - {metric_name}: kpi={float(kpi_value or 0):.6f} "
                f"detail={float(detail_value or 0):.6f} diff={diff:.6f}"
            )

    print(f"OVERALL: {'PASS' if all_ok else 'FAIL'} max_diff={max_diff:.6f}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
