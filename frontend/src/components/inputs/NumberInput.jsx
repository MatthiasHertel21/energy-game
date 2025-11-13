import React from 'react';
import { TextField, InputAdornment, IconButton } from '@mui/material';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';

/**
 * NumberInput - Standardized numeric input with stepper buttons and units
 * 
 * @param {string} label - Field label
 * @param {number} value - Current value
 * @param {function} onChange - Callback (newValue) => void
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: Infinity)
 * @param {number} step - Increment/decrement step (default: 1)
 * @param {string} unit - Unit display (e.g., 'MW', '%', 'ZAR')
 * @param {boolean} disabled - Disabled state
 * @param {string} helperText - Helper/error text
 * @param {boolean} error - Error state
 * @param {boolean} required - Required field
 */
export default function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  unit = '',
  disabled = false,
  helperText = '',
  error = false,
  required = false,
  ...props
}) {
  const handleIncrement = () => {
    const newValue = Math.min(max, (value || 0) + step);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(min, (value || 0) - step);
    onChange(newValue);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || val === '-') {
      onChange(0);
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const clamped = Math.max(min, Math.min(max, num));
      onChange(clamped);
    }
  };

  return (
    <TextField
      label={label}
      type="number"
      value={value ?? ''}
      onChange={handleChange}
      disabled={disabled}
      error={error}
      helperText={helperText || (min !== undefined && max !== Infinity ? `${min} - ${max}` : '')}
      required={required}
      fullWidth
      size="small"
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <IconButton
              size="small"
              onClick={handleDecrement}
              disabled={disabled || value <= min}
              edge="start"
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
        endAdornment: unit ? (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={handleIncrement}
              disabled={disabled || value >= max}
            >
              <AddIcon fontSize="small" />
            </IconButton>
            <span style={{ marginLeft: 8, fontSize: '0.875rem', color: 'rgba(0,0,0,0.6)' }}>
              {unit}
            </span>
          </InputAdornment>
        ) : (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={handleIncrement}
              disabled={disabled || value >= max}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
      }}
      inputProps={{
        min,
        max,
        step,
      }}
      {...props}
    />
  );
}
