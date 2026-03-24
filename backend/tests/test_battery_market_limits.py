import math

import pytest

from app.engine import build_demand_from_bids, build_supply_from_bids


def test_battery_discharge_bid_is_capped_before_entering_supply_curve():
    config = {
        "market": {"enable_player_bidding": True},
        "devices": [
            {
                "id": "bat_1",
                "type": "battery",
                "capacity_mwh": 100,
                "power_mw": 50,
                "efficiency_pct": 85,
                "initial_soc_pct": 50,
                "max_dod_pct": 80,
            }
        ],
    }
    forecasts = {
        1: {
            "bids": {
                "bat_1": {
                    "A": {"price": 300, "hours": [40.0] * 24}
                }
            }
        }
    }
    leg_eff = math.sqrt(0.85)
    battery_market_limits = {
        "bat_1": {
            "max_discharge_mwh": (50.0 - 20.0) * leg_eff,
            "max_charge_mwh": 999.0,
            "power_mw": 50.0,
        }
    }

    combined, bids_meta = build_supply_from_bids(
        forecasts,
        0,
        [],
        config,
        battery_market_limits=battery_market_limits,
    )

    assert len(combined) == 1
    assert len(bids_meta) == 1
    assert bids_meta[0]["quantity"] == pytest.approx((50.0 - 20.0) * leg_eff, rel=1e-6)
    assert combined[0][1] == pytest.approx((50.0 - 20.0) * leg_eff, rel=1e-6)


def test_battery_charge_bid_is_capped_by_headroom_and_power_before_entering_demand_curve():
    config = {
        "market": {"enable_player_bidding": True},
        "devices": [
            {
                "id": "bat_1",
                "type": "battery",
                "capacity_mwh": 100,
                "power_mw": 25,
                "efficiency_pct": 85,
                "initial_soc_pct": 50,
                "max_dod_pct": 80,
            }
        ],
    }
    forecasts = {
        1: {
            "bids": {
                "bat_1": {
                    "A": {"price": 100, "hours": [-80.0] * 24}
                }
            }
        }
    }
    battery_market_limits = {
        "bat_1": {
            "max_discharge_mwh": 999.0,
            "max_charge_mwh": 25.0,
            "power_mw": 25.0,
        }
    }

    combined, bids_meta = build_demand_from_bids(
        forecasts,
        0,
        [],
        config,
        battery_market_limits=battery_market_limits,
    )

    assert len(combined) == 1
    assert len(bids_meta) == 1
    assert bids_meta[0]["quantity"] == pytest.approx(25.0, rel=1e-6)
    assert bids_meta[0]["bid_label"] == "A_CHG"
    assert combined[0][1] == pytest.approx(25.0, rel=1e-6)


def test_battery_discharge_bid_is_capped_by_power_limit_before_entering_supply_curve():
    config = {
        "market": {"enable_player_bidding": True},
        "devices": [
            {
                "id": "bat_1",
                "type": "battery",
                "capacity_mwh": 100,
                "power_mw": 25,
                "efficiency_pct": 85,
                "initial_soc_pct": 100,
                "max_dod_pct": 100,
            }
        ],
    }
    forecasts = {
        1: {
            "bids": {
                "bat_1": {
                    "A": {"price": 300, "hours": [40.0] * 24}
                }
            }
        }
    }
    battery_market_limits = {
        "bat_1": {
            "max_discharge_mwh": 25.0,
            "max_charge_mwh": 999.0,
            "power_mw": 25.0,
        }
    }

    combined, bids_meta = build_supply_from_bids(
        forecasts,
        0,
        [],
        config,
        battery_market_limits=battery_market_limits,
    )

    assert len(combined) == 1
    assert len(bids_meta) == 1
    assert bids_meta[0]["quantity"] == pytest.approx(25.0, rel=1e-6)
    assert combined[0][1] == pytest.approx(25.0, rel=1e-6)