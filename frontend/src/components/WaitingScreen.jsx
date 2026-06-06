import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress
} from '@mui/material';
import { HourglassEmpty as WaitIcon } from '@mui/icons-material';
import api from '../services/api';

/**
 * WaitingScreen - Shows submit status or calculating message
 * Displayed after player submits while waiting for others (shared) or during calculation (solo)
 */
export default function WaitingScreen({ sessionId, round, mode = 'shared_market', marketPhase = null }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSolo = mode === 'isolated_per_player';

  const phaseLabel = marketPhase === 'dam'
    ? 'Day-Ahead (Phase 1 of 2)'
    : marketPhase === 'idm'
      ? 'Intraday (Phase 2 of 2)'
      : null;

  useEffect(() => {
    if (!sessionId) return;

    // In solo mode, skip polling and just show calculating message
    if (isSolo) {
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/submit-status`);
        setStatus(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch submit status:', error);
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [sessionId, isSolo]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Solo mode: Show simple calculating message
  if (isSolo) {
    return (
      <Paper sx={{ p: 4 }}>
        <Stack spacing={3} alignItems="center">
          <WaitIcon sx={{ fontSize: 64, color: 'primary.main', opacity: 0.7 }} />
          
          <Typography variant="h5" gutterBottom>
            Calculating Your Results...
          </Typography>
          {phaseLabel && (
            <Chip label={`${phaseLabel} submitted`} color="primary" variant="outlined" />
          )}
          
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Please wait while your round results are being processed.
          </Typography>

          <CircularProgress sx={{ mt: 2 }} />
        </Stack>
      </Paper>
    );
  }

  if (!status) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Loading submission status...
        </Typography>
      </Paper>
    );
  }

  const players = Array.isArray(status.players) ? status.players : [];

  return (
    <Paper sx={{ p: 2 }}>
      {phaseLabel && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" color="text.secondary">Submitted phase:</Typography>
          <Chip label={phaseLabel} size="small" color="primary" variant="outlined" />
        </Stack>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Player Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Player Type</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.player_id}>
                <TableCell>{player.player_name || `Player ${player.player_id}`}</TableCell>
                <TableCell>{player.type_name || player.type_id || '—'}</TableCell>
                <TableCell align="center">
                  {player.submitted ? (
                    <Chip label="Submitted" size="small" color="success" />
                  ) : (
                    <Chip label="Pending" size="small" color="default" />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {players.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No players available.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        Please wait: The trainer will advance to the next phase.
      </Typography>
    </Paper>
  );
}
