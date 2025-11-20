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
  LinearProgress,
  Divider
} from '@mui/material'
import { BarChart, ViewList, InfoOutlined, MenuBook as BriefingIcon } from '@mui/icons-material'
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
  const [deviceView, setDeviceView] = useState({}) // { device_id: 'chart'|'fields' }
  const [submitted, setSubmitted] = useState(false)

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
        // Initialize duration, but do NOT reset remaining time on reload; wait for server ticks or restore from storage
        try{
          const initial = Number((gen.round_duration_seconds || 300))
          const safe = isFinite(initial) ? initial : 300
          setInitialDuration(safe)
          // If joining fresh (no stored timer) and session is running, show full duration until first tick arrives
          if ((data.status || 'pending') === 'running'){
            try{
              const key = `emsg_timer_${sessionId}`
              const raw = sessionStorage.getItem(key)
              if (!raw) {
                setTimeRemaining(safe)
              }
            }catch(_){ }
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
          let devs = []
          if(sel){
            const t = (pts||[]).find(x=> x.id===sel)
            devs = t?.devices || []
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

          // Load saved full forecast and seed defaults if empty
          const saved = await api.get(`/api/player/forecast/full`, { params: { session_id: Number(sessionId) } })
          const savedHours = Array.isArray(saved.data?.hours) ? saved.data.hours : null
          const hasNonZero = Array.isArray(savedHours) ? savedHours.some(v => Number(v) !== 0) : false
          const fhHours = Number(gen.forecast_horizon_hours || gen.horizon_hours || 24)
          const genDefaultProfile = (len)=>{
            const diurnal = [0.6,0.6,0.6,0.6,0.7,0.85,1.0,1.15,1.25,1.2,1.1,1.0,0.95,1.0,1.05,1.15,1.2,1.25,1.15,1.0,0.9,0.8,0.7,0.65]
            const base = 50
            return Array.from({length: len}, (_,i)=> Number((base * diurnal[i%24]).toFixed(2)))
          }
          if (hasNonZero) {
            setHours(savedHours)
          } else {
            if (data.mode === 'shared_market' && sel && (devs||[]).length>0){
              const n = devs.length
              const perDev = Math.max(1, Math.round(50/n))
              const devDefaults = {}
              devs.forEach(did=>{
                devDefaults[did] = genDefaultProfile(fhHours).map(v=> Number((v * (perDev/50)).toFixed(2)))
              })
              setDeviceHours(devDefaults)
              const agg = Array.from({length: fhHours}, (_,h)=> devs.reduce((sum, id)=> sum + (devDefaults[id]?.[h]||0), 0))
              setHours(agg)
            } else {
              setHours(genDefaultProfile(fhHours))
            }
          }
        }catch(_){ /* ignore */ }
        
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

    s.on('round_start', async (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(null)
        try{ sessionStorage.removeItem(`emsg_timer_${sessionId}`) }catch(_){ }
        setSubmitted(false)
        try{
          const { data } = await api.get(`/api/sessions/${sessionId}`)
          setCfg(prev=> ({ ...prev, current_round: Number(data.current_round||prev.current_round), scenario_name: data.scenario_name||prev.scenario_name }))
          setStatus(data.status||prev.status)
        }catch(_){ }
      }
    })

    s.on('tick', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        const rem = Number(p.remaining)
        setTimeRemaining(rem)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem })) }catch(_){ }
      }
    })

    s.on('round_end', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTimeRemaining(0)
        try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0 })) }catch(_){ }
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
    sLegacy.on('round_start', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(null); try{ sessionStorage.removeItem(`emsg_timer_${sessionId}`) }catch(_){ } } })
    sLegacy.on('tick', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { const rem = Number(p.remaining); setTimeRemaining(rem); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem })) }catch(_){ } } })
    sLegacy.on('round_end', (p)=>{ if (Number(p?.session_id)===Number(sessionId)) { setTimeRemaining(0); try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: 0 })) }catch(_){ } } })
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
          const clamped = next >= 0 ? next : 0
          try{ sessionStorage.setItem(`emsg_timer_${sessionId}`, JSON.stringify({ t: Date.now(), rem: clamped })) }catch(_){ }
          return clamped
        })
      }, 1000)
      return ()=> { if (localTimerRef.current) clearInterval(localTimerRef.current) }
    } else {
      if (localTimerRef.current) clearInterval(localTimerRef.current)
    }
  }, [status, timeRemaining])

  // Restore remaining time from storage on reload to avoid reset
  useEffect(()=>{
    if (!sessionId) return
    try{
      const raw = sessionStorage.getItem(`emsg_timer_${sessionId}`)
      if (raw){
        const { t, rem } = JSON.parse(raw)
        if (typeof rem === 'number' && typeof t === 'number'){
          const dt = Math.max(0, (Date.now() - t) / 1000)
          const est = Math.max(0, Math.round(rem - dt))
          setTimeRemaining(est)
        }
      }
    }catch(_){ }
  }, [sessionId])

  // Ensure per-device hours arrays are initialized to horizon length
  useEffect(()=>{
    if (!selectedType || !Array.isArray(typeDevices) || typeDevices.length===0) return
    const fh = Number(cfg.general.forecast_horizon_hours||24)
    setDeviceHours(prev => {
      let changed = false
      const next = { ...prev }
      typeDevices.forEach(did => {
        if (!Array.isArray(next[did]) || next[did].length !== fh) {
          const existing = Array.isArray(prev[did]) ? prev[did] : []
          next[did] = Array.from({ length: fh }, (_, i) => Number(existing[i] || 0))
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [selectedType, typeDevices, cfg.general.forecast_horizon_hours])

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
      setSubmitted(true)
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Submit failed'
      const details = e?.response?.data?.details
      showSnack(details ? `${msg}: ${Array.isArray(details)? details[0] : details}` : msg, 'error')
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
        Play Scenario – {cfg.scenario_name} (Round {cfg.current_round})
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Button size="small" startIcon={<BriefingIcon />} onClick={()=> navigate(`/briefing/${sessionId}`)}>
          Briefing
        </Button>
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
              return dev ? `${dev.name || did} (${dev.type})` : did
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
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" variant="outlined" onClick={async()=>{
          try{ await api.post(`/api/sessions/${sessionId}/force-round-end`); showSnack('Round forced to end', 'info'); navigate('/evaluation?sessionId='+sessionId) }catch(e){ showSnack('Force end failed','error') }
        }}>Debug: Close and Evaluate</Button>
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
                        <Stack spacing={1.5}>
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

          {/* My Devices */}
          {(mode==='shared_market' ? (selectedType && typeDevices.length>0) : (Array.isArray(scenarioDevices)&&scenarioDevices.length>0)) && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>My Devices</Typography>
                <Stack spacing={1}>
                  {(mode==='shared_market' ? typeDevices.map(did=> scenarioDevices.find(d=> d.id===did)).filter(Boolean) : scenarioDevices).map((dev)=>{
                    const t = (dev.type||'').toLowerCase()
                    const specs = []
                    if (t.includes('load')){
                      if (dev.baseline_load_mw!=null) specs.push(`Baseline ${dev.baseline_load_mw} MW`)
                      if (dev.peak_load_mw!=null) specs.push(`Peak ${dev.peak_load_mw} MW`)
                    } else if (t==='battery'){
                      if (dev.power_rating_mw!=null) specs.push(`Power ${dev.power_rating_mw} MW`)
                      if (dev.capacity_mwh!=null || dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mwh||dev.capacity_mw} MWh`)
                      if (dev.efficiency_pct!=null) specs.push(`Eff. ${dev.efficiency_pct}%`)
                    } else {
                      if (dev.capacity_mw!=null) specs.push(`Capacity ${dev.capacity_mw} MW`)
                      if (dev.cost_per_mwh_zar!=null) specs.push(`Cost ${dev.cost_per_mwh_zar} ZAR/MWh`)
                    }
                            return (
                              <Stack key={dev.id} direction="row" spacing={1} justifyContent="space-between">
                                <Typography variant="body2">{dev.name || (dev.type ? (dev.type.charAt(0).toUpperCase()+dev.type.slice(1)) : dev.id)} ({dev.type})</Typography>
                                <Typography variant="body2" color="text.secondary">{specs.join(' • ')}</Typography>
                              </Stack>
                            )
                  })}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right: Forecast Editor */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>

            {(timeRemaining === 0 || submitted) && (
              <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                {submitted ? 'Forecast submitted. Waiting for round results...' : 'Time is up! You can no longer submit this round.'}
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
                  const deviceMax = (()=>{
                    const t = (deviceType||'').toLowerCase()
                    if (t.includes('load')) return deviceParams.peak_load_mw || (deviceParams.baseline_load_mw ? deviceParams.baseline_load_mw*1.5 : 0)
                    if (t === 'battery') return deviceParams.power_rating_mw || deviceParams.capacity_mw || 0
                    return deviceParams.capacity_mw || 0
                  })()
                  const fhLocal = Number(cfg.general.forecast_horizon_hours||24)
                  const series = (Array.isArray(deviceHours[did]) && deviceHours[did].length===fhLocal)
                    ? deviceHours[did]
                    : Array.from({length: fhLocal}, ()=> 0)
                  const view = (deviceView[did] || 'chart')
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
                            <Typography variant="h6">{deviceDef?.name || (deviceType ? (deviceType.charAt(0).toUpperCase()+deviceType.slice(1)) : did)}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {(() => {
                                const t = (deviceType||'').toLowerCase()
                                if (t.includes('load')) {
                                  const base = deviceParams.baseline_load_mw != null ? `Baseline: ${deviceParams.baseline_load_mw} MW` : null
                                  const peak = deviceParams.peak_load_mw != null ? `Peak: ${deviceParams.peak_load_mw} MW` : null
                                  return [`Type: ${deviceType}`, base, peak].filter(Boolean).join(' • ')
                                } else {
                                  const cap = deviceParams.capacity_mw != null ? `Capacity: ${deviceParams.capacity_mw} MW` : null
                                  const cost = (deviceParams.cost_per_mwh_zar != null ? `Cost: ${deviceParams.cost_per_mwh_zar} ZAR/MWh` : (deviceParams.marginal_cost != null ? `Cost: ${deviceParams.marginal_cost} ZAR/MWh` : null))
                                  return [`Type: ${deviceType}`, cap, cost].filter(Boolean).join(' • ')
                                }
                              })()}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            {view === 'chart' ? (
                              <Button size="small" startIcon={<ViewList fontSize="small" />} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'fields'}))}>Fields</Button>
                            ) : (
                              <Button size="small" startIcon={<BarChart fontSize="small" />} onClick={()=> setDeviceView(prev=> ({...prev, [did]: 'chart'}))}>Chart</Button>
                            )}
                          </Stack>
                        </Stack>
                        {view === 'chart' ? (
                          <Box sx={{ mb: 2 }}>
                            <ForecastChartEditor hours={series} lockedUntil={effectiveLockedUntil} onChange={(i, val)=> onDeviceChange(did, i, val)} maxValue={deviceMax} smoothRadius={3} />
                          </Box>
                        ) : (
                          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                            {(deviceHours[did]||[]).map((v,i)=>{
                              const disabled = i < effectiveLockedUntil || timeRemaining === 0
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
                        )}
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
                    <ForecastChartEditor hours={hours} lockedUntil={effectiveLockedUntil} onChange={(i, val)=> onChange(i, val)} smoothRadius={3} />
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
                  <Button variant="contained" onClick={submitCurrent} disabled={!isEditable || !isValid || timeRemaining === 0 || submitted || (mode==='shared_market' && allowedTypes.length>0 && !selectedType)}>
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
  );
}