import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Stack, Typography, Chip, Button, Card, CardMedia, CardContent, Divider, LinearProgress, List, ListItem, ListItemText, ListItemButton } from '@mui/material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import InfoLabel from '../components/InfoLabel'
import CampaignTimeline from '../components/CampaignTimeline'
import useAuth from '../store/auth'

export default function CampaignDetail(){
  const user = useAuth((state) => state.user)
  const { id } = useParams()
  const campaignId = Number(id)
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
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

  const campaignSessions = useMemo(() => {
    if (!data?.scenarios?.length) return []
    const scenarioIds = new Set(data.scenarios.map(sc => sc.scenario_id))
    return sessions.filter(session => (
      scenarioIds.has(session.scenario_id) && Number(session.campaign_id) === campaignId
    ))
  }, [campaignId, data, sessions])

  const activeByScenario = useMemo(()=>{
    const m = new Map()
    campaignSessions.forEach(s=>{
      // Keep most recent session per scenario
      if (!m.has(s.scenario_id) || m.get(s.scenario_id).id < s.id) {
        m.set(s.scenario_id, s)
      }
    })
    return m
  },[campaignSessions])

  const displayScenarios = useMemo(() => {
    if (!data?.scenarios) return []
    return data.scenarios.map(sc => {
      const session = activeByScenario.get(sc.scenario_id)
      if (sc.status === 'completed') {
        return sc
      }
      if (session && session.status !== 'scenario_complete' && session.status !== 'ended') {
        return { ...sc, status: 'in_progress' }
      }
      return sc
    })
  }, [data, activeByScenario])

  // Get last 3 completed sessions per scenario
  const completedSessionsByScenario = useMemo(()=>{
    const m = new Map()
    const completed = campaignSessions.filter(s => s.status === 'ended' || s.status === 'scenario_complete')
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
  },[campaignSessions])

  const handlePlayAction = async (scenario_id)=>{
    const session = activeByScenario.get(scenario_id)
    
    // Check if there's an active trainer session (shared_market) for this scenario
    const trainerSession = campaignSessions.find(s => 
      s.scenario_id === scenario_id && 
      s.mode === 'shared_market' && 
      (s.status === 'running' || s.status === 'paused' || s.status === 'round_results' || s.status === 'round_active' || s.status === 'briefing')
    )
    
    if (trainerSession) {
      // Join active trainer session
      if(window.__showSnack) window.__showSnack('Joining trainer session...', 'info')
      navigate(`/player?sessionId=${trainerSession.id}`)
      return
    }
    
    // Always start a fresh solo session (no continue from catalog)
    try{
      const body = { scenario_id, campaign_id: Number(id) }
      const { data:resp } = await api.post('/api/player/solo-sessions', body)
      if(window.__showSnack) window.__showSnack('Solo session started', 'success')
      if (resp && resp.session_id) {
        navigate(`/player?sessionId=${resp.session_id}`)
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
          {displayScenarios && displayScenarios.length > 0 && (
            <CampaignTimeline 
              scenarios={displayScenarios}
              onScenarioClick={handleTimelineClick}
            />
          )}
          
          <Stack spacing={1.5}>
            {displayScenarios?.map(sc=>{
              const session = activeByScenario.get(sc.scenario_id)
              const isCompleted = sc.status === 'completed'
              const recentSessions = isCompleted ? (completedSessionsByScenario.get(sc.scenario_id) || []) : []
              const hasActiveSession = !!session && session.status !== 'scenario_complete' && session.status !== 'ended'
              
              // Check if there's an active trainer session for this scenario
              const trainerSession = campaignSessions.find(s => 
                s.scenario_id === sc.scenario_id && 
                s.mode === 'shared_market' && 
                (s.status === 'running' || s.status === 'paused' || s.status === 'round_results' || s.status === 'round_active' || s.status === 'briefing')
              )
              
              // Determine button label and state
              let playLabel = 'Play'
              let playColor = 'primary'
              let playTooltip = 'Start a new solo session'
              
              if (trainerSession) {
                // Active trainer session exists
                playLabel = 'Join Live Session'
                playColor = 'success'
                playTooltip = 'Join the active trainer-led session'
              } else if (isCompleted) {
                playLabel = 'Replay'
                playColor = 'primary'
                playTooltip = 'Replay this completed scenario'
              }
              
              return (
                <Card key={sc.scenario_id} variant="outlined" ref={el => cardRefs.current[sc.scenario_id] = el}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Chip size="small" label={`#${sc.order_index+1}`} variant="outlined" />
                      <Typography sx={{ flexGrow:1 }}>{sc.name}</Typography>
                      {isCompleted && (
                        <Chip size="small" label="Completed" variant="outlined" sx={{ borderColor: 'success.main', color: 'success.main' }} />
                      )}
                      {!isCompleted && (sc.status === 'in_progress' || hasActiveSession) && (
                        <Chip size="small" label="In Progress" variant="outlined" sx={{ borderColor: 'warning.main', color: 'warning.main' }} />
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
                          variant="outlined"
                          color={playColor === 'success' ? 'success' : 'primary'}
                          onClick={()=> handlePlayAction(sc.scenario_id)}
                          title={playTooltip}
                        >
                          {playLabel}
                        </Button>
                      </Stack>
                      {recentSessions.length > 0 && (
                        <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                          <InfoLabel title="Recent Sessions" tooltip="Your last 3 completed sessions for this scenario" />
                          <List dense disablePadding sx={{ bgcolor: 'background.default', borderRadius: 1 }}>
                            {recentSessions.map((s, idx) => {
                              return (
                                <ListItemButton 
                                  key={s.id}
                                  onClick={() => navigate(`/player?sessionId=${s.id}`)}
                                  sx={{ py: 0.5, px: 1 }}
                                >
                                  <ListItemText 
                                    primary={
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="body2" sx={{ minWidth: 100 }}>
                                          {formatDate(s.started_at)}
                                        </Typography>
                                        {s.player_type && (
                                          <Chip 
                                            label={s.player_type} 
                                            size="small" 
                                            variant="outlined"
                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                          />
                                        )}
                                        {s.status === 'ended' || s.status === 'scenario_complete' ? (
                                          <Chip 
                                            label="Completed" 
                                            size="small" 
                                            variant="outlined"
                                            color="success"
                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                          />
                                        ) : (
                                          <Chip 
                                            label={`Round ${s.current_round}/${s.max_rounds}`} 
                                            size="small" 
                                            variant="outlined"
                                            color="info"
                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                          />
                                        )}
                                        {s.total_points !== undefined && s.total_points > 0 && (
                                          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
                                            {s.total_points} pts
                                          </Typography>
                                        )}
                                      </Stack>
                                    }
                                  />
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
