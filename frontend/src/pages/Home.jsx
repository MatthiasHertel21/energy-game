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
import { alpha } from '@mui/material/styles'
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
import ContextAssistantDialog from '../components/ContextAssistantDialog'

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
        api.get('/api/catalog/campaigns?for_me=1').catch(() => ({ data: [] }))
      ])
      
      setSessions(sessionsRes.data || [])
      const campaignData = campaignsRes.data || []
      console.log('Loaded campaigns:', campaignData)
      setCampaigns(campaignData)
      
      const active = (sessionsRes.data || []).filter(s =>
        s.status === 'running'
        || s.status === 'paused'
        || s.status === 'round_active'
        || s.status === 'round_results'
        || s.status === 'briefing'
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

      const sessionPriority = {
        round_results: 0,
        round_active: 1,
        running: 2,
        paused: 3,
        briefing: 4
      }

      const resumableStatuses = Object.keys(sessionPriority)

      const sortByResumePriority = (a, b) => {
        const aPriority = sessionPriority[a.status] ?? 99
        const bPriority = sessionPriority[b.status] ?? 99
        if (aPriority !== bPriority) return aPriority - bPriority
        return (b.id || 0) - (a.id || 0)
      }

  // Get most recent resumable session (prefer round_results)
  const activeSession = sessions
    .filter((s) => resumableStatuses.includes(s.status))
    .sort(sortByResumePriority)[0]

  const liveSessions = sessions
    .filter((s) => resumableStatuses.includes(s.status) && s.mode !== 'isolated_per_player')
    .sort(sortByResumePriority)
  // Get most recent completed session  
  const lastCompletedSession = sessions
    .filter(s => s.status === 'ended' || s.status === 'scenario_complete')
    .sort((a, b) => b.id - a.id)[0]

  const assistantContext = {
    page: 'home',
    user: {
      email: user?.email || null,
      role: user?.role || null,
    },
    stats,
    active_session: activeSession || null,
    live_sessions: liveSessions.slice(0, 3),
    last_completed_session: lastCompletedSession || null,
    available_campaigns: campaigns.slice(0, 5).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description || '',
    })),
  }

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
      <Paper
        sx={(theme) => ({
          p: { xs: 3, sm: 4 },
          mb: 4,
          color: theme.palette.common.white,
          background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 55%, ${theme.palette.primary.light} 100%)`,
          border: `1px solid ${alpha(theme.palette.common.white, 0.12)}`
        })}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.15, mb: 1 }}>
              Welcome back, {user?.email?.split('@')[0] || 'Player'}!
            </Typography>
            <Typography
              variant="subtitle1"
              sx={(theme) => ({
                opacity: 0.95,
                maxWidth: 720,
                color: alpha(theme.palette.common.white, 0.92)
              })}
            >
              Ready to trade electricity in the South African market?
            </Typography>
          </Box>
          <ContextAssistantDialog
            title="Home Assistant"
            buttonLabel="Ask AI"
            placeholder="Ask about your sessions, campaigns, or what to do next..."
            intro="Ask questions about your home dashboard. I can explain what is active, what you can resume, and what to start next based on the current page data."
            contextLabel="Home dashboard context"
            context={assistantContext}
            resetKey={`home:${user?.id || 'anon'}:${sessions.length}:${campaigns.length}`}
            buttonVariant="outlined"
            buttonColor="inherit"
            buttonSx={{
              color: 'common.white',
              borderColor: 'rgba(255,255,255,0.45)',
              '&:hover': {
                borderColor: 'common.white',
                bgcolor: 'rgba(255,255,255,0.08)',
              },
            }}
          />
        </Stack>
        
        {/* Join Live Session CTA */}
        {liveSessions.length > 0 && (
          <Box sx={(theme) => ({ mt: 3, pt: 3, borderTop: `1px solid ${alpha(theme.palette.common.white, 0.22)}` })}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <Chip 
                label={`${liveSessions.length} Live Session${liveSessions.length > 1 ? 's' : ''} Available`}
                color="success"
                size="medium"
                sx={(theme) => ({
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.success.main, 0.92),
                  color: theme.palette.common.white
                })}
              />
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayIcon />}
                onClick={() => navigate(`/player?sessionId=${liveSessions[0].id}`)}
                sx={(theme) => ({
                  bgcolor: theme.palette.common.white,
                  color: theme.palette.primary.main,
                  fontWeight: 700,
                  px: 3.5,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.common.white, 0.92)
                  }
                })}
              >
                Join Live
              </Button>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Quick Stats */}
      {stats && stats.total > 0 && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <PlayIcon sx={{ fontSize: 34, color: 'success.main' }} />
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                      {stats.active}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Active Sessions</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <ReportsIcon sx={{ fontSize: 34, color: 'info.main' }} />
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                      {stats.completed}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Completed</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <TrendingIcon sx={{ fontSize: 34, color: 'warning.main' }} />
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                      {stats.total}
                    </Typography>
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
                  <Paper
                    elevation={0}
                    sx={(theme) => ({
                      p: 2,
                      border: '2px solid',
                      borderColor: 'success.main',
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.success.main, 0.08)
                    })}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 1.5 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
                          {activeSession.scenario_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Active session
                        </Typography>
                      </Box>
                      <Chip
                        label="Active"
                        size="small"
                        color="success"
                        sx={{ fontWeight: 700 }}
                      />
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                      <Chip
                        label={`Round ${activeSession.current_round}/${activeSession.max_rounds}`}
                        size="small"
                        color="primary"
                        sx={{ fontWeight: 700 }}
                      />
                      <Chip
                        label={activeSession.mode === 'isolated_per_player' ? 'Solo Mode' : 'Shared Market'}
                        size="small"
                      />
                    </Stack>

                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<PlayIcon />}
                      onClick={() => navigate(`/player?sessionId=${activeSession.id}`)}
                      fullWidth
                      sx={{ py: 1.4, fontWeight: 700 }}
                    >
                          {activeSession.status === 'round_results' ? 'Go to Round Results' : 'Continue'}
                    </Button>
                  </Paper>
                </Box>
              ) : null}

              {liveSessions.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Live Sessions
                  </Typography>
                  <Stack spacing={1.5}>
                    {liveSessions.slice(0, 3).map((s) => (
                      <Paper
                        key={s.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          border: '1px solid',
                          borderColor: 'success.main',
                          borderRadius: 2,
                          bgcolor: 'success.lighter'
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                          <Box>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {s.scenario_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {s.cohort_name || 'Cohort'} • Round {s.current_round}/{s.max_rounds}
                            </Typography>
                          </Box>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<PlayIcon />}
                            onClick={() => navigate(`/player?sessionId=${s.id}`)}
                          >
                            Join Live
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}
              
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
                          sx={{ fontWeight: 700, minWidth: 110 }}
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