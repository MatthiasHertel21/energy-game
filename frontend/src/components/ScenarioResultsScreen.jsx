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
  Divider
} from '@mui/material';
import {
  NavigateNext as NextIcon,
  TrendingUp as RevenueIcon,
  AccountBalanceWallet as ProfitIcon,
  Cloud as CO2Icon,
  EmojiEvents as ChallengeIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
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
  const formatChallengeValue = (value) => {
    if (Array.isArray(value)) {
      if (value.length === 2) return `${formatInt(value[0])} – ${formatInt(value[1])}`;
      return value.map((item) => formatInt(item)).join(', ');
    }
    const num = Number(value);
    if (Number.isFinite(num)) return formatInt(num);
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
  };

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
  const latestChallengeEntry = useMemo(() => {
    if (!challengeHistory.length) return null;
    return [...challengeHistory].sort((a, b) => Number(a?.round || 0) - Number(b?.round || 0)).at(-1) || null;
  }, [challengeHistory]);
  const latestChallengeResults = Array.isArray(latestChallengeEntry?.result?.results)
    ? latestChallengeEntry.result.results
    : [];
  const totalChallengePoints = Number(latestChallengeEntry?.result?.total_points || 0);
  const maxChallengePoints = Number(latestChallengeEntry?.result?.max_points || 0);
  const challengesPassed = latestChallengeResults.filter((item) => item?.passed).length;

  const playerTypeOptions = Array.isArray(scenario?.config?.player_types)
    ? scenario.config.player_types
    : (Array.isArray(scenario?.player_types) ? scenario.player_types : []);
  const playerTypeNameById = useMemo(() => {
    const map = {};
    playerTypeOptions.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (!item.id) return;
      map[String(item.id)] = item.name || String(item.id);
    });
    return map;
  }, [playerTypeOptions]);

  const resolvePlayerTypeLabel = (value) => {
    const key = String(value || '');
    if (!key) return '-';
    return playerTypeNameById[key] || key;
  };

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

  const kpiCards = resolvedIsProducer
    ? [
        {
          key: 'revenue',
          title: 'Total Revenue',
          icon: <ProfitIcon sx={{ color: '#2196f3' }} />,
          color: '#2196f3',
          value: formatCurrency(normalizeNumber(totalRevenueDisplay))
        },
        {
          key: 'profit',
          title: 'Total Profit',
          icon: <RevenueIcon sx={{ color: '#4caf50' }} />,
          color: '#4caf50',
          value: formatCurrency(normalizeNumber(totalProfitDisplay))
        },
        {
          key: 'co2',
          title: terms.totalCo2Label,
          icon: <CO2Icon sx={{ color: '#ff9800' }} />,
          color: '#ff9800',
          value: `${formatInt(totalCo2Display)} kg`
        },
        {
          key: 'dispatched',
          title: 'Total Dispatched',
          icon: <EnergyIcon sx={{ color: '#9c27b0' }} />,
          color: '#9c27b0',
          value: formatMwh(totalDispatchedDisplay)
        }
      ]
    : [
        {
          key: 'costs',
          title: 'Total Costs',
          icon: <ProfitIcon sx={{ color: '#2196f3' }} />,
          color: '#2196f3',
          value: formatCurrency(normalizeNumber(totalCostsDisplay))
        },
        {
          key: 'coverage',
          title: 'Coverage',
          icon: <RevenueIcon sx={{ color: '#4caf50' }} />,
          color: '#4caf50',
          value: `${normalizeNumber(totalCoverageDisplay).toFixed(1)}%`
        },
        {
          key: 'co2',
          title: terms.totalCo2Label,
          icon: <CO2Icon sx={{ color: '#ff9800' }} />,
          color: '#ff9800',
          value: `${formatInt(totalCo2Display)} kg`
        },
        {
          key: 'dispatched',
          title: 'Total Consumed',
          icon: <EnergyIcon sx={{ color: '#9c27b0' }} />,
          color: '#9c27b0',
          value: formatMwh(totalDispatchedDisplay)
        }
      ];

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
              {resolvePlayerTypeLabel(safeMyCumulative?.player_type || safeMyCumulative?.type || 'Player Type')}
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
            {kpiCards.map((card) => {
              const selected = activeMetric === card.key;
              return (
                <Grid key={card.key} item xs={12} sm={6} md={3}>
                  <Card
                    variant="outlined"
                    onClick={() => setChartMetric(card.key)}
                    sx={{
                      borderColor: selected ? card.color : 'divider',
                      borderWidth: selected ? 3 : 2,
                      bgcolor: selected ? 'action.selected' : 'background.paper',
                      cursor: 'pointer',
                      height: '100%'
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                        {card.icon}
                        <Typography variant="subtitle2" color="text.secondary">{card.title}</Typography>
                      </Stack>
                      <Typography variant="h5" sx={{ fontWeight: 600, color: card.color }}>
                        {card.value}
                      </Typography>
                      {selected && (
                        <Chip label="Selected" size="small" color="primary" variant="outlined" sx={{ mt: 1.2 }} />
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChartIcon color="primary" /> KPI Development by Round
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
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

        {latestChallengeResults.length > 0 ? (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChallengeIcon color="warning" />
              Challenges
            </Typography>
            <Stack spacing={2}>
              <Paper sx={{ p: 2, bgcolor: 'rgba(255, 152, 0, 0.05)' }}>
                <Typography variant="body2" color="text.secondary">
                  Final evaluation (Round {latestChallengeEntry?.round || '-'}) • Points: {totalChallengePoints}/{maxChallengePoints} • Passed: {challengesPassed}/{latestChallengeResults.length}
                </Typography>
              </Paper>
              <Grid container spacing={2}>
                {latestChallengeResults.map((challenge, idx) => {
                  const passed = Boolean(challenge?.passed);
                  return (
                    <Grid key={`${challenge?.challenge_id || challenge?.name || 'challenge'}-${idx}`} item xs={12} sm={6} md={4}>
                      <Card
                        variant="outlined"
                        sx={{
                          height: '100%',
                          borderColor: passed ? 'success.main' : 'error.main',
                          borderWidth: 2,
                          bgcolor: passed ? 'success.50' : 'error.50'
                        }}
                      >
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="subtitle1" fontWeight={600}>
                              {challenge?.name || 'Challenge'}
                            </Typography>
                            {passed ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
                          </Stack>
                          <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">
                              Metric: {challenge?.metric || '-'}
                            </Typography>
                            <Typography variant="body2">
                              Ziel: {challenge?.operator || '-'} {formatChallengeValue(challenge?.target)}
                            </Typography>
                            <Typography variant="body2">
                              Erreicht: {formatChallengeValue(challenge?.actual)}
                            </Typography>
                            <Typography variant="body2" sx={{ color: passed ? 'success.main' : 'error.main', fontWeight: 600 }}>
                              {passed ? 'Erreicht' : 'Nicht erreicht'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Punkte: {challenge?.points || 0}/{challenge?.max_points || 0}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Stack>
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
                      <TableCell>{resolvePlayerTypeLabel(player?.player_type || player?.type || '-')}</TableCell>
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
