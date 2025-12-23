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
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  TrendingUp as ProfitIcon,
  Warning as WarningIcon,
  Bolt as EnergyIcon,
  NavigateNext as NextIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import api from '../services/api';

/**
 * RoundResultsScreen - Shows individual KPIs, ranking (shared), and active events
 * Displayed after round calculation completes
 * 
 * Note: Campaign-wide enable_player_bidding controls market clearing mechanism.
 * Device-level enable_multi_bid controls UI display of lot breakdown per device.
 */
export default function RoundResultsScreen({ sessionId, round, mode = 'shared_market', scenario, onAdvance }) {
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
                  <Typography variant="caption" color="text.secondary">
                    {my_result.profit < 0 ? 'Expenses' : 'Profit'}
                  </Typography>
                  <Typography variant="h5" color={my_result.profit >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(Math.abs(my_result.profit))}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    {my_result.profit < 0 ? 'Cost per kWh' : 'Variable Costs'}
                  </Typography>
                  <Typography variant="h5" color="text.primary">
                    {my_result.profit < 0 && my_result.dispatched > 0 
                      ? `${((my_result.variable_cost || 0) / (my_result.dispatched * 1000)).toFixed(2)} ZAR/kWh`
                      : formatCurrency(my_result.variable_cost || 0)
                    }
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Imbalance Cost</Typography>
                  <Typography variant="h5" color={Math.abs(my_result.imbalance) > 10000 ? 'error.main' : 'text.primary'}>
                    {formatCurrency(my_result.imbalance)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            {my_result.profit >= 0 && (
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">Curtailment (Info)</Typography>
                    <Typography variant="h5" color={Math.abs(my_result.curtailment) > 100000 ? 'warning.main' : 'text.primary'}>
                      {formatCurrency(my_result.curtailment)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
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

        {/* DA/ID Market Breakdown */}
        {my_result?.da_id_breakdown?.has_baseline && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <ProfitIcon color="primary" />
              Market Breakdown: Day-Ahead vs Intraday
              {my_result.da_id_breakdown.is_consumer && (
                <Chip 
                  label="Consumer"
                  size="small"
                  sx={{ bgcolor: '#e91e63', color: 'white', fontWeight: 500 }}
                />
              )}
              {my_result.da_id_breakdown.id_price_spread_percent !== 0 && (
                <Chip 
                  label={`ID Spread: ${my_result.da_id_breakdown.id_price_spread_percent >= 0 ? '+' : ''}${my_result.da_id_breakdown.id_price_spread_percent}%`}
                  size="small"
                  sx={{ 
                    bgcolor: my_result.da_id_breakdown.id_price_spread_percent > 0 ? 'warning.light' : 'success.light',
                    color: my_result.da_id_breakdown.id_price_spread_percent > 0 ? 'warning.dark' : 'success.dark',
                    fontWeight: 500
                  }}
                />
              )}
            </Typography>
            {/* Consumer hint */}
            {my_result.da_id_breakdown.is_consumer && (
              <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                Als Consumer kaufst du Strom. Negative Revenues = Kosten für deinen Einkauf.
              </Alert>
            )}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? 'rgba(233, 30, 99, 0.08)' : 'rgba(158, 158, 158, 0.08)' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip label="DA" size="small" sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? '#e91e63' : '#9e9e9e', color: 'white', fontSize: '0.65rem', height: 18 }} />
                      <Typography variant="caption" color="text.secondary">
                        DA {my_result.da_id_breakdown.is_consumer ? 'Einkauf' : 'Verkauf'}
                      </Typography>
                    </Stack>
                    <Typography variant="h5" color="text.primary">
                      {formatNumber(my_result.da_id_breakdown.da_volume_mwh, 0)} MWh
                    </Typography>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary">
                        @ {formatNumber(my_result.da_id_breakdown.da_price_zar, 0)} ZAR/MWh
                      </Typography>
                      <Typography variant="caption" color={my_result.da_id_breakdown.da_revenue_zar >= 0 ? 'success.main' : 'error.main'}>
                        {my_result.da_id_breakdown.is_consumer ? 'Kosten' : 'Revenue'}: {formatCurrency(Math.abs(my_result.da_id_breakdown.da_revenue_zar))}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ 
                  bgcolor: my_result.da_id_breakdown.id_delta_mwh >= 0 
                    ? 'rgba(76, 175, 80, 0.08)' 
                    : 'rgba(244, 67, 54, 0.08)' 
                }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip 
                        label="ID" 
                        size="small" 
                        sx={{ 
                          bgcolor: my_result.da_id_breakdown.id_delta_mwh >= 0 ? '#4caf50' : '#f44336', 
                          color: 'white', 
                          fontSize: '0.65rem', 
                          height: 18 
                        }} 
                      />
                      <Typography variant="caption" color="text.secondary">
                        ID {my_result.da_id_breakdown.is_consumer ? 'Änderung' : 'Delta'}
                      </Typography>
                    </Stack>
                    <Typography 
                      variant="h5" 
                      color={my_result.da_id_breakdown.id_delta_mwh >= 0 ? 'success.main' : 'error.main'}
                    >
                      {my_result.da_id_breakdown.id_delta_mwh >= 0 ? '+' : ''}
                      {formatNumber(my_result.da_id_breakdown.id_delta_mwh, 0)} MWh
                    </Typography>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color={my_result.da_id_breakdown.id_price_spread_percent !== 0 ? 'warning.main' : 'text.secondary'}>
                        @ {formatNumber(my_result.da_id_breakdown.id_price_zar, 0)} ZAR/MWh
                        {my_result.da_id_breakdown.id_price_spread_percent !== 0 && 
                          ` (${my_result.da_id_breakdown.id_price_spread_percent >= 0 ? '+' : ''}${my_result.da_id_breakdown.id_price_spread_percent}%)`
                        }
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color={my_result.da_id_breakdown.id_revenue_zar >= 0 ? 'success.main' : 'error.main'}
                      >
                        {my_result.da_id_breakdown.is_consumer 
                          ? (my_result.da_id_breakdown.id_revenue_zar >= 0 ? 'Ersparnis' : 'Mehrkosten')
                          : 'Revenue'
                        }: {my_result.da_id_breakdown.id_revenue_zar >= 0 ? '+' : ''}
                        {formatCurrency(my_result.da_id_breakdown.id_revenue_zar)}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? 'rgba(233, 30, 99, 0.08)' : 'transparent' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      {my_result.da_id_breakdown.is_consumer ? 'Finaler Bedarf' : 'Final Position'}
                    </Typography>
                    <Typography variant="h5" color="primary.main">
                      {formatNumber(my_result.da_id_breakdown.final_volume_mwh, 0)} MWh
                    </Typography>
                    <Typography variant="caption" color={my_result.da_id_breakdown.total_revenue_zar >= 0 ? 'success.main' : 'error.main'}>
                      {my_result.da_id_breakdown.is_consumer ? 'Gesamtkosten' : 'Total Revenue'}: {formatCurrency(Math.abs(my_result.da_id_breakdown.total_revenue_zar))}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: 'rgba(33, 150, 243, 0.08)' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">ID Adjustment</Typography>
                    <Typography variant="h5" color="info.main">
                      {my_result.da_id_breakdown.da_volume_mwh > 0 
                        ? `${((my_result.da_id_breakdown.id_delta_mwh / my_result.da_id_breakdown.da_volume_mwh) * 100).toFixed(1)}%`
                        : '0%'
                      }
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {my_result.da_id_breakdown.is_consumer ? 'Änderung vom DA Einkauf' : 'Change from DA baseline'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Box sx={{ mt: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                <Chip label="DA" size="small" sx={{ bgcolor: '#9e9e9e', color: 'white', fontSize: '0.6rem', height: 14, mx: 0.5 }} /> = Day-Ahead (initial position at gate closure)
                <Chip label="ID+" size="small" sx={{ bgcolor: '#4caf50', color: 'white', fontSize: '0.6rem', height: 14, mx: 0.5 }} /> = Intraday increase
                <Chip label="ID-" size="small" sx={{ bgcolor: '#f44336', color: 'white', fontSize: '0.6rem', height: 14, mx: 0.5 }} /> = Intraday decrease
              </Typography>
            </Box>

            {/* Daily Breakdown Accordion */}
            {my_result.da_id_breakdown.daily_summary?.length > 0 && (
              <Accordion sx={{ mt: 2, bgcolor: 'background.paper' }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">
                    📅 Daily Breakdown ({my_result.da_id_breakdown.daily_summary.length} days)
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'background.default' }}>
                          <TableCell sx={{ fontWeight: 600 }}>Day</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            <Chip label="DA" size="small" sx={{ bgcolor: '#9e9e9e', color: 'white', fontSize: '0.6rem', height: 16, mr: 0.5 }} />
                            MWh
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            <Chip label="ID" size="small" sx={{ bgcolor: '#2196f3', color: 'white', fontSize: '0.6rem', height: 16, mr: 0.5 }} />
                            MWh
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Delta (MWh)</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>ID Adjustment %</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {my_result.da_id_breakdown.daily_summary.map((day) => {
                          const adjustPct = day.da_mwh > 0 ? ((day.delta_mwh / day.da_mwh) * 100) : 0;
                          return (
                            <TableRow key={day.day} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={500}>
                                  Tag {day.day}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  {formatNumber(day.da_mwh, 0)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="primary">
                                  {formatNumber(day.id_mwh, 0)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: day.delta_mwh >= 0 ? 'success.main' : 'error.main',
                                    fontWeight: 500
                                  }}
                                >
                                  {day.delta_mwh >= 0 ? '+' : ''}{formatNumber(day.delta_mwh, 0)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Chip 
                                  label={`${adjustPct >= 0 ? '+' : ''}${adjustPct.toFixed(1)}%`}
                                  size="small"
                                  sx={{ 
                                    bgcolor: Math.abs(adjustPct) > 20 
                                      ? (adjustPct >= 0 ? 'success.light' : 'error.light')
                                      : 'grey.200',
                                    color: Math.abs(adjustPct) > 20 
                                      ? (adjustPct >= 0 ? 'success.dark' : 'error.dark')
                                      : 'text.primary',
                                    fontSize: '0.7rem'
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        )}

        {/* Lot Dispatch Breakdown - Show per device if device has enable_multi_bid */}
        {my_result?.bid_dispatch && Object.keys(my_result.bid_dispatch).length > 0 ? (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EnergyIcon color="primary" />
              Lot Dispatch Breakdown
            </Typography>
            <Stack spacing={2}>
              {Object.entries(my_result.bid_dispatch).map(([deviceId, lots]) => {
                // Check if this device has multi-bid enabled
                const deviceConfig = scenario?.config?.devices?.find(d => d.id === deviceId);
                const showLotBreakdown = deviceConfig?.enable_multi_bid === true;
                
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
                        
                        {/* Lots Table - Show breakdown only if device multi-bid enabled */}
                        {showLotBreakdown ? (
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
                              {Object.entries(lots).sort(([a], [b]) => a.localeCompare(b)).map(([lotLabel, lotData]) => {
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
                        ) : null}
                        
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

        {/* Hourly Breakdown - Detailed calculation breakdown */}
        {(() => {
          // Debug logging
          if (my_result?.hourly_breakdown) {
            console.log('[HOURLY_DEBUG] Hourly breakdown data:', my_result.hourly_breakdown);
            const totalPlanned = my_result.hourly_breakdown.reduce((sum, h) => sum + (h.planned_mw || 0), 0);
            const totalDispatched = my_result.hourly_breakdown.reduce((sum, h) => sum + (h.dispatched_mw || 0), 0);
            console.log(`[HOURLY_DEBUG] Frontend totals: planned=${totalPlanned.toFixed(2)}, dispatched=${totalDispatched.toFixed(2)}`);
          } else {
            console.log('[HOURLY_DEBUG] No hourly breakdown data');
          }
          return null;
        })()}
        {my_result?.hourly_breakdown && my_result.hourly_breakdown.length > 0 ? (() => {
          // Determine if consumer based on negative profit
          const isConsumer = my_result.profit < 0;
          
          // Calculate weighted average MCP
          const totalDispatchedMW = my_result.hourly_breakdown.reduce((sum, h) => sum + h.dispatched_mw, 0);
          const weightedMCP = totalDispatchedMW > 0 
            ? my_result.hourly_breakdown.reduce((sum, h) => sum + (h.mcp * h.dispatched_mw), 0) / totalDispatchedMW
            : 0;
          
          return (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon color="primary" />
                Detailed Hourly Breakdown
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Hour</TableCell>
                      <TableCell align="right">MCP (ZAR/MWh)</TableCell>
                      <TableCell align="right">Planned (MWh)</TableCell>
                      <TableCell align="right">Dispatched (MWh)</TableCell>
                      {!isConsumer && <TableCell align="right">Actual (MWh)</TableCell>}
                      <TableCell align="right">{isConsumer ? 'Expenses' : 'Revenue'} (ZAR)</TableCell>
                      <TableCell align="right">Imbalance (MWh)</TableCell>
                      <TableCell align="right">Imbalance Cost (ZAR)</TableCell>
                      {!isConsumer && <TableCell align="right">Curtailment (MWh)</TableCell>}
                      {!isConsumer && <TableCell align="right">Curtailment Cost (ZAR)</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {my_result.hourly_breakdown.map((hour, idx) => (
                      <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                        <TableCell>{hour.hour}</TableCell>
                        <TableCell align="right">{formatNumber(hour.mcp, 1)}</TableCell>
                        <TableCell align="right">{formatNumber(hour.planned_mw, 1)}</TableCell>
                        <TableCell align="right">{formatNumber(hour.dispatched_mw, 1)}</TableCell>
                        {!isConsumer && <TableCell align="right">{formatNumber(hour.actual_mw, 1)}</TableCell>}
                        <TableCell align="right">{isConsumer ? formatNumber(Math.abs(hour.revenue_zar), 0) : formatCurrency(hour.revenue_zar)}</TableCell>
                        <TableCell align="right">{formatNumber(hour.imbalance_mwh, 1)}</TableCell>
                        <TableCell align="right" sx={{ color: hour.imbalance_cost_zar > 0 ? 'error.main' : 'text.primary' }}>
                          {formatCurrency(hour.imbalance_cost_zar)}
                        </TableCell>
                        {!isConsumer && <TableCell align="right">{formatNumber(hour.curtailment_mwh, 1)}</TableCell>}
                        {!isConsumer && (
                          <TableCell align="right" sx={{ color: hour.curtailment_cost_zar > 0 ? 'warning.main' : 'text.primary' }}>
                            {formatCurrency(hour.curtailment_cost_zar)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow sx={{ backgroundColor: 'action.selected', fontWeight: 'bold' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatNumber(weightedMCP, 1)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatNumber(my_result.hourly_breakdown.reduce((sum, h) => sum + h.planned_mw, 0), 1)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatNumber(my_result.hourly_breakdown.reduce((sum, h) => sum + h.dispatched_mw, 0), 1)}
                      </TableCell>
                      {!isConsumer && (
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {formatNumber(my_result.hourly_breakdown.reduce((sum, h) => sum + h.actual_mw, 0), 1)}
                        </TableCell>
                      )}
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {isConsumer 
                          ? formatNumber(Math.abs(my_result.hourly_breakdown.reduce((sum, h) => sum + h.revenue_zar, 0)), 0)
                          : formatCurrency(my_result.hourly_breakdown.reduce((sum, h) => sum + h.revenue_zar, 0))
                        }
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatNumber(my_result.hourly_breakdown.reduce((sum, h) => sum + h.imbalance_mwh, 0), 1)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                        {formatCurrency(my_result.hourly_breakdown.reduce((sum, h) => sum + h.imbalance_cost_zar, 0))}
                      </TableCell>
                      {!isConsumer && (
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {formatNumber(my_result.hourly_breakdown.reduce((sum, h) => sum + h.curtailment_mwh, 0), 1)}
                        </TableCell>
                      )}
                      {!isConsumer && (
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                          {formatCurrency(my_result.hourly_breakdown.reduce((sum, h) => sum + h.curtailment_cost_zar, 0))}
                        </TableCell>
                      )}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  {isConsumer ? (
                    <><strong>Explanation:</strong> Planned = your demand forecast, Dispatched = energy you purchased at MCP. 
                    Imbalance = |Dispatched - Actual consumption| (deviation penalty for over/under consumption).</>
                  ) : (
                    <><strong>Explanation:</strong> Planned = your offered energy, Dispatched = accepted by market, Actual = what you delivered. 
                    Imbalance = |Dispatched - Actual| (deviation penalty). Curtailment = Planned - Dispatched (unsold energy opportunity cost).</>
                  )}
                </Typography>
              </Alert>
            </Box>
          );
        })() : null}

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
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Imbalance Cost (ZAR)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Curtailment Cost (ZAR)</TableCell>
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
