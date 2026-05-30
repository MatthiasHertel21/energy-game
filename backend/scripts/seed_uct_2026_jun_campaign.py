"""
Seed the UCT June 2026 course campaign into the application database.

Course: Power Markets and Trading in Africa
Institution: Graduate School of Business, University of Cape Town
Campaign name: Power Markets and Trading in Africa (UCT 2026-Jun)

Run inside the backend container:
  python /app/scripts/seed_uct_2026_jun_campaign.py
"""

import json
import os
import re
import sys

sys.path.insert(0, "/app")
# os.chdir("/app")

from app import create_app
from app.extensions import db
from app.kse import sanitize_markets_config, validate_config
from app.models import Campaign, CampaignScenario, Cohort, CohortCampaign, CohortMember, Scenario, User


CAMPAIGN_NAME = "Power Markets and Trading in Africa (UCT 2026-Jun)"
LEGACY_CAMPAIGN_NAMES = [
    CAMPAIGN_NAME,
    "Power Markets and Trading (PFL)",
]
CAMPAIGN_DESCRIPTION = (
    "Five-scenario course campaign based on the June 2026 UCT workbook and schedule. "
    "The sequence moves from market mechanics to bidding strategy, grid constraints, "
    "forecast-driven trading, and a RES dominated system."
)
CAMPAIGN_SEED = "uct-2026-jun"
ADMIN_EMAIL = "admin@fastbreak.one"

SCENARIO_NAME_LEVEL1 = "Level 1 - Market mechanics"
SCENARIO_NAME_LEVEL2A = "Level 2a - Price formation bidding strategy"
SCENARIO_NAME_LEVEL2B = "Level 2b - Grid constraints and market power"
SCENARIO_NAME_LEVEL3A = "Level 3a - Forecating and information"
SCENARIO_NAME_LEVEL3B = "Level 3b - RES dominated system"

SCENARIO_ALIASES = {
    SCENARIO_NAME_LEVEL1: [SCENARIO_NAME_LEVEL1, "Level 1 – Market Foundations"],
    SCENARIO_NAME_LEVEL2A: [SCENARIO_NAME_LEVEL2A],
    SCENARIO_NAME_LEVEL2B: [SCENARIO_NAME_LEVEL2B],
    SCENARIO_NAME_LEVEL3A: [SCENARIO_NAME_LEVEL3A],
    SCENARIO_NAME_LEVEL3B: [SCENARIO_NAME_LEVEL3B],
}


def _deepcopy(payload: dict) -> dict:
    return json.loads(json.dumps(payload))


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "scenario"


def _round_hours(hours: int) -> list[str]:
    return ["on"] * hours


def _off_hours(hours: int) -> list[str]:
    return ["off"] * hours


def _cost_tiers(cost: float) -> list[dict]:
    return [{"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": cost}]


def _generator_challenges(player_type_id: str, prefix: str, revenue: int, profit: int, imbalance: int) -> list[dict]:
    return [
        {
            "id": f"{prefix}_revenue",
            "name": "Revenue target",
            "description": "Achieve the minimum total revenue target across the scenario.",
            "applicable_to": [player_type_id],
            "metric": "total_revenue",
            "operator": ">=",
            "target": revenue,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_profit",
            "name": "Profit discipline",
            "description": "Finish the scenario with a positive total profit.",
            "applicable_to": [player_type_id],
            "metric": "total_profit",
            "operator": ">=",
            "target": profit,
            "points": 60,
            "required": False,
            "per_round": False,
        },
        {
            "id": f"{prefix}_imbalance",
            "name": "Keep imbalance under control",
            "description": "Keep total imbalance cost within the scenario threshold.",
            "applicable_to": [player_type_id],
            "metric": "total_imbalance",
            "operator": "<=",
            "target": imbalance,
            "points": 40,
            "required": False,
            "per_round": False,
        },
    ]


def _generator_dispatch_challenges(player_type_id: str, prefix: str, revenue: int, profit: int, curtailment: int) -> list[dict]:
    return [
        {
            "id": f"{prefix}_revenue",
            "name": "Revenue target",
            "description": "Achieve the minimum total revenue target across the scenario.",
            "applicable_to": [player_type_id],
            "metric": "total_revenue",
            "operator": ">=",
            "target": revenue,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_profit",
            "name": "Profit discipline",
            "description": "Finish the scenario with a positive total profit.",
            "applicable_to": [player_type_id],
            "metric": "total_profit",
            "operator": ">=",
            "target": profit,
            "points": 60,
            "required": False,
            "per_round": False,
        },
        {
            "id": f"{prefix}_curtailment",
            "name": "Dispatch quality",
            "description": "Keep total curtailment below the scenario threshold.",
            "applicable_to": [player_type_id],
            "metric": "total_curtailment_rate",
            "operator": "<=",
            "target": curtailment,
            "points": 40,
            "required": False,
            "per_round": False,
        },
    ]


