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
  LibraryBooks as CatalogIcon,
  TrendingUp as TrendingIcon,
  AddCircle as NewIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import useAuth from '../store/auth'

export default function Home() {
  const [sessions, setSessions] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  const load = async () => {
    try {
      const [sessionsRes, campaignsRes] = await Promise.all([
        api.get('/api/me/sessions'),
        api.get('/api/catalog/campaigns').catch(() => ({ data: [] })) // Fix: correct API endpoint
      ])
      
      setSessions(sessionsRes.data || [])
      const campaignData = campaignsRes.data || []
      console.log('Loaded campaigns:', campaignData)
      setCampaigns(campaignData)
      
      // Calculate stats - fix: nur running/paused zählen als active
      const active = (sessionsRes.data || []).filter(s => 
        s.status === 'running' || s.status === 'paused' || s.status === 'round_active'
      ).length
      const completed = (sessionsRes.data || []).filter(s => 
        s.status === 'ended' || s.status === 'scenario_complete'
      ).length
      
      setStats({ active, completed, total: (sessionsRes.data || []).length })
    } catch (error) {
      console.error('Failed to load data:', error)
      setCampaigns([]) // Ensure campaigns is always an array
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Get most recent active session
  const activeSession = sessions
    .filter(s => s.status === 'running' || s.status === 'paused' || s.status === 'round_active')
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
          Ready to trade electricity in the South African market?
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
        {/* Quick Actions - Always show play options */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PlayIcon /> Quick Actions
              </Typography>
              <Divider sx={{ my: 2 }} />
              
              {activeSession ? (
                <Box sx={{ mb: 3 }}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    You have an active session!
                  </Alert>
                  <Paper elevation={0} sx={{ p: 2, bgcolor: 'success.lighter', border: '2px solid', borderColor: 'success.main', borderRadius: 2 }}>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      {activeSession.scenario_name}
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                      <Chip label={`Round ${activeSession.current_round}/${activeSession.max_rounds}`} size="small" color="primary" />
                      <Chip label={activeSession.mode === 'isolated_per_player' ? 'Solo Mode' : 'Shared Market'} size="small" />
                    </Stack>
                    <Button 
                      variant="contained" 
                      size="large"
                      startIcon={<PlayIcon />}
                      onClick={() => navigate(`/player?sessionId=${activeSession.id}`)}
                      fullWidth
                      sx={{ py: 1.5 }}
                    >
                      Continue Playing
                    </Button>
                  </Paper>
                </Box>
              ) : null}
              
              {/* Available Campaigns */}
              <Typography variant="subtitle2" gutterBottom sx={{ mt: activeSession ? 2 : 0, mb: 1 }}>
                {activeSession ? 'Start New Session' : 'Start Playing'}
              </Typography>
              
              {campaigns.length > 0 ? (
                <Stack spacing={1.5}>
                  {campaigns.slice(0, 3).map(campaign => (
                    <Paper 
                      key={campaign.id}
                      elevation={0} 
                      sx={{ 
                        p: 2, 
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                          cursor: 'pointer'
                        }
                      }}
                      onClick={() => navigate(`/catalog/${campaign.id}`)}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {campaign.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {campaign.scenario_name || 'Scenario'} • {campaign.max_rounds || 8} rounds
                          </Typography>
                        </Box>
                        <Button 
                          variant="contained" 
                          size="small"
                          startIcon={<PlayIcon />}
                        >
                          Play
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                  
                  {campaigns.length > 3 && (
                    <Button
                      variant="outlined"
                      startIcon={<CatalogIcon />}
                      onClick={() => navigate('/catalog')}
                      fullWidth
                    >
                      View All {campaigns.length} Campaigns
                    </Button>
                  )}
                </Stack>
              ) : (
                <Alert severity="info">
                  No campaigns available yet. Ask your trainer to publish campaigns or check back later.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Resources & Help */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HandbookIcon /> Resources & Help
              </Typography>
              <Divider sx={{ my: 2 }} />
              
              <Stack spacing={2}>
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
                  startIcon={<TrendingIcon />}
                  onClick={() => navigate('/did-you-know')}
                  fullWidth
                >
                  Did You Know
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<NewIcon />}
                  onClick={() => navigate('/course-materials')}
                  fullWidth
                >
                  Course Materials
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