import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

/**
 * ForecastChartEditor
 * Interactive line chart for editing hourly forecast values by dragging points.
 * Props:
 * - hours: number[]
 * - lockedUntil: number (index of first editable hour, 0-based)
 * - onChange: (index:number, value:number) => void
 */
export default function ForecastChartEditor({ hours = [], lockedUntil = 0, onChange, maxValue, smoothRadius = 3 }){
  const ref = useRef(null)

  useEffect(() => {
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
    // Scale to the device max when provided, with a small headroom to reach the top easily
    const targetMax = hintedMax || seriesMax
    const yMax = Math.max(targetMax * 1.05, 10)

    const x = d3.scaleLinear().domain([1, n]).range([0, iw])
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([ih, 0])

    // grid
    g.append('g').call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat('')).selectAll('line').attr('stroke', '#e0e0e0')

    // axes
    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.min(n, 12)))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    const line = d3.line().x((d, i) => x(i + 1)).y((d) => y(d))

    // path
    g.append('path').datum(hours).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)

    // overlay for drag anywhere
    const applySoft = (centerIdx, newCenterVal) => {
      if (!Array.isArray(hours) || !onChange) return
      const R = Math.max(0, Math.min(6, Number(smoothRadius) || 0))
      const base = hours[centerIdx]
      const delta = newCenterVal - base
      // Update center first
      onChange(centerIdx, Number(newCenterVal.toFixed(2)))
      // Then adjust neighbors with triangular falloff
      for (let d = 1; d <= R; d++){
        const w = (R - d + 1) / (R + 1) // linear falloff
        const left = centerIdx - d
        const right = centerIdx + d
        if (left >= lockedUntil && left >= 0){
          const target = Math.max(0, Math.min(yMax, (hours[left] ?? 0) + delta * w))
          onChange(left, Number(target.toFixed(2)))
        }
        if (right >= lockedUntil && right < hours.length){
          const target = Math.max(0, Math.min(yMax, (hours[right] ?? 0) + delta * w))
          onChange(right, Number(target.toFixed(2)))
        }
      }
    }

    const overlayDrag = d3.drag()
      .on('drag', function(event) {
        const [x0, y0] = d3.pointer(event, g.node())
        let idx = Math.round(x.invert(x0)) - 1
        idx = Math.max(0, Math.min(n - 1, idx))
        if (idx < lockedUntil) return
        const newVal = Math.max(0, Math.min(yMax, y.invert(y0)))
        applySoft(idx, newVal)
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
      .on('drag', function(event, d) {
        const i = d.i
        if (i < lockedUntil) return
        const [, y0] = d3.pointer(event, g.node())
        const newVal = Math.max(0, Math.min(yMax, y.invert(y0)))
        applySoft(i, newVal)
        // move the dragged point immediately for visual feedback
        try { d3.select(this).attr('cy', y(newVal)) } catch(_) {}
      })

    // points
    const pts = g.selectAll('circle.point').data(hours.map((v, i) => ({ v, i }))).enter().append('circle')
      .attr('class', 'point')
      .attr('cx', (d) => x(d.i + 1))
      .attr('cy', (d) => y(d.v))
      .attr('r', 4)
      .attr('fill', (d) => (d.i < lockedUntil ? '#9e9e9e' : '#1976d2'))
      .style('cursor', (d) => (d.i < lockedUntil ? 'not-allowed' : 'ns-resize'))

    pts.filter((d) => d.i >= lockedUntil).call(drag)

    // Ensure overlay is on top to capture drags anywhere
    try { g.select('rect.forecast-overlay').raise() } catch(_) {}

    // labels
    g.append('text').attr('x', iw / 2).attr('y', ih + 28).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Hour')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Forecast (MWh)')
  }, [hours, lockedUntil, onChange, maxValue, smoothRadius])

  return (
    <svg ref={ref} role="img" aria-label="Forecast editor chart" style={{ border: '1px solid #eee', borderRadius: 4 }} />
  )
}
