import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Breadcrumbs,
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
  Divider,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  NavigateNext as NextIcon,
  TrendingUp as RevenueIcon,
  AccountBalanceWallet as ProfitIcon,
  Cloud as CO2Icon,
  EmojiEvents as ChallengeIcon,
  Bolt as EnergyIcon,
  Home as HomeIcon,
  ShowChart as ChartIcon
} from '@mui/icons-material';
import api from '../services/api';
import { getRoleTerminology } from '../utils/roleTerminology';

/**
 * ScenarioResultsScreen - Final cumulative results and ranking
 * Displayed when scenario is complete
 */
export default function ScenarioResultsScreen({ sessionId, onHome, scenario, playerRole }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMetric, setChartMetric] = useState('profit');

  useEffect(() => {
    if (!sessionId) return;

    const fetchResults = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/final-results`);
        setResults(data);
        setError(null);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch final results:', error);
        setError(error);
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/sessions/${sessionId}/final-results`);
      setResults(data);
    } catch (err) {
      console.error('Failed to fetch final results:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const normalizeNumber = (value) => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  };

  const formatInt = (value) => normalizeNumber(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatCurrency = (value) => `ZAR ${formatInt(value)}`;
  const formatMwh = (value) => `${formatInt(value)} MWh`;

  const safeResults = (results && typeof results === 'object') ? results : {};
  const { my_cumulative, final_ranking, round_history, total_rounds } = safeResults;
  const safeRanking = Array.isArray(final_ranking)
    ? final_ranking.filter((row) => row && typeof row === 'object')
    : [];
  const safeMyCumulative = (my_cumulative && typeof my_cumulative === 'object') ? my_cumulative : (safeRanking[0] || null);
  const myFinalRank = safeMyCumulative
    ? (safeRanking.findIndex((r) => r?.player_id === safeMyCumulative?.player_id) + 1)
    : 0;

  const roleHint = (
    playerRole
    || safeMyCumulative?.player_role
    || safeMyCumulative?.type
    || ''
  ).toString().toLowerCase();

  const isProducer = roleHint.includes('producer') || roleHint.includes('generator');
  const isConsumer = roleHint.includes('consumer') || roleHint.includes('buyer');
  const resolvedIsProducer = isProducer || (!isConsumer);
  const terms = getRoleTerminology(resolvedIsProducer);
  const challengeHistory = Array.isArray(safeMyCumulative?.challenge_history) ? safeMyCumulative.challenge_history : [];
  const totalChallengePoints = challengeHistory.reduce((sum, h) => sum + (h.result?.total_points || 0), 0);
  const maxChallengePoints = challengeHistory.reduce((sum, h) => sum + (h.result?.max_points || 0), 0);
  const challengesPassed = challengeHistory.filter(h => h.result?.passed).length;

  const safeRoundHistory = Array.isArray(round_history)
    ? round_history.filter((row) => row && typeof row === 'object')
    : [];

  const trendSeries = useMemo(() => {
    const rows = [...safeRoundHistory].sort((a, b) => Number(a?.round_num || 0) - Number(b?.round_num || 0));
    return rows.map((r) => ({
      round: Number(r.round_num || 0),
      revenue: normalizeNumber(r.revenue_zar),
      profit: normalizeNumber(r.profit),
      costs: normalizeNumber(r.total_costs_zar ?? Math.abs(Number(r.revenue_zar ?? 0))),
      co2: normalizeNumber(r.co2_emissions_kg),
      dispatched: normalizeNumber(r.dispatched_mwh),
      planned: normalizeNumber(r.planned_mwh),
      coverage: normalizeNumber(r.planned_mwh) > 0
        ? (normalizeNumber(r.dispatched_mwh) / normalizeNumber(r.planned_mwh)) * 100
        : 0
    }));
  }, [safeRoundHistory]);

  const totalsFromHistory = useMemo(() => trendSeries.reduce((acc, row) => {
    acc.revenue += row.revenue;
    acc.profit += row.profit;
    acc.costs += row.costs;
    acc.co2 += row.co2;
    acc.dispatched += row.dispatched;
    acc.planned += row.planned;
    return acc;
  }, { revenue: 0, profit: 0, costs: 0, co2: 0, dispatched: 0, planned: 0 }), [trendSeries]);

  const hasHistory = trendSeries.length > 0;
  const totalRoundsDisplay = Math.max(
    Number(total_rounds || 0),
    trendSeries.length,
    challengeHistory.length
  );
  const challengeRoundsDenominator = Math.max(1, totalRoundsDisplay);

  const totalRevenueDisplay = hasHistory ? totalsFromHistory.revenue : normalizeNumber(safeMyCumulative?.total_revenue);
  const totalProfitDisplay = hasHistory ? totalsFromHistory.profit : normalizeNumber(safeMyCumulative?.total_profit);
  const totalCo2Display = hasHistory ? totalsFromHistory.co2 : normalizeNumber(safeMyCumulative?.total_co2_emissions);
  const totalDispatchedDisplay = hasHistory ? totalsFromHistory.dispatched : normalizeNumber(safeMyCumulative?.total_dispatched_mwh);
  const totalCostsDisplay = hasHistory
    ? totalsFromHistory.costs
    : Math.abs(normalizeNumber(safeMyCumulative?.total_revenue));
  const totalCoverageDisplay = hasHistory
    ? (totalsFromHistory.planned > 0 ? (totalsFromHistory.dispatched / totalsFromHistory.planned) * 100 : 0)
    : (normalizeNumber(safeMyCumulative?.total_planned_mwh) > 0
      ? (normalizeNumber(safeMyCumulative?.total_dispatched_mwh) / normalizeNumber(safeMyCumulative?.total_planned_mwh)) * 100
      : 0);

  const chartMeta = resolvedIsProducer
    ? {
        revenue: { label: 'Revenue (ZAR)', color: '#4caf50', formatter: (v) => formatCurrency(v) },
        profit: { label: 'Profit (ZAR)', color: '#2196f3', formatter: (v) => formatCurrency(v) },
        co2: { label: 'CO₂ (kg)', color: '#ff9800', formatter: (v) => `${formatInt(v)} kg` },
        dispatched: { label: 'Dispatched (MWh)', color: '#9c27b0', formatter: (v) => formatMwh(v) }
      }
    : {
        costs: { label: 'Costs (ZAR)', color: '#4caf50', formatter: (v) => formatCurrency(v) },
        coverage: { label: 'Coverage (%)', color: '#2196f3', formatter: (v) => `${normalizeNumber(v).toFixed(1)}%` },
        co2: { label: `${terms.co2ColumnLabel} (kg)`, color: '#ff9800', formatter: (v) => `${formatInt(v)} kg` },
        dispatched: { label: 'Consumed (MWh)', color: '#9c27b0', formatter: (v) => formatMwh(v) }
      };

  const fallbackMetric = resolvedIsProducer ? 'revenue' : 'costs';
  const activeMetric = chartMeta[chartMetric] ? chartMetric : fallbackMetric;
  const activeChartMeta = chartMeta[activeMetric];

  const chartPoints = useMemo(() => {
    if (!trendSeries.length) return [];
    const values = trendSeries.map((row) => normalizeNumber(row[activeMetric]));
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = Math.max(maxVal - minVal, 1);
    const width = 900;
    const height = 240;
    const padX = 48;
    const padY = 24;
    const stepX = trendSeries.length > 1 ? (width - padX * 2) / (trendSeries.length - 1) : 0;

    return trendSeries.map((row, idx) => {
      const value = normalizeNumber(row[activeMetric]);
      const x = padX + idx * stepX;
      const y = height - padY - ((value - minVal) / range) * (height - padY * 2);
      return { ...row, value, x, y };
    });
  }, [trendSeries, activeMetric]);

  const chartPath = useMemo(() => {
    if (!chartPoints.length) return '';
    return chartPoints
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }, [chartPoints]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h6">Unable to load scenario results</Typography>
          <Typography variant="body2" color="text.secondary">
            Please try again.
          </Typography>
          <Button variant="contained" onClick={handleRetry}>
            Retry
          </Button>
        </Stack>
      </Paper>
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

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 4 }}>
      <Stack spacing={4}>
        <Box>
          <Breadcrumbs separator={<NextIcon fontSize="small" />} aria-label="breadcrumb">
            <Typography color="text.secondary" variant="body2">
              {scenario?.campaign_name || 'Campaign'}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {scenario?.name || 'Scenario'}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {safeMyCumulative?.player_type || safeMyCumulative?.type || 'Player Type'}
            </Typography>
            <Typography color="primary" variant="body2" fontWeight={600}>
              Final Results
            </Typography>
          </Breadcrumbs>
        </Box>

        <Box>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h4" fontWeight="bold">
              Scenario Results
            </Typography>
            <Chip label={resolvedIsProducer ? 'Producer' : 'Consumer'} color={resolvedIsProducer ? 'primary' : 'secondary'} />
            <Chip label={myFinalRank > 0 ? `Final Rank #${myFinalRank}` : 'Final Rank n/a'} color="success" variant="outlined" />
          </Stack>
          <Typography variant="body1" color="text.secondary">
            Completed rounds: {totalRoundsDisplay}
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Key Performance Indicators
          </Typography>
          <Grid container spacing={3} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderColor: '#2196f3', borderWidth: 2, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <ProfitIcon sx={{ color: '#2196f3' }} />
                    <Typography variant="subtitle2" color="text.secondary">{resolvedIsProducer ? 'Total Revenue' : 'Total Costs'}</Typography>
                  </Stack>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: normalizeNumber(resolvedIsProducer ? totalRevenueDisplay : totalCostsDisplay) >= 0 ? 'success.main' : 'error.main' }}>
                    {formatCurrency(normalizeNumber(resolvedIsProducer ? totalRevenueDisplay : totalCostsDisplay))}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderColor: '#4caf50', borderWidth: 2, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <RevenueIcon sx={{ color: '#4caf50' }} />
                    <Typography variant="subtitle2" color="text.secondary">{resolvedIsProducer ? 'Total Profit' : 'Coverage'}</Typography>
                  </Stack>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#4caf50' }}>
                    {resolvedIsProducer
                      ? formatCurrency(normalizeNumber(totalProfitDisplay))
                      : `${normalizeNumber(totalCoverageDisplay).toFixed(1)}%`}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderColor: '#ff9800', borderWidth: 2, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <CO2Icon sx={{ color: '#ff9800' }} />
                    <Typography variant="subtitle2" color="text.secondary">{terms.totalCo2Label}</Typography>
                  </Stack>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#ff9800' }}>
                    {formatInt(totalCo2Display)} kg
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ borderColor: '#9c27b0', borderWidth: 2, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <EnergyIcon sx={{ color: '#9c27b0' }} />
                    <Typography variant="subtitle2" color="text.secondary">{resolvedIsProducer ? 'Total Dispatched' : 'Total Consumed'}</Typography>
                  </Stack>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#9c27b0' }}>
                    {formatMwh(totalDispatchedDisplay)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        <Box>
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChartIcon color="primary" /> KPI Development by Round
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <ToggleButtonGroup
                size="small"
                value={chartMetric}
                exclusive
                onChange={(_, value) => value && setChartMetric(value)}
              >
                {resolvedIsProducer ? (
                  <>
                    <ToggleButton value="revenue">Revenue</ToggleButton>
                    <ToggleButton value="profit">Profit</ToggleButton>
                    <ToggleButton value="co2">CO₂</ToggleButton>
                    <ToggleButton value="dispatched">Dispatched</ToggleButton>
                  </>
                ) : (
                  <>
                    <ToggleButton value="costs">Costs</ToggleButton>
                    <ToggleButton value="coverage">Coverage</ToggleButton>
                    <ToggleButton value="co2">CO₂</ToggleButton>
                    <ToggleButton value="dispatched">Consumed</ToggleButton>
                  </>
                )}
              </ToggleButtonGroup>

              {chartPoints.length > 0 ? (
                <>
                  <Box sx={{ width: '100%', overflowX: 'auto' }}>
                    <svg viewBox="0 0 900 240" width="100%" height="240" role="img" aria-label="KPI trend by round">
                      <rect x="0" y="0" width="900" height="240" fill="#fafafa" rx="8" />
                      <path d="M 48 216 L 852 216" stroke="#e0e0e0" strokeWidth="1" />
                      <path d={chartPath} stroke={activeChartMeta.color} strokeWidth="3" fill="none" />
                      {chartPoints.map((p) => (
                        <g key={p.round}>
                          <circle cx={p.x} cy={p.y} r="4" fill={activeChartMeta.color} />
                          <text x={p.x} y="232" fontSize="11" textAnchor="middle" fill="#666">R{p.round}</text>
                        </g>
                      ))}
                    </svg>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Metric: {activeChartMeta.label} • Latest: {activeChartMeta.formatter(chartPoints[chartPoints.length - 1]?.value || 0)}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No round history available for chart.</Typography>
              )}
            </Stack>
          </Paper>
        </Box>

        {challengeHistory.length > 0 ? (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChallengeIcon color="warning" />
              Challenge Summary
            </Typography>
            <Paper sx={{ p: 3, bgcolor: 'rgba(255, 152, 0, 0.05)' }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">Total Challenge Points</Typography>
                      <Typography variant="h5" color="success.main">
                        {totalChallengePoints} / {maxChallengePoints}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">Rounds Passed</Typography>
                      <Typography variant="h5" color="primary.main">
                        {challengesPassed} / {challengeRoundsDenominator}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">Success Rate</Typography>
                      <Typography variant="h5" color={challengesPassed === challengeHistory.length ? 'success.main' : 'warning.main'}>
                        {challengeHistory.length > 0 ? Math.round((challengesPassed / challengeHistory.length) * 100) : 0}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
              
              <Typography variant="body2" color="text.secondary">
                Total challenge points: {totalChallengePoints}/{maxChallengePoints} • Passed rounds: {challengesPassed}/{challengeRoundsDenominator}
              </Typography>
            </Paper>
          </Box>
        ) : (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChallengeIcon color="warning" />
              Challenge Summary
            </Typography>
            <Paper sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No challenges in this scenario.
              </Typography>
            </Paper>
          </Box>
        )}

        <Box>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
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
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{resolvedIsProducer ? 'Total Revenue (ZAR)' : 'Total Costs (ZAR)'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{resolvedIsProducer ? 'Total Dispatched (MWh)' : 'Total Consumed (MWh)'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{resolvedIsProducer ? 'Total CO₂ (kg)' : `${terms.totalCo2Label} (kg)`}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {safeRanking.map((player, index) => {
                  const isMe = safeMyCumulative && player?.player_id === safeMyCumulative.player_id;
                  return (
                    <TableRow 
                      key={player?.player_id || `player-${index}`}
                      sx={{ 
                        bgcolor: isMe ? 'action.selected' : 'inherit',
                        fontWeight: isMe ? 600 : 400
                      }}
                    >
                      <TableCell>
                        #{index + 1}
                      </TableCell>
                      <TableCell>
                        {player?.email || '-'}
                        {isMe && <Chip label="You" size="small" color="primary" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{player?.player_type || player?.type || '-'}</TableCell>
                      <TableCell align="right">{formatInt(player?.total_profit)}</TableCell>
                      <TableCell align="right">{resolvedIsProducer ? formatInt(player?.total_revenue) : formatInt(Math.abs(Number(player?.total_revenue || 0)))}</TableCell>
                      <TableCell align="right">{formatInt(player?.total_dispatched_mwh)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatInt(player?.total_co2_emissions)}</TableCell>
                    </TableRow>
                  );
                })}
                {safeRanking.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>
                      No ranking data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {trendSeries.length > 0 && (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Round History
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Round</TableCell>
                    {resolvedIsProducer ? (
                      <>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Profit</TableCell>
                        <TableCell align="right">{terms.co2ColumnLabel}</TableCell>
                        <TableCell align="right">Dispatched</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell align="right">Costs</TableCell>
                        <TableCell align="right">Coverage</TableCell>
                        <TableCell align="right">{terms.co2ColumnLabel}</TableCell>
                        <TableCell align="right">Consumed</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trendSeries.map((round) => (
                    <TableRow key={round.round}>
                      <TableCell>Round {round.round}</TableCell>
                      {resolvedIsProducer ? (
                        <>
                          <TableCell align="right">{formatCurrency(round.revenue)}</TableCell>
                          <TableCell align="right">{formatCurrency(round.profit)}</TableCell>
                          <TableCell align="right">{formatInt(round.co2)} kg</TableCell>
                          <TableCell align="right">{formatMwh(round.dispatched)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell align="right">{formatCurrency(round.costs)}</TableCell>
                          <TableCell align="right">{normalizeNumber(round.coverage).toFixed(1)}%</TableCell>
                          <TableCell align="right">{formatInt(round.co2)} kg</TableCell>
                          <TableCell align="right">{formatMwh(round.dispatched)}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
        </Stack>
      </Stack>
      </Paper>
    </Box>
  );
}
