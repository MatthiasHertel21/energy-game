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
export default function ForecastChartEditor({ hours = [], lockedUntil = 0, onChange }){
  const ref = useRef(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const W = 700, H = 240
    const M = { top: 16, right: 20, bottom: 36, left: 46 }
    const iw = W - M.left - M.right
    const ih = H - M.top - M.bottom

    const g = svg.attr('width', W).attr('height', H).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const n = Math.max(1, hours.length)
    const maxY = Math.max(1, d3.max(hours) || 1)
    const yMax = Math.max(maxY * 1.5, 10)

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

    // drag behavior
    const drag = d3.drag()
      .on('drag', (event, d) => {
        const i = d.index
        if (i < lockedUntil) return
        const [, y0] = d3.pointer(event, g.node())
        const newVal = Math.max(0, Math.min(yMax, y.invert(y0)))
        if (onChange) onChange(i, Number(newVal.toFixed(2)))
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

    // labels
    g.append('text').attr('x', iw / 2).attr('y', ih + 28).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Hour')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12).text('Forecast (MWh)')
  }, [hours, lockedUntil, onChange])

  return (
    <svg ref={ref} role="img" aria-label="Forecast editor chart" style={{ border: '1px solid #eee', borderRadius: 4 }} />
  )
}
