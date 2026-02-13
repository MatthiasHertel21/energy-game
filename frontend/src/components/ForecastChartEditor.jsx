import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

/**
 * ForecastChartEditor
 * Interactive line chart for editing hourly forecast values by dragging points.
 * Props:
 * - hours: number[]
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
 * - hourStatus: string[] (optional: per-hour status: "locked", "da", "id", "future")
 * - daCommittedStart: number (optional: first hour of DA committed range)
 * - daCommittedEnd: number (optional: last hour+1 of DA committed range)
 */
export default function ForecastChartEditor({
  hours = [],
  lockedUntil = 0,
  onChange,
  maxValue,
  smoothRadius = 3,
  deviceType = '',
  deviceParams = {},
  currentRound = 1,
  roundSpan = 6,
  freezeHours = 6,
  dayAheadGateHour = 12,
  startTime = '00:00',
  daBaseline = null,
  committedPosition = null,
  hourStatus = [],
  totalRounds = null,
  daCommittedStart = -1,
  daCommittedEnd = -1
}){
  const ref = useRef(null)
  const dragStateRef = useRef({ index: null, engaged: false })

  useEffect(() => {
    if (!ref.current) return
    if (dragStateRef.current.engaged) {
      // Skip tearing down the chart while an active drag is in progress.
      return
    }

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    svg.style('touch-action', 'none')

    const W = 700, H = 420
    const M = { top: 16, right: 20, bottom: 36, left: 46 }
    const iw = W - M.left - M.right
    const ih = H - M.top - M.bottom

    const g = svg.attr('width', W).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const n = Math.max(1, hours.length)
    const seriesMax = Math.max(1, d3.max(hours) || 1)
    const hintedMax = Number.isFinite(Number(maxValue)) ? Number(maxValue) : 0
    
    // Calculate device-specific reference lines
    const deviceTypeNorm = (deviceType || '').toLowerCase()
    const refLines = []
    
    if (['coal', 'gas', 'hydro', 'nuclear'].includes(deviceTypeNorm)) {
      // Thermal generators: max_power, min_load
      const maxPower = deviceParams.max_power_mw || deviceParams.capacity_mw || 0
      const minLoadPct = deviceParams.min_load_pct || 0
      const minPower = (minLoadPct / 100) * maxPower
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Max Power', color: '#d32f2f', dash: '3,0', tooltip: `Maximum power output capacity: ${maxPower.toFixed(1)} MW` })
      if (minPower > 0) refLines.push({ value: minPower, label: `Min Load (${minLoadPct}%)`, color: '#f57c00', dash: '4,2', tooltip: `Minimum stable load: ${minPower.toFixed(1)} MW (${minLoadPct}% of max power)` })
    } else if (['solar', 'wind'].includes(deviceTypeNorm)) {
      // Renewables: max_power, expected output
      const maxPower = deviceParams.max_power_mw || deviceParams.capacity_mw || 0
      const capFactor = deviceParams.capacity_factor_pct || 0
      const expected = (capFactor / 100) * maxPower
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Max Power', color: '#d32f2f', dash: '3,0', tooltip: `Maximum power output capacity: ${maxPower.toFixed(1)} MW` })
      if (expected > 0) refLines.push({ value: expected, label: `Expected (${capFactor}% CF)`, color: '#388e3c', dash: '5,3', tooltip: `Expected output based on ${capFactor}% Capacity Factor (CF): ${expected.toFixed(1)} MW` })
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
      const peak = deviceParams.peak_load_mw || 0
      const drCapacity = deviceParams.demand_response_capacity_mw || 0
      const drmCapable = deviceParams.drm_capable
      
      if (peak > 0) refLines.push({ value: peak, label: 'Peak Load', color: '#d32f2f', dash: '3,0', tooltip: `Peak load consumption: ${peak.toFixed(1)} MW` })
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
    const x = d3.scaleLinear().domain([1, n + 1]).range([0, iw])
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

    const syncWorkingHoursToChart = () => {
      if (pathSelection && lineGenerator) {
        pathSelection.attr('d', lineGenerator(workingHours))
      }
      if (pts) {
        pts
          .attr('cy', (d) => y(workingHours[d.i]))
          .each((d) => {
            d.v = workingHours[d.i]
          })
      }
      if (hitAreas) {
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
        if (i === hourStatus.length || hourStatus[i] !== currentStatus) {
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
    
    // DAM hatch pattern: Yellow / (45 degrees)
    const damHatchPattern = defs.append('pattern')
      .attr('id', 'dam-committed-hatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)')
    damHatchPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#FDD835')
      .attr('opacity', 0.15)
    damHatchPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#FDD835')
      .attr('stroke-width', 2)
      .attr('opacity', 0.4)
    
    // IDM hatch pattern: Orange \ (-45 degrees)
    const idmHatchPattern = defs.append('pattern')
      .attr('id', 'idm-committed-hatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(-45)')
    idmHatchPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#FB8C00')
      .attr('opacity', 0.15)
    idmHatchPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#FB8C00')
      .attr('stroke-width', 2)
      .attr('opacity', 0.4)
    
    // Color and label mapping for each phase
    // Colors match timeline (lighter versions): DAM=Light Yellow, IDM=Light Orange, Past=Light Grey, Forecast=Light Blue
    const phaseConfig = {
      locked: { color: '#F5F5F5', opacity: 0.60, label: 'Settled', textColor: '#757575' },
      id: { color: '#FFE0B2', opacity: 0.50, label: 'Intraday Market', textColor: '#E65100' },
      da: { color: '#FFF9C4', opacity: 0.50, label: 'Day-Ahead Market', textColor: '#F57F17' },
      da_r1: { color: '#B2EBF2', opacity: 0.50, label: 'Day-Ahead (R1)', textColor: '#00ACC1' },
      forecast: { color: '#E3F2FD', opacity: 0.35, label: 'Forecast', textColor: '#1565C0' }
    }
    
    // Draw background rectangles for each phase
    statusRanges.forEach(range => {
      const config = phaseConfig[range.status] || phaseConfig.future
      const xStart = x(Math.max(1, range.start + 1))
      const xEnd = x(Math.min(n + 1, range.end + 1))
      const width = xEnd - xStart
      
      if (width > 5) {  // Only draw if visible
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
    
    // Add hatching for committed positions
    // 1. DAM committed area (yellow / hatch)
    if (daCommittedStart >= 0 && daCommittedEnd > daCommittedStart) {
      const damXStart = x(Math.max(1, daCommittedStart + 1))
      const damXEnd = x(Math.min(n + 1, daCommittedEnd + 1))
      const damWidth = damXEnd - damXStart
      
      if (damWidth > 0.5) {
        g.append('rect')
          .attr('x', damXStart)
          .attr('y', 0)
          .attr('width', damWidth)
          .attr('height', ih)
          .attr('fill', 'url(#dam-committed-hatch)')
          .style('pointer-events', 'none')
      }
    }
    
    // 2. IDM committed area (orange \ hatch)
    // Find all hours with status "id" - these are committed ID positions (exclude locked)
    if (Array.isArray(hourStatus)) {
      let idStart = -1
      for (let i = 0; i < hourStatus.length; i++) {
        const isId = hourStatus[i] === 'id'
        const isLocked = hourStatus[i] === 'locked'
        
        if (isId && !isLocked && idStart === -1) {
          // Start of ID range
          idStart = i
        } else if ((!isId || isLocked) && idStart !== -1) {
          // End of ID range
          const idXStart = x(Math.max(1, idStart + 1))
          const idXEnd = x(Math.min(n + 1, i + 1))
          const idWidth = idXEnd - idXStart
          
          if (idWidth > 0.5) {
            g.append('rect')
              .attr('x', idXStart)
              .attr('y', 0)
              .attr('width', idWidth)
              .attr('height', ih)
              .attr('fill', 'url(#idm-committed-hatch)')
              .style('pointer-events', 'none')
          }
          
          idStart = -1
        }
      }
      
      // Handle last range if it extends to the end
      if (idStart !== -1) {
        const idXStart = x(Math.max(1, idStart + 1))
        const idXEnd = x(Math.min(n + 1, hourStatus.length + 1))
        const idWidth = idXEnd - idXStart
        
        if (idWidth > 0.5) {
          g.append('rect')
            .attr('x', idXStart)
            .attr('y', 0)
            .attr('width', idWidth)
            .attr('height', ih)
            .attr('fill', 'url(#idm-committed-hatch)')
            .style('pointer-events', 'none')
        }
      }
    }
    
    // Draw separator lines between market phases
    for (let i = 1; i < statusRanges.length; i++) {
      const xSeparator = x(statusRanges[i].start + 1)
      const nextStatus = statusRanges[i].status
      
      // Color separator based on the phase it leads into
      let strokeColor = '#424242' // Default gray
      if (nextStatus === 'id') {
        strokeColor = '#FB8C00' // Orange for IDM
      } else if (nextStatus === 'da' || nextStatus === 'da_r1') {
        strokeColor = '#FDD835' // Yellow for DAM
      }
      
      g.append('line')
        .attr('x1', xSeparator)
        .attr('x2', xSeparator)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4')
        .style('pointer-events', 'none')
    }
    
    // Temporal markers (NOW, market gates, day boundaries)
    const parsedStart = String(startTime || '00:00').split(':')
    const startHour = Number(parsedStart[0]) || 0
    const startMinute = Number(parsedStart[1]) || 0
    const currentSimHour = Math.max(0, ((Number(currentRound) || 1) - 1) * (Number(roundSpan) || 1))
    const lockedLineHour = (() => {
      const normalized = Number(lockedUntil)
      if (Number.isFinite(normalized) && normalized >= 0) {
        return Math.min(n, normalized)
      }
      const fallback = Math.max(0, Number(freezeHours) || 0)
      return Math.min(n, fallback)
    })()
    const hourToX = (hourIdx) => {
      const domainHour = Math.max(1, Math.min(n + 1, (hourIdx || 0) + 1))
      return x(domainHour)
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
      const nowX = hourToX(currentSimHour)
      
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

    // Day-Ahead gate marker removed per user request (marker clutter)
    
    if (lockedLineHour > 0 && lockedLineHour < n) {
      const gateX = hourToX(lockedLineHour)
      g.append('line')
        .attr('x1', gateX)
        .attr('x2', gateX)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', '#ff9800')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
      
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
      const dayX = hourToX(nextDayBoundaryHour)
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
        .attr('stroke', '#9c27b0')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
    }
    
    // Locked zone hatching removed per user request - solid grey background from phase backgrounds is sufficient
    
    // Draw ID (Intraday) zone marker - the tradeable window
    if (Array.isArray(hourStatus)) {
      const idStartIdx = hourStatus.findIndex(s => s === 'id')
      const idEndIdx = hourStatus.lastIndexOf('id')
      
      if (idStartIdx >= 0 && idStartIdx < n) {
        const idStartX = hourToX(idStartIdx)
        const idEndX = hourToX(idEndIdx + 1)
        const idWidth = idEndX - idStartX
        
        // Background stays white; keep only boundary lines for ID zone
        
        // Draw vertical lines at ID zone boundaries
        g.append('line')
          .attr('x1', idStartX)
          .attr('x2', idStartX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#4caf50')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,3')
        
        g.append('line')
          .attr('x1', idEndX)
          .attr('x2', idEndX)
          .attr('y1', 0)
          .attr('y2', ih)
          .attr('stroke', '#4caf50')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,3')
      }
      
      // Draw DA zone marker (between locked and ID, or after ID and before future)
      const daStartIdx = hourStatus.findIndex(s => s === 'da')
      const daEndIdx = hourStatus.lastIndexOf('da')
      
      if (daStartIdx >= 0 && daStartIdx < n) {
        const daStartX = hourToX(daStartIdx)
        const daEndX = hourToX(daEndIdx + 1)
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
      
      // 1. Fill area from X-axis to DA baseline (grey) - DA Position
      const daAreaPath = d3.area()
        .x(d => x(d.i + 1))
        .y0(ih) // Bottom (X-axis)
        .y1(d => y(d.v))
        .curve(d3.curveStepAfter)
      
      g.append('path')
        .datum(extendedBaseline)
        .attr('fill', '#9e9e9e')
        .attr('opacity', 0.15)
        .attr('d', daAreaPath)
      
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
          // For hours before ID gate: use committedPosition if available (shows actual committed ID position)
          // For hours after ID gate: use current editable forecast (shows planned position)
          const useCommitted = i < nextIdGateHour && Array.isArray(committedPosition) && i < committedPosition.length
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
        
        // ID Buy area (current > DA) - Green
        const idBuyArea = d3.area()
          .x(d => x(d.i + 1))
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
          .x(d => x(d.i + 1))
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
        .x(d => x(d.i + 1))
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
    // X-axis with day/time labels (Tomorrow removed per user request)
    const xAxis = d3.axisBottom(x).ticks(Math.min(n + 1, 12)).tickFormat((hourNum) => {
      const hourIdx = Math.round(hourNum) - 1
      const totalHours = startHour + hourIdx
      const dayOffset = Math.floor(totalHours / 24)
      const hourOfDay = ((totalHours % 24) + 24) % 24
      
      // Show day label for first hour of each day or first tick
      if (hourOfDay === 0 || hourIdx === 0) {
        const dayLabel = dayOffset === 0 ? 'Today' : `Day ${dayOffset + 1}`
        return `${dayLabel}\n${String(hourOfDay).padStart(2, '0')}:00`
      }
      return `${String(hourOfDay).padStart(2, '0')}:00`
    })
    
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '10px')
    
    g.append('g').call(d3.axisLeft(y).ticks(6))

    const line = d3.line().x((d, i) => x(i + 1)).y((d) => y(d)).curve(d3.curveStepAfter)
    lineGenerator = line

    // path
    const path = g.append('path').datum(hours).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)
    pathSelection = path

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
      // Then adjust neighbors with triangular falloff
      for (let d = 1; d <= R; d++){
        const w = (R - d + 1) / (R + 1) // linear falloff
        const left = centerIdx - d
        const right = centerIdx + d
        if (isHourEditable(left) && left >= 0){
          const targetLeft = clampY((workingHours[left] ?? 0) + delta * w)
          commitValue(left, targetLeft)
        }
        if (isHourEditable(right) && right < workingHours.length){
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
        const idx = Math.max(0, Math.min(n - 1, Math.round(x.invert(x0)) - 1))
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
        let idx = Math.round(x.invert(x0)) - 1
        idx = Math.max(0, Math.min(n - 1, idx))
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
      .attr('cx', (d) => x(d.i + 1))
      .attr('cy', (d) => y(d.v))
      .attr('r', 4)
      .attr('fill', pointColor)

    // Larger invisible hit-area to make drag easier
    const pointHitSelection = g.selectAll('circle.point-hit').data(pointData).enter().append('circle')
      .attr('class', 'point-hit')
      .attr('cx', (d) => x(d.i + 1))
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
    g.append('text').attr('x', iw / 2).attr('y', ih + 28).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Hour')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Power (MW) per hour')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, lockedUntil, onChange, maxValue, smoothRadius, deviceType, deviceParams, currentRound, roundSpan, freezeHours, dayAheadGateHour, startTime, daBaseline, hourStatus, totalRounds])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg ref={ref} role="img" aria-label="Forecast editor chart" style={{ border: '1px solid #eee', borderRadius: 4 }} />
    </div>
  )
}
