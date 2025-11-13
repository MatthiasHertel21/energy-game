import React, { useEffect, useState } from 'react'
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Box,
  Skeleton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  MenuBook as BriefingIcon,
  Assessment as ReportsIcon,
  School as SchoolIcon,
  Delete as DeleteIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EmptyState from '../components/EmptyState'

export default function Home() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const { data } = await api.get('/api/me/sessions')
      setSessions(data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const confirmDelete = async () => {
    if (!deleteDialog) return
    try {
      await api.delete(`/api/player/sessions/${deleteDialog.id}`)
      if (window.__showSnack) window.__showSnack('Session deleted', 'success')
      load()
      setDeleteDialog(null)
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to delete session'
      if (window.__showSnack) window.__showSnack(msg, 'error')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'success'
      case 'paused':
        return 'warning'
      case 'ended':
        return 'default'
      default:
        return 'info'
    }
  }

  const formatNextRound = (session) => {
    if (session.status === 'ended') return 'Completed'
    if (session.status === 'created') return 'Not started'
    return `Round ${session.current_round}/${session.max_rounds}`
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>My Scenarios</Typography>
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {[...Array(3)].map((_, i) => (
            <Grid item xs={12} md={6} lg={4} key={i}>
              <Skeleton variant="rounded" height={200} />
            </Grid>
          ))}
        </Grid>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        My Scenarios
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        View and manage your assigned energy market scenarios
      </Typography>

      {sessions.length === 0 ? (
        <EmptyState 
          icon={SchoolIcon}
          title="No scenarios assigned"
          message="Contact your trainer to get started with your first energy market scenario"
        />
      ) : (
        <Grid container spacing={3}>
          {sessions.map((session) => (
            <Grid item xs={12} md={6} lg={4} key={session.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Chip
                      label={session.status}
                      color={getStatusColor(session.status)}
                      size="small"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatNextRound(session)}
                    </Typography>
                  </Box>

                  <Typography variant="h6" gutterBottom>
                    {session.scenario_name}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Cohort: {session.cohort_name || `Session ${session.id}`}
                    {session.mode === 'isolated_per_player' && (
                      <Chip label="Solo" size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>

                  {session.started_at && (
                    <Typography variant="caption" color="text.secondary">
                      Started: {new Date(session.started_at).toLocaleDateString()}
                    </Typography>
                  )}
                </CardContent>

                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    size="small"
                    startIcon={<BriefingIcon />}
                    onClick={() => navigate(`/briefing/${session.id}`)}
                  >
                    Briefing
                  </Button>
                  {session.status === 'running' && (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayIcon />}
                      onClick={() => navigate(`/player?sessionId=${session.id}`)}
                    >
                      Play
                    </Button>
                  )}
                  {session.status === 'ended' && (
                    <Button
                      size="small"
                      startIcon={<ReportsIcon />}
                      onClick={() => navigate(`/evaluation?sessionId=${session.id}`)}
                    >
                      Reports
                    </Button>
                  )}
                  {session.mode === 'isolated_per_player' && (session.status === 'ended' || session.status === 'created') && (
                    <IconButton
                      size="small"
                      onClick={() => setDeleteDialog(session)}
                      color="error"
                      title="Delete solo session"
                      aria-label="Delete solo session"
                      sx={{ ml: 'auto' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Solo Session?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this session? 
            Your forecasts and results will be permanently removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}