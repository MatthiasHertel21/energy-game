import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Paper, Typography, TextField, Table, TableHead, TableRow, TableCell, TableBody, Stack, Select, MenuItem, Skeleton, Box } from '@mui/material'
import { BarChart as BarChartIcon } from '@mui/icons-material'
import api from '../services/api'
import * as d3 from 'd3'
import { exportPNG, exportSVG } from '../utils/exportSvg'
import EmptyState from '../components/EmptyState'

const MetricBarChart = forwardRef(function MetricBarChart({ data, metric='profit_zar', width=640, height=240 }, ref) {
  useEffect(()=>{
    if(!ref?.current) return
    // tooltip
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip.style('position','absolute').style('pointer-events','none').style('background','#111').style('color','#fff').style('padding','4px 8px').style('border-radius','4px').style('font-size','12px').style('display','none').style('z-index','9999')
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const margin = { top: 10, right: 10, bottom: 30, left: 50 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg.attr('width', width).attr('height', height).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const x = d3.scaleBand().domain(data.map(d=> String(d.player_id))).range([0, innerW]).padding(0.2)
    const y = d3.scaleLinear().domain([0, d3.max(data, d=> d[metric])||0]).nice().range([innerH, 0])
    // gridlines
    g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    const yLabelMap = {
      profit_zar: 'Profit (ZAR)',
      revenue_zar: 'Revenue (ZAR)',
      imbalance_cost_zar: 'Imbalance Cost (ZAR)',
      curtailment_cost_zar: 'Curtailment Cost (ZAR)'
    }
    g.append('text').attr('transform','rotate(-90)').attr('x', -innerH/2).attr('y', -38).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text(yLabelMap[metric] || 'Value')
    g.selectAll('rect').data(data).enter().append('rect')
      .attr('x', d=> x(String(d.player_id)))
      .attr('y', d=> y(d[metric]))
      .attr('width', x.bandwidth())
      .attr('height', d=> innerH - y(d[metric]))
      .attr('fill', '#1976d2')
      .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`P${d.player_id}: ${d[metric]}`) })
      .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
      .on('mouseleave', ()=> { tooltip.style('display','none') })
  },[data, width, height, metric, ref])
  return <svg ref={ref} />
})

export default function Comparison(){
  const [params] = useSearchParams()
  const sid = params.get('session')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('profit_zar')
  const [metric, setMetric] = useState('profit_zar')
  const chartRef = useRef(null)
  const [fileBase, setFileBase] = useState('comparison')
  const sessionId = params.get('session')

  // Persist metric preference
  useEffect(()=>{
    const m = window.localStorage.getItem('comparison_metric')
    if(m) setMetric(m)
  },[])
  useEffect(()=>{
    window.localStorage.setItem('comparison_metric', metric)
  },[metric])

  // Set default filename if empty / on session change
  useEffect(()=>{
    if(!fileBase || fileBase === 'comparison'){
      setFileBase(`comparison_${metric}${sessionId?`_session_${sessionId}`:''}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId])
  useEffect(()=>{
    const load = async ()=>{
      if(!sid) return
      setLoading(true)
      try {
        const { data } = await api.get(`/api/leaderboard/sessions/${sid}`)
        setRows(data)
      } finally {
        setLoading(false)
      }
    }
    load()
  },[sid])
  const view = useMemo(()=>{
    const q = (query||'').toLowerCase()
    const filtered = rows.filter(r => (''+r.player_id).includes(q))
    const sorted = [...filtered].sort((a,b)=> (b[sort]||0) - (a[sort]||0))
    return sorted
  },[rows, query, sort])
  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Comparison Dashboard</Typography>
      
      {!sid ? (
        <EmptyState 
          icon={BarChartIcon}
          title="No session selected"
          message="Select a session from the URL parameter to compare player results"
        />
      ) : loading ? (
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="rectangular" height={240} sx={{ mb: 2 }} />
          <Skeleton variant="rectangular" height={200} />
        </Box>
      ) : rows.length === 0 ? (
        <EmptyState 
          icon={BarChartIcon}
          title="No data available"
          message="This session has no results yet or has not been completed"
        />
      ) : (
        <>
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField size="small" label="Filter (player id)" value={query} onChange={e=>setQuery(e.target.value)} />
        <TextField size="small" label="Sort by" value={sort} onChange={e=>setSort(e.target.value)} />
        <Select size="small" value={metric} onChange={e=>setMetric(e.target.value)}>
          <MenuItem value="profit_zar">Profit</MenuItem>
          <MenuItem value="revenue_zar">Revenue</MenuItem>
          <MenuItem value="imbalance_cost_zar">Imbalance Cost</MenuItem>
          <MenuItem value="curtailment_cost_zar">Curtailment Cost</MenuItem>
        </Select>
        <TextField size="small" label="Filename" value={fileBase} onChange={e=>setFileBase(e.target.value)} />
      </Stack>
      <Typography variant="subtitle1" sx={{ mt:2 }}>{metric.replace(/_/g,' ').toUpperCase()} – Bar Chart</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
        <div style={{ width: 12, height: 12, background: '#1976d2', marginRight: 6 }} />
        <Typography variant="caption">{metric.replace(/_/g,' ')}</Typography>
        <span style={{ flex: 1 }} />
        <Typography variant="caption" sx={{ mr:1 }}>Export:</Typography>
        <button onClick={()=> exportSVG(chartRef.current, `${fileBase||`comparison_${metric}`}.svg`)}>SVG</button>
        <button onClick={()=> exportPNG(chartRef.current, `${fileBase||`comparison_${metric}`}.png`)}>PNG</button>
      </Stack>
      <MetricBarChart ref={chartRef} data={view} metric={metric} />
      <Table size="small" sx={{ mt:2 }}>
        <TableHead>
          <TableRow>
            <TableCell>Player</TableCell>
            <TableCell align="right">Profit</TableCell>
            <TableCell align="right">Revenue</TableCell>
            <TableCell align="right">Imbalance</TableCell>
            <TableCell align="right">Curtailment</TableCell>
            <TableCell align="right">Rounds</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {view.map(r=> (
            <TableRow key={r.player_id}>
              <TableCell>{r.player_id}</TableCell>
              <TableCell align="right">{r.profit_zar}</TableCell>
              <TableCell align="right">{r.revenue_zar}</TableCell>
              <TableCell align="right">{r.imbalance_cost_zar}</TableCell>
              <TableCell align="right">{r.curtailment_cost_zar}</TableCell>
              <TableCell align="right">{r.rounds}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
        </>
      )}
    </Paper>
  )
}