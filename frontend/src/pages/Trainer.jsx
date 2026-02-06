import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, Tooltip, Checkbox, FormControlLabel, Chip, Box, IconButton, Dialog, DialogTitle, DialogContent, IconButton as MuiIconButton, Skeleton } from '@mui/material'
import { Pause as PauseIcon, PlayArrow as ResumeIcon, Stop as StopIcon, BarChart as ComparisonIcon, Close as CloseIcon } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import InfoLabel from '../components/InfoLabel'
import { io } from 'socket.io-client'
import api from '../services/api'
import * as d3 from 'd3'
import { exportSVG, exportPNG } from '../utils/exportSvg'
import DocsFab from '../components/DocsFab'

export default function Trainer(){
  const [searchParams] = useSearchParams()
  const cohortId = searchParams.get('cohort') || '1'
  const [campaignId, setCampaignId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [sessionId, setSessionId] = useState(null)
  // Presence panel state
  const [presence, setPresence] = useState({ users: [] })
  const [log, setLog] = useState([])
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(null)
  const [status, setStatus] = useState({ rounds: 0, players: [] })
  const [forceNavigate, setForceNavigate] = useState(false)
  const [typesCfg, setTypesCfg] = useState([]) // from scenario config
  const [allowedTypes, setAllowedTypes] = useState([]) // [{type_id, enabled, max_players}]
  const [brief, setBrief] = useState(null)
  const typeDistRef = useRef(null)
  const capRemainRef = useRef(null)
  const devFreqRef = useRef(null)
  const [series, setSeries] = useState([]) // { r, smp, volume }
  const [agg, setAgg] = useState({}) // { player_id: { profit, revenue, imbalance, curtailment, rounds } }
  const smpRef = useRef(null)
  const volRef = useRef(null)
  const topRef = useRef(null)
  const [participants, setParticipants] = useState({ participants: [], summary: { total: 0, joined: 0, pending: 0, by_type: {} } })
  const [campaigns, setCampaigns] = useState([])
  const [campScenarios, setCampScenarios] = useState([])
  const [sessionInfo, setSessionInfo] = useState(null)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [comparisonData, setComparisonData] = useState([])
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonMetric, setComparisonMetric] = useState('profit_zar')
  const comparisonChartRef = useRef(null)
  const [cohortMembers, setCohortMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Shared market trainer UI enabled
  const isDisabled = false

  useEffect(()=>{
    const s = io('/trainer', { path: '/socket.io', transports: ['websocket','polling'], forceNew: true })
    s.on('connect', ()=> setLog(l=>[...l, 'socket connected']))
    s.on('session_started', p=> setLog(l=>[...l, `session_started ${JSON.stringify(p)}`]))
    s.on('session_paused', p=> setLog(l=>[...l, `session_paused ${JSON.stringify(p)}`]))
    s.on('session_resumed', p=> setLog(l=>[...l, `session_resumed ${JSON.stringify(p)}`]))
    s.on('session_ended', p=> {
      setLog(l=>[...l, `session_ended ${JSON.stringify(p)}`])
      if(p?.session_id && Number(p.session_id)===Number(sessionId)){
        setSessionId(null)
        setSessionInfo(null)
        setTick(null)
      }
    })
    s.on('message', p=> setLog(l=>[...l, `message ${JSON.stringify(p)}`]))
    s.on('player_submit', p=> setLog(l=>[...l, `player_submit ${JSON.stringify(p)}`]))
    s.on('tick', p=> setTick(p?.remaining))
    s.on('round_results', p=> {
      loadStatus()
      if(p?.round && p?.smp!=null){ setSeries(prev=> [...prev, { r: p.round, smp: p.smp, volume: p.volume }]) }
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

  // Cohort comes from URL parameter - no need to load all cohorts

  // When cohort changes: check active session and load campaigns visible for cohort
  useEffect(()=>{
    if(!cohortId) return
    const run = async ()=>{
      try{
        // Check active session for cohort
        const activeRes = await api.get('/api/sessions/active', { params: { cohort_id: Number(cohortId) } })
        const active = activeRes.data?.active
        if(active && active.id){
          setSessionId(active.id)
          setSessionInfo(active)
        }else{
          setSessionId(null)
          setSessionInfo(null)
        }
      }catch(_){ setSessionId(null); setSessionInfo(null) }
      try{
        const { data } = await api.get(`/api/cohorts/${cohortId}/campaigns`)
        const visible = (data||[]).filter(c=> c.visible && (c.published===true))
        setCampaigns(visible)
        setCampaignId(visible.length? String(visible[0].campaign_id) : '')
      }catch(_){ setCampaigns([]); setCampaignId('') }
    }
    run()
  },[cohortId])

  // When campaign changes: load scenarios from catalog and filter cohort-enabled
  useEffect(()=>{
    if(!campaignId) { setCampScenarios([]); setScenarioId(''); return }
    const run = async ()=>{
      try{
        const { data } = await api.get(`/api/catalog/campaigns/${campaignId}`)
        const list = (data?.scenarios||[]).filter(s=> s.cohort_enabled !== false)
        setCampScenarios(list)
        setScenarioId(list.length? String(list[0].scenario_id): '')
      }catch(_){ setCampScenarios([]); setScenarioId('') }
    }
    run()
  },[campaignId])

  // Presence auto-refresh every 5s
  useEffect(()=>{
    const load = async ()=>{
      try{
        const qs = cohortId ? `?cohort_id=${encodeURIComponent(cohortId)}` : ''
        const { data } = await api.get(`/api/trainer/presence${qs}`)
        setPresence(data || { users: [] })
      }catch(_){ setPresence({ users: [] }) }
    }
    load()
    const t = setInterval(load, 5000)
    return ()=> clearInterval(t)
  },[cohortId])

  // Load cohort members when cohortId changes
  useEffect(() => {
    const loadMembers = async () => {
      if (!cohortId) {
        setCohortMembers([])
        return
      }
      setMembersLoading(true)
      try {
        const { data } = await api.get(`/api/trainer/cohort/${cohortId}/members`)
        setCohortMembers(data.members || [])
      } catch (err) {
        console.error('Failed to load cohort members:', err)
        setCohortMembers([])
      } finally {
        setMembersLoading(false)
      }
    }
    loadMembers()
    // Refresh every 10 seconds
    const interval = setInterval(loadMembers, 10000)
    return () => clearInterval(interval)
  }, [cohortId])

  // Auto refresh participants/status every 5s when a session is active
  useEffect(()=>{
    if(!sessionId) return
    const t = setInterval(()=>{
      loadStatus()
    }, 5000)
    return ()=> clearInterval(t)
  },[sessionId])

  const start = async ()=>{
    try{
      const { data } = await api.post('/api/sessions', { cohort_id: Number(cohortId), scenario_id: Number(scenarioId), mode: 'shared_market', force_navigate: !!forceNavigate })
      setSessionId(data.id)
      // apply allowed types after start if any selected
      if(allowedTypes?.some(t=> t.enabled)){
        try{
          await api.patch(`/api/sessions/${data.id}/allowed-types`, { allowed: allowedTypes.filter(t=> t.enabled).map(t=> ({ type_id: t.type_id, max_players: t.max_players ?? null })) })
        }catch(_){ /* ignore for now */ }
      }
      setTimeout(loadStatus, 300)
    }catch(e){
      const msg = e.response?.data?.error || 'Failed to start session'
      if(window.__showSnack) window.__showSnack(msg, 'error')
      console.error('Start session error:', e)
    }
  }
  const pause = async ()=>{ await api.patch(`/api/sessions/${sessionId}/pause`) }
  const resume = async ()=>{ await api.patch(`/api/sessions/${sessionId}/resume`) }
  const end = async ()=>{ 
    try{
      await api.patch(`/api/sessions/${sessionId}/end`)
    }finally{
      setSessionId(null)
      setSessionInfo(null)
      setTick(null)
    }
  }
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
    // load participants
    try{
      const res = await api.get(`/api/sessions/${sessionId}/participants`)
      setParticipants(res.data)
    }catch(_){ setParticipants({ participants: [], summary: { total:0, joined:0, pending:0, by_type:{} } }) }
    // load session info (status, round, etc.)
    try{
      const info = await api.get(`/api/sessions/${sessionId}`)
      setSessionInfo(info.data)
    }catch(_){ setSessionInfo(null) }
  }

  // load scenario types when scenarioId changes (best-effort; may require designer role)
  useEffect(()=>{
    const run = async ()=>{
      if(!scenarioId) return
      try{
        const res = await api.get('/api/kse/scenarios')
        const s = (res.data||[]).find(x=> Number(x.id)===Number(scenarioId))
        const pts = s?.config?.player_types || []
        setTypesCfg(pts)
        setAllowedTypes(pts.map(pt=> ({ type_id: pt.id, name: pt.name || pt.id, enabled: true, max_players: 10 })))
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

  // Load comparison data
  const loadComparisonData = async () => {
    if (!sessionId) return
    setComparisonLoading(true)
    try {
      const { data } = await api.get(`/api/leaderboard/sessions/${sessionId}`)
      setComparisonData(data)
    } catch (error) {
      console.error('Failed to load comparison data:', error)
    } finally {
      setComparisonLoading(false)
    }
  }

  // Load comparison when modal opens
  useEffect(() => {
    if (comparisonOpen) {
      loadComparisonData()
    }
  }, [comparisonOpen, sessionId])

  // Draw comparison chart
  useEffect(() => {
    if (!comparisonChartRef.current || comparisonData.length === 0) return
    const svg = d3.select(comparisonChartRef.current)
    svg.selectAll('*').remove()
    const width = 640, height = 240
    const margin = { top: 10, right: 10, bottom: 30, left: 60 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg.attr('width', width).attr('height', height).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const x = d3.scaleBand().domain(comparisonData.map(d => String(d.player_id))).range([0, innerW]).padding(0.2)
    const y = d3.scaleLinear().domain([0, d3.max(comparisonData, d => d[comparisonMetric]) || 0]).nice().range([innerH, 0])
    g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat('')).selectAll('line').attr('stroke', '#ddd').attr('stroke-opacity', 0.6)
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    const yLabelMap = {
      profit_zar: 'Profit (ZAR)',
      revenue_zar: 'Revenue (ZAR)',
      imbalance_cost_zar: 'Imbalance Cost (ZAR)',
      curtailment_cost_zar: 'Curtailment Cost (ZAR)'
    }
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -45).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', '10px').text(yLabelMap[comparisonMetric] || 'Value')
    g.selectAll('rect').data(comparisonData).enter().append('rect')
      .attr('x', d => x(String(d.player_id)))
      .attr('y', d => y(d[comparisonMetric]))
      .attr('width', x.bandwidth())
      .attr('height', d => innerH - y(d[comparisonMetric]))
      .attr('fill', '#1976d2')
  }, [comparisonData, comparisonMetric])

  return (
    <Paper sx={{ p:2, position: 'relative' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Trainer – Session Control</Typography>
        {sessionId && (
          <Tooltip title="Session Comparison">
            <IconButton onClick={() => setComparisonOpen(true)} color="primary" size="small">
              <ComparisonIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      
      {/* Disabled Overlay */}
      {isDisabled && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(2px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1,
          }}
        >
          <Paper
            elevation={4}
            sx={{
              p: 4,
              textAlign: 'center',
              backgroundColor: 'background.paper',
            }}
          >
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 500 }}>
              🚧 Under Development
            </Typography>
            <Typography variant="body1" color="text.secondary">
              The Session Control Screen is not yet fully implemented
            </Typography>
          </Paper>
        </Box>
      )}
      
      {/* Start New Scenario Section - Campaign and Scenario selection */}
      <Paper variant="outlined" sx={{ p:2, mb:2 }}>
        <Typography variant="subtitle1" gutterBottom>Start New Scenario for Cohort {cohortId}</Typography>
        <Stack spacing={1.5}>
          {/* First row: Campaign, Scenario */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-end">
            <Stack spacing={0.5} sx={{ minWidth: 200 }}>
              <InfoLabel title="Campaign" tooltip="Select a campaign available for this cohort." />
              <Select size="small" value={campaignId} onChange={e=>setCampaignId(e.target.value)} displayEmpty disabled={!!sessionId || campaigns.length===0}>
                {campaigns.length === 0 && <MenuItem value=""><em>No campaigns</em></MenuItem>}
                {campaigns.map(c => (
                  <MenuItem key={c.campaign_id} value={String(c.campaign_id)}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
            <Stack spacing={0.5} sx={{ minWidth: 180 }}>
              <InfoLabel title="Scenario" tooltip="Pick a scenario from the selected campaign." />
              {sessionId ? (
                <TextField size="small" value={sessionInfo?.scenario_name || ''} disabled />
              ) : (
                <Select size="small" value={scenarioId} onChange={e=>setScenarioId(e.target.value)} displayEmpty disabled={!campaignId}>
                  {campScenarios.length === 0 && <MenuItem value=""><em>No scenarios</em></MenuItem>}
                  {campScenarios.map(s => (
                    <MenuItem key={s.scenario_id} value={String(s.scenario_id)}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              )}
            </Stack>
            {/* Player type inputs moved to next row */}
          </Stack>
          {/* Second row: Player types on their own line; Start behind them */}
          <Stack direction="row" spacing={2} alignItems="flex-end" flexWrap="wrap" useFlexGap>
            {!sessionId && allowedTypes.map((row, idx)=> (
              <Stack key={row.type_id} spacing={0.5} sx={{ minWidth: 160 }}>
                <InfoLabel title={row.name || row.type_id} tooltip={`Max players for ${row.name || row.type_id}`} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Checkbox 
                    checked={!!row.enabled} 
                    onChange={async(e)=> {
                      const newAllowed = allowedTypes.map((r,i)=> i===idx? { ...r, enabled: e.target.checked }: r)
                      setAllowedTypes(newAllowed)
                      if(sessionId){
                        try{
                          await api.patch(`/api/sessions/${sessionId}/allowed-types`, { 
                            allowed: newAllowed.filter(t=> t.enabled).map(t=> ({ type_id: t.type_id, max_players: t.max_players ?? null })) 
                          })
                        }catch(_){ }
                      }
                    }} 
                    size="small" 
                  />
                  <TextField 
                    size="small" 
                    type="number" 
                    placeholder="Max" 
                    value={row.max_players} 
                    onChange={(e)=>{
                      const v = e.target.value
                      const newAllowed = allowedTypes.map((r,i)=> i===idx? { ...r, max_players: v===''? '' : Number(v) }: r)
                      setAllowedTypes(newAllowed)
                    }}
                    onBlur={async()=>{
                      if(sessionId){
                        try{
                          await api.patch(`/api/sessions/${sessionId}/allowed-types`, { 
                            allowed: allowedTypes.filter(t=> t.enabled).map(t=> ({ type_id: t.type_id, max_players: t.max_players ?? null })) 
                          })
                        }catch(_){ }
                      }
                    }}
                    sx={{ width: 80 }} 
                  />
                </Stack>
              </Stack>
            ))}
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" onClick={start} size="large" disabled={!!sessionId || !scenarioId}>Start Scenario</Button>
            <FormControlLabel control={<Checkbox checked={forceNavigate} onChange={e=> setForceNavigate(e.target.checked)} size="small" />} label="Auto-navigate players" disabled={!!sessionId} />
          </Stack>
        </Stack>
      </Paper>

      {/* Session Info - NOW SECOND, with control buttons on right */}
      {sessionId && sessionInfo && (
        <Paper variant="outlined" sx={{ p:2, mb:2, bgcolor: sessionInfo.status==='running'?'#e8f5e9':'#f5f5f5' }}>
          <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
            <Chip label={`Session #${sessionId}`} size="small" variant="outlined" />
            <Chip label={sessionInfo.status || 'unknown'} color={sessionInfo.status==='running'?'success':sessionInfo.status==='created'?'default':sessionInfo.status==='paused'?'warning':'error'} />
            <Typography variant="body2" fontWeight="bold">Round {sessionInfo.current_round || 1} / {sessionInfo.general?.rounds || '?'}</Typography>
            <Typography variant="body2">{sessionInfo.scenario_name || 'Scenario'}</Typography>
            <Typography variant="caption" color="text.secondary">Mode: {sessionInfo.mode === 'isolated_per_player' ? 'Solo' : 'Shared Market'}</Typography>
            <Typography variant="h6" color={tick && tick > 0 ? 'primary' : 'text.secondary'}>{tick !== null ? `${tick}s` : ''}</Typography>
            <Box sx={{ flexGrow: 1 }} />
            {/* Control buttons on the right */}
            <Tooltip title="Pause session"><IconButton onClick={pause} disabled={!sessionId} color="primary" size="small"><PauseIcon /></IconButton></Tooltip>
            <Tooltip title="Resume session"><IconButton onClick={resume} disabled={!sessionId || (sessionInfo?.status==='running')} color="primary" size="small"><ResumeIcon /></IconButton></Tooltip>
            <Tooltip title="End session"><IconButton onClick={end} disabled={!sessionId} color="error" size="small"><StopIcon /></IconButton></Tooltip>
          </Stack>
        </Paper>
      )}

      {/* Broadcast - ALWAYS visible, sends to all players */}
      <Paper variant="outlined" sx={{ p:1.5, mt:2, mb:1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" label="Broadcast message" value={message} onChange={e=>setMessage(e.target.value)} sx={{ flexGrow: 1, minWidth: 300 }} />
          <Button onClick={async()=>{
            if(!message) return
            try{
              // Send via socketio to ALL players (not session-specific)
              await api.post('/api/trainer/broadcast', { message })
              setMessage('')
            }catch(e){
              // Fallback: if session exists, use session broadcast
              if(sessionId){
                await api.post(`/api/sessions/${sessionId}/broadcast`, { message })
                setMessage('')
              }
            }
          }} disabled={!message} variant="contained">Send to All</Button>
        </Stack>
      </Paper>

      {/* Cohort Members Panel - shows all members with statistics */}
      <Paper variant="outlined" sx={{ p:2, mt:2, flex:1 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:1 }}>
            <Typography variant="subtitle1">Cohort Members</Typography>
            <Chip label={`${cohortMembers.length} members`} size="small" />
            <span style={{ flex:1 }} />
            <Button size="small" onClick={async()=>{
              if (!cohortId) return
              setMembersLoading(true)
              try{
                const { data } = await api.get(`/api/trainer/cohort/${cohortId}/members`)
                setCohortMembers(data.members || [])
              }catch(_){ /* ignore */ }
              finally { setMembersLoading(false) }
            }}>Refresh</Button>
          </Stack>
          {membersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <Typography variant="body2" color="text.secondary">Loading members...</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Played</TableCell>
                  <TableCell align="right">Completed</TableCell>
                  <TableCell>Current Session</TableCell>
                  <TableCell>Last Activity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cohortMembers.map(member => {
                  const statusColors = {
                    playing: 'success',
                    briefing: 'info',
                    paused: 'warning',
                    online: 'primary',
                    recent: 'default',
                    inactive: 'default'
                  }
                  const bgColors = {
                    playing: '#e8f5e9',
                    briefing: '#e3f2fd',
                    paused: '#fff3e0',
                    online: '#f3e5f5',
                    recent: 'transparent',
                    inactive: 'transparent'
                  }
                  return (
                    <TableRow key={member.user_id} sx={{ bgcolor: bgColors[member.status] || 'transparent' }}>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.name || '—'}</TableCell>
                      <TableCell>
                        <Chip label={member.role} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={member.status} 
                          size="small" 
                          color={statusColors[member.status] || 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">{member.total_scenarios_played}</TableCell>
                      <TableCell align="right">{member.completed_scenarios}</TableCell>
                      <TableCell>
                        {member.active_session ? (
                          <Stack spacing={0.5}>
                            <Typography variant="caption" sx={{ fontWeight: 500 }}>
                              {member.active_session.campaign_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {member.active_session.scenario_name} (R{member.active_session.current_round})
                            </Typography>
                          </Stack>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {member.last_activity ? (
                          <Typography variant="caption">
                            {new Date(member.last_activity).toLocaleString()}
                          </Typography>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Paper>
        
      <Typography variant="subtitle1" sx={{ mt:2 }}>Events</Typography>
      <Paper variant="outlined" sx={{ p:1, maxHeight:220, overflow:'auto' }}>
        {log.map((l,i)=>(<Typography key={i} variant="caption" display="block">{l}</Typography>))}
      </Paper>
      
      {/* Comparison Modal */}
      <Dialog open={comparisonOpen} onClose={() => setComparisonOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Session Comparison</Typography>
          <IconButton onClick={() => setComparisonOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {!sessionId ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No active session. Start a session to view comparison data.
            </Typography>
          ) : comparisonLoading ? (
            <Box sx={{ py: 4 }}>
              <Skeleton variant="rectangular" height={240} sx={{ mb: 2 }} />
              <Skeleton variant="rectangular" height={200} />
            </Box>
          ) : comparisonData.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data available for this session yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2">Metric:</Typography>
                <Select size="small" value={comparisonMetric} onChange={e => setComparisonMetric(e.target.value)} sx={{ minWidth: 200 }}>
                  <MenuItem value="profit_zar">Profit (ZAR)</MenuItem>
                  <MenuItem value="revenue_zar">Revenue (ZAR)</MenuItem>
                  <MenuItem value="imbalance_cost_zar">Imbalance Cost (ZAR)</MenuItem>
                  <MenuItem value="curtailment_cost_zar">Curtailment Cost (ZAR)</MenuItem>
                </Select>
              </Stack>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <svg ref={comparisonChartRef} />
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Player ID</TableCell>
                    <TableCell align="right">Profit (ZAR)</TableCell>
                    <TableCell align="right">Revenue (ZAR)</TableCell>
                    <TableCell align="right">Imbalance Cost</TableCell>
                    <TableCell align="right">Curtailment Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {comparisonData.map(row => (
                    <TableRow key={row.player_id}>
                      <TableCell>Player {row.player_id}</TableCell>
                      <TableCell align="right">{Math.round(row.profit_zar || 0).toLocaleString()}</TableCell>
                      <TableCell align="right">{Math.round(row.revenue_zar || 0).toLocaleString()}</TableCell>
                      <TableCell align="right">{Math.round(row.imbalance_cost_zar || 0).toLocaleString()}</TableCell>
                      <TableCell align="right">{Math.round(row.curtailment_cost_zar || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      
      <DocsFab href="/docs/trainer" label="Open Trainer Handbook" />
    </Paper>
  )
}