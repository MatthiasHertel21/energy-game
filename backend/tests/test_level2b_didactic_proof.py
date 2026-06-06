import io
from contextlib import redirect_stdout

import pytest

from app import create_app, db
from app.config import Config
from app.engine import run_round
from app.models import Cohort, Role, Scenario, Session, SessionPlayerType, SessionStatus, User
from scripts.seed_uct_2026_jun_campaign import _build_level2b


ROUND_PROFILES = [
    {"round": 1, "retail_mw": 200.0, "gen_c_price": 500.0},
    {"round": 2, "retail_mw": 200.0, "gen_c_price": 550.0},
    {"round": 3, "retail_mw": 200.0, "gen_c_price": 650.0},
    {"round": 4, "retail_mw": 500.0, "gen_c_price": 650.0},
    {"round": 5, "retail_mw": 200.0, "gen_c_price": 500.0},
    {"round": 6, "retail_mw": 500.0, "gen_c_price": 550.0},
]


EXPECTED_OUTCOMES = {
    1: {"price_source": "uniform", "split": False, "zone_prices": [500.0, 500.0], "zone1_dispatch": 680.0, "zone2_dispatch": 0.0, "retail_dispatch": 200.0},
    2: {"price_source": "zonal_split", "split": True, "zone_prices": [500.0, 550.0], "zone1_dispatch": 790.0, "zone2_dispatch": 610.0, "retail_dispatch": 200.0},
    3: {"price_source": "zonal_split", "split": True, "zone_prices": [500.0, 650.0], "zone1_dispatch": 790.0, "zone2_dispatch": 610.0, "retail_dispatch": 200.0},
    4: {"price_source": "zonal_split", "split": True, "zone1_price": 500.0, "zone2_price_min": 650.0, "zone1_dispatch": 790.0, "zone2_dispatch": 910.0, "retail_dispatch": 500.0},
    5: {"price_source": "uniform", "split": False, "zone_prices": [500.0, 500.0], "zone1_dispatch": 680.0, "zone2_dispatch": 0.0, "retail_dispatch": 200.0},
    6: {"price_source": "zonal_split", "split": True, "zone_prices": [500.0, 550.0], "zone1_dispatch": 790.0, "zone2_dispatch": 910.0, "retail_dispatch": 500.0},
}


def _make_round_forecasts(zone1_user_id: int, zone2_user_id: int, retail_user_id: int, retail_mw: float, gen_c_price: float) -> dict:
    zone1_a = 600.0
    zone1_b = 1000.0
    zone2_c = 1000.0
    return {
        zone1_user_id: {
            "hours": [zone1_a + zone1_b],
            "devices": [
                {"device_id": "dev_gen_a", "hours": [zone1_a]},
                {"device_id": "dev_gen_b", "hours": [zone1_b]},
            ],
            "bids": {
                "dev_gen_a": {"A": {"price": 400.0, "hours": [zone1_a]}},
                "dev_gen_b": {"A": {"price": 500.0, "hours": [zone1_b]}},
            },
        },
        zone2_user_id: {
            "hours": [zone2_c],
            "devices": [
                {"device_id": "dev_gen_c", "hours": [zone2_c]},
            ],
            "bids": {
                "dev_gen_c": {"A": {"price": gen_c_price, "hours": [zone2_c]}},
            },
        },
        retail_user_id: {
            "hours": [retail_mw],
            "devices": [
                {"device_id": "dev_l2b_retail", "hours": [retail_mw]},
            ],
            "bids": {
                "dev_l2b_retail": {"A": {"price": 2200.0, "hours": [retail_mw]}},
            },
        },
    }


