"""
Device Type Definitions for EMSG
Simplified MVP+ Model with 9 Device Types
"""

from enum import Enum
from typing import Dict, Any, List, Optional


class DeviceType(str, Enum):
    """Supported device types"""
    COAL = "coal"
    GAS = "gas"
    HYDRO = "hydro"
    NUCLEAR = "nuclear"
    SOLAR = "solar"
    WIND = "wind"
    BATTERY = "battery"
    INDUSTRIAL_LOAD = "industrial_load"
    COMMERCIAL_LOAD = "commercial_load"
    RESIDENTIAL_LOAD = "residential_load"


class CurtailmentPriority(str, Enum):
    """Curtailment priority levels (lower value = curtailed first)"""
    LOW = "low"  # Solar, Wind
    MEDIUM = "medium"  # Gas, Hydro
    HIGH = "high"  # Coal
    VERY_HIGH = "very_high"  # Nuclear


# Device Type Specifications with SA-typical defaults
DEVICE_SPECS = {
    DeviceType.COAL: {
        "name": "Coal Power Plant",
        "category": "generator",
        "description": "Base load coal-fired thermal plant (Medupi/Kusile-type)",
        "defaults": {
            "max_power_mw": 500.0,
            "min_load_pct": 40.0,
            "ramp_rate_mw_per_min": 5.0,
            "variable_cost_zar_per_mwh": 400.0,
            "efficiency_pct": 35.0,
            "curtailment_priority": CurtailmentPriority.HIGH,
        },
        "required_params": ["max_power_mw", "min_load_pct", "ramp_rate_mw_per_min", "variable_cost_zar_per_mwh"],
        "optional_params": ["efficiency_pct"],
    },
    DeviceType.GAS: {
        "name": "Gas Turbine (OCGT)",
        "category": "generator",
        "description": "Mid-merit/peaking gas turbine (Ankerlig/Gourikwa-type)",
        "defaults": {
            "max_power_mw": 200.0,
            "min_load_pct": 20.0,
            "ramp_rate_mw_per_min": 15.0,
            "variable_cost_zar_per_mwh": 1200.0,
            "efficiency_pct": 30.0,
            "curtailment_priority": CurtailmentPriority.MEDIUM,
        },
        "required_params": ["max_power_mw", "min_load_pct", "ramp_rate_mw_per_min", "variable_cost_zar_per_mwh"],
        "optional_params": ["efficiency_pct"],
    },
    DeviceType.HYDRO: {
        "name": "Hydro Power",
        "category": "generator",
        "description": "Flexible hydro plant with reservoir (Gariep/Vanderkloof-type)",
        "defaults": {
            "max_power_mw": 300.0,
            "min_load_pct": 10.0,
            "ramp_rate_mw_per_min": 30.0,
            "variable_cost_zar_per_mwh": 50.0,
            "efficiency_pct": 85.0,
            "reservoir_capacity_mwh": 1500.0,
            "curtailment_priority": CurtailmentPriority.MEDIUM,
        },
        "required_params": ["max_power_mw", "min_load_pct", "ramp_rate_mw_per_min"],
        "optional_params": ["variable_cost_zar_per_mwh", "efficiency_pct", "reservoir_capacity_mwh"],
    },
    DeviceType.NUCLEAR: {
        "name": "Nuclear Power Plant",
        "category": "generator",
        "description": "Base load nuclear plant (Koeberg-type), must-run",
        "defaults": {
            "max_power_mw": 900.0,
            "min_load_pct": 90.0,
            "ramp_rate_mw_per_min": 1.0,
            "variable_cost_zar_per_mwh": 100.0,
            "efficiency_pct": 33.0,
            "curtailment_priority": CurtailmentPriority.VERY_HIGH,
        },
        "required_params": ["max_power_mw", "min_load_pct", "ramp_rate_mw_per_min", "variable_cost_zar_per_mwh"],
        "optional_params": ["efficiency_pct"],
    },
    DeviceType.SOLAR: {
        "name": "Solar PV",
        "category": "renewable",
        "description": "Variable solar PV plant, must-run (curtailed first)",
        "defaults": {
            "max_power_mw": 200.0,
            "capacity_factor_pct": 25.0,
            "variable_cost_zar_per_mwh": 0.0,
            "curtailment_priority": CurtailmentPriority.LOW,
        },
        "required_params": ["max_power_mw"],
        "optional_params": ["capacity_factor_pct", "variable_cost_zar_per_mwh"],
    },
    DeviceType.WIND: {
        "name": "Wind Turbine",
        "category": "renewable",
        "description": "Variable wind plant, must-run (curtailed first)",
        "defaults": {
            "max_power_mw": 150.0,
            "capacity_factor_pct": 35.0,
            "variable_cost_zar_per_mwh": 0.0,
            "curtailment_priority": CurtailmentPriority.LOW,
        },
        "required_params": ["max_power_mw"],
        "optional_params": ["capacity_factor_pct", "variable_cost_zar_per_mwh"],
    },
    DeviceType.BATTERY: {
        "name": "Battery Storage",
        "category": "storage",
        "description": "Li-Ion battery with SoC tracking and degradation",
        "defaults": {
            "capacity_mwh": 100.0,
            "power_mw": 50.0,
            "efficiency_pct": 85.0,
            "initial_soc_pct": 50.0,
            "max_dod_pct": 80.0,
            "degradation_pct_per_cycle": 0.1,
        },
        "required_params": ["capacity_mwh", "power_mw", "efficiency_pct"],
        "optional_params": ["initial_soc_pct", "max_dod_pct", "degradation_pct_per_cycle"],
    },
    DeviceType.INDUSTRIAL_LOAD: {
        "name": "Industrial Load",
        "category": "load",
        "description": "Constant industrial consumer (mining, smelters) with DRM capability",
        "defaults": {
            "baseline_load_mw": 300.0,
            "peak_load_mw": 450.0,
            "drm_capable": True,
            "demand_response_capacity_mw": 50.0,
        },
        "required_params": ["baseline_load_mw", "peak_load_mw"],
        "optional_params": ["drm_capable", "demand_response_capacity_mw"],
    },
    DeviceType.COMMERCIAL_LOAD: {
        "name": "Commercial Load",
        "category": "load",
        "description": "Commercial consumer with daytime peak (offices)",
        "defaults": {
            "baseline_load_mw": 100.0,
            "peak_load_mw": 200.0,
            "drm_capable": False,
            "demand_response_capacity_mw": 20.0,
        },
        "required_params": ["baseline_load_mw", "peak_load_mw"],
        "optional_params": ["drm_capable", "demand_response_capacity_mw"],
    },
    DeviceType.RESIDENTIAL_LOAD: {
        "name": "Residential Load",
        "category": "load",
        "description": "Residential consumer with evening peak",
        "defaults": {
            "baseline_load_mw": 150.0,
            "peak_load_mw": 300.0,
            "drm_capable": False,
            "demand_response_capacity_mw": 10.0,
        },
        "required_params": ["baseline_load_mw", "peak_load_mw"],
        "optional_params": ["drm_capable", "demand_response_capacity_mw"],
    },
}

