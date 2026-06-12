"""Seed a single-player "Demo Level 2b - Grid constraints and market power" scenario
and attach it to the existing "Demo Campaign for Power Markets and Trading" (id 8).

This is the solo-playable adaptation of "Level 2b - Grid constraints and market power"
(scenario id 17). The multi-team grid scenario is reduced to one human role: the operator
of the only flexible generator inside the import-constrained Zone 2. The Zone 1 fleet and
a Zone 2 backstop unit are modelled as fixed synthetic system supply so the congestion and
market-power lesson stays visible with a single participant.

Idempotent: if a scenario with the target name already exists it is updated in place and the
campaign link is ensured.

Run inside the backend container:
    docker-compose exec -T backend python scripts/seed_demo_level2b.py
"""

import sys
import os

sys.path.insert(0, '/app')
os.chdir('/app')

from app import create_app
from app.extensions import db
from app.models import Scenario, CampaignScenario


DEMO_CAMPAIGN_ID = 8
SOURCE_SCENARIO_NAME = "Level 2b - Grid constraints and market power"
NEW_SCENARIO_NAME = "Demo Level 2b - Grid constraints and market power"

PLAYER_TYPE_ID = "ptype_demo_l2b_gen_z2"
DEVICE_ID = "device_demo_l2b_z2"

# Industrial demand shape: flat overnight, drop to 75% at 09:00 (idx 9) and 50% at 10:00
# (idx 10). The three played rounds start at 08:00, so demand falls round over round and the
# Zone 2 generator's pricing power shrinks as imports cover more of the load.
DEMAND_PROFILE = [
    0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 0.75, 0.5, 1.0,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95,
]
FLAT_PROFILE = [1.0] * 24
FLAT_SEASONAL = [1.0] * 12


def _gen_block(blocks, zone_dist, price):
    return {
        "blocks": blocks,
        "zone_distribution_pct": zone_dist,
        "profile": FLAT_PROFILE,
        "seasonal_profile": FLAT_SEASONAL,
        "price_min": price,
        "price_max": price,
    }


def _empty_gen_block(zone_dist):
    return {"blocks": 0, "zone_distribution_pct": zone_dist}


