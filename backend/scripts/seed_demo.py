"""
Demo seed: creates admin user + two campaigns (PFL and UCT 2026-Jun) with all
their scenarios, and a demo cohort that has both campaigns assigned.

Fully idempotent – safe to run on an existing database; existing records are
updated in place, nothing is duplicated.

Environment variables (all optional):
  ADMIN_EMAIL       default: admin@example.com
  ADMIN_PASSWORD    default: ChangeMe1234!  (ignored if user already exists)
  DEMO_COHORT_NAME  default: Demo

Run inside the backend container:
  python /app/scripts/seed_demo.py
"""

import json
import os
import sys

sys.path.insert(0, "/app")
sys.path.insert(0, "/app/scripts")

from app import create_app
from app.extensions import bcrypt, db
from app.models import (
    Campaign,
    CampaignScenario,
    Cohort,
    CohortCampaign,
    CohortMember,
    Role,
    Scenario,
    User,
)

# Import scenario builders + helpers from the existing seed scripts.
# These functions are pure Python (no DB calls) so importing them is safe.
from seed_uct_2026_jun_campaign import (
    CAMPAIGN_DESCRIPTION as UCT_DESCRIPTION,
    CAMPAIGN_NAME as UCT_CAMPAIGN_NAME,
    CAMPAIGN_SEED as UCT_CAMPAIGN_SEED,
    _prepare_config as _uct_prepare_config,
    _scenario_specs as _uct_scenario_specs,
)
from seed_pfl_campaign import SCENARIO_LEVEL1 as PFL_LEVEL1_CONFIG

# ── Config ────────────────────────────────────────────────────────────────────
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "ChangeMe1234!")
DEMO_COHORT_NAME = os.environ.get("DEMO_COHORT_NAME", "Demo")

PFL_CAMPAIGN_NAME = "Power Markets and Trading (PFL)"
PFL_CAMPAIGN_DESCRIPTION = (
    "GSB Executive Education course simulation – June 2026.\n\n"
    "Level 1 scenario: Merit-order dispatch and uniform pricing (SMP). "
    "Three coal generators, fixed inelastic demand."
)
PFL_CAMPAIGN_SEED = "pfl_level1_v1"
PFL_LEVEL1_NAME = "Level 1 – Market Foundations"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_admin() -> User:
    user = User.query.filter_by(email=ADMIN_EMAIL).first()
    if user:
        print(f"  ✓ Admin user already exists: {ADMIN_EMAIL} (id={user.id})")
        return user

    existing_count = User.query.count()
    if existing_count > 0:
        # DB is not empty; find any existing admin rather than creating a duplicate
        existing_admin = User.query.filter_by(role=Role.admin).first()
        if existing_admin:
            print(
                f"  ℹ DB has {existing_count} user(s); ADMIN_EMAIL={ADMIN_EMAIL!r} not found. "
                f"Using existing admin id={existing_admin.id} ({existing_admin.email})."
            )
            return existing_admin
        raise RuntimeError(
            f"DB has users but no admin role found and ADMIN_EMAIL={ADMIN_EMAIL!r} does not exist. "
            "Set ADMIN_EMAIL to an existing user's email or reset the database."
        )

    pw_hash = bcrypt.generate_password_hash(ADMIN_PASSWORD).decode("utf-8")
    user = User(email=ADMIN_EMAIL, password_hash=pw_hash, role=Role.admin)
    db.session.add(user)
    db.session.flush()
    print(f"  ✓ Created admin user: {ADMIN_EMAIL} (id={user.id})")
    return user


def _upsert_campaign(name: str, description: str, seed: str, admin: User) -> Campaign:
    campaign = Campaign.query.filter_by(name=name).first()
    if campaign:
        campaign.description = description
        campaign.designer_id = admin.id
        campaign.published = True
        campaign.seed = seed
        db.session.add(campaign)
        db.session.flush()
        print(f"  ✓ Campaign '{name}' already exists (id={campaign.id}) – updated")
    else:
        campaign = Campaign(
            name=name,
            description=description,
            designer_id=admin.id,
            published=True,
            seed=seed,
        )
        db.session.add(campaign)
        db.session.flush()
        print(f"  ✓ Created campaign '{name}' (id={campaign.id})")
    return campaign


def _link_scenario(campaign: Campaign, scenario: Scenario, order_index: int) -> None:
    link = CampaignScenario.query.filter_by(
        campaign_id=campaign.id, scenario_id=scenario.id
    ).first()
    if link is None:
        db.session.add(
            CampaignScenario(
                campaign_id=campaign.id,
                scenario_id=scenario.id,
                order_index=order_index,
                solo_enabled=True,
                cohort_enabled=True,
            )
        )


# ── PFL campaign seed ─────────────────────────────────────────────────────────

