import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, Tooltip, Checkbox, FormControlLabel, Chip, Box, IconButton, Dialog, DialogTitle, DialogContent, IconButton as MuiIconButton, Skeleton } from '@mui/material'
import { Pause as PauseIcon, PlayArrow as PlayIcon, Stop as StopIcon, SkipNext as NextIcon, BarChart as ComparisonIcon, Close as CloseIcon, Public as MarketOverviewIcon } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import InfoLabel from '../components/InfoLabel'
import { io } from 'socket.io-client'
import api from '../services/api'
import * as d3 from 'd3'
import { exportSVG, exportPNG } from '../utils/exportSvg'
import {
  buildActiveEventsSection,
  buildCompositionSection,
  buildGroupedRankingSections,
  buildParticipantsCard,
  buildPriceCard,
  buildVolumeCard,
  buildZoneSection,
  normalizeMarketSummary,
  summarizeMarketFromRanking,
} from '../utils/marketOverview'
import DocsFab from '../components/DocsFab'
import MarketOverviewDialog from '../components/MarketOverviewDialog'
import RoundResultsScreenSimple from '../components/RoundResultsScreenSimple'

const MARKET_OVERVIEW_ALL_ROUNDS = 'all'
import MarketOverviewTrendPanel from '../components/MarketOverviewTrendPanel'
import MarketStructureChartPanel from '../components/MarketStructureChartPanel'

