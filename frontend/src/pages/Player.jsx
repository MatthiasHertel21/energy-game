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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import { BarChart, ViewList, InfoOutlined, MenuBook as BriefingIcon } from '@mui/icons-material'
import { IconButton } from '@mui/material'
import InfoLabel from '../components/InfoLabel'
import ForecastChartEditor from '../components/ForecastChartEditor'
import MarketPhaseTimeline from '../components/MarketPhaseTimeline'
import MarketPhaseLegend from '../components/MarketPhaseLegend'
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

// Market Supply/Demand Curves Component
function MarketCurves({ sessionId, currentRound, roundSpanHours = 6 }) {
  const ref = useRef(null)
  const [marketData, setMarketData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    if (!sessionId || !currentRound) {
      setLoading(false)
      return
    }
    
    // Calculate the starting hour of this round
    // Round 1 starts at hour 0, Round 2 starts at hour roundSpanHours, etc.
    const roundStartHour = (currentRound - 1) * roundSpanHours
    
    // Load market structure for the first hour of the round (round start)
    const loadMarketStructure = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`/api/player/market-structure/${sessionId}/${currentRound}/${roundStartHour}`)
        setMarketData(data)
      } catch (err) {
        console.error('[MarketCurves] Failed to load market structure:', err)
        setError('Failed to load market structure')
      } finally {
        setLoading(false)
      }
    }
    
    loadMarketStructure()
  }, [sessionId, currentRound, roundSpanHours])
  
  useEffect(() => {
    if (!marketData || !ref.current) return
    
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    
    const M = { top: 16, right: 16, bottom: 32, left: 52 }
    const W = 320 - M.left - M.right
    const H = 180 - M.top - M.bottom
    const g = svg.attr('width', 320).attr('height', 180).append('g').attr('transform', `translate(${M.left},${M.top})`)

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
    const allPrices = [...supply.map(d => d.price), ...demand.map(d => d.price)]
    const minP = d3.min(allPrices)
    const maxP = d3.max(allPrices)
    const pad = (maxP - minP) * 0.05
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // Axes
    g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(4))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    g.append('text').attr('x', W / 2).attr('y', H + 28).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 9).text('Volume (MWh)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', -40).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 9).text('Price (ZAR/MWh)')

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

    g.append('path').attr('d', d3.line()(sPts)).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2)
    g.append('path').attr('d', d3.line()(dPts)).attr('fill', 'none').attr('stroke', '#c62828').attr('stroke-width', 2)

    // SMP line
    if (smp > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', W)
        .attr('y1', y(smp))
        .attr('y2', y(smp))
        .attr('stroke', '#1976d2')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2')
      
      g.append('text')
        .attr('x', W - 5)
        .attr('y', y(smp) - 4)
        .attr('font-size', 9)
        .attr('fill', '#1976d2')
        .attr('text-anchor', 'end')
        .text(`SMP: ${smp.toFixed(0)} ZAR/MWh`)
    }

    // Time display
    const timeDisplay = g.append('g').attr('transform', `translate(10, 10)`)
    timeDisplay.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('font-size', 11)
      .attr('fill', '#666')
      .style('font-weight', 'bold')
      .text(`Round ${marketData.round_num}, Hour ${String(marketData.hour_of_day).padStart(2, '0')}:00`)
  }, [marketData])

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

  return <svg ref={ref} width={320} height={180} style={{ border: '1px solid #eee', background: '#fff' }} />
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
  const deviceType = (device?.type || '').toLowerCase()
  
  if (variableCost <= 0) {
    // Fallback defaults for devices without cost data
    // For consumers (loads): bid slightly above expected SMP (~1000)
    // Strategy: A=high (always get), B=medium (usually get), C=low (marginal)
    if (deviceType.includes('load')) {
      return { A: 1300, B: 1150, C: 1050 }  // Consumers bid above SMP, Baseload highest
    }
    // For generators: bid around/below expected SMP to get dispatched
    return { A: 850, B: 950, C: 1100 }
  }
  // When varCost is provided, check if consumer or generator
  if (deviceType.includes('load')) {
    // Consumers: Bid above variable cost (A highest)
    return {
      A: Math.round(variableCost * 1.30),   // Baseload: +30%
      B: Math.round(variableCost * 1.15),   // Mid-merit: +15%
      C: Math.round(variableCost * 1.05)    // Peak: +5% (can be curtailed)
    }
  }
  // Generators: Bid near variable cost (A lowest)
  return {
    A: Math.round(variableCost * 0.85),   // Baseload: -15% (dispatched first)
    B: Math.round(variableCost * 0.95),   // Mid-merit: -5%
    C: Math.round(variableCost * 1.10)    // Peak: +10% (dispatched last)
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

// Stacked area chart showing all three lots (clickable to select lot)
function StackedLotsChart({ bidsA, bidsB, bidsC, maxValue, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams, deviceType, startTime, hourStatus = [] }) {
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
    const startHour = startTime ? parseInt(startTime.split(':')[0]) : 0
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(n > 24 ? 12 : n).tickFormat(d => {
        const hour = (startHour + Math.round(d - 1)) % 24
        return `${String(hour).padStart(2, '0')}:00`
      }))
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
    
    // Background regions based on hourStatus (matching ForecastChartEditor)
    // Group consecutive hours with same status
    const statusRanges = []
    if (hourStatus && hourStatus.length > 0) {
      let currentStatus = hourStatus[0]
      let startIdx = 0
      
      for (let i = 1; i <= Math.min(n, hourStatus.length); i++) {
        if (i === hourStatus.length || i === n || hourStatus[i] !== currentStatus) {
          statusRanges.push({ status: currentStatus, start: startIdx, end: i - 1 })
          if (i < hourStatus.length && i < n) {
            currentStatus = hourStatus[i]
            startIdx = i
          }
        }
      }
    }
    
    // Color config matching ForecastChartEditor
    const phaseConfig = {
      locked: { color: '#F5F5F5', opacity: 0.60 },
      id: { color: '#FFE0B2', opacity: 0.50 },
      da: { color: '#FFF9C4', opacity: 0.50 },
      da_r1: { color: '#B2EBF2', opacity: 0.50 },
      forecast: { color: '#E3F2FD', opacity: 0.35 }
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
      .curve(d3.curveStepAfter)
    
    // Draw stacked areas with gray for inactive, blue for active
    const colors = ['#e0e0e0', '#bdbdbd', '#9e9e9e'] // Gray tones for inactive lots
    const lotNames = ['A', 'B', 'C']
    g.selectAll('.area')
      .data(series)
      .enter()
      .append('path')
      .attr('class', 'area')
      .attr('fill', (d, i) => lotNames[i] === activeLot ? '#1976d2' : colors[i])
      .attr('opacity', (d, i) => lotNames[i] === activeLot ? 0.95 : 0.65)
      .attr('d', area)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const lotIndex = series.indexOf(d)
        if (lotIndex >= 0) onLotChange(lotNames[lotIndex])
      })
    
    // Reference lines based on device type (Max Power, Expected, etc.)
    if (deviceParams && deviceType) {
      const deviceTypeNorm = (deviceType || '').toLowerCase()
      
      if (['coal', 'gas', 'hydro', 'nuclear'].includes(deviceTypeNorm)) {
        // Thermal generators: max_power, min_load
        const maxPower = deviceParams.max_power_mw || deviceParams.capacity_mw || 0
        const minLoadPct = deviceParams.min_load_pct || 0
        const minPower = (minLoadPct / 100) * maxPower
        
        if (maxPower > 0 && maxPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(maxPower))
            .attr('y2', y(maxPower))
            .attr('stroke', '#d32f2f')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,0')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(maxPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', '#d32f2f')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Max Power: ${maxPower.toFixed(0)} MW`)
        }
        
        if (minPower > 0 && minPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(minPower))
            .attr('y2', y(minPower))
            .attr('stroke', '#f57c00')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(minPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', '#f57c00')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Min Load: ${minPower.toFixed(0)} MW`)
        }
      } else if (['solar', 'wind'].includes(deviceTypeNorm)) {
        // Renewables: max_power, expected output
        const maxPower = deviceParams.max_power_mw || deviceParams.capacity_mw || 0
        const capFactor = deviceParams.capacity_factor_pct || 0
        const expected = (capFactor / 100) * maxPower
        
        if (maxPower > 0 && maxPower <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(maxPower))
            .attr('y2', y(maxPower))
            .attr('stroke', '#d32f2f')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,0')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(maxPower) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', '#d32f2f')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Max Power: ${maxPower.toFixed(0)} MW`)
        }
        
        if (expected > 0 && expected <= yMax) {
          g.append('line')
            .attr('x1', 0)
            .attr('x2', iw)
            .attr('y1', y(expected))
            .attr('y2', y(expected))
            .attr('stroke', '#388e3c')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,3')
          
          g.append('text')
            .attr('x', iw - 5)
            .attr('y', y(expected) - 5)
            .attr('text-anchor', 'end')
            .attr('fill', '#388e3c')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`Expected: ${expected.toFixed(0)} MW (${capFactor}% CF)`)
        }
      }
    }
    
  }, [bidsA, bidsB, bidsC, maxValue, currentRound, roundSpan, lockedUntil, activeLot, onLotChange, deviceParams, hourStatus])
  
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Bid Overview</Typography>
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
    general: { round_span_hours: 6, forecast_horizon_hours: 48, freeze_hours: 6, day_ahead_gate_hour: 12, horizon_hours: 24, fake_date: '', start_time: '' },
    current_round: 1,
    scenario_name: '',
    campaign_name: ''
  })
  const [status, setStatus] = useState('pending')
  const [marketDialogOpen, setMarketDialogOpen] = useState(false)
  const [marketDialogData, setMarketDialogData] = useState(null)
  const [roundsSummary, setRoundsSummary] = useState([])
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
  const [deviceView, setDeviceView] = useState(() => {
    // Restore deviceView from localStorage on mount
    try {
      const saved = localStorage.getItem(`player_deviceView_${sessionId}`)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [submitted, setSubmitted] = useState(false)
  
  // Persist deviceView to localStorage whenever it changes
  useEffect(() => {
    if (sessionId && Object.keys(deviceView).length > 0) {
      try {
        localStorage.setItem(`player_deviceView_${sessionId}`, JSON.stringify(deviceView))
      } catch (e) { console.error('Failed to save deviceView:', e) }
    }
  }, [deviceView, sessionId])
  const [scenario, setScenario] = useState(null)
  const [hourlySeries, setHourlySeries] = useState([])
  const [deviceBids, setDeviceBids] = useState({}) // { device_id: { A: {price, hours}, B: {price, hours}, C: {price, hours} } }
  const [biddingEnabled, setBiddingEnabled] = useState(false)
  const [activeLot, setActiveLot] = useState(() => {
    // Restore activeLot from localStorage on mount
    try {
      const saved = localStorage.getItem(`player_activeLot_${sessionId}`)
      return saved && ['A', 'B', 'C'].includes(saved) ? saved : 'A'
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
    current_position: { devices: {}, bids: {}, aggregate: [] }
  })
  
  // Persist activeLot to localStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      try {
        localStorage.setItem(`player_activeLot_${sessionId}`, activeLot)
      } catch (e) { console.error('Failed to save activeLot:', e) }
    }
  }, [activeLot, sessionId])
  
  // Build roundsSummary whenever cfg.markets or cfg.general.rounds changes
  useEffect(() => {
    try {
      const gen = cfg.general || {}
      const rounds = Number(gen.rounds || 1)
      const markets = cfg.markets || {}
      const dam = (markets.dam || {})
      const idm = (markets.idm || {})
      const toTrading = (m) => (Array.isArray(m) ? m : (Array.isArray(m?.trading) ? m.trading : []))
      const damTrading = toTrading(dam)
      const idmTrading = toTrading(idm)
      const summary = Array.from({length: rounds}, (_,i)=>({
        round: i+1,
        dam: { trading: damTrading[i] || 'market_code' },
        idm: { trading: idmTrading[i] || 'market_code' }
      }))
      setRoundsSummary(summary)
    } catch(err) {
      console.error('[Player] Failed to build roundsSummary:', err)
      setRoundsSummary([])
    }
  }, [cfg.markets, cfg.general.rounds])
  
  useEffect(() => {
    forecastSeedKeyRef.current = null
    setDaBaseline({ devices: {}, bids: {}, hour_status: [], locked_until_hour: 0, da_until_hour: 24, id_until_hour: 24 }) // Reset DA baseline when session changes
    setHourlySeries([])
    
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
          current_round: Number(sessionData.current_round || 1),
          scenario_name: sessionData.scenario_name || data.name || 'Scenario',
          campaign_name: sessionData.campaign_name || ''
        }
        console.log('[Player] Setting cfg:', cfgObj)
        setCfg(cfgObj)
        // Check if bidding is enabled
        const marketParams = sessionData.market || data.market || {}
        const bidding = Boolean(marketParams.enable_player_bidding)
        console.log('[Player] Market params:', marketParams)
        console.log('[Player] enable_player_bidding:', bidding)
        console.log('[Player] Config set - forecast_horizon_hours:', cfgObj.general.forecast_horizon_hours, 'rounds:', cfgObj.general.rounds)
        setBiddingEnabled(bidding)
        setStatus(sessionData.status || 'pending')
        setMode(sessionData.mode || 'isolated_per_player')
        
        // Set scenario data from briefing
        setScenario({
          ...data,
          scenario_id: sessionData.scenario_id,
          config: {
            general: data.general,
            market: data.market || {},
            markets: data.markets || {},
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
          if(sel){
            const t = (pts||[]).find(x=> x.id===sel)
            devs = t?.devices || []
            console.log('Selected type:', sel, 'Found type:', t, 'Devices:', devs)
            
            // Prepare all state updates before calling setters (so React batches them)
            const fh = Number(gen.forecast_horizon_hours||24)
            const globalBidding = data.market?.enable_player_bidding || false
            
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
                const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                  ? deviceDef.enable_multi_bid 
                  : globalBidding
                
                if (deviceBidding && !next[did]) {
                  const defaultPrices = getDefaultBidPrices(deviceDef)
                  const baseProfile = buildDeviceProfile(deviceDef, fh)
                  
                  // Split capacity across three lots: A=40%, B=35%, C=25%
                  const hoursA = baseProfile.map(v => Math.round(v * 0.40 * 100) / 100)
                  const hoursB = baseProfile.map(v => Math.round(v * 0.35 * 100) / 100)
                  const hoursC = baseProfile.map(v => Math.round(v * 0.25 * 100) / 100)
                  
                  next[did] = {
                    A: { price: defaultPrices.A, hours: hoursA },
                    B: { price: defaultPrices.B, hours: hoursB },
                    C: { price: defaultPrices.C, hours: hoursC }
                  }
                }
              })
              return next
            })
            console.log('[Player] Initialized type devices:', devs.length, 'with bidding for devices:', 
              devs.filter(did => {
                const deviceDef = devices.find(d => d.id === did)
                return deviceDef?.enable_multi_bid !== undefined ? deviceDef.enable_multi_bid : globalBidding
              })
            )
          } else if (allowed.length === 0 && devices.length > 0) {
            // Solo mode (no player types defined): use ALL scenario devices
            devs = devices.map(d => d.id)
            
            const fh = Number(gen.forecast_horizon_hours||24)
            const globalBidding = data.market?.enable_player_bidding || false
            
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
                const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                  ? deviceDef.enable_multi_bid 
                  : globalBidding
                
                if (deviceBidding && !next[did]) {
                  const defaultPrices = getDefaultBidPrices(deviceDef)
                  const baseProfile = buildDeviceProfile(deviceDef, fh)
                  
                  // Split capacity across three lots: A=40%, B=35%, C=25%
                  const hoursA = baseProfile.map(v => Math.round(v * 0.40 * 100) / 100)
                  const hoursB = baseProfile.map(v => Math.round(v * 0.35 * 100) / 100)
                  const hoursC = baseProfile.map(v => Math.round(v * 0.25 * 100) / 100)
                  
                  next[did] = {
                    A: { price: defaultPrices.A, hours: hoursA },
                    B: { price: defaultPrices.B, hours: hoursB },
                    C: { price: defaultPrices.C, hours: hoursC }
                  }
                }
              })
              return next
            })
          }
          // Only open type dialog if player types are configured AND user hasn't selected yet
          if(allowed.length>0 && !sel){
            console.log('[Player] Opening type selection dialog - no type selected yet')
            setTypeDialogOpen(true)
          } else if (sel) {
            console.log('[Player] Player already selected type:', sel, '- not showing dialog')
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
              current_position: baselineRes.data.current_position || { devices: {}, bids: {}, aggregate: [] }
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
            const { rounds, hourly_results } = resultsRes.data
            
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
          }
        } catch (err) {
          console.error('Failed to load historical results:', err)
        }
        
      } catch (error) {
        console.error('Failed to load session config:', error)
        showSnack('Failed to load session configuration', 'error')
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
        try{
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          const newRound = Number(data.current_round || 1)
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
                market_timeline: baselineRes.data.market_timeline || null
              })
              console.log('[Player] Loaded DA baseline on round_start:', baselineRes.data)
            }
          } catch (err) {
            console.error('Failed to load DA baseline on round_start:', err)
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
      const event = { id: p.event_id||`event-${Date.now()}`, type:p.type, name:p.name, description:p.description, multiplier:p.multiplier, additive:p.additive, duration_rounds:p.duration_rounds, target:p.target, round:p.round }
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
  
  // Determine editable hours based on hour_status
  // Hours with status "locked" are not editable
  // All other hours ("id", "da", "forecast") are editable
  const editableIdx = useMemo(() => {
    const hourStatus = daBaseline.hour_status || []
    const editable = new Set()
    
    for (let i = 0; i < hours.length; i++) {
      const status = hourStatus[i]
      // Only "locked" hours are not editable
      // "forecast" hours are always editable
      if (status !== 'locked') {
        editable.add(i)
      }
    }
    
    return editable
  }, [daBaseline.hour_status, hours.length])

  const openMarketDialog = () => {
    try {
      const gen = cfg.general || {}
      const rounds = Number(gen.rounds || 1)
      const roundSpan = Number(gen.round_span_hours || 6)
      const currentR = Number(cfg.current_round || 1)
      const start = `${gen.fake_date || '2001-01-01'} ${gen.start_time || '00:00'}:00`
      const base = new Date(start.replace(' ', 'T'))
      const simHours = (currentR - 1) * roundSpan
      const now = new Date(base.getTime() + simHours * 3600 * 1000)
      const fmt = (d) => `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      
      // IMPORTANT: cfg.markets (plural) = per-round availability; cfg.market (singular) = global parameters
      const markets = cfg.markets || {}
      const dam = (markets.dam || {})
      const idm = (markets.idm || {})
      const toTrading = (m) => (Array.isArray(m) ? m : (Array.isArray(m?.trading) ? m.trading : []))
      const damTrading = toTrading(dam)
      const damClearing = Array.isArray(dam.clearing) ? dam.clearing : damTrading
      const idmTrading = toTrading(idm)
      const idmClearing = Array.isArray(idm.clearing) ? idm.clearing : idmTrading
      const roundsSummary = Array.from({length: rounds}, (_,i)=>({
        round: i+1,
        dam: { 
          trading: damTrading[i] || 'market_code', 
          clearing: damClearing[i] || 'market_code'
        },
        idm: { 
          trading: idmTrading[i] || 'market_code', 
          clearing: idmClearing[i] || 'market_code'
        }
      }))
      const backend = daBaseline?.market_timeline || null
      console.log('[Market Overview] cfg.markets:', markets)
      console.log('[Market Overview] roundsSummary:', roundsSummary)
      console.log('[Market Overview] backend timeline:', backend)
      setMarketDialogData({ now: fmt(now), round: currentR, roundsSummary, backend })
      setRoundsSummary(roundsSummary)  // Store for timeline component
    } catch(err) { 
      console.error('[Market Overview] Error:', err)
      setMarketDialogData(null) 
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

    autoSubmitRef.current = true
    showSnack('Time is up. Auto-submitting your latest forecast.', 'info')
    // Skip overcapacity confirmation on automatic submit
    submitCurrent(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, status, submitted, sessionId, allowedTypes.length, selectedType, showSnack])

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
    if (!(status === 'round_closing' || status === 'calculating')) return

    let cancelled = false

    const pollStatus = async () => {
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}`)
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
      } catch (err) {
        console.error('Session status poll failed:', err)
      }
    }

    console.log(`[Player] Starting status polling for session ${sessionId} in status ${status}`)
    pollStatus()
    const interval = setInterval(pollStatus, 2000)
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
            const defaultPrices = getDefaultBidPrices(def)
            const deviceHoursFallback = buildDeviceProfile(def, fh)
            
            // Initialize 3 bids with default prices and quantity tranches
            next[did] = {
              A: { 
                price: defaultPrices.A, 
                hours: deviceHoursFallback.map(h => Math.round(h * 0.5 * 100) / 100) // 50% in Bid A
              },
              B: { 
                price: defaultPrices.B, 
                hours: deviceHoursFallback.map(h => Math.round(h * 0.3 * 100) / 100) // 30% in Bid B
              },
              C: { 
                price: defaultPrices.C, 
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cfg.general, allowedTypes.length, selectedType, typeDevices, scenarioDevices])

  const hourlyChartData = useMemo(() => {
    console.log('[Player] hourlyChartData useMemo - hourlySeries:', hourlySeries?.length || 0, 'entries')
    if (!Array.isArray(hourlySeries) || hourlySeries.length === 0) {
      console.log('[Player] hourlySeries is empty or not an array')
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

    return [...hourlySeries]
      .map((entry) => {
        const idx = Number(entry.hour_idx ?? entry.hour_offset ?? 0)
        const safeIdx = Number.isFinite(idx) ? idx : 0
        if (baseTime != null) {
          const timestamp = baseTime + safeIdx * HOUR_MS
          const label = new Date(timestamp).toLocaleString('en-ZA', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
          return { ...entry, hour_idx: safeIdx, timestamp, label }
        }
        return { ...entry, hour_idx: safeIdx, timestamp: safeIdx, label: `h${safeIdx + 1}` }
      })
      .sort((a, b) => a.hour_idx - b.hour_idx)
  }, [hourlySeries, cfg.general.fake_date, cfg.general.start_time])

  // D3 Charts
  useEffect(() => {
    console.log('[Player] D3 Charts useEffect - hourlyChartData length:', hourlyChartData.length)
    if (hourlyChartData.length === 0) {
      console.log('[Player] No hourly chart data - skipping D3 render')
      return
    }
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

    // Draw SMP chart
    if (smpRef.current) {
      const svg = d3.select(smpRef.current)
      svg.selectAll('*').remove()
      const M = { top: 10, right: 14, bottom: 40, left: 50 }
      const W = 420 - M.left - M.right
      const H = 160 - M.top - M.bottom
      const g = svg
        .attr('width', 420)
        .attr('height', 160)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const hasRealTime = hourlyChartData.some((d) => d.timestamp > 1000000)
      const xDomain = hasRealTime
        ? d3.extent(hourlyChartData, (d) => d.timestamp)
        : d3.extent(hourlyChartData, (d) => d.hour_idx)
      const x = hasRealTime
        ? d3.scaleTime().domain(xDomain).range([0, W])
        : d3.scaleLinear().domain(xDomain).range([0, W])
      const y = d3
        .scaleLinear()
        .domain([
          d3.min(hourlyChartData, (d) => d.smp) ?? 0,
          d3.max(hourlyChartData, (d) => d.smp) ?? 1
        ])
        .nice()
        .range([H, 0])
      const xValue = (d) => (hasRealTime ? x(d.timestamp) : x(d.hour_idx))
      const line = d3
        .line()
        .x((d) => xValue(d))
        .y((d) => y(d.smp))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(hourlyChartData).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2).attr('d', line)
      const startHour = cfg.general.start_time ? parseInt(cfg.general.start_time.split(':')[0]) : 0
      g.append('g')
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
      g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      g.selectAll('circle.point')
        .data(hourlyChartData)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', (d)=> xValue(d))
        .attr('cy', d=> y(d.smp))
        .attr('r', 3)
        .attr('fill', '#2e7d32')
        .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`${d.label}: ${d.smp} ZAR/MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+30).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Simulation Time')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('SMP (ZAR/MWh)')
    }

    // Draw Volume chart
    if (volRef.current) {
      const svg = d3.select(volRef.current)
      svg.selectAll('*').remove()
      const M = { top: 10, right: 14, bottom: 40, left: 50 }
      const W = 420 - M.left - M.right
      const H = 160 - M.top - M.bottom
      const g = svg
        .attr('width', 420)
        .attr('height', 160)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const hasRealTime = hourlyChartData.some((d) => d.timestamp > 1000000)
      const xDomain = hasRealTime
        ? d3.extent(hourlyChartData, (d) => d.timestamp)
        : d3.extent(hourlyChartData, (d) => d.hour_idx)
      const x = hasRealTime
        ? d3.scaleTime().domain(xDomain).range([0, W])
        : d3.scaleLinear().domain(xDomain).range([0, W])
      const y = d3
        .scaleLinear()
        .domain([0, (d3.max(hourlyChartData, (d) => d.volume) ?? 1)])
        .nice()
        .range([H, 0])
      const xValue = (d) => (hasRealTime ? x(d.timestamp) : x(d.hour_idx))
      const line = d3
        .line()
        .x((d) => xValue(d))
        .y((d) => y(d.volume))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(hourlyChartData).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)
      const startHour = cfg.general.start_time ? parseInt(cfg.general.start_time.split(':')[0]) : 0
      g.append('g')
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
      g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      g.selectAll('circle.point')
        .data(hourlyChartData)
        .enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', (d)=> xValue(d))
        .attr('cy', d=> y(d.volume))
        .attr('r', 3)
        .attr('fill', '#1976d2')
        .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`${d.label}: ${d.volume} MWh`) })
  .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
  .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', W/2).attr('y', H+30).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Simulation Time')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
    return ()=> { try { tooltip.remove() } catch(_){} }
  }, [hourlyChartData, smpRef.current, volRef.current, cfg.general.start_time])

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

  const submitCurrent = async (skipCapacityWarnings = false) => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const start = (r - 1) * span
    const slice = hours
      .slice(start, start + span)
      .map((value) => {
        const num = Number(value)
        return Number.isFinite(num) ? num : 0
      })
    
    // Check for overcapacity bids
    const warnings = []
    if (biddingEnabled && typeDevices.length > 0) {
      typeDevices.forEach(deviceId => {
        const device = scenarioDevices.find(d => d.id === deviceId)
        if (!device) return
        const deviceType = (device.type || '').toLowerCase()
        if (deviceType.includes('load')) return

        const maxPower = getDeviceMaxCapability(device)
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
    await doSubmit(slice, r)
  }
  
  const doSubmit = async (slice, r) => {
    try {
      const payload = { session_id: Number(sessionId), round_num: r, hours: slice }
      if(allowedTypes.length>0 && selectedType && typeDevices.length>0){
        const span = Number(cfg.general.round_span_hours || 6)
        const start = (r - 1) * span
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
      setConfirmOvercapacityOpen(false)
    } catch (e) {
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

  const handleDismissEvent = (eventId) => {
    setDismissedEvents((prev) => new Set([...prev, eventId]))
  }

  // Filter out dismissed events
  const visibleEvents = activeEvents.filter(e => !dismissedEvents.has(e.id))

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

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
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

      {/* Waiting Screen - after submit in shared multiplayer */}
      {mode === 'shared_market' && submitted && (status === 'running' || status === 'round_active') && (
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
        </>
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
      {console.log('[Player] Showing Main Game Interface')}
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

      {/* Market Overview Dialog (timeline click) */}
      <Dialog open={marketDialogOpen} onClose={()=> setMarketDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Market Overview</DialogTitle>
        <DialogContent dividers>
          {marketDialogData ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2">1) Aktuelle Runde & Zeit</Typography>
                <Typography variant="body2">Round {marketDialogData.round} · {marketDialogData.now}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2">2) KSE-Definition (alle Runden)</Typography>
                <Box component="table" sx={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left', padding:4}}>Round</th>
                      <th style={{textAlign:'center', padding:4}}>DAM (trade/clear)</th>
                      <th style={{textAlign:'center', padding:4}}>IDM (trade/clear)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketDialogData.roundsSummary.map(r => {
                      const formatStatus = (s) => {
                        if (s === 'market_code') return <span style={{color:'#2196f3', fontWeight:500}}>Gated</span>
                        if (s === 'on') return <span style={{color:'#4caf50', fontWeight:500}}>enabled</span>
                        if (s === 'off') return <span style={{color:'#f44336', fontWeight:500}}>disabled</span>
                        return <span style={{color:'#999'}}>—</span>
                      }
                      return (
                        <tr key={r.round}>
                          <td style={{padding:4}}>R{r.round}</td>
                          <td style={{padding:4, textAlign:'center'}}>
                            {formatStatus(r.dam.trading)} / {formatStatus(r.dam.clearing)}
                          </td>
                          <td style={{padding:4, textAlign:'center'}}>
                            {formatStatus(r.idm.trading)} / {formatStatus(r.idm.clearing)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2">3) Backend‑Rückmeldung</Typography>
                {marketDialogData.backend ? (
                  <>
                    <Typography variant="body2">
                      Round {marketDialogData.backend.round} · 
                      Handelbare Stunden: {Array.isArray(marketDialogData.backend.tradeable_hours) ? marketDialogData.backend.tradeable_hours.length : 0} · 
                      Horizon: {marketDialogData.backend.horizon_hours || '?'}h
                    </Typography>
                    {Array.isArray(marketDialogData.backend.phases) && marketDialogData.backend.phases.length > 0 ? (
                      <Box sx={{ mt:1 }}>
                        {marketDialogData.backend.phases.map((p, idx)=> (
                          <Typography key={idx} variant="body2">
                            • {p.label || p.name}: {p.start_hour}–{p.end_hour}h {p.editable ? '(editable)' : ''}
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{mt:1}}>
                        Keine Phasen-Informationen verfügbar.
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{mt:1, display:'block'}}>
                      hour_status: {Array.isArray(marketDialogData.backend.hour_status) ? 
                        `${marketDialogData.backend.hour_status.length} Stunden (${Array.from(new Set(marketDialogData.backend.hour_status)).join(', ')})` : 
                        'nicht verfügbar'}
                    </Typography>
                    
                    {/* DEBUG: Detaillierte hour_status Analyse */}
                    {Array.isArray(marketDialogData.backend.hour_status) && (
                      <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1, fontSize: 11 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 1 }}>
                          🔍 DEBUG: hour_status Analyse (wie wird gerendert?)
                        </Typography>
                        
                        {/* Status-Legende */}
                        <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                          <strong>Status-Bedeutung:</strong><br/>
                          • <span style={{color:'#9E9E9E'}}>locked</span> = Vergangenheit (grau)<br/>
                          • <span style={{color:'#FDD835'}}>da</span> = Day-Ahead offen (gelb)<br/>
                          • <span style={{color:'#00BCD4'}}>da_r1</span> = Round 1 Sonderöffnung (cyan)<br/>
                          • <span style={{color:'#FB8C00'}}>id</span> = Intraday offen (orange diagonal) - <strong>KEIN gelber Hintergrund!</strong><br/>
                          • <span style={{color:'#E3F2FD'}}>forecast</span> = Vorhersage (hellblau)
                        </Typography>
                        
                        {/* Count per Status */}
                        {(() => {
                          const counts = {}
                          marketDialogData.backend.hour_status.forEach(s => {
                            counts[s] = (counts[s] || 0) + 1
                          })
                          return (
                            <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                              <strong>Verteilung:</strong> {Object.entries(counts).map(([status, count]) => 
                                `${status}=${count}h`
                              ).join(', ')}
                            </Typography>
                          )
                        })()}
                        
                        {/* First 48 hours detail */}
                        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                          <strong>Erste 48 Stunden (Tag 1-2):</strong>
                        </Typography>
                        {Array.from({length: Math.min(48, marketDialogData.backend.hour_status.length)}, (_, i) => {
                          const status = marketDialogData.backend.hour_status[i]
                          const colors = {
                            locked: '#9E9E9E',
                            da: '#FDD835', 
                            da_r1: '#00BCD4',
                            id: '#FB8C00',
                            forecast: '#E3F2FD'
                          }
                          return (
                            <span key={i} style={{
                              display: 'inline-block',
                              width: 20,
                              height: 20,
                              backgroundColor: colors[status] || '#ccc',
                              border: '1px solid #666',
                              marginRight: 2,
                              marginBottom: 2,
                              fontSize: 8,
                              textAlign: 'center',
                              lineHeight: '20px',
                              color: status === 'forecast' ? '#666' : '#fff',
                              fontWeight: 'bold'
                            }} title={`h${i}: ${status}`}>
                              {i}
                            </span>
                          )
                        })}
                        
                        {/* Rendering Erklärung */}
                        <Typography variant="caption" sx={{ display: 'block', mt: 1, fontStyle: 'italic', color: '#666' }}>
                          <strong>Wie wird gerendert:</strong><br/>
                          - Timeline-Komponente (oben) zeigt 'id' Status NUR mit orange Diagonal-Muster<br/>
                          - 'id' bekommt KEINEN gelben Hintergrund mehr (seit letztem Update)<br/>
                          - Wenn du gelb+orange siehst → Cache leeren! (Strg+Shift+R)
                        </Typography>
                      </Box>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="warning.main">
                    ⚠️ Keine Timeline-Daten vom Backend verfügbar. Bitte Seite neu laden (Ctrl+Shift+R).
                  </Typography>
                )}
              </Box>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">Keine Daten.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setMarketDialogOpen(false)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      {/* Event Notifications */}
      <EventNotification 
        events={visibleEvents}
        onDismiss={handleDismissEvent}
      />

      {/* Fixed Timer Top Right */}
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1300 }}>
        <TimerAndClock timeRemaining={timeRemaining} />
      </Box>

      <Grid container spacing={3}>
        {/* Left: Timer and KPIs */}
        <Grid item xs={12} md={4}>

          <Card sx={{ mt: 0 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">
                  Session Info
                </Typography>
                <Button size="small" startIcon={<BriefingIcon />} onClick={()=> navigate(`/briefing/${sessionId}`)}>
                  Briefing
                </Button>
              </Stack>
              <Stack spacing={1}>
                {[
                  { label: 'Campaign', value: cfg.campaign_name, optional: true },
                  { 
                    value: (
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2">{cfg.scenario_name || '—'}</Typography>
                        <Typography variant="body2" color="text.secondary">•</Typography>
                        <Chip
                          label={mode === 'isolated_per_player' ? 'Solo' : 'Shared'}
                          size="small"
                          color={mode === 'isolated_per_player' ? 'default' : 'primary'}
                          sx={{ height: 20 }}
                        />
                        <Typography variant="body2" color="text.secondary">•</Typography>
                        <Typography variant="body2">R{cfg.current_round ?? '—'}</Typography>
                      </Stack>
                    ),
                    noLabel: true
                  },
                  {
                    value: (
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                        <Chip
                          label={status}
                          color={(status === 'running' || status === 'round_active') ? 'success' : 'default'}
                          size="small"
                          sx={{ height: 20 }}
                        />
                        {selectedType && (
                          <>
                            <Typography variant="body2" color="text.secondary">•</Typography>
                            <Chip
                              label={playerTypes.find(pt=> pt.id === selectedType)?.name || selectedType}
                              size="small"
                              color="secondary"
                              sx={{ height: 20 }}
                            />
                          </>
                        )}
                      </Stack>
                    ),
                    noLabel: true
                  },
                  { 
                    label: 'Scenario Date/Time', 
                    value: (() => {
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
                    })()
                  }
                ].map(({ label, value, optional, fullWidth, noLabel }) => {
                  if (optional && !value) return null
                  const renderedValue = React.isValidElement(value) ? value : (
                    <Typography variant="body2">{value}</Typography>
                  )
                  
                  if (noLabel) {
                    return (
                      <Box key={Math.random()}>
                        {renderedValue}
                      </Box>
                    )
                  }
                  
                  return (
                    <Box
                      key={label}
                      sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: fullWidth ? 'column' : 'row', alignItems: fullWidth ? 'flex-start' : 'center' }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ mb: fullWidth ? 0.5 : 0 }}>
                        {label}
                      </Typography>
                      {renderedValue}
                    </Box>
                  )
                })}
              </Stack>
              {timeRemaining !== null && initialDuration && initialDuration>0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Round progress</Typography>
                  <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, Math.round(((initialDuration - timeRemaining) * 100) / initialDuration)))} />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* MCPs last round - only show after round 1 */}
          {cfg.current_round > 1 && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="h6">MCPs last round</Typography>
                  <Tooltip
                    title={
                      'Market results from the previous round.\n\nMCP (System Marginal Price): The price in ZAR/MWh where supply meets demand.\n\nVolume: Total energy traded in MWh during the round.'
                    }
                    placement="left"
                  >
                    <IconButton size="small" aria-label="MCPs last round info">
                      <InfoOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              {live ? (
                        <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">SMP (Round {live.round})</Typography>
                    <Chip size="small" color="primary" label={`${live.smp} ZAR/MWh`} />
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Volume</Typography>
                    <Chip size="small" color="secondary" label={`${live.volume} MWh`} />
                  </Stack>
                  {/* SMP History for bidding */}
                  {biddingEnabled && series.length > 0 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #e0e0e0' }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          SMP History (last 5 rounds):
                        </Typography>
                        <Tooltip 
                          arrow 
                          title="Use past MCPs to inform your bid prices. Bid below expected SMP to ensure dispatch, but avoid bidding too low to maximize profit."
                          placement="right"
                        >
                          <InfoOutlined sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
                        </Tooltip>
                      </Stack>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {series.slice(-5).map(s => (
                          <Chip 
                            key={s.r}
                            label={`R${s.r}: ${s.smp}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '10px', height: 20 }}
                          />
                        ))}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                        Avg: {series.length > 0 ? Math.round(series.reduce((sum, s) => sum + s.smp, 0) / series.length) : 0} ZAR/MWh
                      </Typography>
                    </Box>
                  )}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Waiting for market data...
                </Typography>
              )}
              </CardContent>
            </Card>
          )}

          {/* Market Supply/Demand Curve */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Market Structure</Typography>
                <Tooltip 
                  arrow 
                  title="Supply and demand curves show the market structure at the start of this round. Each round starts at different times of day, affecting renewable energy availability (solar peaks at midday, wind varies throughout day). The intersection determines the System Marginal Price (SMP)."
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
              />
            </CardContent>
          </Card>

          {/* SMP and Volume Charts - only show after round 1 */}
          {cfg.current_round > 1 && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>SMP last round</Typography>
                <svg ref={smpRef} width="100%" height={160} style={{ border: '1px solid #eee' }} />

                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Volume last round</Typography>
                <svg ref={volRef} width="100%" height={160} style={{ border: '1px solid #eee' }} />
              </CardContent>
            </Card>
          )}

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
                      if (dev.fixed_cost_zar_per_hour!=null) specs.push(`Fixed ${dev.fixed_cost_zar_per_hour} ZAR/h`)
                    } else if (t==='battery'){
                      if (dev.power_rating_mw!=null) specs.push(`Power ${dev.power_rating_mw} MW`)
                      if (dev.capacity_mwh!=null || dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mwh||dev.capacity_mw} MWh`)
                      if (dev.efficiency_pct!=null) specs.push(`Eff. ${dev.efficiency_pct}%`)
                      if (dev.fixed_cost_zar_per_hour!=null) specs.push(`Fixed ${dev.fixed_cost_zar_per_hour} ZAR/h`)
                    } else {
                      if (dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mw} MW`)
                      if (dev.cost_per_mwh_zar!=null) specs.push(`Cost ${dev.cost_per_mwh_zar} ZAR/MWh`)
                      if (dev.fixed_cost_zar_per_hour!=null) specs.push(`Fixed ${dev.fixed_cost_zar_per_hour} ZAR/h`)
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
          <Box>

            {(timeRemaining === 0 || submitted) && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {submitted ? 'Forecast submitted. Waiting for round results...' : 'Time is up! You can no longer submit this round.'}
              </Alert>
            )}
            {(allowedTypes.length>0 && !selectedType) && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Please select your player type to continue.
              </Alert>
            )}

            {(allowedTypes.length === 0 || (selectedType && typeDevices.length>0)) ? (
              allowedTypes.length > 0 ? (
                <>
                  {/* Market Phase Timeline - shown once above all devices */}
                  <Box sx={{ mb: 2 }}>
                    <MarketPhaseTimeline
                      hours={Number(cfg.general.forecast_horizon_hours || 48)}
                      hourStatus={daBaseline.hour_status || []}
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
                    />
                  </Box>
                  <Stack spacing={3}>
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
                        
                        {view === 'chart' && (
                          <Box sx={{ mb: 2 }}>
                            {(() => {
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                ? deviceDef.enable_multi_bid 
                                : biddingEnabled
                              
                              return deviceBidding && deviceBids[did]
                            })() && (
                              <>
                                <Box>
                                  <ForecastChartEditor 
                                    hours={deviceBids[did][activeLot]?.hours || []} 
                                    lockedUntil={effectiveLockedUntil} 
                                    onChange={(i, val) => onBidQuantityChange(did, activeLot, i, val)} 
                                    maxValue={deviceMax} 
                                    smoothRadius={3}
                                    currentRound={Number(cfg.current_round || 1)}
                                    roundSpan={Number(cfg.general.round_span_hours || 6)}
                                    freezeHours={Number(cfg.general.freeze_hours || 6)}
                                    dayAheadGateHour={Number(cfg.general.day_ahead_gate_hour ?? 12)}
                                    startTime={cfg.general.start_time || '00:00'}
                                    deviceType={deviceType}
                                    deviceParams={deviceParams}
                                    daBaseline={daBaseline.bids?.[did]?.[activeLot]?.hours || daBaseline.devices?.[did] || null}
                                    committedPosition={daBaseline.current_position?.bids?.[did]?.[activeLot]?.hours || daBaseline.current_position?.devices?.[did] || null}
                                    hourStatus={daBaseline.hour_status || []}
                                    totalRounds={Number(cfg.general.rounds)}
                                    daCommittedStart={daBaseline.da_committed_start}
                                    daCommittedEnd={daBaseline.da_committed_end}
                                  />
                                </Box>
                                
                                {/* Multi-Bid Price Inputs - moved below charts */}
                                {(() => {
                                  const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                    ? deviceDef.enable_multi_bid 
                                    : biddingEnabled
                                  return deviceBidding && deviceBids[did]
                                })() && (
                                  <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                                      Set three price-quantity bid pairs. Bids are cleared from lowest to highest price until demand is met. All cleared bids receive the System Marginal Price (SMP). Enter bid volume per hour - e.g., 600 MW for 6 hours means 600 MW in each hour.
                                    </Typography>
                                    
                                    {/* Price Inputs */}
                                    <Stack direction="row" spacing={2}>
                                      <Box sx={{ flex: 1, opacity: activeLot === 'A' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('A')}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: activeLot === 'A' ? 'bold' : 'normal', color: activeLot === 'A' ? '#000' : 'text.secondary' }}>
                                          Baseload {activeLot === 'A' && '✓'}
                                        </Typography>
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
                                            endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>,
                                            sx: {
                                              backgroundColor: activeLot === 'A' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                          sx={{
                                            '& .MuiOutlinedInput-root': {
                                              borderColor: activeLot === 'A' ? '#1976d2' : undefined,
                                              borderWidth: activeLot === 'A' ? 2 : 1,
                                              backgroundColor: activeLot === 'A' ? '#e3f2fd' : 'transparent'
                                            },
                                            '& .MuiOutlinedInput-input': {
                                              backgroundColor: activeLot === 'A' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                        />
                                      </Box>
                                      <Box sx={{ flex: 1, opacity: activeLot === 'B' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('B')}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: activeLot === 'B' ? 'bold' : 'normal', color: activeLot === 'B' ? '#000' : 'text.secondary' }}>
                                          Mid-Merit {activeLot === 'B' && '✓'}
                                        </Typography>
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
                                            endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>,
                                            sx: {
                                              backgroundColor: activeLot === 'B' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                          sx={{
                                            '& .MuiOutlinedInput-root': {
                                              borderColor: activeLot === 'B' ? '#1976d2' : undefined,
                                              borderWidth: activeLot === 'B' ? 2 : 1,
                                              backgroundColor: activeLot === 'B' ? '#e3f2fd' : 'transparent'
                                            },
                                            '& .MuiOutlinedInput-input': {
                                              backgroundColor: activeLot === 'B' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                        />
                                      </Box>
                                      <Box sx={{ flex: 1, opacity: activeLot === 'C' ? 1 : 0.6, transition: 'opacity 0.3s', cursor: 'pointer' }} onClick={() => setActiveLot('C')}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: activeLot === 'C' ? 'bold' : 'normal', color: activeLot === 'C' ? '#000' : 'text.secondary' }}>
                                          Peak {activeLot === 'C' && '✓'}
                                        </Typography>
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
                                            endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>ZAR/MWh</Typography>,
                                            sx: {
                                              backgroundColor: activeLot === 'C' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                          sx={{
                                            '& .MuiOutlinedInput-root': {
                                              borderColor: activeLot === 'C' ? '#1976d2' : undefined,
                                              borderWidth: activeLot === 'C' ? 2 : 1,
                                              backgroundColor: activeLot === 'C' ? '#e3f2fd' : 'transparent'
                                            },
                                            '& .MuiOutlinedInput-input': {
                                              backgroundColor: activeLot === 'C' ? '#e3f2fd' : 'transparent'
                                            }
                                          }}
                                        />
                                      </Box>
                                    </Stack>
                                  </Box>
                                )}
                                
                                <Box sx={{ mt: 3 }}>
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
                                    deviceType={deviceType}
                                    startTime={cfg.general.start_time || '00:00'}
                                    hourStatus={daBaseline.hour_status || []}
                                  />
                                </Box>
                              </>
                            )}
                            {(() => {
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                ? deviceDef.enable_multi_bid 
                                : biddingEnabled
                              
                              return !deviceBidding
                            })() && (
                              <Box>
                                <ForecastChartEditor 
                                  hours={series} 
                                  lockedUntil={effectiveLockedUntil} 
                                  onChange={(i, val)=> onDeviceChange(did, i, val)} 
                                  maxValue={deviceMax} 
                                  smoothRadius={3}
                                  currentRound={Number(cfg.current_round || 1)}
                                  roundSpan={Number(cfg.general.round_span_hours || 6)}
                                  freezeHours={Number(cfg.general.freeze_hours || 6)}
                                  dayAheadGateHour={Number(cfg.general.day_ahead_gate_hour ?? 12)}
                                  startTime={cfg.general.start_time || '00:00'}
                                  deviceType={deviceType}
                                  deviceParams={deviceParams}
                                  daBaseline={daBaseline.devices?.[did] || null}
                                  committedPosition={daBaseline.current_position?.devices?.[did] || null}
                                  hourStatus={daBaseline.hour_status || []}
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
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                ? deviceDef.enable_multi_bid 
                                : biddingEnabled
                              return deviceBidding && deviceBids[did] ? (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                                  Currently editing: <strong>{activeLot === 'A' ? 'Baseload' : activeLot === 'B' ? 'Mid-Merit' : 'Peak'}</strong> (Click a price field above to switch). Enter MW for each hour.
                                </Typography>
                              ) : null
                            })()}
                            {(() => {
                              // Check device-level bidding setting (fallback to global)
                              const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                ? deviceDef.enable_multi_bid 
                                : biddingEnabled
                              const series = deviceBidding && deviceBids[did] ? (deviceBids[did][activeLot]?.hours || []) : (deviceHours[did] || [])
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
                                                const deviceBidding = deviceDef?.enable_multi_bid !== undefined
                                                  ? deviceDef.enable_multi_bid
                                                  : biddingEnabled
                                                const highlightLot = deviceBidding && deviceBids[did]
                                                const v = series[i]
                                                return (
                                                  <Grid item xs={6} sm={3} md={3} key={i}>
                                                    <Tooltip arrow title={`Hour h${i + 1}: ${disabled ? 'Locked (freeze)' : 'Editable'}`}>
                                                      <TextField
                                                        label={`h${i + 1}`}
                                                        value={v}
                                                        onChange={(e) => {
                                                          // Check device-level bidding setting (fallback to global)
                                                          const deviceBidding = deviceDef?.enable_multi_bid !== undefined 
                                                            ? deviceDef.enable_multi_bid 
                                                            : biddingEnabled
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
                                                        sx={{
                                                          '& .MuiOutlinedInput-root': {
                                                            backgroundColor: highlightLot ? '#e3f2fd' : 'transparent'
                                                          },
                                                          '& .MuiOutlinedInput-input': {
                                                            backgroundColor: highlightLot ? '#e3f2fd' : 'transparent'
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
                    hourStatus={daBaseline.hour_status || []}
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
                  />
                </Box>
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
                      daBaseline={daBaseline.aggregate || null}
                      committedPosition={daBaseline.current_position?.aggregate || null}
                      hourStatus={daBaseline.hour_status || []}
                      totalRounds={Number(cfg.general.rounds)}
                      daCommittedStart={daBaseline.da_committed_start}
                      daCommittedEnd={daBaseline.da_committed_end}
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
                    onClick={() => submitCurrent(false)}
                    disabled={!isEditable || !isValid || timeRemaining === 0 || (allowedTypes.length>0 && !selectedType)}
                  >
                    Submit Current Round
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Box>
        </Grid>
      </Grid>
      </>
      )}
      
      {/* Overcapacity Warning Dialog */}
      <Dialog 
        open={confirmOvercapacityOpen} 
        onClose={() => setConfirmOvercapacityOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>⚠️ Overcapacity Bid Detected</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            You are bidding more than your device capacity. The system will automatically cap your bid to the maximum capacity, 
            and you may incur imbalance costs if the actual output differs from what was accepted.
          </Alert>
          
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>Overcapacity bids detected:</strong>
          </Typography>
          
          <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
            {overcapacityWarnings.map((w, idx) => (
              <Alert severity="info" key={idx} sx={{ mb: 1 }}>
                <strong>{w.device}</strong> Hour {w.hour}: Offered {w.offered} MW exceeds max capacity {w.maxPower} MW
              </Alert>
            ))}
          </Box>
          
          <Typography variant="body2" color="text.secondary">
            Do you want to proceed with this submission?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOvercapacityOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
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