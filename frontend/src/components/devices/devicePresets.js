/**
 * Device Presets - Default values for quick device creation
 */

let deviceIdCounter = Math.floor(Math.random() * 100000);

function nextDeviceId() {
  const t = Date.now().toString(36);
  const c = (deviceIdCounter++).toString(36);
  return `device_${t}_${c}`;
}

export const DEVICE_PRESETS = {
  coal: {
    type: 'coal',
    capacity_mw: 600,
    cost_per_mwh_zar: 400,
    fixed_cost_zar_per_hour: 0,
    efficiency_pct: 35,
    ramp_rate_mw_per_h: 120,
  },
  gas: {
    type: 'gas',
    capacity_mw: 400,
    cost_per_mwh_zar: 800,
    fixed_cost_zar_per_hour: 0,
    efficiency_pct: 50,
    ramp_rate_mw_per_h: 200,
  },
  hydro: {
    type: 'hydro',
    capacity_mw: 200,
    cost_per_mwh_zar: 100,
    fixed_cost_zar_per_hour: 0,
    efficiency_pct: 90,
    ramp_rate_mw_per_h: 180,
  },
  nuclear: {
    type: 'nuclear',
    capacity_mw: 1000,
    cost_per_mwh_zar: 250,
    fixed_cost_zar_per_hour: 0,
    efficiency_pct: 33,
    ramp_rate_mw_per_h: 20,
  },
  solar: {
    type: 'solar',
    capacity_mw: 100,
    cost_per_mwh_zar: 50,
    fixed_cost_zar_per_hour: 0,
    capacity_factor_pct: 25,
  },
  wind: {
    type: 'wind',
    capacity_mw: 150,
    cost_per_mwh_zar: 80,
    fixed_cost_zar_per_hour: 0,
    capacity_factor_pct: 35,
  },
  battery: {
    type: 'battery',
    capacity_mw: 100,
    power_rating_mw: 50,
    cost_per_mwh_zar: 0,
    fixed_cost_zar_per_hour: 0,
    efficiency_pct: 85,
    initial_soc_pct: 50,
  },
  industrial_load: {
    type: 'industrial_load',
    baseline_load_mw: 300,
    peak_load_mw: 450,
    drm_capable: true,
    fixed_cost_zar_per_hour: 0,
  },
  commercial_load: {
    type: 'commercial_load',
    baseline_load_mw: 100,
    peak_load_mw: 200,
    drm_capable: false,
    fixed_cost_zar_per_hour: 0,
  },
  residential_load: {
    type: 'residential_load',
    baseline_load_mw: 150,
    peak_load_mw: 300,
    drm_capable: false,
    fixed_cost_zar_per_hour: 0,
  },
};

/**
 * Create a new device from preset with unique ID
 * @param {string} presetName - One of: coal, gas, hydro, nuclear, solar, wind, battery, industrial_load, commercial_load, residential_load
 * @returns {object} Device object with unique ID
 */
export function createDeviceFromPreset(presetName) {
  const preset = DEVICE_PRESETS[presetName.toLowerCase()];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }
  
  return {
    ...preset,
    id: nextDeviceId(),
  };
}

/**
 * Duplicate a device with new ID
 * @param {object} device - Device to duplicate
 * @returns {object} New device with unique ID
 */
export function duplicateDevice(device) {
  const { id, ...rest } = device;
  return {
    ...rest,
    id: nextDeviceId(),
  };
}

/**
 * Get device icon color
 * @param {string} type - Device type
 * @returns {string} Hex color
 */
export function getDeviceColor(type) {
  const colors = {
    coal: '#424242',
    gas: '#ff6f00',
    hydro: '#0288d1',
    nuclear: '#7b1fa2',
    solar: '#fdd835',
    wind: '#4fc3f7',
    battery: '#66bb6a',
    load: '#ef5350',
  };
  return colors[type?.toLowerCase()] || '#757575';
}

/**
 * Validate device configuration
 * @param {object} device - Device to validate
 * @returns {string[]} Array of error messages (empty if valid)
 */
export function validateDevice(device) {
  const errors = [];
  
  if (!device.type) {
    errors.push('Device type is required');
  }
  
  if (!device.capacity_mw || device.capacity_mw <= 0) {
    errors.push('Capacity must be > 0 MW');
  }
  
  if (device.type === 'battery') {
    if (!device.power_rating_mw || device.power_rating_mw <= 0) {
      errors.push('Battery power rating must be > 0 MW');
    }
    if (device.efficiency_pct < 50 || device.efficiency_pct > 100) {
      errors.push('Battery efficiency must be 50-100%');
    }
  }
  
  if (['solar', 'wind'].includes(device.type?.toLowerCase())) {
    if (device.capacity_factor_pct < 0 || device.capacity_factor_pct > 100) {
      errors.push('Capacity factor must be 0-100%');
    }
  }
  
  return errors;
}
