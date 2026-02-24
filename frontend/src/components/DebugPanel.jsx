import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Alert,
  Chip,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Collapse,
  IconButton
} from '@mui/material'
import {
  BugReport,
  Code,
  PlayArrow,
  CheckCircle,
  Description,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material'
import api from '../services/api'

/**
 * Debug Panel v2 - Admin-only testing tools
 * 
 * Features:
 * - Generate reproducible test data with seed
 * - Validate capacity constraints
 * - Quick submit & run round
 * - Access latest debug reports
 * - Persistent debug mode toggle
 */
function DebugPanel({ 
  sessionId, 
  onTestDataGenerated, 
  onSubmitClick,
  onRunRoundClick,
  canRunRound = false,
  debugMode = false,
  onDebugModeChange
}) {
  const [expanded, setExpanded] = useState(false)
  const [preset, setPreset] = useState('balanced')
  const [seed, setSeed] = useState('')
  const [fullHorizon, setFullHorizon] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  const handleGenerateTestData = async () => {
    setLoading(true)
    setError(null)
    setStatus(null)

    try {
      const payload = {
        preset,
        full_horizon: fullHorizon
      }
      
      if (seed && seed.trim() !== '') {
        payload.seed = parseInt(seed, 10)
      }

      const { data } = await api.post(`/api/player/generate-test-data/${sessionId}`, payload)
      
      setStatus({
        type: 'success',
        message: `Generated ${data.hours_generated} hours with seed ${data.seed_used}`,
        details: data.warnings && data.warnings.length > 0 ? data.warnings : null
      })
      
      // Update seed field to show what was actually used
      setSeed(data.seed_used.toString())
      
      // Pass data back to parent for applying to forecasts
      if (onTestDataGenerated) {
        onTestDataGenerated(data)
      }

    } catch (err) {
      console.error('[DebugPanel] Generate test data failed:', err)
      setError(err?.response?.data?.error || err.message || 'Failed to generate test data')
    } finally {
      setLoading(false)
    }
  }

  const handleValidateCapacity = async () => {
    setLoading(true)
    setError(null)
    setStatus(null)

    try {
      // Get current forecast data from parent
      // For now, we'll trigger generation and immediate validation
      const genPayload = {
        preset,
        full_horizon: fullHorizon
      }
      
      if (seed && seed.trim() !== '') {
        genPayload.seed = parseInt(seed, 10)
      }

      const { data: genData } = await api.post(`/api/player/generate-test-data/${sessionId}`, genPayload)
      
      // Now validate
      const valPayload = {
        device_hours: genData.device_hours,
        device_bids: genData.device_bids
      }
      
      const { data: valData } = await api.post(`/api/player/validate-capacity/${sessionId}`, valPayload)
      
      if (valData.valid) {
        setStatus({
          type: 'success',
          message: 'All capacity constraints satisfied ✓',
          details: valData.warnings && valData.warnings.length > 0 ? 
            ['Warnings:', ...valData.warnings] : null
        })
      } else {
        setStatus({
          type: 'error',
          message: 'Capacity validation failed!',
          details: valData.errors
        })
      }

    } catch (err) {
      console.error('[DebugPanel] Validate capacity failed:', err)
      setError(err?.response?.data?.error || err.message || 'Validation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDebugReport = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data } = await api.get(`/api/player/debug-report-url/${sessionId}`)
      
      if (data.url) {
        window.open(data.url, '_blank')
        setStatus({
          type: 'info',
          message: `Opening debug report for Round ${data.round}`,
          details: null
        })
      } else {
        setStatus({
          type: 'info',
          message: data.message || 'No debug report available yet',
          details: null
        })
      }

    } catch (err) {
      console.error('[DebugPanel] Get debug report failed:', err)
      setError(err?.response?.data?.error || err.message || 'Failed to get debug report')
    } finally {
      setLoading(false)
    }
  }

  const presetDescriptions = {
    conservative: 'Safe utilization (40-70%), low price variance',
    balanced: 'Moderate utilization (50-90%), medium variance',
    aggressive: 'High utilization (70-100%), high variance'
  }

  return (
    <Card sx={{ 
      border: '2px solid #ff9800', 
      backgroundColor: 'rgba(255, 152, 0, 0.05)' 
    }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <BugReport color="warning" />
            <Typography variant="h6" color="warning.main">
              Debug Panel v2
            </Typography>
            <Chip label="Admin Only" size="small" color="warning" />
          </Stack>
          <IconButton onClick={() => setExpanded(!expanded)} size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>

        <Collapse in={expanded}>
          <Stack spacing={2} sx={{ mt: 2 }}>
            
            {/* Debug Mode Toggle */}
            <FormControlLabel
              control={
                <Checkbox 
                  checked={debugMode} 
                  onChange={(e) => onDebugModeChange && onDebugModeChange(e.target.checked)}
                  color="warning"
                />
              }
              label={<Typography variant="body2">Enable debug logging for submissions</Typography>}
            />

            {/* Test Data Generation Section */}
            <Box sx={{ 
              border: '1px solid rgba(255, 152, 0, 0.3)', 
              borderRadius: 1, 
              p: 2,
              backgroundColor: 'rgba(255, 152, 0, 0.02)'
            }}>
              <Typography variant="subtitle2" gutterBottom>
                <Code fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                Test Data Generation
              </Typography>

              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Preset</InputLabel>
                  <Select
                    value={preset}
                    label="Preset"
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    <MenuItem value="conservative">Conservative</MenuItem>
                    <MenuItem value="balanced">Balanced</MenuItem>
                    <MenuItem value="aggressive">Aggressive</MenuItem>
                  </Select>
                </FormControl>

                <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                  {presetDescriptions[preset]}
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  label="Random Seed (optional)"
                  placeholder="Auto-generated if empty"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  type="number"
                  helperText="Same seed = same data for reproducibility"
                />

                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={fullHorizon}
                      onChange={(e) => setFullHorizon(e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Full horizon (default: current round only)
                    </Typography>
                  }
                />

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="warning"
                    size="small"
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Code />}
                    onClick={handleGenerateTestData}
                    disabled={loading}
                    fullWidth
                  >
                    Generate Test Data
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}
                    onClick={handleValidateCapacity}
                    disabled={loading}
                    fullWidth
                  >
                    Validate Capacity
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* Quick Actions Section */}
            <Box sx={{ 
              border: '1px solid rgba(255, 152, 0, 0.3)', 
              borderRadius: 1, 
              p: 2,
              backgroundColor: 'rgba(255, 152, 0, 0.02)'
            }}>
              <Typography variant="subtitle2" gutterBottom>
                <PlayArrow fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                Quick Actions
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  onClick={onSubmitClick}
                  disabled={loading}
                  fullWidth
                >
                  Submit Current Round
                </Button>
                <Button
                  variant="outlined"
                  color="success"
                  size="small"
                  onClick={onRunRoundClick}
                  disabled={loading || !canRunRound}
                  fullWidth
                >
                  Run Round Now
                </Button>
                <Button
                  variant="outlined"
                  color="info"
                  size="small"
                  startIcon={<Description />}
                  onClick={handleOpenDebugReport}
                  disabled={loading}
                  fullWidth
                >
                  Debug Report
                </Button>
              </Stack>
            </Box>

            {/* Status Messages */}
            {status && (
              <Alert 
                severity={status.type} 
                onClose={() => setStatus(null)}
                sx={{ mt: 1 }}
              >
                <Typography variant="body2">{status.message}</Typography>
                {status.details && status.details.length > 0 && (
                  <Box sx={{ mt: 1, fontSize: '0.75rem' }}>
                    {status.details.map((detail, idx) => (
                      <div key={idx}>• {detail}</div>
                    ))}
                  </Box>
                )}
              </Alert>
            )}

            {error && (
              <Alert 
                severity="error" 
                onClose={() => setError(null)}
                sx={{ mt: 1 }}
              >
                {error}
              </Alert>
            )}

          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  )
}

export default DebugPanel