def _build_config() -> dict:
    # Synthetic supply (normalised to base_volume_mwh, then split per zone):
    #   Zone 1 cheap coal  -> 8/15 * 3000 = 1600 MWh @ 450  (abundant, export-capped by ATC)
    #   Zone 2 backstop gas-> 7/15 * 3000 = 1400 MWh @ 700  (caps the human's markup)
    generator_mix = {
        "coal": _gen_block(8, [100, 0], 450),
        "gas": _gen_block(7, [0, 100], 700),
        "pv": _empty_gen_block([50, 50]),
        "wind": _empty_gen_block([50, 50]),
        "hydro": _empty_gen_block([50, 50]),
        "nuclear": _empty_gen_block([50, 50]),
    }

    consumer_mix = {
        "industrial": {
            "blocks": 1,
            "zone_distribution_pct": [45, 55],
            "profile": DEMAND_PROFILE,
            "seasonal_profile": FLAT_SEASONAL,
            "price_min": 3000,
            "price_max": 3000,
        },
        "household": {"blocks": 0, "zone_distribution_pct": [50, 50]},
        "agriculture": {"blocks": 0, "zone_distribution_pct": [50, 50]},
    }

    config = {
        "version": "1.0.0",
        "general": {
            "id": "demo_level_2b_grid_constraints_and_market_power",
            "title": NEW_SCENARIO_NAME,
            "description": (
                "Single-player version of Level 2b. You operate the only flexible generator "
                "inside the import-constrained Zone 2. Cheap Zone 1 power can only reach you up "
                "to the 250 MW interconnector limit, so the rest of Zone 2 demand must be served "
                "locally - by you. Demand starts high and then drops to 75% at 09:00 and 50% at "
                "10:00 so you can see how congestion gives you locational market power and how "
                "that power shrinks as the load falls."
            ),
            "fake_date": "2026-06-09",
            "rounds": 3,
            "round_span_hours": 1,
            "forecast_horizon_hours": 4,
            "horizon_hours": 3,
            "round_duration_seconds": 900,
            "freeze_hours": 0,
            "day_ahead_gate_hour": 8,
            "id_gate_base_hour": 0,
            "day_one_baseline_mode": "edit_round_one",
            "start_time": "08:00",
            "zonal_pricing_v1_enabled": True,
            "disable_ramp_validation": True,
        },
        "structure": {"rounds": 6, "hours_per_round": 1},
        "player_input": {
            "mode": "all_hours",
            "editable_offsets": [],
            "hide_non_editable_hours": False,
            "allow_other_rounds_editing": False,
            "enable_smooth_drag": False,
        },
        "devices": [
            {
                "id": DEVICE_ID,
                "name": "Zone 2 Coal Unit (Your Plant)",
                "type": "coal",
                "capacity_mw": 1500,
                "max_power_mw": 1500,
                "min_load_pct": 0,
                "ramp_rate_mw_per_h": 400,
                "ramp_rate_mw_per_min": 400,
                "variable_cost_tiers": [
                    {"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 500}
                ],
                "variable_cost_zar_per_mwh": 500,
                "cost_per_mwh_zar": 500,
                "fixed_cost_zar_per_hour": 0,
                "enable_multi_bid": True,
                "zone": 2,
                "co2_emissions_kg_per_mwh": 950,
                "bid_count": 1,
                "default_bids": {"A": {"price": 600, "share_pct": 80}},
            }
        ],
        "player_types": [
            {
                "id": PLAYER_TYPE_ID,
                "name": "Zone 2 Generator",
                "zone": 2,
                "devices": [DEVICE_ID],
                "description": (
                    "You operate the only flexible generator inside the import-constrained Zone 2. "
                    "Cheap Zone 1 power can only reach you up to the interconnector limit, so learn "
                    "when congestion makes you pivotal and how far you can mark up your offer before "
                    "imports plus the local backstop unit price you out."
                ),
            }
        ],
        "markets": {
            "dam": {"trading": ["on", "on", "on", "on", "on", "on"]},
            "idm": {"trading": ["off", "off", "off", "off", "off", "off"]},
        },
        "market": {
            "base_price": 1800,
            "base_volume_mwh": 3000,
            "price_cap": 5000,
            "price_floor": 0,
            "random_price_pct": 0,
            "random_capacity_pct": 0,
            "enable_player_bidding": True,
            "bid_count": 3,
            "generator_mix": generator_mix,
            "consumer_mix": consumer_mix,
            "dam_synthetic_capacity_pct": 100,
            "idm_synthetic_capacity_pct": 0,
        },
        "grid": {
            "zones": 2,
            "atc": [[0, 250], [250, 0]],
            "losses_pct_per_link": 0,
            "network_settlement": {
                "extra_cost_mode": "zonal_only",
                "cost_allocation_target": "consumers_only",
                "shortfall_price_mode": "smp_multiplier",
                "shortfall_price_value": 1.5,
            },
            "generator_curtailment_mode": "pro_rata",
        },
        "balancing": {
            "price_mode": "smp_multiplier",
            "up_price_zar_per_mwh": 1,
            "down_price_zar_per_mwh": 120,
            "up_price_smp_pct": 120,
            "down_price_smp_pct": 120,
        },
        "environment": {
            "seed": "demo_level_2b_grid_constraints_and_market_power",
            "actual_noise_pct": 0,
            "groups": {
                "coal": _gen_block(8, [100, 0], 450),
                "gas": _gen_block(7, [0, 100], 700),
                "pv": _empty_gen_block([50, 50]),
                "wind": _empty_gen_block([50, 50]),
                "hydro": _empty_gen_block([50, 50]),
                "nuclear": _empty_gen_block([50, 50]),
            },
        },
        "events": [
            {
                "type": "task",
                "name": "R1 - Find your locational position",
                "description": (
                    "Submit your offer. You operate the only flexible generator inside Zone 2, the "
                    "import-constrained side of the grid. Before the market clears: cheap Zone 1 power "
                    "can only reach Zone 2 up to the 250 MW interconnector limit, so any Zone 2 demand "
                    "beyond that must be served locally - by you. Predict the Zone 1 and Zone 2 prices "
                    "and whether the interconnector will bind."
                ),
                "target": "player",
                "target_id": PLAYER_TYPE_ID,
                "trigger_type": "round",
                "trigger_value": 1,
                "duration_rounds": 1,
            },
            {
                "type": "task",
                "name": "R2 - Test your market power",
                "description": (
                    "Compare the Zone 1 and Zone 2 prices from round 1: the gap is congestion rent and "
                    "you sit on the expensive side. Demand is now lower. Experiment by raising your offer "
                    "above your 500 ZAR/MWh variable cost. How far can you push the price before imports "
                    "plus the Zone 2 backstop unit (around 700 ZAR/MWh) cover all demand and you lose "
                    "dispatch?"
                ),
                "target": "player",
                "target_id": PLAYER_TYPE_ID,
                "trigger_type": "round",
                "trigger_value": 2,
                "duration_rounds": 1,
            },
            {
                "type": "task",
                "name": "R3 - Optimise locational profit",
                "description": (
                    "Final round, demand is lowest. Design the offer that maximises your total profit "
                    "given the grid constraint. Balance a higher markup (more margin per MWh) against the "
                    "risk that imports plus the local backstop fully cover Zone 2 demand and price you out. "
                    "Note the bid where your locational market power is greatest and explain in one sentence "
                    "why lower demand weakened it."
                ),
                "target": "player",
                "target_id": PLAYER_TYPE_ID,
                "trigger_type": "round",
                "trigger_value": 3,
                "duration_rounds": 1,
            },
        ],
        "objectives": (
            "# Demo Level 2b - Grid constraints and market power\n\n"
            "Focus: Price formation and clearing under congestion\n\n"
            "Learning objective: understand how a constrained interconnector creates a zonal price "
            "spread and gives a local generator market power, in a solo setup.\n\n"
            "## What you should learn\n"
            "- how the 250 MW interconnector limit splits the system into a cheap Zone 1 and an "
            "expensive Zone 2\n"
            "- why being the pivotal local supplier lets you mark up above your variable cost\n"
            "- how falling demand and the Zone 2 backstop unit limit that market power\n\n"
            "## What to do each round\n"
            "- choose an offer price and write down whether you expect the interconnector to bind\n"
            "- compare the Zone 1 and Zone 2 clearing prices after the round and read off the "
            "congestion rent\n"
            "- revise your markup using what you learned from the previous round\n\n"
            "## Round rhythm\n"
            "- Before clearing: estimate Zone 2 demand minus the 250 MW of imports - that residual is "
            "what only you can serve\n"
            "- After clearing: check the zonal price spread and your dispatch and margin\n"
            "- Before the next round: decide whether lower demand calls for a smaller or larger markup\n\n"
            "This demo keeps one human player and models the Zone 1 fleet and a Zone 2 backstop unit as "
            "fixed synthetic system supply so the congestion lesson stays visible solo."
        ),
        "scoring": {"weights": {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1}},
        "challenges": [
            {
                "id": "demo_l2b_z2_revenue",
                "name": "Revenue target",
                "description": "Achieve the minimum total revenue target across the scenario.",
                "applicable_to": [PLAYER_TYPE_ID],
                "metric": "total_revenue",
                "operator": ">=",
                "target": 600000,
                "points": 100,
                "required": True,
                "per_round": False,
            },
            {
                "id": "demo_l2b_z2_profit",
                "name": "Profit discipline",
                "description": "Finish the scenario with a healthy total profit by using your locational market power.",
                "applicable_to": [PLAYER_TYPE_ID],
                "metric": "total_profit",
                "operator": ">=",
                "target": 120000,
                "points": 60,
                "required": False,
                "per_round": False,
            },
            {
                "id": "demo_l2b_z2_curtailment",
                "name": "Dispatch quality",
                "description": "Keep total curtailment below the scenario threshold - do not price yourself out of dispatch.",
                "applicable_to": [PLAYER_TYPE_ID],
                "metric": "total_curtailment_rate",
                "operator": "<=",
                "target": 15,
                "points": 40,
                "required": False,
                "per_round": False,
            },
        ],
    }
    config["name"] = NEW_SCENARIO_NAME
    return config


def main():
    app = create_app()
    with app.app_context():
        config = _build_config()

        scenario = Scenario.query.filter_by(name=NEW_SCENARIO_NAME).first()
        if scenario is None:
            scenario = Scenario(
                name=NEW_SCENARIO_NAME,
                campaign_id=DEMO_CAMPAIGN_ID,
                config=config,
            )
            db.session.add(scenario)
            db.session.flush()
            print(f"Created scenario '{NEW_SCENARIO_NAME}' (id={scenario.id})")
        else:
            scenario.config = config
            scenario.campaign_id = DEMO_CAMPAIGN_ID
            print(f"Updated existing scenario '{NEW_SCENARIO_NAME}' (id={scenario.id})")

        link = CampaignScenario.query.filter_by(
            campaign_id=DEMO_CAMPAIGN_ID, scenario_id=scenario.id
        ).first()
        if link is None:
            next_order = (
                db.session.query(db.func.max(CampaignScenario.order_index))
                .filter(CampaignScenario.campaign_id == DEMO_CAMPAIGN_ID)
                .scalar()
            )
            next_order = (next_order + 1) if next_order is not None else 0
            link = CampaignScenario(
                campaign_id=DEMO_CAMPAIGN_ID,
                scenario_id=scenario.id,
                order_index=next_order,
                solo_enabled=True,
                cohort_enabled=False,
            )
            db.session.add(link)
            print(f"Linked to campaign {DEMO_CAMPAIGN_ID} at order_index={next_order} (solo only)")
        else:
            link.solo_enabled = True
            link.cohort_enabled = False
            print(f"Campaign link already present (order_index={link.order_index}); ensured solo only")

        db.session.commit()
        print("Done.")


if __name__ == "__main__":
    main()
