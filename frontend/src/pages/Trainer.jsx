import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, Tooltip, Checkbox, FormControlLabel } from '@mui/material'
import InfoLabel from '../components/InfoLabel'
import { io } from 'socket.io-client'
import api from '../services/api'
import * as d3 from 'd3'
import { exportSVG, exportPNG } from '../utils/exportSvg'

export default function Trainer(){
  const [cohortId, setCohortId] = useState('1')
  const [scenarioId, setScenarioId] = useState('1')
  const [sessionId, setSessionId] = useState(null)
  const [log, setLog] = useState([])
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(null)
  const [status, setStatus] = useState({ rounds: 0, players: [] })
  const [mode, setMode] = useState('isolated_per_player')
  const [typesCfg, setTypesCfg] = useState([]) // from scenario config
  const [allowedTypes, setAllowedTypes] = useState([]) // [{type_id, enabled, max_players}]
  const [brief, setBrief] = useState(null)
  const typeDistRef = useRef(null)
  const capRemainRef = useRef(null)
  const devFreqRef = useRef(null)
  const [series, setSeries] = useState([]) // { r, mcp, volume }
  const [agg, setAgg] = useState({}) // { player_id: { profit, revenue, imbalance, curtailment, rounds } }
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  const topRef = useRef(null)

  useEffect(()=>{
    const s = io('/trainer', { path: '/socket.io', transports: ['websocket','polling'], forceNew: true })
    s.on('connect', ()=> setLog(l=>[...l, 'socket connected']))
    s.on('session_started', p=> setLog(l=>[...l, `session_started ${JSON.stringify(p)}`]))
    s.on('session_paused', p=> setLog(l=>[...l, `session_paused ${JSON.stringify(p)}`]))
    s.on('session_resumed', p=> setLog(l=>[...l, `session_resumed ${JSON.stringify(p)}`]))
    s.on('session_ended', p=> setLog(l=>[...l, `session_ended ${JSON.stringify(p)}`]))
    s.on('message', p=> setLog(l=>[...l, `message ${JSON.stringify(p)}`]))
    s.on('player_submit', p=> setLog(l=>[...l, `player_submit ${JSON.stringify(p)}`]))
    s.on('tick', p=> setTick(p?.remaining))
    s.on('round_results', p=> {
      loadStatus()
      if(p?.round && p?.mcp!=null){ setSeries(prev=> [...prev, { r: p.round, mcp: p.mcp, volume: p.volume }]) }
      if(p?.kpis){
        setAgg(prev => {
          const next = { ...prev }
          Object.entries(p.kpis).forEach(([pid, k])=>{
            const id = Number(pid)
            const row = next[id] || { profit:0, revenue:0, imbalance:0, curtailment:0, rounds:0 }
            row.profit += (k.profit_zar||0)
            row.revenue += (k.revenue_zar||0)
            row.imbalance += (k.imbalance_cost_zar||0)
            row.curtailment += (k.curtailment_cost_zar||0)
            row.rounds += 1
            next[id] = row
          })
          return next
        })
      }
    })
    return ()=> s.close()
  },[])

  const start = async ()=>{
    const { data } = await api.post('/api/sessions', { cohort_id: Number(cohortId), scenario_id: Number(scenarioId), mode })
    setSessionId(data.id)
    // apply allowed types after start if any selected
    if(mode==='shared_market' && allowedTypes?.some(t=> t.enabled)){
      try{
        await api.patch(`/api/sessions/${data.id}/allowed-types`, { allowed: allowedTypes.filter(t=> t.enabled).map(t=> ({ type_id: t.type_id, max_players: t.max_players ?? null })) })
      }catch(_){ /* ignore for now */ }
    }
    setTimeout(loadStatus, 300)
  }
  const pause = async ()=>{ await api.patch(`/api/sessions/${sessionId}/pause`) }
  const resume = async ()=>{ await api.patch(`/api/sessions/${sessionId}/resume`) }
  const end = async ()=>{ await api.patch(`/api/sessions/${sessionId}/end`) }
  const broadcast = async ()=>{ await api.post(`/api/sessions/${sessionId}/broadcast`, { message }); setMessage('') }
  const loadStatus = async ()=>{
    if(!sessionId) return
    const { data } = await api.get(`/api/sessions/${sessionId}/status`)
    setStatus(data)
    // also load briefing for type/device charts
    try{
      const b = await api.get(`/api/sessions/${sessionId}/briefing`)
      setBrief(b.data)
    }catch(_){ setBrief(null) }
  }

  // load scenario types when scenarioId changes
  useEffect(()=>{
    const run = async ()=>{
      if(!scenarioId) return
      try{
        const res = await api.get('/api/kse/scenarios')
        const s = (res.data||[]).find(x=> Number(x.id)===Number(scenarioId))
        const pts = s?.config?.player_types || []
        setTypesCfg(pts)
        setAllowedTypes(pts.map(pt=> ({ type_id: pt.id, enabled: false, max_players: '' })))
      }catch(_){ setTypesCfg([]); setAllowedTypes([]) }
    }
    run()
  },[scenarioId])

  // Draw type distribution & capacity remaining & device frequency
  useEffect(()=>{
    if(!brief || !status?.players) return
    const players = status.players || []
    const types = (brief.player_types||[]).map(t=> t.id)
    const counts = {}
    players.forEach(p=>{ if(p.type){ counts[p.type] = (counts[p.type]||0)+1 } })
    // Type distribution bar chart
    if(typeDistRef.current){
      const data = types.map(t=> ({ type_id: t, count: counts[t]||0 }))
      const svg = d3.select(typeDistRef.current); svg.selectAll('*').remove()
      const W=360,H=150,m={top:10,right:10,bottom:40,left:40}
      const iw=W-m.left-m.right, ih=H-m.top-m.bottom
      const g=svg.attr('width',W).attr('height',H).append('g').attr('transform',`translate(${m.left},${m.top})`)
      const x=d3.scaleBand().domain(data.map(d=> d.type_id)).range([0,iw]).padding(0.2)
      const y=d3.scaleLinear().domain([0, d3.max(data,d=> d.count)||1]).nice().range([ih,0])
      g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(20)').style('text-anchor','start')
      g.append('g').call(d3.axisLeft(y).ticks(4))
      g.selectAll('rect').data(data).enter().append('rect').attr('x',d=>x(d.type_id)).attr('y',d=>y(d.count)).attr('width',x.bandwidth()).attr('height',d=> ih - y(d.count)).attr('fill','#1976d2')
    }
    // Capacity remaining bar chart (if allowed_player_types present)
    if(capRemainRef.current && Array.isArray(brief.allowed_player_types)){
      const data = brief.allowed_player_types.map(a=> ({ type_id:a.type_id, remaining: a.remaining==null?0:a.remaining }))
      const svg = d3.select(capRemainRef.current); svg.selectAll('*').remove()
      const W=360,H=150,m={top:10,right:10,bottom:40,left:50}
      const iw=W-m.left-m.right, ih=H-m.top-m.bottom
      const g=svg.attr('width',W).attr('height',H).append('g').attr('transform',`translate(${m.left},${m.top})`)
      const x=d3.scaleBand().domain(data.map(d=> d.type_id)).range([0,iw]).padding(0.2)
      const y=d3.scaleLinear().domain([0, d3.max(data,d=> d.remaining)||1]).nice().range([ih,0])
      g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(20)').style('text-anchor','start')
      g.append('g').call(d3.axisLeft(y).ticks(4))
      g.selectAll('rect').data(data).enter().append('rect').attr('x',d=>x(d.type_id)).attr('y',d=>y(d.remaining)).attr('width',x.bandwidth()).attr('height',d=> ih - y(d.remaining)).attr('fill','#2e7d32')
    }
    // Device frequency across selected types (sum devices per type times players of that type)
    if(devFreqRef.current){
      const ptById = {}
      ;(brief.player_types||[]).forEach(t=> ptById[t.id]=t)
      const freq = {}
      Object.entries(counts).forEach(([tid, cnt])=>{
        const devs = ptById[tid]?.devices || []
        devs.forEach(did=>{ freq[did] = (freq[did]||0) + cnt })
      })
      const data = Object.entries(freq).map(([did,val])=> ({ did, val })).sort((a,b)=> b.val-a.val).slice(0,8)
      const svg = d3.select(devFreqRef.current); svg.selectAll('*').remove()
      const W=360,H=150,m={top:10,right:10,bottom:20,left:60}
      const iw=W-m.left-m.right, ih=H-m.top-m.bottom
      const g=svg.attr('width',W).attr('height',H).append('g').attr('transform',`translate(${m.left},${m.top})`)
      const y=d3.scaleBand().domain(data.map(d=> d.did)).range([0,ih]).padding(0.2)
      const x=d3.scaleLinear().domain([0, d3.max(data,d=> d.val)||1]).range([0,iw]).nice()
      g.append('g').call(d3.axisLeft(y))
      g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).ticks(4))
      g.selectAll('rect').data(data).enter().append('rect').attr('y',d=>y(d.did)).attr('x',0).attr('height',y.bandwidth()).attr('width',d=> x(d.val)).attr('fill','#9c27b0')
    }
  },[brief, status])

  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Trainer – Session Control</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Stack spacing={0.5} sx={{ minWidth: 180 }}>
          <InfoLabel title="Cohort to run the session for" tooltip="Numeric cohort identifier. Players assigned to this cohort will participate in the session." />
          <TextField label="Cohort ID" value={cohortId} onChange={e=>setCohortId(e.target.value)} size="small"/>
        </Stack>
        <Stack spacing={0.5} sx={{ minWidth: 180 }}>
          <InfoLabel title="Scenario to execute" tooltip="Numeric scenario identifier created in the KSE. Its configuration controls time, markets, grid, and scoring." />
          <TextField label="Scenario ID" value={scenarioId} onChange={e=>setScenarioId(e.target.value)} size="small"/>
        </Stack>
        <Stack spacing={0.5} sx={{ minWidth: 220 }}>
          <InfoLabel title="Session mode" tooltip="isolated_per_player: each player clears a private market; shared_market: all players are aggregated and clear a shared market." />
          <Select size="small" value={mode} onChange={e=>setMode(e.target.value)}>
            <MenuItem value="isolated_per_player">isolated_per_player</MenuItem>
            <MenuItem value="shared_market">shared_market</MenuItem>
          </Select>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip arrow title="Starts a new session with the selected cohort, scenario, and mode."><span><Button variant="contained" onClick={start}>Start</Button></span></Tooltip>
          <Tooltip arrow title="Pauses the countdown and submissions."><span><Button onClick={pause} disabled={!sessionId}>Pause</Button></span></Tooltip>
          <Tooltip arrow title="Resumes a paused session."><span><Button onClick={resume} disabled={!sessionId}>Resume</Button></span></Tooltip>
          <Tooltip arrow title="Ends the session and finalizes results."><span><Button onClick={end} disabled={!sessionId}>End</Button></span></Tooltip>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt:2 }}>
        <Stack spacing={0.5} sx={{ flex: 1 }}>
          <InfoLabel title="Broadcast message to all players" tooltip="Sends a trainer message to all connected players in this session. Keep it brief (≤200 chars)." />
          <TextField label="Broadcast" value={message} onChange={e=>setMessage(e.target.value)} size="small" fullWidth/>
        </Stack>
        <Tooltip arrow title="Sends the broadcast to session players."><span><Button onClick={broadcast} disabled={!sessionId || !message}>Send</Button></span></Tooltip>
      </Stack>
      {mode==='shared_market' && typesCfg.length>0 && (
        <Paper variant="outlined" sx={{ p:2, mt:2 }}>
          <Typography variant="subtitle1" gutterBottom>Allowed Player Types (shared market)</Typography>
          <Stack spacing={1}>
            {allowedTypes.map((row, idx)=> (
              <Stack key={row.type_id} direction="row" spacing={2} alignItems="center">
                <FormControlLabel control={<Checkbox checked={!!row.enabled} onChange={e=> setAllowedTypes(prev=> prev.map((r,i)=> i===idx? { ...r, enabled: e.target.checked }: r))} />} label={row.type_id} />
                <TextField size="small" type="number" label="Max players (optional)" value={row.max_players} onChange={e=>{
                  const v = e.target.value
                  setAllowedTypes(prev=> prev.map((r,i)=> i===idx? { ...r, max_players: v===''? '' : Number(v) }: r))
                }} sx={{ width: 180 }} />
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" disabled={!sessionId} onClick={async()=>{
                try{
                  await api.patch(`/api/sessions/${sessionId}/allowed-types`, { allowed: allowedTypes.filter(t=> t.enabled).map(t=> ({ type_id: t.type_id, max_players: t.max_players===''? null : Number(t.max_players) })) })
                }catch(_){ /* show snack later */ }
              }}>Apply to Session</Button>
              <Button size="small" onClick={async()=>{
                if(!sessionId) return
                const res = await api.get(`/api/sessions/${sessionId}/briefing`)
                alert(JSON.stringify(res.data?.allowed_player_types || [], null, 2))
              }}>Preview Remaining</Button>
            </Stack>
          </Stack>
        </Paper>
      )}
  <Typography variant="subtitle1" sx={{ mt:2 }}>Countdown: {tick ?? '—'} s</Typography>
  <Typography variant="subtitle1" sx={{ mt:2 }}>Events</Typography>
      <Paper variant="outlined" sx={{ p:1, maxHeight:220, overflow:'auto' }}>
        {log.map((l,i)=>(<Typography key={i} variant="caption" display="block">{l}</Typography>))}
      </Paper>
      <Typography variant="subtitle1" sx={{ mt:2 }}>Status</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Player</TableCell>
            <TableCell>Type</TableCell>
            {Array.from({length: status.rounds||0}, (_,i)=> <TableCell key={i}>R{i+1}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {status.players.map(p=> (
            <TableRow key={p.player_id}>
              <TableCell>{p.email}</TableCell>
              <TableCell>{p.type || '—'}</TableCell>
              {p.status.map(s=> <TableCell key={s.round}>{s.submitted ? '✓' : '—'}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* MCP Chart */}
      {series.length>0 && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:2 }}><Typography variant="subtitle2">MCP</Typography>
        <span style={{ flex:1 }} />
        <Button size="small" onClick={()=> mcpRef.current && exportSVG(mcpRef.current, 'trainer_mcp.svg')}>SVG</Button>
        <Button size="small" onClick={()=> mcpRef.current && exportPNG(mcpRef.current, 'trainer_mcp.png')}>PNG</Button>
      </Stack>}
    {series.length>0 && <svg ref={(el)=>{
          mcpRef.current = el
          if(!el) return
      const svg = d3.select(el); svg.selectAll('*').remove();
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip.style('position','absolute').style('pointer-events','none').style('background','#111').style('color','#fff').style('padding','4px 8px').style('border-radius','4px').style('font-size','12px').style('display','none').style('z-index','9999')
      const m = {top:10,right:10,bottom:30,left:46}; const w=360-m.left-m.right; const h=120-m.top-m.bottom;
          const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`)
          const x = d3.scaleLinear().domain([1, d3.max(series, d=> d.r)||1]).range([0,w])
          const y = d3.scaleLinear().domain([d3.min(series, d=> d.mcp)||0, d3.max(series, d=> d.mcp)||1]).nice().range([h,0])
          const line = d3.line().x(d=> x(d.r)).y(d=> y(d.mcp))
      // gridlines
      g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
          g.append('path').datum(series).attr('fill','none').attr('stroke','#2e7d32').attr('stroke-width',2).attr('d', line)
          g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(series.length))
          g.append('g').call(d3.axisLeft(y).ticks(4))
          // points + tooltips
          g.selectAll('circle.point')
            .data(series)
            .enter()
            .append('circle')
            .attr('class','point')
            .attr('cx', d=> x(d.r))
            .attr('cy', d=> y(d.mcp))
            .attr('r', 3)
            .attr('fill', '#2e7d32')
            .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`R${d.r}: ${d.mcp} ZAR/MWh`) })
            .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
            .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', w/2).attr('y', h+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform','rotate(-90)').attr('x', -h/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('MCP (ZAR/MWh)')
        }} width={360} height={120} style={{border:'1px solid #eee'}} />}

      {/* Volume Chart */}
      {series.length>0 && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:2 }}><Typography variant="subtitle2">Volume</Typography>
        <span style={{ flex:1 }} />
        <Button size="small" onClick={()=> volRef.current && exportSVG(volRef.current, 'trainer_volume.svg')}>SVG</Button>
        <Button size="small" onClick={()=> volRef.current && exportPNG(volRef.current, 'trainer_volume.png')}>PNG</Button>
      </Stack>}
    {series.length>0 && <svg ref={(el)=>{
          volRef.current = el
          if(!el) return
      const svg = d3.select(el); svg.selectAll('*').remove();
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip.style('position','absolute').style('pointer-events','none').style('background','#111').style('color','#fff').style('padding','4px 8px').style('border-radius','4px').style('font-size','12px').style('display','none').style('z-index','9999')
      const m = {top:10,right:10,bottom:30,left:46}; const w=360-m.left-m.right; const h=120-m.top-m.bottom;
          const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`)
          const x = d3.scaleLinear().domain([1, d3.max(series, d=> d.r)||1]).range([0,w])
          const y = d3.scaleLinear().domain([0, d3.max(series, d=> d.volume)||1]).nice().range([h,0])
          const line = d3.line().x(d=> x(d.r)).y(d=> y(d.volume))
      // gridlines
      g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
          g.append('path').datum(series).attr('fill','none').attr('stroke','#1976d2').attr('stroke-width',2).attr('d', line)
          g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(series.length))
          g.append('g').call(d3.axisLeft(y).ticks(4))
          // points + tooltips
          g.selectAll('circle.point')
            .data(series)
            .enter()
            .append('circle')
            .attr('class','point')
            .attr('cx', d=> x(d.r))
            .attr('cy', d=> y(d.volume))
            .attr('r', 3)
            .attr('fill', '#1976d2')
            .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`R${d.r}: ${d.volume} MWh`) })
            .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
            .on('mouseleave', ()=> { tooltip.style('display','none') })
      // axis labels
      g.append('text').attr('x', w/2).attr('y', h+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform','rotate(-90)').attr('x', -h/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
        }} width={360} height={120} style={{border:'1px solid #eee'}} />}

      {/* KPI Profit Top N */}
      {Object.keys(agg).length>0 && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:2 }}><Typography variant="subtitle2">Top Profit</Typography>
        <span style={{ flex:1 }} />
        <Button size="small" onClick={()=> topRef.current && exportSVG(topRef.current, 'trainer_top_profit.svg')}>SVG</Button>
        <Button size="small" onClick={()=> topRef.current && exportPNG(topRef.current, 'trainer_top_profit.png')}>PNG</Button>
      </Stack>}
      {Object.keys(agg).length>0 && <svg ref={(el)=>{
          topRef.current = el
          if(!el) return
          const data = Object.entries(agg).map(([pid, v])=> ({ player_id: Number(pid), profit: v.profit }))
            .sort((a,b)=> b.profit - a.profit).slice(0,8)
          const svg = d3.select(el); svg.selectAll('*').remove();
          const m = {top:10,right:10,bottom:20,left:40}; const w=360-m.left-m.right; const h=150-m.top-m.bottom;
          const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`)
          const x = d3.scaleLinear().domain([0, d3.max(data, d=> d.profit)||1]).range([0,w])
          const y = d3.scaleBand().domain(data.map(d=> String(d.player_id))).range([0,h]).padding(0.2)
          g.append('g').call(d3.axisLeft(y))
          g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(4))
          g.selectAll('rect').data(data).enter().append('rect')
            .attr('x', 0).attr('y', d=> y(String(d.player_id)))
            .attr('width', d=> x(d.profit)).attr('height', y.bandwidth())
            .attr('fill', '#9c27b0')
            .append('title').text(d=> `P${d.player_id}: ${d.profit} ZAR`)
        }} width={360} height={150} style={{border:'1px solid #eee'}} />}
        {/* KPI Imbalance & Curtailment (Top N combined as two small charts) */}
        {Object.keys(agg).length>0 && <Stack direction="row" spacing={2} sx={{ mt:2 }}>
          <svg width={360} height={150} style={{border:'1px solid #eee'}} ref={(el)=>{
            if(!el) return
            const data = Object.entries(agg).map(([pid, v])=> ({ player_id: Number(pid), val: v.imbalance }))
              .sort((a,b)=> b.val - a.val).slice(0,8)
            const svg = d3.select(el); svg.selectAll('*').remove();
            const m = {top:10,right:10,bottom:20,left:60}; const w=360-m.left-m.right; const h=150-m.top-m.bottom;
            const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`)
            const x = d3.scaleLinear().domain([0, d3.max(data, d=> d.val)||1]).range([0,w])
            const y = d3.scaleBand().domain(data.map(d=> String(d.player_id))).range([0,h]).padding(0.2)
            g.append('g').call(d3.axisLeft(y))
            g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(4))
            g.selectAll('rect').data(data).enter().append('rect')
              .attr('x', 0).attr('y', d=> y(String(d.player_id)))
              .attr('width', d=> x(d.val)).attr('height', y.bandwidth())
              .attr('fill', '#f57c00')
          }} />
          <svg width={360} height={150} style={{border:'1px solid #eee'}} ref={(el)=>{
            if(!el) return
            const data = Object.entries(agg).map(([pid, v])=> ({ player_id: Number(pid), val: v.curtailment }))
              .sort((a,b)=> b.val - a.val).slice(0,8)
            const svg = d3.select(el); svg.selectAll('*').remove();
            const m = {top:10,right:10,bottom:20,left:60}; const w=360-m.left-m.right; const h=150-m.top-m.bottom;
            const g = svg.append('g').attr('transform',`translate(${m.left},${m.top})`)
            const x = d3.scaleLinear().domain([0, d3.max(data, d=> d.val)||1]).range([0,w])
            const y = d3.scaleBand().domain(data.map(d=> String(d.player_id))).range([0,h]).padding(0.2)
            g.append('g').call(d3.axisLeft(y))
            g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(x).ticks(4))
            g.selectAll('rect').data(data).enter().append('rect')
              .attr('x', 0).attr('y', d=> y(String(d.player_id)))
              .attr('width', d=> x(d.val)).attr('height', y.bandwidth())
              .attr('fill', '#c62828')
          }} />
        </Stack>}
      <Stack direction="row" spacing={1} sx={{ mt:2 }}>
        <Button size="small" onClick={()=> { setSeries([]); setAgg({}) }}>Reset Charts</Button>
      </Stack>

      {/* Type Distribution & Capacity Remaining */}
      {brief && <>
        <Typography variant="subtitle1" sx={{ mt:2 }}>Type Distribution</Typography>
        <svg ref={typeDistRef} width={360} height={150} style={{border:'1px solid #eee'}} />
        {Array.isArray(brief.allowed_player_types) && <>
          <Typography variant="subtitle1" sx={{ mt:2 }}>Capacity Remaining (by Type)</Typography>
          <svg ref={capRemainRef} width={360} height={150} style={{border:'1px solid #eee'}} />
        </>}
        <Typography variant="subtitle1" sx={{ mt:2 }}>Top Devices (by assigned players)</Typography>
        <svg ref={devFreqRef} width={360} height={150} style={{border:'1px solid #eee'}} />
      </>}
    </Paper>
  )
}