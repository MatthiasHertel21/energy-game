import pytest

from app import create_app, db
from app.config import Config
from app.engine import run_round
from app.models import Cohort, Role, Scenario, Session, SessionPlayerType, SessionStatus, User


def _run_shared_market_round(monkeypatch, include_device_forecast: bool):
    monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["RATELIMIT_ENABLED"] = False

    config = {
        "general": {
            "round_span_hours": 1,
            "horizon_hours": 1,
            "forecast_horizon_hours": 1,
            "rounds": 1,
            "start_time": "08:00",
            "fake_date": "2025-06-01",
            "day_one_baseline_mode": "edit_round_1",
        },
        "market": {
            "enable_player_bidding": False,
            "base_price": 500,
            "base_volume_mwh": 1200,
            "price_floor": -500,
            "price_cap": 5000,
        },
        "balancing": {
            "enabled": True,
            "mode": "absolute",
            "up_price_zar_per_mwh": 1,
            "down_price_zar_per_mwh": 1,
        },
        "markets": {
            "dam": {"trading": ["market_code"]},
            "idm": {"trading": ["off"]},
        },
        "grid": {"zones": 1, "atc": [[0]]},
        "devices": [
            {
                "id": "dev_gen_c",
                "type": "coal",
                "max_power_mw": 500,
                "variable_cost_zar_per_mwh": 600,
                "co2_emissions_kg_per_mwh": 900,
            },
            {
                "id": "dev_gen_b",
                "type": "coal",
                "max_power_mw": 500,
                "variable_cost_zar_per_mwh": 500,
                "co2_emissions_kg_per_mwh": 900,
            },
            {
                "id": "dev_gen_a",
                "type": "coal",
                "max_power_mw": 500,
                "variable_cost_zar_per_mwh": 400,
                "co2_emissions_kg_per_mwh": 900,
            },
        ],
        "player_types": [
            {"id": "ptype_gen_c", "name": "Producer C", "devices": ["dev_gen_c"]},
            {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
            {"id": "ptype_gen_a", "name": "Producer A", "devices": ["dev_gen_a"]},
        ],
        "events": [],
    }

    with app.app_context():
        db.drop_all()
        db.create_all()

        trainer = User(email="future-kpi-trainer@test.local", password_hash="x", role=Role.trainer)
        player_c = User(email="future-kpi-c@test.local", password_hash="x", role=Role.player)
        player_b = User(email="future-kpi-b@test.local", password_hash="x", role=Role.player)
        player_a = User(email="future-kpi-a@test.local", password_hash="x", role=Role.player)
        db.session.add_all([trainer, player_c, player_b, player_a])
        db.session.flush()

        scenario = Scenario(name="Future KPI Regression Scenario", config=config)
        cohort = Cohort(name="Future KPI Regression Cohort", trainer_id=trainer.id)
        db.session.add_all([scenario, cohort])
        db.session.flush()

        session = Session(
            cohort_id=cohort.id,
            scenario_id=scenario.id,
            status=SessionStatus.round_active,
            current_round=1,
            mode="shared_market",
        )
        db.session.add(session)
        db.session.flush()

        db.session.add_all([
            SessionPlayerType(session_id=session.id, user_id=player_c.id, type_id="ptype_gen_c"),
            SessionPlayerType(session_id=session.id, user_id=player_b.id, type_id="ptype_gen_b"),
            SessionPlayerType(session_id=session.id, user_id=player_a.id, type_id="ptype_gen_a"),
        ])
        db.session.commit()

        def _forecast(hours, device_id):
            forecast = {"hours": [hours]}
            if include_device_forecast:
                forecast["devices"] = [{"device_id": device_id, "hours": [hours]}]
            return forecast

        forecasts = {
            player_c.id: _forecast(434.4, "dev_gen_c"),
            player_b.id: _forecast(51.22, "dev_gen_b"),
            player_a.id: _forecast(398.0, "dev_gen_a"),
        }

        result = run_round(
            session.id,
            1,
            [player_c.id, player_b.id, player_a.id],
            forecasts,
            config,
            mode="shared_market",
            seed=f"future-kpi-regression-{include_device_forecast}",
        )

        return {
            player_c.id: ("dev_gen_c", 434.4, result["round_kpis"][player_c.id]),
            player_b.id: ("dev_gen_b", 51.22, result["round_kpis"][player_b.id]),
            player_a.id: ("dev_gen_a", 398.0, result["round_kpis"][player_a.id]),
        }


def _assert_player_owns_only_its_device(player_kpis, device_id: str, planned_mwh: float):
    assert set(player_kpis["device_hourly_breakdown"].keys()) == {device_id}

    hour_row = player_kpis["hourly_breakdown"][0]
    device_row = player_kpis["device_hourly_breakdown"][device_id][0]

    assert player_kpis["planned_mwh"] == pytest.approx(planned_mwh, abs=1e-6)
    assert player_kpis["variable_cost_zar"] == pytest.approx(hour_row["variable_cost_zar"], abs=1.0)
    assert hour_row["variable_cost_zar"] == pytest.approx(round(device_row["variable_cost_zar"], 0), abs=1.0)
    assert player_kpis["imbalance_cost_zar"] == pytest.approx(round(device_row["imbalance_cost_zar"], 0), abs=1.0)
    assert player_kpis["profit_zar"] == pytest.approx(round(hour_row["profit_zar"], 0), abs=1.0)


def test_shared_market_costs_stay_on_own_device_with_forecast_devices(monkeypatch):
    player_rows = _run_shared_market_round(monkeypatch, include_device_forecast=True)

    for device_id, planned_mwh, player_kpis in player_rows.values():
        _assert_player_owns_only_its_device(player_kpis, device_id, planned_mwh)


def test_shared_market_costs_stay_on_own_device_with_player_type_fallback(monkeypatch):
    player_rows = _run_shared_market_round(monkeypatch, include_device_forecast=False)

    for device_id, planned_mwh, player_kpis in player_rows.values():
        _assert_player_owns_only_its_device(player_kpis, device_id, planned_mwh)