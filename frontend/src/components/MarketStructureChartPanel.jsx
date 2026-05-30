import React, { useEffect, useRef, useState } from 'react'
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
}) {
  const theme = useTheme()
  const svgRef = useRef(null)
  const [localHour, setLocalHour] = useState(0)
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Reset to hour 0 when round changes
  useEffect(() => {
    setLocalHour(0)
    setChartData(null)
  }, [sessionId, roundNum])

  // Fetch market structure from backend
  useEffect(() => {
    if (!sessionId || !roundNum) return
    let cancelled = false
    const globalHour = (Number(roundNum) - 1) * roundSpan + localHour
    setLoading(true)
    setError(null)
    api
      .get(`/api/player/market-structure/${sessionId}/${roundNum}/${globalHour}`)
      .then(({ data }) => {
        if (!cancelled) setChartData(data)
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
  }, [sessionId, roundNum, localHour, roundSpan])

  // D3 render
  useEffect(() => {
    if (!chartData || !svgRef.current) return

    const supply = (chartData.supply || []).slice().sort((a, b) => a.price - b.price)
    const demand = (chartData.demand || []).slice().sort((a, b) => b.price - a.price)
    const smp = chartData.smp || 0

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

    // Step path helper
    const toStepPath = (arr) => {
      const pts = []
      arr.forEach(({ x0, x1, p }) => {
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      return pts
    }

    const sPts = toStepPath(sCum)
    const dPts = toStepPath(dCum)

    // Extend edges vertically so curves reach chart boundaries
    if (sPts.length > 0) sPts.push([sPts[sPts.length - 1][0], 0])
    if (dPts.length > 0) dPts.push([dPts[dPts.length - 1][0], H])

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
  }, [chartData, theme])

  const hourOptions = Array.from({ length: roundSpan }, (_, i) => ({
    localIdx: i,
    hod: computeHourOfDay((Number(roundNum) - 1) * roundSpan + i, startTime),
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
                {String(hod).padStart(2, '0')}:00 (Slot {localIdx + 1})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {chartData && (
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

        {chartData?.volume != null && (
          <Typography variant="body2" color="text.secondary">
            Clearing Volume: {Number(chartData.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })} MWh
          </Typography>
        )}
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
      ) : !sessionId || !roundNum ? (
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
        The curves show the aggregated supply and demand profile for the selected hour. The intersection yields the System Marginal Price (SMP).
      </Typography>
    </Stack>
  )
}
