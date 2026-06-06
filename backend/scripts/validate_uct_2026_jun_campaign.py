"""Validate the seeded UCT June 2026 campaign end-to-end.

This script reuses the existing API/engine validation helpers from the Monday
player-flow tests, but runs them against the seeded campaign that lives in the
application database.

Checks performed for every scenario and every player type:
- play all rounds in isolated_per_player mode
- validate round-results API payload arithmetic and DA/ID breakdowns
- validate final-results API aggregation
- validate detail payloads such as balancing/co2 breakdowns and zonal outputs
- validate scenario-specific market expectations (events, IDM, zonal data)

Run inside the backend container:
  python /app/scripts/validate_uct_2026_jun_campaign.py
"""

from __future__ import annotations

import io
import json
import sys
import uuid
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/app")
sys.path.insert(0, "/app/tests")

from flask_jwt_extended import create_access_token

from app import create_app
from app.engine import detect_player_role, select_events_for_round
from app.extensions import db
from app.models import Campaign, CampaignScenario, Cohort, CohortMember, Forecast, Result, Role, Scenario, Session, SessionPlayerType, SessionStatus, User
from tests.test_monday_player_flow_api import (
    VALUE_TOLERANCE,
    _assert_finite_numbers,
    _assert_close,
    _build_forecast_payload,
    _float,
    _persist_round_result_internal,
    _prepare_current_round_forecast,
    _restore_round_forecast_slice,
    _slice_forecast_payload,
    _validate_da_id_breakdown,
    _validate_final_results_consistency,
    _validate_kpis,
)


CAMPAIGN_NAME = "Power Markets and Trading in Africa (UCT 2026-Jun)"
REPORT_DIR = Path("/app/debug")


def _normalize_round_result_kpis(my_result: dict) -> dict:
    kpis = dict((my_result or {}).get("kpis") or {})
    kpis["bid_dispatch"] = (my_result or {}).get("bid_dispatch") or {}
    return kpis


def _combine_detail_maps(*maps: dict) -> dict:
    combined: dict[str, dict[str, list[dict]]] = {}
    for detail_map in maps:
        if not isinstance(detail_map, dict):
            continue
        for section_name, device_map in detail_map.items():
            if not isinstance(device_map, dict):
                continue
            section_bucket = combined.setdefault(section_name, {})
            for device_id, rows in device_map.items():
                device_bucket = section_bucket.setdefault(device_id, [])
                if isinstance(rows, list):
                    device_bucket.extend(rows)
    return combined


def _validate_battery_kpis(kpis: dict, my_result: dict, weights: dict, config: dict) -> None:
    devices_by_id = {
        str(device.get("id")): device
        for device in (config.get("devices") or [])
        if isinstance(device, dict) and device.get("id")
    }
    device_breakdown = kpis.get("device_hourly_breakdown") or {}
    battery_rows = []
    for device_id, rows in device_breakdown.items():
        device = devices_by_id.get(str(device_id)) or {}
        if str(device.get("type", "")).lower() != "battery":
            continue
        if isinstance(rows, list):
            battery_rows.extend(rows)

    charged_mwh = sum(_float(row.get("battery_charged_mwh")) for row in battery_rows)
    discharged_mwh = sum(_float(row.get("battery_discharged_mwh")) for row in battery_rows)
    charge_cost = sum(_float(row.get("battery_charge_cost_zar")) for row in battery_rows)
    discharge_revenue = sum(_float(row.get("battery_discharge_revenue_zar")) for row in battery_rows)

    _assert_close(kpis.get("battery_charged_mwh"), round(charged_mwh, 3), VALUE_TOLERANCE, "battery_charged_mwh must equal the sum of battery charge rows")
    _assert_close(kpis.get("battery_discharged_mwh"), round(discharged_mwh, 3), VALUE_TOLERANCE, "battery_discharged_mwh must equal the sum of battery discharge rows")
    _assert_close(kpis.get("battery_charge_cost_zar"), round(charge_cost, 2), VALUE_TOLERANCE, "battery_charge_cost_zar must equal the sum of battery charge costs")
    _assert_close(
        kpis.get("battery_arbitrage_revenue_zar"),
        round(discharge_revenue - charge_cost, 0),
        1.0,
        "battery_arbitrage_revenue_zar must equal discharge revenue minus charge cost",
    )

    if battery_rows:
        first_soc = next((_float(row.get("battery_soc_start_pct")) for row in battery_rows if row.get("battery_soc_start_pct") is not None), None)
        last_soc = next((_float(row.get("battery_soc_end_pct")) for row in reversed(battery_rows) if row.get("battery_soc_end_pct") is not None), None)
        if first_soc is not None:
            _assert_close(kpis.get("battery_soc_start_pct"), first_soc, VALUE_TOLERANCE, "battery_soc_start_pct must match the first battery row")
        if last_soc is not None:
            _assert_close(kpis.get("battery_soc_end_pct"), last_soc, VALUE_TOLERANCE, "battery_soc_end_pct must match the last battery row")

    raw_score = (
        _float(kpis.get("profit_zar")) * _float(weights.get("profit", 0.6))
        - abs(_float(kpis.get("imbalance_mwh"))) * _float(weights.get("imbalance", 0.3)) * 1000
        - abs(_float(kpis.get("curtailment_mwh"))) * _float(weights.get("curtailment", 0.1)) * 1000
    )
    expected_total_score = max(0, min(100, (raw_score + 5000000) / 100000))
    _assert_close(my_result.get("total_score"), round(expected_total_score, 2), VALUE_TOLERANCE, "total_score must match the configured scoring formula")