# Add legacy alias keys to specs for external callers/tests
for _spec in DEVICE_SPECS.values():
    if "required" not in _spec:
        _spec["required"] = list(_spec.get("required_params", []))
    if "optional" not in _spec:
        _spec["optional"] = list(_spec.get("optional_params", []))


def _normalize_device(device: Dict[str, Any]):
    """Normalize device dict and return (DeviceType or None, normalized dict).
    Accepts legacy keys and case-insensitive type strings used in tests.
    """
    d = dict(device or {})
    # Normalize type to enum (case-insensitive)
    tval = d.get("type")
    dev_type = None
    if isinstance(tval, str):
        try:
            dev_type = DeviceType(tval.strip().lower())
        except Exception:
            dev_type = None
    elif isinstance(tval, DeviceType):
        dev_type = tval

    # Alias: variable cost
    if "variable_cost_zar_per_mwh" not in d and "cost_zar_per_mwh" in d:
        d["variable_cost_zar_per_mwh"] = d.get("cost_zar_per_mwh")
    # Renewables capacity factor (fraction -> %)
    if "capacity_factor_pct" not in d and "capacity_factor" in d:
        try:
            d["capacity_factor_pct"] = float(d.get("capacity_factor")) * 100.0
        except Exception:
            pass
    # Battery aliases
    if dev_type == DeviceType.BATTERY or (isinstance(tval, str) and tval.strip().upper() == "BATTERY"):
        if "power_mw" not in d and "max_power_mw" in d:
            d["power_mw"] = d.get("max_power_mw")
        if "efficiency_pct" not in d and "efficiency" in d:
            try:
                val = float(d.get("efficiency"))
                d["efficiency_pct"] = val * 100.0 if val <= 1.0 else val
            except Exception:
                pass
        if "max_dod_pct" not in d and "max_dod" in d:
            try:
                val = float(d.get("max_dod"))
                d["max_dod_pct"] = val * 100.0 if val <= 1.0 else val
            except Exception:
                pass
        if "degradation_pct_per_cycle" not in d and "degradation_per_cycle" in d:
            try:
                val = float(d.get("degradation_per_cycle"))
                d["degradation_pct_per_cycle"] = val * 100.0 if val <= 1.0 else val
            except Exception:
                pass
    # Load aliases
    if dev_type in (DeviceType.INDUSTRIAL_LOAD, DeviceType.COMMERCIAL_LOAD, DeviceType.RESIDENTIAL_LOAD):
        if "baseline_load_mw" not in d and "min_load_mw" in d:
            d["baseline_load_mw"] = d.get("min_load_mw")
        if "peak_load_mw" not in d and "max_load_mw" in d:
            d["peak_load_mw"] = d.get("max_load_mw")
        if "drm_capable" not in d and ("drm_capability" in d or "drm_capable" in d):
            d["drm_capable"] = bool(d.get("drm_capability", d.get("drm_capable")))
    return dev_type, d


