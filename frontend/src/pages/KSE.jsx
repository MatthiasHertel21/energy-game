import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Tab, Box, Stack, TextField, Button, Paper, Typography, Select, MenuItem, IconButton, Menu, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, Grid, Accordion, AccordionSummary, AccordionDetails, Tooltip, InputAdornment } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Edit as EditIcon, Add as AddIcon, Visibility as VisibilityIcon } from '@mui/icons-material'
import InfoLabel from '../components/InfoLabel'
import NumberInput from '../components/inputs/NumberInput'
import RangeInput from '../components/inputs/RangeInput'
import AtcEditor from '../components/grid/AtcEditor'
import DeviceCard from '../components/devices/DeviceCard'
import { createDeviceFromPreset, duplicateDevice, DEVICE_PRESETS } from '../components/devices/devicePresets'
import EventsList from '../components/events/EventsList'
import EventEditor from '../components/events/EventEditor'
import ProfileEditorModal from '../components/ProfileEditorModal'
import ChallengesList from '../components/challenges/ChallengesList'
import ChallengeEditor from '../components/challenges/ChallengeEditor'
import api from '../services/api'
import * as d3 from 'd3'
import ReactMarkdown from 'react-markdown'
import ValidationPanel from '../components/ValidationPanel'
import StickyActionBar from '../components/StickyActionBar'
import { exportPNG, exportSVG } from '../utils/exportSvg'
import useAuth from '../store/auth'

// Bump this when making breaking/editor-visible changes to KSE
const KSE_EDITOR_VERSION = '1.1.0'

const defaultConfig = {
  version: '1.0.0',
  general: { horizon_hours: 24, forecast_horizon_hours: 48, freeze_hours: 2, day_ahead_gate_hour: 12, round_span_hours: 6, rounds: 4, round_duration_seconds: 300, description: '' },
    market: {
      base_price: 1000,
      base_volume_mwh: 20000,
      price_floor: -500,
      price_cap: 5000,
      enable_player_bidding: true,
      // generator_mix / consumer_mix are interpreted as counts (0-1000) per group
      generator_mix: { pv: 250, wind: 200, hydro: 100, coal: 300, gas: 150, nuclear: 0 },
      consumer_mix: { industrial: 400, household: 500, agriculture: 100 },
      random_capacity_pct: 10,
      random_price_pct: 10,
    },
  grid: { zones: 2, atc: [[0,5000],[5000,0]] },
  environment: { seed: 'preview', actual_noise_pct: 5 },
  events: [],
  devices: [],
  challenges: [],
}

console.info('[KSE] Editor version', KSE_EDITOR_VERSION)

