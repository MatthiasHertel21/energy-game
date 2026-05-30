import pytest

from app import create_app, db
from app.models import Cohort, CohortMember, Result, Scenario, Session, SessionPlayerType, User


@pytest.fixture
def app():
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['RATELIMIT_ENABLED'] = False
    app.before_request_funcs[None] = [
        func for func in app.before_request_funcs.get(None, [])
        if getattr(func, '__module__', '') != 'flask_limiter.extension'
    ]

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def player_auth_headers(app):
    from flask_jwt_extended import create_access_token

    with app.app_context():
        player = User(email='player-round-results@test.com', role='player', password_hash='test-hash')
        trainer = User(email='trainer-round-results@test.com', role='trainer', password_hash='test-hash')
        db.session.add_all([player, trainer])
        db.session.commit()

        token = create_access_token(identity=str(player.id), additional_claims={'role': 'player'})
        return {'Authorization': f'Bearer {token}'}, player.id, trainer.id


def _build_session_with_result(player_id, trainer_id):
    scenario = Scenario(
        name='Interzonal API Scenario',
        config={
            'scoring': {'weights': {'profit': 0.6, 'imbalance': 0.3, 'curtailment': 0.1}},
            'player_types': [
                {'id': 'consumer_type', 'name': 'Consumer Type', 'devices': ['load-1'], 'zone': 2},
            ],
            'devices': [
                {'id': 'load-1', 'type': 'industrial_load', 'baseline_load_mw': 80, 'peak_load_mw': 100},
            ],
            'events': [],
        },
    )
    cohort = Cohort(name='Interzonal Cohort', trainer_id=trainer_id)
    db.session.add_all([scenario, cohort])
    db.session.commit()

    db.session.add(CohortMember(cohort_id=cohort.id, user_id=player_id))

    session = Session(cohort_id=cohort.id, scenario_id=scenario.id, status='round_results', current_round=1, mode='shared_market')
    db.session.add(session)
    db.session.commit()

    db.session.add(SessionPlayerType(session_id=session.id, user_id=player_id, type_id='consumer_type'))

    result = Result(
        session_id=session.id,
        player_id=player_id,
        round_num=1,
        data={
            'smp': 550,
            'volume': 1200,
            'player_role': 'consumer',
            'kpis': {
                'revenue_zar': -660000,
                'profit_zar': -710000,
                'variable_cost_zar': 0,
                'fixed_cost_zar': 0,
                'imbalance_cost_zar': 0,
                'grid_constraint_cost_zar': 50000,
                'grid_constraint_cost_per_mwh_zar': 41.67,
                'zone_shortfall_mwh': 30,
                'curtailment_cost_zar': 0,
                'congestion_revenue_zar': 0,
                'co2_emissions_kg': 0,
                'dispatched_mwh': 1200,
                'planned_mwh': 1200,
                'actual_mwh': 1200,
                'hourly_breakdown': [],
                'device_hourly_breakdown': {},
            },
            'zone_results': [
                {
                    'zone_id': 2,
                    'status': 'supply_shortfall',
                    'local_generation_mwh': 200,
                    'local_demand_mwh': 1200,
                    'imports_mwh': 970,
                    'exports_mwh': 0,
                    'losses_mwh': 20,
                    'unserved_demand_mwh': 30,
                    'extra_cost_total_zar': 50000,
                    'extra_cost_per_mwh_zar': 41.67,
                    'coverage_local_pct': 16.7,
                    'coverage_total_pct': 97.5,
                }
            ],
            'link_results': [
                {
                    'from_zone': 1,
                    'to_zone': 2,
                    'atc_mwh': 1000,
                    'flow_mwh': 990,
                    'utilization_pct': 99.0,
                    'losses_mwh': 20,
                    'binding': True,
                }
            ],
            'player_zone_info_by_player': {
                str(player_id): {
                    'zone_id': 2,
                    'zone_status': 'supply_shortfall',
                    'zone_local_generation_mwh': 200,
                    'zone_local_demand_mwh': 1200,
                    'zone_imports_mwh': 970,
                    'zone_exports_mwh': 0,
                    'zone_unserved_demand_mwh': 30,
                    'zone_extra_cost_total_zar': 50000,
                    'zone_extra_cost_per_mwh_zar': 41.67,
                    'zone_coverage_total_pct': 97.5,
                    'zone_links': [
                        {
                            'peer_zone': 1,
                            'flow_mwh': 990,
                            'atc_mwh': 1000,
                            'utilization_pct': 99.0,
                            'direction': 'in',
                        }
                    ],
                }
            },
        },
    )
    db.session.add(result)
    db.session.commit()
    return session.id


