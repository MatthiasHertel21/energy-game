import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Divider,
  Alert,
  Chip,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Info as InfoIcon,
  Timer as TimerIcon,
  CheckCircleOutline as CheckIcon,
  Flag as ChallengeIcon,
  AccessTime as ClockIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import api from '../services/api';
import ContextAssistantDialog from './ContextAssistantDialog';

/**
 * BriefingScreen - Scenario introduction and start screen
 * Shown at the beginning before first round
 * Player clicks "Start Scenario" button to begin
 */
export default function BriefingScreen({ session, scenario, onStart, selectedType, playerTypes, scenarioDevices, viewMode = 'start' }) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      if (viewMode !== 'review') {
        // In solo mode, player starts directly
        // In shared mode, trainer starts (but this component can still be used for display)
        await api.post(`/api/sessions/${session.id}/start-briefing`);
      }
      if (onStart) onStart();
    } catch (error) {
      console.error('Failed to start scenario:', error);
      setLoading(false);
    }
  };

  const config = scenario?.config?.general || {};
  const rounds = config.rounds || 4;
  const roundDuration = config.round_duration_seconds || 300;
  const roundSpan = config.round_span_hours || 6;
  const mode = session?.mode || 'isolated_per_player';
  const isSolo = mode === 'isolated_per_player';

  // Extract scenario description from config or use default
  const description = scenario?.description || 
    "Welcome to the energy trading simulation. Your goal is to maximize profit while maintaining grid stability.";

  const events = scenario?.config?.events || []
  const selectedPlayerType = useMemo(() => {
    if (!selectedType || !Array.isArray(playerTypes)) return null
    return playerTypes.find((type) => type.id === selectedType) || null
  }, [playerTypes, selectedType])

  const selectedPlayerDevices = useMemo(() => {
    const deviceIds = selectedPlayerType?.devices || []
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return []
    return (scenarioDevices || []).filter((device) => deviceIds.includes(device.id))
  }, [scenarioDevices, selectedPlayerType])

  const playerRole = useMemo(() => {
    if (selectedPlayerDevices.length === 0) return null
    let hasLoad = false
    let hasGen = false
    selectedPlayerDevices.forEach(d => {
      const t = (d.type || '').toLowerCase()
      if (t.includes('load') || t.endsWith('_load')) hasLoad = true
      else if (t) hasGen = true
    })
    if (hasLoad && !hasGen) return 'consumer'
    if (hasGen && !hasLoad) return 'producer'
    return null
  }, [selectedPlayerDevices])

  // Extract challenges from scenario config
  const allChallenges = scenario?.config?.challenges || []
  const challenges = useMemo(() => {
    if (!playerRole) return allChallenges
    return allChallenges.filter(ch => {
      const app = ch?.applicable_to
      if (!app) return true
      if (typeof app === 'string') return app === 'all' || app === playerRole
      if (Array.isArray(app)) return app.includes('all') || app.includes(playerRole)
      return true
    })
  }, [allChallenges, playerRole])
  
  // Metric display names
  const metricNames = {
    'total_profit': 'Total Profit',
    'round_profit': 'Round Profit',
    'total_revenue': 'Total Revenue',
    'round_revenue': 'Round Revenue',
    'total_cost': 'Total Cost',
    'round_cost': 'Round Cost',
    'total_dispatched': 'Total Dispatched Energy',
    'round_dispatched': 'Round Dispatched Energy',
    'total_curtailment': 'Total Curtailment',
    'round_curtailment': 'Round Curtailment',
    'total_curtailment_rate': 'Total Curtailment Rate',
    'round_curtailment_rate': 'Round Curtailment Rate',
    'total_procurement_cost': 'Total Procurement Cost',
    'round_procurement_cost': 'Round Procurement Cost',
    'total_demand_coverage': 'Total Demand Coverage',
    'round_demand_coverage': 'Round Demand Coverage',
    'total_imbalance': 'Total Imbalance Cost',
    'round_imbalance': 'Round Imbalance Cost'
  };

  const operatorSymbols = {
    '>=': '≥',
    '<=': '≤',
    '==': '='
  };

  const formatTarget = (metric, target) => {
    if (metric.includes('rate')) return `${target}%`;
    if (metric.includes('profit') || metric.includes('revenue') || metric.includes('cost') || metric.includes('procurement')) {
      return `${target.toLocaleString()} ZAR`;
    }
    if (metric.includes('dispatched') || metric.includes('curtailment') || metric.includes('coverage') || metric.includes('imbalance')) {
      return `${target.toLocaleString()} MWh`;
    }
    return target.toLocaleString();
  };

  // Separate required and optional challenges
  const requiredChallenges = challenges.filter(c => c.required)
  const optionalChallenges = challenges.filter(c => !c.required)
  const currentRound = session?.current_round || 1;
  const assistantContext = useMemo(() => ({
    page: 'briefing',
    session: {
      id: session?.id || null,
      mode,
      current_round: currentRound,
      view_mode: viewMode,
      is_solo: isSolo,
    },
    scenario: {
      name: scenario?.name || 'Scenario',
      description,
      general: scenario?.config?.general || {},
      events,
      challenges,
    },
    player_context: {
      selected_type_id: selectedType || null,
      selected_type: selectedPlayerType
        ? {
            id: selectedPlayerType.id,
            name: selectedPlayerType.name,
            description: selectedPlayerType.description || '',
            role: playerRole,
          }
        : null,
      devices: selectedPlayerDevices,
    },
  }), [
    challenges,
    currentRound,
    description,
    events,
    isSolo,
    mode,
    playerRole,
    scenario,
    selectedPlayerDevices,
    selectedPlayerType,
    selectedType,
    session,
    viewMode,
  ])

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Stack spacing={4}>
          {/* Compact Header */}
          <Box>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
            >
              <Box>
                <Typography variant="overline" color="text.secondary" fontWeight={600}>
                  Briefing
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="h4" fontWeight="bold">
                    {scenario?.name || 'Scenario'}
                  </Typography>
                  <Chip 
                    label={isSolo ? 'Solo Mode' : 'Shared Market'} 
                    color={isSolo ? 'default' : 'primary'}
                    size="small"
                  />
                </Stack>
              </Box>
              <ContextAssistantDialog
                title="Briefing Assistant"
                buttonLabel="Ask Briefing AI"
                placeholder="Ask about the scenario, events, or objectives..."
                intro="Ask questions about this briefing. I will answer using the current scenario, events, challenges, and your player context."
                contextLabel="Briefing page context"
                context={assistantContext}
                resetKey={`briefing:${session?.id || 'none'}:${scenario?.name || 'scenario'}`}
              />
            </Stack>
          </Box>

          {/* Mission KPI Card */}
          {requiredChallenges.length > 0 && (
            <Card variant="outlined" sx={{ bgcolor: 'primary.lighter', borderColor: 'primary.main', borderWidth: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary" fontWeight={600}>
                  Objective
                </Typography>
                {requiredChallenges.map((challenge, idx) => (
                  <Box key={idx} sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {challenge.name} (Required)
                    </Typography>
                    <Typography variant="h3" fontWeight="bold" color="primary.main">
                      {operatorSymbols[challenge.operator] || challenge.operator} {formatTarget(challenge.metric, challenge.target)}
                    </Typography>
                  </Box>
                ))}
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                  <Chip label={`Status: ${currentRound - 1}/${rounds} Rounds`} size="small" variant="outlined" />
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Short Description */}
          <Box sx={{ '& p': { margin: 0 }, '& ul, & ol': { paddingLeft: 2.5 }, '& h1,& h2,& h3,& h4': { marginTop: 1, marginBottom: 0.5 } }}>
            <Typography variant="body1" color="text.secondary" component="div">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
            </Typography>
          </Box>

          <Divider />

          {/* Compact Game Structure - 3 Fact Cards */}
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Game Structure
            </Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                  <CalendarIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {rounds}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Rounds
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                  <ClockIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {roundDuration / 60} min
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Time per Round
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                  <TimerIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {roundSpan} hrs
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Forecast Horizon
                  </Typography>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Events */}
          {events.length > 0 && (
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Events
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {events.map((event, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {event.name || 'Event'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {event.description || 'Event active'}
                    </Typography>
                    {event.trigger_value && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                        Round {event.trigger_value}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {/* Optional Challenges - Checklist */}
          {optionalChallenges.length > 0 && (
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Challenges
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {optionalChallenges.map((challenge, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <CheckIcon color="disabled" />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {challenge.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {metricNames[challenge.metric] || challenge.metric}{' '}
                          {operatorSymbols[challenge.operator] || challenge.operator}{' '}
                          {formatTarget(challenge.metric, challenge.target)}
                        </Typography>
                      </Box>
                      <Chip 
                        label={`+${challenge.points} pts`} 
                        color="success" 
                        size="small"
                        variant="outlined"
                      />
                      {challenge.per_round && (
                        <Chip label="per round" color="info" size="small" variant="outlined" />
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          <Divider />

          {/* Mode-Specific Hint */}
          <Alert severity={isSolo ? "info" : "warning"} variant="outlined">
            <Typography variant="body2">
              {isSolo
                ? 'Solo Mode: Review results and click "Next Round" to continue.'
                : 'Shared Mode: The trainer controls round timing.'}
            </Typography>
          </Alert>

          {/* CTA */}
          <Box sx={{ textAlign: 'center', pt: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<StartIcon />}
              onClick={handleStart}
              disabled={loading || (viewMode !== 'review' && !isSolo)}
              sx={{ minWidth: 240, py: 1.5, fontWeight: 600 }}
            >
              {loading ? (viewMode === 'review' ? 'Returning...' : 'Starting...') : (viewMode === 'review' ? 'Return to Session' : 'Start Scenario')}
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 1.5, color: 'text.secondary' }}>
              {viewMode === 'review'
                ? 'Return to your current round view.'
                : (isSolo ? 'The timer will start immediately after clicking "Start Scenario".' : 'Waiting for trainer to start.')}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
