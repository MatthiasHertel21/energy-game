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

        {/* Lot Dispatch Breakdown - Only show if bid_dispatch exists */}
        {my_result?.bid_dispatch && Object.keys(my_result.bid_dispatch).length > 0 ? (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EnergyIcon color="primary" />
              Lot Dispatch Breakdown
            </Typography>
            <Stack spacing={2}>
              {Object.entries(my_result.bid_dispatch).map(([deviceId, lots]) => {
                // Calculate aggregate metrics for this device
                let totalOffered = 0;
                let totalDispatched = 0;
                let totalRevenue = 0;
                
                Object.entries(lots).forEach(([lotLabel, lotData]) => {
                  totalOffered += lotData.mw_offered || 0;
                  totalDispatched += lotData.mw_dispatched || 0;
                  totalRevenue += (lotData.mw_dispatched || 0) * (lotData.mcp || 0);
                });
                
                const dispatchRate = totalOffered > 0 ? (totalDispatched / totalOffered * 100) : 0;
                
                return (
                  <Card key={deviceId}>
                    <CardContent>
                      <Stack spacing={2}>
                        {/* Device Header */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Device {deviceId}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                              Dispatch Rate: <strong>{dispatchRate.toFixed(1)}%</strong>
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Revenue: <strong>{formatCurrency(totalRevenue)}</strong>
                            </Typography>
                          </Box>
                        </Box>
                        
                        {/* Lots Table */}
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>Lot</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Price Bid (ZAR/MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Realized Price (ZAR/MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Offered (MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Dispatched (MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Dispatch %</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Status</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(lots).map(([lotLabel, lotData]) => {
                                const offered = lotData.mw_offered || 0;
                                const dispatched = lotData.mw_dispatched || 0;
                                const dispatchPct = offered > 0 ? (dispatched / offered * 100) : 0;
                                const mcp = lotData.mcp || 0;
                                const bidPrice = lotData.price_bid || 0;
                                
                                // Determine status
                                let statusColor = 'default';
                                let statusLabel = '-';
                                if (dispatchPct >= 99) {
                                  statusColor = 'success';
                                  statusLabel = '✓ Full';
                                } else if (dispatchPct > 0) {
                                  statusColor = 'warning';
                                  statusLabel = `${dispatchPct.toFixed(0)}% Part`;
                                } else if (bidPrice > mcp) {
                                  statusColor = 'error';
                                  statusLabel = '✗ Too expensive';
                                } else {
                                  statusColor = 'default';
                                  statusLabel = '✗ Not needed';
                                }
                                
                                // Color codes based on lot
                                const lotColors = {
                                  'A': '#64b5f6',
                                  'B': '#2196f3',
                                  'C': '#1565c0',
                                  'CLASSIC': '#757575'  // Gray for classic devices
                                };
                                
                                return (
                                  <TableRow key={lotLabel}>
                                    <TableCell>
                                      <Chip 
                                        label={lotLabel === 'CLASSIC' ? 'Classic' : `Lot ${lotLabel}`} 
                                        size="small"
                                        sx={{ 
                                          bgcolor: lotColors[lotLabel] || '#64b5f6',
                                          color: 'white',
                                          fontWeight: 600
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell align="right">{formatNumber(bidPrice, 0)}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: dispatched > 0 ? 'success.main' : 'text.disabled' }}>
                                      {dispatched > 0 ? formatNumber(mcp, 0) : '-'}
                                    </TableCell>
                                    <TableCell align="right">{formatNumber(offered, 1)}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                                      {formatNumber(dispatched, 1)}
                                    </TableCell>
                                    <TableCell align="right">
                                      {dispatchPct.toFixed(1)}%
                                    </TableCell>
                                    <TableCell align="right">
                                      <Chip 
                                        label={statusLabel} 
                                        size="small" 
                                        color={statusColor}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        
                        {/* MCP Reference */}
                        <Typography variant="caption" color="text.secondary" textAlign="right">
                          Market Clearing Price (MCP): <strong>{formatCurrency(my_result.mcp)}</strong>
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ) : (
          <Alert severity="info" icon={<EnergyIcon />}>
            <Typography variant="body2">
              <strong>Multi-Bid Dispatch Details</strong> are not available. 
              This feature requires Multi-Bid Pricing to be enabled in the scenario configuration and bids to be submitted.
            </Typography>
          </Alert>
        )}

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
