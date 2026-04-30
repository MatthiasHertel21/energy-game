"""
Unit tests for device_types module
"""
import pytest
from app.device_types import (
    DeviceType,
    DEVICE_SPECS,
    validate_device,
    get_curtailment_priority,
    validate_forecast_constraints
)


class TestDeviceSpecs:
    """Test DEVICE_SPECS structure"""
    
    def test_all_device_types_have_specs(self):
        """All DeviceType enum values should have specs"""
        for device_type in DeviceType:
            assert device_type.value in DEVICE_SPECS
    
    def test_all_specs_have_required_fields(self):
        """All specs should have defaults, required, and optional keys"""
        for device_type, spec in DEVICE_SPECS.items():
            assert 'defaults' in spec
            assert 'required_params' in spec
            assert 'optional_params' in spec
            assert isinstance(spec['defaults'], dict)
            assert isinstance(spec['required_params'], list)
            assert isinstance(spec['optional_params'], list)


class TestValidateDevice:
    """Test validate_device function"""

    @staticmethod
    def _coal_cost_tiers():
        return [
            {'from_pct': 0, 'to_pct': 60, 'cost_zar_per_mwh': 380},
            {'from_pct': 60, 'to_pct': 90, 'cost_zar_per_mwh': 440},
            {'from_pct': 90, 'to_pct': 100, 'cost_zar_per_mwh': 520},
        ]
    
    def test_valid_coal_device(self):
        """Valid Coal device should pass validation"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': self._coal_cost_tiers(),
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_valid_nuclear_device(self):
        """Valid Nuclear device (Koeberg) should pass validation"""
        device = {
            'type': 'NUCLEAR',
            'max_power_mw': 900,
            'min_load_pct': 90,
            'ramp_rate_mw_per_min': 1,
            'cost_zar_per_mwh': 100
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_valid_solar_device(self):
        """Valid Solar device should pass validation"""
        device = {
            'type': 'SOLAR',
            'max_power_mw': 200,
            'capacity_factor': 0.25
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_valid_battery_device(self):
        """Valid Battery device should pass validation"""
        device = {
            'type': 'BATTERY',
            'max_power_mw': 50,
            'capacity_mwh': 100,
            'efficiency': 0.85,
            'max_dod': 0.8,
            'degradation_per_cycle': 0.001
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_valid_industrial_load(self):
        """Valid Industrial Load should pass validation"""
        device = {
            'type': 'INDUSTRIAL_LOAD',
            'min_load_mw': 300,
            'max_load_mw': 450,
            'drm_capability': True
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_missing_type(self):
        """Device without type should fail"""
        device = {'max_power_mw': 500}
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('type' in err.lower() for err in errors)
    
    def test_invalid_type(self):
        """Device with invalid type should fail"""
        device = {'type': 'INVALID_TYPE', 'max_power_mw': 500}
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('unknown' in err.lower() or 'invalid' in err.lower() for err in errors)
    
    def test_missing_required_param(self):
        """Device missing required param should fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500
            # Missing min_load_pct, ramp_rate_mw_per_min, variable_cost_tiers
        }
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('min_load_pct' in err for err in errors)
    
    def test_out_of_range_min_load(self):
        """min_load_pct > 100 should fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 150,  # Invalid
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': self._coal_cost_tiers(),
        }
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('min_load_pct' in err for err in errors)
    
    def test_negative_max_power(self):
        """Negative max_power_mw should fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': -500,  # Invalid
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': self._coal_cost_tiers(),
        }
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('max_power_mw' in err for err in errors)
    
    def test_efficiency_out_of_range(self):
        """Battery efficiency > 1 should fail"""
        device = {
            'type': 'BATTERY',
            'max_power_mw': 50,
            'capacity_mwh': 100,
            'efficiency': 1.5,  # Invalid
            'max_dod': 0.8,
            'degradation_per_cycle': 0.001
        }
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('efficiency' in err for err in errors)
    
    def test_capacity_factor_out_of_range(self):
        """Solar capacity_factor > 1 should fail"""
        device = {
            'type': 'SOLAR',
            'max_power_mw': 200,
            'capacity_factor': 1.5  # Invalid
        }
        errors = validate_device(device)
        assert len(errors) > 0
        assert any('capacity_factor' in err for err in errors)
    
    def test_optional_params_accepted(self):
        """Optional params should be accepted"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': self._coal_cost_tiers(),
            'startup_time_hours': 8  # Optional
        }
        errors = validate_device(device)
        assert errors == []
    
    def test_unknown_param_ignored(self):
        """Unknown params should not cause validation to fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': self._coal_cost_tiers(),
            'unknown_field': 'test'  # Unknown, but ignored
        }
        errors = validate_device(device)
        # Should pass - unknown fields are ignored
        assert 'unknown_field' not in str(errors)


