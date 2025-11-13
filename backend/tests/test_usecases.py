import pytest

from app.kse import validate_config
from app.player import _sum_series


class TestPlayerTypesValidation:
    def test_player_types_unknown_device(self):
        cfg = {
            "devices": [
                {"id": "d1", "type": "SOLAR", "max_power_mw": 100, "capacity_factor": 0.25},
                {"id": "d2", "type": "GAS", "max_power_mw": 50}
            ],
            "player_types": [
                {"id": "typeA", "name": "Solar Trader", "devices": ["d1", "dX"]},  # dX unknown
            ],
            "general": {"horizon_hours": 24, "round_span_hours": 6, "rounds": 4, "forecast_horizon_hours": 48},
        }
        errors = validate_config(cfg)
        assert any("unknown" in e.lower() and "player_types[typeA].devices" in e for e in errors)

    def test_player_types_duplicates_and_required(self):
        cfg = {
            "devices": [
                {"id": "a", "type": "COAL", "max_power_mw": 100, "min_load_pct": 40, "ramp_rate_mw_per_min": 5, "cost_zar_per_mwh": 400}
            ],
            "player_types": [
                {"id": "", "name": "NoId", "devices": ["a"]},
                {"id": "dup", "name": "One", "devices": ["a"]},
                {"id": "dup", "name": "Two", "devices": ["a"]},
                {"id": "ok", "name": "", "devices": ["a"]},
                {"id": "wrongList", "name": "X", "devices": "a"},
            ],
            "general": {"horizon_hours": 24, "round_span_hours": 6, "rounds": 4, "forecast_horizon_hours": 48},
        }
        errors = validate_config(cfg)
        # expect multiple errors collected
        assert any("player_types[].id is required" in e for e in errors)
        assert any("player_types id duplicate" in e for e in errors)
        assert any("name is required" in e for e in errors)
        assert any("devices must be a list" in e for e in errors)


class TestStorageValidation:
    def test_storage_efficiency_range(self):
        cfg = {"general": {"horizon_hours": 24, "round_span_hours": 6, "rounds": 4, "forecast_horizon_hours": 48},
               "storage": {"efficiency": 1.2}}
        errors = validate_config(cfg)
        assert any("storage.efficiency" in e for e in errors)

    def test_storage_initial_soc_range(self):
        cfg = {"general": {"horizon_hours": 24, "round_span_hours": 6, "rounds": 4, "forecast_horizon_hours": 48},
               "storage": {"initial_soc_pct": 150}}
        errors = validate_config(cfg)
        assert any("storage.initial_soc_pct" in e for e in errors)


class TestHelpers:
    def test_sum_series(self):
        assert _sum_series([1,2,3], [4,5]) == [5,7,3]
        assert _sum_series([], [1]) == [1]
        assert _sum_series(None, None) == []
