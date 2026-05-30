import React, { useEffect, useMemo, useState } from 'react';
import {
  IconButton,
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
  Tooltip
} from '@mui/material';
import {
  Public as MarketOverviewIcon,
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
import {
  buildCompositionSection,
  buildGroupedRankingSections,
  buildParticipantsCard,
  buildPriceCard,
  buildVolumeCard,
  buildZoneSection,
  normalizeMarketSummary,
  summarizeMarketFromRanking,
} from '../utils/marketOverview'
import ContextAssistantDialog from './ContextAssistantDialog';
import MarketOverviewDialog from './MarketOverviewDialog';
import MarketOverviewTrendPanel from './MarketOverviewTrendPanel';
import MarketStructureChartPanel from './MarketStructureChartPanel';

/**
 * ScenarioResultsScreen - Final cumulative results and ranking
 * Displayed when scenario is complete
 */
export default function ScenarioResultsScreen({ sessionId, onHome, scenario, playerRole }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMetrics, setSelectedMetrics] = useState(null); // null = not yet initialised
  const [marketOverviewOpen, setMarketOverviewOpen] = useState(false);
  const [marketOverviewTrendRounds, setMarketOverviewTrendRounds] = useState([]);
  const [marketOverviewTrendLoading, setMarketOverviewTrendLoading] = useState(false);
  const [marketOverviewTrendLoaded, setMarketOverviewTrendLoaded] = useState(false);

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

  useEffect(() => {
    setMarketOverviewTrendRounds([]);
    setMarketOverviewTrendLoading(false);
    setMarketOverviewTrendLoaded(false);
  }, [sessionId]);

  useEffect(() => {
    let isCancelled = false;

    if (!marketOverviewOpen || !sessionId || marketOverviewTrendLoading || marketOverviewTrendLoaded) {
      return () => {};
    }

    const fetchTrend = async () => {
      setMarketOverviewTrendLoading(true);
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/replay`);
        if (!isCancelled) {
          setMarketOverviewTrendRounds(Array.isArray(data?.rounds) ? data.rounds : []);
        }
      } catch (err) {
        console.error('Failed to load market overview trend:', err);
        if (!isCancelled) {
          setMarketOverviewTrendRounds([]);
        }
      } finally {
        if (!isCancelled) {
          setMarketOverviewTrendLoading(false);
          setMarketOverviewTrendLoaded(true);
        }
      }
    };

    fetchTrend();
    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOverviewOpen, marketOverviewTrendLoaded, sessionId]);

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
  const { my_cumulative, final_ranking, round_history, total_rounds, market_summary } = safeResults;
  const safeRanking = Array.isArray(final_ranking)
    ? final_ranking.filter((row) => row && typeof row === 'object')
    : [];
  const safeMyCumulative = (my_cumulative && typeof my_cumulative === 'object') ? my_cumulative : null;
  const myFinalRank = safeMyCumulative
    ? (safeRanking.findIndex((r) => r?.player_id === safeMyCumulative?.player_id) + 1)
    : 0;

  const challengeHistory = Array.isArray(safeMyCumulative?.challenge_history) ? safeMyCumulative.challenge_history : [];
  const latestChallengeEntry = useMemo(() => {
    if (!challengeHistory.length) return null;
    return [...challengeHistory].sort((a, b) => Number(a?.round || 0) - Number(b?.round || 0)).at(-1) || null;
  }, [challengeHistory]);
  const latestChallengeResults = Array.isArray(latestChallengeEntry?.result?.results)
    ? latestChallengeEntry.result.results
    : [];
  const scenarioChallengeResults = latestChallengeResults.filter((item) => !item?.per_round);
  const totalChallengePoints = scenarioChallengeResults.reduce((sum, item) => sum + Number(item?.points || 0), 0);
  const maxChallengePoints = scenarioChallengeResults.reduce((sum, item) => sum + Number(item?.max_points || 0), 0);
  const challengesPassed = scenarioChallengeResults.filter((item) => item?.passed).length;

  const playerTypeOptions = Array.isArray(scenario?.config?.player_types)
    ? scenario.config.player_types
    : (Array.isArray(scenario?.player_types) ? scenario.player_types : []);
  const scenarioDevices = Array.isArray(scenario?.config?.devices)
    ? scenario.config.devices
    : [];

  const deviceTypeById = useMemo(() => {
    const map = {};
    scenarioDevices.forEach((item) => {
      if (!item || typeof item !== 'object' || !item.id) return;
      map[String(item.id)] = String(item.type || '').toLowerCase();
    });
    return map;
  }, [scenarioDevices]);

  const inferRoleFromAnyHint = (hint) => {
    const roleHint = String(hint || '').toLowerCase();
    if (roleHint.includes('producer') || roleHint.includes('generator')) return 'producer';
    if (roleHint.includes('consumer') || roleHint.includes('buyer')) return 'consumer';
    return null;
  };

  const classifyDeviceType = (deviceTypeRaw) => {
    const deviceType = String(deviceTypeRaw || '').toLowerCase();
    const isLoad = deviceType.includes('load') || deviceType.includes('consumer') || deviceType.includes('demand');
    const isGeneration =
      deviceType.includes('coal')
      || deviceType.includes('gas')
      || deviceType.includes('hydro')
      || deviceType.includes('nuclear')
      || deviceType.includes('pv')
      || deviceType.includes('solar')
      || deviceType.includes('wind')
      || deviceType.includes('generator')
      || deviceType.includes('plant');
    if (isLoad && !isGeneration) return 'consumer';
    if (isGeneration && !isLoad) return 'producer';
    return 'unknown';
  };

  const inferRoleFromTypeId = (typeId) => {
    const target = String(typeId || '');
    if (!target) return null;
    const playerType = playerTypeOptions.find((item) => String(item?.id || '') === target);
    if (!playerType || !Array.isArray(playerType.devices)) return null;

    let hasProducerDevice = false;
    let hasConsumerDevice = false;
    playerType.devices.forEach((deviceId) => {
      const kind = classifyDeviceType(deviceTypeById[String(deviceId)] || '');
      if (kind === 'producer') hasProducerDevice = true;
      if (kind === 'consumer') hasConsumerDevice = true;
    });

    if (hasProducerDevice && !hasConsumerDevice) return 'producer';
    if (hasConsumerDevice && !hasProducerDevice) return 'consumer';
    return null;
  };

  const myInferredRole =
    inferRoleFromAnyHint(playerRole)
    || inferRoleFromAnyHint(safeMyCumulative?.player_role)
    || inferRoleFromTypeId(safeMyCumulative?.player_type || safeMyCumulative?.type)
    || ((Number(safeMyCumulative?.total_revenue || 0) < 0) ? 'consumer' : 'producer');

  const resolvedIsProducer = myInferredRole !== 'consumer';
  const terms = getRoleTerminology(resolvedIsProducer);

  // Set role-appropriate default metrics once role is known
  useEffect(() => {
    if (results && selectedMetrics === null) {
      setSelectedMetrics(resolvedIsProducer ? ['profit', 'revenue'] : ['costs', 'coverage']);
    }
  }, [results, resolvedIsProducer]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSelectedMetrics = selectedMetrics ?? (resolvedIsProducer ? ['profit', 'revenue'] : ['costs', 'coverage']);
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
      costs: normalizeNumber(r.total_costs_zar),  // always explicit from backend
      atc_dispatch_cost: normalizeNumber(r.atc_dispatch_cost),
      imbalance_cost: normalizeNumber(r.imbalance_cost),
      co2: normalizeNumber(r.co2_emissions_kg),
      dispatched: normalizeNumber(r.dispatched_mwh),
      planned: normalizeNumber(r.planned_mwh),
      smp: normalizeNumber(r.smp),
      total_score: normalizeNumber(r.total_score),
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
  const assistantContext = {
    page: 'scenario_results',
    session: {
      id: sessionId,
      total_rounds: totalRoundsDisplay,
    },
    scenario: {
      description: scenario?.description || scenario?.config?.description || '',
      campaign_name: scenario?.campaign_name || 'Campaign',
      name: scenario?.name || 'Scenario',
      general: scenario?.config?.general || {},
      market: scenario?.config?.market || {},
      events: scenario?.config?.events || [],
      challenges: scenario?.config?.challenges || [],
      scoring: scenario?.config?.scoring || {},
      grid: scenario?.config?.grid || {},
      player_types: (scenario?.config?.player_types || []).map(pt => ({
        id: pt.id,
        name: pt.name,
        description: pt.description || '',
        devices: pt.devices || [],
      })),
      devices: (scenario?.config?.devices || []).map(d => ({
        id: d.id,
        name: d.name || d.id,
        type: d.type,
        zone: d.zone ?? null,
        capacity_mw: d.capacity_mw ?? d.max_power_mw ?? null,
        baseline_load_mw: d.baseline_load_mw ?? null,
        peak_load_mw: d.peak_load_mw ?? null,
        variable_cost_tiers: d.variable_cost_tiers ?? null,
        cost_per_mwh_zar: d.cost_per_mwh_zar ?? d.marginal_cost ?? null,
        min_load_pct: d.min_load_pct ?? null,
        ramp_rate_mw_per_h: d.ramp_rate_mw_per_h ?? null,
        efficiency_pct: d.efficiency_pct ?? null,
        capacity_factor_pct: d.capacity_factor_pct ?? null,
        bid_count: d.bid_count ?? null,
        enable_multi_bid: d.enable_multi_bid ?? null,
        drm_capable: d.drm_capable ?? null,
      })),
    },
    player: {
      role: myInferredRole,
      final_rank: myFinalRank,
      type_id: safeMyCumulative?.player_type || safeMyCumulative?.type || null,
      type_name: resolvePlayerTypeLabel(safeMyCumulative?.player_type || safeMyCumulative?.type || 'Player Type'),
      email: safeMyCumulative?.email || null,
    },
    leaderboard: safeRanking,
    trend_series: trendSeries,
    final_results: safeResults,
  };

  const scenarioMarketOverview = useMemo(() => {
    const scenarioMarketSummary = normalizeMarketSummary(
      market_summary || summarizeMarketFromRanking({
        ranking: safeRanking,
        totalVolumeMwh: safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_dispatched_mwh), 0),
        dispatchedAccessor: (row) => row?.total_dispatched_mwh,
        roleAccessor: (row) => row?.player_role,
        revenueAccessor: (row) => row?.total_revenue,
      })
    );
    const totalPlayers = safeRanking.length;
    const totalRevenue = safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_revenue), 0);
    const totalProfit = safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_profit), 0);
    const totalCosts = safeRanking.reduce((sum, row) => sum + Math.abs(normalizeNumber(row?.total_revenue < 0 ? row?.total_revenue : row?.total_costs_zar)), 0);
    const totalCo2 = safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_co2_emissions), 0);
    const totalDispatched = safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_dispatched_mwh), 0);
    const avgScore = totalPlayers > 0
      ? safeRanking.reduce((sum, row) => sum + normalizeNumber(row?.total_score), 0) / totalPlayers
      : 0;
    const compositionSection = buildCompositionSection(scenarioMarketSummary, formatInt);
    const zoneSection = buildZoneSection(scenarioMarketSummary, formatCurrency, formatInt);
    const summarySection = {
      title: 'Scenario-wide summary',
      rows: [
        { label: 'Total settlement revenue across real players', value: formatCurrency(totalRevenue) },
        { label: 'Approx. total costs across real players', value: formatCurrency(totalCosts) },
        { label: 'Challenge rounds captured', value: String(challengeHistory.length) },
        { label: 'Real player share of producer side', value: `${scenarioMarketSummary.realPlayers.producerSharePct.toFixed(1)}%` },
        { label: 'Real player share of consumer side', value: `${scenarioMarketSummary.realPlayers.consumerSharePct.toFixed(1)}%` },
      ],
    };
    const leaderboardSection = {
      title: 'Final leaderboard (top 8)',
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'player', label: 'Player' },
        { key: 'type', label: 'Type' },
        { key: 'score', label: 'Score', align: 'right' },
        { key: 'profit', label: resolvedIsProducer ? 'Profit' : 'Net Result', align: 'right' },
      ],
      rows: safeRanking.slice(0, 8).map((row, index) => ({
        key: row?.player_id || index,
        rank: `#${index + 1}`,
        player: row?.email || `Player ${row?.player_id || '-'}`,
        type: resolvePlayerTypeLabel(row?.player_type || row?.type || '-'),
        score: normalizeNumber(row?.total_score).toFixed(1),
        profit: formatCurrency(row?.total_profit || 0),
      })),
    };
    const rankingEntries = safeRanking.map((row, index) => ({
      key: row?.player_id || row?.email || index,
      rank: `#${row?.rank || index + 1}`,
      player: row?.email || `Player ${row?.player_id || '-'}`,
      type: resolvePlayerTypeLabel(row?.player_type || row?.type || '-'),
      score: normalizeNumber(row?.total_score).toFixed(1),
      primaryValue: formatCurrency(row?.total_profit || 0),
    }));

    return {
      cards: [
        buildVolumeCard(scenarioMarketSummary, formatInt),
        { key: 'profit', title: 'Total Market Profit', value: formatCurrency(totalProfit), caption: `Real players · average score ${avgScore.toFixed(1)}` },
        buildPriceCard(scenarioMarketSummary),
        { key: 'co2', title: 'Total CO₂', value: `${formatInt(totalCo2)} kg`, caption: `Real players · total settlement revenue ${formatCurrency(totalRevenue)}` },
      ].filter(Boolean),
      sections: [compositionSection, zoneSection, summarySection, leaderboardSection].filter(Boolean),
      overviewSections: [summarySection, leaderboardSection].filter(Boolean),
      marketMixSections: [compositionSection, zoneSection].filter(Boolean),
      rankingEntries,
    };
  }, [safeRanking, totalRoundsDisplay, challengeHistory.length, resolvedIsProducer, market_summary]);

  const scenarioMarketOverviewTabs = [
    {
      id: 'overview',
      label: 'Overview',
      cards: scenarioMarketOverview.cards,
      sections: scenarioMarketOverview.overviewSections,
    },
    {
      id: 'market-mix',
      label: 'Market Mix',
      sections: scenarioMarketOverview.marketMixSections.length > 0
        ? scenarioMarketOverview.marketMixSections
        : [{ title: 'Market mix', items: [{ text: 'No market composition data available for this scenario.' }] }],
    },
    {
      id: 'ranking',
      label: 'Ranking',
      sections: buildGroupedRankingSections({
        entries: scenarioMarketOverview.rankingEntries,
        title: 'Final ranking',
        scoreLabel: 'Score',
        valueLabel: resolvedIsProducer ? 'Profit' : 'Net Result',
      }),
    },
    {
      id: 'session-trend',
      label: 'Session Trend',
      content: marketOverviewTrendLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <MarketOverviewTrendPanel
          rounds={marketOverviewTrendRounds}
          selectedRound={Number(totalRoundsDisplay) || null}
          formatPrice={(value) => `${normalizeNumber(value).toFixed(1)} ZAR/MWh`}
          formatVolume={formatMwh}
        />
      ),
    },
    {
      id: 'merit-order',
      label: 'Merit Order',
      content: (
        <MarketStructureChartPanel
          sessionId={sessionId}
          roundNum={totalRoundsDisplay || null}
          roundSpan={Number(scenario?.config?.general?.round_span_hours || 6)}
          startTime={scenario?.config?.general?.start_time || '00:00'}
        />
      ),
    },
  ];

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

  // All available chart metrics with metadata
  const ALL_CHART_METRICS = useMemo(() => [
    { key: 'profit', label: 'Profit (ZAR)', color: '#4caf50', formatter: (v) => formatCurrency(v) },
    { key: 'revenue', label: 'Revenue (ZAR)', color: '#2196f3', formatter: (v) => formatCurrency(v) },
    { key: 'costs', label: 'Costs (ZAR)', color: '#f44336', formatter: (v) => formatCurrency(v) },
    { key: 'smp', label: 'SMP (ZAR/MWh)', color: '#ff9800', formatter: (v) => `${normalizeNumber(v).toFixed(1)} ZAR/MWh` },
    { key: 'co2', label: `${terms.co2ColumnLabel} (kg)`, color: '#795548', formatter: (v) => `${formatInt(v)} kg` },
    { key: 'dispatched', label: resolvedIsProducer ? 'Dispatched (MWh)' : 'Consumed (MWh)', color: '#9c27b0', formatter: (v) => formatMwh(v) },
    { key: 'imbalance_cost', label: 'Imbalance Cost (ZAR)', color: '#e91e63', formatter: (v) => formatCurrency(v) },
    { key: 'atc_dispatch_cost', label: 'ATC Dispatch Cost (ZAR)', color: '#607d8b', formatter: (v) => formatCurrency(v) },
    { key: 'coverage', label: 'Coverage (%)', color: '#00bcd4', formatter: (v) => `${normalizeNumber(v).toFixed(1)}%` },
    { key: 'total_score', label: 'Score', color: '#ffc107', formatter: (v) => normalizeNumber(v).toFixed(1) },
  ], [resolvedIsProducer, terms]);

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) => {
      const current = prev ?? activeSelectedMetrics;
      return current.includes(key)
        ? current.length > 1 ? current.filter((k) => k !== key) : current  // keep at least one
        : [...current, key];
    });
  };

  // Normalize each series to [0,1] range for multi-metric display on same axis
  const multiChartData = useMemo(() => {
    if (!trendSeries.length || !activeSelectedMetrics.length) return { points: {}, ranges: {} };
    const ranges = {};
    activeSelectedMetrics.forEach((key) => {
      const vals = trendSeries.map((r) => normalizeNumber(r[key]));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min;
      ranges[key] = { min, max, span, flat: span < 0.001 };
    });
    const points = {};
    activeSelectedMetrics.forEach((key) => {
      const { min, span, flat } = ranges[key];
      points[key] = trendSeries.map((r, idx) => ({
        round: r.round,
        rawValue: normalizeNumber(r[key]),
        // flat metrics render at mid-height (0.5) instead of bottom
        normValue: flat ? 0.5 : (normalizeNumber(r[key]) - min) / span,
        idx,
      }));
    });
    return { points, ranges };
  }, [trendSeries, activeSelectedMetrics]);

  const kpiCards = resolvedIsProducer
    ? [
        {
          key: 'revenue',
          title: 'Total Revenue',
          icon: <RevenueIcon sx={{ color: '#2196f3' }} />,
          color: '#2196f3',
          value: formatCurrency(normalizeNumber(totalRevenueDisplay))
        },
        {
          key: 'profit',
          title: 'Total Profit',
          icon: <ProfitIcon sx={{ color: '#4caf50' }} />,
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

  const inferPlayerRole = (player) => {
    if (!player || typeof player !== 'object') return 'producer';
    return (
      inferRoleFromAnyHint(player?.player_role)
      || inferRoleFromTypeId(player?.player_type || player?.type)
      || ((Number(player?.total_revenue || 0) < 0) ? 'consumer' : 'producer')
    );
  };

  const leaderboardGroups = useMemo(() => {
    const map = new Map();
    safeRanking.forEach((player) => {
      const typeId = String(player?.player_type || player?.type || 'unknown');
      if (!map.has(typeId)) {
        map.set(typeId, {
          typeId,
          typeLabel: resolvePlayerTypeLabel(typeId),
          role: inferPlayerRole(player),
          rows: []
        });
      }
      map.get(typeId).rows.push(player);
    });
    return Array.from(map.values());
  }, [safeRanking, playerTypeNameById]);

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
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            sx={{ mb: 1 }}
          >
            <Box>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Typography variant="h4" fontWeight="bold">
                  Scenario Results
                </Typography>
                <Chip label={resolvedIsProducer ? 'Producer' : 'Consumer'} color={resolvedIsProducer ? 'primary' : 'secondary'} />
                <Chip label={myFinalRank > 0 ? `Final Rank #${myFinalRank}` : 'Final Rank n/a'} color="success" variant="outlined" />
              </Stack>
            </Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                width: { xs: '100%', md: 'auto' },
                ml: { md: 'auto' },
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <ContextAssistantDialog
                title="Scenario Results Assistant"
                buttonLabel="Ask About Results"
                buttonSize="small"
                buttonSx={{ whiteSpace: 'nowrap' }}
                placeholder="Ask about your final KPIs, rank, trends, or challenge outcomes..."
                intro="Ask questions about the final scenario results. I will answer from your cumulative KPIs, round history, leaderboard, and challenge outcomes."
                contextLabel="Scenario results page context"
                context={assistantContext}
                resetKey={`scenario-results:${sessionId}`}
              />
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<MarketOverviewIcon fontSize="small" />}
                onClick={() => setMarketOverviewOpen(true)}
                aria-label="Open market overview"
                sx={{ whiteSpace: 'nowrap' }}
              >
                Overall Market Overview
              </Button>
            </Stack>
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
            {kpiCards.map((card) => (
              <Grid key={card.key} item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ borderColor: 'divider', borderWidth: 2, height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                      {card.icon}
                      <Typography variant="subtitle2" color="text.secondary">{card.title}</Typography>
                    </Stack>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: card.color }}>
                      {card.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChartIcon color="primary" /> KPI Development by Round
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              {/* Metric toggle chips */}
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {ALL_CHART_METRICS.map((m) => {
                  const active = activeSelectedMetrics.includes(m.key);
                  return (
                    <Chip
                      key={m.key}
                      label={m.label}
                      size="small"
                      onClick={() => toggleMetric(m.key)}
                      sx={{
                        borderColor: m.color,
                        color: active ? '#fff' : m.color,
                        bgcolor: active ? m.color : 'transparent',
                        border: `1.5px solid ${m.color}`,
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: active ? m.color : `${m.color}22` },
                      }}
                    />
                  );
                })}
              </Stack>
              {trendSeries.length > 0 ? (
                <>
                  <Box sx={{ width: '100%', overflowX: 'auto' }}>
                    {(() => {
                      const W = 820; const H = 200; const padX = 20; const padY = 20;
                      const chartW = W - padX; const chartH = H - padY * 2;
                      const n = trendSeries.length;
                      const stepX = n > 1 ? chartW / (n - 1) : 0;
                      const toX = (i) => padX + i * stepX;
                      const toY = (norm) => padY + (1 - norm) * chartH;
                      return (
                        <svg viewBox={`0 0 ${W + 20} ${H + 20}`} width="100%" height={H + 20} role="img" aria-label="Multi-KPI chart">
                          <rect x="0" y="0" width={W + 20} height={H + 20} fill="transparent" />
                          {/* horizontal grid lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                            <line key={v} x1={padX} y1={toY(v)} x2={W} y2={toY(v)} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="4 3" />
                          ))}
                          {/* x-axis labels */}
                          {trendSeries.map((r, i) => (
                            <text key={r.round} x={toX(i)} y={H + 14} fontSize="11" textAnchor="middle" fill="#888">R{r.round}</text>
                          ))}
                          {/* lines per metric */}
                          {activeSelectedMetrics.map((key) => {
                            const meta = ALL_CHART_METRICS.find((m) => m.key === key);
                            const pts = multiChartData.points[key] || [];
                            if (!pts.length || !meta) return null;
                            const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.normValue)}`).join(' ');
                            return (
                              <g key={key}>
                                <path d={path} stroke={meta.color} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
                                {pts.map((p, i) => (
                                  <g key={i}>
                                    <title>{meta.label}: {meta.formatter(p.rawValue)}</title>
                                    <circle cx={toX(i)} cy={toY(p.normValue)} r="4" fill={meta.color} opacity="0.9" />
                                  </g>
                                ))}
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </Box>
                  {/* Legend with latest values */}
                  <Stack direction="row" flexWrap="wrap" gap={2}>
                    {activeSelectedMetrics.map((key) => {
                      const meta = ALL_CHART_METRICS.find((m) => m.key === key);
                      const last = trendSeries[trendSeries.length - 1];
                      if (!meta || !last) return null;
                      return (
                        <Stack key={key} direction="row" alignItems="center" spacing={0.5}>
                          <Box sx={{ width: 12, height: 3, bgcolor: meta.color, borderRadius: 1 }} />
                          <Typography variant="caption" color="text.secondary">
                            {meta.label}: <strong>{meta.formatter(normalizeNumber(last[key]))}</strong>
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Curves are normalized to the same 0–100% scale for comparison. Hover dots for exact values.
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">No round history available for chart.</Typography>
              )}
            </Stack>
          </Paper>
        </Box>

        {scenarioChallengeResults.length > 0 ? (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChallengeIcon color="warning" />
              Scenario Challenges
            </Typography>
            <Stack spacing={2}>
              <Paper sx={{ p: 2, bgcolor: 'rgba(255, 152, 0, 0.05)' }}>
                <Typography variant="body2" color="text.secondary">
                  Final scenario-wide evaluation (Round {latestChallengeEntry?.round || '-'}) • Points: {totalChallengePoints}/{maxChallengePoints} • Passed: {challengesPassed}/{scenarioChallengeResults.length}
                </Typography>
              </Paper>
              <Grid container spacing={2}>
                {scenarioChallengeResults.map((challenge, idx) => {
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
                              Target: {challenge?.operator || '-'} {formatChallengeValue(challenge?.target)}
                            </Typography>
                            <Typography variant="body2">
                              Achieved: {formatChallengeValue(challenge?.actual)}
                            </Typography>
                            <Typography variant="body2" sx={{ color: passed ? 'success.main' : 'error.main', fontWeight: 600 }}>
                              {passed ? 'Passed' : 'Not achieved'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Points: {challenge?.points || 0}/{challenge?.max_points || 0}
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
              Scenario Challenges
            </Typography>
            <Paper sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No scenario-wide challenges in this scenario.
              </Typography>
            </Paper>
          </Box>
        )}

        <Box>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Final Leaderboard
          </Typography>
          <Stack spacing={2}>
            {leaderboardGroups.map((group) => {
              const groupIsProducer = group.role !== 'consumer';
              const groupTerms = getRoleTerminology(groupIsProducer);
              return (
                <Paper key={group.typeId} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, pb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{group.typeLabel}</Typography>
                    <Chip
                      size="small"
                      label={groupIsProducer ? 'Producer' : 'Consumer'}
                      color={groupIsProducer ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Rank</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Player</TableCell>
                          {groupIsProducer ? (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total Profit (ZAR)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total Revenue (ZAR)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total Dispatched (MWh)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total CO₂ (kg)</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total Costs (ZAR)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Redispatch Cost ATC (ZAR)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Coverage (%)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>Total Consumed (MWh)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>{groupTerms.totalCo2Label} (kg)</TableCell>
                            </>
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {group.rows.map((player, index) => {
                          const isMe = safeMyCumulative && player?.player_id === safeMyCumulative.player_id;
                          const coverage = normalizeNumber(player?.total_planned_mwh) > 0
                            ? (normalizeNumber(player?.total_dispatched_mwh) / normalizeNumber(player?.total_planned_mwh)) * 100
                            : 0;
                          return (
                            <TableRow
                              key={player?.player_id || `player-${index}`}
                              sx={{
                                bgcolor: isMe ? 'action.selected' : 'inherit',
                                fontWeight: isMe ? 600 : 400
                              }}
                            >
                              <TableCell>#{player?.rank || '-'}</TableCell>
                              <TableCell>
                                {player?.email || '-'}
                                {isMe && <Chip label="You" size="small" color="primary" sx={{ ml: 1 }} />}
                              </TableCell>
                              {groupIsProducer ? (
                                <>
                                  <TableCell align="right">{formatInt(player?.total_profit)}</TableCell>
                                  <TableCell align="right">{formatInt(player?.total_revenue)}</TableCell>
                                  <TableCell align="right">{formatInt(player?.total_dispatched_mwh)}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatInt(player?.total_co2_emissions)}</TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell align="right">{formatInt(Math.abs(Number(player?.total_revenue || 0)))}</TableCell>
                                  <TableCell align="right" sx={{ color: normalizeNumber(player?.total_atc_dispatch_cost) > 0.5 ? 'error.main' : 'text.secondary' }}>
                                    {normalizeNumber(player?.total_atc_dispatch_cost) > 0.5 ? formatInt(player.total_atc_dispatch_cost) : '-'}
                                  </TableCell>
                                  <TableCell align="right">{normalizeNumber(coverage).toFixed(1)}%</TableCell>
                                  <TableCell align="right">{formatInt(player?.total_dispatched_mwh)}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatInt(player?.total_co2_emissions)}</TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              );
            })}

            {leaderboardGroups.length === 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  No ranking data available.
                </Typography>
              </Paper>
            )}
          </Stack>
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
                        <TableCell align="right">Imbalance Cost</TableCell>
                        <TableCell align="right">{terms.co2ColumnLabel}</TableCell>
                        <TableCell align="right">Dispatched</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell align="right">Costs</TableCell>
                        <TableCell align="right">Redispatch Cost (ATC)</TableCell>
                        <TableCell align="right">Imbalance Cost</TableCell>
                        <TableCell align="right">Coverage</TableCell>
                        <TableCell align="right">{terms.co2ColumnLabel}</TableCell>
                        <TableCell align="right">Consumed</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trendSeries.map((round) => (
                    <TableRow key={`round-${round.round}`}>
                      <TableCell>Round {round.round}</TableCell>
                      {resolvedIsProducer ? (
                        <>
                          <TableCell align="right">{formatCurrency(round.revenue)}</TableCell>
                          <TableCell align="right">{formatCurrency(round.profit)}</TableCell>
                          <TableCell align="right" sx={{ color: round.imbalance_cost > 0.5 ? 'warning.main' : 'text.secondary' }}>
                            {round.imbalance_cost > 0.5 ? formatCurrency(round.imbalance_cost) : '-'}
                          </TableCell>
                          <TableCell align="right">{formatInt(round.co2)} kg</TableCell>
                          <TableCell align="right">{formatMwh(round.dispatched)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell align="right">{formatCurrency(round.costs)}</TableCell>
                          <TableCell align="right" sx={{ color: round.atc_dispatch_cost > 0.5 ? 'error.main' : 'text.secondary' }}>
                            {round.atc_dispatch_cost > 0.5 ? formatCurrency(round.atc_dispatch_cost) : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: round.imbalance_cost > 0.5 ? 'warning.main' : 'text.secondary' }}>
                            {round.imbalance_cost > 0.5 ? formatCurrency(round.imbalance_cost) : '-'}
                          </TableCell>
                          <TableCell align="right">{normalizeNumber(round.coverage).toFixed(1)}%</TableCell>
                          <TableCell align="right">{formatInt(round.co2)} kg</TableCell>
                          <TableCell align="right">{formatMwh(round.dispatched)}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
<TableRow sx={{ bgcolor: 'grey.100', fontWeight: 'bold' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                      {resolvedIsProducer ? (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(trendSeries.reduce((s, r) => s + r.revenue, 0))}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(trendSeries.reduce((s, r) => s + r.profit, 0))}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: trendSeries.reduce((s, r) => s + r.imbalance_cost, 0) > 0.5 ? 'warning.main' : 'text.secondary' }}>
                            {trendSeries.reduce((s, r) => s + r.imbalance_cost, 0) > 0.5 ? formatCurrency(trendSeries.reduce((s, r) => s + r.imbalance_cost, 0)) : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatInt(trendSeries.reduce((s, r) => s + r.co2, 0))} kg</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatMwh(trendSeries.reduce((s, r) => s + r.dispatched, 0))}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(trendSeries.reduce((s, r) => s + r.costs, 0))}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: trendSeries.reduce((s, r) => s + r.atc_dispatch_cost, 0) > 0.5 ? 'error.main' : 'text.secondary' }}>
                            {trendSeries.reduce((s, r) => s + r.atc_dispatch_cost, 0) > 0.5 ? formatCurrency(trendSeries.reduce((s, r) => s + r.atc_dispatch_cost, 0)) : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: trendSeries.reduce((s, r) => s + r.imbalance_cost, 0) > 0.5 ? 'warning.main' : 'text.secondary' }}>
                            {trendSeries.reduce((s, r) => s + r.imbalance_cost, 0) > 0.5 ? formatCurrency(trendSeries.reduce((s, r) => s + r.imbalance_cost, 0)) : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {normalizeNumber(trendSeries.reduce((s, r) => s + r.planned, 0)) > 0
                              ? `${((trendSeries.reduce((s, r) => s + r.dispatched, 0) / trendSeries.reduce((s, r) => s + r.planned, 0)) * 100).toFixed(1)}%`
                              : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatInt(trendSeries.reduce((s, r) => s + r.co2, 0))} kg</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatMwh(trendSeries.reduce((s, r) => s + r.dispatched, 0))}</TableCell>
                        </>
                      )}
                    </TableRow>
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
      <MarketOverviewDialog
        open={marketOverviewOpen}
        onClose={() => setMarketOverviewOpen(false)}
        title="Overall Market Overview"
        subtitle={`${scenario?.campaign_name || 'Campaign'} · ${scenario?.name || 'Scenario'}`}
        tabs={scenarioMarketOverviewTabs}
        defaultTabId="overview"
      />
      </Paper>
    </Box>
  );
}
