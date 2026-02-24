#!/usr/bin/env python3
import argparse
import json
import os
import sys
from typing import Dict, Tuple

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import create_app
from app.models import Session
from app.engine import (
    extract_hour_of_day,
    extract_month,
    generate_curves_from_config,
    select_events_for_round,
)


def _to_cfg(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}


def _get_market_status(config: dict, round_num: int, market_key: str) -> str:
    markets_cfg = config.get("markets", {})
    round_idx = round_num - 1
    market_data = markets_cfg.get(market_key, [])
    if isinstance(market_data, list):
        return market_data[round_idx] if round_idx < len(market_data) else "market_code"
    if isinstance(market_data, dict):
        clearing = market_data.get("clearing", [])
        return clearing[round_idx] if round_idx < len(clearing) else "market_code"
    return "market_code"


def _compute_windows(config: dict, round_num: int) -> Tuple[int, int, int, int, bool]:
    general_cfg = config.get("general", {})
    round_span = int(general_cfg.get("round_hours", 6))
    start_time = general_cfg.get("start_time", "00:00")

    try:
        start_hour = int(str(start_time).split(":")[0])
    except Exception:
        start_hour = 0

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

    display_base_idx = (round_num - 1) * round_span
    display_span = round_span

    if round_num == 1:
        hours_in_day_1 = 24 - start_hour
        if baseline_mode == "edit_round_1":
            clearing_base_idx = 0
            clearing_span = hours_in_day_1
            display_base_idx = 0
            display_span = round_span
        else:
            clearing_base_idx = 0
            clearing_span = round_span
            display_base_idx = 0
            display_span = round_span
    else:
        hours_in_day_1 = 24 - start_hour
        id_gate_interval = int(general_cfg.get("id_gate_interval_hours", 4))
        id_gate_base = int(general_cfg.get("id_gate_base_hour", 0))

        display_base_idx = (round_num - 1) * round_span
        display_span = round_span

        current_sim_hour = hours_in_day_1 + (round_num - 2) * id_gate_interval
        gate_hour = id_gate_base
        while gate_hour < current_sim_hour:
            gate_hour += id_gate_interval

        clearing_base_idx = gate_hour
        clearing_span = id_gate_interval

    dam_status = _get_market_status(config, round_num, "dam")
    idm_status = _get_market_status(config, round_num, "idm")

    absolute_clearing_round = (
        (round_num == 1 and baseline_mode == "edit_round_1")
        or (round_num > 1 and dam_status != "off" and idm_status == "off")
    )

    return display_base_idx, display_span, clearing_base_idx, clearing_span, absolute_clearing_round


def _event_qty_modifier(events: list[dict]) -> Tuple[float, float]:
    """
    Conservative event adjustment for synthetic quantities:
    applies only events with target='all'.
    """
    mult = 1.0
    add = 0.0
    for e in events or []:
        if str(e.get("target", "all")).lower() == "all":
            try:
                mult *= float(e.get("multiplier", 1.0))
            except Exception:
                pass
            try:
                add += float(e.get("additive", 0.0))
            except Exception:
                pass
    return mult, add