def _build_legacy_delta_session_with_inconsistent_top_level_result(player_id, trainer_id):
    scenario = Scenario(
        name='Legacy Delta Repair Scenario',
        config={
            'scoring': {'weights': {'profit': 0.6, 'imbalance': 0.3, 'curtailment': 0.1}},
            'player_types': [
                {'id': 'producer_type', 'name': 'Producer Type', 'devices': ['gen-1'], 'zone': 1},
            ],
            'devices': [
                {'id': 'gen-1', 'type': 'coal', 'capacity_mw': 600, 'variable_cost_zar_per_mwh': 600},
            ],
            'events': [],
        },
    )
    cohort = Cohort(name='Legacy Delta Cohort', trainer_id=trainer_id)
    db.session.add_all([scenario, cohort])
    db.session.commit()

    db.session.add(CohortMember(cohort_id=cohort.id, user_id=player_id))

    session = Session(cohort_id=cohort.id, scenario_id=scenario.id, status='round_results', current_round=2, mode='shared_market')
    db.session.add(session)
    db.session.commit()

    db.session.add(SessionPlayerType(session_id=session.id, user_id=player_id, type_id='producer_type'))

    result = Result(
        session_id=session.id,
        player_id=player_id,
        round_num=2,
        data={
            'smp': 600,
            'idp': 600,
            'volume': 900,
            'player_role': 'producer',
            'da_baseline_metadata': {
                'da_smp': 440,
                'players': {
                    str(player_id): {
                        'da_volume_mwh': 361.6,
                        'id_delta_mwh': 0.0,
                        'total_volume_mwh': 361.6,
                        'da_revenue_zar': 216960.0,
                        'id_revenue_zar': 0.0,
                        'total_revenue_zar': 216960.0,
                    }
                },
            },
            'hourly_results': [
                {
                    'hour_idx': 2,
                    'round_num': 2,
                    'scenario_hour_idx': 2,
                    'display_label': 'H2 (10:00)',
                    'hour_of_day': 10,
                    'round_hour_offset': 0,
                    'hour_offset': 0,
                    'smp': 600,
                    'idp': 600,
                    'volume': 900,
                    'id_trade_count': 0,
                    'id_volume_mwh': 0.0,
                    'is_clearing_hour': True,
                }
            ],
            'kpis': {
                'revenue_zar': 216960.0,
                'profit_zar': 0.0,
                'variable_cost_zar': 216960.0,
                'fixed_cost_zar': 0.0,
                'imbalance_cost_zar': 0.0,
                'battery_charge_cost_zar': 0.0,
                'atc_dispatch_cost_zar': 0.0,
                'grid_constraint_cost_zar': 0.0,
                'congestion_revenue_zar': 0.0,
                'dispatched_mwh': 361.6,
                'planned_mwh': 523.8,
                'actual_mwh': 0.0,
                'hourly_breakdown': [
                    {
                        'hour': 2,
                        'planned_mw': 523.8,
                        'dispatched_mw': 361.6,
                        'actual_mw': 0.0,
                        'imbalance_mwh': 0.0,
                        'revenue_zar': 216960.0,
                        'variable_cost_zar': 216960.0,
                        'fixed_cost_zar': 0.0,
                        'imbalance_cost_zar': 0.0,
                        'battery_charge_cost_zar': 0.0,
                        'atc_dispatch_cost_zar': 0.0,
                        'grid_constraint_cost_zar': 0.0,
                        'congestion_revenue_zar': 0.0,
                        'profit_zar': 0.0,
                    }
                ],
                'device_hourly_breakdown': {
                    'gen-1': [
                        {
                            'hour': 2,
                            'planned_mw': 523.8,
                            'dispatched_mw': 361.6,
                            'total_dispatched_mwh': 361.6,
                            'actual_mw': 0.0,
                            'imbalance_mwh': 0.0,
                            'da_dispatched_mwh': 361.6,
                            'id_dispatched_mwh': 0.0,
                            'da_price_zar': 440.0,
                            'id_price_zar': 600.0,
                            'da_revenue_zar': 159104.0,
                            'id_revenue_zar': 0.0,
                            'revenue_zar': 159104.0,
                            'variable_cost_zar': 216960.0,
                            'fixed_cost_zar': 0.0,
                            'imbalance_cost_zar': 0.0,
                            'battery_charge_cost_zar': 0.0,
                            'congestion_revenue_zar': 0.0,
                            'profit_zar': -57856.0,
                        }
                    ]
                },
            },
            'zone_results': [],
            'link_results': [],
            'player_zone_info_by_player': {str(player_id): {'zone_id': 1}},
        },
    )
    db.session.add(result)
    db.session.commit()
    return session.id