def _retail_challenges(player_type_id: str, prefix: str, cost: int, coverage: int, imbalance: int) -> list[dict]:
    return [
        {
            "id": f"{prefix}_cost",
            "name": "Cost control",
            "description": "Keep total procurement cost below the scenario target.",
            "applicable_to": [player_type_id],
            "metric": "total_cost",
            "operator": "<=",
            "target": cost,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_coverage",
            "name": "Security of supply",
            "description": "Maintain the minimum demand coverage target across the scenario.",
            "applicable_to": [player_type_id],
            "metric": "total_demand_coverage",
            "operator": ">=",
            "target": coverage,
            "points": 60,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_imbalance",
            "name": "Forecast discipline",
            "description": "Keep imbalance cost below the scenario threshold.",
            "applicable_to": [player_type_id],
            "metric": "total_imbalance",
            "operator": "<=",
            "target": imbalance,
            "points": 40,
            "required": False,
            "per_round": False,
        },
    ]


def _retail_procurement_challenges(player_type_id: str, prefix: str, cost: int, coverage: int, stretch_cost: int) -> list[dict]:
    return [
        {
            "id": f"{prefix}_cost",
            "name": "Cost control",
            "description": "Keep total procurement cost below the scenario target.",
            "applicable_to": [player_type_id],
            "metric": "total_cost",
            "operator": "<=",
            "target": cost,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_coverage",
            "name": "Security of supply",
            "description": "Maintain the minimum demand coverage target across the scenario.",
            "applicable_to": [player_type_id],
            "metric": "total_demand_coverage",
            "operator": ">=",
            "target": coverage,
            "points": 60,
            "required": True,
            "per_round": False,
        },
        {
            "id": f"{prefix}_stretch_cost",
            "name": "Stretch cost goal",
            "description": "Beat the base cost target with a more efficient procurement strategy.",
            "applicable_to": [player_type_id],
            "metric": "total_cost",
            "operator": "<=",
            "target": stretch_cost,
            "points": 40,
            "required": False,
            "per_round": False,
        },
    ]


def _coal_device(device_id: str, name: str, capacity: float, cost: float, zone: int, multi_bid: bool) -> dict:
    return {
        "id": device_id,
        "name": name,
        "type": "coal",
        "capacity_mw": capacity,
        "max_power_mw": capacity,
        "min_load_pct": 0,
        "ramp_rate_mw_per_h": capacity,
        "ramp_rate_mw_per_min": capacity,
        "variable_cost_tiers": _cost_tiers(cost),
        "variable_cost_zar_per_mwh": cost,
        "cost_per_mwh_zar": cost,
        "fixed_cost_zar_per_hour": 0,
        "enable_multi_bid": multi_bid,
        "zone": zone,
    }


def _pv_device(device_id: str, name: str, capacity: float, zone: int) -> dict:
    return {
        "id": device_id,
        "name": name,
        "type": "pv",
        "capacity_mw": capacity,
        "max_power_mw": capacity,
        "variable_cost_zar_per_mwh": 0,
        "cost_per_mwh_zar": 0,
        "fixed_cost_zar_per_hour": 250,
        "enable_multi_bid": True,
        "zone": zone,
    }


def _battery_device(device_id: str, name: str, power_mw: float, capacity_mwh: float, zone: int) -> dict:
    return {
        "id": device_id,
        "name": name,
        "type": "battery",
        "power_mw": power_mw,
        "power_rating_mw": power_mw,
        "capacity_mw": power_mw,
        "max_power_mw": power_mw,
        "capacity_mwh": capacity_mwh,
        "efficiency_pct": 90,
        "soc_min_pct": 10,
        "soc_max_pct": 95,
        "soc_initial_pct": 50,
        "variable_cost_zar_per_mwh": 10,
        "cost_per_mwh_zar": 10,
        "fixed_cost_zar_per_hour": 120,
        "enable_multi_bid": True,
        "zone": zone,
    }


def _load_device(device_id: str, name: str, baseline: float, peak: float, zone: int, drm_capable: bool) -> dict:
    return {
        "id": device_id,
        "name": name,
        "type": "industrial_load",
        "baseline_load_mw": baseline,
        "peak_load_mw": peak,
        "fixed_cost_zar_per_hour": 0,
        "drm_capable": drm_capable,
        "enable_multi_bid": True,
        "zone": zone,
    }


