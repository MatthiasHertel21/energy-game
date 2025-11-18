import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Container,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Tooltip,
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Chip,
  LinearProgress
} from '@mui/material'
import { BarChart, ViewList, InfoOutlined } from '@mui/icons-material'
import { IconButton } from '@mui/material'
import InfoLabel from '../components/InfoLabel'
import ForecastChartEditor from '../components/ForecastChartEditor'
import EventNotification from '../components/EventNotification'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useSnackbar } from '../components/SnackbarProvider'
import api from '../services/api'
import { io } from 'socket.io-client'
import * as d3 from 'd3'
import confetti from 'canvas-confetti'
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'

function CountdownTimer({ timeRemaining }) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const isWarning = timeRemaining <= 30 && timeRemaining > 0

  return (
    <Box
      sx={{
        textAlign: 'center',
        p: 2,
        backgroundColor: isWarning ? 'warning.light' : 'primary.light',
        borderRadius: 2,
        transition: 'background-color 0.3s'
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 'bold', color: isWarning ? 'warning.dark' : 'primary.dark' }}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </Typography>
      <Typography variant="caption" sx={{ color: isWarning ? 'warning.dark' : 'primary.dark' }}>
        {isWarning ? 'Time is running out!' : 'Time remaining'}
      </Typography>
    </Box>
  )
}

