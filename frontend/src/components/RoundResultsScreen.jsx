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
  AccordionDetails,
  Tabs,
  Tab
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
import TermTooltip from './TermTooltip';

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
  const [activeTab, setActiveTab] = useState('lot');

  const isSolo = mode === 'isolated_per_player';
  const formatInt = (value) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString('en-US');
  };
  const formatCurrency = (value) => `ZAR ${formatInt(value)}`;

  const lotName = (code) => {
    if (code === 'A') return 'Baseload';
    if (code === 'B') return 'Mid Merit';
    if (code === 'C') return 'Peak Load';
    if (code === 'CLASSIC') return 'Classic';
    return code;
  };

  const getLotColor = (label) => {
    if (label === 'A') return '#64b5f6';
    if (label === 'B') return '#2196f3';
    if (label === 'C') return '#1565c0';
    if (label === 'CLASSIC') return '#757575';
    return '#64b5f6';
  };

  const getStatusLabel = (dispatchPct, bidPrice, mcp) => {
    if (dispatchPct >= 99) return '✓ Full';
    if (dispatchPct > 0) return `${dispatchPct.toFixed(0)}% Part`;
    if (bidPrice > mcp) return '✗ Too expensive';
    return '✗ Not needed';
  };

  const getStatusColor = (dispatchPct, bidPrice, mcp) => {
    if (dispatchPct >= 99) return 'success';
    if (dispatchPct > 0) return 'warning';
    if (bidPrice > mcp) return 'error';
    return 'default';
  };

  const calculateAdjustmentPct = (daMwh, deltaMwh) => {
    return daMwh > 0 ? ((deltaMwh / daMwh) * 100) : 0;
  };

  const renderLotRow = (lotLabel, lotData) => {
    const offered = lotData.mw_offered || 0;
    const dispatched = lotData.mw_dispatched || 0;
    const dispatchPct = offered > 0 ? ((dispatched / offered) * 100) : 0;
    const bidPrice = lotData.price_bid || 0;
    const mcp = lotData.mcp || 0;

    return (
      <TableRow key={lotLabel}>
        <TableCell>
          <Chip
            label={lotName(lotLabel)}
            size="small"
            sx={{
              bgcolor: getLotColor(lotLabel),
              color: 'white',
              fontWeight: 600
            }}
          />
        </TableCell>
        <TableCell align="right">{formatInt(bidPrice)}</TableCell>
        <TableCell align="right" sx={{ fontWeight: 600, color: dispatched > 0 ? 'success.main' : 'text.disabled' }}>
          {dispatched > 0 ? formatInt(mcp) : '-'}
        </TableCell>
        <TableCell align="right">{formatInt(offered)}</TableCell>
        <TableCell align="right" sx={{ fontWeight: 600 }}>
          {formatInt(dispatched)}
        </TableCell>
        <TableCell align="right">{Math.round(dispatchPct)}%</TableCell>
        <TableCell align="right">
          <Chip
            label={getStatusLabel(dispatchPct, bidPrice, mcp)}
            size="small"
            color={getStatusColor(dispatchPct, bidPrice, mcp)}
          />
        </TableCell>
      </TableRow>
    );
  };

  const renderDailyRow = (day) => {
    const adjustPct = calculateAdjustmentPct(day.da_mwh, day.delta_mwh);
    return (
      <TableRow key={day.day} hover>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>
            Day {day.day}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {formatInt(day.da_mwh)}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" color="primary">
            {formatInt(day.id_mwh)}
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
            {day.delta_mwh >= 0 ? '+' : ''}{formatInt(day.delta_mwh)}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Chip
            label={`${adjustPct >= 0 ? '+' : ''}${Math.round(adjustPct)}%`}
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
  };

  useEffect(() => {
    if (!sessionId || !round) return;

    const fetchResults = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/round-results/${round}`);
        setResults(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch round results:', error);
        
        // If 404, try to get the latest available round results
        if (error.response?.status === 404) {
          try {
            console.log('Round results not found, fetching latest available...');
            const { data } = await api.get(`/api/sessions/${sessionId}/latest-round-results`);
            setResults(data);
            setLoading(false);
            return;
          } catch (fallbackError) {
            console.error('Failed to fetch latest results:', fallbackError);
          }
        }
        
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
  const hasLotBreakdown = my_result?.bid_dispatch && Object.keys(my_result.bid_dispatch).length > 0;
  const hasDailyBreakdown = my_result?.da_id_breakdown?.daily_summary?.length > 0;
  const hasHourlyBreakdown = Array.isArray(my_result?.hourly_breakdown) && my_result.hourly_breakdown.length > 0;

  // Hourly breakdown calculations
  const isConsumer = my_result.profit < 0;
  const totalDispatchedMW = hasHourlyBreakdown 
    ? my_result.hourly_breakdown.reduce((sum, h) => sum + h.dispatched_mw, 0)
    : 0;
  const weightedMCP = totalDispatchedMW > 0
    ? my_result.hourly_breakdown.reduce((sum, h) => sum + (h.mcp * h.dispatched_mw), 0) / totalDispatchedMW
    : 0;

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
                  <Typography variant="caption" color="text.secondary">Imbalance Cost</Typography>
                  <Typography variant="h5" color={Math.abs(my_result.imbalance) > 10000 ? 'error.main' : 'text.primary'}>
                    {formatCurrency(my_result.imbalance)}
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
                      ? `${(Math.abs(my_result.profit) / (my_result.dispatched * 1000)).toFixed(2)} ZAR/kWh`
                      : formatCurrency(my_result.variable_cost || 0)
                    }
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
                As a consumer you buy electricity. Negative revenues represent your purchase costs.
              </Alert>
            )}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? 'rgba(233, 30, 99, 0.08)' : 'rgba(158, 158, 158, 0.08)', minHeight: 160 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip label={<TermTooltip term="DA">DA</TermTooltip>} size="small" sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? '#e91e63' : '#9e9e9e', color: 'white', fontSize: '0.65rem', height: 18 }} />
                      <Typography variant="caption" color="text.secondary">
                        <TermTooltip term="DA">DA</TermTooltip> {my_result.da_id_breakdown.is_consumer ? 'Purchase' : 'Sale'}
                      </Typography>
                    </Stack>
                    <Typography variant="h5" color="text.primary">
                      {formatInt(my_result.da_id_breakdown.da_volume_mwh)} MWh
                    </Typography>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary">
                        @ {formatInt(my_result.da_id_breakdown.da_price_zar)} ZAR/MWh
                      </Typography>
                      <Typography variant="caption" color={my_result.da_id_breakdown.da_revenue_zar >= 0 ? 'success.main' : 'error.main'}>
                        {my_result.da_id_breakdown.is_consumer ? 'Cost' : 'Revenue'}: {formatCurrency(Math.abs(my_result.da_id_breakdown.da_revenue_zar))}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ 
                  bgcolor: my_result.da_id_breakdown.id_delta_mwh >= 0 
                    ? 'rgba(76, 175, 80, 0.08)' 
                    : 'rgba(244, 67, 54, 0.08)',
                  minHeight: 160
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
                        <TermTooltip term="ID">ID</TermTooltip> {my_result.da_id_breakdown.is_consumer ? 'Änderung' : 'Delta'}
                      </Typography>
                    </Stack>
                    <Typography 
                      variant="h5" 
                      color={my_result.da_id_breakdown.id_delta_mwh >= 0 ? 'success.main' : 'error.main'}
                    >
                      {my_result.da_id_breakdown.id_delta_mwh >= 0 ? '+' : ''}
                      {formatInt(my_result.da_id_breakdown.id_delta_mwh)} MWh
                    </Typography>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color={my_result.da_id_breakdown.id_price_spread_percent !== 0 ? 'warning.main' : 'text.secondary'}>
                        @ {formatInt(my_result.da_id_breakdown.id_price_zar)} ZAR/MWh
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
                <Card sx={{ bgcolor: my_result.da_id_breakdown.is_consumer ? 'rgba(233, 30, 99, 0.08)' : 'transparent', minHeight: 160 }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      {my_result.da_id_breakdown.is_consumer ? 'Finaler Bedarf' : 'Final Position'}
                    </Typography>
                    <Typography variant="h5" color="primary.main">
                      {formatInt(my_result.da_id_breakdown.final_volume_mwh)} MWh
                    </Typography>
                    <Typography variant="caption" color={my_result.da_id_breakdown.total_revenue_zar >= 0 ? 'success.main' : 'error.main'}>
                      {my_result.da_id_breakdown.is_consumer ? 'Gesamtkosten' : 'Total Revenue'}: {formatCurrency(Math.abs(my_result.da_id_breakdown.total_revenue_zar))}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: 'rgba(33, 150, 243, 0.08)', minHeight: 160 }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">ID Adjustment</Typography>
                    <Typography variant="h5" color="info.main">
                      {my_result.da_id_breakdown.da_volume_mwh > 0 
                        ? `${Math.round((my_result.da_id_breakdown.id_delta_mwh / my_result.da_id_breakdown.da_volume_mwh) * 100)}%`
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
            {/* Daily breakdown table moved into tab section below */}
          </Box>
        )}

        {/* Tabbed tables: Lot breakdown, Daily breakdown, Hourly breakdown */}
        {(hasLotBreakdown || hasDailyBreakdown || hasHourlyBreakdown) && (
          <Box sx={{ mt: 4 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab
                label="Lot breakdown by device"
                value="lot"
                disabled={!hasLotBreakdown}
              />
              <Tab
                label="Daily breakdown"
                value="daily"
                disabled={!hasDailyBreakdown}
              />
              <Tab
                label="Hourly breakdown"
                value="hourly"
                disabled={!hasHourlyBreakdown}
              />
            </Tabs>

            {/* Lot Breakdown by device */}
            {activeTab === 'lot' && (
              hasLotBreakdown ? (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EnergyIcon color="primary" />
                    Lot breakdown by device
                  </Typography>
                  <Stack spacing={2}>
                    {Object.entries(my_result.bid_dispatch).map(([deviceId, lots]) => {
                      const deviceConfig = scenario?.config?.devices?.find(d => d.id === deviceId);
                      const showLotBreakdown = deviceConfig?.enable_multi_bid === true;
                      const deviceLabel = deviceConfig?.name || deviceId;

                      let totalOffered = 0;
                      let totalDispatched = 0;
                      let totalRevenue = 0;

                      Object.entries(lots).forEach(([, lotData]) => {
                        totalOffered += lotData.mw_offered || 0;
                        totalDispatched += lotData.mw_dispatched || 0;
                        totalRevenue += (lotData.mw_dispatched || 0) * (lotData.mcp || 0);
                      });

                      const dispatchRate = totalOffered > 0 ? (totalDispatched / totalOffered * 100) : 0;

                      return (
                        <Card key={deviceId}>
                          <CardContent>
                            <Stack spacing={2}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                  {deviceLabel}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Dispatch Rate: <strong>{Math.round(dispatchRate)}%</strong>
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    Revenue: <strong>{formatCurrency(totalRevenue)}</strong>
                                  </Typography>
                                </Box>
                              </Box>

                              {showLotBreakdown && (
                                <TableContainer>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Lot</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Price bid (ZAR/MWh)</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Realized price (ZAR/MWh)</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Offered (MWh)</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Dispatched (MWh)</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Dispatch %</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Status</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {Object.entries(lots)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([lotLabel, lotData]) => renderLotRow(lotLabel, lotData))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              )}

                              <Typography variant="caption" color="text.secondary" textAlign="right">
                                <TermTooltip term="MCP">Market Clearing Price (MCP)</TermTooltip>: <strong>{formatCurrency(my_result.mcp)}</strong>
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                </Box>
              ) : (
                <Alert severity="info" icon={<EnergyIcon />} sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Multi-Bid dispatch details</strong> are not available.
                    This feature requires Multi-Bid Pricing to be enabled in the scenario configuration and bids to be submitted.
                  </Typography>
                </Alert>
              )
            )}

            {/* Daily Breakdown */}
            {activeTab === 'daily' && hasDailyBreakdown && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Daily breakdown
                </Typography>
                <TableContainer component={Paper}>
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
                        <TableCell align="right" sx={{ fontWeight: 600 }}>ID adjustment %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {my_result.da_id_breakdown.daily_summary.map((day) => renderDailyRow(day))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Hourly Breakdown */}
            {activeTab === 'hourly' && hasHourlyBreakdown && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningIcon color="primary" />
                  Hourly breakdown
                </Typography>
                <TableContainer component={Paper}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Hour</TableCell>
                          <TableCell align="right"><TermTooltip term="MCP">MCP</TermTooltip> (<TermTooltip term="ZAR">ZAR</TermTooltip>/<TermTooltip term="MWh">MWh</TermTooltip>)</TableCell>
                          <TableCell align="right">Planned (<TermTooltip term="MWh">MWh</TermTooltip>)</TableCell>
                          <TableCell align="right"><TermTooltip term="Dispatch">Dispatched</TermTooltip> (<TermTooltip term="MWh">MWh</TermTooltip>)</TableCell>
                          {!isConsumer && <TableCell align="right">Actual (MWh)</TableCell>}
                          <TableCell align="right">{isConsumer ? 'Expenses' : 'Revenue'} (<TermTooltip term="ZAR">ZAR</TermTooltip>)</TableCell>
                          <TableCell align="right"><TermTooltip term="Imbalance">Imbalance</TermTooltip> (<TermTooltip term="MWh">MWh</TermTooltip>)</TableCell>
                          <TableCell align="right"><TermTooltip term="Imbalance">Imbalance</TermTooltip> cost (<TermTooltip term="ZAR">ZAR</TermTooltip>)</TableCell>
                          {!isConsumer && <TableCell align="right">Curtailment (MWh)</TableCell>}
                          {!isConsumer && <TableCell align="right">Curtailment cost (ZAR)</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {my_result.hourly_breakdown.map((hour, idx) => (
                          <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                            <TableCell>{hour.hour}</TableCell>
                            <TableCell align="right">{formatInt(hour.mcp)}</TableCell>
                            <TableCell align="right">{formatInt(hour.planned_mw)}</TableCell>
                            <TableCell align="right">{formatInt(hour.dispatched_mw)}</TableCell>
                            {!isConsumer && <TableCell align="right">{formatInt(hour.actual_mw)}</TableCell>}
                            <TableCell align="right">
                              {isConsumer ? formatInt(Math.abs(hour.revenue_zar)) : formatCurrency(hour.revenue_zar)}
                            </TableCell>
                            <TableCell align="right">{formatInt(hour.imbalance_mwh)}</TableCell>
                            <TableCell align="right" sx={{ color: hour.imbalance_cost_zar > 0 ? 'error.main' : 'text.primary' }}>
                              {formatCurrency(hour.imbalance_cost_zar)}
                            </TableCell>
                            {!isConsumer && <TableCell align="right">{formatInt(hour.curtailment_mwh)}</TableCell>}
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
                            {formatInt(weightedMCP)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {formatInt(my_result.hourly_breakdown.reduce((sum, h) => sum + h.planned_mw, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {formatInt(my_result.hourly_breakdown.reduce((sum, h) => sum + h.dispatched_mw, 0))}
                          </TableCell>
                          {!isConsumer && (
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              {formatInt(my_result.hourly_breakdown.reduce((sum, h) => sum + h.actual_mw, 0))}
                            </TableCell>
                          )}
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {isConsumer
                              ? formatInt(Math.abs(my_result.hourly_breakdown.reduce((sum, h) => sum + h.revenue_zar, 0)))
                              : formatCurrency(my_result.hourly_breakdown.reduce((sum, h) => sum + h.revenue_zar, 0))
                            }
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {formatInt(my_result.hourly_breakdown.reduce((sum, h) => sum + h.imbalance_mwh, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                            {formatCurrency(my_result.hourly_breakdown.reduce((sum, h) => sum + h.imbalance_cost_zar, 0))}
                          </TableCell>
                          {!isConsumer && (
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              {formatInt(my_result.hourly_breakdown.reduce((sum, h) => sum + h.curtailment_mwh, 0))}
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
                        <><strong>Explanation:</strong> Planned = your demand forecast, <TermTooltip term="Dispatch">Dispatched</TermTooltip> = energy you purchased at <TermTooltip term="MCP">MCP</TermTooltip>.
                        <TermTooltip term="Imbalance">Imbalance</TermTooltip> = |Dispatched - Actual consumption| (deviation penalty for over/under consumption).</>
                      ) : (
                        <><strong>Explanation:</strong> Planned = your offered energy, <TermTooltip term="Dispatch">Dispatched</TermTooltip> = accepted by market, Actual = what you delivered.
                        <TermTooltip term="Imbalance">Imbalance</TermTooltip> = |Dispatched - Actual| (deviation penalty). Curtailment = Planned - Dispatched (unsold energy opportunity cost).</>
                      )}
                    </Typography>
                  </Alert>
                </Box>
              )
            }
          </Box>
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
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Imbalance Cost (ZAR)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Curtailment Cost (ZAR)</TableCell>
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
