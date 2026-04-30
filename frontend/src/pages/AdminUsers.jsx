import React, { useEffect, useMemo, useState } from 'react'
import { Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Select, MenuItem, TextField, Button, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Box, Skeleton, Tabs, Tab, Grid, Card, CardContent, Chip, IconButton, Tooltip, InputAdornment } from '@mui/material'
import { PersonAdd as PersonAddIcon, LockReset as LockResetIcon, Delete as DeleteIcon, GroupAdd as GroupAddIcon, CalendarMonth as CalendarIcon } from '@mui/icons-material'
import api from '../services/api'
import DocsFab from '../components/DocsFab'
import EmptyState from '../components/EmptyState'

const roles = ['player','trainer','designer','admin']

function NativeDateField({ label, value, onChange, sx }) {
  const inputRef = React.useRef(null)

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
    input.focus()
    input.click()
  }

  return (
    <TextField
      size="small"
      type="date"
      label={label}
      InputLabelProps={{ shrink:true }}
      value={value}
      onChange={onChange}
      inputRef={inputRef}
      sx={{
        ...sx,
        '& input::-webkit-calendar-picker-indicator': {
          opacity: 0,
          position: 'absolute',
          right: 0,
          width: 36,
          height: '100%',
          cursor: 'pointer',
        },
      }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={`Open ${label}`} arrow>
              <IconButton size="small" onClick={openPicker} aria-label={`Open ${label}`}>
                <CalendarIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </InputAdornment>
        )
      }}
    />
  )
}

function LineChart({ data = [], color = '#1976d2', height = 120 }){
  const width = 360
  const pad = 8
  const xs = data.map((d, i) => i)
  const ys = data.map(d => d.count || 0)
  const maxY = Math.max(1, ...ys)
  const path = useMemo(() => {
    if (data.length === 0) return ''
    const stepX = (width - pad*2) / Math.max(1, data.length - 1)
    return data.map((d,i) => {
      const x = pad + i * stepX
      const y = height - pad - (ys[i] / maxY) * (height - pad*2)
      return `${i===0?'M':'L'}${x},${y}`
    }).join(' ')
  }, [data, height, width, pad, ys, maxY])
  const area = useMemo(() => {
    if (data.length === 0) return ''
    const stepX = (width - pad*2) / Math.max(1, data.length - 1)
    const top = data.map((d,i)=>{
      const x = pad + i * stepX
      const y = height - pad - (ys[i] / maxY) * (height - pad*2)
      return `${i===0?'M':'L'}${x},${y}`
    }).join(' ')
    const bottom = `L ${pad + (data.length-1)*stepX},${height-pad} L ${pad},${height-pad} Z`
    return top + ' ' + bottom
  }, [data, height, width, pad, ys, maxY])
  return (
    <svg width={width} height={height} role="img" aria-label="Activity chart">
      <rect x={0} y={0} width={width} height={height} fill="#f8f9fa" rx={6} />
      <path d={area} fill={color+"22"} />
      <path d={path} stroke={color} strokeWidth={2} fill="none" />
    </svg>
  )
}

