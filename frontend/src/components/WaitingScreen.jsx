import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  LinearProgress,
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
export default function WaitingScreen({ sessionId, round, mode = 'shared_market' }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSolo = mode === 'isolated_per_player';

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

  const allSubmitted = status.total_submitted >= status.total_players;
  const progress = status.total_players > 0 
    ? (status.total_submitted / status.total_players) * 100 
    : 0;

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={3} alignItems="center">
        <WaitIcon sx={{ fontSize: 64, color: 'primary.main', opacity: 0.7 }} />
        
        <Typography variant="h5" gutterBottom>
          {allSubmitted ? 'All Players Submitted!' : 'Waiting for Other Players...'}
        </Typography>
        
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {allSubmitted 
            ? 'The round is being calculated. Results will appear shortly.'
            : 'Please wait while other players submit their forecasts.'}
        </Typography>

        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Overall Progress
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              {status.total_submitted} / {status.total_players}
            </Typography>
          </Stack>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 10, borderRadius: 1 }}
          />
        </Box>

        {status.by_type && Object.keys(status.by_type).length > 0 && (
          <TableContainer sx={{ maxWidth: 500 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Player Type</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Submitted</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Total</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(status.by_type).map(([typeId, counts]) => {
                  const typeProgress = counts.total > 0 
                    ? (counts.submitted / counts.total) * 100 
                    : 0;
                  const complete = counts.submitted >= counts.total;

                  return (
                    <TableRow key={typeId}>
                      <TableCell>{typeId}</TableCell>
                      <TableCell align="center">{counts.submitted}</TableCell>
                      <TableCell align="center">{counts.total}</TableCell>
                      <TableCell align="center">
                        {complete ? (
                          <Chip label="Complete" size="small" color="success" />
                        ) : (
                          <Chip 
                            label={`${Math.round(typeProgress)}%`} 
                            size="small" 
                            color="default"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Paper>
  );
}
