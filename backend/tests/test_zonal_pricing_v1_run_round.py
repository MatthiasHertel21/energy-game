import pytest

from app import create_app, db
from app.config import Config
from app.engine import run_round
from app.models import Cohort, Forecast, Result, Role, Scenario, Session, SessionPlayerType, SessionStatus, User


def _run_zonal_round(monkeypatch, atc_capacity: float):
    monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["RATELIMIT_ENABLED"] = False

    scenario_config = {
        "general": {
            "round_span_hours": 1,
            "horizon_hours": 1,
            "forecast_horizon_hours": 1,
            "rounds": 1,
            "start_time": "08:00",
            "fake_date": "2025-06-01",
            "day_one_baseline_mode": "edit_round_1",
            "zonal_pricing_v1_enabled": True,
        },
        "market": {
            "enable_player_bidding": True,
            "base_price": 500,
            "base_volume_mwh": 0,
            "price_floor": -500,
            "price_cap": 5000,
            "consumer_mix": {},
        },
        "balancing": {
            "enabled": True,
            "mode": "absolute",
            "price_mode": "absolute",
            "up_price_zar_per_mwh": 1000,
            "down_price_zar_per_mwh": 1000,
        },
        "markets": {
            "dam": {"trading": ["market_code"]},
            "idm": {"trading": ["off"]},
        },
        "grid": {
            "zones": 2,
            "atc": [[0, atc_capacity], [atc_capacity, 0]],
            "losses_pct_per_link": 0,
            "network_settlement": {
                "extra_cost_mode": "zonal_only",
                "cost_allocation_target": "consumers_only",
                "shortfall_price_mode": "smp_multiplier",
                "shortfall_price_value": 2.0,
            },
        },
        "devices": [
            {
                "id": "gen_low",
                "type": "coal",
                "max_power_mw": 120,
                "variable_cost_zar_per_mwh": 20,
            },
            {
                "id": "gen_high",
                "type": "coal",
                "max_power_mw": 80,
                "variable_cost_zar_per_mwh": 50,
            },
            {
                "id": "load_z2",
                "type": "industrial_load",
                "baseline_load_mw": 120,
                "peak_load_mw": 120,
            },
        ],
        "player_types": [
            {"id": "producer_low", "name": "Producer Low", "zone": 1, "devices": ["gen_low"]},
            {"id": "producer_high", "name": "Producer High", "zone": 2, "devices": ["gen_high"]},
            {"id": "consumer_z2", "name": "Consumer Z2", "zone": 2, "devices": ["load_z2"]},
        ],
        "events": [],
    }

    with app.app_context():
        db.drop_all()
        db.create_all()

        trainer = User(email="zonal-trainer@test.local", password_hash="x", role=Role.trainer)
        producer_low = User(email="zonal-low@test.local", password_hash="x", role=Role.player)
        producer_high = User(email="zonal-high@test.local", password_hash="x", role=Role.player)
        consumer = User(email="zonal-consumer@test.local", password_hash="x", role=Role.player)
        db.session.add_all([trainer, producer_low, producer_high, consumer])
        db.session.flush()

        scenario = Scenario(name="Zonal Pricing V1 Scenario", config=scenario_config)
        cohort = Cohort(name="Zonal Pricing V1 Cohort", trainer_id=trainer.id)
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
            SessionPlayerType(session_id=session.id, user_id=producer_low.id, type_id="producer_low"),
            SessionPlayerType(session_id=session.id, user_id=producer_high.id, type_id="producer_high"),
            SessionPlayerType(session_id=session.id, user_id=consumer.id, type_id="consumer_z2"),
        ])
        db.session.commit()

        forecasts = {
            producer_low.id: {
                "hours": [120.0],
                "devices": [{"device_id": "gen_low", "hours": [120.0]}],
                "bids": {
                    "gen_low": {
                        "A": {"price": 100.0, "hours": [120.0]},
                    }
                },
            },
            producer_high.id: {
                "hours": [80.0],
                "devices": [{"device_id": "gen_high", "hours": [80.0]}],
                "bids": {
                    "gen_high": {
                        "A": {"price": 300.0, "hours": [80.0]},
                    }
                },
            },
            consumer.id: {
                "hours": [120.0],
                "devices": [{"device_id": "load_z2", "hours": [120.0]}],
                "bids": {
                    "load_z2": {
                        "A": {"price": 1000.0, "hours": [120.0]},
                    }
                },
            },
        }

        result = run_round(
            session_id=session.id,
            round_num=1,
            players=[producer_low.id, producer_high.id, consumer.id],
            forecasts=forecasts,
            config=scenario_config,
            mode="shared_market",
            seed=f"zonal-v1-atc-{atc_capacity}",
        )

        return result, producer_low.id, producer_high.id, consumer.id


