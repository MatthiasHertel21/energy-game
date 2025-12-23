import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Select, MenuItem, FormControl, InputLabel, Alert, Box, Divider, Chip } from '@mui/material'
import { EmojiEvents as LeaderboardIcon, TrendingUp as DAIcon, SwapHoriz as IDIcon } from '@mui/icons-material'
import api from '../services/api'
import Radar from '../components/Radar'
import { exportSVG } from '../utils/exportSvg'

export default function Evaluation(){
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [sel, setSel] = useState(null)
  const [sessionId, setSessionId] = useState(params.get('sessionId') || '')
  const [allSessions, setAllSessions] = useState([])
  const [sessionInfo, setSessionInfo] = useState(null)
  const [compareSessionId, setCompareSessionId] = useState('')
  const [compareData, setCompareData] = useState(null)
  const [marketBreakdown, setMarketBreakdown] = useState([])
  const radarWrap = useRef(null)
  
  // Load all user sessions for dropdown
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const { data } = await api.get('/api/me/sessions')
        // Filter completed sessions only
        const completed = data.filter(s => s.status === 'ended' || s.status === 'scenario_complete')
        setAllSessions(completed)
        
        // Auto-select most recent if no sessionId in params
        if (!sessionId && completed.length > 0) {
          const mostRecent = completed.sort((a, b) => b.id - a.id)[0]
          setSessionId(mostRecent.id.toString())
        }
      } catch (error) {
        console.error('Failed to load sessions:', error)
      }
    }
    loadSessions()
  }, [])
  
  useEffect(()=>{
    const load = async ()=>{
      if(!sessionId) return
      try {
        const info = await api.get(`/api/sessions/${sessionId}`)
        setSessionInfo(info.data)
        const { data } = await api.get(`/api/leaderboard/sessions/${sessionId}`)
        setRows(data)
        setSel(data?.[0]?.player_id || null)
        
        // Load market breakdown
        try {
          const breakdown = await api.get(`/api/leaderboard/sessions/${sessionId}/market-breakdown`)
          setMarketBreakdown(breakdown.data)
        } catch (breakdownErr) {
          console.warn('Market breakdown not available:', breakdownErr)
          setMarketBreakdown([])
        }
      } catch (error) {
        console.error('Failed to load evaluation data:', error)
      }
    }
    load()
  },[sessionId])

  useEffect(()=>{
    const loadCompare = async ()=>{
      if(!compareSessionId){ setCompareData(null); return }
      try {
        const { data } = await api.get(`/api/leaderboard/sessions/${compareSessionId}`)
        setCompareData(data)
      } catch (error) {
        console.error('Failed to load comparison data:', error)
        setCompareData(null)
      }
    }
    loadCompare()
  },[compareSessionId])
  
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
    if(!compareData || !sel) return null
    // Find the same player in the comparison session
    const comparePlayer = compareData.find(r => r.player_id === sel)
    if(!comparePlayer) return null
    
    const maxProfit = Math.max(...rows.map(r=> r.profit_zar||0), comparePlayer.profit_zar||0, 1)
    const maxImb = Math.max(...rows.map(r=> r.imbalance_cost_zar||0), comparePlayer.imbalance_cost_zar||0, 1)
    const maxCurt = Math.max(...rows.map(r=> r.curtailment_cost_zar||0), comparePlayer.curtailment_cost_zar||0, 1)
    return [
      { label: 'Profit', value: (comparePlayer.profit_zar||0)/maxProfit },
      { label: 'Imbalance(−)', value: 1 - (comparePlayer.imbalance_cost_zar||0)/maxImb },
      { label: 'Curtail(−)', value: 1 - (comparePlayer.curtailment_cost_zar||0)/maxCurt },
    ]
  },[compareData, rows, sel])
  const pdf = ()=> window.open(`/api/export/sessions/${sessionId}/pdf`, '_blank')
  const json = ()=> window.open(`/api/export/sessions/${sessionId}/json`, '_blank')
  
  if (allSessions.length === 0 && !sessionId) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="info">
          No completed sessions found. Complete a session first to view evaluation reports.
        </Alert>
        <Button variant="contained" onClick={() => navigate('/catalog')} sx={{ mt: 2 }}>
          Browse Campaigns
        </Button>
      </Paper>
    )
  }
  
  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Evaluation & Reports</Typography>
      
      {/* Session Selection */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel size="small">Select Session</InputLabel>
            <Select 
              size="small" 
              value={sessionId} 
              onChange={e => setSessionId(e.target.value)}
              label="Select Session"
            >
              {allSessions.map(s => (
                <MenuItem key={s.id} value={s.id.toString()}>
                  {s.scenario_name} (#{s.id}) - {new Date(s.started_at).toLocaleDateString()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          {sessionId && (
            <Button 
              variant="outlined" 
              startIcon={<LeaderboardIcon />}
              onClick={() => navigate(`/leaderboard?sessionId=${sessionId}`)}
            >
              View Leaderboard
            </Button>
          )}
        </Stack>
      </Box>
      
      {!sessionId ? (
        <Alert severity="info">Please select a session to view evaluation data.</Alert>
      ) : (
        <>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
            <Button onClick={json}>Export JSON</Button>
            <Button variant="contained" onClick={pdf}>Export PDF</Button>
            <Select size="small" value={sel||''} onChange={e=>setSel(Number(e.target.value))} displayEmpty>
              {rows.map(r=> <MenuItem key={r.player_id} value={r.player_id}>{r.email || `Player ${r.player_id}`}</MenuItem>)}
            </Select>
            <Select size="small" value={compareSessionId} onChange={e=>setCompareSessionId(e.target.value)} displayEmpty>
              <MenuItem value="">No Comparison</MenuItem>
              {allSessions.filter(s => s.id.toString() !== sessionId).map(s => (
                <MenuItem key={s.id} value={s.id.toString()}>
                  Compare: {s.scenario_name} (#{s.id})
                </MenuItem>
              ))}
            </Select>
            <Button size="small" onClick={()=> radarWrap.current && exportSVG(radarWrap.current, 'evaluation_radar.svg')}>Export Radar</Button>
          </Stack>
          {selected && (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt:2 }}>
              <div ref={radarWrap}><Radar axes={radarAxes} axes2={radarRefAxes || radarAvg} /></div>
              <Typography variant="body2">Spider (Radar) – normalized KPIs für {selected.email || `Player ${selected.player_id}`}</Typography>
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
                {compareData && (
                  <>
                    <TableCell align="right">Δ Profit vs Compare</TableCell>
                    <TableCell align="right">Δ Imbalance vs Compare</TableCell>
                    <TableCell align="right">Δ Curtail vs Compare</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(r => {
                let delta = ''
                let deltaImb = ''
                let deltaCurt = ''
                if(compareData){
                  const comparePlayer = compareData.find(cp => cp.player_id === r.player_id)
                  if(comparePlayer){
                    delta = (r.profit_zar - comparePlayer.profit_zar).toFixed(2)
                    deltaImb = (r.imbalance_cost_zar - comparePlayer.imbalance_cost_zar).toFixed(2)
                    deltaCurt = (r.curtailment_cost_zar - comparePlayer.curtailment_cost_zar).toFixed(2)
                  }
                }
                return (
                <TableRow key={r.player_id}>
                  <TableCell>{r.email || `Player ${r.player_id}`}</TableCell>
                  <TableCell align="right">{r.profit_zar}</TableCell>
                  <TableCell align="right">{r.revenue_zar}</TableCell>
                  <TableCell align="right">{r.imbalance_cost_zar}</TableCell>
                  <TableCell align="right">{r.curtailment_cost_zar}</TableCell>
                  <TableCell align="right">{r.rounds}</TableCell>
                  {compareData && (
                    <>
                      <TableCell align="right">{delta!=='' ? delta : '—'}</TableCell>
                      <TableCell align="right">{deltaImb!=='' ? deltaImb : '—'}</TableCell>
                      <TableCell align="right">{deltaCurt!=='' ? deltaCurt : '—'}</TableCell>
                    </>
                  )}
                </TableRow>
              )})}
            </TableBody>
          </Table>
          
          {/* Market Breakdown Section */}
          {marketBreakdown.length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DAIcon color="action" />
                Market Breakdown: Day-Ahead vs Intraday
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Shows the split of traded volumes between Day-Ahead (round 1) and Intraday (adjustments in later rounds).
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>Player</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                        <Chip label="DA" size="small" sx={{ bgcolor: '#9e9e9e', color: 'white', fontSize: '0.7rem', height: 18 }} />
                        Volume (MWh)
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                        <Chip label="DA" size="small" sx={{ bgcolor: '#9e9e9e', color: 'white', fontSize: '0.7rem', height: 18 }} />
                        Revenue (ZAR)
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                        <Chip label="ID" size="small" sx={{ bgcolor: '#4caf50', color: 'white', fontSize: '0.7rem', height: 18 }} />
                        Delta (MWh)
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                        <Chip label="ID" size="small" sx={{ bgcolor: '#4caf50', color: 'white', fontSize: '0.7rem', height: 18 }} />
                        Revenue (ZAR)
                      </Stack>
                    </TableCell>
                    <TableCell align="right">Total (MWh)</TableCell>
                    <TableCell align="right">Total Revenue</TableCell>
                    <TableCell align="right">Avg MCP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {marketBreakdown.map(mb => (
                    <TableRow key={mb.player_id}>
                      <TableCell>{mb.email}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'rgba(158, 158, 158, 0.1)' }}>
                        {mb.da_volume_mwh?.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'rgba(158, 158, 158, 0.1)' }}>
                        {mb.da_revenue_zar?.toLocaleString()} ZAR
                      </TableCell>
                      <TableCell align="right" sx={{ 
                        bgcolor: mb.id_delta_mwh >= 0 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: mb.id_delta_mwh >= 0 ? 'success.main' : 'error.main'
                      }}>
                        {mb.id_delta_mwh >= 0 ? '+' : ''}{mb.id_delta_mwh?.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ 
                        bgcolor: mb.id_revenue_zar >= 0 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: mb.id_revenue_zar >= 0 ? 'success.main' : 'error.main'
                      }}>
                        {mb.id_revenue_zar >= 0 ? '+' : ''}{mb.id_revenue_zar?.toLocaleString()} ZAR
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {mb.final_volume_mwh?.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {mb.total_revenue_zar?.toLocaleString()} ZAR
                      </TableCell>
                      <TableCell align="right">
                        {mb.avg_mcp?.toLocaleString()} ZAR/MWh
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ mt: 2, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <strong>Legend:</strong>{' '}
                  <Chip label="DA" size="small" sx={{ bgcolor: '#9e9e9e', color: 'white', fontSize: '0.65rem', height: 16, mx: 0.5 }} /> = Day-Ahead (round 1 position){' '}
                  <Chip label="ID" size="small" sx={{ bgcolor: '#4caf50', color: 'white', fontSize: '0.65rem', height: 16, mx: 0.5 }} /> = Intraday (adjustments in rounds 2+)
                </Typography>
              </Box>
            </Box>
          )}
        </>
      )}
    </Paper>
  )
}