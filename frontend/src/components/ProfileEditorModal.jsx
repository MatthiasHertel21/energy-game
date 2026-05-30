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
 * @param {Array<number>} zonalDistribution - Current zonal distribution in percent
 * @param {{min?: number, max?: number}} priceRange - Current explicit price range
 * @param {{min?: number, max?: number}} defaultPriceRange - Default fallback price range
 * @param {number} zoneCount - Number of configured zones
 * @param {function} onSave - Save callback ({hourly, seasonal, zonal, priceMin, priceMax}) => void
 * @param {string} type - Device type for preset suggestions (solar, wind, residential, etc.)
 * @param {string} kind - Mix kind (generator or consumer)
 */
export default function ProfileEditorModal({ 
  open, 
  onClose, 
  title, 
  hourlyProfile, 
  seasonalProfile, 
  zonalDistribution,
  priceRange,
  defaultPriceRange,
  zoneCount = 1,
  onSave, 
  type = 'baseload',
  kind = 'generator',
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [localHourly, setLocalHourly] = useState(Array(24).fill(1.0));
  const [localSeasonal, setLocalSeasonal] = useState(Array(12).fill(1.0));
  const [localZonal, setLocalZonal] = useState([100]);
  const [localPriceMin, setLocalPriceMin] = useState(0);
  const [localPriceMax, setLocalPriceMax] = useState(0);

  const buildEqualDistribution = (count) => {
    const safeCount = Math.max(1, Number(count) || 1);
    const base = Math.floor((100 / safeCount) * 1000) / 1000;
    const values = Array.from({ length: safeCount }, () => base);
    const total = values.reduce((sum, value) => sum + value, 0);
    values[safeCount - 1] = Math.round((values[safeCount - 1] + (100 - total)) * 1000) / 1000;
    return values;
  };

  const normalizeDistribution = (values, count) => {
    const safeCount = Math.max(1, Number(count) || 1);
    if (Array.isArray(values) && values.length === safeCount) {
      return values.map((value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
      });
    }
    return buildEqualDistribution(safeCount);
  };

  const getNumericOrFallback = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  useEffect(() => {
    if (open) {
      const fallbackMin = getNumericOrFallback(defaultPriceRange?.min, 0);
      const fallbackMax = getNumericOrFallback(defaultPriceRange?.max, fallbackMin);
      const resolvedMin = getNumericOrFallback(priceRange?.min, fallbackMin);
      const resolvedMax = getNumericOrFallback(priceRange?.max, fallbackMax);

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
      setLocalZonal(normalizeDistribution(zonalDistribution, zoneCount));
      setLocalPriceMin(resolvedMin);
      setLocalPriceMax(Math.max(resolvedMin, resolvedMax));
      setActiveTab(0);
    }
  }, [open, hourlyProfile, seasonalProfile, zonalDistribution, priceRange, defaultPriceRange, zoneCount, type]);

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

  const handleZonalChange = (index, value) => {
    const updated = [...localZonal];
    updated[index] = Math.max(0, Number(value) || 0);
    setLocalZonal(updated);
  };

  const handleZonalEqualize = () => {
    setLocalZonal(buildEqualDistribution(zoneCount));
  };

  const handleZonalHeavyPreset = (targetIndex) => {
    const count = Math.max(1, Number(zoneCount) || 1);
    if (count === 1) {
      setLocalZonal([100]);
      return;
    }
    const majorShare = 60;
    const remainingShare = 40;
    const otherCount = count - 1;
    const baseOther = Math.floor((remainingShare / otherCount) * 1000) / 1000;
    const values = Array.from({ length: count }, () => baseOther);
    values[targetIndex] = majorShare;
    const total = values.reduce((sum, value) => sum + value, 0);
    const adjustIndex = targetIndex === count - 1 ? 0 : count - 1;
    values[adjustIndex] = Math.round((values[adjustIndex] + (100 - total)) * 1000) / 1000;
    setLocalZonal(values);
  };

  const handleZonalNormalize = () => {
    const total = localZonal.reduce((sum, value) => sum + Number(value || 0), 0);
    if (total <= 0) {
      setLocalZonal(buildEqualDistribution(zoneCount));
      return;
    }
    const normalized = localZonal.map((value) => (Number(value || 0) / total) * 100);
    const rounded = normalized.map((value) => Math.round(value * 1000) / 1000);
    const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
    rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + (100 - roundedTotal)) * 1000) / 1000;
    setLocalZonal(rounded);
  };

  const handleResetPriceRange = () => {
    const fallbackMin = getNumericOrFallback(defaultPriceRange?.min, 0);
    const fallbackMax = getNumericOrFallback(defaultPriceRange?.max, fallbackMin);
    setLocalPriceMin(fallbackMin);
    setLocalPriceMax(Math.max(fallbackMin, fallbackMax));
  };

  const handleSave = () => {
    onSave({
      hourly: localHourly,
      seasonal: localSeasonal,
      zonal: localZonal,
      priceMin: Number(localPriceMin),
      priceMax: Number(localPriceMax),
    });
    onClose();
  };

  const handleResetHourly = () => {
    setLocalHourly(Array(24).fill(1.0));
  };

  const handleResetSeasonal = () => {
    setLocalSeasonal(Array(12).fill(1.0));
  };

  const handleResetZonal = () => {
    setLocalZonal(buildEqualDistribution(zoneCount));
  };

  const isHourly = activeTab === 0;
  const isSeasonal = activeTab === 1;
  const isZonal = activeTab === 2;
  const isPriceRange = activeTab === 3;
  const currentProfile = isHourly ? localHourly : localSeasonal;
  const currentLabels = isHourly ? HOUR_LABELS : MONTH_LABELS;
  const currentPresets = isHourly ? PRESETS : SEASONAL_PRESETS;
  const maxValue = Math.max(...currentProfile, 0.1);
  const zonalSum = localZonal.reduce((sum, value) => sum + Number(value || 0), 0);
  const zonalSumRounded = Math.round(zonalSum * 1000) / 1000;
  const zonalValid = Math.abs(zonalSumRounded - 100) <= 0.001;
  const priceRangeValid = Number.isFinite(Number(localPriceMin)) && Number.isFinite(Number(localPriceMax)) && Number(localPriceMin) <= Number(localPriceMax);
  const priceRangeLabel = kind === 'consumer' ? 'Willingness to pay' : 'Offer price';
  const defaultPriceMin = getNumericOrFallback(defaultPriceRange?.min, 0);
  const defaultPriceMax = getNumericOrFallback(defaultPriceRange?.max, defaultPriceMin);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title || 'Edit Device Profile'}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {/* Tabs */}
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth">
            <Tab label="Hourly (24h)" />
            <Tab label="Seasonal (12m)" />
            <Tab label="Zonal Distribution" />
            <Tab label="Price Range" />
          </Tabs>

          {!isZonal && !isPriceRange && (
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
          )}

          {isZonal && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>Zonal Distribution:</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Set the physical location split across the configured network zones for this generator or consumer type. The values must sum to 100%.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label="Equal Split" onClick={handleZonalEqualize} size="small" color="primary" variant="outlined" />
                <Chip label="Normalize To 100%" onClick={handleZonalNormalize} size="small" color="primary" variant="outlined" />
                {Array.from({ length: Math.max(1, Number(zoneCount) || 1) }, (_, index) => (
                  <Chip
                    key={`zone-heavy-${index + 1}`}
                    label={`Zone ${index + 1} Heavy`}
                    onClick={() => handleZonalHeavyPreset(index)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))}
                <Chip label={`Current Sum: ${zonalSumRounded}%`} size="small" color={zonalValid ? 'success' : 'warning'} variant="filled" />
              </Stack>
            </Box>
          )}

          {isPriceRange && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>{priceRangeLabel} Range:</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Synthetic {kind === 'consumer' ? 'consumers' : 'producers'} draw random prices from this range. If no explicit values were stored before, this dialog starts from the legacy defaults.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                <Chip
                  label={`Default: ${defaultPriceMin.toFixed(0)} to ${defaultPriceMax.toFixed(0)}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={handleResetPriceRange}
                />
                <Chip
                  label={priceRangeValid ? 'Range valid' : 'Min must be <= max'}
                  size="small"
                  color={priceRangeValid ? 'success' : 'warning'}
                  variant="filled"
                />
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label={`Minimum ${priceRangeLabel}`}
                    value={localPriceMin}
                    onChange={(e) => setLocalPriceMin(e.target.value)}
                    error={!priceRangeValid}
                    helperText={kind === 'consumer' ? 'Lower WTP bound for synthetic consumers' : 'Lower offer-price bound for synthetic producers'}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label={`Maximum ${priceRangeLabel}`}
                    value={localPriceMax}
                    onChange={(e) => setLocalPriceMax(e.target.value)}
                    error={!priceRangeValid}
                    helperText={kind === 'consumer' ? 'Upper WTP bound for synthetic consumers' : 'Upper offer-price bound for synthetic producers'}
                  />
                </Grid>
              </Grid>
            </Box>
          )}

          {!isZonal && !isPriceRange && (
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
              {isSeasonal && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, px: 0.5 }}>
                  {MONTH_LABELS.map((label, i) => (
                    <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      {label}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {!isZonal && !isPriceRange && (
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
          )}

          {isZonal && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>Zonal Values (%):</Typography>
              <Grid container spacing={2}>
                {localZonal.map((value, index) => (
                  <Grid item xs={12} sm={6} md={4} key={`zone-${index + 1}`}>
                    <Stack spacing={1}>
                      <Typography variant="caption">Zone {index + 1}</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={value}
                        onChange={(e) => handleZonalChange(index, e.target.value)}
                        inputProps={{ min: 0, max: 100, step: 0.1 }}
                        helperText="Percentage share in this zone"
                      />
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>JSON (Copy/Paste):</Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              value={JSON.stringify(isPriceRange ? { min: Number(localPriceMin), max: Number(localPriceMax) } : isZonal ? localZonal : currentProfile)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  const expectedLength = isHourly ? 24 : isSeasonal ? 12 : Math.max(1, Number(zoneCount) || 1);
                  if (isPriceRange && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const parsedMin = Number(parsed.min);
                    const parsedMax = Number(parsed.max);
                    if (Number.isFinite(parsedMin) && Number.isFinite(parsedMax)) {
                      setLocalPriceMin(parsedMin);
                      setLocalPriceMax(parsedMax);
                    }
                  } else if (Array.isArray(parsed) && parsed.length === expectedLength) {
                    if (isHourly) {
                      const validated = parsed.map(v => Math.max(0, Math.min(1, Number(v) || 0)));
                      setLocalHourly(validated);
                    } else if (isSeasonal) {
                      const validated = parsed.map(v => Math.max(0, Math.min(2, Number(v) || 0)));
                      setLocalSeasonal(validated);
                    } else {
                      const validated = parsed.map(v => Math.max(0, Number(v) || 0));
                      setLocalZonal(validated);
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
        <Button onClick={isHourly ? handleResetHourly : isSeasonal ? handleResetSeasonal : isZonal ? handleResetZonal : handleResetPriceRange} color="warning">
          {isZonal ? 'Reset To Equal Split' : isPriceRange ? 'Reset to defaults' : 'Reset to 1.0'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={(isZonal && !zonalValid) || (isPriceRange && !priceRangeValid)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
