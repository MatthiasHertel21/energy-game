import React, { useEffect, useState } from 'react'
import { Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Select, MenuItem, TextField, Button, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Box, Skeleton } from '@mui/material'
import { PersonAdd as PersonAddIcon } from '@mui/icons-material'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

const roles = ['player','trainer','designer','admin']

export default function AdminUsers(){
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
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

  return (
    <Paper sx={{ p:2, maxWidth: 1400, mx: 'auto' }}>
      {/* Header with Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">User Management</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => setInviteModalOpen(true)}
            sx={{ mr: 1 }}
          >
            Invite User
          </Button>
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
          message={query ? "Try adjusting your search criteria" : "Invite your first user to get started"}
          actionLabel={!query ? "Invite User" : undefined}
          onAction={!query ? () => setInviteModalOpen(true) : undefined}
        />
      ) : (
        <>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
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
              <TableCell>{u.created_at}</TableCell>
              <TableCell align="right">
                <Button size="small" color="error" onClick={() => deleteUser(u.id, u.email)}>Delete</Button>
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

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={()=>setSnack('')} message={snack} />
    </Paper>
  )
}