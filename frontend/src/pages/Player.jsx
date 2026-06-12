import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Container,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Tooltip,
  Alert,
  AlertTitle,
  Box,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab
} from '@mui/material'
import {
  BarChart,
  ViewList,
  InfoOutlined,
  MenuBook as BriefingIcon,
  CheckCircleOutline as DoneIcon,
  AccountTree as MarketOverviewIcon,
  SolarPower,
  Air,
  LocalFireDepartment,
  BatteryChargingFull,
  FlashOn
} from '@mui/icons-material'
import { IconButton } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import InfoLabel from '../components/InfoLabel'
import ForecastChartEditor from '../components/ForecastChartEditor'
import MarketPhaseTimeline from '../components/MarketPhaseTimeline'
import MarketPhaseLegend from '../components/MarketPhaseLegend'
import BriefingScreen from '../components/BriefingScreen'
import WaitingScreen from '../components/WaitingScreen'
import RoundResultsScreen from '../components/RoundResultsScreenSimple'
import ScenarioResultsScreen from '../components/ScenarioResultsScreen'
import ContextAssistantDialog from '../components/ContextAssistantDialog'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useSnackbar } from '../components/SnackbarProvider'
import api from '../services/api'
import { io } from 'socket.io-client'
import * as d3 from 'd3'
import {
  filterArrayByVisibleHours,
  getVisibleHourIndices,
  isPlayerInputHourAllowed,
  mapSeriesToVisibleHours,
  sanitizeBidsPayload,
  shouldHideNonEditableHours,
  zeroHiddenBidsPayload,
  zeroHiddenDevicePayload,
  zeroHiddenSeries,
} from '../utils/playerInputScope'

const BASELOAD_PATTERN = [0.92, 0.91, 0.9, 0.9, 0.9, 0.92, 0.94, 0.95, 0.96, 0.96, 0.95, 0.94, 0.93, 0.93, 0.94, 0.95, 0.96, 0.96, 0.95, 0.94, 0.93, 0.93, 0.92, 0.92]
const PEAKING_PATTERN = [0.4, 0.35, 0.32, 0.32, 0.38, 0.5, 0.62, 0.75, 0.85, 0.92, 0.95, 0.96, 0.94, 0.9, 0.88, 0.9, 0.94, 0.95, 0.86, 0.75, 0.65, 0.55, 0.48, 0.42]
const BID_LABELS = ['A', 'B', 'C', 'D', 'E']
const DEFAULT_BID_SPLITS = [50, 20, 15, 10, 5]

const getNormalizedBidCount = (device) => {
  if (device?.bid_count != null) {
    const normalized = Number(device.bid_count)
    if (Number.isFinite(normalized)) {
      return Math.max(0, Math.min(BID_LABELS.length, Math.round(normalized)))
    }
  }
  if (device?.enable_multi_bid === true) return 3
  return 0
}

const getDeviceBidLabels = (device, deviceBids = null, fallbackEnabled = false) => {
  const labels = []
  const count = getNormalizedBidCount(device)
  if (count > 0) labels.push(...BID_LABELS.slice(0, count))
  if (fallbackEnabled && labels.length === 0) labels.push(...BID_LABELS.slice(0, 3))
  if (deviceBids && typeof deviceBids === 'object') {
    BID_LABELS.forEach((label) => {
      if (deviceBids[label] && !labels.includes(label)) labels.push(label)
    })
    Object.keys(deviceBids).filter((k) => BID_LABELS.includes(k)).forEach((label) => {
      if (!labels.includes(label)) labels.push(label)
    })
  }
  return labels
}

// A device is considered bidding-enabled only when its effective bid_count > 0.
// getNormalizedBidCount() already handles the legacy enable_multi_bid fallback
// (returns 3 when bid_count is absent and enable_multi_bid=true). Checking
// enable_multi_bid independently here would incorrectly trigger bidding mode
// for devices that have bid_count=0 but a stale enable_multi_bid=true.
const hasExplicitBiddingDevices = (devices = []) => (
  (devices || []).some((device) => getNormalizedBidCount(device) > 0)
)

const getBidSplitRatios = (count) => {
  if (!count || count <= 0) return []
  const base = DEFAULT_BID_SPLITS.slice(0, count)
  const total = base.reduce((sum, value) => sum + value, 0) || 1
  return base.map((value) => value / total)
}

const getConfiguredBidSplitRatios = (device, labels = getDeviceBidLabels(device)) => {
  if (!labels.length) return []
  const configured = labels.map((label, index) => {
    const raw = Number(device?.default_bids?.[label]?.share_pct)
    if (Number.isFinite(raw) && raw >= 0) return raw
    return DEFAULT_BID_SPLITS[index] ?? 0
  })
  const total = configured.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return getBidSplitRatios(labels.length)
  }
  return configured.map((value) => value / total)
}

const getBidLabelTitle = (label, index) => {
  const legacyNames = ['Baseload', 'Mid-Merit', 'Peak', 'Reserve', 'Flex']
  return legacyNames[index] ? `${label} · ${legacyNames[index]}` : `Bid ${label}`
}

const buildInitialBidsForDevice = (device, horizonHours, baseProfile) => {
  const labels = getDeviceBidLabels(device)
  const defaultPrices = getDefaultBidPrices(device, labels)
  const ratios = getConfiguredBidSplitRatios(device, labels)
  const next = {}
  labels.forEach((label, index) => {
    const fallbackPrice = defaultPrices[label] ?? defaultPrices[BID_LABELS[Math.min(index, 2)]] ?? 0
    const ratio = ratios[index] || 0
    next[label] = {
      price: fallbackPrice,
      hours: Array.from({ length: horizonHours }, (_, hourIdx) => Math.round(((baseProfile[hourIdx] || 0) * ratio) * 100) / 100)
    }
  })
  return next
}

const getBidInputDescription = (count) => {
  if (count <= 1) {
    return 'Configure the explicit bid price for this device. If the bid clears, the dispatched volume settles at the System Marginal Price (SMP).'
  }
  return `Configure the ${count} explicit bid layers for this device. Bids are cleared from lowest to highest price until demand is met. All cleared bids receive the System Marginal Price (SMP).`
}

const LOAD_PATTERN = [0.55, 0.5, 0.48, 0.47, 0.5, 0.62, 0.74, 0.86, 0.93, 0.97, 1.0, 1.0, 0.98, 0.95, 0.92, 0.94, 0.97, 0.98, 0.9, 0.82, 0.72, 0.66, 0.6, 0.58]
const SOLAR_PATTERN = [0, 0, 0, 0, 0.05, 0.15, 0.35, 0.6, 0.78, 0.9, 0.92, 0.9, 0.78, 0.6, 0.35, 0.15, 0.05, 0, 0, 0, 0, 0, 0, 0]
const WIND_PATTERN = [0.52, 0.5, 0.46, 0.44, 0.48, 0.55, 0.6, 0.66, 0.72, 0.75, 0.7, 0.66, 0.62, 0.58, 0.55, 0.5, 0.52, 0.56, 0.6, 0.6, 0.58, 0.55, 0.54, 0.52]
const BATTERY_PATTERN = [0.45, 0.4, 0.35, 0.3, 0.2, 0.1, -0.05, -0.2, -0.4, -0.55, -0.6, -0.45, -0.25, 0, 0.2, 0.4, 0.6, 0.65, 0.55, 0.42, 0.3, 0.2, 0.1, 0]
const DEFAULT_AGG_PATTERN = [0.6, 0.58, 0.55, 0.52, 0.52, 0.62, 0.78, 0.92, 1.02, 1.08, 1.1, 1.05, 0.98, 0.96, 0.98, 1.02, 1.08, 1.1, 1.0, 0.9, 0.82, 0.76, 0.7, 0.65]
const zeroProfile = (len) => Array.from({ length: Math.max(1, len) }, () => 0)

const normalizeBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['false', '0', 'no', 'off', 'disabled', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

const toNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const normalizeMarketStatusValue = (value) => {
  const normalized = String(value || 'market_code').trim().toLowerCase()
  if (normalized === 'enabled') return 'on'
  if (normalized === 'disabled') return 'off'
  if (normalized === 'gated') return 'market_code'
  if (normalized === 'on' || normalized === 'off' || normalized === 'market_code') return normalized
  return 'market_code'
}

const toTradingArray = (marketValue) => {
  if (Array.isArray(marketValue)) return marketValue
  if (Array.isArray(marketValue?.trading)) return marketValue.trading
  return []
}

const getRoundMarketStatus = (marketsCfg, marketKey, roundNum) => {
  const roundIdx = Math.max(0, Number(roundNum || 1) - 1)
  const marketCfg = (marketsCfg || {})[marketKey]
  const trading = toTradingArray(marketCfg)
  return normalizeMarketStatusValue(trading[roundIdx])
}

const calculateNextIdGateHour = (currentHour, gateInterval, gateBase) => {
  const safeInterval = Math.max(1, Number(gateInterval || 1))
  const safeBase = Number(gateBase || 0)
  const hourOfDay = ((currentHour % 24) + 24) % 24
  let nextGateHour = safeBase
  while (nextGateHour <= hourOfDay) {
    nextGateHour += safeInterval
  }
  if (nextGateHour >= 24) {
    nextGateHour = 24 + safeBase
  }
  const dayOffset = Math.floor(currentHour / 24)
  return dayOffset * 24 + nextGateHour
}

// Market Supply/Demand Curves Component
function MarketCurves({ sessionId, currentRound, roundSpanHours = 6, marketMode = 'dam' }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const ref = useRef(null)
  const [marketData, setMarketData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [containerWidth, setContainerWidth] = useState(240)

  useEffect(() => {
    if (!ref.current) return
    const parent = ref.current.parentElement
    const update = () => {
      const width = Math.min(parent?.clientWidth || ref.current.clientWidth || 240, 240)
      setContainerWidth(width)
    }
    update()
    const ro = new ResizeObserver(update)
    if (parent) ro.observe(parent)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  
  useEffect(() => {
    if (!sessionId || !currentRound) {
      setLoading(false)
      return
    }
    
    // Calculate the starting hour of this round
    // Round 1 starts at hour 0, Round 2 starts at hour roundSpanHours, etc.
    const roundStartHour = (currentRound - 1) * roundSpanHours
    
    // Load market structure snapshot for selected market mode
    const loadMarketStructure = async () => {
      setLoading(true)
      setError(null)
      try {
        // Keep the IDM snapshot hour INSIDE the current round. For wide rounds we
        // show a mid-round hour; for narrow rounds (e.g. round_span_hours = 1) the
        // offset must stay within [0, roundSpanHours-1] so it does not leak into the
        // next round's hour.
        const idmOffset = Math.min(
          Math.max(0, roundSpanHours - 1),
          Math.max(1, Math.floor(roundSpanHours / 2)),
        )
        const modeHour = marketMode === 'idm'
          ? roundStartHour + idmOffset
          : roundStartHour
        const { data } = await api.get(`/api/player/market-structure/${sessionId}/${currentRound}/${modeHour}`, {
          params: { market_phase: marketMode === 'idm' ? 'idm' : 'dam' },
        })
        setMarketData(data)
      } catch (err) {
        console.error('[MarketCurves] Failed to load market structure:', err)
        setError('Failed to load market structure')
      } finally {
        setLoading(false)
      }
    }
    
    loadMarketStructure()
  }, [sessionId, currentRound, roundSpanHours, marketMode])
  
  useEffect(() => {
    if (!marketData || !ref.current) return
    
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    
    const M = { top: 16, right: 16, bottom: 32, left: 52 }
    const width = Math.min(Math.max(containerWidth || 240, 200), 240)
    const W = width - M.left - M.right
    const H = 180 - M.top - M.bottom
    const g = svg.attr('width', width).attr('height', 180).append('g').attr('transform', `translate(${M.left},${M.top})`)
    const axisColor = theme.palette.text.secondary
    const gridColor = theme.palette.divider
    const supplyColor = theme.palette.success.main
    const demandColor = theme.palette.error.main
    const smpColor = theme.palette.info.main

    // Sort to ensure monotonic curves (Merit Order)
    const supply = (marketData.supply || []).slice().sort((a, b) => a.price - b.price) // Ascending
    const demand = (marketData.demand || []).slice().sort((a, b) => b.price - a.price) // Descending
    const smp = marketData.smp || 0

    // Cumulative
    const cum = (arr) => {
      let acc = 0
      return arr.map(({ price, volume }) => ({ x0: acc, x1: (acc += volume), p: price }))
    }
    const sCum = cum(supply)
    const dCum = cum(demand)
    const xMax = Math.max(d3.sum(supply, (d) => d.volume), d3.sum(demand, (d) => d.volume)) || 1000

    const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
    // Include SMP in price range so the intersection point is always visible
    const allPrices = [...supply.map(d => d.price), ...demand.map(d => d.price), ...(smp > 0 ? [smp] : [])]
    const minP = allPrices.length ? d3.min(allPrices) : 0
    const maxP = allPrices.length ? d3.max(allPrices) : 1000
    const pad = Math.max((maxP - minP) * 0.1, maxP * 0.05)
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // Axes
    const xAxis = g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(4))
    const yAxis = g.append('g').call(d3.axisLeft(y).ticks(5))
    xAxis.selectAll('path,line').attr('stroke', gridColor)
    yAxis.selectAll('path,line').attr('stroke', gridColor)
    xAxis.selectAll('text').attr('fill', axisColor)
    yAxis.selectAll('text').attr('fill', axisColor)
    g.append('text').attr('x', W / 2).attr('y', H + 28).attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 9).text('Volume (MWh)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', -40).attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 9).text('Price (ZAR/MWh)')

    // Step paths
    const toStep = (arr) => {
      const pts = []
      arr.forEach(({ x0, x1, p }) => {
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      return pts
    }
    const sPts = toStep(sCum)
    const dPts = toStep(dCum)

    // Extend supply curve vertically upward at right edge (last step → top of chart)
    if (sPts.length > 0) sPts.push([sPts[sPts.length - 1][0], 0])
    // Extend demand curve vertically downward at right edge (last step → bottom of chart)
    // This creates the visual intersection with the supply curve at the SMP
    if (dPts.length > 0) dPts.push([dPts[dPts.length - 1][0], H])

    g.append('path').attr('d', d3.line()(sPts)).attr('fill', 'none').attr('stroke', supplyColor).attr('stroke-width', 2)
    g.append('path').attr('d', d3.line()(dPts)).attr('fill', 'none').attr('stroke', demandColor).attr('stroke-width', 2)

    // SMP line + intersection marker
    if (smp > 0) {
      // Find the clearing x-coordinate from the accepted supply frontier.
      const clearedVol = sCum.length > 0
        ? (sCum.find(s => s.p >= smp)?.x1 ?? sCum[sCum.length - 1]?.x1 ?? 0)
        : (dCum.length > 0 ? (dCum.find(d => d.p <= smp)?.x1 ?? 0) : 0)
      const xIntersect = clearedVol > 0 ? x(clearedVol) : null
      const marginalStep = sCum.find((segment) => segment.x1 >= clearedVol - 1e-6) || null
      const smpMatchesSupplyStep = Boolean(
        xIntersect !== null
        && marginalStep
        && Math.abs((marginalStep.p || 0) - smp) < 1e-6
      )

      // If SMP equals the marginal supply step, start the dashed line at the clearing point
      // so the solid supply step remains visible and the point reads like a constructed MCP.
      const smpLineStart = smpMatchesSupplyStep && xIntersect !== null ? xIntersect : 0

      g.append('line')
        .attr('x1', smpLineStart)
        .attr('x2', W)
        .attr('y1', y(smp))
        .attr('y2', y(smp))
        .attr('stroke', smpColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2')
      
      g.append('text')
        .attr('x', W - 5)
        .attr('y', y(smp) - 4)
        .attr('font-size', 9)
        .attr('fill', smpColor)
        .attr('text-anchor', 'end')
        .text(`SMP: ${smp.toFixed(0)} ZAR/MWh`)
      
      if (xIntersect !== null) {
        // Circle at intersection (vertical line removed – demand curve extension now shows clearing volume visually)
        g.append('circle')
          .attr('cx', xIntersect)
          .attr('cy', y(smp))
          .attr('r', 4)
          .attr('fill', smpColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5)

        if (smpMatchesSupplyStep) {
          g.append('text')
            .attr('x', Math.max(8, xIntersect - 6))
            .attr('y', Math.min(H - 6, y(smp) + 14))
            .attr('font-size', 8)
            .attr('fill', smpColor)
            .attr('text-anchor', 'end')
            .text('Clearing point')
        }
      }
    }

    // Time display
    const timeDisplay = g.append('g').attr('transform', `translate(10, 10)`)
    timeDisplay.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('font-size', 11)
      .attr('fill', axisColor)
      .style('font-weight', 'bold')
      .text(`Round ${marketData.round_num}, Hour ${String(marketData.hour_of_day).padStart(2, '0')}:00`)

    const sourceLabel = marketData.market_source === 'submitted_market'
      ? (marketData.session_mode === 'shared_market'
          ? `Live market (${marketData.submitted_players || 0} submitted)`
          : 'Your submitted market')
      : 'Synthetic preview'

    timeDisplay.append('text')
      .attr('x', 0)
      .attr('y', 12)
      .attr('font-size', 9)
      .attr('fill', smpColor)
      .text(sourceLabel)
  }, [marketData, containerWidth, theme.palette.mode])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="error">{error}</Typography>
      </Box>
    )
  }

  return <svg ref={ref} width="100%" height={180} style={{ border: `1px solid ${theme.palette.divider}`, background: isDark ? theme.palette.background.default : theme.palette.background.paper }} />
}
const clampValue = (val, min = 0, max = Number.POSITIVE_INFINITY) => {
  if (!Number.isFinite(max)) return Math.max(min, val)
  if (max <= min) return Math.max(min, val)
  return Math.min(max, Math.max(min, val))
}
const samplePattern = (pattern, idx) => pattern[idx % pattern.length]
const roundValue = (val) => Number(val.toFixed(2))

const scaleMwBySharedMarketSlot = (value, sharedMarketContext = {}) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return numericValue
  return numericValue * getSharedMarketSlotScale(sharedMarketContext)
}

const formatMwValue = (value) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '-'
  return Number.isInteger(numericValue) ? `${numericValue}` : numericValue.toFixed(1)
}

const buildGeneratorProfile = (device, len, pattern, sharedMarketContext = {}) => {
  const n = Math.max(1, len)
  const maxPower = toNumber(scaleMwBySharedMarketSlot(device?.max_power_mw ?? device?.capacity_mw ?? device?.capacity ?? 0, sharedMarketContext), 0)
  if (maxPower <= 0) return zeroProfile(n)
  const minPct = clampValue(toNumber(device?.min_load_pct ?? 0, 0), 0, 100)
  const minPower = maxPower * (minPct / 100)
  const safeMin = minPower > 0 ? Math.min(minPower * 1.02, maxPower * 0.9) : 0
  const safeMax = maxPower * 0.97
  if (safeMax <= safeMin) {
    return Array.from({ length: n }, () => roundValue(maxPower * 0.95))
  }
  const span = safeMax - safeMin
  return Array.from({ length: n }, (_, idx) => {
    const frac = clampValue(samplePattern(pattern, idx), 0, 1)
    const value = safeMin + frac * span
    return roundValue(value)
  })
}

const buildLoadProfile = (device, len, sharedMarketContext = {}) => {
  const n = Math.max(1, len)
  const baseline = Math.max(0, toNumber(scaleMwBySharedMarketSlot(device?.baseline_load_mw ?? 0, sharedMarketContext), 0))
  const peakRaw = toNumber(scaleMwBySharedMarketSlot(device?.peak_load_mw ?? baseline, sharedMarketContext), baseline)
  const peak = Math.max(baseline + 5, peakRaw)
  const span = Math.max(peak - baseline, 1)
  return Array.from({ length: n }, (_, idx) => {
    const frac = clampValue(samplePattern(LOAD_PATTERN, idx), 0, 1)
    const value = clampValue(baseline + frac * span, baseline, peak * 0.98)
    return roundValue(value)
  })
}

const buildRenewableProfile = (device, len, pattern, cfNormalizer, sharedMarketContext = {}) => {
  const n = Math.max(1, len)
  const capacity = toNumber(scaleMwBySharedMarketSlot(device?.max_power_mw ?? device?.capacity_mw ?? device?.max_power ?? 0, sharedMarketContext), 0)
  if (capacity <= 0) return zeroProfile(n)
  const cf = clampValue(toNumber(device?.capacity_factor_pct ?? 0, 0) / 100, 0, 1)
  const scale = cf > 0 ? clampValue(cf / cfNormalizer, 0.4, 0.92) : 0.7
  const peakOutput = capacity * 0.95
  return Array.from({ length: n }, (_, idx) => {
    const frac = clampValue(samplePattern(pattern, idx), 0, 1)
    const value = peakOutput * frac * scale
    return roundValue(value)
  })
}

const buildBatteryProfile = (device, len, sharedMarketContext = {}) => {
  const n = Math.max(1, len)
  const power = toNumber(scaleMwBySharedMarketSlot(device?.power_rating_mw ?? device?.power_mw ?? device?.capacity_mw ?? 0, sharedMarketContext), 0)
  if (power <= 0) return zeroProfile(n)
  const limit = power * 0.9
  return Array.from({ length: n }, (_, idx) => {
    const frac = samplePattern(BATTERY_PATTERN, idx)
    const value = clampValue(frac * limit, -limit, limit)
    return roundValue(value)
  })
}

const buildGenericProfile = (device, len, sharedMarketContext = {}) => {
  const n = Math.max(1, len)
  const capacity = Math.max(20, toNumber(scaleMwBySharedMarketSlot(device?.max_power_mw ?? device?.capacity_mw ?? 60, sharedMarketContext), 60))
  return Array.from({ length: n }, (_, idx) => {
    const value = capacity * 0.6 * samplePattern(DEFAULT_AGG_PATTERN, idx)
    return roundValue(value)
  })
}

const buildDeviceProfile = (device, len, sharedMarketContext = {}) => {
  const type = (device?.type || '').toLowerCase()
  if (['coal', 'nuclear'].includes(type)) return buildGeneratorProfile(device, len, BASELOAD_PATTERN, sharedMarketContext)
  if (['gas', 'hydro'].includes(type)) return buildGeneratorProfile(device, len, PEAKING_PATTERN, sharedMarketContext)
  if (type === 'solar') return buildRenewableProfile(device, len, SOLAR_PATTERN, 0.3, sharedMarketContext)
  if (type === 'wind') return buildRenewableProfile(device, len, WIND_PATTERN, 0.4, sharedMarketContext)
  if (type === 'battery') return buildBatteryProfile(device, len, sharedMarketContext)
  if (type.includes('load')) return buildLoadProfile(device, len, sharedMarketContext)
  return buildGenericProfile(device, len, sharedMarketContext)
}

const getEffectiveVariableCostBase = (device) => {
  const tiers = device?.variable_cost_tiers
  if (Array.isArray(tiers) && tiers.length > 0) {
    let totalWeight = 0
    let weightedCost = 0
    tiers.forEach((tier) => {
      const width = Number(tier.to_pct) - Number(tier.from_pct)
      weightedCost += width * Number(tier.cost_zar_per_mwh || 0)
      totalWeight += width
    })
    return totalWeight > 0 ? weightedCost / totalWeight : 0
  }
  return toNumber(device?.variable_cost_zar_per_mwh ?? device?.cost_per_mwh_zar ?? 0, 0)
}

const getDeviceCostRange = (device) => {
  const tiers = Array.isArray(device?.variable_cost_tiers) ? device.variable_cost_tiers : []
  const validCosts = tiers
    .map((tier) => Number(tier?.cost_zar_per_mwh))
    .filter((cost) => Number.isFinite(cost))

  if (validCosts.length > 0) {
    const minCost = Math.min(...validCosts)
    const maxCost = Math.max(...validCosts)
    return minCost === maxCost ? `${minCost} ZAR/MWh` : `${minCost}-${maxCost} ZAR/MWh`
  }

  const flatCost = device?.cost_per_mwh_zar ?? device?.marginal_cost
  return flatCost != null ? `${flatCost} ZAR/MWh` : null
}

const getDeviceCostSummary = (device) => {
  const costRange = getDeviceCostRange(device)
  return costRange ? `Cost: ${costRange}` : null
}

const getDeviceCapacityLabel = (device, sharedMarketContext = {}) => {
  const type = (device?.type || '').toLowerCase()
  const batteryPowerMw = scaleMwBySharedMarketSlot(device?.power_mw ?? device?.power_rating_mw ?? device?.max_power_mw ?? device?.capacity_mw, sharedMarketContext)

  if (type.includes('load')) {
    const baseline = device?.baseline_load_mw != null ? `${formatMwValue(scaleMwBySharedMarketSlot(device.baseline_load_mw, sharedMarketContext))} MW base` : null
    const peak = device?.peak_load_mw != null ? `${formatMwValue(scaleMwBySharedMarketSlot(device.peak_load_mw, sharedMarketContext))} MW peak` : null
    return [baseline, peak].filter(Boolean).join(' / ') || '-'
  }

  if (type === 'battery') {
    const power = Number.isFinite(Number(batteryPowerMw)) ? `${formatMwValue(batteryPowerMw)} MW power` : null
    const capacity = (device?.capacity_mwh ?? device?.capacity_mw) != null ? `${device.capacity_mwh ?? device.capacity_mw} MWh` : null
    const efficiency = device?.efficiency_pct != null ? `Eff. ${device.efficiency_pct}%` : null
    return [power, capacity, efficiency].filter(Boolean).join(' / ') || '-'
  }

  if (device?.capacity_mw != null || device?.max_power_mw != null || device?.capacity != null) {
    const capacity = scaleMwBySharedMarketSlot(device?.capacity_mw ?? device?.max_power_mw ?? device?.capacity, sharedMarketContext)
    return `${formatMwValue(capacity)} MW`
  }
  return '-'
}

const getDeviceFixedCostLabel = (device) => {
  return device?.fixed_cost_zar_per_hour != null ? `${device.fixed_cost_zar_per_hour} ZAR/h` : '-'
}

const getDefaultBidPrices = (device, labels = getDeviceBidLabels(device)) => {
  const variableCost = getEffectiveVariableCostBase(device)
  const deviceType = (device?.type || '').toLowerCase()
  const multipliers = deviceType.includes('load')
    ? [1.3, 1.2, 1.1, 1.0, 0.9]
    : [0.85, 0.95, 1.1, 1.2, 1.3]
  const fallbackBase = deviceType.includes('load')
    ? [1300, 1200, 1100, 1000, 900]
    : [850, 950, 1100, 1200, 1300]
  const prices = {}
  
  if (variableCost <= 0) {
    labels.forEach((label, index) => {
      prices[label] = fallbackBase[index] ?? fallbackBase[fallbackBase.length - 1]
    })
  } else {
    labels.forEach((label, index) => {
      prices[label] = Math.round(variableCost * (multipliers[index] ?? multipliers[multipliers.length - 1]))
    })
  }

  labels.forEach((label) => {
    const configuredPrice = Number(device?.default_bids?.[label]?.price)
    if (Number.isFinite(configuredPrice) && configuredPrice >= 0) {
      prices[label] = configuredPrice
    }
  })

  return prices
}