def test_level2b_simulation_proves_didactic_goal(monkeypatch):
    monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["RATELIMIT_ENABLED"] = False

    with app.app_context():
        db.drop_all()
        db.create_all()

        trainer = User(email="level2b-proof-trainer@test.local", password_hash="x", role=Role.trainer)
        zone1_user = User(email="level2b-zone1@test.local", password_hash="x", role=Role.player)
        zone2_user = User(email="level2b-zone2@test.local", password_hash="x", role=Role.player)
        retail_user = User(email="level2b-retail@test.local", password_hash="x", role=Role.player)
        db.session.add_all([trainer, zone1_user, zone2_user, retail_user])
        db.session.flush()

        config = _build_level2b()
        assert config["general"].get("zonal_pricing_v1_enabled") is True

        scenario = Scenario(name="Level 2b Didactic Proof", config=config)
        cohort = Cohort(name="Level 2b Didactic Proof Cohort", trainer_id=trainer.id)
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
            SessionPlayerType(session_id=session.id, user_id=zone1_user.id, type_id="ptype_l2b_generators_zone1"),
            SessionPlayerType(session_id=session.id, user_id=zone2_user.id, type_id="ptype_l2b_generators_zone2"),
            SessionPlayerType(session_id=session.id, user_id=retail_user.id, type_id="ptype_l2b_retail"),
        ])
        db.session.commit()

        players = [zone1_user.id, zone2_user.id, retail_user.id]
        actual_rounds = {}

        for profile in ROUND_PROFILES:
            session.current_round = profile["round"]
            db.session.add(session)
            db.session.commit()

            with redirect_stdout(io.StringIO()):
                result = run_round(
                    session_id=session.id,
                    round_num=profile["round"],
                    players=players,
                    forecasts=_make_round_forecasts(
                        zone1_user.id,
                        zone2_user.id,
                        retail_user.id,
                        retail_mw=profile["retail_mw"],
                        gen_c_price=profile["gen_c_price"],
                    ),
                    config=config,
                    mode="shared_market",
                    seed=f"level2b-proof-round-{profile['round']}",
                )

            hour = result["hourly_results"][0]
            link = next(
                entry
                for entry in (result.get("link_results") or [])
                if int(entry.get("from_zone", 0) or 0) == 1 and int(entry.get("to_zone", 0) or 0) == 2
            )
            zone1_kpis = result["round_kpis"][zone1_user.id]
            zone2_kpis = result["round_kpis"][zone2_user.id]
            retail_kpis = result["round_kpis"][retail_user.id]
            expected = EXPECTED_OUTCOMES[profile["round"]]

            assert hour["price_source"] == expected["price_source"]
            assert bool(hour["zonal_pricing_active"]) is expected["split"]
            if "zone_prices" in expected:
                assert hour["zone_prices"] == pytest.approx(expected["zone_prices"], abs=1e-6)
            else:
                assert hour["zone_prices"][0] == pytest.approx(expected["zone1_price"], abs=1e-6)
                assert hour["zone_prices"][1] > expected["zone2_price_min"]
            assert bool(link["binding"]) is True
            assert link["flow_mwh"] == pytest.approx(250.0, abs=1e-6)

            assert zone1_kpis["player_zone_split_active"] is expected["split"]
            assert zone2_kpis["player_zone_split_active"] is expected["split"]
            assert retail_kpis["player_zone_split_active"] is expected["split"]

            assert zone1_kpis["dispatched_mwh"] == pytest.approx(expected["zone1_dispatch"], abs=1e-6)
            assert zone2_kpis["dispatched_mwh"] == pytest.approx(expected["zone2_dispatch"], abs=1e-6)
            assert retail_kpis["dispatched_mwh"] == pytest.approx(expected["retail_dispatch"], abs=1e-6)

            zone1_price, zone2_price = hour["zone_prices"]
            assert zone1_kpis["revenue_zar"] == pytest.approx(zone1_kpis["dispatched_mwh"] * zone1_price, abs=1.0)
            assert zone2_kpis["revenue_zar"] == pytest.approx(zone2_kpis["dispatched_mwh"] * zone2_price, abs=1.0)
            assert retail_kpis["revenue_zar"] == pytest.approx(-retail_kpis["dispatched_mwh"] * zone2_price, abs=1.0)

            actual_rounds[profile["round"]] = {
                "hour": hour,
                "zone1_kpis": zone1_kpis,
                "zone2_kpis": zone2_kpis,
                "retail_kpis": retail_kpis,
            }

        assert actual_rounds[1]["hour"]["price_source"] == "uniform"
        assert actual_rounds[2]["hour"]["zone_prices"][1] > actual_rounds[1]["hour"]["zone_prices"][1]
        assert actual_rounds[3]["hour"]["zone_prices"][1] > actual_rounds[2]["hour"]["zone_prices"][1]
        assert actual_rounds[4]["hour"]["zone_prices"][1] > actual_rounds[3]["hour"]["zone_prices"][1]
        assert abs(actual_rounds[4]["retail_kpis"]["revenue_zar"]) > abs(actual_rounds[3]["retail_kpis"]["revenue_zar"])
        assert actual_rounds[5]["hour"]["price_source"] == "uniform"
        assert actual_rounds[6]["hour"]["zone_prices"][1] < actual_rounds[4]["hour"]["zone_prices"][1]