def _base_generator_only_config(name: str, fake_date: str, multi_bid: bool) -> dict:
    rounds = 6
    devices = [
        _coal_device("dev_gen_a", "Producer A Plant", 400, 400, 1, multi_bid),
        _coal_device("dev_gen_b", "Producer B Plant", 500, 500, 1, multi_bid),
        _coal_device("dev_gen_c", "Producer C Plant", 600, 600, 1, multi_bid),
    ]
    return {
        "version": "1.0.0",
        "general": {
            "id": _slugify(name),
            "title": name,
            "description": "",
            "fake_date": fake_date,
            "rounds": rounds,
            "round_span_hours": 1,
            "forecast_horizon_hours": rounds,
            "horizon_hours": rounds,
            "round_duration_seconds": 900,
            "freeze_hours": 0,
            "day_ahead_gate_hour": 8,
            "id_gate_base_hour": 0,
            "day_one_baseline_mode": "edit_round_one",
            "start_time": "08:00",
        },
        "structure": {"rounds": rounds, "hours_per_round": 1},
        "player_input": {
            "mode": "all_hours",
            "allow_other_rounds_editing": False,
            "hide_non_editable_hours": False,
            "enable_smooth_drag": True,
        },
        "devices": devices,
        "player_types": [
            {
                "id": "ptype_gen_a",
                "name": "Producer A",
                "zone": 1,
                "description": "Generator portfolio with 400 MW capacity and 400 ZAR/MWh marginal cost.",
                "devices": ["dev_gen_a"],
            },
            {
                "id": "ptype_gen_b",
                "name": "Producer B",
                "zone": 1,
                "description": "Generator portfolio with 500 MW capacity and 500 ZAR/MWh marginal cost.",
                "devices": ["dev_gen_b"],
            },
            {
                "id": "ptype_gen_c",
                "name": "Producer C",
                "zone": 1,
                "description": "Generator portfolio with 600 MW capacity and 600 ZAR/MWh marginal cost.",
                "devices": ["dev_gen_c"],
            },
        ],
        "markets": {
            "dam": {"trading": _round_hours(rounds)},
            "idm": {"trading": _off_hours(rounds)},
        },
        "market": {
            "base_price": 1800,
            "base_volume_mwh": 1200,
            "price_cap": 5000,
            "price_floor": 0,
            "random_price_pct": 0,
            "random_capacity_pct": 0,
            "enable_player_bidding": True,
            "bid_count": 3 if multi_bid else 1,
            "generator_mix": {"_none": {"blocks": 0, "zone_distribution_pct": [100]}},
            "consumer_mix": {"industrial": {"blocks": 10, "zone_distribution_pct": [100]}},
            "dam_synthetic_capacity_pct": 100,
            "idm_synthetic_capacity_pct": 0,
        },
        "grid": {
            "zones": 1,
            "atc": [[0]],
            "losses_pct_per_link": 0,
        },
        "balancing": {
            "up_price_zar_per_mwh": 1.0,
            "down_price_zar_per_mwh": 1.0,
        },
        "environment": {
            "seed": _slugify(name),
            "actual_noise_pct": 0,
            "groups": {},
        },
        "events": [],
        "objectives": "",
        "scoring": {
            "weights": {
                "profit": 0.6,
                "imbalance": 0.3,
                "curtailment": 0.1,
            }
        },
    }


def _add_retail_player(config: dict, device_id: str, device_name: str, baseline: float, peak: float, zone: int, type_id: str) -> dict:
    config["devices"].append(_load_device(device_id, device_name, baseline, peak, zone, True))
    config["player_types"].append(
        {
            "id": type_id,
            "name": "Retailers/Load",
            "zone": zone,
            "description": "Retail load portfolio that buys power in the DAM and learns how bidding affects clearing and procurement cost.",
            "devices": [device_id],
        }
    )
    return config


def _build_level1() -> dict:
    config = _base_generator_only_config(SCENARIO_NAME_LEVEL1, "2026-06-08", multi_bid=False)
    config["general"]["allow_dispatch_above_capacity"] = True
    config["balancing"] = {
        "price_mode": "smp_multiplier",
        "up_price_smp_pct": 120.0,
        "down_price_smp_pct": 80.0,
    }
    config["devices"][0]["name"] = "Coal Unit A (Low Cost)"
    config["devices"][1]["name"] = "Coal Unit B (Mid Cost)"
    config["devices"][2]["name"] = "Coal Unit C (High Cost)"
    config["general"]["description"] = (
        "Understand who does what, when, and how in the DAM. This entry scenario keeps the market to a single "
        "zone with fixed demand and no forecast uncertainty. Participants act as generators only and bid at cost "
        "to learn merit order, dispatch logic, SMP formation, and profit calculation. In every round, players "
        "should first predict dispatch and the SMP, then compare the result against the cleared market."
    )
    config["player_types"][0]["description"] = (
        "You operate the lowest-cost coal unit. Your main task is to recognise why low-cost capacity is dispatched first and how infra-marginal rents emerge."
    )
    config["player_types"][1]["description"] = (
        "You operate the mid-cost coal unit. Your role is to observe when you become the marginal unit and how small demand changes affect your dispatch."
    )
    config["player_types"][2]["description"] = (
        "You operate the highest-cost coal unit. Your role is to identify when your unit is needed to meet demand and how that changes the SMP for all generators."
    )
    config["events"] = [
        {
            "type": "task",
            "name": "Round 1 - Submit cost-based offers",
            "description": "Offer your available MW at cost. Before the market clears, write down which unit you expect to set the SMP.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 - Compare forecast and dispatch",
            "description": "After clearing, compare your expected dispatch with actual dispatch and explain the merit order in one sentence.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 - Explain the SMP",
            "description": "Identify which unit sets the SMP and how dispatch changes if demand rises slightly.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 4 - Test a different offered volume",
            "description": "Adjust offered MW and observe whether the merit order changes. Explain whether your action changes the SMP or only your own revenue.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 5 - Identify infra-marginal rent",
            "description": "Calculate how much margin you earn above marginal cost if you are dispatched below the SMP.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 5,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 6 - Review profit calculation",
            "description": "Calculate revenue, cost, and profit for your plant using the uniform clearing price.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 6,
            "duration_rounds": 1,
        },
    ]
    config["challenges"] = [
        *_generator_dispatch_challenges("ptype_gen_a", "l1_a", 400000, 100000, 5),
        *_generator_dispatch_challenges("ptype_gen_b", "l1_b", 300000, 50000, 8),
        *_generator_dispatch_challenges("ptype_gen_c", "l1_c", 200000, 25000, 10),
    ]
    config["objectives"] = (
        "# Level 1 - Market mechanics\n\n"
        "Focus: Market Foundations\n\n"
        "Learning objective: understand who does what, when, and how in the DAM.\n\n"
        "## What players should learn\n"
        "- who submits bids and who clears the market\n"
        "- how the merit order determines dispatch\n"
        "- why all dispatched generators receive the SMP\n\n"
        "## What to do each round\n"
        "- submit your offered MW at cost\n"
        "- predict the marginal unit before results are shown\n"
        "- compare dispatch, SMP, revenue, and profit after clearing\n\n"
        "## Round rhythm\n"
        "- Before clearing: enter a cost-based quantity offer and predict the price-setting unit\n"
        "- After clearing: identify dispatched MW, the marginal unit, and your margin above cost\n"
        "- Before the next round: explain whether a volume change would move the SMP or only your own revenue\n\n"
        "Participants play generator portfolios only. The market operator clears a fixed day-ahead demand."
    )
    return config


