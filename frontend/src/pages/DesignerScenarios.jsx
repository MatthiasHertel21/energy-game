import React, { useEffect, useMemo, useState } from 'react'
import { Box, Paper, Typography, Stack, TextField, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { Edit as EditIcon, Delete as DeleteIcon, FileCopy as CopyIcon, Search as SearchIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

export default function DesignerScenarios(){
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState({ open:false, id:null, name:'' })
  const navigate = useNavigate()

  const load = async ()=>{
    setLoading(true)
    try{ const { data } = await api.get('/api/kse/scenarios'); setRows(data||[]) } finally{ setLoading(false) }
  }
  useEffect(()=>{ load() },[])

  const filtered = useMemo(()=>{
    const v = (q||'').toLowerCase().trim()
    if(!v) return rows
    return rows.filter(r=> (r.name||'').toLowerCase().includes(v))
  },[rows,q])

  const doDelete = async ()=>{
    try{ await api.delete(`/api/kse/scenarios/${confirm.id}`); setConfirm({ open:false, id:null, name:'' }); load() } catch(e){}
  }

  const duplicate = async (row)=>{
    try{
      const { data } = await api.get(`/api/kse/scenarios/${row.id}`)
      const body = { name: `${row.name} (Copy)`, campaign_id: data.campaign_id, config: data.config }
      await api.post('/api/kse/scenarios', body)
      load()
    }catch(e){}
  }

  return (
    <Paper sx={{ p:2 }}>
      <Typography variant="h5" gutterBottom>Scenarios</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:2 }}>
        <SearchIcon fontSize="small" />
        <TextField size="small" label="Search by name" value={q} onChange={e=>setQ(e.target.value)} />
        <Box sx={{ flexGrow:1 }} />
        <Button variant="outlined" onClick={()=> navigate('/kse')}>New Scenario</Button>
      </Stack>
      {(!loading && filtered.length===0) ? (
        <EmptyState title="No scenarios" message="Create a new scenario or adjust your search" />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Campaign</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(r=> (
              <TableRow key={r.id} hover>
                <TableCell>{r.id}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.campaign_id || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" aria-label="edit" onClick={()=> navigate(`/kse?id=${r.id}`)}><EditIcon fontSize="inherit" /></IconButton>
                  <IconButton size="small" aria-label="duplicate" onClick={()=> duplicate(r)}><CopyIcon fontSize="inherit" /></IconButton>
                  <IconButton size="small" aria-label="delete" onClick={()=> setConfirm({ open:true, id:r.id, name:r.name })}><DeleteIcon fontSize="inherit" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={confirm.open} onClose={()=> setConfirm({ open:false, id:null, name:'' })}>
        <DialogTitle>Delete Scenario</DialogTitle>
        <DialogContent>
          <Typography>Delete "{confirm.name}"? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setConfirm({ open:false, id:null, name:'' })}>Cancel</Button>
          <Button color="error" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
