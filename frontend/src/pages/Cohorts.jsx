import React, { useEffect, useState } from 'react'
import { Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Skeleton, Box, Switch, FormControlLabel, Select, MenuItem, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, TablePagination, Chip, Alert, InputAdornment, Toolbar } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { Groups as GroupsIcon, Edit as EditIcon, Delete as DeleteIcon, FileDownload as DownloadIcon, ContentCopy as CopyIcon, PlayArrow as SessionControlIcon, Add as AddIcon } from '@mui/icons-material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

export default function Cohorts(){
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [createDialog, setCreateDialog] = useState(false)
  const [detailsDialog, setDetailsDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(null)
  const [editName, setEditName] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [members, setMembers] = useState([])
  const [tab, setTab] = useState(0)
  const [activities, setActivities] = useState([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityPage, setActivityPage] = useState(0)
  const [activityLimit, setActivityLimit] = useState(50)
  const [activityFilters, setActivityFilters] = useState({ action_type: '', user_id: '' })
  const [cohortToken, setCohortToken] = useState('')
  const navigate = useNavigate()
  
  const load = async ()=>{ 
    setLoading(true)
    try {
      const { data } = await api.get('/api/cohorts')
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      setList([])
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(()=>{ load() },[])
  
  const create = async ()=>{ 
    await api.post('/api/cohorts', { name })
    setName('')
    setCreateDialog(false)
    load()
  }
  
  const openDetailsDialog = (cohortId) => {
    setSelected(cohortId)
    setTab(0)
    setDetailsDialog(true)
  }
  
  const closeDetailsDialog = () => {
    setDetailsDialog(false)
    setSelected(null)
    setTab(0)
  }
  

  
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
      const { data } = await api.get(`/api/cohorts/${cid}/players`)
      setMembers(data || [])
    } catch (e) {
      setMembers([])
    }
  }
  
  const loadCohortToken = async (cid) => {
    try {
      const { data } = await api.get(`/api/cohorts/${cid}`)
      setCohortToken(data.invite_token || '')
    } catch (e) {
      setCohortToken('')
    }
  }
  
  const copyToken = () => {
    const registrationUrl = `${window.location.origin}/register?token=${cohortToken}`
    navigator.clipboard.writeText(registrationUrl)
    if (window.__showSnack) window.__showSnack('Registration link copied to clipboard', 'success')
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
  
  const loadActivity = async (cid) => {
    if (!cid) return
    try {
      const params = {
        limit: activityLimit,
        offset: activityPage * activityLimit,
        ...activityFilters
      }
      const { data } = await api.get(`/api/cohorts/${cid}/activity`, { params })
      setActivities(data.activities || [])
      setActivityTotal(data.total || 0)
    } catch (e) {
      setActivities([])
      setActivityTotal(0)
    }
  }
  
  const exportActivityCSV = async () => {
    if (!selected) return
    try {
      const response = await api.get(`/api/cohorts/${selected}/activity`, {
        params: { format: 'csv', ...activityFilters },
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `cohort_${selected}_activity.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      if (window.__showSnack) window.__showSnack('Activity exported', 'success')
    } catch (e) {
      if (window.__showSnack) window.__showSnack('Failed to export', 'error')
    }
  }
  
  useEffect(()=>{ 
    if(selected){ 
      loadCampaigns(selected)
      loadMembers(selected)
      loadCohortToken(selected)
      if (tab === 2) loadActivity(selected)
    } else {
      // Clear members when no cohort selected
      setMembers([])
      setCampaigns([])
      setActivities([])
      setCohortToken('')
    }
  },[selected, tab, activityPage, activityLimit, activityFilters])
  const toggleCampaign = async (campId, key, val)=>{
    try{
      await api.patch(`/api/cohorts/${selected}/campaigns/${campId}`, { [key]: val })
      setCampaigns(list=> list.map(c=> c.campaign_id===campId ? ({ ...c, [key]: val }) : c))
    }catch(e){}
  }
  
  return (
    <Paper sx={{ p:2 }}>
      <Toolbar sx={{ pl: 0, pr: 0 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Trainer Panel</Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />}
          onClick={() => setCreateDialog(true)}
        >
          Create Cohort
        </Button>
      </Toolbar>
      
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
          message="Create your first cohort to organise students into groups"
          actionLabel="Create Cohort"
          onAction={() => setCreateDialog(true)}
        />
      ) : (
        <>
      <Table size="small" sx={{ mt:2 }}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Trainer</TableCell>
            <TableCell align="right">Members</TableCell>
            <TableCell align="right">Campaigns</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map(c=> (
            <TableRow key={c.id} hover onClick={()=> openDetailsDialog(c.id)} sx={{ cursor:'pointer' }}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.trainer_email || '—'}</TableCell>
              <TableCell align="right">{c.members_count ?? '—'}</TableCell>
              <TableCell>
                {c.campaigns && c.campaigns.length > 0 ? (
                  <Box>
                    {c.campaigns.map(camp => (
                      <Typography key={camp.id} variant="body2" sx={{ lineHeight: 1.4 }}>
                        {camp.name} ({camp.scenario_count})
                      </Typography>
                    ))}
                  </Box>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell onClick={(e)=> e.stopPropagation()}>
                <IconButton size="small" onClick={()=> navigate(`/session-control?cohort=${c.id}`)} title="Session Control" color="primary" aria-label="Session control">
                  <SessionControlIcon fontSize="small" />
                </IconButton>
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
      
      {/* Create Cohort Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)}>
        <DialogTitle>Create New Cohort</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Cohort Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
          <Button onClick={create} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
      
      {/* Cohort Details Dialog */}
      <Dialog open={detailsDialog} onClose={closeDetailsDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Cohort Details
        </DialogTitle>
        <DialogContent>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} aria-label="Cohort management tabs">
            <Tab label="Members" />
            <Tab label="Campaigns" />
            <Tab label="Activity" />
          </Tabs>
          
          {/* Tab 0: Members */}
          {tab === 0 && (
            <Box sx={{ mt: 2 }}>
              <Stack spacing={2}>
                {cohortToken && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Cohort Registration Link</Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Share this link with new members to register and automatically join this cohort:
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={`${window.location.origin}/register?token=${cohortToken}`}
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={copyToken} edge="end" size="small" title="Copy link">
                              <CopyIcon />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Alert>
                )}
                
                {members.length > 0 ? (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>Members ({members.length})</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Email</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Last Login</TableCell>
                          <TableCell align="right">Solo Sessions</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {members.map(m => (
                          <TableRow key={m.user_id}>
                            <TableCell>{m.email}</TableCell>
                            <TableCell>{m.name || '-'}</TableCell>
                            <TableCell>
                              {m.last_login ? new Date(m.last_login).toLocaleString() : 'Never'}
                            </TableCell>
                            <TableCell align="right">{m.solo_sessions || 0}</TableCell>
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
                ) : (
                  <Typography variant="body2" color="text.secondary">No members yet</Typography>
                )}
              </Stack>
            </Box>
          )}
          
          {/* Tab 1: Campaigns */}
          {tab === 1 && (
        <Box sx={{ mt:2 }}>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              To start a session for this cohort:
            </Typography>
            <Button variant="contained" onClick={() => { closeDetailsDialog(); navigate(`/session-control?cohort=${selected}`); }}>
              Session Control
            </Button>
          </Box>
        </Box>
          )}
          
          {/* Tab 2: Activity */}
          {tab === 2 && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Select
                  size="small"
                  value={activityFilters.action_type}
                  onChange={(e) => setActivityFilters({ ...activityFilters, action_type: e.target.value })}
                  displayEmpty
                  sx={{ minWidth: 200 }}
                  aria-label="Filter by action type"
                >
                  <MenuItem value="">All Actions</MenuItem>
                  <MenuItem value="login">Login</MenuItem>
                  <MenuItem value="forecast_submit">Forecast Submit</MenuItem>
                  <MenuItem value="session_join">Session Join</MenuItem>
                  <MenuItem value="type_select">Type Select</MenuItem>
                  <MenuItem value="round_complete">Round Complete</MenuItem>
                </Select>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportActivityCSV} aria-label="Export activity as CSV">
                  Export CSV
                </Button>
              </Stack>
              
              {activities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No activity recorded</Typography>
              ) : (
                <>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Timestamp</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell>Action</TableCell>
                        <TableCell>Session</TableCell>
                        <TableCell>Details</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activities.map(a => (
                        <TableRow key={a.id}>
                          <TableCell>{new Date(a.timestamp).toLocaleString()}</TableCell>
                          <TableCell>{a.user_email}</TableCell>
                          <TableCell>
                            <Chip label={a.action_type} size="small" />
                          </TableCell>
                          <TableCell>{a.session_id || '-'}</TableCell>
                          <TableCell>{JSON.stringify(a.details)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={activityTotal}
                    page={activityPage}
                    onPageChange={(e, p) => setActivityPage(p)}
                    rowsPerPage={activityLimit}
                    onRowsPerPageChange={(e) => { setActivityLimit(parseInt(e.target.value, 10)); setActivityPage(0); }}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                  />
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetailsDialog}>Close</Button>
        </DialogActions>
      </Dialog>
      
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