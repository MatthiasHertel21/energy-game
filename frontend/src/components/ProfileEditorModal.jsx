import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Box,
  Slider,
  Grid,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';

const HOUR_LABELS = [
  '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
  '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'
];

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const PRESETS = {
  solar: {
    name: 'Solar (Default)',
    profile: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.4, 0.7, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.7, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  },
  wind: {
    name: 'Wind (Default)',
    profile: [0.6, 0.65, 0.7, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.4, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.85, 0.8, 0.75, 0.7],
  },
  baseload: {
    name: 'Baseload (Constant)',
    profile: Array(24).fill(1.0),
  },
  peaking: {
    name: 'Peaking (Morning/Evening)',
    profile: [0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.0, 1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8],
  },
  residential: {
    name: 'Residential (Evening Peak)',
    profile: [0.6, 0.6, 0.6, 0.6, 0.6, 0.65, 0.75, 0.85, 0.9, 0.85, 0.8, 0.75, 0.75, 0.75, 0.8, 0.85, 0.9, 1.0, 1.0, 0.95, 0.9, 0.85, 0.75, 0.7],
  },
  commercial: {
    name: 'Commercial (Daytime)',
    profile: [0.3, 0.3, 0.3, 0.3, 0.4, 0.6, 0.8, 0.95, 1.0, 1.0, 1.0, 1.0, 0.95, 0.95, 1.0, 1.0, 0.95, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.3],
  },
  industrial: {
    name: 'Industrial (Nearly Constant)',
    profile: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.98, 0.98, 0.98, 0.97, 0.96, 0.95],
  },
};

const SEASONAL_PRESETS = {
  winter_high: {
    name: 'Winter High (Heating Season)',
    profile: [1.1, 1.1, 1.05, 1.0, 0.95, 0.9, 0.9, 0.9, 0.95, 1.0, 1.05, 1.1],
  },
  summer_high: {
    name: 'Summer High (Cooling Season)',
    profile: [0.95, 0.95, 0.95, 1.0, 1.05, 1.1, 1.15, 1.15, 1.1, 1.05, 1.0, 0.95],
  },
  moderate: {
    name: 'Moderate (Spring/Fall Peak)',
    profile: [0.95, 0.95, 1.05, 1.1, 1.05, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.0],
  },
  constant: {
    name: 'Constant (No Seasonal Variation)',
    profile: Array(12).fill(1.0),
  },
};

/**
 * ProfileEditorModal - Edit 24-hour and 12-month profiles with tabs
 * 
 * @param {boolean} open - Modal open state
 * @param {function} onClose - Close callback
 * @param {string} title - Modal title (e.g., "Solar Profile")
 * @param {Array<number>} hourlyProfile - Current 24-hour profile [0-1] values
 * @param {Array<number>} seasonalProfile - Current 12-month profile values
 * @param {function} onSave - Save callback ({hourly, seasonal}) => void
 * @param {string} type - Device type for preset suggestions (solar, wind, residential, etc.)
 */