def _validate_round_kpis(kpis: dict, my_result: dict, weights: dict, config: dict) -> None:
    try:
        _validate_kpis(kpis, my_result, weights)
    except AssertionError as exc:
        if "battery_" not in str(exc):
            raise
        _validate_battery_kpis(kpis, my_result, weights, config)


def _validate_device_hourly_details(my_result: dict, scenario_name: str, type_id: str, round_num: int) -> None:
    kpis = (my_result or {}).get("kpis") or {}
    device_breakdown = kpis.get("device_hourly_breakdown") or {}
    details = _combine_detail_maps(
        (my_result or {}).get("device_hourly_details") or {},
        (my_result or {}).get("dam_device_hourly_details") or {},
        (my_result or {}).get("idm_device_hourly_details") or {},
    )
    balancing = details.get("balancing") or {}
    co2 = details.get("co2") or {}

    imbalance_cost = abs(_float(kpis.get("imbalance_cost_zar")))
    co2_total = abs(_float(kpis.get("co2_emissions_kg")))

    if imbalance_cost > 1e-9:
        assert balancing, (
            f"scenario={scenario_name} type={type_id} round={round_num}: "
            "balancing detail missing despite non-zero imbalance cost"
        )
    if co2_total > 1e-9:
        assert co2, (
            f"scenario={scenario_name} type={type_id} round={round_num}: "
            "co2 detail missing despite non-zero CO2"
        )

    balancing_cost_sum = 0.0
    co2_sum = 0.0

    for device_id, rows in device_breakdown.items():
        row_map = {
            int(row.get("hour", idx)): row
            for idx, row in enumerate(rows or [])
            if isinstance(row, dict)
        }

        balancing_rows = balancing.get(device_id) or []
        for detail in balancing_rows:
            hour_idx = int(detail.get("hour_idx", detail.get("hour", 0)) or 0)
            breakdown_row = row_map.get(hour_idx)
            if breakdown_row is None:
                zero_only = all(
                    abs(_float(detail.get(field))) <= 1e-9
                    for field in [
                        "da_dispatched_mwh",
                        "id_dispatched_mwh",
                        "total_dispatched_mwh",
                        "actual_mw",
                        "actual_mwh",
                        "imbalance_mwh",
                        "balancing_cost_zar",
                    ]
                )
                if zero_only:
                    continue
            assert breakdown_row is not None, (
                f"scenario={scenario_name} type={type_id} round={round_num}: "
                f"balancing detail for device {device_id} hour {hour_idx} has no KPI breakdown row"
            )
            _assert_close(
                detail.get("total_dispatched_mwh"),
                breakdown_row.get("total_dispatched_mwh", breakdown_row.get("dispatched_mw")),
                VALUE_TOLERANCE,
                "balancing dispatched volume must match device KPI breakdown",
            )
            _assert_close(
                detail.get("actual_mw", detail.get("actual_mwh")),
                breakdown_row.get("actual_mw"),
                VALUE_TOLERANCE,
                "balancing actual volume must match device KPI breakdown",
            )
            _assert_close(
                detail.get("imbalance_mwh"),
                breakdown_row.get("imbalance_mwh"),
                VALUE_TOLERANCE,
                "balancing imbalance volume must match device KPI breakdown",
            )
            balancing_cost_sum += _float(detail.get("balancing_cost_zar"))

        co2_rows = co2.get(device_id) or []
        for detail in co2_rows:
            hour_idx = int(detail.get("hour_idx", detail.get("hour", 0)) or 0)
            breakdown_row = row_map.get(hour_idx)
            if breakdown_row is None and abs(_float(detail.get("co2_kg", detail.get("emissions_kg")))) <= 1e-9:
                continue
            assert breakdown_row is not None, (
                f"scenario={scenario_name} type={type_id} round={round_num}: "
                f"co2 detail for device {device_id} hour {hour_idx} has no KPI breakdown row"
            )
            co2_value = _float(detail.get("co2_kg", detail.get("emissions_kg")))
            _assert_close(
                co2_value,
                breakdown_row.get("co2_kg"),
                VALUE_TOLERANCE,
                "co2 detail must match device KPI breakdown",
            )
            co2_sum += co2_value

    if balancing:
        _assert_close(
            round(balancing_cost_sum, 2),
            round(_float(kpis.get("imbalance_cost_zar")), 2),
            1.0,
            "sum of balancing detail costs must match KPI imbalance cost",
        )
    if co2:
        _assert_close(
            round(co2_sum, 2),
            round(_float(kpis.get("co2_emissions_kg")), 2),
            VALUE_TOLERANCE,
            "sum of co2 detail rows must match KPI CO2",
        )