def test_run_round_applies_local_zone_prices_when_atc_binds(monkeypatch):
    result, producer_low_id, producer_high_id, consumer_id = _run_zonal_round(monkeypatch, atc_capacity=40.0)

    hour = result["hourly_results"][0]
    assert hour["zonal_pricing_active"] is True
    assert hour["price_source"] == "zonal_split"
    assert hour["zone_prices"] == pytest.approx([100.0, 300.0], abs=1e-6)
    assert hour["system_price_zar_per_mwh"] == pytest.approx(100.0, abs=1e-6)

    assert result["round_kpis"][producer_low_id]["revenue_zar"] == pytest.approx(4000.0, abs=1.0)
    assert result["round_kpis"][producer_high_id]["revenue_zar"] == pytest.approx(24000.0, abs=1.0)
    assert result["round_kpis"][consumer_id]["revenue_zar"] == pytest.approx(-36000.0, abs=1.0)
    assert result["round_kpis"][producer_low_id]["player_zone_split_active"] is True
    assert result["round_kpis"][producer_low_id]["congestion_revenue_zar"] == pytest.approx(0.0, abs=1.0)

    link_by_pair = {(entry["from_zone"], entry["to_zone"]): entry for entry in result.get("link_results", [])}
    assert link_by_pair[(1, 2)]["binding"] is True
    assert link_by_pair[(1, 2)]["flow_mwh"] == pytest.approx(40.0, abs=1e-6)


def test_run_round_preserves_uniform_settlement_when_prices_do_not_split(monkeypatch):
    result, producer_low_id, producer_high_id, consumer_id = _run_zonal_round(monkeypatch, atc_capacity=120.0)

    hour = result["hourly_results"][0]
    assert hour["zonal_pricing_active"] is False
    assert hour["price_source"] == "uniform"
    assert hour["zone_prices"] == pytest.approx([100.0, 100.0], abs=1e-6)
    assert hour["system_price_zar_per_mwh"] == pytest.approx(100.0, abs=1e-6)

    assert result["round_kpis"][producer_low_id]["revenue_zar"] == pytest.approx(12000.0, abs=1.0)
    assert result["round_kpis"][producer_high_id]["revenue_zar"] == pytest.approx(0.0, abs=1.0)
    assert result["round_kpis"][consumer_id]["revenue_zar"] == pytest.approx(-12000.0, abs=1.0)
    assert result["round_kpis"][producer_low_id]["player_zone_split_active"] is False


