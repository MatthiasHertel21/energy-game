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
  Box,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Chip,
  LinearProgress,
  Divider
} from '@mui/material'
import { BarChart, ViewList, InfoOutlined, MenuBook as BriefingIcon } from '@mui/icons-material'
import { IconButton } from '@mui/material'
import InfoLabel from '../components/InfoLabel'
import ForecastChartEditor from '../components/ForecastChartEditor'
import EventNotification from '../components/EventNotification'
import BriefingScreen from '../components/BriefingScreen'
import WaitingScreen from '../components/WaitingScreen'
import RoundResultsScreen from '../components/RoundResultsScreen'
import ScenarioResultsScreen from '../components/ScenarioResultsScreen'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useSnackbar } from '../components/SnackbarProvider'
import api from '../services/api'
import { io } from 'socket.io-client'
import * as d3 from 'd3'
import confetti from 'canvas-confetti'
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'

const BASELOAD_PATTERN = [0.92, 0.91, 0.9, 0.9, 0.9, 0.92, 0.94, 0.95, 0.96, 0.96, 0.95, 0.94, 0.93, 0.93, 0.94, 0.95, 0.96, 0.96, 0.95, 0.94, 0.93, 0.93, 0.92, 0.92]
const PEAKING_PATTERN = [0.4, 0.35, 0.32, 0.32, 0.38, 0.5, 0.62, 0.75, 0.85, 0.92, 0.95, 0.96, 0.94, 0.9, 0.88, 0.9, 0.94, 0.95, 0.86, 0.75, 0.65, 0.55, 0.48, 0.42]
const LOAD_PATTERN = [0.55, 0.5, 0.48, 0.47, 0.5, 0.62, 0.74, 0.86, 0.93, 0.97, 1.0, 1.0, 0.98, 0.95, 0.92, 0.94, 0.97, 0.98, 0.9, 0.82, 0.72, 0.66, 0.6, 0.58]
const SOLAR_PATTERN = [0, 0, 0, 0, 0.05, 0.15, 0.35, 0.6, 0.78, 0.9, 0.92, 0.9, 0.78, 0.6, 0.35, 0.15, 0.05, 0, 0, 0, 0, 0, 0, 0]
const WIND_PATTERN = [0.52, 0.5, 0.46, 0.44, 0.48, 0.55, 0.6, 0.66, 0.72, 0.75, 0.7, 0.66, 0.62, 0.58, 0.55, 0.5, 0.52, 0.56, 0.6, 0.6, 0.58, 0.55, 0.54, 0.52]
const BATTERY_PATTERN = [0.45, 0.4, 0.35, 0.3, 0.2, 0.1, -0.05, -0.2, -0.4, -0.55, -0.6, -0.45, -0.25, 0, 0.2, 0.4, 0.6, 0.65, 0.55, 0.42, 0.3, 0.2, 0.1, 0]
const DEFAULT_AGG_PATTERN = [0.6, 0.58, 0.55, 0.52, 0.52, 0.62, 0.78, 0.92, 1.02, 1.08, 1.1, 1.05, 0.98, 0.96, 0.98, 1.02, 1.08, 1.1, 1.0, 0.9, 0.82, 0.76, 0.7, 0.65]

const zeroProfile = (len) => Array.from({ length: Math.max(1, len) }, () => 0)
const toNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}
const clampValue = (val, min = 0, max = Number.POSITIVE_INFINITY) => {
  if (!Number.isFinite(max)) return Math.max(min, val)
  if (max <= min) return Math.max(min, val)
  return Math.min(max, Math.max(min, val))
}
const samplePattern = (pattern, idx) => pattern[idx % pattern.length]
const roundValue = (val) => Number(val.toFixed(2))