export default function AdminUsers(){
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState('trainer')
  const [inviteResult, setInviteResult] = useState(null)
  const [createEmail, setCreateEmail] = useState('')
  const [createRole, setCreateRole] = useState('trainer')
  const [createPassword, setCreatePassword] = useState('')
  const [snack, setSnack] = useState('')
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  // Activity Dashboard state
  const [period, setPeriod] = useState('30d')
  const [summary, setSummary] = useState(null)
  const [series, setSeries] = useState({ logins: [], registrations: [], sessions: [] })
  const [recent, setRecent] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  // Admin Sessions (UC-17)
  const [sessLoading, setSessLoading] = useState(false)
  const [sessList, setSessList] = useState([])
  const [sessTotal, setSessTotal] = useState(0)
  const [sessPage, setSessPage] = useState(0)
  const [sessRows, setSessRows] = useState(25)
  const [sessFilters, setSessFilters] = useState({ status: '', scenario_id: '', date_from: '', date_to: '' })
  // Cohort assignment
  const [cohortModalOpen, setCohortModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [availableCohorts, setAvailableCohorts] = useState([])
  const [selectedCohort, setSelectedCohort] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/users')
      setUsers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[])

  const loadActivity = async (p = period) => {
    setLoadingActivity(true)
    try {
      const [s, l, r, ss] = await Promise.all([
        api.get(`/api/admin/activity/summary`, { params: { period: p } }),
        api.get(`/api/admin/activity/timeseries`, { params: { metric: 'logins', period: p } }),
        api.get(`/api/admin/activity/timeseries`, { params: { metric: 'registrations', period: p } }),
        api.get(`/api/admin/activity/timeseries`, { params: { metric: 'sessions', period: p } }),
      ])
      setSummary(s.data)
      setSeries({ logins: l.data.data || [], registrations: r.data.data || [], sessions: ss.data.data || [] })
      const rc = await api.get('/api/admin/activity/recent', { params: { limit: 50 } })
      setRecent(rc.data.activities || [])
    } catch (e) {
      // noop
    } finally {
      setLoadingActivity(false)
    }
  }

  useEffect(()=>{
    if (tab === 1) loadActivity(period)
    if (tab === 2) loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period])

  const changeRole = async (id, role) => {
    // optimistic update
    const before = users
    setUsers(prev => prev.map(u => u.id===id ? { ...u, role } : u))
    try {
      await api.post(`/api/admin/users/${id}/role`, { role })
    } catch (e) {
      setUsers(before)
    }
  }

  const createInvite = async () => {
    try {
      const { data } = await api.post('/api/admin/invites', { email: invEmail, role: invRole })
      setInviteResult(data.invite)
      setSnack(data.invite.email_sent ? 'Invite email sent' : 'Invite created (copy link)')
      setInvEmail('')
    } catch (e) {
      setSnack(e?.response?.data?.message || 'Failed to create invite')
    }
  }

  const loadSessions = async () => {
    setSessLoading(true)
    try {
      const params = {
        status: sessFilters.status || undefined,
        scenario_id: sessFilters.scenario_id ? Number(sessFilters.scenario_id) : undefined,
        date_from: sessFilters.date_from || undefined,
        date_to: sessFilters.date_to || undefined,
        limit: 1000,
        offset: 0,
      }
      const { data } = await api.get('/api/admin/sessions', { params })
      setSessList(data.sessions || [])
      setSessTotal(data.total || 0)
    } catch (e) {
      setSessList([])
      setSessTotal(0)
    } finally {
      setSessLoading(false)
    }
  }

  const createUser = async () => {
    try {
      const body = { email: createEmail, role: createRole }
      if (createPassword) body.password = createPassword
      const { data } = await api.post('/api/admin/users', body)
      setSnack('User created' + (data.email_sent ? ' and email sent' : ''))
      setCreateEmail('')
      setCreatePassword('')
      setCreateModalOpen(false)
      await load()
    } catch (e) {
      setSnack(e?.response?.data?.message || 'Failed to create user')
    }
  }

  const resetPassword = async (id, email) => {
    if (!window.confirm(`Reset password for ${email}?\n\nA new password will be generated and shown to you.`)) return
    try {
      const { data } = await api.post(`/api/admin/users/${id}/password`, {})
      const newPassword = data.new_password
      const emailSent = data.email_sent
      
      // Show password in alert
      alert(
        `Password reset successful!\n\n` +
        `Email: ${email}\n` +
        `New Password: ${newPassword}\n\n` +
        (emailSent 
          ? `✓ Password has been sent via email to the user.` 
          : `⚠ Email not sent (SMTP not configured). Please copy this password and send it to the user manually.`)
      )
      
      setSnack(emailSent ? 'Password reset and email sent' : 'Password reset (copy from alert)')
    } catch (e) {
      setSnack(e?.response?.data?.message || 'Failed to reset password')
    }
  }

  const deleteUser = async (id, email) => {
    if (!window.confirm(`Delete user ${email}?`)) return
    try {
      await api.delete(`/api/admin/users/${id}`)
      setSnack('User deleted')
      await load()
    } catch (e) {
      setSnack(e?.response?.data?.message || 'Failed to delete user')
    }
  }

  const openCohortModal = async (user) => {
    setSelectedUser(user)
    setCohortModalOpen(true)
    setSelectedCohort('')
    
    // Load available cohorts
    try {
      const { data } = await api.get('/api/admin/cohorts')
      setAvailableCohorts(data)
    } catch (e) {
      setSnack('Failed to load cohorts')
    }
  }

  const assignCohort = async () => {
    if (!selectedCohort || !selectedUser) return
    
    try {
      await api.post(`/api/admin/users/${selectedUser.id}/cohort`, { cohort_id: selectedCohort })
      setSnack('User assigned to cohort')
      setCohortModalOpen(false)
      await load()
    } catch (e) {
      setSnack(e?.response?.data?.message || 'Failed to assign cohort')
    }
  }

  return (
    <Paper sx={{ p:2, maxWidth: 1400, mx: 'auto' }}>
      <Tabs value={tab} onChange={(_,v)=>setTab(v)} aria-label="Admin tabs">
        <Tab label="Users" />
        <Tab label="Activity Dashboard" />
        <Tab label="Sessions" />
      </Tabs>

      {tab === 0 && (
        <>
      {/* Header with Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 1 }}>
        <Typography variant="h5">User Management</Typography>
        <Box>
          <Button 
            variant="contained" 
            onClick={() => setCreateModalOpen(true)}
          >
            Create User
          </Button>
        </Box>
      </Box>

      {/* Search & User List */}
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:1 }}>
        <TextField size="small" label="Search by email" value={query} onChange={e=>{ setQuery(e.target.value); setPage(0) }} sx={{ maxWidth: 320 }} />
        <Typography variant="body2">{users.length} users</Typography>
      </Box>
      
      {loading ? (
        <Box sx={{ mt: 2 }}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1 }} />
          ))}
        </Box>
      ) : users.filter(u => !query || u.email.toLowerCase().includes(query.toLowerCase())).length === 0 ? (
        <EmptyState 
          icon={PersonAddIcon}
          title={query ? "No users found" : "No users yet"}
          message={query ? "Try adjusting your search criteria" : "Create your first user to get started"}
          actionLabel={!query ? "Create User" : undefined}
          onAction={!query ? () => setCreateModalOpen(true) : undefined}
        />
      ) : (
        <>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Cohorts</TableCell>
            <TableCell align="right">Solo Sessions</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.filter(u => !query || u.email.toLowerCase().includes(query.toLowerCase()))
                .slice(page*rowsPerPage, page*rowsPerPage + rowsPerPage)
                .map(u => (
            <TableRow key={u.id}>
              <TableCell>{u.id}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Select size="small" value={u.role} onChange={(e)=>changeRole(u.id, e.target.value)}>
                  {roles.map(r=> <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </TableCell>
              <TableCell>
                {u.cohorts && u.cohorts.length > 0 ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {u.cohorts.map(c => (
                      <Chip key={c.id} label={c.name} size="small" />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary">—</Typography>
                )}
              </TableCell>
              <TableCell align="right">{u.solo_sessions || 0}</TableCell>
              <TableCell>{u.created_at}</TableCell>
              <TableCell align="right">
                <Tooltip title="Assign to Cohort" arrow>
                  <IconButton size="small" onClick={() => openCohortModal(u)}>
                    <GroupAddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reset Password" arrow>
                  <IconButton size="small" onClick={() => resetPassword(u.id, u.email)}>
                    <LockResetIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete User" arrow>
                  <IconButton size="small" color="error" onClick={() => deleteUser(u.id, u.email)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:1, mt:1 }}>
        <Typography variant="caption" sx={{ mr:1 }}>Rows per page:</Typography>
        <Select size="small" value={rowsPerPage} onChange={e=>{ setRowsPerPage(Number(e.target.value)); setPage(0) }} sx={{ width: 80 }}>
          {[5,10,25,50].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </Select>
        <Button size="small" disabled={page===0} onClick={()=> setPage(p=>Math.max(0,p-1))}>Prev</Button>
        <Typography variant="caption">{page+1}</Typography>
        <Button size="small" disabled={(page+1)*rowsPerPage >= users.filter(u => !query || u.email.toLowerCase().includes(query.toLowerCase())).length} onClick={()=> setPage(p=>p+1)}>Next</Button>
      </Box>
        </>
      )}

      {/* Invite User Modal */}
      <Dialog open={inviteModalOpen} onClose={() => { setInviteModalOpen(false); setInviteResult(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Invite User (Registration Link)</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField 
              fullWidth 
              label="Email" 
              value={invEmail} 
              onChange={e=>setInvEmail(e.target.value)} 
              sx={{ mb: 2 }}
            />
            <Select 
              fullWidth 
              value={invRole} 
              onChange={e=>setInvRole(e.target.value)}
            >
              {roles.map(r=> <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
            {inviteResult && (
              <Paper sx={{ p: 2, mt: 2, bgcolor: '#e8f5e9' }}>
                <Typography variant="subtitle2" fontWeight="bold">Invite Created!</Typography>
                <Typography variant="body2" sx={{ mt: 1, wordBreak: 'break-all' }}>
                  <strong>Link:</strong> {inviteResult.link}
                </Typography>
                <Typography variant="body2">
                  <strong>Expires:</strong> {inviteResult.expires_at}
                </Typography>
                <Typography variant="body2">
                  <strong>Email sent:</strong> {inviteResult.email_sent ? 'Yes' : 'No'}
                </Typography>
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setInviteModalOpen(false); setInviteResult(null); }}>Close</Button>
          <Button onClick={createInvite} disabled={!invEmail} variant="contained">Send Invite</Button>
        </DialogActions>
      </Dialog>

      {/* Create User Modal */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create User Directly</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField 
              fullWidth 
              label="Email" 
              value={createEmail} 
              onChange={e=>setCreateEmail(e.target.value)} 
              sx={{ mb: 2 }}
            />
            <Select 
              fullWidth 
              value={createRole} 
              onChange={e=>setCreateRole(e.target.value)}
              sx={{ mb: 2 }}
            >
              {roles.map(r=> <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
            <TextField 
              fullWidth 
              label="Temp Password (optional, min 12)" 
              value={createPassword} 
              onChange={e=>setCreatePassword(e.target.value)} 
              type="password"
              helperText="If empty, user will receive email to set password"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
          <Button onClick={createUser} disabled={!createEmail} variant="contained">Create User</Button>
        </DialogActions>
      </Dialog>

      {/* Cohort Assignment Modal */}
      <Dialog open={cohortModalOpen} onClose={() => setCohortModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign User to Cohort</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {selectedUser && (
              <Typography variant="body2" sx={{ mb: 2 }}>
                User: <strong>{selectedUser.email}</strong>
              </Typography>
            )}
            <Select
              fullWidth
              value={selectedCohort}
              onChange={e => setSelectedCohort(e.target.value)}
              displayEmpty
            >
              <MenuItem value="" disabled>
                <em>Select a cohort</em>
              </MenuItem>
              {availableCohorts.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
            {selectedUser && selectedUser.cohorts && selectedUser.cohorts.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Current cohorts:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {selectedUser.cohorts.map(c => (
                    <Chip key={c.id} label={c.name} size="small" />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCohortModalOpen(false)}>Cancel</Button>
          <Button onClick={assignCohort} disabled={!selectedCohort} variant="contained">Assign</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={()=>setSnack('')} message={snack} />
        </>
      )}

      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}>
            <Typography variant="h6">Activity Dashboard</Typography>
            <Select size="small" value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Select period">
              {['7d','30d','90d'].map(p=> <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </Select>
          </Box>

          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {loadingActivity || !summary ? (
              [...Array(4)].map((_,i)=> (
                <Grid key={i} item xs={12} sm={6} md={3}><Skeleton variant="rectangular" height={96} /></Grid>
              ))
            ) : (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <Card><CardContent>
                    <Typography variant="overline">Total Users</Typography>
                    <Typography variant="h5">{summary.total_users}</Typography>
                  </CardContent></Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card><CardContent>
                    <Typography variant="overline">Active Users 7d</Typography>
                    <Typography variant="h5">{summary.active_users_7d}</Typography>
                  </CardContent></Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card><CardContent>
                    <Typography variant="overline">Sessions Started</Typography>
                    <Typography variant="h5">{summary.sessions_started}</Typography>
                  </CardContent></Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card><CardContent>
                    <Typography variant="overline">Total Forecasts</Typography>
                    <Typography variant="h5">{summary.total_forecasts}</Typography>
                  </CardContent></Card>
                </Grid>
              </>
            )}
          </Grid>

          {/* Charts */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Logins</Typography>
              {loadingActivity ? <Skeleton variant="rectangular" height={120} /> : <LineChart data={series.logins} color="#1976d2" />}
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Registrations</Typography>
              {loadingActivity ? <Skeleton variant="rectangular" height={120} /> : <LineChart data={series.registrations} color="#2e7d32" />}
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Sessions</Typography>
              {loadingActivity ? <Skeleton variant="rectangular" height={120} /> : <LineChart data={series.sessions} color="#ed6c02" />}
            </Grid>
          </Grid>

          {/* Recent activity */}
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Recent Activity</Typography>
          {loadingActivity ? (
            [...Array(5)].map((_,i)=> <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1 }} />)
          ) : recent.length === 0 ? (
            <EmptyState title="No recent activity" message="Activity will appear as users interact with the system." />
          ) : (
            <Table size="small" aria-label="recent activity table">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Session</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{a.user_email}</TableCell>
                    <TableCell><Chip size="small" label={a.action_type} /></TableCell>
                    <TableCell>{a.session_id || ''}</TableCell>
                    <TableCell>
                      <code style={{ fontSize: 11 }}>{a.details ? JSON.stringify(a.details) : ''}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display:'flex', alignItems:'center', gap:1, flexWrap:'wrap', mb:2 }}>
            <Typography variant="h6" sx={{ mr: 2 }}>Sessions</Typography>
            <Select size="small" value={sessFilters.status} onChange={e=> setSessFilters(f=>({ ...f, status: e.target.value }))} displayEmpty aria-label="Filter by status">
              <MenuItem value=""><em>All statuses</em></MenuItem>
              {['created','running','paused','ended'].map(s=> <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
            <TextField size="small" label="Scenario ID" value={sessFilters.scenario_id} onChange={e=> setSessFilters(f=>({ ...f, scenario_id: e.target.value }))} sx={{ width: 140 }} />
            <NativeDateField label="From" value={sessFilters.date_from} onChange={e=> setSessFilters(f=>({ ...f, date_from: e.target.value }))} />
            <NativeDateField label="To" value={sessFilters.date_to} onChange={e=> setSessFilters(f=>({ ...f, date_to: e.target.value }))} />
            <Button variant="outlined" onClick={()=> setSessPage(0)} disabled={sessLoading}>Apply</Button>
            <Button variant="text" onClick={()=> { setSessFilters({ status:'', scenario_id:'', date_from:'', date_to:'' }); setSessPage(0) }}>Reset</Button>
            <Box sx={{ flexGrow:1 }} />
            <Button variant="contained" color="error" onClick={async()=>{
              const confirmText = prompt('Delete ALL sessions. Type DELETE to confirm:')
              if(confirmText!== 'DELETE') return
              try{
                await api.post('/api/admin/sessions', { delete_all: true })
                if(window.__showSnack) window.__showSnack('All sessions deleted', 'success')
                loadSessions()
              }catch(e){ if(window.__showSnack) window.__showSnack('Cleanup failed','error') }
            }}>Bulk Cleanup…</Button>
          </Box>

          {/* Sessions Table */}
          <Box>
            {sessLoading ? (
              [...Array(5)].map((_,i)=> <Skeleton key={i} variant="rectangular" height={40} sx={{ mb:1 }} />)
            ) : sessList.length===0 ? (
              <EmptyState title="No sessions found" message="Try adjusting filters or date range." />
            ) : (
              <Table size="small" aria-label="sessions table">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Scenario</TableCell>
                    <TableCell>Cohort</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell>Round</TableCell>
                    <TableCell>Players</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessList.slice(sessPage*sessRows, sessPage*sessRows+sessRows).map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{s.id}</TableCell>
                      <TableCell>{s.scenario_name} ({s.scenario_id || '-'})</TableCell>
                      <TableCell>{s.cohort_name || '-'}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell>{s.mode}</TableCell>
                      <TableCell>{s.round}</TableCell>
                      <TableCell>{s.player_count}</TableCell>
                      <TableCell>{s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" color="error" onClick={async()=>{
                          if(!window.confirm(`Delete session #${s.id}? This cannot be undone.`)) return
                          try{ await api.delete(`/api/admin/sessions/${s.id}`); if(window.__showSnack) window.__showSnack('Session deleted','success'); loadSessions() }catch(e){ if(window.__showSnack) window.__showSnack('Delete failed','error') }
                        }}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:1, mt:1 }}>
              <Typography variant="caption" sx={{ mr:1 }}>Rows per page:</Typography>
              <Select size="small" value={sessRows} onChange={e=>{ setSessRows(Number(e.target.value)); setSessPage(0) }} sx={{ width: 80 }}>
                {[10,25,50,100].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </Select>
              <Button size="small" disabled={sessPage===0} onClick={()=> setSessPage(p=>Math.max(0,p-1))}>Prev</Button>
              <Typography variant="caption">{sessPage+1}</Typography>
              <Button size="small" disabled={(sessPage+1)*sessRows >= sessList.length} onClick={()=> setSessPage(p=>p+1)}>Next</Button>
            </Box>
          </Box>
        </Box>
      )}

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={()=>setSnack('')} message={snack} />
      <DocsFab href="/docs/admin" label="Open Admin Handbook" />
    </Paper>
  )
}