export default function Player() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showSnack } = useSnackbar()

  // Micro-interaction: confetti burst on successful submit (respects reduced motion)
  const triggerConfetti = () => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      confetti({ particleCount: 120, spread: 70, startVelocity: 35, gravity: 0.9, ticks: 200, origin: { y: 0.6 } })
    } catch (_) {}
  }

  // Auto-load active session or use sessionId from query params
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState([])
  const [cfg, setCfg] = useState({
    general: { round_span_hours: 6, forecast_horizon_hours: 48, freeze_hours: 6, horizon_hours: 24 },
    current_round: 1,
    scenario_name: ''
  })
  const [status, setStatus] = useState('pending')
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [initialDuration, setInitialDuration] = useState(null)
  const [mode, setMode] = useState('isolated_per_player')
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [allowedTypes, setAllowedTypes] = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [playerTypes, setPlayerTypes] = useState([]) // all player types from scenario
  const [typeDevices, setTypeDevices] = useState([]) // device ids for selected type
  const [deviceHours, setDeviceHours] = useState({}) // { device_id: number[] }
  const [scenarioDevices, setScenarioDevices] = useState([]) // full device definitions from scenario
  const deviceChartRefs = useRef({})
  const [activeEvents, setActiveEvents] = useState([])
  const [dismissedEvents, setDismissedEvents] = useState(new Set())
  const [useChartEditor, setUseChartEditor] = useState(true)

  // Auto-load active session
  useEffect(() => {
    const loadActiveSession = async () => {
      try {
        // Check if sessionId in query params
        const querySessionId = params.get('sessionId')
        if (querySessionId) {
          setSessionId(querySessionId)
          setLoading(false)
          return
        }

        // Otherwise, fetch active session
        const { data } = await api.get('/api/player/active-session')
        if (data.session_id) {
          setSessionId(data.session_id)
          setTimeRemaining(data.time_remaining ?? null)
        } else {
          showSnack('No active session found. Please start a session from Home.', 'info')
          navigate('/home')
        }
      } catch (error) {
        console.error('Failed to load active session:', error)
        showSnack('Failed to load session', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadActiveSession()
  }, [params, navigate, showSnack])

  // Load session config and saved forecast
  useEffect(() => {
    const load = async () => {
      if (!sessionId) return
      try {
  const { data } = await api.get(`/api/sessions/${sessionId}`)
        const gen = data.general || {}
        const round_span = Number(gen.round_span_hours || 6)
        const fh = Number(gen.forecast_horizon_hours || gen.horizon_hours || 24)
        const freeze = Number(gen.freeze_hours || 6)
        setCfg({
          general: {
            round_span_hours: round_span,
            forecast_horizon_hours: fh,
            freeze_hours: freeze,
            horizon_hours: Number(gen.horizon_hours || 24)
          },
          current_round: Number(data.current_round || 1),
          scenario_name: data.scenario_name || 'Scenario'
        })
        setStatus(data.status || 'pending')
        setMode(data.mode || 'isolated_per_player')
        // Initialize countdown immediately if running (before first tick arrives)
        try{
          if ((data.status || 'pending') === 'running'){
            const initial = Number((gen.round_duration_seconds || 300))
            const safe = isFinite(initial) ? initial : 300
            setInitialDuration(safe)
            setTimeRemaining(safe)
          } else {
            setInitialDuration(Number(gen.round_duration_seconds || 300))
          }
        }catch(_){ /* ignore */ }

        // Load briefing for types
        try{
          const brief = await api.get(`/api/sessions/${sessionId}/briefing`)
          const allowed = brief.data?.allowed_player_types || []
          const sel = brief.data?.selected_type || null
          const pts = brief.data?.player_types || []
          const devices = brief.data?.devices || []
          setAllowedTypes(allowed)
          setSelectedType(sel)
          setPlayerTypes(pts)
          setScenarioDevices(devices)
          // load type devices from scenario config if selected
          if(sel){
            const t = (pts||[]).find(x=> x.id===sel)
            const devs = t?.devices || []
            setTypeDevices(devs)
            // initialize deviceHours if empty
            setDeviceHours(prev=>{
              const fh = Number(gen.forecast_horizon_hours||24)
              const next = { ...prev }
              devs.forEach(did=>{ if(!next[did]) next[did] = Array.from({length: fh}, ()=> 0) })
              return next
            })
          }
          if((data.mode === 'shared_market') && allowed.length>0 && !sel){
            setTypeDialogOpen(true)
          }
        }catch(_){ /* ignore */ }

        // Load saved full forecast and seed defaults if empty
        const saved = await api.get(`/api/player/forecast/full`, { params: { session_id: Number(sessionId) } })
        const savedHours = Array.isArray(saved.data?.hours) ? saved.data.hours : null
        const hasNonZero = Array.isArray(savedHours) ? savedHours.some(v => Number(v) !== 0) : false
        const genDefaultProfile = (len)=>{
          // simple diurnal shape repeated; scaled baseline 50 MWh
          const diurnal = [0.6,0.6,0.6,0.6,0.7,0.85,1.0,1.15,1.25,1.2,1.1,1.0,0.95,1.0,1.05,1.15,1.2,1.25,1.15,1.0,0.9,0.8,0.7,0.65]
          const base = 50
          return Array.from({length: len}, (_,i)=> Number((base * diurnal[i%24]).toFixed(2)))
        }
        if (hasNonZero) {
          setHours(savedHours)
        } else {
          if (data.mode === 'shared_market' && selectedType && (typeDevices||[]).length>0){
            const n = (typeDevices||[]).length
            const perDev = Math.max(1, Math.round(50/n))
            const devDefaults = {}
            ;(typeDevices||[]).forEach(did=>{
              devDefaults[did] = genDefaultProfile(fh).map(v=> Number((v * (perDev/50)).toFixed(2)))
            })
            setDeviceHours(devDefaults)
            // aggregate
            const agg = Array.from({length: fh}, (_,h)=> (typeDevices||[]).reduce((sum, did)=> sum + (devDefaults[did]?.[h]||0), 0))
            setHours(agg)
          } else {
            setHours(genDefaultProfile(fh))
          }
        }
      } catch (error) {
        console.error('Failed to load session config:', error)
        showSnack('Failed to load session configuration', 'error')
      }
    }
    load()
  }, [sessionId, showSnack])

  // Live market_cleared events and WebSocket
  const [live, setLive] = useState(null)
  const [series, setSeries] = useState([])
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  const localTimerRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    // Primary: static namespace + join room
    const s = io(`/game`, { path: '/socket.io', transports: ['websocket', 'polling'], forceNew: true })
    // Backward-compat: legacy per-session namespace
    const sLegacy = io(`/game/${sessionId}`, { path: '/socket.io', transports: ['websocket', 'polling'], forceNew: true })

    s.on('connect', () => {
      try { s.emit('join_session', { session_id: Number(sessionId) }) } catch(_) {}
    })

    s.on('round_start', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(null)
      }
    })

    s.on('tick', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(Number(p.remaining))
      }
    })

    s.on('round_end', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(0)
      }
    })

    s.on('market_cleared', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        setLive({ mcp: p.mcp, volume: p.volume, round: p.round })
        setSeries((prev) => [...prev, { r: p.round, mcp: p.mcp, volume: p.volume }])
      }
    })

    s.on('event_triggered', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        // Add new event to active events list
        const event = {
          id: p.event_id || `event-${Date.now()}`,
          type: p.type,
          name: p.name,
          description: p.description,
          multiplier: p.multiplier,
          additive: p.additive,
          duration_rounds: p.duration_rounds,
          target: p.target,
          round: p.round
        }
        setActiveEvents((prev) => {
          // Avoid duplicates
          if (prev.some(e => e.id === event.id)) return prev
          return [...prev, event]
        })
      }
    })

    s.on('trainer_message', (p) => {
      if (p && Number(p.session_id) === Number(sessionId)) {
        showSnack(`Trainer: ${p.message}`, 'info')
      }
    })

    // Mirror the same handlers on legacy socket for safety
    sLegacy.on('round_start', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) setTimeRemaining(null) })
    sLegacy.on('tick', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) setTimeRemaining(Number(p.remaining)) })
    sLegacy.on('round_end', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) setTimeRemaining(0) })
    sLegacy.on('market_cleared', (p)=>{
      if (p && Number(p.session_id)===Number(sessionId)){
        setLive({ mcp: p.mcp, volume: p.volume, round: p.round })
        setSeries(prev=> [...prev, { r:p.round, mcp:p.mcp, volume:p.volume }])
      }
    })
    sLegacy.on('event_triggered', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)){
      const event = { id: p.event_id||`event-${Date.now()}`, type:p.type, name:p.name, description:p.description, multiplier:p.multiplier, additive:p.additive, duration_rounds:p.duration_rounds, target:p.target, round:p.round }
      setActiveEvents(prev=> prev.some(e=>e.id===event.id)? prev : [...prev, event])
    }})
    sLegacy.on('trainer_message', (p)=>{ if (p && Number(p.session_id)===Number(sessionId)) showSnack(`Trainer: ${p.message}`, 'info') })

    return () => { try{ s.close() }catch(_){} try{ sLegacy.close() }catch(_){} }
  }, [sessionId])

  // Local fallback countdown (in case server ticks are delayed)
  useEffect(()=>{
    if (status === 'running' && Number.isFinite(Number(timeRemaining)) && timeRemaining !== null) {
      if (localTimerRef.current) clearInterval(localTimerRef.current)
      localTimerRef.current = setInterval(()=>{
        setTimeRemaining(prev=>{
          if (!Number.isFinite(Number(prev))) return prev
          const next = Number(prev) - 1
          return next >= 0 ? next : 0
        })
      }, 1000)
      return ()=> { if (localTimerRef.current) clearInterval(localTimerRef.current) }
    } else {
      if (localTimerRef.current) clearInterval(localTimerRef.current)
    }
  }, [status, timeRemaining])

  // D3 Charts
  useEffect(() => {
    if (series.length === 0) return
    // create or reuse a floating tooltip div for charts
    const tipSel = d3.select('body').select('div.emsg-chart-tip')
    const tooltip = tipSel.empty() ? d3.select('body').append('div').attr('class','emsg-chart-tip') : tipSel
    tooltip
      .style('position','absolute')
      .style('pointer-events','none')
      .style('background','#111')
      .style('color','#fff')
      .style('padding','4px 8px')
      .style('border-radius','4px')
      .style('font-size','12px')
      .style('display','none')
      .style('z-index','9999')

    // Draw MCP chart
    if (mcpRef.current) {
      const svg = d3.select(mcpRef.current)
      svg.selectAll('*').remove()
  const M = { top: 10, right: 10, bottom: 34, left: 46 }
      const W = 360 - M.left - M.right
      const H = 120 - M.top - M.bottom
      const g = svg
        .attr('width', 360)
        .attr('height', 120)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, d3.max(series, (d) => d.r) || 1]).range([0, W])
      const y = d3.scaleLinear().domain([d3.min(series, (d) => d.mcp) || 0, d3.max(series, (d) => d.mcp) || 1]).nice().range([H, 0])
  const line = d3.line().x((d) => x(d.r)).y((d) => y(d.mcp))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(series).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2).attr('d', line)
      g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(series.length))
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
      g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('MCP (ZAR/MWh)')
    }

    // Draw Volume chart
    if (volRef.current) {
      const svg = d3.select(volRef.current)
      svg.selectAll('*').remove()
  const M = { top: 10, right: 10, bottom: 34, left: 46 }
      const W = 360 - M.left - M.right
      const H = 120 - M.top - M.bottom
      const g = svg
        .attr('width', 360)
        .attr('height', 120)
        .append('g')
        .attr('transform', `translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, d3.max(series, (d) => d.r) || 1]).range([0, W])
      const y = d3.scaleLinear().domain([0, d3.max(series, (d) => d.volume) || 1]).nice().range([H, 0])
  const line = d3.line().x((d) => x(d.r)).y((d) => y(d.volume))
      // gridlines
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat(''))
        .selectAll('line')
        .attr('stroke', '#ddd')
        .attr('stroke-opacity', 0.6)
      g.append('path').datum(series).attr('fill', 'none').attr('stroke', '#1976d2').attr('stroke-width', 2).attr('d', line)
      g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(series.length))
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
      g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Round')
      g.append('text').attr('transform', `rotate(-90)`).attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
    return ()=> { try { tooltip.remove() } catch(_){} }
  }, [series])

  // Calculate locked hours and validation
  const lockedUntil = useMemo(() => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const freeze = Number(cfg.general.freeze_hours || 6)
    return Math.min(Number(cfg.general.forecast_horizon_hours || 24), (r - 1) * span + freeze)
  }, [cfg])
  // Freeze override for round 1: allow editing even if freeze covers first round
  const effectiveLockedUntil = useMemo(()=> (Number(cfg.current_round||1) === 1 ? 0 : lockedUntil), [cfg, lockedUntil])

  const onChange = (i, val) => setHours((prev) => prev.map((v, idx) => (idx === i ? Number(val) : v)))
  const onDeviceChange = (did, i, val) => {
    setDeviceHours(prev=>{
      const arr = (prev[did] || []).slice()
      arr[i] = Number(val)
      const next = { ...prev, [did]: arr }
      // update aggregate hours as sum across type devices
      const ids = typeDevices || []
      const fh = Number(cfg.general.forecast_horizon_hours||24)
      const agg = Array.from({length: fh}, (_,h)=> ids.reduce((sum, id)=> sum + (next[id]?.[h] || 0), 0))
      setHours(agg)
      return next
    })
  }

  const saveFull = async () => {
    try {
      const payload = { session_id: Number(sessionId), hours }
      if(mode==='shared_market' && selectedType && typeDevices.length>0){
        payload.devices = typeDevices.map(did=> ({ device_id: did, hours: deviceHours[did] || [] }))
      }
      await api.post('/api/player/forecast/full', payload)
      showSnack('Full forecast saved', 'success')
    } catch (e) {
      showSnack(e?.response?.data?.message || 'Save failed', 'error')
    }
  }

  const submitCurrent = async () => {
    const r = Number(cfg.current_round || 1)
    const span = Number(cfg.general.round_span_hours || 6)
    const start = (r - 1) * span
    const slice = hours.slice(start, start + span)
    try {
      const payload = { session_id: Number(sessionId), round_num: r, hours: slice }
      if(mode==='shared_market' && selectedType && typeDevices.length>0){
        payload.devices = typeDevices.map(did=> ({ device_id: did, hours: (deviceHours[did]||[]).slice(start, start+span) }))
      }
      await api.post('/api/player/forecast', payload)
      showSnack(`Round ${r} submitted successfully!`, 'success')
      triggerConfetti()
    } catch (e) {
      showSnack(e?.response?.data?.message || 'Submit failed', 'error')
    }
  }

  const handleDismissEvent = (eventId) => {
    setDismissedEvents((prev) => new Set([...prev, eventId]))
  }

  // Filter out dismissed events
  const visibleEvents = activeEvents.filter(e => !dismissedEvents.has(e.id))

  const isEditable = status === 'running' && sessionId
  const span = Number(cfg.general.round_span_hours || 6)
  const cur = Number(cfg.current_round || 1)
  const startIdx = (cur - 1) * span
  const endIdx = startIdx + span
  const editableIdx = new Set(
    Array.from({ length: span }, (_, k) => startIdx + k).filter((i) => i >= effectiveLockedUntil && i < hours.length)
  )

  const isValid = useMemo(() => {
    return Array.from(editableIdx).every((i) => Number.isFinite(Number(hours[i])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, effectiveLockedUntil, cfg])

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  if (!sessionId) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="info">
          No active session. Please start a session from <Button onClick={() => navigate('/home')}>Home</Button>
        </Alert>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Dialog open={typeDialogOpen} onClose={()=> setTypeDialogOpen(false)}>
        <DialogTitle>Select your player type</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt:1 }}>
            {allowedTypes.map(t=> {
              const typeInfo = playerTypes.find(pt=> pt.id === t.type_id)
              const typeName = typeInfo?.name || t.type_id
              return (
                <Stack key={t.type_id} direction="row" spacing={2} alignItems="center">
                  <Button variant={selectedType===t.type_id? 'contained':'outlined'} onClick={()=> setSelectedType(t.type_id)} disabled={t.remaining===0} sx={{ minWidth: 160, justifyContent: 'flex-start' }}>{typeName}</Button>
                  <Typography variant="caption" color="text.secondary">{t.remaining==null? 'unlimited' : `${t.remaining} slots left`}</Typography>
                </Stack>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setTypeDialogOpen(false)}>Close</Button>
          <Button variant="contained" disabled={!selectedType} onClick={async()=>{
            try{
              await api.post(`/api/sessions/${sessionId}/select-type`, { type_id: selectedType })
              setTypeDialogOpen(false)
            }catch(e){
              showSnack(e?.response?.data?.error || 'Selection failed', 'error')
            }
          }}>Select</Button>
        </DialogActions>
      </Dialog>
      <Typography variant="h4" gutterBottom>
        Round Editor
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary">
          {cfg.scenario_name} - Round {cfg.current_round}
        </Typography>
        <Tooltip arrow title={
          mode === 'isolated_per_player' 
            ? 'Solo Mode: You have your own private market. Your decisions only affect your own results.' 
            : 'Shared Market: All players trade in the same market. Your decisions affect market prices and other players.'
        }>
          <Chip 
            label={mode === 'isolated_per_player' ? 'Solo' : 'Shared Market'}
            size="small"
            color={mode === 'isolated_per_player' ? 'default' : 'primary'}
            variant="outlined"
          />
        </Tooltip>
        {mode==='shared_market' && selectedType && (
          <Tooltip arrow title={(() => {
            const typeInfo = playerTypes.find(pt=> pt.id === selectedType)
            if (!typeInfo) return selectedType
            const devices = typeDevices.map(did => {
              const dev = scenarioDevices.find(d => d.id === did)
              return dev ? `${did} (${dev.type})` : did
            }).join(', ')
            return `${typeInfo.name} • Devices: ${devices || 'none'}`
          })()}>
            <Chip 
              label={playerTypes.find(pt=> pt.id === selectedType)?.name || selectedType} 
              size="small" 
              color="secondary"
            />
          </Tooltip>
        )}
      </Stack>

      {/* Event Notifications */}
      <EventNotification 
        events={visibleEvents}
        onDismiss={handleDismissEvent}
      />

      <Grid container spacing={3}>
        {/* Left: Timer and KPIs */}
        <Grid item xs={12} md={4}>
          {timeRemaining !== null && <CountdownTimer timeRemaining={timeRemaining} />}

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Session Info
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Chip label={status} color={status === 'running' ? 'success' : 'default'} size="small" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Round
                </Typography>
                <Typography variant="body2">{cfg.current_round}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Forecast Horizon
                </Typography>
                <Typography variant="body2">{cfg.general.forecast_horizon_hours}h</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Locked until
                </Typography>
                <Typography variant="body2">h{lockedUntil}</Typography>
              </Box>
              {timeRemaining !== null && initialDuration && initialDuration>0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Round progress</Typography>
                  <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, Math.round(((initialDuration - timeRemaining) * 100) / initialDuration)))} />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Live KPIs Placeholder */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Live KPIs</Typography>
                <Tooltip
                  title={
                    'Market results update after each round.\n\nMCP (Market Clearing Price): The price in ZAR/MWh where supply meets demand.\n\nVolume: Total energy traded in MWh during the round.\n\nThe charts below show the trend across all rounds.'
                  }
                  placement="left"
                >
                  <IconButton size="small" aria-label="Live KPIs info">
                    <InfoOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              {live ? (
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">MCP (Round {live.round})</Typography>
                    <Chip size="small" color="primary" label={`${live.mcp} ZAR/MWh`} />
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Volume</Typography>
                    <Chip size="small" color="secondary" label={`${live.volume} MWh`} />
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Waiting for market data... Results appear after each round.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Forecast Editor */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <InfoLabel
              title="Enter your hourly forecast (MWh)"
              tooltip="Provide the quantity per simulated hour. Hours ≤ freeze are locked to your Day-Ahead plan. Values are saved as a full horizon and submitted per round."
            />

            {(timeRemaining === 0) && (
              <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                Time is up! You can no longer submit this round.
              </Alert>
            )}
            {(mode==='shared_market' && allowedTypes.length>0 && !selectedType) && (
              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                Please select your player type to continue.
              </Alert>
            )}

            {(mode==='shared_market' && selectedType && typeDevices.length>0) ? (
              <Stack spacing={3} sx={{ mt:2 }}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Enter your hourly forecast for each device. Locked hours (before freeze) cannot be changed.
                </Alert>
                {typeDevices.map(did=> {
                  const deviceDef = scenarioDevices.find(d=> d.id === did)
                  const deviceType = deviceDef?.type || 'unknown'
                  const deviceParams = deviceDef || {}
                  return (
                    <Card key={did} variant="outlined">
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                          <Box sx={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: 1, 
                            bgcolor: deviceType === 'solar' ? '#ffa726' : deviceType === 'wind' ? '#42a5f5' : deviceType === 'gas' ? '#ef5350' : deviceType === 'storage' ? '#66bb6a' : '#9e9e9e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '20px'
                          }}>
                            {deviceType === 'solar' ? '☀' : deviceType === 'wind' ? '🌀' : deviceType === 'gas' ? '🔥' : deviceType === 'storage' ? '🔋' : '⚡'}
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6">{did}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Type: {deviceType}
                              {deviceParams.capacity_mw && ` • Capacity: ${deviceParams.capacity_mw} MW`}
                              {deviceParams.marginal_cost && ` • Cost: ${deviceParams.marginal_cost} ZAR/MWh`}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {(deviceHours[did]||[]).map((v,i)=>{
                            const disabled = i < lockedUntil || timeRemaining === 0
                            return (
                              <Tooltip key={`${did}-${i}`} arrow title={`Hour h${i+1} for ${did}`}>
                                <TextField
                                  label={`h${i+1}`}
                                  value={v}
                                  onChange={(e)=> onDeviceChange(did, i, e.target.value)}
                                  size="small"
                                  type="number"
                                  disabled={disabled}
                                  sx={{ width: 90, m: 0.5 }}
                                />
                              </Tooltip>
                            )
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
            ) : (
              <>
                <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                  Enter your hourly energy forecast (in MWh). Use the chart editor to drag points or switch to fields for precise values. Locked hours cannot be changed.
                </Alert>
                {/* Unified editor header with toggle */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">
                    {useChartEditor ? 'Chart Editor (drag points to edit)' : 'Fields Editor'}
                  </Typography>
                  {useChartEditor ? (
                    <Button size="small" startIcon={<ViewList fontSize="small" />} onClick={()=> setUseChartEditor(false)}>Switch to fields</Button>
                  ) : (
                    <Button size="small" startIcon={<BarChart fontSize="small" />} onClick={()=> setUseChartEditor(true)}>Switch to chart</Button>
                  )}
                </Stack>
                {useChartEditor ? (
                  <Box sx={{ mb: 2 }}>
                    <ForecastChartEditor hours={hours} lockedUntil={effectiveLockedUntil} onChange={(i, val)=> onChange(i, val)} />
                  </Box>
                ) : (
                  <Box sx={{ mt: 2 }}>
                    {(() => {
                      const chunkSize = 12
                      const chunks = []
                      for (let i = 0; i < hours.length; i += chunkSize) {
                        chunks.push(i)
                      }
                      return (
                        <Stack spacing={1.5}>
                          {chunks.map((start) => (
                            <Grid container spacing={1} key={start} alignItems="center">
                              {Array.from({ length: Math.min(chunkSize, hours.length - start) }, (_, k) => start + k).map((i) => {
                                const disabled = i < effectiveLockedUntil || timeRemaining === 0
                                return (
                                  <Grid item xs={2} sm={1} key={i}>
                                    <Tooltip arrow title={`Hour h${i + 1}: ${disabled ? 'Locked (freeze)' : 'Editable'}`}>
                                      <TextField
                                        label={`h${i + 1}`}
                                        value={hours[i]}
                                        onChange={(e) => onChange(i, e.target.value)}
                                        size="small"
                                        type="number"
                                        disabled={disabled}
                                        fullWidth
                                        sx={{ minWidth: 84 }}
                                      />
                                    </Tooltip>
                                  </Grid>
                                )
                              })}
                            </Grid>
                          ))}
                        </Stack>
                      )
                    })()}
                  </Box>
                )}
              </>
            )}

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Tooltip arrow title="Saves all hourly values for the full forecast horizon without submitting the current round.">
                <span>
                  <Button variant="outlined" onClick={saveFull} disabled={!sessionId || (mode==='shared_market' && allowedTypes.length>0 && !selectedType)}>
                    Save Full Forecast
                  </Button>
                </span>
              </Tooltip>
              <Tooltip arrow title={`Submits only the hours of the current round (R${cfg.current_round}).`}>
                <span>
                  <Button variant="contained" onClick={submitCurrent} disabled={!isEditable || !isValid || timeRemaining === 0 || (mode==='shared_market' && allowedTypes.length>0 && !selectedType)}>
                    Submit Current Round
                  </Button>
                </span>
              </Tooltip>
            </Stack>

            {/* Charts */}
            {series.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 4, mb: 1 }}>MCP over rounds</Typography>
                <svg ref={mcpRef} width={360} height={120} style={{ border: '1px solid #eee' }} />

                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Volume over rounds</Typography>
                <svg ref={volRef} width={360} height={120} style={{ border: '1px solid #eee' }} />
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}