const buildAggregateFallback = (len, baseMw = 60) => {
  const n = Math.max(1, len)
  return Array.from({ length: n }, (_, idx) => roundValue(baseMw * samplePattern(DEFAULT_AGG_PATTERN, idx)))
}

const toPositiveNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

const getDeviceMaxCapability = (device = {}) => {
  if (!device) return 0
  const type = (device.type || '').toLowerCase()

  if (type.includes('load')) {
    const peak = toPositiveNumber(device.peak_load_mw)
    if (peak != null) return peak
    const baseline = toPositiveNumber(device.baseline_load_mw)
    if (baseline != null) return baseline * 1.5
    return 0
  }

  if (type === 'battery') {
    const batteryFields = [
      device.power_rating_mw,
      device.power_mw,
      device.capacity_mw,
      device.max_charge_rate_mw,
      device.max_discharge_rate_mw
    ]
    for (const cand of batteryFields) {
      const val = toPositiveNumber(cand)
      if (val != null) return val
    }
    return 0
  }

  const candidates = [
    device.max_power_mw,
    device.capacity_mw,
    device.max_power,
    device.capacity,
    device.nameplate_mw,
    device.rated_power_mw
  ]
  for (const cand of candidates) {
    const val = toPositiveNumber(cand)
    if (val != null) return val
  }
  return 0
}

const getSharedMarketSlotScale = (sharedMarketContext = {}) => {
  if (sharedMarketContext?.mode !== 'shared_market' || !sharedMarketContext?.selectedType) return 1
  const allowedType = Array.isArray(sharedMarketContext?.allowedTypes)
    ? sharedMarketContext.allowedTypes.find((entry) => String(entry?.type_id || '') === String(sharedMarketContext.selectedType || ''))
    : null
  const maxPlayers = Number(allowedType?.max_players)
  return Number.isFinite(maxPlayers) && maxPlayers > 0 ? 1 / maxPlayers : 1
}

const toFactorArray = (value, expectedLength) => {
  if (!Array.isArray(value)) return null
  if (value.length < expectedLength) return null
  return value.map((item) => {
    const num = Number(item)
    return Number.isFinite(num) ? num : 1
  })
}

const getSimTemporalContext = (cfg = {}) => {
  const currentRound = Number(cfg?.current_round || 1)
  const roundSpan = Number(cfg?.general?.round_span_hours || 6)
  const startParts = String(cfg?.general?.start_time || '00:00').split(':').map((n) => Number(n))
  const startHour = Number.isFinite(startParts[0]) ? startParts[0] : 0
  const simHour = Math.max(0, (currentRound - 1) * roundSpan)
  const absHour = startHour + simHour
  const hourOfDay = ((absHour % 24) + 24) % 24
  const monthIdx = (() => {
    if (!cfg?.general?.fake_date) return null
    const d = new Date(cfg.general.fake_date)
    if (Number.isNaN(d.getTime())) return null
    d.setHours(startHour, 0, 0, 0)
    d.setTime(d.getTime() + simHour * 3600 * 1000)
    return d.getMonth()
  })()
  return { hourOfDay, monthIdx }
}

const resolveMixEntryForDevice = (device = {}, cfg = {}) => {
  const type = (device.type || '').toLowerCase()
  const marketCfg = cfg?.market || {}
  const genMix = marketCfg.generator_mix || {}
  const consMix = marketCfg.consumer_mix || {}
  const isLoad = type.includes('load')

  if (!isLoad) {
    let genKey = type
    if (genKey === 'solar' && genMix.pv) genKey = 'pv'
    const entry = genMix[genKey]
    return { mixKey: genKey, mixEntry: entry }
  }

  let consKey = null
  if (type.includes('industrial')) consKey = 'industrial'
  else if (type.includes('residential') || type.includes('household') || type.includes('commercial')) consKey = 'household'
  else if (type.includes('agriculture')) consKey = 'agriculture'

  const entry = consKey ? consMix[consKey] : null
  return { mixKey: consKey, mixEntry: entry }
}

const getDeviceEffectiveLimit = (device = {}, cfg = {}, sharedMarketContext = {}) => {
  if (!device) return { limit: 0, context: null }

  const type = (device.type || '').toLowerCase()
  const { hourOfDay, monthIdx } = getSimTemporalContext(cfg)

  const configuredBase = getDeviceMaxCapability(device)
  if (!(configuredBase > 0)) return { limit: 0, context: `${String(hourOfDay).padStart(2, '0')}:00` }

  let availabilityFactor = 1
  const { mixEntry } = resolveMixEntryForDevice(device, cfg)

  if (mixEntry && typeof mixEntry === 'object') {
    const profile = Array.isArray(mixEntry.profile) ? mixEntry.profile : null
    const seasonal = Array.isArray(mixEntry.seasonal_profile) ? mixEntry.seasonal_profile : null
    if (profile && profile.length > 0) {
      availabilityFactor *= Number(profile[hourOfDay % profile.length] || 1)
    }
    if (monthIdx != null && seasonal && seasonal.length > 0) {
      availabilityFactor *= Number(seasonal[monthIdx % seasonal.length] || 1)
    }
  } else {
    const availabilityProfile = toFactorArray(device.availability_profile, 24)
    if (availabilityProfile) {
      availabilityFactor *= Number(availabilityProfile[hourOfDay] || 1)
    }

    const hourlyFactors = toFactorArray(
      device.hourly_factors || device.availability_profile_hourly || device.solar_profile || device.wind_profile,
      24
    )
    const monthlyFactors = toFactorArray(
      device.monthly_factors || device.seasonal_profile_monthly || device.availability_profile_monthly,
      12
    )
    if (hourlyFactors) availabilityFactor *= Number(hourlyFactors[hourOfDay] || 1)
    if (monthIdx != null && monthlyFactors) availabilityFactor *= Number(monthlyFactors[monthIdx] || 1)
  }

  if (!type.includes('load')) {
    const capacityFactorPct = Number(device.capacity_factor_pct)
    if (Number.isFinite(capacityFactorPct) && capacityFactorPct > 0) {
      availabilityFactor *= Math.max(0, capacityFactorPct / 100)
    }
  }

  const slotScale = getSharedMarketSlotScale(sharedMarketContext)
  const limit = Math.max(0, configuredBase * (Number.isFinite(availabilityFactor) ? availabilityFactor : 1) * slotScale)
  return { limit, context: `${String(hourOfDay).padStart(2, '0')}:00` }
}

// Apply active capacity-event multipliers/additives to an effective-capacity
// value, mirroring engine.py get_device_event_modifiers.  Only 'capacity'-type
// events that target this device (by device id or device type) are applied.
// activeEvents is the Player state array; executionPhase is 'dam'|'idm'|null.
const applyCapacityEvents = (baseLimit, device = {}, activeEvents = [], executionPhase = null) => {
  if (!Array.isArray(activeEvents) || activeEvents.length === 0) return baseLimit
  const deviceId = String(device.id || '').toLowerCase()
  const deviceType = String(device.type || '').toLowerCase()
  let mult = 1.0
  let add = 0.0
  for (const evt of activeEvents) {
    if (String(evt?.type || '').toLowerCase() !== 'capacity') continue
    // Phase filter: if the event has a market_phase, only apply it when the
    // current execution phase matches (same rule as backend select_events_for_round).
    const evtPhase = String(evt?.market_phase || '').toLowerCase()
    if (evtPhase && executionPhase && evtPhase !== executionPhase) continue
    const target = String(evt?.target || 'all').toLowerCase()
    const targetId = String(evt?.target_id || '').toLowerCase()
    let applies = false
    if (target === 'all') applies = true
    else if (target === 'device') applies = targetId === deviceId || targetId === deviceType
    if (!applies) continue
    mult *= Number.isFinite(Number(evt.multiplier)) ? Number(evt.multiplier) : 1.0
    add  += Number.isFinite(Number(evt.additive))   ? Number(evt.additive)   : 0.0
  }
  return Math.max(0, baseLimit * mult + add)
}

const getEffectiveDeviceMetric = (device = {}, cfg = {}, sharedMarketContext = {}, activeEvents = [], executionPhase = null) => {
  if (!device) return null
  const type = (device.type || '').toLowerCase()
  const { limit: rawLimit, context } = getDeviceEffectiveLimit(device, cfg, sharedMarketContext)
  if (!(rawLimit > 0)) return null
  const limit = applyCapacityEvents(rawLimit, device, activeEvents, executionPhase)
  return {
    label: type.includes('load') ? 'Available demand now' : 'Available output now',
    value: limit,
    context: context || null
  }
}