def validate_device(device: Dict[str, Any]) -> List[str]:
    """
    Validate a device configuration
    Returns list of error messages (empty if valid)
    """
    errors = []
    
    if "type" not in device:
        errors.append("Device missing 'type' field")
        return errors
    
    device_type, dnorm = _normalize_device(device)
    if not device_type or device_type not in DEVICE_SPECS:
        errors.append(f"Invalid device type: {device.get('type')}")
        return errors
    
    spec = DEVICE_SPECS[device_type]
    # Add legacy alias keys to satisfy tests that inspect specs
    if "required" not in spec:
        spec["required"] = list(spec.get("required_params", []))
    if "optional" not in spec:
        spec["optional"] = list(spec.get("optional_params", []))
    
    # Check required params
    for param in spec["required_params"]:
        if param not in dnorm:
            errors.append(f"Device {dnorm.get('id', '?')} missing required parameter: {param}")
    
    # Validate ranges
    if device_type in [DeviceType.COAL, DeviceType.GAS, DeviceType.HYDRO, DeviceType.NUCLEAR]:
        if "max_power_mw" in dnorm and dnorm["max_power_mw"] <= 0:
            errors.append(f"Device {dnorm.get('id', '?')}: max_power_mw must be > 0")
        
        if "min_load_pct" in dnorm:
            min_load = dnorm["min_load_pct"]
            if min_load < 0 or min_load > 100:
                errors.append(f"Device {dnorm.get('id', '?')}: min_load_pct must be in [0, 100]")
        
        if "ramp_rate_mw_per_min" in dnorm and dnorm["ramp_rate_mw_per_min"] < 0:
            errors.append(f"Device {dnorm.get('id', '?')}: ramp_rate_mw_per_min must be >= 0")
        
        if "efficiency_pct" in dnorm:
            eff = dnorm["efficiency_pct"]
            if eff <= 0 or eff > 100:
                errors.append(f"Device {dnorm.get('id', '?')}: efficiency_pct must be in (0, 100]")
    
    if device_type in [DeviceType.SOLAR, DeviceType.WIND]:
        if "capacity_factor_pct" in dnorm:
            cf = dnorm["capacity_factor_pct"]
            if cf < 0 or cf > 100:
                errors.append(f"Device {dnorm.get('id', '?')}: capacity_factor_pct must be in [0, 100]")
    
    if device_type == DeviceType.BATTERY:
        if "capacity_mwh" in dnorm and dnorm["capacity_mwh"] <= 0:
            errors.append(f"Device {dnorm.get('id', '?')}: capacity_mwh must be > 0")
        
        if "power_mw" in dnorm and dnorm["power_mw"] <= 0:
            errors.append(f"Device {dnorm.get('id', '?')}: power_mw must be > 0")
        
        # Legacy efficiency input in 0..1 range should be <=1
        if "efficiency" in device:
            try:
                val = float(device.get("efficiency"))
                if val > 1.0:
                    errors.append(f"Device {dnorm.get('id', '?')}: efficiency must be in (0, 1]")
            except Exception:
                pass
        
        if "efficiency_pct" in dnorm:
            eff = dnorm["efficiency_pct"]
            if eff <= 0 or eff > 100:
                errors.append(f"Device {dnorm.get('id', '?')}: efficiency_pct must be in (0, 100]")
        
        if "max_dod_pct" in dnorm:
            dod = dnorm["max_dod_pct"]
            if dod <= 0 or dod > 100:
                errors.append(f"Device {dnorm.get('id', '?')}: max_dod_pct must be in (0, 100]")
    
    if device_type in [DeviceType.INDUSTRIAL_LOAD, DeviceType.COMMERCIAL_LOAD, DeviceType.RESIDENTIAL_LOAD]:
        if "baseline_load_mw" in dnorm and dnorm["baseline_load_mw"] < 0:
            errors.append(f"Device {dnorm.get('id', '?')}: baseline_load_mw must be >= 0")
        
        if "peak_load_mw" in dnorm and dnorm["peak_load_mw"] < 0:
            errors.append(f"Device {dnorm.get('id', '?')}: peak_load_mw must be >= 0")
        
        if "baseline_load_mw" in dnorm and "peak_load_mw" in dnorm:
            if dnorm["peak_load_mw"] < dnorm["baseline_load_mw"]:
                errors.append(f"Device {dnorm.get('id', '?')}: peak_load_mw must be >= baseline_load_mw")
        
        # Demand response capacity (optional, but if set must be within [0, peak_load_mw])
        if "demand_response_capacity_mw" in dnorm:
            drc = dnorm["demand_response_capacity_mw"]
            if drc < 0:
                errors.append(f"Device {dnorm.get('id', '?')}: demand_response_capacity_mw must be >= 0")
            if "peak_load_mw" in dnorm and drc > dnorm["peak_load_mw"]:
                errors.append(f"Device {dnorm.get('id', '?')}: demand_response_capacity_mw must be <= peak_load_mw")
    
    return errors


