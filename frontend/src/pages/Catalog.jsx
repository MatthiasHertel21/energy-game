import React, { useEffect, useState } from 'react'
import { Box, Grid, Card, CardMedia, CardContent, Typography, CardActions, Button, Chip, LinearProgress, Stack, Badge } from '@mui/material'
import { PlayArrow as PlayIcon, Lock as LockIcon, CheckCircle as CompletedIcon, FiberManualRecord as LiveIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import DocsFab from '../components/DocsFab'

export default function Catalog(){
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const navigate = useNavigate()

  useEffect(()=>{
    let mounted = true
    setLoading(true)
    
    // Load campaigns and active sessions in parallel
    Promise.all([
      api.get('/api/catalog/campaigns', { params: { for_me: 1, active: 1 } }),
      api.get('/api/me/sessions')
    ]).then(([campaignRes, sessionRes])=>{
      if(mounted) {
        setRows(campaignRes.data)
        setSessions(sessionRes.data || [])
      }
    }).catch(()=>{
      if(mounted) setRows([])
    }).finally(()=> { if(mounted) setLoading(false) })
    
    return ()=>{ mounted = false }
  },[])
  
  // Check if campaign has active trainer session
  const hasActiveSession = (campaignId) => {
    return sessions.some(s => 
      s.campaign_id === campaignId && 
      (s.status === 'running' || s.status === 'paused') &&
      s.mode !== 'isolated_per_player'
    )
  }
  
  // Check if campaign is completed
  const isCompleted = (campaign) => {
    const completed = campaign.progress?.completed || 0
    const total = campaign.progress?.total || 0
    return total > 0 && completed === total
  }

  if(loading) return <Box sx={{ mt:4 }}><LinearProgress /></Box>
  if(!rows || rows.length===0) return <EmptyState title="No campaigns" message="Published campaigns will appear here." />

  return (
    <Box>
      <Typography variant="h4" sx={{ mb:2 }}>Campaign Catalog</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Browse available campaigns. Green badge indicates active trainer sessions you can join.
      </Typography>
      
      <Grid container spacing={2}>
        {rows.map(c => {
          const completed = c.progress?.completed || 0
          const total = c.progress?.total || 0
          const pct = total>0 ? Math.round(completed*100/total) : 0
          const hasActive = hasActiveSession(c.id)
          const isComplete = isCompleted(c)
          
          return (
            <Grid key={c.id} item xs={12} sm={6} md={4}>
              <Card sx={{ display:'flex', flexDirection:'column', height:'100%' }}>
                <CardMedia component="img" height="160" image={c.cover_image_url || '/logo.svg'} alt={c.name} sx={{ objectFit:'cover', bgcolor:'#f5f5f5' }} />
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" noWrap>{c.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', minHeight: 40 }}>{c.description}</Typography>
                  <Box sx={{ mt:1 }}>
                    <LinearProgress variant="determinate" value={pct} />
                    <Typography variant="caption">{completed}/{total} scenarios completed</Typography>
                  </Box>
                </CardContent>
                <CardActions sx={{ mt:'auto', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Stack direction="row" spacing={0.5}>
                    {hasActive && (
                      <Chip 
                        icon={<LiveIcon />}
                        size="small" 
                        label="Live Session" 
                        color="success" 
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                    {isComplete && (
                      <Chip 
                        icon={<CompletedIcon />}
                        size="small" 
                        label="Completed" 
                        color="primary"
                      />
                    )}
                    {!hasActive && !isComplete && c.published && (
                      <Chip 
                        icon={<PlayIcon />}
                        size="small" 
                        label="Available" 
                        color="default"
                      />
                    )}
                  </Stack>
                  <Button onClick={()=> navigate(`/catalog/${c.id}`)} variant="outlined" size="small">View</Button>
                </CardActions>
              </Card>
            </Grid>
          )
        })}
      </Grid>
      <DocsFab href="/docs/player" label="Open Player Handbook" />
    </Box>
  )
}
