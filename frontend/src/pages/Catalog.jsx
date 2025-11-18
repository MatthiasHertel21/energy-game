import React, { useEffect, useState } from 'react'
import { Box, Grid, Card, CardMedia, CardContent, Typography, CardActions, Button, Chip, LinearProgress, Alert, Stack } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { MenuBook as BriefingIcon, Login as JoinIcon } from '@mui/icons-material'
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
    api.get('/api/catalog/campaigns', { params: { for_me: 1, active: 1 } }).then(({data})=>{
      if(mounted) setRows(data)
    }).catch(()=>{
      if(mounted) setRows([])
    }).finally(()=> setLoading(false))
    return ()=>{ mounted = false }
  },[])

  // Load active sessions
  useEffect(()=>{
    api.get('/api/me/sessions').then(({data})=> {
      const active = (data || []).filter(s => s.status === 'running' || s.status === 'created')
      setSessions(active)
    }).catch(()=> setSessions([]))
  },[])

  if(loading) return <Box sx={{ mt:4 }}><LinearProgress /></Box>
  if(!rows || rows.length===0) return <EmptyState title="No campaigns" message="Published campaigns will appear here." />

  return (
    <Box>
      <Typography variant="h4" sx={{ mb:2 }}>Campaign Catalog</Typography>
      
      {/* Active Sessions Info */}
      {sessions.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600}>
            Active Sessions: {sessions.length}
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {sessions.map(s => (
              <Box key={s.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2">
                  {s.scenario_name || `Session ${s.id}`} ({s.cohort_name || 'Solo'})
                </Typography>
                <Button 
                  size="small" 
                  startIcon={<BriefingIcon />}
                  onClick={() => navigate(`/briefing/${s.id}`)}
                >
                  Briefing
                </Button>
                <Button 
                  size="small" 
                  variant="outlined"
                  startIcon={<JoinIcon />}
                  onClick={() => navigate(`/player?sessionId=${s.id}`)}
                >
                  Join
                </Button>
              </Box>
            ))}
          </Stack>
        </Alert>
      )}
      
      <Grid container spacing={2}>
        {rows.map(c => {
          const completed = c.progress?.completed || 0
          const total = c.progress?.total || 0
          const pct = total>0 ? Math.round(completed*100/total) : 0
          return (
            <Grid key={c.id} item xs={12} sm={6} md={4}>
              <Card sx={{ display:'flex', flexDirection:'column', height:'100%' }}>
                <CardMedia component="img" height="160" image={c.cover_image_url || '/logo.svg'} alt={c.name} sx={{ objectFit:'cover', bgcolor:'#f5f5f5' }} />
                <CardContent>
                  <Typography variant="h6" noWrap>{c.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{c.description}</Typography>
                  <Box sx={{ mt:1 }}>
                    <LinearProgress variant="determinate" value={pct} />
                    <Typography variant="caption">{completed}/{total} completed</Typography>
                  </Box>
                </CardContent>
                <CardActions sx={{ mt:'auto' }}>
                  <Chip size="small" label="Published" color="success" />
                  <Box sx={{ flexGrow:1 }} />
                  <Button onClick={()=> navigate(`/catalog/${c.id}`)} variant="outlined">View</Button>
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
