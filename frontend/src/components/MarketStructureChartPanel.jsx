import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import api from '../services/api'

/** Compute hour-of-day label from global hour index and start_time string ("HH:MM"). */
function computeHourOfDay(globalHour, startTime) {
  const startHour = parseInt((startTime || '00:00').split(':')[0], 10) || 0
  return (startHour + globalHour) % 24
}

export default function MarketStructureChartPanel({
  sessionId,
  roundNum,
  roundSpan = 6,
  startTime = '00:00',
  overlayRounds = null,
}) {
  const theme = useTheme()
  const svgRef = useRef(null)
  const [localHour, setLocalHour] = useState(0)
  const [chartEntries, setChartEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const overlayMode = Array.isArray(overlayRounds) && overlayRounds.length > 0
  const activeRounds = useMemo(() => {
    if (overlayMode) {
      return overlayRounds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    }
    const normalizedRound = Number(roundNum)
    return Number.isFinite(normalizedRound) && normalizedRound > 0 ? [normalizedRound] : []
  }, [overlayMode, overlayRounds, roundNum])
  const activeRoundsKey = activeRounds.join(',')
  const chartData = chartEntries[0]?.data || null
  const overlayLineStyles = useMemo(() => ([
    { dasharray: null, label: 'solid' },
    { dasharray: '10,4', label: 'long dash' },
    { dasharray: '4,4', label: 'dash' },
    { dasharray: '2,4', label: 'dot' },
    { dasharray: '12,4,2,4', label: 'dash-dot' },
    { dasharray: '14,5,3,5,3,5', label: 'dash-dot-dot' },
    { dasharray: '1,3', label: 'fine dot' },
    { dasharray: '16,5', label: 'extra long dash' },
  ]), [])

  // Reset to hour 0 when round changes
  useEffect(() => {
    setLocalHour(0)
    setChartEntries([])
  }, [activeRoundsKey, sessionId])

  // Fetch market structure from backend
  useEffect(() => {
    if (!sessionId || activeRounds.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all(
      activeRounds.map(async (currentRound) => {
        const globalHour = (Number(currentRound) - 1) * roundSpan + localHour
        const { data } = await api.get(`/api/player/market-structure/${sessionId}/${currentRound}/${globalHour}`)
        return { roundNum: currentRound, data }
      })
    )
      .then((results) => {
        if (!cancelled) setChartEntries(results)
      })
      .catch(() => {
        if (!cancelled) setError('Marktstruktur konnte nicht geladen werden.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeRounds, localHour, roundSpan, sessionId])

  // D3 render
  useEffect(() => {
    if (!svgRef.current) return
    if (overlayMode && chartEntries.length === 0) return
    if (!overlayMode && !chartData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const M = { top: 24, right: 24, bottom: 52, left: 72 }
    const VW = 860
    const VH = 420
    const W = VW - M.left - M.right
    const H = VH - M.top - M.bottom

    const g = svg
      .attr('viewBox', `0 0 ${VW} ${VH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('display', 'block')
      .append('g')
      .attr('transform', `translate(${M.left},${M.top})`)

    const axisColor = theme.palette.text.secondary
    const gridColor = theme.palette.divider
    const supplyColor = theme.palette.success.main
    const demandColor = theme.palette.error.main
    const smpColor = theme.palette.info.main

    // Cumulative volumes for step curves
    const cumulate = (arr) => {
      let acc = 0
      return arr.map(({ price, volume }) => ({ x0: acc, x1: (acc += volume), p: price }))
    }
    const toStepPath = (arr, x, y, H, extendToTop) => {
      const pts = []
      arr.forEach(({ x0, x1, p }) => {
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      if (pts.length > 0) {
        pts.push([pts[pts.length - 1][0], extendToTop ? 0 : H])
      }
      return pts
    }

    if (overlayMode) {
      const overlaySeries = chartEntries
        .filter((entry) => entry?.data)
        .map((entry, index) => {
          const supply = (entry.data.supply || []).slice().sort((a, b) => a.price - b.price)
          const demand = (entry.data.demand || []).slice().sort((a, b) => b.price - a.price)
          return {
            roundNum: entry.roundNum,
            lineStyle: overlayLineStyles[index % overlayLineStyles.length],
            supply,
            demand,
            smp: Number(entry.data.smp || 0),
            volume: Number(entry.data.volume || 0),
          }
        })

      const xMax = overlaySeries.reduce((maxValue, entry) => {
        const supplyVolume = d3.sum(entry.supply, (d) => d.volume) || 0
        const demandVolume = d3.sum(entry.demand, (d) => d.volume) || 0
        return Math.max(maxValue, supplyVolume, demandVolume)
      }, 0) || 1000
      const allPrices = overlaySeries.flatMap((entry) => [
        ...entry.supply.map((item) => item.price),
        ...entry.demand.map((item) => item.price),
        ...(entry.smp > 0 ? [entry.smp] : []),
      ])
      const minP = allPrices.length ? d3.min(allPrices) : 0
      const maxP = allPrices.length ? d3.max(allPrices) : 1000
      const pad = Math.max((maxP - minP) * 0.12, maxP * 0.06, 10)
      const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
      const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat(''))
        .call((gg) => gg.select('.domain').remove())
        .selectAll('line')
        .attr('stroke', gridColor)
        .attr('stroke-dasharray', '3,3')

      const xFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${H})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(xFmt))
      const yAxis = g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v.toFixed(0)}`))

      xAxis.selectAll('path,line').attr('stroke', gridColor)
      yAxis.selectAll('path,line').attr('stroke', gridColor)
      xAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)
      yAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)

      g.append('text')
        .attr('x', W / 2).attr('y', H + 42)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Capacity (MWh)')
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -H / 2).attr('y', -56)
        .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
        .text('Price (ZAR/MWh)')

      const overlaySmpGuide = g.append('g')
        .attr('class', 'overlay-smp-guide')
        .style('display', 'none')

      const overlaySmpLine = overlaySmpGuide.append('line')
        .attr('x1', 0)
        .attr('x2', W)
        .attr('stroke', smpColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '7,4')

      const overlaySmpMarker = overlaySmpGuide.append('circle')
        .attr('r', 6)
        .attr('fill', smpColor)
        .attr('stroke', theme.palette.background.paper)
        .attr('stroke-width', 2)

      const overlaySmpLabel = overlaySmpGuide.append('text')
        .attr('x', W - 6)
        .attr('font-size', 13)
        .attr('fill', smpColor)
        .attr('text-anchor', 'end')

      const hideOverlaySmpGuide = () => {
        overlaySmpGuide.style('display', 'none')
      }

      const showOverlaySmpGuide = (entry) => {
        if (!entry || !Number.isFinite(entry.smp) || entry.smp <= 0) {
          hideOverlaySmpGuide()
          return
        }
        const yPos = y(entry.smp)
        overlaySmpGuide.style('display', null)
        overlaySmpLine
          .attr('y1', yPos)
          .attr('y2', yPos)
        overlaySmpLabel
          .attr('y', yPos - 7)
          .text(`Round ${entry.roundNum} SMP: ${entry.smp.toFixed(1)} ZAR/MWh`)
        if (Number.isFinite(entry.volume) && entry.volume > 0) {
          overlaySmpMarker
            .style('display', null)
            .attr('cx', x(entry.volume))
            .attr('cy', yPos)
        } else {
          overlaySmpMarker.style('display', 'none')
        }
      }

      const resetHighlight = () => {
        g.selectAll('.overlay-round-series').attr('opacity', 0.85)
        g.selectAll('.overlay-round-line')
          .attr('stroke-width', function setWidth() {
            return Number(this.getAttribute('data-base-width') || 2.4)
          })
        hideOverlaySmpGuide()
      }

      const highlightRound = (hoverRoundNum) => {
        const highlightedEntry = overlaySeries.find((entry) => entry.roundNum === hoverRoundNum)
        g.selectAll('.overlay-round-series').attr('opacity', function setOpacity() {
          return Number(this.getAttribute('data-round')) === hoverRoundNum ? 1 : 0.14
        })
        g.selectAll('.overlay-round-line').attr('stroke-width', function setWidth() {
          return Number(this.getAttribute('data-round')) === hoverRoundNum ? 4.4 : 1.4
        })
        showOverlaySmpGuide(highlightedEntry)
      }

      overlaySeries.forEach((entry) => {
        const sPts = toStepPath(cumulate(entry.supply), x, y, H, true)
        const dPts = toStepPath(cumulate(entry.demand), x, y, H, false)
        const group = g.append('g')
          .attr('class', 'overlay-round-series')
          .attr('data-round', String(entry.roundNum))
          .attr('opacity', 0.85)

        ;[
          { points: sPts, color: supplyColor, baseWidth: 2.8 },
          { points: dPts, color: demandColor, baseWidth: 2.8 },
        ].forEach((series) => {
          group.append('path')
            .attr('class', 'overlay-round-line')
            .attr('data-round', String(entry.roundNum))
            .attr('data-base-width', String(series.baseWidth))
            .attr('d', d3.line()(series.points))
            .attr('fill', 'none')
            .attr('stroke', series.color)
            .attr('stroke-width', series.baseWidth)
            .attr('stroke-dasharray', entry.lineStyle.dasharray)
            .style('cursor', 'pointer')
            .on('mouseenter', () => highlightRound(entry.roundNum))
            .on('mouseleave', resetHighlight)
        })
      })

      resetHighlight()
      return
    }

    const supply = (chartData.supply || []).slice().sort((a, b) => a.price - b.price)
    const demand = (chartData.demand || []).slice().sort((a, b) => b.price - a.price)
    const smp = chartData.smp || 0
    const sCum = cumulate(supply)
    const dCum = cumulate(demand)
    const xMax = Math.max(d3.sum(supply, (d) => d.volume), d3.sum(demand, (d) => d.volume)) || 1000

    const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)

    const allPrices = [
      ...supply.map((d) => d.price),
      ...demand.map((d) => d.price),
      ...(smp > 0 ? [smp] : []),
    ]
    const minP = allPrices.length ? d3.min(allPrices) : 0
    const maxP = allPrices.length ? d3.max(allPrices) : 1000
    const pad = Math.max((maxP - minP) * 0.12, maxP * 0.06, 10)
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // Horizontal grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat(''))
      .call((gg) => gg.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')

    // Axes
    const xFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(xFmt))
    const yAxis = g.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v.toFixed(0)}`))

    xAxis.selectAll('path,line').attr('stroke', gridColor)
    yAxis.selectAll('path,line').attr('stroke', gridColor)
    xAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)
    yAxis.selectAll('text').attr('fill', axisColor).attr('font-size', 11)

    g.append('text')
      .attr('x', W / 2).attr('y', H + 42)
      .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
      .text('Capacity (MWh)')
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -H / 2).attr('y', -56)
      .attr('text-anchor', 'middle').attr('fill', axisColor).attr('font-size', 12)
      .text('Price (ZAR/MWh)')

    const sPts = toStepPath(sCum, x, y, H, true)
    const dPts = toStepPath(dCum, x, y, H, false)

    // Supply and demand step curves
    g.append('path')
      .attr('d', d3.line()(sPts))
      .attr('fill', 'none')
      .attr('stroke', supplyColor)
      .attr('stroke-width', 2.5)

    g.append('path')
      .attr('d', d3.line()(dPts))
      .attr('fill', 'none')
      .attr('stroke', demandColor)
      .attr('stroke-width', 2.5)

    // SMP dashed line + intersection marker
    if (smp > 0) {
      const clearedVol = Number(chartData.volume || 0)
      const xIntersect = clearedVol > 0 ? x(clearedVol) : null

      g.append('line')
        .attr('x1', 0).attr('x2', W)
        .attr('y1', y(smp)).attr('y2', y(smp))
        .attr('stroke', smpColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '7,4')

      g.append('text')
        .attr('x', W - 6).attr('y', y(smp) - 7)
        .attr('font-size', 13).attr('fill', smpColor).attr('text-anchor', 'end')
        .text(`SMP: ${smp.toFixed(1)} ZAR/MWh`)

      if (xIntersect !== null) {
        // Vertical dashed line at clearing volume
        g.append('line')
          .attr('x1', xIntersect).attr('x2', xIntersect)
          .attr('y1', y(smp)).attr('y2', H)
          .attr('stroke', smpColor)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')

        g.append('circle')
          .attr('cx', xIntersect).attr('cy', y(smp))
          .attr('r', 6)
          .attr('fill', smpColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 2)
      }
    }

    // Legend (top-right)
    const legendX = W - 180
    const legend = g.append('g').attr('transform', `translate(${legendX}, 8)`)
    ;[
      { color: supplyColor, label: 'Supply' },
      { color: demandColor, label: 'Demand' },
      { color: smpColor, label: 'SMP', dashed: true },
    ].forEach(({ color, label, dashed }, i) => {
      const y0 = i * 20
      legend.append('line')
        .attr('x1', 0).attr('x2', 22).attr('y1', y0 + 8).attr('y2', y0 + 8)
        .attr('stroke', color)
        .attr('stroke-width', dashed ? 2 : 2.5)
        .attr('stroke-dasharray', dashed ? '7,4' : null)
      legend.append('text')
        .attr('x', 28).attr('y', y0 + 12)
        .attr('font-size', 11).attr('fill', axisColor)
        .text(label)
    })
  }, [chartData, chartEntries, overlayLineStyles, overlayMode, theme])

  const hourOptions = Array.from({ length: roundSpan }, (_, i) => ({
    localIdx: i,
    hod: activeRounds.length > 0 ? computeHourOfDay((Number(activeRounds[0]) - 1) * roundSpan + i, startTime) : 0,
  }))

  return (
    <Stack spacing={2}>
      {/* Controls row */}
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Hour</InputLabel>
          <Select
            value={localHour}
            label="Hour"
            onChange={(e) => setLocalHour(Number(e.target.value))}
          >
            {hourOptions.map(({ localIdx, hod }) => (
              <MenuItem key={localIdx} value={localIdx}>
                {overlayMode ? `Slot ${localIdx + 1}` : `${String(hod).padStart(2, '0')}:00 (Slot ${localIdx + 1})`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {overlayMode ? (
          <Chip
            size="small"
            label={`Overlay comparison (${activeRounds.length} rounds)`}
            variant="outlined"
          />
        ) : chartData && (
          <Chip
            size="small"
            label={
              chartData.market_source === 'submitted_market'
                ? `Live Market (${chartData.submitted_players} players)`
                : 'Synthetic Preview'
            }
            color={chartData.market_source === 'submitted_market' ? 'success' : 'default'}
            variant="outlined"
          />
        )}

        {!overlayMode && chartData?.volume != null && (
          <Typography variant="body2" color="text.secondary">
            Clearing Volume: {Number(chartData.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })} MWh
          </Typography>
        )}

        {overlayMode && activeRounds.length > 0 ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              label="Supply"
              sx={{ borderColor: 'success.main', color: 'success.main' }}
              variant="outlined"
            />
            <Chip
              size="small"
              label="Demand"
              sx={{ borderColor: 'error.main', color: 'error.main' }}
              variant="outlined"
            />
            {activeRounds.map((currentRound, index) => (
              <Chip
                key={currentRound}
                size="small"
                label={`Round ${currentRound} · ${overlayLineStyles[index % overlayLineStyles.length].label}`}
                sx={{
                  borderColor: 'divider',
                  color: 'text.primary',
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        ) : null}
      </Stack>

      {/* Chart area */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      ) : !sessionId || activeRounds.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No round selected.
        </Typography>
      ) : !chartData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Box
          sx={{
            width: '100%',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <svg ref={svgRef} />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        {overlayMode
          ? 'The overlay compares supply and demand curves across rounds for the selected slot. Supply stays green, demand stays red, rounds use different line styles, and hovering one line highlights that round and shows its SMP.'
          : 'The curves show the aggregated supply and demand profile for the selected hour. The intersection yields the System Marginal Price (SMP).'}
      </Typography>
    </Stack>
  )
}
