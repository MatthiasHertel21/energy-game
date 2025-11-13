import React from 'react';
import { Box, Slider, TextField, Typography, Stack } from '@mui/material';

/**
 * RangeInput - Combined Slider + TextField for range values
 * 
 * @param {string} label - Field label
 * @param {number} value - Current value
 * @param {function} onChange - Callback (newValue) => void
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} step - Slider step (default: 1)
 * @param {string} unit - Unit display (e.g., '%', 'MW')
 * @param {boolean} disabled - Disabled state
 * @param {array} marks - Slider marks (e.g., [{value: 0, label: '0%'}, {value: 100, label: '100%'}])
 */
export default function RangeInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  disabled = false,
  marks = null,
  ...props
}) {
  const handleSliderChange = (event, newValue) => {
    onChange(newValue);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (val === '') {
      onChange(min);
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const clamped = Math.max(min, Math.min(max, num));
      onChange(clamped);
    }
  };

  return (
    <Box sx={{ width: '100%' }} {...props}>
      <Typography variant="caption" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <Slider
          value={value ?? min}
          onChange={handleSliderChange}
          min={min}
          max={max}
          step={step}
          marks={marks}
          disabled={disabled}
          valueLabelDisplay="auto"
          valueLabelFormat={(val) => `${val}${unit}`}
          sx={{ flex: 1 }}
        />
        <TextField
          type="number"
          value={value ?? ''}
          onChange={handleInputChange}
          disabled={disabled}
          size="small"
          sx={{ width: 100 }}
          InputProps={{
            endAdornment: unit ? (
              <span style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.6)' }}>
                {unit}
              </span>
            ) : null,
          }}
          inputProps={{
            min,
            max,
            step,
          }}
        />
      </Stack>
    </Box>
  );
}
