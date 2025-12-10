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
  startTime = '00:00'
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

    const W = 700, H = 320
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
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Max Power', color: '#d32f2f', dash: '3,0' })
      if (minPower > 0) refLines.push({ value: minPower, label: `Min Load (${minLoadPct}%)`, color: '#f57c00', dash: '4,2' })
    } else if (['solar', 'wind'].includes(deviceTypeNorm)) {
      // Renewables: max_power, expected output
      const maxPower = deviceParams.max_power_mw || deviceParams.capacity_mw || 0
      const capFactor = deviceParams.capacity_factor_pct || 0
      const expected = (capFactor / 100) * maxPower
      
      if (maxPower > 0) refLines.push({ value: maxPower, label: 'Max Power', color: '#d32f2f', dash: '3,0' })
      if (expected > 0) refLines.push({ value: expected, label: `Expected (${capFactor}% CF)`, color: '#388e3c', dash: '5,3' })
    } else if (deviceTypeNorm === 'battery') {
      // Battery: +/- power rating
      const powerMw = deviceParams.power_mw || deviceParams.power_rating_mw || 0
      if (powerMw > 0) {
        refLines.push({ value: powerMw, label: 'Max Charge', color: '#388e3c', dash: '3,0' })
        refLines.push({ value: -powerMw, label: 'Max Discharge', color: '#c62828', dash: '3,0' })
      }
    } else if (deviceTypeNorm.includes('load')) {
      // Load devices: baseline, peak, DR capacity
      const baseline = deviceParams.baseline_load_mw || 0
      const peak = deviceParams.peak_load_mw || 0
      const drCapacity = deviceParams.demand_response_capacity_mw || 0
      const drmCapable = deviceParams.drm_capable
      
      if (peak > 0) refLines.push({ value: peak, label: 'Peak Load', color: '#d32f2f', dash: '3,0' })
      if (baseline > 0) refLines.push({ value: baseline, label: 'Baseline', color: '#1976d2', dash: '4,2' })
      if (drmCapable && drCapacity > 0 && baseline > drCapacity) {
        refLines.push({ value: baseline - drCapacity, label: 'DR Minimum', color: '#fbc02d', dash: '5,3' })
      }
    }
    
    // Calculate y-domain including reference lines
    const allValues = [...hours, ...refLines.map(r => r.value), seriesMax, hintedMax || 0, 0]
    const yMin = Math.min(...allValues, 0)
    const targetMax = hintedMax || seriesMax
    const yMax = Math.max(targetMax * 1.05, seriesMax * 1.2, ...refLines.map(r => Math.abs(r.value)), 10)

    const x = d3.scaleLinear().domain([1, n]).range([0, iw])
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
      const domainHour = Math.max(1, Math.min(n, (hourIdx || 0) + 1))
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
      g.append('line')
        .attr('x1', nowX)
        .attr('x2', nowX)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', '#e91e63')
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.85)
      g.append('text')
        .attr('x', nowX - 6)
        .attr('y', ih - 12)
        .attr('text-anchor', 'end')
        .attr('fill', '#e91e63')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .text('NOW')
      g.append('text')
        .attr('x', nowX + 6)
        .attr('y', ih - 12)
        .attr('text-anchor', 'start')
        .attr('fill', '#e91e63')
        .attr('font-size', 10)
        .text(formatClock(Math.floor(currentSimHour)))
    }
    
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
      const rightLabel = currentSimHour >= lockedLineHour ? 'Intraday' : 'Next Market'
      g.append('text')
        .attr('x', gateX - 6)
        .attr('y', 14)
        .attr('text-anchor', 'end')
        .attr('fill', '#ff9800')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .text(leftLabel)
      g.append('text')
        .attr('x', gateX + 6)
        .attr('y', 14)
        .attr('text-anchor', 'start')
        .attr('fill', '#2196f3')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .text(rightLabel)
    }
    
    if (nextDayBoundaryHour > 0 && nextDayBoundaryHour < n) {
      const dayX = hourToX(nextDayBoundaryHour)
      const dayDeltaRight = nextDayRightIndex - currentDayIndex
      const leftLabel = describeDayDelta(0)
      const rightLabel = describeDayDelta(dayDeltaRight)
      g.append('line')
        .attr('x1', dayX)
        .attr('x2', dayX)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', '#9c27b0')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
      g.append('text')
        .attr('x', dayX - 6)
        .attr('y', 14)
        .attr('text-anchor', 'end')
        .attr('fill', '#2196f3')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .text(leftLabel)
      g.append('text')
        .attr('x', dayX + 6)
        .attr('y', 14)
        .attr('text-anchor', 'start')
        .attr('fill', '#9c27b0')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .text(rightLabel)
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
    // X-axis with day/time labels
    const xAxis = d3.axisBottom(x).ticks(Math.min(n, 12)).tickFormat((hourNum) => {
      const hourIdx = Math.round(hourNum) - 1
      const totalHours = startHour + hourIdx
      const dayOffset = Math.floor(totalHours / 24)
      const hourOfDay = ((totalHours % 24) + 24) % 24
      
      // Show day label for first hour of each day or first tick
      if (hourOfDay === 0 || hourIdx === 0) {
        const dayLabel = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : `Day ${dayOffset + 1}`
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

    const line = d3.line().x((d, i) => x(i + 1)).y((d) => y(d))
    lineGenerator = line

    // path
    const path = g.append('path').datum(hours).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)
    pathSelection = path

    const lockedColor = '#9e9e9e'
    const unlockedColor = '#1976d2'
    const activeColor = '#d32f2f'
    let pts = null

    const pointColor = (d) => {
      if (d.i < lockedUntil) return lockedColor
      if (activePointIndex !== null && d.i === activePointIndex) return activeColor
      return unlockedColor
    }

    const updateActivePoint = (idx, engaged) => {
      const canHighlight = engaged && Number.isInteger(idx) && idx >= lockedUntil && idx < n
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

    // overlay for drag anywhere
    const applySoft = (centerIdx, newCenterVal) => {
      if (!Array.isArray(hours) || typeof onChange !== 'function') return
      if (!Number.isInteger(centerIdx)) return
      if (centerIdx < lockedUntil || centerIdx < 0 || centerIdx >= workingHours.length) return
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
        if (left >= lockedUntil && left >= 0){
          const targetLeft = clampY((workingHours[left] ?? 0) + delta * w)
          commitValue(left, targetLeft)
        }
        if (right >= lockedUntil && right < workingHours.length){
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
        if (idx < lockedUntil) {
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
        if (idx < lockedUntil) {
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
        if (d.i < lockedUntil) {
          clearActivePoint()
          return
        }
        highlightPoint(d.i)
      })
      .on('drag', function(event, d) {
        const i = d.i
        if (i < lockedUntil) {
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
      .style('cursor', (d) => (d.i < lockedUntil ? 'not-allowed' : 'ns-resize'))
      .style('pointer-events', 'all')
    hitAreas = pointHitSelection
    pointHitSelection
      .filter((d) => d.i >= lockedUntil)
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
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Forecast (MWh)')
  }, [hours, lockedUntil, onChange, maxValue, smoothRadius, deviceType, deviceParams, currentRound, roundSpan, freezeHours, startTime])

  return (
    <svg ref={ref} role="img" aria-label="Forecast editor chart" style={{ border: '1px solid #eee', borderRadius: 4 }} />
  )
}
