import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Collapse,
  IconButton,
  Typography,
  Stack,
  Chip,
  Box,
  Tooltip,
  TextField,
  FormControlLabel,
  Switch,
  MenuItem,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  LocalFireDepartment as CoalIcon,
  Whatshot as GasIcon,
  Water as HydroIcon,
  BoltOutlined as NuclearIcon,
  WbSunny as SolarIcon,
  Air as WindIcon,
  Battery80 as BatteryIcon,
  Power as LoadIcon,
} from '@mui/icons-material';
import NumberInput from '../inputs/NumberInput';
import RangeInput from '../inputs/RangeInput';

const DEVICE_ICONS = {
  coal: CoalIcon,
  gas: GasIcon,
  hydro: HydroIcon,
  nuclear: NuclearIcon,
  solar: SolarIcon,
  wind: WindIcon,
  battery: BatteryIcon,
  load: LoadIcon,
  industrial_load: LoadIcon,
  commercial_load: LoadIcon,
  residential_load: LoadIcon,
};

const getBidCountValue = (device) => {
  if (device?.bid_count != null) {
    const normalized = Number(device.bid_count)
    return Number.isFinite(normalized) ? Math.max(0, Math.min(BID_LABELS.length, normalized)) : 0
  }
  if (device?.enable_multi_bid === true) return 3
  return 0
}

const BID_LABELS = ['A', 'B', 'C', 'D', 'E']
const DEFAULT_BID_SPLITS = [50, 20, 15, 10, 5]

const getBidLabelsForCount = (count) => BID_LABELS.slice(0, Math.max(0, Math.min(BID_LABELS.length, Number(count) || 0)))

const getAutoDefaultBidPrices = (device, count) => {
  const labels = getBidLabelsForCount(count)
  const variableCost = Number(device?.variable_cost_zar_per_mwh ?? device?.cost_per_mwh_zar ?? 0) || 0
  const deviceType = String(device?.type || '').toLowerCase()
  const multipliers = deviceType.includes('load')
    ? [1.3, 1.2, 1.1, 1.0, 0.9]
    : [0.85, 0.95, 1.1, 1.2, 1.3]
  const fallbackBase = deviceType.includes('load')
    ? [1300, 1200, 1100, 1000, 900]
    : [850, 950, 1100, 1200, 1300]
  const prices = {}

  labels.forEach((label, index) => {
    if (variableCost > 0) {
      prices[label] = Math.round(variableCost * (multipliers[index] ?? multipliers[multipliers.length - 1]))
    } else {
      prices[label] = fallbackBase[index] ?? fallbackBase[fallbackBase.length - 1]
    }
  })

  return prices
}

const buildDefaultBidConfig = (device, count, existing = {}) => {
  const labels = getBidLabelsForCount(count)
  const autoPrices = getAutoDefaultBidPrices(device, count)
  const next = {}

  labels.forEach((label, index) => {
    const current = existing?.[label] || {}
    next[label] = {
      price: Number.isFinite(Number(current.price)) ? Number(current.price) : (autoPrices[label] ?? 0),
      share_pct: Number.isFinite(Number(current.share_pct)) ? Number(current.share_pct) : (DEFAULT_BID_SPLITS[index] ?? 0),
    }
  })

  return next
}

const DEVICE_COLORS = {
  coal: '#424242',
  gas: '#ff6f00',
  hydro: '#0288d1',
  nuclear: '#7b1fa2',
  solar: '#fdd835',
  wind: '#4fc3f7',
  battery: '#66bb6a',
  load: '#ef5350',
  industrial_load: '#ef5350',
  commercial_load: '#ef5350',
  residential_load: '#ef5350',
};

const inactiveFieldSx = {
  '& .MuiInputLabel-root': {
    color: 'text.disabled',
  },
  '& .MuiInputBase-root': {
    bgcolor: 'grey.100',
    color: 'text.secondary',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'grey.300',
  },
  '& .MuiInputAdornment-root, & .MuiIconButton-root': {
    color: 'text.disabled',
  },
  '& .MuiFormHelperText-root': {
    color: 'text.disabled',
  },
};

/**
 * DeviceCard - Expandable card for device configuration
 * 
 * @param {object} device - Device data { id, type, capacity_mw, cost_per_mwh_zar, ... }
 * @param {function} onChange - Callback (updatedDevice) => void
 * @param {function} onDelete - Callback () => void
 * @param {function} onDuplicate - Callback () => void
 * @param {boolean} expanded - Controlled expansion state
 * @param {function} onExpandToggle - Callback () => void
 * @param {boolean} hasError - Show error indicator
 */