class TestGetCurtailmentPriority:
    """Test get_curtailment_priority function"""
    
    def test_solar_priority(self):
        """Solar should have priority 1 (curtail first)"""
        device = {'type': 'SOLAR', 'max_power_mw': 200, 'capacity_factor': 0.25}
        assert get_curtailment_priority(device) == 1
    
    def test_wind_priority(self):
        """Wind should have priority 1 (curtail first)"""
        device = {'type': 'WIND', 'max_power_mw': 150, 'capacity_factor': 0.35}
        assert get_curtailment_priority(device) == 1
    
    def test_gas_priority(self):
        """Gas should have priority 2"""
        device = {'type': 'GAS', 'max_power_mw': 200}
        assert get_curtailment_priority(device) == 2
    
    def test_hydro_priority(self):
        """Hydro should have priority 2"""
        device = {'type': 'HYDRO', 'max_power_mw': 300}
        assert get_curtailment_priority(device) == 2
    
    def test_coal_priority(self):
        """Coal should have priority 3"""
        device = {'type': 'COAL', 'max_power_mw': 500}
        assert get_curtailment_priority(device) == 3
    
    def test_nuclear_priority(self):
        """Nuclear should have priority 4 (curtail last)"""
        device = {'type': 'NUCLEAR', 'max_power_mw': 900}
        assert get_curtailment_priority(device) == 4
    
    def test_battery_priority(self):
        """Battery should have priority 2 (medium)"""
        device = {'type': 'BATTERY', 'max_power_mw': 50, 'capacity_mwh': 100}
        assert get_curtailment_priority(device) == 2
    
    def test_load_priority(self):
        """Loads should have priority 1 (curtail first)"""
        device = {'type': 'INDUSTRIAL_LOAD', 'min_load_mw': 300, 'max_load_mw': 450}
        assert get_curtailment_priority(device) == 1


class TestValidateForecastConstraints:
    """Test validate_forecast_constraints function"""
    
    def test_coal_min_load_satisfied(self):
        """Coal forecast >= min_load should pass"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,  # 40% of 500 = 200 MW
            'ramp_rate_mw_per_min': 5,
            'cost_zar_per_mwh': 400
        }
        forecast_mw = [200, 250, 300, 350, 400]  # All >= 200 MW
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_coal_min_load_violated(self):
        """Coal forecast < min_load should fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,  # 40% of 500 = 200 MW
            'ramp_rate_mw_per_min': 5,
            'cost_zar_per_mwh': 400
        }
        forecast_mw = [150, 250, 300]  # 150 < 200 MW
        errors = validate_forecast_constraints(device, forecast_mw)
        assert len(errors) > 0
        assert any('min_load' in err.lower() for err in errors)
    
    def test_nuclear_min_load_satisfied(self):
        """Nuclear at 90% min_load should pass"""
        device = {
            'type': 'NUCLEAR',
            'max_power_mw': 900,
            'min_load_pct': 90,  # 90% of 900 = 810 MW
            'ramp_rate_mw_per_min': 1,
            'cost_zar_per_mwh': 100
        }
        forecast_mw = [810, 820, 830, 840, 850]  # All >= 810 MW
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_ramp_rate_satisfied(self):
        """Forecast within ramp rate should pass"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,  # 5 MW/min = 300 MW/hour
            'cost_zar_per_mwh': 400
        }
        forecast_mw = [200, 400, 300, 500]  # Max change = 200 MW < 300 MW/hour
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_ramp_rate_violated(self):
        """Forecast exceeding ramp rate should fail"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,  # 5 MW/min = 300 MW/hour
            'cost_zar_per_mwh': 400
        }
        forecast_mw = [200, 500]  # Change = 300 MW, but at edge
        # This should pass since 300 MW = 300 MW/hour
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
        
        # Now test actual violation
        forecast_mw = [200, 600]  # Change = 400 MW > 300 MW/hour
        errors = validate_forecast_constraints(device, forecast_mw)
        assert len(errors) > 0
        assert any('ramp' in err.lower() for err in errors)
    
    def test_nuclear_slow_ramp(self):
        """Nuclear with 1 MW/min ramp should be strict"""
        device = {
            'type': 'NUCLEAR',
            'max_power_mw': 900,
            'min_load_pct': 90,
            'ramp_rate_mw_per_min': 1,  # 1 MW/min = 60 MW/hour
            'cost_zar_per_mwh': 100
        }
        forecast_mw = [810, 820, 830]  # Changes of 10 MW < 60 MW/hour
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
        
        forecast_mw = [810, 900]  # Change = 90 MW > 60 MW/hour
        errors = validate_forecast_constraints(device, forecast_mw)
        assert len(errors) > 0
    
    def test_renewable_no_constraints(self):
        """Solar/Wind should have no min_load or ramp constraints"""
        device = {
            'type': 'SOLAR',
            'max_power_mw': 200,
            'capacity_factor': 0.25
        }
        forecast_mw = [0, 100, 50, 200, 0]  # Wide variations OK
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_battery_no_constraints(self):
        """Battery should have no min_load or ramp constraints"""
        device = {
            'type': 'BATTERY',
            'max_power_mw': 50,
            'capacity_mwh': 100,
            'efficiency': 0.85
        }
        forecast_mw = [-50, 50, 0, -25, 25]  # Charge/discharge variations OK
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_empty_forecast(self):
        """Empty forecast should pass (no constraints to check)"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': TestValidateDevice._coal_cost_tiers()
        }
        forecast_mw = []
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_single_forecast_value(self):
        """Single forecast value should only check min_load"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': TestValidateDevice._coal_cost_tiers()
        }
        forecast_mw = [250]  # >= 200 MW min_load
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
        
        forecast_mw = [100]  # < 200 MW min_load
        errors = validate_forecast_constraints(device, forecast_mw)
        assert len(errors) > 0


