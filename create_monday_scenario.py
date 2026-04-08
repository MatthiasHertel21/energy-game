"""
Creates the "Monday" scenario in the energy-game database.
Run inside the backend container or with backend dependencies available.
"""
import json
import sys
import os

sys.path.insert(0, '/app')
os.chdir('/app')

from app import create_app
from app.extensions import db
from app.models import Scenario

SCENARIO_CONFIG = {
    "version": "1.0.0",

    # ── General ─────────────────────────────────────────────────────────────
    "general": {
        "id": "scenario_monday_v1",
        "description": (
            "Monday Market Simulation – A training scenario covering day-ahead "
            "and intraday markets over a full trading day with 4 rounds of 6 hours each. "
            "Two network zones with limited inter-zone capacity create real grid tension. "
            "In Round 3 a technical outage hits the coal producer. "
            "In Round 4 a cold snap reduces solar output and drives up demand."
        ),
        "fake_date": "2025-01-06",
        "rounds": 4,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 24,
        "horizon_hours": 24,
        "round_duration_seconds": 1800,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 10,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 0,
    },

    # ── Structure ─────────────────────────────────────────────────────────
    "structure": {
        "rounds": 4,
        "hours_per_round": 6,
    },

    # ── Devices ──────────────────────────────────────────────────────────
    "devices": [
        {
            "id": "device_monday_coal_001",
            "name": "River Coal Plant",
            "type": "coal",
            "capacity_mw": 400,
            "max_power_mw": 400,
            "min_load_pct": 10,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 2000,
            "ramp_rate_mw_per_h": 100,
            "ramp_rate_mw_per_min": 50,
            "efficiency_pct": 36,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "device_monday_load_001",
            "name": "Industrial Complex",
            "type": "industrial_load",
            "baseline_load_mw": 250,
            "peak_load_mw": 360,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": True,
            "enable_multi_bid": True,
            "zone": 2,
        },
        {
            "id": "device_monday_pv_001",
            "name": "Solar Farm North",
            "type": "pv",
            "capacity_mw": 180,
            "max_power_mw": 180,
            "variable_cost_zar_per_mwh": 0,
            "cost_per_mwh_zar": 0,
            "fixed_cost_zar_per_hour": 500,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "device_monday_bat_001",
            "name": "Grid Battery",
            "type": "battery",
            "power_mw": 80,
            "power_rating_mw": 80,
            "capacity_mwh": 240,
            "efficiency_pct": 90,
            "soc_min_pct": 10,
            "soc_max_pct": 95,
            "soc_initial_pct": 50,
            "variable_cost_zar_per_mwh": 10,
            "cost_per_mwh_zar": 10,
            "fixed_cost_zar_per_hour": 200,
            "enable_multi_bid": True,
            "zone": 1,
        },
    ],

    # ── Player Types ──────────────────────────────────────────────────────
    "player_types": [
        {
            "id": "ptype_monday_producer",
            "name": "Producer",
            "zone": 1,
            "description": (
                "Conventional power producer operating a coal plant in Zone 1. "
                "Maximize profit through strategic bidding in day-ahead and intraday markets. "
                "Beware of a technical outage in Round 3 that severely limits your capacity."
            ),
            "devices": ["device_monday_coal_001"],
        },
        {
            "id": "ptype_monday_consumer",
            "name": "Consumer",
            "zone": 2,
            "description": (
                "Large industrial consumer in Zone 2. "
                "The grid link from Zone 1 is heavily constrained — you face real shortfall risk. "
                "Minimize procurement costs while securing reliable supply. "
                "In Round 4, a cold snap significantly increases your energy demand."
            ),
            "devices": ["device_monday_load_001"],
        },
        {
            "id": "ptype_monday_pvbat",
            "name": "PV Battery",
            "zone": 1,
            "description": (
                "Renewable prosumer with a solar farm and grid-scale battery in Zone 1. "
                "Earn revenue from PV generation, use the battery to shift energy and arbitrage. "
                "In Round 4, a cold snap with heavy cloud cover reduces solar output dramatically."
            ),
            "devices": ["device_monday_pv_001", "device_monday_bat_001"],
        },
    ],

    # ── Markets ──────────────────────────────────────────────────────────
    "markets": {
        "dam": {
            "trading": ["on", "on", "on", "on"],
        },
        "idm": {
            "trading": ["on", "on", "on", "on"],
        },
    },

    # ── Market background ─────────────────────────────────────────────────
    "market": {
        "base_price": 1100,
        "base_volume_mwh": 1800,
        "price_cap": 5000,
        "price_floor": -500,
        "random_price_pct": 8,
        "random_capacity_pct": 8,
        "enable_player_bidding": True,
        "generator_mix": {
            "coal": 4,
            "gas": 2,
            "hydro": 1,
            "nuclear": 0,
            "pv": 1,
            "wind": 1,
        },
        "consumer_mix": {
            "industrial": 2,
            "agriculture": 1,
            "household": 2,
        },
        "balancing_up_price": 2500,
        "balancing_down_price": 200,
    },

    # ── Grid / Two Zones ──────────────────────────────────────────────────
    # ATC 160 MW: consumer zone needs ~250-360 MW but can only import 160 MW
    # from producer zone → strong grid constraint, real risk of shortfall.
    "grid": {
        "zones": 2,
        "atc": [
            [0,   160],
            [160, 0  ],
        ],
    },

    # ── Environment ───────────────────────────────────────────────────────
    # Winter weekday profile (South Africa winter = June/July, cold mornings)
    "environment": {
        "profile_preset": "Winter Weekday",
        "seed": "monday_v1",
        "actual_noise_pct": 8,
        "diurnal_profile": [
            # h0   h1   h2   h3   h4   h5   h6   h7   h8   h9   h10  h11
            0.72, 0.68, 0.65, 0.64, 0.66, 0.75, 0.90, 1.05, 1.15, 1.10, 1.05, 1.00,
            # h12  h13  h14  h15  h16  h17  h18  h19  h20  h21  h22  h23
            0.95, 0.93, 0.95, 1.00, 1.10, 1.20, 1.30, 1.28, 1.20, 1.10, 1.00, 0.85,
        ],
        "seasonal_factors": [
            # Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
            1.00, 1.00, 1.00, 1.05, 1.10, 1.15, 1.15, 1.10, 1.05, 1.00, 1.00, 1.00,
        ],
    },

    # ── Events ────────────────────────────────────────────────────────────
    "events": [
        # ── Round todos (tasks) ──────────────────────────────────────────
        {
            "type": "task",
            "name": "R1 – Submit Day-Ahead Bids",
            "description": (
                "Set your Day-Ahead bids for all 6 hours of Round 1. "
                "Review the 24-hour load forecast and price forecast before bidding. "
                "Producers: ensure your bid price covers variable and fixed costs. "
                "Consumers: bid high enough to secure supply."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R1 – Check Grid Zone Status",
            "description": (
                "After the DAM clears, review the Zone Results card. "
                "Note the ATC constraint between Zone 1 and Zone 2 (max 160 MW). "
                "If you are in Zone 2: verify that your demand is fully covered."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R1 – Set Battery Schedule",
            "description": (
                "Plan your battery charge/discharge schedule for Round 1. "
                "Night hours (0–5) have low prices – ideal for charging. "
                "Set the battery state of charge to ≥60% before the morning ramp."
            ),
            "target": "player",
            "target_id": "ptype_monday_pvbat",
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – Review Clearing + Adjust IDM",
            "description": (
                "Review Round 1 DAM clearing results: SMP, dispatched volume, revenue/cost. "
                "Submit Intraday Market corrections if actual output or load deviates "
                "from your DAM schedule by more than 5%."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – Check Imbalance",
            "description": (
                "Open your Round Results and inspect the Imbalance Cost entry. "
                "If imbalance cost > 50,000 ZAR, identify the root cause in the "
                "Device Deep-Dive tab and adjust your IDM bid to reduce the gap."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – Arbitrage Opportunity",
            "description": (
                "Morning ramp (hours 6–11): SMP rises sharply around hour 7–8. "
                "Discharge stored battery energy during high-price hours to maximize revenue. "
                "Consider also injecting PV surplus into the IDM if DAM was undercleared."
            ),
            "target": "player",
            "target_id": "ptype_monday_pvbat",
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R3 – Prepare for Outage Impact",
            "description": (
                "ATTENTION: A technical fault has reduced the coal plant to 20% capacity this round. "
                "Producer: revise your bids immediately — you can only offer at most 80 MW. "
                "Consumer: the SMP will likely spike; consider bidding higher to stay dispatched. "
                "PV Battery: this is your chance — inject as much solar as possible."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R3 – Maximize Solar Output",
            "description": (
                "Midday hours 12–17 are peak solar. "
                "Offer the full PV capacity in the DAM at a low price to guarantee dispatch. "
                "Use IDM to fine-tune any forecast deviation. "
                "Battery: keep reserve capacity for evening peak in Round 4."
            ),
            "target": "player",
            "target_id": "ptype_monday_pvbat",
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R3 – Minimize Procurement Cost",
            "description": (
                "The coal outage in Round 3 will push the SMP up. "
                "Review your demand forecast carefully: Can you activate DRM (Demand Response) "
                "to reduce load during the 2 most expensive hours? "
                "Any unserved demand will incur a network shortfall cost."
            ),
            "target": "player",
            "target_id": "ptype_monday_consumer",
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R4 – Cold Snap Response",
            "description": (
                "COLD SNAP ACTIVE: Solar output is reduced to ~25% of capacity, "
                "and demand is up 40% due to heating load. "
                "All players: revise forecasts and bids. "
                "The SMP will be very high — position accordingly."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R4 – Evening Peak Bidding",
            "description": (
                "Evening peak (hours 18–23): demand is at its daily high. "
                "Producer: bid your full available coal capacity at market rate. "
                "If the coal plant is running again at 100%, this is your best profit window."
            ),
            "target": "player",
            "target_id": "ptype_monday_producer",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R4 – Discharge Battery for Peak",
            "description": (
                "Solar is mostly offline during the cold snap. "
                "Discharge your full battery capacity during evening peak hours 18–21 "
                "to capture the high SMP. Final round — do not hold reserve."
            ),
            "target": "player",
            "target_id": "ptype_monday_pvbat",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R4 – Secure Cold Snap Supply",
            "description": (
                "Your demand is 40% higher today due to cold. "
                "Bid aggressively in the DAM — your willingness-to-pay should reflect "
                "that unserved demand costs more than a high SMP. "
                "Check zone coverage after DAM clears."
            ),
            "target": "player",
            "target_id": "ptype_monday_consumer",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },

        # ── Systemic Events ───────────────────────────────────────────────
        {
            "type": "systemic",
            "name": "Technical Outage – Coal Plant",
            "description": (
                "Unexpected mechanical fault limits the coal plant to 20% of rated capacity (80 MW) "
                "for Round 3. The market will feel the supply squeeze."
            ),
            "target": "player",
            "target_id": "ptype_monday_producer",
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
            "multiplier": 0.2,
            "additive": 0,
        },
        {
            "type": "systemic",
            "name": "Cold Snap – Reduced Solar",
            "description": (
                "Heavy cloud cover and freezing fog reduce the solar farm output to 25% "
                "of normal capacity for Round 4."
            ),
            "target": "player",
            "target_id": "ptype_monday_pvbat",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
            "multiplier": 0.25,
            "additive": 0,
        },
        {
            "type": "systemic",
            "name": "Cold Snap – Demand Surge",
            "description": (
                "A cold front brings temperatures well below average. "
                "Heating demand pushes industrial complex load up 40% in Round 4."
            ),
            "target": "player",
            "target_id": "ptype_monday_consumer",
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
            "multiplier": 1.4,
            "additive": 0,
        },
    ],

    # ── Challenges ────────────────────────────────────────────────────────
    "challenges": [
        # Producer challenges
        {
            "id": "ch_producer_revenue",
            "name": "Revenue Target",
            "description": "Achieve total revenue of at least ZAR 800,000 across all rounds.",
            "applicable_to": ["ptype_monday_producer"],
            "metric": "total_revenue",
            "operator": ">=",
            "target": 800000,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": "ch_producer_profit",
            "name": "Profit Champion",
            "description": "Earn a total profit of at least ZAR 250,000.",
            "applicable_to": ["ptype_monday_producer"],
            "metric": "total_profit",
            "operator": ">=",
            "target": 250000,
            "points": 60,
            "required": False,
            "per_round": False,
        },
        {
            "id": "ch_producer_imbalance",
            "name": "Dispatch Precision",
            "description": "Keep total imbalance cost below ZAR 80,000 across all rounds.",
            "applicable_to": ["ptype_monday_producer"],
            "metric": "total_imbalance",
            "operator": "<=",
            "target": 80000,
            "points": 40,
            "required": False,
            "per_round": False,
        },
        # Consumer challenges
        {
            "id": "ch_consumer_cost",
            "name": "Cost Efficiency",
            "description": "Keep total procurement cost below ZAR 600,000.",
            "applicable_to": ["ptype_monday_consumer"],
            "metric": "total_cost",
            "operator": "<=",
            "target": 600000,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": "ch_consumer_coverage",
            "name": "No Lights Out",
            "description": "Achieve at least 95% demand coverage across all rounds.",
            "applicable_to": ["ptype_monday_consumer"],
            "metric": "total_demand_coverage",
            "operator": ">=",
            "target": 95,
            "points": 60,
            "required": False,
            "per_round": False,
        },
        {
            "id": "ch_consumer_imbalance",
            "name": "Forecast Accuracy",
            "description": "Keep total imbalance cost below ZAR 60,000.",
            "applicable_to": ["ptype_monday_consumer"],
            "metric": "total_imbalance",
            "operator": "<=",
            "target": 60000,
            "points": 40,
            "required": False,
            "per_round": False,
        },
        # PV Battery challenges
        {
            "id": "ch_pvbat_revenue",
            "name": "Green Revenue",
            "description": "Generate total revenue of at least ZAR 400,000 from renewable sources.",
            "applicable_to": ["ptype_monday_pvbat"],
            "metric": "total_revenue",
            "operator": ">=",
            "target": 400000,
            "points": 100,
            "required": True,
            "per_round": False,
        },
        {
            "id": "ch_pvbat_profit",
            "name": "Battery Arbitrage",
            "description": "Earn a total profit of at least ZAR 100,000 (after fixed costs).",
            "applicable_to": ["ptype_monday_pvbat"],
            "metric": "total_profit",
            "operator": ">=",
            "target": 100000,
            "points": 60,
            "required": False,
            "per_round": False,
        },
        {
            "id": "ch_pvbat_imbalance",
            "name": "Perfect Balance",
            "description": "Keep total imbalance cost below ZAR 40,000.",
            "applicable_to": ["ptype_monday_pvbat"],
            "metric": "total_imbalance",
            "operator": "<=",
            "target": 40000,
            "points": 40,
            "required": False,
            "per_round": False,
        },
    ],

    # ── Objectives (briefing text) ─────────────────────────────────────────
    "objectives": (
        "# Monday Market Simulation\n\n"
        "You are participating in a one-day electricity market simulation (4 rounds × 6 hours = 24 hours).\n\n"
        "## Network\n"
        "The grid has **two zones** connected by a 160 MW link. "
        "The Producer and PV Battery are in **Zone 1**; the Consumer is in **Zone 2**. "
        "The link is often the binding constraint — watch zone coverage closely.\n\n"
        "## Events\n"
        "- **Round 3**: A technical fault reduces the coal plant to 20% capacity.\n"
        "- **Round 4**: A cold snap cuts solar output to 25% and raises consumer demand by 40%.\n\n"
        "## Roles\n"
        "- **Producer**: Maximize profit from the coal plant. Manage the outage in Round 3.\n"
        "- **Consumer**: Minimize procurement cost and avoid shortfalls despite the ATC constraint.\n"
        "- **PV Battery**: Earn revenue from solar + battery arbitrage. React to the cold snap.\n"
    ),

    # ── Scoring ───────────────────────────────────────────────────────────
    "scoring": {
        "weights": {
            "profit":      0.5,
            "imbalance":   0.3,
            "curtailment": 0.2,
        },
    },
}

def main():
    app = create_app()
    with app.app_context():
        # Remove old "Monday" scenario if exists
        old = Scenario.query.filter_by(name='Monday').first()
        if old:
            db.session.delete(old)
            db.session.commit()
            print("Deleted old Monday scenario.")

        s = Scenario(name='Monday', config=SCENARIO_CONFIG)
        db.session.add(s)
        db.session.commit()
        print(f"Created scenario 'Monday' with id={s.id}")

        # Quick sanity check
        reloaded = Scenario.query.get(s.id)
        cfg = reloaded.config if isinstance(reloaded.config, dict) else json.loads(reloaded.config)
        print(f"  player_types : {[pt['name'] for pt in cfg['player_types']]}")
        print(f"  devices      : {[d['name'] for d in cfg['devices']]}")
        print(f"  events       : {len(cfg['events'])} total "
              f"({sum(1 for e in cfg['events'] if e['type']=='task')} tasks, "
              f"{sum(1 for e in cfg['events'] if e['type']=='systemic')} systemic)")
        print(f"  challenges   : {len(cfg['challenges'])}")
        print(f"  grid ATC     : {cfg['grid']['atc']}")
        print(f"  markets      : DAM={cfg['markets']['dam']['trading']}  IDM={cfg['markets']['idm']['trading']}")

if __name__ == '__main__':
    main()