export default function DeviceCard({
  device,
  onChange,
  onDelete,
  onDuplicate,
  expanded = false,
  onExpandToggle,
  hasError = false,
}) {
  const typeKey = (device.type || '').toLowerCase();
  const isLoad = typeKey.includes('load');
  const Icon = DEVICE_ICONS[typeKey] || (isLoad ? LoadIcon : LoadIcon);
  const color = DEVICE_COLORS[typeKey] || (isLoad ? DEVICE_COLORS.load : '#757575');
  const bidCount = getBidCountValue(device)

  const handleFieldChange = (field, value) => {
    onChange({ ...device, [field]: value });
  };

  const handleBidCountChange = (value) => {
    const nextBidCount = Math.max(0, Math.min(BID_LABELS.length, Number(value) || 0))
    onChange({
      ...device,
      bid_count: nextBidCount,
      default_bids: buildDefaultBidConfig(device, nextBidCount, device.default_bids),
    })
  }

  const handleDefaultBidFieldChange = (label, field, value) => {
    const currentDefaults = buildDefaultBidConfig(device, bidCount, device.default_bids)
    onChange({
      ...device,
      default_bids: {
        ...currentDefaults,
        [label]: {
          ...currentDefaults[label],
          [field]: value,
        },
      },
    })
  }

  const configuredDefaultBids = buildDefaultBidConfig(device, bidCount, device.default_bids)

  const summary = isLoad
    ? `${device.baseline_load_mw || 0}-${device.peak_load_mw || 0} MW`
    : `${device.capacity_mw || 0} MW • ${device.cost_per_mwh_zar || 0} ZAR/MWh`;

  return (
    <Card
      variant="outlined"
      sx={{
        border: hasError ? '2px solid' : '1px solid',
        borderColor: hasError ? 'error.main' : 'divider',
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: 2,
        },
      }}
    >
      <CardHeader
        avatar={
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <Icon fontSize="small" />
          </Box>
        }
        action={
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Duplicate">
              <IconButton size="small" onClick={onDuplicate}>
                <DuplicateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={onDelete} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={expanded ? "Collapse" : "Expand"}>
              <IconButton
                size="small"
                onClick={onExpandToggle}
                sx={{
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s',
                }}
              >
                <ExpandMoreIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        }
        title={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={600}>
              {device.type?.toUpperCase() || 'Device'}
            </Typography>
            {device.id && (
              <Chip label={`ID: ${device.id}`} size="small" variant="outlined" />
            )}
            {hasError && <Chip label="Error" size="small" color="error" />}
          </Stack>
        }
        subheader={summary}
      />

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent>
          <Stack spacing={2}>
            {/* Device Name */}
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Device Name</Typography>
                <Tooltip title="Optional name for this device" arrow>
                  <Box
                    component="span"
                    sx={{
                      width: 16,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      fontSize: 12,
                      cursor: 'help',
                      userSelect: 'none',
                    }}
                  >
                    i
                  </Box>
                </Tooltip>
              </Stack>
              <TextField
                size="small"
                fullWidth
                placeholder="Enter device name"
                value={device.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </Stack>
            
            {/* Capacity / Cost or Load fields */}
            {!isLoad ? (
              <>
                <NumberInput
                  label="Capacity"
                  value={device.capacity_mw || 0}
                  onChange={(val) => handleFieldChange('capacity_mw', val)}
                  min={0}
                  max={10000}
                  step={10}
                  unit="MW"
                  tooltip="Installed generation capacity of this device in MW. Upper bound for hourly dispatch."
                />
                <NumberInput
                  label="Cost per MWh"
                  value={device.cost_per_mwh_zar || 0}
                  onChange={(val) => handleFieldChange('cost_per_mwh_zar', val)}
                  min={0}
                  max={5000}
                  step={10}
                  unit="ZAR/MWh"
                  tooltip="Variable cost for each MWh produced by this device. Used as bid price in market clearing."
                />
                <NumberInput
                  label="Fixed cost per hour"
                  value={device.fixed_cost_zar_per_hour || 0}
                  onChange={(val) => handleFieldChange('fixed_cost_zar_per_hour', val)}
                  min={0}
                  max={1000000}
                  step={10}
                  unit="ZAR/h"
                  tooltip="Fixed operating cost per hour for this device."
                />
                
                {/* CO2 Footprint */}
                <NumberInput
                  label="CO2 Footprint"
                  value={device.co2_emissions_kg_per_mwh !== undefined
                    ? device.co2_emissions_kg_per_mwh
                    : (device.co2_kg_per_mwh !== undefined ? device.co2_kg_per_mwh : (() => {
                    const type = device.type?.toLowerCase();
                    if (type === 'coal') return 950;
                    if (type === 'gas') return 450;
                    if (type === 'nuclear') return 12;
                    if (type === 'hydro') return 24;
                    if (type === 'solar' || type === 'pv') return 40;
                    if (type === 'wind') return 11;
                    return 0;
                  })())}
                  onChange={(val) => handleFieldChange('co2_emissions_kg_per_mwh', val)}
                  min={0}
                  max={2000}
                  step={10}
                  unit="kg/MWh"
                  tooltip="Carbon dioxide emissions per MWh generated. Used for environmental impact calculations."
                />
                
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Bid Count"
                  value={bidCount}
                  onChange={(e) => handleBidCountChange(Number(e.target.value))}
                  helperText="0 = implicit variable-cost offer, 1 = one explicit bid, 2-5 = multiple explicit bids."
                >
                  {[0, 1, 2, 3, 4, 5].map((count) => (
                    <MenuItem key={count} value={count}>{count}</MenuItem>
                  ))}
                </TextField>
              </>
            ) : (
              <>
                <NumberInput
                  label="Baseline Load"
                  value={device.baseline_load_mw || 0}
                  onChange={(val) => handleFieldChange('baseline_load_mw', val)}
                  min={0}
                  max={2000}
                  step={10}
                  unit="MW"
                  tooltip="Typical continuous consumption level of this load in MW during non-peak hours."
                />
                <NumberInput
                  label="Peak Load"
                  value={device.peak_load_mw || 0}
                  onChange={(val) => handleFieldChange('peak_load_mw', val)}
                  min={0}
                  max={3000}
                  step={10}
                  unit="MW"
                  helperText="UI only, no gameplay effect."
                  tooltip="Maximum expected consumption of this load in MW during peak hours. Must be ≥ baseline."
                  sx={inactiveFieldSx}
                />
                <NumberInput
                  label="Demand Response Capacity"
                  value={device.demand_response_capacity_mw || 0}
                  onChange={(val) => handleFieldChange('demand_response_capacity_mw', val)}
                  min={0}
                  max={500}
                  step={5}
                  unit="MW"
                  helperText="UI only, no gameplay effect."
                  tooltip="Maximum MW this load can reliably reduce on request (flexible demand). Must not exceed peak load."
                  sx={inactiveFieldSx}
                />
                <NumberInput
                  label="Fixed cost per hour"
                  value={device.fixed_cost_zar_per_hour || 0}
                  onChange={(val) => handleFieldChange('fixed_cost_zar_per_hour', val)}
                  min={0}
                  max={1000000}
                  step={10}
                  unit="ZAR/h"
                  tooltip="Fixed operating cost per hour for this load."
                />
                
                <NumberInput
                  label="Max Price (Willingness-to-Pay)"
                  value={device.value_of_lost_load || 1500}
                  onChange={(val) => handleFieldChange('value_of_lost_load', val)}
                  min={0}
                  max={50000}
                  step={100}
                  unit="ZAR/MWh"
                  tooltip="Maximum price this consumer is willing to pay for electricity. Consumer will NOT buy if market price exceeds this value. Used as implicit bid when multi-bid is disabled. Default: 1500 ZAR/MWh."
                />
                
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Bid Count"
                  value={bidCount}
                  onChange={(e) => handleBidCountChange(Number(e.target.value))}
                  helperText="0 = implicit willingness-to-pay bid, 1 = one explicit demand bid, 2-5 = multiple demand bids."
                >
                  {[0, 1, 2, 3, 4, 5].map((count) => (
                    <MenuItem key={count} value={count}>{count}</MenuItem>
                  ))}
                </TextField>
              </>
            )}

            {/* Type-specific fields */}
            {['solar', 'wind'].includes(device.type?.toLowerCase()) && (
              <RangeInput
                label="Capacity Factor"
                value={device.capacity_factor_pct || 50}
                onChange={(val) => handleFieldChange('capacity_factor_pct', val)}
                min={0}
                max={100}
                step={5}
                unit="%"
                marks={[
                  { value: 0, label: '0%' },
                  { value: 50, label: '50%' },
                  { value: 100, label: '100%' },
                ]}
              />
            )}

            {device.type?.toLowerCase() === 'battery' && (
              <>
                <NumberInput
                  label="Power Rating"
                  value={device.power_rating_mw || 0}
                  onChange={(val) => handleFieldChange('power_rating_mw', val)}
                  min={0}
                  max={1000}
                  step={10}
                  unit="MW"
                />
                <RangeInput
                  label="Initial State of Charge"
                  value={device.initial_soc_pct || 50}
                  onChange={(val) => handleFieldChange('initial_soc_pct', val)}
                  min={0}
                  max={100}
                  step={10}
                  unit="%"
                />
              </>
            )}


            {isLoad && device.curtailment_penalty_zar_per_mwh != null && (
              <NumberInput
                label="Curtailment Penalty"
                value={device.curtailment_penalty_zar_per_mwh}
                onChange={(val) => handleFieldChange('curtailment_penalty_zar_per_mwh', val)}
                min={0}
                max={50000}
                step={1000}
                unit="ZAR/MWh"
              />
            )}

            {bidCount > 0 && (
              <Box sx={{ mt: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Default Bid Values
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  These values are used as the initial bid prices and lot shares when a player opens this device with explicit bidding.
                </Typography>
                <Stack spacing={1.5}>
                  {getBidLabelsForCount(bidCount).map((label, index) => (
                    <Box key={label} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                      <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 700 }}>
                        Bid {label}
                      </Typography>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                        <NumberInput
                          label="Default Price"
                          value={configuredDefaultBids[label]?.price ?? 0}
                          onChange={(val) => handleDefaultBidFieldChange(label, 'price', val)}
                          min={0}
                          max={50000}
                          step={50}
                          unit="ZAR/MWh"
                          helperText={`Initial price for bid ${label}.`}
                        />
                        <NumberInput
                          label="Default Share"
                          value={configuredDefaultBids[label]?.share_pct ?? 0}
                          onChange={(val) => handleDefaultBidFieldChange(label, 'share_pct', val)}
                          min={0}
                          max={100}
                          step={1}
                          unit="%"
                          helperText={`Initial quantity share for bid ${label}.`}
                        />
                      </Stack>
                    </Box>
                  ))}
                  {(() => {
                    const shareTotal = getBidLabelsForCount(bidCount).reduce(
                      (sum, label) => sum + (configuredDefaultBids[label]?.share_pct ?? 0), 0
                    )
                    if (shareTotal === 100) return null
                    return (
                      <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 0.5 }}>
                        Summe: {shareTotal} % — wird automatisch auf 100 % normalisiert.
                      </Typography>
                    )
                  })()}
                </Stack>
              </Box>
            )}

            {/* Profile Editor */}
            {!isLoad ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Availability Profile (24h)
                  <Tooltip title="Hourly availability factor (0-1) for this generator. Default: device type preset. Solar is 0 at night, wind varies.">
                    <IconButton size="small" sx={{ ml: 0.5 }}>ℹ️</IconButton>
                  </Tooltip>
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  placeholder="[1.0, 1.0, ...] (24 values) - Leave empty for device type default"
                  value={device.availability_profile ? JSON.stringify(device.availability_profile) : ''}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : null;
                      handleFieldChange('availability_profile', parsed);
                    } catch (err) {
                      // Invalid JSON, ignore
                    }
                  }}
                />
              </Box>
            ) : (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Load Profile (24h)
                  <Tooltip title="Hourly load factor (0-1) for this consumer. Default: device type preset. Residential peaks evening, commercial peaks daytime.">
                    <IconButton size="small" sx={{ ml: 0.5 }}>ℹ️</IconButton>
                  </Tooltip>
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  placeholder="[1.0, 1.0, ...] (24 values) - Leave empty for device type default"
                  value={device.load_profile ? JSON.stringify(device.load_profile) : ''}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : null;
                      handleFieldChange('load_profile', parsed);
                    } catch (err) {
                      // Invalid JSON, ignore
                    }
                  }}
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Collapse>
    </Card>
  );
}
