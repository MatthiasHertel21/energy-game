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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  Home as HomeIcon,
  Assessment as DetailsIcon,
  ExpandMore as ExpandIcon,
  CheckCircle as CheckIcon,
  Bolt as EnergyIcon
} from '@mui/icons-material';
import api from '../services/api';

/**
 * ScenarioResultsScreen - Final cumulative results and ranking
 * Displayed when scenario is complete
 */
export default function ScenarioResultsScreen({ sessionId, onHome }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;

    const fetchResults = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/final-results`);
        setResults(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch final results:', error);
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

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

  const { my_cumulative, final_ranking, round_history, bid_dispatch_aggregate } = results;
  const myFinalRank = final_ranking.findIndex(r => r.player_id === my_cumulative.player_id) + 1;

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={4}>
        {/* Header with Trophy */}
        <Box textAlign="center">
          <TrophyIcon sx={{ fontSize: 80, color: 'gold', mb: 2 }} />
          <Typography variant="h3" gutterBottom fontWeight="bold">
            Scenario Complete!
          </Typography>
          <Typography variant="h5" color="text.secondary">
            Final Ranking: #{myFinalRank}
          </Typography>
          {myFinalRank === 1 && (
            <Chip label="🏆 Winner!" color="warning" sx={{ mt: 2, fontSize: '1.2rem', py: 3, px: 2 }} />
          )}
          {myFinalRank === 2 && (
            <Chip label="🥈 Second Place" color="default" sx={{ mt: 2, fontSize: '1rem', py: 2 }} />
          )}
          {myFinalRank === 3 && (
            <Chip label="🥉 Third Place" color="default" sx={{ mt: 2, fontSize: '1rem', py: 2 }} />
          )}
        </Box>

        <Divider />

        {/* Cumulative KPIs */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckIcon color="success" />
            Your Final Performance
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Total Profit</Typography>
                  <Typography variant="h5" color="success.main">
                    {my_cumulative.total_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} ZAR
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Total Imbalance</Typography>
                  <Typography variant="h5" color={Math.abs(my_cumulative.total_imbalance || 0) > 5 ? 'error.main' : 'text.primary'}>
                    {my_cumulative.total_imbalance?.toFixed(2) || '0.00'} MWh
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Total Curtailment</Typography>
                  <Typography variant="h5" color={Math.abs(my_cumulative.total_curtailment || 0) > 1 ? 'warning.main' : 'text.primary'}>
                    {my_cumulative.total_curtailment?.toFixed(2) || '0.00'} MWh
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Final Score</Typography>
                  <Typography variant="h5" color="primary.main">
                    {my_cumulative.total_score?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0.0'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Aggregated Lot Dispatch Overview */}
        {bid_dispatch_aggregate && Object.keys(bid_dispatch_aggregate).length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DetailsIcon color="primary" />
              Multi-Bid Performance Summary
            </Typography>
            <Stack spacing={2}>
              {Object.entries(bid_dispatch_aggregate).map(([deviceId, lots]) => {
                let totalOffered = 0;
                let totalDispatched = 0;
                let totalRevenue = 0;
                
                Object.values(lots).forEach(lotData => {
                  totalOffered += lotData.mw_offered || 0;
                  totalDispatched += lotData.mw_dispatched || 0;
                  totalRevenue += lotData.total_revenue || 0;
                });
                
                const dispatchRate = totalOffered > 0 ? (totalDispatched / totalOffered * 100) : 0;
                
                return (
                  <Card key={deviceId}>
                    <CardContent>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Device {deviceId}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                              Avg Dispatch Rate: <strong>{dispatchRate.toFixed(1)}%</strong>
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Total Revenue: <strong>{totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZAR</strong>
                            </Typography>
                          </Box>
                        </Box>
                        
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>Lot</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Total Offered (MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Total Dispatched (MWh)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Dispatch Rate</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Total Revenue (ZAR)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Rounds Offered</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(lots).map(([lotLabel, lotData]) => {
                                const offered = lotData.mw_offered || 0;
                                const dispatched = lotData.mw_dispatched || 0;
                                const dispatchPct = offered > 0 ? (dispatched / offered * 100) : 0;
                                const revenue = lotData.total_revenue || 0;
                                const roundsOffered = lotData.rounds_offered || 0;
                                
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
                                    <TableCell align="right">{offered.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                                      {dispatched.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </TableCell>
                                    <TableCell align="right">
                                      <Chip 
                                        label={`${dispatchPct.toFixed(1)}%`}
                                        size="small"
                                        color={dispatchPct >= 90 ? 'success' : dispatchPct >= 50 ? 'warning' : 'default'}
                                      />
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                                      {revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell align="right">{roundsOffered}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        )}

        {/* Final Ranking Table */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrophyIcon color="warning" />
            Final Leaderboard
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Rank</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Player</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Total Profit (ZAR)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Total Imbalance (MWh)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Total Curtailment (MWh)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Final Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {final_ranking.map((player, index) => {
                  const isMe = player.player_id === my_cumulative.player_id;
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
                      <TableCell align="right">{player.total_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                      <TableCell align="right">{player.total_imbalance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                      <TableCell align="right">{player.total_curtailment?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{player.total_score?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0.0'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Round History Accordion */}
        {round_history && round_history.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Round History
            </Typography>
            {round_history.map((round, idx) => (
              <Accordion key={idx}>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography>
                    Round {round.round_num} - Score: {round.total_score?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0.0'}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Profit</Typography>
                      <Typography variant="body1">{round.profit?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'} ZAR</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Imbalance</Typography>
                      <Typography variant="body1">{round.imbalance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} MWh</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Curtailment</Typography>
                      <Typography variant="body1">{round.curtailment?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} MWh</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Dispatched</Typography>
                      <Typography variant="body1">{round.dispatched_mwh?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} MWh</Typography>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        <Divider />

        {/* Navigation Buttons */}
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            size="large"
            startIcon={<HomeIcon />}
            onClick={onHome}
          >
            Back to Home
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<DetailsIcon />}
            onClick={() => window.location.href = `/evaluation?sessionId=${sessionId}`}
          >
            View Detailed Analysis
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
