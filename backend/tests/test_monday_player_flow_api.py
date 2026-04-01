import json
import os
import sys
from pathlib import Path

import pytest
from flask_jwt_extended import create_access_token

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.engine import detect_player_role, run_round
from app.models import Campaign, CampaignScenario, Forecast, Result, Scenario, Session, SessionPlayerType, SessionStatus, User


def _load_monday_config() -> dict:
    monday_path = Path(__file__).resolve().parents[1] / 'debug' / 'monday_scenario.json'
    raw = json.loads(monday_path.read_text())
    config = raw['scenario']['config']

    # The debug export lags behind the DB version. Keep the test aligned with the
    # current Monday setup by adding the third player type when missing.
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


def _build_forecast_payload(config: dict, player_type: dict) -> dict:
    general = config.get('general', {}) or {}
    horizon_hours = int(general.get('forecast_horizon_hours', general.get('horizon_hours', 60)) or 60)
    devices_by_id = {device['id']: device for device in (config.get('devices') or []) if device.get('id')}

    aggregate_hours = [0.0] * horizon_hours
    device_rows = []
    bids = {}

    for device_id in player_type.get('devices', []):
        device = devices_by_id[device_id]
        device_type = str(device.get('type', '')).lower()

        if 'load' in device_type:
            baseline = float(device.get('baseline_load_mw', device.get('capacity_mw', 50)) or 0.0)
            peak = float(device.get('peak_load_mw', baseline) or baseline)
            hourly = min(max(baseline * 0.95, 1.0), peak)
            hours = [round(hourly, 3)] * horizon_hours
            price_a = 1600.0
            price_b = 1200.0
            price_c = 900.0
        elif device_type == 'battery':
            power = float(device.get('power_mw', device.get('max_power_mw', device.get('capacity_mw', 0))) or 0.0)
            hours = [0.0] * horizon_hours
            charge_hours = [0.0] * horizon_hours
            for idx in range(min(6, horizon_hours)):
                if idx in {0, 1}:
                    charge_hours[idx] = round(power * 0.4, 3)
                elif idx in {2, 3}:
                    hours[idx] = round(power * 0.6, 3)
            price_a = 250.0
            price_b = 450.0
            price_c = 650.0
            bids[device_id] = {
                'A': {'price': price_a, 'hours': hours},
                'B': {'price': price_b, 'hours': [0.0] * horizon_hours},
                'C': {'price': price_c, 'hours': [0.0] * horizon_hours},
                'A_CHG': {'price': 120.0, 'hours': charge_hours},
            }
            device_rows.append({'device_id': device_id, 'hours': hours, 'charge_hours': charge_hours})
            continue
        else:
            capacity = float(device.get('capacity_mw', device.get('max_power_mw', 0)) or 0.0)
            if device_type in {'pv', 'solar'}:
                hours = [0.0] * horizon_hours
                for idx in range(min(12, horizon_hours)):
                    if 6 <= idx <= 11:
                        hours[idx] = round(capacity * 0.7, 3)
            else:
                hours = [round(capacity * 0.6, 3) if idx < 12 else 0.0 for idx in range(horizon_hours)]
            price_a = 320.0
            price_b = 480.0
            price_c = 650.0

        for idx, value in enumerate(hours):
            aggregate_hours[idx] += float(value or 0.0)

        bids[device_id] = {
            'A': {'price': price_a, 'hours': hours},
            'B': {'price': price_b, 'hours': [0.0] * horizon_hours},
            'C': {'price': price_c, 'hours': [0.0] * horizon_hours},
        }
        device_rows.append({'device_id': device_id, 'hours': hours})

    return {
        'hours': [round(value, 3) for value in aggregate_hours],
        'devices': device_rows,
        'bids': bids,
    }


