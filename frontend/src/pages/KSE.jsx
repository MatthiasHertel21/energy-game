import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Tab, Box, Stack, TextField, Button, Paper, Typography, Select, MenuItem } from '@mui/material'
import InfoLabel from '../components/InfoLabel'
import api from '../services/api'
import * as d3 from 'd3'

const defaultConfig = {
  general: { horizon_hours: 24, forecast_horizon_hours: 48, round_span_hours: 6, rounds: 4 },
  market: { base_price: 1000, base_volume_mwh: 20000, price_floor: -500, price_cap: 5000 },
  grid: { zones: 2, atc: [[0,5000],[5000,0]] },
  environment: { seed: 'preview' },
  events: [],
  devices: [],
  scoring: { weights: { profit: 0.6, imbalance: 0.3, curtailment: 0.1 } },
}

function Curves({ cfg }){
  const { pointsS, pointsD, mcp } = useMemo(()=>{
    const baseP = Number(cfg.market.base_price||1000)
    const baseV = Number(cfg.market.base_volume_mwh||20000)
    const steps = 20
    const s = Array.from({length:steps}, (_,i)=>({ p: baseP-400+i*50, v: baseV/steps }))
    const d = Array.from({length:steps}, (_,i)=>({ p: baseP+400-i*50, v: baseV/steps }))
    const maxP = baseP+500, minP = baseP-500
    const scaleX = (p)=> (p-minP)/(maxP-minP)*300
    const scaleY = (idx)=> idx/steps*150
    const pointsS = s.map((row,i)=> `${scaleX(row.p)},${150-scaleY(i)}`).join(' ')
    const pointsD = d.map((row,i)=> `${scaleX(row.p)},${150-scaleY(i)}`).join(' ')
    const mcpX = scaleX(baseP)
    return { pointsS, pointsD, mcp: mcpX }
  },[cfg])
  return (
    <svg width={360} height={180} style={{border:'1px solid #ddd'}}>
      <polyline points={pointsS} fill="none" stroke="#2e7d32" strokeWidth={2}/>
      <polyline points={pointsD} fill="none" stroke="#c62828" strokeWidth={2}/>
      <line x1={mcp} x2={mcp} y1={0} y2={180} stroke="#1976d2" strokeDasharray="4 4"/>
    </svg>
  )
}

