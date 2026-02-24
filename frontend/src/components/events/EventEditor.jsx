import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Stack,
  TextField,
  Select,
  MenuItem,
  Button,
  Divider,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import NumberInput from '../inputs/NumberInput';
import RangeInput from '../inputs/RangeInput';

/**
 * EventEditor - Drawer for creating/editing events with tabbed interface
 * 
 * @param {boolean} open - Drawer open state
 * @param {function} onClose - Callback () => void
 * @param {object} event - Event to edit (null for new event)
 * @param {function} onSave - Callback (eventData) => void
 * @param {array} playerTypes - Available player types for selection
 * @param {array} devices - Available devices for device type selection
 */
export default function EventEditor({ open, onClose, event, onSave, playerTypes = [], devices = [] }) {
  const [tab, setTab] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'systemic',
    trigger_type: 'round',
    trigger_value: 1,
    duration_rounds: 1,
    target: 'all',
    target_id: '',
    multiplier: 1.0,
    additive: 0,
  });

  useEffect(() => {
    if (event) {
      setFormData({ ...formData, ...event });
    } else {
      // Reset for new event
      setFormData({
        name: '',
        description: '',
        type: 'systemic',
        trigger_type: 'round',
        trigger_value: 1,
        duration_rounds: 1,
        target: 'all',
        target_id: '',
        multiplier: 1.0,
        additive: 0,
      });
    }
    setTab(0);
  }, [event, open]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 500 } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {event ? 'Edit Event' : 'New Event'}
        </Typography>
        <IconButton onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Basics" />
        <Tab label="Trigger" />
        <Tab label="Target" />
        <Tab label="Effect" />
      </Tabs>

      <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
        {tab === 0 && (
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Coal Plant Outage"
              fullWidth
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Brief explanation of this event..."
              multiline
              rows={3}
              fullWidth
            />
            <TextField
              select
              label="Type"
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              fullWidth
              helperText="Event scope and application method"
            >
              <MenuItem value="systemic">Systemic (multiplier, all players)</MenuItem>
              <MenuItem value="player">Player-specific (additive, one player)</MenuItem>
              <MenuItem value="market">Market (market rule changes)</MenuItem>
              <MenuItem value="weather">Weather (solar/wind impact)</MenuItem>
              <MenuItem value="grid">Grid (ATC/network impact)</MenuItem>
              <MenuItem value="device">Device (specific device type)</MenuItem>
              <MenuItem value="task">Task (displayed as actionable to-do item)</MenuItem>
            </TextField>
            <Box sx={{ p: 1.5, bgcolor: 'info.lighter', borderRadius: 1, border: 1, borderColor: 'info.light' }}>
              <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                Type Documentation:
              </Typography>
              <Typography variant="caption" component="div" sx={{ lineHeight: 1.6 }}>
                <strong>Systemic:</strong> Uses multiplier, affects entire market (e.g., fuel spike, demand surge)<br />
                <strong>Player:</strong> Uses additive, affects one player (e.g., plant outage)<br />
                <strong>Market:</strong> Changes market rules or parameters<br />
                <strong>Weather:</strong> Weather-related impacts on renewables<br />
                <strong>Grid:</strong> Grid congestion, ATC reduction, line trips<br />
                <strong>Device:</strong> Targets specific device types (e.g., battery degradation)<br />
                <strong>Task:</strong> Displays as actionable to-do item in player screen (e.g., "Review forecast", "Check bid strategy")
              </Typography>
            </Box>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            <TextField
              select
              label="Trigger Type"
              value={formData.trigger_type}
              onChange={(e) => handleChange('trigger_type', e.target.value)}
              fullWidth
              helperText="When should this event occur?"
            >
              <MenuItem value="round">At specific round</MenuItem>
              <MenuItem value="prob">Random probability per round</MenuItem>
            </TextField>

            {formData.trigger_type === 'round' ? (
              <NumberInput
                label="Trigger Round"
                value={formData.trigger_value}
                onChange={(val) => handleChange('trigger_value', val)}
                min={1}
                max={48}
                step={1}
                helperText="Event triggers at start of this round"
              />
            ) : (
              <RangeInput
                label="Probability per Round"
                value={(formData.trigger_value || 0) * 100}
                onChange={(val) => handleChange('trigger_value', val / 100)}
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

            <NumberInput
              label="Duration"
              value={formData.duration_rounds}
              onChange={(val) => handleChange('duration_rounds', val)}
              min={1}
              max={48}
              step={1}
              unit="rounds"
              helperText="How many rounds the event lasts once triggered"
            />
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={2}>
            <Box sx={{ p: 1.5, bgcolor: 'warning.lighter', borderRadius: 1, border: 1, borderColor: 'warning.light', mb: 2 }}>
              <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                Type vs. Target:
              </Typography>
              <Typography variant="caption" component="div" sx={{ lineHeight: 1.6 }}>
                <strong>Type</strong> defines the <em>scope</em> (systemic/player/grid/etc.) and <em>calculation method</em> (multiplier/additive).<br />
                <strong>Target</strong> defines <em>who/what</em> is affected (all/zone/player/device).<br />
                Example: Type=systemic + Target=all = market-wide fuel spike
              </Typography>
            </Box>
            <TextField
              select
              label="Target"
              value={formData.target}
              onChange={(e) => handleChange('target', e.target.value)}
              fullWidth
              helperText="Who or what does this event affect?"
            >
              <MenuItem value="all">All players/zones</MenuItem>
              <MenuItem value="zone">Specific zone</MenuItem>
              <MenuItem value="player">Specific player type</MenuItem>
              <MenuItem value="device">Specific device type</MenuItem>
            </TextField>

            {formData.target === 'zone' && (
              <NumberInput
                label="Zone Number"
                value={formData.target_id || 1}
                onChange={(val) => handleChange('target_id', val)}
                min={1}
                max={5}
                step={1}
                helperText="Which zone is affected by this event"
              />
            )}

            {formData.target === 'player' && (
              <TextField
                select
                label="Player Type"
                value={formData.target_id}
                onChange={(e) => handleChange('target_id', e.target.value)}
                fullWidth
                helperText="Which player type is affected"
              >
                {playerTypes.length > 0 ? (
                  playerTypes.map((pt, idx) => (
                    <MenuItem key={pt.id || idx} value={pt.id || `ptype_${idx}`}>
                      {pt.name || `Player Type ${idx + 1}`}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem value="" disabled>
                    No player types defined yet
                  </MenuItem>
                )}
              </TextField>
            )}

            {formData.target === 'device' && (
              <TextField
                select
                label="Device Type"
                value={formData.target_id}
                onChange={(e) => handleChange('target_id', e.target.value)}
                fullWidth
                helperText="Which device type is affected"
              >
                <MenuItem value="pv">Solar (PV)</MenuItem>
                <MenuItem value="wind">Wind</MenuItem>
                <MenuItem value="hydro">Hydro</MenuItem>
                <MenuItem value="coal">Coal</MenuItem>
                <MenuItem value="gas">Gas</MenuItem>
                <MenuItem value="nuclear">Nuclear</MenuItem>
                <MenuItem value="battery">Battery</MenuItem>
                <MenuItem value="industrial">Industrial Load</MenuItem>
                <MenuItem value="household">Household Load</MenuItem>
                <MenuItem value="agriculture">Agriculture Load</MenuItem>
              </TextField>
            )}
          </Stack>
        )}

        {tab === 3 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Define the event's impact. Multiplier is applied first, then additive.
            </Typography>

            <Divider />

            <RangeInput
              label="Multiplier"
              value={formData.multiplier * 100}
              onChange={(val) => handleChange('multiplier', val / 100)}
              min={0}
              max={200}
              step={10}
              unit="%"
              marks={[
                { value: 0, label: '0%' },
                { value: 100, label: '100%' },
                { value: 200, label: '200%' },
              ]}
            />
            <Typography variant="caption" color="text.secondary">
              Example: 120% = +20% increase, 80% = -20% decrease
            </Typography>

            <NumberInput
              label="Additive"
              value={formData.additive}
              onChange={(val) => handleChange('additive', val)}
              min={-10000}
              max={10000}
              step={100}
              helperText="Flat amount added after multiplier (can be negative)"
            />

            <Typography variant="caption" color="text.secondary">
              Units depend on target (MW for capacity, ZAR/MWh for costs, etc.)
            </Typography>
          </Stack>
        )}
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save Event
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
