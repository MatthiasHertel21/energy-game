import React, { useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import * as d3 from 'd3'

function normalizeNumber(value) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function TrendChart({ rounds, metric, color, selectedRound, yLabel, valueFormatter, emptyLabel, height = 220, titleNote = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return

    const data = (Array.isArray(rounds) ? rounds : [])
      .map((row) => ({
        round: Number(row?.round ?? 0),
        value: normalizeNumber(row?.[metric]),
      }))
      .filter((row) => row.round > 0)

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const width = 840
    const margin = { top: 16, right: 16, bottom: 36, left: 52 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    if (data.length === 0) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', '12px')
        .text(emptyLabel)
      return
    }

    const extent = d3.extent(data, (row) => row.value)
    const minValue = extent[0] ?? 0
    const maxValue = extent[1] ?? 0
    const pad = minValue === maxValue ? Math.max(1, Math.abs(maxValue) * 0.1 || 1) : (maxValue - minValue) * 0.1

    const x = d3.scalePoint()
      .domain(data.map((row) => row.round))
      .range([0, innerWidth])
      .padding(0.35)

    const y = d3.scaleLinear()
      .domain([minValue - pad, maxValue + pad])
      .nice()
      .range([innerHeight, 0])

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickValues(data.map((row) => row.round)))

    g.append('g')
      .call(d3.axisLeft(y).ticks(5))

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(''))
      .selectAll('line')
      .attr('stroke', '#ddd')
      .attr('stroke-opacity', 0.7)

    const line = d3.line()
      .x((row) => x(row.round) ?? 0)
      .y((row) => y(row.value))

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line)

    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (row) => x(row.round) ?? 0)
      .attr('cy', (row) => y(row.value))
      .attr('r', (row) => row.round === selectedRound ? 5 : 3)
      .attr('fill', color)
      .attr('stroke', (row) => row.round === selectedRound ? '#111' : '#fff')
      .attr('stroke-width', (row) => row.round === selectedRound ? 1.5 : 1)
      .append('title')
      .text((row) => `Round ${row.round}: ${valueFormatter(row.value)}`)

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 32)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', '10px')
      .text('Round')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -38)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', '10px')
      .text(yLabel)

    if (titleNote) {
      g.append('text')
        .attr('x', innerWidth)
        .attr('y', -2)
        .attr('text-anchor', 'end')
        .attr('fill', '#666')
        .attr('font-size', '10px')
        .text(titleNote)
    }
  }, [color, emptyLabel, height, metric, rounds, selectedRound, titleNote, valueFormatter, yLabel])

  return <svg ref={ref} />
}

export default function MarketOverviewTrendPanel({
  rounds = [],
  selectedRound = null,
  formatPrice = (value) => `${normalizeNumber(value).toFixed(1)} ZAR/MWh`,
  formatVolume = (value) => `${normalizeNumber(value).toFixed(0)} MWh`,
}) {
  const normalizedRounds = useMemo(() => {
    return (Array.isArray(rounds) ? rounds : [])
      .map((row) => ({
        round: Number(row?.round ?? 0),
        smp: normalizeNumber(row?.smp),
        volume: normalizeNumber(row?.volume),
      }))
      .filter((row) => row.round > 0)
      .sort((a, b) => a.round - b.round)
  }, [rounds])

  const activeRound = normalizedRounds.find((row) => row.round === selectedRound) || normalizedRounds[normalizedRounds.length - 1] || null
  const avgSmp = normalizedRounds.length > 0
    ? normalizedRounds.reduce((sum, row) => sum + row.smp, 0) / normalizedRounds.length
    : 0
  const avgVolume = normalizedRounds.length > 0
    ? normalizedRounds.reduce((sum, row) => sum + row.volume, 0) / normalizedRounds.length
    : 0

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Completed rounds</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{normalizedRounds.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Selected round SMP</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{activeRound ? formatPrice(activeRound.smp) : '—'}</Typography>
              <Typography variant="caption" color="text.secondary">Average: {formatPrice(avgSmp)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Selected round volume</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{activeRound ? formatVolume(activeRound.volume) : '—'}</Typography>
              <Typography variant="caption" color="text.secondary">Average: {formatVolume(avgVolume)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>SMP over rounds</Typography>
          <TrendChart
            rounds={normalizedRounds}
            metric="smp"
            color="#2e7d32"
            selectedRound={activeRound?.round || null}
            yLabel="SMP (ZAR/MWh)"
            valueFormatter={formatPrice}
            emptyLabel="No round trend available"
            height={320}
            titleNote={activeRound ? `Highlighted: Round ${activeRound.round}` : ''}
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Volume over rounds</Typography>
          <TrendChart
            rounds={normalizedRounds}
            metric="volume"
            color="#1976d2"
            selectedRound={activeRound?.round || null}
            yLabel="Volume (MWh)"
            valueFormatter={formatVolume}
            emptyLabel="No round trend available"
            height={180}
          />
        </Grid>
      </Grid>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Round</TableCell>
              <TableCell align="right">SMP</TableCell>
              <TableCell align="right">Volume</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {normalizedRounds.length > 0 ? normalizedRounds.map((row) => (
              <TableRow key={row.round} selected={row.round === activeRound?.round}>
                <TableCell sx={{ fontWeight: row.round === activeRound?.round ? 700 : 400 }}>
                  R{row.round}
                </TableCell>
                <TableCell align="right">{formatPrice(row.smp)}</TableCell>
                <TableCell align="right">{formatVolume(row.volume)}</TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="text.secondary">No completed round trend available.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}