import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

/**
 * ForecastChartEditor
 * Interactive line chart for editing hourly forecast values by dragging points.
 * Props:
 * - hours: number[]
 * - hourIndices: number[] (optional absolute hour indices for visible points)
 * - editableIndices: number[] (optional relative indices that remain editable)
 * - lockedUntil: number (index of first editable hour, 0-based)
 * - onChange: (index:number, value:number) => void
 * - deviceType: string (device type for reference lines)
 * - deviceParams: object (device parameters for constraints)
 * - currentRound: number (active round for "now" marker)
 * - roundSpan: number (hours per round)
 * - freezeHours: number (hours locked after DAM)
 * - startTime: string (HH:MM) used to annotate the current clock time
 * - daBaseline: number[] (optional: Day-Ahead baseline for comparison)
 * - committedPosition: number[] (optional: Current committed position for ID area visualization)
 * - idmTradingStatus: string (optional: current-round IDM trading status: on/off/market_code)
 * - hourStatus: string[] (optional: per-hour status: "locked", "da", "id", "future")
 * - daCommittedStart: number (optional: first hour of DA committed range)
 * - daCommittedEnd: number (optional: last hour+1 of DA committed range)
 */
export default function ForecastChartEditor({
  hours = [],
  hourIndices = null,
  editableIndices = null,
  lockedUntil = 0,
  onChange,
  maxValue,
  effectiveLimitMw = null,
  smoothRadius = 3,
  deviceType = '',
  deviceParams = {},
  currentRound = 1,
  roundSpan = 6,
  freezeHours = 6,
  dayAheadGateHour = 12,
  startTime = '00:00',
  fakeDate = '',
  daBaseline = null,
  committedPosition = null,
  idmTradingStatus = 'market_code',
  prevDispatch = null,
  hourStatus = [],
  totalRounds = null,
  daCommittedStart = -1,
  daCommittedEnd = -1
}){
  const ref = useRef(null)
  const dragStateRef = useRef({ index: null, engaged: false })
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const parent = ref.current.parentElement
    const update = () => {
      const width = parent?.clientWidth || ref.current.clientWidth || 0
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
    if (!ref.current) return
    if (dragStateRef.current.engaged) {
      // Skip tearing down the chart while an active drag is in progress.
      return
    }

    if (!containerWidth) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    svg.style('touch-action', 'none')

    const width = Math.max(containerWidth, 260)
    const H = 420
    const M = { top: 16, right: 20, bottom: 36, left: 46 }
    const iw = width - M.left - M.right
    const ih = H - M.top - M.bottom

    const g = svg.attr('width', width).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const n = Math.max(1, hours.length)
    const displayHourIndices = Array.isArray(hourIndices) && hourIndices.length === hours.length
      ? hourIndices.map((value, idx) => {
          const parsed = Number(value)
          return Number.isFinite(parsed) ? parsed : idx
        })
      : hours.map((_, idx) => idx)
    const segmentGapUnits = 0.45
    const displaySlots = []
    let nextSlot = 1
    displayHourIndices.forEach((hourIdx, idx) => {
      if (idx === 0) {
        displaySlots.push(nextSlot)
        return
      }
      const prevHourIdx = displayHourIndices[idx - 1]
      nextSlot += hourIdx === prevHourIdx + 1 ? 1 : (1 + segmentGapUnits)
      displaySlots.push(nextSlot)
    })
    const minDisplaySlot = d3.min(displaySlots) ?? 1
    const maxDisplaySlot = d3.max(displaySlots) ?? n
    const editableIndexSet = Array.isArray(editableIndices) ? new Set(editableIndices) : null
    const hourIndexToVisibleIdx = new Map(displayHourIndices.map((hourIdx, idx) => [hourIdx, idx]))
    const seriesMax = Math.max(1, d3.max(hours) || 1)
    const hintedMax = Number.isFinite(Number(maxValue)) ? Number(maxValue) : 0
    const parsedStart = String(startTime || '00:00').split(':')
    const startHour = Number(parsedStart[0]) || 0
    const startMinute = Number(parsedStart[1]) || 0
    const baseDate = (() => {
      if (!fakeDate) return null
      const d = new Date(fakeDate)
      if (Number.isNaN(d.getTime())) return null
      d.setHours(startHour, startMinute, 0, 0)
      return d
    })()
    
    // Calculate device-specific reference lines
    const deviceTypeNorm = (deviceType || '').toLowerCase()
    const refLines = []
    
    if (['coal', 'gas', 'hydro', 'nuclear'].includes(deviceTypeNorm)) {
      // Thermal generators: max_power, min_load
      const configuredMaxPower = Number(deviceParams.capacity_mw || deviceParams.max_power_mw || 0)
      const maxPower = Number.isFinite(Number(effectiveLimitMw)) && Number(effectiveLimitMw) > 0
        ? Number(effectiveLimitMw)
        : configuredMaxPower
      const minLoadPct = deviceParams.min_load_pct || 0
      const minPower = (minLoadPct / 100) * configuredMaxPower
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Available now', color: '#d32f2f', dash: '3,0', tooltip: `Current available output in this round: ${maxPower.toFixed(1)} MW` })
      if (minPower > 0) refLines.push({ value: minPower, label: `Min Load (${minLoadPct}%)`, color: '#f57c00', dash: '4,2', tooltip: `Minimum stable load: ${minPower.toFixed(1)} MW (${minLoadPct}% of installed capacity)` })
    } else if (['solar', 'wind'].includes(deviceTypeNorm)) {
      // Renewables: max_power, expected output
      const configuredMaxPower = Number(deviceParams.capacity_mw || deviceParams.max_power_mw || 0)
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
      const totalAbsHour = startHour + currentSimHour
      const hourOfDay = ((totalAbsHour % 24) + 24) % 24
      const monthIdx = (() => {
        if (!baseDate) return null
        const d = new Date(baseDate.getTime() + currentSimHour * 3600 * 1000)
        return d.getMonth()
      })()
      const monthlyFactor = monthIdx != null && monthlyFactors ? Number(monthlyFactors[monthIdx] || 1) : 1
      const hourlyFactor = hourlyFactors ? Number(hourlyFactors[hourOfDay] || 1) : 1
      const expected = (capFactor / 100) * maxPower * monthlyFactor * hourlyFactor
      const maxEqualsExpected = Math.abs(expected - maxPower) <= Math.max(0.5, maxPower * 0.01)
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Available now', color: '#d32f2f', dash: '3,0', tooltip: `Current available output in this round: ${maxPower.toFixed(1)} MW` })
      if (expected > 0 && !maxEqualsExpected) {
        refLines.push({
          value: expected,
          label: `Expected (KSE)` ,
          color: '#388e3c',
          dash: '5,3',
          tooltip: `Expected output at ${String(hourOfDay).padStart(2, '0')}:00 (month-aware): ${expected.toFixed(1)} MW`
        })
      }
    } else if (deviceTypeNorm === 'battery') {
      // Battery: +/- power rating
      const powerMw = deviceParams.power_mw || deviceParams.power_rating_mw || 0
      if (powerMw > 0) {
        refLines.push({ value: powerMw, label: 'Max Charge', color: '#388e3c', dash: '3,0', tooltip: `Maximum charging power: ${powerMw.toFixed(1)} MW` })
        refLines.push({ value: -powerMw, label: 'Max Discharge', color: '#c62828', dash: '3,0', tooltip: `Maximum discharging power: ${powerMw.toFixed(1)} MW` })
      }
    } else if (deviceTypeNorm.includes('load')) {
      // Load devices: baseline, peak, DR capacity
      const baseline = deviceParams.baseline_load_mw || 0
      const peakConfigured = Number(deviceParams.peak_load_mw || 0)
      const peak = Number.isFinite(Number(effectiveLimitMw)) && Number(effectiveLimitMw) > 0
        ? Number(effectiveLimitMw)
        : peakConfigured
      const drCapacity = deviceParams.demand_response_capacity_mw || 0
      const drmCapable = deviceParams.drm_capable
      
      if (peak > 0) refLines.push({ value: peak, label: 'Peak Load', color: '#d32f2f', dash: '3,0', tooltip: `Effective peak demand in this round: ${peak.toFixed(1)} MW` })
      if (baseline > 0) refLines.push({ value: baseline, label: 'Baseline', color: '#1976d2', dash: '4,2', tooltip: `Baseline load consumption: ${baseline.toFixed(1)} MW` })
      if (drmCapable && drCapacity > 0 && baseline > drCapacity) {
        const drMin = baseline - drCapacity
        refLines.push({ value: drMin, label: 'DR Minimum', color: '#fbc02d', dash: '5,3', tooltip: `Demand Response minimum: ${drMin.toFixed(1)} MW (baseline minus ${drCapacity.toFixed(1)} MW DR capacity)` })
      }
    }
    
    // Calculate y-domain including reference lines
    const allValues = [...hours, ...refLines.map(r => r.value), seriesMax, hintedMax || 0, 0]
    const yMin = Math.min(...allValues, 0)
    const targetMax = hintedMax || seriesMax
    const yMax = Math.max(targetMax * 1.05, seriesMax * 1.2, ...refLines.map(r => Math.abs(r.value)), 10)

    // Extend X-domain by +1 hour so DA baseline and markers can reach the next day boundary (e.g. 00:00 next day)
    const x = d3.scaleLinear().domain([minDisplaySlot, maxDisplaySlot + 1]).range([0, iw])
    const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([ih, 0])
    const [yDomainMin, yDomainMax] = y.domain()
    const clampY = (val) => Math.max(yDomainMin, Math.min(yDomainMax, val))
    // Scale maps domain [yMin, yMax] to pixel range [ih, 0]
    // So pixel 0 (top) → yMax and pixel ih (bottom) → yMin

    const initialActiveIdx = dragStateRef.current && dragStateRef.current.engaged ? dragStateRef.current.index : null
    let activePointIndex = Number.isInteger(initialActiveIdx) ? initialActiveIdx : null

    const workingHours = Array.isArray(hours) ? hours.map((val) => Number(val) || 0) : []
    let lineGenerator = null
    let pathSelection = null
    let hitAreas = null

    const getHourStartX = (idx) => x(displaySlots[idx] ?? (idx + 1))
    const getHourRightX = (idx) => {
      const slot = displaySlots[idx] ?? (idx + 1)
      return x(slot + 1)
    }
    const getHourCenterX = (idx) => {
      const slot = displaySlots[idx] ?? (idx + 1)
      return x(slot + 0.5)
    }
    const getVisibleIndexForAbsoluteHour = (hourIdx) => hourIndexToVisibleIdx.get(hourIdx)

    const findNearestVisibleIndex = (pixelX) => {
      let bestIdx = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let idx = 0; idx < displaySlots.length; idx += 1) {
        const dist = Math.abs(getHourCenterX(idx) - pixelX)
        if (dist < bestDistance) {
          bestDistance = dist
          bestIdx = idx
        }
      }
      return bestIdx
    }

    const buildLineSegments = (values) => {
      const segments = []
      let currentSegment = []
      values.forEach((value, idx) => {
        const point = { i: idx, v: value, hourIdx: displayHourIndices[idx] ?? idx, slot: displaySlots[idx] ?? (idx + 1) }
        const prevPoint = currentSegment[currentSegment.length - 1]
        if (prevPoint && point.hourIdx !== prevPoint.hourIdx + 1) {
          segments.push(currentSegment)
          currentSegment = []
        }
        currentSegment.push(point)
      })
      if (currentSegment.length > 0) segments.push(currentSegment)
      return segments
    }

    const syncWorkingHoursToChart = () => {
      if (pathSelection && lineGenerator) {
        pathSelection = g.selectAll('path.forecast-line').data(lineGenerator(workingHours)).join('path')
          .attr('class', 'forecast-line')
          .attr('fill', 'none')
          .attr('stroke', '#1976d2')
          .attr('stroke-width', 2)
          .attr('d', (d) => d)
      }
      if (pts) {
        pts
          .attr('cx', (d) => getHourCenterX(d.i))
          .attr('cy', (d) => y(workingHours[d.i]))
          .each((d) => {
            d.v = workingHours[d.i]
          })
      }
      if (hitAreas) {
        hitAreas.attr('cx', (d) => getHourCenterX(d.i))
        hitAreas.attr('cy', (d) => y(workingHours[d.i]))
      }
    }

    const commitValue = (idx, val) => {
      if (typeof onChange !== 'function') return
      if (!Number.isInteger(idx)) return
      if (idx < 0 || idx >= workingHours.length) return
      const num = Number(val)
      if (!Number.isFinite(num)) return
      const rounded = Number(num.toFixed(2))
      workingHours[idx] = rounded
      onChange(idx, rounded)
    }

    // grid
    g.append('g').call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat('')).selectAll('line').attr('stroke', '#e0e0e0')
    
    // Group consecutive hours by status
    const statusRanges = []
    if (Array.isArray(hourStatus) && hourStatus.length > 0) {
      let currentStatus = hourStatus[0]
      let rangeStart = 0
      
      for (let i = 1; i <= hourStatus.length; i++) {
        const hasGap = i < hourStatus.length && i < displayHourIndices.length && displayHourIndices[i] !== (displayHourIndices[i - 1] + 1)
        if (i === hourStatus.length || hourStatus[i] !== currentStatus || hasGap) {
          statusRanges.push({ status: currentStatus, start: rangeStart, end: i })
          if (i < hourStatus.length) {
            currentStatus = hourStatus[i]
            rangeStart = i
          }
        }
      }
    } else {
      // Fallback if no hourStatus provided (e.g., Round 1)
      const isRound1 = Number(currentRound) === 1
      if (isRound1) {
        statusRanges.push({ status: 'da', start: 0, end: n })
      } else {
        const lockedHour = (() => {
          const normalized = Number(lockedUntil)
          if (Number.isFinite(normalized) && normalized >= 0) {
            return Math.min(n, normalized)
          }
          return 0
        })()
        if (lockedHour > 0) {
          statusRanges.push({ status: 'locked', start: 0, end: lockedHour })
        }
        if (lockedHour < n) {
          statusRanges.push({ status: 'id', start: lockedHour, end: n })
        }
      }
    }
    
    // Market phase backgrounds based on hourStatus from backend
    // Five possible phases: locked (settled), id (intraday), da (day-ahead), da_r1 (R1 special), forecast
    
    // Create hatch patterns for committed positions
    const defs = svg.append('defs')
    const patternIdPrefix = `forecast-${Math.random().toString(36).slice(2, 9)}`
    const damPatternId = `${patternIdPrefix}-dam`
    const idmPatternId = `${patternIdPrefix}-idm`
    const damR1PatternId = `${patternIdPrefix}-dam-r1`
    
    // DAM hatch pattern: Yellow / (45 degrees)
    const damHatchPattern = defs.append('pattern')
      .attr('id', damPatternId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)')
    damHatchPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#FFFBE6')
      .attr('opacity', 0.95)
    damHatchPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#FDD835')
      .attr('stroke-width', 2)
      .attr('opacity', 0.25)
    
    // IDM hatch pattern: Orange \ (-45 degrees)
    const idmHatchPattern = defs.append('pattern')
      .attr('id', idmPatternId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(-45)')
    idmHatchPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#FFF3E0')
      .attr('opacity', 0.95)
    idmHatchPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#FB8C00')
      .attr('stroke-width', 2)
      .attr('opacity', 0.22)

    const damR1HatchPattern = defs.append('pattern')
      .attr('id', damR1PatternId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)')
    damR1HatchPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#E0F7FA')
      .attr('opacity', 0.95)
    damR1HatchPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#00BCD4')
      .attr('stroke-width', 2)
      .attr('opacity', 0.2)
    
    // Color and label mapping for each phase
    // Colors match timeline (lighter versions): DAM=Light Yellow, IDM=Light Orange, Past=Light Grey, Forecast=Light Blue
    // Note: Past hours (locked) should always be grey regardless of their market status
    const phaseConfig = {
      locked: { fill: '#EEEEEE', opacity: 0.70 },
      id: { fill: `url(#${idmPatternId})`, opacity: 0.75 },
      da: { fill: `url(#${damPatternId})`, opacity: 0.75 },
      da_r1: { fill: `url(#${damR1PatternId})`, opacity: 0.78 },
      forecast: { fill: '#F3F8FF', opacity: 0.55 }
    }
    
    // Draw background rectangles for each phase
    statusRanges.forEach(range => {
      const config = phaseConfig[range.status] || phaseConfig.future
      const xStart = getHourStartX(range.start)
      const xEnd = getHourRightX(Math.max(range.end - 1, range.start))
      const width = xEnd - xStart
      
      if (width > 5) {  // Only draw if visible
        g.append('rect')
          .attr('x', xStart)
          .attr('y', 0)
          .attr('width', width)
          .attr('height', ih)
          .attr('fill', config.fill)
          .attr('opacity', config.opacity)
          .style('pointer-events', 'none')
      }
    })
    
    // NOTE: Hatching for committed positions removed - Past hours should stay grey
    // Past hours (locked, da, id) are shown in grey background only
    // Only future committed positions would show hatching, but for simplicity we removed all hatching
    
    // Draw separator lines between market phases
    for (let i = 1; i < statusRanges.length; i++) {
      const xSeparator = getHourStartX(statusRanges[i].start)
      const nextStatus = statusRanges[i].status
      
      const strokeColor = '#CFD8DC'
      
      g.append('line')
        .attr('x1', xSeparator)
        .attr('x2', xSeparator)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2,4')
        .style('pointer-events', 'none')
    }
    
    // Temporal markers (NOW, market gates, day boundaries)
    const currentSimHour = Math.max(0, ((Number(currentRound) || 1) - 1) * (Number(roundSpan) || 1))
    const lockedLineHour = (() => {
      const normalized = Number(lockedUntil)
      if (Number.isFinite(normalized) && normalized >= 0) {
        return Math.min(n, normalized)
      }
      const fallback = Math.max(0, Number(freezeHours) || 0)
      return Math.min(n, fallback)
    })()
    const absoluteHourToX = (hourIdx) => {
      const visibleIdx = getVisibleIndexForAbsoluteHour(hourIdx)
      if (!Number.isInteger(visibleIdx)) return null
      return getHourStartX(visibleIdx)
    }
    const formatClock = (hourIdx) => {
      const totalHours = startHour + hourIdx
      const wrapped = ((totalHours % 24) + 24) % 24
      return `${String(wrapped).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`
    }
    const describeDayDelta = (delta) => {
      if (delta === 0) return 'Today'
      if (delta === 1) return 'Tomorrow'
      if (delta === -1) return 'Yesterday'
      return delta > 1 ? `Day +${delta}` : `Day ${delta}`
    }
    const currentAbsHour = startHour + currentSimHour
    const currentDayIndex = Math.floor(currentAbsHour / 24)
    const nextMidnightAbs = (currentDayIndex + 1) * 24
    const nextDayBoundaryHour = nextMidnightAbs - startHour
    const nextDayRightIndex = currentDayIndex + 1
    
    if (currentSimHour >= 0) {
      const nowX = absoluteHourToX(currentSimHour)
      if (nowX != null) {
      
      // Glow effect
      g.append('line')
        .attr('x1', nowX)
        .attr('x2', nowX)
        .attr('y1', -10)
        .attr('y2', ih + 4)
        .attr('stroke', '#FF5252')
        .attr('stroke-width', 3)
        .attr('opacity', 0.3)
      
      // Main line
      g.append('line')
        .attr('x1', nowX)
        .attr('x2', nowX)
        .attr('y1', -10)
        .attr('y2', ih + 4)
        .attr('stroke', '#D32F2F')
        .attr('stroke-width', 2)
        .attr('opacity', 1)
      
      // Pointer triangle at top
      g.append('polygon')
        .attr('points', `${nowX - 5},-10 ${nowX + 5},-10 ${nowX},-2`)
        .attr('fill', '#D32F2F')
        .attr('stroke', '#B71C1C')
        .attr('stroke-width', 1)
      
      g.append('text')
        .attr('x', nowX - 6)
        .attr('y', ih - 12)
        .attr('text-anchor', 'end')
        .attr('fill', '#D32F2F')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .text('NOW')
      g.append('text')
        .attr('x', nowX + 6)
        .attr('y', ih - 12)
        .attr('text-anchor', 'start')
        .attr('fill', '#D32F2F')
        .attr('font-size', 10)
        .text(formatClock(Math.floor(currentSimHour)))
      }
    }

    // Day-Ahead gate marker removed per user request (marker clutter)
    
    if (lockedLineHour > 0 && lockedLineHour < n) {
      const gateX = absoluteHourToX(lockedLineHour)
      if (gateX != null) {
        g.append('line')
          .attr('x1', gateX)
          .attr('x2', gateX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#CFD8DC')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,4')
      }
      
      const leftLabel = currentSimHour >= lockedLineHour ? 'Past' : 'Locked'
      const leftTooltip = currentSimHour >= lockedLineHour 
        ? 'Past hours - Energy already delivered, cannot be modified' 
        : 'Locked - Intraday gate closed, modifications no longer accepted'
      
      const rightLabel = currentSimHour >= lockedLineHour ? 'Intraday' : 'Next Market'
      const rightTooltip = currentSimHour >= lockedLineHour 
        ? 'Intraday Market - Hours still open for ID adjustments' 
        : 'Next Market - Hours available for forecast editing before gate closure'
    }
    
    if (nextDayBoundaryHour > 0 && nextDayBoundaryHour < n) {
      const dayX = absoluteHourToX(nextDayBoundaryHour)
      if (dayX != null) {
      const dayDeltaRight = nextDayRightIndex - currentDayIndex
      const leftLabel = describeDayDelta(0)
      const rightLabel = describeDayDelta(dayDeltaRight)
      
      const leftTooltip = leftLabel === 'Today' 
        ? 'Today - Current calendar day' 
        : leftLabel === 'Tomorrow' 
        ? 'Tomorrow - Next calendar day' 
        : `${leftLabel} - Calendar day boundary`
      
      const rightTooltip = rightLabel === 'Today' 
        ? 'Today - Current calendar day' 
        : rightLabel === 'Tomorrow' 
        ? 'Tomorrow+ - Day after tomorrow and beyond' 
        : `${rightLabel} - Future calendar day`
      
        g.append('line')
          .attr('x1', dayX)
          .attr('x2', dayX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#CFD8DC')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,4')
      }
    }
    
    // Locked zone hatching removed per user request - solid grey background from phase backgrounds is sufficient
    
    // Draw ID (Intraday) zone marker - the tradeable window
    if (Array.isArray(hourStatus)) {
      const idStartIdx = hourStatus.findIndex(s => s === 'id')
      const idEndIdx = hourStatus.lastIndexOf('id')
      
      if (idStartIdx >= 0 && idStartIdx < n) {
        const idStartX = getHourStartX(idStartIdx)
        const idEndX = getHourRightX(idEndIdx)
        const idWidth = idEndX - idStartX
        
        // Background stays white; keep only boundary lines for ID zone
        
        // Draw vertical lines at ID zone boundaries
        g.append('line')
          .attr('x1', idStartX)
          .attr('x2', idStartX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#CFD8DC')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,4')
        
        g.append('line')
          .attr('x1', idEndX)
          .attr('x2', idEndX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#CFD8DC')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,4')
      }
      
      // Draw DA zone marker (between locked and ID, or after ID and before future)
      const daStartIdx = hourStatus.findIndex(s => s === 'da')
      const daEndIdx = hourStatus.lastIndexOf('da')
      
      if (daStartIdx >= 0 && daStartIdx < n) {
        const daStartX = getHourStartX(daStartIdx)
        const daEndX = getHourRightX(daEndIdx)
        const daWidth = daEndX - daStartX
        
        // Background stays white; DA zone is represented via baseline and DA/ID fills only
      }
    }
    
    // Remove special future-zone overlay to keep forecast fully editable and visually clean
    
    // Draw DA Baseline and market area fills if provided
    if (daBaseline && Array.isArray(daBaseline) && daBaseline.length > 0) {
      const baselineData = daBaseline.map((val, i) => ({ i, v: val }))
      const extendedBaseline = baselineData.length > 0
        ? [...baselineData, { i: baselineData[baselineData.length - 1].i + 1, v: baselineData[baselineData.length - 1].v }]
        : baselineData
      
      // 1. DA baseline is shown as a line only (no filled area). The shaded
      // region below is intentionally omitted so the chart only highlights the
      // green/red DA-vs-forecast difference band drawn next.

      // 2. Fill area between DA baseline and current forecast
      // Green = ID buy (current > DA), Red = ID sell (current < DA)
      // IMPORTANT: Use committedPosition for hours before ID gate, hours for forecast hours
      if (hours && hours.length > 0) {
        const minLen = Math.min(hours.length, daBaseline.length)
        
        // Find next ID gate (first hour with status != "id" after current locked hours)
        let nextIdGateHour = minLen
        if (Array.isArray(hourStatus)) {
          const firstIdIdx = hourStatus.findIndex((s, idx) => idx >= lockedUntil && s === 'id')
          const lastIdIdx = hourStatus.findLastIndex(s => s === 'id')
          if (firstIdIdx >= 0 && lastIdIdx >= firstIdIdx) {
            nextIdGateHour = lastIdIdx + 1  // First hour after last "id" status
          }
        }
        
        // Create combined data for area between lines
        const combinedData = []
        for (let i = 0; i < minLen; i++) {
          const isIdHour = Array.isArray(hourStatus) ? hourStatus[i] === 'id' : true

          // ID area visualization should only appear in IDM hours.
          // Outside IDM, force current to DA baseline so no green/red delta is painted.
          if (!isIdHour) {
            const daValue = Number(daBaseline[i]) || 0
            combinedData.push({
              i,
              current: daValue,
              da: daValue
            })
            continue
          }

          // For hours before ID gate: use committedPosition if available (shows actual committed ID position)
          // For hours after ID gate: use current editable forecast (shows planned position)
          const useCommitted = idmTradingStatus !== 'on'
            && i < nextIdGateHour
            && Array.isArray(committedPosition)
            && i < committedPosition.length
          const currentValue = useCommitted ? Number(committedPosition[i]) || 0 : Number(hours[i]) || 0
          
          combinedData.push({
            i,
            current: currentValue,
            da: Number(daBaseline[i]) || 0
          })
        }

        // Extend by one point so DA/ID difference is also visible
        // in the last hour block (e.g. 23:00–24:00)
        const extendedCombined = combinedData.length > 0
          ? [
              ...combinedData,
              {
                i: combinedData[combinedData.length - 1].i + 1,
                current: combinedData[combinedData.length - 1].current,
                da: combinedData[combinedData.length - 1].da
              }
            ]
          : combinedData
        
        // 0. Grey floor area below the active position (the kept / committed
        //    volume). Everything below the baseline (and below the forecast when
        //    selling) is rendered grey; the green/red band drawn next highlights the
        //    DA-vs-forecast difference (green = buy at IDM, red = sell at IDM).
        const baselineFloorArea = d3.area()
          .x(d => getHourStartX(d.i))
          .y0(ih)
          .y1(d => y(Math.min(d.current, d.da)))
          .curve(d3.curveStepAfter)

        g.append('path')
          .datum(extendedCombined)
          .attr('fill', '#9e9e9e')
          .attr('opacity', 0.18)
          .attr('d', baselineFloorArea)
          .style('pointer-events', 'none')

        // ID Buy area (current > DA) - Green
        const idBuyArea = d3.area()
          .x(d => getHourStartX(d.i))
          .y0(d => y(d.da))
          .y1(d => y(Math.max(d.current, d.da)))
          .curve(d3.curveStepAfter)
        
        g.append('path')
          .datum(extendedCombined)
          .attr('fill', '#4caf50')
          .attr('opacity', 0.25)
          .attr('d', idBuyArea)
          .style('pointer-events', 'none')
        
        // ID Sell area (current < DA) - Red
        const idSellArea = d3.area()
          .x(d => getHourStartX(d.i))
          .y0(d => y(d.da))
          .y1(d => y(Math.min(d.current, d.da)))
          .curve(d3.curveStepAfter)
        
        g.append('path')
          .datum(extendedCombined)
          .attr('fill', '#f44336')
          .attr('opacity', 0.25)
          .attr('d', idSellArea)
          .style('pointer-events', 'none')
      }
      
      // Draw DA baseline line (dotted grey)
      const baselinePath = d3.line()
        .x(d => getHourStartX(d.i))
        .y(d => y(d.v))
        .curve(d3.curveStepAfter)
      
      g.append('path')
        .datum(extendedBaseline)
        .attr('fill', 'none')
        .attr('stroke', '#666')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4')
        .attr('d', baselinePath)
        .attr('opacity', 0.8)
      
      // Legends removed per user request (DA, ID+, ID- visual clutter)
    }

    // Draw previous round dispatch line (solid lighter grey)
    if (prevDispatch && Array.isArray(prevDispatch) && prevDispatch.length > 0) {
      const prevData = prevDispatch.map((val, i) => ({ i, v: val }))
      const extendedPrev = [
        ...prevData,
        { i: prevData[prevData.length - 1].i + 1, v: prevData[prevData.length - 1].v }
      ]
      const prevPath = d3.line()
        .x(d => getHourStartX(d.i))
        .y(d => y(d.v))
        .curve(d3.curveStepAfter)
      g.append('path')
        .datum(extendedPrev)
        .attr('fill', 'none')
        .attr('stroke', '#bdbdbd')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2,3')
        .attr('d', prevPath)
        .attr('opacity', 0.75)
    }
    
    // Draw device-specific reference lines
    refLines.forEach(ref => {
      const yPos = y(ref.value)
      if (yPos >= -10 && yPos <= ih + 10) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', iw)
          .attr('y1', yPos)
          .attr('y2', yPos)
          .attr('stroke', ref.color)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', ref.dash)
          .attr('opacity', 0.7)
        
        g.append('text')
          .attr('x', iw - 4)
          .attr('y', yPos - 4)
          .attr('text-anchor', 'end')
          .attr('fill', ref.color)
          .attr('font-size', '10px')
          .attr('font-weight', 'bold')
          .text(ref.label)
        
        g.append('text')
          .attr('x', 4)
          .attr('y', yPos - 4)
          .attr('text-anchor', 'start')
          .attr('fill', ref.color)
          .attr('font-size', '9px')
          .attr('font-weight', 'bold')
          .text(`${ref.value.toFixed(0)} MW`)
      }
    })

    // axes
    // X-axis with time labels only (no day labels per user request)
    const tickStep = Math.max(1, Math.ceil(displaySlots.length / 10))
    const tickIndices = displaySlots.map((_, idx) => idx).filter((idx) => idx % tickStep === 0 || idx === displaySlots.length - 1)
    const xAxis = d3.axisBottom(x)
      .tickValues(tickIndices.map((idx) => displaySlots[idx]))
      .tickFormat((slot) => {
      const idx = displaySlots.findIndex((value) => value === slot)
      const totalHours = startHour + (displayHourIndices[idx] ?? idx)
      const hourOfDay = ((totalHours % 24) + 24) % 24
      
      return `${String(hourOfDay).padStart(2, '0')}:00`
    })
    
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '10px')
    
    g.append('g').call(d3.axisLeft(y).ticks(6))

    lineGenerator = (values) => buildLineSegments(values).map((segment) => {
      if (!segment || segment.length === 0) return null
      let path = `M ${getHourStartX(segment[0].i)} ${y(segment[0].v)}`
      segment.forEach((point, idx) => {
        path += ` L ${getHourRightX(point.i)} ${y(point.v)}`
        const nextPoint = segment[idx + 1]
        if (nextPoint) {
          path += ` L ${getHourRightX(point.i)} ${y(nextPoint.v)}`
        }
      })
      return path
    }).filter(Boolean)

    // path
    pathSelection = g.selectAll('path.forecast-line').data(lineGenerator(hours)).enter().append('path')
      .attr('class', 'forecast-line')
      .attr('fill', 'none')
      .attr('stroke', '#1976d2')
      .attr('stroke-width', 2)
      .attr('d', (d) => d)

    const lockedColor = '#9e9e9e'
    const futureColor = '#90caf9'  // Light blue for future hours
    const unlockedColor = '#1976d2'
    const activeColor = '#d32f2f'
    let pts = null

    const pointColor = (d) => {
      if (!isHourEditable(d.i)) {
        // Check if it's future or locked
        if (Array.isArray(hourStatus) && hourStatus[d.i] === 'future') return futureColor
        return lockedColor
      }
      if (activePointIndex !== null && d.i === activePointIndex) return activeColor
      return unlockedColor
    }

    const updateActivePoint = (idx, engaged) => {
      const canHighlight = engaged && Number.isInteger(idx) && isHourEditable(idx) && idx < n
      if (canHighlight) {
        activePointIndex = idx
        dragStateRef.current.index = idx
        dragStateRef.current.engaged = true
      } else {
        activePointIndex = null
        dragStateRef.current.index = null
        dragStateRef.current.engaged = false
      }
      try {
        if (pts) pts.attr('fill', pointColor)
      } catch (_) {}
    }

    const highlightPoint = (idx) => updateActivePoint(idx, true)
    const clearActivePoint = () => updateActivePoint(null, false)
    
    // Check if an hour index is editable
    // "locked" = past (executed), "future" = beyond horizon - NOT editable
    // "da" = DA bidding (Round 1), "id" = ID trading (Round 2+) - BOTH editable
    const isHourEditable = (idx) => {
      if (editableIndexSet) return editableIndexSet.has(idx)
      if (idx < lockedUntil) return false
      if (Array.isArray(hourStatus)) {
        const status = hourStatus[idx]
        // Only locked and future are NOT editable
        if (status === 'locked' || status === 'future') return false
      }
      return true
    }

    // overlay for drag anywhere
    const applySoft = (centerIdx, newCenterVal) => {
      if (!Array.isArray(hours) || typeof onChange !== 'function') return
      if (!Number.isInteger(centerIdx)) return
      if (!isHourEditable(centerIdx) || centerIdx < 0 || centerIdx >= workingHours.length) return
      const R = Math.max(0, Math.min(6, Number(smoothRadius) || 0))
      const clampedCenter = clampY(newCenterVal)
      const base = workingHours[centerIdx] ?? 0
      const delta = clampedCenter - base
      // Update center first
      commitValue(centerIdx, clampedCenter)
      if (R === 0 || delta === 0) return
      const isConnectedToLeft = (idx) => idx >= 0 && idx + 1 < displayHourIndices.length && displayHourIndices[idx + 1] === displayHourIndices[idx] + 1
      const isConnectedToRight = (idx) => idx - 1 >= 0 && idx < displayHourIndices.length && displayHourIndices[idx] === displayHourIndices[idx - 1] + 1
      // Then adjust neighbors with triangular falloff
      for (let d = 1; d <= R; d++){
        const w = (R - d + 1) / (R + 1) // linear falloff
        const left = centerIdx - d
        const right = centerIdx + d
        if (left >= 0 && isConnectedToLeft(left) && isHourEditable(left)){
          const targetLeft = clampY((workingHours[left] ?? 0) + delta * w)
          commitValue(left, targetLeft)
        }
        if (right < workingHours.length && isConnectedToRight(right) && isHourEditable(right)){
          const targetRight = clampY((workingHours[right] ?? 0) + delta * w)
          commitValue(right, targetRight)
        }
      }
      syncWorkingHoursToChart()
    }

    const overlayDrag = d3.drag()
      .on('start', function(event) {
        const [x0Raw, y0] = d3.pointer(event, g.node())
        const x0 = Math.max(0, Math.min(iw, x0Raw))  // Clamp X to chart area
        const idx = findNearestVisibleIndex(x0)
        const rawValue = y.invert(y0)
        const value = clampY(rawValue)
        if (!isHourEditable(idx)) {
          clearActivePoint()
          return
        }
        highlightPoint(idx)
      })
      .on('drag', function(event) {
        const [x0Raw, y0] = d3.pointer(event, g.node())
        const x0 = Math.max(0, Math.min(iw, x0Raw))  // Clamp X to chart area
        const idx = findNearestVisibleIndex(x0)
        if (!isHourEditable(idx)) {
          clearActivePoint()
          return
        }
        if (idx !== activePointIndex) {
          highlightPoint(idx)
        }
        const rawVal = y.invert(y0)
        const newVal = clampY(rawVal)
        applySoft(idx, newVal)
      })
      .on('end', () => {
        clearActivePoint()
      })
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', iw)
      .attr('height', ih)
      .attr('fill', 'transparent')
      .style('cursor', 'ns-resize')
      .style('pointer-events', 'all')
      .attr('class', 'forecast-overlay')
      .call(overlayDrag)

    // drag behavior
    const drag = d3.drag()
      .on('start', function(event, d) {
        const [, y0] = d3.pointer(event, g.node())
        const rawValue = y.invert(y0)
        const value = clampY(rawValue)
        if (!isHourEditable(d.i)) {
          clearActivePoint()
          return
        }
        highlightPoint(d.i)
      })
      .on('drag', function(event, d) {
        const i = d.i
        if (!isHourEditable(i)) {
          clearActivePoint()
          return
        }
        const [, y0] = d3.pointer(event, g.node())
        const rawVal = y.invert(y0)
        const newVal = clampY(rawVal)
        applySoft(i, newVal)
        // move the dragged point immediately for visual feedback
        try { d3.select(this).attr('cy', y(newVal)) } catch(_) {}
      })
      .on('end', () => {
        clearActivePoint()
      })

    // points
    const pointData = hours.map((v, i) => ({ v, i }))
    pts = g.selectAll('circle.point').data(pointData).enter().append('circle')
      .attr('class', 'point')
      .attr('cx', (d) => getHourCenterX(d.i))
      .attr('cy', (d) => y(d.v))
      .attr('r', 4)
      .attr('fill', pointColor)

    // Larger invisible hit-area to make drag easier
    const pointHitSelection = g.selectAll('circle.point-hit').data(pointData).enter().append('circle')
      .attr('class', 'point-hit')
      .attr('cx', (d) => getHourCenterX(d.i))
      .attr('cy', (d) => y(d.v))
      .attr('r', 12)
      .attr('fill', 'transparent')
      .style('cursor', (d) => (isHourEditable(d.i) ? 'ns-resize' : 'not-allowed'))
      .style('pointer-events', 'all')
    hitAreas = pointHitSelection
    pointHitSelection
      .filter((d) => isHourEditable(d.i))
      .call(drag)

    // Keep visible points on top of hit-areas
    try { pts.raise() } catch(_) {}

    if (dragStateRef.current.engaged && Number.isInteger(dragStateRef.current.index)) {
      highlightPoint(dragStateRef.current.index)
    } else {
      clearActivePoint()
    }

    // Ensure overlay is on top to capture drags anywhere
    try { g.select('rect.forecast-overlay').raise() } catch(_) {}

    // labels
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Power (MW) per hour')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, hourIndices, editableIndices, lockedUntil, onChange, maxValue, effectiveLimitMw, smoothRadius, deviceType, deviceParams, currentRound, roundSpan, freezeHours, dayAheadGateHour, startTime, fakeDate, daBaseline, prevDispatch, hourStatus, totalRounds, containerWidth])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg ref={ref} role="img" aria-label="Forecast editor chart" style={{ border: '1px solid #eee', borderRadius: 4 }} />
    </div>
  )
}
