"""
Creates a test campaign with three scenarios of increasing complexity.
Each scenario has exactly one producer player type and one consumer player type,
plus detailed todo cards (events of type 'task' and 'shock').

Run inside the backend container:
  python /app/scripts/seed_test_campaign.py
"""
import sys
import os

sys.path.insert(0, '/app')
os.chdir('/app')

from app import create_app
from app.extensions import db
from app.models import User, Campaign, Scenario, CampaignScenario

# =============================================================================
# SCENARIO 1 – BEGINNER
# One market (DAM), one zone, 2 rounds x 6 hours
# Producer: Coal plant | Consumer: City supply
# =============================================================================
SCENARIO_1 = {
    "version": "1.0.0",
    "name": "Beginner – First Day on the Market",
    "general": {
        "id": "test_s1_beginner",
        "description": (
            "Introduction to the energy market: two rounds, one grid zone, pure "
            "Day-Ahead market. No intraday trading, no network constraints, "
            "no disruption events. Learn how price bids work, how the market "
            "clears, and why your offer price is decisive."
        ),
        "fake_date": "2025-06-02",
        "rounds": 2,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 12,
        "horizon_hours": 12,
        "round_duration_seconds": 900,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 6,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 6,
    },
    "structure": {"rounds": 2, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s1_coal",
            "name": "Coal Plant Alpha",
            "type": "coal",
            "capacity_mw": 300,
            "max_power_mw": 300,
            "min_load_pct": 20,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 1500,
            "ramp_rate_mw_per_h": 80,
            "enable_multi_bid": False,
            "zone": 1,
        },
        {
            "id": "dev_s1_load",
            "name": "City Supply North",
            "type": "industrial_load",
            "baseline_load_mw": 200,
            "peak_load_mw": 260,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": False,
            "enable_multi_bid": False,
            "zone": 1,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s1_producer",
            "name": "Producer",
            "zone": 1,
            "description": (
                "You operate a coal-fired power plant with 300 MW capacity and variable "
                "costs of 380 ZAR/MWh. Your goal is to maximise profit through strategic "
                "bidding in the Day-Ahead market. "
                "Remember: if your offer price is below the market clearing price (SMP), "
                "you are paid at the clearing price – not at your bid price."
            ),
            "devices": ["dev_s1_coal"],
        },
        {
            "id": "ptype_s1_consumer",
            "name": "Consumer",
            "zone": 1,
            "description": (
                "You supply the city as a utility operator. Your load profile ranges "
                "between 200 and 260 MW. You purchase energy in the Day-Ahead market "
                "and must ensure you are always sufficiently covered. "
                "Bid too high and you overpay – bid too low and you won't be served."
            ),
            "devices": ["dev_s1_load"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on"]},
        "idm": {"trading": ["off", "off"]},
    },
    "market": {
        "base_price": 900,
        "base_volume_mwh": 1200,
        "price_cap": 3000,
        "price_floor": 0,
        "random_price_pct": 4,
        "random_capacity_pct": 4,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 3, "gas": 1, "hydro": 1},
        "consumer_mix": {"industrial": 2, "household": 2},
        "balancing_up_price": 1800,
        "balancing_down_price": 150,
    },
    "grid": {"zones": 1},
    "environment": {
        "profile_preset": "Summer Weekday",
        "seed": "test_beginner_v1",
        "actual_noise_pct": 3,
        "diurnal_profile": [
            0.60, 0.55, 0.53, 0.52, 0.55, 0.65,
            0.80, 0.95, 1.00, 1.00, 0.98, 0.95,
            0.92, 0.90, 0.92, 0.95, 1.00, 1.05,
            1.05, 1.00, 0.92, 0.82, 0.72, 0.65,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "Task 1 – Place Your DAM Bid",
            "description": (
                "**Producer:** Open the bidding screen and set your offer price and "
                "quantity for each of the 6 hours.\n\n"
                "Hint: Your variable costs are 380 ZAR/MWh. Set your price at least "
                "at this level, otherwise you sell at a loss.\n"
                "Recommended starting price: 400–450 ZAR/MWh.\n\n"
                "**Consumer:** Enter a purchase quantity and your maximum willingness-"
                "to-pay for each hour.\n\n"
                "Hint: Your load profile is 200–260 MW. Bid a sufficient quantity at a "
                "price above the expected market price to guarantee supply. "
                "Recommendation: 900–1 000 ZAR/MWh.\n\n"
                "**Goal of this task:** Submit your first bid before the Day-Ahead gate "
                "closes (hour 6). The market clears automatically afterwards."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Task 2 – Read the Clearing Price and Adjust Strategy",
            "description": (
                "The Day-Ahead market for round 1 has cleared. Analyse the results "
                "and answer the following questions:\n\n"
                "**Producer:**\n"
                "- At what price did you sell? Was it the clearing price (SMP)?\n"
                "- Were you fully dispatched or only partially?\n"
                "- Could you have bid a higher price and still been dispatched?\n"
                "- Calculate your profit: (SMP - 380 ZAR) x dispatched MWh - fixed costs.\n\n"
                "**Consumer:**\n"
                "- Were you fully supplied?\n"
                "- What were your total costs? Compare with your forecast.\n"
                "- Could you have purchased more cheaply?\n\n"
                "**For round 2:** Adjust your bids based on these insights. "
                "The load profile in hours 7–12 is in the morning ramp – demand rises. "
                "Producer: can you raise your price slightly?"
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
    ],
}

# =============================================================================
# SCENARIO 2 – INTERMEDIATE
# DAM + IDM, one zone, 3 rounds x 6 hours
# Producer: Coal + Gas + Solar (multi-device) | Consumer: Industry with DRM
# =============================================================================
SCENARIO_2 = {
    "version": "1.0.0",
    "name": "Intermediate – Intraday & Renewables",
    "general": {
        "id": "test_s2_intermediate",
        "description": (
            "Three rounds with Day-Ahead and Intraday market. The producer manages "
            "a mixed fleet: coal plant, gas plant and solar farm. "
            "In round 2 a heat wave strikes – demand rises by 25%. "
            "Demand response, intraday top-ups and hedging against imbalance costs "
            "take centre stage."
        ),
        "fake_date": "2025-09-15",
        "rounds": 3,
        "hours_per_round": 6,
        "round_span_hours": 6,
        "forecast_horizon_hours": 18,
        "horizon_hours": 18,
        "round_duration_seconds": 1200,
        "freeze_hours": 1,
        "day_ahead_gate_hour": 8,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
        "start_hour": 4,
    },
    "structure": {"rounds": 3, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s2_coal",
            "name": "Coal Plant South",
            "type": "coal",
            "capacity_mw": 350,
            "max_power_mw": 350,
            "min_load_pct": 15,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 1800,
            "ramp_rate_mw_per_h": 90,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_gas",
            "name": "Gas Peaker Plant",
            "type": "gas",
            "capacity_mw": 150,
            "max_power_mw": 150,
            "min_load_pct": 0,
            "variable_cost_zar_per_mwh": 1100,
            "cost_per_mwh_zar": 1100,
            "fixed_cost_zar_per_hour": 800,
            "ramp_rate_mw_per_h": 150,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_pv",
            "name": "Solar Farm East",
            "type": "pv",
            "capacity_mw": 120,
            "max_power_mw": 120,
            "variable_cost_zar_per_mwh": 0,
            "cost_per_mwh_zar": 0,
            "fixed_cost_zar_per_hour": 300,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s2_load",
            "name": "Industrial Park East",
            "type": "industrial_load",
            "baseline_load_mw": 280,
            "peak_load_mw": 380,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": True,
            "enable_multi_bid": True,
            "zone": 1,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s2_producer",
            "name": "Producer (Coal + Gas + Solar)",
            "zone": 1,
            "description": (
                "You operate a mixed generation fleet: coal plant (350 MW, 380 ZAR/MWh), "
                "gas plant (150 MW, 1 100 ZAR/MWh) and solar farm (120 MW, 0 ZAR/MWh). "
                "Coal runs as baseload, gas covers peaks, solar feeds in variably. "
                "Use the Intraday market to offset solar forecast deviations. "
                "In round 2 demand spikes sharply – ramp up gas in time."
            ),
            "devices": ["dev_s2_coal", "dev_s2_gas", "dev_s2_pv"],
        },
        {
            "id": "ptype_s2_consumer",
            "name": "Industrial Consumer (DRM)",
            "zone": 1,
            "description": (
                "You are a large buyer with a load profile of 280–380 MW and "
                "demand-response capability. Purchase your baseload in the DAM, "
                "use the IDM for adjustments. In round 2 your demand rises unexpectedly "
                "by ~25% due to a heat wave – react immediately in the Intraday market. "
                "Activate DRM during the most expensive hours to reduce peak costs."
            ),
            "devices": ["dev_s2_load"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on", "on"]},
        "idm": {"trading": ["on", "on", "on"]},
    },
    "market": {
        "base_price": 1000,
        "base_volume_mwh": 1500,
        "price_cap": 4000,
        "price_floor": -200,
        "random_price_pct": 6,
        "random_capacity_pct": 6,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 3, "gas": 2, "hydro": 1, "pv": 1},
        "consumer_mix": {"industrial": 3, "household": 1},
        "balancing_up_price": 2000,
        "balancing_down_price": 180,
    },
    "grid": {"zones": 1},
    "environment": {
        "profile_preset": "Autumn Weekday",
        "seed": "test_intermediate_v1",
        "actual_noise_pct": 6,
        "diurnal_profile": [
            0.65, 0.61, 0.58, 0.57, 0.60, 0.72,
            0.88, 1.02, 1.10, 1.08, 1.02, 0.98,
            0.93, 0.91, 0.94, 0.98, 1.06, 1.18,
            1.22, 1.18, 1.08, 0.96, 0.84, 0.72,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "Task 1 – DAM Bids with Multiple Devices",
            "description": (
                "**Producer (Coal + Gas + Solar):**\n"
                "You manage three generation units simultaneously. Work through each one:\n\n"
                "1. **Coal plant (350 MW, 380 ZAR/MWh):** Offer baseload quantities in all "
                "6 hours at a price near your variable costs "
                "(recommended: 400–450 ZAR). The coal plant should always be dispatched.\n\n"
                "2. **Gas plant (150 MW, 1 100 ZAR/MWh):** Gas is expensive – bid only in "
                "peak hours (morning ramp 8–10 h) and just above your costs. "
                "Use 1 150–1 200 ZAR as your floor.\n\n"
                "3. **Solar farm (120 MW, 0 ZAR/MWh):** Bid the forecast quantity at 0 ZAR "
                "– solar is always dispatched with priority. Note that actual output may "
                "deviate +/-15% from the forecast – you bear the imbalance risk.\n\n"
                "**Consumer (Industry with DRM):**\n"
                "Purchase your baseload (~280 MW) in the DAM. Set your buy price high "
                "enough to be reliably served (recommended: 1 500–2 000 ZAR). "
                "Consider which hours you have demand-response flexibility – you can "
                "intentionally under-procure those hours in the DAM and top up in the IDM."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Task 1b – Prepare Your Intraday Strategy",
            "description": (
                "Before the DAM gate closes, plan your Intraday strategy:\n\n"
                "**Producer:**\n"
                "- The solar farm typically deviates +/-10–20 MWh/h from the forecast. "
                "If you can sell or buy back in the IDM, you avoid imbalance penalties.\n"
                "- Keep the gas plant mentally available as an 'IDM reserve'.\n\n"
                "**Consumer:**\n"
                "- If your actual consumption exceeds your DAM position, you will buy "
                "expensive balancing energy (2 000 ZAR/MWh). IDM top-ups are cheaper.\n"
                "- Identify 1–2 hours where DRM could shift part of your load – "
                "this gives you flexibility at low cost."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "SHOCK – Heat Wave in Round 2",
            "description": (
                "WARNING – UNEXPECTED HEAT WAVE: Temperature rises to 42 degrees C.\n\n"
                "- Cooling load for all consumers: +25% above forecast.\n"
                "- Solar irradiation: slightly higher (+5%), but minimal extra output "
                "due to thermal losses.\n\n"
                "**Immediate action:**\n"
                "Consumer: Open the Intraday market and purchase the missing energy. "
                "Estimate: 280 MW baseline x 25% = 70 MW extra demand. "
                "6 hours x 70 MW = 420 MWh short.\n\n"
                "Producer: Increase gas offer in the IDM. Market prices are surging – "
                "you can now achieve 1 500–2 500 ZAR/MWh for gas. "
                "Ramp the gas plant to full load (150 MW)."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
            "demand_shock_pct": 25,
        },
        {
            "type": "task",
            "name": "Task 2 – IDM Response to the Demand Shock",
            "description": (
                "The heat wave has hit. Complete the following steps:\n\n"
                "**Producer:**\n"
                "1. Open the IDM bidding screen.\n"
                "2. Increase gas offer to 150 MW in peak hours (10–13 h).\n"
                "3. Set the IDM price for gas to 1 400 ZAR/MWh – competitive given "
                "elevated demand, but below the balancing-up price (2 000 ZAR).\n"
                "4. Check the solar deviation: is actual output above or below forecast?\n\n"
                "**Consumer:**\n"
                "1. Calculate your shortfall: current actuals minus DAM purchase volume.\n"
                "2. Buy the difference in the IDM before the gate closes.\n"
                "3. Activate DRM in hours 11–13 (highest prices expected) to cut "
                "demand by 10–15% and reduce costs.\n"
                "4. After clearing: how did your total costs compare to a scenario "
                "without DRM?"
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Task 3 – Final Review and Learning Outcomes",
            "description": (
                "Last round. Conduct a final analysis:\n\n"
                "**Producer – checklist:**\n"
                "[ ] How much profit did the gas plant earn in round 2?\n"
                "[ ] What were the imbalance costs from solar deviations?\n"
                "[ ] Was the IDM strategy in round 2 more profitable than DAM-only trading?\n"
                "[ ] Optimise for R3: coal still baseload, gas only peak hours.\n\n"
                "**Consumer – checklist:**\n"
                "[ ] Total costs R1 vs R2 – delta due to the heat wave?\n"
                "[ ] How much did DRM activation save in R2?\n"
                "[ ] Would you have ended up in balancing without the IDM top-up?\n"
                "[ ] Optimise R3: earlier DAM purchase when a shock is anticipated.\n\n"
                "**For round 3:** No new shock – optimise for maximum "
                "profit (producer) / minimum cost (consumer)."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
    ],
}

# =============================================================================
# SCENARIO 3 – EXPERT
# DAM + IDM, two zones (ATC 160 MW), 4 rounds x 6 hours
# Producer: Coal + Gas + Solar + Battery (Zone 1)
# Consumer: Large industrial consumer with DRM (Zone 2)
# Events: Technical outage R3 + Cold wave R4
# =============================================================================
SCENARIO_3 = {
    "version": "1.0.0",
    "name": "Expert – Two Zones, Battery & Disruptions",
    "general": {
        "id": "test_s3_expert",
        "description": (
            "Four rounds, two grid zones (ATC 160 MW), Day-Ahead and Intraday market. "
            "The producer (Zone 1) operates coal, gas, solar and a grid battery. "
            "The consumer (Zone 2) faces transmission constraints. "
            "Round 3: coal plant derated to 20% capacity. "
            "Round 4: cold wave +40% demand, solar -75%. "
            "Battery arbitrage, congestion management and risk assessment are key."
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
    "structure": {"rounds": 4, "hours_per_round": 6},
    "devices": [
        {
            "id": "dev_s3_coal",
            "name": "Coal Plant North",
            "type": "coal",
            "capacity_mw": 400,
            "max_power_mw": 400,
            "min_load_pct": 10,
            "variable_cost_zar_per_mwh": 380,
            "cost_per_mwh_zar": 380,
            "fixed_cost_zar_per_hour": 2000,
            "ramp_rate_mw_per_h": 100,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_gas",
            "name": "Flexible Gas Plant",
            "type": "gas",
            "capacity_mw": 200,
            "max_power_mw": 200,
            "min_load_pct": 0,
            "variable_cost_zar_per_mwh": 1100,
            "cost_per_mwh_zar": 1100,
            "fixed_cost_zar_per_hour": 1000,
            "ramp_rate_mw_per_h": 200,
            "enable_multi_bid": True,
            "zone": 1,
        },
        {
            "id": "dev_s3_pv",
            "name": "Solar Farm South",
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
            "id": "dev_s3_bat",
            "name": "Grid Battery Zone 1",
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
        {
            "id": "dev_s3_load",
            "name": "Industrial Region Zone 2",
            "type": "industrial_load",
            "baseline_load_mw": 260,
            "peak_load_mw": 400,
            "fixed_cost_zar_per_hour": 0,
            "drm_capable": True,
            "enable_multi_bid": True,
            "zone": 2,
        },
    ],
    "player_types": [
        {
            "id": "ptype_s3_producer",
            "name": "Producer Zone 1 (Coal + Gas + Solar + Battery)",
            "zone": 1,
            "description": (
                "You operate a complete generation portfolio in Zone 1: "
                "coal plant (400 MW), gas plant (200 MW), solar farm (180 MW) "
                "and a grid battery (80 MW / 240 MWh). "
                "Coal is your reliable baseload, gas your peak resource, "
                "solar feeds in variably. Use the battery for arbitrage: "
                "charge during cheap hours, discharge during expensive ones. "
                "In round 3 the coal plant is derated to 20% – respond with gas and "
                "maximum battery discharge. "
                "In round 4 cloud cover cuts solar output to 25% – "
                "the battery becomes a critical reserve."
            ),
            "devices": ["dev_s3_coal", "dev_s3_gas", "dev_s3_pv", "dev_s3_bat"],
        },
        {
            "id": "ptype_s3_consumer",
            "name": "Large Consumer Zone 2 (DRM)",
            "zone": 2,
            "description": (
                "You supply the industrial region in Zone 2 with a load profile of "
                "260–400 MW. The interconnector capacity from Zone 1 to Zone 2 is "
                "limited to 160 MW – less than your maximum demand. "
                "There is no local generation in Zone 2. "
                "You must purchase early in the DAM and actively plan for congestion. "
                "In round 3 the coal outage drives prices sharply higher – activate DRM. "
                "In round 4 your demand rises 40% due to cold weather – plan now."
            ),
            "devices": ["dev_s3_load"],
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
        "random_price_pct": 8,
        "random_capacity_pct": 8,
        "enable_player_bidding": True,
        "generator_mix": {"coal": 4, "gas": 2, "hydro": 1, "pv": 1, "wind": 1},
        "consumer_mix": {"industrial": 2, "agriculture": 1, "household": 2},
        "balancing_up_price": 2500,
        "balancing_down_price": 200,
    },
    "grid": {
        "zones": 2,
        "atc": [
            [0,   160],
            [160, 0],
        ],
    },
    "environment": {
        "profile_preset": "Winter Weekday",
        "seed": "test_expert_v1",
        "actual_noise_pct": 8,
        "diurnal_profile": [
            0.72, 0.68, 0.65, 0.64, 0.66, 0.75,
            0.90, 1.05, 1.15, 1.10, 1.05, 1.00,
            0.95, 0.93, 0.95, 1.00, 1.10, 1.20,
            1.30, 1.28, 1.20, 1.10, 1.00, 0.85,
        ],
    },
    "events": [
        {
            "type": "task",
            "name": "R1 – Task: Opening DAM Bids (Producer)",
            "description": (
                "**Producer (Zone 1) – tasks for all 4 units:**\n\n"
                "**1. Coal plant (400 MW, 380 ZAR/MWh)**\n"
                "Offer baseload in all 6 hours. Recommended DAM price: 400–450 ZAR.\n"
                "Goal: secure full dispatch.\n\n"
                "**2. Gas plant (200 MW, 1 100 ZAR/MWh)**\n"
                "Midnight 0–5 h: demand is low – offer gas only if needed.\n"
                "Bid in hours 4–5 as the morning ramp begins (1 150 ZAR).\n\n"
                "**3. Solar farm (180 MW, 0 ZAR/MWh)**\n"
                "Forecast for 0–5 h: no solar output. Bid 0 MWh at 0 ZAR.\n"
                "Note: Solar only becomes relevant from round 2 (hours 6+).\n\n"
                "**4. Grid battery (80 MW / 240 MWh, starting SoC: 50%)**\n"
                "Charge now: bid in hours 1–3 in charge mode.\n"
                "Target state of charge by end of R1: at least 70%.\n"
                "Exploit cheap overnight prices – you will need that reserve in R3/R4.\n\n"
                "**R1 overall goal:** Coal fully dispatched, battery charged, "
                "gas kept in reserve."
            ),
            "target": "player",
            "target_id": "ptype_s3_producer",
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R1 – Task: Congestion Planning (Consumer)",
            "description": (
                "**Consumer (Zone 2) – critical note on transmission constraints:**\n\n"
                "The only link from Zone 1 to Zone 2 has a capacity of only 160 MW. "
                "Your load profile is 260 MW at baseline. "
                "This means you cannot fully cover your demand from Zone 1 imports "
                "– you depend on the local market offer.\n\n"
                "**Steps for R1:**\n"
                "1. Enter your DAM buy bid for Zone 2: maximum 160 MW import + local volumes.\n"
                "2. Set your buy price high (recommended: 2 000–2 500 ZAR) to secure "
                "priority in congestion allocation.\n"
                "3. Plan DRM now for high-demand hours: which hours could you shift "
                "10–20% of your load?\n"
                "4. After clearing: how many MWh did the congestion absorb? "
                "Is there a supply gap you need to close in the IDM?\n\n"
                "**Important:** Supply gaps in Zone 2 are settled at the balancing-up "
                "price (2 500 ZAR/MWh) – very expensive. Use the IDM instead."
            ),
            "target": "player",
            "target_id": "ptype_s3_consumer",
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "R2 – Task: IDM Zone Check and Solar Correction",
            "description": (
                "**All players – after DAM clearing in round 2:**\n\n"
                "**Producer:**\n"
                "1. Solar is now active (hours 6–11): forecast roughly 80–120 MW.\n"
                "   Bid the forecast quantity in the DAM, correct deviations in the IDM.\n"
                "2. Check solar actuals after clearing: over- or under-injection?\n"
                "3. Battery: review charge/discharge plan. Target SoC by end of R2: at least 65%.\n"
                "   You will urgently need the battery in R3.\n\n"
                "**Consumer:**\n"
                "1. Zone 2 supply balance check: were all DAM purchases delivered?\n"
                "2. If undersupplied: use the IDM immediately, top up before dispatch.\n"
                "3. Calculate your R1 total costs: compare with a hypothetical no-congestion "
                "scenario (400 MW freely available). What does the constraint cost you?\n\n"
                "**Learning goal R2:** Understand zonal arbitrage – prices in Zone 1 and "
                "Zone 2 can diverge when the interconnector is saturated."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "R3 SHOCK – Technical Fault: Coal Plant Derated!",
            "description": (
                "EMERGENCY: Coal Plant North derated to 20% capacity!\n\n"
                "Cause: boiler damage. Available output: max. 80 MW instead of 400 MW.\n"
                "Repair: not before end of this round.\n\n"
                "**Immediate actions – Producer:**\n"
                "1. Ramp up gas immediately: Bid 200 MW in the IDM at 1 400 ZAR/MWh. "
                "   Market prices are exploding – gas becomes highly profitable.\n"
                "2. Discharge battery: Feed stored energy (at least 65% SoC = 156 MWh) "
                "   into the IDM now. At SMP above 2 000 ZAR every MWh is valuable.\n"
                "3. Maximise solar: Midday hours are starting – bid full capacity.\n"
                "4. Note: coal now delivers only ~80 MW. That leaves a 320 MW gap!\n\n"
                "**Immediate actions – Consumer:**\n"
                "1. SMP will rise to 2 000–3 000 ZAR. Activate DRM immediately!\n"
                "2. Cut load by 20–30% through DRM to achieve significant cost savings.\n"
                "3. IDM: if you under-purchased in the DAM, check whether you can "
                "   afford current IDM prices vs. balancing (2 500 ZAR)."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
            "capacity_shock": {"device_id": "dev_s3_coal", "max_pct": 20},
        },
        {
            "type": "task",
            "name": "R3 – Task: Crisis Management after Coal Outage",
            "description": (
                "**Producer – full crisis response:**\n\n"
                "[ ] IDM bid gas: 200 MW, price 1 400 ZAR/MWh (below balancing-up 2 500 ZAR).\n"
                "[ ] Discharge battery: maximum 80 MW during hours with highest expected price.\n"
                "    Hour with highest expected price: 10–13 h (midday peak).\n"
                "[ ] Solar: full 180 MW, bid at 0 ZAR – automatically dispatched.\n"
                "[ ] Coal: enter 80 MW limit in the system, adjust bid accordingly.\n\n"
                "**Producer calculation check:**\n"
                "Available capacity: 80 (coal) + 200 (gas) + 180 (solar) + 80 (battery) "
                "= 540 MW. Is that enough to meet demand?\n\n"
                "**Consumer – DRM optimisation:**\n\n"
                "[ ] Activate DRM: which hours have the highest prices?\n"
                "    Reduce load in those hours by 20–30%.\n"
                "[ ] Calculate: DRM saving = (SMP - DRM cost) x MWh curtailed.\n"
                "[ ] Is IDM top-up cheaper than balancing? Compare the prices.\n\n"
                "**Learning goal R3:** Emergency planning, rapid market reaction, "
                "the value of flexibility (gas + battery + DRM) in a crisis."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
        {
            "type": "shock",
            "name": "R4 SHOCK – Cold Wave: Demand +40%, Solar -75%",
            "description": (
                "COLD WAVE – Record demand and almost no solar:\n\n"
                "- Demand increases due to heating by +40% above forecast.\n"
                "- Solar output: dense cloud cover – only 25% of forecast (approx. 45 MW).\n"
                "- Coal: derated in R3 – has it been repaired? (max. 80 MW)\n\n"
                "**Critical supply situation:**\n"
                "Consumer Zone 2: normal load 260 MW x 1.4 = 364 MW required.\n"
                "ATC Zone 1 to Zone 2: 160 MW. Local generation Zone 2: 0 MW.\n"
                "Supply gap Zone 2: at least 204 MW cannot be covered by import!\n\n"
                "All players must now deploy every tool available."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
            "demand_shock_pct": 40,
            "solar_shock_pct": -75,
        },
        {
            "type": "task",
            "name": "R4 – Task: Final Risk Management and Competition",
            "description": (
                "**Last round – everything counts now.**\n\n"
                "**Producer – maximise availability:**\n\n"
                "[ ] Coal (80–400 MW depending on repair status): offer full capacity.\n"
                "[ ] Gas (200 MW): full output in DAM and IDM, price 1 200–1 500 ZAR.\n"
                "[ ] Solar (~45 MW with cloud cover): bid a realistic forecast quantity.\n"
                "[ ] Battery: discharge remaining SoC in the most expensive hours.\n"
                "    Discharge priority: hours with SMP above 2 500 ZAR for maximum margin.\n\n"
                "**Calculation check:** Total revenue = Sum of (SMP x dispatched MWh) "
                "- fixed costs - variable costs - imbalance costs.\n\n"
                "**Consumer Zone 2 – securing supply:**\n\n"
                "[ ] Accept the ATC limit: max. 160 MW importable from Zone 1.\n"
                "[ ] Activate maximum DRM: cut load to the absolute minimum.\n"
                "[ ] IDM: buy what is available, but weigh price vs. balancing-up 2 500 ZAR.\n"
                "[ ] Calculate supply gap: expected load (364 MW) - import (160 MW) "
                "- DRM curtailment. What remains unserved?\n\n"
                "**Final review (after clearing):**\n"
                "- Who achieved the highest net profit (producer) / lowest cost (consumer)?\n"
                "- Did the battery arbitrage strategy pay off?\n"
                "- What would you have planned differently in R1?\n"
                "- What role did the transmission constraint play for Zone 2 total costs?"
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 4,
            "duration_rounds": 1,
        },
    ],
}


# =============================================================================
# MAIN
# =============================================================================
def main():
    app = create_app()
    with app.app_context():
        admin = User.query.filter_by(email="admin@fastbreak.one").first()
        if not admin:
            print("ERROR: admin@fastbreak.one not found. Please create it first.")
            sys.exit(1)

        from app.models import Campaign
        existing = Campaign.query.filter_by(name="Energy Market Test Campaign").first()
        if existing:
            print(f"Campaign already exists (id={existing.id}). Skipping.")
            return

        # Remove old German-named campaign if present
        old = Campaign.query.filter_by(name="Energiemarkt Test-Kampagne").first()
        if old:
            print(f"Removing old German campaign (id={old.id}) ...")
            CampaignScenario.query.filter_by(campaign_id=old.id).delete()
            Scenario.query.filter_by(campaign_id=old.id).delete()
            db.session.delete(old)
            db.session.flush()

        campaign = Campaign(
            name="Energy Market Test Campaign",
            description=(
                "Three-level test campaign with increasing complexity: "
                "Beginner (DAM only, 2 rounds) -> Intermediate (DAM+IDM, solar, shock) "
                "-> Expert (2 zones, battery, coal outage, cold wave). "
                "Each scenario has exactly one producer and one consumer player type."
            ),
            designer_id=admin.id,
            published=True,
        )
        db.session.add(campaign)
        db.session.flush()

        scenarios = [SCENARIO_1, SCENARIO_2, SCENARIO_3]

        for order, config in enumerate(scenarios, start=1):
            name = config["name"]
            scenario = Scenario(
                name=name,
                campaign_id=campaign.id,
                config=config,
            )
            db.session.add(scenario)
            db.session.flush()

            link = CampaignScenario(
                campaign_id=campaign.id,
                scenario_id=scenario.id,
                order_index=order,
                solo_enabled=True,
                cohort_enabled=True,
            )
            db.session.add(link)
            print(f"  [{order}] Scenario created: {name} (id={scenario.id})")

        db.session.commit()
        print(f"\nCampaign '{campaign.name}' successfully created (id={campaign.id})")
        print(f"  Scenarios: {len(scenarios)}")
        print(f"  Each scenario: 1x producer player type + 1x consumer player type")
        print(f"  Todo cards: {sum(len(s.get('events', [])) for s in scenarios)} events total")


if __name__ == "__main__":
    main()
