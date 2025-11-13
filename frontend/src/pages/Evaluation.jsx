import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Select, MenuItem } from '@mui/material'
import api from '../services/api'
import Radar from '../components/Radar'
import { exportSVG } from '../utils/exportSvg'

export default function Evaluation(){
  const [params] = useSearchParams()
  const [rows, setRows] = useState([])
  const [sel, setSel] = useState(null)
  const sid = params.get('session')
  const [role, setRole] = useState('')
  const [sessionInfo, setSessionInfo] = useState(null)
  const [refRuns, setRefRuns] = useState([])
  const [refSel, setRefSel] = useState('')
  const [refData, setRefData] = useState(null)
  const radarWrap = useRef(null)
  useEffect(()=>{
    const load = async ()=>{
      if(!sid) return
      const info = await api.get(`/api/sessions/${sid}`)
      setSessionInfo(info.data)
      const { data } = await api.get(`/api/leaderboard/sessions/${sid}${role?`?role=${role}`:''}`)
      setRows(data)
      setSel(data?.[0]?.player_id || null)
      if(info?.data?.scenario_id){
        const rlist = await api.get(`/api/kse/scenarios/${info.data.scenario_id}/reference-runs`)
        setRefRuns(rlist.data||[])
      }
    }
    load()
  },[sid, role])

  useEffect(()=>{
    const loadRef = async ()=>{
      if(!refSel || !sessionInfo?.scenario_id){ setRefData(null); return }
      const rr = await api.get(`/api/kse/scenarios/${sessionInfo.scenario_id}/reference-runs/${refSel}`)
      setRefData(rr.data?.data || null)
    }
    loadRef()
  },[refSel, sessionInfo])
  const selected = useMemo(()=> rows.find(r=> r.player_id===sel) || null, [rows, sel])
  const radarAxes = useMemo(()=>{
    if(!selected){ return [] }
    // Normalize: higher profit is better, lower costs are better
    const maxProfit = Math.max(...rows.map(r=> r.profit_zar||0), 1)
    const maxImb = Math.max(...rows.map(r=> r.imbalance_cost_zar||0), 1)
    const maxCurt = Math.max(...rows.map(r=> r.curtailment_cost_zar||0), 1)
    return [
      { label: 'Profit', value: (selected.profit_zar||0)/maxProfit },
      { label: 'Imbalance(−)', value: 1 - (selected.imbalance_cost_zar||0)/maxImb },
      { label: 'Curtail(−)', value: 1 - (selected.curtailment_cost_zar||0)/maxCurt },
    ]
  },[rows, selected])

  const radarAvg = useMemo(()=>{
    if(!rows.length) return null
    const avgProfit = rows.reduce((a,b)=>a+(b.profit_zar||0),0)/rows.length
    const avgImb = rows.reduce((a,b)=>a+(b.imbalance_cost_zar||0),0)/rows.length
    const avgCurt = rows.reduce((a,b)=>a+(b.curtailment_cost_zar||0),0)/rows.length
    const maxProfit = Math.max(...rows.map(r=> r.profit_zar||0), 1)
    const maxImb = Math.max(...rows.map(r=> r.imbalance_cost_zar||0), 1)
    const maxCurt = Math.max(...rows.map(r=> r.curtailment_cost_zar||0), 1)
    return [
      { label: 'Profit', value: (avgProfit||0)/maxProfit },
      { label: 'Imbalance(−)', value: 1 - (avgImb||0)/maxImb },
      { label: 'Curtail(−)', value: 1 - (avgCurt||0)/maxCurt },
    ]
  },[rows])

  const radarRefAxes = useMemo(()=>{
    if(!refData) return null
    let rProfit=0, rImb=0, rCurt=0, n=0
    const players = refData.players || refData.results || {}
    if(players && typeof players === 'object'){
      Object.values(players).forEach((p)=>{
        const t = p.kpis_total || p.kpis || {}
        rProfit += (t.profit_zar||0)
        rImb += (t.imbalance_cost_zar||0)
        rCurt += (t.curtailment_cost_zar||0)
        n += 1
      })
    }
    if(n===0) return null
    rProfit/=n; rImb/=n; rCurt/=n
    const maxProfit = Math.max(...rows.map(r=> r.profit_zar||0), rProfit, 1)
    const maxImb = Math.max(...rows.map(r=> r.imbalance_cost_zar||0), rImb, 1)
    const maxCurt = Math.max(...rows.map(r=> r.curtailment_cost_zar||0), rCurt, 1)
    return [
      { label: 'Profit', value: (rProfit||0)/maxProfit },
      { label: 'Imbalance(−)', value: 1 - (rImb||0)/maxImb },
      { label: 'Curtail(−)', value: 1 - (rCurt||0)/maxCurt },
    ]
  },[refData, rows])
  const pdf = ()=> window.open(`/api/export/sessions/${sid}/pdf`, '_blank')
  const json = ()=> window.open(`/api/export/sessions/${sid}/json`, '_blank')
  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Evaluation</Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <Button onClick={json}>Export JSON</Button>
        <Button variant="contained" onClick={pdf}>Export PDF</Button>
        <Select size="small" value={sel||''} onChange={e=>setSel(Number(e.target.value))} displayEmpty>
          {rows.map(r=> <MenuItem key={r.player_id} value={r.player_id}>Player {r.player_id}</MenuItem>)}
        </Select>
        <Select size="small" value={role} onChange={e=>setRole(e.target.value)} displayEmpty>
          <MenuItem value="">All Roles</MenuItem>
          <MenuItem value="player">player</MenuItem>
          <MenuItem value="trainer">trainer</MenuItem>
          <MenuItem value="designer">designer</MenuItem>
          <MenuItem value="admin">admin</MenuItem>
        </Select>
        <Select size="small" value={refSel} onChange={e=>setRefSel(e.target.value)} displayEmpty>
          <MenuItem value="">No Reference</MenuItem>
          {refRuns.map(r=> <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </Select>
        <Button size="small" onClick={()=> radarWrap.current && exportSVG(radarWrap.current, 'evaluation_radar.svg')}>Export Radar</Button>
      </Stack>
      {selected && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt:2 }}>
          <div ref={radarWrap}><Radar axes={radarAxes} axes2={radarRefAxes || radarAvg} /></div>
          <Typography variant="body2">Spider (Radar) – normalized KPIs für Player {selected.player_id}</Typography>
        </Stack>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Player</TableCell>
            <TableCell align="right">Profit (ZAR)</TableCell>
            <TableCell align="right">Revenue</TableCell>
            <TableCell align="right">Imbalance Cost</TableCell>
            <TableCell align="right">Curtailment Cost</TableCell>
            <TableCell align="right">Rounds</TableCell>
            <TableCell align="right">Δ Profit vs Ref</TableCell>
            <TableCell align="right">Δ Imbalance vs Ref</TableCell>
            <TableCell align="right">Δ Curtail vs Ref</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(r => {
            let delta = ''
            let deltaImb = ''
            let deltaCurt = ''
            if(refData && refData.players){
              const pr = refData.players[String(r.player_id)] || refData.players[r.player_id]
              const t = pr?.kpis_total || pr?.kpis
              if(t && typeof t.profit_zar !== 'undefined') delta = (r.profit_zar - t.profit_zar)
              if(t && typeof t.imbalance_cost_zar !== 'undefined') deltaImb = (r.imbalance_cost_zar - t.imbalance_cost_zar)
              if(t && typeof t.curtailment_cost_zar !== 'undefined') deltaCurt = (r.curtailment_cost_zar - t.curtailment_cost_zar)
            }
            return (
            <TableRow key={r.player_id}>
              <TableCell>{r.player_id}</TableCell>
              <TableCell align="right">{r.profit_zar}</TableCell>
              <TableCell align="right">{r.revenue_zar}</TableCell>
              <TableCell align="right">{r.imbalance_cost_zar}</TableCell>
              <TableCell align="right">{r.curtailment_cost_zar}</TableCell>
              <TableCell align="right">{r.rounds}</TableCell>
              <TableCell align="right">{delta!=='' ? delta : '—'}</TableCell>
              <TableCell align="right">{deltaImb!=='' ? deltaImb : '—'}</TableCell>
              <TableCell align="right">{deltaCurt!=='' ? deltaCurt : '—'}</TableCell>
            </TableRow>
          )})}
        </TableBody>
      </Table>
    </Paper>
  )
}