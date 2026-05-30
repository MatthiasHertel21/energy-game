import io
import json
import sys
import uuid
from contextlib import redirect_stdout
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
APP_ROOT = SCRIPT_DIR.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from app import create_app
from app.extensions import bcrypt, db
from app.models import Campaign, CampaignScenario, Role, Scenario, User
from seed_uct_2026_jun_campaign import CAMPAIGN_NAME, seed as seed_uct_campaign


PASSWORD = 'UctUiTest123!'


def infer_expected_role(device_ids, devices_by_id):
    device_types = [str((devices_by_id.get(device_id) or {}).get('type') or '').lower() for device_id in device_ids]
    non_empty_types = [device_type for device_type in device_types if device_type]
    if non_empty_types and all('load' in device_type for device_type in non_empty_types):
        return 'consumer'
    return 'producer'


def ensure_uct_campaign() -> Campaign:
    # The base UCT seeder writes progress output to stdout; keep this helper JSON-only.
    with redirect_stdout(io.StringIO()):
        seed_uct_campaign()

    campaign = Campaign.query.filter_by(name=CAMPAIGN_NAME).order_by(Campaign.id.desc()).first()
    if not campaign:
        raise RuntimeError(f'Campaign {CAMPAIGN_NAME!r} not found after seeding')
    return campaign


def build_scenario_payload(scenario, tag, password_hash):
    config = scenario.config or {}
    player_types = list(config.get('player_types') or [])
    devices_by_id = {device.get('id'): device for device in (config.get('devices') or []) if device.get('id')}
    if not player_types:
        raise RuntimeError(f'Scenario {scenario.name!r} has no player types configured')

    players = []
    for index, player_type in enumerate(player_types, start=1):
        type_id = player_type.get('id')
        if not type_id:
            raise RuntimeError(f'Scenario {scenario.name!r} contains a player type without id')

        device_ids = [device_id for device_id in (player_type.get('devices') or []) if device_id]
        player = User(
            email=f'uct-ui-player-{tag}-{scenario.id}-{index}@test.com',
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

    return {
        'scenario_id': scenario.id,
        'scenario_name': scenario.name,
        'total_rounds': int((config.get('general') or {}).get('rounds') or 6),
        'round_span_hours': int((config.get('general') or {}).get('round_span_hours') or 6),
        'players': players,
    }


def main() -> None:
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        campaign = ensure_uct_campaign()
        password_hash = bcrypt.generate_password_hash(PASSWORD).decode('utf-8')

        scenario_rows = (
            db.session.query(CampaignScenario, Scenario)
            .join(Scenario, Scenario.id == CampaignScenario.scenario_id)
            .filter(CampaignScenario.campaign_id == campaign.id)
            .order_by(CampaignScenario.order_index.asc(), Scenario.id.asc())
            .all()
        )
        if not scenario_rows:
            raise RuntimeError(f'Campaign {campaign.name!r} has no linked scenarios')

        scenario_payloads = [
            build_scenario_payload(scenario, tag, password_hash)
            for _, scenario in scenario_rows
        ]

        db.session.commit()

        payload = {
            'tag': tag,
            'campaign_id': campaign.id,
            'campaign_name': campaign.name,
            'total_scenarios': len(scenario_payloads),
            'total_players': sum(len(scenario['players']) for scenario in scenario_payloads),
            'scenarios': scenario_payloads,
        }
        json.dump(payload, sys.stdout)


if __name__ == '__main__':
    main()