import json
import os
import sys
import uuid
import ast
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.engine import detect_player_role, run_round
from app.models import Campaign, CampaignScenario, Forecast, Result, Scenario, Session, SessionPlayerType, SessionStatus, User


ROUND_TOLERANCE = 1.0
VALUE_TOLERANCE = 0.05
MWH_TOLERANCE = 0.001


def _float(value, default=0.0):
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return default


def _assert_close(actual, expected, tolerance, label):
    assert _float(actual) == pytest.approx(_float(expected), abs=tolerance), label


def _signed_hours(hours, player_role: str) -> list[float]:
    sign = -1.0 if player_role == 'consumer' else 1.0
    return [round(sign * _float(hour), 3) for hour in (hours or [])]


def _validate_bid_dispatch(bid_dispatch: dict, hourly_breakdown: list[dict]) -> None:
    hourly_smp = {int(row.get('hour', idx)): _float(row.get('smp')) for idx, row in enumerate(hourly_breakdown)}
    for device_dispatch in (bid_dispatch or {}).values():
        for lot_rows in (device_dispatch or {}).values():
            for row in (lot_rows or []):
                offered = _float(row.get('mw_offered'))
                dispatched = _float(row.get('mw_dispatched'))
                ratio = _float(row.get('acceptance_ratio'))
                hour_idx = int(row.get('hour_idx', row.get('hour_offset', 0)) or 0)
                assert 0.0 <= ratio <= 1.0
                if abs(offered) > 1e-9:
                    _assert_close(dispatched, offered * ratio, 0.2, 'bid dispatch must match offered volume times acceptance ratio')
                _assert_close(row.get('smp'), hourly_smp.get(hour_idx, row.get('smp')), VALUE_TOLERANCE, 'bid dispatch SMP must match the round hourly SMP')


def _validate_device_breakdown(device_breakdown: dict) -> None:
    battery_charge_sum = 0.0
    battery_discharge_sum = 0.0
    battery_revenue_sum = 0.0
    battery_soc_start = None
    battery_soc_end = None
    co2_sum = 0.0

    for device_id, rows in (device_breakdown or {}).items():
        assert isinstance(rows, list), f'{device_id} device rows must be a list'
        for row in rows:
            total_dispatched = _float(row.get('total_dispatched_mwh', row.get('dispatched_mw')))
            da_dispatched = _float(row.get('da_dispatched_mwh'))
            id_dispatched = _float(row.get('id_dispatched_mwh'))
            revenue = _float(row.get('revenue_zar'))
            da_revenue = _float(row.get('da_revenue_zar'))
            id_revenue = _float(row.get('id_revenue_zar'))
            variable_cost = _float(row.get('variable_cost_zar'))
            fixed_cost = _float(row.get('fixed_cost_zar'))
            imbalance_cost = _float(row.get('imbalance_cost_zar'))
            battery_charge_cost = _float(row.get('battery_charge_cost_zar'))
            congestion_revenue = _float(row.get('congestion_revenue_zar'))
            network_shortfall_cost = _float(row.get('network_shortfall_cost_zar'))
            profit = _float(row.get('profit_zar'))
            imbalance_mwh = _float(row.get('imbalance_mwh'))
            actual_mw = _float(row.get('actual_mw'))
            dispatched_mw = _float(row.get('total_dispatched_mwh', row.get('dispatched_mw')))

            _assert_close(total_dispatched, da_dispatched + id_dispatched, MWH_TOLERANCE, 'device total dispatched must equal DA plus ID dispatched volume')
            _assert_close(revenue, da_revenue + id_revenue, VALUE_TOLERANCE, 'device revenue must equal DA plus ID revenue')
            _assert_close(imbalance_mwh, actual_mw - dispatched_mw, VALUE_TOLERANCE, 'device imbalance MWh must equal actual minus dispatched volume')
            expected_profit = revenue - variable_cost - fixed_cost - imbalance_cost - battery_charge_cost - network_shortfall_cost + congestion_revenue
            _assert_close(profit, expected_profit, VALUE_TOLERANCE, 'device profit must match the device profit formula')

            if 'battery_soc_start_pct' in row and row.get('battery_soc_start_pct') not in (None, 0, 0.0):
                if battery_soc_start is None:
                    battery_soc_start = _float(row.get('battery_soc_start_pct'))
                battery_soc_end = _float(row.get('battery_soc_end_pct'))

            battery_charge_sum += _float(row.get('battery_charged_mwh'))
            battery_discharge_sum += total_dispatched
            battery_revenue_sum += revenue
            co2_sum += _float(row.get('co2_kg'))

    return {
        'battery_charge_sum': battery_charge_sum,
        'battery_discharge_sum': battery_discharge_sum,
        'battery_revenue_sum': battery_revenue_sum,
        'battery_soc_start': battery_soc_start,
        'battery_soc_end': battery_soc_end,
        'co2_sum': co2_sum,
    }


def _validate_hourly_breakdown(hourly_breakdown: list[dict], device_breakdown: dict) -> None:
    device_ids = list((device_breakdown or {}).keys())
    for idx, hour in enumerate(hourly_breakdown):
        device_rows = [device_breakdown[device_id][idx] for device_id in device_ids if idx < len(device_breakdown[device_id])]
        planned_sum = sum(_float(row.get('planned_mw')) for row in device_rows)
        dispatched_sum = sum(_float(row.get('total_dispatched_mwh', row.get('dispatched_mw'))) for row in device_rows)
        actual_sum = sum(_float(row.get('actual_mw')) for row in device_rows)
        imbalance_mwh_sum = sum(_float(row.get('imbalance_mwh')) for row in device_rows)
        battery_charge_sum = sum(_float(row.get('battery_charge_cost_zar')) for row in device_rows)

        _assert_close(hour.get('planned_mw'), planned_sum, MWH_TOLERANCE, 'hour planned volume must equal the sum of device planned volumes')
        _assert_close(hour.get('dispatched_mw'), dispatched_sum, MWH_TOLERANCE, 'hour dispatched volume must equal the sum of device dispatched volumes')
        _assert_close(hour.get('actual_mw'), actual_sum, VALUE_TOLERANCE, 'hour actual volume must equal the sum of device actual volumes')
        _assert_close(hour.get('imbalance_mwh'), round(imbalance_mwh_sum, 3), VALUE_TOLERANCE, 'hour imbalance volume must equal the sum of device imbalance volumes')
        _assert_close(hour.get('battery_charge_cost_zar'), round(battery_charge_sum, 2), VALUE_TOLERANCE, 'hour battery charge cost must equal the sum of device charge costs')

        expected_profit = (
            _float(hour.get('revenue_zar'))
            - _float(hour.get('variable_cost_zar'))
            - _float(hour.get('fixed_cost_zar'))
            - _float(hour.get('imbalance_cost_zar'))
            - _float(hour.get('battery_charge_cost_zar'))
            - _float(hour.get('network_shortfall_cost_zar'))
            + _float(hour.get('congestion_revenue_zar'))
        )
        _assert_close(hour.get('profit_zar'), expected_profit, ROUND_TOLERANCE, 'hour profit must satisfy the hourly profit formula')