export default function KSE(){
  const [sp] = useSearchParams()
  const scenarioParam = sp.get('id')
  const [tab, setTab] = useState(0)
  const [name, setName] = useState('New Scenario')
  const [cfg, setCfg] = useState(defaultConfig)
  const [scenarioId, setScenarioId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [roundPrev, setRoundPrev] = useState(1)
  const [errors, setErrors] = useState([])
  const [importText, setImportText] = useState('')
  const [hours, setHours] = useState(24)
  const [hPrev, setHPrev] = useState(null)
  const mcpRef = useRef(null)
  const volRef = useRef(null)
  const [groups, setGroups] = useState({ solar: 40, wind: 30, gas: 30 })
  const [zoneSplit, setZoneSplit] = useState(50)
  const [envGen, setEnvGen] = useState(null)
  const [deviceTypes, setDeviceTypes] = useState([])

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

  const update = (path, value)=>{
    setCfg(prev=>{
      const next = structuredClone(prev)
      let node = next
      for(let i=0;i<path.length-1;i++) node = node[path[i]]
      node[path[path.length-1]] = value
      return next
    })
  }

  const validate = ()=>{
    const errs = []
    const zones = cfg.grid.zones
    if(zones<1 || zones>5) errs.push('Zones must be 1–5')
    if(!cfg.general.forecast_horizon_hours || cfg.general.forecast_horizon_hours<=0) errs.push('forecast_horizon_hours must be > 0')
    if(cfg.general.forecast_horizon_hours && cfg.general.horizon_hours && Number(cfg.general.forecast_horizon_hours) < Number(cfg.general.horizon_hours)) errs.push('forecast_horizon_hours must be >= horizon_hours')
    const w = cfg.scoring.weights
    const sum = (w.profit||0)+(w.imbalance||0)+(w.curtailment||0)
    if(Math.abs(sum-1.0)>1e-6) errs.push('Scoring weights must sum to 1.0')
    const h = cfg.general.horizon_hours, sp = cfg.general.round_span_hours, r = cfg.general.rounds
    if(sp<=0 || Math.floor(h/sp)!==r) errs.push('horizon ÷ round_span must equal rounds')
    setErrors(errs)
    return errs.length===0
  }

  useEffect(()=>{ validate() },[cfg])

  const doPreview = async ()=>{
    if(!validate()) return
    const totalRounds = Number(cfg?.general?.rounds || 4)
    const r = Math.min(Math.max(1, Number(roundPrev)||1), totalRounds)
    const { data } = await api.post('/api/engine/preview', { config: cfg, round: r })
    setPreview(data)
  }

  const save = async ()=>{
    if(!validate()) return
    if (scenarioId) {
      await api.put(`/api/kse/scenarios/${scenarioId}`, { name, config: cfg })
      alert('Saved changes')
    } else {
      const { data } = await api.post('/api/kse/scenarios', { name, config: cfg })
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
  g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
      g.append('path').datum(data.mcp).attr('fill','none').attr('stroke','#2e7d32').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
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
  g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')).selectAll('line').attr('stroke','#ddd').attr('stroke-opacity',0.6)
      g.append('path').datum(data.volume).attr('fill','none').attr('stroke','#1976d2').attr('stroke-width',2).attr('d', line)
  g.append('g').attr('transform',`translate(0,${H})`).call(d3.axisBottom(x).ticks(Math.min(h,12)))
  g.append('g').call(d3.axisLeft(y).ticks(4))
      // points + tooltips
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
  // axis labels
  g.append('text').attr('x', W/2).attr('y', H+24).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Hour')
  g.append('text').attr('transform','rotate(-90)').attr('x', -H/2).attr('y', -34).attr('text-anchor','middle').attr('fill','#666').attr('font-size','10px').text('Volume (MWh)')
    }
  }

  const doHourly = async ()=>{
    if(!validate()) return
    const { data } = await api.post('/api/engine/preview/hourly', { config: cfg, hours: Number(hours)||24 })
    setHPrev(data)
    drawHourly(data)
  }

  const exportScenario = async ()=>{
    const id = prompt('Scenario ID to export?')
    if(!id) return
    const { data } = await api.get(`/api/kse/scenarios/${id}/export`)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `scenario_${id}.json`; a.click(); URL.revokeObjectURL(url)
  }

  const importScenario = async ()=>{
    try{
      const json = JSON.parse(importText)
      const { data } = await api.post('/api/kse/scenarios/import', json)
      alert(`Imported as #${data.id}`)
      setImportText('')
    }catch(e){ alert('Invalid JSON') }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">KSE – Scenario Editor</Typography>
      <Stack spacing={0.5}>
        <InfoLabel
          title="Scenario name for identification"
          tooltip="Free text used to identify this scenario in lists and exports."
        />
        <TextField label="Scenario Name" value={name} onChange={e=>setName(e.target.value)} />
      </Stack>
  <Paper sx={{ p:2 }}>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} variant="scrollable">
          <Tab label="General"/>
          <Tab label="Market"/>
          <Tab label="Grid"/>
          <Tab label="Environment"/>
          <Tab label="Events"/>
          <Tab label="Devices"/>
          <Tab label="Player Types"/>
          <Tab label="Scoring"/>
          <Tab label="Preview"/>
        </Tabs>
        <Box sx={{ mt:2 }}>
          {tab===0 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Total simulated hours"
                  tooltip="Typical 24h. Must be consistent with Round span and Rounds (horizon = rounds × round span)."
                />
                <TextField type="number" label="Scenario Horizon (h)" value={cfg.general.horizon_hours} onChange={e=>update(['general','horizon_hours'], Number(e.target.value))}
                  error={cfg.general.horizon_hours<=0}
                  helperText={cfg.general.horizon_hours<=0 ? 'Must be > 0' : ''}
                />
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Hours players can forecast"
                  tooltip="Must be ≥ Scenario Horizon. Controls number of forecast inputs in Player UI and validation in sessions."
                />
                <TextField type="number" label="Forecast Horizon (h)" value={cfg.general.forecast_horizon_hours} onChange={e=>update(['general','forecast_horizon_hours'], Number(e.target.value))}
                  error={!(cfg.general.forecast_horizon_hours>0) || (cfg.general.forecast_horizon_hours < cfg.general.horizon_hours)}
                  helperText={!(cfg.general.forecast_horizon_hours>0) ? 'Must be > 0' : (cfg.general.forecast_horizon_hours < cfg.general.horizon_hours ? 'Must be ≥ Scenario Horizon' : '')}
                />
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Hours per round"
                  tooltip="Simulated hours per round. Constraint: horizon ÷ round span must equal rounds (integer)."
                />
                <TextField type="number" label="Round span (h)" value={cfg.general.round_span_hours} onChange={e=>update(['general','round_span_hours'], Number(e.target.value))}
                  error={!(cfg.general.round_span_hours>0) || (Math.floor(cfg.general.horizon_hours / (cfg.general.round_span_hours||1)) !== cfg.general.rounds)}
                  helperText={!(cfg.general.round_span_hours>0) ? 'Must be > 0' : (Math.floor(cfg.general.horizon_hours / (cfg.general.round_span_hours||1)) !== cfg.general.rounds ? 'horizon ÷ span must equal rounds' : '')}
                />
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Number of rounds"
                  tooltip="Total rounds in the scenario. Must satisfy: rounds = horizon ÷ round span."
                />
                <TextField type="number" label="Rounds" value={cfg.general.rounds} onChange={e=>update(['general','rounds'], Number(e.target.value))}
                  error={Math.floor(cfg.general.horizon_hours / (cfg.general.round_span_hours||1)) !== cfg.general.rounds}
                  helperText={Math.floor(cfg.general.horizon_hours / (cfg.general.round_span_hours||1)) !== cfg.general.rounds ? 'Must satisfy: horizon ÷ span' : ''}
                />
                <TextField type="number" label="Player Zone (1..zones)" value={cfg.general.player_zone||1} onChange={e=>update(['general','player_zone'], Number(e.target.value))}/>
              </Stack>
            </Stack>
          )}
          {tab===1 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Baseline price level (ZAR/MWh)"
                  tooltip="Center price used for sample supply/demand curves and previews. Influences MCP preview only."
                />
                <TextField type="number" label="Base Price" value={cfg.market.base_price} onChange={e=>update(['market','base_price'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Baseline traded volume (MWh)"
                  tooltip="Scales the preview supply/demand curves and initial market environment."
                />
                <TextField type="number" label="Base Volume (MWh)" value={cfg.market.base_volume_mwh} onChange={e=>update(['market','base_volume_mwh'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Minimum allowed market price"
                  tooltip="Price floor in ZAR/MWh (e.g., -500). MCP is clamped to [floor, cap]. Negative prices allowed."
                />
                <TextField type="number" label="Floor" value={cfg.market.price_floor} onChange={e=>update(['market','price_floor'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Maximum allowed market price"
                  tooltip="Price cap in ZAR/MWh (e.g., +5000). MCP is clamped to [floor, cap]."
                />
                <TextField type="number" label="Cap" value={cfg.market.price_cap} onChange={e=>update(['market','price_cap'], Number(e.target.value))}/>
              </Stack>
            </Stack>
          )}
          {tab===2 && (
            <Stack spacing={2}>
              <Stack spacing={0.5} sx={{ maxWidth: 260 }}>
                <InfoLabel
                  title="Number of grid zones"
                  tooltip="Supported range: 1–5. Changing this rebuilds the symmetric ATC matrix; diagonal stays 0 MW."
                />
                <TextField type="number" label="Zones" value={cfg.grid.zones} onChange={e=>{
                const z = Number(e.target.value)
                const atc = Array.from({length:z}, (_,i)=> Array.from({length:z}, (_,j)=> i===j?0: (cfg.grid.atc?.[i]?.[j] ?? 0)))
                setCfg(prev=> ({...prev, grid: { ...prev.grid, zones: z, atc }}))
              }}
              error={cfg.grid.zones<1 || cfg.grid.zones>5}
              helperText={(cfg.grid.zones<1 || cfg.grid.zones>5) ? 'Supported range: 1–5' : ''}
              />
              </Stack>
              <Box>
                <Stack spacing={0.5} sx={{ mb:1 }}>
                  <InfoLabel
                    title="Available Transfer Capacity between zones (MW)"
                    tooltip={"Symmetric off-diagonals; diagonal is 0 MW. Limits power flow per direction between zones. Engine applies 2% transmission losses and enforces ATC when clearing with congestion."}
                  />
                  <Typography variant="subtitle2">ATC Matrix (MW)</Typography>
                </Stack>
                <Box sx={{ display:'grid', gridTemplateColumns: `repeat(${cfg.grid.zones}, 100px)`, gap: 1 }}>
                  {Array.from({length: cfg.grid.zones}, (_,i)=> (
                    Array.from({length: cfg.grid.zones}, (_,j)=> (
                      <TextField key={`${i}-${j}`} size="small" type="number" value={cfg.grid.atc?.[i]?.[j] ?? 0}
                        onChange={e=>{
                          const v = Number(e.target.value)
                          setCfg(prev=>{
                            const next = structuredClone(prev)
                            next.grid.atc[i][j] = i===j ? 0 : v
                            next.grid.atc[j][i] = i===j ? 0 : v
                            return next
                          })
                        }}
                        inputProps={{ readOnly: i===j }}/>
                    ))
                  ))}
                </Box>
              </Box>
            </Stack>
          )}
          {tab===3 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Stack spacing={0.5} sx={{ minWidth: 260 }}>
                <InfoLabel
                  title="Random seed for reproducibility"
                  tooltip="Used by preview/generator/event triggers to produce repeatable results. Same seed ⇒ same randomized outcomes."
                />
                <TextField label="Seed" value={cfg.environment.seed} onChange={e=>update(['environment','seed'], e.target.value)}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 260 }}>
                <InfoLabel
                  title="Environment groups (shares)"
                  tooltip="Define percentage shares that sum to 100%. A simple generator allocates base volume per group and splits across zones."
                />
                <TextField size="small" label="Solar %" type="number" value={groups.solar} onChange={e=> setGroups(g=>({...g, solar: Number(e.target.value)}))}/>
                <TextField size="small" label="Wind %" type="number" value={groups.wind} onChange={e=> setGroups(g=>({...g, wind: Number(e.target.value)}))}/>
                <TextField size="small" label="Gas %" type="number" value={groups.gas} onChange={e=> setGroups(g=>({...g, gas: Number(e.target.value)}))}/>
                <TextField size="small" label="Zone 1 Split %" type="number" value={zoneSplit} onChange={e=> setZoneSplit(Number(e.target.value))}/>
                <Button size="small" variant="outlined" onClick={async ()=>{
                  const total = Number(groups.solar||0)+Number(groups.wind||0)+Number(groups.gas||0)
                  if(total!==100){ alert('Group shares must sum to 100'); return }
                  const res = await api.post('/api/kse/environment/generate', { groups, zone_split: zoneSplit, base_volume_mwh: Number(cfg.market.base_volume_mwh||20000) })
                  setEnvGen(res.data?.environment)
                }}>Generate Environment</Button>
                {envGen && <Typography variant="caption">Z1: {JSON.stringify(envGen.zones['1'])} | Z2: {JSON.stringify(envGen.zones['2'])}</Typography>}
              </Stack>
            </Stack>
          )}
          {tab===4 && (
            <Stack spacing={1}>
              <Stack spacing={0.5} sx={{ mb:0.5 }}>
                <InfoLabel
                  title="Scenario events and their impact"
                  tooltip="Define systemic or player-specific impacts. Processing order: systemic multipliers first, then player additives. Configure type, multiplier (×), and additive (+)."
                />
                <Typography variant="subtitle2">Events</Typography>
              </Stack>
              {(cfg.events||[]).map((e,idx)=> (
                <Stack key={idx} direction="row" spacing={1} alignItems="center">
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel
                      title="Event type"
                      tooltip="systemic affects all players/markets; other types may target a specific player/zone/device (future)."
                    />
                    <TextField size="small" label="type" value={e.type||'systemic'} onChange={ev=>{
                    const v = ev.target.value
                    setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].type = v; return n })
                  }}/>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel
                      title="Multiplicative impact (×)"
                      tooltip="E.g., 1.2 = +20% on affected quantities. Applied before additive. Typical range 0.5–1.5."
                    />
                    <TextField size="small" type="number" label="multiplier" value={e.multiplier ?? 1.0} onChange={ev=>{
                    const v = Number(ev.target.value)
                    setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].multiplier = v; return n })
                  }}/>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel
                      title="Additive impact (+)"
                      tooltip="Unit depends on target (e.g., +500 MW capacity or +100 ZAR/MWh cost). Applied after multipliers."
                    />
                    <TextField size="small" type="number" label="additive" value={e.additive ?? 0} onChange={ev=>{
                    const v = Number(ev.target.value)
                    setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].additive = v; return n })
                  }}/>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Trigger" tooltip="Round number or probability (0-1) depending on type." />
                    <TextField size="small" type="text" label="trigger_type (round|prob)" value={e.trigger_type||'round'} onChange={ev=>{
                      const v = ev.target.value; setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].trigger_type = v; return n })
                    }}/>
                    <TextField size="small" type="number" label="trigger_value" value={e.trigger_value ?? 1} onChange={ev=>{
                      const v = Number(ev.target.value); setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].trigger_value = v; return n })
                    }}/>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Duration (rounds)" tooltip="How many rounds the event lasts once triggered." />
                    <TextField size="small" type="number" label="duration_rounds" value={e.duration_rounds ?? 1} onChange={ev=>{
                      const v = Number(ev.target.value); setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].duration_rounds = v; return n })
                    }}/>
                  </Stack>
                  <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                    <InfoLabel title="Target" tooltip="all | zone | player" />
                    <TextField size="small" type="text" label="target (all|zone|player)" value={e.target||'all'} onChange={ev=>{
                      const v = ev.target.value; setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].target = v; return n })
                    }}/>
                    <TextField size="small" type="text" label="target_id (optional)" value={e.target_id||''} onChange={ev=>{
                      const v = ev.target.value; setCfg(prev=>{ const n = structuredClone(prev); n.events[idx].target_id = v; return n })
                    }}/>
                  </Stack>
                  <Button onClick={()=> setCfg(prev=>{ const n = structuredClone(prev); n.events.splice(idx,1); return n })}>Remove</Button>
                </Stack>
              ))}
              <Button onClick={()=> setCfg(prev=> ({...prev, events: [...(prev.events||[]), { type:'systemic', multiplier:1.0, additive:0 }]}))}>Add Event</Button>
            </Stack>
          )}
          {tab===5 && (
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <InfoLabel
                  title="Devices for this scenario"
                  tooltip="Define devices (generators, storage, loads) with technical parameters. Devices influence costs, curtailment priority, and constraints (min load, ramp rate)."
                />
                <Typography variant="subtitle2">Devices</Typography>
              </Stack>
              {(cfg.devices||[]).map((dev,idx)=> {
                const devType = deviceTypes.find(dt=> dt.type===dev.type)
                const required = devType?.required_params || []
                const optional = devType?.optional_params || []
                const allParams = [...required, ...optional]
                return (
                  <Paper key={idx} sx={{ p:1.5, border:'1px solid #ddd' }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                        <TextField
                          select
                          size="small"
                          label="Type"
                          value={dev.type||''}
                          onChange={e=>{
                            const newType = e.target.value
                            const newDef = deviceTypes.find(dt=> dt.type===newType)?.defaults || {}
                            setCfg(prev=>{
                              const n = structuredClone(prev)
                              n.devices[idx] = { ...newDef, type: newType, id: dev.id || `device_${idx}` }
                              return n
                            })
                          }}
                          sx={{ minWidth: 180 }}
                          SelectProps={{ native: true }}
                        >
                          <option value="">-- Select Type --</option>
                          {deviceTypes.map(dt=> <option key={dt.type} value={dt.type}>{dt.name}</option>)}
                        </TextField>
                        <TextField
                          size="small"
                          label="ID"
                          value={dev.id||''}
                          onChange={e=>{
                            const v = e.target.value
                            setCfg(prev=>{ const n = structuredClone(prev); n.devices[idx].id = v; return n })
                          }}
                          sx={{ minWidth: 140 }}
                        />
                        {devType && <Typography variant="caption" color="text.secondary" sx={{ fontStyle:'italic' }}>{devType.description}</Typography>}
                        <Button size="small" color="error" onClick={()=> setCfg(prev=>{ const n = structuredClone(prev); n.devices.splice(idx,1); return n })}>Remove</Button>
                      </Stack>
                      {dev.type && allParams.length>0 && (
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                          {allParams.map(param=> {
                            const isRequired = required.includes(param)
                            const defVal = devType?.defaults?.[param]
                            return (
                              <Stack key={param} spacing={0.5} sx={{ minWidth: 160 }}>
                                <InfoLabel
                                  title={`${param}${isRequired?' *':''}`}
                                  tooltip={`${isRequired?'Required':'Optional'} parameter. Default: ${defVal !== undefined ? defVal : 'none'}`}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label={param}
                                  value={dev[param] !== undefined ? dev[param] : ''}
                                  onChange={e=>{
                                    const v = e.target.value === '' ? undefined : Number(e.target.value)
                                    setCfg(prev=>{ const n = structuredClone(prev); n.devices[idx][param] = v; return n })
                                  }}
                                />
                              </Stack>
                            )
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                )
              })}
              <Button
                variant="outlined"
                onClick={()=> setCfg(prev=> ({
                  ...prev,
                  devices: [...(prev.devices||[]), { type: '', id: `device_${(prev.devices||[]).length}` }]
                }))}
              >
                Add Device
              </Button>
            </Stack>
          )}
          {tab===6 && (
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <InfoLabel
                  title="Player Types for this scenario"
                  tooltip="Define scenario-specific player archetypes. Each type references devices defined in this scenario and constrains player inputs."
                />
                <Typography variant="subtitle2">Player Types</Typography>
              </Stack>
              {(cfg.player_types||[]).map((pt, idx)=> (
                <Paper key={idx} sx={{ p:1.5, border:'1px solid #ddd' }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                      <TextField size="small" label="ID" value={pt.id||''} onChange={e=>{
                        const v = e.target.value
                        setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].id = v; return n })
                      }} sx={{ minWidth: 180 }}/>
                      <TextField size="small" label="Name" value={pt.name||''} onChange={e=>{
                        const v = e.target.value
                        setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].name = v; return n })
                      }} sx={{ minWidth: 220 }}/>
                      <TextField size="small" label="Description" value={pt.description||''} onChange={e=>{
                        const v = e.target.value
                        setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].description = v; return n })
                      }} sx={{ minWidth: 260 }}/>
                      <TextField size="small" type="number" label="Zone (optional)" value={pt.zone||''} onChange={e=>{
                        const v = e.target.value === '' ? undefined : Number(e.target.value)
                        setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].zone = v; return n })
                      }} sx={{ minWidth: 160 }}/>
                      <Button size="small" color="error" onClick={()=> setCfg(prev=>{ const n = structuredClone(prev); n.player_types.splice(idx,1); return n })}>Remove</Button>
                    </Stack>
                    <Stack spacing={0.5}>
                      <InfoLabel title="Devices" tooltip="Select one or more device IDs from this scenario. Players of this type can edit inputs only for these devices." />
                      <TextField
                        select
                        SelectProps={{ native: true, multiple: true }}
                        size="small"
                        label="Devices"
                        value={pt.devices||[]}
                        onChange={e=>{
                          const opts = Array.from(e.target.selectedOptions).map(o=> o.value)
                          setCfg(prev=>{ const n = structuredClone(prev); n.player_types[idx].devices = opts; return n })
                        }}
                        sx={{ minWidth: 320 }}
                      >
                        {(cfg.devices||[]).map(d=> (
                          <option key={d.id} value={d.id}>{d.id || '(unnamed device)'}</option>
                        ))}
                      </TextField>
                      {(() => {
                        const devIds = new Set((cfg.devices||[]).map(d=> d.id))
                        const unknown = (pt.devices||[]).filter(x=> !devIds.has(x))
                        if(unknown.length>0){
                          return <Typography variant="caption" color="error">Unknown devices: {unknown.join(', ')}</Typography>
                        }
                        if(!pt.id || !pt.name){
                          return <Typography variant="caption" color="warning.main">Type must have ID and Name</Typography>
                        }
                        return null
                      })()}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              <Button variant="outlined" onClick={()=> setCfg(prev=> ({ ...prev, player_types: [...(prev.player_types||[]), { id:'', name:'', devices:[] }] }))}>Add Player Type</Button>
            </Stack>
          )}
          {tab===7 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Round-trip efficiency (0–1)"
                  tooltip="Fractional efficiency used for State of Charge updates. Typical 0.85."
                />
                <TextField type="number" label="Efficiency" value={cfg.storage.efficiency} onChange={e=>update(['storage','efficiency'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Energy capacity (MWh)"
                  tooltip="Usable storage energy capacity in MWh. Sets SoC bounds and interacts with device power rating."
                />
                <TextField type="number" label="Capacity (MWh)" value={cfg.storage.capacity_mwh} onChange={e=>update(['storage','capacity_mwh'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Power rating (MW)"
                  tooltip="Maximum charge/discharge power in MW. Limits how quickly storage can charge or discharge."
                />
                <TextField type="number" label="Power Rating (MW)" value={cfg.storage.power_rating_mw || 50} onChange={e=>update(['storage','power_rating_mw'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Initial State of Charge (%)"
                  tooltip="Starting SoC as percentage of capacity. Default 50% means storage starts half-full."
                />
                <TextField type="number" label="Initial SoC (%)" value={cfg.storage.initial_soc_pct || 50} onChange={e=>update(['storage','initial_soc_pct'], Number(e.target.value))}/>
              </Stack>
            </Stack>
          )}
          {tab===7 && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Weight for Profit KPI"
                  tooltip="Weights must sum to 1.0 across Profit, Imbalance, and Curtailment. Higher weight increases influence on final score."
                />
                <TextField type="number" label="Profit" value={cfg.scoring.weights.profit} onChange={e=>update(['scoring','weights','profit'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Weight for Imbalance Cost KPI"
                  tooltip="Part of scoring weights that must sum to 1.0. Penalizes deviations settled in balancing market."
                />
                <TextField type="number" label="Imbalance" value={cfg.scoring.weights.imbalance} onChange={e=>update(['scoring','weights','imbalance'], Number(e.target.value))}/>
              </Stack>
              <Stack spacing={0.5} sx={{ minWidth: 220 }}>
                <InfoLabel
                  title="Weight for Curtailment KPI"
                  tooltip="Part of scoring weights that must sum to 1.0. Reflects losses due to congestion/curtailment."
                />
                <TextField type="number" label="Curtailment" value={cfg.scoring.weights.curtailment} onChange={e=>update(['scoring','weights','curtailment'], Number(e.target.value))}/>
              </Stack>
            </Stack>
          )}
          {tab===8 && (
            <Stack direction="row" spacing={2} alignItems="center">
              <Curves cfg={cfg} />
              <Box>
                <Stack spacing={0.5} sx={{ mb:1 }}>
                  <InfoLabel
                    title="Quick preview of clearing"
                    tooltip="Runs a lightweight preview using base price/volume and current settings to estimate MCP and volume."
                  />
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Stack spacing={0.5} sx={{ minWidth: 180 }}>
                    <InfoLabel
                      title="Preview round"
                      tooltip="Select a round to preview. Events with trigger_type=round or prob that are active for the selected round are applied."
                    />
                    {(() => {
                      const totalRounds = Number(cfg?.general?.rounds || 4)
                      const items = Array.from({ length: totalRounds }, (_, i) => i + 1)
                      const value = Math.min(Math.max(1, Number(roundPrev) || 1), totalRounds)
                      return (
                        <Select size="small" value={value} onChange={e=>setRoundPrev(e.target.value)} sx={{ width: 160 }}>
                          {items.map(r => <MenuItem key={r} value={r}>{`Round ${r}`}</MenuItem>)}
                        </Select>
                      )
                    })()}
                  </Stack>
                  <Button variant="outlined" onClick={doPreview}>Preview MCP</Button>
                </Stack>
                {preview && <Typography sx={{ mt:1 }}>MCP: {preview.mcp} | Volume: {preview.volume}</Typography>}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:2 }}>
                  <TextField type="number" size="small" label="Hours" value={hours} onChange={e=>setHours(e.target.value)} sx={{ width: 120 }} />
                  <Button variant="outlined" onClick={doHourly}>Hourly Preview</Button>
                </Stack>
                <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly MCP</Typography>
                <svg ref={mcpRef} width={360} height={120} style={{ border:'1px solid #eee' }} />
                <Typography variant="caption" sx={{ display:'block', mt:1 }}>Hourly Volume</Typography>
                <svg ref={volRef} width={360} height={120} style={{ border:'1px solid #eee' }} />
              </Box>
            </Stack>
          )}
        </Box>
      </Paper>
      {errors.length>0 && <Paper sx={{p:2}}>
        <Typography color="error">{errors.join(' · ')}</Typography>
      </Paper>}
      <Stack direction="row" spacing={2}>
  <Button variant="contained" onClick={save} disabled={errors.length>0}>Save Scenario</Button>
  <Button variant="outlined" onClick={doPreview} disabled={errors.length>0}>Validate + Preview</Button>
        <Button variant="outlined" onClick={exportScenario}>Export JSON</Button>
      </Stack>
      <Paper sx={{ p:2 }} data-testid="kse-import-section">
        <Typography variant="subtitle1">Import Scenario (JSON)</Typography>
  <TextField inputProps={{ 'data-testid': 'kse-import-json' }} fullWidth multiline minRows={4} value={importText} onChange={e=>setImportText(e.target.value)} placeholder="{ name, config: {...} }"/>
  <Button data-testid="kse-import-btn" sx={{ mt:1 }} onClick={importScenario}>Import</Button>
      </Paper>
    </Stack>
  )
}