import React, { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Paper,
  Alert,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Breadcrumbs,
  Button,
  Divider,
  IconButton,
  FormControlLabel,
  Switch,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableContainer,
  TableRow
} from '@mui/material'
import {
  Public as MarketOverviewIcon,
  ExpandMore as ExpandMoreIcon,
  NavigateNext as NextIcon,
  TrendingUp as RevenueIcon,
  AccountBalanceWallet as ProfitIcon,
  Cloud as CO2Icon,
  Bolt as EnergyIcon,
  Money as CostIcon,
  Info as InfoIcon
} from '@mui/icons-material'
import api from '../services/api'
import DeviceDeepDiveTabs from './DeviceDeepDiveTabs'
import { getRoleTerminology } from '../utils/roleTerminology'
import {
  buildCompositionSection,
  buildActiveEventsSection,
  buildGroupedRankingSections,
  buildParticipantsCard,
  buildPhaseMixSections,
  buildPriceCard,
  buildVolumeCard,
  buildZoneMixMatrixSection,
  buildZoneSection,
  normalizeMarketSummary,
  summarizeMarketFromRanking,
} from '../utils/marketOverview'
import ContextAssistantDialog from './ContextAssistantDialog'
import MarketOverviewDialog from './MarketOverviewDialog'
import MarketOverviewTrendPanel from './MarketOverviewTrendPanel'
import MarketStructureChartPanel from './MarketStructureChartPanel'

/**
 * RoundResultsScreenSimple - Simplified round results showing basic info only
 */