def _persist_round_result(session_id: int, round_num: int, player_id: int) -> None:
    session = db.session.get(Session, session_id)
    scenario = db.session.get(Scenario, session.scenario_id)
    config = scenario.config or {}
    selected_type = SessionPlayerType.query.filter_by(session_id=session_id, user_id=player_id).first()
    player_type = next(
        (candidate for candidate in (config.get('player_types') or []) if candidate.get('id') == getattr(selected_type, 'type_id', None)),
        None,
    )
    devices_by_id = {device.get('id'): device for device in (config.get('devices') or []) if device.get('id')}
    player_devices = [devices_by_id[device_id] for device_id in (player_type or {}).get('devices', []) if device_id in devices_by_id]
    player_role = detect_player_role(player_devices)

    normalized_forecasts = {}
    full_forecast = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=0).first()
    if full_forecast:
        normalized_forecasts[player_id] = {
            'hours': (full_forecast.data or {}).get('hours', []),
            'bids': full_forecast.bids or {},
            'devices': (full_forecast.data or {}).get('devices', []),
            'player_id': player_id,
        }

    result_payload = run_round(session_id, round_num, [player_id], normalized_forecasts, config, mode=session.mode)
    player_kpis = (result_payload.get('round_kpis') or {}).get(player_id)
    assert player_kpis is not None

    result = Result(
        session_id=session_id,
        player_id=player_id,
        round_num=round_num,
        data={
            'smp': result_payload.get('smp'),
            'volume': result_payload.get('volume'),
            'idp': result_payload.get('idp'),
            'id_trade_count': result_payload.get('id_trade_count', 0),
            'id_volume_mwh': result_payload.get('id_volume_mwh', 0.0),
            'player_role': player_role,
            'challenge_result': result_payload.get('challenge_results', {}).get(player_id),
            'kpis': player_kpis,
            'hourly_results': result_payload.get('hourly_results', []),
            'bid_dispatch': (result_payload.get('bid_dispatch') or {}).get(player_id, {}),
            'dam_bid_dispatch': (result_payload.get('dam_bid_dispatch') or {}).get(player_id, result_payload.get('dam_bid_dispatch', {})),
            'device_hourly_details': result_payload.get('device_hourly_details', {}),
            'dam_device_hourly_details': result_payload.get('dam_device_hourly_details', {}),
            'dam_hourly_results': result_payload.get('dam_hourly_results', []),
            'zone_results': result_payload.get('zone_results', []),
            'link_results': result_payload.get('link_results', []),
            'player_zone_info_by_player': result_payload.get('player_zone_info_by_player', {}),
            'da_baseline_metadata': result_payload.get('da_baseline_metadata', {}),
        },
        bid_dispatch=(result_payload.get('bid_dispatch') or {}).get(player_id, {}),
    )
    db.session.add(result)

    session.status = SessionStatus.scenario_complete
    session.current_round = round_num + 1
    db.session.add(session)
    db.session.commit()


@pytest.fixture
def app(monkeypatch):
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['RATELIMIT_ENABLED'] = False
    app.before_request_funcs[None] = [
        func for func in app.before_request_funcs.get(None, [])
        if getattr(func, '__module__', '') != 'flask_limiter.extension'
    ]
    monkeypatch.setattr('app.player.socketio.start_background_task', lambda *args, **kwargs: None)
    monkeypatch.setattr('app.sessions.socketio.start_background_task', lambda *args, **kwargs: None)

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def monday_setup(app):
    with app.app_context():
        player = User(email='monday-player@test.com', role='player', password_hash='test-hash')
        designer = User(email='monday-designer@test.com', role='designer', password_hash='test-hash')
        db.session.add_all([player, designer])
        db.session.flush()

        campaign = Campaign(name='Monday Campaign', description='Monday API flow test', designer_id=designer.id, published=True)
        db.session.add(campaign)
        db.session.flush()

        scenario = Scenario(name='Monday', campaign_id=campaign.id, config=_load_monday_config())
        db.session.add(scenario)
        db.session.flush()

        db.session.add(CampaignScenario(campaign_id=campaign.id, scenario_id=scenario.id, order_index=0, solo_enabled=True, cohort_enabled=True))
        db.session.commit()

        token = create_access_token(identity=str(player.id), additional_claims={'role': 'player'})
        return {
            'headers': {'Authorization': f'Bearer {token}'},
            'player_id': player.id,
            'scenario_id': scenario.id,
            'campaign_id': campaign.id,
            'config': scenario.config,
        }