export default function Trainer(){
  const [searchParams] = useSearchParams()
  const cohortId = searchParams.get('cohort') || '1'
  const requestedSessionId = searchParams.get('sessionId')
  const [campaignId, setCampaignId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
  // Presence panel state
  const [presence, setPresence] = useState({ users: [] })
  const [log, setLog] = useState([])
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(null)
  const [marketPhase, setMarketPhase] = useState(null) // two-phase rounds: 'dam' | 'idm' | null
  const [status, setStatus] = useState({ rounds: 0, players: [] })
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
  const [submitStatus, setSubmitStatus] = useState({ players: [] })
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [comparisonData, setComparisonData] = useState([])
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonMetric, setComparisonMetric] = useState('profit_zar')
  const [selectedComparisonType, setSelectedComparisonType] = useState('')
  const comparisonChartRef = useRef(null)
  const [marketOverviewOpen, setMarketOverviewOpen] = useState(false)
  const [marketOverviewLoading, setMarketOverviewLoading] = useState(false)
  const [marketOverviewByRound, setMarketOverviewByRound] = useState({})
  const [marketOverviewSelectedRound, setMarketOverviewSelectedRound] = useState(null)
  const [marketOverviewReplayRounds, setMarketOverviewReplayRounds] = useState([])
  const [marketOverviewReplayLoading, setMarketOverviewReplayLoading] = useState(false)
  const [marketOverviewReplayLoaded, setMarketOverviewReplayLoaded] = useState(false)
  const [roundDetailsOpen, setRoundDetailsOpen] = useState(false)
  const [roundDetailsView, setRoundDetailsView] = useState(null)
  const [cohortMembers, setCohortMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const isLastRound = !!(sessionInfo?.general?.rounds && sessionInfo?.current_round >= sessionInfo?.general?.rounds)
  const availableMarketOverviewRound = useMemo(() => {
    const currentRound = Number(sessionInfo?.current_round || 0)
    if (!currentRound) return null
    if (['round_results', 'ended', 'scenario_complete'].includes(sessionInfo?.status)) return currentRound
    return currentRound > 1 ? currentRound - 1 : null
  }, [sessionInfo])

  const availableMarketOverviewRounds = useMemo(() => {
    const maxRound = Number(availableMarketOverviewRound || 0)
    return maxRound > 0 ? Array.from({ length: maxRound }, (_, index) => index + 1) : []
  }, [availableMarketOverviewRound])
  const isAllMarketOverviewRoundsSelected = marketOverviewSelectedRound === MARKET_OVERVIEW_ALL_ROUNDS
  const selectedMarketOverviewRoundNumber = useMemo(() => {
    if (marketOverviewSelectedRound === MARKET_OVERVIEW_ALL_ROUNDS) return null
    const parsedRound = Number(marketOverviewSelectedRound)
    return Number.isFinite(parsedRound) && parsedRound > 0 ? parsedRound : null
  }, [marketOverviewSelectedRound])

  const playerTypeCounts = useMemo(() => {
    const counts = {}
    const players = status?.players || []
    players.forEach((p) => {
      if (p?.type) counts[p.type] = (counts[p.type] || 0) + 1
    })
    const types = brief?.player_types || []
    return types.map((t) => ({
      id: t.id,
      name: t.name || t.id,
      count: counts[t.id] || 0
    }))
  }, [status, brief])

  const playerTypeLabels = useMemo(() => {
    return new Map((brief?.player_types || []).map((item) => [String(item.id), item.name || item.id]))
  }, [brief])

  const resolvePlayerTypeLabel = (value) => {
    const key = String(value || '').trim()
    if (!key) return '-'
    return playerTypeLabels.get(key) || key
  }

  const submitStatusByPlayer = useMemo(() => {
    const entries = Array.isArray(submitStatus?.players) ? submitStatus.players : []
    return new Map(entries.map((player) => [Number(player.player_id), Boolean(player.submitted)]))
  }, [submitStatus])

  const comparisonTypeOptions = useMemo(() => {
    const labelsById = new Map((brief?.player_types || []).map((item) => [String(item.id), item.name || item.id]))
    const seen = new Set()
    return comparisonData
      .filter((row) => row?.player_type)
      .map((row) => String(row.player_type))
      .filter((typeId) => {
        if (seen.has(typeId)) return false
        seen.add(typeId)
        return true
      })
      .map((typeId) => ({ value: typeId, label: labelsById.get(typeId) || typeId }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [brief, comparisonData])

  const filteredComparisonData = useMemo(() => {
    if (!selectedComparisonType) return comparisonData
    return comparisonData.filter((row) => String(row?.player_type || '') === selectedComparisonType)
  }, [comparisonData, selectedComparisonType])

  const selectedComparisonTypeLabel = useMemo(() => {
    return comparisonTypeOptions.find((item) => item.value === selectedComparisonType)?.label || selectedComparisonType || 'Selected type'
  }, [comparisonTypeOptions, selectedComparisonType])

  const hasComparisonTypes = comparisonTypeOptions.length > 0

  useEffect(() => {
    if (comparisonTypeOptions.length === 0) {
      setSelectedComparisonType('')
      return
    }
    if (!comparisonTypeOptions.some((item) => item.value === selectedComparisonType)) {
      setSelectedComparisonType(comparisonTypeOptions[0].value)
    }
  }, [comparisonTypeOptions, selectedComparisonType])

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
    s.on('round_start', p=> { setMarketPhase(p?.phase || null) })
    s.on('dam_phase_cleared', p=> { setMarketPhase('idm'); setLog(l=>[...l, `dam_phase_cleared ${JSON.stringify(p)}`]) })
    s.on('round_results', p=> {
      loadStatus()
      setMarketPhase(null)
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

  useEffect(()=>{
    if(!sessionId) return
    const sGame = io('/game', { path: '/socket.io', transports: ['websocket','polling'], forceNew: true })
    sGame.on('connect', () => {
      try { sGame.emit('join_session', { session_id: Number(sessionId) }) } catch(_){ }
    })
    sGame.on('tick', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTick(p?.remaining)
      }
    })
    sGame.on('round_end', (p) => {
      if (Number(p?.session_id) === Number(sessionId)) {
        setTick(0)
      }
    })
    return ()=> { try{ sGame.close() }catch(_){} }
  }, [sessionId])

  // Cohort comes from URL parameter - no need to load all cohorts

  // When cohort changes: check active session and load campaigns visible for cohort
  useEffect(()=>{
    if(!cohortId) return
    const run = async ()=>{
      try{
        if (requestedSessionId) {
          const { data } = await api.get(`/api/sessions/${Number(requestedSessionId)}`)
          if (data?.id) {
            setSessionId(data.id)
            setSessionInfo(data)
          } else {
            setSessionId(null)
            setSessionInfo(null)
          }
        } else {
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
  },[cohortId, requestedSessionId])

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
      const { data } = await api.post('/api/sessions', { cohort_id: Number(cohortId), scenario_id: Number(scenarioId), mode: 'shared_market' })
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
  const startRound = async ()=>{
    if(!sessionId) return
    try{
      await api.post(`/api/sessions/${sessionId}/start-briefing`)
      setTimeout(loadStatus, 300)
    }catch(_){ }
  }
  const forceRoundEnd = async ()=>{
    if(!sessionId) return
    try{
      await api.post(`/api/sessions/${sessionId}/force-round-end`)
    }catch(e){
      const msg = e?.response?.data?.error || 'Failed to end round now'
      if(window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  const advanceRoundForce = async ()=>{
    if(!sessionId) return
    try{
      await api.post(`/api/sessions/${sessionId}/advance-round-force`)
      setTimeout(loadStatus, 300)
    }catch(e){
      const msg = e?.response?.data?.error || 'Failed to advance round'
      if(window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  const nextAction = async ()=>{
    if(!sessionId) return
    try{
      if(sessionInfo?.status === 'round_results'){
        await advanceRoundForce()
      }else if(['running','round_active','paused'].includes(sessionInfo?.status)){
        await forceRoundEnd()
      }
    }catch(e){
      const msg = e?.response?.data?.error || 'Action failed'
      if(window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  const extendTimer = async ()=>{
    if(!sessionId) return
    try{
      await api.post(`/api/sessions/${sessionId}/extend-timer`, { seconds: 60 })
      if(window.__showSnack) window.__showSnack('+1 minute added', 'success')
    }catch(e){
      const msg = e?.response?.data?.error || 'Failed to extend timer'
      if(window.__showSnack) window.__showSnack(msg, 'error')
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
    try{
      const res = await api.get(`/api/sessions/${sessionId}/submit-status`)
      setSubmitStatus(res.data || { players: [] })
    }catch(_){ setSubmitStatus({ players: [] }) }
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

  useEffect(() => {
    setMarketOverviewByRound({})
    setMarketOverviewSelectedRound(null)
    setMarketOverviewReplayRounds([])
    setMarketOverviewReplayLoading(false)
    setMarketOverviewReplayLoaded(false)
  }, [sessionId])

  // Draw comparison chart
  useEffect(() => {
    if (!comparisonChartRef.current || filteredComparisonData.length === 0) return
    const svg = d3.select(comparisonChartRef.current)
    svg.selectAll('*').remove()
    const width = 640, height = 240
    const margin = { top: 10, right: 10, bottom: 30, left: 60 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg.attr('width', width).attr('height', height).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const x = d3.scaleBand().domain(filteredComparisonData.map(d => String(d.player_id))).range([0, innerW]).padding(0.2)
    const y = d3.scaleLinear().domain([0, d3.max(filteredComparisonData, d => d[comparisonMetric]) || 0]).nice().range([innerH, 0])
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
    g.selectAll('rect').data(filteredComparisonData).enter().append('rect')
      .attr('x', d => x(String(d.player_id)))
      .attr('y', d => y(d[comparisonMetric]))
      .attr('width', x.bandwidth())
      .attr('height', d => innerH - y(d[comparisonMetric]))
      .attr('fill', '#1976d2')
  }, [filteredComparisonData, comparisonMetric])

  const buildMarketOverviewRoundData = (data, roundNumber) => {
    const ranking = Array.isArray(data?.ranking) ? data.ranking : []
    const normalize = (value) => {
      const num = Number(value ?? 0)
      return Number.isFinite(num) ? num : 0
    }
    const formatInt = (value) => normalize(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    const formatCurrency = (value) => `ZAR ${formatInt(value)}`
    const marketSummary = normalizeMarketSummary(
      data?.market_summary || summarizeMarketFromRanking({
        ranking,
        totalVolumeMwh: ranking.reduce((maxVolume, row) => Math.max(maxVolume, normalize(row?.volume)), 0),
        dispatchedAccessor: (row) => row?.kpis?.dispatched_mwh,
        roleAccessor: (row) => row?.player_role,
        revenueAccessor: (row) => row?.kpis?.revenue_zar,
      })
    )
    const sumBy = (rows, key) => rows.reduce((sum, row) => sum + normalize(row?.kpis?.[key]), 0)
    const totalPlayers = ranking.length
    const totalProfit = sumBy(ranking, 'profit_zar')
    const totalImbalance = sumBy(ranking, 'imbalance_cost_zar')
    const totalAtc = ranking.reduce((sum, row) => sum + normalize(row?.kpis?.atc_dispatch_cost_zar ?? row?.kpis?.grid_constraint_cost_zar), 0)
    const avgScore = totalPlayers > 0
      ? ranking.reduce((sum, row) => sum + normalize(row?.total_score), 0) / totalPlayers
      : 0
    const compositionSection = buildCompositionSection(marketSummary, formatInt)
    const zoneSection = buildZoneSection(marketSummary, formatCurrency, formatInt)
    const summarySection = {
      title: 'Round-wide market summary',
      rows: [
        { label: 'Round', value: String(roundNumber) },
        { label: 'Total profit across real players', value: formatCurrency(totalProfit) },
        { label: 'Active events', value: String(data?.market_summary?.active_events_count ?? (Array.isArray(data?.active_events) ? data.active_events.length : 0)) },
        { label: 'Real player share of producer side', value: `${marketSummary.realPlayers.producerSharePct.toFixed(1)}%` },
        { label: 'Real player share of consumer side', value: `${marketSummary.realPlayers.consumerSharePct.toFixed(1)}%` },
      ],
    }
    const activeEventsSection = buildActiveEventsSection(data?.active_events)
    const topPlayersSection = {
      title: 'Top players this round',
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'player', label: 'Player' },
        { key: 'type', label: 'Type' },
        { key: 'score', label: 'Score', align: 'right' },
        { key: 'profit', label: 'Profit', align: 'right' },
      ],
      rows: ranking.slice(0, 8).map((row, index) => ({
        key: row?.player_id || index,
        rank: `#${row?.rank || index + 1}`,
        player: row?.email || `Player ${row?.player_id || '-'}`,
        type: resolvePlayerTypeLabel(row?.type),
        score: normalize(row?.total_score).toFixed(1),
        profit: formatCurrency(row?.kpis?.profit_zar || 0),
      })),
    }
    const rankingEntries = ranking.map((row, index) => ({
      key: row?.player_id || row?.email || index,
      rank: `#${row?.rank || index + 1}`,
      player: row?.email || `Player ${row?.player_id || '-'}`,
      type: resolvePlayerTypeLabel(row?.type),
      score: normalize(row?.total_score).toFixed(1),
      primaryValue: formatCurrency(row?.kpis?.profit_zar || 0),
      sourceRow: row,
    }))

    return {
      cards: [
        buildVolumeCard(marketSummary, formatInt),
        { key: 'profit', title: 'Total Profit', value: formatCurrency(totalProfit), caption: `Real players · average score ${avgScore.toFixed(1)}` },
        buildPriceCard(marketSummary),
        { key: 'imbalance', title: 'Imbalance / ATC', value: formatCurrency(totalImbalance), caption: `Real players · ATC ${formatCurrency(totalAtc)}` },
      ].filter(Boolean),
      overviewSections: [summarySection, activeEventsSection].filter(Boolean),
      marketMixSections: [compositionSection, zoneSection].filter(Boolean),
      rankingEntries,
      formatInt,
      rawResultsData: data,
    }
  }

  useEffect(() => {
    let isCancelled = false

    if (
      !marketOverviewOpen
      || !sessionId
      || !selectedMarketOverviewRoundNumber
      || marketOverviewByRound[selectedMarketOverviewRoundNumber]
    ) {
      return () => {}
    }

    const loadRound = async () => {
      setMarketOverviewLoading(true)
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/round-results/${selectedMarketOverviewRoundNumber}`)
        if (!isCancelled) {
          setMarketOverviewByRound((prev) => ({
            ...prev,
            [selectedMarketOverviewRoundNumber]: buildMarketOverviewRoundData(data, selectedMarketOverviewRoundNumber),
          }))
        }
      } catch (err) {
        console.error('Failed to load market overview round:', err)
        if (!isCancelled) {
          setMarketOverviewByRound((prev) => ({
            ...prev,
            [selectedMarketOverviewRoundNumber]: {
              cards: [],
              overviewSections: [{ title: 'Error', items: [{ text: `Failed to load data for round ${selectedMarketOverviewRoundNumber}.` }] }],
              marketMixSections: [],
              rankingEntries: [],
              formatInt: (value) => `${value}`,
            },
          }))
        }
      } finally {
        if (!isCancelled) {
          setMarketOverviewLoading(false)
        }
      }
    }

    loadRound()
    return () => {
      isCancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOverviewByRound, marketOverviewOpen, selectedMarketOverviewRoundNumber, sessionId])

  useEffect(() => {
    let isCancelled = false

    if (!marketOverviewOpen || !sessionId || marketOverviewReplayLoaded) {
      return () => {}
    }

    const loadReplay = async () => {
      setMarketOverviewReplayLoading(true)
      try {
        const { data } = await api.get(`/api/sessions/${sessionId}/replay`)
        if (!isCancelled) {
          setMarketOverviewReplayRounds(Array.isArray(data?.rounds) ? data.rounds : [])
        }
      } catch (err) {
        console.error('Failed to load market overview replay:', err)
        if (!isCancelled) {
          setMarketOverviewReplayRounds([])
        }
      } finally {
        if (!isCancelled) {
          setMarketOverviewReplayLoading(false)
          setMarketOverviewReplayLoaded(true)
        }
      }
    }

    loadReplay()
    return () => {
      isCancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOverviewOpen, marketOverviewReplayLoaded, sessionId])

  const selectedMarketOverview = selectedMarketOverviewRoundNumber ? marketOverviewByRound[selectedMarketOverviewRoundNumber] : null
  const roundDetailsScenario = useMemo(() => ({
    name: sessionInfo?.scenario_name || brief?.name || 'Scenario',
    campaign_name: sessionInfo?.campaign_name || brief?.campaign_name || '',
    description: brief?.description || '',
    allowed_player_types: brief?.allowed_player_types || allowedTypes || [],
    config: {
      description: brief?.description || '',
      general: brief?.general || sessionInfo?.general || {},
      market: brief?.market || sessionInfo?.market || {},
      markets: brief?.markets || sessionInfo?.markets || {},
      grid: brief?.grid || {},
      events: brief?.events || [],
      challenges: brief?.challenges || [],
      scoring: brief?.scoring || {},
      player_types: brief?.player_types || [],
      devices: brief?.devices || [],
      player_input: brief?.player_input || sessionInfo?.player_input || {},
    },
  }), [allowedTypes, brief, sessionInfo])

  const openRoundDetailsFromRankingEntry = (entry) => {
    if (!entry?.sourceRow || !selectedMarketOverviewRoundNumber || !selectedMarketOverview?.rawResultsData) return
    const resultsData = structuredClone(selectedMarketOverview.rawResultsData)
    resultsData.my_result = structuredClone(entry.sourceRow)
    if (!resultsData.my_result?.type && resultsData.my_result?.player_type) {
      resultsData.my_result.type = resultsData.my_result.player_type
    }
    setRoundDetailsView({
      playerLabel: entry.player || entry.sourceRow?.email || `Player ${entry.sourceRow?.player_id || '-'}`,
      roundNumber: selectedMarketOverviewRoundNumber,
      resultsData,
    })
    setRoundDetailsOpen(true)
  }

  const closeRoundDetails = () => {
    setRoundDetailsOpen(false)
    setRoundDetailsView(null)
  }

  const allRoundsMeritOrderContent = availableMarketOverviewRounds.length > 0 ? (
    <MarketStructureChartPanel
      sessionId={sessionId}
      roundSpan={Number(sessionInfo?.general?.round_span_hours || 6)}
      startTime={sessionInfo?.general?.start_time || '00:00'}
      overlayRounds={availableMarketOverviewRounds}
    />
  ) : (
    <Typography variant="body2" color="text.secondary">
      No completed rounds are available yet.
    </Typography>
  )

  const allRoundsUnavailableSections = [{
    title: 'Round selection required',
    items: [{ text: 'Select a single round to view overview, market mix, and ranking data. Use All rounds in the Merit Order tab to compare every round.' }],
  }]

  const marketOverviewHeaderControls = availableMarketOverviewRounds.length > 0 ? (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" color="text.secondary">Round</Typography>
      <Select
        size="small"
        value={marketOverviewSelectedRound || ''}
        onChange={(event) => {
          const nextValue = event.target.value
          if (nextValue === MARKET_OVERVIEW_ALL_ROUNDS) {
            setMarketOverviewSelectedRound(MARKET_OVERVIEW_ALL_ROUNDS)
            return
          }
          setMarketOverviewSelectedRound(Number(nextValue) || null)
        }}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value={MARKET_OVERVIEW_ALL_ROUNDS}>All rounds</MenuItem>
        {availableMarketOverviewRounds.map((roundValue) => (
          <MenuItem key={roundValue} value={roundValue}>{`Round ${roundValue}`}</MenuItem>
        ))}
      </Select>
    </Stack>
  ) : null

  const marketOverviewTabs = [
    {
      id: 'overview',
      label: 'Overview',
      cards: isAllMarketOverviewRoundsSelected ? [] : (marketOverviewLoading && !selectedMarketOverview ? [] : (selectedMarketOverview?.cards || [])),
      sections: isAllMarketOverviewRoundsSelected
        ? allRoundsUnavailableSections
        : (selectedMarketOverview?.overviewSections || (marketOverviewLoading
        ? [{ title: 'Loading', items: [{ text: 'Loading current market KPIs…' }] }]
        : [{ title: 'No completed round available', items: [{ text: 'Overall market data becomes available after the first round results are available.' }] }])),
    },
    {
      id: 'market-mix',
      label: 'Market Mix',
      sections: isAllMarketOverviewRoundsSelected
        ? allRoundsUnavailableSections
        : selectedMarketOverview?.marketMixSections?.length > 0
        ? selectedMarketOverview.marketMixSections
        : [{ title: 'Market mix', items: [{ text: marketOverviewLoading ? 'Loading market composition…' : 'No market composition data available for the selected round.' }] }],
    },
    {
      id: 'ranking',
      label: 'Ranking',
      sections: isAllMarketOverviewRoundsSelected
        ? allRoundsUnavailableSections
        : buildGroupedRankingSections({
            entries: (selectedMarketOverview?.rankingEntries || []).map((entry) => ({
              ...entry,
              action: entry?.sourceRow ? (
                <Button size="small" variant="text" onClick={() => openRoundDetailsFromRankingEntry(entry)}>
                  Show round details
                </Button>
              ) : null,
            })),
            title: 'Round ranking',
            scoreLabel: 'Score',
            valueLabel: 'Profit',
            actionLabel: 'Action',
          }),
    },
    {
      id: 'session-trend',
      label: 'Session Trend',
      content: marketOverviewReplayLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Skeleton variant="rectangular" width="100%" height={320} />
        </Box>
      ) : (
        <MarketOverviewTrendPanel
          rounds={marketOverviewReplayRounds}
          selectedRound={selectedMarketOverviewRoundNumber}
          formatPrice={(value) => `${Number(value || 0).toFixed(1)} ZAR/MWh`}
          formatVolume={(value) => `${selectedMarketOverview?.formatInt ? selectedMarketOverview.formatInt(value) : Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MWh`}
        />
      ),
    },
    {
      id: 'merit-order',
      label: 'Merit Order',
      content: isAllMarketOverviewRoundsSelected ? allRoundsMeritOrderContent : (
        <MarketStructureChartPanel
          sessionId={sessionId}
          roundNum={selectedMarketOverviewRoundNumber}
          roundSpan={Number(sessionInfo?.general?.round_span_hours || 6)}
          startTime={sessionInfo?.general?.start_time || '00:00'}
        />
      ),
    },
  ]

  const openMarketOverview = async () => {
    if (!sessionId) return
    setMarketOverviewOpen(true)
    setMarketOverviewSelectedRound(availableMarketOverviewRound || null)
  }

  return (
    <Paper sx={{ p:2, position: 'relative' }}>
      <Box sx={{ mb: 1 }} />
      
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
      {!sessionId && (
        <Paper variant="outlined" sx={{ p:2, mb:2 }}>
          <Typography variant="subtitle1" gutterBottom>Start New Scenario</Typography>
          <Stack spacing={1}>
            {/* Single row: Campaign, Scenario, Player Types, Start */}
            <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              <Stack spacing={0.5} sx={{ minWidth: 200, flex: 1 }}>
                <InfoLabel title="Campaign" tooltip="Select a campaign available for this cohort." />
                <Select size="small" value={campaignId} onChange={e=>setCampaignId(e.target.value)} displayEmpty disabled={campaigns.length===0}>
                  {campaigns.length === 0 && <MenuItem value=""><em>No campaigns</em></MenuItem>}
                  {campaigns.map(c => (
                    <MenuItem key={c.campaign_id} value={String(c.campaign_id)}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 200, flex: 1 }}>
                <InfoLabel title="Scenario" tooltip="Pick a scenario from the selected campaign." />
                <Select size="small" value={scenarioId} onChange={e=>setScenarioId(e.target.value)} displayEmpty disabled={!campaignId}>
                  {campScenarios.length === 0 && <MenuItem value=""><em>No scenarios</em></MenuItem>}
                  {campScenarios.map(s => (
                    <MenuItem key={s.scenario_id} value={String(s.scenario_id)}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              {allowedTypes.map((row, idx)=> (
                <Stack key={row.type_id} spacing={0.5} sx={{ minWidth: 140 }}>
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
              <Button variant="contained" onClick={start} size="medium" disabled={!scenarioId}>Start Scenario</Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Session Info - NOW SECOND, with control buttons on right */}
      {sessionId && sessionInfo && (
        <Paper variant="outlined" sx={{ p:2, mb:2, bgcolor: sessionInfo.status==='running'?'#e8f5e9':'#f5f5f5' }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {sessionInfo.campaign_name || ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {sessionInfo.scenario_name || 'Scenario'}
            </Typography>
            <Typography variant="h6" color={tick && tick > 0 ? 'primary' : 'text.secondary'}>{tick !== null ? `${tick}s` : ''}</Typography>
            <Box sx={{ flexGrow: 1 }} />
            {/* Transport controls */}
            <Tooltip title="Start">
              <IconButton onClick={startRound} disabled={!sessionId || sessionInfo?.status !== 'briefing'} color="primary" size="small"><PlayIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Stop">
              <IconButton onClick={end} disabled={!sessionId} color="error" size="small"><StopIcon /></IconButton>
            </Tooltip>
            <Stack spacing={0} sx={{ minWidth: 130 }} alignItems="center">
              <Typography variant="body2" fontWeight="bold">
                {sessionInfo.status === 'briefing'
                  ? 'Briefing'
                  : sessionInfo.status === 'round_results'
                    ? `Round ${sessionInfo.current_round || 1} / ${sessionInfo.general?.rounds || '?'}`
                    : `Round ${sessionInfo.current_round || 1} / ${sessionInfo.general?.rounds || '?'}`}
              </Typography>
              {marketPhase && (
                <Typography variant="caption" color={marketPhase === 'dam' ? 'info.main' : 'warning.main'} fontWeight="bold">
                  {marketPhase === 'dam' ? 'Phase 1/2 · Day-Ahead' : 'Phase 2/2 · Intraday'}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {['running','round_active','paused'].includes(sessionInfo?.status)
                  ? `ETA ${tick !== null ? tick : '—'}s`
                  : sessionInfo.status === 'briefing'
                    ? 'briefing'
                    : sessionInfo.status === 'round_results'
                      ? 'results'
                      : sessionInfo.status === 'round_closing'
                        ? 'closing'
                        : sessionInfo.status === 'calculating'
                          ? 'calculating'
                          : ''}
              </Typography>
            </Stack>
            <Tooltip title="Pause">
              <IconButton onClick={pause} disabled={!sessionId || !['running','round_active'].includes(sessionInfo?.status)} color="primary" size="small"><PauseIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Continue">
              <IconButton onClick={resume} disabled={!sessionId || sessionInfo?.status !== 'paused'} color="primary" size="small"><PlayIcon /></IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              onClick={extendTimer}
              disabled={!sessionId || !['running','round_active','paused'].includes(sessionInfo?.status)}
            >
              +1min
            </Button>
            <Tooltip title={sessionInfo?.status === 'round_results' ? (isLastRound ? 'Finish' : 'Next') : 'End round now'}>
              <IconButton
                onClick={nextAction}
                disabled={!sessionId || !['round_results','running','round_active','paused'].includes(sessionInfo?.status)}
                color="primary"
                size="small"
              ><NextIcon /></IconButton>
            </Tooltip>
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
            {sessionId && (
              <Tooltip title="Player Type Comparison">
                <IconButton onClick={() => setComparisonOpen(true)} color="primary" size="small">
                  <ComparisonIcon />
                </IconButton>
              </Tooltip>
            )}
            {sessionId && (
              <Tooltip title={availableMarketOverviewRound ? `Overall market overview for round ${availableMarketOverviewRound}` : 'Available after the first completed round'}>
                <span>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    startIcon={<MarketOverviewIcon fontSize="small" />}
                    onClick={openMarketOverview}
                    disabled={!availableMarketOverviewRound}
                    aria-label="Open overall market overview"
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Overall Market Overview
                  </Button>
                </span>
              </Tooltip>
            )}
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
          {sessionId && (playerTypeCounts.length > 0) && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Chip label={`Session #${sessionId}`} size="small" variant="outlined" />
              {playerTypeCounts.map((t) => (
                <Chip key={t.id} label={`${t.name}: ${t.count}`} size="small" variant="outlined" />
              ))}
            </Stack>
          )}
          {membersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <Typography variant="body2" color="text.secondary">Loading members...</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox"></TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Player Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Round</TableCell>
                  <TableCell>Last Activity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cohortMembers.map(member => {
                  const playerId = Number(member.user_id)
                  const hasSubmittedCurrentRound = submitStatusByPlayer.get(playerId)
                  const hasSubmitStatusEntry = submitStatusByPlayer.has(playerId)
                  const isMemberInCurrentSession = Number(member.active_session?.session_id) === Number(sessionId)
                  const showSubmissionStatus = Boolean(sessionId && (isMemberInCurrentSession || hasSubmitStatusEntry))
                  const displayStatus = showSubmissionStatus
                    ? (hasSubmittedCurrentRound ? 'submitted' : 'pending submit')
                    : member.status
                  const statusColors = {
                    playing: 'success',
                    submitted: 'success',
                    'pending submit': 'warning',
                    briefing: 'info',
                    paused: 'warning',
                    online: 'primary',
                    recent: 'default',
                    inactive: 'default'
                  }
                  const bgColors = {
                    playing: '#e8f5e9',
                    submitted: '#e8f5e9',
                    'pending submit': '#fff8e1',
                    briefing: '#e3f2fd',
                    paused: '#fff3e0',
                    online: '#e1f5fe',
                    recent: 'transparent',
                    inactive: 'transparent'
                  }
                  return (
                    <TableRow key={member.user_id} sx={{ bgcolor: bgColors[displayStatus] || bgColors[member.status] || 'transparent' }}>
                      <TableCell padding="checkbox">
                        <Box sx={{ width: 4, height: '100%', minHeight: 24, bgcolor: member.user_id === currentUser.id ? 'secondary.main' : 'transparent', borderRadius: 1 }} />
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.name || '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip label={member.role} size="small" variant="outlined" />
                        </Stack>
                      </TableCell>
                      <TableCell>{(brief?.player_types || []).find(t => t.id === (member.player_type || member.active_session?.player_type))?.name || member.player_type || member.active_session?.player_type || '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          <Chip 
                            label={displayStatus}
                            size="small" 
                            color={statusColors[displayStatus] || statusColors[member.status] || 'default'}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        {member.active_session ? `R${member.active_session.current_round}` : (sessionInfo?.current_round ? `R${sessionInfo.current_round}` : '—')}
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
          <Typography variant="h6">Player Type Comparison</Typography>
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
              {hasComparisonTypes ? (
                <>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="body2">Player type:</Typography>
                    <Select
                      size="small"
                      value={selectedComparisonType}
                      onChange={e => setSelectedComparisonType(e.target.value)}
                      sx={{ minWidth: 220 }}
                    >
                      {comparisonTypeOptions.map((item) => (
                        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </Select>
                    <Typography variant="body2">Metric:</Typography>
                    <Select size="small" value={comparisonMetric} onChange={e => setComparisonMetric(e.target.value)} sx={{ minWidth: 200 }}>
                      <MenuItem value="profit_zar">Profit (ZAR)</MenuItem>
                      <MenuItem value="revenue_zar">Revenue (ZAR)</MenuItem>
                      <MenuItem value="imbalance_cost_zar">Imbalance Cost (ZAR)</MenuItem>
                      <MenuItem value="curtailment_cost_zar">Curtailment Cost (ZAR)</MenuItem>
                    </Select>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Comparing players within {selectedComparisonTypeLabel}.
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  Player-type assignments are unavailable for this session, so a fair peer comparison cannot be shown.
                </Typography>
              )}
              {hasComparisonTypes && filteredComparisonData.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No players with results found for this player type yet.
                </Typography>
              ) : (
                hasComparisonTypes && (
                  <>
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
                        {filteredComparisonData.map(row => (
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
                  </>
                )
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <MarketOverviewDialog
        open={marketOverviewOpen}
        onClose={() => setMarketOverviewOpen(false)}
        title="Overall Market Overview"
        subtitle={sessionInfo ? `${sessionInfo.scenario_name || 'Scenario'} · ${isAllMarketOverviewRoundsSelected ? 'All rounds' : (selectedMarketOverviewRoundNumber ? `Round ${selectedMarketOverviewRoundNumber}` : 'No completed round yet')}` : 'Current session'}
        tabs={marketOverviewTabs}
        defaultTabId="overview"
        headerControls={marketOverviewHeaderControls}
      />

      <Dialog open={roundDetailsOpen} onClose={closeRoundDetails} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6">Round Details</Typography>
            <Typography variant="caption" color="text.secondary">
              {roundDetailsView ? `${roundDetailsView.playerLabel} · Round ${roundDetailsView.roundNumber}` : ''}
            </Typography>
          </Box>
          <MuiIconButton onClick={closeRoundDetails} size="small" aria-label="Close round details">
            <CloseIcon fontSize="small" />
          </MuiIconButton>
        </DialogTitle>
        <DialogContent dividers>
          {roundDetailsView?.resultsData ? (
            <RoundResultsScreenSimple
              sessionId={sessionId}
              round={roundDetailsView.roundNumber}
              scenario={roundDetailsScenario}
              campaignName={sessionInfo?.campaign_name || brief?.campaign_name || ''}
              externalResultsData={roundDetailsView.resultsData}
              embedded
            />
          ) : null}
        </DialogContent>
      </Dialog>
      
      <DocsFab href="/docs/trainer" label="Open Trainer Handbook" />
    </Paper>
  )
}