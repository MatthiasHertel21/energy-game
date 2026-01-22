import React, { useEffect, useState } from 'react'
import { 
  Container, 
  Paper, 
  Typography, 
  Box, 
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  Stack,
  Avatar,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
  TextField,
  Button,
  IconButton
} from '@mui/material'
import {
  TrendingUp as TrendingIcon,
  EmojiEvents as TrophyIcon,
  Assessment as SessionIcon,
  AttachMoney as MoneyIcon,
  ShowChart as ChartIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import useAuth from '../store/auth'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [editedBio, setEditedBio] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await api.get('/api/me/profile')
        setProfile(data)
        setEditedName(data.user.name || '')
        setEditedBio(data.user.bio || '')
      } catch (error) {
        console.error('Failed to load profile:', error)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  const handleEdit = () => {
    setEditing(true)
  }

  const handleCancel = () => {
    setEditedName(profile.user.name || '')
    setEditedBio(profile.user.bio || '')
    setEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/api/me/profile', {
        name: editedName,
        bio: editedBio
      })
      setProfile({
        ...profile,
        user: {
          ...profile.user,
          name: editedName,
          bio: editedBio
        }
      })
      setEditing(false)
    } catch (error) {
      console.error('Failed to update profile:', error)
      alert('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const getInitials = (email) => {
    if (!email) return '?'
    return email.substring(0, 2).toUpperCase()
  }

  const getRoleColor = (role) => {
    const colors = {
      player: 'primary',
      trainer: 'secondary',
      designer: 'info',
      admin: 'error'
    }
    return colors[role] || 'default'
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <LinearProgress />
      </Container>
    )
  }

  if (!profile) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">Failed to load profile data</Alert>
      </Container>
    )
  }

  const { user: userData, statistics, performance, recent_sessions } = profile

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header Section */}
      <Paper sx={{ p: 4, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          {!editing ? (
            <Button 
              startIcon={<EditIcon />} 
              variant="outlined" 
              size="small"
              onClick={handleEdit}
            >
              Edit Profile
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button 
                startIcon={<SaveIcon />} 
                variant="contained" 
                size="small"
                onClick={handleSave}
                disabled={saving}
              >
                Save
              </Button>
              <Button 
                startIcon={<CancelIcon />} 
                variant="outlined" 
                size="small"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            </Stack>
          )}
        </Box>
        <Grid container spacing={3} alignItems="flex-start">
          <Grid item>
            <Avatar 
              sx={{ 
                width: 100, 
                height: 100, 
                bgcolor: 'primary.main',
                fontSize: '2rem',
                fontWeight: 600
              }}
              src={userData.avatar_url}
            >
              {getInitials(userData.email)}
            </Avatar>
          </Grid>
          <Grid item xs>
            {editing ? (
              <Box>
                <TextField
                  fullWidth
                  label="Name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  size="small"
                  sx={{ mb: 2 }}
                  placeholder="Enter your name"
                />
                <TextField
                  fullWidth
                  label="Bio"
                  value={editedBio}
                  onChange={(e) => setEditedBio(e.target.value)}
                  multiline
                  rows={3}
                  size="small"
                  placeholder="Tell us about yourself"
                />
              </Box>
            ) : (
              <Box>
                <Typography variant="h4" gutterBottom>
                  {userData.name || userData.email}
                </Typography>
                {userData.name && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {userData.email}
                  </Typography>
                )}
                {userData.bio && (
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                    {userData.bio}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip 
                    label={userData.role} 
                    color={getRoleColor(userData.role)} 
                    size="small"
                  />
                  {userData.created_at && (
                    <Typography variant="body2" color="text.secondary">
                      Member since {formatDate(userData.created_at)}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <SessionIcon sx={{ fontSize: 40, color: 'info.main' }} />
                <Box>
                  <Typography variant="h4">{statistics.total_sessions}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Sessions
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {statistics.active_sessions} active
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <TrophyIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                <Box>
                  <Typography variant="h4">
                    {performance.best_rank ? `#${performance.best_rank}` : 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Best Rank
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    All sessions
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <ChartIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h4">{statistics.total_rounds_played}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Rounds Played
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {statistics.completed_sessions} completed
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Sessions */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Sessions
        </Typography>
        <Divider sx={{ my: 2 }} />
        {recent_sessions.length === 0 ? (
          <Alert severity="info">No sessions yet. Start playing to see your history!</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Scenario</TableCell>
                <TableCell>Cohort</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Started</TableCell>
                <TableCell align="right">Profit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recent_sessions.map((session) => (
                <TableRow key={session.id} hover>
                  <TableCell>{session.scenario_name}</TableCell>
                  <TableCell>{session.cohort_name}</TableCell>
                  <TableCell>
                    <Chip 
                      label={session.mode === 'isolated_per_player' ? 'Solo' : 'Shared'} 
                      size="small" 
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={session.status} 
                      size="small"
                      color={
                        session.status === 'running' || session.status === 'round_active' ? 'success' :
                        session.status === 'ended' || session.status === 'scenario_complete' ? 'default' :
                        'warning'
                      }
                    />
                  </TableCell>
                  <TableCell>{formatDate(session.started_at)}</TableCell>
                  <TableCell align="right">
                    {session.profit !== null ? formatCurrency(session.profit) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Container>
  )
}
