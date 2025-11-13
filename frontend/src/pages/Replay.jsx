import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Paper, Typography, Slider, Stack, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material'
import api from '../services/api'
import * as d3 from 'd3'
import { exportPNG, exportSVG } from '../utils/exportSvg'

const LineChart = forwardRef(function LineChart({ rounds, metric='mcp', color='#2e7d32', width=640, height=200 }, ref) {
  useEffect(()=>{
    if(!ref?.current) return
    const data = rounds.map((r,i)=> ({ i:i+1, y: r[metric] }))
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const margin = { top: 10, right: 10, bottom: 24, left: 40 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg.attr('width', width).attr('height', height).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const x = d3.scaleLinear().domain([1, data.length]).range([0, innerW])
    const y = d3.scaleLinear().domain([d3.min(data, d=>d.y)||0, d3.max(data, d=>d.y)||1]).nice().range([innerH, 0])
    const line = d3.line().x(d=> x(d.i)).y(d=> y(d.y))
    g.append('path').datum(data).attr('fill','none').attr('stroke',color).attr('stroke-width',2).attr('d', line)
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(d3.scaleLinear().domain([1, data.length]).range([0, innerW]).ticks(data.length)))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    // points with titles for tooltip
    g.selectAll('circle').data(data).enter().append('circle')
      .attr('cx', d=> x(d.i))
      .attr('cy', d=> y(d.y))
      .attr('r', 3)
      .attr('fill', color)
      .append('title').text(d=> `${metric.toUpperCase()} R${d.i}: ${d.y}`)
  },[rounds, width, height, metric, color, ref])
  return <svg ref={ref} />
})

export default function Replay(){
  const [params] = useSearchParams()
  const [data, setData] = useState({ rounds: [] })
  const sid = params.get('session')
  const [idx, setIdx] = useState(0)
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  const [fileMcp, setFileMcp] = useState('replay_mcp')
  const [fileVol, setFileVol] = useState('replay_volume')
  useEffect(()=>{
    const load = async ()=>{
      if(!sid) return
      const { data } = await api.get(`/api/sessions/${sid}/replay`)
      setData(data)
      setIdx(0)
      setFileMcp(`replay_mcp_session_${sid}`)
      setFileVol(`replay_volume_session_${sid}`)
    }
    load()
  },[sid])

  const round = (data.rounds && data.rounds.length > 0) ? data.rounds[idx] : null
  const marks = useMemo(()=> (data.rounds||[]).map((r,i)=>({ value: i, label: `R${r.round}` })), [data])

  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Replay</Typography>
      <Typography variant="body2">Session {sid} • Scenario: {data.session?.scenario} • MCP series</Typography>
      <Stack sx={{ mt:2 }}>
        <Slider min={0} max={Math.max(0,(data.rounds?.length||1)-1)} value={idx} onChange={(_,v)=>setIdx(v)} marks={marks} step={1} valueLabelDisplay="auto"/>
      </Stack>
  <Typography variant="subtitle1" sx={{ mt:2 }} data-testid="replay-mcp-title">MCP over rounds</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
        <div style={{ width: 12, height: 12, background: '#2e7d32', marginRight: 6 }} />
        <Typography variant="caption">MCP</Typography>
        <span style={{ flex: 1 }} />
        <Typography variant="caption" sx={{ mr:1 }}>Export:</Typography>
        <input style={{ width: 180 }} value={fileMcp} onChange={e=>setFileMcp(e.target.value)} />
        <button onClick={()=> exportSVG(mcpRef.current, `${fileMcp||'replay_mcp'}.svg`)}>SVG</button>
        <button onClick={()=> exportPNG(mcpRef.current, `${fileMcp||'replay_mcp'}.png`)}>PNG</button>
      </Stack>
      {(data.rounds && data.rounds.length>0) && <LineChart ref={mcpRef} rounds={data.rounds||[]} metric="mcp" color="#2e7d2" />}
      <Typography variant="subtitle1" sx={{ mt:2 }} data-testid="replay-volume-title">Volume over rounds</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
        <div style={{ width: 12, height: 12, background: '#1976d2', marginRight: 6 }} />
        <Typography variant="caption">Volume</Typography>
        <span style={{ flex: 1 }} />
        <Typography variant="caption" sx={{ mr:1 }}>Export:</Typography>
        <input style={{ width: 180 }} value={fileVol} onChange={e=>setFileVol(e.target.value)} />
        <button onClick={()=> exportSVG(volRef.current, `${fileVol||'replay_volume'}.svg`)}>SVG</button>
        <button onClick={()=> exportPNG(volRef.current, `${fileVol||'replay_volume'}.png`)}>PNG</button>
      </Stack>
      {(data.rounds && data.rounds.length>0) && <LineChart ref={volRef} rounds={data.rounds||[]} metric="volume" color="#1976d2" />}
  {(!data.rounds || data.rounds.length===0) && <Typography variant="body2" sx={{ mt:2 }}>No replay data.</Typography>}
      {round && (
        <>
          <Typography sx={{ mt:2 }}>Round {round.round} • MCP {round.mcp} • Volume {round.volume}</Typography>
          <Table size="small" sx={{ mt:1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Player</TableCell>
                <TableCell align="right">Planned (MWh)</TableCell>
                <TableCell align="right">Actual</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell align="right">Imbalance</TableCell>
                <TableCell align="right">Curtailment</TableCell>
                <TableCell align="right">Profit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {round.players.map(p=> (
                <TableRow key={p.player_id}>
                  <TableCell>{p.player_id}</TableCell>
                  <TableCell align="right">{p.kpis.planned_mwh}</TableCell>
                  <TableCell align="right">{p.kpis.actual_mwh}</TableCell>
                  <TableCell align="right">{p.kpis.revenue_zar}</TableCell>
                  <TableCell align="right">{p.kpis.imbalance_cost_zar}</TableCell>
                  <TableCell align="right">{p.kpis.curtailment_cost_zar}</TableCell>
                  <TableCell align="right">{p.kpis.profit_zar}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Paper>
  )
}