import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

/**
 * MarketPhaseTimeline - Single Row with Overlap Hatch
 * Shows overall market availability in a single bar:
 * - Base (Yellow): Day-Ahead market open
 * - Hatch overlay (Orange diagonal): Intraday window (overlap)
 * - Grey sections: Past/locked periods
 *
 * Props:
 * - hours: number (number of hours in timeline)
 * - hourStatus: string[] (per-hour status: "locked", "da", "id", "forecast")
 * - currentRound: number
 * - roundSpan: number
 * - totalRounds: number (actual number of rounds in scenario, default: calculated from hours)
 * - idGateInterval: number (hours between ID gates)
 * - idGateBase: number (first gate hour)
 * - daCommittedStart: number (first hour of DA committed range)
 * - daCommittedEnd: number (last hour+1 of DA committed range)
 */
export default function MarketPhaseTimeline({
  hours = 48,
  hourStatus = [],
  currentRound = 1,
  roundSpan = 6,
  totalRounds = null,
  idGateInterval = 4,
  idGateBase = 0,
  onClickSummary,
  roundsSummary = [],
  startHour = 0,
  daCommittedStart = -1,
  daCommittedEnd = -1,
  damBidHours = [],
  idmBidHours = [],
  damOpenHours = [],
  damSpecialHours = [],
  idmOpenHours = []
}) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    // Use full container width
    const containerWidth = ref.current.parentElement.clientWidth
    const W = containerWidth || 1200
    const H = 56
    const M = { top: 22, right: 20, bottom: 8, left: 50 }
    const iw = W - M.left - M.right
    const ih = H - M.top - M.bottom

    const g = svg.attr('width', W).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const n = Math.max(1, hours)
    const x = d3.scaleLinear().domain([1, n + 1]).range([0, iw])

    // Colors matching ForecastChartEditor
    const colors = {
      dam: '#FDD835',        // Yellow 600
      damR1: '#00BCD4',      // Cyan 500 - Round 1 Day 1 special opening
      idm: '#FB8C00',        // Orange 600
      locked: '#9E9E9E',     // Grey 500
      forecast: '#E3F2FD'    // Blue 50
    }

    // Single bar layout
    const barHeight = 16
    const marketBarY = 0

    // Calculate current simulation hour
    const currentSimHour = (currentRound - 1) * roundSpan

    // Helper: Group consecutive hours with same status
    const groupHours = (statusArray) => {
      const groups = []
      if (!statusArray || statusArray.length === 0) return groups
      
      let currentStatus = statusArray[0]
      let startIdx = 0
      
      for (let i = 1; i <= statusArray.length; i++) {
        if (i === statusArray.length || statusArray[i] !== currentStatus) {
          groups.push({ status: currentStatus, start: startIdx, end: i - 1 })
          if (i < statusArray.length) {
            currentStatus = statusArray[i]
            startIdx = i
          }
        }
      }
      return groups
    }

    const statusGroups = groupHours(hourStatus)
    
    // Debug: Log hour_status for troubleshooting
    if (hourStatus && hourStatus.length > 0) {
      const uniqueStatuses = [...new Set(hourStatus)]
      console.log('[MarketPhaseTimeline] Hour status types:', uniqueStatuses)
      console.log('[MarketPhaseTimeline] First 24 hours:', hourStatus.slice(0, 24))
    }

    // Calculate total game time
    const gameHours = totalRounds !== null ? totalRounds * roundSpan : hours
    
    // Helper: Get rule for hour based on round
    const getRuleForHour = (hourIdx) => {
      const roundIdx = Math.floor(hourIdx / roundSpan)
      if (roundIdx >= roundsSummary.length) return { dam: 'unknown', idm: 'unknown' }
      const round = roundsSummary[roundIdx]
      return {
        dam: round?.dam?.trading || 'unknown',
        idm: round?.idm?.trading || 'unknown'
      }
    }
    
    // Helper: Format hour to time string
    const formatTime = (hourIdx) => {
      const hour = (startHour + hourIdx) % 24
      return `${String(hour).padStart(2, '0')}:00`
    }
    
    // Helper: Calculate day number
    const getDayNumber = (hourIdx) => {
      return Math.floor((startHour + hourIdx) / 24) + 1
    }
    
    // Helper: Get status display name (English)
    const getStatusName = (status) => {
      const names = {
        'locked': 'Past',
        'da': 'Day-Ahead',
        'da_r1': 'DA (Round 1)',
        'id': 'Intraday',
        'forecast': 'Forecast'
      }
      return names[status] || status
    }
    
    // Helper: Get short label for status
    const getStatusLabel = (status) => {
      const labels = {
        'locked': 'Past',
        'da': 'DA',
        'da_r1': 'DA-R1',
        'id': 'ID',
        'forecast': 'Next'
      }
      return labels[status] || ''
    }
    
    // Helper: Get rule display name
    const getRuleName = (rule) => {
      const names = {
        'on': 'enabled',
        'market_code': 'gated',
        'off': 'disabled',
        'unknown': '-'
      }
      return names[rule] || rule
    }
    
    // Create hatch patterns for committed positions
    const defs = svg.append('defs')
    
    // DAM hatch pattern: Yellow / (45 degrees)
    const damHatchPattern = defs.append('pattern')
      .attr('id', 'dam-committed-hatch-timeline')
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
      .attr('opacity', 0.5)
    
    // IDM hatch pattern: Orange \ (-45 degrees)
    const idmHatchPattern = defs.append('pattern')
      .attr('id', 'idm-committed-hatch-timeline')
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
      .attr('opacity', 0.5)

    // IDM gate-open overlay pattern (orange stripes)
    const idmOpenOverlayPattern = defs.append('pattern')
      .attr('id', 'idm-open-overlay-timeline')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(-45)')
    idmOpenOverlayPattern.append('rect')
      .attr('width', 6)
      .attr('height', 6)
      .attr('fill', '#FB8C00')
      .attr('opacity', 0.12)
    idmOpenOverlayPattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#E65100')
      .attr('stroke-width', 2)
      .attr('opacity', 0.45)

    // Draw round separators and labels first (as background)
    // Use provided totalRounds or calculate from hours
    const numRounds = totalRounds !== null ? totalRounds : Math.ceil(hours / roundSpan)
    for (let r = 0; r < numRounds; r++) {
      const roundStartHour = r * roundSpan
      if (roundStartHour >= hours) break
      
      const roundX = x(roundStartHour + 1)
      const roundEndHour = Math.min((r + 1) * roundSpan, hours)
      const roundEndX = x(roundEndHour + 1)
      
      // Highlight current round
      if (r === currentRound - 1) {
        const rectWidth = roundEndX - roundX
        g.append('rect')
          .attr('x', roundX)
          .attr('y', -6)
          .attr('width', rectWidth)
          .attr('height', marketBarY + barHeight + 8)
          .attr('fill', '#FFE0B2')  // Orange 100
          .attr('opacity', 0.4)
          .attr('rx', 4)
          .lower()
      }
      
      // Round separator line
      if (r > 0) {
        g.append('line')
          .attr('x1', roundX)
          .attr('x2', roundX)
          .attr('y1', -12)
            .attr('y2', marketBarY + barHeight + 4)
          .attr('stroke', '#CFD8DC')
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.5)
          .lower()
      }
      
      // Round label
      const roundMidX = (roundX + roundEndX) / 2
      const isCurrentRound = r === currentRound - 1
      
      g.append('text')
        .attr('x', roundMidX)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', isCurrentRound ? 'bold' : 'normal')
        .attr('fill', isCurrentRound ? '#E65100' : '#666')
        .text(`R${r + 1}`)
    }

    // Base bar (DA availability, locked periods, and forecast background)
    statusGroups.forEach(group => {
      const isLocked = group.status === 'locked'
      const isDaR1 = group.status === 'da_r1'
      const isDa = group.status === 'da'
      const isForecast = group.status === 'forecast'
      const isId = group.status === 'id'
      
      // Render backgrounds for all status types
      if (!isLocked && !isDa && !isDaR1 && !isForecast && !isId) return

      const xStart = x(Math.max(1, group.start + 1))
      const xEnd = x(Math.min(n + 1, group.end + 2))
      const width = xEnd - xStart
      if (width < 0.5) return

      // Determine fill color based on status
      let fillColor = colors.forecast  // Default for forecast
      let strokeColor = '#BBDEFB'
      let strokeWidth = 1
      
      if (isLocked) {
        fillColor = colors.locked
        strokeColor = '#757575'
        strokeWidth = 1
      } else if (isDaR1) {
        fillColor = colors.damR1
        strokeColor = '#00ACC1'
        strokeWidth = 1.2
      } else if (isDa) {
        fillColor = colors.dam
        strokeColor = '#F57F17'
        strokeWidth = 1.2
      } else if (isId) {
        fillColor = colors.idm
        strokeColor = '#E65100'
        strokeWidth = 1.2
      }

      // subtle shadow
      g.append('rect')
        .attr('x', xStart + 1)
        .attr('y', marketBarY + 1)
        .attr('width', width)
        .attr('height', barHeight)
        .attr('fill', '#000')
        .attr('opacity', 0.06)
        .attr('rx', 3)

      const barRect = g.append('rect')
        .attr('x', xStart)
        .attr('y', marketBarY)
        .attr('width', width)
        .attr('height', barHeight)
        .attr('fill', fillColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('rx', 3)
        .style('cursor', 'pointer')
      
      // Tooltip (English, multi-line)
      const rules = getRuleForHour(group.start)
      const activeRule = isId ? getRuleName(rules.idm) : (isDa || isDaR1) ? getRuleName(rules.dam) : '-'
      const startTime = formatTime(group.start)
      const endTime = formatTime(group.end + 1)
      const dayStart = getDayNumber(group.start)
      const dayEnd = getDayNumber(group.end)
      const dayText = dayStart === dayEnd ? `Day ${dayStart}` : `Day ${dayStart}-${dayEnd}`
      
      const tooltipText = `Status: ${getStatusName(group.status)}\nDay: ${dayText}\nTime: ${startTime}-${endTime}\nRule: ${activeRule}`
      
      barRect.append('title').text(tooltipText)
      
      // Add short label text centered in bar (if wide enough)
      const label = getStatusLabel(group.status)
      if (label && width > 30) {
        g.append('text')
          .attr('x', xStart + width / 2)
          .attr('y', marketBarY + barHeight / 2 + 1)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', group.status === 'locked' ? '#666' : '#000')
          .attr('font-size', 9)
          .attr('font-weight', 'bold')
          .attr('pointer-events', 'none')
          .text(label)
      }
    })

    // Add open-gate overlays (independent from hour_status priority)
    const drawGateOverlay = (presenceArray, fill) => {
      if (!Array.isArray(presenceArray) || presenceArray.length === 0) return
      let rangeStart = -1
      for (let i = 0; i < Math.min(presenceArray.length, n); i++) {
        const isOpen = Boolean(presenceArray[i])
        if (isOpen && rangeStart === -1) {
          rangeStart = i
          continue
        }
        if (!isOpen && rangeStart !== -1) {
          const xStart = x(Math.max(1, rangeStart + 1))
          const xEnd = x(Math.min(n + 1, i + 1))
          const width = xEnd - xStart
          if (width > 0.5) {
            g.append('rect')
              .attr('x', xStart)
              .attr('y', marketBarY)
              .attr('width', width)
              .attr('height', barHeight)
              .attr('fill', fill)
              .attr('rx', 3)
              .style('pointer-events', 'none')
          }
          rangeStart = -1
        }
      }
      if (rangeStart !== -1) {
        const xStart = x(Math.max(1, rangeStart + 1))
        const xEnd = x(Math.min(n + 1, Math.min(presenceArray.length, n) + 1))
        const width = xEnd - xStart
        if (width > 0.5) {
          g.append('rect')
            .attr('x', xStart)
            .attr('y', marketBarY)
            .attr('width', width)
            .attr('height', barHeight)
            .attr('fill', fill)
            .attr('rx', 3)
            .style('pointer-events', 'none')
        }
      }
    }

    drawGateOverlay(damOpenHours, 'rgba(253,216,53,0.22)')
    drawGateOverlay(damSpecialHours, 'rgba(0,188,212,0.32)')
    drawGateOverlay(idmOpenHours, 'url(#idm-open-overlay-timeline)')

    // Add hatching for hours where bids actually exist
    const drawBidHatching = (presenceArray, patternId) => {
      if (!Array.isArray(presenceArray) || presenceArray.length === 0) return
      let rangeStart = -1
      for (let i = 0; i < Math.min(presenceArray.length, n); i++) {
        const hasBid = Boolean(presenceArray[i])
        if (hasBid && rangeStart === -1) {
          rangeStart = i
          continue
        }
        if (!hasBid && rangeStart !== -1) {
          const xStart = x(Math.max(1, rangeStart + 1))
          const xEnd = x(Math.min(n + 1, i + 1))
          const width = xEnd - xStart
          if (width > 0.5) {
            g.append('rect')
              .attr('x', xStart)
              .attr('y', marketBarY)
              .attr('width', width)
              .attr('height', barHeight)
              .attr('fill', `url(#${patternId})`)
              .attr('rx', 3)
              .style('pointer-events', 'none')
          }
          rangeStart = -1
        }
      }

      if (rangeStart !== -1) {
        const xStart = x(Math.max(1, rangeStart + 1))
        const xEnd = x(Math.min(n + 1, Math.min(presenceArray.length, n) + 1))
        const width = xEnd - xStart
        if (width > 0.5) {
          g.append('rect')
            .attr('x', xStart)
            .attr('y', marketBarY)
            .attr('width', width)
            .attr('height', barHeight)
            .attr('fill', `url(#${patternId})`)
            .attr('rx', 3)
            .style('pointer-events', 'none')
        }
      }
    }

    drawBidHatching(damBidHours, 'dam-committed-hatch-timeline')
    drawBidHatching(idmBidHours, 'idm-committed-hatch-timeline')

    // Day indicators below timeline bars (subtle lines with labels)
    const dayIndicatorY = marketBarY + barHeight + 6
    
    // Calculate day boundaries
    const dayBoundaries = []
    for (let h = 0; h < n; h += 24) {
      const dayNum = Math.floor((startHour + h) / 24) + 1
      const dayEnd = Math.min(h + 24, n)
      const dayWidth = x(dayEnd + 1) - x(h + 1)
      dayBoundaries.push({ dayNum, startHour: h, endHour: dayEnd - 1, x: x(h + 1), width: dayWidth })
    }
    
    // Draw day separators and labels as subtle lines: |---- Day 1 ---|--- Day 2 ---|
    dayBoundaries.forEach((day, idx) => {
      if (day.width > 15) {
        // Left vertical line
        g.append('line')
          .attr('x1', day.x)
          .attr('x2', day.x)
          .attr('y1', dayIndicatorY)
          .attr('y2', dayIndicatorY + 10)
          .attr('stroke', '#90A4AE')
          .attr('stroke-width', 1)
        
        // Horizontal line
        g.append('line')
          .attr('x1', day.x)
          .attr('x2', day.x + day.width)
          .attr('y1', dayIndicatorY + 5)
          .attr('y2', dayIndicatorY + 5)
          .attr('stroke', '#B0BEC5')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2,2')
        
        // Right vertical line (if last day or has width)
        if (idx === dayBoundaries.length - 1 || day.width > 30) {
          g.append('line')
            .attr('x1', day.x + day.width)
            .attr('x2', day.x + day.width)
            .attr('y1', dayIndicatorY)
            .attr('y2', dayIndicatorY + 10)
            .attr('stroke', '#90A4AE')
            .attr('stroke-width', 1)
        }
        
        // Day label centered
        if (day.width > 40) {
          g.append('text')
            .attr('x', day.x + day.width / 2)
            .attr('y', dayIndicatorY + 5)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 8)
            .attr('font-weight', 500)
            .attr('fill', '#607D8B')
            .text(`Day ${day.dayNum}`)
        }
      }
    })

    // Left label
    g.append('text')
      .attr('x', -8)
      .attr('y', marketBarY + barHeight / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('font-size', 10)
      .attr('font-weight', 'bold')
      .attr('fill', '#424242')
      .text('Market')

    // Current time marker - vertical line and pointer
    const currentX = x(Math.min(n + 1, Math.max(1, currentSimHour + 1)))
    
    // Glow effect
    g.append('line')
      .attr('x1', currentX)
      .attr('x2', currentX)
      .attr('y1', -10)
      .attr('y2', marketBarY + barHeight + 4)
      .attr('stroke', '#FF5252')
      .attr('stroke-width', 3)
      .attr('opacity', 0.3)
    
    // Main line
    g.append('line')
      .attr('x1', currentX)
      .attr('x2', currentX)
      .attr('y1', -10)
      .attr('y2', marketBarY + barHeight + 4)
      .attr('stroke', '#D32F2F')
      .attr('stroke-width', 2)
      .attr('opacity', 1)
    
    // Pointer triangle at top
    g.append('polygon')
      .attr('points', `${currentX - 5},-10 ${currentX + 5},-10 ${currentX},-2`)
      .attr('fill', '#D32F2F')
      .attr('stroke', '#B71C1C')
      .attr('stroke-width', 1)

  }, [
    hours,
    hourStatus,
    currentRound,
    roundSpan,
    idGateInterval,
    idGateBase,
    damBidHours,
    idmBidHours,
    damOpenHours,
    damSpecialHours,
    idmOpenHours
  ])

  const handleClick = (event) => {
    try {
      if (!ref.current || typeof onClickSummary !== 'function') return
      const rect = ref.current.getBoundingClientRect()
      const x = Math.max(0, event.clientX - rect.left)
      const w = rect.width || 1
      const hourIdx = Math.max(0, Math.min(hours - 1, Math.floor((x / w) * hours)))
      const round = Math.floor(hourIdx / roundSpan) + 1
      onClickSummary(round, hourIdx)
    } catch (_) {}
  }

  return (
    <svg 
      ref={ref} 
      role="img" 
      aria-label="Market availability timeline" 
      style={{ 
        width: '100%', 
        border: '1px solid #CFD8DC', 
        borderRadius: 6, 
        backgroundColor: '#FAFAFA', 
        display: 'block', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)' 
      }} 
      onClick={handleClick}
    />
  )
}