def _build_level2a() -> dict:
    config = _base_generator_only_config(SCENARIO_NAME_LEVEL2A, "2026-06-09", multi_bid=True)
    config = _add_retail_player(config, "dev_l2a_retail", "Retail Load Portfolio", 700, 950, 1, "ptype_l2a_retail")
    config["devices"][0]["name"] = "Coal Unit A (Low Cost)"
    config["devices"][1]["name"] = "Coal Unit B (Mid Cost)"
    config["devices"][2]["name"] = "Coal Unit C (High Cost)"
    config["general"]["description"] = (
        "Understand bidding and market clearing when teams can choose offer prices instead of bidding strictly at cost. "
        "The DAM remains deterministic, and participants now include two generator portfolios plus one retailer/load role. "
        "Each generating unit may split capacity into up to three blocks to trade off dispatch probability against margin. "
        "Every round should start with a written bidding plan and end with a comparison of price, dispatch, and procurement quality."
    )
    config["player_types"] = [
        {
            "id": "ptype_l2a_generators_core",
            "name": "Generators A",
            "zone": 1,
            "description": "Core generator portfolio with the low-cost and mid-cost coal units. Learn how to split blocks, protect dispatch, and still test markups.",
            "devices": ["dev_gen_a", "dev_gen_b"],
        },
        {
            "id": "ptype_l2a_generators_peak",
            "name": "Generators B",
            "zone": 1,
            "description": "Higher-cost generator portfolio with the marginal coal unit. Learn when scarcity gives you pricing power and when aggressive pricing leaves you out of merit.",
            "devices": ["dev_gen_c"],
        },
        {
            "id": "ptype_l2a_retail",
            "name": "Retailers/Load",
            "zone": 1,
            "description": "Retail load portfolio that buys power in the DAM and learns how procurement bids interact with strategic generator offers.",
            "devices": ["dev_l2a_retail"],
        },
    ]
    config["events"] = [
        {
            "type": "task",
            "name": "Round 1 - Build a bidding plan",
            "description": "Generators should write down a block-bidding plan before entering bids. Retailers/Load should set a procurement plan and a willingness-to-pay range.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 - Retail demand strategy",
            "description": "Retailers/Load should decide how much demand to cover at a secure price and when to risk a lower willingness-to-pay.",
            "target": "player",
            "target_id": "ptype_l2a_retail",
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 - Compare margin versus volume",
            "description": "Compare which generator portfolio protected dispatch with conservative pricing and which one pursued higher margin at the cost of lost volume.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 4 - Identify pivotal offers",
            "description": "Look for the hour where one offer block becomes price-setting and explain why that portfolio changed the market outcome.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 5 - Rebalance your strategy",
            "description": "Revise your pricing plan using what you learned about dispatch probability, price setting, and procurement risk.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 5,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 6 - Reflect on block bidding",
            "description": "Review how multi-bid blocks changed your risk profile and your ability to shape the supply curve.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 6,
            "duration_rounds": 1,
        },
    ]
    config["challenges"] = [
        *_generator_dispatch_challenges("ptype_l2a_generators_core", "l2a_core", 700000, 180000, 10),
        *_generator_dispatch_challenges("ptype_l2a_generators_peak", "l2a_peak", 250000, 50000, 15),
        *_retail_procurement_challenges("ptype_l2a_retail", "l2a_retail", 900000, 98, 850000),
    ]
    config["objectives"] = (
        "# Level 2a - Price formation bidding strategy\n\n"
        "Focus: Price formation and clearing\n\n"
        "Learning objective: understand bidding and market clearing.\n\n"
        "## What players should learn\n"
        "- how bid prices shape the supply curve\n"
        "- why multi-block bids change risk and expected margin\n"
        "- how procurement bids interact with strategic generation bids\n\n"
        "## What to do each round\n"
        "- write a bidding plan before entering data\n"
        "- compare high-margin versus high-volume strategies after clearing\n"
        "- revise your plan after seeing who actually set the price\n\n"
        "## Round rhythm\n"
        "- Before clearing: generators choose block structure and markups, retailers choose coverage and willingness-to-pay\n"
        "- After clearing: identify which offer block set the price and which portfolio gave up volume for margin\n"
        "- Before the next round: write one adjustment to your bidding logic based on the result\n\n"
        "This level keeps the deterministic DAM but uses two generator portfolios and one retailer/load portfolio so that competition remains visible without overloading the classroom."
    )
    return config


