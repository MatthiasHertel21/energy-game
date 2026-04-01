import json
import sys
import uuid
from pathlib import Path

from app import create_app
from app.extensions import bcrypt, db
from app.models import Campaign, CampaignScenario, Role, Scenario, User


PASSWORD = 'MondayUiTest123!'


def load_monday_config() -> dict:
    monday_path = Path('/app/debug/monday_scenario.json')
    raw = json.loads(monday_path.read_text())
    config = raw['scenario']['config']

    player_types = list(config.get('player_types') or [])
    type_ids = {player_type.get('id') for player_type in player_types}
    if 'ptype_mn4igq2n_zx58' not in type_ids:
        config = json.loads(json.dumps(config))
        config['devices'] = list(config.get('devices') or []) + [
            {
                'id': 'device_mn4ihpl8_19oy',
                'name': 'PV Park',
                'type': 'pv',
                'capacity_mw': 250,
                'max_power_mw': 250,
                'enable_multi_bid': True,
                'variable_cost_zar_per_mwh': 50,
                'fixed_cost_zar_per_hour': 0,
            },
            {
                'id': 'device_mn4ihz9x_19oz',
                'name': 'Battery',
                'type': 'battery',
                'capacity_mwh': 100,
                'capacity_mw': 50,
                'max_power_mw': 50,
                'power_mw': 50,
                'efficiency_pct': 90,
                'min_soc_pct': 20,
                'initial_soc_pct': 50,
                'enable_multi_bid': True,
                'fixed_cost_zar_per_hour': 0,
            },
        ]
        config['player_types'] = player_types + [
            {
                'id': 'ptype_mn4igq2n_zx58',
                'name': 'PV Bat Player',
                'zone': 1,
                'devices': ['device_mn4ihpl8_19oy', 'device_mn4ihz9x_19oz'],
                'description': 'Prosumer setup with PV generation and battery storage.',
            }
        ]
    return config


def main() -> None:
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        password_hash = bcrypt.generate_password_hash(PASSWORD).decode('utf-8')

        designer = User(
            email=f'monday-ui-designer-{tag}@test.com',
            role=Role.designer,
            password_hash=password_hash,
        )
        db.session.add(designer)
        db.session.flush()

        campaign = Campaign(
            name=f'Monday UI Campaign {tag}',
            description='E2E validation campaign for Monday player screen',
            designer_id=designer.id,
            published=True,
            seed=f'monday-ui-{tag}',
        )
        db.session.add(campaign)
        db.session.flush()

        scenario = Scenario(
            name=f'Monday UI {tag}',
            campaign_id=campaign.id,
            config=load_monday_config(),
        )
        db.session.add(scenario)
        db.session.flush()

        db.session.add(
            CampaignScenario(
                campaign_id=campaign.id,
                scenario_id=scenario.id,
                order_index=0,
                solo_enabled=True,
                cohort_enabled=True,
            )
        )

        player_specs = [
            ('ptype_mj97y61j_sxl6', 'producer'),
            ('ptype_mj9yhsec_5orq', 'consumer'),
            ('ptype_mn4igq2n_zx58', 'producer'),
        ]
        players = []
        for index, (type_id, expected_role) in enumerate(player_specs, start=1):
            player = User(
                email=f'monday-ui-player-{tag}-{index}@test.com',
                role=Role.player,
                password_hash=password_hash,
            )
            db.session.add(player)
            db.session.flush()
            players.append(
                {
                    'user_id': player.id,
                    'email': player.email,
                    'password': PASSWORD,
                    'type_id': type_id,
                    'expected_role': expected_role,
                }
            )

        db.session.commit()

        payload = {
            'tag': tag,
            'campaign_id': campaign.id,
            'campaign_name': campaign.name,
            'scenario_id': scenario.id,
            'scenario_name': scenario.name,
            'players': players,
        }
        json.dump(payload, sys.stdout)


if __name__ == '__main__':
    main()