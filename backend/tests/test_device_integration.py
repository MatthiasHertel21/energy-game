"""
Integration tests for device model in Engine and Player
"""
import pytest
from app.engine import apply_grid, run_round
from app.device_types import DeviceType


def _run_round1_baseline_mode_scenario(mode: str):
    config = {
        "general": {
            "round_span_hours": 1,
            "horizon_hours": 1,
            "rounds": 1,
            "start_time": "08:00",
            "fake_date": "2025-06-01",
            "day_one_baseline_mode": mode,
        },
        "market": {
            "enable_player_bidding": True,
            "base_price": 500,
            "base_volume_mwh": 1200,
            "price_floor": -500,
            "price_cap": 5000,
        },
        "markets": {
            "dam": {"trading": ["off"]},
            "idm": {"trading": ["market_code"]},
        },
        "grid": {"zones": 1, "atc": [[0]]},
        "devices": [
            {
                "id": "coal1",
                "type": "coal",
                "owner_id": 1,
                "bid_count": 1,
                "max_power_mw": 500,
                "variable_cost_zar_per_mwh": 400,
                "co2_emissions_kg_per_mwh": 900,
            }
        ],
        "events": [],
    }

    forecasts = {
        1: {
            "hours": [300.0],
            "devices": [{"device_id": "coal1", "hours": [300.0]}],
            "bids": {
                "coal1": {
                    "A": {"price": 400.0, "hours": [300.0]},
                }
            },
        }
    }

    return run_round(
        session_id=41,
        round_num=1,
        players=[1],
        forecasts=forecasts,
        config=config,
        mode="isolated_per_player",
        seed="baseline-mode-comparison",
    )


def test_run_round_shared_market_non_bid_actuals_stay_scoped_to_current_player():
    config = {
        "general": {
            "round_span_hours": 1,
            "horizon_hours": 1,
            "rounds": 1,
            "start_time": "08:00",
            "fake_date": "2025-06-01",
        },
        "environment": {"actual_noise_pct": 0},
        "market": {
            "enable_player_bidding": False,
            "base_price": 500,
            "base_volume_mwh": 300,
            "price_floor": -500,
            "price_cap": 5000,
        },
        "grid": {"zones": 1, "atc": [[0]]},
        "devices": [
            {
                "id": "coal_a",
                "type": "coal",
                "owner_id": 1,
                "max_power_mw": 400,
                "variable_cost_zar_per_mwh": 400,
            },
            {
                "id": "coal_b",
                "type": "coal",
                "owner_id": 2,
                "max_power_mw": 400,
                "variable_cost_zar_per_mwh": 500,
            },
            {
                "id": "coal_c",
                "type": "coal",
                "owner_id": 3,
                "max_power_mw": 400,
                "variable_cost_zar_per_mwh": 600,
            },
        ],
        "events": [],
    }

    forecasts = {
        1: {"hours": [100.0], "devices": [{"device_id": "coal_a", "hours": [100.0]}]},
        2: {"hours": [200.0], "devices": [{"device_id": "coal_b", "hours": [200.0]}]},
        3: {"hours": [300.0], "devices": [{"device_id": "coal_c", "hours": [300.0]}]},
    }

    result = run_round(
        session_id=99,
        round_num=1,
        players=[3, 2, 1],
        forecasts=forecasts,
        config=config,
        mode="shared_market",
        seed="shared-market-non-bid-actual-scope",
    )

    expected_devices = {1: "coal_a", 2: "coal_b", 3: "coal_c"}

    for player_id, device_id in expected_devices.items():
        kpis = result["round_kpis"][player_id]
        assert kpis["actual_mwh"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)

        device_row = kpis["device_hourly_breakdown"][device_id][0]
        assert device_row["actual_mw"] == pytest.approx(device_row["dispatched_mw"], abs=1e-6)


class TestEngineCurtailmentPriority:
    """Test engine curtailment with device priorities"""
    
    def test_apply_grid_with_devices_sorted_by_priority(self):
        """Devices should be sorted by priority before curtailment"""
        devices = [
            {'type': 'NUCLEAR', 'max_power_mw': 900},  # Priority 4 (last)
            {'type': 'SOLAR', 'max_power_mw': 200},    # Priority 1 (first)
            {'type': 'COAL', 'max_power_mw': 500},     # Priority 3
            {'type': 'GAS', 'max_power_mw': 200},      # Priority 2
        ]
        
        volume = 10000  # MW
        atc = [[0, 5000], [5000, 0]]  # ATC cap will cause curtailment
        
        curtailed, cong_signal = apply_grid(volume, atc, devices=devices)
        
        # Should return curtailment amount and congestion signal
        assert curtailed > 0
        assert 0 <= cong_signal <= 1
    
    def test_apply_grid_without_devices(self):
        """apply_grid should work without devices (backward compatibility)"""
        volume = 10000
        atc = [[0, 5000], [5000, 0]]
        
        curtailed, cong_signal = apply_grid(volume, atc)
        
        assert curtailed > 0
        assert 0 <= cong_signal <= 1
    
    def test_apply_grid_no_curtailment_needed(self):
        """No curtailment when volume is within ATC capacity"""
        devices = [
            {'type': 'COAL', 'max_power_mw': 500},
        ]
        
        volume = 5000  # Below ATC capacity
        atc = [[0, 10000], [10000, 0]]
        
        curtailed, cong_signal = apply_grid(volume, atc, devices=devices)
        
        assert curtailed == 0
        assert cong_signal == 0
    
    def test_apply_grid_empty_devices_list(self):
        """Empty devices list should not cause errors"""
        volume = 10000
        atc = [[0, 5000], [5000, 0]]
        devices = []
        
        curtailed, cong_signal = apply_grid(volume, atc, devices=devices)
        
        assert curtailed > 0
        assert 0 <= cong_signal <= 1