def test_run_round_round2_carries_da_zone_prices_into_delta_settlement(monkeypatch):
    monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["RATELIMIT_ENABLED"] = False

    scenario_config = {
        "general": {
            "round_span_hours": 1,
            "horizon_hours": 1,
            "forecast_horizon_hours": 1,
            "rounds": 2,
            "start_time": "08:00",
            "fake_date": "2025-06-01",
            "day_one_baseline_mode": "edit_round_1",
            "zonal_pricing_v1_enabled": True,
        },
        "market": {
            "enable_player_bidding": True,
            "base_price": 500,
            "base_volume_mwh": 0,
            "price_floor": -500,
            "price_cap": 5000,
            "consumer_mix": {},
        },
        "balancing": {
            "enabled": True,
            "mode": "absolute",
            "price_mode": "absolute",
            "up_price_zar_per_mwh": 1000,
            "down_price_zar_per_mwh": 1000,
        },
        "markets": {
            "dam": {"trading": ["market_code", "off"]},
            "idm": {"trading": ["off", "market_code"]},
        },
        "grid": {
            "zones": 2,
            "atc": [[0, 40.0], [40.0, 0]],
            "losses_pct_per_link": 0,
            "network_settlement": {
                "extra_cost_mode": "zonal_only",
                "cost_allocation_target": "consumers_only",
                "shortfall_price_mode": "smp_multiplier",
                "shortfall_price_value": 2.0,
            },
        },
        "devices": [
            {
                "id": "gen_low",
                "type": "coal",
                "max_power_mw": 120,
                "variable_cost_zar_per_mwh": 20,
            },
            {
                "id": "gen_high",
                "type": "coal",
                "max_power_mw": 80,
                "variable_cost_zar_per_mwh": 50,
            },
            {
                "id": "load_z2",
                "type": "industrial_load",
                "baseline_load_mw": 120,
                "peak_load_mw": 120,
            },
        ],
        "player_types": [
            {"id": "producer_low", "name": "Producer Low", "zone": 1, "devices": ["gen_low"]},
            {"id": "producer_high", "name": "Producer High", "zone": 2, "devices": ["gen_high"]},
            {"id": "consumer_z2", "name": "Consumer Z2", "zone": 2, "devices": ["load_z2"]},
        ],
        "events": [],
    }

    with app.app_context():
        db.drop_all()
        db.create_all()

        trainer = User(email="zonal-round2-trainer@test.local", password_hash="x", role=Role.trainer)
        producer_low = User(email="zonal-round2-low@test.local", password_hash="x", role=Role.player)
        producer_high = User(email="zonal-round2-high@test.local", password_hash="x", role=Role.player)
        consumer = User(email="zonal-round2-consumer@test.local", password_hash="x", role=Role.player)
        db.session.add_all([trainer, producer_low, producer_high, consumer])
        db.session.flush()

        scenario = Scenario(name="Zonal Pricing V1 Round2 Scenario", config=scenario_config)
        cohort = Cohort(name="Zonal Pricing V1 Round2 Cohort", trainer_id=trainer.id)
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

        players = [producer_low.id, producer_high.id, consumer.id]
        db.session.add_all([
            SessionPlayerType(session_id=session.id, user_id=producer_low.id, type_id="producer_low"),
            SessionPlayerType(session_id=session.id, user_id=producer_high.id, type_id="producer_high"),
            SessionPlayerType(session_id=session.id, user_id=consumer.id, type_id="consumer_z2"),
        ])
        db.session.commit()

        round1_forecasts = {
            producer_low.id: {
                "hours": [120.0],
                "devices": [{"device_id": "gen_low", "hours": [120.0]}],
                "bids": {"gen_low": {"A": {"price": 100.0, "hours": [120.0]}}},
            },
            producer_high.id: {
                "hours": [80.0],
                "devices": [{"device_id": "gen_high", "hours": [80.0]}],
                "bids": {"gen_high": {"A": {"price": 300.0, "hours": [80.0]}}},
            },
            consumer.id: {
                "hours": [120.0],
                "devices": [{"device_id": "load_z2", "hours": [120.0]}],
                "bids": {"load_z2": {"A": {"price": 1000.0, "hours": [120.0]}}},
            },
        }
        round1 = run_round(
            session_id=session.id,
            round_num=1,
            players=players,
            forecasts=round1_forecasts,
            config=scenario_config,
            mode="shared_market",
            seed="zonal-v1-round2-carryover",
        )

        round1_dispatch = round1.get("dam_bid_dispatch") or {}
        round1_hourly_results = round1.get("dam_hourly_results", round1.get("hourly_results", []))
        for pid in players:
            forecast_data = round1_forecasts[pid]
            db.session.add(Forecast(
                session_id=session.id,
                player_id=pid,
                round_num=-1,
                is_da_baseline=True,
                data={"hours": forecast_data["hours"], "da_baseline_hours": {"start": 0, "end": 1}},
                bids=forecast_data["bids"],
            ))
            db.session.add(Result(
                session_id=session.id,
                player_id=pid,
                round_num=1,
                data={
                    "smp": round1.get("smp"),
                    "volume": round1.get("volume"),
                    "kpis": round1["round_kpis"][pid],
                    "hourly_results": round1.get("hourly_results", []),
                    "dam_hourly_results": round1_hourly_results,
                    "dam_bid_dispatch": round1_dispatch,
                    "bid_dispatch": round1.get("bid_dispatch", {}),
                    "device_hourly_details": round1.get("device_hourly_details", {}),
                    "dam_device_hourly_details": round1.get("dam_device_hourly_details", {}),
                },
                bid_dispatch=(round1_dispatch.get(pid) or round1_dispatch.get(str(pid)) or {}),
            ))
        db.session.commit()

        round2_forecasts = {
            producer_low.id: {
                "hours": [40.0],
                "devices": [{"device_id": "gen_low", "hours": [40.0]}],
                "bids": {"gen_low": {"A": {"price": 500.0, "hours": [40.0]}}},
            },
            producer_high.id: {
                "hours": [80.0],
                "devices": [{"device_id": "gen_high", "hours": [80.0]}],
                "bids": {"gen_high": {"A": {"price": 500.0, "hours": [80.0]}}},
            },
            consumer.id: {
                "hours": [120.0],
                "devices": [{"device_id": "load_z2", "hours": [120.0]}],
                "bids": {"load_z2": {"A": {"price": 1000.0, "hours": [120.0]}}},
            },
        }
        round2 = run_round(
            session_id=session.id,
            round_num=2,
            players=players,
            forecasts=round2_forecasts,
            config=scenario_config,
            mode="shared_market",
            seed="zonal-v1-round2-carryover",
        )

        low_kpis = round2["round_kpis"][producer_low.id]
        high_kpis = round2["round_kpis"][producer_high.id]
        consumer_kpis = round2["round_kpis"][consumer.id]

        assert low_kpis["revenue_zar"] == pytest.approx(4000.0, abs=1.0)
        assert high_kpis["revenue_zar"] == pytest.approx(24000.0, abs=1.0)
        assert consumer_kpis["revenue_zar"] == pytest.approx(-36000.0, abs=1.0)

        low_device = low_kpis["device_hourly_breakdown"]["gen_low"][0]
        high_device = high_kpis["device_hourly_breakdown"]["gen_high"][0]
        consumer_device = consumer_kpis["device_hourly_breakdown"]["load_z2"][0]

        assert low_device["da_dispatched_mwh"] == pytest.approx(40.0, abs=1e-6)
        assert high_device["da_dispatched_mwh"] == pytest.approx(80.0, abs=1e-6)
        assert consumer_device["da_dispatched_mwh"] == pytest.approx(120.0, abs=1e-6)
        assert low_device["id_dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
        assert high_device["id_dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
        assert consumer_device["id_dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
        assert low_device["da_price_zar"] == pytest.approx(100.0, abs=1e-6)
        assert high_device["da_price_zar"] == pytest.approx(300.0, abs=1e-6)
        assert consumer_device["da_price_zar"] == pytest.approx(300.0, abs=1e-6)
        assert round2["da_baseline_metadata"]["players"][producer_high.id]["da_price_zar"] == pytest.approx(300.0, abs=1e-6)