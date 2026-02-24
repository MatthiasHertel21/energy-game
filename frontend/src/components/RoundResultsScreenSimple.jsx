import React, { useEffect, useState } from 'react'
import {
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow
} from '@mui/material'
import {
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

/**
 * RoundResultsScreenSimple - Simplified round results showing basic info only
 */
export default function RoundResultsScreenSimple({ sessionId, round, mode = 'shared_market', scenario, campaignName, onAdvance }) {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [breakdownKey, setBreakdownKey] = useState(null)
  const [showCumulative, setShowCumulative] = useState(false)
  const [cumulativeKpis, setCumulativeKpis] = useState(null)
  const [roundHistoryKpis, setRoundHistoryKpis] = useState([])

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
    curtailment_cost_zar: normalizeNumber(kpis.curtailment_cost_zar),
    congestion_revenue_zar: normalizeNumber(kpis.congestion_revenue_zar),
    co2_emissions_kg: normalizeNumber(kpis.co2_emissions_kg),
    dispatched_mwh: normalizeNumber(kpis.dispatched_mwh),
    planned_mwh: normalizeNumber(kpis.planned_mwh),
    actual_mwh: normalizeNumber(kpis.actual_mwh)
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
              console.warn(`Failed to fetch round ${r}:`, err)
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
            curtailment_cost_zar: allRounds.reduce((sum, k) => sum + k.curtailment_cost_zar, 0),
            congestion_revenue_zar: allRounds.reduce((sum, k) => sum + k.congestion_revenue_zar, 0),
            co2_emissions_kg: allRounds.reduce((sum, k) => sum + k.co2_emissions_kg, 0),
            dispatched_mwh: allRounds.reduce((sum, k) => sum + k.dispatched_mwh, 0),
            planned_mwh: allRounds.reduce((sum, k) => sum + k.planned_mwh, 0),
            actual_mwh: allRounds.reduce((sum, k) => sum + k.actual_mwh, 0),
          }
          setCumulativeKpis(cumulative)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [sessionId, round])
  
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!results) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No results available
        </Typography>
      </Paper>
    )
  }

  const { my_result } = results
  const currentKpis = normalizeKpis(my_result?.kpis || {})
  const kpis = showCumulative && cumulativeKpis ? cumulativeKpis : currentKpis
  const playerRole = my_result?.player_role
  const roleFromBreakdown = my_result?.da_id_breakdown?.is_consumer
  const resolvedRole = playerRole
    || (roleFromBreakdown === true ? 'consumer' : roleFromBreakdown === false ? 'producer' : '')
  const isProducer = resolvedRole.includes('producer') || resolvedRole.includes('generator')
  const isConsumer = !isProducer
  const terms = getRoleTerminology(isProducer)
  const roleLabel = isProducer ? 'Producer' : 'Consumer'
  
  // Get data from results and scenario
  const displayCampaignName = campaignName || scenario?.campaign_name || 'Campaign'
  const scenarioName = scenario?.name || 'Scenario'
  
  // Look up player type name from scenario config
  const playerTypeId = my_result?.type
  const playerTypes = scenario?.config?.player_types || []
  const playerType = playerTypes.find(pt => pt.id === playerTypeId)
  const playerTypeName = playerType?.name || playerTypeId || 'Player Type'
  
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
      description: 'Profit = Revenue - Variable Cost - Fixed Cost - Imbalance + Congestion'
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
      title: 'Demand coverage',
      description: 'Delivered energy versus planned energy.'
    },
    costs: {
      title: 'Total costs',
      description: 'Total payment for consumed cleared energy in this round.'
    }
  }

  const openBreakdown = (key) => setBreakdownKey(key)
  const closeBreakdown = () => setBreakdownKey(null)

  const currentRoundNotes = (() => {
    const notes = []
    const revenue = Number(currentKpis.revenue_zar || 0)
    const profit = Number(currentKpis.profit_zar || 0)
    const dispatched = Number(currentKpis.dispatched_mwh || 0)
    const co2 = Number(currentKpis.co2_emissions_kg || 0)
    const totalCosts = Number(currentKpis.variable_cost_zar || 0) + Number(currentKpis.fixed_cost_zar || 0) + Number(currentKpis.imbalance_cost_zar || 0)

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
      notes.push('Profit is negative: The sum of variable/fixed costs and imbalance exceeded achieved revenue.')
    }

    const previous = roundHistoryKpis
      .filter((entry) => Number(entry.round) < Number(round))
      .map((entry) => entry.kpis)

    if (previous.length >= 2) {
      const avg = (arr, key) => arr.reduce((sum, item) => sum + Number(item[key] || 0), 0) / arr.length
      const avgRevenue = avg(previous, 'revenue_zar')
      const avgProfit = avg(previous, 'profit_zar')
      const avgDispatch = avg(previous, 'dispatched_mwh')

      const strongDeviation = (value, baseline) => {
        const absBaseline = Math.abs(baseline)
        if (absBaseline < 1) return Math.abs(value - baseline) > 1000
        return Math.abs(value - baseline) / absBaseline >= 0.6
      }

      if (strongDeviation(revenue, avgRevenue) || strongDeviation(profit, avgProfit) || strongDeviation(dispatched, avgDispatch)) {
        notes.push('This round deviates strongly from previous rounds. Typical drivers are changed market prices, different gate phases, special events, or major bid/dispatch changes.')
      }
    }

    if (notes.length === 0) {
      notes.push('KPI values are unremarkable in this round and consistent with hourly aggregation.')
    }

    return notes
  })()

  const kpiCompositionNotes = (() => {
    const notes = []
    const breakdown = my_result?.da_id_breakdown || {}
    const deviceBreakdown = my_result?.kpis?.device_hourly_breakdown || {}
    const devicesById = (scenario?.config?.devices || []).reduce((acc, device) => {
      acc[device.id] = device
      return acc
    }, {})

    const daRevenue = Number(breakdown.da_revenue_zar || 0)
    const idRevenue = Number(breakdown.id_revenue_zar || 0)
    const totalRevenue = Number(currentKpis.revenue_zar || 0)
    const revenueDelta = totalRevenue - (daRevenue + idRevenue)

    if (Math.abs(daRevenue) > 0.5 || Math.abs(idRevenue) > 0.5) {
      notes.push(`Revenue composition: DAM ${formatCurrency(daRevenue)} + IDM ${formatCurrency(idRevenue)} = ${formatCurrency(daRevenue + idRevenue)}. KPI Revenue = ${formatCurrency(totalRevenue)}.`)

      if (Math.abs(revenueDelta) > 1) {
        notes.push(`Revenue reconciliation gap: KPI Revenue - (DAM + IDM) = ${formatSignedCurrency(revenueDelta)}. This gap comes from method/scope differences: KPI Revenue is summed from current-round hourly settlement, while DAM/IDM attribution is derived from DA baseline + ID delta valuation and then rounded in separate steps.`)
      }
    } else {
      notes.push(`Revenue composition: KPI Revenue (${formatCurrency(totalRevenue)}) comes from the sum of cleared hourly energy volumes × market prices.`)
    }

    const variableCost = Number(currentKpis.variable_cost_zar || 0)
    const fixedCost = Number(currentKpis.fixed_cost_zar || 0)
    const imbalanceCost = Number(currentKpis.imbalance_cost_zar || 0)
    const congestionRevenue = Number(currentKpis.congestion_revenue_zar || 0)
    const computedProfit = totalRevenue - variableCost - fixedCost - imbalanceCost + congestionRevenue
    notes.push(`Profit composition: ${formatCurrency(totalRevenue)} - ${formatCurrency(variableCost)} - ${formatCurrency(fixedCost)} - ${formatCurrency(imbalanceCost)} + ${formatCurrency(congestionRevenue)} = ${formatCurrency(computedProfit)} (KPI Profit: ${formatCurrency(currentKpis.profit_zar || 0)}).`)

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
        .map((item) => `${item.name}: ${formatCurrency(item.approxRevenue)}`)
        .join(' · ')
      notes.push(`Device contributions (approximated from hourly details): ${topDevicesText}.`)
    }

    const overbidSummary = Object.entries(deviceBreakdown).reduce((acc, [deviceId, entries]) => {
      const deviceOverbid = (Array.isArray(entries) ? entries : []).reduce((sum, hour) => sum + Number(hour?.overbid_mw || 0), 0)
      if (deviceOverbid > 0.001) {
        acc.total += deviceOverbid
        acc.hours += (Array.isArray(entries) ? entries : []).filter((hour) => Number(hour?.overbid_mw || 0) > 0.001).length
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
        .map((item) => `${item.name}: ${item.overbidMw.toFixed(1)} MW`)
        .join(' · ')
      notes.push(`Overbid/Over-demand: offered/requested volume above effective capacity. In this round: ${overbidSummary.total.toFixed(1)} MW across ${overbidSummary.hours} device-hours${topOverbidDevices ? ` (${topOverbidDevices})` : ''}.`)
    } else {
      notes.push('Overbid/Over-demand occurs when bid volume exceeds effective capacity (shown in red in details). No relevant overbid was detected in this round.')
    }

    const plannedMwh = Number(currentKpis.planned_mwh || 0)
    const dispatchedMwh = Number(currentKpis.dispatched_mwh || 0)
    const uncoveredMwh = Math.max(0, plannedMwh - dispatchedMwh)
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
    } else {
      notes.push('Coverage: no relevant gap between planned and delivered energy; the round total is largely covered.')
    }

    const activeEvents = Array.isArray(results?.active_events) ? results.active_events : []
    if (activeEvents.length > 0) {
      const eventNames = activeEvents.slice(0, 2).map((evt) => evt?.name || 'Event').join(' · ')
      notes.push(`Ongoing events: ${activeEvents.length} active (${eventNames}${activeEvents.length > 2 ? ' …' : ''}). Events modify capacity/demand before clearing (multiplier/additive), which shifts dispatch, revenue/costs, and imbalance.`)
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
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h4" fontWeight="bold">
                Round {round} Results
              </Typography>
              <Chip 
                label={roleLabel} 
                color={isProducer ? 'primary' : 'secondary'}
              />
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
                          {formatInt((kpis.co2_emissions_kg || 0) / 1000)} t
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
                              Demand Coverage
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
                          {formatInt(kpis.dispatched_mwh || 0)} / {formatInt(kpis.planned_mwh || 0)} MWh
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
                          {formatInt((kpis.co2_emissions_kg || 0) / 1000)} t
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {kpis.dispatched_mwh > 0 
                            ? `${((kpis.co2_emissions_kg || 0) / 1000 / kpis.dispatched_mwh).toFixed(2)} ${terms.co2IntensityUnit}`
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

          {/* Device Deep Dive - Hourly Breakdown per Device */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Detail View Scope
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Only hours from the current round are shown. KPI cards and hourly details use the same round data scope.
            </Typography>
          </Box>

          <DeviceDeepDiveTabs 
            results={results}
            scenario={scenario}
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

          <Dialog open={Boolean(breakdownKey)} onClose={closeBreakdown} maxWidth="sm" fullWidth>
            <DialogTitle>{breakdownConfig[breakdownKey]?.title || 'Breakdown'}</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {breakdownConfig[breakdownKey]?.description && (
                  <Typography variant="body2" color="text.secondary">
                    {breakdownConfig[breakdownKey]?.description}
                  </Typography>
                )}
                {breakdownKey === 'profit' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Profit Formula
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      Profit = Revenue - Variable Cost - Fixed Cost - Imbalance Cost + Congestion Revenue
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'primary.main' }}>
                      Profit = {formatInt(kpis.revenue_zar || 0)} - {formatInt(kpis.variable_cost_zar || 0)} - {formatInt(kpis.fixed_cost_zar || 0)} - {formatInt(kpis.imbalance_cost_zar || 0)} + {formatInt(kpis.congestion_revenue_zar || 0)}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'success.main' }}>
                      Profit = {formatCurrency(kpis.profit_zar || 0)}
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableBody>
                          <TableRow>
                            <TableCell>Revenue</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.revenue_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Variable Cost</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.variable_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Fixed Cost</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.fixed_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Imbalance Cost</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.imbalance_cost_zar || 0)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Congestion Revenue</TableCell>
                            <TableCell align="right">{formatCurrency(kpis.congestion_revenue_zar || 0)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
                {breakdownKey === 'revenue' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Revenue Calculation
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      Revenue = Σ(Dispatched MWh × SMP ZAR/MWh)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'success.main' }}>
                      Total Revenue = {formatCurrency(kpis.revenue_zar || 0)}
                    </Typography>
                  </>
                )}
                {breakdownKey === 'co2' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      {terms.co2BreakdownTitle}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {terms.co2BreakdownFormula}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'warning.main' }}>
                      {terms.co2TotalLinePrefix} = {formatInt(kpis.co2_emissions_kg || 0)} kg
                    </Typography>
                  </>
                )}
                {breakdownKey === 'dispatched' && (
                  <Typography variant="body2">
                    Dispatched volume: {formatInt(kpis.dispatched_mwh || 0)} MWh
                  </Typography>
                )}
                {breakdownKey === 'consumed' && (
                  <Typography variant="body2">
                    Consumed volume: {formatInt(kpis.dispatched_mwh || 0)} MWh
                  </Typography>
                )}
                {breakdownKey === 'demand' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Demand Coverage
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {terms.coverageFormulaText}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'primary.main' }}>
                      Coverage = {formatInt(kpis.dispatched_mwh || 0)} / {formatInt(kpis.planned_mwh || 0)}
                    </Typography>
                  </>
                )}
                {breakdownKey === 'costs' && (
                  <>
                    <Typography variant="body1" fontWeight={600} gutterBottom>
                      Total Costs
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      Total Costs = |Revenue|
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, color: 'primary.main' }}>
                      Total Costs = {formatCurrency(Math.abs(kpis.revenue_zar || 0))}
                    </Typography>
                  </>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeBreakdown}>Close</Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </Paper>
    </Box>
  )
}
