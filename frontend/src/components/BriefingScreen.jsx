import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  EmojiEvents as GoalIcon,
  Timer as TimerIcon,
  Groups as PlayersIcon,
  Flag as ChallengeIcon
} from '@mui/icons-material';
import api from '../services/api';
import TermTooltip from './TermTooltip';

/**
 * BriefingScreen - Scenario introduction and start screen
 * Shown at the beginning before first round
 * Player clicks "Start Scenario" button to begin
 */
export default function BriefingScreen({ session, scenario, onStart }) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      // In solo mode, player starts directly
      // In shared mode, trainer starts (but this component can still be used for display)
      await api.post(`/api/sessions/${session.id}/start-briefing`);
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

  const objectives = [
    <>Submit accurate demand forecasts each round</>,
    <>Minimize <TermTooltip term="Imbalance">imbalance</TermTooltip> penalties by staying close to actual consumption</>,
    <>Reduce curtailment costs through efficient electricity usage</>,
    <>Complete all challenges to succeed</>
  ];

  // Extract challenges from scenario config
  const challenges = scenario?.config?.challenges || [];
  
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

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Stack spacing={3}>
          {/* Header */}
          <Box sx={{ textAlign: 'center' }}>
            <InfoIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h4" gutterBottom fontWeight="bold">
              {scenario?.name || 'Scenario Briefing'}
            </Typography>
            <Chip 
              label={isSolo ? 'Solo Mode' : 'Shared Market Mode'} 
              color={isSolo ? 'info' : 'success'}
              sx={{ mt: 1 }}
            />
          </Box>

          <Divider />

          {/* Scenario Description */}
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoIcon /> Overview
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              {description}
            </Typography>
          </Box>

          {/* Game Structure */}
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimerIcon /> Game Structure
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip icon={<PlayersIcon />} label={`${rounds} Rounds`} variant="outlined" />
              <Chip icon={<TimerIcon />} label={`${roundDuration / 60} min per round`} variant="outlined" />
              <Chip label={`${roundSpan} hours forecast per round`} variant="outlined" />
            </Stack>
          </Box>

          {/* Objectives */}
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GoalIcon /> Objectives
            </Typography>
            <List dense>
              {objectives.map((objective, idx) => (
                <ListItem key={idx}>
                  <ListItemIcon>
                    <CheckIcon color="success" />
                  </ListItemIcon>
                  <ListItemText primary={objective} />
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Challenges */}
          {challenges.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ChallengeIcon color="warning" /> Challenges
              </Typography>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold">
                  Complete these challenges to succeed!
                </Typography>
              </Alert>
              <Stack spacing={1}>
                {challenges.map((challenge, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      {challenge.required && (
                        <Chip label="Required" color="error" size="small" />
                      )}
                      {challenge.per_round && (
                        <Chip label="Per Round" color="info" size="small" />
                      )}
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {challenge.name}
                        </Typography>
                        {challenge.description && (
                          <Typography variant="caption" color="text.secondary">
                            {challenge.description}
                          </Typography>
                        )}
                        <Typography variant="body2" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                          {metricNames[challenge.metric] || challenge.metric}{' '}
                          {operatorSymbols[challenge.operator] || challenge.operator}{' '}
                          <strong>{formatTarget(challenge.metric, challenge.target)}</strong>
                        </Typography>
                      </Box>
                      <Chip 
                        label={`${challenge.points} pts`} 
                        color="success" 
                        variant="outlined"
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {isSolo && (
            <Alert severity="success">
              <Typography variant="body2">
                <strong>Solo Mode:</strong> Play at your own pace. 
                Click "Next Round" after viewing results to continue.
              </Typography>
            </Alert>
          )}

          {!isSolo && (
            <Alert severity="warning">
              <Typography variant="body2">
                <strong>Shared Market Mode:</strong> You are competing with other players. 
                All players must submit before advancing to the next round.
              </Typography>
            </Alert>
          )}

          <Divider />

          {/* Start Button */}
          <Box sx={{ textAlign: 'center', pt: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<StartIcon />}
              onClick={handleStart}
              disabled={loading}
              sx={{ minWidth: 200, py: 1.5 }}
            >
              {loading ? 'Starting...' : 'Start Scenario'}
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>
              The timer will start immediately after clicking "Start Scenario"
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
