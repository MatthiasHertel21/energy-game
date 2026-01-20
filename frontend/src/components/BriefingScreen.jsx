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
  Groups as PlayersIcon
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
    <>Maximize your total score across all rounds</>
  ];

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

          {/* Scoring Info */}
          <Alert severity="info" icon={<GoalIcon />}>
            <Typography variant="body2" fontWeight="bold">
              Scoring System
            </Typography>
            <Typography variant="body2">
              Your total score is calculated from:
              • Profit from <TermTooltip term="DA">day-ahead market</TermTooltip>
              • <TermTooltip term="Imbalance">Imbalance</TermTooltip> penalties (minimized)
              • Curtailment costs (minimized)
            </Typography>
          </Alert>

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
