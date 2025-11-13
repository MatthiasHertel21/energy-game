import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Divider,
  Grid,
  Chip,
  CircularProgress
} from '@mui/material'
import { ArrowBack as BackIcon, PlayArrow as PlayIcon } from '@mui/icons-material'
import api from '../services/api'

export default function Briefing() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/briefing`)
        setData(data)
      } catch (error) {
        console.error('Failed to load briefing:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  if (!data) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Scenario not found</Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/home')}>Back to Home</Button>
        </Paper>
      </Container>
    )
  }

  const g = data.general || {}
  const m = data.markets || {}
  const grid = data.grid || {}

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Button startIcon={<BackIcon />} onClick={() => navigate('/home')} sx={{ mb: 2 }}>
        Back to My Scenarios
      </Button>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Scenario Briefing
        </Typography>
        <Typography variant="h5" color="primary" gutterBottom>
          {data.name}
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Objectives
          </Typography>
          <Typography variant="body1" paragraph>
            {data.objectives || 'Maximize profit while maintaining grid stability and minimizing imbalances.'}
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Session Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Total Rounds
              </Typography>
              <Typography variant="body1">
                {g.rounds || 10} rounds
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Round Duration
              </Typography>
              <Typography variant="body1">
                {g.round_span_hours || 6} hours per round
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Forecast Horizon
              </Typography>
              <Typography variant="body1">
                {g.forecast_horizon_hours || 48} hours
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Timer per Round
              </Typography>
              <Typography variant="body1">
                {Math.floor((g.round_duration_seconds || 300) / 60)} minutes
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Markets
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Price Range
              </Typography>
              <Typography variant="body1">
                {m.price_floor || 0} - {m.price_cap || 10000} ZAR/MWh
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Markets Active
              </Typography>
              <Typography variant="body1">
                DA, IDM, Balancing
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Grid Configuration
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Zones
              </Typography>
              <Typography variant="body1">
                {grid.zones || 1} zone{grid.zones > 1 ? 's' : ''}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Grid Losses
              </Typography>
              <Typography variant="body1">
                2% transmission loss
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Events
          </Typography>
          {data.events && data.events.length > 0 ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {data.events.map((e, i) => (
                <Chip
                  key={i}
                  label={e.key || e.type || `Event ${i + 1}`}
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No special events configured
            </Typography>
          )}
        </Box>

        <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={() => navigate(`/player?sessionId=${sessionId}`)}
          >
            Start Playing
          </Button>
          <Button variant="outlined" size="large" onClick={() => navigate('/home')}>
            Back to Home
          </Button>
        </Box>
      </Paper>
    </Container>
  )
}