function Curves({ cfg, preview, groups, showSupply=true, showDemand=true, showMcp=true, svgRef }){
  // Step supply/demand preview with axes and legend
  const ref = svgRef ?? useRef(null)
  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const M = { top: 16, right: 16, bottom: 28, left: 48 }
    const W = 360 - M.left - M.right
    const H = 180 - M.top - M.bottom
    const g = svg.attr('width', 360).attr('height', 180).append('g').attr('transform', `translate(${M.left},${M.top})`)

    const baseP = Number(cfg.market.base_price || 1000)
    const baseV = Number(cfg.market.base_volume_mwh || 20000)
    const mix = cfg?.market?.generator_mix || groups || { pv: 250, wind: 200, hydro: 100, coal: 300, gas: 150 }
    const distArr = Object.entries(mix)
    // Interpret generator_mix values as non-negative block counts per group
    const totalBlocksSupply = distArr.reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0) || 1

    // Build block volumes by groups, then split into ~participants blocks
    const seedStr = cfg.environment?.seed || 'step'
    const seedNum = seedStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng = d3.randomLcg((seedNum % 2147483647) / 2147483647)

    // Jitter magnitudes
    const capJitter = Math.max(0, Math.min(0.5, Number(cfg?.market?.random_capacity_pct || 0) / 100))
    const priceJitter = Math.max(0, Math.min(0.5, Number(cfg?.market?.random_price_pct || 0) / 100))

    // Type-specific marginal cost ranges (ZAR/MWh)
    const COST = {
      pv: [0, 50],
      wind: [50, 150],
      hydro: [50, 200],
      nuclear: [200, 400],
      coal: [400, 700],
      gas: [700, 1200],
    }

    // Build SUPPLY blocks per type based on per-type block counts
    let sBlocks = []
    distArr.forEach(([type, pct]) => {
      const n = Math.max(0, Math.round(Number(pct || 0)))
      if (!n) return
      const vol = baseV * (Number(pct || 0) / totalBlocksSupply)
      const avg = vol / n
      const [pMin, pMax] = COST[type] || [baseP - 500, baseP + 500]
      for (let i = 0; i < n; i++) {
        const qJ = 1 + (rng() - 0.5) * 2 * capJitter
        const basePrice = pMin + rng() * (pMax - pMin)
        const pJ = 1 + (rng() - 0.5) * 2 * priceJitter
        sBlocks.push({ q: Math.max(0, avg * qJ), p: basePrice * pJ })
      }
    })
    // normalize volumes to baseV and clamp prices to floor/cap
    const sSum = sBlocks.reduce((s, b) => s + b.q, 0) || 1
    const floor = Number(cfg.market.price_floor ?? -Infinity)
    const cap = Number(cfg.market.price_cap ?? Infinity)
    sBlocks.forEach(b => { b.q = (b.q / sSum) * baseV; b.p = Math.min(cap, Math.max(floor, b.p)) })

    // Sort supply ascending by price
    const supply = sBlocks.sort((a, b) => a.p - b.p)

    // Build DEMAND blocks by consumer mix with non-linear decreasing schedule and jitter
    const cmix = (cfg?.market?.consumer_mix) || { industrial: 400, household: 500, agriculture: 100 }
    const cArr = Object.entries(cmix)
    // Interpret consumer_mix values as non-negative block counts per group
    const totalBlocksDemand = cArr.reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0) || 1
    let dBlocks = []
    cArr.forEach(([ctype, pct]) => {
      const n = Math.max(0, Math.round(Number(pct || 0)))
      if (!n) return
      const vol = baseV * (Number(pct || 0) / totalBlocksDemand)
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0
        // WTP base by segment, then apply non-linear shape and jitter
        let wtpBase = baseP + 400 - 800 * Math.pow(t, 2)
        if (ctype === 'industrial') wtpBase += 100
        if (ctype === 'agriculture') wtpBase -= 100
        const p = Math.min(cap, Math.max(floor, wtpBase * (1 + (rng() - 0.5) * 2 * priceJitter * 0.5)))
        const q = Math.max(0, (vol / n) * (1 + (rng() - 0.5) * 2 * capJitter))
        dBlocks.push({ q, p })
      }
    })
    // normalize demand volume to baseV and sort descending by price
    const dSum = dBlocks.reduce((s, b) => s + b.q, 0) || 1
    dBlocks.forEach(b => { b.q = (b.q / dSum) * baseV })
    const demand = dBlocks.sort((a, b) => b.p - a.p)

    // Build cumulative x (quantity) for step plot (price vs quantity)
    const cum = (arr) => {
      let acc = 0
      return arr.map(({ q, p }) => ({ x0: acc, x1: (acc += q), p }))
    }
    const sCum = cum(supply)
    const dCum = cum(demand)
    const xMax = Math.max(d3.sum(supply, (d) => d.q), d3.sum(demand, (d) => d.q)) || baseV

    const x = d3.scaleLinear().domain([0, xMax]).range([0, W]).clamp(true)
    // dynamic Y domain: scale to min/max of actual prices (with small padding)
    const allPrices = [...supply.map(d=>d.p), ...demand.map(d=>d.p)]
    const minP = d3.min(allPrices)
    const maxP = d3.max(allPrices)
    const pad = (maxP - minP) * 0.05
    const y = d3.scaleLinear().domain([minP - pad, maxP + pad]).nice().range([H, 0]).clamp(true)

    // axes
    g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(5))
    g.append('g').call(d3.axisLeft(y).ticks(5))
    g.append('text').attr('x', W / 2).attr('y', H + 24).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 10).text('Quantity (MWh)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', -36).attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 10).text('Price (ZAR/MWh)')

    // step paths
    const toStep = (arr) => {
      const pts = []
      arr.forEach(({ x0, x1, p }, i) => {
        // horizontal segment from x0 to x1 at price p, then vertical to next price
        pts.push([x(x0), y(p)])
        pts.push([x(x1), y(p)])
      })
      return pts
    }
    const sPts = toStep(sCum)
    const dPts = toStep(dCum)

    if (showSupply) g.append('path').attr('d', d3.line()(sPts)).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2)
    if (showDemand) g.append('path').attr('d', d3.line()(dPts)).attr('fill', 'none').attr('stroke', '#c62828').attr('stroke-width', 2)

    // Compute MCP as intersection of supply and demand curves
    let mcpVal = Number(preview?.mcp)
    let mcpQty = null
    
    // Find intersection point by scanning through cumulative curves
    if (showMcp && sCum.length > 0 && dCum.length > 0) {
      // Convert to continuous functions for intersection search
      let sIdx = 0, dIdx = 0
      let qCur = 0
      let foundIntersection = false
      
      // Step through quantity range looking for where supply price >= demand price
      const step = xMax / 1000
      for (let q = 0; q < xMax && !foundIntersection; q += step) {
        // Find supply price at quantity q
        while (sIdx < sCum.length - 1 && sCum[sIdx].x1 < q) sIdx++
        const sPrice = sCum[sIdx]?.p || 0
        
        // Find demand price at quantity q
        while (dIdx < dCum.length - 1 && dCum[dIdx].x1 < q) dIdx++
        const dPrice = dCum[dIdx]?.p || 0
        
        // Intersection occurs when supply crosses above demand
        if (sPrice >= dPrice) {
          mcpVal = (sPrice + dPrice) / 2  // Average of the two prices at intersection
          mcpQty = q
          foundIntersection = true
        }
      }
    }
    
    if (showMcp && !Number.isNaN(mcpVal)) {
      const mcpY = y(mcpVal)
      const mcpX = mcpQty !== null ? x(mcpQty) : W
      
      // Draw horizontal MCP line
      g.append('line')
        .attr('x1', 0)
        .attr('x2', W)
        .attr('y1', mcpY)
        .attr('y2', mcpY)
        .attr('stroke', '#1976d2')
        .attr('stroke-dasharray', '4 4')
      
      // Draw vertical line at intersection point if found
      if (mcpQty !== null) {
        g.append('line')
          .attr('x1', mcpX)
          .attr('x2', mcpX)
          .attr('y1', 0)
          .attr('y2', H)
          .attr('stroke', '#1976d2')
          .attr('stroke-dasharray', '2 2')
          .attr('opacity', 0.5)
        
        // Highlight intersection point
        g.append('circle')
          .attr('cx', mcpX)
          .attr('cy', mcpY)
          .attr('r', 4)
          .attr('fill', '#1976d2')
      }
      
      g.append('text')
        .attr('x', W - 4)
        .attr('y', mcpY - 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#1976d2')
        .attr('font-size', 10)
        .text(`MCP ${mcpVal.toFixed(1)}`)
    }

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${M.left + 4},${M.top + 4})`)
    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 10).attr('height', 10).attr('fill', showSupply ? '#2e7d32' : '#ccc')
    legend.append('text').attr('x', 14).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('Supply')
    legend.append('rect').attr('x', 70).attr('y', 0).attr('width', 10).attr('height', 10).attr('fill', showDemand ? '#c62828' : '#ccc')
    legend.append('text').attr('x', 84).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('Demand')
    legend.append('line').attr('x1', 140).attr('x2', 150).attr('y1', 5).attr('y2', 5).attr('stroke', showMcp ? '#1976d2' : '#ccc').attr('stroke-dasharray', '4 4')
    legend.append('text').attr('x', 156).attr('y', 9).attr('font-size', 10).attr('fill', '#333').text('MCP')
  }, [cfg, preview, groups])

  return <svg ref={ref} width={360} height={180} style={{ border: '1px solid #ddd', cursor:'pointer' }} onClick={()=> ref.current && exportPNG(ref.current, 'kse_step.png')} />
}

export default function KSE(){
  const [sp] = useSearchParams()
  const user = useAuth((state) => state.user)
  const scenarioParam = sp.get('id')
  const [tab, setTab] = useState(0)
  const [name, setName] = useState('New Scenario')
  const [cfg, setCfg] = useState(defaultConfig)
  const [scenarioId, setScenarioId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [importText, setImportText] = useState('')
  const [hPrev, setHPrev] = useState(null)
  const [previewDate, setPreviewDate] = useState('2025-01-15') // Preview date for seasonal variation
  const [previewTime, setPreviewTime] = useState('00:00') // Preview start time
  const [showHourlyPoints, setShowHourlyPoints] = useState(false)
  const [showHourlyGrid, setShowHourlyGrid] = useState(false)
  // Compute hours from config instead of state
  const hours = Number(cfg?.general?.forecast_horizon_hours) || 24
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  // generator mix now stored in cfg.market.generator_mix
  const [zoneSplit, setZoneSplit] = useState(50)
  const [envGen, setEnvGen] = useState(null)
  const [deviceTypes, setDeviceTypes] = useState([])
  const [atcEditorOpen, setAtcEditorOpen] = useState(false)
  const [expandedDevice, setExpandedDevice] = useState(null)
  const [presetMenu, setPresetMenu] = useState(null)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [editingEventIndex, setEditingEventIndex] = useState(null)
  // Challenge editor
  const [challengeEditorOpen, setChallengeEditorOpen] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState(null)
  const [editingChallengeIndex, setEditingChallengeIndex] = useState(null)
  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // Profile Editor Modal
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileEditorType, setProfileEditorType] = useState('') // 'pv', 'wind', 'industrial', etc.
  const [profileEditorTitle, setProfileEditorTitle] = useState('')
  const [profileEditorCurrent, setProfileEditorCurrent] = useState(null)
  const [profileEditorPath, setProfileEditorPath] = useState([]) // path in config object
  // Modals (IO + Description)
  const [ioOpen, setIoOpen] = useState(false)
  const [ioTab, setIoTab] = useState(0)
  const [descOpen, setDescOpen] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descMode, setDescMode] = useState('edit') // 'edit' | 'preview'
  const [descImgWidth, setDescImgWidth] = useState('100%') // default width for pasted images
  const [descImgHeight, setDescImgHeight] = useState('') // optional height for pasted images
  // Step chart toggles + ref
  const [showSupply, setShowSupply] = useState(true)
  const [showDemand, setShowDemand] = useState(true)
  const [showMcp, setShowMcp] = useState(true)
  const stepRef = useRef(null)
  const descInputRef = useRef(null)
  // Refs for validation scroll
  const refZones = useRef(null)
  const refForecastH = useRef(null)
  const refHorizon = useRef(null)
  const refRoundSpan = useRef(null)
  const refRounds = useRef(null)
  const refWeights = useRef(null)
  const refDescName = useRef(null)
  const refHours = useRef(null)
  const refAddEvent = useRef(null)
  const refAddPlayerType = useRef(null)
  // Debounce/abort for previews
  const previewTimer = useRef(null)
  const hourlyTimer = useRef(null)
  const previewController = useRef(null)
  const hourlyController = useRef(null)

  useEffect(()=>{
    // Load device types on mount
    api.get('/api/kse/device-types').then(res=> setDeviceTypes(res.data)).catch(()=>{})
    // Load existing scenario if id is provided
    if (scenarioParam) {
      const id = Number(scenarioParam)
      if (id>0) {
        api.get(`/api/kse/scenarios/${id}`).then(({data})=>{
          setScenarioId(id)
          setName(data.name || `Scenario ${id}`)
          setCfg(data.config || defaultConfig)
        }).catch(()=>{})
      }
    }
  },[])

  // URL hash ↔ tab sync for deep-linking and back/forward
  useEffect(()=>{
    const map = ['#kse-desc','#kse-general','#kse-market','#kse-grid','#kse-events','#kse-ptypes','#kse-challenges']
    const applyHash = ()=>{
      const h = window.location.hash
      const idx = map.indexOf(h)
      if (idx >= 0) setTab(idx)
    }
    // on mount
    applyHash()
    // on hash change
    const onHash = ()=> applyHash()
    window.addEventListener('hashchange', onHash)
    return ()=> window.removeEventListener('hashchange', onHash)
  },[])

  useEffect(()=>{
    const map = ['#kse-desc','#kse-general','#kse-market','#kse-grid','#kse-events','#kse-ptypes','#kse-challenges']
    const h = map[tab]
    if (h) {
      try { window.history.replaceState(null, '', h) } catch(_) {}
    }
  }, [tab])

  const update = (path, value)=>{
    setCfg(prev=>{
      const next = structuredClone(prev)
      let node = next
      for(let i=0;i<path.length-1;i++){
        const key = path[i]
        if (node[key] == null || typeof node[key] !== 'object') node[key] = {}
        node = node[key]
      }
      node[path[path.length-1]] = value
      return next
    })
  }

  const openProfileEditor = (type, title, currentHourlyProfile, currentSeasonalProfile, savePath) => {
    setProfileEditorType(type)
    setProfileEditorTitle(title)
    setProfileEditorCurrent({ hourly: currentHourlyProfile, seasonal: currentSeasonalProfile })
    setProfileEditorPath(savePath)
    setProfileEditorOpen(true)
  }

  const handleProfileSave = (profiles) => {
    // Save both hourly and seasonal profiles to generator_mix or consumer_mix
    const current = profileEditorPath.reduce((obj, key) => obj?.[key], cfg)
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      // Already an object with blocks/profile/seasonal_profile
      update(profileEditorPath, { 
        ...current, 
        profile: profiles.hourly,
        seasonal_profile: profiles.seasonal 
      })
    } else {
      // Convert from number to object
      update(profileEditorPath, { 
        blocks: current || 0, 
        profile: profiles.hourly,
        seasonal_profile: profiles.seasonal
      })
    }
    setProfileEditorOpen(false)
  }

  const getGeneratorMixValue = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.blocks || 0
    return val || 0
  }

  const getGeneratorMixProfile = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.profile
    return null
  }

  const getGeneratorMixSeasonalProfile = (type) => {
    const val = cfg.market.generator_mix?.[type]
    if (typeof val === 'object') return val.seasonal_profile
    return null
  }

  const setGeneratorMixBlocks = (type, blocks) => {
    const current = cfg.market.generator_mix?.[type]
    if (typeof current === 'object') {
      update(['market', 'generator_mix', type], { ...current, blocks })
    } else {
      update(['market', 'generator_mix', type], blocks)
    }
  }

  const getConsumerMixValue = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.blocks || 0
    return val || 0
  }

  const getConsumerMixProfile = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.profile
    return null
  }

  const getConsumerMixSeasonalProfile = (type) => {
    const val = cfg.market.consumer_mix?.[type]
    if (typeof val === 'object') return val.seasonal_profile
    return null
  }

  const setConsumerMixBlocks = (type, blocks) => {
    const current = cfg.market.consumer_mix?.[type]
    if (typeof current === 'object') {
      update(['market', 'consumer_mix', type], { ...current, blocks })
    } else {
      update(['market', 'consumer_mix', type], blocks)
    }
  }

  const validate = ()=>{
    const errs = []
    const zones = cfg.grid.zones
    if(zones<1 || zones>5) errs.push('Zones must be 1–5')
    if(!cfg.general.forecast_horizon_hours || cfg.general.forecast_horizon_hours<=0) errs.push('forecast_horizon_hours must be > 0')
    if(cfg.general.forecast_horizon_hours && cfg.general.horizon_hours && Number(cfg.general.forecast_horizon_hours) < Number(cfg.general.horizon_hours)) errs.push('forecast_horizon_hours must be >= horizon_hours')
    // Removed scoring.weights validation (replaced by challenges)
    const h = cfg.general.horizon_hours, sp = cfg.general.round_span_hours, r = cfg.general.rounds
    if(sp<=0 || Math.floor(h/sp)!==r) errs.push('horizon ÷ round_span must equal rounds')
    setErrors(errs)
    return errs.length===0
  }

  useEffect(()=>{ validate() },[cfg])
  
  // Fetch templates when dialog opens
  useEffect(()=>{
    if (templateDialogOpen) {
      api.get('/api/kse/templates')
        .then(({data})=> setTemplates(Array.isArray(data)? data : []))
        .catch(()=> setTemplates([]))
    }
  }, [templateDialogOpen])

  const doPreviewNow = async ()=>{
    if(!validate()) return
    try{
      if (previewController.current) previewController.current.abort()
      const controller = new AbortController()
      previewController.current = controller
      const { data } = await api.post('/api/engine/preview', { 
        config: cfg, 
        round: 1,
        preview_date: previewDate,
        preview_time: previewTime
      }, { signal: controller.signal })
      setPreview(data)
    }catch(err){ /* aborted or failed */ }
  }
  const doPreview = ()=>{
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(doPreviewNow, 300)
  }

  const save = async ()=>{
    if(!validate()) return
    // ensure schema version on save
    if (!cfg.version) {
      setCfg(prev => ({ ...prev, version: '1.0.0' }))
    }
    // ensure horizon stays consistent on save
    try {
      setCfg(prev => {
        const n = structuredClone(prev)
        const r = Number(n?.general?.rounds || 0)
        const sp = Number(n?.general?.round_span_hours || 0)
        if (r > 0 && sp > 0) n.general.horizon_hours = r * sp
        return n
      })
    } catch(_) {}
    // Normalize player type IDs (required by backend)
    const norm = structuredClone(cfg)
    // Convert frontend device shape -> backend schema
    try{
      if (Array.isArray(norm.devices)){
        norm.devices = norm.devices.map(d => {
          const t = (d.type||'').toLowerCase()
          const out = { ...d, type: t }
          if ([ 'coal','gas','hydro','nuclear' ].includes(t)){
            out.max_power_mw = out.max_power_mw ?? out.capacity_mw ?? 0
            out.variable_cost_zar_per_mwh = out.variable_cost_zar_per_mwh ?? out.cost_per_mwh_zar ?? 0
            if (out.min_load_pct == null) out.min_load_pct = 0
            if (out.ramp_rate_mw_per_min == null) out.ramp_rate_mw_per_min = 60
          } else if ([ 'solar','wind' ].includes(t)){
            out.max_power_mw = out.max_power_mw ?? out.capacity_mw ?? 0
            out.variable_cost_zar_per_mwh = out.variable_cost_zar_per_mwh ?? out.cost_per_mwh_zar ?? 0
            if (out.capacity_factor_pct == null) out.capacity_factor_pct = 30
          } else if (t === 'battery'){
            out.capacity_mwh = out.capacity_mwh ?? out.capacity_mw ?? 100
            out.power_mw = out.power_mw ?? out.power_rating_mw ?? 50
            out.efficiency_pct = out.efficiency_pct ?? 85
            out.initial_soc_pct = out.initial_soc_pct ?? 50
          } else if (t.endsWith('_load')){
            // baseline_load_mw / peak_load_mw already present from UI
          }
          return out
        })
      }
    }catch(_){ /* ignore */ }
    try{
      const seen = new Set()
      if (Array.isArray(norm.player_types)){
        norm.player_types = norm.player_types.map((pt)=>{
          let id = (pt.id||'').trim()
          if(!id){
            id = `ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`
          }
          // ensure unique
          while(seen.has(id)){
            id = `ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`
          }
          seen.add(id)
          return { ...pt, id }
        })
      }
    }catch(_){ /* ignore */ }
    if (scenarioId) {
      await api.put(`/api/kse/scenarios/${scenarioId}`, { name, config: norm })
      alert('Saved changes')
    } else {
      const { data } = await api.post('/api/kse/scenarios', { name, config: norm })
      setScenarioId(data?.id)
      alert(`Saved as #${data?.id || ''}`)
    }
  }

  const drawHourly = (data)=>{
    const h = data?.hours || 0
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
    // MCP
    if(mcpRef.current && data?.mcp){
      const svg = d3.select(mcpRef.current); svg.selectAll('*').remove()
      const M = {top:10,right:10,bottom:24,left:40}, W=360-M.left-M.right, H=120-M.top-M.bottom
  const g = svg.attr('width', 360).attr('height', 120).append('g').attr('transform',`translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, h||1]).range([0,W])
      const y = d3.scaleLinear().domain([d3.min(data.mcp)||0, d3.max(data.mcp)||1]).nice().range([H,0])
      const line = d3.line().x((_,i)=> x(i+1)).y((d)=> y(d))
  // gridlines
  if (showHourlyGrid) {
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
  }
      g.append('path').datum(data.mcp).attr('fill','none').attr('stroke','#2e7d32').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      if (showHourlyPoints) {
        g.selectAll('circle.point')
          .data((data.mcp||[]).map((v,i)=> ({ x:i+1, y:v })))
          .enter()
          .append('circle')
          .attr('class','point')
          .attr('cx', d=> x(d.x))
          .attr('cy', d=> y(d.y))
          .attr('r', 2.5)
          .attr('fill', '#2e7d32')
          .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`h${d.x}: ${d.y} ZAR/MWh`) })
          .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
          .on('mouseleave', ()=> { tooltip.style('display','none') })
      }
  // axis labels
  g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Hour')
  g.append('text').attr('transform','rotate(-90)').attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('MCP (ZAR/MWh)')
    }
    // Volume
    if(volRef.current && data?.volume){
      const svg = d3.select(volRef.current); svg.selectAll('*').remove()
      const M = {top:10,right:10,bottom:24,left:40}, W=360-M.left-M.right, H=120-M.top-M.bottom
  const g = svg.attr('width', 360).attr('height', 120).append('g').attr('transform',`translate(${M.left},${M.top})`)
      const x = d3.scaleLinear().domain([1, h||1]).range([0,W])
      const y = d3.scaleLinear().domain([0, d3.max(data.volume)||1]).nice().range([H,0])
      const line = d3.line().x((_,i)=> x(i+1)).y((d)=> y(d))
  // gridlines
  if (showHourlyGrid) {
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
  }
      g.append('path').datum(data.volume).attr('fill','none').attr('stroke','#1976d2').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
      if (showHourlyPoints) {
        g.selectAll('circle.point')
          .data((data.volume||[]).map((v,i)=> ({ x:i+1, y:v })))
          .enter()
          .append('circle')
          .attr('class','point')
          .attr('cx', d=> x(d.x))
          .attr('cy', d=> y(d.y))
          .attr('r', 2.5)
          .attr('fill', '#1976d2')
          .on('mouseenter', (event, d)=> { tooltip.style('display','block').text(`h${d.x}: ${d.y} MWh`) })
          .on('mousemove', (event)=> { tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px') })
          .on('mouseleave', ()=> { tooltip.style('display','none') })
      }
  // axis labels
  g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Hour')
  g.append('text').attr('transform','rotate(-90)').attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
  }

  const doHourlyNow = async ()=>{
    if(!validate()) return
    try{
      if (hourlyController.current) hourlyController.current.abort()
      const controller = new AbortController()
      hourlyController.current = controller
      const { data } = await api.post('/api/engine/preview/hourly', { 
        config: cfg, 
        hours: hours,
        preview_date: previewDate,
        preview_time: previewTime
      }, { signal: controller.signal })
      setHPrev(data)
      drawHourly(data)
    }catch(err){ /* aborted or failed */ }
  }
  const doHourly = ()=>{
    if (hourlyTimer.current) clearTimeout(hourlyTimer.current)
    hourlyTimer.current = setTimeout(doHourlyNow, 300)
  }

  // Auto update previews when Market tab is active and relevant inputs change
  useEffect(()=>{
    if (tab===2) doPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cfg, previewDate, previewTime])

  useEffect(()=>{
    if (tab===2) doHourly()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cfg, previewDate, previewTime])

  const onValidationSelect = (_idx, text)=>{
    const map = [
      { match: 'Zones must be 1–5', el: refZones, tab: 3 },
      { match: 'forecast_horizon_hours must be > 0', el: refForecastH, tab: 1 },
      { match: 'forecast_horizon_hours must be >= horizon_hours', el: refForecastH, tab: 1 },
      // Removed scoring weights validation (replaced by challenges)
      { match: 'horizon ÷ round_span must equal rounds', el: refRoundSpan, tab: 1 },
    ]
    const m = map.find(m => text.includes(m.match))
    if (m) {
      setTab(m.tab)
      setTimeout(()=> m.el.current && m.el.current.scrollIntoView({ behavior:'smooth', block:'center' }), 50)
    }
  }

  // Focus management on tab change
  useEffect(()=>{
    const focusEl = (elRef)=> { try { elRef?.current && elRef.current.focus() } catch(_) {} }
    switch(tab){
      case 0: focusEl(refDescName); break
      case 1: focusEl(refHorizon); break
      case 2: focusEl(refHours); break
      case 3: focusEl(refZones); break
      case 4: focusEl(refAddEvent); break
      case 5: focusEl(refAddPlayerType); break
      // case 6: Challenges tab - no specific focus element
      default: break
    }
  }, [tab])

  const exportCurrentConfig = ()=>{
    const data = { name, config: cfg }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `scenario_${scenarioId || 'draft'}.json`; a.click(); URL.revokeObjectURL(url)
  }

  const doImport = async ()=>{
    try{
      const json = JSON.parse(importText)
      const incomingVersion = json?.config?.version || '0.0.0'
      const currentVersion = cfg?.version || '1.0.0'
      if (incomingVersion !== currentVersion) {
        const proceed = confirm(`Config version (${incomingVersion}) differs from current (${currentVersion}). Proceed?`)
        if (!proceed) return
      }
      const { data } = await api.post('/api/kse/scenarios/import', json)
      alert(`Imported as #${data.id}` )
      setScenarioId(data.id)
      setName(data.name || name)
      setCfg(data.config || cfg)
      setImportText('')
      setIoOpen(false)
    }catch(e){ alert('Invalid JSON') }
  }

  return (
    <Stack spacing={2}>
      {/* Header + Toolbar (right aligned) */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">KSE – Scenario Editor</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" onClick={()=> setIoOpen(true)}>Import/Export</Button>
          <Button variant="contained" onClick={save} disabled={errors.length>0}>Save</Button>
        </Stack>
      </Stack>
      <Paper sx={{ p:2 }}>
        <Tabs 
          value={tab} 
          onChange={(_,v)=>setTab(v)} 
          variant="scrollable"
          role="tablist"
          aria-label="KSE scenario editor sections"
        >
          <Tab id="kse-tab-0" aria-controls="kse-panel-0" label="Description" role="tab" aria-selected={tab===0} />
          <Tab id="kse-tab-1" aria-controls="kse-panel-1" label="General" role="tab" aria-selected={tab===1} />
          <Tab id="kse-tab-2" aria-controls="kse-panel-2" label="Market" role="tab" aria-selected={tab===2} />
          <Tab id="kse-tab-3" aria-controls="kse-panel-3" label="Grid" role="tab" aria-selected={tab===3} />
          <Tab id="kse-tab-4" aria-controls="kse-panel-4" label="Events" role="tab" aria-selected={tab===4} />
          <Tab id="kse-tab-5" aria-controls="kse-panel-5" label="Player Types" role="tab" aria-selected={tab===5} />
          <Tab id="kse-tab-6" aria-controls="kse-panel-6" label="Challenges" role="tab" aria-selected={tab===6} />
        </Tabs>
        <Stack direction="row" spacing={2} sx={{ mt:2 }}>
          <Box sx={{ flex: 1 }}>
          {tab===1 && (()=>{
            const rounds = Number(cfg.general.rounds || 0)
            const span = Number(cfg.general.round_span_hours || 0)
            const computedH = rounds > 0 && span > 0 ? rounds * span : 0
            const setRounds = (val)=>{
              setCfg(prev=>{
                const n = structuredClone(prev)
                n.general.rounds = val
                const sp = Number(n.general.round_span_hours || 0)
                n.general.horizon_hours = val>0 && sp>0 ? val*sp : 0
                return n
              })
            }
            const setSpan = (val)=>{
              setCfg(prev=>{
                const n = structuredClone(prev)
                n.general.round_span_hours = val
                const r = Number(n.general.rounds || 0)
                n.general.horizon_hours = r>0 && val>0 ? r*val : 0
                return n
              })
            }
            const fhErr = !(cfg.general.forecast_horizon_hours>0) || (Number(cfg.general.forecast_horizon_hours) < computedH)
            return (
              <Stack id="kse-panel-1" role="tabpanel" aria-labelledby="kse-tab-1" spacing={2}>
                {/* Round Timings group */}
                <Paper sx={{ p:2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Round Timings</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Set the fictional date/time and the number/length of rounds. Scenario Horizon is computed as Rounds × Round span.
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    <TextField
                    type="date"
                    label="Fictional Date"
                    value={cfg.general.fake_date || ''}
                    onChange={e=>update(['general','fake_date'], e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Contextual date for briefings and charts. Not used in simulation." arrow>
                            <IconButton size="small" tabIndex={-1} aria-label="help">
                              <VisibilityIcon fontSize="small"/>
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      )
                    }}
                  />
                    <TextField
                    type="time"
                    label="Start Time"
                    value={cfg.general.start_time || ''}
                    onChange={e=>update(['general','start_time'], e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Fictional clock time of hour 1; used for labels." arrow>
                            <IconButton size="small" tabIndex={-1} aria-label="help">
                              <VisibilityIcon fontSize="small"/>
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      )
                    }}
                  />
                  </Stack>
                  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                    <Box sx={{ flex: '1 1 220px', minWidth: 220 }}>
                      <NumberInput
                        label="Rounds"
                        value={cfg.general.rounds}
                        onChange={setRounds}
                        min={1}
                        max={48}
                        step={1}
                        tooltip="Total rounds in the scenario."
                        inputRef={refRounds}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="Round span (h)"
                        value={cfg.general.round_span_hours}
                        onChange={setSpan}
                        min={1}
                        max={24}
                        step={1}
                        unit="h"
                        tooltip="Simulated hours per round."
                        inputRef={refRoundSpan}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="Round duration (s)"
                        value={cfg.general.round_duration_seconds ?? 300}
                        onChange={(val)=>update(['general','round_duration_seconds'], val)}
                        min={30}
                        max={1800}
                        step={30}
                        unit="s"
                        tooltip="Real-world seconds per round (default: 300s = 5min)."
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 260px', minWidth: 260 }}>
                      <TextField
                        label="Scenario Horizon (h)"
                        value={computedH}
                        size="small"
                        disabled
                        fullWidth
                        InputLabelProps={{ shrink: true, sx: { whiteSpace: 'normal', lineHeight: 1.2 } }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">h</InputAdornment>
                          )
                        }}
                        inputRef={refHorizon}
                      />
                    </Box>
                  </Stack>
                </Paper>
                {/* Forecast horizon group */}
                <Paper sx={{ p:2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Forecast Horizon</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Player forecast inputs must cover at least the computed scenario horizon.
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Box sx={{ flex: '1 1 260px', minWidth: 260 }}>
                      <NumberInput
                        label="Forecast Horizon (h)"
                        value={cfg.general.forecast_horizon_hours}
                        onChange={(val)=>update(['general','forecast_horizon_hours'], val)}
                        min={1}
                        max={168}
                        step={1}
                        unit="h"
                        tooltip="Must be ≥ Scenario Horizon. Controls forecast inputs."
                        error={fhErr}
                        helperText={fhErr ? 'Must be ≥ Scenario Horizon' : ''}
                        inputRef={refForecastH}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="IDM Freeze (h)"
                        value={cfg.general.freeze_hours ?? 2}
                        onChange={(val)=>update(['general','freeze_hours'], val)}
                        min={0}
                        max={Number(cfg.general.round_span_hours||24)}
                        step={1}
                        unit="h"
                        tooltip="Intraday Market gate closure: Hours before delivery when IDM closes. Only affects Intraday trading window. Default: 2h."
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
                      <NumberInput
                        label="DA Gate Hour"
                        value={cfg.general.day_ahead_gate_hour ?? 12}
                        onChange={(val)=>update(['general','day_ahead_gate_hour'], val)}
                        min={0}
                        max={23}
                        step={1}
                        unit="h"
                        tooltip="Day-Ahead market gate closure hour (0-23). Default: 12 = 12:00. In real markets, DA trading closes around noon for next-day delivery."
                      />
                    </Box>
                  </Stack>
                </Paper>
                {/* Market Basics group */}
                <Paper sx={{ p:2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Market Basics</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Baseline price/volume levels and floor/cap limits for market simulation.
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Baseline price level (ZAR/MWh)" tooltip="Center price used for sample supply/demand curves and previews." showTitle={false} />
                      <NumberInput label="Base Price" value={cfg.market.base_price} onChange={(val)=>update(['market','base_price'], val)} min={0} max={10000} step={100} unit="ZAR/MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Baseline traded volume (MWh)" tooltip="Scales the preview supply/demand curves and initial market environment." showTitle={false} />
                      <NumberInput label="Base Volume" value={cfg.market.base_volume_mwh} onChange={(val)=>update(['market','base_volume_mwh'], val)} min={1000} max={100000} step={1000} unit="MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Minimum allowed market price" tooltip="Price floor in ZAR/MWh (e.g., -500)." showTitle={false} />
                      <NumberInput label="Floor" value={cfg.market.price_floor} onChange={(val)=>update(['market','price_floor'], val)} min={-1000} max={5000} step={100} unit="ZAR/MWh" />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                      <InfoLabel title="Maximum allowed market price" tooltip="Price cap in ZAR/MWh (e.g., +5000)." showTitle={false} />
                      <NumberInput label="Cap" value={cfg.market.price_cap} onChange={(val)=>update(['market','price_cap'], val)} min={1000} max={20000} step={500} unit="ZAR/MWh" />
                    </Stack>
                  </Stack>
                </Paper>
              </Stack>
            )
          })()}
          {tab===0 && (
            <Stack id="kse-panel-0" role="tabpanel" aria-labelledby="kse-tab-0" spacing={2}>
              <Stack spacing={0.5} sx={{ maxWidth: 520 }}>
                <TextField inputRef={refDescName} fullWidth label="Scenario Name" value={name} onChange={e=>setName(e.target.value)} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Description</Typography>
                <IconButton size="small" aria-label={descMode==='edit'?'Preview description':'Edit description'} onClick={()=> setDescMode(m=> m==='edit'?'preview':'edit')}>
                  {descMode==='edit' ? <VisibilityIcon fontSize="small"/> : <EditIcon fontSize="small"/>}
                </IconButton>
                <Button size="small" variant="outlined" onClick={()=> setTemplateDialogOpen(true)}>Load Template</Button>
                {descMode==='edit' && (
                  <>
                    <TextField
                      size="small"
                      label="Img width"
                      value={descImgWidth}
                      onChange={(e)=> setDescImgWidth(e.target.value)}
                      placeholder="e.g., 640px or 75%"
                      sx={{ width: 160 }}
                    />
                    <TextField
                      size="small"
                      label="Img height"
                      value={descImgHeight}
                      onChange={(e)=> setDescImgHeight(e.target.value)}
                      placeholder="optional, e.g., 400px"
                      sx={{ width: 170 }}
                    />
                    <Button size="small" onClick={()=>{
                      try{
                        const el = descInputRef.current
                        const cur = cfg?.general?.description || ''
                        const hasSel = el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd
                        const start = hasSel ? el.selectionStart : 0
                        const end = hasSel ? el.selectionEnd : cur.length
                        const before = cur.slice(0, start)
                        const target = cur.slice(start, end)
                        const after = cur.slice(end)
                        const cleaned = target
                          .replace(/\s*w:([0-9.]+(?:px|%|em|rem|vw|vh))/gi, '')
                          .replace(/\s*h:([0-9.]+(?:px|%|em|rem|vw|vh))/gi, '')
                        const next = before + cleaned + after
                        update(['general','description'], next)
                        setTimeout(()=>{
                          try{
                            if (el){
                              const pos = start + cleaned.length
                              el.setSelectionRange(pos, pos)
                            }
                          }catch(_){ }
                        },0)
                      }catch(_){ /* ignore */ }
                    }}>Reset size</Button>
                  </>
                )}
              </Stack>
              {descMode==='edit' ? (
                <TextField
                  label="Markdown"
                  value={cfg?.general?.description || ''}
                  onChange={(e)=> update(['general','description'], e.target.value)}
                  onPaste={async (e)=>{
                    try{
                      const items = e.clipboardData && e.clipboardData.items
                      if (!items) return
                      const images = []
                      for (let i=0;i<items.length;i++){
                        const it = items[i]
                        if (it.type && it.type.startsWith('image/')){
                          const file = it.getAsFile()
                          if (file) images.push(file)
                        }
                      }
                      if (images.length===0) return
                      e.preventDefault()
                      const el = descInputRef.current
                      const start = el?.selectionStart ?? (cfg?.general?.description || '').length
                      const end = el?.selectionEnd ?? start
                      let insertText = ''
                      for (const file of images){
                        const fd = new FormData()
                        fd.append('file', file)
                        // optional default downscale
                        fd.append('max_width', '1600')
                        const res = await api.post('/api/kse/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                        const url = res?.data?.url
                        if (url){
                          const hints = [`w:${descImgWidth}`].concat(descImgHeight ? [`h:${descImgHeight}`] : [])
                          insertText += (insertText? '\n' : '') + `![${hints.join(' ')}](${url})\n`
                        }
                      }
                      const cur = cfg?.general?.description || ''
                      const next = cur.slice(0, start) + insertText + cur.slice(end)
                      update(['general','description'], next)
                      setTimeout(()=>{
                        try{ el && el.setSelectionRange(start + insertText.length, start + insertText.length) }catch(_){ }
                      }, 0)
                    }catch(_){ /* ignore */ }
                  }}
                  multiline minRows={12}
                  fullWidth
                  inputRef={descInputRef}
                />
              ) : (
                <Paper variant="outlined" sx={{ p:2, '& h1,h2,h3':{ mt:1 }, '& p':{ mb:1 }, '& img': { maxWidth: '100%', height: 'auto' } }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
                  <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
                    <ReactMarkdown components={{
                      img: ({node, ...props}) => {
                        const alt = props.alt || ''
                        const mw = alt && alt.match(/w:([0-9.]+(?:px|%|em|rem|vw|vh))/i)
                        const mh = alt && alt.match(/h:([0-9.]+(?:px|%|em|rem|vw|vh))/i)
                        const style = { maxWidth: '100%', height: 'auto' }
                        if (mw) style.width = mw[1]
                        if (mh) style.height = mh[1]
                        const cleanAlt = alt
                          .replace(/\s*w:([0-9.]+(?:px|%|em|rem|vw|vh))\s*/i, ' ')
                          .replace(/\s*h:([0-9.]+(?:px|%|em|rem|vw|vh))\s*/i, ' ')
                          .trim()
                        return <img {...props} alt={cleanAlt} style={style} />
                      }
                    }}>
                      {cfg?.general?.description || '*No content*'}
                    </ReactMarkdown>
                  </Box>
                </Paper>
              )}
              {descMode==='edit' && (
                <Typography variant="caption" color="text.secondary">Tip: Paste images to upload; width/height hints like <code>![w:640px h:400px](...)</code> or <code>![w:75%](...)</code> are added. Leave height empty to keep aspect ratio.</Typography>
              )}
            </Stack>
          )}
          {tab===2 && (
            <Stack id="kse-panel-2" role="tabpanel" aria-labelledby="kse-tab-2" direction="row" spacing={2}>
              {/* Left: Parameters */}
              <Stack spacing={2} sx={{ minWidth: 320, flex: 1 }}>
                <Typography variant="subtitle2">Generator Mix</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="PV blocks" tooltip="Number of PV supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="PV (#)" value={getGeneratorMixValue('pv')} onChange={(val)=>setGeneratorMixBlocks('pv', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('solar', 'PV Profile', getGeneratorMixProfile('pv'), getGeneratorMixSeasonalProfile('pv'), ['market','generator_mix','pv'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Wind blocks" tooltip="Number of wind supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Wind (#)" value={getGeneratorMixValue('wind')} onChange={(val)=>setGeneratorMixBlocks('wind', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('wind', 'Wind Profile', getGeneratorMixProfile('wind'), getGeneratorMixSeasonalProfile('wind'), ['market','generator_mix','wind'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Hydro blocks" tooltip="Number of hydro supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Hydro (#)" value={getGeneratorMixValue('hydro')} onChange={(val)=>setGeneratorMixBlocks('hydro', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('hydro', 'Hydro Profile', getGeneratorMixProfile('hydro'), getGeneratorMixSeasonalProfile('hydro'), ['market','generator_mix','hydro'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Coal blocks" tooltip="Number of coal supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Coal (#)" value={getGeneratorMixValue('coal')} onChange={(val)=>setGeneratorMixBlocks('coal', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('baseload', 'Coal Profile', getGeneratorMixProfile('coal'), getGeneratorMixSeasonalProfile('coal'), ['market','generator_mix','coal'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Gas blocks" tooltip="Number of gas supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Gas (#)" value={getGeneratorMixValue('gas')} onChange={(val)=>setGeneratorMixBlocks('gas', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('peaking', 'Gas Profile', getGeneratorMixProfile('gas'), getGeneratorMixSeasonalProfile('gas'), ['market','generator_mix','gas'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Nuclear blocks" tooltip="Number of nuclear supply blocks in preview mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Nuclear (#)" value={getGeneratorMixValue('nuclear')} onChange={(val)=>setGeneratorMixBlocks('nuclear', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('baseload', 'Nuclear Profile', getGeneratorMixProfile('nuclear'), getGeneratorMixSeasonalProfile('nuclear'), ['market','generator_mix','nuclear'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                </Stack>
                {(() => {
                  const gm = cfg.market.generator_mix||{}
                  const sum = ['pv','wind','hydro','coal','gas','nuclear'].reduce((s,k)=> s + getGeneratorMixValue(k), 0)
                  return <Typography variant="caption" color={sum>0? 'text.secondary':'warning.main'}>Total generator blocks: {sum} (normalized in preview)</Typography>
                })()}

                <Typography variant="subtitle2">Consumer Mix</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Industrial blocks" tooltip="Number of industrial consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Industrial (#)" value={getConsumerMixValue('industrial')} onChange={(val)=>setConsumerMixBlocks('industrial', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('industrial', 'Industrial Load Profile', getConsumerMixProfile('industrial'), getConsumerMixSeasonalProfile('industrial'), ['market','consumer_mix','industrial'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Household blocks" tooltip="Number of household consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Household (#)" value={getConsumerMixValue('household')} onChange={(val)=>setConsumerMixBlocks('household', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('residential', 'Household Load Profile', getConsumerMixProfile('household'), getConsumerMixSeasonalProfile('household'), ['market','consumer_mix','household'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                    <InfoLabel title="Agriculture blocks" tooltip="Number of agriculture consumer blocks in preview demand mix (0–1000)." showTitle={false} />
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <NumberInput label="Agriculture (#)" value={getConsumerMixValue('agriculture')} onChange={(val)=>setConsumerMixBlocks('agriculture', Number(val)||0)} min={0} max={1000} step={1} />
                      <Button size="small" variant="text" onClick={()=> openProfileEditor('industrial', 'Agriculture Load Profile', getConsumerMixProfile('agriculture'), getConsumerMixSeasonalProfile('agriculture'), ['market','consumer_mix','agriculture'])} sx={{ minWidth: 40 }}>Edit</Button>
                    </Stack>
                  </Stack>
                </Stack>
                {(() => {
                  const cm = cfg.market.consumer_mix||{}
                  const sum = ['industrial','household','agriculture'].reduce((s,k)=> s + getConsumerMixValue(k), 0)
                  return <Typography variant="caption" color={sum>0? 'text.secondary':'warning.main'}>Total consumer blocks: {sum} (normalized in preview)</Typography>
                })()}

                <Typography variant="subtitle2">Randomness</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Capacity jitter (%)" tooltip="Random variation of individual block quantities. 0–50%." showTitle={false} />
                    <NumberInput label="Capacity Jitter" value={cfg.market.random_capacity_pct} onChange={(val)=>update(['market','random_capacity_pct'], Number(val)||0)} min={0} max={50} step={1} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Price jitter (%)" tooltip="Random variation of marginal costs and demand price steps. 0–50%." showTitle={false} />
                    <NumberInput label="Price Jitter" value={cfg.market.random_price_pct} onChange={(val)=>update(['market','random_price_pct'], Number(val)||0)} min={0} max={50} step={1} unit="%" />
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Actual vs Forecast noise (%)" tooltip="Std. deviation of actual dispatch around dispatched plan used in sessions. Affects Actual vs Forecast (default 5%)." showTitle={false} />
                    <NumberInput label="Actual Noise" value={cfg.environment.actual_noise_pct ?? 5} onChange={(val)=>update(['environment','actual_noise_pct'], Number(val)||0)} min={0} max={100} step={1} unit="%" />
                  </Stack>
                </Stack>

                <Typography variant="subtitle2">Environment</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack spacing={0.5} sx={{ minWidth: 260 }}>
                    <InfoLabel title="Preview seed" tooltip="Used only for KSE previews. Simulation uses campaign.seed." showTitle={false} />
                    <TextField label="Preview Seed" value={cfg.environment.seed} onChange={e=>update(['environment','seed'], e.target.value)}/>
                  </Stack>
                </Stack>
              </Stack>
              {/* Right: Sticky Preview */}
              <Box sx={{ width: 380 }}>
                {/* Auto-updating MCP/Volume preview above chart */}
                {preview && <Typography sx={{ mb:1 }}>MCP: {preview.mcp} | Volume: {preview.volume}</Typography>}
                <Curves cfg={cfg} preview={preview} groups={cfg.market?.generator_mix} showSupply={showSupply} showDemand={showDemand} showMcp={showMcp} svgRef={stepRef} />
                <Stack spacing={1} sx={{ mt:1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControlLabel control={<Switch size="small" checked={showSupply} onChange={(_,v)=> setShowSupply(v)} />} label="Supply" />
                    <FormControlLabel control={<Switch size="small" checked={showDemand} onChange={(_,v)=> setShowDemand(v)} />} label="Demand" />
                    <FormControlLabel control={<Switch size="small" checked={showMcp} onChange={(_,v)=> setShowMcp(v)} />} label="MCP" />
                  </Stack>
                  <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly MCP</Typography>
                  <svg ref={mcpRef} width={360} height={120} style={{ border:'1px solid #eee', cursor:'pointer' }} onClick={()=> mcpRef.current && exportPNG(mcpRef.current, 'kse_hourly_mcp.png')} />
                  <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly Volume</Typography>
                  <svg ref={volRef} width={360} height={120} style={{ border:'1px solid #eee', cursor:'pointer' }} onClick={()=> volRef.current && exportPNG(volRef.current, 'kse_hourly_volume.png')} />
                  {/* Points/Grid switches moved below hourly charts */}
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControlLabel control={<Switch size="small" checked={showHourlyPoints} onChange={(_,v)=> setShowHourlyPoints(v)} />} label="Points" />
                    <FormControlLabel control={<Switch size="small" checked={showHourlyGrid} onChange={(_,v)=> setShowHourlyGrid(v)} />} label="Grid" />
                  </Stack>
                  {/* Date/Time controls for preview */}
                  <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mt:1 }}>
                    <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                      <InfoLabel title="Preview Date" tooltip="Start date for preview (affects seasonal profiles)" showTitle={false} />
                      <TextField type="date" size="small" label="Preview Date" value={previewDate} onChange={e=>setPreviewDate(e.target.value)} sx={{ width: 160 }} />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                      <InfoLabel title="Preview Time" tooltip="Start time for preview (affects hourly profiles)" showTitle={false} />
                      <TextField type="time" size="small" label="Preview Time" value={previewTime} onChange={e=>setPreviewTime(e.target.value)} sx={{ width: 140 }} />
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          )}
          {tab===3 && (
            <Stack id="kse-panel-3" role="tabpanel" aria-labelledby="kse-tab-3" spacing={2}>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    inputRef={refZones}
                    label="Zones"
                    value={cfg.grid.zones}
                    onChange={z => {
                      const atc = Array.from({length:z}, (_,i)=> Array.from({length:z}, (_,j)=> i===j?0: (cfg.grid.atc?.[i]?.[j] ?? 0)))
                      setCfg(prev=> ({...prev, grid: { ...prev.grid, zones: z, atc }}))
                    }}
                    min={1}
                    max={5}
                    step={1}
                    error={cfg.grid.zones<1 || cfg.grid.zones>5}
                    helperText={(cfg.grid.zones<1 || cfg.grid.zones>5) ? 'Supported range: 1–5' : ''}
                    tooltip="Supported range: 1–5. Changing this rebuilds the symmetric ATC matrix; diagonal stays 0 MW."
                  />
                </Box>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    label="Player Zone (1..zones)"
                    value={cfg.general.player_zone||1}
                    onChange={val=>update(['general','player_zone'], val)}
                    min={1}
                    max={cfg.grid.zones||1}
                    step={1}
                    tooltip="Default zone used for player-facing context and inputs."
                  />
                </Box>
                <Box sx={{ minWidth: 220 }}>
                  <NumberInput
                    label="Transmission Loss (%)"
                    value={cfg.grid.transmission_loss_pct ?? 2}
                    onChange={val=>update(['grid','transmission_loss_pct'], val)}
                    min={0}
                    max={20}
                    step={0.5}
                    unit="%"
                    tooltip="Percentage of energy lost during inter-zone transmission (default 2%)."
                  />
                </Box>
              </Stack>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">ATC Matrix (MW)</Typography>
                  <Tooltip title="Symmetric off-diagonals; diagonal is 0 MW. Limits power flow per direction between zones. Engine applies transmission losses and enforces ATC when clearing with congestion." arrow>
                    <Box
                      component="span"
                      sx={{
                        width: 16,
                        height: 16,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        bgcolor: 'action.hover',
                        color: 'text.secondary',
                        fontSize: 12,
                        cursor: 'help',
                        userSelect: 'none',
                      }}
                      aria-label="More info"
                    >
                      i
                    </Box>
                  </Tooltip>
                </Stack>

                {/* Inline editable ATC matrix */}
                <Box sx={{ overflowX: 'auto' }}>
                  {(() => {
                    const z = Number(cfg.grid.zones || 0)
                    if (!z || z < 1) return null
                    const atc = cfg.grid.atc || []
                    const updateCell = (i, j, val) => {
                      const v = Number(val) || 0
                      setCfg(prev => {
                        const n = structuredClone(prev)
                        if (!n.grid.atc) n.grid.atc = []
                        for (let r = 0; r < z; r++) {
                          if (!Array.isArray(n.grid.atc[r])) n.grid.atc[r] = Array.from({ length: z }, (_, c) => (r === c ? 0 : 0))
                        }
                        if (i !== j) {
                          n.grid.atc[i][j] = v
                          n.grid.atc[j][i] = v // enforce symmetry
                        }
                        return n
                      })
                    }
                    return (
                      <table style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 80 }} />
                            {Array.from({ length: z }, (_, j) => (
                              <th key={j} style={{ border: '1px solid #ddd', padding: 4, textAlign: 'center' }}>Z{j+1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: z }, (_, i) => (
                            <tr key={i}>
                              <th style={{ padding: 4, textAlign: 'left' }}>Z{i+1}</th>
                              {Array.from({ length: z }, (_, j) => (
                                <td key={j} style={{ border: '1px solid #eee', padding: 4 }}>
                                  {i === j ? (
                                    <TextField size="small" type="number" value={0} disabled sx={{ width: 100 }} />
                                  ) : (
                                    <TextField
                                      size="small"
                                      type="number"
                                      sx={{ width: 100 }}
                                      value={Number(atc?.[i]?.[j] ?? 0)}
                                      onChange={(e) => updateCell(i, j, e.target.value)}
                                    />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </Box>
              </Box>
            </Stack>
          )}
          {/* Environment tab removed (merged) */}
          {tab===4 && (
            <Stack id="kse-panel-4" role="tabpanel" aria-labelledby="kse-tab-4" spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack spacing={0.5}>
                  <InfoLabel
                    title="Scenario events and their impact"
                    tooltip="Define systemic or player-specific impacts. Events trigger at specific rounds or probabilistically and can modify prices, capacities, or other parameters."
                  />
                  <Typography variant="subtitle2">Events</Typography>
                </Stack>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEditingEvent(null)
                    setEditingEventIndex(null)
                    setEventEditorOpen(true)
                  }}
                  ref={refAddEvent}
                >
                  Add Event
                </Button>
              </Stack>

              <EventsList
                events={cfg.events || []}
                onEdit={(event, index) => {
                  setEditingEvent(event)
                  setEditingEventIndex(index)
                  setEventEditorOpen(true)
                }}
                onDelete={(index) => {
                  setCfg((prev) => {
                    const n = structuredClone(prev)
                    n.events.splice(index, 1)
                    return n
                  })
                }}
                onDuplicate={(index) => {
                  setCfg((prev) => {
                    const n = structuredClone(prev)
                    const duplicated = structuredClone(n.events[index])
                    duplicated.name = (duplicated.name || `Event ${index + 1}`) + ' (Copy)'
                    n.events.splice(index + 1, 0, duplicated)
                    return n
                  })
                }}
              />
            </Stack>
          )}
          {tab===5 && (
            <Stack id="kse-panel-5" role="tabpanel" aria-labelledby="kse-tab-5" spacing={2}>
              <Stack spacing={0.5}>
                <InfoLabel
                  title="Player Types for this scenario"
                  tooltip="Define scenario-specific player archetypes. Each type references devices defined in this scenario and constrains player inputs."
                />
                <Typography variant="subtitle2">Player Types</Typography>
              </Stack>
              <Paper sx={{ p: 2 }}>
                <Stack spacing={1}>
                  {user?.role === 'admin' && (
                    <>
                      <FormControlLabel
                        control={<Switch checked={Boolean(cfg.market.enable_player_bidding)} onChange={(e)=>update(['market','enable_player_bidding'], e.target.checked)} />}
                        label={
                          <InfoLabel 
                            title="Enable Multi-Bid Pricing" 
                            tooltip="Allow players to submit 3 price bids (A/B/C) per device with 24h quantity profiles. The engine merges player bids into the merit order and tracks dispatch per bid. Default: true (enabled)."
                          />
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        When enabled, players can submit multiple price-quantity bid pairs for each device, enabling strategic bidding behavior.
                      </Typography>
                    </>
                  )}
                </Stack>
              </Paper>
              {(cfg.player_types||[]).map((pt, idx)=> (
                <Paper key={idx} sx={{ p:1.5, border:'1px solid #ddd' }}>
                  <Grid container spacing={2}>
                    {/* Left Column: Player Type Fields */}
                    <Grid item xs={12} md={4}>
                      <Stack spacing={2}>
                        <TextField 
                          size="small" 
                          fullWidth 
                          label="Name" 
                          value={pt.name||''} 
                          onChange={e=>{
                            const v = e.target.value
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].name = v; return n })
                          }}
                        />
                        <TextField 
                          size="small" 
                          fullWidth 
                          label="Description" 
                          value={pt.description||''} 
                          onChange={e=>{
                            const v = e.target.value
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].description = v; return n })
                          }}
                          multiline
                          minRows={3}
                        />
                        <TextField 
                          size="small" 
                          fullWidth 
                          type="number" 
                          label="Zone (optional)" 
                          value={pt.zone||''} 
                          onChange={e=>{
                            const v = e.target.value === '' ? undefined : Number(e.target.value)
                            setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].zone = v; return n })
                          }}
                        />
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced</AccordionSummary>
                          <AccordionDetails>
                            <Stack spacing={2}>
                              <TextField 
                                size="small" 
                                fullWidth 
                                type="number" 
                                label="Capacity variability (%)" 
                                value={pt.capacity_variability_pct ?? 0} 
                                onChange={e=>{
                                  const v = e.target.value === '' ? undefined : Number(e.target.value)
                                  setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].capacity_variability_pct = v; return n })
                                }}
                              />
                              <TextField 
                                size="small" 
                                fullWidth 
                                type="number" 
                                label="Marginal cost variability (%)" 
                                value={pt.marginal_cost_variability_pct ?? 0} 
                                onChange={e=>{
                                  const v = e.target.value === '' ? undefined : Number(e.target.value)
                                  setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].marginal_cost_variability_pct = v; return n })
                                }}
                              />
                            </Stack>
                          </AccordionDetails>
                        </Accordion>
                        <Button 
                          size="small" 
                          color="error" 
                          onClick={()=> setCfg(prev=>{ const n = structuredClone(prev); n.player_types.splice(idx,1); return n })}
                        >
                          Remove Type
                        </Button>
                      </Stack>
                    </Grid>
                    
                    {/* Right Column: Devices */}
                    <Grid item xs={12} md={8}>
                      <Stack spacing={1}>
                      <InfoLabel title="Devices of this type" tooltip="Each device belongs exactly to one player type. Click expand to edit, or use presets to add quickly." />
                      {(() => {
                        const devMap = new Map((cfg.devices||[]).map(d=> [d.id, d]))
                        const ids = pt.devices || []
                        const myDevs = ids.map(id=> devMap.get(id)).filter(Boolean)
                        
                        return (
                          <Stack spacing={1.5}>
                            {myDevs.map((dev)=>{
                              const idxDev = (cfg.devices||[]).findIndex(d=> d.id===dev.id)
                              return (
                                <DeviceCard
                                  key={dev.id}
                                  device={dev}
                                  onChange={(updated) => {
                                    setCfg(prev=>{ 
                                      const n = structuredClone(prev)
                                      n.devices[idxDev] = updated
                                      return n 
                                    })
                                  }}
                                  onDelete={() => {
                                    setCfg(prev=>{ 
                                      const n = structuredClone(prev)
                                      n.devices.splice(idxDev,1)
                                      n.player_types[idx].devices = (n.player_types[idx].devices||[]).filter(x=> x!==dev.id)
                                      return n 
                                    })
                                  }}
                                  onDuplicate={() => {
                                    const newDev = duplicateDevice(dev)
                                    setCfg(prev=>{
                                      const n = structuredClone(prev)
                                      n.devices = [...(n.devices||[]), newDev]
                                      n.player_types[idx].devices = [...(n.player_types[idx].devices||[]), newDev.id]
                                      return n
                                    })
                                  }}
                                  expanded={expandedDevice === dev.id}
                                  onExpandToggle={() => setExpandedDevice(expandedDevice === dev.id ? null : dev.id)}
                                />
                              )
                            })}
                            
                            {/* Add Device with Preset Menu */}
                            <Box>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                startIcon={<AddIcon />}
                                onClick={(e) => setPresetMenu({ anchor: e.currentTarget, playerTypeIdx: idx })}
                              >
                                Add Device
                              </Button>
                              <Menu
                                open={Boolean(presetMenu) && presetMenu.playerTypeIdx === idx}
                                anchorEl={presetMenu?.anchor}
                                onClose={() => setPresetMenu(null)}
                              >
                                {Object.keys(DEVICE_PRESETS).map(presetName => (
                                  <MenuItem 
                                    key={presetName}
                                    onClick={() => {
                                      const newDev = createDeviceFromPreset(presetName)
                                      setCfg(prev=>{
                                        const n = structuredClone(prev)
                                        n.devices = [...(n.devices||[]), newDev]
                                        n.player_types[idx].devices = [...(n.player_types[idx].devices||[]), newDev.id]
                                        return n
                                      })
                                      setPresetMenu(null)
                                      setExpandedDevice(newDev.id)
                                    }}
                                  >
                                    {presetName.toUpperCase()}
                                  </MenuItem>
                                ))}
                              </Menu>
                            </Box>
                          </Stack>
                        )
                      })()}
                      </Stack>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
              <Button ref={refAddPlayerType} variant="outlined" onClick={()=> setCfg(prev=> { const n=structuredClone(prev); const id=`ptype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`; n.player_types = [...(n.player_types||[]), { id, name:'', devices:[] }]; return n })}>Add Player Type</Button>
            </Stack>
          )}
          {tab===6 && (
            <Stack id="kse-panel-6" role="tabpanel" aria-labelledby="kse-tab-6" spacing={2}>
              <ChallengesList
                challenges={cfg.challenges || []}
                onAdd={() => {
                  setEditingChallenge(null);
                  setEditingChallengeIndex(null);
                  setChallengeEditorOpen(true);
                }}
                onEdit={(index) => {
                  // Create a deep copy to ensure editability
                  const challengeCopy = JSON.parse(JSON.stringify(cfg.challenges[index]));
                  setEditingChallenge(challengeCopy);
                  setEditingChallengeIndex(index);
                  setChallengeEditorOpen(true);
                }}
                onDelete={(index) => {
                  setCfg(prev => ({
                    ...prev,
                    challenges: prev.challenges.filter((_, i) => i !== index)
                  }));
                }}
              />
            </Stack>
          )}
          {/* Preview tab removed (merged) */}
        </Box>
        <ValidationPanel errors={errors} onSelect={onValidationSelect} />
      </Stack>
      </Paper>
      {errors.length>0 && <Paper sx={{p:2}}>
        <Typography color="error">{errors.join(' · ')}</Typography>
      </Paper>}
  {/* Bottom actions removed: now in toolbar and modal */}

      {/* ATC Matrix Editor Modal */}
      <AtcEditor
        open={atcEditorOpen}
        onClose={() => setAtcEditorOpen(false)}
        zones={(cfg.grid?.zones && Array.from({ length: cfg.grid.zones }, (_, i) => ({ 
          id: i + 1, 
          name: `Zone ${i + 1}` 
        }))) || []}
        atcMatrix={cfg.grid?.atc || []}
        onSave={(newMatrix) => {
          setCfg(prev => ({
            ...prev,
            grid: {
              ...prev.grid,
              atc: newMatrix
            }
          }))
        }}
      />

      {/* Event Editor Drawer */}
      <EventEditor
        open={eventEditorOpen}
        onClose={() => {
          setEventEditorOpen(false)
          setEditingEvent(null)
          setEditingEventIndex(null)
        }}
        event={editingEvent}
        playerTypes={cfg.player_types || []}
        devices={cfg.devices || []}
        onSave={(eventData) => {
          setCfg((prev) => {
            const n = structuredClone(prev)
            if (!n.events) n.events = []
            
            if (editingEventIndex !== null) {
              // Editing existing event
              n.events[editingEventIndex] = eventData
            } else {
              // Creating new event
              n.events.push(eventData)
            }
            
            return n
          })
        }}
      />

      {/* Challenge Editor Modal */}
      <ChallengeEditor
        open={challengeEditorOpen}
        onClose={() => {
          setChallengeEditorOpen(false)
          setEditingChallenge(null)
          setEditingChallengeIndex(null)
        }}
        challenge={editingChallenge}
        onSave={(challengeData) => {
          setCfg((prev) => {
            const n = structuredClone(prev)
            if (!n.challenges) n.challenges = []
            
            if (editingChallengeIndex !== null) {
              // Editing existing challenge
              n.challenges[editingChallengeIndex] = challengeData
            } else {
              // Creating new challenge
              n.challenges.push(challengeData)
            }
            
            return n
          })
          setChallengeEditorOpen(false)
          setEditingChallenge(null)
          setEditingChallengeIndex(null)
        }}
      />

      {/* Import/Export Modal */}
      <Dialog open={ioOpen} onClose={()=> setIoOpen(false)} fullWidth maxWidth="md" aria-label="Scenario Import Export">
        <DialogTitle>Scenario Import / Export</DialogTitle>
        <DialogContent dividers>
          <Tabs value={ioTab} onChange={(_,v)=> setIoTab(v)}>
            <Tab label="Save/Export"/>
            <Tab label="Import"/>
          </Tabs>
          <Box sx={{ mt:2 }}>
            {ioTab===0 && (
              <Stack spacing={1}>
                <Typography variant="body2">Schema version: {cfg.version || '1.0.0'}</Typography>
                <Button variant="outlined" onClick={exportCurrentConfig}>Download JSON</Button>
              </Stack>
            )}
            {ioTab===1 && (
              <Stack spacing={1}>
                <Typography variant="body2">Paste scenario JSON below. Version will be checked and migration hints shown if needed.</Typography>
                <TextField fullWidth multiline minRows={8} value={importText} onChange={e=>setImportText(e.target.value)} placeholder='{"name":"...","config":{...}}' />
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setIoOpen(false)}>Close</Button>
          {ioTab===1 && <Button variant="contained" onClick={doImport}>Import</Button>}
        </DialogActions>
      </Dialog>

      {/* Description Modal (Markdown) */}
      <Dialog open={descOpen} onClose={()=> setDescOpen(false)} fullWidth maxWidth="md" aria-label="Scenario Description">
        <DialogTitle>Edit Scenario Description (Markdown)</DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs:'column', md:'row' }} spacing={2}>
            <TextField label="Markdown" multiline minRows={10} value={descDraft} onChange={e=> setDescDraft(e.target.value)} sx={{ flex: 1 }} />
            <Paper variant="outlined" sx={{ p:1, flex: 1, overflow:'auto', bgcolor:'background.default' }}>
              <Typography variant="subtitle2" sx={{ mb:1 }}>Preview</Typography>
              <Box sx={{ '& h1,h2,h3':{ mt:1 }, '& p':{ mb:1 } }}>
                <ReactMarkdown>{descDraft || '*No content*'}</ReactMarkdown>
              </Box>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setDescOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={()=> { update(['general','description'], descDraft); setDescOpen(false) }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Template Picker Dialog */}
      <Dialog open={templateDialogOpen} onClose={()=> setTemplateDialogOpen(false)} fullWidth maxWidth="sm" aria-label="Load Scenario Template">
        <DialogTitle>Load Template</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography variant="body2">Select a template to load. Current unsaved changes will be replaced.</Typography>
            <Select
              size="small"
              value={selectedTemplateId}
              onChange={(e)=> setSelectedTemplateId(e.target.value)}
              displayEmpty
            >
              <MenuItem value=""><em>Select template…</em></MenuItem>
              {templates.map(t=> (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
              ))}
            </Select>
            {(() => {
              const t = templates.find(x=> x.id === selectedTemplateId)
              return t ? (
                <Paper variant="outlined" sx={{ p:1 }}>
                  <Typography variant="subtitle2" sx={{ mb:0.5 }}>{t.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{t.description}</Typography>
                </Paper>
              ) : null
            })()}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setTemplateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedTemplateId}
            onClick={async ()=>{
              try{
                const { data } = await api.get(`/api/kse/templates/${selectedTemplateId}`)
                if (data?.name) setName(data.name)
                if (data?.config) setCfg(data.config)
                setTemplateDialogOpen(false)
              }catch(_){ alert('Failed to load template') }
            }}
          >
            Load
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sticky Action Bar */}
      <StickyActionBar
        onSave={save}
        onValidate={doPreview}
        onImportExport={()=> setIoOpen(true)}
        onEditDescription={()=> { setDescDraft(cfg?.general?.description || ''); setDescOpen(true) }}
        disabled={errors.length>0}
      />
      
      {/* Profile Editor Modal */}
      <ProfileEditorModal
        open={profileEditorOpen}
        onClose={()=> setProfileEditorOpen(false)}
        title={profileEditorTitle}
        hourlyProfile={profileEditorCurrent?.hourly}
        seasonalProfile={profileEditorCurrent?.seasonal}
        onSave={handleProfileSave}
        type={profileEditorType}
      />
      
      {/* Bottom padding to prevent content being hidden by sticky bar */}
      <Box sx={{ height: 80 }} />
    </Stack>
  )
}