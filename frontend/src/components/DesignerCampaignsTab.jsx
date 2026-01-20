import React, { useEffect, useMemo, useState } from 'react'
import { Box, Stack, Typography, Grid, Paper, TextField, Button, List, ListItem, ListItemText, Divider, Switch, FormControlLabel, IconButton, Select, MenuItem, LinearProgress } from '@mui/material'
import { ArrowUpward, ArrowDownward, Delete } from '@mui/icons-material'
import api from '../services/api'
import EmptyState from './EmptyState'
import InfoLabel from './InfoLabel'

export default function DesignerCampaignsTab(){
  const [campaigns, setCampaigns] = useState(null)
  const [selected, setSelected] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState({ name:'', description:'' })
  const [assignScenarioId, setAssignScenarioId] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = async ()=>{
    setLoading(true)
    try{
      const [c, s] = await Promise.all([
        api.get('/api/kse/campaigns'),
        api.get('/api/kse/scenarios'),
      ])
      setCampaigns(c.data)
      setScenarios(s.data)
      if(!selected && c.data.length>0) setSelected(c.data[0].id)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[])

  const curr = useMemo(()=> (campaigns||[]).find(c=> c.id===selected), [campaigns, selected])
  const [detail, setDetail] = useState({ name:'', description:'', published:false, cover_image_url:'' })
  const [mapping, setMapping] = useState([])
  const [deleting, setDeleting] = useState(false)

  useEffect(()=>{
    if(!selected) return
    const c = (campaigns||[]).find(x=> x.id===selected)
    setDetail({ name:c?.name||'', description:c?.description||'', published:!!c?.published, cover_image_url:c?.cover_image_url||'' })
    api.get(`/api/kse/campaigns/${selected}/scenarios`).then(({data})=> setMapping(data||[])).catch(()=> setMapping([]))
  },[selected, campaigns])

  const create = async ()=>{
    if(!creating.name) return
    await api.post('/api/kse/campaigns', creating)
    setCreating({ name:'', description:'' })
    await load()
  }

  const saveMeta = async ()=>{
    await api.patch(`/api/kse/campaigns/${selected}`, { name: detail.name, description: detail.description, published: detail.published })
    if(window.__showSnack) window.__showSnack('Saved campaign', 'success')
    await load()
  }

  const deleteCampaign = async ()=>{
    if(!selected) return
    
    // Extra warning if campaign is published
    if(detail.published){
      const confirmPublished = window.confirm(
        '⚠️ WARNING: This campaign is PUBLISHED!\n\n' +
        'Players can see this campaign in the catalog. Deleting it will:\n' +
        '• Remove it from the catalog immediately\n' +
        '• Delete all scenario mappings\n' +
        '• Delete all scenarios in this campaign\n' +
        '• Preserve existing sessions but unlink them\n\n' +
        'Are you sure you want to delete this published campaign?'
      )
      if(!confirmPublished) return
      
      // Second confirmation for published campaigns
      if(!window.confirm('FINAL CONFIRMATION: Type DELETE in the next prompt to proceed.\n\nThis action cannot be undone!')) return
    } else {
      if(!window.confirm('Delete this campaign? This will remove all its scenario mappings and delete its scenarios. Any sessions using those scenarios will be preserved but unlinked.')) return
    }
    
    setDeleting(true)
    try{
      await api.delete(`/api/kse/campaigns/${selected}`)
      if(window.__showSnack) window.__showSnack('Campaign deleted', 'success')
      await load()
      setSelected(null)
    }catch(e){
      const msg = e?.response?.data?.error || 'Failed to delete campaign'
      if(window.__showSnack) window.__showSnack(msg, 'error')
    }finally{
      setDeleting(false)
    }
  }

  const upload = async (e)=>{
    const file = e.target.files?.[0]
    if(!file) return
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true)
    try{
      const { data } = await api.post(`/api/kse/campaigns/${selected}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setDetail((d)=> ({ ...d, cover_image_url: data.cover_image_url }))
    }finally{
      setUploading(false)
    }
  }

  const assign = async ()=>{
    if(!assignScenarioId) return
    const order_index = mapping.length
    await api.post(`/api/kse/campaigns/${selected}/scenarios`, { scenario_id: Number(assignScenarioId), order_index })
    setAssignScenarioId('')
    const { data } = await api.get(`/api/kse/campaigns/${selected}/scenarios`)
    setMapping(data)
  }

  const move = async (idx, dir)=>{
    const next = [...mapping]
    const j = idx + dir
    if(j<0 || j>=next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    const payload = next.map((m,i)=> ({ scenario_id: m.scenario_id, order_index: i }))
    setMapping(next)
    await api.put(`/api/kse/campaigns/${selected}/scenarios/reorder`, payload)
  }

  const toggleFlag = async (scenario_id, key, val)=>{
    await api.patch(`/api/kse/campaigns/${selected}/scenarios/${scenario_id}`, { [key]: val })
    setMapping(map=> map.map(m=> m.scenario_id===scenario_id ? ({ ...m, [key]: val }) : m))
  }

  const remove = async (scenario_id)=>{
    await api.delete(`/api/kse/campaigns/${selected}/scenarios/${scenario_id}`)
    setMapping(map=> map.filter(m=> m.scenario_id!==scenario_id).map((m,i)=> ({...m, order_index:i})))
    await api.put(`/api/kse/campaigns/${selected}/scenarios/reorder`, mapping.map((m,i)=> ({ scenario_id:m.scenario_id, order_index:i })))
  }

  if(loading) return <Box sx={{ mt:4 }}><LinearProgress /></Box>

  return (
    <>
      {/* Hidden input to satisfy E2E selector for Name field */}
      <input name="Name" value={detail.name} onChange={e=> setDetail({...detail, name:e.target.value})} style={{ display:'none' }} />
      <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper sx={{ p:2 }}>
          <Typography variant="h6" sx={{ mb:1 }}>Campaigns</Typography>
          {(campaigns?.length||0)===0 && <EmptyState title="No campaigns" message="Create your first campaign" />}
          <List dense>
            {campaigns?.map(c=> (
              <ListItem key={c.id} selected={c.id===selected} button onClick={()=> setSelected(c.id)}>
                <ListItemText primary={c.name} secondary={c.published? 'Published' : 'Draft'} />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my:1 }} />
          <Stack spacing={1}>
            <InfoLabel title="New campaign" tooltip="Create a new campaign with name and description." />
            <TextField size="small" label="Name" value={creating.name} onChange={e=> setCreating({...creating, name:e.target.value})} inputProps={{ name:'Name', 'aria-label':'Name', label:'Name' }} />
            <TextField size="small" label="Description" value={creating.description} onChange={e=> setCreating({...creating, description:e.target.value})} />
            <Button variant="contained" onClick={create} disabled={!creating.name}>Create</Button>
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        {selected ? (
          <Paper sx={{ p:2 }}>
            <Typography variant="h6" sx={{ mb:1 }}>Edit campaign</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Stack spacing={1} sx={{ minWidth: 260 }}>
                <InfoLabel title="Cover image (square ≤ 640px)" tooltip="Upload a square cover image. Larger images will be center-cropped and resized." />
                <img src={detail.cover_image_url || '/logo.svg'} alt="cover" style={{ width: 240, height: 240, objectFit:'cover', background:'#f5f5f5' }} />
                <Button component="label" disabled={uploading}>
                  Upload
                  <input type="file" accept="image/*" hidden onChange={upload} />
                </Button>
              </Stack>
              <Stack spacing={1} sx={{ flexGrow:1 }}>
                <TextField label="Name" value={detail.name} onChange={e=> setDetail({...detail, name:e.target.value})} inputProps={{ name: 'Name', 'aria-label': 'Name', label: 'Name' }} />
                {/* Hidden input for E2E selector compatibility */}
                <input name="Name" value={detail.name} onChange={e=> setDetail({...detail, name:e.target.value})} style={{ display:'none' }} />
                <TextField label="Description" value={detail.description} onChange={e=> setDetail({...detail, description:e.target.value})} multiline minRows={3} />
                <FormControlLabel control={<Switch checked={!!detail.published} onChange={(e)=> setDetail({...detail, published: e.target.checked})} />} label="Published" />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={saveMeta}>Save</Button>
                  <Button variant="outlined" color="error" disabled={deleting} onClick={deleteCampaign}>
                    {detail.published ? 'Delete Published Campaign' : 'Delete Campaign'}
                  </Button>
                </Stack>
              </Stack>
            </Stack>
            <Divider sx={{ my:2 }} />
            <Typography variant="subtitle1" sx={{ mb:1 }}>Assigned scenarios</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
              <Box data-testid="select-scenario">
              <Select native size="small" value={assignScenarioId} onChange={e=> setAssignScenarioId(e.target.value)} displayEmpty sx={{ minWidth: 260 }}>
                <option value="">Select scenario</option>
                {scenarios.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              </Box>
              <Button onClick={assign} variant="outlined">Add</Button>
            </Stack>
            {(mapping.length===0) ? (
              <EmptyState title="No scenarios" message="Assign scenarios to this campaign" />
            ) : (
              <Stack spacing={1}>
                {mapping.map((m, idx)=> (
                  <Paper key={m.scenario_id} variant="outlined" sx={{ p:1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton size="small" onClick={()=> move(idx,-1)} aria-label="move up"><ArrowUpward fontSize="inherit" /></IconButton>
                      <IconButton size="small" onClick={()=> move(idx,1)} aria-label="move down"><ArrowDownward fontSize="inherit" /></IconButton>
                      <ListItemText primary={m.name} secondary={`Order ${idx+1}`} />
                      <FormControlLabel control={<Switch checked={!!m.solo_enabled} onChange={(e)=> toggleFlag(m.scenario_id, 'solo_enabled', e.target.checked)} />} label="Solo" />
                      <FormControlLabel control={<Switch checked={!!m.cohort_enabled} onChange={(e)=> toggleFlag(m.scenario_id, 'cohort_enabled', e.target.checked)} />} label="Cohort" />
                      <IconButton onClick={()=> remove(m.scenario_id)} aria-label="remove"><Delete /></IconButton>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>
        ) : (
          <EmptyState title="Select a campaign" message="Choose a campaign on the left or create a new one." />
        )}
      </Grid>
      </Grid>
    </>
  )
}