def test_round_results_endpoint_exposes_interzonal_payloads(app, client, player_auth_headers):
    headers, player_id, trainer_id = player_auth_headers

    with app.app_context():
        session_id = _build_session_with_result(player_id, trainer_id)

    response = client.get(f'/api/sessions/{session_id}/round-results/1', headers=headers)

    assert response.status_code == 200
    data = response.get_json()
    assert data['round'] == 1
    assert data['my_result']['type'] == 'consumer_type'
    assert data['my_result']['kpis']['grid_constraint_cost_zar'] == 50000
    assert data['my_result']['kpis']['zone_shortfall_mwh'] == 30
    assert data['my_result']['zone_results'][0]['status'] == 'supply_shortfall'
    assert data['my_result']['link_results'][0]['binding'] is True
    assert data['my_result']['player_zone_info']['zone_id'] == 2
    assert data['my_result']['player_zone_info']['zone_status'] == 'supply_shortfall'
    assert data['my_result']['player_zone_info']['zone_links'][0]['peer_zone'] == 1
    assert data['ranking'][0]['player_zone_info']['zone_id'] == 2


def test_latest_round_results_endpoint_preserves_interzonal_payloads(app, client, player_auth_headers):
    headers, player_id, trainer_id = player_auth_headers

    with app.app_context():
        session_id = _build_session_with_result(player_id, trainer_id)

    response = client.get(f'/api/sessions/{session_id}/latest-round-results', headers=headers)

    assert response.status_code == 200
    data = response.get_json()
    assert data['round'] == 1
    assert data['my_result']['player_zone_info']['zone_extra_cost_total_zar'] == 50000
    assert data['my_result']['zone_results'][0]['extra_cost_total_zar'] == 50000
    assert data['my_result']['link_results'][0]['utilization_pct'] == 99.0


def test_round_results_endpoint_repairs_legacy_delta_settlement_mismatch(app, client, player_auth_headers):
    headers, player_id, trainer_id = player_auth_headers

    with app.app_context():
        session_id = _build_legacy_delta_session_with_inconsistent_top_level_result(player_id, trainer_id)

    response = client.get(f'/api/sessions/{session_id}/round-results/2', headers=headers)

    assert response.status_code == 200
    data = response.get_json()
    my_result = data['my_result']
    kpis = my_result['kpis']
    da_id_breakdown = my_result['da_id_breakdown']

    assert kpis['revenue_zar'] == 159104.0
    assert kpis['profit_zar'] == -57856.0
    assert kpis['variable_cost_zar'] == 216960.0
    assert kpis['hourly_breakdown'][0]['revenue_zar'] == 159104.0
    assert kpis['hourly_breakdown'][0]['profit_zar'] == -57856.0
    assert my_result['profit'] == -57856.0
    assert da_id_breakdown['da_price_zar'] == 440.0
    assert da_id_breakdown['da_revenue_zar'] == 159104.0
    assert da_id_breakdown['id_revenue_zar'] == 0.0
    assert da_id_breakdown['total_revenue_zar'] == 159104.0