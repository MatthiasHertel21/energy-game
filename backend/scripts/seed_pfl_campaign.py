"""
Kampagne: Power Markets and Trading (PFL)
Kurs: GSB Executive Education, 08.–12. Juni 2026

Szenarien (werden schrittweise ergänzt):
  1. Level 1  – Market Foundations         (Mo 08.06, 13:30–14:30)
  2. Level 2a – Price Formation & Bidding  (Di 09.06, 10:00–11:30)
  3. Level 2b – Grid Constraints & Power   (Di 09.06, 13:30–14:30)
  4. Level 3a – Forecasting & Information  (Mi 10.06, 13:30–14:30)
  5. Level 3b – RES Dominated System       (Do 11.06, 13:30–14:30)

Ausführen im Backend-Container:
  python /app/scripts/seed_pfl_campaign.py
"""
import sys
import os

sys.path.insert(0, '/app')
os.chdir('/app')

from app import create_app
from app.extensions import db
from app.models import User, Campaign, Scenario, CampaignScenario

# ─────────────────────────────────────────────────────────────────────────────
# Level 1 – Market Foundations
# Mo 08.06, 13:30–14:30
#
# Setup:
#   - 3 player types (Producer A/B/C), all operate a single coal plant
#   - Same device capacity (4,000 MW), different marginal costs (400/500/600 ZAR/MWh)
#   - 3 rounds, each clearing the 08:00–09:00 DAM slot
#   - Fixed synthetic demand: 12,000 MW (inelastic industrial load)
#   - No balancing penalties, no grid constraints, no IDM
#
# Learning objective:
#   Players discover merit-order dispatch and uniform pricing (SMP).
#   With all 3 bidding full capacity at marginal cost → SMP = 600 ZAR/MWh.
#   Strategic withholding or under-bidding changes outcomes.
# ─────────────────────────────────────────────────────────────────────────────
COAL_TIERS_A = [{"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 400}]
COAL_TIERS_B = [{"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 500}]
COAL_TIERS_C = [{"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 600}]

SCENARIO_LEVEL1 = {
    "version": "1.0.0",
    "general": {
        "id": "pfl_level1_v1",
        "title": "Level 1 – Market Foundations",
        "description": (
            "Welcome to the electricity market simulation.\n\n"
            "You operate a **coal-fired power plant** with a capacity of **4,000 MW**. "
            "Your plant has a fixed marginal cost — the cost at which you produce every MWh of electricity.\n\n"
            "Each round represents the **Day-Ahead Market** for the hour **08:00–09:00**. "
            "You decide how much capacity (in MW) you want to offer. "
            "Your bid is automatically priced at your marginal cost.\n\n"
            "The market clears using **merit order**: the cheapest plants are dispatched first "
            "until total demand is met. All dispatched plants receive the same "
            "**System Marginal Price (SMP)** — the price of the most expensive plant needed to cover demand.\n\n"
            "**Your goal:** Understand how your bid quantity and position in the merit order affects your revenue.\n\n"
            "*Total demand is fixed at 12,000 MW across all players.*"
        ),
        "fake_date": "2026-06-08",
        "rounds": 3,
        "round_span_hours": 1,
        "forecast_horizon_hours": 3,
        "horizon_hours": 3,
        "round_duration_seconds": 900,
        "start_time": "08:00",
        "day_ahead_gate_hour": 8,
        "id_gate_base_hour": 0,
        "day_one_baseline_mode": "edit_round_one",
    },
    "player_input": {
        "mode": "all_hours",
        "allow_other_rounds_editing": False,
        "hide_non_editable_hours": False,
    },
    "devices": [
        {
            "id": "dev_pfl1_coal_a",
            "name": "Coal Plant (Type A)",
            "type": "coal",
            "max_power_mw": 4000,
            "min_load_pct": 0,
            "ramp_rate_mw_per_min": 9999,
            "variable_cost_tiers": COAL_TIERS_A,
            "zone": 1,
        },
        {
            "id": "dev_pfl1_coal_b",
            "name": "Coal Plant (Type B)",
            "type": "coal",
            "max_power_mw": 4000,
            "min_load_pct": 0,
            "ramp_rate_mw_per_min": 9999,
            "variable_cost_tiers": COAL_TIERS_B,
            "zone": 1,
        },
        {
            "id": "dev_pfl1_coal_c",
            "name": "Coal Plant (Type C)",
            "type": "coal",
            "max_power_mw": 4000,
            "min_load_pct": 0,
            "ramp_rate_mw_per_min": 9999,
            "variable_cost_tiers": COAL_TIERS_C,
            "zone": 1,
        },
    ],
    "player_types": [
        {
            "id": "ptype_pfl1_a",
            "name": "Producer A",
            "zone": 1,
            "description": (
                "You operate a coal plant with a marginal cost of **400 ZAR/MWh**. "
                "You are the cheapest producer in the market. "
                "Decide how much capacity (up to 4,000 MW) to offer in the Day-Ahead Market."
            ),
            "devices": ["dev_pfl1_coal_a"],
        },
        {
            "id": "ptype_pfl1_b",
            "name": "Producer B",
            "zone": 1,
            "description": (
                "You operate a coal plant with a marginal cost of **500 ZAR/MWh**. "
                "You are the mid-cost producer in the market. "
                "Decide how much capacity (up to 4,000 MW) to offer in the Day-Ahead Market."
            ),
            "devices": ["dev_pfl1_coal_b"],
        },
        {
            "id": "ptype_pfl1_c",
            "name": "Producer C",
            "zone": 1,
            "description": (
                "You operate a coal plant with a marginal cost of **600 ZAR/MWh**. "
                "You are the most expensive producer in the market. "
                "Decide how much capacity (up to 4,000 MW) to offer in the Day-Ahead Market."
            ),
            "devices": ["dev_pfl1_coal_c"],
        },
    ],
    "markets": {
        "dam": {"trading": ["on", "on", "on"]},
        "idm": {"trading": ["off", "off", "off"]},
    },
    "market": {
        # Synthetic demand: flat 12,000 MW industrial load, WTP >> 600 ZAR/MWh
        "base_price": 2000,
        "base_volume_mwh": 12000,
        "price_cap": 5000,
        "price_floor": 0,
        "random_price_pct": 0,
        "random_capacity_pct": 0,
        "enable_player_bidding": True,
        "bid_count": 1,
        # No synthetic generators — players are the only supply
        "generator_mix": {"_none": {"blocks": 0}},
        # Flat industrial demand: 10 steps × 1,200 MW, all WTP > 1,600 ZAR
        "consumer_mix": {"industrial": {"blocks": 10}},
        # Scale to 100% so capacity_factor = 1.0 (no DAM/IDM split)
        "dam_synthetic_capacity_pct": 100,
        "idm_synthetic_capacity_pct": 0,
    },
    "balancing": {
        "price_mode": "absolute",
        "up_price_zar_per_mwh": 0,
        "down_price_zar_per_mwh": 0,
    },
    "grid": {
        "zones": 1,
        "atc": [[0]],
        "losses_pct_per_link": 0,
        "network_settlement": {
            "extra_cost_mode": "zonal_only",
            "cost_allocation_target": "consumers_only",
            "shortfall_price_mode": "smp_multiplier",
            "shortfall_price_value": 1.0,
        },
        "generator_curtailment_mode": "pro_rata",
    },
    "environment": {
        "seed": "pfl_level1_v1",
        "actual_noise_pct": 0,
        "groups": {},
    },
    "events": [
        {
            "type": "task",
            "name": "Round 1 – Submit your capacity bid",
            "description": (
                "Enter how much capacity (MW) you want to offer in the 08:00–09:00 market. "
                "Your bid will be at your marginal cost. Start by offering your full capacity."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 1,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 2 – Analyse the result",
            "description": (
                "Review the market clearing result from Round 1. "
                "What was the SMP? Were you dispatched? How much did you earn? "
                "Try adjusting your offered quantity for Round 2."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 2,
            "duration_rounds": 1,
        },
        {
            "type": "task",
            "name": "Round 3 – Final strategy",
            "description": (
                "Apply what you have learned. Remember: the cheapest plant needed to cover demand "
                "sets the SMP — and all dispatched plants receive the SMP, regardless of their bid price."
            ),
            "target": "all",
            "target_id": None,
            "trigger_type": "round",
            "trigger_value": 3,
            "duration_rounds": 1,
        },
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# Seed function
# ─────────────────────────────────────────────────────────────────────────────
def seed():
    app = create_app()
    with app.app_context():
        admin = User.query.filter_by(email="admin@fastbreak.one").first()
        if not admin:
            print("ERROR: admin@fastbreak.one not found. Run the app first to create users.")
            return

        # ── Campaign ─────────────────────────────────────────────────────────
        campaign = Campaign.query.filter_by(name="Power Markets and Trading (PFL)").first()
        if campaign:
            print(f"Campaign already exists (id={campaign.id}), reusing.")
        else:
            campaign = Campaign(
                name="Power Markets and Trading (PFL)",
                description=(
                    "GSB Executive Education course simulation – June 2026.\n\n"
                    "Five scenarios covering market foundations, price formation, "
                    "grid constraints, forecasting, and RES integration."
                ),
                designer_id=admin.id,
                published=True,
            )
            db.session.add(campaign)
            db.session.flush()
            print(f"Created campaign '{campaign.name}' (id={campaign.id})")

        # ── Scenario: Level 1 ─────────────────────────────────────────────────
        sc1 = Scenario.query.filter_by(name="Level 1 – Market Foundations").first()
        if sc1:
            print(f"Scenario 'Level 1' already exists (id={sc1.id}), updating config.")
            sc1.config = SCENARIO_LEVEL1
        else:
            sc1 = Scenario(
                name="Level 1 – Market Foundations",
                config=SCENARIO_LEVEL1,
                campaign_id=campaign.id,
            )
            db.session.add(sc1)
            db.session.flush()
            print(f"Created scenario 'Level 1' (id={sc1.id})")

        # Link scenario to campaign (position 1)
        existing_link = CampaignScenario.query.filter_by(
            campaign_id=campaign.id, scenario_id=sc1.id
        ).first()
        if not existing_link:
            link = CampaignScenario(
                campaign_id=campaign.id,
                scenario_id=sc1.id,
                order_index=0,
            )
            db.session.add(link)
            print(f"Linked scenario {sc1.id} → campaign {campaign.id} at position 1")

        db.session.commit()
        print("\n✓ Done. Campaign 'Power Markets and Trading (PFL)' seeded with Level 1 scenario.")
        print(f"  Campaign ID : {campaign.id}")
        print(f"  Scenario ID : {sc1.id}")


if __name__ == "__main__":
    seed()