const buildGeneratorProfile = (device, len, pattern) => {
  const n = Math.max(1, len)
  const maxPower = toNumber(device?.max_power_mw ?? device?.capacity_mw ?? device?.capacity ?? 0, 0)
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

const buildLoadProfile = (device, len) => {
  const n = Math.max(1, len)
  const baseline = Math.max(0, toNumber(device?.baseline_load_mw ?? 0, 0))
  const peakRaw = toNumber(device?.peak_load_mw ?? baseline, baseline)
  const peak = Math.max(baseline + 5, peakRaw)
  const span = Math.max(peak - baseline, 1)
  return Array.from({ length: n }, (_, idx) => {
    const frac = clampValue(samplePattern(LOAD_PATTERN, idx), 0, 1)
    const value = clampValue(baseline + frac * span, baseline, peak * 0.98)
    return roundValue(value)
  })
}

const buildRenewableProfile = (device, len, pattern, cfNormalizer) => {
  const n = Math.max(1, len)
  const capacity = toNumber(device?.capacity_mw ?? device?.max_power_mw ?? device?.max_power ?? 0, 0)
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

const buildBatteryProfile = (device, len) => {
  const n = Math.max(1, len)
  const power = toNumber(device?.power_rating_mw ?? device?.power_mw ?? device?.capacity_mw ?? 0, 0)
  if (power <= 0) return zeroProfile(n)
  const limit = power * 0.9
  return Array.from({ length: n }, (_, idx) => {
    const frac = samplePattern(BATTERY_PATTERN, idx)
    const value = clampValue(frac * limit, -limit, limit)
    return roundValue(value)
  })
}

const buildGenericProfile = (device, len) => {
  const n = Math.max(1, len)
  const capacity = Math.max(20, toNumber(device?.capacity_mw ?? device?.max_power_mw ?? 60, 60))
  return Array.from({ length: n }, (_, idx) => {
    const value = capacity * 0.6 * samplePattern(DEFAULT_AGG_PATTERN, idx)
    return roundValue(value)
  })
}

const buildDeviceProfile = (device, len) => {
  const type = (device?.type || '').toLowerCase()
  if (['coal', 'nuclear'].includes(type)) return buildGeneratorProfile(device, len, BASELOAD_PATTERN)
  if (['gas', 'hydro'].includes(type)) return buildGeneratorProfile(device, len, PEAKING_PATTERN)
  if (type === 'solar') return buildRenewableProfile(device, len, SOLAR_PATTERN, 0.3)
  if (type === 'wind') return buildRenewableProfile(device, len, WIND_PATTERN, 0.4)
  if (type === 'battery') return buildBatteryProfile(device, len)
  if (type.includes('load')) return buildLoadProfile(device, len)
  return buildGenericProfile(device, len)
}

const getDefaultBidPrices = (device) => {
  const variableCost = toNumber(device?.variable_cost_zar_per_mwh ?? device?.cost_per_mwh_zar ?? 0, 0)
  if (variableCost <= 0) {
    // Fallback defaults for devices without cost data
    return { A: 300, B: 400, C: 500 }
  }
  return {
    A: Math.round(variableCost * 1.0),   // At-cost
    B: Math.round(variableCost * 1.25),  // Moderate markup
    C: Math.round(variableCost * 1.5)    // Premium
  }
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
    device.capacity_mw,
    device.max_power_mw,
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

function CountdownTimer({ timeRemaining }) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const isWarning = timeRemaining <= 30 && timeRemaining > 0

  return (
    <Box
      sx={{
        textAlign: 'center',
        p: 2,
        backgroundColor: isWarning ? 'warning.light' : 'primary.light',
        borderRadius: 2,
        transition: 'background-color 0.3s'
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 'bold', color: isWarning ? 'warning.dark' : 'primary.dark' }}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </Typography>
      <Typography variant="caption" sx={{ color: isWarning ? 'warning.dark' : 'primary.dark' }}>
        {isWarning ? 'Time is running out!' : 'Time remaining'}
      </Typography>
    </Box>
  )
}

function ScenarioClock({ fakeDate, startTime, currentRound, roundSpan }) {
  // Calculate current simulation time based on round and start time
  const simulationTime = useMemo(() => {
    if (!startTime || !currentRound) return ''
    try {
      const [h, m] = startTime.split(':').map(Number)
      const totalHours = h + (currentRound - 1) * roundSpan
      const days = Math.floor(totalHours / 24)
      const hours = totalHours % 24
      return `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')} ${days > 0 ? `(+${days}d)` : ''}`
    } catch (_) {
      return startTime
    }
  }, [startTime, currentRound, roundSpan])

  const displayDate = useMemo(() => {
    if (!fakeDate || !currentRound) return fakeDate
    try {
      const date = new Date(fakeDate)
      const daysToAdd = Math.floor(((currentRound - 1) * roundSpan) / 24)
      date.setDate(date.getDate() + daysToAdd)
      return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch (_) {
      return fakeDate
    }
  }, [fakeDate, currentRound, roundSpan])

  const [realTime, setRealTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setRealTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Box
      sx={{
        textAlign: 'center',
        p: 1.5,
        backgroundColor: '#f5f5f5',
        borderRadius: 2,
        mb: 1
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
        {simulationTime}
      </Typography>
      {displayDate && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {displayDate}
        </Typography>
      )}
      <Divider sx={{ my: 0.5 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Real: {realTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </Typography>
    </Box>
  )
}

// Stacked area chart showing all three lots (clickable to select lot)
function StackedLotsChart({ bidsA, bidsB, bidsC, maxValue, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams }) {
  const svgRef = useRef(null)
  
  useEffect(() => {
    if (!svgRef.current) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const W = 700, H = 220
    const M = { top: 16, right: 20, bottom: 36, left: 46 }
    const iw = W - M.left - M.right
    const ih = H - M.top - M.bottom
    
    const g = svg.attr('width', W).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)
    
    const n = Math.max(bidsA.length, bidsB.length, bidsC.length)
    if (n === 0) return
    
    // Calculate stacked max
    const stackedMax = d3.max(d3.range(n).map(i => (bidsA[i] || 0) + (bidsB[i] || 0) + (bidsC[i] || 0)))
    const yMax = Math.max(stackedMax || 100, maxValue || 100)
    
    // Scales
    const x = d3.scaleLinear().domain([1, n]).range([0, iw])
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([ih, 0])
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''))
      .selectAll('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '2,2')
    
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(n).tickSize(-ih).tickFormat(''))
      .selectAll('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '2,2')
    
    // Axes
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(n > 24 ? 12 : n).tickFormat(d => `h${Math.round(d-1)}`))
      .selectAll('text')
      .style('font-size', '10px')
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(6))
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -36)
      .attr('x', -ih / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .style('font-size', '11px')
      .text('MW (Stacked)')
    
    // Background regions
    const lockedEnd = Math.min(n, lockedUntil || 0)
    if (lockedEnd > 0) {
      g.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', x(lockedEnd + 1) - x(1))
        .attr('height', ih)
        .attr('fill', '#ffecb3')
        .attr('opacity', 0.3)
    }
    
    const rsStart = ((currentRound - 1) * roundSpan)
    const rsEnd = rsStart + roundSpan
    if (rsStart < n) {
      g.append('rect')
        .attr('x', x(rsStart + 1))
        .attr('y', 0)
        .attr('width', x(Math.min(rsEnd + 1, n)) - x(rsStart + 1))
        .attr('height', ih)
        .attr('fill', '#e3f2fd')
        .attr('opacity', 0.3)
    }
    
    // Prepare stacked data
    const stackedData = d3.range(n).map(i => ({
      hour: i + 1,
      a: bidsA[i] || 0,
      b: bidsB[i] || 0,
      c: bidsC[i] || 0
    }))
    
    // Stacked area generator
    const stack = d3.stack()
      .keys(['a', 'b', 'c'])
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone)
    
    const series = stack(stackedData)
    
    const area = d3.area()
      .x(d => x(d.data.hour))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX)
    
    // Draw stacked areas with blue color scheme and yellow for active
    const colors = ['#64b5f6', '#2196f3', '#1565c0'] // Light blue, medium blue, dark blue
    const lotNames = ['A', 'B', 'C']
    g.selectAll('.area')
      .data(series)
      .enter()
      .append('path')
      .attr('class', 'area')
      .attr('fill', (d, i) => lotNames[i] === activeLot ? '#ffd54f' : colors[i])
      .attr('opacity', (d, i) => lotNames[i] === activeLot ? 0.95 : 0.65)
      .attr('d', area)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const lotIndex = series.indexOf(d)
        if (lotIndex >= 0) onLotChange(lotNames[lotIndex])
      })
    
    // Capacity lines (min/max)
    if (deviceParams) {
      const minCap = deviceParams.min_power_mw || 0
      const maxCap = deviceParams.max_power_mw || maxValue
      
      if (minCap > 0) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', iw)
          .attr('y1', y(minCap))
          .attr('y2', y(minCap))
          .attr('stroke', '#f44336')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
        
        g.append('text')
          .attr('x', iw - 5)
          .attr('y', y(minCap) - 5)
          .attr('text-anchor', 'end')
          .attr('fill', '#f44336')
          .style('font-size', '10px')
          .style('font-weight', 'bold')
          .text(`Min: ${minCap} MW`)
      }
      
      if (maxCap && maxCap < yMax) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', iw)
          .attr('y1', y(maxCap))
          .attr('y2', y(maxCap))
          .attr('stroke', '#4caf50')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
        
        g.append('text')
          .attr('x', iw - 5)
          .attr('y', y(maxCap) - 5)
          .attr('text-anchor', 'end')
          .attr('fill', '#4caf50')
          .style('font-size', '10px')
          .style('font-weight', 'bold')
          .text(`Max: ${maxCap} MW`)
      }
    }
    
  }, [bidsA, bidsB, bidsC, maxValue, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams])
  
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Stacked Lot Overview</Typography>
      <svg ref={svgRef}></svg>
    </Box>
  )
}