def _build_level2b() -> dict:
    config = _base_generator_only_config(SCENARIO_NAME_LEVEL2B, "2026-06-09", multi_bid=True)
    config = _add_retail_player(config, "dev_l2b_retail", "Retail Load Portfolio", 700, 950, 2, "ptype_l2b_retail")
    config["devices"][0]["name"] = "Zone 1 Coal Unit A"
    config["devices"][1]["name"] = "Zone 1 Coal Unit B"
    config["devices"][2]["name"] = "Zone 2 Coal Unit C"
    config["general"]["description"] = (
        "Understand bidding and market clearing under congestion. This scenario keeps the deterministic DAM and the "
        "participant roles from Level 2a, but introduces two grid zones and a constrained interconnector so that "
        "grid location and market power directly affect outcomes. Every round should compare the system view with the "
        "zonal view so players can see whether cost or location is driving the outcome."
    )
    config["devices"][0]["zone"] = 1
    config["devices"][1]["zone"] = 1
    config["devices"][2]["zone"] = 2
    config["player_types"][0]["zone"] = 1
    config["player_types"][1]["zone"] = 1
    config["player_types"][2]["zone"] = 2
    config["player_types"] = [
        {
            "id": "ptype_l2b_generators_zone1",
            "name": "Generators Zone 1",
            "zone": 1,
            "description": "Generator portfolio in Zone 1 with two coal units. Learn how congestion can leave you abundant in one zone but not decisive in the other.",
            "devices": ["dev_gen_a", "dev_gen_b"],
        },
        {
            "id": "ptype_l2b_generators_zone2",
            "name": "Generators Zone 2",
            "zone": 2,
            "description": "Generator portfolio in Zone 2 with the constrained-side marginal unit. Learn when location makes you pivotal.",
            "devices": ["dev_gen_c"],
        },
        {
            "id": "ptype_l2b_retail",
            "name": "Retailers/Load",
            "zone": 2,
            "description": "Retail load portfolio in Zone 2. Learn how congestion changes procurement cost and coverage risk.",
            "devices": ["dev_l2b_retail"],
        },
    ]
    config["market"]["consumer_mix"] = {
        "industrial": {"blocks": 10, "zone_distribution_pct": [45, 55]}
    }
    config["market"]["generator_mix"] = {
        "_none": {"blocks": 0, "zone_distribution_pct": [50, 50]}
    }
    config["grid"] = {
        "zones": 2,
        "atc": [
            [0, 250],
            [250, 0],
        ],
        "losses_pct_per_link": 0,
        "network_settlement": {
            "extra_cost_mode": "zonal_only",
            "cost_allocation_target": "consumers_only",
            "shortfall_price_mode": "smp_multiplier",
            "shortfall_price_value": 1.5,
        },
        "generator_curtailment_mode": "pro_rata",
    }
    config["events"] = [
        {
            "type": "task",
            "name": "Round 1 - Check your zone position",
            "description": "Submit bids and then compare dispatch, imports, and price pressure across Zone 1 and Zone 2.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 - Retail congestion check",
            "description": "Retailers/Load should check whether imports into Zone 2 are sufficient and explain the cost of congestion for procurement.",
            "target": "player",
            "target_id": "ptype_l2b_retail",
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 - Test locational leverage",
            "description": "Generator teams should ask whether their zone location gives them pricing power when the interconnector binds, and Retailers/Load should ask where they are exposed.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 4 - Assess congestion rents",
            "description": "Identify whether the interconnector binds and which plant becomes pivotal because of the grid constraint.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 5 - Revise bids by zone",
            "description": "Change offers or procurement willingness-to-pay by considering where scarcity sits in the network, not just the system total.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 5,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 6 - Reflect on market power",
            "description": "Review how location changed your bidding freedom and whether mitigation rules would alter the result.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 6,
            "duration_rounds": 1,
        },
    ]
    config["challenges"] = [
        *_generator_dispatch_challenges("ptype_l2b_generators_zone1", "l2b_zone1", 700000, 150000, 12),
        *_generator_dispatch_challenges("ptype_l2b_generators_zone2", "l2b_zone2", 300000, 60000, 15),
        *_retail_procurement_challenges("ptype_l2b_retail", "l2b_retail", 950000, 97, 900000),
    ]
    config["objectives"] = (
        "# Level 2b - Grid constraints and market power\n\n"
        "Focus: Price formation and clearing\n\n"
        "Learning objective: understand bidding and market clearing with two zones to reflect the impact of grid constraint on generators and retailer/load teams.\n\n"
        "## What players should learn\n"
        "- how congestion changes dispatch and procurement\n"
        "- why locational scarcity creates market power\n"
        "- how zone position matters even if total system demand is unchanged\n\n"
        "## What to do each round\n"
        "- compare zonal outcomes after each clearing\n"
        "- identify who becomes pivotal when the ATC binds\n"
        "- explain whether price changes are driven by cost, location, or both\n\n"
        "## Round rhythm\n"
        "- Before clearing: note your zone position and the likely direction of imports across the interconnector\n"
        "- After clearing: check whether the ATC bound and which zone became scarce\n"
        "- Before the next round: adjust bids or procurement to reflect locational exposure, not only system balance\n\n"
        "This level uses two generator portfolios and one retailer/load portfolio so the congestion lesson stays visible without too many simultaneous actors."
    )
    return config