class TestDeviceTypeIntegration:
    """Integration tests for complete device workflows"""
    
    def test_complete_coal_workflow(self):
        """Complete Coal device: validate -> get priority -> check forecast"""
        device = {
            'type': 'COAL',
            'max_power_mw': 500,
            'min_load_pct': 40,
            'ramp_rate_mw_per_min': 5,
            'variable_cost_tiers': TestValidateDevice._coal_cost_tiers()
        }
        
        # Validate device
        errors = validate_device(device)
        assert errors == []
        
        # Get curtailment priority
        priority = get_curtailment_priority(device)
        assert priority == 3  # Coal has high priority (curtail later)
        
        # Validate forecast
        forecast_mw = [250, 300, 350, 400, 450]
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_complete_nuclear_workflow(self):
        """Complete Nuclear device (Koeberg): validate -> get priority -> check forecast"""
        device = {
            'type': 'NUCLEAR',
            'max_power_mw': 900,
            'min_load_pct': 90,
            'ramp_rate_mw_per_min': 1,
            'cost_zar_per_mwh': 100
        }
        
        errors = validate_device(device)
        assert errors == []
        
        priority = get_curtailment_priority(device)
        assert priority == 4  # Nuclear has very_high priority (curtail last)
        
        # Koeberg base load: minimal variation
        forecast_mw = [850, 855, 860, 865, 870]
        errors = validate_forecast_constraints(device, forecast_mw)
        assert errors == []
    
    def test_mixed_portfolio_priorities(self):
        """Test curtailment order with mixed device portfolio"""
        solar = {'type': 'SOLAR', 'max_power_mw': 200}
        gas = {'type': 'GAS', 'max_power_mw': 200}
        coal = {'type': 'COAL', 'max_power_mw': 500}
        nuclear = {'type': 'NUCLEAR', 'max_power_mw': 900}
        
        priorities = [
            (solar, get_curtailment_priority(solar)),
            (gas, get_curtailment_priority(gas)),
            (coal, get_curtailment_priority(coal)),
            (nuclear, get_curtailment_priority(nuclear))
        ]
        
        # Sort by priority (ascending = curtail first)
        priorities.sort(key=lambda x: x[1])
        
        # Verify order: Solar -> Gas -> Coal -> Nuclear
        assert priorities[0][0]['type'] == 'SOLAR'
        assert priorities[1][0]['type'] == 'GAS'
        assert priorities[2][0]['type'] == 'COAL'
        assert priorities[3][0]['type'] == 'NUCLEAR'