function TimerAndClock({ timeRemaining }) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const isWarning = timeRemaining <= 30 && timeRemaining > 0

  if (timeRemaining === null) return null

  return (
    <Box
      sx={{
        textAlign: 'center',
        p: 1.5,
        backgroundColor: isWarning ? '#d32f2f' : '#1976d2',
        borderRadius: 1,
        boxShadow: 3,
        minWidth: 120,
        transition: 'all 0.3s'
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#ffffff', mb: 0.5 }}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </Typography>
      <Typography variant="caption" sx={{ color: '#ffffff', opacity: 0.9, fontSize: '0.7rem' }}>
        {isWarning ? 'Time running out!' : 'Time remaining'}
      </Typography>
    </Box>
  )
}

function StackedLotsChart({ bidSeries = {}, hourIndices = null, maxValue, effectiveLimitMw = null, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams, deviceType, startTime, fakeDate = '', hourStatus = [] }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!svgRef.current) return
    const parent = svgRef.current.parentElement
    const update = () => {
      const width = parent?.clientWidth || svgRef.current.clientWidth || 0
      if (width > 0) setContainerWidth(width)
    }
    update()
    const ro = new ResizeObserver(update)
    if (parent) ro.observe(parent)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  
  useEffect(() => {
    if (!svgRef.current) return
    if (!containerWidth) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const width = Math.max(containerWidth, 260)
    const H = 220
    const M = { top: 16, right: 20, bottom: 36, left: 46 }
    const iw = width - M.left - M.right
    const ih = H - M.top - M.bottom
    
    const g = svg.attr('width', width).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)
    const gridColor = theme.palette.divider
    const axisColor = theme.palette.text.secondary
    const lotLabels = BID_LABELS.filter((label) => Array.isArray(bidSeries[label]))
    const inactiveGrays = isDark
      ? ['#9e9e9e', '#757575', '#616161', '#424242', '#303030']
      : ['#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242']
    const getLotColor = (index, label) =>
      label === activeLot ? theme.palette.primary.main : inactiveGrays[index % inactiveGrays.length]
    const referenceMaxColor = theme.palette.error.main
    const referenceWarnColor = theme.palette.warning.main
    const referenceExpectedColor = theme.palette.success.main

    const n = lotLabels.reduce((max, label) => Math.max(max, bidSeries[label]?.length || 0), 0)
    if (n === 0) return

    const stackedMax = d3.max(d3.range(n).map(i => lotLabels.reduce((sum, label) => sum + (bidSeries[label]?.[i] || 0), 0)))
    const yMax = Math.max(stackedMax || 100, maxValue || 100)
    
    // Scales
    const x = d3.scaleLinear().domain([1, n + 1]).range([0, iw])
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([ih, 0])
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''))
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '2,2')
    
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(d3.range(1, n + 1)).tickSize(-ih).tickFormat(''))
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '2,2')
    
    // Axes
    const startHour = startTime ? parseInt(startTime.split(':')[0]) : 0
    const displayIndices = Array.isArray(hourIndices) && hourIndices.length === n ? hourIndices : null
    const tickStep = n > 24 ? Math.ceil(n / 12) : 1
    const tickPositions = d3.range(n).filter(i => i % tickStep === 0 || i === n - 1).map(i => i + 1)
    const bottomAxis = g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(tickPositions).tickFormat(d => {
        const idx = d - 1
        const absHour = displayIndices
          ? startHour + (displayIndices[idx] ?? displayIndices[displayIndices.length - 1])
          : startHour + idx
        return `${String(absHour % 24).padStart(2, '0')}:00`
      }))
    bottomAxis.selectAll('text').style('font-size', '10px').attr('fill', axisColor)
    bottomAxis.selectAll('path,line').attr('stroke', gridColor)
    
    const leftAxis = g.append('g').call(d3.axisLeft(y).ticks(6))
    leftAxis.selectAll('path,line').attr('stroke', gridColor)
    leftAxis.selectAll('text').attr('fill', axisColor)
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -36)
      .attr('x', -ih / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', axisColor)
      .style('font-size', '11px')
      .text('MW (Stacked)')
    
    // Background regions based on hourStatus (matching ForecastChartEditor)
    // Group consecutive hours with same status
    const statusRanges = []
    if (hourStatus && hourStatus.length > 0) {
      let currentStatus = hourStatus[0]
      let startIdx = 0
      
      for (let i = 1; i <= Math.min(n, hourStatus.length); i++) {
        if (i === hourStatus.length || i === n || hourStatus[i] !== currentStatus) {
          statusRanges.push({ status: currentStatus, start: startIdx, end: i })
          if (i < hourStatus.length && i < n) {
            currentStatus = hourStatus[i]
            startIdx = i
          }
        }
      }
    }
    
    // Color config matching ForecastChartEditor
    const phaseConfig = {
      locked: { color: theme.palette.text.disabled, opacity: isDark ? 0.16 : 0.22 },
      id: { color: theme.palette.warning.main, opacity: isDark ? 0.16 : 0.20 },
      da: { color: theme.palette.warning.light, opacity: isDark ? 0.14 : 0.20 },
      da_r1: { color: theme.palette.info.main, opacity: isDark ? 0.14 : 0.20 },
      forecast: { color: theme.palette.primary.main, opacity: isDark ? 0.10 : 0.14 }
    }
    
    // Draw background rectangles for each phase
    statusRanges.forEach(range => {
      const config = phaseConfig[range.status] || phaseConfig.forecast
      const xStart = x(Math.max(1, range.start + 1))
      const xEnd = x(Math.min(n + 1, range.end + 1))
      const width = xEnd - xStart
      
      if (width > 5) {
        g.append('rect')
          .attr('x', xStart)
          .attr('y', 0)
          .attr('width', width)
          .attr('height', ih)
          .attr('fill', config.color)
          .attr('opacity', config.opacity)
          .style('pointer-events', 'none')
      }
    })
    
    const stackedData = d3.range(n).map(i => {
      const entry = { hour: i + 1 }
      lotLabels.forEach((label) => {
        entry[label] = bidSeries[label]?.[i] || 0
      })
      return entry
    })

    if (stackedData.length > 0) {
      const lastEntry = stackedData[stackedData.length - 1]
      const terminalEntry = { hour: n + 1 }
      lotLabels.forEach((label) => {
        terminalEntry[label] = lastEntry[label] || 0
      })
      stackedData.push(terminalEntry)
    }

    const stack = d3.stack()
      .keys(lotLabels)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone)
    
    const series = stack(stackedData)
    
    const area = d3.area()
      .x(d => x(d.data.hour))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveStepAfter)
    
    g.selectAll('.area')
      .data(series)
      .enter()
      .append('path')
      .attr('class', 'area')
      .attr('fill', (d, i) => getLotColor(i, lotLabels[i]))
      .attr('opacity', (d, i) => lotLabels[i] === activeLot ? 0.85 : 0.70)
      .attr('d', area)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const lotIndex = series.indexOf(d)
        if (lotIndex >= 0) onLotChange(lotLabels[lotIndex])
      })
    
    // Reference lines based on device type (Max Power, Expected, etc.)
    if (deviceParams && deviceType) {
      const deviceTypeNorm = (deviceType || '').toLowerCase()
      
      if (['coal', 'gas', 'hydro', 'nuclear'].includes(deviceTypeNorm)) {
        // Thermal generators: current operational availability, min_load
        const configuredMaxPower = Number(deviceParams.max_power_mw || deviceParams.capacity_mw || 0)
        const maxPower = Number.isFinite(Number(effectiveLimitMw)) && Number(effectiveLimitMw) > 0
          ? Number(effectiveLimitMw)
          : configuredMaxPower
        const minLoadPct = deviceParams.min_load_pct || 0
        const minPower = (minLoadPct / 100) * configuredMaxPower
        
        if (maxPower > 0 && maxPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(maxPower))
            .attr('y2', y(maxPower))
            .attr('stroke', referenceMaxColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,0')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(maxPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', referenceMaxColor)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Available now: ${maxPower.toFixed(0)} MW`)
        }
        
        if (minPower > 0 && minPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(minPower))
            .attr('y2', y(minPower))
            .attr('stroke', referenceWarnColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(minPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', referenceWarnColor)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Min Load: ${minPower.toFixed(0)} MW`)
        }
      } else if (['solar', 'wind'].includes(deviceTypeNorm)) {
        // Renewables: current operational availability, expected output
        const configuredMaxPower = Number(deviceParams.max_power_mw || deviceParams.capacity_mw || 0)
        const maxPower = Number.isFinite(Number(effectiveLimitMw)) && Number(effectiveLimitMw) > 0
          ? Number(effectiveLimitMw)
          : configuredMaxPower
        const capFactor = deviceParams.capacity_factor_pct || 0
        const toFactorArray = (value, expectedLength) => {
          if (!Array.isArray(value)) return null
          if (value.length < expectedLength) return null
          return value.map((item) => {
            const num = Number(item)
            return Number.isFinite(num) ? num : 1
          })
        }
        const monthlyFactors = toFactorArray(
          deviceParams.monthly_factors
          || deviceParams.seasonal_profile_monthly
          || deviceParams.availability_profile_monthly,
          12
        )
        const hourlyFactors = toFactorArray(
          deviceParams.hourly_factors
          || deviceParams.availability_profile_hourly
          || deviceParams.solar_profile
          || deviceParams.wind_profile,
          24
        )
        const currentSimHour = Math.max(0, ((Number(currentRound) || 1) - 1) * (Number(roundSpan) || 1))
        const parsedStart = String(startTime || '00:00').split(':')
        const parsedHour = Number(parsedStart[0]) || 0
        const hourOfDay = ((parsedHour + currentSimHour) % 24 + 24) % 24
        const monthIdx = (() => {
          if (!fakeDate) return null
          const base = new Date(fakeDate)
          if (Number.isNaN(base.getTime())) return null
          const parsedMinute = Number(parsedStart[1]) || 0
          base.setHours(parsedHour, parsedMinute, 0, 0)
          const d = new Date(base.getTime() + currentSimHour * 3600 * 1000)
          return d.getMonth()
        })()
        const monthlyFactor = monthIdx != null && monthlyFactors ? Number(monthlyFactors[monthIdx] || 1) : 1
        const hourlyFactor = hourlyFactors ? Number(hourlyFactors[hourOfDay] || 1) : 1
        const expected = (capFactor / 100) * configuredMaxPower * monthlyFactor * hourlyFactor
        const maxEqualsExpected = Math.abs(expected - maxPower) <= Math.max(0.5, maxPower * 0.01)
        
        if (maxPower > 0 && maxPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(maxPower))
            .attr('y2', y(maxPower))
            .attr('stroke', referenceMaxColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,0')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(maxPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', referenceMaxColor)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Available now: ${maxPower.toFixed(0)} MW`)
        }
        
        if (expected > 0 && expected <= yMax && !maxEqualsExpected) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(expected))
            .attr('y2', y(expected))
            .attr('stroke', referenceExpectedColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,3')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(expected) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', referenceExpectedColor)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Expected (KSE): ${expected.toFixed(0)} MW`)
        }
      } else if (deviceTypeNorm.includes('load')) {
        const peakConfigured = Number(deviceParams.peak_load_mw || deviceParams.baseline_load_mw || 0)
        const maxPower = Number.isFinite(Number(effectiveLimitMw)) && Number(effectiveLimitMw) > 0
          ? Number(effectiveLimitMw)
          : peakConfigured

        if (maxPower > 0 && maxPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(maxPower))
            .attr('y2', y(maxPower))
            .attr('stroke', referenceMaxColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,0')

          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(maxPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', referenceMaxColor)
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Available now: ${maxPower.toFixed(0)} MW`)
        }
      }
    }
    
  }, [bidSeries, hourIndices, maxValue, effectiveLimitMw, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams, deviceType, startTime, fakeDate, hourStatus, containerWidth, theme.palette.mode])
  
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ mb: 0 }}>Bid Overview</Typography>
        <InfoLabel
          showTitle={false}
          tooltip="Stacked explicit bids by hour. The red max-power line uses effective capacity for this round (hour/month profile aware), so it can differ from static nameplate values."
        />
      </Stack>
      <svg ref={svgRef}></svg>
    </Box>
  )
}

export default function Player() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const lotHighlightBg = isDark ? alpha(theme.palette.primary.main, 0.22) : '#e3f2fd'
  const groupedSectionSurface = isDark ? alpha(theme.palette.common.white, 0.06) : '#f5f5f5'
  const groupedSectionInfoBg = isDark ? alpha(theme.palette.info.main, 0.14) : '#e3f2fd'
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showSnack } = useSnackbar()

  // Auto-load active session or use sessionId from query params
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState([])
  const [cfg, setCfg] = useState({
    general: { round_span_hours: 6, forecast_horizon_hours: 48, freeze_hours: 6, day_ahead_gate_hour: 12, horizon_hours: 24, fake_date: '', start_time: '' },
    player_input: { mode: 'all_hours', editable_offsets: [], hide_non_editable_hours: false, allow_other_rounds_editing: true },
    current_round: 1,
    scenario_name: '',
    campaign_name: ''
  })
  const [status, setStatus] = useState('pending')
  // Two-phase rounds: 'dam' (Day-Ahead phase) | 'idm' (Intraday phase) | null (single-phase / no phase)
  const [marketPhase, setMarketPhase] = useState(null)
  // DAM-phase clearing feedback shown at the top of the player screen during the IDM phase
  const [damPhaseFeedback, setDamPhaseFeedback] = useState(null)
  const [marketDialogOpen, setMarketDialogOpen] = useState(false)
  const [marketDialogData, setMarketDialogData] = useState(null)
  const [roundsSummary, setRoundsSummary] = useState([])
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [initialDuration, setInitialDuration] = useState(null)
  const [marketInsightsTab, setMarketInsightsTab] = useState('dam')
  // The Market Structure panel only exposes the Day-Ahead scope, so the insights
  // tab is pinned to 'dam' regardless of the active two-phase market phase.
  useEffect(() => {
    setMarketInsightsTab('dam')
  }, [marketPhase])
  const [mode, setMode] = useState('isolated_per_player')
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [allowedTypes, setAllowedTypes] = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [playerTypes, setPlayerTypes] = useState([]) // all player types from scenario
  const [typeDevices, setTypeDevices] = useState([]) // device ids for selected type
  const [deviceHours, setDeviceHours] = useState({}) // { device_id: number[] }
  const [scenarioDevices, setScenarioDevices] = useState([]) // full device definitions from scenario
  const deviceChartRefs = useRef({})
  const forecastSeedKeyRef = useRef(null)
  const [activeEvents, setActiveEvents] = useState([])
  const [useChartEditor, setUseChartEditor] = useState(true)
  const [deviceView, setDeviceView] = useState(() => {
    // Restore deviceView from localStorage on mount
    try {
      const saved = localStorage.getItem(`player_deviceView_${sessionId}`)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedTasks, setCompletedTasks] = useState(new Set())

  
  // Persist deviceView to localStorage whenever it changes
  useEffect(() => {
    if (sessionId && Object.keys(deviceView).length > 0) {
      try {
        localStorage.setItem(`player_deviceView_${sessionId}`, JSON.stringify(deviceView))
      } catch (e) { console.error('Failed to save deviceView:', e) }
    }
  }, [deviceView, sessionId])
  const [scenario, setScenario] = useState(null)
  const [sessionConfigReady, setSessionConfigReady] = useState(false)
  const [hourlySeries, setHourlySeries] = useState([])
  const [damHourlySeries, setDamHourlySeries] = useState([])
  const [idmHourlySeries, setIdmHourlySeries] = useState([])
  const [deviceBids, setDeviceBids] = useState({})
  const [autoBidSettings, setAutoBidSettings] = useState({}) // { [device_id]: { enabled, buyThreshold, sellThreshold } }
  const [biddingEnabled, setBiddingEnabled] = useState(false)
  const [activeLot, setActiveLot] = useState(() => {
    try {
      const saved = localStorage.getItem(`player_activeLot_${sessionId}`)
      return saved && BID_LABELS.includes(saved) ? saved : 'A'
    } catch { return 'A' }
  })
  const [confirmOvercapacityOpen, setConfirmOvercapacityOpen] = useState(false)
  const [overcapacityWarnings, setOvercapacityWarnings] = useState([])
  const [daBaseline, setDaBaseline] = useState({ 
    devices: {}, 
    bids: {}, 
    hour_status: [], 
    locked_until_hour: 0,
    da_until_hour: 24,
    id_until_hour: 24,
    da_committed_start: -1,
    da_committed_end: -1,
    market_timeline: null,
    idm_forecast_change: null,
    current_position: { devices: {}, bids: {}, aggregate: [] },
    prev_dispatched: {}
  })

  const currentIdmForecastChange = useMemo(() => {
    const change = daBaseline?.idm_forecast_change
    if (!change || typeof change !== 'object') return null
    if (!change.active) return null
    if (Number(change.round_num || 0) !== Number(cfg.current_round || 0)) return null
    return change
  }, [cfg.current_round, daBaseline?.idm_forecast_change])

  // Round-matched IDM forecast change for the task card. Unlike currentIdmForecastChange
  // this is NOT gated on `active`, so the card also renders in rounds without a synthetic
  // shift (e.g. round 1, which never has one) to explicitly tell the player there is none.
  const idmForecastChangeRound = useMemo(() => {
    const change = daBaseline?.idm_forecast_change
    if (!change || typeof change !== 'object') return null
    if (Number(change.round_num || 0) !== Number(cfg.current_round || 0)) return null
    return change
  }, [cfg.current_round, daBaseline?.idm_forecast_change])

  const getIdmGuidance = useCallback((idmForecastChange) => {
    const totals = idmForecastChange?.round_totals || {}
    const deltaSupply = Number(totals.delta_supply_mwh || 0)
    const deltaDemand = Number(totals.delta_demand_mwh || 0)
    const fmtMwh = (value) => `${Math.round(Math.abs(Number(value || 0))).toLocaleString()} MWh`

    if (deltaDemand > 0.5 && deltaSupply <= 0.5) {
      return {
        title: 'IDM instruction',
        summary: `Power demand up ~${fmtMwh(deltaDemand)}.`,
        action: 'Forecast: increase above the DAM baseline.',
      }
    }
    if (deltaSupply > 0.5 && deltaDemand <= 0.5) {
      return {
        title: 'IDM instruction',
        summary: `Power demand down ~${fmtMwh(deltaSupply)}.`,
        action: 'Forecast: reduce below the DAM baseline.',
      }
    }
    if (deltaSupply > 0.5 && deltaDemand > 0.5) {
      return {
        title: 'IDM instruction',
        summary: `Demand +${fmtMwh(deltaDemand)}. Supply +${fmtMwh(deltaSupply)}.`,
        action: 'Forecast: increase to add supply; reduce to create demand.',
      }
    }
    return {
      title: 'IDM instruction',
      summary: 'No IDM shift in this round.',
      action: '',
    }
  }, [])

  const isDeviceMultiBidEnabled = useCallback((deviceDef, globalBidding = biddingEnabled) => {
    const normalizedBidCount = getNormalizedBidCount(deviceDef)
    if (deviceDef?.bid_count != null) {
      return normalizedBidCount > 0
    }
    if (normalizedBidCount > 0) return true
    // Legacy fallback for scenarios that still carry the old per-device flag.
    return Boolean(globalBidding && deviceDef?.enable_multi_bid === true)
  }, [biddingEnabled])

  const getDeviceBidLabelsForUi = useCallback((deviceDef, existingBids = null, globalBidding = biddingEnabled) => {
    const fallbackEnabled = deviceDef?.bid_count == null && Boolean(globalBidding && deviceDef?.enable_multi_bid === true)
    return getDeviceBidLabels(deviceDef, existingBids, fallbackEnabled)
  }, [biddingEnabled])
  
  // Persist activeLot to localStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      try {
        localStorage.setItem(`player_activeLot_${sessionId}`, activeLot)
      } catch (e) { console.error('Failed to save activeLot:', e) }
    }
  }, [activeLot, sessionId])

  useEffect(() => {
    const labels = Object.values(deviceBids || {}).flatMap((bids) => getDeviceBidLabels(null, bids))
    if (labels.length > 0 && !labels.includes(activeLot)) {
      setActiveLot(labels[0])
    }
  }, [activeLot, deviceBids])

  useEffect(() => {
    if (!biddingEnabled) {
      setDeviceBids({})
    }
  }, [biddingEnabled])
  
  // Build roundsSummary whenever cfg.markets or cfg.general.rounds changes
  useEffect(() => {
    try {
      const gen = cfg.general || {}
      const rounds = Number(gen.rounds || 1)
      const scenarioMarkets = scenario?.config?.markets || scenario?.markets || {}
      const markets = (cfg.markets && Object.keys(cfg.markets).length > 0)
        ? cfg.markets
        : scenarioMarkets
      const defaultMarketTradingStatus = Object.keys(markets).length > 0 ? 'market_code' : 'off'
      const dam = (markets.dam || {})
      const idm = (markets.idm || {})
      const toTrading = (m) => (Array.isArray(m) ? m : (Array.isArray(m?.trading) ? m.trading : []))
      const damTrading = toTrading(dam)
      const idmTrading = toTrading(idm)
      const summary = Array.from({length: rounds}, (_,i)=>({
        round: i+1,
        dam: { trading: damTrading[i] || defaultMarketTradingStatus },
        idm: { trading: idmTrading[i] || defaultMarketTradingStatus }
      }))
      setRoundsSummary(summary)
    } catch(err) {
      console.error('[Player] Failed to build roundsSummary:', err)
      setRoundsSummary([])
    }
  }, [cfg.markets, cfg.general.rounds, scenario, sessionConfigReady])
  
  useEffect(() => {
    forecastSeedKeyRef.current = null
    setDaBaseline({ devices: {}, bids: {}, hour_status: [], locked_until_hour: 0, da_until_hour: 24, id_until_hour: 24, idm_forecast_change: null, prev_dispatched: {} }) // Reset DA baseline when session changes
    setHourlySeries([])
    setDamHourlySeries([])
    setIdmHourlySeries([])
    
    // Restore scroll position after a brief delay (to allow content to render)
    const scrollTimer = setTimeout(() => {
      try {
        const savedScroll = sessionStorage.getItem(`player_scroll_${sessionId}`)
        if (savedScroll) {
          window.scrollTo(0, parseInt(savedScroll, 10))
        }
      } catch (e) { console.error('Failed to restore scroll:', e) }
    }, 100)
    
    return () => clearTimeout(scrollTimer)
  }, [sessionId])
  
  // Save scroll position periodically
  useEffect(() => {
    if (!sessionId) return
    
    const saveScroll = () => {
      try {
        sessionStorage.setItem(`player_scroll_${sessionId}`, window.scrollY.toString())
      } catch (e) { /* ignore */ }
    }
    
    // Save on scroll (debounced)
    let scrollTimer;
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(saveScroll, 200)
    }
    
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('beforeunload', saveScroll) // Save before page unload
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('beforeunload', saveScroll)
      clearTimeout(scrollTimer)
    }
  }, [sessionId])

  const sharedMarketContext = useMemo(() => ({
    mode,
    selectedType,
    allowedTypes,
  }), [mode, selectedType, allowedTypes])
  
  const aggregateMax = useMemo(() => {
    const dataMax = Array.isArray(hours) && hours.length > 0
      ? hours.reduce((max, val) => Math.max(max, Number(val) || 0), 0)
      : 0
    if (!Array.isArray(scenarioDevices) || scenarioDevices.length === 0) {
      return dataMax
    }
    const relevantDevices = (allowedTypes.length > 0 && typeDevices.length > 0)
      ? scenarioDevices.filter((dev) => typeDevices.includes(dev.id))
      : scenarioDevices
    const capacitySum = relevantDevices.reduce((sum, dev) => sum + (getDeviceEffectiveLimit(dev, cfg, sharedMarketContext).limit || 0), 0)
    return capacitySum > 0 ? capacitySum : dataMax
  }, [scenarioDevices, allowedTypes.length, typeDevices, hours, cfg, sharedMarketContext])

  const seedForecastData = useCallback(async ({ generalConfig, deviceIds = [], deviceDefs = [] } = {}) => {
    if (!sessionId) return
    const general = generalConfig || {}
    const fhRaw = Number(general.forecast_horizon_hours || general.horizon_hours || 24)
    const fhHours = Math.max(1, Number.isFinite(fhRaw) ? fhRaw : 24)
    const aggregateFallback = buildAggregateFallback(fhHours)

    let savedHours = null
    let savedDevices = null
    let savedBids = null
    try {
      const { data } = await api.get('/api/player/forecast/full', { params: { session_id: Number(sessionId) } })
      savedHours = Array.isArray(data?.hours) ? data.hours : null
      savedDevices = Array.isArray(data?.devices) ? data.devices : null
      savedBids = data?.bids || null
    } catch (error) {
      console.error('Failed to load full forecast:', error)
    }
    
    // Load saved bids if available
    if (savedBids && biddingEnabled) {
      const normalizedSavedBids = sanitizeBidsPayload(
        zeroHiddenBidsPayload(savedBids, { general, player_input: cfg.player_input }, general.round_span_hours)
      )
      setDeviceBids(normalizedSavedBids)
    }

    const normalizedDevices = {}
    const loadedAutoBid = {}
    if (Array.isArray(savedDevices)) {
      savedDevices.forEach((entry) => {
        const did = entry?.device_id
        if (!did) return
        const sourceHours = Array.isArray(entry?.hours) ? entry.hours : []
        normalizedDevices[did] = zeroHiddenSeries(
          Array.from({ length: fhHours }, (_, idx) => Number(sourceHours[idx] || 0)),
          { general, player_input: cfg.player_input },
          general.round_span_hours
        )
        if (entry?.auto_bid) {
          loadedAutoBid[did] = {
            enabled: Boolean(entry.auto_bid.enabled),
            buyThreshold: Number(entry.auto_bid.buy_threshold_zar_mwh ?? 400),
            sellThreshold: Number(entry.auto_bid.sell_threshold_zar_mwh ?? 800),
          }
        }
      })
    }
    setAutoBidSettings(loadedAutoBid)

    const hasDeviceNonZero = Object.values(normalizedDevices).some(
      (series) => Array.isArray(series) && series.some((value) => Number(value) !== 0)
    )

    let deviceData = normalizedDevices
    const deviceIdsSafe = Array.isArray(deviceIds) ? deviceIds : []

    if (!hasDeviceNonZero && deviceIdsSafe.length > 0) {
      const byId = new Map((deviceDefs || []).map((def) => [def.id, def]))
      const defaults = {}
      deviceIdsSafe.forEach((id) => {
        const def = byId.get(id)
        defaults[id] = zeroHiddenSeries(
          buildDeviceProfile(def, fhHours, sharedMarketContext),
          { general, player_input: cfg.player_input },
          general.round_span_hours
        )
      })
      deviceData = defaults
    }

    setDeviceHours(deviceData)

    const normalizedAggregate = Array.isArray(savedHours)
      ? zeroHiddenSeries(
          Array.from({ length: fhHours }, (_, idx) => Number(savedHours[idx] || 0)),
          { general, player_input: cfg.player_input },
          general.round_span_hours
        )
      : null

    const hasAggregate = normalizedAggregate ? normalizedAggregate.some((value) => Number(value) !== 0) : false

    if (hasAggregate && normalizedAggregate) {
      setHours(normalizedAggregate)
      return
    }

    if (deviceIdsSafe.length > 0 && Object.keys(deviceData).length > 0) {
      const aggregated = Array.from({ length: fhHours }, (_, hourIdx) => {
        const total = deviceIdsSafe.reduce((sum, id) => sum + (deviceData[id]?.[hourIdx] || 0), 0)
        return Number(total.toFixed(2))
      })
      setHours(aggregated)
    } else {
      setHours(aggregateFallback)
    }
  }, [sessionId, biddingEnabled, cfg.player_input, sharedMarketContext])

  // Auto-load active session
  useEffect(() => {
    const loadActiveSession = async () => {
      try {
        // Check if sessionId in query params
        const querySessionId = params.get('sessionId')
        if (querySessionId) {
          setSessionId(querySessionId)
          setLoading(false)
          return
        }

        // Otherwise, fetch active session
        const { data } = await api.get('/api/player/active-session')
        if (data.session_id) {
          setSessionId(data.session_id)
          setTimeRemaining(data.time_remaining ?? null)
        } else {
          showSnack('No active session found. Please start a session from Home.', 'info')
          navigate('/home')
        }
      } catch (error) {
        console.error('Failed to load active session:', error)
        showSnack('Failed to load session', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadActiveSession()
  }, [params, navigate, showSnack])

  // Load session config and saved forecast
  useEffect(() => {
    const load = async () => {
      if (!sessionId) return
      setSessionConfigReady(false)
      try {
  // Use briefing endpoint which works for both trainer and player roles
  const { data } = await api.get(`/api/sessions/${sessionId}/briefing`)
        const gen = data.general || {}
        const structure = data.structure || {}
        const round_span = Number(gen.round_span_hours || 6)
        const fh = Number(gen.forecast_horizon_hours || gen.horizon_hours || 24)
        const freeze = Number(gen.freeze_hours || 6)
        const daGateHour = Number.isFinite(Number(gen.day_ahead_gate_hour)) ? Number(gen.day_ahead_gate_hour) : 12
        
        console.log('[Player] Briefing data.general:', gen)
        console.log('[Player] Parsed values - fh:', fh, 'rounds:', gen.rounds, 'round_span:', round_span)
        
        // Get session status from /api/sessions/{id} (works for all roles)
        const sessionRes = await api.get(`/api/sessions/${sessionId}`)
        const sessionData = sessionRes.data
        
        console.log('[Player] Session loaded - status:', sessionData.status, 'round:', sessionData.current_round, 'mode:', sessionData.mode)
        console.log('[Player] Session data.market:', sessionData.market)
        console.log('[Player] Session data.markets:', sessionData.markets)
        console.log('[Player] Briefing data.market:', data.market)
        console.log('[Player] Briefing data.markets:', data.markets)
        
        const cfgObj = {
          general: {
            round_span_hours: round_span,
            forecast_horizon_hours: fh,
            freeze_hours: freeze,
            day_ahead_gate_hour: daGateHour,
            horizon_hours: Number(gen.horizon_hours || 24),
            fake_date: gen.fake_date || '',
            start_time: gen.start_time || '',
            rounds: Number(gen.rounds || structure.rounds || Math.ceil(fh / round_span))
          },
          market: sessionData.market || data.market || {},            // Market parameters
          markets: sessionData.markets || data.markets || {},         // Per-round availability
          player_input: sessionData.player_input || data.player_input || { mode: 'all_hours', editable_offsets: [], hide_non_editable_hours: false, allow_other_rounds_editing: true },
          current_round: Number(sessionData.current_round || 1),
          scenario_name: sessionData.scenario_name || data.name || 'Scenario',
          campaign_name: sessionData.campaign_name || data.campaign_name || ''
        }
        console.log('[Player] Setting cfg:', cfgObj)
        console.log('[Player] Campaign name:', cfgObj.campaign_name)
        setCfg(cfgObj)
        // Check if bidding is enabled
        const marketParams = sessionData.market || data.market || {}
        const scenarioDevicesRaw = data.devices || []
        const bidding = hasExplicitBiddingDevices(scenarioDevicesRaw)
        console.log('[Player] Market params:', marketParams)
        console.log('[Player] explicit bidding enabled:', bidding)
        console.log('[Player] Config set - forecast_horizon_hours:', cfgObj.general.forecast_horizon_hours, 'rounds:', cfgObj.general.rounds)
        setBiddingEnabled(bidding)
        setStatus(sessionData.status || 'pending')
        setMode(sessionData.mode || 'isolated_per_player')
        // Two-phase rounds: initialise the active market phase from the session record so
        // a reload/late-join lands in the correct phase (DAM or IDM) for task cards etc.
        setMarketPhase(sessionData.market_phase ?? null)
        
        // Set scenario data from briefing
        setScenario({
          ...data,
          scenario_id: sessionData.scenario_id,
          campaign_name: data.campaign_name,  // Explicitly set campaign name from briefing
          campaign_id: data.campaign_id,
          allowed_player_types: data.player_types || [],  // expose for DeviceDeepDiveTabs filtering
          config: {
            general: data.general,
            grid: data.grid || {},
            market: data.market || {},
            markets: data.markets || {},
            player_input: sessionData.player_input || data.player_input || {},
            devices: data.devices,
            player_types: data.player_types,
            challenges: data.challenges,
            events: data.events
          }
        })
        
        // Initialize duration, but do NOT reset remaining time on reload; wait for server ticks or restore from storage
        try{
          const initial = Number((gen.round_duration_seconds || 300))
          const safe = isFinite(initial) ? initial : 300
          setInitialDuration(safe)
          // If joining fresh (no stored timer) and session is running, show full duration until first tick arrives
          if ((sessionData.status || 'pending') === 'running'){
            try{
              const key = `emsg_timer_${sessionId}`
              const raw = sessionStorage.getItem(key)
              if (!raw) {
                setTimeRemaining(safe)
              }
            }catch(_){ }
          }
        }catch(_){ /* ignore */ }

        // Load briefing for types
        try{
          const brief = await api.get(`/api/sessions/${sessionId}/briefing`)
          const allowed = brief.data?.allowed_player_types || []
          const sel = brief.data?.selected_type || null
          const pts = brief.data?.player_types || []
          const devices = brief.data?.devices || []
          console.log('[Player] Briefing data - allowed:', allowed, 'selected:', sel, 'status:', data.status)
          setAllowedTypes(allowed)
          setSelectedType(sel)
          setPlayerTypes(pts)
          setScenarioDevices(devices)
          // load type devices from scenario config if selected
          let devs = []
          // React state updates from setAllowedTypes/setSelectedType above have not
          // applied yet, so the memoised sharedMarketContext still holds the previous
          // (empty) values. Build a fresh local context from the briefing payload so
          // slot scaling works on the very first initialisation pass.
          const localSharedMarketContext = {
            mode: sessionData.mode || 'isolated_per_player',
            selectedType: sel,
            allowedTypes: allowed,
          }
          if(sel){
            const t = (pts||[]).find(x=> x.id===sel)
            devs = t?.devices || []
            console.log('Selected type:', sel, 'Found type:', t, 'Devices:', devs)
            
            // Prepare all state updates before calling setters (so React batches them)
            const fh = Number(gen.forecast_horizon_hours||24)
            const globalBidding = hasExplicitBiddingDevices(data.devices || [])
            
            // Call all setters together without interruption
            setTypeDevices(devs)
            setDeviceHours(prev=>{
              const next = { ...prev }
              devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
              return next
            })
            setDeviceBids(prev => {
              const next = { ...prev }
              devs.forEach(did => {
                const deviceDef = devices.find(d => d.id === did)
                const deviceBidding = isDeviceMultiBidEnabled(deviceDef, globalBidding)
                
                if (deviceBidding && !next[did]) {
                  const baseProfile = buildDeviceProfile(deviceDef, fh, localSharedMarketContext)

                  next[did] = buildInitialBidsForDevice(deviceDef, fh, baseProfile)
                }
              })
              return next
            })
            console.log('[Player] Initialized type devices:', devs.length, 'with bidding for devices:', 
              devs.filter(did => {
                const deviceDef = devices.find(d => d.id === did)
                return isDeviceMultiBidEnabled(deviceDef, globalBidding)
              })
            )
          } else if (allowed.length === 0 && devices.length > 0) {
            // Solo mode (no player types defined): use ALL scenario devices
            devs = devices.map(d => d.id)
            
            const fh = Number(gen.forecast_horizon_hours||24)
            const globalBidding = hasExplicitBiddingDevices(data.devices || [])
            
            setTypeDevices(devs)
            setDeviceHours(prev=>{
              const next = { ...prev }
              devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
              return next
            })
            setDeviceBids(prev => {
              const next = { ...prev }
              devs.forEach(did => {
                const deviceDef = devices.find(d => d.id === did)
                const deviceBidding = isDeviceMultiBidEnabled(deviceDef, globalBidding)
                
                if (deviceBidding && !next[did]) {
                  const baseProfile = buildDeviceProfile(deviceDef, fh, localSharedMarketContext)

                  next[did] = buildInitialBidsForDevice(deviceDef, fh, baseProfile)
                }
              })
              return next
            })
          }
          // Redirect to briefing if no type selected
          if(allowed.length>0 && !sel){
            console.log('[Player] No type selected - redirecting to briefing')
            navigate(`/briefing/${sessionId}`)
            return
          } else if (sel) {
            console.log('[Player] Player already selected type:', sel)
          }

        }catch(_){ /* ignore */ }
        
        // Load DA baseline for all rounds (including Round 1)
        try {
          const baselineRes = await api.get(`/api/player/da-baseline/${sessionId}`)
          if (baselineRes.data) {
            setDaBaseline({
              devices: baselineRes.data.devices || {},
              bids: baselineRes.data.bids || {},
              hour_status: baselineRes.data.hour_status || [],
              locked_until_hour: baselineRes.data.locked_until_hour || 0,
              da_until_hour: baselineRes.data.da_until_hour || 24,
              id_until_hour: baselineRes.data.id_until_hour || 24,
              da_committed_start: baselineRes.data.da_committed_start ?? -1,
              da_committed_end: baselineRes.data.da_committed_end ?? -1,
              market_timeline: baselineRes.data.market_timeline || null,
              idm_forecast_change: baselineRes.data.idm_forecast_change || null,
              dam_phase_smp: baselineRes.data.dam_phase_smp ?? null,
              dam_phase_volume: baselineRes.data.dam_phase_volume ?? null,
              current_position: baselineRes.data.current_position || { devices: {}, bids: {}, aggregate: [] },
              prev_dispatched: baselineRes.data.prev_dispatched || {}
            })
            console.log('[Player] Loaded DA baseline with gate closure:', baselineRes.data)
            console.log('[Player] DA baseline hour_status length:', baselineRes.data.hour_status?.length, 'expected:', cfgObj.general.forecast_horizon_hours)
          }
        } catch (err) {
          console.error('Failed to load DA baseline:', err)
        }
        
        // Load historical round results including hourly_results
        try {
          const resultsRes = await api.get(`/api/player/results/${sessionId}`)
          if (resultsRes.data) {
            const { rounds, hourly_results, dam_hourly_results, idm_hourly_results } = resultsRes.data
            
            // Populate series with historical rounds
            if (Array.isArray(rounds) && rounds.length > 0) {
              setSeries(rounds.map(r => ({ r: r.round, smp: r.smp, volume: r.volume })))
            }
            
            // Populate hourlySeries with historical hourly data
            if (Array.isArray(hourly_results) && hourly_results.length > 0) {
              const mapped = hourly_results.map(hr => ({
                ...hr,
                hour_idx: Number(hr.hour_idx ?? hr.hour_offset ?? 0)
              }))
              setHourlySeries(mapped)
              console.log('[Player] Loaded hourly results:', hourly_results.length, 'hours')
              console.log('[Player] Sample hourly result:', hourly_results[0])
            } else {
              console.log('[Player] No hourly_results in API response or empty array')
            }

            if (Array.isArray(dam_hourly_results) && dam_hourly_results.length > 0) {
              const mappedDam = dam_hourly_results.map(hr => ({
                ...hr,
                hour_idx: Number(hr.hour_idx ?? hr.hour_offset ?? 0)
              }))
              setDamHourlySeries(mappedDam)
            }

            if (Array.isArray(idm_hourly_results) && idm_hourly_results.length > 0) {
              const mappedIdm = idm_hourly_results.map(hr => ({
                ...hr,
                hour_idx: Number(hr.hour_idx ?? hr.hour_offset ?? 0)
              }))
              setIdmHourlySeries(mappedIdm)
            }
          }
        } catch (err) {
          console.error('Failed to load historical results:', err)
        }

        // Pre-populate activeEvents from briefing events for the current round
        // (handles page reload / late join where WebSocket event_triggered was missed)
        try {
          const currentRound = Number(sessionData.current_round || 1)
          const briefingEvents = data.events || []
          const preloaded = briefingEvents
            .filter(evt => {
              const trig = (evt.trigger_type || 'round').toLowerCase()
              if (trig !== 'round') return false
              const start = Number(evt.trigger_value ?? 1)
              const dur = Math.max(1, Number(evt.duration_rounds ?? 1))
              return currentRound >= start && currentRound <= (start + dur - 1)
            })
            .map((evt, idx) => ({
              ...evt,
              id: evt.id || evt.key || evt.name || `evt-${idx}`,
              round: currentRound
            }))
          if (preloaded.length > 0) {
            setActiveEvents(preloaded)
            console.log('[Player] Pre-loaded', preloaded.length, 'active events for round', currentRound)
          }
        } catch (err) {
          console.error('[Player] Failed to pre-load events:', err)
        }

        setSessionConfigReady(true)
        
      } catch (error) {
        console.error('Failed to load session config:', error)
        showSnack('Failed to load session configuration', 'error')
        setSessionConfigReady(true)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, showSnack])

  // Live market_cleared events and WebSocket
  const [live, setLive] = useState(null)
  const [series, setSeries] = useState([])
  const smpRef = useRef(null)
  const volRef = useRef(null)
  const localTimerRef = useRef(null)
  const autoSubmitRef = useRef(false)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    const update = () => {
      if (!smpRef.current) return
      const parent = smpRef.current.parentElement
      const width = parent?.clientWidth || smpRef.current.clientWidth || 420
      setChartWidth(width)
    }
    update()
    const ro = new ResizeObserver(update)
    if (smpRef.current?.parentElement) {
      ro.observe(smpRef.current.parentElement)
    }
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    // Primary: static namespace + join room
    const s = io(`/game`, { path: '/socket.io', transports: ['websocket', 'polling'], forceNew: true })
    // Backward-compat: legacy per-session namespace
    const sLegacy = io(`/game/${sessionId}`, { path: '/socket.io', transports: ['websocket', 'polling'], forceNew: true })

    s.on('connect', () => {
      try { s.emit('join_session', { session_id: Number(sessionId) }) } catch(_) {}
    })

    s.on('round_start', async (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(null)
        try{ sessionStorage.removeItem(`emsg_timer_${sessionId}`) }catch(_){ }
        setSubmitted(false)
        autoSubmitRef.current = false
        // Clear stale events from the previous round
        setActiveEvents([])
        try{
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          const newRound = Number(data.current_round || 1)
          // Re-sync the two-phase market phase from the authoritative session record
          // (the round_start socket may carry p.phase, but the GET is the source of truth).
          setMarketPhase(data.market_phase ?? p?.phase ?? null)
          // A fresh round_start always begins with the DAM phase (or single-phase); clear
          // any stale DAM-phase feedback banner from the previous round.
          setDamPhaseFeedback(null)
          setCfg(prev=> ({ 
            ...prev, 
            current_round: newRound, 
            scenario_name: data.scenario_name||prev.scenario_name,
            campaign_name: data.campaign_name||prev.campaign_name,
            general: {
              ...prev.general,
              fake_date: data.general?.fake_date || prev.general.fake_date,
              start_time: data.general?.start_time || prev.general.start_time
            }
          }))
          setStatus(data.status||prev.status)
          
          // Load DA baseline for all rounds (including Round 1)
          try {
            const baselineRes = await api.get(`/api/player/da-baseline/${sessionId}`)
            if (baselineRes.data) {
              setDaBaseline({
                devices: baselineRes.data.devices || {},
                bids: baselineRes.data.bids || {},
                hour_status: baselineRes.data.hour_status || [],
                locked_until_hour: baselineRes.data.locked_until_hour || 0,
                da_until_hour: baselineRes.data.da_until_hour || 24,
                id_until_hour: baselineRes.data.id_until_hour || 24,
                market_timeline: baselineRes.data.market_timeline || null,
                idm_forecast_change: baselineRes.data.idm_forecast_change || null,
                dam_phase_smp: baselineRes.data.dam_phase_smp ?? null,
                dam_phase_volume: baselineRes.data.dam_phase_volume ?? null,
                prev_dispatched: baselineRes.data.prev_dispatched || {}
              })
              console.log('[Player] Loaded DA baseline on round_start:', baselineRes.data)
            }
          } catch (err) {
            console.error('Failed to load DA baseline on round_start:', err)
          }
          // Re-populate activeEvents for the new round (fallback if event_triggered is missed)
          try {
            const briefRes = await api.get(`/api/sessions/${sessionId}/briefing`)
            const allEvents = briefRes.data?.events || []
            const preloaded = allEvents
              .filter(evt => {
                const trig = (evt.trigger_type || 'round').toLowerCase()
                if (trig !== 'round') return false
                const start = Number(evt.trigger_value ?? 1)
                const dur = Math.max(1, Number(evt.duration_rounds ?? 1))
                return newRound >= start && newRound <= (start + dur - 1)
              })
              .map((evt, idx) => ({
                ...evt,
                id: evt.id || evt.key || evt.name || `evt-${idx}`,
                round: newRound
              }))
            if (preloaded.length > 0) {
              setActiveEvents(preloaded)
            }
          } catch (err) {
            console.error('[Player] Failed to pre-load events on round_start:', err)
          }
        }catch(_){ }
      }
    })

    s.on('tick', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        const rem = Number(p.remaining)
        setTimeRemaining(rem)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: false })) }catch(_){ }
      }
    })

    s.on('round_end', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(0)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0, paused: false })) }catch(_){ }
      }
    })

    // Two-phase rounds: the DAM phase has cleared and the IDM phase is now opening.
    // Capture the player's own DAM clearing feedback (SMP + award) to show at the top
    // of the screen, and switch the UI into the IDM phase.
    s.on('dam_phase_cleared', async (p) => {
      if (Number(p?.session_id) !== Number(sessionId)) return
      setMarketPhase('idm')
      // Reset the timer to null BEFORE resetting submitted/autoSubmitRef.
      // If the player already submitted IDM manually (or the DAM timer expired with
      // timeRemaining=0), resetting submitted without clearing timeRemaining would
      // cause the auto-submit effect to fire immediately with stale data, overwriting
      // the player's intentional IDM submission.
      setTimeRemaining(null)
      try { sessionStorage.removeItem(`emsg_timer_${sessionId}`) } catch (_) {}
      const kpis = p?.kpis || {}
      setDamPhaseFeedback({
        round: Number(p?.round || 0),
        smp: p?.smp ?? null,
        revenue_zar: kpis.revenue_zar ?? kpis.da_revenue_zar ?? null,
        dispatched_mwh: kpis.dispatched_mwh ?? kpis.da_dispatched_mwh ?? null,
        profit_zar: kpis.profit_zar ?? null,
      })
      setSubmitted(false)
      // Do NOT reset autoSubmitRef here. If the player already submitted DAM manually,
      // autoSubmitRef is true and must stay true until the IDM round_start resets it.
      // Resetting it here (while timeRemaining may still be 0 from the DAM timer)
      // would allow the auto-submit effect to fire a spurious IDM forecast.
      // The IDM round_start event resets autoSubmitRef when the IDM phase properly begins.
      // Reload the DA baseline so the IDM phase shows the intra-round DAM position.
      try {
        const baselineRes = await api.get(`/api/player/da-baseline/${sessionId}`)
        if (baselineRes.data) {
          setDaBaseline({
            devices: baselineRes.data.devices || {},
            bids: baselineRes.data.bids || {},
            hour_status: baselineRes.data.hour_status || [],
            locked_until_hour: baselineRes.data.locked_until_hour || 0,
            da_until_hour: baselineRes.data.da_until_hour || 24,
            id_until_hour: baselineRes.data.id_until_hour || 24,
            market_timeline: baselineRes.data.market_timeline || null,
            idm_forecast_change: baselineRes.data.idm_forecast_change || null,
            dam_phase_smp: baselineRes.data.dam_phase_smp ?? null,
            dam_phase_volume: baselineRes.data.dam_phase_volume ?? null,
            prev_dispatched: baselineRes.data.prev_dispatched || {}
          })
        }
      } catch (err) {
        console.error('Failed to reload DA baseline on dam_phase_cleared:', err)
      }
      // NOTE: activeEvents is NOT re-fetched here. round_start already pre-populated
      // both DAM- and IDM-phase events for this round, and nothing clears activeEvents
      // between the DAM and IDM phases (there is no round_start in between). Flipping
      // marketPhase to 'idm' (above) is therefore enough for visibleEvents to switch the
      // blue event card to the IDM-phase variant — no extra /briefing call per player,
      // which keeps the phase transition O(1) for ~100 concurrent players.
    })

    s.on('market_cleared', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        setLive({ smp: p.smp, volume: p.volume, round: p.round })
        setSeries((prev) => [...prev, { r: p.round, smp: p.smp, volume: p.volume }])
        if (Array.isArray(p.hourly_results) && p.hourly_results.length > 0) {
          setHourlySeries((prev) => {
            const map = new Map(prev.map((entry) => [entry.hour_idx ?? entry.hour_offset ?? 0, entry]))
            p.hourly_results.forEach((hr) => {
              if (!hr) return
              const idx = Number(hr.hour_idx)
              if (!Number.isFinite(idx)) return
              map.set(idx, { ...hr, hour_idx: idx })
            })
            return Array.from(map.values()).sort((a, b) => (a.hour_idx ?? 0) - (b.hour_idx ?? 0))
          })
        }
        if (Array.isArray(p.dam_hourly_results) && p.dam_hourly_results.length > 0) {
          setDamHourlySeries((prev) => {
            const map = new Map(prev.map((entry) => [entry.hour_idx ?? entry.hour_offset ?? 0, entry]))
            p.dam_hourly_results.forEach((hr) => {
              if (!hr) return
              const idx = Number(hr.hour_idx)
              if (!Number.isFinite(idx)) return
              map.set(idx, { ...hr, hour_idx: idx })
            })
            return Array.from(map.values()).sort((a, b) => (a.hour_idx ?? 0) - (b.hour_idx ?? 0))
          })
        }
        if (Array.isArray(p.idm_hourly_results) && p.idm_hourly_results.length > 0) {
          setIdmHourlySeries((prev) => {
            const map = new Map(prev.map((entry) => [entry.hour_idx ?? entry.hour_offset ?? 0, entry]))
            p.idm_hourly_results.forEach((hr) => {
              if (!hr) return
              const idx = Number(hr.hour_idx)
              if (!Number.isFinite(idx)) return
              map.set(idx, { ...hr, hour_idx: idx })
            })
            return Array.from(map.values()).sort((a, b) => (a.hour_idx ?? 0) - (b.hour_idx ?? 0))
          })
        }
      }
    })

    s.on('event_triggered', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        // Add new event to active events list
        const event = {
          id: p.id || p.event_id || `event-${Date.now()}`,
          type: p.type,
          name: p.name,
          description: p.description,
          multiplier: p.multiplier,
          additive: p.additive,
          duration_rounds: p.duration_rounds,
          target: p.target,
          target_id: p.target_id,
          market_phase: p.market_phase,
          round: p.round
        }
        setActiveEvents((prev) => {
          // Avoid duplicates
          if (prev.some(e => e.id === event.id)) return prev
          return [...prev, event]
        })
      }
    })

    s.on('trainer_message', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        showSnack(`Trainer: ${p.message}`, 'info')
      }
    })

    s.on('briefing', async (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        // Only set status to briefing if not already in briefing
        // This prevents showing the briefing screen twice
        setStatus(prev => prev === 'briefing' ? prev : 'briefing')
        try {
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          setCfg(prev => ({
            ...prev,
            scenario_name: data.scenario_name || prev.scenario_name,
            campaign_name: data.campaign_name || prev.campaign_name,
          }))
          // Load scenario data for briefing screen
          if (data.scenario_id) {
            const scenarioRes = await api.get(`/api/catalog/scenarios/${data.scenario_id}`)
            setScenario(scenarioRes.data)
          }
        } catch (_) {}
      }
    })

    s.on('round_closing', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setStatus('round_closing')
      }
    })

    s.on('calculating', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setStatus('calculating')
      }
    })

    s.on('round_results_ready', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setStatus('round_results')
        // The combined round result is in; clear the two-phase phase + DAM banner.
        setMarketPhase(null)
        setDamPhaseFeedback(null)
      }
    })

    s.on('scenario_complete', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setStatus('scenario_complete')
        showSnack('Scenario completed! 🎉', 'success')
        try { triggerConfetti() } catch (_) {}
      }
    })

    s.on('session_paused', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        if (localTimerRef.current) clearInterval(localTimerRef.current)
        setStatus('paused')
        setTimeRemaining((prev) => {
          const rem = Number.isFinite(Number(prev)) ? Number(prev) : prev
          try { sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: true })) } catch (_) {}
          return prev
        })
      }
    })

    s.on('session_resumed', async (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        if (localTimerRef.current) clearInterval(localTimerRef.current)
        try {
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          setCfg(prev => ({
            ...prev,
            current_round: Number(data.current_round || prev.current_round || 1),
            scenario_name: data.scenario_name || prev.scenario_name,
            campaign_name: data.campaign_name || prev.campaign_name,
          }))
          setStatus(data.status || 'running')
        } catch (_) {
          setStatus('running')
        }
        setTimeRemaining((prev) => {
          const rem = Number.isFinite(Number(prev)) ? Number(prev) : prev
          try { sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: false })) } catch (_) {}
          return prev
        })
      }
    })

    // Mirror the same handlers on legacy socket for safety
    sLegacy.on('round_start', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(null); try{ sessionStorage.removeItem(`emsg_timer_${sessionId}`) }catch(_){ } } })
    sLegacy.on('tick', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { const rem = Number(p.remaining); setTimeRemaining(rem); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: false })) }catch(_){ } } })
    sLegacy.on('round_end', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(0); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0, paused: false })) }catch(_){ } } })
    sLegacy.on('market_cleared', (p)=>{
      if (p && Number(p.session_id)===Number(sessionId)){
        setLive({ smp: p.smp, volume: p.volume, round: p.round })
        setSeries(prev=> [...prev, { r:p.round, smp:p.smp, volume:p.volume }])
      }
    })
    sLegacy.on('event_triggered', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)){
      const event = { id: p.id||p.event_id||`event-${Date.now()}`, type:p.type, name:p.name, description:p.description, multiplier:p.multiplier, additive:p.additive, duration_rounds:p.duration_rounds, target:p.target, target_id:p.target_id, market_phase:p.market_phase, round:p.round }
      setActiveEvents(prev=> prev.some(e=>e.id===event.id)? prev : [...prev, event])
    }})
    sLegacy.on('trainer_message', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)) showSnack(`Trainer: ${p.message}`, 'info') })
    sLegacy.on('session_paused', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { if (localTimerRef.current) clearInterval(localTimerRef.current); setStatus('paused'); setTimeRemaining((prev)=>{ const rem = Number.isFinite(Number(prev)) ? Number(prev) : prev; try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: true })) }catch(_){ } return prev }) } })
    sLegacy.on('session_resumed', async (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { if (localTimerRef.current) clearInterval(localTimerRef.current); try { const { data } = await api.get(`/api/sessions/${sessionId}`); setCfg(prev => ({ ...prev, current_round: Number(data.current_round || prev.current_round || 1), scenario_name: data.scenario_name || prev.scenario_name, campaign_name: data.campaign_name || prev.campaign_name, })); setStatus(data.status || 'running') } catch (_){ setStatus('running') } setTimeRemaining((prev)=>{ const rem = Number.isFinite(Number(prev)) ? Number(prev) : prev; try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem, paused: false })) }catch(_){ } return prev }) } })

    return () => { try{ s.close() }catch(_){} try{ sLegacy.close() }catch(_){} }
  }, [sessionId])

  // Local fallback countdown (in case server ticks are delayed)
  useEffect(()=>{
    if ((status === 'running' || status === 'round_active') && Number.isFinite(Number(timeRemaining)) && timeRemaining !== null) {
      if (localTimerRef.current) clearInterval(localTimerRef.current)
      localTimerRef.current = setInterval(()=>{
        setTimeRemaining(prev=>{
          if (!Number.isFinite(Number(prev))) return prev
          const next = Number(prev) - 1
          const clamped = next >= 0 ? next : 0
          try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: clamped })) }catch(_){ }
          return clamped
        })
      }, 1000)
      return ()=> { if (localTimerRef.current) clearInterval(localTimerRef.current) }
    } else {
      if (localTimerRef.current) clearInterval(localTimerRef.current)
    }
  }, [status, timeRemaining])

  // Calculate locked hours and validation state early so hooks depending on them can reference safely
  const lockedUntil = useMemo(() => {
    const r = Number(cfg.current_round || 1)
    const spanHours = Number(cfg.general.round_span_hours || 6)
    const freeze = Number(cfg.general.freeze_hours || 6)
    return Math.min(Number(cfg.general.forecast_horizon_hours || 24), (r - 1) * spanHours + freeze)
  }, [cfg])

  // Freeze override for round 1: allow editing even if freeze covers first round
  const effectiveLockedUntil = useMemo(
    () => (Number(cfg.current_round || 1) === 1 ? 0 : lockedUntil),
    [cfg, lockedUntil]
  )

  const isEditable = (status === 'running' || status === 'round_active') && sessionId
  const span = Number(cfg.general.round_span_hours || 6)
  const cur = Number(cfg.current_round || 1)
  const startIdx = (cur - 1) * span
  const endIdx = startIdx + span
  const horizonHours = Number(cfg.general.forecast_horizon_hours || cfg.general.horizon_hours || 48)
  const hideNonEditableHours = useMemo(() => shouldHideNonEditableHours(cfg, span), [cfg, span])
  const visibleHourIndices = useMemo(
    () => getVisibleHourIndices(cfg, horizonHours, span),
    [cfg, horizonHours, span]
  )

  const effectiveHourStatus = useMemo(() => {
    const general = cfg.general || {}
    const horizon = Math.max(1, Number(general.forecast_horizon_hours || general.horizon_hours || 48))
    const roundSpan = Math.max(1, Number(general.round_span_hours || 6))
    const currentRound = Math.max(1, Number(cfg.current_round || 1))
    const currentSimHour = (currentRound - 1) * roundSpan
    const marketsCfg = cfg.markets || {}
    const baseStatus = Array.isArray(daBaseline?.hour_status) ? daBaseline.hour_status : []

    return Array.from({ length: horizon }, (_, hourIdx) => {
      if (hourIdx < currentSimHour) return 'locked'

      const roundNum = Math.floor(hourIdx / roundSpan) + 1
      const idmStatus = getRoundMarketStatus(marketsCfg, 'idm', roundNum)
      const damStatus = getRoundMarketStatus(marketsCfg, 'dam', roundNum)
      let status = baseStatus[hourIdx] || 'forecast'

      if (idmStatus === 'off' && status === 'id') {
        status = damStatus === 'on' ? 'da' : 'forecast'
      }

      return status
    })
  }, [cfg.general, cfg.markets, cfg.current_round, daBaseline?.hour_status])
  
  // Determine editable hours based on hour_status
  // Hours with status "locked" are not editable
  // All other hours ("id", "da", "forecast") are editable
  const editableIdx = useMemo(() => {
    const hourStatus = Array.isArray(effectiveHourStatus) ? effectiveHourStatus : []
    const editable = new Set()
    
    for (let i = 0; i < hours.length; i++) {
      const status = hourStatus[i]
      // Only "locked" hours are not editable
      // "forecast" hours are always editable
      if (status !== 'locked' && isPlayerInputHourAllowed(cfg, i, span)) {
        editable.add(i)
      }
    }
    
    return editable
  }, [cfg, daBaseline.hour_status, hours.length, span])

  const toVisibleSeries = useCallback((series) => {
    if (!hideNonEditableHours) return Array.isArray(series) ? series : []
    return mapSeriesToVisibleHours(series, visibleHourIndices)
  }, [hideNonEditableHours, visibleHourIndices])

  const toVisibleStatuses = useCallback((series) => {
    if (!hideNonEditableHours) return Array.isArray(series) ? series : []
    return filterArrayByVisibleHours(series, visibleHourIndices)
  }, [hideNonEditableHours, visibleHourIndices])

  const chartHourIndices = useMemo(() => {
    if (hideNonEditableHours) return visibleHourIndices
    if (cfg?.player_input?.allow_other_rounds_editing === false) {
      const result = []
      for (let hourIdx = startIdx; hourIdx < Math.min(endIdx, horizonHours); hourIdx += 1) {
        result.push(hourIdx)
      }
      return result
    }
    return Array.from({ length: horizonHours }, (_, idx) => idx)
  }, [cfg?.player_input?.allow_other_rounds_editing, endIdx, hideNonEditableHours, horizonHours, startIdx, visibleHourIndices])

  const toChartSeries = useCallback((series) => {
    const source = Array.isArray(series) ? series : []
    return chartHourIndices.map((hourIdx) => Number(source[hourIdx] || 0))
  }, [chartHourIndices])

  const toChartStatuses = useCallback((series) => {
    const source = Array.isArray(series) ? series : []
    return chartHourIndices.map((hourIdx) => source[hourIdx]).filter((value) => value !== undefined)
  }, [chartHourIndices])

  const toActualHourIndex = useCallback((visibleIdx) => {
    if (!hideNonEditableHours) return visibleIdx
    return visibleHourIndices[visibleIdx] ?? visibleIdx
  }, [hideNonEditableHours, visibleHourIndices])

  const toChartActualHourIndex = useCallback((chartIdx) => {
    return chartHourIndices[chartIdx] ?? chartIdx
  }, [chartHourIndices])

  const toVisibleEditableIndices = useCallback((seriesLength) => {
    if (!hideNonEditableHours) {
      const result = []
      for (let hourIdx = 0; hourIdx < seriesLength; hourIdx += 1) {
        if (editableIdx.has(hourIdx)) result.push(hourIdx)
      }
      return result
    }
    const result = []
    visibleHourIndices.forEach((hourIdx, visibleIdx) => {
      if (visibleIdx < seriesLength && editableIdx.has(hourIdx)) {
        result.push(visibleIdx)
      }
    })
    return result
  }, [editableIdx, hideNonEditableHours, visibleHourIndices])

  const toChartEditableIndices = useCallback((sourceSeriesLength) => {
    const result = []
    chartHourIndices.forEach((hourIdx, chartIdx) => {
      if (hourIdx < sourceSeriesLength && editableIdx.has(hourIdx)) {
        result.push(chartIdx)
      }
    })
    return result
  }, [chartHourIndices, editableIdx])

  const smoothDragRadius = cfg?.player_input?.enable_smooth_drag === false ? 0 : 3

  const buildFieldGroups = useCallback((seriesLength) => {
    if (hideNonEditableHours) {
      const scopedHours = visibleHourIndices.filter((hourIdx) => hourIdx < seriesLength)
      return scopedHours.length > 0 ? [{
        label: 'Visible Hours',
        hours: scopedHours,
        color: isDark ? theme.palette.success.light : '#2e7d32',
        hint: 'Only the active hour slots for this scenario are shown. Hidden hours are submitted as 0.'
      }] : []
    }

    if (cfg?.player_input?.allow_other_rounds_editing === false) {
      const currentRoundHours = []
      const otherRoundHours = []
      for (let idx = 0; idx < seriesLength; idx += 1) {
        if (idx >= startIdx && idx < endIdx) {
          currentRoundHours.push(idx)
        } else {
          otherRoundHours.push(idx)
        }
      }

      return [
        {
          label: 'Current Round',
          hours: currentRoundHours,
          color: isDark ? theme.palette.info.light : '#2196f3',
          hint: 'Only the active round can be edited in this scenario.'
        },
        {
          label: 'Other Rounds (Locked)',
          hours: otherRoundHours,
          color: isDark ? theme.palette.text.disabled : '#757575',
          hint: 'These hours belong to other rounds and are read-only until their round becomes active.'
        }
      ].filter((group) => group.hours.length > 0)
    }

    const freeze = Number(cfg.general.freeze_hours || 6)
    const lockedEnd = freeze
    const todayEnd = 24
    const makeHours = (start, end) => {
      const result = []
      for (let idx = start; idx < Math.min(end, seriesLength); idx += 1) {
        result.push(idx)
      }
      return result
    }

    return [
      {
        label: 'Locked Hours',
        hours: makeHours(0, lockedEnd),
        color: isDark ? theme.palette.warning.light : '#ff9800',
        hint: 'These hours are locked after Round 1. Simulates the Intraday Market (IDM) gate closure - the point where even short-term Intraday trading closes before delivery.'
      },
      {
        label: 'Today (Editable)',
        hours: makeHours(lockedEnd, todayEnd),
        color: isDark ? theme.palette.info.light : '#2196f3',
        hint: 'Hours for today\'s simulation. Always editable. This represents the main trading window.'
      },
      {
        label: 'Tomorrow (Editable)',
        hours: makeHours(todayEnd, seriesLength),
        color: isDark ? theme.palette.secondary.light : '#9c27b0',
        hint: 'Forward planning for the next day. Always editable.'
      }
    ].filter((group) => group.hours.length > 0)
  }, [cfg, endIdx, hideNonEditableHours, isDark, startIdx, theme.palette, visibleHourIndices])

  const sumBidVolumeInRange = useCallback((bidsObject, rangeStart, rangeEnd) => {
    if (!bidsObject || typeof bidsObject !== 'object') return 0
    let total = 0
    Object.values(bidsObject).forEach((lots) => {
      if (!lots || typeof lots !== 'object') return
      Object.values(lots).forEach((lot) => {
        const lotHours = Array.isArray(lot?.hours) ? lot.hours : []
        for (let hourIdx = rangeStart; hourIdx < rangeEnd && hourIdx < lotHours.length; hourIdx += 1) {
          total += Number(lotHours[hourIdx] || 0)
        }
      })
    })
    return total
  }, [])

  const marketOfferabilityByHour = useMemo(() => {
    const horizon = Number(cfg.general.forecast_horizon_hours || cfg.general.horizon_hours || 48)
    const hourStatus = Array.isArray(effectiveHourStatus) ? effectiveHourStatus : []

    const damOpenHours = Array.from({ length: Math.max(1, horizon) }, () => false)
    const damSpecialHours = Array.from({ length: Math.max(1, horizon) }, () => false)
    const idmOpenHours = Array.from({ length: Math.max(1, horizon) }, () => false)

    for (let hourIdx = 0; hourIdx < Math.min(horizon, hourStatus.length); hourIdx += 1) {
      const status = hourStatus[hourIdx]
      if (status === 'da_r1') {
        damSpecialHours[hourIdx] = true
        damOpenHours[hourIdx] = true
      } else if (status === 'da') {
        damOpenHours[hourIdx] = true
      } else if (status === 'id') {
        idmOpenHours[hourIdx] = true
      }
    }

    return { damOpenHours, damSpecialHours, idmOpenHours }
  }, [cfg.general, effectiveHourStatus])

  const currentRoundIdmTradingStatus = useMemo(
    () => getRoundMarketStatus(cfg.markets, 'idm', cfg.current_round || 1),
    [cfg.markets, cfg.current_round]
  )

  const showDaBaselineOverlay = currentRoundIdmTradingStatus !== 'off'

  const marketMatrixCellSx = useCallback((rowKey, roundCol = {}) => {
    const baseSurface = theme.palette.background.paper
    const clearedColor = isDark ? alpha(theme.palette.text.primary, 0.35) : '#BDBDBD'
    const forecastBorder = theme.palette.divider
    const submittedOverlay = isDark
      ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 5px, rgba(255,255,255,0.06) 5px 10px)'
      : 'repeating-linear-gradient(135deg, rgba(224,224,224,0.85) 0 5px, rgba(245,245,245,0.55) 5px 10px)'
    const damBase = isDark ? theme.palette.warning.main : '#FDD835'
    const damStripe = isDark
      ? `repeating-linear-gradient(135deg, ${alpha(theme.palette.warning.dark, 0.45)} 0 6px, ${alpha(theme.palette.warning.light, 0.20)} 6px 12px)`
      : 'repeating-linear-gradient(135deg, rgba(245,127,23,0.32) 0 6px, rgba(253,216,53,0.16) 6px 12px)'
    const damSpecialBase = isDark ? theme.palette.info.main : '#00BCD4'
    const damSpecialStripe = isDark
      ? `repeating-linear-gradient(135deg, ${alpha(theme.palette.info.dark, 0.45)} 0 6px, ${alpha(theme.palette.info.light, 0.20)} 6px 12px)`
      : 'repeating-linear-gradient(135deg, rgba(0,131,143,0.35) 0 6px, rgba(0,188,212,0.16) 6px 12px)'
    const idmBase = isDark ? theme.palette.warning.dark : '#FB8C00'
    const idmStripe = isDark
      ? `repeating-linear-gradient(135deg, ${alpha(theme.palette.warning.dark, 0.5)} 0 6px, ${alpha(theme.palette.warning.light, 0.2)} 6px 12px)`
      : 'repeating-linear-gradient(135deg, rgba(230,81,0,0.35) 0 6px, rgba(251,140,0,0.15) 6px 12px)'

    if (roundCol?.isCleared) {
      return { backgroundColor: clearedColor }
    }

    // Two-phase rounds: the Day-Ahead gate of the current round closes once the round
    // enters the Intraday phase. Render the DAM cell grey (closed/cleared) instead of
    // the yellow "open" colour.
    if (rowKey === 'dam' && roundCol?.damPhaseCleared) {
      return { backgroundColor: clearedColor }
    }

    const marketPalette = {
      dam: {
        color: damBase,
        stripe: damStripe,
        openCountKey: 'damOpenCount',
        bidTotalKey: 'damTotal',
        specialColor: damSpecialBase,
        specialStripe: damSpecialStripe,
        specialCountKey: 'damSpecialCount'
      },
      idm: {
        color: idmBase,
        stripe: idmStripe,
        openCountKey: 'idmOpenCount',
        bidTotalKey: 'idmSubmittedTotal'
      }
    }

    if (rowKey === 'forecast' || rowKey === 'total') {
      return { backgroundColor: baseSurface }
    }

    const palette = marketPalette[rowKey]
    if (!palette) {
      return { backgroundColor: baseSurface }
    }

    const totalHours = Math.max(1, Number(roundCol?.hoursInRound || 1))
    const openCount = Number(roundCol?.[palette.openCountKey] || 0)
    const bidTotal = Number(roundCol?.[palette.bidTotalKey] || 0)
    const specialCount = rowKey === 'dam' ? Number(roundCol?.[palette.specialCountKey] || 0) : 0
    const hasSpecialNow = specialCount > 0

    const isFullyOpen = openCount >= totalHours
    const isPartiallyOpen = openCount > 0 && openCount < totalHours
    const isGateClosedNow = openCount === 0
    const isSubmittedWhenClosed = bidTotal > 0 && isGateClosedNow

    const style = { backgroundColor: baseSurface }
    const images = []

    const baseColor = hasSpecialNow && palette.specialColor ? palette.specialColor : palette.color
    const baseStripe = hasSpecialNow && palette.specialStripe ? palette.specialStripe : palette.stripe

    if (isFullyOpen) {
      style.backgroundColor = baseColor
    } else if (isPartiallyOpen) {
      style.backgroundColor = baseColor
      images.push(baseStripe)
    }

    if (isSubmittedWhenClosed) {
      images.push(submittedOverlay)
    }

    if (images.length > 0) {
      style.backgroundImage = images.join(', ')
    }

    return style
  }, [isDark, theme.palette])

  const damBidPresenceByHour = useMemo(() => {
    const horizon = Number(cfg.general.forecast_horizon_hours || 48)
    const result = Array.from({ length: Math.max(1, horizon) }, () => false)
    const bids = daBaseline?.bids || {}
    Object.values(bids).forEach((lots) => {
      if (!lots || typeof lots !== 'object') return
      Object.values(lots).forEach((lot) => {
        const lotHours = Array.isArray(lot?.hours) ? lot.hours : []
        for (let hourIdx = 0; hourIdx < Math.min(lotHours.length, result.length); hourIdx += 1) {
          if (Number(lotHours[hourIdx] || 0) !== 0) result[hourIdx] = true
        }
      })
    })
    return result
  }, [cfg.general.forecast_horizon_hours, daBaseline?.bids])

  const idmBidPresenceByHour = useMemo(() => {
    const horizon = Number(cfg.general.forecast_horizon_hours || 48)
    const result = Array.from({ length: Math.max(1, horizon) }, () => false)
    const hourStatus = effectiveHourStatus || []
    const currentPosBids = daBaseline?.current_position?.bids || {}
    Object.values(currentPosBids).forEach((lots) => {
      if (!lots || typeof lots !== 'object') return
      Object.values(lots).forEach((lot) => {
        const lotHours = Array.isArray(lot?.hours) ? lot.hours : []
        for (let hourIdx = 0; hourIdx < Math.min(lotHours.length, result.length); hourIdx += 1) {
          if (hourStatus[hourIdx] === 'id' && Number(lotHours[hourIdx] || 0) !== 0) result[hourIdx] = true
        }
      })
    })
    return result
  }, [cfg.general.forecast_horizon_hours, daBaseline?.current_position?.bids, effectiveHourStatus])

  const openMarketDialog = async (roundFromClick, deviceId = null) => {
    try {
      const gen = cfg.general || {}
      const rounds = Number(gen.rounds || 1)
      const roundSpan = Number(gen.round_span_hours || 6)
      const selectedRound = Number(roundFromClick || cfg.current_round || 1)
      const start = `${gen.fake_date || '2001-01-01'} ${gen.start_time || '00:00'}:00`
      const base = new Date(start.replace(' ', 'T'))
      const simHours = (Number(cfg.current_round || 1) - 1) * roundSpan
      const now = new Date(base.getTime() + simHours * 3600 * 1000)
      const fmt = (d) => `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      
      // IMPORTANT: cfg.markets (plural) = per-round availability; cfg.market (singular) = global parameters
      const scenarioMarkets = scenario?.config?.markets || scenario?.markets || {}
      const markets = (cfg.markets && Object.keys(cfg.markets).length > 0)
        ? cfg.markets
        : scenarioMarkets
      const defaultMarketTradingStatus = Object.keys(markets).length > 0 ? 'market_code' : 'off'
      const dam = (markets.dam || {})
      const idm = (markets.idm || {})
      const toTrading = (m) => (Array.isArray(m) ? m : (Array.isArray(m?.trading) ? m.trading : []))
      const damTrading = toTrading(dam)
      const idmTrading = toTrading(idm)
      const derivedRoundsSummary = Array.from({length: rounds}, (_,i)=>({
        round: i+1,
        dam: { 
          trading: damTrading[i] || defaultMarketTradingStatus,
          clearing: 'always'
        },
        idm: { 
          trading: idmTrading[i] || defaultMarketTradingStatus,
          clearing: 'always'
        }
      }))
      const effectiveRoundsSummary = Array.isArray(roundsSummary) && roundsSummary.length > 0
        ? roundsSummary
        : derivedRoundsSummary
      const selectedRoundSummary = effectiveRoundsSummary.find((roundItem) => roundItem.round === selectedRound)
      const selectedDamTradingStatus = normalizeMarketStatusValue(selectedRoundSummary?.dam?.trading)
      const selectedIdmTradingStatus = normalizeMarketStatusValue(selectedRoundSummary?.idm?.trading)
      const currentSimHour = (Number(cfg.current_round || 1) - 1) * roundSpan
      const idGateInterval = Math.max(1, Number(gen.id_gate_interval_hours || 4))
      const idGateBase = Number(gen.id_gate_base_hour || 0)
      const idFreezeHours = Number(gen.id_freeze_hours || 0)
      const nextIdGate = calculateNextIdGateHour(currentSimHour, idGateInterval, idGateBase)
      const idGateWindowStart = Math.max(currentSimHour + idFreezeHours, nextIdGate)
      const idGateWindowEnd = idGateWindowStart + idGateInterval

      const roundStart = (selectedRound - 1) * roundSpan
      const roundEnd = roundStart + roundSpan
      const roundStartAbsHour = roundStart
      const roundEndAbsHour = roundEnd
      const daBids = daBaseline?.bids || {}
      const idmBids = daBaseline?.current_position?.bids || {}
      const aggregateForecast = Array.isArray(hours) ? hours : []
      const scopedDevice = deviceId ? scenarioDevices.find((dev) => dev.id === deviceId) : null
      const scopedForecast = scopedDevice && Array.isArray(deviceHours?.[scopedDevice.id])
        ? deviceHours[scopedDevice.id]
        : aggregateForecast
      const scopedDaBids = scopedDevice ? { [scopedDevice.id]: daBids?.[scopedDevice.id] || {} } : daBids
      const scopedIdmBids = scopedDevice ? { [scopedDevice.id]: idmBids?.[scopedDevice.id] || {} } : idmBids

      const [startHourRaw, startMinuteRaw] = String(gen.start_time || '00:00').split(':')
      const startHourOfDay = Number(startHourRaw) || 0
      const startMinute = Number(startMinuteRaw) || 0
      const formatAbsHour = (absHour) => {
        const date = new Date(base.getTime() + absHour * 3600 * 1000)
        date.setMinutes(startMinute, 0, 0)
        return fmt(date)
      }
      const gateEvents = []

      const dayAheadGateHour = Number.isFinite(Number(gen.day_ahead_gate_hour)) ? Number(gen.day_ahead_gate_hour) : 12
      if (selectedDamTradingStatus === 'market_code') {
        for (let absHour = roundStartAbsHour; absHour <= roundEndAbsHour; absHour += 1) {
          const hourOfDay = ((startHourOfDay + absHour) % 24 + 24) % 24
          if (hourOfDay === dayAheadGateHour) {
            gateEvents.push({
              key: `da-${absHour}`,
              type: 'DAM gate',
              action: 'close',
              at: formatAbsHour(absHour),
              absHour
            })
          }
        }
      }

      if (selectedIdmTradingStatus === 'market_code') {
        let firstIdGate = idGateBase
        while (firstIdGate < roundStartAbsHour) firstIdGate += idGateInterval
        for (let absHour = firstIdGate; absHour <= roundEndAbsHour; absHour += idGateInterval) {
          gateEvents.push({
            key: `id-${absHour}`,
            type: 'IDM gate',
            action: 'close/open',
            at: formatAbsHour(absHour),
            absHour
          })
        }
      }

      gateEvents.sort((a, b) => Number(a.absHour || 0) - Number(b.absHour || 0))

      const currentTimelineStatus = Array.isArray(effectiveHourStatus) ? effectiveHourStatus : []
      const currentRoundNum = Number(cfg.current_round || 1)

      const roundColumns = effectiveRoundsSummary.map((roundItem) => {
        const startIdx = (roundItem.round - 1) * roundSpan
        const endIdx = startIdx + roundSpan
        const hoursInRound = Math.max(1, endIdx - startIdx)
        const statusSlice = currentTimelineStatus.slice(startIdx, endIdx)
        const damTradingStatus = normalizeMarketStatusValue(roundItem?.dam?.trading)
        const damOpenFromTimeline = statusSlice.filter((status) => status === 'da' || status === 'da_r1').length
        // Two-phase rounds: once the DAM phase has cleared and the round moved into the
        // Intraday phase, the Day-Ahead gate for that round is closed. marketPhase is only
        // set on two-phase rounds, so marketPhase === 'idm' on the current round means the
        // DAM is already cleared and must render as closed (grey), not open (yellow).
        const damPhaseCleared = marketPhase === 'idm' && roundItem.round === currentRoundNum
        const damOpenCount = damPhaseCleared
          ? 0
          : damTradingStatus === 'on'
          ? hoursInRound
          : damTradingStatus === 'off'
          ? 0
          : damOpenFromTimeline
        const damSpecialCount = statusSlice.filter((status) => status === 'da_r1').length
        const idmOpenFromTimeline = statusSlice.filter((status) => status === 'id').length
        const idmTradingStatus = normalizeMarketStatusValue(roundItem?.idm?.trading)
        const isIdmDisabled = idmTradingStatus === 'off'
        let idmOpenCount = idmTradingStatus === 'on' ? hoursInRound : (isIdmDisabled ? 0 : idmOpenFromTimeline)

        if (idmTradingStatus === 'market_code' && roundItem.round === selectedRound) {
          let gateBasedOpenCount = 0
          for (let hourIdx = startIdx; hourIdx < endIdx; hourIdx += 1) {
            if (hourIdx >= idGateWindowStart && hourIdx < idGateWindowEnd) {
              gateBasedOpenCount += 1
            }
          }
          idmOpenCount = gateBasedOpenCount
        }

        const isCleared = endIdx <= currentSimHour

        let forecastTotal = 0
        for (let hourIdx = startIdx; hourIdx < endIdx && hourIdx < scopedForecast.length; hourIdx += 1) {
          forecastTotal += Number(scopedForecast[hourIdx] || 0)
        }

        const damTotal = sumBidVolumeInRange(scopedDaBids, startIdx, endIdx)
        const idmSubmittedTotal = sumBidVolumeInRange(scopedIdmBids, startIdx, endIdx)
        const isDamFixedNow = damOpenCount === 0
        const useIdmDeltaMode = isDamFixedNow && idmOpenCount > 0 && !isIdmDisabled
        const idmDisplayTotal = useIdmDeltaMode ? (forecastTotal - damTotal) : idmSubmittedTotal

        return {
          round: roundItem.round,
          hoursInRound,
          isCleared,
          damPhaseCleared,
          damOpenCount,
          damSpecialCount,
          idmOpenCount,
          damTotal,
          idmTotal: idmDisplayTotal,
          idmSubmittedTotal,
          forecastTotal
        }
      })

      setMarketDialogData({
        now: fmt(now),
        round: selectedRound,
        roundStart,
        roundEnd,
        scopeLabel: scopedDevice ? (scopedDevice.name || scopedDevice.id) : 'All devices',
        idmForecastChange: selectedRound === currentRoundNumber ? currentIdmForecastChange : null,
        gateEvents,
        roundColumns,
        matrixRows: [
          { key: 'dam', label: 'DAM offered (MWh)', values: roundColumns.map((col) => col.damTotal) },
          { key: 'idm', label: 'IDM offered (MWh)', values: roundColumns.map((col) => col.idmTotal) },
          { key: 'forecast', label: 'Forecast total (MWh)', values: roundColumns.map((col) => col.forecastTotal) }
        ]
      })
      setRoundsSummary(effectiveRoundsSummary)
    } catch(err) { 
      console.error('[Market Overview] Error:', err)
      const fallbackRounds = Number(cfg?.general?.rounds || 1)
      setMarketDialogData({
        now: '-',
        round: Number(cfg?.current_round || 1),
        roundStart: 0,
        roundEnd: Number(cfg?.general?.round_span_hours || 6),
        scopeLabel: deviceId || 'All devices',
        idmForecastChange: Number(cfg?.current_round || 1) === currentRoundNumber ? currentIdmForecastChange : null,
        gateEvents: [],
        roundColumns: Array.from({ length: Math.max(1, fallbackRounds) }, (_, idx) => ({
          round: idx + 1,
          hoursInRound: Number(cfg?.general?.round_span_hours || 6),
          isCleared: false,
          damOpenCount: 0,
          damSpecialCount: 0,
          idmOpenCount: 0,
          damTotal: 0,
          idmTotal: 0,
          idmSubmittedTotal: 0,
          forecastTotal: 0
        })),
        matrixRows: [
          { key: 'dam', label: 'DAM offered (MWh)', values: Array.from({ length: Math.max(1, fallbackRounds) }, () => 0) },
          { key: 'idm', label: 'IDM offered (MWh)', values: Array.from({ length: Math.max(1, fallbackRounds) }, () => 0) },
          { key: 'forecast', label: 'Forecast total (MWh)', values: Array.from({ length: Math.max(1, fallbackRounds) }, () => 0) }
        ]
      })
    }
    setMarketDialogOpen(true)
  }

  const isValid = useMemo(() => {
    return Array.from(editableIdx).every((i) => Number.isFinite(Number(hours[i])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, effectiveLockedUntil, cfg])

  // Auto-submit current round when time runs out and player has not submitted
  useEffect(() => {
    if (!sessionId) return
    if (!(status === 'running' || status === 'round_active')) return
    if (timeRemaining !== 0) return
    if (submitted) return
    if (autoSubmitRef.current) return
    if (allowedTypes.length > 0 && !selectedType) return
    // In two-phase rounds the DAM timer expiring does NOT mean the full round is
    // over — the IDM phase is still coming.  Firing auto-submit here would create a
    // spurious DAM-phase forecast that could overwrite the player's intentional DAM
    // bid once the IDM phase opens and reloads the baseline data.
    // The IDM phase auto-submit will fire naturally once the IDM timer runs down.
    if (marketPhase === 'dam') return

    autoSubmitRef.current = true
    showSnack('Time is up. Auto-submitting your latest forecast.', 'info')
    // Skip overcapacity confirmation on automatic submit; flag as auto-submit so
    // the backend will not overwrite an existing manual submission for this phase.
    submitCurrent(true, true)
    setStatus((prev) => (prev === 'running' || prev === 'round_active') ? 'round_closing' : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, status, submitted, sessionId, allowedTypes.length, selectedType, marketPhase, showSnack])

  // Restore remaining time from storage on reload to avoid reset
  useEffect(()=>{
    if (!sessionId) return
    try{
      const raw = sessionStorage.getItem(`emsg_timer_${sessionId}`)
      if (raw){
        const { t, rem, paused } = JSON.parse(raw)
        if (typeof rem === 'number' && paused === true) {
          setTimeRemaining(rem)
        } else if (typeof rem === 'number' && typeof t === 'number'){
          const dt = Math.max(0, (Date.now() - t) / 1000)
          const est = Math.max(0, Math.round(rem - dt))
          setTimeRemaining(est)
        }
      }
    }catch(_){ }
  }, [sessionId])

  // Sessions can get stuck on calculating without socket updates; poll backend as a fallback
  useEffect(() => {
    if (!sessionId) return
    if (!(status === 'round_closing' || status === 'calculating' || status === 'round_active' || status === 'running')) return

    let cancelled = false

    const pollStatus = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}`, { _silent: true })
        if (cancelled) return

        const nextStatus = data?.status
        if (nextStatus && nextStatus !== status) {
          console.log(`[Player] Status poll: ${status} -> ${nextStatus}`)
          setStatus(nextStatus)
        }

        const nextRound = Number(data?.current_round)
        if (Number.isFinite(nextRound)) {
          setCfg((prev) => {
            if (nextRound === prev.current_round) return prev
            console.log(`[Player] Round poll: ${prev.current_round} -> ${nextRound}`)
            return { ...prev, current_round: nextRound }
          })
        }

        // Two-phase rounds: keep the active market phase in sync if the dam_phase_cleared
        // socket was missed (the session record is the source of truth).
        if ('market_phase' in (data || {})) {
          setMarketPhase((prev) => (prev === data.market_phase ? prev : (data.market_phase ?? null)))
        }
      } catch (err) {
        console.error('Session status poll failed:', err)
      }
    }

    console.log(`[Player] Starting status polling for session ${sessionId} in status ${status}`)
    pollStatus()
    const interval = setInterval(pollStatus, 5000)
    return () => {
      console.log(`[Player] Stopping status polling`)
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId, status])

  // Ensure per-device hours arrays are initialized to horizon length
  useEffect(()=>{
    if (!selectedType || !Array.isArray(typeDevices) || typeDevices.length===0) return
    const fh = Number(cfg.general.forecast_horizon_hours||24)
    if (!Number.isFinite(fh) || fh <= 0) return
    const scenarioById = new Map((scenarioDevices || []).map((dev) => [dev.id, dev]))
    setDeviceHours(prev => {
      let changed = false
      const next = { ...prev }
      typeDevices.forEach(did => {
        const current = prev[did]
        const hasFullLength = Array.isArray(current) && current.length === fh
        if (hasFullLength) return
        const def = scenarioById.get(did)
        const fallback = buildDeviceProfile(def, fh, sharedMarketContext)
        if (Array.isArray(current) && current.length > 0) {
          next[did] = Array.from({ length: fh }, (_, i) => Number(current[i] || 0))
        } else {
          next[did] = fallback
        }
        changed = true
      })
      if (changed) {
        const agg = Array.from({ length: fh }, (_, hourIdx) => {
          const total = typeDevices.reduce((sum, did) => sum + (next[did]?.[hourIdx] || 0), 0)
          return Number(total.toFixed(2))
        })
        setHours(agg)
      }
      return changed ? next : prev
    })
    
    // Initialize bids if bidding is enabled
    if (biddingEnabled) {
      console.log('[Player] Initializing bids for devices:', typeDevices)
      setDeviceBids(prev => {
        const next = { ...prev }
        let needsInit = false
        typeDevices.forEach(did => {
          if (!next[did]) {
            needsInit = true
            const def = scenarioById.get(did)
            const deviceHoursFallback = buildDeviceProfile(def, fh, sharedMarketContext)

            next[did] = buildInitialBidsForDevice(def, fh, deviceHoursFallback)
          }
        })
        return needsInit ? next : prev
      })
    }
  }, [selectedType, typeDevices, cfg.general.forecast_horizon_hours, scenarioDevices, biddingEnabled, sharedMarketContext])

  useEffect(() => {
    if (!sessionId) return
    const generalCfg = cfg?.general || {}
    const fh = Number(generalCfg.forecast_horizon_hours || generalCfg.horizon_hours || 24)
    if (!Number.isFinite(fh) || fh <= 0) return
    if (!Array.isArray(scenarioDevices) || scenarioDevices.length === 0) return

    const usingPlayerTypes = allowedTypes.length > 0
    const deviceIds = usingPlayerTypes
      ? typeDevices
      : scenarioDevices.map((dev) => dev.id)

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return

    const deviceDefs = usingPlayerTypes
      ? scenarioDevices.filter((dev) => deviceIds.includes(dev.id))
      : scenarioDevices

    if (deviceDefs.length === 0) return

    const key = `${sessionId}-${selectedType || 'solo'}-${deviceIds.join('|')}-${fh}`
    if (forecastSeedKeyRef.current === key) return
    forecastSeedKeyRef.current = key

    seedForecastData({ generalConfig: generalCfg, deviceIds, deviceDefs })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cfg.general, allowedTypes.length, selectedType, typeDevices, scenarioDevices])

  const selectedHourlySeries = useMemo(() => {
    if (marketInsightsTab === 'dam') {
      return Array.isArray(damHourlySeries) && damHourlySeries.length > 0 ? damHourlySeries : hourlySeries
    }
    return Array.isArray(idmHourlySeries) && idmHourlySeries.length > 0 ? idmHourlySeries : hourlySeries
  }, [marketInsightsTab, hourlySeries, damHourlySeries, idmHourlySeries])

  const hourlyChartData = useMemo(() => {
    console.log('[Player] hourlyChartData useMemo - selectedHourlySeries:', selectedHourlySeries?.length || 0, 'entries')
    if (!Array.isArray(selectedHourlySeries) || selectedHourlySeries.length === 0) {
      console.log('[Player] selectedHourlySeries is empty or not an array')
      return []
    }
    const HOUR_MS = 3600000
    let startHour = 0
    let startMinute = 0
    if (typeof cfg.general.start_time === 'string') {
      const parts = cfg.general.start_time.split(':').map((n) => Number(n))
      if (Number.isFinite(parts[0])) startHour = parts[0]
      if (Number.isFinite(parts[1])) startMinute = parts[1]
    }
    let baseTime = null
    if (cfg.general.fake_date) {
      const base = new Date(cfg.general.fake_date)
      if (!Number.isNaN(base.getTime())) {
        base.setHours(startHour, startMinute, 0, 0)
        baseTime = base.getTime()
      }
    }

    return [...selectedHourlySeries]
      .map((entry) => {
        const idx = Number(entry.hour_idx ?? entry.hour_offset ?? 0)
        const safeIdx = Number.isFinite(idx) ? idx : 0
        const marketPrice = marketInsightsTab === 'idm'
          ? Number(entry.idp ?? entry.smp ?? 0)
          : Number(entry.smp ?? 0)
        const marketVolume = marketInsightsTab === 'idm'
          ? Number(entry.id_volume_mwh ?? entry.volume ?? 0)
          : Number(entry.volume ?? 0)
        if (baseTime != null) {
          const timestamp = baseTime + safeIdx * HOUR_MS
          const label = new Date(timestamp).toLocaleString('en-ZA', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
          return { ...entry, hour_idx: safeIdx, timestamp, label, marketPrice, marketVolume }
        }
        return { ...entry, hour_idx: safeIdx, timestamp: safeIdx, label: `h${safeIdx + 1}`, marketPrice, marketVolume }
      })
      .sort((a, b) => a.hour_idx - b.hour_idx)
  }, [selectedHourlySeries, cfg.general.fake_date, cfg.general.start_time, marketInsightsTab])

  const marketScopedHourlyData = useMemo(() => {
    if (!Array.isArray(hourlyChartData) || hourlyChartData.length === 0) return []
    const roundSpanHours = Number(cfg.general.round_span_hours || 6)
    const roundStartHour = Math.max(0, (Number(cfg.current_round || 1) - 1) * roundSpanHours)
    const roundEndHour = roundStartHour + roundSpanHours
    const filtered = hourlyChartData.filter((entry) => {
      const hourIdx = Number(entry?.hour_idx)
      return Number.isFinite(hourIdx) && hourIdx >= roundStartHour && hourIdx < roundEndHour
    })
    return filtered.length > 0 ? filtered : hourlyChartData
  }, [hourlyChartData, marketInsightsTab, cfg.current_round, cfg.general.round_span_hours])

  // D3 Charts
  useEffect(() => {
    console.log('[Player] D3 Charts useEffect - marketScopedHourlyData length:', marketScopedHourlyData.length)
    if (marketScopedHourlyData.length === 0) {
      console.log('[Player] No hourly chart data - skipping D3 render')
      return
    }
    const gridColor = theme.palette.divider
    const axisColor = theme.palette.text.secondary
    const smpSeriesColor = theme.palette.success.main
    const volumeSeriesColor = theme.palette.info.main
    // create or reuse a floating tooltip div for charts
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip
      .style('position','absolute')
      .style('pointer-events','none')
  
      .style('padding','4px 8px')
      .style('border-radius','4px')
      .style('font-size','12px')
      .style('display','none')
      .style('z-index','9999')
      .style('background', theme.palette.background.paper)
      .style('color', theme.palette.text.primary)
      .style('border', `1px solid ${theme.palette.divider}`)

    // Draw SMP chart
    if (smpRef.current) {
      const svg = d3.select(smpRef.current)
      svg.selectAll('*').remove()
      const M = { top: 10, right: 14, bottom: 30, left: 50 }
      const width = Math.min(Math.max(chartWidth || 240, 200), 240)
      const W = width - M.left - M.right
      const H = 100 - M.top - M.bottom
      const g = svg
        .attr('width', width)
        .attr('height', 100)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const hasRealTime = marketScopedHourlyData.some((d) => d.timestamp > 1000000)
      const xDomain = hasRealTime
        ? d3.extent(marketScopedHourlyData, (d) => d.timestamp)
        : d3.extent(marketScopedHourlyData, (d) => d.hour_idx)
      const x = hasRealTime
        ? d3.scaleTime().domain(xDomain).range([0, W])
        : d3.scaleLinear().domain(xDomain).range([0, W])
      const y = d3
        .scaleLinear()
        .domain([
          d3.min(marketScopedHourlyData, (d) => d.marketPrice) ?? 0,
          d3.max(marketScopedHourlyData, (d) => d.marketPrice) ?? 1
        ])
        .nice()
        .range([H, 0])
      const xValue = (d) => (hasRealTime ? x(d.timestamp) : x(d.hour_idx))
      const line = d3
        .line()
        .x((d) => xValue(d))
        .y((d) => y(d.marketPrice))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', gridColor)
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(marketScopedHourlyData).attr('fill', 'none').attr('stroke', smpSeriesColor).attr('stroke-width', 2).attr('d', line)
      const startHour = cfg.general.start_time ? parseInt(cfg.general.start_time.split(':')[0]) : 0
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${H})`)
        .call(
          d3.axisBottom(x).ticks(5).tickFormat((d) => {
            if (hasRealTime) {
              return new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
            } else {
              const hour = (startHour + Math.round(d)) % 24
              return `${String(hour).padStart(2, '0')}:00`
            }
          })
        )
      const yAxis = g.append('g').call(d3.axisLeft(y).ticks(4))
      xAxis.selectAll('path,line').attr('stroke', gridColor)
      yAxis.selectAll('path,line').attr('stroke', gridColor)
      xAxis.selectAll('text').attr('fill', axisColor)
      yAxis.selectAll('text').attr('fill', axisColor)
      // points + tooltips
      g.selectAll('circle.point')
        .data(marketScopedHourlyData)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', (d)=> xValue(d))
        .attr('cy', d=> y(d.marketPrice))
        .attr('r', 3)
        .attr('fill', smpSeriesColor)
        .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`${d.label}: ${d.marketPrice} ZAR/MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+25).attr('text-anchor','middle').attr('fill',axisColor).attr('font-size','10px').text('Simulation Time')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill',axisColor).attr('font-size','10px').text(`${marketInsightsTab === 'idm' ? 'IDP' : 'SMP'} (ZAR/MWh)`)
    }

    // Draw Volume chart
    if (volRef.current) {
      const svg = d3.select(volRef.current)
      svg.selectAll('*').remove()
      const M = { top: 10, right: 14, bottom: 30, left: 50 }
      const width = Math.min(Math.max(chartWidth || 240, 200), 240)
      const W = width - M.left - M.right
      const H = 100 - M.top - M.bottom
      const g = svg
        .attr('width', width)
        .attr('height', 100)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const hasRealTime = marketScopedHourlyData.some((d) => d.timestamp > 1000000)
      const xDomain = hasRealTime
        ? d3.extent(marketScopedHourlyData, (d) => d.timestamp)
        : d3.extent(marketScopedHourlyData, (d) => d.hour_idx)
      const x = hasRealTime
        ? d3.scaleTime().domain(xDomain).range([0, W])
        : d3.scaleLinear().domain(xDomain).range([0, W])
      const y = d3
        .scaleLinear()
        .domain([0, (d3.max(marketScopedHourlyData, (d) => d.marketVolume) ?? 1)])
        .nice()
        .range([H, 0])
      const xValue = (d) => (hasRealTime ? x(d.timestamp) : x(d.hour_idx))
      const line = d3
        .line()
        .x((d) => xValue(d))
        .y((d) => y(d.marketVolume))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', gridColor)
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(marketScopedHourlyData).attr('fill', 'none').attr('stroke', volumeSeriesColor).attr('stroke-width', 2).attr('d', line)
      const startHour = cfg.general.start_time ? parseInt(cfg.general.start_time.split(':')[0]) : 0
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${H})`)
        .call(
          d3.axisBottom(x).ticks(5).tickFormat((d) => {
            if (hasRealTime) {
              return new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
            } else {
              const hour = (startHour + Math.round(d)) % 24
              return `${String(hour).padStart(2, '0')}:00`
            }
          })
        )
      const yAxis = g.append('g').call(d3.axisLeft(y).ticks(4))
      xAxis.selectAll('path,line').attr('stroke', gridColor)
      yAxis.selectAll('path,line').attr('stroke', gridColor)
      xAxis.selectAll('text').attr('fill', axisColor)
      yAxis.selectAll('text').attr('fill', axisColor)
      // points + tooltips
      g.selectAll('circle.point')
        .data(marketScopedHourlyData)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', (d)=> xValue(d))
        .attr('cy', d=> y(d.marketVolume))
        .attr('r', 3)
        .attr('fill', volumeSeriesColor)
        .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`${d.label}: ${d.marketVolume} MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+25).attr('text-anchor','middle').attr('fill',axisColor).attr('font-size','10px').text('Simulation Time')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill',axisColor).attr('font-size','10px').text('Volume (MWh)')
    }
    return ()=> { try { tooltip.remove() } catch(_){} }
  }, [marketScopedHourlyData, chartWidth, cfg.general.start_time, marketInsightsTab, theme.palette.mode])

  const onChange = (i, val) => setHours((prev) => prev.map((v, idx) => (idx === i ? Number(val) : v)))
  const onDeviceChange = (did, i, val) => {
    setDeviceHours(prev=>{
      const arr = (prev[did] || []).slice()
      arr[i] = Number(val)
      const next = { ...prev, [did]: arr }
      // update aggregate hours as sum across type devices
      const ids = typeDevices || []
      const fh = Number(cfg.general.forecast_horizon_hours||24)
      const agg = Array.from({length: fh}, (_,h)=> ids.reduce((sum, id)=> sum + (next[id]?.[h] || 0), 0))
      setHours(agg)
      
      // If bidding is enabled, sync bid quantities (split aggregate into tranches)
      if (biddingEnabled && deviceBids[did]) {
        setDeviceBids(prevBids => {
          const newTotal = arr[i]
          const bidsForDevice = prevBids[did]
          if (!bidsForDevice) return prevBids
          const labels = getDeviceBidLabelsForUi(scenarioDevices.find(d => d.id === did), bidsForDevice)
          
          const currentTotal = labels.reduce((sum, label) => sum + (bidsForDevice[label]?.hours?.[i] || 0), 0)
          const nextBids = { ...prevBids, [did]: { ...bidsForDevice } }
          if (currentTotal > 0) {
            labels.forEach((label) => {
              const currentValue = bidsForDevice[label]?.hours?.[i] || 0
              const ratio = currentValue / currentTotal
              const nextHours = [...(bidsForDevice[label]?.hours || [])]
              nextHours[i] = Math.round(newTotal * ratio * 100) / 100
              nextBids[did][label] = { ...bidsForDevice[label], hours: nextHours }
            })
          } else {
            const ratios = getConfiguredBidSplitRatios(scenarioDevices.find(d => d.id === did), labels)
            labels.forEach((label, index) => {
              const nextHours = [...(bidsForDevice[label]?.hours || [])]
              nextHours[i] = Math.round(newTotal * (ratios[index] || 0) * 100) / 100
              nextBids[did][label] = { ...bidsForDevice[label], hours: nextHours }
            })
          }
          return nextBids
        })
      }
      
      return next
    })
  }
  
  const onBidPriceChange = (did, label, newPrice) => {
    setDeviceBids(prev => {
      const bids = prev[did]
      if (!bids || !bids[label]) return prev
      return {
        ...prev,
        [did]: {
          ...bids,
          [label]: {
            ...bids[label],
            price: Number(newPrice) || 0
          }
        }
      }
    })
  }
  
  const onBidQuantityChange = (did, label, hourIdx, newQty) => {
    setDeviceBids(prev => {
      const bids = prev[did]
      if (!bids || !bids[label]) return prev
      
      const hours = [...(bids[label].hours || [])]
      hours[hourIdx] = Number(newQty) || 0
      
      const updated = {
        ...prev,
        [did]: {
          ...bids,
          [label]: {
            ...bids[label],
            hours
          }
        }
      }
      
      // Update aggregate deviceHours
      const totalAtHour = getDeviceBidLabelsForUi(scenarioDevices.find(d => d.id === did), updated[did])
        .reduce((sum, currentLabel) => sum + (updated[did][currentLabel]?.hours?.[hourIdx] || 0), 0)
      setDeviceHours(prevHours => {
        const arr = [...(prevHours[did] || [])]
        arr[hourIdx] = totalAtHour
        const next = { ...prevHours, [did]: arr }
        
        // Update aggregate hours
        const ids = typeDevices || []
        const fh = Number(cfg.general.forecast_horizon_hours||24)
        const agg = Array.from({length: fh}, (_,h)=> ids.reduce((sum, id)=> sum + (next[id]?.[h] || 0), 0))
        setHours(agg)
        
        return next
      })
      
      return updated
    })
  }

  const submitCurrent = async (skipCapacityWarnings = false, isAutoSubmit = false) => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const start = (r - 1) * span
    const slice = zeroHiddenSeries(
      hours
        .slice(start, start + span)
        .map((value) => {
          const num = Number(value)
          return Number.isFinite(num) ? num : 0
        }),
      cfg,
      span,
      r
    )
    
    // Check for overcapacity bids
    const warnings = []
    if (biddingEnabled && typeDevices.length > 0) {
      typeDevices.forEach(deviceId => {
        const device = scenarioDevices.find(d => d.id === deviceId)
        if (!device) return
        const maxPower = getDeviceEffectiveLimit(device, cfg, sharedMarketContext).limit || getDeviceMaxCapability(device)
        const deviceHoursData = deviceHours[deviceId] || []

        if (!Number.isFinite(maxPower) || maxPower <= 0) {
          return
        }
        
        for (let i = start; i < start + span && i < deviceHoursData.length; i++) {
          const offered = deviceHoursData[i] || 0
          if (offered > maxPower) {
            warnings.push({
              device: device.type || device.id,
              hour: i - start + 1,
              offered: offered.toFixed(1),
              maxPower: maxPower.toFixed(1)
            })
          }
        }
      })
    }
    
    // Show confirmation dialog if overcapacity detected
    if (warnings.length > 0 && !skipCapacityWarnings) {
      setOvercapacityWarnings(warnings)
      setConfirmOvercapacityOpen(true)
      return
    }
    
    // Proceed with submission
    await doSubmit(slice, r, isAutoSubmit)
  }
  
  const doSubmit = async (slice, r, isAutoSubmit = false) => {
    try {
      setIsSubmitting(true)
      const payload = { session_id: Number(sessionId), round_num: r, hours: slice }
      // Flag client-side timer auto-submits so the backend treats them as a
      // create-only-if-absent safety net and never lets them overwrite a
      // forecast the player already submitted for this round/phase.
      if (isAutoSubmit) payload.auto_submit = true
      if(allowedTypes.length>0 && selectedType && typeDevices.length>0){
        const span = Number(cfg.general.round_span_hours || 6)
        const start = (r - 1) * span
        payload.devices = zeroHiddenDevicePayload(
          typeDevices.map(did => {
            const rawHours = (deviceHours[did] || []).slice(start, start + span)
            const ab = autoBidSettings[did]
            const entry = { device_id: did, hours: rawHours }
            if (ab?.enabled) {
              entry.auto_bid = { enabled: true, buy_threshold_zar_mwh: Number(ab.buyThreshold), sell_threshold_zar_mwh: Number(ab.sellThreshold) }
              entry.hours = entry.hours.map(() => 0)
            }
            return entry
          }),
          cfg,
          span,
          r
        )
      }
      // Add bids if bidding is enabled (send full bid hours, not sliced)
      if (biddingEnabled && Object.keys(deviceBids).length > 0) {
        const sanitizedBids = sanitizeBidsPayload(zeroHiddenBidsPayload(deviceBids, cfg, span))
        if (Object.keys(sanitizedBids).length > 0) {
          payload.bids = sanitizedBids
        }
      }
      await api.post('/api/player/forecast', payload)
      showSnack(`Round ${r} submitted successfully!`, 'success')
      setSubmitted(true)
      // Mark as submitted so the auto-submit effect cannot fire even if `submitted`
      // state is reset during a two-phase DAM→IDM transition (dam_phase_cleared resets
      // submitted to false for the IDM phase, but autoSubmitRef must stay true until
      // the IDM round_start explicitly resets it for the new phase).
      autoSubmitRef.current = true
      if (timeRemaining === 0) {
        setStatus((prev) => (prev === 'running' || prev === 'round_active') ? 'round_closing' : prev)
      }
      setConfirmOvercapacityOpen(false)
      setIsSubmitting(false)
    } catch (e) {
      setIsSubmitting(false)
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Submit failed'
      const details = e?.response?.data?.details
      let detailText = ''

      if (Array.isArray(details)) {
        detailText = details[0]
      } else if (details && typeof details === 'object') {
        if (details.message) {
          detailText = details.message
        } else if (details.locked_hours_modified) {
          detailText = `Locked hours modified: ${details.locked_hours_modified.join(', ')}`
        } else {
          detailText = JSON.stringify(details)
        }
      } else if (details) {
        detailText = String(details)
      }

      showSnack(detailText ? `${msg}: ${detailText}` : msg, 'error')
    }
  }

  const isEventActive = (event, round) => {
    const start = Number(
      event.trigger_value ?? event.start_round ?? event.round ?? event.round_num ?? event.trigger_round ?? 1
    )
    const duration = Number(event.duration_rounds ?? event.duration ?? 1)
    if (!Number.isFinite(start)) return true
    const safeDuration = Number.isFinite(duration) ? Math.max(1, duration) : 1
    const end = start + safeDuration - 1
    return round >= start && round <= end
  }

  // Auto-fill helper: Detect if device is consumer (load) or producer
  const isConsumerDevice = (device) => {
    if (!device) return false
    const category = (device.category || '').toLowerCase()
    const deviceType = (device.type || '').toLowerCase()
    return category === 'load' ||  deviceType.includes('load')
  }

  // Auto-fill Prices: Apply formulas based on producer/consumer role
  const fillPrices = () => {
    const round = Number(cfg.current_round || 1)
    const horizonHours = Number(cfg.general?.forecast_horizon_hours || 24)
    const newBids = { ...deviceBids }
    
    typeDevices.forEach(deviceId => {
      const device = scenarioDevices.find(d => d.id === deviceId)
      if (!device) return
      const labels = getDeviceBidLabelsForUi(device, newBids[deviceId])
      if (labels.length === 0) return
      
      const isConsumer = isConsumerDevice(device)
      const priceSeries = isConsumer
        ? [1500, 1300, 1100, 1000, 900]
        : [600, 800, 1000, 1150, 1300]
      
      if (!newBids[deviceId]) {
        newBids[deviceId] = buildInitialBidsForDevice(device, horizonHours, Array.from({ length: horizonHours }, () => 0))
      }

      labels.forEach((label, index) => {
        if (!newBids[deviceId][label]) {
          newBids[deviceId][label] = { price: 0, hours: Array.from({ length: horizonHours }, () => 0) }
        }
        newBids[deviceId][label].price = (priceSeries[index] ?? priceSeries[priceSeries.length - 1]) + (isConsumer ? -10 * round : 10 * round)
      })
    })
    
    setDeviceBids(newBids)
    showSnack('Prices filled automatically', 'success')
  }

  // Auto-fill Capacity: Formula = round + 10*hour + 200*day
  // Lot A gets 100%, Lots B&C get 10% each
  const fillCapacity = () => {
    const round = Number(cfg.current_round || 1)
    const horizonHours = Number(cfg.general?.forecast_horizon_hours || 24)
    const newBids = { ...deviceBids }
    const newDeviceHours = { ...deviceHours }
    
    typeDevices.forEach(deviceId => {
      const device = scenarioDevices.find(d => d.id === deviceId)
      if (!device) return
      const labels = getDeviceBidLabelsForUi(device, newBids[deviceId])
      if (labels.length === 0) return
      
      if (!newBids[deviceId]) {
        newBids[deviceId] = buildInitialBidsForDevice(device, horizonHours, Array.from({ length: horizonHours }, () => 0))
      }
      const ratios = getConfiguredBidSplitRatios(device, labels)
      const lotHours = Object.fromEntries(labels.map((label) => [label, []]))
      
      for (let hour = 0; hour < horizonHours; hour++) {
        const day = Math.floor(hour / 24)
        const baseAmount = round + 10 * hour + 200 * day

        labels.forEach((label, index) => {
          lotHours[label].push(baseAmount * (ratios[index] || 0))
        })
      }

      labels.forEach((label) => {
        newBids[deviceId][label].hours = lotHours[label]
      })

      newDeviceHours[deviceId] = Array.from({ length: horizonHours }, (_, hourIdx) => (
        labels.reduce((sum, label) => sum + (lotHours[label][hourIdx] || 0), 0)
      ))
    })
    
    // Update aggregate hours
    const fh = horizonHours
    const agg = Array.from({length: fh}, (_,h)=> typeDevices.reduce((sum, id)=> sum + (newDeviceHours[id]?.[h] || 0), 0))
    
    setDeviceBids(newBids)
    setDeviceHours(newDeviceHours)
    setHours(agg)
    showSnack('Capacity filled automatically', 'success')
  }

  // Visible events (exclude task events as they are shown in taskItems).
  // Device-targeted hints (e.g. PV/wind availability "weather" notices) must only
  // reach players who actually own that device — a coal/consumer player should not
  // see the PV/wind availability hints. Non-device events keep their prior scope.
  // Phase filter: same rule as taskEvents — hide events authored for the other
  // phase (e.g. the IDM capacity reduction must not appear during the DAM phase).
  const visibleEvents = activeEvents
    .filter(e => e.type !== 'task')
    .filter(e => isEventActive(e, Number(cfg.current_round || 1)))
    .filter((e) => {
      // Phase filter (mirrors taskEvents filter and backend select_events_for_round)
      if (!marketPhase) return true
      const evtPhase = String(e.market_phase || e.phase || '').toLowerCase()
      if (evtPhase !== 'dam' && evtPhase !== 'idm') return true
      return evtPhase === marketPhase
    })
    .filter((e) => {
      const target = String(e?.target || 'all').toLowerCase()
      const targetId = String(e?.target_id || '').toLowerCase()
      if (target !== 'device' || !targetId) return true
      const ownedIds = (selectedType && Array.isArray(typeDevices) && typeDevices.length > 0)
        ? typeDevices
        : (Array.isArray(scenarioDevices) ? scenarioDevices.map(d => d.id) : [])
      return ownedIds.some((did) => {
        if (String(did).toLowerCase() === targetId) return true
        const dev = (scenarioDevices || []).find(d => d.id === did)
        return String(dev?.type || '').toLowerCase() === targetId
      })
    })
  const playerRole = useMemo(() => {
    if (!selectedType || !Array.isArray(playerTypes) || playerTypes.length === 0) return null
    const type = playerTypes.find(pt => pt.id === selectedType)
    const devIds = type?.devices || []
    if (!Array.isArray(devIds) || devIds.length === 0) return null
    const devs = (scenarioDevices || []).filter(d => devIds.includes(d.id))
    let hasLoad = false
    let hasGen = false
    devs.forEach(d => {
      const t = (d.type || '').toLowerCase()
      if (t.includes('load') || t.endsWith('_load')) hasLoad = true
      else if (t) hasGen = true
    })
    if (hasLoad && !hasGen) return 'consumer'
    if (hasGen && !hasLoad) return 'producer'
    return null
  }, [playerTypes, scenarioDevices, selectedType])
  const isConsumerPlayer = playerRole === 'consumer'
  const visibleChallenges = useMemo(() => {
    const challenges = scenario?.challenges || []
    if (!playerRole) return challenges
    return challenges.filter(ch => {
      const app = ch?.applicable_to
      if (!app) return true
      if (typeof app === 'string') return app === 'all' || app === playerRole
      if (Array.isArray(app)) return app.includes('all') || app.includes(playerRole)
      return true
    })
  }, [playerRole, scenario?.challenges])
  const criticalEventTypes = new Set(['plant_outage', 'grid_congestion', 'fuel_spike'])
  const eventTitles = {
    fuel_spike: 'Fuel Price Spike',
    renewable_drought: 'Renewable Generation Drop',
    plant_outage: 'Plant Outage',
    demand_surge: 'Demand Surge',
    grid_congestion: 'Grid Congestion',
    carbon_tax: 'Carbon Tax Increase',
    battery_degradation: 'Battery Degradation'
  }
  const getEventTitle = (event) => eventTitles[event.type] || event.name || 'Event Active'
  const formatEventDescription = (event) => {
    const parts = []
    if (event.multiplier && event.multiplier !== 1.0) {
      const pct = ((event.multiplier - 1.0) * 100).toFixed(0)
      parts.push(`${pct > 0 ? '+' : ''}${pct}% impact`)
    }
    if (event.additive && event.additive !== 0) {
      parts.push(`${event.additive > 0 ? '+' : ''}${event.additive} adjustment`)
    }
    if (event.duration_rounds) {
      parts.push(`Duration: ${event.duration_rounds} round${event.duration_rounds > 1 ? 's' : ''}`)
    }
    if (event.target) {
      parts.push(`Target: ${event.target}`)
    }
    return parts.join(' • ')
  }
  const availableDevices = useMemo(() => {
    if (selectedType && typeDevices.length > 0) {
      return typeDevices.map(did => scenarioDevices.find(d => d.id === did)).filter(Boolean)
    }
    return Array.isArray(scenarioDevices) ? scenarioDevices : []
  }, [selectedType, typeDevices, scenarioDevices])
  const deviceNames = useMemo(
    () => availableDevices.map(d => d.name || `Device ${d.id}`),
    [availableDevices]
  )
  const formatDeviceList = (names) => {
    if (!names || names.length === 0) return 'your devices'
    if (names.length <= 2) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
  }
  const deviceText = useMemo(() => formatDeviceList(deviceNames), [deviceNames])
  const openMarkets = useMemo(() => {
    const hourStatus = daBaseline.hour_status || []
    const idOpen = hourStatus.includes('id')
    const daOpen = hourStatus.some(s => s === 'da' || s === 'da_r1')
    return { idOpen, daOpen }
  }, [daBaseline.hour_status])
  const currentRoundNumber = Number(cfg.current_round || 1)
  const dayAheadGateHour = Number(cfg.general?.day_ahead_gate_hour ?? 10)
  const daSpecialRuleNote = useMemo(() => {
    if (!openMarkets.daOpen || currentRoundNumber !== 1) return ''
    return `Special game rule: In Round 1, Day-Ahead bidding is open. Normally, these bids should have been submitted on the previous day.`
  }, [openMarkets.daOpen, currentRoundNumber, dayAheadGateHour])
  const campaignDisplayName = useMemo(() => {
    const raw = String(cfg.campaign_name || '').trim()
    if (!raw) return cfg.scenario_name || 'Campaign'
    const normalized = raw.toLowerCase()
    if (normalized === 'standalone' || normalized === 'stanbdalone') {
      return cfg.scenario_name || 'Campaign'
    }
    return raw
  }, [cfg.campaign_name, cfg.scenario_name])
  const summaryLines = useMemo(() => {
    const lines = []
    const showDa = marketPhase ? (marketPhase === 'dam') : openMarkets.daOpen
    const showId = marketPhase ? (marketPhase === 'idm') : openMarkets.idOpen
    if (showDa) {
      lines.push(`Day-Ahead market open - submit bids for ${deviceText}`)
    }
    if (showId) {
      lines.push(`Intraday market open - review bids for ${deviceText}`)
    }
    if (lines.length === 0) {
      lines.push('No markets open right now. Monitor results and prepare bids.')
    }
    return lines
  }, [openMarkets, marketPhase, deviceText])
  const taskItems = useMemo(() => {
    const items = []
    // Two-phase rounds: gate task cards by the active market phase so the player only
    // sees the card for the phase that is currently trading (DAM phase -> Day-Ahead card,
    // IDM phase -> Intraday card). For single-phase rounds (marketPhase === null) fall back
    // to the legacy open-market detection from the hour_status timeline.
    const showDaCard = marketPhase ? (marketPhase === 'dam') : openMarkets.daOpen
    const showIdCard = marketPhase ? (marketPhase === 'idm') : openMarkets.idOpen
    if (showDaCard) {
      items.push({
        id: 'market-da',
        title: 'Day-Ahead market open',
        descriptionPrefix: 'Submit bids for',
        deviceText,
        descriptionSuffix: '.',
        specialNote: daSpecialRuleNote,
        priority: 'high',
        status: 'Open'
      })
    }
    if (showIdCard) {
      items.push({
        id: 'market-id',
        title: 'Intraday market open',
        descriptionPrefix: 'Review and adjust bids for',
        deviceText,
        descriptionSuffix: '.',
        priority: 'high',
        status: 'Open'
      })
    }
    if (showIdCard && idmForecastChangeRound) {
      const guidance = getIdmGuidance(idmForecastChangeRound)
      const totals = idmForecastChangeRound.round_totals || {}
      const prod = Math.round(Number(totals.production_delta_mwh || 0))
      const cons = Math.round(Number(totals.consumption_delta_mwh || 0))
      const hasShift = Math.abs(prod) > 0 || Math.abs(cons) > 0
      const signed = (v) => `${v >= 0 ? '+' : ''}${v.toLocaleString()} MWh`
      const changeLine = hasShift
        ? `Producers ${signed(prod)} · consumers ${signed(cons)}.`
        : 'No producer/consumer shift this round.'
      const recommendation = guidance.action || 'Keep your Day-Ahead position.'
      items.push({
        id: 'market-idm-forecast-change',
        title: 'Forecast update',
        description: `${changeLine} ${recommendation}`,
        priority: 'medium',
        status: 'Info'
      })
    }
    // Add task events to task list (filter by player type if target is set)
    const taskEvents = activeEvents
      .filter(e => e.type === 'task')
      .filter(e => isEventActive(e, Number(cfg.current_round || 1)))
      .filter(e => {
        if (!e.target || e.target === 'all') return true
        if (e.target === 'player') return !e.target_id || e.target_id === selectedType
        return true
      })
      .filter(e => {
        // Two-phase rounds: only show task events that belong to the active phase.
        // Events carry a market_phase ('dam' | 'idm'); when a phase is active hide the
        // events authored for the other phase (e.g. the IDM task must not appear during
        // the DAM phase). Events without a market_phase, or single-phase rounds
        // (marketPhase === null), are always shown.
        if (!marketPhase) return true
        const evtPhase = String(e.market_phase || e.phase || '').toLowerCase()
        if (evtPhase !== 'dam' && evtPhase !== 'idm') return true
        return evtPhase === marketPhase
      })
    taskEvents.forEach(event => {
      items.push({
        id: `task-${event.id || event.name}`,
        title: event.name || 'Task',
        description: event.description || '',
        priority: 'medium',
        status: 'Active'
      })
    })
    if (items.length === 0) {
      items.push({
        id: 'no-tasks',
        title: 'No urgent tasks',
        description: 'Markets are closed. Use this time to review devices and results.',
        priority: 'low',
        status: 'Info'
      })
    }
    return items
  }, [openMarkets, marketPhase, activeEvents, cfg.current_round, currentIdmForecastChange, idmForecastChangeRound, deviceText, daSpecialRuleNote, getIdmGuidance, selectedType])

  const playerAssistantContext = useMemo(() => ({
    page: 'player_round',
    session: {
      id: sessionId,
      status,
      mode,
      current_round: currentRoundNumber,
      time_remaining_seconds: timeRemaining,
      submitted,
    },
    scenario: {
      description: scenario?.description || '',
      campaign_name: campaignDisplayName,
      scenario_name: cfg.scenario_name || 'Scenario',
      general: cfg.general || {},
      market: cfg.market || {},
      events: (cfg.events || scenario?.config?.events || []).map(e => ({
        id: e.id || e.name,
        name: e.name || e.type,
        type: e.type,
        trigger: e.trigger,
        multiplier: e.multiplier ?? null,
        description: e.description || '',
      })),
      challenges: cfg.challenges || scenario?.config?.challenges || [],
      scoring: cfg.scoring || scenario?.config?.scoring || {},
      balancing: cfg.balancing || scenario?.config?.balancing || {},
      grid: cfg.grid || scenario?.config?.grid || {},
      player_types: playerTypes.map(pt => ({
        id: pt.id,
        name: pt.name,
        description: pt.description || '',
        devices: pt.devices || [],
      })),
      devices: scenarioDevices.map(d => ({
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
    markets: {
      day_ahead_open: openMarkets.daOpen,
      intraday_open: openMarkets.idOpen,
      bidding_enabled: biddingEnabled,
      summary_lines: summaryLines,
      day_ahead_special_rule_note: daSpecialRuleNote || '',
    },
    player_context: {
      selected_type_id: selectedType || null,
      selected_type_name: playerTypes.find((pt) => pt.id === selectedType)?.name || selectedType || null,
      role: playerRole,
      devices: availableDevices.map((device) => ({
        id: device.id,
        name: device.name || device.id,
        type: device.type || '',
        capacity_mw: Number(device.capacity_mw ?? device.capacity ?? 0),
        cost_per_mwh_zar: device.cost_per_mwh_zar ?? device.marginal_cost ?? null,
        variable_cost_tiers: device.variable_cost_tiers ?? null,
        bid_count: device.bid_count ?? null,
        enable_multi_bid: device.enable_multi_bid ?? null,
        baseline_load_mw: device.baseline_load_mw ?? null,
        peak_load_mw: device.peak_load_mw ?? null,
      })),
    },
    tasks: taskItems.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status || '',
      priority: task.priority || '',
      description: task.description || [task.descriptionPrefix, task.deviceText, task.descriptionSuffix].filter(Boolean).join(' '),
      special_note: task.specialNote || '',
    })),
    active_events: activeEvents
      .filter((event) => isEventActive(event, currentRoundNumber))
      .map((event) => ({
        id: event.id || event.name || event.type,
        name: getEventTitle(event),
        type: event.type || '',
        description: event.description || '',
      })),
    visible_challenges: (visibleChallenges || []).map((challenge) => ({
      name: challenge.name || 'Challenge',
      metric: challenge.metric || '',
      operator: challenge.operator || '',
      target: challenge.target ?? null,
      required: Boolean(challenge.required),
    })),
  }), [
    sessionId,
    status,
    mode,
    currentRoundNumber,
    timeRemaining,
    submitted,
    scenario,
    campaignDisplayName,
    cfg,
    dayAheadGateHour,
    openMarkets.daOpen,
    openMarkets.idOpen,
    biddingEnabled,
    summaryLines,
    daSpecialRuleNote,
    selectedType,
    playerTypes,
    scenarioDevices,
    playerRole,
    availableDevices,
    taskItems,
    activeEvents,
    visibleChallenges,
  ])

  const priorityColor = (priority) => {
    if (priority === 'high') return 'error'
    if (priority === 'medium') return 'warning'
    return 'info'
  }
  const effectiveDeviceMetrics = useMemo(() => {
    const byId = {}
    ;(scenarioDevices || []).forEach((device) => {
      byId[device.id] = getEffectiveDeviceMetric(device, cfg, sharedMarketContext, activeEvents, marketPhase)
    })
    return byId
  }, [scenarioDevices, cfg, sharedMarketContext, activeEvents, marketPhase])

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  if (!sessionId) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="info">
          No active session. Please start a session from <Button onClick={() => navigate('/home')}>Home</Button>
        </Alert>
      </Container>
    )
  }

  if (status === 'paused') {
    return (
      <Container maxWidth="md" sx={{ mt: 6, mb: 6 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>Session Paused</Typography>
          <Typography variant="body2" color="text.secondary">
            The trainer has paused the game. Please wait until the session resumes.
          </Typography>
        </Paper>
      </Container>
    )
  }

  const showSubmitWaitingOnly =
    mode === 'shared_market' &&
    submitted &&
    (status === 'running' || status === 'round_active')

  return (
    <Container maxWidth={false} sx={{ mt: 1.5, mb: 4, maxWidth: 1800, mx: 'auto' }}>
      {mode === 'shared_market' && (
        <Box sx={{ position: 'fixed', bottom: 12, right: 12, zIndex: 1300 }}>
          <Chip label="Session Active" color="success" size="small" variant="filled" />
        </Box>
      )}
      {/* Debug: Show current status */}
      {console.log('[Player] Rendering with status:', status, 'round:', cfg.current_round)}
      
      {/* Briefing Screen */}
      {status === 'briefing' && scenario && (
        <BriefingScreen 
          session={{ id: sessionId, mode }}
          scenario={scenario}
          selectedType={selectedType}
          playerTypes={playerTypes}
          scenarioDevices={scenarioDevices}
          viewMode="start"
          onStart={async () => {
            try {
              const { data } = await api.get(`/api/sessions/${sessionId}`)
              setStatus(data.status || 'running')
            } catch (_) {}
          }}
        />
      )}

      {/* Waiting Screen - during round_closing or calculating */}
      {(status === 'round_closing' || status === 'calculating') && (
        <WaitingScreen 
          sessionId={sessionId}
          round={cfg.current_round}
          mode={mode}
        />
      )}

      {/* Waiting Screen - after submit while backend prepares round results */}
      {showSubmitWaitingOnly && (
        <WaitingScreen
          sessionId={sessionId}
          round={cfg.current_round}
          mode={mode}
        />
      )}

      {/* Round Results Screen */}
      {status === 'round_results' && (
        <>
        {console.log('[Player] Showing RoundResultsScreen for round', cfg.current_round)}
        <RoundResultsScreen 
          sessionId={sessionId}
          round={cfg.current_round}
          mode={mode}
          scenario={scenario}
          campaignName={cfg.campaign_name}
          onAdvance={mode !== 'shared_market' ? async () => {
            try {
              await api.post(`/api/sessions/${sessionId}/advance-round`)
              const { data } = await api.get(`/api/sessions/${sessionId}`)
              setStatus(data.status || 'running')
              setCfg(prev => ({
                ...prev,
                current_round: data.current_round || prev.current_round,
                scenario_name: data.scenario_name || prev.scenario_name,
                campaign_name: data.campaign_name || prev.campaign_name,
              }))
            } catch (err) {
              console.error('Failed to advance round:', err)
            }
          } : undefined}
        />
        </>
      )}

      {/* Scenario Complete Screen */}
      {status === 'scenario_complete' && (
        <ScenarioResultsScreen 
          sessionId={sessionId}
          scenario={scenario}
          onHome={() => navigate('/home')}
        />
      )}

      {/* Main Game Interface - only show when in active round */}
      {(status === 'running' || status === 'round_active') && !showSubmitWaitingOnly && (
      <>
      {console.log('[Player] Showing Main Game Interface')}
      <Dialog open={typeDialogOpen} disableEscapeKeyDown>
        <DialogTitle>Select your player type</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2, minWidth: 400 }}>
            {allowedTypes.map(t=> {
              const typeInfo = playerTypes.find(pt=> pt.id === t.type_id)
              const typeName = typeInfo?.name || t.type_id
              const typeDesc = typeInfo?.description || ''
              const isDisabled = t.remaining === 0
              
              return (
                <Stack key={t.type_id} spacing={0.5}>
                  <Chip
                    label={typeName}
                    onClick={async () => {
                      if (isDisabled) return
                      try {
                        await api.post(`/api/sessions/${sessionId}/select-type`, { type_id: t.type_id })
                        setTypeDialogOpen(false)
                        // Reload briefing to get updated device list
                        const brief = await api.get(`/api/sessions/${sessionId}/briefing`)
                        const sel = brief.data?.selected_type || null
                        const pts = brief.data?.player_types || []
                        const devices = brief.data?.devices || []
                        setSelectedType(sel)
                        setPlayerTypes(pts)
                        setScenarioDevices(devices)
                        
                        // Load devices for selected type
                        if(sel){
                          const t = (pts||[]).find(x=> x.id===sel)
                          const devs = t?.devices || []
                          setTypeDevices(devs)
                          // initialize deviceHours
                          const gen = brief.data?.general || cfg.general || {}
                          setDeviceHours(prev=>{
                            const fh = Number(gen.forecast_horizon_hours||24)
                            const next = { ...prev }
                            devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
                            return next
                          })
                        }
                        showSnack('Player type selected successfully', 'success')
                      } catch(e) {
                        showSnack(e?.response?.data?.error || 'Selection failed', 'error')
                      }
                    }}
                    disabled={isDisabled}
                    color="primary"
                    variant="outlined"
                    sx={{ 
                      height: 'auto',
                      py: 1.5,
                      px: 2,
                      justifyContent: 'flex-start',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      '& .MuiChip-label': {
                        display: 'block',
                        whiteSpace: 'normal',
                        textAlign: 'left',
                        width: '100%',
                        fontWeight: 600,
                        fontSize: '0.95rem'
                      },
                      '&:hover': {
                        bgcolor: isDisabled ? 'transparent' : 'primary.light',
                        borderColor: 'primary.main'
                      }
                    }}
                  />
                  <Box sx={{ px: 2 }}>
                    {typeDesc && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {typeDesc}
                      </Typography>
                    )}
                    <Typography variant="caption" color={isDisabled ? 'error' : 'text.secondary'}>
                      {t.remaining==null? 'Unlimited slots' : (isDisabled ? 'No slots available' : `${t.remaining} slots remaining`)}
                    </Typography>
                  </Box>
                </Stack>
              )
            })}
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Market Overview Dialog (timeline click) */}
      <Dialog open={marketDialogOpen} onClose={()=> setMarketDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {`Market Overview${marketDialogData ? ` — Scope: ${marketDialogData.scopeLabel === 'All devices' ? 'All devices' : `Device (${marketDialogData.scopeLabel})`}` : ''}`}
        </DialogTitle>
        <DialogContent dividers>
          {marketDialogData ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2">Round {marketDialogData.round}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {marketDialogData.now} · {marketDialogData.scopeLabel} · Hours {marketDialogData.roundStart + 1}-{marketDialogData.roundEnd}
                </Typography>
              </Box>

              {marketDialogData.idmForecastChange?.active && (() => {
                const guidance = getIdmGuidance(marketDialogData.idmForecastChange)
                return (
                  <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'info.light', borderRadius: 1, bgcolor: isDark ? alpha(theme.palette.info.main, 0.12) : alpha(theme.palette.info.main, 0.06) }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{guidance.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{guidance.summary}</Typography>
                    {guidance.action && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {guidance.action}
                      </Typography>
                    )}
                  </Box>
                )
              })()}

              {(marketDialogData.gateEvents || []).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Gate events in this round</Typography>
                  <Stack spacing={0.5}>
                    {(marketDialogData.gateEvents || []).map((event) => (
                      <Typography key={event.key} variant="body2" color="text.secondary">
                        {event.at} · {event.type} ({event.action})
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Round volume matrix</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Metric</TableCell>
                        {(marketDialogData.roundColumns || []).map((col) => (
                          <TableCell key={`round-${col.round}`} align="right" sx={{ fontWeight: 700 }}>
                            R{col.round}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(marketDialogData.matrixRows || []).map((row) => (
                        <TableRow key={row.key}>
                          <TableCell sx={{ fontWeight: 600 }}>{row.label}</TableCell>
                          {row.values.map((value, idx) => {
                            const roundCol = marketDialogData.roundColumns[idx]
                            return (
                              <TableCell
                                key={`${row.key}-${idx}`}
                                align="right"
                                  sx={{ ...marketMatrixCellSx(row.key, roundCol) }}
                              >
                                {Number(value || 0).toFixed(1)}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Imbalance (MWh)</TableCell>
                        {(marketDialogData.roundColumns || []).map((roundCol, colIdx) => {
                          const colImbalance =
                            Number(roundCol?.forecastTotal || 0)
                            - Number(roundCol?.damTotal || 0)
                            - Number(roundCol?.idmTotal || 0)
                          return (
                            <TableCell
                              key={`round-total-${roundCol.round}`}
                              align="right"
                              sx={{ fontWeight: 700, ...marketMatrixCellSx('total', roundCol) }}
                            >
                              {Number(colImbalance).toFixed(1)}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {(() => {
                  const cols = marketDialogData.roundColumns || []
                  const hasCleared = cols.some((col) => Boolean(col?.isCleared) || Boolean(col?.damPhaseCleared))
                  const hasDamSpecial = cols.some((col) => Number(col?.damSpecialCount || 0) > 0)
                  const hasDamOpen = cols.some((col) => Number(col?.damOpenCount || 0) > 0)
                  const hasIdmOpen = cols.some((col) => Number(col?.idmOpenCount || 0) > 0)
                  const hasPartial = cols.some((col) => {
                    const hours = Math.max(1, Number(col?.hoursInRound || 1))
                    const damOpen = Number(col?.damOpenCount || 0)
                    const idmOpen = Number(col?.idmOpenCount || 0)
                    const damPartial = damOpen > 0 && damOpen < hours
                    const idmPartial = idmOpen > 0 && idmOpen < hours
                    return damPartial || idmPartial
                  })
                  const hasSubmittedClosed = cols.some((col) => {
                    const damClosedAndSubmitted = Number(col?.damOpenCount || 0) === 0 && Number(col?.damTotal || 0) > 0
                    const idmClosedAndSubmitted = Number(col?.idmOpenCount || 0) === 0 && Number(col?.idmSubmittedTotal || 0) > 0
                    return damClosedAndSubmitted || idmClosedAndSubmitted
                  })
                  const hasForecast = cols.some((col) => {
                    const noDamOpen = Number(col?.damOpenCount || 0) === 0
                    const noIdmOpen = Number(col?.idmOpenCount || 0) === 0
                    return noDamOpen && noIdmOpen
                  })

                  const legendItems = [
                    hasCleared && { key: 'cleared', label: 'cleared', squareSx: { backgroundColor: isDark ? alpha(theme.palette.text.primary, 0.35) : '#BDBDBD' } },
                    hasDamSpecial && { key: 'dam-special', label: 'DAM special', squareSx: { backgroundColor: isDark ? theme.palette.info.main : '#00BCD4' } },
                    hasDamOpen && { key: 'dam-open', label: 'DAM open', squareSx: { backgroundColor: isDark ? theme.palette.warning.main : '#FDD835' } },
                    hasIdmOpen && { key: 'idm-open', label: 'IDM open', squareSx: { backgroundColor: isDark ? theme.palette.warning.dark : '#FB8C00' } },
                    hasPartial && {
                      key: 'partial',
                      label: 'partially open',
                      squareSx: {
                        backgroundColor: isDark ? theme.palette.warning.dark : '#FB8C00',
                        backgroundImage: isDark
                          ? `repeating-linear-gradient(135deg, ${alpha(theme.palette.warning.dark, 0.5)} 0 6px, ${alpha(theme.palette.warning.light, 0.2)} 6px 12px)`
                          : 'repeating-linear-gradient(135deg, rgba(230,81,0,0.30) 0 6px, rgba(251,140,0,0.15) 6px 12px)'
                      }
                    },
                    hasSubmittedClosed && {
                      key: 'submitted',
                      label: 'submitted (gate closed)',
                      squareSx: {
                        backgroundColor: theme.palette.background.paper,
                        backgroundImage: isDark
                          ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 5px, rgba(255,255,255,0.06) 5px 10px)'
                          : 'repeating-linear-gradient(135deg, rgba(224,224,224,0.85) 0 5px, rgba(245,245,245,0.55) 5px 10px)',
                        border: `1px solid ${theme.palette.divider}`
                      }
                    },
                    hasForecast && {
                      key: 'forecast',
                      label: 'forecast',
                      squareSx: {
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`
                      }
                    }
                  ].filter(Boolean)

                  return (
                    <Stack direction="row" spacing={1.25} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                      {legendItems.map((item) => (
                        <Stack key={item.key} direction="row" spacing={0.75} alignItems="center">
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: 0.5,
                              ...item.squareSx
                            }}
                          />
                          <Chip size="small" label={item.label} variant="outlined" sx={{ height: 20 }} />
                        </Stack>
                      ))}
                    </Stack>
                  )
                })()}
              </Box>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">No data available.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setMarketDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Fixed Timer Top Right */}
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1300 }}>
        <TimerAndClock timeRemaining={timeRemaining} />
      </Box>

      {/* Two-phase round banner: tells the player which phase (DAM/IDM) is trading now. */}
      {marketPhase && (
        <Alert severity="info" icon={<InfoOutlined fontSize="inherit" />} sx={{ mb: 2 }}>
          {marketPhase === 'dam'
            ? `Phase 1 of 2 — Day-Ahead market (Round ${cfg.current_round ?? 1}). Submit your DA bids now; the Intraday phase follows next.`
            : (() => {
                const damSmp = (damPhaseFeedback && Number(damPhaseFeedback.round) === Number(cfg.current_round ?? 1) && damPhaseFeedback.smp != null)
                  ? Number(damPhaseFeedback.smp)
                  : (daBaseline?.dam_phase_smp != null ? Number(daBaseline.dam_phase_smp) : null)
                const smpText = damSmp != null ? ` The Day-Ahead market cleared at ${damSmp.toLocaleString()} ZAR/MWh.` : ''
                return `Phase 2 of 2 — Intraday market (Round ${cfg.current_round ?? 1}). Adjust your position against your cleared Day-Ahead baseline.${smpText}`
              })()}
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="subtitle2" component="div">
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {campaignDisplayName}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary', mx: 1 }}>→</Box>
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {(cfg.scenario_name || 'Scenario')} ({mode === 'isolated_per_player' ? 'Solo' : 'Shared'})
          </Box>
          <Box component="span" sx={{ color: 'text.secondary', mx: 1 }}>→</Box>
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {(playerTypes.find(pt=> pt.id === selectedType)?.name || selectedType || 'Player')}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary', mx: 1 }}>→</Box>
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            R{cfg.current_round ?? '—'}
          </Box>
        </Typography>
        <ContextAssistantDialog
          title="Player Round Assistant"
          buttonLabel="Ask About This Round"
          placeholder="Ask about open markets, devices, bids, or what to do next..."
          intro="Ask questions about the current round. I will answer using the visible player context, open markets, devices, events, and your current tasks."
          contextLabel="Active player round context"
          context={playerAssistantContext}
          resetKey={`player-round:${sessionId || 'none'}:${currentRoundNumber}:${status}:${submitted ? 'submitted' : 'editing'}`}
          buttonVariant="outlined"
          buttonColor="primary"
        />
      </Stack>

      <Box sx={{ display: 'flex', gap: 3 }}>
        {/* Left: Tasks */}
        <Box sx={{ width: 240, flexShrink: 0 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Scenario Date/Time</Typography>
                  <Tooltip title="Briefing" arrow>
                    <IconButton size="small" onClick={()=> navigate(`/briefing/${sessionId}`)}>
                      <BriefingIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Box>
                  <Typography variant="body2">
                    {(() => {
                      try {
                        if (!cfg.general.start_time || !cfg.current_round) return '—'
                        const [h, m] = cfg.general.start_time.split(':').map(Number)
                        const totalHours = h + (cfg.current_round - 1) * cfg.general.round_span_hours
                        const days = Math.floor(totalHours / 24)
                        const hours = totalHours % 24
                        const time = `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                        
                        if (cfg.general.fake_date) {
                          const date = new Date(cfg.general.fake_date)
                          const daysToAdd = Math.floor(((cfg.current_round - 1) * cfg.general.round_span_hours) / 24)
                          date.setDate(date.getDate() + daysToAdd)
                          const dateStr = date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
                          return `${dateStr}, ${time}`
                        }
                        return `${time}${days > 0 ? ` (+${days}d)` : ''}`
                      } catch (_) {
                        return cfg.general.start_time || '—'
                      }
                    })()}
                  </Typography>
                </Box>
                {timeRemaining !== null && initialDuration && initialDuration>0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Round progress</Typography>
                    <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, Math.round(((initialDuration - timeRemaining) * 100) / initialDuration)))} />
                  </Box>
                )}
              </Stack>
            </Paper>
            {marketPhase === 'idm' && damPhaseFeedback && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Day-Ahead phase cleared — now trading Intraday
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[
                    damPhaseFeedback.smp != null ? `DA price ${Math.round(Number(damPhaseFeedback.smp)).toLocaleString()} ZAR/MWh` : null,
                    damPhaseFeedback.dispatched_mwh != null ? `awarded ${Math.round(Number(damPhaseFeedback.dispatched_mwh)).toLocaleString()} MWh` : null,
                    damPhaseFeedback.revenue_zar != null ? `revenue ${Math.round(Number(damPhaseFeedback.revenue_zar)).toLocaleString()} ZAR` : null,
                  ].filter(Boolean).join(' · ') || 'Your Day-Ahead position is now fixed. Adjust it in the Intraday market below.'}
                </Typography>
              </Alert>
            )}
            <Typography variant="overline" color="text.secondary" sx={{ pl: 0.5 }}>
              Your tasks
            </Typography>
            {taskItems.map((task) => {
              const isCompleted = completedTasks.has(task.id)
              const isHighPriority = task.priority === 'high'
              const isMediumPriority = task.priority === 'medium'
              return (
              <Paper 
                key={task.id} 
                variant="outlined" 
                sx={(theme) => ({
                  p: 1.5,
                  cursor: 'pointer',
                  borderWidth: 2,
                  borderColor: isCompleted
                    ? theme.palette.success.main
                    : isHighPriority
                      ? theme.palette.primary.main
                      : isMediumPriority
                        ? theme.palette.warning.main
                        : theme.palette.info.main,
                  bgcolor: theme.palette.background.paper,
                  '&:hover': {
                    bgcolor: theme.palette.action.hover
                  }
                })}
                onClick={() => {
                  setCompletedTasks(prev => {
                    const next = new Set(prev)
                    if (next.has(task.id)) {
                      next.delete(task.id)
                    } else {
                      next.add(task.id)
                    }
                    return next
                  })
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ pr: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {task.title}
                    </Typography>
                    {task.deviceText ? (
                      <Typography variant="caption" color="text.secondary">
                        {task.descriptionPrefix}{' '}
                        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          {task.deviceText}
                        </Box>
                        {task.descriptionSuffix || ''}
                      </Typography>
                    ) : (
                      task.description && (
                        <Typography variant="caption" color="text.secondary">
                          {task.description}
                        </Typography>
                      )
                    )}
                    {task.specialNote && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {task.specialNote}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ pt: 0.25 }}>
                    {isCompleted ? (
                      <DoneIcon fontSize="small" color="success" />
                    ) : (
                      <DoneIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    )}
                  </Box>
                </Stack>
              </Paper>
            )})}
            
            {/* Events Section */}
            {visibleEvents.length > 0 && (
              <>
                <Typography variant="overline" color="text.secondary" sx={{ pl: 0.5, mt: 1 }}>
                  Events
                </Typography>
                {visibleEvents.map((event) => (
                  <Paper
                    key={event.id}
                    variant="outlined"
                    sx={(theme) => ({
                      '--event-bg': criticalEventTypes.has(event.type)
                        ? theme.palette.error.main
                        : theme.palette.primary.main,
                      '--event-text': criticalEventTypes.has(event.type)
                        ? theme.palette.error.contrastText
                        : theme.palette.primary.contrastText,
                      p: 1.5,
                      borderWidth: 2,
                      borderColor: criticalEventTypes.has(event.type)
                        ? theme.palette.error.main
                        : theme.palette.primary.main,
                      bgcolor: 'var(--event-bg)',
                      color: 'var(--event-text)'
                    })}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                      {getEventTitle(event)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.9 }}>
                      {event.description || formatEventDescription(event) || 'Event active'}
                    </Typography>
                  </Paper>
                ))}
              </>
            )}
            
            {/* Challenges Section */}
            {visibleChallenges && visibleChallenges.length > 0 && (
              <>
                <Typography variant="overline" color="text.secondary" sx={{ pl: 0.5, mt: 1 }}>
                  Your challenges
                </Typography>
                {visibleChallenges.map((challenge, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {challenge.name || challenge.title || 'Challenge'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {challenge.description || ''}
                    </Typography>
                    {challenge.target_value && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 600, color: 'primary.main' }}>
                        Target: {challenge.target_value} {challenge.unit || ''}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </>
            )}
          </Stack>
        </Box>

        {/* Middle: Forecast Editor */}
        <Box sx={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          <Box>
            {(allowedTypes.length>0 && !selectedType) && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Please select your player type to continue.
              </Alert>
            )}

            {/* IDM synthetic forecast change: tell the player how the synthetic
                consumption/production was revised and in which direction to move
                their Intraday forecast relative to the DA baseline. */}
            {marketPhase === 'idm' && currentIdmForecastChange && (() => {
              const guidance = getIdmGuidance(currentIdmForecastChange)
              if (!guidance || !guidance.action) return null
              const totals = currentIdmForecastChange.round_totals || {}
              const deltaSupply = Math.round(Number(totals.delta_supply_mwh || 0))
              const deltaDemand = Math.round(Number(totals.delta_demand_mwh || 0))
              const isSell = /reduce|below/i.test(guidance.action)
              return (
                <Alert severity={isSell ? 'warning' : 'success'} sx={{ mb: 2 }}>
                  <AlertTitle>Forecast update — adjust your Intraday forecast</AlertTitle>
                  {guidance.summary} {guidance.action}
                  {(deltaSupply !== 0 || deltaDemand !== 0) && (
                    <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                      System shift this round: supply {deltaSupply.toLocaleString()} MWh · demand {deltaDemand.toLocaleString()} MWh.
                    </Typography>
                  )}
                </Alert>
              )
            })()}

            {(allowedTypes.length === 0 || (selectedType && typeDevices.length>0)) ? (
              allowedTypes.length > 0 ? (
                <>
                  {/* Market Phase Timeline - shown once above all devices */}
                  <Box sx={{ mb: 2 }}>
                    <MarketPhaseTimeline
                      hours={Number(cfg.general.forecast_horizon_hours || 48)}
                      hourStatus={effectiveHourStatus || []}
                      currentRound={Number(cfg.current_round || 1)}
                      roundSpan={Number(cfg.general.round_span_hours || 6)}
                      totalRounds={Number(cfg.general.rounds)}
                      idGateInterval={Number(cfg.general.id_gate_interval_hours || 4)}
                      idGateBase={Number(cfg.general.id_gate_base_hour || 0)}
                      onClickSummary={openMarketDialog}
                      roundsSummary={roundsSummary}
                      startHour={(() => {
                        const startTime = cfg.general?.start_time || '00:00'
                        const [h] = startTime.split(':')
                        return parseInt(h) || 0
                      })()}
                      daCommittedStart={daBaseline.da_committed_start}
                      daCommittedEnd={daBaseline.da_committed_end}
                      damBidHours={damBidPresenceByHour}
                      idmBidHours={idmBidPresenceByHour}
                      damOpenHours={marketOfferabilityByHour.damOpenHours}
                      damSpecialHours={marketOfferabilityByHour.damSpecialHours}
                      idmOpenHours={marketOfferabilityByHour.idmOpenHours}
                    />
                  </Box>
                  <Stack spacing={3}>
                  {typeDevices.map(did=> {
                  const deviceDef = scenarioDevices.find(d=> d.id === did)
                  const deviceType = deviceDef?.type || 'unknown'
                  const deviceParams = deviceDef || {}
                  const deviceEffectiveMetric = effectiveDeviceMetrics[did]
                  const deviceEffectiveLimitMw = Number.isFinite(Number(deviceEffectiveMetric?.value))
                    ? Number(deviceEffectiveMetric.value)
                    : null
                  const deviceMax = Number(deviceEffectiveLimitMw || getDeviceMaxCapability(deviceParams) || 0)
                  const fhLocal = Number(cfg.general.forecast_horizon_hours||24)
                  const series = (Array.isArray(deviceHours[did]) && deviceHours[did].length===fhLocal)
                    ? deviceHours[did]
                    : Array.from({length: fhLocal}, ()=> 0)
                  const view = (deviceView[did] || 'chart')
                  return (
                    <Card key={did} variant="outlined" data-cy={`device-card-${did}`}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                          <Box sx={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: 1, 
                            bgcolor: 'action.hover',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'text.primary',
                            border: '1px solid',
                            borderColor: 'divider'
                          }}>
                            {deviceType === 'solar' ? <SolarPower fontSize="small" /> : deviceType === 'wind' ? <Air fontSize="small" /> : deviceType === 'gas' ? <LocalFireDepartment fontSize="small" /> : deviceType === 'storage' || deviceType === 'battery' ? <BatteryChargingFull fontSize="small" /> : <FlashOn fontSize="small" />}
                          </Box>
                          <Box
                            sx={{ flex: 1, cursor: 'pointer' }}
                            onClick={() => openMarketDialog(Number(cfg.current_round || 1), did)}
                          >
                            <Typography variant="h6">{deviceDef?.name || `${did} (no device name)`}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {(() => {
                                const t = (deviceType||'').toLowerCase()
                                if (t.includes('load')) {
                                  const base = deviceParams.baseline_load_mw != null ? `Baseline: ${formatMwValue(scaleMwBySharedMarketSlot(deviceParams.baseline_load_mw, sharedMarketContext))} MW` : null
                                  const peak = deviceParams.peak_load_mw != null ? `Peak: ${formatMwValue(scaleMwBySharedMarketSlot(deviceParams.peak_load_mw, sharedMarketContext))} MW` : null
                                  return [`Type: ${deviceType}`, base, peak].filter(Boolean).join(' • ')
                                } else {
                                  const capacityValue = scaleMwBySharedMarketSlot(deviceParams.capacity_mw ?? deviceParams.max_power_mw ?? deviceParams.capacity, sharedMarketContext)
                                  const cap = Number.isFinite(Number(capacityValue)) ? `Capacity: ${formatMwValue(capacityValue)} MW` : null
                                  const cost = getDeviceCostSummary(deviceParams)
                                  return [`Type: ${deviceType}`, cap, cost].filter(Boolean).join(' • ')
                                }
                              })()}
                            </Typography>
                            {effectiveDeviceMetrics[did] && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {effectiveDeviceMetrics[did].label}: {Number(effectiveDeviceMetrics[did].value || 0).toFixed(1)} MW ({effectiveDeviceMetrics[did].context})
                              </Typography>
                            )}
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="Market Overview" arrow>
                              <IconButton size="small" onClick={() => openMarketDialog(Number(cfg.current_round || 1), did)}>
                                <MarketOverviewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {view === 'chart' ? (
                              <Tooltip title="Fields" arrow>
                                <IconButton size="small" data-cy={`device-view-fields-${did}`} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'fields'}))}>
                                  <ViewList fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="Chart" arrow>
                                <IconButton size="small" data-cy={`device-view-chart-${did}`} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'chart'}))}>
                                  <BarChart fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </Stack>
                        
                        {/* Auto-Bid Threshold Controls (battery devices with auto_bid_allowed) */}
                        {(deviceType === 'battery' || deviceType === 'storage') && deviceDef?.auto_bid_allowed && (() => {
                          const autoBidEnabled = Boolean(autoBidSettings[did]?.enabled)
                          const buyThreshold = Number(autoBidSettings[did]?.buyThreshold ?? 400)
                          const sellThreshold = Number(autoBidSettings[did]?.sellThreshold ?? 800)
                          const invalidThresholdOrder = autoBidEnabled && Number.isFinite(buyThreshold) && Number.isFinite(sellThreshold) && sellThreshold <= buyThreshold

                          return (
                            <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: autoBidEnabled ? 'primary.main' : 'divider' }}>
                              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
                                <Box>
                                  <Typography variant="subtitle2">Battery Dispatch Mode</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Choose between manual hourly dispatch and automatic threshold-based bidding.
                                  </Typography>
                                </Box>
                                <Chip
                                  size="small"
                                  color={autoBidEnabled ? 'primary' : 'default'}
                                  label={autoBidEnabled ? 'Auto-Bid Active' : 'Manual Dispatch'}
                                  variant={autoBidEnabled ? 'filled' : 'outlined'}
                                />
                              </Stack>

                              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
                                <Button
                                  size="small"
                                  variant={autoBidEnabled ? 'outlined' : 'contained'}
                                  onClick={() => setAutoBidSettings(prev => ({ ...prev, [did]: { buyThreshold: 400, sellThreshold: 800, ...prev[did], enabled: false } }))}
                                >
                                  Manual Dispatch
                                </Button>
                                <Button
                                  size="small"
                                  variant={autoBidEnabled ? 'contained' : 'outlined'}
                                  onClick={() => setAutoBidSettings(prev => ({ ...prev, [did]: { buyThreshold: 400, sellThreshold: 800, ...prev[did], enabled: true } }))}
                                >
                                  Auto-Bid Thresholds
                                </Button>
                              </Stack>

                              {!autoBidEnabled && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Manual mode uses the hourly curve or bid lots below. Switch to Auto-Bid to replace manual dispatch with price thresholds.
                                </Typography>
                              )}

                              {autoBidEnabled && (
                                <>
                                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                                    <TextField
                                      label="Charge below price"
                                      type="number"
                                      size="small"
                                      value={buyThreshold}
                                      onChange={(e) => setAutoBidSettings(prev => ({ ...prev, [did]: { ...prev[did], buyThreshold: Number(e.target.value) } }))}
                                      InputProps={{ endAdornment: <Typography variant="caption" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>ZAR/MWh</Typography> }}
                                      sx={{ width: { xs: '100%', sm: 210 } }}
                                    />
                                    <TextField
                                      label="Discharge above price"
                                      type="number"
                                      size="small"
                                      value={sellThreshold}
                                      onChange={(e) => setAutoBidSettings(prev => ({ ...prev, [did]: { ...prev[did], sellThreshold: Number(e.target.value) } }))}
                                      InputProps={{ endAdornment: <Typography variant="caption" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>ZAR/MWh</Typography> }}
                                      sx={{ width: { xs: '100%', sm: 210 } }}
                                    />
                                  </Stack>

                                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: groupedSectionInfoBg, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                                      Battery charges when SMP is below {buyThreshold} ZAR/MWh and discharges when SMP is above {sellThreshold} ZAR/MWh.
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Quantity is capped automatically by battery power and current state of charge. Manual hourly curves and bid lots are disabled while this mode is active.
                                    </Typography>
                                  </Box>

                                  {invalidThresholdOrder && (
                                    <Alert severity="warning" sx={{ mt: 1.5 }}>
                                      Discharge above price should normally be greater than charge below price. Otherwise the battery may cycle at unattractive spreads.
                                    </Alert>
                                  )}
                                </>
                              )}
                            </Box>
                          )
                        })()}

                        {view === 'chart' && !(autoBidSettings[did]?.enabled && (deviceType === 'battery' || deviceType === 'storage') && deviceDef?.auto_bid_allowed) && (
                          <Box sx={{ mb: 2 }}>
                            {(() => {
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = isDeviceMultiBidEnabled(deviceDef)
                              
                              return deviceBidding && deviceBids[did]
                            })() && (
                              <>
                                {/* Multi-Bid Price Inputs */}
                                {(() => {
                                  const deviceBidding = isDeviceMultiBidEnabled(deviceDef)
                                  const uiBidLabels = getDeviceBidLabelsForUi(deviceDef, deviceBids[did])
                                  return deviceBidding && deviceBids[did] && uiBidLabels.length > 0
                                })() && (
                                  <Box sx={{ mt: 3, p: 2, bgcolor: groupedSectionSurface, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                      <Typography variant="subtitle2">Bid Input</Typography>
                                      <InfoLabel
                                        showTitle={false}
                                        tooltip="Set explicit bid prices and hourly quantities for this device. The overview chart below shows the stacked total against effective max power when multiple bids are configured."
                                      />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                                      {getBidInputDescription(getDeviceBidLabelsForUi(deviceDef, deviceBids[did]).length)}
                                    </Typography>
                                    
                                    <Box
                                      sx={{
                                        display: 'grid',
                                        gap: 2,
                                        gridTemplateColumns: {
                                          xs: '1fr',
                                          sm: 'repeat(auto-fit, minmax(220px, 220px))'
                                        }
                                      }}
                                    >
                                      {getDeviceBidLabelsForUi(deviceDef, deviceBids[did]).map((label, index) => (
                                        <Box key={label} sx={{ width: '100%', opacity: activeLot === label ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot(label)}>
                                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: activeLot === label ? 'bold' : 'normal', color: activeLot === label ? 'text.primary' : 'text.secondary' }}>
                                            {getBidLabelTitle(label, index)} {activeLot === label && '✓'}
                                          </Typography>
                                          <TextField
                                            label="Price"
                                            type="number"
                                            size="small"
                                            fullWidth
                                            value={deviceBids[did][label]?.price || 0}
                                            onChange={(e) => onBidPriceChange(did, label, e.target.value)}
                                            onFocus={() => setActiveLot(label)}
                                            inputProps={{ 'data-cy': `device-bid-price-${did}-${label}` }}
                                            InputProps={{
                                              endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>,
                                              sx: {
                                                backgroundColor: activeLot === label ? lotHighlightBg : 'transparent'
                                              }
                                            }}
                                            sx={{
                                              '& .MuiOutlinedInput-root': {
                                                borderColor: activeLot === label ? 'primary.main' : undefined,
                                                borderWidth: activeLot === label ? 2 : 1,
                                                backgroundColor: activeLot === label ? lotHighlightBg : 'transparent'
                                              },
                                              '& .MuiOutlinedInput-input': {
                                                backgroundColor: activeLot === label ? lotHighlightBg : 'transparent'
                                              }
                                            }}
                                          />
                                        </Box>
                                      ))}
                                    </Box>
                                  </Box>
                                )}

                                <Box sx={{ mt: 3 }}>
                                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                    <Typography variant="subtitle2">Device Chart</Typography>
                                  </Stack>
                                  <ForecastChartEditor
                                    hours={toChartSeries(deviceBids[did][activeLot]?.hours || [])}
                                    hourIndices={chartHourIndices}
                                    editableIndices={toChartEditableIndices((deviceBids[did][activeLot]?.hours || []).length)}
                                    lockedUntil={hideNonEditableHours ? 0 : effectiveLockedUntil}
                                    onChange={(i, val) => onBidQuantityChange(did, activeLot, toChartActualHourIndex(i), val)}
                                    maxValue={deviceMax}
                                    effectiveLimitMw={deviceEffectiveLimitMw}
                                    smoothRadius={smoothDragRadius}
                                    currentRound={Number(cfg.current_round || 1)}
                                    roundSpan={Number(cfg.general.round_span_hours || 6)}
                                    freezeHours={Number(cfg.general.freeze_hours || 6)}
                                    dayAheadGateHour={Number(cfg.general.day_ahead_gate_hour ?? 12)}
                                    startTime={cfg.general.start_time || '00:00'}
                                    deviceType={deviceType}
                                    deviceParams={deviceParams}
                                    daBaseline={showDaBaselineOverlay ? toChartSeries(daBaseline.bids?.[did]?.[activeLot]?.hours || daBaseline.devices?.[did] || []) : null}
                                    committedPosition={showDaBaselineOverlay ? toChartSeries(daBaseline.current_position?.bids?.[did]?.[activeLot]?.hours || daBaseline.current_position?.devices?.[did] || []) : null}
                                    prevDispatch={toChartSeries(daBaseline.prev_dispatched?.[did]?.[activeLot] || [])}
                                    hourStatus={toChartStatuses(effectiveHourStatus || [])}
                                    totalRounds={Number(cfg.general.rounds)}
                                    daCommittedStart={daBaseline.da_committed_start}
                                    daCommittedEnd={daBaseline.da_committed_end}
                                  />
                                </Box>
                                
                                {getDeviceBidLabelsForUi(deviceDef, deviceBids[did]).length > 1 && (
                                  <Box sx={{ mt: 3 }}>
                                    <StackedLotsChart
                                      bidSeries={Object.fromEntries(
                                        getDeviceBidLabelsForUi(deviceDef, deviceBids[did]).map((label) => [
                                          label,
                                          toChartSeries(deviceBids[did][label]?.hours || [])
                                        ])
                                      )}
                                      hourIndices={chartHourIndices}
                                      maxValue={deviceMax}
                                      effectiveLimitMw={deviceEffectiveLimitMw}
                                      currentRound={Number(cfg.current_round || 1)}
                                      roundSpan={Number(cfg.general.round_span_hours || 6)}
                                      lockedUntil={hideNonEditableHours ? 0 : effectiveLockedUntil}
                                      activeLot={activeLot}
                                      onLotChange={setActiveLot}
                                      deviceParams={deviceParams}
                                      deviceType={deviceType}
                                      startTime={cfg.general.start_time || '00:00'}
                                      fakeDate={cfg.general.fake_date || ''}
                                      hourStatus={toChartStatuses(effectiveHourStatus || [])}
                                    />
                                  </Box>
                                )}
                              </>
                            )}
                            {(() => {
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = isDeviceMultiBidEnabled(deviceDef)
                              
                              return !deviceBidding
                            })() && (
                              <Box>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                  <Typography variant="subtitle2">Input Chart</Typography>
                                  <InfoLabel
                                    showTitle={false}
                                    tooltip="Drag hourly points to update this device forecast. Max-power reference uses effective capacity for the current round (including profile/hour effects)."
                                  />
                                </Stack>
                                <ForecastChartEditor 
                                  hours={toChartSeries(series)} 
                                  hourIndices={chartHourIndices}
                                  editableIndices={toChartEditableIndices(series.length)}
                                  lockedUntil={hideNonEditableHours ? 0 : effectiveLockedUntil} 
                                  onChange={(i, val)=> onDeviceChange(did, toChartActualHourIndex(i), val)} 
                                  maxValue={deviceMax} 
                                  effectiveLimitMw={deviceEffectiveLimitMw}
                                  smoothRadius={smoothDragRadius}
                                  currentRound={Number(cfg.current_round || 1)}
                                  roundSpan={Number(cfg.general.round_span_hours || 6)}
                                  freezeHours={Number(cfg.general.freeze_hours || 6)}
                                  dayAheadGateHour={Number(cfg.general.day_ahead_gate_hour ?? 12)}
                                  startTime={cfg.general.start_time || '00:00'}
                                  fakeDate={cfg.general.fake_date || ''}
                                  deviceType={deviceType}
                                  deviceParams={deviceParams}
                                  daBaseline={showDaBaselineOverlay ? toChartSeries(daBaseline.devices?.[did] || []) : null}
                                  committedPosition={showDaBaselineOverlay ? toChartSeries(daBaseline.current_position?.devices?.[did] || []) : null}
                                  prevDispatch={toChartSeries(
                                    Object.values(daBaseline.prev_dispatched?.[did] || {}).reduce(
                                      (acc, lotHours) => lotHours.map((v, i) => (acc[i] || 0) + v), []
                                    )
                                  )}
                                  hourStatus={toChartStatuses(effectiveHourStatus || [])}
                                  totalRounds={Number(cfg.general.rounds)}
                                  daCommittedStart={daBaseline.da_committed_start}
                                  daCommittedEnd={daBaseline.da_committed_end}
                                />
                              </Box>
                            )}
                          </Box>
                        )}
                        {view === 'fields' && (
                          <Box sx={{ mt: 1 }}>
                            {(() => {
                              const deviceBidding = isDeviceMultiBidEnabled(deviceDef)
                              const groups = buildFieldGroups(series.length)
                              const uiBidLabels = getDeviceBidLabelsForUi(deviceDef, deviceBids[did])

                              return (
                                <>
                                  {deviceBidding && deviceBids[did] && uiBidLabels.length > 0 ? (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, p: 1, bgcolor: groupedSectionInfoBg, borderRadius: 1 }}>
                                      {uiBidLabels.length > 1 ? (
                                        <>
                                          Currently editing: <strong>{getBidLabelTitle(activeLot, BID_LABELS.indexOf(activeLot))}</strong>. Click a price field above to switch and enter MW for each hour.
                                        </>
                                      ) : (
                                        <>
                                          Enter MW for each hour for <strong>{getBidLabelTitle(uiBidLabels[0], 0)}</strong>.
                                        </>
                                      )}
                                    </Typography>
                                  ) : null}

                                  {uiBidLabels.length > 1 && (
                                    <Box sx={{ mt: 3 }}>
                                      <StackedLotsChart
                                        bidSeries={Object.fromEntries(
                                          uiBidLabels.map((label) => [
                                            label,
                                            toChartSeries(deviceBids[did][label]?.hours || [])
                                          ])
                                        )}
                                        hourIndices={chartHourIndices}
                                        maxValue={deviceMax}
                                          effectiveLimitMw={deviceEffectiveLimitMw}
                                        currentRound={Number(cfg.current_round || 1)}
                                        roundSpan={Number(cfg.general.round_span_hours || 6)}
                                        lockedUntil={hideNonEditableHours ? 0 : effectiveLockedUntil}
                                        activeLot={activeLot}
                                        onLotChange={setActiveLot}
                                        deviceParams={deviceParams}
                                        deviceType={deviceType}
                                        startTime={cfg.general.start_time || '00:00'}
                                        fakeDate={cfg.general.fake_date || ''}
                                        hourStatus={toChartStatuses(effectiveHourStatus || [])}
                                      />
                                    </Box>
                                  )}

                                  <Stack spacing={3}>
                                    {groups.map((group) => {
                                      const groupHours = group.hours || []
                                      if (groupHours.length === 0) return null

                                      const chunkSize = 4
                                      const chunks = []
                                      for (let idx = 0; idx < groupHours.length; idx += chunkSize) {
                                        chunks.push(groupHours.slice(idx, idx + chunkSize))
                                      }

                                      return (
                                        <Box key={group.label}>
                                          <Tooltip title={group.hint} placement="top-start" arrow>
                                            <Typography variant="subtitle2" sx={{ mb: 1, color: group.color, fontWeight: 'bold', cursor: 'help' }}>
                                              {group.label}
                                            </Typography>
                                          </Tooltip>
                                          <Stack spacing={1.5}>
                                            {chunks.map((chunk, chunkIdx) => (
                                              <Grid container spacing={1} key={chunkIdx} alignItems="center">
                                                {chunk.map((i) => {
                                                  const disabled = !editableIdx.has(i) || timeRemaining === 0
                                                  const highlightLot = deviceBidding && deviceBids[did]
                                                  const v = deviceBidding && deviceBids[did]
                                                    ? (deviceBids[did][activeLot]?.hours?.[i] ?? 0)
                                                    : series[i]
                                                  return (
                                                    <Grid item xs={6} sm={3} md={3} key={i}>
                                                      <Tooltip arrow title={`Hour h${i + 1}: ${disabled ? 'Locked (freeze)' : 'Editable'}`}>
                                                        <TextField
                                                          label={`h${i + 1}`}
                                                          value={v}
                                                          onChange={(e) => {
                                                            if (deviceBidding && deviceBids[did]) {
                                                              onBidQuantityChange(did, activeLot, i, e.target.value)
                                                            } else {
                                                              onDeviceChange(did, i, e.target.value)
                                                            }
                                                          }}
                                                          size="small"
                                                          type="number"
                                                          disabled={disabled}
                                                          fullWidth
                                                          inputProps={{ 'data-cy': `device-hour-input-${did}-${i + 1}` }}
                                                          sx={{
                                                            '& .MuiOutlinedInput-root': {
                                                              backgroundColor: highlightLot ? lotHighlightBg : 'transparent'
                                                            },
                                                            '& .MuiOutlinedInput-input': {
                                                              backgroundColor: highlightLot ? lotHighlightBg : 'transparent'
                                                            }
                                                          }}
                                                        />
                                                      </Tooltip>
                                                    </Grid>
                                                  )
                                                })}
                                              </Grid>
                                            ))}
                                          </Stack>
                                        </Box>
                                      )
                                    })}
                                  </Stack>
                                </>
                              )
                            })()}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
              {/* Market Phase Legend - shown once below all devices */}
              <MarketPhaseLegend />
              </>
              ) : (
                <>
                  <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                    Enter your power per hour in MW. Each hour's value represents your power output for that hour (100 MW × 1 hour = 100 MWh energy). Use the chart editor to drag points or switch to fields for precise values. Locked hours cannot be changed.
                  </Alert>
                {/* Market Phase Timeline - shown once above editor */}
                <Box sx={{ mb: 2 }}>
                  <MarketPhaseTimeline
                    hours={Number(cfg.general.forecast_horizon_hours || 48)}
                    hourStatus={effectiveHourStatus || []}
                    currentRound={Number(cfg.current_round || 1)}
                    roundSpan={Number(cfg.general.round_span_hours || 6)}
                    totalRounds={Number(cfg.general.rounds)}
                    idGateInterval={Number(cfg.general.id_gate_interval_hours || 4)}
                    idGateBase={Number(cfg.general.id_gate_base_hour || 0)}
                    onClickSummary={openMarketDialog}
                    roundsSummary={roundsSummary}
                    startHour={(() => {
                      const startTime = cfg.general?.start_time || '00:00'
                      const [h] = startTime.split(':')
                      return parseInt(h) || 0
                    })()}
                    daCommittedStart={daBaseline.da_committed_start}
                    daCommittedEnd={daBaseline.da_committed_end}
                    damBidHours={damBidPresenceByHour}
                    idmBidHours={idmBidPresenceByHour}
                    damOpenHours={marketOfferabilityByHour.damOpenHours}
                    damSpecialHours={marketOfferabilityByHour.damSpecialHours}
                    idmOpenHours={marketOfferabilityByHour.idmOpenHours}
                  />
                </Box>
                {/* Unified editor header with toggle */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2">
                      {useChartEditor ? 'Input Chart' : 'Fields Editor'}
                    </Typography>
                    <InfoLabel
                      showTitle={false}
                      tooltip={useChartEditor
                        ? 'Edit the hourly profile directly in the chart. Locked hours cannot be changed; editable hours can be dragged.'
                        : 'Edit hourly values directly in input fields for precise numeric control.'}
                    />
                  </Stack>
                  {useChartEditor ? (
                    <Button size="small" startIcon={<ViewList fontSize="small" />} onClick={()=> setUseChartEditor(false)}>Switch to fields</Button>
                  ) : (
                    <Button size="small" startIcon={<BarChart fontSize="small" />} onClick={()=> setUseChartEditor(true)}>Switch to chart</Button>
                  )}
                </Stack>
                {useChartEditor ? (
                  <Box sx={{ mb: 2 }}>
                    <ForecastChartEditor 
                      hours={toChartSeries(hours)} 
                      hourIndices={chartHourIndices}
                      editableIndices={toChartEditableIndices(hours.length)}
                      lockedUntil={hideNonEditableHours ? 0 : effectiveLockedUntil} 
                      onChange={(i, val)=> onChange(toChartActualHourIndex(i), val)} 
                      maxValue={aggregateMax}
                      effectiveLimitMw={aggregateMax}
                      smoothRadius={smoothDragRadius}
                      currentRound={Number(cfg.current_round || 1)}
                      roundSpan={Number(cfg.general.round_span_hours || 6)}
                      freezeHours={Number(cfg.general.freeze_hours || 6)}
                      startTime={cfg.general.start_time || '00:00'}
                      fakeDate={cfg.general.fake_date || ''}
                      daBaseline={showDaBaselineOverlay ? toChartSeries(daBaseline.aggregate || []) : null}
                      committedPosition={showDaBaselineOverlay ? toChartSeries(daBaseline.current_position?.aggregate || []) : null}
                      prevDispatch={toChartSeries(
                        Object.values(daBaseline.prev_dispatched || {}).flatMap(lots => Object.values(lots))
                          .reduce((acc, lotHours) => lotHours.map((v, i) => (acc[i] || 0) + v), [])
                      )}
                      hourStatus={toChartStatuses(effectiveHourStatus || [])}
                      totalRounds={Number(cfg.general.rounds)}
                      daCommittedStart={daBaseline.da_committed_start}
                      daCommittedEnd={daBaseline.da_committed_end}
                    />
                  </Box>
                ) : (
                  <Box sx={{ mt: 2 }}>
                    {(() => {
                      const groups = buildFieldGroups(hours.length)
                      
                      return (
                        <Stack spacing={3}>
                          {groups.map((group) => {
                            const groupHours = group.hours || []
                            if (groupHours.length === 0) return null
                            
                            const chunkSize = 4
                            const chunks = []
                            for (let idx = 0; idx < groupHours.length; idx += chunkSize) {
                              chunks.push(groupHours.slice(idx, idx + chunkSize))
                            }
                            
                            return (
                              <Box key={group.label}>
                                <Tooltip title={group.hint} placement="top-start" arrow>
                                  <Typography variant="subtitle2" sx={{ mb: 1, color: group.color, fontWeight: 'bold', cursor: 'help' }}>
                                    {group.label}
                                  </Typography>
                                </Tooltip>
                                <Stack spacing={1.5}>
                                  {chunks.map((chunk, chunkIdx) => (
                                    <Grid container spacing={1} key={chunkIdx} alignItems="center">
                                      {chunk.map((i) => {
                                        const disabled = !editableIdx.has(i) || timeRemaining === 0
                                        return (
                                          <Grid item xs={6} sm={3} md={3} key={i}>
                                            <Tooltip arrow title={`Hour h${i + 1}: ${disabled ? 'Locked (freeze)' : 'Editable'}`}>
                                              <TextField
                                                label={`h${i + 1}`}
                                                value={hours[i]}
                                                onChange={(e) => onChange(i, e.target.value)}
                                                size="small"
                                                type="number"
                                                disabled={disabled}
                                                fullWidth
                                              />
                                            </Tooltip>
                                          </Grid>
                                        )
                                      })}
                                    </Grid>
                                  ))}
                                </Stack>
                              </Box>
                            )
                          })}
                        </Stack>
                      )
                    })()}
                  </Box>
                )}
                {/* Market Phase Legend - shown once below editor */}
                <MarketPhaseLegend />
              </>
            )
          ) : null}

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Tooltip arrow title={`Submits only the hours of the current round (R${cfg.current_round}).`}>
                <span>
                  <Button
                    variant="contained"
                    data-cy="submit-current-round"
                    onClick={() => submitCurrent(false)}
                    disabled={!isEditable || !isValid || timeRemaining === 0 || (allowedTypes.length>0 && !selectedType) || isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Current Round'}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Box>
        </Box>

        {/* Right: Session Info and Market Insights */}
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Tabs
                  value={marketInsightsTab}
                  onChange={(_, value) => setMarketInsightsTab(value)}
                  variant="fullWidth"
                  sx={{ mb: 1 }}
                >
                  <Tab value="dam" label="Day-Ahead" />
                </Tabs>

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Market Structure</Typography>
                  <Tooltip
                    arrow
                    title="Supply and demand curves reflect the selected market snapshot for this round."
                    placement="left"
                  >
                    <IconButton size="small" aria-label="Market structure info">
                      <InfoOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <MarketCurves
                  sessionId={sessionId}
                  currentRound={cfg.current_round}
                  roundSpanHours={Number(cfg.general.round_span_hours || 6)}
                  marketMode={marketInsightsTab}
                />

                {cfg.current_round > 1 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                      {marketInsightsTab === 'dam' ? 'SMP' : 'IDP'} last round ({marketInsightsTab === 'dam' ? 'Day-Ahead' : 'Intraday'})
                    </Typography>
                    <svg ref={smpRef} width="100%" height={100} style={{ border: `1px solid ${theme.palette.divider}`, background: isDark ? theme.palette.background.default : theme.palette.background.paper }} />

                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                      Volume last round ({marketInsightsTab === 'dam' ? 'Day-Ahead' : 'Intraday'})
                    </Typography>
                    <svg ref={volRef} width="100%" height={100} style={{ border: `1px solid ${theme.palette.divider}`, background: isDark ? theme.palette.background.default : theme.palette.background.paper }} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* My Devices */}
            {((selectedType && typeDevices.length>0) || (Array.isArray(scenarioDevices)&&scenarioDevices.length>0)) && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>My Devices</Typography>
                  <Stack spacing={1.25}>
                    {(selectedType ? typeDevices.map(did=> scenarioDevices.find(d=> d.id===did)).filter(Boolean) : scenarioDevices).map((dev) => (
                      <Box
                        key={dev.id}
                        sx={{
                          p: 1.25,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          minWidth: 0,
                          bgcolor: alpha(theme.palette.background.default, 0.3),
                        }}
                      >
                        <Stack spacing={1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}
                            >
                              {dev.name ? dev.name : `${dev.id} (no device name)`}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 0.25, wordBreak: 'break-word' }}
                            >
                              ID: {dev.id}
                            </Typography>
                          </Box>

                          <Box>
                            <Chip
                              size="small"
                              label={dev.type || '-'}
                              sx={{ maxWidth: '100%' }}
                            />
                          </Box>

                          <Stack spacing={0.75}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Capacity
                              </Typography>
                              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                {getDeviceCapacityLabel(dev, sharedMarketContext)}
                              </Typography>
                            </Box>

                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Variable Cost
                              </Typography>
                              {Array.isArray(dev.variable_cost_tiers) && dev.variable_cost_tiers.length > 0 ? (
                                <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                                  {dev.variable_cost_tiers.map((tier, i) => (
                                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                      <Typography variant="caption" color="text.secondary">
                                        {tier.from_pct}–{tier.to_pct}%
                                      </Typography>
                                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                        {tier.cost_zar_per_mwh} ZAR/MWh
                                      </Typography>
                                    </Box>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                  {getDeviceCostRange(dev) || '-'}
                                </Typography>
                              )}
                            </Box>

                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Fixed Cost
                              </Typography>
                              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                {getDeviceFixedCostLabel(dev)}
                              </Typography>
                            </Box>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Box>
      </Box>
      </>
      )}
      
      {/* Overcapacity Warning Dialog */}
      <Dialog 
        open={confirmOvercapacityOpen} 
        onClose={() => setConfirmOvercapacityOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{`⚠️ ${isConsumerPlayer ? 'Overcapacity Demand Detected' : 'Overcapacity Bid Detected'}`}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {isConsumerPlayer
              ? 'You are requesting more than your device capacity. The system will automatically cap the accepted demand to the maximum capacity, and you may incur imbalance costs if actual consumption differs from what was accepted.'
              : 'You are bidding more than your device capacity. The system will automatically cap your bid to the maximum capacity, and you may incur imbalance costs if the actual output differs from what was accepted.'}
          </Alert>
          
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{isConsumerPlayer ? 'Overcapacity demand detected:' : 'Overcapacity bids detected:'}</strong>
          </Typography>
          
          <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
            {overcapacityWarnings.map((w, idx) => (
              <Alert severity="info" key={idx} sx={{ mb: 1 }}>
                <strong>{w.device}</strong> Hour {w.hour}: {isConsumerPlayer ? 'Requested' : 'Offered'} {w.offered} MW exceeds max capacity {w.maxPower} MW
              </Alert>
            ))}
          </Box>
          
          <Typography variant="body2" color="text.secondary">
            Do you want to proceed with this submission?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button data-cy="cancel-overcapacity-submit" onClick={() => setConfirmOvercapacityOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            data-cy="confirm-overcapacity-submit"
            onClick={async () => {
              const r = Number(cfg.current_round || 1)
              const span = Number(cfg.general.round_span_hours || 6)
              const start = (r - 1) * span
              const slice = hours.slice(start, start + span)
              await doSubmit(slice, r)
            }}
            color="warning"
          >
            Submit Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}