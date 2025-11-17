import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Stack, Typography, Chip, Button, Card, CardMedia, CardContent, Divider, LinearProgress, Select, MenuItem } from '@mui/material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import InfoLabel from '../components/InfoLabel'
import CampaignTimeline from '../components/CampaignTimeline'

export default function CampaignDetail(){
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [cohortSessionId, setCohortSessionId] = useState('')
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

  const activeByScenario = useMemo(()=>{
    const m = new Map()
    sessions.filter(s=> s.status==='running').forEach(s=>{
      const arr = m.get(s.scenario_id) || []
      arr.push(s)
      m.set(s.scenario_id, arr)
    })
    return m
  },[sessions])

  const startSolo = async (scenario_id)=>{
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

  const resetScenario = async (scenario_id)=>{
    if(!window.confirm('Reset your progress for this scenario? This will remove your solo sessions and forecasts.')) return
    try{
      await api.post('/api/player/reset-scenario', { campaign_id: Number(id), scenario_id })
      if(window.__showSnack) window.__showSnack('Scenario reset', 'success')
      // reload details
      const { data } = await api.get(`/api/catalog/campaigns/${id}`)
      setData(data)
    }catch(e){ /* handled by interceptor */ }
  }
  
  const handleTimelineClick = (scenario_id) => {
    // Scroll to corresponding card
    const card = cardRefs.current[scenario_id]
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const joinCohort = ()=>{
    if(cohortSessionId){
      navigate(`/briefing/${cohortSessionId}`)
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
              const actives = activeByScenario.get(sc.scenario_id) || []
              return (
                <Card key={sc.scenario_id} variant="outlined" ref={el => cardRefs.current[sc.scenario_id] = el}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Chip size="small" label={`#${sc.order_index+1}`} />
                      <Typography sx={{ flexGrow:1 }}>{sc.name}</Typography>
                      <Chip size="small" label={sc.status} color={sc.status==='completed'?'success':sc.status==='in_progress'?'warning':'default'} />
                    </Stack>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mt:1 }}>
                      <Stack spacing={0.5}>
                        <InfoLabel title="Solo play" tooltip="Start a solo session in isolated market mode if enabled by designer." />
                        <Button disabled={!sc.solo_enabled} variant="contained" onClick={()=> startSolo(sc.scenario_id)}>Play solo</Button>
                      </Stack>
                      <Stack spacing={0.5}>
                        <InfoLabel title="Reset" tooltip="Reset your progress for this scenario, including solo sessions and forecasts." />
                        <Button variant="outlined" color="error" onClick={()=> resetScenario(sc.scenario_id)}>Reset</Button>
                      </Stack>
                      <Stack spacing={0.5}>
                        <InfoLabel title="Trainer cohort" tooltip="Join an active trainer session if available in your cohorts." />
                        {actives.length>0 ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Select size="small" value={cohortSessionId} onChange={(e)=> setCohortSessionId(e.target.value)} sx={{ minWidth: 220 }} displayEmpty>
                              <MenuItem value=""><em>Select session</em></MenuItem>
                              {actives.map(s=> <MenuItem key={s.id} value={s.id}>{`${s.cohort_name || 'Cohort'} – Session ${s.id}`}</MenuItem>)}
                            </Select>
                            <Button variant="outlined" onClick={joinCohort}>Join</Button>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">No active session</Typography>
                        )}
                      </Stack>
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