export default function ProfileEditorModal({ 
  open, 
  onClose, 
  title, 
  hourlyProfile, 
  seasonalProfile, 
  onSave, 
  type = 'baseload' 
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [localHourly, setLocalHourly] = useState(Array(24).fill(1.0));
  const [localSeasonal, setLocalSeasonal] = useState(Array(12).fill(1.0));

  useEffect(() => {
    if (open) {
      // Initialize hourly
      if (hourlyProfile && hourlyProfile.length === 24) {
        setLocalHourly([...hourlyProfile]);
      } else {
        const preset = PRESETS[type.toLowerCase()] || PRESETS.baseload;
        setLocalHourly([...preset.profile]);
      }
      // Initialize seasonal
      if (seasonalProfile && seasonalProfile.length === 12) {
        setLocalSeasonal([...seasonalProfile]);
      } else {
        setLocalSeasonal(Array(12).fill(1.0));
      }
      setActiveTab(0);
    }
  }, [open, hourlyProfile, seasonalProfile, type]);

  const handleHourlySliderChange = (index, value) => {
    const updated = [...localHourly];
    updated[index] = value;
    setLocalHourly(updated);
  };

  const handleSeasonalSliderChange = (index, value) => {
    const updated = [...localSeasonal];
    updated[index] = value;
    setLocalSeasonal(updated);
  };

  const handleHourlyPresetApply = (presetKey) => {
    setLocalHourly([...PRESETS[presetKey].profile]);
  };

  const handleSeasonalPresetApply = (presetKey) => {
    setLocalSeasonal([...SEASONAL_PRESETS[presetKey].profile]);
  };

  const handleSave = () => {
    onSave({
      hourly: localHourly,
      seasonal: localSeasonal,
    });
    onClose();
  };

  const handleResetHourly = () => {
    setLocalHourly(Array(24).fill(1.0));
  };

  const handleResetSeasonal = () => {
    setLocalSeasonal(Array(12).fill(1.0));
  };

  const isHourly = activeTab === 0;
  const currentProfile = isHourly ? localHourly : localSeasonal;
  const currentLabels = isHourly ? HOUR_LABELS : MONTH_LABELS;
  const currentPresets = isHourly ? PRESETS : SEASONAL_PRESETS;
  const maxValue = Math.max(...currentProfile, 0.1);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title || 'Edit Device Profile'}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {/* Tabs */}
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth">
            <Tab label="Hourly (24h)" />
            <Tab label="Seasonal (12m)" />
          </Tabs>

          {/* Presets */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Quick Presets:</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(currentPresets).map(([key, preset]) => (
                <Chip
                  key={key}
                  label={preset.name}
                  onClick={() => isHourly ? handleHourlyPresetApply(key) : handleSeasonalPresetApply(key)}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>
          </Box>

          {/* Visual Bar Chart */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Profile Visualization:</Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 0.5 }}>
              {currentProfile.map((value, index) => (
                <Box
                  key={index}
                  sx={{
                    flex: 1,
                    height: `${(value / maxValue) * 100}%`,
                    bgcolor: 'primary.main',
                    borderRadius: '2px 2px 0 0',
                    minHeight: 2,
                  }}
                  title={`${currentLabels[index]} - ${value.toFixed(2)}`}
                />
              ))}
            </Box>
            {isHourly && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">00:00</Typography>
                <Typography variant="caption" color="text.secondary">06:00</Typography>
                <Typography variant="caption" color="text.secondary">12:00</Typography>
                <Typography variant="caption" color="text.secondary">18:00</Typography>
                <Typography variant="caption" color="text.secondary">24:00</Typography>
              </Box>
            )}
            {!isHourly && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, px: 0.5 }}>
                {MONTH_LABELS.map((label, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {label}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>

          {/* Sliders */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {isHourly ? 'Hourly Values (0.0 - 1.0):' : 'Monthly Values (Scaling Factors):'}
            </Typography>
            <Grid container spacing={2}>
              {currentProfile.map((value, index) => (
                <Grid item xs={6} sm={4} md={isHourly ? 3 : 4} key={index}>
                  <Stack spacing={0.5}>
                    <Typography variant="caption">{currentLabels[index]}</Typography>
                    <Slider
                      value={value}
                      onChange={(_, newValue) => isHourly ? handleHourlySliderChange(index, newValue) : handleSeasonalSliderChange(index, newValue)}
                      min={isHourly ? 0 : 0.5}
                      max={isHourly ? 1 : 1.5}
                      step={0.05}
                      size="small"
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => v.toFixed(2)}
                    />
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* JSON Import/Export */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>JSON (Copy/Paste):</Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              value={JSON.stringify(currentProfile)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  const expectedLength = isHourly ? 24 : 12;
                  if (Array.isArray(parsed) && parsed.length === expectedLength) {
                    const min = isHourly ? 0 : 0;
                    const max = isHourly ? 1 : 2;
                    const validated = parsed.map(v => Math.max(min, Math.min(max, Number(v) || 0)));
                    if (isHourly) {
                      setLocalHourly(validated);
                    } else {
                      setLocalSeasonal(validated);
                    }
                  }
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={isHourly ? handleResetHourly : handleResetSeasonal} color="warning">
          Reset to 1.0
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