def _validate_market_details(round_data: dict, config: dict, scenario_name: str, type_id: str, round_num: int) -> None:
    my_result = (round_data or {}).get("my_result") or {}
    grid = config.get("grid") or {}
    zone_count = int(grid.get("zones", 1) or 1)
    zone_results = my_result.get("zone_results") or []
    link_results = my_result.get("link_results") or []
    player_zone_info = my_result.get("player_zone_info") or {}

    if zone_count > 1:
        assert zone_results, f"scenario={scenario_name} type={type_id} round={round_num}: missing zone results"
        assert len(zone_results) == zone_count, (
            f"scenario={scenario_name} type={type_id} round={round_num}: expected {zone_count} zone results"
        )
        assert player_zone_info.get("zone_id") in range(1, zone_count + 1), (
            f"scenario={scenario_name} type={type_id} round={round_num}: invalid player zone info"
        )
        for link in link_results:
            atc = _float(link.get("atc_mwh"))
            flow = abs(_float(link.get("flow_mwh")))
            utilization = _float(link.get("utilization_pct"))
            if atc > 1e-9:
                expected_utilization = round(flow / atc * 100.0, 1)
                _assert_close(
                    utilization,
                    expected_utilization,
                    1.0,
                    "link utilization must match flow divided by ATC",
                )
            if bool(link.get("binding")):
                assert flow >= max(0.0, atc - 1.5), (
                    f"scenario={scenario_name} type={type_id} round={round_num}: binding link below ATC"
                )
    else:
        assert len(zone_results or []) <= 1, (
            f"scenario={scenario_name} type={type_id} round={round_num}: unexpected multi-zone summary in single-zone scenario"
        )
        assert link_results in ([], None), (
            f"scenario={scenario_name} type={type_id} round={round_num}: unexpected link results in single-zone scenario"
        )


