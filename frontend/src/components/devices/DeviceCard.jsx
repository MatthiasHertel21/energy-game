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

  const handleFieldChange = (field, value) => {
    onChange({ ...device, [field]: value });
  };

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
                />
                <NumberInput
                  label="Cost per MWh"
                  value={device.cost_per_mwh_zar || 0}
                  onChange={(val) => handleFieldChange('cost_per_mwh_zar', val)}
                  min={0}
                  max={5000}
                  step={10}
                  unit="ZAR/MWh"
                />
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
                />
                <NumberInput
                  label="Peak Load"
                  value={device.peak_load_mw || 0}
                  onChange={(val) => handleFieldChange('peak_load_mw', val)}
                  min={0}
                  max={3000}
                  step={10}
                  unit="MW"
                />
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
                  label="Efficiency"
                  value={device.efficiency_pct || 90}
                  onChange={(val) => handleFieldChange('efficiency_pct', val)}
                  min={50}
                  max={100}
                  step={5}
                  unit="%"
                  marks={[
                    { value: 50, label: '50%' },
                    { value: 75, label: '75%' },
                    { value: 100, label: '100%' },
                  ]}
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

            {['coal', 'gas', 'nuclear', 'hydro'].includes(device.type?.toLowerCase()) && (
              <RangeInput
                label="Efficiency"
                value={device.efficiency_pct || 80}
                onChange={(val) => handleFieldChange('efficiency_pct', val)}
                min={20}
                max={100}
                step={5}
                unit="%"
              />
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
          </Stack>
        </CardContent>
      </Collapse>
    </Card>
  );
}
