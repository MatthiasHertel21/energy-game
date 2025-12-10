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
  Paper,
  Stack,
  Divider,
  Alert
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  MenuBook as HandbookIcon,
  Assessment as ReportsIcon,
  EmojiEvents as LeaderboardIcon,
  LibraryBooks as CatalogIcon,
  AccountCircle as ProfileIcon,
  TrendingUp as TrendingIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import useAuth from '../store/auth'

export default function Home() {
  const [sessions, setSessions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  const load = async () => {
    try {
      const { data } = await api.get('/api/me/sessions')
      setSessions(data || [])
      
      // Calculate stats
      const active = data.filter(s => s.status === 'running' || s.status === 'paused').length
      const completed = data.filter(s => s.status === 'ended' || s.status === 'scenario_complete').length
      
      setStats({ active, completed, total: data.length })
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Get most recent active session
  const activeSession = sessions
    .filter(s => s.status === 'running' || s.status === 'paused')
    .sort((a, b) => b.id - a.id)[0]
  
  // Get most recent completed session  
  const lastCompletedSession = sessions
    .filter(s => s.status === 'ended' || s.status === 'scenario_complete')
    .sort((a, b) => b.id - a.id)[0]

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Skeleton variant="rounded" height={200} sx={{ mb: 3 }} />
        <Grid container spacing={3}>
          {[...Array(3)].map((_, i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rounded" height={180} />
            </Grid>
          ))}
        </Grid>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Welcome Header */}
      <Paper sx={{ p: 4, mb: 4, background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Welcome back, {user?.email?.split('@')[0] || 'Player'}!
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          Ready to trade energy in the South African market?
        </Typography>
      </Paper>

      {/* Quick Stats */}
      {stats && stats.total > 0 && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <PlayIcon sx={{ fontSize: 40, color: 'success.main' }} />
                  <Box>
                    <Typography variant="h4">{stats.active}</Typography>
                    <Typography variant="body2" color="text.secondary">Active Sessions</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <ReportsIcon sx={{ fontSize: 40, color: 'info.main' }} />
                  <Box>
                    <Typography variant="h4">{stats.completed}</Typography>
                    <Typography variant="body2" color="text.secondary">Completed</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <TrendingIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                  <Box>
                    <Typography variant="h4">{stats.total}</Typography>
                    <Typography variant="body2" color="text.secondary">Total Sessions</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Quick Start Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PlayIcon /> Quick Start
              </Typography>
              <Divider sx={{ my: 2 }} />
              
              {activeSession ? (
                <Box sx={{ mb: 2 }}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    You have an active session!
                  </Alert>
                  <Typography variant="subtitle2" gutterBottom>
                    {activeSession.scenario_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Round {activeSession.current_round}/{activeSession.max_rounds} • {activeSession.mode === 'isolated_per_player' ? 'Solo' : 'Shared Market'}
                  </Typography>
                  <Button 
                    variant="contained" 
                    startIcon={<PlayIcon />}
                    onClick={() => navigate(`/player?sessionId=${activeSession.id}`)}
                    fullWidth
                  >
                    Resume Session
                  </Button>
                </Box>
              ) : (
                <Box sx={{ mb: 2 }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    No active sessions. Browse the catalog to start!
                  </Alert>
                </Box>
              )}
              
              <Button 
                variant="outlined" 
                startIcon={<CatalogIcon />}
                onClick={() => navigate('/catalog')}
                fullWidth
              >
                Browse Campaign Catalog
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Reports & Resources */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReportsIcon /> Reports & Resources
              </Typography>
              <Divider sx={{ my: 2 }} />
              
              <Stack spacing={2}>
                {lastCompletedSession && (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<ReportsIcon />}
                      onClick={() => navigate(`/evaluation?sessionId=${lastCompletedSession.id}`)}
                      fullWidth
                    >
                      View Last Session Results
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<LeaderboardIcon />}
                      onClick={() => navigate(`/leaderboard?sessionId=${lastCompletedSession.id}`)}
                      fullWidth
                    >
                      View Leaderboard
                    </Button>
                  </>
                )}
                
                <Button
                  variant="outlined"
                  startIcon={<ReportsIcon />}
                  onClick={() => navigate('/evaluation')}
                  fullWidth
                >
                  All Session Reports
                </Button>
                
                <Divider />
                
                <Button
                  variant="outlined"
                  startIcon={<HandbookIcon />}
                  onClick={() => navigate('/docs/player')}
                  fullWidth
                >
                  Player Handbook
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<ProfileIcon />}
                  onClick={() => navigate('/profile')}
                  fullWidth
                >
                  My Profile
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Getting Started Guide for new users */}
      {stats && stats.total === 0 && (
        <Paper sx={{ p: 3, mt: 4, bgcolor: 'background.default' }}>
          <Typography variant="h6" gutterBottom>
            🎮 Getting Started
          </Typography>
          <Typography variant="body2" paragraph>
            Welcome to the Energy Market Simulation Game! Here's how to get started:
          </Typography>
          <ol style={{ paddingLeft: '20px' }}>
            <li>
              <Typography variant="body2" paragraph>
                <strong>Browse the Catalog:</strong> Explore published campaigns with different scenarios
              </Typography>
            </li>
            <li>
              <Typography variant="body2" paragraph>
                <strong>Play Solo:</strong> Start a solo session to practice at your own pace
              </Typography>
            </li>
            <li>
              <Typography variant="body2" paragraph>
                <strong>Join Trainer Sessions:</strong> When your trainer starts a session, you'll see it in the catalog
              </Typography>
            </li>
            <li>
              <Typography variant="body2" paragraph>
                <strong>Read the Handbook:</strong> Learn about forecasting, market clearing, and scoring
              </Typography>
            </li>
          </ol>
          <Button 
            variant="contained" 
            startIcon={<CatalogIcon />}
            onClick={() => navigate('/catalog')}
            sx={{ mt: 2 }}
          >
            Start with Campaign Catalog
          </Button>
        </Paper>
      )}
    </Container>
  )
}