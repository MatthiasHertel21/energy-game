import React, { useEffect, useMemo, useState } from 'react'
import { Box, Paper, Typography, Stack, TextField, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, TablePagination, Tooltip, Container } from '@mui/material'
import { Edit as EditIcon, Delete as DeleteIcon, FileCopy as CopyIcon, Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'
import { useSnackbar } from '../components/SnackbarProvider'

export default function DesignerScenarios(){
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState({ open:false, id:null, name:'' })
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const navigate = useNavigate()
  const { showSnackbar } = useSnackbar()

  const load = async ()=>{
    setLoading(true)
    try{ 
      const { data } = await api.get('/api/kse/scenarios')
      setRows(data||[])
      showSnackbar('Scenarios loaded', 'success')
    } catch(e) {
      showSnackbar('Failed to load scenarios', 'error')
    } finally{ 
      setLoading(false) 
    }
  }
  useEffect(()=>{ load() },[])

  const filtered = useMemo(()=>{
    const v = (q||'').toLowerCase().trim()
    if(!v) return rows
    return rows.filter(r=> (r.name||'').toLowerCase().includes(v))
  },[rows,q])

  const paginated = useMemo(()=>{
    return filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  },[filtered, page, rowsPerPage])

  const doDelete = async ()=>{
    try{ 
      await api.delete(`/api/kse/scenarios/${confirm.id}`)
      setConfirm({ open:false, id:null, name:'' })
      showSnackbar('Scenario deleted', 'success')
      load()
    } catch(e){
      showSnackbar(e.response?.data?.error || 'Failed to delete scenario', 'error')
    }
  }

  const duplicate = async (row)=>{
    try{
      const { data } = await api.get(`/api/kse/scenarios/${row.id}`)
      const body = { name: `${row.name} (Copy)`, campaign_id: data.campaign_id, config: data.config }
      await api.post('/api/kse/scenarios', body)
      showSnackbar('Scenario duplicated', 'success')
      load()
    }catch(e){
      showSnackbar('Failed to duplicate scenario', 'error')
    }
  }

  const exportScenario = async (row) => {
    try {
      const { data } = await api.get(`/api/kse/scenarios/${row.id}`)
      const dataStr = JSON.stringify(data, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${row.name.replace(/\s+/g, '_')}_${row.id}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showSnackbar('Scenario exported', 'success')
    } catch(e) {
      showSnackbar('Failed to export scenario', 'error')
    }
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Scenarios</Typography>
        <Button variant="contained" onClick={()=> navigate('/kse')}>New Scenario</Button>
      </Box>

      <Paper sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <SearchIcon fontSize="small" color="action" />
          <TextField 
            size="small" 
            placeholder="Search by name..." 
            variant="standard"
            fullWidth
            value={q} 
            onChange={e=>{setQ(e.target.value); setPage(0)}} 
          />
        </Stack>
      </Paper>

      <Paper>
        {(!loading && filtered.length===0) ? (
          <Box sx={{ p: 4 }}>
            <EmptyState title="No scenarios" message="Create a new scenario or adjust your search" />
          </Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Zones</TableCell>
                  <TableCell>Rounds</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">Loading...</TableCell>
                  </TableRow>
                ) : (
                  paginated.map(r=> (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.id}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                        {r.description && (
                          <Typography variant="caption" color="text.secondary">
                            {r.description.length > 50 ? r.description.substring(0, 50) + '...' : r.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.zones?.length > 0 ? (
                          <Chip label={`${r.zones.length} zones`} size="small" />
                        ) : '-'}
                      </TableCell>
                      <TableCell>{r.rounds || '-'}</TableCell>
                      <TableCell>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={()=> navigate(`/kse?id=${r.id}`)}>
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Duplicate">
                          <IconButton size="small" onClick={()=> duplicate(r)}>
                            <CopyIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Export JSON">
                          <IconButton size="small" onClick={()=> exportScenario(r)}>
                            <DownloadIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={()=> setConfirm({ open:true, id:r.id, name:r.name })}>
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filtered.length}
              page={page}
              onPageChange={(e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </>
        )}
      </Paper>

      <Dialog open={confirm.open} onClose={()=> setConfirm({ open:false, id:null, name:'' })}>
        <DialogTitle>Delete Scenario</DialogTitle>
        <DialogContent>
          <Typography>Delete "{confirm.name}"? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setConfirm({ open:false, id:null, name:'' })}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