def _base_forecast_config(name: str, fake_date: str) -> dict:
    rounds = 4
    return {
        "version": "1.0.0",
        "general": {
            "id": _slugify(name),
            "title": name,
            "description": "",
            "fake_date": fake_date,
            "rounds": rounds,
            "hours_per_round": 6,
            "round_span_hours": 6,
            "forecast_horizon_hours": 24,
            "horizon_hours": 24,
            "round_duration_seconds": 1500,
            "freeze_hours": 1,
            "day_ahead_gate_hour": 10,
            "id_gate_base_hour": 0,
            "day_one_baseline_mode": "edit_round_one",
            "start_time": "00:00",
        },
        "structure": {"rounds": rounds, "hours_per_round": 6},
        "player_input": {
            "mode": "all_hours",
            "allow_other_rounds_editing": False,
            "hide_non_editable_hours": False,
            "enable_smooth_drag": True,
        },
        "devices": [
            _coal_device("dev_thermal", "Thermal Generator", 600, 420, 1, True),
            _load_device("dev_retail_load", "Retail Portfolio", 500, 650, 1, True),
            _pv_device("dev_res_pv", "Solar Portfolio", 400, 1),
            _battery_device("dev_res_battery", "Battery Portfolio", 200, 600, 1),
        ],
        "player_types": [
            {
                "id": "ptype_generator",
                "name": "Generators",
                "zone": 1,
                "description": "Generator portfolio combining dispatchable and renewable assets for DAM and IDM bidding.",
                "devices": ["dev_thermal", "dev_res_pv", "dev_res_battery"],
            },
            {
                "id": "ptype_retail",
                "name": "Retailers/Load",
                "zone": 1,
                "description": "Retail load portfolio that must procure energy while managing balancing exposure.",
                "devices": ["dev_retail_load"],
            },
        ],
        "markets": {
            "dam": {"trading": ["on", "on", "on", "on"]},
            "idm": {"trading": ["on", "on", "on", "on"]},
        },
        "market": {
            "base_price": 1100,
            "base_volume_mwh": 1800,
            "price_cap": 5000,
            "price_floor": -500,
            "random_price_pct": 6,
            "random_capacity_pct": 6,
            "enable_player_bidding": True,
            "generator_mix": {
                "coal": 3,
                "gas": 2,
                "hydro": 1,
                "pv": 1,
                "wind": 1,
            },
            "consumer_mix": {
                "industrial": 2,
                "household": 2,
                "agriculture": 1,
            },
        },
        "balancing": {
            "up_price_zar_per_mwh": 2500,
            "down_price_zar_per_mwh": 300,
        },
        "grid": {
            "zones": 1,
            "atc": [[0]],
            "losses_pct_per_link": 0,
        },
        "environment": {
            "profile_preset": "Winter Weekday",
            "seed": _slugify(name),
            "actual_noise_pct": 12,
            "diurnal_profile": [
                0.72, 0.68, 0.65, 0.64, 0.66, 0.75,
                0.90, 1.05, 1.15, 1.10, 1.05, 1.00,
                0.95, 0.93, 0.95, 1.00, 1.10, 1.20,
                1.30, 1.28, 1.20, 1.10, 1.00, 0.85,
            ],
            "seasonal_factors": [
                1.00, 1.00, 1.00, 1.05, 1.10, 1.15,
                1.15, 1.10, 1.05, 1.00, 1.00, 1.00,
            ],
        },
        "events": [],
        "objectives": "",
        "scoring": {
            "weights": {
                "profit": 0.5,
                "imbalance": 0.3,
                "curtailment": 0.2,
            }
        },
    }