export default function RoundResultsScreenSimple({ sessionId, round, mode = 'shared_market', scenario, campaignName, onAdvance, initialBreakdownKey = null }) {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [breakdownKey, setBreakdownKey] = useState(initialBreakdownKey)
  const [showCumulative, setShowCumulative] = useState(false)
  const [cumulativeKpis, setCumulativeKpis] = useState(null)
  const [roundHistoryKpis, setRoundHistoryKpis] = useState([])
  const [marketOverviewOpen, setMarketOverviewOpen] = useState(false)
  const [marketOverviewTrendRounds, setMarketOverviewTrendRounds] = useState([])
  const [marketOverviewTrendLoading, setMarketOverviewTrendLoading] = useState(false)
  const [marketOverviewTrendLoaded, setMarketOverviewTrendLoaded] = useState(false)

  const normalizeNumber = (value) => {
    const num = Number(value ?? 0)
    return Number.isFinite(num) ? num : 0
  }

  const normalizeKpis = (kpis = {}) => ({
    ...kpis,
    revenue_zar: normalizeNumber(kpis.revenue_zar),
    profit_zar: normalizeNumber(kpis.profit_zar),
    variable_cost_zar: normalizeNumber(kpis.variable_cost_zar),
    fixed_cost_zar: normalizeNumber(kpis.fixed_cost_zar),
    imbalance_cost_zar: normalizeNumber(kpis.imbalance_cost_zar),
    battery_charge_cost_zar: normalizeNumber(kpis.battery_charge_cost_zar),
    atc_dispatch_cost_zar: normalizeNumber(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar),
    grid_constraint_cost_zar: normalizeNumber(kpis.grid_constraint_cost_zar),
    grid_constraint_cost_per_mwh_zar: normalizeNumber(kpis.grid_constraint_cost_per_mwh_zar),
    curtailment_cost_zar: normalizeNumber(kpis.curtailment_cost_zar),
    curtailment_mwh: normalizeNumber(kpis.curtailment_mwh),
    imbalance_mwh: normalizeNumber(kpis.imbalance_mwh),
    grid_curtailed_mwh: normalizeNumber(kpis.grid_curtailed_mwh),
    congestion_revenue_zar: normalizeNumber(kpis.congestion_revenue_zar),
    co2_emissions_kg: normalizeNumber(kpis.co2_emissions_kg),
    dispatched_mwh: normalizeNumber(kpis.dispatched_mwh),
    planned_mwh: normalizeNumber(kpis.planned_mwh),
    actual_mwh: normalizeNumber(kpis.actual_mwh),
    zone_shortfall_mwh: normalizeNumber(kpis.zone_shortfall_mwh)
  })

  useEffect(() => {
    if (!sessionId || !round) return

    const fetchData = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/round-results/${round}`)
        setResults(data)
        
        // Fetch all rounds up to current for cumulative calculation and anomaly context
        if (round > 1) {
          const allRounds = []
          const history = []
          for (let r = 1; r <= round; r++) {
            try {
              const { data: roundData } = await api.get(`/api/sessions/${sessionId}/round-results/${r}`)
              if (roundData?.my_result?.kpis) {
                const normalized = normalizeKpis(roundData.my_result.kpis)
                allRounds.push(normalized)
                history.push({ round: r, kpis: normalized })
              }
            } catch (err) {
              // A round whose results are not computed yet returns 404; that is an
              // expected transient state (e.g. during a round transition), so skip
              // it silently instead of polluting the console.
              if (err?.response?.status !== 404) {
                console.warn(`Failed to fetch round ${r}:`, err)
              }
            }
          }
          setRoundHistoryKpis(history)
          
          // Calculate cumulative KPIs
          const cumulative = {
            revenue_zar: allRounds.reduce((sum, k) => sum + k.revenue_zar, 0),
            profit_zar: allRounds.reduce((sum, k) => sum + k.profit_zar, 0),
            variable_cost_zar: allRounds.reduce((sum, k) => sum + k.variable_cost_zar, 0),
            fixed_cost_zar: allRounds.reduce((sum, k) => sum + k.fixed_cost_zar, 0),
            imbalance_cost_zar: allRounds.reduce((sum, k) => sum + k.imbalance_cost_zar, 0),
            battery_charge_cost_zar: allRounds.reduce((sum, k) => sum + k.battery_charge_cost_zar, 0),
            atc_dispatch_cost_zar: allRounds.reduce((sum, k) => sum + k.atc_dispatch_cost_zar, 0),
            grid_constraint_cost_zar: allRounds.reduce((sum, k) => sum + k.grid_constraint_cost_zar, 0),
            curtailment_cost_zar: allRounds.reduce((sum, k) => sum + k.curtailment_cost_zar, 0),
            congestion_revenue_zar: allRounds.reduce((sum, k) => sum + k.congestion_revenue_zar, 0),
            co2_emissions_kg: allRounds.reduce((sum, k) => sum + k.co2_emissions_kg, 0),
            dispatched_mwh: allRounds.reduce((sum, k) => sum + k.dispatched_mwh, 0),
            planned_mwh: allRounds.reduce((sum, k) => sum + k.planned_mwh, 0),
            actual_mwh: allRounds.reduce((sum, k) => sum + k.actual_mwh, 0),
            zone_shortfall_mwh: allRounds.reduce((sum, k) => sum + k.zone_shortfall_mwh, 0),
          }
          setCumulativeKpis(cumulative)
        }
      } catch (error) {
        // 404 simply means the results for this round are not available yet
        // (round still being computed, or the player navigated away). Render the
        // graceful "No results available" empty state instead of logging an error.
        if (error?.response?.status === 404) {
          setResults(null)
        } else {
          console.error('Failed to load data:', error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [sessionId, round])

  useEffect(() => {
    setMarketOverviewTrendRounds([])
    setMarketOverviewTrendLoading(false)
    setMarketOverviewTrendLoaded(false)
  }, [sessionId])

  useEffect(() => {
    let isCancelled = false

    if (!marketOverviewOpen || !sessionId || marketOverviewTrendLoading || marketOverviewTrendLoaded) {
      return () => {}
    }

    const fetchTrend = async () => {
      setMarketOverviewTrendLoading(true)
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/replay`)
        if (!isCancelled) {
          setMarketOverviewTrendRounds(Array.isArray(data?.rounds) ? data.rounds : [])
        }
      } catch (error) {
        console.error('Failed to load market overview trend:', error)
        if (!isCancelled) {
          setMarketOverviewTrendRounds([])
        }
      } finally {
        if (!isCancelled) {
          setMarketOverviewTrendLoading(false)
          setMarketOverviewTrendLoaded(true)
        }
      }
    }

    fetchTrend()
    return () => {
      isCancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOverviewOpen, marketOverviewTrendLoaded, sessionId])
  
  const handleAdvance = async () => {
    if (!onAdvance) return
    setAdvancing(true)
    try {
      await onAdvance()
    } catch (error) {
      console.error('Failed to advance:', error)
      setAdvancing(false)
    }
  }

  const hasResults = Boolean(results)
  const my_result = results?.my_result || {}
  const ranking = Array.isArray(results?.ranking) ? results.ranking : []
  const currentKpis = normalizeKpis(my_result?.kpis || {})
  const kpis = showCumulative && cumulativeKpis ? cumulativeKpis : currentKpis
  const playerZoneInfo = my_result?.player_zone_info || {}
  const rawZoneResults = Array.isArray(my_result?.zone_results) ? my_result.zone_results : []
  const rawLinkResults = Array.isArray(my_result?.link_results) ? my_result.link_results : []
  const configuredZones = Math.max(1, Number(
    scenario?.config?.grid?.zones
    ?? scenario?.grid?.zones
    ?? results?.market_summary?.zone_breakdown?.length
    ?? rawZoneResults.length
    ?? 1
  ))
  const isMultiZone = configuredZones > 1
  const balancingSettings = my_result?.balancing_settings || {}
  const balancingUpPrice = Number(balancingSettings?.up_price_zar_per_mwh || 1200)
  const balancingDownPrice = Number(balancingSettings?.down_price_zar_per_mwh || 800)
  const playerRole = my_result?.player_role
  const roleFromBreakdown = my_result?.da_id_breakdown?.is_consumer
  const resolvedRole = playerRole
    || (roleFromBreakdown === true ? 'consumer' : roleFromBreakdown === false ? 'producer' : '')
  const isProducer = resolvedRole.includes('producer') || resolvedRole.includes('generator')
  const isConsumer = !isProducer
  const terms = getRoleTerminology(isProducer)
  const roleLabel = isProducer ? 'Producer' : 'Consumer'
  const plannedVolumeLabel = terms.plannedVolumeLabel || 'Planned'
  
  // Get data from results and scenario
  const displayCampaignName = campaignName || scenario?.campaign_name || 'Campaign'
  const scenarioName = scenario?.name || 'Scenario'
  
  // Look up player type name from scenario config
  const playerTypeId = my_result?.type
  const playerTypes = scenario?.config?.player_types || []
  const playerTypeNameById = {}
  playerTypes.forEach((playerTypeOption) => {
    if (!playerTypeOption || typeof playerTypeOption !== 'object' || !playerTypeOption.id) return
    playerTypeNameById[String(playerTypeOption.id)] = playerTypeOption.name || String(playerTypeOption.id)
  })
  const resolvePlayerTypeLabel = (value) => {
    const key = String(value || '')
    if (!key) return '-'
    return playerTypeNameById[key] || key
  }
  const playerTypeName = resolvePlayerTypeLabel(playerTypeId || 'Player Type')
  const challengeResult = my_result?.challenge_result || {}
  const challengeItems = Array.isArray(challengeResult?.results) ? challengeResult.results : []
  const perRoundChallengeItems = challengeItems.filter((item) => Boolean(item?.per_round))
  const passedPerRoundChallengeCount = perRoundChallengeItems.filter((item) => item?.passed).length
  const totalPerRoundChallengePoints = perRoundChallengeItems.reduce((sum, item) => sum + Number(item?.points || 0), 0)
  const maxPerRoundChallengePoints = perRoundChallengeItems.reduce((sum, item) => sum + Number(item?.max_points || 0), 0)
  const hasDamHistory = Boolean(my_result?.dam_bid_dispatch && Object.keys(my_result.dam_bid_dispatch || {}).length > 0)
  const hasCurrentRoundIdmDispatch = Boolean(my_result?.idm_bid_dispatch && Object.keys(my_result.idm_bid_dispatch || {}).length > 0)
  const currentRoundHourlyResults = Array.isArray(my_result?.hourly_results) ? my_result.hourly_results : []
  const hasCurrentRoundClearing = currentRoundHourlyResults.some((entry) => (
    normalizeNumber(entry?.volume) > 0
    || normalizeNumber(entry?.smp) > 0
    || normalizeNumber(entry?.id_volume_mwh) > 0
  ))
  const showBaselineOnlyNotice = Number(round) > 1 && hasDamHistory && !hasCurrentRoundIdmDispatch && !hasCurrentRoundClearing

  const challengeSummaryText = `Round ${round}: ${passedPerRoundChallengeCount}/${perRoundChallengeItems.length} round goals achieved. Points: ${totalPerRoundChallengePoints}/${maxPerRoundChallengePoints}.`

  const getTradingStatusForRound = (marketKey) => {
    const marketsCfg = scenario?.config?.markets || {}
    const roundIdx = Math.max(0, Number(round || 1) - 1)
    const marketData = marketsCfg?.[marketKey]

    if (Array.isArray(marketData)) {
      return marketData[roundIdx] ?? 'market_code'
    }
    if (marketData && typeof marketData === 'object') {
      const tradingArray = marketData.trading
      if (Array.isArray(tradingArray)) {
        return tradingArray[roundIdx] ?? 'market_code'
      }
    }
    return 'market_code'
  }

  const hasIdmTradingThisRound = (Number(round) > 1 && getTradingStatusForRound('idm') !== 'off') || (() => {
    // Two-phase rounds clear IDM within the same round (incl. round 1).
    const tpr = scenario?.config?.general?.two_phase_rounds
    const roundIdx = Math.max(0, Number(round || 1) - 1)
    return Array.isArray(tpr) && Boolean(tpr[roundIdx])
      && getTradingStatusForRound('dam') === 'on'
      && getTradingStatusForRound('idm') === 'on'
  })()
  
  // Get player name from email
  const playerEmail = my_result?.email || 'Player'
  const playerName = playerEmail.split('@')[0] // Use part before @ as name
  
  // Format numbers
  const formatInt = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return '0'
    return Math.round(num).toLocaleString('en-US')
  }
  
  const formatCurrency = (value) => `ZAR ${formatInt(value)}`
  const formatSignedCurrency = (value) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return 'ZAR 0'
    if (Math.abs(num) < 0.5) return '± ZAR 0'
    return `${num >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(num))}`
  }
  const formatDecimal = (value, digits = 1) => {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num)) return '0'
    return num.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  }

  const formatPct = (value) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return '—'
    return `${Math.round(num)}%`
  }

  const formatChallengeValue = (metric, value) => {
    const metricKey = String(metric || '')
    if (metricKey.includes('profit') || metricKey.includes('revenue') || metricKey.includes('cost')) {
      return formatCurrency(value || 0)
    }
    if (metricKey.includes('co2')) {
      return `${formatInt(value || 0)} kg`
    }
    if (metricKey.includes('dispatched') || metricKey.includes('curtailment') || metricKey.includes('coverage') || metricKey.includes('imbalance')) {
      return `${formatInt(value || 0)} MWh`
    }
    return formatInt(value || 0)
  }

  // NOTE: Do not add hooks below early returns (loading / no results).
  // These helpers are plain functions and safe to define here.
  const getDeviceLabel = (deviceId) => {
    const devices = scenario?.config?.devices || []
    const cfg = devices.find(d => String(d?.id) === String(deviceId))
    return cfg?.name || cfg?.label || String(deviceId)
  }

  const deriveHourColumns = (hourlyBreakdown, deviceHourlyBreakdown) => {
    if (Array.isArray(hourlyBreakdown) && hourlyBreakdown.length > 0) {
      return hourlyBreakdown.map(h => h?.hour).filter(h => h !== undefined && h !== null)
    }
    const firstDev = Object.keys(deviceHourlyBreakdown || {})[0]
    const rows = firstDev ? deviceHourlyBreakdown[firstDev] : []
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(r => r?.hour).filter(h => h !== undefined && h !== null)
    }
    return []
  }

  const renderHourMatrixTable = (rows, hourColumns, renderCell, valueHeader = 'Value') => {
    if (!rows?.length || !hourColumns?.length) {
      return (
        <Typography variant="body2" color="text.secondary">
          No per-hour detail data available for this round.
        </Typography>
      )
    }

    return (
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 180 }}>{valueHeader}</TableCell>
              {hourColumns.map((h) => (
                <TableCell key={String(h)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                  H{h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.label}</TableCell>
                {hourColumns.map((h, hIdx) => (
                  <TableCell key={`${row.key}:${String(h)}`} align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {renderCell(row, hIdx)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  const bidTierLabel = (bidKey) => {
    if (bidKey === 'A') return 'Base'
    if (bidKey === 'B') return 'Mid'
    if (bidKey === 'C') return 'Peak'
    return String(bidKey || '')
  }

  const findBidHourEntry = (rows, hourValue, hourOffset) => {
    if (!Array.isArray(rows) || rows.length === 0) return null
    const byScenarioHour = rows.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const explicitHour = entry.hour_idx ?? entry.scenario_hour_idx
      return Number(explicitHour) === Number(hourValue)
    })
    if (byScenarioHour) return byScenarioHour

    const byOffset = rows.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const offset = entry.hour_offset ?? entry.round_hour_offset ?? entry.hour
      return Number(offset) === Number(hourOffset)
    })
    if (byOffset) return byOffset

    return rows[hourOffset] || null
  }

  const findHourlyBreakdownEntry = (rows, hourValue, hourOffset) => {
    if (!Array.isArray(rows) || rows.length === 0) return null
    const byHour = rows.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const explicitHour = entry.hour ?? entry.hour_idx ?? entry.scenario_hour_idx
      return Number(explicitHour) === Number(hourValue)
    })
    if (byHour) return byHour

    const byOffset = rows.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const offset = entry.hour_offset ?? entry.round_hour_offset
      return Number(offset) === Number(hourOffset)
    })
    if (byOffset) return byOffset

    return rows[hourOffset] || null
  }
  
  // Get current time
  const currentTime = new Date().toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  
  const breakdownConfig = {
    revenue: {
      title: 'Revenue',
      description: 'Market revenue from cleared energy in this round.'
    },
    profit: {
      title: 'Profit breakdown',
      description: 'Profit = Revenue − Variable Cost − Fixed Cost − Imbalance Cost − Battery Charge Cost − Redispatch Cost (ATC) + Congestion Revenue'
    },
    co2: {
      title: terms.co2BreakdownTitle,
      description: terms.co2BreakdownDescription
    },
    dispatched: {
      title: 'Dispatched energy',
      description: 'Total dispatched energy volume in this round.'
    },
    consumed: {
      title: 'Consumed energy',
      description: 'Total consumed energy volume in this round.'
    },
    demand: {
      title: terms.coverageCardLabel || 'Demand coverage',
      description: isProducer
        ? 'Dispatched energy versus offered energy.'
        : 'Delivered energy versus planned demand.'
    },
    costs: {
      title: 'Total Costs (Procurement)',
      description: 'Procurement cost = |settlement revenue| for energy cleared at market price. Imbalance and ATC costs are separate settlement components explained in the round notes and profit breakdown, not in this procurement card.'
    }
  }

  const openBreakdown = (key) => setBreakdownKey(key)
  const closeBreakdown = () => setBreakdownKey(null)

  const currentRoundNotes = (() => {
    const notes = []
    const revenue = Number(currentKpis.revenue_zar || 0)
    const profit = Number(currentKpis.profit_zar || 0)
    const dispatched = Number(currentKpis.dispatched_mwh || 0)
    const planned = Number(currentKpis.planned_mwh || 0)
    const co2 = Number(currentKpis.co2_emissions_kg || 0)
    const totalCosts = Number(currentKpis.variable_cost_zar || 0) + Number(currentKpis.fixed_cost_zar || 0) + Number(currentKpis.imbalance_cost_zar || 0) + Number(currentKpis.battery_charge_cost_zar || 0) + Number(currentKpis.atc_dispatch_cost_zar || 0)
    const demandCoveragePct = planned > 0 ? (dispatched / planned) * 100 : null
    const zoneStatus = String(playerZoneInfo?.zone_status || '')
    const zoneShortfall = Number(playerZoneInfo?.zone_unserved_demand_mwh || currentKpis.zone_shortfall_mwh || 0)
    const zoneBalancingSupport = Number(playerZoneInfo?.zone_balancing_support_mwh || currentKpis.zone_balancing_support_mwh || 0)
    const zoneImports = Number(playerZoneInfo?.zone_imports_mwh || 0)
    const zoneExports = Number(playerZoneInfo?.zone_exports_mwh || 0)
    const zoneCoverage = Number(playerZoneInfo?.zone_coverage_total_pct || 0)
    const bindingLinks = (Array.isArray(my_result?.link_results) ? my_result.link_results : []).filter((link) => Boolean(link?.binding))
    const connectedBindingLinks = (Array.isArray(playerZoneInfo?.zone_links) ? playerZoneInfo.zone_links : []).filter((zoneLink) => {
      return bindingLinks.some((link) => {
        const fromZone = Number(link?.from_zone || 0)
        const toZone = Number(link?.to_zone || 0)
        const peerZone = Number(zoneLink?.peer_zone || 0)
        const zoneId = Number(playerZoneInfo?.zone_id || 0)
        return (fromZone === zoneId && toZone === peerZone) || (toZone === zoneId && fromZone === peerZone)
      })
    })
    const gridConstraintCost = Number(currentKpis.atc_dispatch_cost_zar || currentKpis.grid_constraint_cost_zar || 0)
    const gridCurtailedMwh = Number(currentKpis.grid_curtailed_mwh || 0)

    if (isProducer) {
      if (Math.abs(revenue) < 1) {
        notes.push('Revenue is 0: This round produced effectively no billable market revenue (e.g., little/no cleared dispatch or fully offsetting delta positions).')
      }

      if (Math.abs(totalCosts) < 1) {
        notes.push('Costs are 0: No relevant variable, fixed, or imbalance costs were incurred in this round.')
      }

      if (Math.abs(co2) < 1) {
        notes.push('CO₂ is 0: Either no fossil dispatch occurred, or the round had no relevant dispatched volume with a non-zero emission factor.')
      }

      if (profit < 0) {
        notes.push('Profit is negative: After adding any congestion revenue, the sum of variable costs, fixed costs, imbalance costs, and possible redispatch cost (ATC) still exceeded achieved revenue.')
      }

      if (gridCurtailedMwh > 0.001) {
        notes.push(`Network constraints curtailed ${formatInt(gridCurtailedMwh)} MWh of your commercially cleared generation after market clearing. This is constrained-off energy due to limited export capability or congested paths, not classical imbalance.`)
      }
    } else {
      if (Math.abs(revenue) < 1) {
        notes.push('Total costs are 0: No relevant market procurement was settled in this round.')
      }
      if (demandCoveragePct !== null && demandCoveragePct < 95) {
        notes.push(`Demand coverage is low: only ${demandCoveragePct.toFixed(1)}% of planned demand was delivered in this round.`)
      } else if (demandCoveragePct !== null && demandCoveragePct > 100.1) {
        notes.push(`Demand coverage is above 100% (${demandCoveragePct.toFixed(1)}%): delivered volume exceeded planned demand in this round (e.g., additional intraday procurement or balancing effects).`)
      }
      if (profit < 0) {
        notes.push('Net result is negative: procurement, imbalance, and possible redispatch cost (ATC), net of any congestion revenue, exceeded positive settlement effects in this round.')
      }
    }

    if (zoneStatus === 'supply_shortfall') {
      notes.push(`Network constraints caused a zonal shortfall: your zone covered ${formatPct(zoneCoverage)} of demand, imported ${formatInt(zoneImports)} MWh, but still left ${formatInt(zoneShortfall)} MWh unserved.`)
    } else if (zoneStatus === 'balancing_supported_supply') {
      notes.push(`Your zone faced a physical network shortfall, but balancing energy covered ${formatInt(zoneBalancingSupport)} MWh, so final demand coverage remained ${formatPct(zoneCoverage)}.`)
    } else if (zoneStatus === 'grid_supported_supply') {
      notes.push(`Your zone depended on the network this round: local supply was insufficient and ${formatInt(zoneImports)} MWh had to be imported to avoid a shortfall.`)
    }

    if (connectedBindingLinks.length > 0) {
      const bindingText = connectedBindingLinks
        .slice(0, 2)
        .map((link) => `Zone ${link.peer_zone} (${formatPct(link.utilization_pct)} utilization, ${link.direction === 'in' ? 'import path' : 'export path'})`)
        .join(' · ')
      notes.push(`Binding network links affected your zone: ${bindingText}${connectedBindingLinks.length > 2 ? ' …' : ''}. These links were at their transfer limit and restricted additional imports or exports.`)
    }

    if (gridConstraintCost > 0.5) {
      notes.push(`Redispatch cost (ATC) of ${formatCurrency(gridConstraintCost)} arises from network limits and any balancing support needed to maintain delivery in your zone — separate from imbalance caused by bidding or scheduling deviations.`)
    }

    if (Number(currentKpis.imbalance_cost_zar || 0) > 0.5 || Number(currentKpis.imbalance_mwh || 0) > 0.001) {
      notes.push(`Imbalance settlement in this scenario uses configured balancing prices: ${formatCurrency(balancingUpPrice)} per MWh for positive imbalance and ${formatCurrency(balancingDownPrice)} per MWh for negative imbalance.`)
    }

    const previous = roundHistoryKpis
      .filter((entry) => Number(entry.round) < Number(round))
      .map((entry) => entry.kpis)

    if (previous.length >= 2) {
      const avg = (arr, key) => arr.reduce((sum, item) => sum + Number(item[key] || 0), 0) / arr.length
      const avgRevenue = avg(previous, 'revenue_zar')
      const avgProfit = avg(previous, 'profit_zar')
      const avgDispatch = avg(previous, 'dispatched_mwh')
      const avgCoverage = avg(previous, 'planned_mwh') > 0
        ? (avgDispatch / avg(previous, 'planned_mwh')) * 100
        : 0

      const strongDeviation = (value, baseline) => {
        const absBaseline = Math.abs(baseline)
        if (absBaseline < 1) return Math.abs(value - baseline) > 1000
        return Math.abs(value - baseline) / absBaseline >= 0.6
      }

      if (
        strongDeviation(revenue, avgRevenue)
        || strongDeviation(profit, avgProfit)
        || strongDeviation(dispatched, avgDispatch)
        || (isConsumer && demandCoveragePct !== null && Math.abs(demandCoveragePct - avgCoverage) >= 15)
      ) {
        notes.push('This round deviates strongly from previous rounds. Typical drivers are changed market prices, different gate phases, special events, or major bid/dispatch changes.')
      }
    }

    if (notes.length === 0) {
      notes.push('KPI values are unremarkable in this round and consistent with hourly aggregation.')
    }

    return notes
  })()

  const assistantContext = {
    page: 'round_results',
    session: {
      id: sessionId,
      round,
      mode,
      campaign_name: displayCampaignName,
      scenario_name: scenarioName,
      current_time: currentTime,
      current_view: showCumulative && cumulativeKpis ? `scenario_kpis_rounds_1_to_${round}` : 'round_kpis',
    },
    player: {
      name: playerName,
      email: playerEmail,
      role: resolvedRole || roleLabel.toLowerCase(),
      type_id: playerTypeId || null,
      type_name: playerTypeName,
    },
    scenario: {
      description: scenario?.description || scenario?.config?.description || '',
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
    current_kpis: currentKpis,
    cumulative_kpis: cumulativeKpis,
    round_history_kpis: roundHistoryKpis,
    ranking,
    active_events: Array.isArray(results?.active_events) ? results.active_events : [],
    player_zone_info: playerZoneInfo,
    balancing_settings: balancingSettings,
    round_notes: currentRoundNotes,
    my_result: my_result || null,
  }

  const roundMarketSummary = normalizeMarketSummary(
    results?.market_summary || summarizeMarketFromRanking({
      ranking,
      totalVolumeMwh: ranking.reduce((maxVolume, row) => Math.max(maxVolume, normalizeNumber(row?.volume)), 0),
      dispatchedAccessor: (row) => row?.kpis?.dispatched_mwh,
      roleAccessor: (row) => row?.player_role,
      revenueAccessor: (row) => row?.kpis?.revenue_zar,
    })
  )

  const gridOverviewSections = (() => {
    if (!isMultiZone) return []

    const sections = []
    const zoneImpactSection = buildZoneSection(roundMarketSummary, formatCurrency, formatInt)

    if (zoneImpactSection) {
      sections.push(zoneImpactSection)
    }

    if (rawZoneResults.length > 0) {
      sections.push({
        title: 'Physical zone balances',
        columns: [
          { key: 'zone', label: 'Zone' },
          { key: 'status', label: 'Status' },
          ...(rawZoneResults.some((z) => z?.avg_zone_price_zar_per_mwh != null)
            ? [{ key: 'zoneSmp', label: 'Zone SMP', align: 'right' }]
            : []),
          { key: 'localGeneration', label: 'Local Gen', align: 'right' },
          { key: 'localDemand', label: 'Local Demand (served)', align: 'right' },
          { key: 'imports', label: 'Imports', align: 'right' },
          { key: 'exports', label: 'Exports', align: 'right' },
          { key: 'losses', label: 'Losses', align: 'right' },
          { key: 'unserved', label: 'Unserved', align: 'right' },
          { key: 'coverage', label: 'Coverage' },
          { key: 'balancing', label: 'Balancing', align: 'right' },
        ],
        rows: rawZoneResults.map((zone) => ({
          key: `raw-zone-${zone?.zone_id ?? 'x'}`,
          zone: `Zone ${zone?.zone_id ?? '-'}`,
          status: String(zone?.status || '-').replaceAll('_', ' '),
          zoneSmp: zone?.avg_zone_price_zar_per_mwh != null
            ? `${formatCurrency(zone.avg_zone_price_zar_per_mwh)}/MWh`
            : '—',
          localGeneration: `${formatInt(zone?.local_generation_mwh || 0)} MWh`,
          localDemand: `${formatInt(zone?.local_demand_mwh || 0)} MWh`,
          imports: `${formatInt(zone?.imports_mwh || 0)} MWh`,
          exports: `${formatInt(zone?.exports_mwh || 0)} MWh`,
          losses: `${formatInt(zone?.losses_mwh || 0)} MWh`,
          unserved: `${formatInt(zone?.unserved_demand_mwh || 0)} MWh`,
          coverage: `${formatPct(zone?.coverage_local_pct || 0)} local · ${formatPct(zone?.coverage_total_pct || 0)} total`,
          balancing: `${formatInt(zone?.balancing_support_mwh || 0)} MWh · ${formatCurrency(zone?.extra_cost_total_zar || 0)}`,
        })),
      })
    }

    if (rawLinkResults.length > 0) {
      const totalEarnings = rawLinkResults.reduce((s, l) => s + (l?.congestion_earnings_zar || 0), 0)
      const totalLossesValue = rawLinkResults.reduce((s, l) => s + (l?.losses_value_zar || 0), 0)
      const anyBinding = rawLinkResults.some((l) => l?.binding)
      const hasSmp = rawLinkResults.some((l) => l?.zone_from_smp_zar_per_mwh != null)
      sections.push({
        title: 'Interzonal links',
        caption: anyBinding
          ? 'Congestion Earnings = (SMP_to − SMP_from) × Flow. Binding links ⚡ cause zonal price divergence.'
          : 'No binding links this round — all zones cleared at the same price.',
        columns: [
          { key: 'route', label: 'Link' },
          { key: 'atc', label: 'ATC', align: 'right' },
          { key: 'sent', label: 'Sent', align: 'right' },
          { key: 'received', label: 'Received', align: 'right' },
          { key: 'utilization', label: 'Utilization', align: 'right' },
          ...(hasSmp ? [
            { key: 'smpFrom', label: 'SMP Zone from', align: 'right' },
            { key: 'smpTo', label: 'SMP Zone to', align: 'right' },
          ] : []),
          { key: 'losses', label: 'Losses (MWh)', align: 'right' },
          { key: 'lossValue', label: 'Loss Value', align: 'right' },
          { key: 'earnings', label: 'Congestion Earnings', align: 'right' },
        ],
        rows: [
          ...rawLinkResults.map((link, index) => ({
            key: `raw-link-${link?.from_zone ?? 'x'}-${link?.to_zone ?? 'x'}-${index}`,
            route: `Zone ${link?.from_zone ?? '-'} → Zone ${link?.to_zone ?? '-'}`,
            atc: `${formatInt(link?.atc_mwh || 0)} MWh`,
            sent: `${formatInt(link?.flow_mwh || 0)} MWh`,
            received: `${formatInt(link?.flow_received_mwh || 0)} MWh`,
            utilization: link?.binding
              ? `${formatPct(link?.utilization_pct || 0)} ⚡`
              : formatPct(link?.utilization_pct || 0),
            smpFrom: link?.zone_from_smp_zar_per_mwh != null
              ? `${formatCurrency(link.zone_from_smp_zar_per_mwh)}/MWh`
              : '—',
            smpTo: link?.zone_to_smp_zar_per_mwh != null
              ? `${formatCurrency(link.zone_to_smp_zar_per_mwh)}/MWh`
              : '—',
            losses: link?.losses_mwh > 0.001 ? `${formatInt(link.losses_mwh)} MWh` : '—',
            lossValue: (link?.losses_value_zar || 0) > 0.01 ? formatCurrency(link.losses_value_zar) : '—',
            earnings: formatCurrency(link?.congestion_earnings_zar || 0),
            cellSxByKey: link?.binding
              ? { route: { fontWeight: 600 }, utilization: { color: 'warning.dark', fontWeight: 600 }, earnings: { fontWeight: 600, color: 'success.dark' } }
              : {},
          })),
          // Total row
          {
            key: 'link-total',
            route: 'Total',
            atc: '', sent: '', received: '', utilization: '',
            smpFrom: '', smpTo: '',
            losses: '',
            lossValue: totalLossesValue > 0.01 ? formatCurrency(totalLossesValue) : '—',
            earnings: formatCurrency(totalEarnings),
            sx: { '& td': { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.15)' } },
          },
        ],
      })
    }

    if (sections.length > 0) {
      sections.unshift({
        title: 'Grid context',
        items: [{
          text: 'This tab shows the physical network state from the stored round result: one row per zone plus one row per interzonal link. Zone economics come from visible player outcomes; imports, exports, losses and shortfalls come from the raw grid result.'
        }],
      })
    }

    return sections
  })()

  const roundMarketOverview = (() => {
    const sumBy = (rows, key) => rows.reduce((sum, row) => sum + normalizeNumber(row?.kpis?.[key]), 0)
    const totalPlayers = ranking.length
    const totalProfit = sumBy(ranking, 'profit_zar')
    const totalRevenue = sumBy(ranking, 'revenue_zar')
    const totalImbalance = sumBy(ranking, 'imbalance_cost_zar')
    const totalAtc = ranking.reduce((sum, row) => sum + normalizeNumber(row?.kpis?.atc_dispatch_cost_zar ?? row?.kpis?.grid_constraint_cost_zar), 0)
    const totalCo2 = sumBy(ranking, 'co2_emissions_kg')
    const avgScore = totalPlayers > 0
      ? ranking.reduce((sum, row) => sum + normalizeNumber(row?.total_score), 0) / totalPlayers
      : 0
    const topRows = ranking.slice(0, 5).map((row) => ({
      key: row?.player_id || row?.email || row?.rank,
      rank: `#${row?.rank || '-'}`,
      player: row?.email || `Player ${row?.player_id || '-'}`,
      type: resolvePlayerTypeLabel(row?.player_type || row?.type || '-'),
      score: normalizeNumber(row?.total_score).toFixed(1),
      profit: formatCurrency(row?.kpis?.profit_zar || 0),
    }))
    const compositionSection = buildCompositionSection(roundMarketSummary, formatInt)
    const phaseMixSections = buildPhaseMixSections(roundMarketSummary, formatInt)
    const zoneMixSection = buildZoneMixMatrixSection(roundMarketSummary, formatInt)
    const zoneSection = buildZoneSection(roundMarketSummary, formatCurrency, formatInt)
    const summarySection = {
      title: 'Round-wide market summary',
      rows: [
        { label: 'Total profit across real players', value: formatCurrency(totalProfit) },
        { label: 'Total settlement revenue across real players', value: formatCurrency(totalRevenue) },
        { label: 'Active events', value: String(results?.market_summary?.active_events_count ?? (Array.isArray(results?.active_events) ? results.active_events.length : 0)) },
        { label: 'Real player share of producer side', value: `${roundMarketSummary.realPlayers.producerSharePct.toFixed(1)}%` },
        { label: 'Real player share of consumer side', value: `${roundMarketSummary.realPlayers.consumerSharePct.toFixed(1)}%` },
      ],
    }
    const activeEventsSection = buildActiveEventsSection(results?.active_events)
    const topPlayersSection = {
      title: 'Top players this round',
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'player', label: 'Player' },
        { key: 'type', label: 'Type' },
        { key: 'score', label: 'Score', align: 'right' },
        { key: 'profit', label: 'Profit', align: 'right' },
      ],
      rows: topRows,
    }
    const rankingEntries = ranking.map((row, index) => ({
      key: row?.player_id || row?.email || index,
      rank: `#${row?.rank || index + 1}`,
      player: row?.email || `Player ${row?.player_id || '-'}`,
      type: resolvePlayerTypeLabel(row?.player_type || row?.type || '-'),
      score: normalizeNumber(row?.total_score).toFixed(1),
      primaryValue: formatCurrency(row?.kpis?.profit_zar || 0),
    }))

    return {
      cards: [
        buildVolumeCard(roundMarketSummary, formatInt),
        { key: 'profit', title: 'Total Profit', value: formatCurrency(totalProfit), caption: `Real players · settlement revenue ${formatCurrency(totalRevenue)}` },
        buildPriceCard(roundMarketSummary),
        { key: 'imbalance', title: 'Total Imbalance Cost', value: formatCurrency(totalImbalance), caption: `Real players · ATC / Redispatch ${formatCurrency(totalAtc)}` },
        { key: 'co2', title: 'Total CO₂', value: `${formatInt(totalCo2)} kg`, caption: `Real players · average score ${avgScore.toFixed(1)}` },
      ].filter(Boolean),
      sections: [compositionSection, zoneSection, summarySection, activeEventsSection].filter(Boolean),
      overviewSections: [summarySection, activeEventsSection].filter(Boolean),
      marketMixSections: (phaseMixSections.length > 0
        ? [...phaseMixSections, zoneMixSection]
        : [compositionSection, zoneMixSection]).filter(Boolean),
      rankingEntries,
    };
  })()

  const roundMarketOverviewTabs = [
    {
      id: 'overview',
      label: 'Overview',
      cards: roundMarketOverview.cards,
      sections: roundMarketOverview.overviewSections,
    },
    {
      id: 'market-mix',
      label: 'Market Mix',
      sections: roundMarketOverview.marketMixSections.length > 0
        ? roundMarketOverview.marketMixSections
        : [{ title: 'Market mix', items: [{ text: 'No market composition data available for this round.' }] }],
    },
    ...(isMultiZone ? [{
      id: 'grids',
      label: 'Grids',
      sections: gridOverviewSections.length > 0
        ? gridOverviewSections
        : [{ title: 'Grids', items: [{ text: 'No zonal grid data available for this round.' }] }],
    }] : []),
    {
      id: 'ranking',
      label: 'Ranking',
      sections: buildGroupedRankingSections({
        entries: roundMarketOverview.rankingEntries,
        title: 'Round ranking',
        scoreLabel: 'Score',
        valueLabel: 'Profit',
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
          selectedRound={Number(round) || null}
          formatPrice={(value) => `${normalizeNumber(value).toFixed(1)} ZAR/MWh`}
          formatVolume={(value) => `${formatInt(value)} MWh`}
        />
      ),
    },
    {
      id: 'merit-order',
      label: 'Merit Order',
      content: (() => {
        const meritRoundNum = Number(round) || 1
        const meritRoundSpan = Number(scenario?.config?.general?.round_span_hours || 6)
        const meritStartTime = scenario?.config?.general?.start_time || '00:00'
        const twoPhaseRounds = scenario?.config?.general?.two_phase_rounds
        const isTwoPhaseRound = Array.isArray(twoPhaseRounds) && Boolean(twoPhaseRounds[meritRoundNum - 1])
        if (!isTwoPhaseRound) {
          return (
            <MarketStructureChartPanel
              sessionId={sessionId}
              roundNum={meritRoundNum}
              roundSpan={meritRoundSpan}
              startTime={meritStartTime}
              historicalMode
            />
          )
        }
        return (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Day-Ahead market (Phase 1)</Typography>
              <MarketStructureChartPanel
                sessionId={sessionId}
                roundNum={meritRoundNum}
                roundSpan={meritRoundSpan}
                startTime={meritStartTime}
                historicalMode
                forcePhase="dam"
              />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Intraday market (Phase 2)</Typography>
              <MarketStructureChartPanel
                sessionId={sessionId}
                roundNum={meritRoundNum}
                roundSpan={meritRoundSpan}
                startTime={meritStartTime}
                historicalMode
                forcePhase="idm"
              />
            </Box>
          </Stack>
        )
      })(),
    },
  ]

  const kpiCompositionNotes = (() => {
    const notes = []
    const breakdown = my_result?.da_id_breakdown || {}
    const deviceBreakdown = my_result?.kpis?.device_hourly_breakdown || {}
    const devicesById = (scenario?.config?.devices || []).reduce((acc, device) => {
      acc[device.id] = device
      return acc
    }, {})
    const parseOptionalNumber = (value) => {
      if (value === undefined || value === null || value === '') return null
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }
    const getNormalizedOverbid = (deviceId, hour) => {
      const deviceType = String(devicesById[deviceId]?.type || '').toLowerCase()
      const isLoad = deviceType.includes('load')
      const totalOffered = normalizeNumber(hour?.total_offered_mw)
      const planned = normalizeNumber(hour?.planned_mw)
      const actual = normalizeNumber(hour?.actual_mw)
      const dispatched = normalizeNumber(hour?.dispatched_mw)
      const effectiveRaw = parseOptionalNumber(hour?.effective_capacity_mw)
      const backendOverbid = parseOptionalNumber(hour?.overbid_mw)
      const effective = isLoad
        ? ((effectiveRaw !== null && effectiveRaw > 0) ? effectiveRaw : Math.max(totalOffered, planned, actual, dispatched))
        : normalizeNumber(hour?.effective_capacity_mw)
      const fallbackOverbid = Math.max(0, totalOffered - effective)
      const preferFallback = isLoad && totalOffered > 0 && effective > 0 && (effectiveRaw === null || effectiveRaw <= 0)
      return (!preferFallback && backendOverbid !== null) ? backendOverbid : fallbackOverbid
    }

    const daRevenue = Number(breakdown.da_revenue_zar || 0)
    const idRevenue = Number(breakdown.id_revenue_zar || 0)
    const totalRevenue = Number(currentKpis.revenue_zar || 0)
    const revenueDelta = totalRevenue - (daRevenue + idRevenue)

    if (Math.abs(daRevenue) > 0.5 || Math.abs(idRevenue) > 0.5) {
      if (isConsumer) {
        notes.push(`Cost settlement composition (signed): DAM ${formatCurrency(daRevenue)} + IDM ${formatCurrency(idRevenue)} = ${formatCurrency(daRevenue + idRevenue)}. KPI settlement value = ${formatCurrency(totalRevenue)} (Total Costs card shows absolute value: ${formatCurrency(Math.abs(totalRevenue))}).`)
      } else {
        notes.push(`Revenue composition: DAM ${formatCurrency(daRevenue)} + IDM ${formatCurrency(idRevenue)} = ${formatCurrency(daRevenue + idRevenue)}. KPI Revenue = ${formatCurrency(totalRevenue)}.`)
      }

      if (Math.abs(revenueDelta) > 1) {
        notes.push(`Settlement reconciliation gap: KPI - (DAM + IDM) = ${formatSignedCurrency(revenueDelta)}. This gap comes from method/scope differences: KPI is summed from current-round hourly settlement, while DAM/IDM attribution is derived from DA baseline + ID delta valuation and then rounded in separate steps.`)
      }
    } else {
      if (isConsumer) {
        notes.push(`Cost settlement composition: KPI settlement (${formatCurrency(totalRevenue)}) comes from the sum of cleared hourly energy volumes × market prices (cost card displays ${formatCurrency(Math.abs(totalRevenue))}).`)
      } else {
        notes.push(`Revenue composition: KPI Revenue (${formatCurrency(totalRevenue)}) comes from the sum of cleared hourly energy volumes × market prices.`)
      }
    }

    const variableCost = Number(currentKpis.variable_cost_zar || 0)
    const fixedCost = Number(currentKpis.fixed_cost_zar || 0)
    const imbalanceCost = Number(currentKpis.imbalance_cost_zar || 0)
    const batteryChargeCost = Number(currentKpis.battery_charge_cost_zar || 0)
    const gridConstraintCost = Number(currentKpis.atc_dispatch_cost_zar || currentKpis.grid_constraint_cost_zar || 0)
    const congestionRevenue = Number(currentKpis.congestion_revenue_zar || 0)
    const zoneStatus = String(playerZoneInfo?.zone_status || '')
    const zoneShortfall = Number(playerZoneInfo?.zone_unserved_demand_mwh || currentKpis.zone_shortfall_mwh || 0)
    const zoneBalancingSupport = Number(playerZoneInfo?.zone_balancing_support_mwh || currentKpis.zone_balancing_support_mwh || 0)
    const zoneImports = Number(playerZoneInfo?.zone_imports_mwh || 0)
    const zoneExports = Number(playerZoneInfo?.zone_exports_mwh || 0)
    const zoneLocalGeneration = Number(playerZoneInfo?.zone_local_generation_mwh || 0)
    const zoneLocalDemand = Number(playerZoneInfo?.zone_local_demand_mwh || 0)
    const zoneLinkCount = Array.isArray(playerZoneInfo?.zone_links) ? playerZoneInfo.zone_links.length : 0
    const gridCurtailedMwh = Number(currentKpis.grid_curtailed_mwh || 0)
    const computedProfit = totalRevenue - variableCost - fixedCost - imbalanceCost - batteryChargeCost - gridConstraintCost + congestionRevenue
    if (isConsumer) {
      notes.push(`Net-result composition: ${formatCurrency(totalRevenue)} - ${formatCurrency(variableCost)} - ${formatCurrency(fixedCost)} - ${formatCurrency(imbalanceCost)} - ${formatCurrency(batteryChargeCost)} - ${formatCurrency(gridConstraintCost)} + ${formatCurrency(congestionRevenue)} = ${formatCurrency(computedProfit)} (KPI Net result: ${formatCurrency(currentKpis.profit_zar || 0)}).`)
    } else {
      notes.push(`Profit composition: ${formatCurrency(totalRevenue)} - ${formatCurrency(variableCost)} - ${formatCurrency(fixedCost)} - ${formatCurrency(imbalanceCost)} - ${formatCurrency(batteryChargeCost)} - ${formatCurrency(gridConstraintCost)} + ${formatCurrency(congestionRevenue)} = ${formatCurrency(computedProfit)} (KPI Profit: ${formatCurrency(currentKpis.profit_zar || 0)}).`)
    }
    if (gridConstraintCost > 0 || zoneShortfall > 0 || zoneBalancingSupport > 0) {
      notes.push(`Redispatch cost (ATC): ${formatCurrency(gridConstraintCost)} from network capacity limits, final zone shortfall ${formatInt(zoneShortfall)} MWh, balancing support ${formatInt(zoneBalancingSupport)} MWh.`)
    }
    if (zoneStatus) {
      notes.push(`Zone context: Zone ${playerZoneInfo?.zone_id || '-'} was ${String(zoneStatus).replaceAll('_', ' ')}, with local generation ${formatInt(zoneLocalGeneration)} MWh, local demand ${formatInt(zoneLocalDemand)} MWh, imports ${formatInt(zoneImports)} MWh, exports ${formatInt(zoneExports)} MWh, and ${zoneLinkCount} connected active link${zoneLinkCount === 1 ? '' : 's'} in the round summary.`)
    }
    if (gridCurtailedMwh > 0.001) {
      notes.push(`Constrained-off generation: ${formatInt(gridCurtailedMwh)} MWh were removed after market clearing because the network could not physically transport all cleared output.`)
    }
    if (zoneShortfall > 0.001 && isConsumer) {
      notes.push(`Shortfall settlement: ${formatInt(zoneShortfall)} MWh in your zone were not physically served. The associated extra cost is shown as Redispatch Cost (ATC), separate from Imbalance Cost.`)
    }
    if (zoneBalancingSupport > 0.001 && isConsumer) {
      notes.push(`Balancing support: ${formatInt(zoneBalancingSupport)} MWh were additionally procured to keep your demand served. The related spread is shown as Redispatch Cost (ATC), not as Imbalance Cost.`)
    }
    if (imbalanceCost > 0.5 || Number(currentKpis.imbalance_mwh || 0) > 0.001) {
      notes.push(`Imbalance cost uses the configured balancing prices, not the market SMP: positive imbalance is settled at ${formatCurrency(balancingUpPrice)}/MWh and negative imbalance at ${formatCurrency(balancingDownPrice)}/MWh.`)
    }

    const deviceRevenueApprox = Object.entries(deviceBreakdown)
      .map(([deviceId, entries]) => {
        const approxRevenue = (Array.isArray(entries) ? entries : []).reduce((sum, hour) => {
          const dispatched = Number(hour?.dispatched_mw || 0)
          const marketPrice = Number(hour?.market_price_zar || 0)
          return sum + dispatched * marketPrice
        }, 0)
        return {
          deviceId,
          name: devicesById[deviceId]?.name || deviceId,
          approxRevenue
        }
      })
      .filter((item) => Number.isFinite(item.approxRevenue) && Math.abs(item.approxRevenue) > 0.5)
      .sort((a, b) => Math.abs(b.approxRevenue) - Math.abs(a.approxRevenue))
      .slice(0, 3)

    if (deviceRevenueApprox.length > 0) {
      const topDevicesText = deviceRevenueApprox
        .map((item) => `${item.name}: ${formatCurrency(isConsumer ? Math.abs(item.approxRevenue) : item.approxRevenue)}`)
        .join(' · ')
      notes.push(isConsumer
        ? `Device cost contributions (approximated from hourly details): ${topDevicesText}.`
        : `Device contributions (approximated from hourly details): ${topDevicesText}.`)
    }

    const overbidSummary = Object.entries(deviceBreakdown).reduce((acc, [deviceId, entries]) => {
      const normalizedEntries = (Array.isArray(entries) ? entries : []).map((hour) => ({
        hour,
        overbidMw: getNormalizedOverbid(deviceId, hour),
      }))
      const deviceOverbid = normalizedEntries.reduce((sum, item) => sum + item.overbidMw, 0)
      if (deviceOverbid > 0.001) {
        acc.total += deviceOverbid
        acc.hours += normalizedEntries.filter((item) => item.overbidMw > 0.001).length
        acc.devices.push({
          name: devicesById[deviceId]?.name || deviceId,
          overbidMw: deviceOverbid
        })
      }
      return acc
    }, { total: 0, hours: 0, devices: [] })

    if (overbidSummary.total > 0.001) {
      const topOverbidDevices = overbidSummary.devices
        .sort((a, b) => b.overbidMw - a.overbidMw)
        .slice(0, 2)
        .map((item) => `${item.name}: ${Math.round(item.overbidMw)} MW`)
        .join(' · ')
      notes.push(isConsumer
        ? `Over-demand: requested volume above effective capacity. In this round: ${Math.round(overbidSummary.total)} MW across ${overbidSummary.hours} device-hours${topOverbidDevices ? ` (${topOverbidDevices})` : ''}.`
        : `Overbid/Over-demand: offered/requested volume above effective capacity. In this round: ${Math.round(overbidSummary.total)} MW across ${overbidSummary.hours} device-hours${topOverbidDevices ? ` (${topOverbidDevices})` : ''}.`)
    } else {
      const totalImbalanceMwh = Number(currentKpis.imbalance_mwh || 0)
      const totalImbalanceCost = Number(currentKpis.imbalance_cost_zar || 0)
      if (Math.abs(totalImbalanceMwh) > 1 || Math.abs(totalImbalanceCost) > 1000) {
        notes.push(isConsumer
          ? `No relevant over-demand was detected, but imbalance is still high (${formatInt(totalImbalanceMwh)} MWh, ${formatCurrency(totalImbalanceCost)}). This indicates a dispatch-vs-actual divergence rather than an over-demand breach.`
          : `No relevant overbid was detected, but imbalance is still high (${formatInt(totalImbalanceMwh)} MWh, ${formatCurrency(totalImbalanceCost)}). This indicates a dispatch-vs-actual divergence rather than an overbid breach.`)
      } else {
        notes.push(isConsumer
          ? 'Over-demand occurs when requested volume exceeds effective capacity (shown in red in details). No relevant over-demand was detected in this round.'
          : 'Overbid/Over-demand occurs when bid volume exceeds effective capacity (shown in red in details). No relevant overbid was detected in this round.')
      }
    }

    const plannedMwh = Number(currentKpis.planned_mwh || 0)
    const dispatchedMwh = Number(currentKpis.dispatched_mwh || 0)
    const actualMwh = Number(currentKpis.actual_mwh || 0)
    const uncoveredMwh = Math.max(0, plannedMwh - dispatchedMwh)
    const overCoveredMwh = Math.max(0, dispatchedMwh - plannedMwh)
    const balancingGapMwh = Math.abs(dispatchedMwh - actualMwh)
    const smpButNotClearedRows = Object.values(deviceBreakdown).reduce((acc, entries) => {
      if (!Array.isArray(entries)) return acc
      entries.forEach((hour) => {
        const offerPrice = Number(hour?.offer_price_zar)
        const marketPrice = Number(hour?.market_price_zar)
        const planned = Number(hour?.planned_mw || 0)
        const dispatched = Number(hour?.dispatched_mw || 0)
        if (!Number.isFinite(offerPrice) || !Number.isFinite(marketPrice)) return
        if (planned <= 0 || dispatched >= planned) return

        const isPriceCompetitive = isConsumer ? offerPrice >= marketPrice : offerPrice <= marketPrice
        if (!isPriceCompetitive) return

        acc.count += 1
        acc.uncovered += Math.max(0, planned - dispatched)
      })
      return acc
    }, { count: 0, uncovered: 0 })

    if (smpButNotClearedRows.count > 0) {
      notes.push(
        `Price-competitive but not fully cleared (${smpButNotClearedRows.count} device-hours, ${formatInt(smpButNotClearedRows.uncovered)} MWh not awarded): this can happen because SMP is a market-wide intersection price, not a guarantee of full award for every single bid. After price formation, allocation still follows merit-order and remaining cleared volume. If competing supply at the same/lower price (or synthetic system blocks) already absorbs most volume, your bid can be only partially accepted or remain at 0 even when bid price is at/below SMP.`
      )
    }

    const pricedOutHours = Object.values(deviceBreakdown).reduce((count, entries) => {
      if (!Array.isArray(entries)) return count
      return count + entries.filter((hour) => {
        const offerPrice = Number(hour?.offer_price_zar)
        const marketPrice = Number(hour?.market_price_zar)
        const planned = Number(hour?.planned_mw || 0)
        const dispatched = Number(hour?.dispatched_mw || 0)
        if (!Number.isFinite(offerPrice) || !Number.isFinite(marketPrice)) return false
        if (planned <= 0 || dispatched >= planned) return false
        return isConsumer ? offerPrice < marketPrice : offerPrice > marketPrice
      }).length
    }, 0)

    if (uncoveredMwh > 0.001) {
      notes.push(`Missing coverage: planned ${formatInt(plannedMwh)} MWh vs delivered ${formatInt(dispatchedMwh)} MWh ⇒ gap ${formatInt(uncoveredMwh)} MWh. A common reason is a price gap ("you wanted to buy/sell at price x, market was at y") — visible here in ${pricedOutHours} device-hours.`)
    } else if (isConsumer && overCoveredMwh > 0.001) {
      notes.push(`Coverage above plan: planned ${formatInt(plannedMwh)} MWh vs delivered ${formatInt(dispatchedMwh)} MWh ⇒ surplus ${formatInt(overCoveredMwh)} MWh. This can occur due to intraday adjustments and balancing-related settlement effects.`)
    } else {
      if (balancingGapMwh > Math.max(5, Math.abs(dispatchedMwh) * 0.05)) {
        notes.push(`Market coverage looks closed (planned ${formatInt(plannedMwh)} MWh vs dispatched ${formatInt(dispatchedMwh)} MWh), but balancing deviation is high (actual ${formatInt(actualMwh)} MWh; gap ${formatInt(balancingGapMwh)} MWh). This drives imbalance costs.`)
      } else {
        notes.push('Coverage: no relevant gap between planned and delivered energy; the round total is largely covered.')
      }
    }

    const activeEvents = Array.isArray(results?.active_events) ? results.active_events : []
    if (activeEvents.length > 0) {
      const relevantEvents = activeEvents.filter((evt) => {
        const target = String(evt?.target || 'all').toLowerCase()
        const targetId = String(evt?.target_id || '').toLowerCase()
        if (target === 'all') return true
        if (target === 'player' && targetId) {
          return targetId === String(playerTypeId || '').toLowerCase()
            || targetId === String(my_result?.player_id || '').toLowerCase()
        }
        if (target === 'device' && targetId) {
          return Object.keys(deviceBreakdown).some((deviceId) => {
            const cfg = devicesById[deviceId] || {}
            return String(deviceId).toLowerCase() === targetId || String(cfg.type || '').toLowerCase() === targetId
          })
        }
        return false
      })

      const shownEvents = relevantEvents.length > 0 ? relevantEvents : activeEvents
      const eventNames = shownEvents.slice(0, 2).map((evt) => evt?.name || 'Event').join(' · ')
      notes.push(`Ongoing events: ${shownEvents.length} active for your scope (${eventNames}${shownEvents.length > 2 ? ' …' : ''}). Events modify capacity/demand before clearing (multiplier/additive), which shifts dispatch, revenue/costs, and imbalance.`)

      const eventDrivenRows = Object.values(deviceBreakdown)
        .flatMap((entries) => (Array.isArray(entries) ? entries : []))
        .filter((row) => {
          const debug = row?.capacity_debug || {}
          const eventMult = Number(debug.event_mult)
          const eventAdd = Number(debug.event_add)
          return (Number.isFinite(eventMult) && Math.abs(eventMult - 1) > 0.0001)
            || (Number.isFinite(eventAdd) && Math.abs(eventAdd) > 0.0001)
        })

      if (eventDrivenRows.length > 0) {
        const rowsWithBase = eventDrivenRows.filter((row) => Number(row?.base_capacity_mw || 0) > 0)
        const avgDropPct = rowsWithBase.length > 0
          ? rowsWithBase.reduce((sum, row) => {
            const base = Number(row?.base_capacity_mw || 0)
            const effective = Number(row?.effective_capacity_mw || 0)
            return sum + Math.max(0, ((base - effective) / base) * 100)
          }, 0) / rowsWithBase.length
          : 0

        const imbalanceMwh = Number(currentKpis.imbalance_mwh || 0)
        const imbalanceCost = Number(currentKpis.imbalance_cost_zar || 0)
        if (Math.abs(imbalanceMwh) > 0.001 || Math.abs(imbalanceCost) > 0.5) {
          notes.push(`Event impact visible in detail rows: ${eventDrivenRows.length} device-hour entries carry event modifiers; average capacity reduction ≈ ${avgDropPct.toFixed(0)}%. This reduced deliverable volume and contributed to imbalance (${formatInt(imbalanceMwh)} MWh, ${formatCurrency(imbalanceCost)}) and lower ${isConsumer ? 'net result' : 'profit'}.`)
        }
      } else if (shownEvents.some((evt) => String(evt?.type || '').toLowerCase() === 'systemic')) {
        notes.push('Systemic event(s) are active, but no explicit event modifier is present in the current device-hour rows. If this is unexpected, verify event target scope and round applicability.')
      }
    }

    const dynamicCapacity = Object.entries(deviceBreakdown).reduce((acc, [deviceId, entries]) => {
      const reducedHours = (Array.isArray(entries) ? entries : []).filter((hour) => {
        const base = Number(hour?.base_capacity_mw || 0)
        const effective = Number(hour?.effective_capacity_mw || 0)
        return base > 0 && effective + 0.001 < base
      })
      if (reducedHours.length > 0) {
        const avgDropPct = reducedHours.reduce((sum, hour) => {
          const base = Number(hour?.base_capacity_mw || 0)
          const effective = Number(hour?.effective_capacity_mw || 0)
          return sum + ((base - effective) / base) * 100
        }, 0) / reducedHours.length
        acc.push({
          name: devicesById[deviceId]?.name || deviceId,
          hours: reducedHours.length,
          avgDropPct
        })
      }
      return acc
    }, [])

    if (dynamicCapacity.length > 0) {
      const topDynamic = dynamicCapacity
        .sort((a, b) => b.avgDropPct - a.avgDropPct)
        .slice(0, 2)
        .map((item) => `${item.name}: ${item.avgDropPct.toFixed(0)}% avg reduction over ${item.hours}h`)
        .join(' · ')
      notes.push(`Dynamic capacity (e.g., PV/wind): effective capacity can be below base capacity hour by hour (profiles, seasonality, events). Visible in this round for ${dynamicCapacity.length} device(s): ${topDynamic}.`)
    } else {
      notes.push('Dynamic capacity: no significant deviation between base and effective capacity detected in this round.')
    }

    return notes
  })()

  const loadingContent = (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
      <CircularProgress />
    </Box>
  )

  const emptyContent = (
    <Paper sx={{ p: 4, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        No results available
      </Typography>
    </Paper>
  )

  if (loading) return loadingContent
  if (!hasResults) return emptyContent

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Stack spacing={4}>
          {/* Breadcrumb */}
          <Box>
            <Breadcrumbs separator={<NextIcon fontSize="small" />} aria-label="breadcrumb">
              <Typography color="text.secondary" variant="body2">
                {displayCampaignName}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {scenarioName}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {playerTypeName} ({roleLabel})
              </Typography>
              <Typography color="primary" variant="body2" fontWeight={600}>
                Round {round} ({currentTime})
              </Typography>
            </Breadcrumbs>
          </Box>

          {/* Header */}
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
                    Round {round} Results
                  </Typography>
                  <Chip 
                    label={roleLabel} 
                    color={isProducer ? 'primary' : 'secondary'}
                  />
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
                  title="Round Results Assistant"
                  buttonLabel="Ask About This Round"
                  buttonSize="small"
                  buttonSx={{ whiteSpace: 'nowrap' }}
                  placeholder="Ask about KPIs, balancing, congestion, or what happened this round..."
                  intro="Ask questions about this round. I will answer from your KPIs, notes, network data, and round history."
                  contextLabel="Round results page context"
                  context={assistantContext}
                  resetKey={`round-results:${sessionId}:${round}`}
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
            {round > 1 && cumulativeKpis && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showCumulative}
                    onChange={() => setShowCumulative(!showCumulative)}
                    color="success"
                  />
                }
                label={showCumulative ? `Scenario KPIs (Rounds 1-${round})` : 'Round KPIs'}
                sx={{ mb: 1 }}
              />
            )}
            <Typography variant="body1" color="text.secondary">
              {playerName} • {playerTypeName}
            </Typography>
          </Box>

          <Divider />

          {rawZoneResults.length > 0 && isMultiZone && (
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Zone And Network
              </Typography>
              <Grid container spacing={3} sx={{ mt: 0.5 }}>
                {rawZoneResults.map((zone) => {
                  const zoneId = Number(zone?.zone_id || 0)
                  const zoneStatus = String(zone?.status || 'local_supply_sufficient')
                  const isPlayerZone = Number(playerZoneInfo?.zone_id || 0) === zoneId
                  return (
                    <Grid item xs={12} md={rawZoneResults.length <= 2 ? 6 : 4} key={`zone-summary-${zoneId}`}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Typography variant="subtitle1" fontWeight={600}>
                                Zone {zoneId}
                              </Typography>
                              {isPlayerZone ? <Chip size="small" label="Your zone" color="primary" variant="outlined" /> : null}
                            </Stack>
                            <Chip
                              size="small"
                              label={zoneStatus.replaceAll('_', ' ')}
                              color={zoneStatus === 'supply_shortfall' ? 'error' : zoneStatus === 'grid_supported_supply' || zoneStatus === 'balancing_supported_supply' ? 'warning' : 'success'}
                            />
                          </Stack>
                          <Stack spacing={0.75}>
                            <Typography variant="body2" color="text.secondary">
                              Coverage: {formatPct(zone?.coverage_total_pct)} total · {formatPct(zone?.coverage_local_pct)} local
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Local generation: {formatInt(zone?.local_generation_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Local demand (served): {formatInt(zone?.local_demand_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Imports / exports: {formatInt(zone?.imports_mwh)} / {formatInt(zone?.exports_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Losses: {formatInt(zone?.losses_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Zone shortfall: {formatInt(zone?.unserved_demand_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Balancing support: {formatInt(zone?.balancing_support_mwh)} MWh
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Redispatch cost (ATC): {formatCurrency(zone?.extra_cost_total_zar || 0)}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  )
                })}
                <Grid item xs={12}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                        Interzonal Links
                      </Typography>
                      {rawLinkResults.length > 0 ? (
                        <Stack spacing={1}>
                          {rawLinkResults.map((link, index) => (
                            <Typography key={`interzonal-link-${index}`} variant="body2" color="text.secondary">
                              Zone {link.from_zone} {'->'} Zone {link.to_zone}: {formatInt(link.flow_mwh)} / {formatInt(link.atc_mwh)} MWh, received {formatInt(link.flow_received_mwh)} MWh, utilization {formatPct(link.utilization_pct)}{link.binding ? ' · binding' : ''}
                            </Typography>
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No interzonal links were reported for this round.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Main KPI Cards */}
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Key Performance Indicators
            </Typography>
            <Grid container spacing={3} sx={{ mt: 0.5 }}>
              {isProducer ? (
                <>
                  {/* Producer Cards */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#4caf50',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <RevenueIcon sx={{ fontSize: 32, color: '#4caf50' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              Revenue
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('revenue')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#4caf50' }}>
                          {formatCurrency(kpis.revenue_zar || 0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${formatCurrency((kpis.revenue_zar || 0) / kpis.dispatched_mwh)}/MWh`
                            : 'Revenue per MWh'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#2196f3',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <ProfitIcon sx={{ fontSize: 32, color: '#2196f3' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              Profit
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('profit')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#2196f3' }}>
                          {formatCurrency(kpis.profit_zar || 0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${formatCurrency((kpis.profit_zar || 0) / kpis.dispatched_mwh)}/MWh`
                            : 'Profit per MWh'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#ff9800',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <CO2Icon sx={{ fontSize: 32, color: '#ff9800' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              CO₂ Emissions
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('co2')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#ff9800' }}>
                          {((kpis.co2_emissions_kg || 0) / 1000).toFixed(1)} t
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${((kpis.co2_emissions_kg || 0) / 1000 / kpis.dispatched_mwh).toFixed(3)} t/MWh`
                            : 'Tonnes CO₂'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#9c27b0',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <EnergyIcon sx={{ fontSize: 32, color: '#9c27b0' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              Dispatched
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('dispatched')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#9c27b0' }}>
                          {formatInt(kpis.dispatched_mwh || 0)} MWh
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Cleared energy volume
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  {(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0) > 0.5 && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Card variant="outlined" sx={{
                        borderColor: '#f44336',
                        borderWidth: 2,
                        height: '100%'
                      }}>
                        <CardContent>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                            <Stack direction="row" alignItems="center" spacing={2}>
                              <CostIcon sx={{ fontSize: 32, color: '#f44336' }} />
                              <Typography variant="subtitle2" color="text.secondary">
                                Redispatch Cost (ATC)
                              </Typography>
                            </Stack>
                            <IconButton size="small" onClick={() => openBreakdown('profit')}>
                              <InfoIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          <Typography variant="h5" sx={{ fontWeight: 600, color: '#f44336' }}>
                            {formatCurrency(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Network bandwidth limit (ATC)
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </>
              ) : (
                <>
                  {/* Consumer Cards */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#4caf50',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <CostIcon sx={{ fontSize: 32, color: '#4caf50' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              Total Costs
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('costs')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#4caf50' }}>
                          {formatCurrency(Math.abs(kpis.revenue_zar || 0))}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${formatCurrency(Math.abs(kpis.revenue_zar) / kpis.dispatched_mwh)}/MWh`
                            : 'Cost per MWh'}
                        </Typography>
                        {(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0) > 0.5 && (
                          <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: '#f44336' }}>
                            Redispatch cost (ATC): {formatCurrency(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0)}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#2196f3',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <EnergyIcon sx={{ fontSize: 32, color: '#2196f3' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              {terms.coverageCardLabel || 'Demand Coverage'}
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('demand')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#2196f3' }}>
                          {kpis.planned_mwh > 0 
                            ? `${((kpis.dispatched_mwh || 0) / kpis.planned_mwh * 100).toFixed(1)}%`
                            : '0.0%'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {terms.energyLabel}: {formatInt(kpis.dispatched_mwh || 0)} MWh
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {plannedVolumeLabel}: {formatInt(kpis.planned_mwh || 0)} MWh
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#ff9800',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <CO2Icon sx={{ fontSize: 32, color: '#ff9800' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              {terms.co2CardLabel}
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('co2')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#ff9800' }}>
                          {((kpis.co2_emissions_kg || 0) / 1000).toFixed(1)} t
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${((kpis.co2_emissions_kg || 0) / 1000 / kpis.dispatched_mwh).toFixed(3)} ${terms.co2IntensityUnit}`
                            : terms.co2FallbackUnit}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ 
                      borderColor: '#9c27b0',
                      borderWidth: 2,
                      height: '100%'
                    }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <EnergyIcon sx={{ fontSize: 32, color: '#9c27b0' }} />
                            <Typography variant="subtitle2" color="text.secondary">
                              Consumed
                            </Typography>
                          </Stack>
                          <IconButton size="small" onClick={() => openBreakdown('consumed')}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: '#9c27b0' }}>
                          {formatInt(kpis.dispatched_mwh || 0)} MWh
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Delivered consumption volume
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                </>
              )}
            </Grid>
          </Box>

          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Explanations & KPI Interpretation</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    KPI Interpretation (Current Round)
                  </Typography>
                  <Stack spacing={0.5}>
                    {currentRoundNotes.map((note, idx) => (
                      <Typography key={idx} variant="body2">
                        • {note}
                      </Typography>
                    ))}
                  </Stack>
                </Alert>

                <Alert severity="info" variant="outlined">
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    How Main KPIs Are Built from Detail Data
                  </Typography>
                  <Stack spacing={0.5}>
                    {kpiCompositionNotes.map((note, idx) => (
                      <Typography key={idx} variant="body2">
                        • {note}
                      </Typography>
                    ))}
                  </Stack>
                </Alert>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {perRoundChallengeItems.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Objectives & Challenges Status
              </Typography>
              <Alert severity={passedPerRoundChallengeCount === perRoundChallengeItems.length ? 'success' : 'info'} variant="outlined" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  {challengeSummaryText}
                </Typography>
              </Alert>
              <Grid container spacing={2}>
                {perRoundChallengeItems.map((item, idx) => {
                  const passed = Boolean(item?.passed)
                  return (
                    <Grid item xs={12} md={6} lg={4} key={`${item?.challenge_id || item?.name || 'challenge'}-${idx}`}>
                      <Card variant="outlined" sx={{ height: '100%', borderColor: passed ? 'success.main' : 'divider' }}>
                        <CardContent>
                          <Stack spacing={1.25}>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                              <Chip label={passed ? 'Achieved' : 'Open'} color={passed ? 'success' : 'default'} size="small" />
                              {item?.required && <Chip label="Required" color="primary" size="small" variant="outlined" />}
                              {item?.per_round && <Chip label="Per round" color="info" size="small" variant="outlined" />}
                            </Stack>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {item?.name || 'Challenge'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Target: {item?.operator || '-'} {formatChallengeValue(item?.metric, item?.target)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Actual: {formatChallengeValue(item?.metric, item?.actual)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Metric: {item?.metric || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Points: {Number(item?.points || 0)}/{Number(item?.max_points || 0)}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  )
                })}
              </Grid>
            </Box>
          )}

          {/* Device Deep Dive - Hourly Breakdown per Device */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Detail View Scope
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Only hours from the current round are shown. KPI cards and hourly details use the same round data scope.
            </Typography>
          </Box>

          {showBaselineOnlyNotice && (
            <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Round {round} has no new intraday clearing. The visible day-ahead bid and dispatch rows are the carried-over DAM baseline from Round 1, while current-round IDM SMP, awarded volume, and KPI deltas remain at 0.
              </Typography>
            </Alert>
          )}

          <DeviceDeepDiveTabs 
            results={results}
            scenario={scenario}
            mode={mode}
            roleType={isProducer ? 'producer' : 'consumer'}
          />

          {/* Advance Button */}
          {onAdvance && (
            <>
              <Divider />
              <Box sx={{ textAlign: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleAdvance}
                  disabled={advancing}
                  startIcon={advancing ? <CircularProgress size={20} /> : <NextIcon />}
                  sx={{ px: 6, py: 1.5 }}
                >
                  {advancing ? 'Loading...' : 'Continue to Next Round'}
                </Button>
              </Box>
            </>
          )}

          {/* Debug Info */}
          <Divider />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              Session: {sessionId} | Round: {round} | Mode: {mode} | Role: {playerRole}
            </Typography>
          </Box>

          <Dialog
            open={Boolean(breakdownKey)}
            onClose={closeBreakdown}
            maxWidth="xl"
            fullWidth
            PaperProps={{
              sx: {
                width: 'min(1400px, 96vw)',
                maxWidth: '96vw'
              }
            }}
          >
            <DialogTitle>
              {breakdownConfig[breakdownKey]?.title || 'Breakdown'}
              {showCumulative && cumulativeKpis && (
                <Typography component="span" variant="caption" color="primary" sx={{ ml: 1.5 }}>
                  (Cumulative Rounds 1–{round})
                </Typography>
              )}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {breakdownConfig[breakdownKey]?.description && (
                  <Typography variant="body2" color="text.secondary">
                    {breakdownConfig[breakdownKey]?.description}
                  </Typography>
                )}
                {breakdownKey === 'profit' && (
                  <>
                    {(() => {
                      const revenueValue = kpis.revenue_zar || 0
                      const variableCostValue = kpis.variable_cost_zar || 0
                      const fixedCostValue = kpis.fixed_cost_zar || 0
                      const imbalanceCostValue = kpis.imbalance_cost_zar || 0
                      const batteryChargeCostValue = kpis.battery_charge_cost_zar || 0
                      const atcCostValue = kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0
                      const congestionRevenueValue = kpis.congestion_revenue_zar || 0
                      return (
                        <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Profit Formula
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      Profit = Revenue - Variable Cost - Fixed Cost - Imbalance Cost - Battery Charge Cost - Redispatch Cost (ATC) + Congestion Revenue
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'primary.main' }}>
                      Profit = Revenue ({formatCurrency(revenueValue)}) - Variable Cost ({formatCurrency(variableCostValue)}) - Fixed Cost ({formatCurrency(fixedCostValue)}) - Imbalance Cost ({formatCurrency(imbalanceCostValue)}) - Battery Charge Cost ({formatCurrency(batteryChargeCostValue)}) - Redispatch Cost ({formatCurrency(atcCostValue)}) + Congestion Revenue ({formatCurrency(congestionRevenueValue)})
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Imbalance is settled with configured balancing prices: +imbalance at {formatCurrency(balancingUpPrice)}/MWh, −imbalance at {formatCurrency(balancingDownPrice)}/MWh.
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'success.main' }}>
                      Profit = {formatCurrency(kpis.profit_zar || 0)}
                    </Typography>
                        </>
                      )
                    })()}
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableBody>
                          <TableRow>
                            <TableCell>Revenue</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.revenue_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Variable Cost</TableCell>
                            <TableCell align="right">− {formatCurrency(kpis.variable_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Fixed Cost</TableCell>
                            <TableCell align="right">− {formatCurrency(kpis.fixed_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Imbalance Cost</TableCell>
                            <TableCell align="right">− {formatCurrency(kpis.imbalance_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Redispatch Cost (ATC)</TableCell>
                            <TableCell align="right">− {formatCurrency(kpis.atc_dispatch_cost_zar ?? kpis.grid_constraint_cost_zar ?? 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Congestion Revenue</TableCell>
                            <TableCell align="right">+ {formatCurrency(kpis.congestion_revenue_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow sx={{ bgcolor: 'success.50' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isConsumer ? 'Net Result' : 'Profit'}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', color: (kpis.profit_zar || 0) >= 0 ? 'success.main' : 'error.main' }}>
                              = {formatCurrency(kpis.profit_zar || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {!showCumulative && (() => {
                      const currentHourlyBreakdown = Array.isArray(currentKpis?.hourly_breakdown) ? currentKpis.hourly_breakdown : []
                      const hourColumns = deriveHourColumns(currentHourlyBreakdown, {})
                      const usesCurrentRoundPrice = hasIdmTradingThisRound || currentHourlyBreakdown.some((entry) => (
                        normalizeNumber(entry?.idp) > 0 || normalizeNumber(entry?.id_price_zar) > 0
                      ))
                      if (!hourColumns.length) return null

                      const profitInputRows = [
                        {
                          key: 'price',
                          label: usesCurrentRoundPrice ? 'Current Price / SMP (ZAR/MWh)' : 'SMP (ZAR/MWh)',
                          render: (entry) => {
                            const price = entry?.idp ?? entry?.id_price_zar ?? entry?.market_price_zar ?? entry?.da_price_zar ?? entry?.smp ?? 0
                            return Number(price) > 0 ? formatDecimal(price, 1) : '—'
                          }
                        },
                        {
                          key: 'dispatched',
                          label: 'Dispatched (MWh)',
                          render: (entry) => formatDecimal(entry?.dispatched_mw ?? entry?.dispatched_mwh ?? 0, 1)
                        },
                        {
                          key: 'revenue',
                          label: 'Revenue (ZAR)',
                          render: (entry) => formatCurrency(entry?.revenue_zar || 0)
                        },
                        {
                          key: 'variable_cost',
                          label: 'Variable Cost (ZAR)',
                          render: (entry) => formatCurrency(entry?.variable_cost_zar || 0)
                        },
                        {
                          key: 'fixed_cost',
                          label: 'Fixed Cost (ZAR)',
                          render: (entry) => formatCurrency(entry?.fixed_cost_zar || 0)
                        },
                        {
                          key: 'imbalance_cost',
                          label: 'Imbalance Cost (ZAR)',
                          render: (entry) => formatCurrency(entry?.imbalance_cost_zar || 0)
                        },
                        {
                          key: 'battery_charge_cost',
                          label: 'Battery Charge Cost (ZAR)',
                          render: (entry) => formatCurrency(entry?.battery_charge_cost_zar || 0)
                        },
                        {
                          key: 'atc_cost',
                          label: 'Redispatch Cost (ATC) (ZAR)',
                          render: (entry) => formatCurrency(entry?.network_shortfall_cost_zar ?? entry?.atc_dispatch_cost_zar ?? 0)
                        },
                        {
                          key: 'congestion_revenue',
                          label: 'Congestion Revenue (ZAR)',
                          render: (entry) => formatCurrency(entry?.congestion_revenue_zar || 0)
                        },
                        {
                          key: 'profit',
                          label: isConsumer ? 'Net Result (ZAR)' : 'Profit (ZAR)',
                          render: (entry) => formatCurrency(entry?.profit_zar || 0)
                        },
                      ]

                      return (
                        <>
                          <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
                            Hourly Formula Inputs
                          </Typography>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            The profit formula is settled hour by hour. This table shows the individual inputs behind each hourly formula term, including the current SMP/settlement price and cost components.
                          </Typography>
                          {renderHourMatrixTable(
                            profitInputRows,
                            hourColumns,
                            (row, hIdx) => {
                              const entry = findHourlyBreakdownEntry(currentHourlyBreakdown, hourColumns[hIdx], hIdx) || {}
                              return row.render(entry)
                            },
                            'Formula input'
                          )}
                        </>
                      )
                    })()}
                    {(() => {
                      const currentDeviceHourlyBreakdown = kpis?.device_hourly_breakdown || {}
                      const currentHourlyBreakdown = kpis?.hourly_breakdown || []
                      const hourColumns = deriveHourColumns(currentHourlyBreakdown, currentDeviceHourlyBreakdown)
                      const deviceIds = Object.keys(currentDeviceHourlyBreakdown).sort()
                      if (!deviceIds.length) return null
                      const hasFixedCost = deviceIds.some((devId) =>
                        (currentDeviceHourlyBreakdown[devId] || []).some((e) => Math.abs(Number(e?.fixed_cost_zar || 0)) > 0.5)
                      )
                      const rows = deviceIds.flatMap((devId) => {
                        const label = getDeviceLabel(devId)
                        const base = [{ key: `${devId}:var`, label: `${label} — Variable`, devId, costKey: 'variable_cost_zar' }]
                        if (hasFixedCost) base.push({ key: `${devId}:fix`, label: `${label} — Fixed`, devId, costKey: 'fixed_cost_zar' })
                        return base
                      })
                      return (
                        <>
                          <Typography variant="body1" fontWeight={600} sx={{ mt: 2 }} gutterBottom>
                            Device Costs per Hour
                          </Typography>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Variable cost = dispatched MWh × effective cost rate. {hasFixedCost ? 'Fixed cost = configured daily/hourly fixed charge.' : ''}
                          </Typography>
                          {renderHourMatrixTable(
                            rows,
                            hourColumns,
                            (row, hIdx) => {
                              const entry = currentDeviceHourlyBreakdown?.[row.devId]?.[hIdx] || {}
                              return formatCurrency(Math.abs(Number(entry[row.costKey] || 0)))
                            },
                            'Device / Cost type'
                          )}
                        </>
                      )
                    })()}
                  </>
                )}
                {breakdownKey === 'revenue' && (() => {
                  const currentDeviceHourlyBreakdown = currentKpis?.device_hourly_breakdown || {}
                  const currentHourlyBreakdown = currentKpis?.hourly_breakdown || []
                  const hourColumns = deriveHourColumns(currentHourlyBreakdown, currentDeviceHourlyBreakdown)
                  const hasSplitSettlement = hasIdmTradingThisRound && (
                    Math.abs(Number(my_result?.da_id_breakdown?.da_revenue_zar || 0)) > 0.5
                    || Math.abs(Number(my_result?.da_id_breakdown?.id_revenue_zar || 0)) > 0.5
                    || Math.abs(Number(my_result?.id_volume_mwh || 0)) > 0.0001
                    || Number(my_result?.id_trade_count || 0) > 0
                  )
                  return (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Revenue Calculation
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {hasSplitSettlement
                        ? 'Revenue = Σ(DA dispatched MWh × DA SMP) + Σ(ID delta MWh × current market price)'
                        : 'Revenue = Σ(Dispatched MWh × current market price)'}
                    </Typography>
                    {hasSplitSettlement && (
                      <Typography variant="body2" color="text.secondary">
                        In ID-delta rounds, the day-ahead dispatched baseline stays valued at DA SMP, while only the incremental intraday delta versus that baseline is settled at the current round price.
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'success.main' }}>
                      Total Revenue = {formatCurrency(kpis.revenue_zar || 0)}
                    </Typography>

                    {renderHourMatrixTable(
                      Object.keys(currentDeviceHourlyBreakdown || {}).sort().flatMap((devId) => {
                        const label = getDeviceLabel(devId)
                        return [
                          { key: `${devId}:da`, label: `${label} — DAM`, devId, market: 'da' },
                          { key: `${devId}:id`, label: `${label} — IDM`, devId, market: 'id' },
                        ]
                      }),
                      hourColumns,
                      (row, hIdx) => {
                        const entry = currentDeviceHourlyBreakdown?.[row.devId]?.[hIdx] || {}
                        const val = row.market === 'da' ? entry.da_revenue_zar : entry.id_revenue_zar
                        return formatSignedCurrency(val || 0)
                      },
                      'Device / Market'
                    )}
                  </>
                  )
                })()}
                {breakdownKey === 'co2' && (() => {
                  const currentDeviceHourlyBreakdown = currentKpis?.device_hourly_breakdown || {}
                  const currentHourlyBreakdown = currentKpis?.hourly_breakdown || []
                  const hourColumns = deriveHourColumns(currentHourlyBreakdown, currentDeviceHourlyBreakdown)
                  return (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      {terms.co2BreakdownTitle}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {terms.co2BreakdownFormula}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'warning.main' }}>
                      {terms.co2TotalLinePrefix} = {((kpis.co2_emissions_kg || 0) / 1000).toFixed(1)} t
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      All values in this dialog are shown in tonnes CO₂. Backend emissions are stored in kg and converted here for a consistent display.
                    </Typography>

                    {renderHourMatrixTable(
                      Object.keys(currentDeviceHourlyBreakdown || {}).sort().flatMap((devId) => {
                        const label = getDeviceLabel(devId)
                        return [
                          { key: `${devId}:da`, label: `${label} — DAM`, devId, market: 'da' },
                          { key: `${devId}:id`, label: `${label} — IDM`, devId, market: 'id' },
                        ]
                      }),
                      hourColumns,
                      (row, hIdx) => {
                        const entry = currentDeviceHourlyBreakdown?.[row.devId]?.[hIdx] || {}
                        const totalCo2 = Number(entry.co2_kg ?? 0)
                        const da = Math.abs(Number(entry.da_dispatched_mwh ?? 0))
                        const id = Math.abs(Number(entry.id_dispatched_mwh ?? 0))
                        const total = Math.abs(Number(entry.total_dispatched_mwh ?? (da + id)))
                        if (!Number.isFinite(totalCo2) || totalCo2 === 0 || !Number.isFinite(total) || total <= 0) return '0'
                        const share = row.market === 'da' ? (da / total) : (id / total)
                        const val = totalCo2 * share
                        return `${(val / 1000).toFixed(2)} t`
                      },
                      'Device / Market'
                    )}
                  </>
                  )
                })()}
                {breakdownKey === 'dispatched' && (() => {
                  const currentDeviceHourlyBreakdown = currentKpis?.device_hourly_breakdown || {}
                  const currentHourlyBreakdown = currentKpis?.hourly_breakdown || []
                  const hourColumns = deriveHourColumns(currentHourlyBreakdown, currentDeviceHourlyBreakdown)

                  const hasDamHistory = my_result?.dam_bid_dispatch && Object.keys(my_result.dam_bid_dispatch || {}).length > 0
                  const damBidDispatch = hasDamHistory
                    ? (my_result?.dam_bid_dispatch || {})
                    : ((Number(round) === 1 || Number(round) === 0) ? (my_result?.bid_dispatch || {}) : {})
                  const idmBidDispatch = hasDamHistory ? (my_result?.bid_dispatch || {}) : {}

                  const dispatchedRows = Object.keys(currentDeviceHourlyBreakdown || {}).sort().flatMap((devId) => {
                    const label = getDeviceLabel(devId)
                    const bidKeys = ['A', 'B', 'C']
                    return ['da', 'id'].flatMap((market) => bidKeys.map((bidKey) => ({
                      key: `${devId}:${market}:${bidKey}`,
                      label: `${label} — ${market.toUpperCase()} ${bidTierLabel(bidKey)}`,
                      devId,
                      market,
                      bidKey
                    }))).filter((row) => {
                      const marketDispatch = row.market === 'da' ? damBidDispatch : idmBidDispatch
                      const lotRows = marketDispatch?.[row.devId]?.[row.bidKey] || []
                      return lotRows.some((entry) => Math.abs(Number(entry?.mw_offered_signed ?? entry?.mw_offered ?? 0)) > 0)
                    })
                  })

                  return (
                  <>
                    <Typography variant="body2">
                      Dispatched volume: {formatInt(kpis.dispatched_mwh || 0)} MWh
                    </Typography>
                    <Typography variant="body2">
                      {plannedVolumeLabel} volume: {formatInt(kpis.planned_mwh || 0)} MWh
                    </Typography>

                    {renderHourMatrixTable(
                      dispatchedRows,
                      hourColumns,
                      (row, hIdx) => {
                        const marketDispatch = row.market === 'da' ? damBidDispatch : idmBidDispatch
                        const lotRows = marketDispatch?.[row.devId]?.[row.bidKey] || []
                        const lotEntry = findBidHourEntry(lotRows, hourColumns[hIdx], hIdx)
                        const dispatched = Math.abs(Number(lotEntry?.mw_dispatched ?? 0))
                        const offered = Math.abs(Number((lotEntry?.mw_offered_signed ?? lotEntry?.mw_offered) ?? 0))
                        if (!Number.isFinite(offered) || offered <= 0) return '—'
                        const pct = (dispatched / offered) * 100
                        return formatPct(pct)
                      },
                      'Device / Market / Bid'
                    )}
                  </>
                  )
                })()}
                {breakdownKey === 'consumed' && (
                  <Typography variant="body2">
                    Consumed volume: {formatInt(kpis.dispatched_mwh || 0)} MWh
                  </Typography>
                )}
                {breakdownKey === 'demand' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      {terms.coverageCardLabel || 'Demand Coverage'}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {terms.coverageFormulaText}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {terms.energyLabel} = {formatInt(kpis.dispatched_mwh || 0)} MWh
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {plannedVolumeLabel} = {formatInt(kpis.planned_mwh || 0)} MWh
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'primary.main' }}>
                      {terms.coverageCardLabel || 'Coverage'} = {formatInt(kpis.dispatched_mwh || 0)} / {formatInt(kpis.planned_mwh || 0)}
                    </Typography>
                  </>
                )}
                {breakdownKey === 'costs' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Total Costs (Procurement)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      Procurement Cost = |settlement revenue| (energy cleared × market price)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'primary.main' }}>
                      Procurement Cost = {formatCurrency(Math.abs(kpis.revenue_zar || 0))}
                    </Typography>
                    {(kpis.imbalance_cost_zar > 0.5 || kpis.atc_dispatch_cost_zar > 0.5) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Note: Imbalance Cost ({formatCurrency(kpis.imbalance_cost_zar || 0)}) and Redispatch Cost ATC ({formatCurrency(kpis.atc_dispatch_cost_zar || 0)}) are additional result components explained separately in the round notes and profit breakdown — they do not flow into this "Total Costs" card.
                      </Typography>
                    )}
                  </>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeBreakdown}>Close</Button>
            </DialogActions>
          </Dialog>

          <MarketOverviewDialog
            open={marketOverviewOpen}
            onClose={() => setMarketOverviewOpen(false)}
            title="Overall Market Overview"
            subtitle={`Round ${round} · ${displayCampaignName} · ${scenarioName}`}
            tabs={roundMarketOverviewTabs}
            defaultTabId="overview"
          />
        </Stack>
      </Paper>
    </Box>
  )
}