def _validate_scenario_specifics(round_data: dict, config: dict, scenario_name: str, type_id: str, round_num: int) -> None:
    my_result = (round_data or {}).get("my_result") or {}
    role = my_result.get("player_role")
    kpis = (my_result.get("kpis") or {})
    markets = config.get("markets") or {}
    general = config.get("general") or {}
    idm_trading = ((markets.get("idm") or {}).get("trading") or [])
    idm_enabled = False
    if round_num - 1 < len(idm_trading):
        idm_enabled = str(idm_trading[round_num - 1]).lower() == "on"

    if role == "consumer":
        assert _float(kpis.get("revenue_zar")) <= 1e-6, (
            f"scenario={scenario_name} type={type_id} round={round_num}: consumer revenue must be non-positive"
        )
    else:
        assert _float(kpis.get("revenue_zar")) >= -1e-6, (
            f"scenario={scenario_name} type={type_id} round={round_num}: producer revenue must be non-negative"
        )

    if not idm_enabled:
        assert abs(_float(my_result.get("id_volume_mwh"))) <= 1e-6, (
            f"scenario={scenario_name} type={type_id} round={round_num}: IDM volume must be zero when IDM is off"
        )
        assert int(my_result.get("id_trade_count", 0) or 0) == 0, (
            f"scenario={scenario_name} type={type_id} round={round_num}: IDM trade count must be zero when IDM is off"
        )

    expected_event_names = [
        event.get("name")
        for event in select_events_for_round(config.get("events") or [], round_num)
    ]
    actual_event_names = [event.get("name") for event in (round_data.get("active_events") or [])]
    assert actual_event_names == expected_event_names, (
        f"scenario={scenario_name} type={type_id} round={round_num}: active event payload does not match scenario config"
    )

    if scenario_name == "Level 1 - Market mechanics":
        assert role == "producer"
        assert len(config.get("player_types") or []) == 3
    elif scenario_name == "Level 2a - Price formation bidding strategy":
        assert len(config.get("player_types") or []) == 3
    elif scenario_name == "Level 2b - Grid constraints and market power":
        assert len(config.get("player_types") or []) == 3
        assert int((config.get("grid") or {}).get("zones", 1) or 1) == 2
        assert bool(general.get("zonal_pricing_v1_enabled", False)) is True, (
            f"scenario={scenario_name} type={type_id} round={round_num}: zonal pricing v1 must be enabled"
        )
        assert my_result.get("player_zone_split_active") in (True, False), (
            f"scenario={scenario_name} type={type_id} round={round_num}: missing player zone split flag in round results"
        )
        assert bool(my_result.get("player_zone_split_active")) == bool(kpis.get("player_zone_split_active", False)), (
            f"scenario={scenario_name} type={type_id} round={round_num}: round-results split flag must match KPI payload"
        )
        for hour in (my_result.get("hourly_results") or []):
            assert hour.get("price_source") in {"uniform", "zonal_split", "islanded", "shortfall_separate"}, (
                f"scenario={scenario_name} type={type_id} round={round_num}: invalid price_source in hourly results"
            )
            assert hour.get("system_price_zar_per_mwh") is not None, (
                f"scenario={scenario_name} type={type_id} round={round_num}: missing system price in hourly results"
            )
            assert hour.get("zone_price_zar_per_mwh") is not None, (
                f"scenario={scenario_name} type={type_id} round={round_num}: missing zone price in hourly results"
            )
    elif scenario_name == "Level 3a - Forecating and information":
        assert int((config.get("general") or {}).get("rounds", 0) or 0) == 4
        assert (my_result.get("da_id_breakdown") or {}).get("has_baseline") is True
    elif scenario_name == "Level 3b - RES dominated system":
        assert int((config.get("general") or {}).get("rounds", 0) or 0) == 4
        if role == "producer":
            assert _float(kpis.get("battery_soc_end_pct")) >= 0.0


def _build_temp_entities(scenario: Scenario, player_type: dict) -> tuple[User, User, Cohort, Session]:
    tag = uuid.uuid4().hex[:10]
    trainer = User(email=f"uct-campaign-validation-trainer-{tag}@test.com", role=Role.trainer, password_hash="test-hash")
    player = User(email=f"uct-campaign-validation-player-{tag}@test.com", role=Role.player, password_hash="test-hash")
    db.session.add_all([trainer, player])
    db.session.flush()

    cohort = Cohort(name=f"UCT Campaign Validation {tag}", trainer_id=trainer.id)
    db.session.add(cohort)
    db.session.flush()

    db.session.add(CohortMember(cohort_id=cohort.id, user_id=player.id))

    session = Session(
        cohort_id=cohort.id,
        scenario_id=scenario.id,
        status=SessionStatus.briefing,
        current_round=1,
        mode="isolated_per_player",
    )
    db.session.add(session)
    db.session.flush()

    db.session.add(SessionPlayerType(session_id=session.id, user_id=player.id, type_id=player_type["id"]))
    db.session.commit()
    return trainer, player, cohort, session


