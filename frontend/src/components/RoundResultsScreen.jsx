import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  TrendingUp as ProfitIcon,
  Warning as WarningIcon,
  Bolt as EnergyIcon,
  NavigateNext as NextIcon
} from '@mui/icons-material';
import api from '../services/api';

/**
 * RoundResultsScreen - Shows individual KPIs, ranking (shared), and active events
 * Displayed after round calculation completes
 */
export default function RoundResultsScreen({ sessionId, round, mode = 'shared_market', onAdvance }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [readyCount, setReadyCount] = useState(null);

  const isSolo = mode === 'isolated_per_player';
  const formatNumber = (value, fractionDigits = 2) => Number(value ?? 0).toLocaleString('en-ZA', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
  const formatCurrency = (value) => `ZAR ${formatNumber(value)}`;

  useEffect(() => {
    if (!sessionId || !round) return;

    const fetchResults = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/round-results/${round}`);
        setResults(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch round results:', error);
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId, round]);

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const { data } = await api.post(`/api/sessions/${sessionId}/advance-round`);
      setReadyCount(data);
      
      // If all ready, parent will handle transition
      if (data.ready_count >= data.total_players) {
        if (onAdvance) onAdvance();
      }
    } catch (error) {
      console.error('Failed to signal readiness:', error);
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!results) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No results available
        </Typography>
      </Paper>
    );
  }

  const { my_result, ranking, active_events } = results;
  const myRank = ranking.findIndex(r => r.player_id === my_result.player_id) + 1;

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={4}>
        {/* Header */}
        <Box textAlign="center">
          <Typography variant="h4" gutterBottom>
            Round {round} Results
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review your performance and ranking
          </Typography>
        </Box>

        {/* My Performance KPIs */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrophyIcon color="primary" />
            Your Performance
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Profit</Typography>
                  <Typography variant="h5" color="success.main">
                    {formatCurrency(my_result.profit)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Imbalance</Typography>
                  <Typography variant="h5" color={Math.abs(my_result.imbalance) > 1 ? 'error.main' : 'text.primary'}>
                    {formatNumber(my_result.imbalance)} MWh
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Curtailment</Typography>
                  <Typography variant="h5" color={Math.abs(my_result.curtailment) > 1 ? 'warning.main' : 'text.primary'}>
                    {formatNumber(my_result.curtailment)} MWh
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Total Score</Typography>
                  <Typography variant="h5" color="primary.main">
                    {my_result.total_score.toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Ranking Table - Only show in shared mode */}
        {!isSolo && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEvents color="warning" />
              Leaderboard
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Rank</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Player</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Profit (ZAR)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Imbalance (MWh)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Curtailment (MWh)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Total Score</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ranking.map((player, index) => {
                    const isMe = player.player_id === my_result.player_id;
                    return (
                      <TableRow 
                        key={player.player_id}
                        sx={{ 
                          bgcolor: isMe ? 'action.selected' : 'inherit',
                          fontWeight: isMe ? 600 : 400
                        }}
                      >
                        <TableCell>
                          {index === 0 && <TrophyIcon sx={{ fontSize: 20, color: 'gold', verticalAlign: 'middle', mr: 0.5 }} />}
                          {index === 1 && <TrophyIcon sx={{ fontSize: 20, color: 'silver', verticalAlign: 'middle', mr: 0.5 }} />}
                          {index === 2 && <TrophyIcon sx={{ fontSize: 20, color: '#cd7f32', verticalAlign: 'middle', mr: 0.5 }} />}
                          #{index + 1}
                        </TableCell>
                        <TableCell>
                          {player.email}
                          {isMe && <Chip label="You" size="small" color="primary" sx={{ ml: 1 }} />}
                        </TableCell>
                        <TableCell>{player.player_type || '-'}</TableCell>
                        <TableCell align="right">{formatCurrency(player.profit)}</TableCell>
                        <TableCell align="right">{formatNumber(player.imbalance)}</TableCell>
                        <TableCell align="right">{formatNumber(player.curtailment)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{player.total_score.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          </Box>
        )}

        {/* Active Events */}
        {active_events && active_events.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningIcon color="warning" />
              Active Events This Round
            </Typography>
            <Stack spacing={1}>
              {active_events.map((event, idx) => (
                <Alert key={idx} severity="info" icon={<EnergyIcon />}>
                  <Typography variant="body2">
                    <strong>{event.type}</strong>: {event.description || 'No description'}
                  </Typography>
                  {event.params && (
                    <Typography variant="caption" color="text.secondary">
                      {JSON.stringify(event.params)}
                    </Typography>
                  )}
                </Alert>
              ))}
            </Stack>
          </Box>
        )}

        {/* Advance Button */}
        <Box textAlign="center">
          {readyCount && !isSolo ? (
            <Stack spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Waiting for other players... ({readyCount.ready_count}/{readyCount.total_players} ready)
              </Typography>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <Button
              variant="contained"
              size="large"
              endIcon={<NextIcon />}
              onClick={handleAdvance}
              disabled={advancing}
            >
              {advancing ? 'Loading...' : isSolo ? 'Continue to Next Round' : 'I\'m Ready for Next Round'}
            </Button>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