def main():
    parser = argparse.ArgumentParser(description="Stündliche synthetische Angebots/Nachfrage-Mengen + KSE-Marktparameter")
    parser.add_argument("--session", type=int, required=True, help="Session ID")
    parser.add_argument("--round", dest="round_num", type=int, default=None, help="Runde (default: current_round der Session)")
    parser.add_argument("--json", action="store_true", help="JSON-Ausgabe")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        session = Session.query.get(args.session)
        if not session:
            raise SystemExit(f"Session {args.session} nicht gefunden")

        round_num = args.round_num or int(session.current_round or 1)
        config = _to_cfg(session.scenario.config)

        market = config.get("market", {})
        general = config.get("general", {})
        env = config.get("environment", {})

        display_base_idx, display_span, clearing_base_idx, clearing_span, absolute_clearing_round = _compute_windows(config, round_num)

        start_time = general.get("start_time", "00:00")
        fake_date = general.get("start_date", "2026-01-01")
        month = extract_month(fake_date)

        seed = str(env.get("seed") or f"session_{session.id}")

        dam_capacity_pct = float(market.get("dam_synthetic_capacity_pct", 90.0))
        idm_capacity_pct = float(market.get("idm_synthetic_capacity_pct", 10.0))
        idm_price_discount_producer = float(market.get("idm_price_discount_producer_pct", 10.0))
        idm_price_markup_consumer = float(market.get("idm_price_markup_consumer_pct", 10.0))

        active_events = select_events_for_round(config.get("events", []), round_num)
        evt_mult, evt_add = _event_qty_modifier(active_events)

        rows = []
        for hour_offset in range(display_span):
            hour_idx = display_base_idx + hour_offset
            hour_of_day = extract_hour_of_day(hour_idx, start_time)

            is_dam_clearing = absolute_clearing_round
            is_clearing_hour = clearing_base_idx <= hour_idx < (clearing_base_idx + clearing_span)

            base_supply, base_demand = generate_curves_from_config(
                config,
                seed=seed,
                hour_of_day=hour_of_day,
                month_of_year=month,
            )

            if is_dam_clearing or (not is_clearing_hour):
                market_type = "DAM"
                capacity_factor = dam_capacity_pct / 100.0
                supply = [(p, q * capacity_factor) for p, q in base_supply]
                demand = [(p, q * capacity_factor) for p, q in base_demand]
            else:
                market_type = "IDM"
                capacity_factor = idm_capacity_pct / 100.0
                price_factor_supply = 1.0 - (idm_price_discount_producer / 100.0)
                price_factor_demand = 1.0 + (idm_price_markup_consumer / 100.0)
                supply = [(p * price_factor_supply, q * capacity_factor) for p, q in base_supply]
                demand = [(p * price_factor_demand, q * capacity_factor) for p, q in base_demand]

            supply_qty = sum(q for _, q in supply)
            demand_qty = sum(q for _, q in demand)

            supply_qty_events = max(0.0, (supply_qty * evt_mult) + evt_add)
            demand_qty_events = max(0.0, (demand_qty * evt_mult) + evt_add)

            rows.append({
                "hour_idx": hour_idx,
                "hour_of_day": hour_of_day,
                "market_type_for_synthetic": market_type,
                "synthetic_supply_mw": round(supply_qty, 3),
                "synthetic_demand_mw": round(demand_qty, 3),
                "synthetic_supply_mw_with_events": round(supply_qty_events, 3),
                "synthetic_demand_mw_with_events": round(demand_qty_events, 3),
            })

        payload = {
            "session_id": session.id,
            "scenario_id": session.scenario_id,
            "round_num": round_num,
            "kse_market_params": {
                "price_floor": market.get("price_floor"),
                "price_cap": market.get("price_cap"),
                "dam_synthetic_capacity_pct": dam_capacity_pct,
                "idm_synthetic_capacity_pct": idm_capacity_pct,
                "idm_price_discount_producer_pct": idm_price_discount_producer,
                "idm_price_markup_consumer_pct": idm_price_markup_consumer,
                "enable_player_bidding": market.get("enable_player_bidding"),
            },
            "windows": {
                "display_base_idx": display_base_idx,
                "display_span": display_span,
                "clearing_base_idx": clearing_base_idx,
                "clearing_span": clearing_span,
            },
            "active_events": active_events,
            "event_adjustment_applied": {
                "target_all_multiplier": evt_mult,
                "target_all_additive_mw": evt_add,
                "note": "Event-Anpassung auf synthetische Mengen nutzt nur target=all Events.",
            },
            "hourly": rows,
        }

        if args.json:
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        else:
            print(f"Session {payload['session_id']} | Scenario {payload['scenario_id']} | Round {payload['round_num']}")
            print("KSE-Marktparameter:")
            for key, val in payload["kse_market_params"].items():
                print(f"  - {key}: {val}")
            print("Fenster:")
            for key, val in payload["windows"].items():
                print(f"  - {key}: {val}")
            print(f"Aktive Events: {len(active_events)} | target=all mult={evt_mult}, add={evt_add}")
            print("\nStündliche synthetische Mengen:")
            print("hour_idx | h_of_day | mode | supply_mw | demand_mw | supply_evt | demand_evt")
            for r in rows:
                print(
                    f"{r['hour_idx']:>7} | {r['hour_of_day']:>8} | {r['market_type_for_synthetic']:>4} | "
                    f"{r['synthetic_supply_mw']:>9.1f} | {r['synthetic_demand_mw']:>9.1f} | "
                    f"{r['synthetic_supply_mw_with_events']:>10.1f} | {r['synthetic_demand_mw_with_events']:>10.1f}"
                )


if __name__ == "__main__":
    main()