@pytest.mark.parametrize(
    ('type_id', 'expected_role'),
    [
        ('ptype_mj97y61j_sxl6', 'producer'),
        ('ptype_mj9yhsec_5orq', 'consumer'),
        ('ptype_mn4igq2n_zx58', 'producer'),
    ],
)
def test_monday_player_flow_round_and_final_results(client, monday_setup, type_id, expected_role):
    headers = monday_setup['headers']
    scenario_id = monday_setup['scenario_id']
    campaign_id = monday_setup['campaign_id']
    config = monday_setup['config']
    player_id = monday_setup['player_id']

    create_response = client.post(
        '/api/player/solo-sessions',
        headers=headers,
        json={'scenario_id': scenario_id, 'campaign_id': campaign_id},
    )
    assert create_response.status_code == 201
    session_id = create_response.get_json()['session_id']

    briefing_response = client.get(f'/api/sessions/{session_id}/briefing', headers=headers)
    assert briefing_response.status_code == 200
    briefing = briefing_response.get_json()
    assert briefing['name'] == 'Monday'
    assert len(briefing['player_types']) == 3
    assert any(player_type['id'] == type_id for player_type in briefing['player_types'])

    select_response = client.post(
        f'/api/sessions/{session_id}/select-type',
        headers=headers,
        json={'type_id': type_id},
    )
    assert select_response.status_code == 200
    assert select_response.get_json()['type_id'] == type_id

    start_response = client.post(f'/api/sessions/{session_id}/start-briefing', headers=headers)
    assert start_response.status_code == 200

    player_type = next(player_type for player_type in briefing['player_types'] if player_type['id'] == type_id)
    forecast_payload = _build_forecast_payload(config, player_type)
    submit_response = client.post(
        '/api/player/forecast/full',
        headers=headers,
        json={'session_id': session_id, **forecast_payload},
    )
    assert submit_response.status_code == 200

    with client.application.app_context():
        _persist_round_result(session_id, 1, player_id)

    round_response = client.get(f'/api/sessions/{session_id}/round-results/1', headers=headers)
    assert round_response.status_code == 200
    round_data = round_response.get_json()
    assert round_data['round'] == 1
    assert round_data['my_result']['type'] == type_id
    assert round_data['my_result']['player_role'] == expected_role
    assert isinstance(round_data['my_result']['kpis']['hourly_breakdown'], list)
    assert isinstance(round_data['my_result']['kpis']['device_hourly_breakdown'], dict)
    assert round_data['my_result']['kpis']['planned_mwh'] >= 0
    assert round_data['my_result']['kpis']['dispatched_mwh'] >= 0

    if expected_role == 'consumer':
        assert round_data['my_result']['kpis']['revenue_zar'] <= 0
    else:
        assert round_data['my_result']['kpis']['revenue_zar'] >= 0

    final_response = client.get(f'/api/sessions/{session_id}/final-results', headers=headers)
    assert final_response.status_code == 200
    final_data = final_response.get_json()
    assert final_data['total_rounds'] == 1
    assert final_data['my_cumulative']['type'] == type_id
    assert final_data['my_cumulative']['rounds_played'] == 1
    assert len(final_data['round_history']) == 1
    assert len(final_data['final_ranking']) == 1
    assert final_data['final_ranking'][0]['player_id'] == player_id
    assert final_data['round_history'][0]['round_num'] == 1
    assert final_data['round_history'][0]['planned_mwh'] >= 0
    assert final_data['round_history'][0]['dispatched_mwh'] >= 0