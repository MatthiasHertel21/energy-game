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
  Alert
} from '@mui/material'
import {
  TrendingUp as TrendingIcon,
  EmojiEvents as TrophyIcon,
  Assessment as SessionIcon,
  AttachMoney as MoneyIcon,
  ShowChart as ChartIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import useAuth from '../store/auth'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await api.get('/api/me/profile')
        setProfile(data)
      } catch (error) {
        console.error('Failed to load profile:', error)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

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
        <Grid container spacing={3} alignItems="center">
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
            <Typography variant="h4" gutterBottom>
              {userData.email}
            </Typography>
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
          </Grid>
        </Grid>
      </Paper>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
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

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <MoneyIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Box>
                  <Typography variant="h5">{formatCurrency(performance.total_profit_zar)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Profit
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatCurrency(performance.avg_profit_per_session)} avg
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
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

        <Grid item xs={12} sm={6} md={3}>
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

      {/* Performance Details */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Performance Overview
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Total Revenue</Typography>
            <Typography variant="h6" color="success.main">
              {formatCurrency(performance.total_revenue_zar)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Total Imbalance Cost</Typography>
            <Typography variant="h6" color="error.main">
              {formatCurrency(performance.total_imbalance_cost_zar)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Total Curtailment Cost</Typography>
            <Typography variant="h6" color="warning.main">
              {formatCurrency(performance.total_curtailment_cost_zar)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Net Profit</Typography>
            <Typography variant="h6" color={performance.total_profit_zar >= 0 ? 'success.main' : 'error.main'}>
              {formatCurrency(performance.total_profit_zar)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

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
                <TableCell align="center">Actions</TableCell>
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
                  <TableCell align="center">
                    <Chip
                      label="View"
                      size="small"
                      clickable
                      onClick={() => navigate(`/evaluation?sessionId=${session.id}`)}
                    />
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