def _build_level3a() -> dict:
    config = _base_forecast_config(SCENARIO_NAME_LEVEL3A, "2026-06-10")
    config["devices"][0]["name"] = "Dispatchable Generator Portfolio"
    config["devices"][1]["name"] = "Retail Demand Portfolio"
    config["devices"][2]["name"] = "Solar Asset"
    config["devices"][3]["name"] = "Battery Asset"
    config["general"]["description"] = (
        "Trading under uncertainty plus managing imbalance risk. This level introduces DAM, IDM, and balancing settlement. "
        "Participants play generator and retailer/load roles while forecast updates for load and renewables force active intraday correction. "
        "The intended operating sequence each round is DAM position, forecast update, IDM correction, then balancing review."
    )
    config["player_types"][0]["description"] = (
        "You are the generator team. You submit DAM offers, revise positions in IDM, and manage renewable and battery uncertainty inside one portfolio."
    )
    config["player_types"][1]["description"] = (
        "You are the retailer/load team. You buy power for demand, react to forecast revisions, and reduce balancing penalties through timely IDM correction."
    )
    config["events"] = [
        {
            "type": "task",
            "name": "Round 1 - Submit DAM positions",
            "description": "Submit DAM offers and procurement positions for the first six hours using the initial forecast.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 - React to forecast updates",
            "description": "Use IDM to correct positions after updated load and RES information is released.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 - Check long versus short exposure",
            "description": "Decide whether you are long or short after the updated forecast and explain which IDM action best reduces balancing risk.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 4 - Review balancing exposure",
            "description": "Compare who managed uncertainty best and which player paid the highest imbalance cost.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "systemic",
            "name": "PV forecast revision",
            "description": "Cloud cover cuts renewable output below the day-ahead forecast and forces IDM adjustment.",
            "target": "player",
            "target_id": "ptype_generator",
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
            "multiplier": 0.7,
            "additive": 0,
        },
        {
            "type": "systemic",
            "name": "Retail demand revision",
            "description": "Load is revised upward and creates additional procurement pressure late in the session.",
            "target": "player",
            "target_id": "ptype_retail",
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
            "multiplier": 1.15,
            "additive": 0,
        },
    ]
    config["challenges"] = [
        *_generator_challenges("ptype_generator", "l3a_generator", 500000, 120000, 80000),
        *_retail_challenges("ptype_retail", "l3a_retail", 1400000, 97, 80000),
    ]
    config["objectives"] = (
        "# Level 3a - Forecating and information\n\n"
        "Focus: Forecast and information\n\n"
        "Learning objective: trading under uncertainty plus managing imbalance risk.\n\n"
        "## What players should learn\n"
        "- why DAM decisions can still fail after the forecast changes\n"
        "- how IDM helps reduce balancing exposure\n"
        "- how to diagnose whether your portfolio is long or short\n\n"
        "## What to do each round\n"
        "- lock in an initial DAM position\n"
        "- react to updated information in IDM\n"
        "- compare your balancing cost with the other team at the end of each round\n\n"
        "## Round rhythm\n"
        "- Before the update: state whether your DAM position is likely to leave you long or short\n"
        "- After the update: use IDM to correct the part of the position that changed most\n"
        "- End of round: explain whether balancing cost came from forecast error, slow reaction, or both"
    )
    return config


def _build_level3b() -> dict:
    config = _base_forecast_config(SCENARIO_NAME_LEVEL3B, "2026-06-11")
    config["general"]["description"] = (
        "Trading under uncertainty in a RES dominated system. The thermal fleet is smaller, renewable output is larger and more volatile, "
        "and the battery becomes central to intraday correction and balancing risk management. Each round should make "
        "players decide whether to use flexibility now or preserve it for the evening ramp."
    )
    config["devices"] = [
        _coal_device("dev_flex_thermal", "Flexible Thermal Unit", 250, 650, 1, True),
        _load_device("dev_res_load", "Retail Portfolio", 500, 700, 1, True),
        _pv_device("dev_resdom_pv", "Large Solar Portfolio", 600, 1),
        _battery_device("dev_resdom_battery", "Large Battery Portfolio", 250, 750, 1),
    ]
    config["player_types"] = [
        {
            "id": "ptype_generator",
            "name": "Generators",
            "zone": 1,
            "description": "Generator portfolio in a RES dominated system with residual thermal backup, solar, and battery flexibility.",
            "devices": ["dev_flex_thermal", "dev_resdom_pv", "dev_resdom_battery"],
        },
        {
            "id": "ptype_res_load",
            "name": "Retailers/Load",
            "zone": 1,
            "description": "Retail load portfolio that must manage higher volatility and evening peaks.",
            "devices": ["dev_res_load"],
        },
    ]
    config["market"]["generator_mix"] = {
        "gas": 1,
        "hydro": 1,
        "pv": 4,
        "wind": 4,
        "coal": 1,
    }
    config["market"]["random_capacity_pct"] = 10
    config["environment"]["actual_noise_pct"] = 16
    config["events"] = [
        {
            "type": "task",
            "name": "Round 1 - Establish the day-ahead position",
            "description": "Use DAM bids to position for a high-renewable system with midday surplus and an evening ramp.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 - Use flexibility",
            "description": "Recharge or discharge the battery strategically and use IDM to respond to renewable forecast changes.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 - Prepare for the evening ramp",
            "description": "Plan how the generator portfolio will preserve flexibility for later scarcity hours and how retail demand will manage procurement risk before the peak.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 4 - Manage the evening peak",
            "description": "Protect the portfolio during the evening net-load ramp when residual thermal flexibility becomes scarce.",
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "systemic",
            "name": "Cloud cover event",
            "description": "Renewable output drops well below plan and tests the battery strategy.",
            "target": "player",
            "target_id": "ptype_generator",
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
            "multiplier": 0.55,
            "additive": 0,
        },
        {
            "type": "systemic",
            "name": "Evening demand spike",
            "description": "Demand rises sharply in the final round and increases balancing risk for all players.",
            "target": "player",
            "target_id": "ptype_res_load",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
            "multiplier": 1.2,
            "additive": 0,
        },
    ]
    config["challenges"] = [
        *_generator_challenges("ptype_generator", "l3b_generator", 550000, 140000, 90000),
        *_retail_challenges("ptype_res_load", "l3b_retail", 1500000, 96, 90000),
    ]
    config["objectives"] = (
        "# Level 3b - RES dominated system\n\n"
        "Focus: Forecast and information\n\n"
        "Learning objective: trading under uncertainty plus managing imbalance risk in a RES dominated system.\n\n"
        "## What players should learn\n"
        "- how a RES dominated system shifts value toward flexibility\n"
        "- why batteries matter for both market timing and risk control\n"
        "- how evening ramps create scarcity after renewable output falls\n\n"
        "## What to do each round\n"
        "- position for midday renewable abundance\n"
        "- use the battery to move value into scarcity hours\n"
        "- compare balancing cost and revenue quality after the evening peak\n\n"
        "## Round rhythm\n"
        "- Before clearing: decide how much flexibility to keep for later scarcity hours\n"
        "- After each forecast change: choose whether the battery should protect balance, capture price, or both\n"
        "- End of round: explain whether the evening ramp was solved by timing, thermal backup, or procurement discipline"
    )
    return config