export default function Player() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showSnack } = useSnackbar()

  // Micro-interaction: confetti burst on successful submit (respects reduced motion)
  const triggerConfetti = () => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      confetti({ particleCount: 120, spread: 70, startVelocity: 35, gravity: 0.9, ticks: 200, origin: { y: 0.6 } })
    } catch (_) {}
  }

  // Auto-load active session or use sessionId from query params
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState([])
  const [cfg, setCfg] = useState({
    general: { round_span_hours: 6, forecast_horizon_hours: 48, freeze_hours: 6, horizon_hours: 24, fake_date: '', start_time: '' },
    current_round: 1,
    scenario_name: '',
    campaign_name: ''
  })
  const [status, setStatus] = useState('pending')
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [initialDuration, setInitialDuration] = useState(null)
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
  const [dismissedEvents, setDismissedEvents] = useState(new Set())
  const [useChartEditor, setUseChartEditor] = useState(true)
  const [deviceView, setDeviceView] = useState({}) // { device_id: 'chart'|'fields' }
  const [submitted, setSubmitted] = useState(false)
  const [scenario, setScenario] = useState(null)
  const [deviceBids, setDeviceBids] = useState({}) // { device_id: { A: {price, hours}, B: {price, hours}, C: {price, hours} } }
  const [biddingEnabled, setBiddingEnabled] = useState(false)
  const [activeLot, setActiveLot] = useState('A') // Active lot for editing (A, B, or C)
  useEffect(() => {
    forecastSeedKeyRef.current = null
  }, [sessionId])
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
    const capacitySum = relevantDevices.reduce((sum, dev) => sum + getDeviceMaxCapability(dev), 0)
    return capacitySum > 0 ? capacitySum : dataMax
  }, [scenarioDevices, allowedTypes.length, typeDevices, hours])

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
      setDeviceBids(savedBids)
    }

    const normalizedDevices = {}
    if (Array.isArray(savedDevices)) {
      savedDevices.forEach((entry) => {
        const did = entry?.device_id
        if (!did) return
        const sourceHours = Array.isArray(entry?.hours) ? entry.hours : []
        normalizedDevices[did] = Array.from({ length: fhHours }, (_, idx) => Number(sourceHours[idx] || 0))
      })
    }

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
        defaults[id] = buildDeviceProfile(def, fhHours)
      })
      deviceData = defaults
    }

    setDeviceHours(deviceData)

    const normalizedAggregate = Array.isArray(savedHours)
      ? Array.from({ length: fhHours }, (_, idx) => Number(savedHours[idx] || 0))
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
  }, [sessionId, biddingEnabled])

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
      try {
  const { data } = await api.get(`/api/sessions/${sessionId}`)
        const gen = data.general || {}
        const round_span = Number(gen.round_span_hours || 6)
        const fh = Number(gen.forecast_horizon_hours || gen.horizon_hours || 24)
        const freeze = Number(gen.freeze_hours || 6)
        setCfg({
          general: {
            round_span_hours: round_span,
            forecast_horizon_hours: fh,
            freeze_hours: freeze,
            horizon_hours: Number(gen.horizon_hours || 24),
            fake_date: gen.fake_date || '',
            start_time: gen.start_time || '00:00'
          },
          market: data.market || {},
          current_round: Number(data.current_round || 1),
          scenario_name: data.scenario_name || 'Scenario',
          campaign_name: data.campaign_name || ''
        })
        // Check if bidding is enabled
        const bidding = Boolean((data.market || {}).enable_player_bidding)
        console.log('[Player] Market config:', data.market)
        console.log('[Player] enable_player_bidding:', bidding)
        setBiddingEnabled(bidding)
        setStatus(data.status || 'pending')
        setMode(data.mode || 'isolated_per_player')
        
        // Load full scenario data for briefing screen
        if (data.scenario_id) {
          try {
            const scenarioRes = await api.get(`/api/catalog/scenarios/${data.scenario_id}`)
            setScenario(scenarioRes.data)
          } catch (err) {
            console.error('Failed to load scenario:', err)
          }
        }
        
        // Initialize duration, but do NOT reset remaining time on reload; wait for server ticks or restore from storage
        try{
          const initial = Number((gen.round_duration_seconds || 300))
          const safe = isFinite(initial) ? initial : 300
          setInitialDuration(safe)
          // If joining fresh (no stored timer) and session is running, show full duration until first tick arrives
          if ((data.status || 'pending') === 'running'){
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
          setAllowedTypes(allowed)
          setSelectedType(sel)
          setPlayerTypes(pts)
          setScenarioDevices(devices)
          // load type devices from scenario config if selected
          let devs = []
          if(sel){
            const t = (pts||[]).find(x=> x.id===sel)
            devs = t?.devices || []
            console.log('Selected type:', sel, 'Found type:', t, 'Devices:', devs)
            setTypeDevices(devs)
            // initialize deviceHours if empty
            setDeviceHours(prev=>{
              const fh = Number(gen.forecast_horizon_hours||24)
              const next = { ...prev }
              devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
              return next
            })
            // initialize deviceBids if bidding enabled
            if (s.data?.market?.enable_player_bidding) {
              setDeviceBids(prev => {
                const next = { ...prev }
                devs.forEach(did => {
                  if (!next[did]) {
                    const deviceDef = devices.find(d => d.id === did)
                    const defaultPrices = getDefaultBidPrices(deviceDef)
                    const fh = Number(gen.forecast_horizon_hours||24)
                    next[did] = {
                      A: { price: defaultPrices.A, hours: Array.from({length: fh}, () => 0) },
                      B: { price: defaultPrices.B, hours: Array.from({length: fh}, () => 0) },
                      C: { price: defaultPrices.C, hours: Array.from({length: fh}, () => 0) }
                    }
                  }
                })
                return next
              })
            }
          } else if (allowed.length === 0 && devices.length > 0) {
            // Solo mode (no player types defined): use ALL scenario devices
            devs = devices.map(d => d.id)
            setTypeDevices(devs)
            setDeviceHours(prev=>{
              const fh = Number(gen.forecast_horizon_hours||24)
              const next = { ...prev }
              devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
              return next
            })
            // initialize deviceBids if bidding enabled
            if (s.data?.market?.enable_player_bidding) {
              setDeviceBids(prev => {
                const next = { ...prev }
                devs.forEach(did => {
                  if (!next[did]) {
                    const deviceDef = devices.find(d => d.id === did)
                    const defaultPrices = getDefaultBidPrices(deviceDef)
                    const fh = Number(gen.forecast_horizon_hours||24)
                    next[did] = {
                      A: { price: defaultPrices.A, hours: Array.from({length: fh}, () => 0) },
                      B: { price: defaultPrices.B, hours: Array.from({length: fh}, () => 0) },
                      C: { price: defaultPrices.C, hours: Array.from({length: fh}, () => 0) }
                    }
                  }
                })
                return next
              })
            }
          }
          if(allowed.length>0 && !sel){
            setTypeDialogOpen(true)
          }

        }catch(_){ /* ignore */ }
        
      } catch (error) {
        console.error('Failed to load session config:', error)
        showSnack('Failed to load session configuration', 'error')
      }
    }
    load()
  }, [sessionId, showSnack, seedForecastData])

  // Live market_cleared events and WebSocket
  const [live, setLive] = useState(null)
  const [series, setSeries] = useState([])
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  const localTimerRef = useRef(null)

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
        try{
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          setCfg(prev=> ({ 
            ...prev, 
            current_round: Number(data.current_round||prev.current_round), 
            scenario_name: data.scenario_name||prev.scenario_name,
            campaign_name: data.campaign_name||prev.campaign_name,
            general: {
              ...prev.general,
              fake_date: data.general?.fake_date || prev.general.fake_date,
              start_time: data.general?.start_time || prev.general.start_time
            }
          }))
          setStatus(data.status||prev.status)
        }catch(_){ }
      }
    })

    s.on('tick', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        const rem = Number(p.remaining)
        setTimeRemaining(rem)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem })) }catch(_){ }
      }
    })

    s.on('round_end', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(0)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0 })) }catch(_){ }
      }
    })

    s.on('market_cleared', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        setLive({ mcp: p.mcp, volume: p.volume, round: p.round })
        setSeries((prev) => [...prev, { r: p.round, mcp: p.mcp, volume: p.volume }])
      }
    })

    s.on('event_triggered', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        // Add new event to active events list
        const event = {
          id: p.event_id || `event-${Date.now()}`,
          type: p.type,
          name: p.name,
          description: p.description,
          multiplier: p.multiplier,
          additive: p.additive,
          duration_rounds: p.duration_rounds,
          target: p.target,
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
        setStatus('briefing')
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
      }
    })

    s.on('scenario_complete', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setStatus('scenario_complete')
        showSnack('Scenario completed! 🎉', 'success')
        try { triggerConfetti() } catch (_) {}
      }
    })

    // Mirror the same handlers on legacy socket for safety
    sLegacy.on('round_start', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(null); try{ sessionStorage.removeItem(`emsg_timer_${sessionId}`) }catch(_){ } } })
    sLegacy.on('tick', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { const rem = Number(p.remaining); setTimeRemaining(rem); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem })) }catch(_){ } } })
    sLegacy.on('round_end', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(0); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0 })) }catch(_){ } } })
    sLegacy.on('market_cleared', (p)=>{
      if (p && Number(p.session_id)===Number(sessionId)){
        setLive({ mcp: p.mcp, volume: p.volume, round: p.round })
        setSeries(prev=> [...prev, { r:p.round, mcp:p.mcp, volume:p.volume }])
      }
    })
    sLegacy.on('event_triggered', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)){
      const event = { id: p.event_id||`event-${Date.now()}`, type:p.type, name:p.name, description:p.description, multiplier:p.multiplier, additive:p.additive, duration_rounds:p.duration_rounds, target:p.target, round:p.round }
      setActiveEvents(prev=> prev.some(e=>e.id===event.id)? prev : [...prev, event])
    }})
    sLegacy.on('trainer_message', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)) showSnack(`Trainer: ${p.message}`, 'info') })

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

  // Restore remaining time from storage on reload to avoid reset
  useEffect(()=>{
    if (!sessionId) return
    try{
      const raw = sessionStorage.getItem(`emsg_timer_${sessionId}`)
      if (raw){
        const { t, rem } = JSON.parse(raw)
        if (typeof rem === 'number' && typeof t === 'number'){
          const dt = Math.max(0, (Date.now() - t) / 1000)
          const est = Math.max(0, Math.round(rem - dt))
          setTimeRemaining(est)
        }
      }
    }catch(_){ }
  }, [sessionId])

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
        const fallback = buildDeviceProfile(def, fh)
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
            const varCost = Number(def?.variable_cost_zar_per_mwh || def?.cost_per_mwh_zar || def?.marginal_cost || 400)
            const deviceHoursFallback = buildDeviceProfile(def, fh)
            
            // Initialize 3 bids with default prices and quantity tranches
            next[did] = {
              A: { 
                price: Math.round(varCost * 1.0), 
                hours: deviceHoursFallback.map(h => Math.round(h * 0.5 * 100) / 100) // 50% in Bid A
              },
              B: { 
                price: Math.round(varCost * 1.25), 
                hours: deviceHoursFallback.map(h => Math.round(h * 0.3 * 100) / 100) // 30% in Bid B
              },
              C: { 
                price: Math.round(varCost * 1.5), 
                hours: deviceHoursFallback.map(h => Math.round(h * 0.2 * 100) / 100) // 20% in Bid C
              }
            }
          }
        })
        return needsInit ? next : prev
      })
    }
  }, [selectedType, typeDevices, cfg.general.forecast_horizon_hours, scenarioDevices, biddingEnabled])

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
  }, [sessionId, cfg.general, allowedTypes.length, selectedType, typeDevices, scenarioDevices, seedForecastData])

  // D3 Charts
  useEffect(() => {
    if (series.length === 0) return
    // create or reuse a floating tooltip div for charts
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip
      .style('position','absolute')
      .style('pointer-events','none')
      .style('background','#111')
      .style('color','#fff')
      .style('padding','4px 8px')
      .style('border-radius','4px')
      .style('font-size','12px')
      .style('display','none')
      .style('z-index','9999')

    // Draw MCP chart
    if (mcpRef.current) {
      const svg = d3.select(mcpRef.current)
      svg.selectAll('*').remove()
  const M = { top: 10, right: 10, bottom: 34, left: 46 }
      const W = 360 - M.left - M.right
      const H = 120 - M.top - M.bottom
      const g = svg
        .attr('width', 360)
        .attr('height', 120)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, d3.max(series, (d) => d.r) || 1]).range([0, W])
      const y = d3.scaleLinear().domain([d3.min(series, (d) => d.mcp) || 0, d3.max(series, (d) => d.mcp) || 1]).nice().range([H, 0])
  const line = d3.line().x((d) => x(d.r)).y((d) => y(d.mcp))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(series).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2).attr('d', line)
      g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(series.length))
      g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      g.selectAll('circle.point')
        .data(series)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', d=> x(d.r))
        .attr('cy', d=> y(d.mcp))
        .attr('r', 3)
  .attr('fill', '#2e7d32')
  .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`R${d.r}: ${d.mcp} ZAR/MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('MCP (ZAR/MWh)')
    }

    // Draw Volume chart
    if (volRef.current) {
      const svg = d3.select(volRef.current)
      svg.selectAll('*').remove()
  const M = { top: 10, right: 10, bottom: 34, left: 46 }
      const W = 360 - M.left - M.right
      const H = 120 - M.top - M.bottom
      const g = svg
        .attr('width', 360)
        .attr('height', 120)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, d3.max(series, (d) => d.r) || 1]).range([0, W])
      const y = d3.scaleLinear().domain([0, d3.max(series, (d) => d.volume) || 1]).nice().range([H, 0])
  const line = d3.line().x((d) => x(d.r)).y((d) => y(d.volume))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(series).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)
      g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(series.length))
      g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      g.selectAll('circle.point')
        .data(series)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', d=> x(d.r))
        .attr('cy', d=> y(d.volume))
        .attr('r', 3)
  .attr('fill', '#1976d2')
  .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`R${d.r}: ${d.volume} MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
    return ()=> { try { tooltip.remove() } catch(_){} }
  }, [series])

  // Calculate locked hours and validation
  const lockedUntil = useMemo(() => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const freeze = Number(cfg.general.freeze_hours || 6)
    return Math.min(Number(cfg.general.forecast_horizon_hours || 24), (r - 1) * span + freeze)
  }, [cfg])
  // Freeze override for round 1: allow editing even if freeze covers first round
  const effectiveLockedUntil = useMemo(()=> (Number(cfg.current_round||1) === 1 ? 0 : lockedUntil), [cfg, lockedUntil])

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
          
          // Split new total proportionally across bids A/B/C
          const currentA = bidsForDevice.A?.hours?.[i] || 0
          const currentB = bidsForDevice.B?.hours?.[i] || 0
          const currentC = bidsForDevice.C?.hours?.[i] || 0
          const currentTotal = currentA + currentB + currentC
          
          let newA, newB, newC
          if (currentTotal > 0) {
            // Maintain proportions
            const ratioA = currentA / currentTotal
            const ratioB = currentB / currentTotal
            const ratioC = currentC / currentTotal
            newA = Math.round(newTotal * ratioA * 100) / 100
            newB = Math.round(newTotal * ratioB * 100) / 100
            newC = Math.round(newTotal * ratioC * 100) / 100
          } else {
            // Default split: 50/30/20
            newA = Math.round(newTotal * 0.5 * 100) / 100
            newB = Math.round(newTotal * 0.3 * 100) / 100
            newC = Math.round(newTotal * 0.2 * 100) / 100
          }
          
          const nextBids = { ...prevBids }
          nextBids[did] = {
            A: { ...bidsForDevice.A, hours: [...(bidsForDevice.A?.hours || [])].map((h, idx) => idx === i ? newA : h) },
            B: { ...bidsForDevice.B, hours: [...(bidsForDevice.B?.hours || [])].map((h, idx) => idx === i ? newB : h) },
            C: { ...bidsForDevice.C, hours: [...(bidsForDevice.C?.hours || [])].map((h, idx) => idx === i ? newC : h) }
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
      const totalAtHour = (updated[did].A?.hours?.[hourIdx] || 0) + 
                          (updated[did].B?.hours?.[hourIdx] || 0) + 
                          (updated[did].C?.hours?.[hourIdx] || 0)
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

  const saveFull = async () => {
    try {
      const payload = { session_id: Number(sessionId), hours }
      if(allowedTypes.length>0 && selectedType && typeDevices.length>0){
        payload.devices = typeDevices.map(did=> ({ device_id: did, hours: deviceHours[did] || [] }))
      }
      // Add bids if bidding is enabled
      if (biddingEnabled && Object.keys(deviceBids).length > 0) {
        payload.bids = deviceBids
      }
      await api.post('/api/player/forecast/full', payload)
      showSnack('Full forecast saved', 'success')
    } catch (e) {
      showSnack(e?.response?.data?.message || 'Save failed', 'error')
    }
  }

  const submitCurrent = async () => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const start = (r - 1) * span
    const slice = hours.slice(start, start + span)
    try {
      const payload = { session_id: Number(sessionId), round_num: r, hours: slice }
      if(allowedTypes.length>0 && selectedType && typeDevices.length>0){
        payload.devices = typeDevices.map(did=> ({ device_id: did, hours: (deviceHours[did]||[]).slice(start, start+span) }))
      }
      // Add bids if bidding is enabled (send full bid hours, not sliced)
      if (biddingEnabled && Object.keys(deviceBids).length > 0) {
        payload.bids = deviceBids
      }
      await api.post('/api/player/forecast', payload)
      showSnack(`Round ${r} submitted successfully!`, 'success')
      triggerConfetti()
      setSubmitted(true)
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Submit failed'
      const details = e?.response?.data?.details
      showSnack(details ? `${msg}: ${Array.isArray(details)? details[0] : details}` : msg, 'error')
    }
  }

  const handleDismissEvent = (eventId) => {
    setDismissedEvents((prev) => new Set([...prev, eventId]))
  }

  // Filter out dismissed events
  const visibleEvents = activeEvents.filter(e => !dismissedEvents.has(e.id))

  const isEditable = (status === 'running' || status === 'round_active') && sessionId
  const span = Number(cfg.general.round_span_hours || 6)
  const cur = Number(cfg.current_round || 1)
  const startIdx = (cur - 1) * span
  const endIdx = startIdx + span
  const editableIdx = new Set(
    Array.from({ length: span }, (_, k) => startIdx + k).filter((i) => i >= effectiveLockedUntil && i < hours.length)
  )

  const isValid = useMemo(() => {
    return Array.from(editableIdx).every((i) => Number.isFinite(Number(hours[i])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, effectiveLockedUntil, cfg])

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

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Briefing Screen */}
      {status === 'briefing' && scenario && (
        <BriefingScreen 
          session={{ id: sessionId, mode }}
          scenario={scenario}
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

      {/* Round Results Screen */}
      {status === 'round_results' && (
        <RoundResultsScreen 
          sessionId={sessionId}
          round={cfg.current_round}
          mode={mode}
          onAdvance={async () => {
            try {
              const { data } = await api.get(`/api/sessions/${sessionId}`)
              setStatus(data.status || 'running')
              setCfg(prev => ({
                ...prev,
                current_round: data.current_round || prev.current_round,
                scenario_name: data.scenario_name || prev.scenario_name,
                campaign_name: data.campaign_name || prev.campaign_name,
              }))
            } catch (_) {}
          }}
        />
      )}

      {/* Scenario Complete Screen */}
      {status === 'scenario_complete' && (
        <ScenarioResultsScreen 
          sessionId={sessionId}
          onHome={() => navigate('/home')}
        />
      )}

      {/* Main Game Interface - only show when in active round */}
      {(status === 'running' || status === 'round_active') && (
      <>
      <Dialog open={typeDialogOpen} onClose={()=> setTypeDialogOpen(false)}>
        <DialogTitle>Select your player type</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt:1 }}>
            {allowedTypes.map(t=> {
              const typeInfo = playerTypes.find(pt=> pt.id === t.type_id)
              const typeName = typeInfo?.name || t.type_id
              return (
                <Stack key={t.type_id} direction="row" spacing={2} alignItems="center">
                  <Button variant={selectedType===t.type_id? 'contained':'outlined'} onClick={()=> setSelectedType(t.type_id)} disabled={t.remaining===0} sx={{ minWidth: 160, justifyContent: 'flex-start' }}>{typeName}</Button>
                  <Typography variant="caption" color="text.secondary">{t.remaining==null? 'unlimited' : `${t.remaining} slots left`}</Typography>
                </Stack>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setTypeDialogOpen(false)}>Close</Button>
          <Button variant="contained" disabled={!selectedType} onClick={async()=>{
            try{
              await api.post(`/api/sessions/${sessionId}/select-type`, { type_id: selectedType })
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
            }catch(e){
              showSnack(e?.response?.data?.error || 'Selection failed', 'error')
            }
          }}>Select</Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4">
          {cfg.campaign_name || 'Active Campaign'}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          {cfg.scenario_name ? `Scenario: ${cfg.scenario_name}` : 'Scenario'} • Round {cfg.current_round}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Button size="small" startIcon={<BriefingIcon />} onClick={()=> navigate(`/briefing/${sessionId}`)}>
          Briefing
        </Button>
        <Tooltip arrow title={
          (allowedTypes.length > 0)
            ? 'Shared Market: All players trade in the same market. Your decisions affect market prices and other players.' 
            : 'Solo Mode: You have your own private market. Your decisions only affect your own results.'
        }>
          <Chip 
            label={(allowedTypes.length > 0) ? 'Shared Market' : 'Solo'}
            size="small"
            color={(allowedTypes.length > 0) ? 'primary' : 'default'}
            variant="outlined"
          />
        </Tooltip>
        {selectedType && (
          <Tooltip arrow title={(() => {
            const typeInfo = playerTypes.find(pt=> pt.id === selectedType)
            if (!typeInfo) return selectedType
            const devices = typeDevices.map(did => {
              const dev = scenarioDevices.find(d => d.id === did)
              return dev ? `${dev.name || `${dev.id} (no device name)`} (${dev.type})` : did
            }).join(', ')
            return `${typeInfo.name} • Devices: ${devices || 'none'}`
          })()}>
            <Chip 
              label={playerTypes.find(pt=> pt.id === selectedType)?.name || selectedType} 
              size="small" 
              color="secondary"
            />
          </Tooltip>
        )}
        <Box sx={{ flexGrow: 1 }} />
      </Stack>

      {/* Event Notifications */}
      <EventNotification 
        events={visibleEvents}
        onDismiss={handleDismissEvent}
      />

      <Grid container spacing={3}>
        {/* Left: Timer and KPIs */}
        <Grid item xs={12} md={4}>
          <ScenarioClock 
            fakeDate={cfg.general.fake_date} 
            startTime={cfg.general.start_time} 
            currentRound={cfg.current_round}
            roundSpan={cfg.general.round_span_hours}
          />
          {timeRemaining !== null && <CountdownTimer timeRemaining={timeRemaining} />}

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Session Info
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Campaign
                </Typography>
                <Typography variant="body2">{cfg.campaign_name || '—'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Scenario
                </Typography>
                <Typography variant="body2">{cfg.scenario_name || '—'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Chip label={status} color={(status === 'running' || status === 'round_active') ? 'success' : 'default'} size="small" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Round
                </Typography>
                <Typography variant="body2">{cfg.current_round}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Forecast Horizon
                </Typography>
                <Typography variant="body2">{cfg.general.forecast_horizon_hours}h</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Locked until
                </Typography>
                <Typography variant="body2">h{lockedUntil}</Typography>
              </Box>
              {timeRemaining !== null && initialDuration && initialDuration>0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Round progress</Typography>
                  <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, Math.round(((initialDuration - timeRemaining) * 100) / initialDuration)))} />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Live KPIs Placeholder */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Live KPIs</Typography>
                <Tooltip
                  title={
                    'Market results update after each round.\n\nMCP (Market Clearing Price): The price in ZAR/MWh where supply meets demand.\n\nVolume: Total energy traded in MWh during the round.\n\nThe charts below show the trend across all rounds.'
                  }
                  placement="left"
                >
                  <IconButton size="small" aria-label="Live KPIs info">
                    <InfoOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              {live ? (
                        <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">MCP (Round {live.round})</Typography>
                    <Chip size="small" color="primary" label={`${live.mcp} ZAR/MWh`} />
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Volume</Typography>
                    <Chip size="small" color="secondary" label={`${live.volume} MWh`} />
                  </Stack>
                  {/* MCP History for bidding */}
                  {biddingEnabled && series.length > 0 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #e0e0e0' }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          MCP History (last 5 rounds):
                        </Typography>
                        <Tooltip 
                          arrow 
                          title="Use past MCPs to inform your bid prices. Bid below expected MCP to ensure dispatch, but avoid bidding too low to maximize profit."
                          placement="right"
                        >
                          <InfoOutlined sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
                        </Tooltip>
                      </Stack>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {series.slice(-5).map(s => (
                          <Chip 
                            key={s.r}
                            label={`R${s.r}: ${s.mcp}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '10px', height: 20 }}
                          />
                        ))}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                        Avg: {series.length > 0 ? Math.round(series.reduce((sum, s) => sum + s.mcp, 0) / series.length) : 0} ZAR/MWh
                      </Typography>
                    </Box>
                  )}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Waiting for market data... Results appear after each round.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* My Devices */}
          {((selectedType && typeDevices.length>0) || (Array.isArray(scenarioDevices)&&scenarioDevices.length>0)) && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>My Devices</Typography>
                <Stack spacing={1}>
                  {(selectedType ? typeDevices.map(did=> scenarioDevices.find(d=> d.id===did)).filter(Boolean) : scenarioDevices).map((dev)=>{
                    const t = (dev.type||'').toLowerCase()
                    const specs = []
                    if (t.includes('load')){
                      if (dev.baseline_load_mw!=null) specs.push(`Baseline ${dev.baseline_load_mw} MW`)
                      if (dev.peak_load_mw!=null) specs.push(`Peak ${dev.peak_load_mw} MW`)
                    } else if (t==='battery'){
                      if (dev.power_rating_mw!=null) specs.push(`Power ${dev.power_rating_mw} MW`)
                      if (dev.capacity_mwh!=null || dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mwh||dev.capacity_mw} MWh`)
                      if (dev.efficiency_pct!=null) specs.push(`Eff. ${dev.efficiency_pct}%`)
                    } else {
                      if (dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mw} MW`)
                      if (dev.cost_per_mwh_zar!=null) specs.push(`Cost ${dev.cost_per_mwh_zar} ZAR/MWh`)
                    }
                            return (
                              <Stack key={dev.id} direction="row" spacing={1} justifyContent="space-between">
                                <Typography variant="body2">{dev.name ? dev.name : `${dev.id} (no device name)`} ({dev.type})</Typography>
                                <Typography variant="body2" color="text.secondary">{specs.join(' • ')}</Typography>
                              </Stack>
                            )
                  })}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right: Forecast Editor */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>

            {(timeRemaining === 0 || submitted) && (
              <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                {submitted ? 'Forecast submitted. Waiting for round results...' : 'Time is up! You can no longer submit this round.'}
              </Alert>
            )}
            {(allowedTypes.length>0 && !selectedType) && (
              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                Please select your player type to continue.
              </Alert>
            )}

            {(allowedTypes.length === 0 || (selectedType && typeDevices.length>0)) ? (
              allowedTypes.length > 0 ? (
                <Stack spacing={3} sx={{ mt:2 }}>
                  <Alert severity="info">
                    Enter your hourly forecast for each device. Locked hours (before freeze) cannot be changed.
                  </Alert>
                  {typeDevices.map(did=> {
                  const deviceDef = scenarioDevices.find(d=> d.id === did)
                  const deviceType = deviceDef?.type || 'unknown'
                  const deviceParams = deviceDef || {}
                  const deviceMax = getDeviceMaxCapability(deviceParams)
                  const fhLocal = Number(cfg.general.forecast_horizon_hours||24)
                  const series = (Array.isArray(deviceHours[did]) && deviceHours[did].length===fhLocal)
                    ? deviceHours[did]
                    : Array.from({length: fhLocal}, ()=> 0)
                  const view = (deviceView[did] || 'chart')
                  return (
                    <Card key={did} variant="outlined">
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                          <Box sx={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: 1, 
                            bgcolor: deviceType === 'solar' ? '#ffa726' : deviceType === 'wind' ? '#42a5f5' : deviceType === 'gas' ? '#ef5350' : deviceType === 'storage' ? '#66bb6a' : '#9e9e9e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '20px'
                          }}>
                            {deviceType === 'solar' ? '☀' : deviceType === 'wind' ? '🌀' : deviceType === 'gas' ? '🔥' : deviceType === 'storage' ? '🔋' : '⚡'}
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6">{deviceDef?.name || `${did} (no device name)`}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {(() => {
                                const t = (deviceType||'').toLowerCase()
                                if (t.includes('load')) {
                                  const base = deviceParams.baseline_load_mw != null ? `Baseline: ${deviceParams.baseline_load_mw} MW` : null
                                  const peak = deviceParams.peak_load_mw != null ? `Peak: ${deviceParams.peak_load_mw} MW` : null
                                  return [`Type: ${deviceType}`, base, peak].filter(Boolean).join(' • ')
                                } else {
                                  const cap = deviceParams.capacity_mw != null ? `Capacity: ${deviceParams.capacity_mw} MW` : null
                                  const cost = (deviceParams.cost_per_mwh_zar != null ? `Cost: ${deviceParams.cost_per_mwh_zar} ZAR/MWh` : (deviceParams.marginal_cost != null ? `Cost: ${deviceParams.marginal_cost} ZAR/MWh` : null))
                                  return [`Type: ${deviceType}`, cap, cost].filter(Boolean).join(' • ')
                                }
                              })()}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            {view === 'chart' ? (
                              <Button size="small" startIcon={<ViewList fontSize="small" />} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'fields'}))}>Fields</Button>
                            ) : (
                              <Button size="small" startIcon={<BarChart fontSize="small" />} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'chart'}))}>Chart</Button>
                            )}
                          </Stack>
                        </Stack>
                        
                        {/* Multi-Bid Price Inputs */}
                        {(() => {
                          console.log(`[Player] Render check for device ${did}:`, {
                            biddingEnabled,
                            deviceBidsExists: !!deviceBids[did],
                            deviceBids: deviceBids[did]
                          });
                          return null;
                        })()}
                        {biddingEnabled && deviceBids[did] && (
                          <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1.5 }}>
                              Multi-Bid Pricing
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                              Set three different price levels and quantity curves. Lower prices dispatch first. All dispatched MWh receive the Market Clearing Price (MCP).
                            </Typography>
                            
                            {/* Price Inputs */}
                            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                              <Box sx={{ flex: 1, opacity: activeLot === 'A' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('A')}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                  <Chip label="A" size="small" sx={{ bgcolor: activeLot === 'A' ? '#ffd54f' : '#64b5f6', color: activeLot === 'A' ? '#000' : 'white', fontWeight: 'bold', minWidth: 32, boxShadow: activeLot === 'A' ? '0 0 10px #ffd54f' : 'none' }} />
                                  <Typography variant="caption" color="text.secondary">Baseload</Typography>
                                </Stack>
                                <TextField
                                  label="Price"
                                  type="number"
                                  size="small"
                                  fullWidth
                                  value={deviceBids[did].A?.price || 0}
                                  onChange={(e) => {
                                    const newPrice = Number(e.target.value)
                                    setDeviceBids(prev => ({
                                      ...prev,
                                      [did]: {
                                        ...prev[did],
                                        A: { ...prev[did].A, price: newPrice }
                                      }
                                    }))
                                  }}
                                  onFocus={() => setActiveLot('A')}
                                  InputProps={{
                                    endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>
                                  }}
                                  sx={{ '& .MuiOutlinedInput-root': { borderColor: activeLot === 'A' ? '#ffd54f' : undefined, borderWidth: activeLot === 'A' ? 2 : 1 } }}
                                />
                              </Box>
                              <Box sx={{ flex: 1, opacity: activeLot === 'B' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('B')}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                  <Chip label="B" size="small" sx={{ bgcolor: activeLot === 'B' ? '#ffd54f' : '#2196f3', color: activeLot === 'B' ? '#000' : 'white', fontWeight: 'bold', minWidth: 32, boxShadow: activeLot === 'B' ? '0 0 10px #ffd54f' : 'none' }} />
                                  <Typography variant="caption" color="text.secondary">Mid-merit</Typography>
                                </Stack>
                                <TextField
                                  label="Price"
                                  type="number"
                                  size="small"
                                  fullWidth
                                  value={deviceBids[did].B?.price || 0}
                                  onChange={(e) => {
                                    const newPrice = Number(e.target.value)
                                    setDeviceBids(prev => ({
                                      ...prev,
                                      [did]: {
                                        ...prev[did],
                                        B: { ...prev[did].B, price: newPrice }
                                      }
                                    }))
                                  }}
                                  onFocus={() => setActiveLot('B')}
                                  InputProps={{
                                    endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>
                                  }}
                                  sx={{ '& .MuiOutlinedInput-root': { borderColor: activeLot === 'B' ? '#ffd54f' : undefined, borderWidth: activeLot === 'B' ? 2 : 1 } }}
                                />
                              </Box>
                              <Box sx={{ flex: 1, opacity: activeLot === 'C' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('C')}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                  <Chip label="C" size="small" sx={{ bgcolor: activeLot === 'C' ? '#ffd54f' : '#1565c0', color: activeLot === 'C' ? '#000' : 'white', fontWeight: 'bold', minWidth: 32, boxShadow: activeLot === 'C' ? '0 0 10px #ffd54f' : 'none' }} />
                                  <Typography variant="caption" color="text.secondary">Peak</Typography>
                                </Stack>
                                <TextField
                                  label="Price"
                                  type="number"
                                  size="small"
                                  fullWidth
                                  value={deviceBids[did].C?.price || 0}
                                  onChange={(e) => {
                                    const newPrice = Number(e.target.value)
                                    setDeviceBids(prev => ({
                                      ...prev,
                                      [did]: {
                                        ...prev[did],
                                        C: { ...prev[did].C, price: newPrice }
                                      }
                                    }))
                                  }}
                                  onFocus={() => setActiveLot('C')}
                                  InputProps={{
                                    endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>
                                  }}
                                  sx={{ '& .MuiOutlinedInput-root': { borderColor: activeLot === 'C' ? '#ffd54f' : undefined, borderWidth: activeLot === 'C' ? 2 : 1 } }}
                                />
                              </Box>
                            </Stack>
                          </Box>
                        )}
                        
                        {view === 'chart' && (
                          <Box sx={{ mb: 2 }}>
                            {biddingEnabled && deviceBids[did] && (
                              <>
                                <Box sx={{ mb: 3 }}>
                                  <StackedLotsChart
                                    bidsA={deviceBids[did].A?.hours || []}
                                    bidsB={deviceBids[did].B?.hours || []}
                                    bidsC={deviceBids[did].C?.hours || []}
                                    maxValue={deviceMax}
                                    currentRound={Number(cfg.current_round || 1)}
                                    roundSpan={Number(cfg.general.round_span_hours || 6)}
                                    lockedUntil={effectiveLockedUntil}
                                    activeLot={activeLot}
                                    onLotChange={setActiveLot}
                                    deviceParams={deviceParams}
                                  />
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    Edit Lot {activeLot}
                                  </Typography>
                                  <ForecastChartEditor 
                                    hours={deviceBids[did][activeLot]?.hours || []} 
                                    lockedUntil={effectiveLockedUntil} 
                                    onChange={(i, val) => onBidQuantityChange(did, activeLot, i, val)} 
                                    maxValue={deviceMax} 
                                    smoothRadius={3}
                                    currentRound={Number(cfg.current_round || 1)}
                                    roundSpan={Number(cfg.general.round_span_hours || 6)}
                                    freezeHours={Number(cfg.general.freeze_hours || 6)}
                                    startTime={cfg.general.start_time || '00:00'}
                                    deviceType={deviceType}
                                    deviceParams={deviceParams}
                                  />
                                  <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                    <Button
                                      size="small"
                                      variant={activeLot === 'A' ? 'contained' : 'outlined'}
                                      onClick={() => setActiveLot('A')}
                                      sx={{ bgcolor: activeLot === 'A' ? '#ffd54f' : 'transparent', color: activeLot === 'A' ? '#000' : '#64b5f6', '&:hover': { bgcolor: activeLot === 'A' ? '#ffca28' : '#e3f2fd' } }}
                                    >
                                      Lot A
                                    </Button>
                                    <Button
                                      size="small"
                                      variant={activeLot === 'B' ? 'contained' : 'outlined'}
                                      onClick={() => setActiveLot('B')}
                                      sx={{ bgcolor: activeLot === 'B' ? '#ffd54f' : 'transparent', color: activeLot === 'B' ? '#000' : '#2196f3', '&:hover': { bgcolor: activeLot === 'B' ? '#ffca28' : '#e3f2fd' } }}
                                    >
                                      Lot B
                                    </Button>
                                    <Button
                                      size="small"
                                      variant={activeLot === 'C' ? 'contained' : 'outlined'}
                                      onClick={() => setActiveLot('C')}
                                      sx={{ bgcolor: activeLot === 'C' ? '#ffd54f' : 'transparent', color: activeLot === 'C' ? '#000' : '#1565c0', '&:hover': { bgcolor: activeLot === 'C' ? '#ffca28' : '#e3f2fd' } }}
                                    >
                                      Lot C
                                    </Button>
                                  </Stack>
                                </Box>
                              </>
                            )}
                            {!biddingEnabled && (
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                  Device Forecast
                                </Typography>
                                <ForecastChartEditor 
                                  hours={series} 
                                  lockedUntil={effectiveLockedUntil} 
                                  onChange={(i, val)=> onDeviceChange(did, i, val)} 
                                  maxValue={deviceMax} 
                                  smoothRadius={3}
                                  currentRound={Number(cfg.current_round || 1)}
                                  roundSpan={Number(cfg.general.round_span_hours || 6)}
                                  freezeHours={Number(cfg.general.freeze_hours || 6)}
                                  startTime={cfg.general.start_time || '00:00'}
                                  deviceType={deviceType}
                                  deviceParams={deviceParams}
                                />
                              </Box>
                            )}
                          </Box>
                        )}
                        {view === 'fields' && (
                          <Box sx={{ mt: 1 }}>
                            {biddingEnabled && deviceBids[did] && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                                Currently editing: <strong>Lot {activeLot}</strong> (Click a price field above to switch lots)
                              </Typography>
                            )}
                            {(() => {
                              const series = biddingEnabled && deviceBids[did] ? (deviceBids[did][activeLot]?.hours || []) : (deviceHours[did] || [])
                              const freeze = Number(cfg.general.freeze_hours || 6)
                              const lockedEnd = freeze
                              const todayEnd = 24
                              
                              const groups = [
                                { 
                                  label: 'Locked Hours', 
                                  start: 0, 
                                  end: lockedEnd, 
                                  color: '#ff9800', 
                                  hint: 'These hours are locked after Round 1. Simulates the Intraday Market (IDM) gate closure - the point where even short-term Intraday trading closes before delivery.' 
                                },
                                { 
                                  label: 'Today (Editable)', 
                                  start: lockedEnd, 
                                  end: todayEnd, 
                                  color: '#2196f3', 
                                  hint: 'Hours for today\'s simulation. Always editable. This represents the main trading window.' 
                                },
                                { 
                                  label: 'Tomorrow (Editable)', 
                                  start: todayEnd, 
                                  end: series.length, 
                                  color: '#9c27b0', 
                                  hint: 'Forward planning for the next day. Always editable.' 
                                }
                              ].filter(g => g.start < g.end && g.start < series.length)
                              
                              return (
                                <Stack spacing={3}>
                                  {groups.map((group) => {
                                    const groupHours = []
                                    for (let i = group.start; i < Math.min(group.end, series.length); i++) {
                                      groupHours.push(i)
                                    }
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
                                                const disabled = i < effectiveLockedUntil || timeRemaining === 0
                                                const v = series[i]
                                                return (
                                                  <Grid item xs={6} sm={3} md={3} key={i}>
                                                    <Tooltip arrow title={`Hour h${i + 1}: ${disabled ? 'Locked (freeze)' : 'Editable'}`}>
                                                      <TextField
                                                        label={`h${i + 1}`}
                                                        value={v}
                                                        onChange={(e) => {
                                                          if (biddingEnabled && deviceBids[did]) {
                                                            onBidQuantityChange(did, activeLot, i, e.target.value)
                                                          } else {
                                                            onDeviceChange(did, i, e.target.value)
                                                          }
                                                        }}
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
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
              ) : (
                <>
                  <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                    Enter your hourly energy forecast (in MWh). Use the chart editor to drag points or switch to fields for precise values. Locked hours cannot be changed.
                  </Alert>
                {/* Unified editor header with toggle */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">
                    {useChartEditor ? 'Chart Editor (drag points to edit)' : 'Fields Editor'}
                  </Typography>
                  {useChartEditor ? (
                    <Button size="small" startIcon={<ViewList fontSize="small" />} onClick={()=> setUseChartEditor(false)}>Switch to fields</Button>
                  ) : (
                    <Button size="small" startIcon={<BarChart fontSize="small" />} onClick={()=> setUseChartEditor(true)}>Switch to chart</Button>
                  )}
                </Stack>
                {useChartEditor ? (
                  <Box sx={{ mb: 2 }}>
                    <ForecastChartEditor 
                      hours={hours} 
                      lockedUntil={effectiveLockedUntil} 
                      onChange={(i, val)=> onChange(i, val)} 
                      maxValue={aggregateMax}
                      smoothRadius={3}
                      currentRound={Number(cfg.current_round || 1)}
                      roundSpan={Number(cfg.general.round_span_hours || 6)}
                      freezeHours={Number(cfg.general.freeze_hours || 6)}
                      startTime={cfg.general.start_time || '00:00'}
                    />
                  </Box>
                ) : (
                  <Box sx={{ mt: 2 }}>
                    {(() => {
                      const freeze = Number(cfg.general.freeze_hours || 6)
                      const lockedEnd = freeze
                      const todayEnd = 24
                      
                      const groups = [
                        { 
                          label: 'Locked Hours', 
                          start: 0, 
                          end: lockedEnd, 
                          color: '#ff9800', 
                          hint: 'These hours are locked after Round 1. Simulates the Intraday Market (IDM) gate closure - the point where even short-term Intraday trading closes before delivery.' 
                        },
                        { 
                          label: 'Today (Editable)', 
                          start: lockedEnd, 
                          end: todayEnd, 
                          color: '#2196f3', 
                          hint: 'Hours for today\'s simulation. Always editable. This represents the main trading window.' 
                        },
                        { 
                          label: 'Tomorrow (Editable)', 
                          start: todayEnd, 
                          end: hours.length, 
                          color: '#9c27b0', 
                          hint: 'Forward planning for the next day. Always editable.' 
                        }
                      ].filter(g => g.start < g.end && g.start < hours.length)
                      
                      return (
                        <Stack spacing={3}>
                          {groups.map((group) => {
                            const groupHours = []
                            for (let i = group.start; i < Math.min(group.end, hours.length); i++) {
                              groupHours.push(i)
                            }
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
                                        const disabled = i < effectiveLockedUntil || timeRemaining === 0
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
              </>
            )
          ) : null}

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Tooltip arrow title="Saves all hourly values for the full forecast horizon without submitting the current round.">
                <span>
                  <Button variant="outlined" onClick={saveFull} disabled={!sessionId || (allowedTypes.length>0 && !selectedType)}>
                    Save Full Forecast
                  </Button>
                </span>
              </Tooltip>
              <Tooltip arrow title={`Submits only the hours of the current round (R${cfg.current_round}).`}>
                <span>
                  <Button variant="contained" onClick={submitCurrent} disabled={!isEditable || !isValid || timeRemaining === 0 || (allowedTypes.length>0 && !selectedType)}>
                    Submit Current Round
                  </Button>
                </span>
              </Tooltip>
            </Stack>

            {/* Charts */}
            {series.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 4, mb: 1 }}>MCP over rounds</Typography>
                <svg ref={mcpRef} width={360} height={120} style={{ border: '1px solid #eee' }} />

                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Volume over rounds</Typography>
                <svg ref={volRef} width={360} height={120} style={{ border: '1px solid #eee' }} />
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
      </>
      )}
    </Container>
  );
}