class TestEngineRunRoundWithDevices:
    """Test run_round with device-enhanced config"""
    
    def test_run_round_with_devices_in_config(self):
        """run_round should pass devices to apply_grid"""
        config = {
            "general": {"round_span_hours": 6, "horizon_hours": 24, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000, "price_floor": -500, "price_cap": 5000},
            "grid": {"zones": 2, "atc": [[0, 5000], [5000, 0]]},
            "devices": [
                {"type": "COAL", "max_power_mw": 500, "min_load_pct": 40, "ramp_rate_mw_per_min": 5, "cost_zar_per_mwh": 400},
                {"type": "SOLAR", "max_power_mw": 200, "capacity_factor": 0.25},
            ],
            "events": []
        }
        
        players = [1, 2]
        forecasts = {
            1: [100] * 24,  # 24 hours forecast
            2: [150] * 24
        }
        
        result = run_round(
            session_id=1,
            round_num=1,
            players=players,
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player"
        )
        
        # Should complete without errors
        assert "smp" in result
        assert "volume" in result
        assert "round_kpis" in result
        assert 1 in result["round_kpis"]
        assert 2 in result["round_kpis"]
    
    def test_run_round_shared_market_with_devices(self):
        """run_round in shared_market mode with devices"""
        config = {
            "general": {"round_span_hours": 6, "horizon_hours": 24, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000, "price_floor": -500, "price_cap": 5000},
            "grid": {"zones": 2, "atc": [[0, 5000], [5000, 0]]},
            "devices": [
                {"type": "NUCLEAR", "max_power_mw": 900, "min_load_pct": 90, "ramp_rate_mw_per_min": 1, "cost_zar_per_mwh": 100},
                {"type": "WIND", "max_power_mw": 150, "capacity_factor": 0.35},
            ],
            "events": []
        }
        
        players = [1, 2, 3]
        forecasts = {
            1: [200] * 24,
            2: [300] * 24,
            3: [250] * 24
        }
        
        result = run_round(
            session_id=1,
            round_num=1,
            players=players,
            forecasts=forecasts,
            config=config,
            mode="shared_market"
        )
        
        assert "smp" in result
        assert "volume" in result
        assert len(result["round_kpis"]) == 3

    def test_run_round_reports_battery_kpis_from_device_breakdown(self):
        """Battery KPIs should reconcile with the per-device settlement rows generated by run_round."""
        config = {
            "general": {
                "round_span_hours": 2,
                "horizon_hours": 24,
                "rounds": 4,
                "start_time": "00:00",
                "fake_date": "2025-01-01",
            },
            "market": {
                "enable_player_bidding": True,
                "base_price": 1000,
                "base_volume_mwh": 20000,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "grid": {"zones": 2, "atc": [[0, 5000], [5000, 0]]},
            "devices": [
                {
                    "id": "bat_1",
                    "type": "battery",
                    "owner_id": 1,
                    "capacity_mwh": 100,
                    "power_mw": 20,
                    "efficiency_pct": 85,
                    "initial_soc_pct": 50,
                    "max_dod_pct": 80,
                }
            ],
            "events": [],
        }

        charge_hours = [-20.0, 0.0] + [0.0] * 22
        discharge_hours = [0.0, 20.0] + [0.0] * 22
        forecasts = {
            1: {
                "hours": [0.0] * 24,
                "devices": [{"device_id": "bat_1"}],
                "bids": {
                    "bat_1": {
                        "A": {"price": 5000, "hours": charge_hours},
                        "B": {"price": 0, "hours": discharge_hours},
                    }
                },
            }
        }

        result = run_round(
            session_id=1,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="battery-kpi-test",
        )

        kpis = result["round_kpis"][1]
        device_rows = kpis["device_hourly_breakdown"]["bat_1"]

        assert len(device_rows) == 2
        assert kpis["battery_soc_start_pct"] == pytest.approx(50.0)
        assert kpis["battery_soc_end_pct"] is not None
        assert 20.0 <= kpis["battery_soc_end_pct"] <= 100.0
        assert kpis["battery_charged_mwh"] > 0.0
        assert kpis["battery_discharged_mwh"] > 0.0

        charged_total = sum(float(row.get("battery_charged_mwh", 0.0) or 0.0) for row in device_rows)
        discharged_total = sum(float(row.get("total_dispatched_mwh", 0.0) or 0.0) for row in device_rows)
        charge_cost_total = sum(float(row.get("battery_charge_cost_zar", 0.0) or 0.0) for row in device_rows)
        discharge_revenue_total = sum(
            float(row.get("da_revenue_zar", 0.0) or 0.0) + float(row.get("id_revenue_zar", 0.0) or 0.0)
            for row in device_rows
        )

        assert kpis["battery_charged_mwh"] == pytest.approx(charged_total, abs=1e-3)
        assert kpis["battery_discharged_mwh"] == pytest.approx(discharged_total, abs=1e-3)
        assert kpis["battery_charge_cost_zar"] == pytest.approx(charge_cost_total, abs=1e-2)
        assert kpis["battery_arbitrage_revenue_zar"] == round(discharge_revenue_total - charge_cost_total, 0)

    def test_classic_producer_bid_count_zero_variable_cost_and_co2(self):
        """Pure classic scenario (all bid_count=0, enable_player_bidding=False) must produce
        non-zero variable_cost and CO2 — previously both were always 0 due to enable_bidding gate."""
        config = {
            "general": {
                "round_span_hours": 2,
                "horizon_hours": 24,
                "rounds": 2,
                "start_time": "00:00",
                "fake_date": "2025-01-01",
            },
            "market": {
                "enable_player_bidding": False,
                "base_price": 1000,
                "base_volume_mwh": 200,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "coal_classic",
                    "type": "coal",
                    "owner_id": 1,
                    "bid_count": 0,
                    "max_power_mw": 200,
                    "variable_cost_tiers": [
                        {"from_pct": 0, "to_pct": 60, "cost_zar_per_mwh": 380},
                        {"from_pct": 60, "to_pct": 90, "cost_zar_per_mwh": 440},
                        {"from_pct": 90, "to_pct": 100, "cost_zar_per_mwh": 520},
                    ],
                    "co2_emissions_kg_per_mwh": 820,
                },
            ],
            "events": [],
        }

        forecasts = {
            1: {
                "hours": [100.0] * 24,
                "devices": [
                    {"device_id": "coal_classic", "hours": [100.0] * 24},
                ],
                "bids": {},
            }
        }

        result = run_round(
            session_id=1,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="classic-all-zero-bid-count",
        )

        kpis = result["round_kpis"][1]
        assert kpis["dispatched_mwh"] > 0.0, "dispatched_mwh must be non-zero"
        assert kpis["planned_mwh"] > 0.0, "planned_mwh must come from devices[].hours"
        # Key assertions for the bug fix: variable_cost and CO2 must not be zero
        assert kpis["variable_cost_zar"] > 0.0, \
            "variable_cost_zar was 0 for classic scenarios (enable_bidding=False) — bug fix must apply"
        assert kpis["co2_emissions_kg"] > 0.0, "co2 must be non-zero for dispatched coal"
        # Profit must be less than revenue (costs are real)
        assert kpis["profit_zar"] < kpis["revenue_zar"], \
            "profit must be less than revenue when variable costs are incurred"

    def test_classic_producer_bid_count_zero_keeps_co2_when_bidding_enabled(self):
        """A classic producer (bid_count=0) must still produce non-zero CO2 when dispatched."""
        config = {
            "general": {
                "round_span_hours": 2,
                "horizon_hours": 24,
                "rounds": 2,
                "start_time": "00:00",
                "fake_date": "2025-01-01",
            },
            "market": {
                "enable_player_bidding": False,
                "base_price": 1000,
                "base_volume_mwh": 200,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "coal_1",
                    "type": "coal",
                    "owner_id": 1,
                    "bid_count": 0,
                    "max_power_mw": 200,
                    "variable_cost_tiers": [
                        {"from_pct": 0, "to_pct": 60, "cost_zar_per_mwh": 380},
                        {"from_pct": 60, "to_pct": 90, "cost_zar_per_mwh": 440},
                        {"from_pct": 90, "to_pct": 100, "cost_zar_per_mwh": 520},
                    ],
                },
                {
                    # Forces explicit-bids mode globally, while coal_1 still uses classic fallback.
                    "id": "gas_toggle",
                    "type": "gas",
                    "owner_id": 1,
                    "bid_count": 1,
                    "max_power_mw": 50,
                    "variable_cost_zar_per_mwh": 1200,
                },
            ],
            "events": [],
        }

        forecasts = {
            1: {
                "hours": [0.0] * 24,
                "devices": [
                    {"device_id": "coal_1", "hours": [80.0] * 24},
                ],
                "bids": {
                    "coal_1": {},
                },
            }
        }

        result = run_round(
            session_id=1,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="classic-bidcount-zero-co2",
        )

        kpis = result["round_kpis"][1]
        # dispatched and planned must both be non-zero: bid_count=0 reads hours from devices array
        assert kpis["dispatched_mwh"] > 0.0
        assert kpis["planned_mwh"] > 0.0, "bid_count=0: planned_mwh must come from devices[].hours"
        assert kpis["co2_emissions_kg"] > 0.0

        coal_rows = kpis["device_hourly_breakdown"]["coal_1"]
        assert sum(float(row.get("dispatched_mw", 0.0) or 0.0) for row in coal_rows) > 0.0
        assert sum(float(row.get("planned_mw", 0.0) or 0.0) for row in coal_rows) > 0.0, \
            "bid_count=0: per-device planned_mw must be populated from forecast hours"
        assert sum(float(row.get("co2_kg", 0.0) or 0.0) for row in coal_rows) > 0.0

    def test_classic_shared_device_bid_count_zero_reconciles_exact_values(self, monkeypatch):
        """Shared classic devices must produce fully reconciled KPI/device rows with exact values.

        This is a whitebox regression test for the shared-device classic path:
        - per-device planned/dispatched/actual must be populated from forecast devices[].hours
        - variable_cost and CO2 must be derived from the tracked device dispatch
        - hourly and device rows must reconcile exactly for a deterministic no-noise run
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 1,
                "rounds": 1,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
            },
            "market": {
                "enable_player_bidding": False,
                "base_price": 500,
                "base_volume_mwh": 1200,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 0,
                    "max_power_mw": 500,
                    "variable_cost_tiers": [
                        {"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 500},
                    ],
                    "co2_emissions_kg_per_mwh": 950,
                },
            ],
            "player_types": [
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
            ],
            "events": [],
        }

        forecasts = {
            1: {
                "hours": [446.2],
                "devices": [
                    {"device_id": "dev_gen_b", "hours": [446.2]},
                ],
                "bids": {},
            }
        }

        result = run_round(
            session_id=21,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="shared-classic-whitebox",
        )

        kpis = result["round_kpis"][1]
        hour_row = kpis["hourly_breakdown"][0]
        device_row = kpis["device_hourly_breakdown"]["dev_gen_b"][0]

        expected_dispatch = 446.2
        expected_revenue = 204538.0      # SMP=458.4 (Walrasian upper-bound when supply < demand)
        expected_variable_cost = 223100.0
        expected_co2 = 423890.0

        assert result["smp"] == pytest.approx(458.4, abs=1e-6)
        assert kpis["planned_mwh"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert kpis["dispatched_mwh"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert kpis["actual_mwh"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert kpis["revenue_zar"] == pytest.approx(expected_revenue, abs=1e-6)
        assert kpis["variable_cost_zar"] == pytest.approx(expected_variable_cost, abs=1e-6)
        assert kpis["co2_emissions_kg"] == pytest.approx(expected_co2, abs=1e-6)
        assert kpis["imbalance_cost_zar"] == pytest.approx(0.0, abs=1e-6)
        assert kpis["profit_zar"] == pytest.approx(-18562.0, abs=1e-6)

        assert hour_row["planned_mw"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert hour_row["dispatched_mw"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert hour_row["actual_mw"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert hour_row["revenue_zar"] == pytest.approx(expected_revenue, abs=1e-6)
        assert hour_row["variable_cost_zar"] == pytest.approx(expected_variable_cost, abs=1e-6)
        assert hour_row["profit_zar"] == pytest.approx(-18562.0, abs=1e-6)

        assert device_row["planned_mw"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert device_row["dispatched_mw"] == pytest.approx(expected_dispatch, abs=1e-3)
        assert device_row["total_dispatched_mwh"] == pytest.approx(expected_dispatch, abs=1e-3)

    def test_isolated_single_player_without_synthetic_supply_uses_marginal_offer_price(self, monkeypatch):
        """Generator-only isolated sessions must not let synthetic max WTP set the SMP."""
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 1,
                "rounds": 1,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
            },
            "market": {
                "enable_player_bidding": True,
                "base_price": 1800,
                "base_volume_mwh": 2000,
                "price_floor": 0,
                "price_cap": 5000,
                "random_price_pct": 0,
                "random_capacity_pct": 0,
                "generator_mix": {
                    "pv": {"blocks": 0},
                    "wind": {"blocks": 0},
                    "hydro": {"blocks": 0},
                    "coal": {"blocks": 0},
                    "gas": {"blocks": 0},
                    "nuclear": {"blocks": 0},
                },
                "consumer_mix": {
                    "industrial": {"blocks": 1, "price_min": 3000, "price_max": 3000},
                },
            },
            "devices": [
                {
                    "id": "dev_gen_a",
                    "type": "coal",
                    "owner_id": 1,
                    "bid_count": 1,
                    "max_power_mw": 1000,
                    "variable_cost_tiers": [
                        {"from_pct": 0, "to_pct": 100, "cost_zar_per_mwh": 400},
                    ],
                },
            ],
            "events": [],
        }

        forecasts = {
            1: {
                "hours": [892.4],
                "devices": [{"device_id": "dev_gen_a", "hours": [892.4]}],
                "bids": {
                    "dev_gen_a": {
                        "A": {"price": 400, "hours": [892.4]},
                    }
                },
            }
        }

        result = run_round(
            session_id=294,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="single-player-marginal-offer",
        )

        assert result["smp"] == pytest.approx(400.0, abs=1e-6)
        assert result["volume"] == pytest.approx(892.4, abs=1e-6)
        assert result["dam_bid_dispatch"][1]["dev_gen_a"]["A"][0]["price_bid"] == pytest.approx(400.0, abs=1e-6)

    def test_round1_zero_and_preset_baseline_modes_keep_same_id_dispatch_but_change_plan(self, monkeypatch):
        """Round-1 zero/preset baselines should both stay in the ID-style path, but with different plans.

        This guards the branch controlled by general.day_one_baseline_mode when DAM is off
        and IDM is active in round 1.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        zero_result = _run_round1_baseline_mode_scenario("zero")
        preset_result = _run_round1_baseline_mode_scenario("preset")

        zero_kpis = zero_result["round_kpis"][1]
        preset_kpis = preset_result["round_kpis"][1]

        assert zero_result["smp"] == pytest.approx(preset_result["smp"], abs=1e-6)
        assert zero_result["volume"] == pytest.approx(preset_result["volume"], abs=1e-6)
        assert zero_kpis["dispatched_mwh"] == pytest.approx(preset_kpis["dispatched_mwh"], abs=1e-6)
        assert zero_kpis["actual_mwh"] == pytest.approx(preset_kpis["actual_mwh"], abs=1e-6)
        assert zero_kpis["revenue_zar"] == pytest.approx(preset_kpis["revenue_zar"], abs=1e-6)
        assert zero_kpis["variable_cost_zar"] == pytest.approx(preset_kpis["variable_cost_zar"], abs=1e-6)
        assert zero_kpis["profit_zar"] == pytest.approx(preset_kpis["profit_zar"], abs=1e-6)

        assert zero_kpis["planned_mwh"] == pytest.approx(300.0, abs=1e-6)
        assert preset_kpis["planned_mwh"] < zero_kpis["planned_mwh"]
        assert preset_kpis["planned_mwh"] > 0.0

    def test_round1_edit_round_one_opens_absolute_clearing_instead_of_id_delta_path(self, monkeypatch):
        """Round-1 edit_round_1 must behave materially differently from zero baseline.

        The DAM should open in round 1, so cleared volume and dispatched MWh are much higher
        than in the ID-style zero-baseline path for the same submitted forecast.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        zero_result = _run_round1_baseline_mode_scenario("zero")
        edit_result = _run_round1_baseline_mode_scenario("edit_round_1")

        zero_kpis = zero_result["round_kpis"][1]
        edit_kpis = edit_result["round_kpis"][1]

        assert edit_result["volume"] > zero_result["volume"]
        assert edit_kpis["dispatched_mwh"] > zero_kpis["dispatched_mwh"]
        assert edit_kpis["actual_mwh"] == pytest.approx(edit_kpis["dispatched_mwh"], abs=1e-6)
        assert edit_kpis["planned_mwh"] == pytest.approx(300.0, abs=1e-6)
        assert edit_kpis["revenue_zar"] > zero_kpis["revenue_zar"]
        assert edit_kpis["variable_cost_zar"] > zero_kpis["variable_cost_zar"]
        assert edit_kpis["profit_zar"] > zero_kpis["profit_zar"]

    def test_classic_shared_consumer_bid_count_zero_should_populate_physical_tracking(self, monkeypatch):
        """Shared classic consumer devices should populate KPI and per-device physical quantities.

        This path is KSE-reachable via player_types + shared load devices and must keep
        physical tracking in sync with settlement.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 1,
                "rounds": 1,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
            },
            "market": {
                "enable_player_bidding": False,
                "base_price": 1000,
                "base_volume_mwh": 1200,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "load_a",
                    "type": "industrial_load",
                    "bid_count": 0,
                    "max_power_mw": 500,
                    "value_of_lost_load": 1500,
                },
            ],
            "player_types": [
                {"id": "ptype_load", "name": "Load Player", "devices": ["load_a"]},
            ],
            "events": [],
        }

        forecasts = {
            1: {
                "hours": [300.0],
                "devices": [{"device_id": "load_a", "hours": [300.0]}],
                "bids": {},
            }
        }

        result = run_round(
            session_id=31,
            round_num=1,
            players=[1],
            forecasts=forecasts,
            config=config,
            mode="isolated_per_player",
            seed="shared-classic-consumer",
        )

        kpis = result["round_kpis"][1]
        device_row = kpis["device_hourly_breakdown"]["load_a"][0]

        assert kpis["planned_mwh"] == pytest.approx(300.0, abs=1e-6)
        assert kpis["dispatched_mwh"] > 0.0
        assert kpis["actual_mwh"] > 0.0
        assert device_row["planned_mw"] == pytest.approx(kpis["planned_mwh"], abs=1e-6)
        assert device_row["total_dispatched_mwh"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)
        assert device_row["actual_mw"] == pytest.approx(kpis["actual_mwh"], abs=1e-6)

    def test_shared_device_round2_id_delta_keeps_da_device_tracking(self, monkeypatch):
        """Round-2 ID-delta must preserve shared-device DA carry-over in device tracking.

        This covers the shared-device path with SessionPlayerType mapping and persisted
        Round-1 DAM dispatch, ensuring round-2 KPI/device rows still reconcile.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        from app import create_app, db
        from app.config import Config
        from app.models import (
            Campaign,
            Cohort,
            Forecast,
            Result,
            Role,
            Scenario,
            Session,
            SessionPlayerType,
            SessionStatus,
            User,
        )

        monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

        app = create_app()
        app.config["TESTING"] = True
        app.config["RATELIMIT_ENABLED"] = False

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 2,
                "forecast_horizon_hours": 2,
                "rounds": 2,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
                "day_one_baseline_mode": "edit_round_1",
            },
            "market": {
                "enable_player_bidding": True,
                "base_price": 500,
                "base_volume_mwh": 1200,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "markets": {
                "dam": {"trading": ["market_code", "off"]},
                "idm": {"trading": ["off", "market_code"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 1,
                    "max_power_mw": 500,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 900,
                }
            ],
            "player_types": [
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
            ],
            "events": [],
        }

        with app.app_context():
            db.drop_all()
            db.create_all()

            player = User(email="shared-id-player@test.local", password_hash="x", role=Role.player)
            designer = User(email="shared-id-designer@test.local", password_hash="x", role=Role.designer)
            trainer = User(email="shared-id-trainer@test.local", password_hash="x", role=Role.trainer)
            db.session.add_all([player, designer, trainer])
            db.session.flush()

            campaign = Campaign(name="Shared ID Campaign", description="", designer_id=designer.id, published=True)
            db.session.add(campaign)
            db.session.flush()

            scenario = Scenario(campaign_id=campaign.id, name="Shared ID Scenario", config=config)
            db.session.add(scenario)
            db.session.flush()

            cohort = Cohort(name="Shared ID Cohort", trainer_id=trainer.id)
            db.session.add(cohort)
            db.session.flush()

            session = Session(
                cohort_id=cohort.id,
                scenario_id=scenario.id,
                status=SessionStatus.round_active,
                current_round=1,
                mode="isolated_per_player",
            )
            db.session.add(session)
            db.session.flush()

            db.session.add(SessionPlayerType(session_id=session.id, user_id=player.id, type_id="ptype_gen_b"))
            db.session.commit()

            round1_forecasts = {
                player.id: {
                    "hours": [300.0],
                    "devices": [{"device_id": "dev_gen_b", "hours": [300.0]}],
                    "bids": {"dev_gen_b": {"A": {"price": 400.0, "hours": [300.0]}}},
                }
            }
            round1 = run_round(
                session.id,
                1,
                [player.id],
                round1_forecasts,
                config,
                mode="isolated_per_player",
                seed="shared-id-delta",
            )

            round1_dam_dispatch = (round1.get("dam_bid_dispatch") or {}).get(player.id, round1.get("dam_bid_dispatch", {}))
            assert round1_dam_dispatch, "round 1 must persist DAM dispatch for round-2 baseline lookup"

            db.session.add(Forecast(
                session_id=session.id,
                player_id=player.id,
                round_num=-1,
                is_da_baseline=True,
                data={"hours": [300.0, 0.0], "da_baseline_hours": {"start": 0, "end": 1}},
                bids={"dev_gen_b": {"A": {"price": 400.0, "hours": [300.0, 0.0]}}},
            ))
            db.session.add(Result(
                session_id=session.id,
                player_id=player.id,
                round_num=1,
                data={
                    "smp": round1.get("smp"),
                    "volume": round1.get("volume"),
                    "kpis": round1["round_kpis"][player.id],
                    "hourly_results": round1.get("hourly_results", []),
                    "dam_bid_dispatch": round1_dam_dispatch,
                    "bid_dispatch": (round1.get("bid_dispatch") or {}).get(player.id, {}),
                    "device_hourly_details": round1.get("device_hourly_details", {}),
                    "dam_device_hourly_details": round1.get("dam_device_hourly_details", {}),
                },
                bid_dispatch=round1_dam_dispatch,
            ))
            db.session.commit()

            round2_forecasts = {
                player.id: {
                    "hours": [300.0],
                    "devices": [{"device_id": "dev_gen_b", "hours": [300.0]}],
                    "bids": {"dev_gen_b": {"A": {"price": 800.0, "hours": [300.0]}}},
                }
            }
            round2 = run_round(
                session.id,
                2,
                [player.id],
                round2_forecasts,
                config,
                mode="isolated_per_player",
                seed="shared-id-delta",
            )

            kpis = round2["round_kpis"][player.id]
            hour_row = kpis["hourly_breakdown"][0]
            device_row = kpis["device_hourly_breakdown"]["dev_gen_b"][0]

            assert kpis["planned_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert kpis["dispatched_mwh"] > 0.0
            assert kpis["actual_mwh"] > 0.0
            assert kpis["planned_mwh"] > kpis["dispatched_mwh"]
            assert kpis["actual_mwh"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)
            assert kpis["revenue_zar"] > 0.0
            assert kpis["variable_cost_zar"] > 0.0
            assert kpis["co2_emissions_kg"] > 0.0

            assert hour_row["planned_mw"] == pytest.approx(kpis["planned_mwh"], abs=1e-6)
            assert hour_row["dispatched_mw"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)
            assert hour_row["actual_mw"] == pytest.approx(kpis["actual_mwh"], abs=1e-6)

            assert device_row["planned_mw"] == pytest.approx(kpis["planned_mwh"], abs=1e-6)
            assert device_row["dispatched_mw"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)
            assert device_row["actual_mw"] == pytest.approx(kpis["actual_mwh"], abs=1e-6)
            assert device_row["da_dispatched_mwh"] > 0.0
            assert device_row["id_dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
            assert device_row["total_dispatched_mwh"] == pytest.approx(device_row["da_dispatched_mwh"], abs=1e-6)
            assert device_row["total_dispatched_mwh"] == pytest.approx(kpis["dispatched_mwh"], abs=1e-6)

    def test_shared_device_round2_dam_only_bid_count_zero_keeps_device_tracking(self, monkeypatch):
        """Round-2 DAM-only classic devices must keep non-zero device tracking with round-local hours.

        Regression for shared-market sessions where KSE devices use bid_count=0.
        In the real scheduler path, the top-level forecast hours are a full horizon while
        devices[].hours remain round-local arrays of length 1. In round 2, the KPI/device
        tracking path must therefore fall back to hour_offset for devices[].hours instead of
        reading past the end with the scenario-global hour index.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        from app import create_app, db
        from app.config import Config
        from app.models import Campaign, Cohort, Role, Scenario, Session, SessionPlayerType, SessionStatus, User

        monkeypatch.setattr(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")

        app = create_app()
        app.config["TESTING"] = True
        app.config["RATELIMIT_ENABLED"] = False

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 2,
                "forecast_horizon_hours": 2,
                "rounds": 2,
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
            "markets": {
                "dam": {"trading": ["on", "on"]},
                "idm": {"trading": ["off", "off"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 0,
                    "max_power_mw": 500,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 900,
                }
            ],
            "player_types": [
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
            ],
            "events": [],
        }

        with app.app_context():
            db.drop_all()
            db.create_all()

            player = User(email="dam-only-bidcount-zero@test.local", password_hash="x", role=Role.player)
            designer = User(email="dam-only-bidcount-zero-designer@test.local", password_hash="x", role=Role.designer)
            trainer = User(email="dam-only-bidcount-zero-trainer@test.local", password_hash="x", role=Role.trainer)
            db.session.add_all([player, designer, trainer])
            db.session.flush()

            campaign = Campaign(name="DAM Only Bid Count Zero Campaign", description="", designer_id=designer.id, published=True)
            db.session.add(campaign)
            db.session.flush()

            scenario = Scenario(campaign_id=campaign.id, name="DAM Only Bid Count Zero Scenario", config=config)
            db.session.add(scenario)
            db.session.flush()

            cohort = Cohort(name="DAM Only Bid Count Zero Cohort", trainer_id=trainer.id)
            db.session.add(cohort)
            db.session.flush()

            session = Session(
                cohort_id=cohort.id,
                scenario_id=scenario.id,
                status=SessionStatus.round_active,
                current_round=2,
                mode="shared_market",
            )
            db.session.add(session)
            db.session.flush()

            db.session.add(SessionPlayerType(session_id=session.id, user_id=player.id, type_id="ptype_gen_b"))
            db.session.commit()

            round2 = run_round(
                session.id,
                2,
                [player.id],
                {
                    player.id: {
                        "hours": [0.0, 300.0],
                        "devices": [{"device_id": "dev_gen_b", "hours": [300.0]}],
                        "bids": {},
                    }
                },
                config,
                mode="shared_market",
                seed="dam-only-bidcount-zero",
            )

            kpis = round2["round_kpis"][player.id]
            hour_row = kpis["hourly_breakdown"][0]
            device_row = kpis["device_hourly_breakdown"]["dev_gen_b"][0]

            assert kpis["planned_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert kpis["dispatched_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert kpis["actual_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert kpis["revenue_zar"] > 0.0
            assert kpis["variable_cost_zar"] > 0.0
            assert kpis["co2_emissions_kg"] > 0.0

            assert hour_row["planned_mw"] == pytest.approx(300.0, abs=1e-6)
            assert hour_row["dispatched_mw"] == pytest.approx(300.0, abs=1e-6)
            assert hour_row["actual_mw"] == pytest.approx(300.0, abs=1e-6)

            assert device_row["planned_mw"] == pytest.approx(300.0, abs=1e-6)
            assert device_row["dispatched_mw"] == pytest.approx(300.0, abs=1e-6)
            assert device_row["actual_mw"] == pytest.approx(300.0, abs=1e-6)
            assert device_row["total_dispatched_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert device_row["da_dispatched_mwh"] == pytest.approx(300.0, abs=1e-6)
            assert device_row["id_dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)

    def test_shared_market_bid_count_zero_uses_merit_order_not_pro_rata(self, monkeypatch):
        """Classic shared-market devices must still use price merit order for dispatch.

        Regression for bid_count=0 sessions where the market clears on price,
        but the player KPI fallback previously re-assigned dispatch pro rata from
        planned quantities and gave expensive offers revenue/profit they should
        not receive.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 1,
                "forecast_horizon_hours": 1,
                "rounds": 1,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
            },
            "market": {
                "enable_player_bidding": False,
                "base_price": 500,
                "base_volume_mwh": 0,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "markets": {
                "dam": {"trading": ["on"]},
                "idm": {"trading": ["off"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 0,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 500,
                    "co2_emissions_kg_per_mwh": 900,
                },
                {
                    "id": "dev_gen_a",
                    "type": "coal",
                    "bid_count": 0,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 900,
                },
                {
                    "id": "dev_load",
                    "type": "industrial_load",
                    "bid_count": 0,
                    "max_power_mw": 1000,
                    "willingness_to_pay": 3000,
                },
            ],
            "player_types": [
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
                {"id": "ptype_gen_a", "name": "Producer A", "devices": ["dev_gen_a"]},
                {"id": "ptype_load", "name": "Load", "devices": ["dev_load"]},
            ],
            "events": [],
        }

        result = run_round(
            session_id=306,
            round_num=1,
            players=[1, 11, 22],
            forecasts={
                1: {
                    "hours": [1049.65],
                    "devices": [{"device_id": "dev_gen_b", "hours": [1049.65]}],
                    "bids": {},
                },
                11: {
                    "hours": [1000.0],
                    "devices": [{"device_id": "dev_gen_a", "hours": [1000.0]}],
                    "bids": {},
                },
                22: {
                    "hours": [1000.0],
                    "devices": [{"device_id": "dev_load", "hours": [1000.0]}],
                    "bids": {},
                },
            },
            config=config,
            mode="shared_market",
            seed="classic-shared-merit-order",
        )

        expensive = result["round_kpis"][1]
        cheap = result["round_kpis"][11]
        consumer = result["round_kpis"][22]

        assert result["volume"] == pytest.approx(1000.0, abs=1e-6)

        assert expensive["planned_mwh"] == pytest.approx(1049.65, abs=1e-6)
        assert expensive["dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
        assert expensive["revenue_zar"] == pytest.approx(0.0, abs=1e-6)
        assert expensive["profit_zar"] == pytest.approx(0.0, abs=1e-6)
        assert expensive["device_hourly_breakdown"]["dev_gen_b"][0]["dispatched_mw"] == pytest.approx(0.0, abs=1e-6)

        assert cheap["planned_mwh"] == pytest.approx(1000.0, abs=1e-6)
        assert cheap["dispatched_mwh"] == pytest.approx(1000.0, abs=1e-6)
        assert cheap["revenue_zar"] == pytest.approx(result["smp"] * cheap["dispatched_mwh"], abs=1e-6)
        assert cheap["profit_zar"] > 0.0
        assert cheap["device_hourly_breakdown"]["dev_gen_a"][0]["dispatched_mw"] == pytest.approx(1000.0, abs=1e-6)
        assert consumer["dispatched_mwh"] == pytest.approx(1000.0, abs=1e-6)

    def test_single_bid_market_flag_with_bid_count_zero_caps_actual_and_books_imbalance(self, monkeypatch):
        """Single-bid market configs with classic device bid_count must still cap actual output.

        Regression for session-312-style configs where market-level single-bid trading is enabled,
        devices still carry bid_count=0, and the engine already computes the correct commercial
        merit-order dispatch. The settlement path must use that tracked device dispatch to cap
        actual generation at physical capacity and charge balancing for the over-award.
        """
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 1,
                "forecast_horizon_hours": 1,
                "rounds": 1,
                "start_time": "08:00",
                "fake_date": "2025-06-01",
                "allow_dispatch_above_capacity": True,
            },
            "market": {
                "enable_player_bidding": True,
                "bid_count": 1,
                "base_price": 500,
                "base_volume_mwh": 0,
                "price_floor": -500,
                "price_cap": 5000,
            },
            "markets": {
                "dam": {"trading": ["on"]},
                "idm": {"trading": ["off"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_a",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 900,
                },
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 500,
                    "co2_emissions_kg_per_mwh": 900,
                },
                {
                    "id": "dev_gen_c",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 600,
                    "co2_emissions_kg_per_mwh": 900,
                },
                {
                    "id": "dev_load",
                    "type": "industrial_load",
                    "bid_count": 0,
                    "max_power_mw": 1500,
                    "willingness_to_pay": 3000,
                },
            ],
            "player_types": [
                {"id": "ptype_gen_a", "name": "Producer A", "devices": ["dev_gen_a"]},
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
                {"id": "ptype_gen_c", "name": "Producer C", "devices": ["dev_gen_c"]},
                {"id": "ptype_load", "name": "Load", "devices": ["dev_load"]},
            ],
            "events": [],
        }

        result = run_round(
            session_id=312,
            round_num=1,
            players=[11, 333, 10, 22],
            forecasts={
                11: {
                    "hours": [1085.79],
                    "devices": [{"device_id": "dev_gen_a", "hours": [1085.79]}],
                    "bids": {},
                },
                333: {
                    "hours": [939.4],
                    "devices": [{"device_id": "dev_gen_b", "hours": [939.4]}],
                    "bids": {},
                },
                10: {
                    "hours": [999.16],
                    "devices": [{"device_id": "dev_gen_c", "hours": [999.16]}],
                    "bids": {},
                },
                22: {
                    "hours": [1500.0],
                    "devices": [{"device_id": "dev_load", "hours": [1500.0]}],
                    "bids": {},
                },
            },
            config=config,
            mode="shared_market",
            seed="single-bid-capacity-overaward",
        )

        cheap = result["round_kpis"][11]
        medium = result["round_kpis"][333]
        expensive = result["round_kpis"][10]
        consumer = result["round_kpis"][22]
        cheap_device = cheap["device_hourly_breakdown"]["dev_gen_a"][0]

        assert result["volume"] == pytest.approx(1500.0, abs=1e-6)

        assert cheap["dispatched_mwh"] == pytest.approx(1085.79, abs=1e-6)
        assert cheap["planned_mwh"] == pytest.approx(1085.79, abs=1e-6)
        assert cheap["actual_mwh"] == pytest.approx(1000.0, abs=1e-6)
        assert cheap["imbalance_cost_zar"] > 0.0
        assert cheap_device["effective_capacity_mw"] == pytest.approx(1000.0, abs=1e-6)
        assert cheap_device["planned_mw"] == pytest.approx(1085.79, abs=1e-6)
        assert cheap_device["overbid_mw"] == pytest.approx(85.79, abs=1e-6)
        assert cheap_device["capacity_violation"] is True
        assert cheap_device["dispatched_mw"] == pytest.approx(1085.79, abs=1e-6)
        assert cheap_device["actual_mw"] == pytest.approx(1000.0, abs=1e-6)
        assert cheap_device["imbalance_mwh"] == pytest.approx(-85.79, abs=1e-6)
        assert cheap_device["imbalance_cost_zar"] > 0.0
        assert result["dam_bid_dispatch"][11]["dev_gen_a"]["CLASSIC"][0]["mw_dispatched"] == pytest.approx(1085.79, abs=1e-6)

        assert medium["dispatched_mwh"] == pytest.approx(414.21, abs=1e-6)
        assert medium["actual_mwh"] == pytest.approx(414.21, abs=1e-6)
        assert medium["imbalance_cost_zar"] == pytest.approx(0.0, abs=1e-6)

        assert expensive["dispatched_mwh"] == pytest.approx(0.0, abs=1e-6)
        assert expensive["actual_mwh"] == pytest.approx(0.0, abs=1e-6)

    def test_isolated_single_bid_market_flag_with_bid_count_zero_tracks_demand_limited_dispatch(self, monkeypatch):
        """Market-level single-bid configs should stay in explicit mode for isolated players too."""
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 3,
                "forecast_horizon_hours": 6,
                "rounds": 3,
                "start_time": "09:00",
                "fake_date": "2026-06-08",
                "allow_dispatch_above_capacity": True,
            },
            "market": {
                "enable_player_bidding": True,
                "bid_count": 1,
                "base_price": 1800,
                "base_volume_mwh": 2000,
                "price_floor": 0,
                "price_cap": 5000,
                "generator_mix": {
                    "pv": {"blocks": 0, "zone_distribution_pct": [100]},
                    "gas": {"blocks": 0, "zone_distribution_pct": [100]},
                    "coal": {"blocks": 0, "zone_distribution_pct": [100]},
                    "wind": {"blocks": 0, "zone_distribution_pct": [100]},
                    "hydro": {"blocks": 0, "zone_distribution_pct": [100]},
                    "nuclear": {"blocks": 0, "zone_distribution_pct": [100]},
                },
                "consumer_mix": {
                    "industrial": {
                        "blocks": 1,
                        "profile": [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1, 0.75, 0.5, 1, 1, 1, 1, 1, 1, 1, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95],
                        "seasonal_profile": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                        "price_min": 3000,
                        "price_max": 3000,
                        "zone_distribution_pct": [100],
                    },
                },
                "dam_synthetic_capacity_pct": 100,
                "idm_synthetic_capacity_pct": 0,
                "idm_price_markup_consumer_pct": 0,
                "idm_price_discount_producer_pct": 0,
            },
            "markets": {
                "dam": {"trading": ["on"]},
                "idm": {"trading": ["off"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_a",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 950,
                },
                {
                    "id": "dev_gen_b",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 500,
                    "co2_emissions_kg_per_mwh": 950,
                },
                {
                    "id": "dev_gen_c",
                    "type": "coal",
                    "bid_count": 0,
                    "enable_multi_bid": False,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 600,
                    "co2_emissions_kg_per_mwh": 950,
                },
            ],
            "player_types": [
                {"id": "ptype_gen_a", "name": "Producer A", "devices": ["dev_gen_a"]},
                {"id": "ptype_gen_b", "name": "Producer B", "devices": ["dev_gen_b"]},
                {"id": "ptype_gen_c", "name": "Producer C", "devices": ["dev_gen_c"]},
            ],
            "events": [],
        }

        result = run_round(
            session_id=313,
            round_num=1,
            players=[1],
            forecasts={
                1: {
                    "hours": [2200.0, 2200.0, 2200.0],
                    "devices": [{"device_id": "dev_gen_a", "hours": [2200.0, 2200.0, 2200.0]}],
                    "bids": None,
                },
            },
            config=config,
            mode="isolated_per_player",
            seed="single-bid-isolated-overbid",
        )

        player = result["round_kpis"][1]
        device = player["device_hourly_breakdown"]["dev_gen_a"][0]

        assert result["volume"] == pytest.approx(1500.0, abs=1e-6)
        assert player["planned_mwh"] == pytest.approx(2200.0, abs=1e-6)
        assert player["dispatched_mwh"] == pytest.approx(1500.0, abs=1e-6)
        assert player["actual_mwh"] == pytest.approx(1000.0, abs=1e-6)
        assert player["imbalance_cost_zar"] > 0.0
        assert result["dam_bid_dispatch"][1]["dev_gen_a"]["CLASSIC"][0]["mw_dispatched"] == pytest.approx(1500.0, abs=1e-6)
        assert device["planned_mw"] == pytest.approx(2200.0, abs=1e-6)
        assert device["total_offered_mw"] == pytest.approx(2200.0, abs=1e-6)
        assert device["overbid_mw"] == pytest.approx(500.0, abs=1e-6)
        assert device["capacity_violation"] is True

    def test_isolated_round2_dam_undersupply_uses_demand_price_cap(self, monkeypatch):
        """Round-2 DAM-only undersupply must clear at the unmet demand price, not the last offer."""
        monkeypatch.setattr("app.engine.random.uniform", lambda _low, _high: 0.0)

        config = {
            "general": {
                "round_span_hours": 1,
                "horizon_hours": 3,
                "forecast_horizon_hours": 6,
                "rounds": 3,
                "start_time": "08:00",
                "fake_date": "2026-06-08",
                "day_one_baseline_mode": "edit_round_1",
            },
            "market": {
                "enable_player_bidding": True,
                "bid_count": 1,
                "base_price": 1800,
                "base_volume_mwh": 2000,
                "price_floor": 0,
                "price_cap": 5000,
                "generator_mix": {
                    "pv": {"blocks": 0, "zone_distribution_pct": [100]},
                    "gas": {"blocks": 0, "zone_distribution_pct": [100]},
                    "coal": {"blocks": 0, "zone_distribution_pct": [100]},
                    "wind": {"blocks": 0, "zone_distribution_pct": [100]},
                    "hydro": {"blocks": 0, "zone_distribution_pct": [100]},
                    "nuclear": {"blocks": 0, "zone_distribution_pct": [100]},
                },
                "consumer_mix": {
                    "industrial": {
                        "blocks": 1,
                        "profile": [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1, 0.75, 0.5, 1, 1, 1, 1, 1, 1, 1, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95],
                        "seasonal_profile": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                        "price_min": 3000,
                        "price_max": 3000,
                        "zone_distribution_pct": [100],
                    },
                },
                "dam_synthetic_capacity_pct": 100,
                "idm_synthetic_capacity_pct": 0,
                "idm_price_markup_consumer_pct": 0,
                "idm_price_discount_producer_pct": 0,
            },
            "markets": {
                "dam": {"trading": ["on", "on", "on"]},
                "idm": {"trading": ["off", "off", "off"]},
            },
            "grid": {"zones": 1, "atc": [[0]]},
            "devices": [
                {
                    "id": "dev_gen_a",
                    "type": "coal",
                    "bid_count": 1,
                    "capacity_mw": 1000,
                    "max_power_mw": 1000,
                    "variable_cost_zar_per_mwh": 400,
                    "co2_emissions_kg_per_mwh": 950,
                },
            ],
            "player_types": [
                {"id": "ptype_gen_a", "name": "Producer A", "devices": ["dev_gen_a"]},
            ],
            "events": [],
        }

        result = run_round(
            session_id=319,
            round_num=2,
            players=[1],
            forecasts={
                1: {
                    "hours": [2800.0, 882.7, 0.0],
                    "devices": [{"device_id": "dev_gen_a", "hours": [882.7]}],
                    "bids": {
                        "dev_gen_a": {
                            "A": {"price": 400.0, "hours": [2800.0, 882.7, 0.0]},
                        }
                    },
                },
            },
            config=config,
            mode="isolated_per_player",
            seed="isolated-round2-dam-undersupply",
        )

        player = result["round_kpis"][1]
        device = player["device_hourly_breakdown"]["dev_gen_a"][0]

        assert result["volume"] == pytest.approx(882.7, abs=1e-6)
        assert result["smp"] == pytest.approx(3000.0, abs=1e-6)
        assert player["planned_mwh"] == pytest.approx(882.7, abs=1e-6)
        assert player["dispatched_mwh"] == pytest.approx(882.7, abs=1e-6)
        assert player["actual_mwh"] == pytest.approx(882.7, abs=1e-6)
        assert player["imbalance_cost_zar"] == pytest.approx(0.0, abs=1e-6)
        assert device["market_price_zar"] == pytest.approx(3000.0, abs=1e-6)
        assert result["dam_bid_dispatch"][1]["dev_gen_a"]["A"][0]["mw_dispatched"] == pytest.approx(882.7, abs=1e-6)


class TestPlayerForecastValidation:
    """Test player forecast validation against device constraints
    
    Note: These tests would require a Flask app context and database setup.
    Marking as integration tests that need proper test fixtures.
    """
    
    def test_forecast_validation_min_load_violation(self):
        """Forecast below min_load should be rejected"""
        # This would require Flask app context and DB
        # Placeholder for future implementation
        pass
    
    def test_forecast_validation_ramp_rate_violation(self):
        """Forecast exceeding ramp_rate should be rejected"""
        # This would require Flask app context and DB
        # Placeholder for future implementation
        pass
    
    def test_forecast_validation_success(self):
        """Valid forecast should be accepted"""
        # This would require Flask app context and DB
        # Placeholder for future implementation
        pass


class TestDeviceIntegrationWorkflow:
    """End-to-end workflow tests for device integration"""
    
    def test_complete_workflow_coal_portfolio(self):
        """Complete workflow: Coal device, forecast validation, engine curtailment"""
        # Config with Coal device
        config = {
            "general": {"round_span_hours": 6, "horizon_hours": 24, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000},
            "grid": {"zones": 2, "atc": [[0, 5000], [5000, 0]]},
            "devices": [
                {
                    "type": "COAL",
                    "max_power_mw": 500,
                    "min_load_pct": 40,  # 200 MW minimum
                    "ramp_rate_mw_per_min": 5,  # 300 MW/hour
                    "cost_zar_per_mwh": 400
                }
            ],
            "events": []
        }
        
        # Valid forecast (respects min_load and ramp_rate)
        forecast = [250] * 24  # All hours >= 200 MW
        
        # Run round
        result = run_round(
            session_id=1,
            round_num=1,
            players=[1],
            forecasts={1: forecast},
            config=config,
            mode="isolated_per_player"
        )
        
        assert result["round_kpis"][1]["planned_mwh"] == 250 * 6  # 6 hours
    
    def test_complete_workflow_mixed_portfolio(self):
        """Mixed portfolio: Nuclear (base load) + Solar (intermittent)"""
        config = {
            "general": {"round_span_hours": 6, "horizon_hours": 24, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 25000},
            "grid": {"zones": 2, "atc": [[0, 8000], [8000, 0]]},
            "devices": [
                {
                    "type": "NUCLEAR",
                    "max_power_mw": 900,
                    "min_load_pct": 90,  # 810 MW minimum (base load)
                    "ramp_rate_mw_per_min": 1,  # 60 MW/hour (slow ramp)
                    "cost_zar_per_mwh": 100
                },
                {
                    "type": "SOLAR",
                    "max_power_mw": 200,
                    "capacity_factor": 0.25  # No min_load/ramp constraints
                }
            ],
            "events": []
        }
        
        forecast_nuclear = [850] * 24  # Steady base load
        forecast_solar = [50, 100, 150, 200, 150, 100] * 4  # Variable (OK for solar)
        
        result = run_round(
            session_id=1,
            round_num=1,
            players=[1, 2],
            forecasts={
                1: forecast_nuclear,
                2: forecast_solar
            },
            config=config,
            mode="shared_market"
        )
        
        assert "smp" in result
        assert 1 in result["round_kpis"]
        assert 2 in result["round_kpis"]
    
    def test_curtailment_priority_order(self):
        """Curtailment should follow priority: Solar first, Nuclear last"""
        config = {
            "general": {"round_span_hours": 6, "horizon_hours": 24, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 10000},  # Low volume → curtailment
            "grid": {"zones": 2, "atc": [[0, 3000], [3000, 0]]},  # Low ATC → more curtailment
            "devices": [
                {"type": "SOLAR", "max_power_mw": 200},     # Priority 1 (curtail first)
                {"type": "GAS", "max_power_mw": 200},       # Priority 2
                {"type": "COAL", "max_power_mw": 500},      # Priority 3
                {"type": "NUCLEAR", "max_power_mw": 900},   # Priority 4 (curtail last)
            ],
            "events": []
        }
        
        # All devices forecast high output
        forecast = [300] * 24  # Total planned > available capacity
        
        result = run_round(
            session_id=1,
            round_num=1,
            players=[1, 2, 3, 4],
            forecasts={
                1: forecast,  # Solar
                2: forecast,  # Gas
                3: forecast,  # Coal
                4: forecast,  # Nuclear
            },
            config=config,
            mode="shared_market"
        )
        
        # All players should have curtailment costs due to capacity limits
        for player_id in [1, 2, 3, 4]:
            kpis = result["round_kpis"][player_id]
            # In shared_market, dispatch_factor < 1 → curtailment_amount > 0
            assert kpis["planned_mwh"] >= kpis["dispatched_mwh"]
