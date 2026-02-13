import React, { useEffect, useState } from 'react'
import { Box, Grid, Card, CardMedia, CardContent, Typography, CardActions, Button, Chip, LinearProgress, Stack, Badge, IconButton, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Switch, FormControlLabel, Paper, ListItemText, Select, Divider } from '@mui/material'
import { PlayArrow as PlayIcon, Lock as LockIcon, CheckCircle as CompletedIcon, FiberManualRecord as LiveIcon, MoreVert as MoreVertIcon, Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, ArrowUpward, ArrowDownward } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import DocsFab from '../components/DocsFab'
import useAuth from '../store/auth'

export default function Catalog(){
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuCampaign, setMenuCampaign] = useState(null)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [scenarios, setScenarios] = useState([])
  const [mapping, setMapping] = useState([])
  const [assignScenarioId, setAssignScenarioId] = useState('')
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  useEffect(()=>{
    let mounted = true
    setLoading(true)
    
    // Load campaigns and active sessions in parallel
    // For designers/trainers/admins, use KSE endpoint to see all campaigns
    const hasDesignerRights = user && (user.role === 'designer' || user.role === 'trainer' || user.role === 'admin')
    
    const campaignsPromise = hasDesignerRights 
      ? api.get('/api/kse/campaigns')
      : api.get('/api/catalog/campaigns', { params: { for_me: 1, active: 1 } })
    
    Promise.all([
      campaignsPromise,
      api.get('/api/me/sessions'),
      hasDesignerRights ? api.get('/api/kse/scenarios') : Promise.resolve({ data: [] })
    ]).then(([campaignRes, sessionRes, scenarioRes])=>{
      if(mounted) {
        setRows(campaignRes.data)
        setSessions(sessionRes.data || [])
        setScenarios(scenarioRes.data || [])
      }
    }).catch(()=>{
      if(mounted) setRows([])
    }).finally(()=> { if(mounted) setLoading(false) })
    
    return ()=>{ mounted = false }
  },[user])
  
  const getActiveSession = (campaignId) => {
    const found = sessions.find(s =>
      s.campaign_id === campaignId &&
      (s.status === 'running' || s.status === 'paused' || s.status === 'round_results' || s.status === 'round_active' || s.status === 'briefing') &&
      s.mode !== 'isolated_per_player'
    )
    
    // Debug logging
    if (campaignId === 1) {
      console.log('[Catalog] Campaign 1 - Sessions:', sessions)
      console.log('[Catalog] Campaign 1 - Active session found:', found)
      sessions.forEach(s => {
        const matches = s.campaign_id === campaignId &&
          (s.status === 'running' || s.status === 'paused' || s.status === 'round_results' || s.status === 'round_active' || s.status === 'briefing') &&
          s.mode !== 'isolated_per_player'
        console.log(`[Catalog] Session ${s.id}: campaign_id=${s.campaign_id}, status=${s.status}, mode=${s.mode}, matches=${matches}`)
      })
    }
    
    return found
  }
  
  // Check if campaign is completed
  const isCompleted = (campaign) => {
    const completed = campaign.progress?.completed || 0
    const total = campaign.progress?.total || 0
    return total > 0 && completed === total
  }
  
  // Check if user has designer rights or higher (designer, trainer, admin)
  const hasDesignerRights = user && (user.role === 'designer' || user.role === 'trainer' || user.role === 'admin')
  
  // Reload campaigns
  const reloadCampaigns = async () => {
    try {
      const hasDesignerRights = user && (user.role === 'designer' || user.role === 'trainer' || user.role === 'admin')
      const res = hasDesignerRights
        ? await api.get('/api/kse/campaigns')
        : await api.get('/api/catalog/campaigns', { params: { for_me: 1, active: 1 } })
      setRows(res.data)
    } catch (e) {
      console.error('Failed to reload campaigns:', e)
    }
  }
  
  // Toggle published status of a campaign
  const handleTogglePublished = async (e, campaign) => {
    e.stopPropagation()
    
    const newPublishedStatus = !campaign.published
    
    try {
      await api.patch(`/api/kse/campaigns/${campaign.id}`, {
        published: newPublishedStatus
      })
      if (window.__showSnack) {
        window.__showSnack(
          newPublishedStatus ? 'Campaign published' : 'Campaign unpublished',
          'success'
        )
      }
      await reloadCampaigns()
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to update campaign'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Create new campaign
  const handleCreateCampaign = async () => {
    const name = window.prompt('Campaign Name:')
    if (!name) return
    
    try {
      await api.post('/api/kse/campaigns', { name, description: '' })
      if (window.__showSnack) window.__showSnack('Campaign created', 'success')
      await reloadCampaigns()
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to create campaign'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Open burger menu
  const handleMenuOpen = (event, campaign) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setMenuCampaign(campaign)
  }
  
  // Close burger menu
  const handleMenuClose = () => {
    setAnchorEl(null)
    setMenuCampaign(null)
  }
  
  // Delete campaign
  const handleDeleteCampaign = async () => {
    handleMenuClose()
    
    if (!menuCampaign) return
    
    const confirmMsg = menuCampaign.published 
      ? '⚠️ WARNING: This campaign is PUBLISHED!\n\nDeleting it will remove it from the catalog immediately. Continue?'
      : 'Delete this campaign? This action cannot be undone.'
    
    if (!window.confirm(confirmMsg)) return
    
    try {
      await api.delete(`/api/kse/campaigns/${menuCampaign.id}`)
      if (window.__showSnack) window.__showSnack('Campaign deleted', 'success')
      await reloadCampaigns()
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to delete campaign'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Open properties modal
  const handleOpenProperties = async () => {
    setEditingCampaign({
      ...menuCampaign,
      name: menuCampaign.name || '',
      description: menuCampaign.description || '',
      published: !!menuCampaign.published,
      cover_image_url: menuCampaign.cover_image_url || ''
    })
    
    // Load scenario mappings for this campaign
    try {
      const { data } = await api.get(`/api/kse/campaigns/${menuCampaign.id}/scenarios`)
      setMapping(data || [])
    } catch (e) {
      setMapping([])
    }
    
    setPropertiesOpen(true)
    handleMenuClose()
  }
  
  // Close properties modal
  const handleCloseProperties = () => {
    setPropertiesOpen(false)
    setEditingCampaign(null)
    setMapping([])
    setAssignScenarioId('')
  }
  
  // Save properties
  const handleSaveProperties = async () => {
    if (!editingCampaign) return
    
    try {
      await api.patch(`/api/kse/campaigns/${editingCampaign.id}`, {
        name: editingCampaign.name,
        description: editingCampaign.description
      })
      if (window.__showSnack) window.__showSnack('Campaign updated', 'success')
      await reloadCampaigns()
      handleCloseProperties()
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to update campaign'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Upload cover image
  const handleUploadCover = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editingCampaign) return
    
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true)
    
    try {
      const { data } = await api.post(`/api/kse/campaigns/${editingCampaign.id}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setEditingCampaign({ ...editingCampaign, cover_image_url: data.cover_image_url })
      if (window.__showSnack) window.__showSnack('Cover image uploaded', 'success')
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to upload image'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    } finally {
      setUploading(false)
    }
  }
  
  // Assign scenario to campaign
  const handleAssignScenario = async () => {
    if (!assignScenarioId || !editingCampaign) return
    
    try {
      const order_index = mapping.length
      await api.post(`/api/kse/campaigns/${editingCampaign.id}/scenarios`, { 
        scenario_id: Number(assignScenarioId), 
        order_index 
      })
      const { data } = await api.get(`/api/kse/campaigns/${editingCampaign.id}/scenarios`)
      setMapping(data)
      setAssignScenarioId('')
      if (window.__showSnack) window.__showSnack('Scenario added', 'success')
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to add scenario'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Remove scenario from campaign
  const handleRemoveScenario = async (scenario_id) => {
    if (!editingCampaign) return
    
    try {
      await api.delete(`/api/kse/campaigns/${editingCampaign.id}/scenarios/${scenario_id}`)
      const newMapping = mapping.filter(m => m.scenario_id !== scenario_id).map((m, i) => ({ ...m, order_index: i }))
      setMapping(newMapping)
      await api.put(`/api/kse/campaigns/${editingCampaign.id}/scenarios/reorder`, newMapping.map((m, i) => ({ scenario_id: m.scenario_id, order_index: i })))
      if (window.__showSnack) window.__showSnack('Scenario removed', 'success')
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to remove scenario'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Move scenario up/down
  const handleMoveScenario = async (idx, dir) => {
    if (!editingCampaign) return
    
    const next = [...mapping]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    const payload = next.map((m, i) => ({ scenario_id: m.scenario_id, order_index: i }))
    setMapping(next)
    
    try {
      await api.put(`/api/kse/campaigns/${editingCampaign.id}/scenarios/reorder`, payload)
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to reorder scenarios'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }
  
  // Toggle scenario flags
  const handleToggleFlag = async (scenario_id, key, val) => {
    if (!editingCampaign) return
    
    try {
      await api.patch(`/api/kse/campaigns/${editingCampaign.id}/scenarios/${scenario_id}`, { [key]: val })
      setMapping(map => map.map(m => m.scenario_id === scenario_id ? ({ ...m, [key]: val }) : m))
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to update scenario'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
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
          const liveSession = getActiveSession(c.id)
          const hasActive = !!liveSession
          const isComplete = isCompleted(c)
          
          return (
            <Grid key={c.id} item xs={12} sm={6} md={4}>
              <Card 
                sx={{ 
                  display:'flex', 
                  flexDirection:'column', 
                  height:'100%',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4
                  }
                }}
                onClick={() => navigate(`/catalog/${c.id}`)}
              >
                <Box sx={{ position: 'relative' }}>
                  <CardMedia component="img" height="160" image={c.cover_image_url || '/logo.svg'} alt={c.name} sx={{ objectFit:'cover', bgcolor:'#f5f5f5' }} />
                  
                  {/* Burger menu - only for designers/admins */}
                  {hasDesignerRights && (
                    <IconButton
                      aria-label="campaign options"
                      onClick={(e) => handleMenuOpen(e, c)}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': {
                          bgcolor: 'rgba(255, 255, 255, 1)',
                        }
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" noWrap>{c.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', minHeight: 40 }}>{c.description}</Typography>
                  <Box sx={{ mt:1 }}>
                    <LinearProgress variant="determinate" value={pct} />
                    <Typography variant="caption">{completed}/{total} scenarios completed</Typography>
                  </Box>
                </CardContent>
                <CardActions sx={{ mt:'auto', justifyContent: 'space-between', alignItems: 'center', px: 2, pb: 2 }}>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {/* Toggleable Published/Draft chip - only for designers/trainers/admins */}
                    {hasDesignerRights && (
                      <Chip 
                        size="small" 
                        label={c.published ? "Published" : "Draft"}
                        color={c.published ? "success" : "warning"}
                        onClick={(e) => handleTogglePublished(e, c)}
                        sx={{ cursor: 'pointer' }}
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
                    {!hasActive && !isComplete && c.published && !hasDesignerRights && (
                      <Chip 
                        icon={<PlayIcon />}
                        size="small" 
                        label="Available" 
                        color="default"
                      />
                    )}
                  </Stack>
                  {hasActive && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/player?sessionId=${liveSession.id}`)
                      }}
                      variant="contained"
                      size="small"
                      color="success"
                      startIcon={<LiveIcon />}
                    >
                      Join Live
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          )
        })}
        
        {/* New Campaign Card - only for designers/admins - at the end */}
        {hasDesignerRights && (
          <Grid item xs={12} sm={6} md={4}>
            <Card 
              sx={{ 
                display:'flex', 
                flexDirection:'column', 
                height:'100%',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                border: '2px dashed',
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                  bgcolor: 'action.selected'
                }
              }}
              onClick={handleCreateCampaign}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320, gap: 2 }}>
                <AddIcon sx={{ fontSize: 64, color: 'primary.main' }} />
                <Typography variant="h6" color="primary">New Campaign</Typography>
              </Box>
            </Card>
          </Grid>
        )}
      </Grid>
      
      {/* Burger Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleOpenProperties}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Properties
        </MenuItem>
        <MenuItem onClick={handleDeleteCampaign} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete Campaign
        </MenuItem>
      </Menu>
      
      {/* Properties Modal */}
      <Dialog
        open={propertiesOpen}
        onClose={handleCloseProperties}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '80vh',
            maxHeight: '800px'
          }
        }}
      >
        <DialogTitle>Campaign Properties</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column' }}>
          <Stack spacing={3} sx={{ mt: 1, flexShrink: 0 }}>
            {/* Cover Image with Name and Description next to it */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              {/* Image with Upload button overlay */}
              <Box sx={{ position: 'relative' }}>
                <img 
                  src={editingCampaign?.cover_image_url || '/logo.svg'} 
                  alt="cover" 
                  style={{ width: 240, height: 240, objectFit:'cover', background:'#f5f5f5', borderRadius: 4 }} 
                />
                <Button 
                  component="label" 
                  disabled={uploading}
                  variant="contained"
                  size="small"
                  sx={{ 
                    position: 'absolute', 
                    bottom: 8, 
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    opacity: 0.9,
                    '&:hover': {
                      opacity: 1
                    }
                  }}
                >
                  Upload New Image
                  <input type="file" accept="image/*" hidden onChange={handleUploadCover} />
                </Button>
              </Box>
              
              {/* Name, Description, Published */}
              <Stack spacing={2} sx={{ flexGrow: 1 }}>
                <TextField
                  label="Campaign Name"
                  value={editingCampaign?.name || ''}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                  fullWidth
                  required
                />
                
                <TextField
                  label="Description"
                  value={editingCampaign?.description || ''}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                  multiline
                  minRows={7}
                  fullWidth
                />
              </Stack>
            </Box>
            
            <Divider sx={{ flexShrink: 0 }} />
            
            {/* Scenario Assignment */}
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold', flexShrink: 0 }}>
                Assigned Scenarios
              </Typography>
              
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexShrink: 0 }}>
                <Select 
                  native 
                  size="small" 
                  value={assignScenarioId} 
                  onChange={e => setAssignScenarioId(e.target.value)} 
                  displayEmpty 
                  sx={{ minWidth: 260 }}
                >
                  <option value="">Select scenario</option>
                  {scenarios.filter(s => !mapping.find(m => m.scenario_id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button onClick={handleAssignScenario} variant="outlined" disabled={!assignScenarioId}>
                  Add
                </Button>
              </Stack>
              
              {mapping.length === 0 ? (
                <EmptyState title="No scenarios" message="Assign scenarios to this campaign" />
              ) : (
                <Box sx={{ overflow: 'auto', flexGrow: 1, minHeight: 0 }}>
                  <Stack spacing={1}>
                  {mapping.map((m, idx) => (
                    <Paper key={m.scenario_id} variant="outlined" sx={{ p: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <IconButton size="small" onClick={() => handleMoveScenario(idx, -1)} aria-label="move up">
                          <ArrowUpward fontSize="inherit" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleMoveScenario(idx, 1)} aria-label="move down">
                          <ArrowDownward fontSize="inherit" />
                        </IconButton>
                        <ListItemText primary={m.name} secondary={`Order ${idx + 1}`} />
                        <FormControlLabel 
                          control={
                            <Switch 
                              checked={!!m.solo_enabled} 
                              onChange={(e) => handleToggleFlag(m.scenario_id, 'solo_enabled', e.target.checked)} 
                            />
                          } 
                          label="Solo" 
                        />
                        <FormControlLabel 
                          control={
                            <Switch 
                              checked={!!m.cohort_enabled} 
                              onChange={(e) => handleToggleFlag(m.scenario_id, 'cohort_enabled', e.target.checked)} 
                            />
                          } 
                          label="Cohort" 
                        />
                        <IconButton 
                          onClick={() => navigate(`/kse?id=${m.scenario_id}`)} 
                          aria-label="edit" 
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton 
                          onClick={() => handleRemoveScenario(m.scenario_id)} 
                          aria-label="remove"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </Paper>
                  ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseProperties}>Cancel</Button>
          <Button onClick={handleSaveProperties} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
      
      <DocsFab href="/docs/player" label="Open Player Handbook" />
    </Box>
  )
}