def _cleanup_temp_entities(trainer: User, player: User, cohort: Cohort, session: Session) -> None:
    Result.query.filter_by(session_id=session.id).delete()
    Forecast.query.filter_by(session_id=session.id).delete()
    SessionPlayerType.query.filter_by(session_id=session.id).delete()
    Session.query.filter_by(id=session.id).delete()
    CohortMember.query.filter_by(cohort_id=cohort.id).delete()
    Cohort.query.filter_by(id=cohort.id).delete()
    User.query.filter(User.id.in_([trainer.id, player.id])).delete(synchronize_session=False)
    db.session.commit()


def _run_type_validation(app, client, scenario: Scenario, player_type: dict) -> dict:
    trainer, player, cohort, session = _build_temp_entities(scenario, player_type)
    config = scenario.config or {}
    general = config.get("general") or {}
    total_rounds = int(general.get("rounds", 1) or 1)
    round_span = int(general.get("round_span_hours", general.get("hours_per_round", 1)) or 1)
    devices_by_id = {device.get("id"): device for device in (config.get("devices") or []) if device.get("id")}
    player_devices = [devices_by_id[device_id] for device_id in (player_type.get("devices") or []) if device_id in devices_by_id]
    expected_role = detect_player_role(player_devices)

    report = {
        "scenario_id": scenario.id,
        "scenario_name": scenario.name,
        "type_id": player_type["id"],
        "type_name": player_type.get("name"),
        "expected_role": expected_role,
        "rounds": total_rounds,
        "status": "passed",
        "round_checks": [],
    }

    try:
        token = create_access_token(identity=str(player.id), additional_claims={"role": "player"})
        headers = {"Authorization": f"Bearer {token}"}

        forecast_payload = _build_forecast_payload(config, player_type)
        full_forecast = Forecast(
            session_id=session.id,
            player_id=player.id,
            round_num=0,
            data={"hours": forecast_payload["hours"], "devices": forecast_payload["devices"]},
            bids=forecast_payload["bids"],
        )
        db.session.add(full_forecast)
        db.session.commit()

        round_reports = []
        for round_num in range(1, total_rounds + 1):
            round_payload = _slice_forecast_payload(forecast_payload, round_num, round_span)
            current = Forecast(
                session_id=session.id,
                player_id=player.id,
                round_num=round_num,
                data={"hours": round_payload["hours"], "devices": round_payload["devices"]},
                bids=round_payload["bids"],
            )
            db.session.add(current)
            db.session.commit()

            _prepare_current_round_forecast(session.id, player.id, round_num, forecast_payload, expected_role)
            with redirect_stdout(io.StringIO()):
                _persist_round_result_internal(session.id, round_num, player.id, complete_session=False)

            response = client.get(f"/api/sessions/{session.id}/round-results/{round_num}", headers=headers)
            assert response.status_code == 200, (
                f"scenario={scenario.name} type={player_type['id']} round={round_num}: "
                f"round-results endpoint returned {response.status_code}"
            )
            round_data = response.get_json()
            round_reports.append(round_data)

            _assert_finite_numbers(round_data, f"scenario={scenario.name} type={player_type['id']} round={round_num}")
            assert round_data.get("round") == round_num
            assert (round_data.get("my_result") or {}).get("type") == player_type["id"]
            assert (round_data.get("my_result") or {}).get("player_role") == expected_role
            assert len(round_data.get("ranking") or []) == 1

            normalized_kpis = _normalize_round_result_kpis(round_data["my_result"])
            my_result_for_validation = dict(round_data["my_result"])
            my_result_for_validation["kpis"] = normalized_kpis
            _validate_round_kpis(normalized_kpis, my_result_for_validation, round_data.get("weights") or {}, config)
            _validate_da_id_breakdown((round_data.get("my_result") or {}).get("da_id_breakdown") or {})
            _validate_device_hourly_details(round_data.get("my_result") or {}, scenario.name, player_type["id"], round_num)
            _validate_market_details(round_data, config, scenario.name, player_type["id"], round_num)
            _validate_scenario_specifics(round_data, config, scenario.name, player_type["id"], round_num)

            report["round_checks"].append(
                {
                    "round": round_num,
                    "status": "passed",
                    "profit_zar": normalized_kpis.get("profit_zar"),
                    "revenue_zar": normalized_kpis.get("revenue_zar"),
                    "imbalance_cost_zar": normalized_kpis.get("imbalance_cost_zar"),
                    "active_events": [event.get("name") for event in (round_data.get("active_events") or [])],
                }
            )

            _restore_round_forecast_slice(session.id, player.id, round_num, round_payload)

        session.status = SessionStatus.scenario_complete
        session.current_round = total_rounds + 1
        db.session.add(session)
        db.session.commit()

        final_response = client.get(f"/api/sessions/{session.id}/final-results", headers=headers)
        assert final_response.status_code == 200, (
            f"scenario={scenario.name} type={player_type['id']}: final-results endpoint returned {final_response.status_code}"
        )
        final_data = final_response.get_json()
        _assert_finite_numbers(final_data, f"scenario={scenario.name} type={player_type['id']}.final")
        _validate_final_results_consistency(final_data, round_reports, final_data.get("weights") or {}, player.id, player_type["id"])
        report["final"] = {
            "status": "passed",
            "total_profit": (final_data.get("my_cumulative") or {}).get("total_profit"),
            "total_score": (final_data.get("my_cumulative") or {}).get("total_score"),
        }
        return report
    except Exception as exc:
        db.session.rollback()
        report["status"] = "failed"
        report["error"] = str(exc)
        return report
    finally:
        try:
            _cleanup_temp_entities(trainer, player, cohort, session)
        except Exception:
            db.session.rollback()