def get_curtailment_priority(device: Dict[str, Any]) -> int:
    """
    Get curtailment priority for a device (lower = curtailed first)
    Returns: 1 (low), 2 (medium), 3 (high), 4 (very_high)
    """
    dev_type, _dn = _normalize_device(device)
    device_type = dev_type
    
    if device_type in DEVICE_SPECS:
        spec = DEVICE_SPECS[device_type]
        # Loads should be curtailed first by default
        if spec.get("category") == "load":
            return 1
        priority = spec["defaults"].get("curtailment_priority", CurtailmentPriority.MEDIUM)
        
        priority_map = {
            CurtailmentPriority.LOW: 1,
            CurtailmentPriority.MEDIUM: 2,
            CurtailmentPriority.HIGH: 3,
            CurtailmentPriority.VERY_HIGH: 4,
        }
        return priority_map.get(priority, 2)
    
    return 2  # default medium


def validate_forecast_constraints(device: Dict[str, Any], forecast_mw: List[float]) -> List[str]:
    """
    Validate forecast against device constraints (min_load, ramp_rate)
    Returns list of error messages
    """
    errors = []
    dev_type, dnorm = _normalize_device(device)
    device_type = dev_type
    
    if device_type not in [DeviceType.COAL, DeviceType.GAS, DeviceType.HYDRO, DeviceType.NUCLEAR]:
        return errors  # No constraints for renewables/storage/loads
    
    max_power = dnorm.get("max_power_mw", 0)
    min_load_pct = dnorm.get("min_load_pct", 0)
    ramp_rate = dnorm.get("ramp_rate_mw_per_min", float('inf'))
    
    min_power = (min_load_pct / 100.0) * max_power
    
    # Check min load
    for i, power in enumerate(forecast_mw):
        if power > 0 and power < min_power:
            errors.append(
                f"Device {dnorm.get('id', '?')} hour {i+1}: forecast {power:.1f} MW < min_load {min_power:.1f} MW ({min_load_pct}%)"
            )
        if power > max_power:
            errors.append(
                f"Device {dnorm.get('id', '?')} hour {i+1}: forecast {power:.1f} MW > max power {max_power:.1f} MW"
            )
    
    # Check ramp rate (assume 60 min between hours)
    for i in range(1, len(forecast_mw)):
        delta = abs(forecast_mw[i] - forecast_mw[i-1])
        max_ramp = ramp_rate * 60  # MW change per hour
        if delta > max_ramp:
            errors.append(
                f"Device {dnorm.get('id', '?')} hours {i}-{i+1}: ramp {delta:.1f} MW/h > max ramp {max_ramp:.1f} MW/h"
            )
    
    return errors
