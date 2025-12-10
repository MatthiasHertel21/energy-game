import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Stack, Typography, Chip, Button, Card, CardMedia, CardContent, Divider, LinearProgress, List, ListItem, ListItemText, ListItemButton } from '@mui/material'
import { Assessment as EvaluationIcon } from '@mui/icons-material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import InfoLabel from '../components/InfoLabel'
import CampaignTimeline from '../components/CampaignTimeline'
import useAuth from '../store/auth'

export default function CampaignDetail(){
  const user = useAuth((state) => state.user)
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [sessionKPIs, setSessionKPIs] = useState({}) // { sessionId: { profit, revenue, ... } }
  const cardRefs = useRef({})

  useEffect(()=>{
    let mounted = true
    setLoading(true)
    api.get(`/api/catalog/campaigns/${id}`).then(({data})=>{
      if(mounted) setData(data)
    }).catch(()=> setData(null)).finally(()=> setLoading(false))
    return ()=>{ mounted=false }
  },[id])

  // load my sessions (for cohort join)
  useEffect(()=>{
    api.get('/api/me/sessions').then(({data})=> setSessions(data||[])).catch(()=> setSessions([]))
  },[])

  // Load KPIs for completed sessions
  useEffect(() => {
    const loadKPIs = async () => {
      if (!user?.id) return
      
      const completed = sessions.filter(s => s.status === 'ended' || s.status === 'scenario_complete')
      const kpis = {}
      
      await Promise.all(
        completed.map(async (session) => {
          try {
            const { data } = await api.get(`/api/leaderboard/sessions/${session.id}`)
            // Find current user's data
            const userKPI = data.find(r => r.player_id === user.id)
            if (userKPI) {
              kpis[session.id] = {
                profit: userKPI.profit_zar || 0,
                revenue: userKPI.revenue_zar || 0,
                imbalance: userKPI.imbalance_cost_zar || 0,
                curtailment: userKPI.curtailment_cost_zar || 0
              }
            }
          } catch (err) {
            console.error(`Failed to load KPIs for session ${session.id}`, err)
          }
        })
      )
      
      setSessionKPIs(kpis)
    }
    
    if (sessions.length > 0) {
      loadKPIs()
    }
  }, [sessions, user])

  const activeByScenario = useMemo(()=>{
    const m = new Map()
    sessions.forEach(s=>{
      // Keep most recent session per scenario
      if (!m.has(s.scenario_id) || m.get(s.scenario_id).id < s.id) {
        m.set(s.scenario_id, s)
      }
    })
    return m
  },[sessions])

  // Get last 3 completed sessions per scenario
  const completedSessionsByScenario = useMemo(()=>{
    const m = new Map()
    const completed = sessions.filter(s => s.status === 'ended' || s.status === 'scenario_complete')
    completed.sort((a, b) => b.id - a.id) // Sort by ID descending (newest first)
    
    completed.forEach(s=>{
      if (!m.has(s.scenario_id)) {
        m.set(s.scenario_id, [])
      }
      if (m.get(s.scenario_id).length < 3) {
        m.get(s.scenario_id).push(s)
      }
    })
    return m
  },[sessions])

  const handlePlayAction = async (scenario_id, forceNew = false)=>{
    const session = activeByScenario.get(scenario_id)
    
    // Check if scenario is completed
    const sc = data.scenarios?.find(s => s.scenario_id === scenario_id)
    const isCompleted = sc?.status === 'completed' || (session && session.status === 'scenario_complete')
    
    if (session && !isCompleted && !forceNew) {
      // Continue existing non-completed session
      if (session.status === 'created' || session.status === 'briefing') {
        // Go to briefing for new sessions
        navigate(`/briefing/${session.id}`)
      } else {
        // Continue active session
        navigate(`/player?sessionId=${session.id}`)
      }
      return
    }
    
    // No active session, completed scenario, or forced new - create new one
    try{
      const body = { scenario_id, campaign_id: Number(id) }
      const { data:resp } = await api.post('/api/player/solo-sessions', body)
      if(window.__showSnack) window.__showSnack('Solo session started', 'success')
      if (resp && resp.session_id) {
        navigate(`/briefing/${resp.session_id}`)
      } else {
        navigate('/player')
      }
    }catch(e){/* handled by interceptor */}
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  
  const handleTimelineClick = (scenario_id) => {
    // Scroll to corresponding card
    const card = cardRefs.current[scenario_id]
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  if(loading) return <Box sx={{ mt:4 }}><LinearProgress /></Box>
  if(!data) return <EmptyState title="Campaign not found" message="Return to catalog and select another campaign." actionLabel="Back to catalog" onAction={()=> navigate('/catalog')} />

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="stretch">
        <Card sx={{ width: 280 }}>
          <CardMedia component="img" height="220" image={data.cover_image_url || '/logo.svg'} alt={data.name} sx={{ objectFit:'cover', bgcolor:'#f5f5f5' }} />
          <CardContent>
            <Typography variant="h5">{data.name}</Typography>
            <Typography variant="body2" color="text.secondary">{data.description}</Typography>
          </CardContent>
        </Card>
        <Box sx={{ flexGrow:1 }}>
          <Typography variant="h5" sx={{ mb:1 }}>Scenarios</Typography>
          <Divider sx={{ mb:2 }} />
          
          {/* Campaign Timeline */}
          {data.scenarios && data.scenarios.length > 0 && (
            <CampaignTimeline 
              scenarios={data.scenarios}
              onScenarioClick={handleTimelineClick}
            />
          )}
          
          <Stack spacing={1.5}>
            {data.scenarios?.map(sc=>{
              const session = activeByScenario.get(sc.scenario_id)
              const recentSessions = completedSessionsByScenario.get(sc.scenario_id) || []
              
              // Determine button label and state
              let playLabel = 'Play'
              let playColor = 'primary'
              let playTooltip = 'Start a new solo session'
              
              // Check if scenario is completed (based on scenario status or session status)
              const isCompleted = sc.status === 'completed' || (session && session.status === 'scenario_complete')
              
              if (session) {
                if (session.status === 'scenario_complete' || isCompleted) {
                  playLabel = 'Replay'
                  playColor = 'secondary'
                  playTooltip = 'Replay this scenario (creates new session)'
                } else if (session.status === 'created' || session.status === 'briefing') {
                  playLabel = 'Continue'
                  playColor = 'success'
                  playTooltip = 'Continue from briefing'
                } else if (session.status === 'running' || session.status === 'round_active' || session.status === 'round_results' || session.status === 'paused') {
                  playLabel = 'Continue'
                  playColor = 'success'
                  playTooltip = 'Continue your active session'
                }
              } else if (isCompleted) {
                // No active session but scenario is marked as completed
                playLabel = 'Replay'
                playColor = 'secondary'
                playTooltip = 'Replay this completed scenario'
              }
              
              return (
                <Card key={sc.scenario_id} variant="outlined" ref={el => cardRefs.current[sc.scenario_id] = el}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Chip size="small" label={`#${sc.order_index+1}`} />
                      <Typography sx={{ flexGrow:1 }}>{sc.name}</Typography>
                      {session && session.status === 'scenario_complete' && (
                        <Chip size="small" label="Completed" color="success" />
                      )}
                      {session && session.status !== 'scenario_complete' && (
                        <Chip size="small" label="In Progress" color="warning" />
                      )}
                      {!session && sc.status === 'completed' && (
                        <Chip size="small" label="Completed" color="success" variant="outlined" />
                      )}
                    </Stack>
                    {sc.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
                        {sc.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mt:1 }}>
                      <Stack direction="row" spacing={1}>
                        <Button 
                          disabled={!sc.solo_enabled} 
                          variant="contained" 
                          color={playColor}
                          onClick={()=> handlePlayAction(sc.scenario_id)}
                        >
                          {playLabel}
                        </Button>
                        {session && !isCompleted && (
                          <Button 
                            disabled={!sc.solo_enabled} 
                            variant="outlined" 
                            color="secondary"
                            onClick={()=> handlePlayAction(sc.scenario_id, true)}
                            size="small"
                          >
                            Start New
                          </Button>
                        )}
                      </Stack>
                      {recentSessions.length > 0 && (
                        <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                          <InfoLabel title="Recent Sessions" tooltip="Your last 3 completed sessions for this scenario" />
                          <List dense disablePadding sx={{ bgcolor: 'background.default', borderRadius: 1 }}>
                            {recentSessions.map((s, idx) => {
                              const kpi = sessionKPIs[s.id]
                              return (
                                <ListItemButton 
                                  key={s.id}
                                  onClick={() => navigate(`/evaluation?sessionId=${s.id}`)}
                                  sx={{ py: 0.5, px: 1 }}
                                >
                                  <ListItemText 
                                    primary={
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="body2" sx={{ minWidth: 140 }}>
                                          #{s.id} - {formatDate(s.started_at)}
                                        </Typography>
                                        {kpi && (
                                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 1 }}>
                                            <span style={{ color: kpi.profit >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: 600 }}>
                                              {kpi.profit >= 0 ? '+' : ''}{kpi.profit.toFixed(0)} ZAR
                                            </span>
                                            <span>|</span>
                                            <span>Rev: {kpi.revenue.toFixed(0)}</span>
                                            <span>Imb: {kpi.imbalance.toFixed(0)}</span>
                                            <span>Curt: {kpi.curtailment.toFixed(0)}</span>
                                          </Typography>
                                        )}
                                      </Stack>
                                    }
                                  />
                                  <EvaluationIcon fontSize="small" color="action" />
                                </ListItemButton>
                              )
                            })}
                          </List>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )
            })}
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}
