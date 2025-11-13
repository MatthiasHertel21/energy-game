import React, { useEffect, useState } from 'react'
import { Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Skeleton, Box, Switch, FormControlLabel, Select, MenuItem, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { Groups as GroupsIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

export default function Cohorts(){
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [csv, setCsv] = useState('')
  const [selected, setSelected] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [startCamp, setStartCamp] = useState(null)
  const [startScenarios, setStartScenarios] = useState([])
  const [startScenarioId, setStartScenarioId] = useState('')
  const [startMode, setStartMode] = useState('isolated_per_player')
  const [editDialog, setEditDialog] = useState(null)
  const [editName, setEditName] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [members, setMembers] = useState([])
  const navigate = useNavigate()
  
  const load = async ()=>{ 
    setLoading(true)
    try {
      const { data } = await api.get('/api/cohorts')
      setList(data)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(()=>{ load() },[])
  const create = async ()=>{ await api.post('/api/cohorts', { name }); setName(''); load() }
  const importCsv = async ()=>{ if(!selected) return; await api.post(`/api/cohorts/${selected}/players`, { csv }); setCsv(''); loadMembers(selected) }
  
  const openEdit = (cohort) => {
    setEditDialog(cohort)
    setEditName(cohort.name)
  }
  
  const saveEdit = async () => {
    if (!editDialog) return
    try {
      await api.patch(`/api/cohorts/${editDialog.id}`, { name: editName })
      if (window.__showSnack) window.__showSnack('Cohort renamed', 'success')
      load()
      setEditDialog(null)
    } catch (e) {
      if (window.__showSnack) window.__showSnack('Failed to rename cohort', 'error')
    }
  }
  
  const openDelete = (cohort) => {
    setDeleteDialog(cohort)
  }
  
  const confirmDelete = async () => {
    if (!deleteDialog) return
    try {
      await api.delete(`/api/cohorts/${deleteDialog.id}`)
      if (window.__showSnack) window.__showSnack('Cohort deleted', 'success')
      if (selected === deleteDialog.id) setSelected(null)
      load()
      setDeleteDialog(null)
    } catch (e) {
      if (window.__showSnack) window.__showSnack('Failed to delete cohort', 'error')
    }
  }
  
  const loadMembers = async (cid) => {
    try {
      const { data } = await api.get(`/api/cohorts/${cid}/members`)
      setMembers(data || [])
    } catch (e) {
      setMembers([])
    }
  }
  
  const removeMember = async (userId) => {
    if (!selected) return
    try {
      await api.delete(`/api/cohorts/${selected}/players/${userId}`)
      if (window.__showSnack) window.__showSnack('Member removed', 'success')
      loadMembers(selected)
    } catch (e) {
      if (window.__showSnack) window.__showSnack('Failed to remove member', 'error')
    }
  }
  
  const loadCampaigns = async (cid)=>{
    try{
      const { data } = await api.get(`/api/cohorts/${cid}/campaigns`)
      setCampaigns(data||[])
    }catch(e){ setCampaigns([]) }
  }
  useEffect(()=>{ 
    if(selected){ 
      loadCampaigns(selected)
      loadMembers(selected)
    } 
  },[selected])
  const toggleCampaign = async (campId, key, val)=>{
    try{
      await api.patch(`/api/cohorts/${selected}/campaigns/${campId}`, { [key]: val })
      setCampaigns(list=> list.map(c=> c.campaign_id===campId ? ({ ...c, [key]: val }) : c))
    }catch(e){}
  }
  const openFromCampaign = async (campId, name)=>{
    setStartCamp({ id: campId, name })
    try{
      const { data } = await api.get(`/api/kse/campaigns/${campId}/scenarios`)
      const onlyActive = (campaigns.find(c=> c.campaign_id===campId)?.active) === true
      const list = (data||[])
      setStartScenarios(list)
      setStartScenarioId(list[0]?.scenario_id || '')
      if(!onlyActive){
        if (window.__showSnack) window.__showSnack('Campaign is not active for this cohort. Activate to allow multiplayer.', 'warning')
      }
    }catch(e){ setStartScenarios([]); setStartScenarioId('') }
  }
  const startSession = async ()=>{
    if(!selected || !startScenarioId) return
    try{
      await api.post('/api/sessions', { cohort_id: selected, scenario_id: Number(startScenarioId), mode: startMode })
      if(window.__showSnack) window.__showSnack('Session started', 'success')
      navigate('/trainer')
    }catch(e){}
  }
  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Cohorts</Typography>
      <Stack direction="row" spacing={2}>
        <TextField size="small" label="Name" value={name} onChange={e=>setName(e.target.value)} />
        <Button variant="contained" onClick={create}>Create</Button>
      </Stack>
      
      {loading ? (
        <Box sx={{ mt: 2 }}>
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1 }} />
          ))}
        </Box>
      ) : list.length === 0 ? (
        <EmptyState 
          icon={GroupsIcon}
          title="No cohorts yet"
          message="Create your first cohort to organize students into groups"
          actionLabel="Create Cohort"
          onAction={() => document.querySelector('input[label="Name"]')?.focus()}
        />
      ) : (
        <>
      <Table size="small" sx={{ mt:2 }}>
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Trainer</TableCell><TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map(c=> (
            <TableRow key={c.id}>
              <TableCell>{c.id}</TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.trainer_id}</TableCell>
              <TableCell>
                <Button size="small" onClick={()=> setSelected(c.id)}>Select</Button>
                <IconButton size="small" onClick={()=> openEdit(c)} title="Edit name" aria-label="Edit cohort name">
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={()=> openDelete(c)} title="Delete cohort" color="error" aria-label="Delete cohort">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
        </>
      )}
      {selected && (
        <Stack spacing={1} sx={{ mt:2 }} data-testid="cohorts-import-section">
          <Typography variant="subtitle1">Import Players (CSV, one email per line)</Typography>
          <TextField inputProps={{ 'data-testid': 'cohorts-csv' }} label="CSV" multiline minRows={4} value={csv} onChange={e=>setCsv(e.target.value)} />
          <Button variant="outlined" data-testid="cohorts-import-btn" onClick={importCsv}>Import</Button>
          
          {members.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Members ({members.length})</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map(m => (
                    <TableRow key={m.user_id}>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>{m.name || '-'}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => removeMember(m.user_id)} color="error" title="Remove from cohort" aria-label="Remove member from cohort">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      )}
      {selected && (
        <Box sx={{ mt:3 }}>
          <Typography variant="h6">Campaigns for Cohort #{selected}</Typography>
          {campaigns.length===0 ? (
            <Typography variant="body2" color="text.secondary">No campaigns</Typography>
          ) : (
            <Table size="small" sx={{ mt:1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Published</TableCell>
                  <TableCell>Visible</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {campaigns.map(c=> (
                  <TableRow key={c.campaign_id}>
                    <TableCell>{c.campaign_id}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.published ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <FormControlLabel control={<Switch checked={!!c.visible} onChange={(e)=> toggleCampaign(c.campaign_id, 'visible', e.target.checked)} />} label="" />
                    </TableCell>
                    <TableCell>
                      <FormControlLabel control={<Switch checked={!!c.active} onChange={(e)=> toggleCampaign(c.campaign_id, 'active', e.target.checked)} />} label="" />
                    </TableCell>
                    <TableCell>
                      <Button size="small" disabled={!c.active} onClick={()=> openFromCampaign(c.campaign_id, c.name)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {startCamp && (
            <Box sx={{ mt:2, p:2, border:'1px solid #e0e0e0', borderRadius:1 }}>
              <Typography variant="subtitle1">Open session from: {startCamp.name}</Typography>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt:1 }}>
                <Select size="small" value={startScenarioId} onChange={e=> setStartScenarioId(e.target.value)} displayEmpty sx={{ minWidth: 260 }}>
                  <MenuItem value=""><em>Select scenario</em></MenuItem>
                  {startScenarios.map(s=> <MenuItem key={s.scenario_id} value={s.scenario_id}>{s.name}</MenuItem>)}
                </Select>
                <Select size="small" value={startMode} onChange={e=> setStartMode(e.target.value)}>
                  <MenuItem value="isolated_per_player">Isolated per player</MenuItem>
                  <MenuItem value="shared_market">Shared market</MenuItem>
                </Select>
                <Button variant="contained" disabled={!startScenarioId} onClick={startSession}>Start</Button>
                <Button onClick={()=> { setStartCamp(null); setStartScenarios([]); setStartScenarioId('') }}>Cancel</Button>
              </Stack>
            </Box>
          )}
        </Box>
      )}
      
      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)}>
        <DialogTitle>Edit Cohort Name</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>Cancel</Button>
          <Button onClick={saveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Cohort?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog?.name}"? 
            All members and campaign mappings will be removed. Sessions will be preserved.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}