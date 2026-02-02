import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Typography,
  FormControlLabel,
  Checkbox,
  Box,
  Chip
} from '@mui/material';

// Available metrics for challenges
const PRODUCER_METRICS = [
  { value: 'total_profit', label: 'Total Profit (ZAR)', cumulative: true },
  { value: 'total_revenue', label: 'Total Revenue (ZAR)', cumulative: true },
  { value: 'total_cost', label: 'Total Production Cost (ZAR)', cumulative: true },
  { value: 'total_dispatched', label: 'Total Energy Delivered (MWh)', cumulative: true },
  { value: 'total_curtailment', label: 'Total Curtailment (MWh)', cumulative: true },
  { value: 'round_profit', label: 'Round Profit (ZAR)', cumulative: false },
  { value: 'round_revenue', label: 'Round Revenue (ZAR)', cumulative: false },
  { value: 'round_cost', label: 'Round Production Cost (ZAR)', cumulative: false },
  { value: 'round_dispatched', label: 'Round Energy Delivered (MWh)', cumulative: false },
  { value: 'curtailment_rate', label: 'Curtailment Rate (%)', cumulative: false },
];

const CONSUMER_METRICS = [
  { value: 'procurement_cost', label: 'Total Procurement Cost (ZAR)', cumulative: true },
  { value: 'total_cost', label: 'Total Cost (ZAR)', cumulative: true },
  { value: 'round_cost', label: 'Round Cost (ZAR)', cumulative: false },
  { value: 'demand_coverage', label: 'Demand Coverage (%)', cumulative: false },
];

const UNIVERSAL_METRICS = [
  { value: 'total_imbalance', label: 'Total Imbalance (MWh)', cumulative: true },
  { value: 'round_imbalance', label: 'Round Imbalance (MWh)', cumulative: false },
  { value: 'avg_profit_per_round', label: 'Average Profit per Round (ZAR)', cumulative: true },
];

const OPERATORS = [
  { value: '>=', label: '≥ (Greater or Equal)' },
  { value: '<=', label: '≤ (Less or Equal)' },
  { value: '==', label: '= (Exactly)' },
];

/**
 * ChallengeEditor - Modal for creating/editing challenges
 */
export default function ChallengeEditor({ open, onClose, challenge, onSave, applicableRoles = ['producer', 'consumer'] }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    metric: 'total_profit',
    operator: '>=',
    target: 0,
    required: false,
    points: 10,
    per_round: false,
    applicable_to: ['producer', 'consumer']
  });

  const prevOpenRef = useRef(false);

  useEffect(() => {
    // Only initialize when dialog opens (transitions from false to true)
    if (open && !prevOpenRef.current) {
      if (challenge) {
        // Create a deep copy to ensure all fields are editable
        const newFormData = {
          id: challenge.id || `challenge_${Date.now()}`,
          name: challenge.name || '',
          description: challenge.description || '',
          metric: challenge.metric || 'total_profit',
          operator: challenge.operator || '>=',
          target: typeof challenge.target === 'number' ? challenge.target : 0,
          required: Boolean(challenge.required),
          points: typeof challenge.points === 'number' ? challenge.points : 10,
          per_round: Boolean(challenge.per_round),
          applicable_to: Array.isArray(challenge.applicable_to) ? [...challenge.applicable_to] : ['producer', 'consumer']
        };
        setFormData(newFormData);
      } else {
        // Reset for new challenge
        const newFormData = {
          id: `challenge_${Date.now()}`,
          name: '',
          description: '',
          metric: 'total_profit',
          operator: '>=',
          target: 0,
          required: false,
          points: 10,
          per_round: false,
          applicable_to: applicableRoles.length === 1 ? applicableRoles : ['producer', 'consumer']
        };
        setFormData(newFormData);
      }
    }
    prevOpenRef.current = open;
  }, [open, challenge, applicableRoles]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name || !formData.metric) {
      alert('Name and metric are required');
      return;
    }
    onSave(formData);
    onClose();
  };

  // Get available metrics based on applicable roles
  const availableMetrics = [
    ...UNIVERSAL_METRICS,
    ...(formData.applicable_to.includes('producer') ? PRODUCER_METRICS : []),
    ...(formData.applicable_to.includes('consumer') ? CONSUMER_METRICS : [])
  ];

  const selectedMetric = availableMetrics.find(m => m.value === formData.metric);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{challenge ? 'Edit Challenge' : 'New Challenge'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Applicable To */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Applies To:</Typography>
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.applicable_to.includes('producer')}
                    onChange={(e) => {
                      const newApplicable = e.target.checked
                        ? [...formData.applicable_to, 'producer']
                        : formData.applicable_to.filter(r => r !== 'producer');
                      handleChange('applicable_to', newApplicable.length > 0 ? newApplicable : ['producer']);
                    }}
                  />
                }
                label="Producer"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.applicable_to.includes('consumer')}
                    onChange={(e) => {
                      const newApplicable = e.target.checked
                        ? [...formData.applicable_to, 'consumer']
                        : formData.applicable_to.filter(r => r !== 'consumer');
                      handleChange('applicable_to', newApplicable.length > 0 ? newApplicable : ['consumer']);
                    }}
                  />
                }
                label="Consumer"
              />
            </Stack>
          </Box>

          <TextField
            label="Challenge Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            fullWidth
            required
            placeholder="e.g., 'Profit Goal', 'Cost Control'"
          />

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Describe what the player must achieve"
          />

          <TextField
            select
            label="Metric"
            value={formData.metric}
            onChange={(e) => handleChange('metric', e.target.value)}
            fullWidth
            required
          >
            {availableMetrics.map((metric) => (
              <MenuItem key={metric.value} value={metric.value}>
                {metric.label} {metric.cumulative ? '(Cumulative)' : '(Per Round)'}
              </MenuItem>
            ))}
          </TextField>

          {selectedMetric && selectedMetric.cumulative && (
            <Box sx={{ p: 1, bgcolor: 'info.lighter', borderRadius: 1 }}>
              <Typography variant="caption">
                ℹ️ This metric is cumulative (sums across all rounds)
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Operator"
              value={formData.operator}
              onChange={(e) => handleChange('operator', e.target.value)}
              sx={{ minWidth: 200 }}
            >
              {OPERATORS.map((op) => (
                <MenuItem key={op.value} value={op.value}>
                  {op.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              type="number"
              label="Target Value"
              value={formData.target}
              onChange={(e) => handleChange('target', Number(e.target.value))}
              fullWidth
              required
            />
          </Stack>

          <TextField
            type="number"
            label="Points"
            value={formData.points}
            onChange={(e) => handleChange('points', Number(e.target.value))}
            helperText="Points awarded when challenge is met"
            inputProps={{ min: 0 }}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.required}
                onChange={(e) => handleChange('required', e.target.checked)}
              />
            }
            label="Required (Must be fulfilled to pass scenario)"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.per_round}
                onChange={(e) => handleChange('per_round', e.target.checked)}
              />
            }
            label="Per-Round Limit (Must be met EVERY round)"
          />

          {formData.per_round && (
            <Box sx={{ p: 1, bgcolor: 'warning.lighter', borderRadius: 1 }}>
              <Typography variant="caption" color="warning.dark">
                ⚠️ Per-round challenges must be fulfilled in each round separately
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