def _scenario_specs() -> list[tuple[str, dict]]:
    return [
        (SCENARIO_NAME_LEVEL1, _build_level1()),
        (SCENARIO_NAME_LEVEL2A, _build_level2a()),
        (SCENARIO_NAME_LEVEL2B, _build_level2b()),
        (SCENARIO_NAME_LEVEL3A, _build_level3a()),
        (SCENARIO_NAME_LEVEL3B, _build_level3b()),
    ]


def _prepare_config(config: dict) -> dict:
    prepared = sanitize_markets_config(_deepcopy(config))
    errors = validate_config(prepared)
    if errors:
        raise RuntimeError("Invalid scenario config:\n- " + "\n- ".join(errors))
    return prepared


def _find_campaign() -> Campaign | None:
    return Campaign.query.filter(Campaign.name.in_(LEGACY_CAMPAIGN_NAMES)).order_by(Campaign.id.desc()).first()


def _find_scenario(name: str) -> Scenario | None:
    aliases = SCENARIO_ALIASES[name]
    return Scenario.query.filter(Scenario.name.in_(aliases)).order_by(Scenario.id.asc()).first()


def _assign_campaign_to_admin_cohorts(campaign_id: int, admin_user_id: int) -> list[tuple[int, str]]:
    rows = (
        db.session.query(Cohort.id, Cohort.name)
        .join(CohortMember, CohortMember.cohort_id == Cohort.id)
        .filter(CohortMember.user_id == admin_user_id)
        .order_by(Cohort.id.asc())
        .all()
    )
    assigned = []
    for cohort_id, cohort_name in rows:
        mapping = CohortCampaign.query.filter_by(cohort_id=cohort_id, campaign_id=campaign_id).first()
        if mapping is None:
            mapping = CohortCampaign(
                cohort_id=cohort_id,
                campaign_id=campaign_id,
                visible=True,
                active=True,
            )
        else:
            mapping.visible = True
            mapping.active = True
        db.session.add(mapping)
        assigned.append((cohort_id, cohort_name))
    return assigned


def seed() -> None:
    app = create_app()
    with app.app_context():
        admin = User.query.filter_by(email=ADMIN_EMAIL).first()
        if not admin:
            print(f"ERROR: {ADMIN_EMAIL} not found. Run the app first to create users.")
            sys.exit(1)

        campaign = _find_campaign()
        if campaign is None:
            campaign = Campaign(
                name=CAMPAIGN_NAME,
                description=CAMPAIGN_DESCRIPTION,
                designer_id=admin.id,
                published=True,
                seed=CAMPAIGN_SEED,
            )
            db.session.add(campaign)
            db.session.flush()
            print(f"Created campaign '{campaign.name}' (id={campaign.id})")
        else:
            campaign.name = CAMPAIGN_NAME
            campaign.description = CAMPAIGN_DESCRIPTION
            campaign.designer_id = admin.id
            campaign.published = True
            campaign.seed = CAMPAIGN_SEED
            db.session.add(campaign)
            db.session.flush()
            print(f"Updated campaign '{campaign.name}' (id={campaign.id})")

        seeded_scenarios = []
        for scenario_name, raw_config in _scenario_specs():
            scenario = _find_scenario(scenario_name)
            prepared_config = _prepare_config(raw_config)
            if scenario is None:
                scenario = Scenario(
                    name=scenario_name,
                    campaign_id=campaign.id,
                    config=prepared_config,
                )
                db.session.add(scenario)
                db.session.flush()
                print(f"Created scenario '{scenario.name}' (id={scenario.id})")
            else:
                scenario.name = scenario_name
                scenario.campaign_id = campaign.id
                scenario.config = prepared_config
                db.session.add(scenario)
                db.session.flush()
                print(f"Updated scenario '{scenario.name}' (id={scenario.id})")
            seeded_scenarios.append(scenario)

        existing_links = CampaignScenario.query.filter_by(campaign_id=campaign.id).all()
        for link in existing_links:
            db.session.delete(link)
        db.session.flush()

        for order_index, scenario in enumerate(seeded_scenarios):
            db.session.add(
                CampaignScenario(
                    campaign_id=campaign.id,
                    scenario_id=scenario.id,
                    order_index=order_index,
                    solo_enabled=True,
                    cohort_enabled=True,
                )
            )

        assigned_cohorts = _assign_campaign_to_admin_cohorts(campaign.id, admin.id)

        db.session.commit()

        payload = {
            "campaign_id": campaign.id,
            "campaign_name": campaign.name,
            "scenario_ids": [scenario.id for scenario in seeded_scenarios],
            "scenario_names": [scenario.name for scenario in seeded_scenarios],
            "assigned_cohorts": [
                {"id": cohort_id, "name": cohort_name}
                for cohort_id, cohort_name in assigned_cohorts
            ],
        }
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    seed()