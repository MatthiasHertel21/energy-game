import React, { useEffect, useState } from 'react'
import { Box, Grid, Card, CardMedia, CardContent, Typography, CardActions, Button, Chip, LinearProgress } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

export default function Catalog(){
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
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

  if(loading) return <Box sx={{ mt:4 }}><LinearProgress /></Box>
  if(!rows || rows.length===0) return <EmptyState title="No campaigns" message="Published campaigns will appear here." />

  return (
    <Box>
      <Typography variant="h4" sx={{ mb:2 }}>Campaign Catalog</Typography>
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
    </Box>
  )
}