def main() -> int:
    app = create_app()
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.before_request_funcs[None] = [
        func
        for func in app.before_request_funcs.get(None, [])
        if getattr(func, "__module__", "") != "flask_limiter.extension"
    ]
    client = app.test_client()

    with app.app_context():
        campaign = Campaign.query.filter_by(name=CAMPAIGN_NAME).order_by(Campaign.id.desc()).first()
        if campaign is None:
            print(json.dumps({"status": "failed", "error": f"Campaign scenarios for {CAMPAIGN_NAME!r} not found"}, indent=2))
            return 1

        scenarios = (
            db.session.query(Scenario)
            .join(CampaignScenario, CampaignScenario.scenario_id == Scenario.id)
            .filter(CampaignScenario.campaign_id == campaign.id)
            .order_by(CampaignScenario.order_index.asc(), Scenario.id.asc())
            .all()
        )
        scenario_names = {scenario.name for scenario in scenarios}
        expected_names = {
            "Level 1 - Market mechanics",
            "Level 2a - Price formation bidding strategy",
            "Level 2b - Grid constraints and market power",
            "Level 3a - Forecating and information",
            "Level 3b - RES dominated system",
        }
        if scenario_names != expected_names:
            print(json.dumps({
                "status": "failed",
                "error": "UCT campaign scenario set mismatch",
                "found": sorted(scenario_names),
            }, indent=2))
            return 1

        results = []
        failures = []

        for scenario in scenarios:
            for player_type in (scenario.config or {}).get("player_types", []):
                report = _run_type_validation(app, client, scenario, player_type)
                results.append(report)
                if report.get("status") != "passed":
                    failures.append(report)

        payload = {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "campaign_name": CAMPAIGN_NAME,
            "scenario_count": len(scenarios),
            "player_type_runs": len(results),
            "failures": failures,
            "results": results,
        }

        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        report_path = REPORT_DIR / f"uct_campaign_full_validation_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
        report_path.write_text(json.dumps(payload, indent=2))

        summary = {
            "status": "passed" if not failures else "failed",
            "campaign_name": CAMPAIGN_NAME,
            "scenario_count": len(scenarios),
            "player_type_runs": len(results),
            "failure_count": len(failures),
            "report_path": str(report_path),
        }
        print(json.dumps(summary, indent=2))
        return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())