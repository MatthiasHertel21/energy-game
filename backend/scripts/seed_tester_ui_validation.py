import json
import sys
import uuid

from app import create_app
from app.extensions import bcrypt, db
from app.models import Campaign, CampaignScenario, Role, Scenario, User


PASSWORD = 'TesterUiTest123!'
SCENARIO_NAME = 'Tester'


def infer_expected_role(device_ids, devices_by_id):
    device_types = [str((devices_by_id.get(device_id) or {}).get('type') or '').lower() for device_id in device_ids]
    non_empty_types = [device_type for device_type in device_types if device_type]
    if non_empty_types and all('load' in device_type for device_type in non_empty_types):
        return 'consumer'
    return 'producer'


def main() -> None:
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        scenario = Scenario.query.filter_by(name=SCENARIO_NAME).order_by(Scenario.id.desc()).first()
        if not scenario:
            raise SystemExit(f'Scenario {SCENARIO_NAME!r} not found')

        config = scenario.config or {}
        player_types = list(config.get('player_types') or [])
        devices_by_id = {device.get('id'): device for device in (config.get('devices') or []) if device.get('id')}

        if len(player_types) < 1:
            raise SystemExit(f'Scenario {SCENARIO_NAME!r} has no player types configured')

        password_hash = bcrypt.generate_password_hash(PASSWORD).decode('utf-8')

        designer = User(
            email=f'tester-ui-designer-{tag}@test.com',
            role=Role.designer,
            password_hash=password_hash,
        )
        db.session.add(designer)
        db.session.flush()

        campaign = Campaign(
            name=f'Tester UI Campaign {tag}',
            description='E2E validation campaign for Tester player screen',
            designer_id=designer.id,
            published=True,
            seed=f'tester-ui-{tag}',
        )
        db.session.add(campaign)
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

        players = []
        for index, player_type in enumerate(player_types, start=1):
            type_id = player_type.get('id')
            device_ids = list(player_type.get('devices') or [])
            player = User(
                email=f'tester-ui-player-{tag}-{index}@test.com',
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
                    'type_name': player_type.get('name'),
                    'expected_role': infer_expected_role(device_ids, devices_by_id),
                    'primary_device_id': device_ids[0] if device_ids else None,
                    'device_ids': device_ids,
                }
            )

        db.session.commit()

        payload = {
            'tag': tag,
            'campaign_id': campaign.id,
            'campaign_name': campaign.name,
            'scenario_id': scenario.id,
            'scenario_name': scenario.name,
            'total_rounds': int((config.get('general') or {}).get('rounds') or 6),
            'players': players,
        }
        json.dump(payload, sys.stdout)


if __name__ == '__main__':
    main()