def _validate_kpis(kpis: dict, my_result: dict, weights: dict) -> None:
    hourly_breakdown = kpis['hourly_breakdown']
    device_breakdown = kpis['device_hourly_breakdown']
    device_totals = _validate_device_breakdown(device_breakdown)
    _validate_hourly_breakdown(hourly_breakdown, device_breakdown)
    _validate_bid_dispatch(kpis.get('bid_dispatch', {}), hourly_breakdown)

    _assert_close(kpis.get('planned_mwh'), sum(_float(hour.get('planned_mw')) for hour in hourly_breakdown), MWH_TOLERANCE, 'planned_mwh must equal the sum of hourly planned volumes')
    _assert_close(kpis.get('dispatched_mwh'), sum(_float(hour.get('dispatched_mw')) for hour in hourly_breakdown), MWH_TOLERANCE, 'dispatched_mwh must equal the sum of hourly dispatched volumes')
    _assert_close(kpis.get('actual_mwh'), sum(_float(hour.get('actual_mw')) for hour in hourly_breakdown), VALUE_TOLERANCE, 'actual_mwh must equal the sum of hourly actual volumes')
    _assert_close(kpis.get('revenue_zar'), round(sum(_float(hour.get('revenue_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'revenue_zar must equal the rounded sum of hourly revenues')
    _assert_close(kpis.get('variable_cost_zar'), round(sum(_float(hour.get('variable_cost_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'variable_cost_zar must equal the rounded sum of hourly variable costs')
    _assert_close(kpis.get('fixed_cost_zar'), round(sum(_float(hour.get('fixed_cost_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'fixed_cost_zar must equal the rounded sum of hourly fixed costs')
    _assert_close(kpis.get('imbalance_mwh'), round(sum(_float(hour.get('imbalance_mwh')) for hour in hourly_breakdown), 3), VALUE_TOLERANCE, 'imbalance_mwh must equal the sum of hourly imbalance volumes')
    _assert_close(kpis.get('imbalance_cost_zar'), round(sum(_float(hour.get('imbalance_cost_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'imbalance_cost_zar must equal the rounded sum of hourly imbalance costs')
    _assert_close(kpis.get('battery_charge_cost_zar'), round(sum(_float(hour.get('battery_charge_cost_zar')) for hour in hourly_breakdown), 2), VALUE_TOLERANCE, 'battery_charge_cost_zar must equal the sum of hourly battery charge costs')
    _assert_close(kpis.get('congestion_revenue_zar'), round(sum(_float(hour.get('congestion_revenue_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'congestion_revenue_zar must equal the rounded sum of hourly congestion revenues')
    _assert_close(kpis.get('profit_zar'), round(sum(_float(hour.get('profit_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'profit_zar must equal the rounded sum of hourly profits')
    _assert_close(kpis.get('curtailment_mwh'), round(sum(_float(hour.get('curtailment_mwh')) for hour in hourly_breakdown), 3), VALUE_TOLERANCE, 'curtailment_mwh must equal the sum of hourly curtailment volumes')
    _assert_close(kpis.get('curtailment_cost_zar'), round(sum(_float(hour.get('curtailment_cost_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'curtailment_cost_zar must equal the rounded sum of hourly curtailment costs')
    if any('network_shortfall_cost_zar' in hour for hour in hourly_breakdown):
        _assert_close(kpis.get('atc_dispatch_cost_zar'), round(sum(_float(hour.get('network_shortfall_cost_zar')) for hour in hourly_breakdown), 0), ROUND_TOLERANCE, 'ATC dispatch cost must equal the rounded sum of hourly network shortfall costs')
    _assert_close(kpis.get('co2_emissions_kg'), round(device_totals['co2_sum'], 2), VALUE_TOLERANCE, 'co2_emissions_kg must equal the sum of device CO2 emissions')

    _assert_close(kpis.get('atc_dispatch_cost_zar'), kpis.get('grid_constraint_cost_zar'), ROUND_TOLERANCE, 'ATC dispatch cost must equal the legacy grid constraint cost alias')
    dispatched = _float(kpis.get('dispatched_mwh'))
    expected_grid_cost_per_mwh = round(_float(kpis.get('grid_constraint_cost_zar')) / dispatched, 2) if dispatched > 1e-9 else 0.0
    _assert_close(kpis.get('grid_constraint_cost_per_mwh_zar'), expected_grid_cost_per_mwh, VALUE_TOLERANCE, 'grid constraint cost per MWh must equal grid cost divided by dispatched volume')

    _assert_close(my_result.get('profit'), kpis.get('profit_zar'), ROUND_TOLERANCE, 'top-level profit must match KPI profit')
    _assert_close(my_result.get('variable_cost'), kpis.get('variable_cost_zar'), ROUND_TOLERANCE, 'top-level variable cost must match KPI variable cost')
    _assert_close(my_result.get('imbalance'), kpis.get('imbalance_mwh'), VALUE_TOLERANCE, 'top-level imbalance must match KPI imbalance volume')
    _assert_close(my_result.get('curtailment'), kpis.get('curtailment_mwh'), VALUE_TOLERANCE, 'top-level curtailment must match KPI curtailment volume')

    battery_device_ids = [device_id for device_id, rows in (device_breakdown or {}).items() if any(_float(row.get('battery_charged_mwh')) > 1e-9 or _float(row.get('battery_charge_cost_zar')) > 1e-9 or _float(row.get('battery_soc_end_pct')) > 1e-9 for row in rows)]
    battery_rows = [row for device_id in battery_device_ids for row in device_breakdown.get(device_id, [])]
    battery_charge_sum = sum(_float(row.get('battery_charged_mwh')) for row in battery_rows)
    battery_discharge_sum = sum(_float(row.get('total_dispatched_mwh', row.get('dispatched_mw'))) for row in battery_rows)
    battery_charge_cost_sum = sum(_float(row.get('battery_charge_cost_zar')) for row in battery_rows)
    battery_revenue_sum = sum(_float(row.get('da_revenue_zar')) + _float(row.get('id_revenue_zar')) for row in battery_rows)
    _assert_close(kpis.get('battery_charged_mwh'), round(battery_charge_sum, 3), VALUE_TOLERANCE, 'battery_charged_mwh must equal the sum of battery device charged volume')
    _assert_close(kpis.get('battery_discharged_mwh'), round(battery_discharge_sum, 3), VALUE_TOLERANCE, 'battery_discharged_mwh must equal the sum of battery device discharged volume')
    _assert_close(kpis.get('battery_charge_cost_zar'), round(battery_charge_cost_sum, 2), VALUE_TOLERANCE, 'battery_charge_cost_zar must equal the sum of battery device charge costs')
    _assert_close(kpis.get('battery_arbitrage_revenue_zar'), round(battery_revenue_sum - battery_charge_cost_sum, 0), ROUND_TOLERANCE, 'battery_arbitrage_revenue_zar must equal battery revenue minus charge cost')

    if battery_rows:
        first_soc = next((_float(row.get('battery_soc_start_pct')) for row in battery_rows if row.get('battery_soc_start_pct') is not None), None)
        last_soc = next((_float(row.get('battery_soc_end_pct')) for row in reversed(battery_rows) if row.get('battery_soc_end_pct') is not None), None)
        if first_soc is not None:
            _assert_close(kpis.get('battery_soc_start_pct'), first_soc, VALUE_TOLERANCE, 'battery_soc_start_pct must match the first battery device SoC')
        if last_soc is not None:
            _assert_close(kpis.get('battery_soc_end_pct'), last_soc, VALUE_TOLERANCE, 'battery_soc_end_pct must match the last battery device SoC')

    raw_score = (
        _float(kpis.get('profit_zar')) * _float(weights.get('profit', 0.6))
        - abs(_float(kpis.get('imbalance_mwh'))) * _float(weights.get('imbalance', 0.3)) * 1000
        - abs(_float(kpis.get('curtailment_mwh'))) * _float(weights.get('curtailment', 0.1)) * 1000
    )
    expected_total_score = max(0, min(100, (raw_score + 5000000) / 100000))
    _assert_close(my_result.get('total_score'), round(expected_total_score, 2), VALUE_TOLERANCE, 'total_score must match the configured scoring formula')


def _validate_da_id_breakdown(da_id_breakdown: dict) -> None:
    hourly_detail = da_id_breakdown.get('hourly_detail', [])
    daily_summary = da_id_breakdown.get('daily_summary', [])
    _assert_close(da_id_breakdown.get('total_revenue_zar'), _float(da_id_breakdown.get('da_revenue_zar')) + _float(da_id_breakdown.get('id_revenue_zar')), ROUND_TOLERANCE, 'DA/ID total revenue must equal DA revenue plus ID revenue')
    _assert_close(da_id_breakdown.get('final_volume_signed_mwh'), _float(da_id_breakdown.get('da_volume_signed_mwh')) + _float(da_id_breakdown.get('id_delta_mwh')), VALUE_TOLERANCE, 'final signed volume must equal DA signed volume plus ID delta')
    _assert_close(da_id_breakdown.get('da_volume_mwh'), abs(_float(da_id_breakdown.get('da_volume_signed_mwh'))), VALUE_TOLERANCE, 'absolute DA volume must match the absolute signed DA volume')
    _assert_close(da_id_breakdown.get('final_volume_mwh'), abs(_float(da_id_breakdown.get('final_volume_signed_mwh'))), VALUE_TOLERANCE, 'absolute final volume must match the absolute signed final volume')

    daily_from_hours = {}
    for entry in hourly_detail:
        day = int(entry.get('day', 0) or 0)
        daily_from_hours.setdefault(day, {'da_mwh': 0.0, 'id_mwh': 0.0, 'delta_mwh': 0.0})
        daily_from_hours[day]['da_mwh'] += abs(_float(entry.get('da_mwh')))
        daily_from_hours[day]['id_mwh'] += abs(_float(entry.get('id_mwh')))
        daily_from_hours[day]['delta_mwh'] += _float(entry.get('delta_mwh'))
        _assert_close(entry.get('delta_mwh'), _float(entry.get('id_mwh')) - _float(entry.get('da_mwh')), VALUE_TOLERANCE, 'hourly DA/ID delta must equal final volume minus DA baseline for the hour')
        assert bool(entry.get('is_da_locked')) == (_float(entry.get('da_mwh')) != 0.0)

    for day_entry in daily_summary:
        day = int(day_entry.get('day', 0) or 0)
        expected = daily_from_hours.get(day, {'da_mwh': 0.0, 'id_mwh': 0.0, 'delta_mwh': 0.0})
        _assert_close(day_entry.get('da_mwh'), round(expected['da_mwh'], 2), VALUE_TOLERANCE, 'daily DA volume must equal the sum of hourly DA volumes')
        _assert_close(day_entry.get('id_mwh'), round(expected['id_mwh'], 2), VALUE_TOLERANCE, 'daily final volume must equal the sum of hourly final volumes')
        _assert_close(day_entry.get('delta_mwh'), expected['delta_mwh'], VALUE_TOLERANCE, 'daily delta must equal the sum of hourly deltas')


def _aggregate_bid_dispatch(round_reports: list[dict]) -> dict:
    aggregate = {}
    for report in round_reports:
        my_result = ((report or {}).get('my_result') or {})
        bid_dispatch = (my_result.get('bid_dispatch') or my_result.get('dam_bid_dispatch') or {})
        for device_id, lots in bid_dispatch.items():
            device_bucket = aggregate.setdefault(device_id, {})
            for lot_label, rows in (lots or {}).items():
                bucket = device_bucket.setdefault(lot_label, {
                    'mw_offered': 0.0,
                    'mw_dispatched': 0.0,
                    'total_revenue': 0.0,
                    'rounds_offered': 0,
                })
                has_offer = False
                for row in (rows or []):
                    offered = _float(row.get('mw_offered'))
                    dispatched = _float(row.get('mw_dispatched'))
                    smp = _float(row.get('smp'))
                    bucket['mw_offered'] += offered
                    bucket['mw_dispatched'] += dispatched
                    bucket['total_revenue'] += dispatched * smp
                    if offered > 1e-9:
                        has_offer = True
                if has_offer:
                    bucket['rounds_offered'] += 1
    return aggregate


def _validate_final_results_consistency(final_data: dict, round_reports: list[dict], weights: dict, player_id: int, type_id: str) -> None:
    my_cumulative = final_data['my_cumulative']
    round_history = final_data['round_history']
    ranking = final_data['final_ranking']

    assert my_cumulative['type'] == type_id
    assert my_cumulative['rounds_played'] == len(round_reports)
    assert final_data['total_rounds'] == len(round_reports)
    assert len(round_history) == len(round_reports)
    assert len(ranking) == 1
    assert ranking[0]['player_id'] == player_id
    assert ranking[0]['rank'] == 1

    total_profit = 0.0
    total_revenue = 0.0
    total_planned = 0.0
    total_variable_cost = 0.0
    total_fixed_cost = 0.0
    total_imbalance_cost = 0.0
    total_atc_dispatch_cost = 0.0
    total_curtailment_cost = 0.0
    total_congestion_revenue = 0.0
    total_co2_emissions = 0.0
    total_imbalance = 0.0
    total_curtailment = 0.0
    total_dispatched = 0.0

    for idx, report in enumerate(round_reports, start=1):
        my_result = report['my_result']
        kpis = my_result['kpis']
        history_row = round_history[idx - 1]
        atc_dispatch_cost = _float(kpis.get('atc_dispatch_cost_zar', kpis.get('grid_constraint_cost_zar')))
        imbalance_mwh = _float(kpis.get('imbalance_mwh'))
        curtailment_mwh = _float(kpis.get('curtailment_mwh'))

        total_profit += _float(kpis.get('profit_zar'))
        total_revenue += _float(kpis.get('revenue_zar'))
        total_planned += _float(kpis.get('planned_mwh'))
        total_variable_cost += _float(kpis.get('variable_cost_zar'))
        total_fixed_cost += _float(kpis.get('fixed_cost_zar'))
        total_imbalance_cost += _float(kpis.get('imbalance_cost_zar'))
        total_atc_dispatch_cost += atc_dispatch_cost
        total_curtailment_cost += _float(kpis.get('curtailment_cost_zar'))
        total_congestion_revenue += _float(kpis.get('congestion_revenue_zar'))
        total_co2_emissions += _float(kpis.get('co2_emissions_kg'))
        total_imbalance += imbalance_mwh
        total_curtailment += curtailment_mwh
        total_dispatched += _float(kpis.get('dispatched_mwh'))

        assert history_row['round_num'] == idx
        _assert_close(history_row['profit'], kpis.get('profit_zar'), ROUND_TOLERANCE, 'round history profit must equal per-round KPI profit')
        _assert_close(history_row['revenue_zar'], kpis.get('revenue_zar'), ROUND_TOLERANCE, 'round history revenue must equal per-round KPI revenue')
        _assert_close(history_row['co2_emissions_kg'], kpis.get('co2_emissions_kg'), VALUE_TOLERANCE, 'round history CO2 must equal per-round KPI CO2')
        _assert_close(history_row['imbalance_mwh'], imbalance_mwh, VALUE_TOLERANCE, 'round history imbalance MWh must equal per-round KPI imbalance MWh')
        _assert_close(history_row['imbalance_cost'], kpis.get('imbalance_cost_zar'), ROUND_TOLERANCE, 'round history imbalance cost must equal per-round KPI imbalance cost')
        _assert_close(history_row['atc_dispatch_cost'], atc_dispatch_cost, ROUND_TOLERANCE, 'round history ATC dispatch cost must equal per-round KPI ATC/grid cost')
        _assert_close(history_row['curtailment_mwh'], curtailment_mwh, VALUE_TOLERANCE, 'round history curtailment MWh must equal per-round KPI curtailment MWh')
        _assert_close(history_row['curtailment_cost'], kpis.get('curtailment_cost_zar'), ROUND_TOLERANCE, 'round history curtailment cost must equal per-round KPI curtailment cost')
        _assert_close(history_row['dispatched_mwh'], kpis.get('dispatched_mwh'), VALUE_TOLERANCE, 'round history dispatched MWh must equal per-round KPI dispatched MWh')
        _assert_close(history_row['planned_mwh'], kpis.get('planned_mwh'), VALUE_TOLERANCE, 'round history planned MWh must equal per-round KPI planned MWh')

        expected_costs = round(
            abs(_float(kpis.get('variable_cost_zar')))
            + abs(_float(kpis.get('fixed_cost_zar')))
            + abs(_float(kpis.get('imbalance_cost_zar')))
            + abs(atc_dispatch_cost),
            2,
        )
        _assert_close(history_row['total_costs_zar'], expected_costs, VALUE_TOLERANCE, 'round history total costs must equal variable + fixed + imbalance + ATC/grid costs')

        raw_round_score = (
            _float(kpis.get('profit_zar')) * _float(weights.get('profit', 0.6))
            - abs(imbalance_mwh) * _float(weights.get('imbalance', 0.3)) * 1000
            - abs(curtailment_mwh) * _float(weights.get('curtailment', 0.1)) * 1000
        )
        expected_round_score = max(0, min(100, (raw_round_score + 5000000) / 100000))
        _assert_close(history_row['total_score'], round(expected_round_score, 2), VALUE_TOLERANCE, 'round history score must match the configured scoring formula')

    _assert_close(my_cumulative['total_profit'], round(total_profit, 2), ROUND_TOLERANCE, 'final cumulative profit must equal the sum of round profits')
    _assert_close(my_cumulative['total_revenue'], round(total_revenue, 2), ROUND_TOLERANCE, 'final cumulative revenue must equal the sum of round revenues')
    _assert_close(my_cumulative['total_planned_mwh'], round(total_planned, 2), VALUE_TOLERANCE, 'final cumulative planned MWh must equal the sum of round planned MWh')
    _assert_close(my_cumulative['total_variable_cost'], round(total_variable_cost, 2), ROUND_TOLERANCE, 'final cumulative variable cost must equal the sum of round variable costs')
    _assert_close(my_cumulative['total_fixed_cost'], round(total_fixed_cost, 2), ROUND_TOLERANCE, 'final cumulative fixed cost must equal the sum of round fixed costs')
    _assert_close(my_cumulative['total_imbalance_cost'], round(total_imbalance_cost, 2), ROUND_TOLERANCE, 'final cumulative imbalance cost must equal the sum of round imbalance costs')
    _assert_close(my_cumulative['total_atc_dispatch_cost'], round(total_atc_dispatch_cost, 2), ROUND_TOLERANCE, 'final cumulative ATC dispatch cost must equal the sum of round ATC/grid costs')
    _assert_close(my_cumulative['total_curtailment_cost'], round(total_curtailment_cost, 2), ROUND_TOLERANCE, 'final cumulative curtailment cost must equal the sum of round curtailment costs')
    _assert_close(my_cumulative['total_congestion_revenue'], round(total_congestion_revenue, 2), ROUND_TOLERANCE, 'final cumulative congestion revenue must equal the sum of round congestion revenues')
    _assert_close(my_cumulative['total_co2_emissions'], round(total_co2_emissions, 2), VALUE_TOLERANCE, 'final cumulative CO2 must equal the sum of round CO2 emissions')
    _assert_close(my_cumulative['total_imbalance'], round(total_imbalance, 2), VALUE_TOLERANCE, 'final cumulative imbalance must equal the sum of round imbalance MWh')
    _assert_close(my_cumulative['total_curtailment'], round(total_curtailment, 2), VALUE_TOLERANCE, 'final cumulative curtailment must equal the sum of round curtailment MWh')
    _assert_close(my_cumulative['total_dispatched_mwh'], round(total_dispatched, 2), VALUE_TOLERANCE, 'final cumulative dispatched MWh must equal the sum of round dispatched MWh')

    raw_total_score = (
        total_profit * _float(weights.get('profit', 0.6))
        - abs(total_imbalance) * _float(weights.get('imbalance', 0.3)) * 1000
        - abs(total_curtailment) * _float(weights.get('curtailment', 0.1)) * 1000
    )
    avg_score = raw_total_score / max(1, len(round_reports))
    expected_total_score = max(0, min(100, (avg_score + 5000000) / 100000))
    _assert_close(my_cumulative['total_score'], round(expected_total_score, 2), VALUE_TOLERANCE, 'final cumulative score must equal the average normalized per-scenario scoring formula')

    expected_bid_aggregate = _aggregate_bid_dispatch(round_reports)
    actual_bid_aggregate = final_data.get('bid_dispatch_aggregate') or {}
    assert set(actual_bid_aggregate.keys()) == set(expected_bid_aggregate.keys())
    for device_id, lots in expected_bid_aggregate.items():
        assert set((actual_bid_aggregate.get(device_id) or {}).keys()) == set(lots.keys())
        for lot_label, expected_values in lots.items():
            actual_values = actual_bid_aggregate[device_id][lot_label]
            _assert_close(actual_values.get('mw_offered'), round(expected_values['mw_offered'], 3), VALUE_TOLERANCE, 'final bid aggregate offered volume must equal the sum over round reports')
            _assert_close(actual_values.get('mw_dispatched'), round(expected_values['mw_dispatched'], 3), VALUE_TOLERANCE, 'final bid aggregate dispatched volume must equal the sum over round reports')
            _assert_close(actual_values.get('total_revenue'), round(expected_values['total_revenue'], 3), ROUND_TOLERANCE, 'final bid aggregate revenue must equal the sum over round reports')
            assert int(actual_values.get('rounds_offered', 0)) == int(expected_values['rounds_offered'])


class _FakeRedis:
    def __init__(self):
        self._store = {}

    def set(self, key, value, ex=None):
        self._store[key] = value
        return True

    def setex(self, key, ttl, value):
        self._store[key] = value
        return True

    def get(self, key):
        value = self._store.get(key)
        if value is None:
            return None
        return value if isinstance(value, bytes) else str(value).encode()

    def delete(self, key):
        self._store.pop(key, None)
        return 1


@pytest.fixture
def e2e_scheduler(monkeypatch, app):
    from app import player as player_module
    from app import scheduler as scheduler_module
    from app import sessions as sessions_module

    tasks = []
    fake_redis = _FakeRedis()

    def queue_background_task(target, *args, **kwargs):
        tasks.append(SimpleNamespace(target=target, args=args, kwargs=kwargs))
        return len(tasks)

    def run_next():
        assert tasks, 'expected a queued background task'
        task = tasks.pop(0)
        return task.target(*task.args, **task.kwargs)

    monkeypatch.setattr(player_module.socketio, 'start_background_task', queue_background_task)
    monkeypatch.setattr(sessions_module.socketio, 'start_background_task', queue_background_task)
    monkeypatch.setattr(scheduler_module.socketio, 'start_background_task', queue_background_task)
    monkeypatch.setattr(scheduler_module.time, 'sleep', lambda *_args, **_kwargs: None)
    monkeypatch.setattr(scheduler_module, '_redis_client', fake_redis)
    monkeypatch.setattr(sessions_module, '_redis_client', fake_redis)

    return SimpleNamespace(run_next=run_next, tasks=tasks, redis=fake_redis)


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


def _load_seed_campaign_scenarios() -> list[tuple[str, dict]]:
    script_path = Path(__file__).resolve().parents[1] / 'scripts' / 'seed_campaign.py'
    module_ast = ast.parse(script_path.read_text())
    scenarios = {}
    for node in module_ast.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {'SCENARIO_1', 'SCENARIO_2', 'SCENARIO_3'}:
                scenarios[target.id] = ast.literal_eval(node.value)

    ordered = [
        ('Einstieg – Ein Markt, Zwei Spieler', scenarios['SCENARIO_1']),
        ('Fortgeschritten – DAM + IDM, Solar & Schock', scenarios['SCENARIO_2']),
        ('Experte – Zwei Zonen, Batterie, Störungen', scenarios['SCENARIO_3']),
    ]
    return [(name, json.loads(json.dumps(config))) for name, config in ordered]


def _all_scenario_configs() -> list[tuple[str, dict]]:
    configs = [('Monday', _load_monday_config())]
    configs.extend(_load_seed_campaign_scenarios())
    return configs


def _create_api_scenario_setup(app, scenario_name: str, config: dict) -> dict:
    with app.app_context():
        unique_tag = uuid.uuid4().hex[:8]
        player = User(email=f'e2e-player-{unique_tag}@test.com', role='player', password_hash='test-hash')
        designer = User(email=f'e2e-designer-{unique_tag}@test.com', role='designer', password_hash='test-hash')
        db.session.add_all([player, designer])
        db.session.flush()

        campaign = Campaign(
            name=f'{scenario_name} Campaign {unique_tag}',
            description=f'API E2E playthrough for {scenario_name}',
            designer_id=designer.id,
            published=True,
        )
        db.session.add(campaign)
        db.session.flush()

        scenario = Scenario(
            name=f'{scenario_name} {unique_tag}',
            campaign_id=campaign.id,
            config=json.loads(json.dumps(config)),
        )
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
            'scenario_name': scenario_name,
        }


def _run_public_api_playthrough(client, e2e_scheduler, scenario_setup: dict, type_id: str) -> tuple[list[dict], dict, str]:
    headers = scenario_setup['headers']
    scenario_id = scenario_setup['scenario_id']
    campaign_id = scenario_setup['campaign_id']
    config = scenario_setup['config']
    general = config.get('general', {}) or {}
    total_rounds = int(general.get('rounds', 4) or 4)
    round_span = int(general.get('round_span_hours', general.get('hours_per_round', 6)) or 6)

    create_response = client.post(
        '/api/player/solo-sessions',
        headers=headers,
        json={'scenario_id': scenario_id, 'campaign_id': campaign_id},
    )
    assert create_response.status_code == 201
    session_id = create_response.get_json()['session_id']

    e2e_scheduler.run_next()

    briefing_response = client.get(f'/api/sessions/{session_id}/briefing', headers=headers)
    assert briefing_response.status_code == 200
    briefing = briefing_response.get_json()
    player_type = next(player_type for player_type in briefing['player_types'] if player_type['id'] == type_id)
    devices_by_id = {device['id']: device for device in (config.get('devices') or []) if device.get('id')}
    player_devices = [devices_by_id[device_id] for device_id in (player_type.get('devices') or []) if device_id in devices_by_id]
    expected_role = detect_player_role(player_devices)

    select_response = client.post(
        f'/api/sessions/{session_id}/select-type',
        headers=headers,
        json={'type_id': type_id},
    )
    assert select_response.status_code == 200

    forecast_payload = _build_forecast_payload(config, player_type)
    submit_full_response = client.post(
        '/api/player/forecast/full',
        headers=headers,
        json={'session_id': session_id, **forecast_payload},
    )
    assert submit_full_response.status_code == 200

    round_reports = []
    for round_num in range(1, total_rounds + 1):
        round_payload = _slice_forecast_payload(forecast_payload, round_num, round_span)
        submit_round_response = client.post(
            '/api/player/forecast',
            headers=headers,
            json={'session_id': session_id, 'round_num': round_num, **round_payload},
        )
        assert submit_round_response.status_code == 201

        if round_num == 1:
            start_response = client.post(f'/api/sessions/{session_id}/start-briefing', headers=headers)
            assert start_response.status_code == 200
        else:
            advance_response = client.post(f'/api/sessions/{session_id}/advance-round', headers=headers)
            assert advance_response.status_code == 200

        e2e_scheduler.run_next()

        round_response = client.get(f'/api/sessions/{session_id}/round-results/{round_num}', headers=headers)
        assert round_response.status_code == 200
        round_data = round_response.get_json()
        assert round_data['round'] == round_num
        assert round_data['my_result']['type'] == type_id
        assert round_data['my_result']['player_role'] == expected_role
        try:
            _validate_kpis(round_data['my_result']['kpis'], round_data['my_result'], round_data['weights'])
            _validate_da_id_breakdown(round_data['my_result']['da_id_breakdown'])
        except AssertionError as exc:
            raise AssertionError(
                f"scenario={scenario_setup['scenario_name']} type={type_id} round={round_num}: {exc}"
            ) from exc
        round_reports.append(round_data)

    final_response = client.get(f'/api/sessions/{session_id}/final-results', headers=headers)
    assert final_response.status_code == 200
    final_data = final_response.get_json()
    _validate_final_results_consistency(final_data, round_reports, final_data['weights'], scenario_setup['player_id'], type_id)
    return round_reports, final_data, expected_role


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
    _persist_round_result_internal(session_id, round_num, player_id, complete_session=True)


def _persist_round_result_internal(session_id: int, round_num: int, player_id: int, complete_session: bool) -> None:
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
        full_hours = (full_forecast.data or {}).get('hours', [])
        full_devices = (full_forecast.data or {}).get('devices', [])
        signed_hours = _signed_hours(full_hours, player_role)

        current_forecast = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=round_num).first()
        if current_forecast is None:
            current_forecast = Forecast(
                session_id=session_id,
                player_id=player_id,
                round_num=round_num,
                data={'hours': signed_hours, 'devices': full_devices},
                bids=full_forecast.bids or {},
            )
            db.session.add(current_forecast)

        da_baseline = Forecast.query.filter_by(session_id=session_id, player_id=player_id, is_da_baseline=True).first()
        if da_baseline is None:
            da_baseline = Forecast(
                session_id=session_id,
                player_id=player_id,
                round_num=-1,
                is_da_baseline=True,
                data={
                    'hours': signed_hours,
                    'da_baseline_hours': {'start': 0, 'end': len(signed_hours)},
                },
                bids=full_forecast.bids or {},
            )
            db.session.add(da_baseline)

        normalized_forecasts[player_id] = {
            'hours': full_hours,
            'bids': full_forecast.bids or {},
            'devices': full_devices,
            'player_id': player_id,
        }

    db.session.flush()

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

    if complete_session:
        session.status = SessionStatus.scenario_complete
        session.current_round = round_num + 1
        db.session.add(session)
    db.session.commit()


def _slice_forecast_payload(full_payload: dict, round_num: int, round_span: int) -> dict:
    start = (round_num - 1) * round_span
    end = start + round_span
    full_hours = list(full_payload.get('hours') or [])
    sliced_hours = full_hours[start:end]

    full_bids = json.loads(json.dumps(full_payload.get('bids') or {}))
    sliced_bids = {}
    for device_id, device_bids in full_bids.items():
        sliced_bids[device_id] = {}
        for lot_label, bid in (device_bids or {}).items():
            bid_hours = list((bid or {}).get('hours') or [])
            masked_bid_hours = [0.0] * len(bid_hours)
            for idx in range(start, min(end, len(bid_hours))):
                masked_bid_hours[idx] = bid_hours[idx]
            sliced_bids[device_id][lot_label] = {
                **(bid or {}),
                'hours': masked_bid_hours,
            }

    payload = {
        'hours': sliced_hours,
        'devices': [],
        'bids': sliced_bids,
    }
    for row in (full_payload.get('devices') or []):
        row_hours = list(row.get('hours') or [])
        sliced = {
            'device_id': row['device_id'],
            'hours': row_hours[start:end],
        }
        if 'charge_hours' in row:
            charge_hours = list(row.get('charge_hours') or [])
            sliced['charge_hours'] = charge_hours[start:end]
        payload['devices'].append(sliced)
    return payload


def _prepare_current_round_forecast(session_id: int, player_id: int, round_num: int, forecast_payload: dict, player_role: str) -> None:
    current = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=round_num).order_by(Forecast.id.desc()).first()
    assert current is not None
    current.data = dict(current.data or {})
    current.data['hours'] = _signed_hours(forecast_payload.get('hours', []), player_role)
    db.session.add(current)
    db.session.commit()


def _restore_round_forecast_slice(session_id: int, player_id: int, round_num: int, round_payload: dict) -> None:
    current = Forecast.query.filter_by(session_id=session_id, player_id=player_id, round_num=round_num).order_by(Forecast.id.desc()).first()
    assert current is not None
    current.data = dict(current.data or {})
    current.data['hours'] = list(round_payload.get('hours') or [])
    db.session.add(current)
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
        unique_tag = uuid.uuid4().hex[:8]
        player = User(email=f'monday-player-{unique_tag}@test.com', role='player', password_hash='test-hash')
        designer = User(email=f'monday-designer-{unique_tag}@test.com', role='designer', password_hash='test-hash')
        db.session.add_all([player, designer])
        db.session.flush()

        campaign = Campaign(name=f'Monday Campaign {unique_tag}', description='Monday API flow test', designer_id=designer.id, published=True)
        db.session.add(campaign)
        db.session.flush()

        scenario = Scenario(name=f'Monday {unique_tag}', campaign_id=campaign.id, config=_load_monday_config())
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
    assert briefing['name'].startswith('Monday')
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
    weights = round_data['weights']
    assert round_data['round'] == 1
    assert round_data['my_result']['type'] == type_id
    assert round_data['my_result']['player_role'] == expected_role
    assert isinstance(round_data['my_result']['kpis']['hourly_breakdown'], list)
    assert isinstance(round_data['my_result']['kpis']['device_hourly_breakdown'], dict)
    assert round_data['my_result']['kpis']['planned_mwh'] >= 0
    assert round_data['my_result']['kpis']['dispatched_mwh'] >= 0

    _validate_kpis(round_data['my_result']['kpis'], round_data['my_result'], weights)
    _validate_da_id_breakdown(round_data['my_result']['da_id_breakdown'])

    if expected_role == 'consumer':
        assert round_data['my_result']['kpis']['revenue_zar'] <= 0
        assert round_data['my_result']['da_id_breakdown']['is_consumer'] is True
    else:
        assert round_data['my_result']['kpis']['revenue_zar'] >= 0
        assert round_data['my_result']['da_id_breakdown']['is_consumer'] is False

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


@pytest.mark.parametrize(
    ('type_id', 'expected_role'),
    [
        ('ptype_mj97y61j_sxl6', 'producer'),
        ('ptype_mj9yhsec_5orq', 'consumer'),
        ('ptype_mn4igq2n_zx58', 'producer'),
    ],
)
def test_monday_player_flow_all_rounds_remain_consistent(client, monday_setup, type_id, expected_role):
    headers = monday_setup['headers']
    scenario_id = monday_setup['scenario_id']
    campaign_id = monday_setup['campaign_id']
    config = monday_setup['config']
    player_id = monday_setup['player_id']
    general = config.get('general', {}) or {}
    total_rounds = int(general.get('rounds', 6) or 6)
    round_span = int(general.get('round_span_hours', general.get('hours_per_round', 6)) or 6)

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

    select_response = client.post(
        f'/api/sessions/{session_id}/select-type',
        headers=headers,
        json={'type_id': type_id},
    )
    assert select_response.status_code == 200

    start_response = client.post(f'/api/sessions/{session_id}/start-briefing', headers=headers)
    assert start_response.status_code == 200

    player_type = next(player_type for player_type in briefing['player_types'] if player_type['id'] == type_id)
    forecast_payload = _build_forecast_payload(config, player_type)
    submit_full_response = client.post(
        '/api/player/forecast/full',
        headers=headers,
        json={'session_id': session_id, **forecast_payload},
    )
    assert submit_full_response.status_code == 200

    for round_num in range(1, total_rounds + 1):
        round_payload = _slice_forecast_payload(forecast_payload, round_num, round_span)
        submit_round_response = client.post(
            '/api/player/forecast',
            headers=headers,
            json={'session_id': session_id, 'round_num': round_num, **round_payload},
        )
        assert submit_round_response.status_code == 201

        with client.application.app_context():
            _prepare_current_round_forecast(session_id, player_id, round_num, forecast_payload, expected_role)
            _persist_round_result_internal(session_id, round_num, player_id, complete_session=False)

        round_response = client.get(f'/api/sessions/{session_id}/round-results/{round_num}', headers=headers)
        assert round_response.status_code == 200
        round_data = round_response.get_json()
        assert round_data['my_result']['type'] == type_id
        assert round_data['my_result']['player_role'] == expected_role

        _validate_kpis(round_data['my_result']['kpis'], round_data['my_result'], round_data['weights'])
        _validate_da_id_breakdown(round_data['my_result']['da_id_breakdown'])

        with client.application.app_context():
            _restore_round_forecast_slice(session_id, player_id, round_num, round_payload)

        advance_response = client.post(f'/api/sessions/{session_id}/advance-round', headers=headers)
        assert advance_response.status_code == 200

    final_response = client.get(f'/api/sessions/{session_id}/final-results', headers=headers)
    assert final_response.status_code == 200
    final_data = final_response.get_json()
    assert final_data['total_rounds'] == total_rounds
    assert final_data['my_cumulative']['type'] == type_id
    assert final_data['my_cumulative']['rounds_played'] == total_rounds
    assert len(final_data['round_history']) == total_rounds
    assert len(final_data['final_ranking']) == 1


def test_monday_player_flow_true_e2e_round_reports_and_final_report(client, monday_setup, e2e_scheduler):
    headers = monday_setup['headers']
    scenario_id = monday_setup['scenario_id']
    campaign_id = monday_setup['campaign_id']
    config = monday_setup['config']
    player_id = monday_setup['player_id']
    type_id = 'ptype_mn4igq2n_zx58'
    expected_role = 'producer'
    general = config.get('general', {}) or {}
    total_rounds = int(general.get('rounds', 4) or 4)
    round_span = int(general.get('round_span_hours', general.get('hours_per_round', 6)) or 6)

    create_response = client.post(
        '/api/player/solo-sessions',
        headers=headers,
        json={'scenario_id': scenario_id, 'campaign_id': campaign_id},
    )
    assert create_response.status_code == 201
    session_id = create_response.get_json()['session_id']

    e2e_scheduler.run_next()

    briefing_response = client.get(f'/api/sessions/{session_id}/briefing', headers=headers)
    assert briefing_response.status_code == 200
    briefing = briefing_response.get_json()
    player_type = next(player_type for player_type in briefing['player_types'] if player_type['id'] == type_id)

    select_response = client.post(
        f'/api/sessions/{session_id}/select-type',
        headers=headers,
        json={'type_id': type_id},
    )
    assert select_response.status_code == 200

    forecast_payload = _build_forecast_payload(config, player_type)
    submit_full_response = client.post(
        '/api/player/forecast/full',
        headers=headers,
        json={'session_id': session_id, **forecast_payload},
    )
    assert submit_full_response.status_code == 200

    round_reports = []
    for round_num in range(1, total_rounds + 1):
        round_payload = _slice_forecast_payload(forecast_payload, round_num, round_span)
        submit_round_response = client.post(
            '/api/player/forecast',
            headers=headers,
            json={'session_id': session_id, 'round_num': round_num, **round_payload},
        )
        assert submit_round_response.status_code == 201

        if round_num == 1:
            start_response = client.post(f'/api/sessions/{session_id}/start-briefing', headers=headers)
            assert start_response.status_code == 200
        else:
            advance_response = client.post(f'/api/sessions/{session_id}/advance-round', headers=headers)
            assert advance_response.status_code == 200

        e2e_scheduler.run_next()

        round_response = client.get(f'/api/sessions/{session_id}/round-results/{round_num}', headers=headers)
        assert round_response.status_code == 200
        round_data = round_response.get_json()
        assert round_data['round'] == round_num
        assert round_data['my_result']['type'] == type_id
        assert round_data['my_result']['player_role'] == expected_role

        _validate_kpis(round_data['my_result']['kpis'], round_data['my_result'], round_data['weights'])
        _validate_da_id_breakdown(round_data['my_result']['da_id_breakdown'])
        round_reports.append(round_data)

    final_response = client.get(f'/api/sessions/{session_id}/final-results', headers=headers)
    assert final_response.status_code == 200
    final_data = final_response.get_json()
    _validate_final_results_consistency(final_data, round_reports, final_data['weights'], player_id, type_id)


def test_all_scenarios_all_player_types_true_e2e(client, e2e_scheduler):
    scenario_runs = 0
    player_type_runs = 0

    for scenario_name, config in _all_scenario_configs():
        scenario_setup = _create_api_scenario_setup(client.application, scenario_name, config)
        player_types = list((scenario_setup['config'].get('player_types') or []))
        assert player_types, f'{scenario_name} must define at least one player type'
        scenario_runs += 1

        for player_type in player_types:
            assert not e2e_scheduler.tasks, 'background task queue must be empty before the next playthrough'
            print(f"[ALL_E2E] scenario={scenario_name} type={player_type['id']}")
            _, final_data, expected_role = _run_public_api_playthrough(client, e2e_scheduler, scenario_setup, player_type['id'])
            assert final_data['my_cumulative']['type'] == player_type['id']
            assert final_data['my_cumulative']['rounds_played'] == int((scenario_setup['config'].get('general') or {}).get('rounds', 4) or 4)
            assert final_data['my_cumulative']['total_score'] >= 0
            assert final_data['final_ranking'][0]['type'] == player_type['id']
            if expected_role == 'consumer':
                assert final_data['my_cumulative']['total_revenue'] <= 0
            player_type_runs += 1

    assert scenario_runs == 4
    assert player_type_runs >= 11