def _seed_pfl_campaign(admin: User) -> Campaign:
    campaign = _upsert_campaign(PFL_CAMPAIGN_NAME, PFL_CAMPAIGN_DESCRIPTION, PFL_CAMPAIGN_SEED, admin)

    # Scope lookup to scenarios already owned by the PFL campaign to avoid
    # collisions with UCT scenarios that share similar alias names.
    sc = Scenario.query.filter_by(name=PFL_LEVEL1_NAME, campaign_id=campaign.id).first()
    if sc is None:
        sc = Scenario(
            name=PFL_LEVEL1_NAME,
            config=PFL_LEVEL1_CONFIG,
            campaign_id=campaign.id,
        )
        db.session.add(sc)
        db.session.flush()
        print(f"    ✓ Created scenario '{PFL_LEVEL1_NAME}' (id={sc.id})")
    else:
        sc.config = PFL_LEVEL1_CONFIG
        db.session.add(sc)
        db.session.flush()
        print(f"    ✓ Updated scenario '{PFL_LEVEL1_NAME}' (id={sc.id})")

    _link_scenario(campaign, sc, 0)
    return campaign


# ── UCT 2026-Jun campaign seed ────────────────────────────────────────────────

def _seed_uct_campaign(admin: User) -> Campaign:
    # Use exact name lookup only – avoid LEGACY_CAMPAIGN_NAMES which includes the
    # PFL campaign name and would cause cross-campaign collision on fresh installs.
    campaign = _upsert_campaign(UCT_CAMPAIGN_NAME, UCT_DESCRIPTION, UCT_CAMPAIGN_SEED, admin)

    for order_index, (scenario_name, raw_config) in enumerate(_uct_scenario_specs()):
        prepared = _uct_prepare_config(raw_config)
        # Restrict lookup to scenarios already owned by this campaign so PFL
        # scenario aliases (e.g. 'Level 1 – Market Foundations') don't collide.
        scenario = Scenario.query.filter_by(
            name=scenario_name, campaign_id=campaign.id
        ).first()
        if scenario is None:
            scenario = Scenario(
                name=scenario_name,
                config=prepared,
                campaign_id=campaign.id,
            )
            db.session.add(scenario)
            db.session.flush()
            print(f"    ✓ Created scenario '{scenario_name}' (id={scenario.id})")
        else:
            scenario.config = prepared
            db.session.add(scenario)
            db.session.flush()
            print(f"    ✓ Updated scenario '{scenario_name}' (id={scenario.id})")

        _link_scenario(campaign, scenario, order_index)

    return campaign


# ── Demo cohort ───────────────────────────────────────────────────────────────

def _seed_demo_cohort(admin: User, campaigns: list) -> Cohort:
    cohort = Cohort.query.filter_by(name=DEMO_COHORT_NAME, trainer_id=admin.id).first()
    if cohort:
        print(f"  ✓ Cohort '{DEMO_COHORT_NAME}' already exists (id={cohort.id})")
    else:
        cohort = Cohort(name=DEMO_COHORT_NAME, trainer_id=admin.id)
        db.session.add(cohort)
        db.session.flush()
        print(f"  ✓ Created cohort '{DEMO_COHORT_NAME}' (id={cohort.id})")

    # Admin is both trainer and member
    if not CohortMember.query.filter_by(cohort_id=cohort.id, user_id=admin.id).first():
        db.session.add(CohortMember(cohort_id=cohort.id, user_id=admin.id))

    for campaign in campaigns:
        mapping = CohortCampaign.query.filter_by(
            cohort_id=cohort.id, campaign_id=campaign.id
        ).first()
        if mapping is None:
            mapping = CohortCampaign(
                cohort_id=cohort.id,
                campaign_id=campaign.id,
                visible=True,
                active=True,
            )
            db.session.add(mapping)
        else:
            mapping.visible = True
            mapping.active = True
            db.session.add(mapping)
        print(f"    ✓ Assigned campaign '{campaign.name}' to cohort '{DEMO_COHORT_NAME}'")

    return cohort


# ── Entry point ───────────────────────────────────────────────────────────────

def seed() -> None:
    app = create_app()
    with app.app_context():
        print("\n[seed_demo] ── Step 1: Admin user")
        admin = _get_or_create_admin()

        print("\n[seed_demo] ── Step 2: PFL campaign (Level 1)")
        pfl = _seed_pfl_campaign(admin)

        print("\n[seed_demo] ── Step 3: UCT 2026-Jun campaign (5 scenarios)")
        uct = _seed_uct_campaign(admin)

        print("\n[seed_demo] ── Step 4: Demo cohort")
        cohort = _seed_demo_cohort(admin, [pfl, uct])

        db.session.commit()

        result = {
            "admin_email": admin.email,
            "cohort": {"id": cohort.id, "name": cohort.name},
            "campaigns": [
                {"id": pfl.id, "name": pfl.name},
                {"id": uct.id, "name": uct.name},
            ],
        }
        print("\n[seed_demo] ✓ Seed complete")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    seed()
