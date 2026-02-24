import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Divider,
  Grid,
  Chip,
  CircularProgress,
  Stack,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Tabs,
  Tab
} from '@mui/material'
import { 
  ArrowBack as BackIcon, 
  PlayArrow as PlayIcon, 
  ExpandMore as ExpandIcon,
  CalendarToday as CalendarIcon,
  Timer as TimerIcon,
  AccessTime as ClockIcon,
  CheckCircleOutline as CheckIcon,
  Bolt as BoltIcon
} from '@mui/icons-material'
import api from '../services/api'

export default function Briefing() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: briefingData } = await api.get(`/api/sessions/${sessionId}/briefing`)
        setData(briefingData)
        
        // Also load session details to check mode
        const { data: sessionData } = await api.get(`/api/sessions/${sessionId}`)
        setSession(sessionData)
      } catch (error) {
        console.error('Failed to load briefing:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  if (!data) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Scenario not found</Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/home')}>Back to Home</Button>
        </Paper>
      </Container>
    )
  }

  const g = data.general || {}
  const m = data.markets || {}
  const grid = data.grid || {}
  const isSolo = session?.mode === 'isolated_per_player'
  const hasSelectedType = data.selected_type !== undefined && data.selected_type !== null
  const challenges = data.challenges || []
  const requiredChallenges = challenges.filter(c => c.required)
  const optionalChallenges = challenges.filter(c => !c.required)
  const currentRound = session?.current_round || 1
  const maxRounds = g.rounds || 10
  const allowedTypes = data.allowed_player_types || []
  const playerTypes = data.player_types || []
  const selectedTypeId = hasSelectedType ? data.selected_type : null
  const selectedTypeInfo = hasSelectedType ? playerTypes.find((pt) => pt.id === selectedTypeId) : null

  const handleSelectType = async (typeId) => {
    setSelecting(true)
    try {
      await api.post(`/api/sessions/${sessionId}/select-type`, { type_id: typeId })
      if (isSolo) {
        await api.post(`/api/sessions/${sessionId}/start-briefing`)
      }
      // Reload briefing to get updated selection
      const { data: updatedData } = await api.get(`/api/sessions/${sessionId}/briefing`)
      setData(updatedData)
      // Navigate to player immediately
      navigate(`/player?sessionId=${sessionId}`)
    } catch (error) {
      console.error('Failed to select type:', error)
      alert(error?.response?.data?.error || 'Failed to select player type')
    } finally {
      setSelecting(false)
    }
  }

  // Format objectives text with basic markdown-like formatting
  const renderFormattedText = (text) => {
    if (!text) return null
    const lines = text.split('\n')
    return lines.map((line, idx) => {
      // Headers (lines ending with :)
      if (line.trim().endsWith(':') && line.length < 80) {
        return (
          <Typography key={idx} variant="h6" fontWeight={600} sx={{ mt: idx > 0 ? 2 : 0, mb: 1 }}>
            {line.replace(':', '')}
          </Typography>
        )
      }
      // Bold lines (starting with emoji or **)
      if (line.match(/^[📊💡🌱⚡🎯📈]/)) {
        const [emoji, ...rest] = line.split(' ')
        return (
          <Typography key={idx} variant="body1" fontWeight={600} sx={{ mb: 1 }}>
            {emoji} {rest.join(' ')}
          </Typography>
        )
      }
      // List items (starting with -)
      if (line.trim().startsWith('-')) {
        return (
          <Typography key={idx} variant="body2" color="text.secondary" sx={{ ml: 2, mb: 0.5 }}>
            • {line.trim().substring(1).trim()}
          </Typography>
        )
      }
      // Empty lines
      if (line.trim() === '') {
        return <Box key={idx} sx={{ height: 8 }} />
      }
      // Regular text
      return (
        <Typography key={idx} variant="body1" color="text.primary" sx={{ mb: 1 }}>
          {line}
        </Typography>
      )
    })
  }

  // Get market status for each round
  const getMarketSchedule = () => {
    const markets = data.markets || {}
    const rounds = g.rounds || 6
    const schedule = []
    for (let r = 0; r < rounds; r++) {
      const daTrading = markets.da?.trading?.[r] === 'on'
      const damTrading = markets.dam?.trading?.[r] === 'on' || markets.dam?.trading?.[r] === 'market_code'
      const idTrading = markets.id?.trading?.[r] === 'on' || markets.idm?.trading?.[r] === 'on' || markets.idm?.trading?.[r] === 'market_code'
      schedule.push({ round: r + 1, da: daTrading, dam: damTrading, id: idTrading })
    }
    return schedule
  }

  // Filter challenges by player type
  const getChallengesForType = (typeId) => {
    return challenges.filter(c => {
      // If applicable_to is empty or undefined, it applies to all
      if (!c.applicable_to || c.applicable_to.length === 0) return true
      return c.applicable_to.includes(typeId)
    })
  }

  // Filter events by player type (exclude task events)
  const getEventsForType = (typeId) => {
    const events = data.events || []
    return events.filter(e => {
      // Exclude task events
      if (e.type === 'task') return false
      // Events with target="player" and target_id matching the type
      if (e.target === 'player' && e.target_id === typeId) return true
      // Events with target="all" or no target
      if (!e.target || e.target === 'all') return true
      return false
    })
  }

  // Metric display names
  const metricNames = {
    'total_profit': 'Total Profit',
    'round_profit': 'Round Profit',
    'total_revenue': 'Total Revenue',
    'round_revenue': 'Round Revenue',
    'total_cost': 'Total Cost',
    'round_cost': 'Round Cost',
    'total_dispatched': 'Total Dispatched Energy',
    'round_dispatched': 'Round Dispatched Energy',
    'total_curtailment': 'Total Curtailment',
    'round_curtailment': 'Round Curtailment',
    'total_curtailment_rate': 'Total Curtailment Rate',
    'round_curtailment_rate': 'Round Curtailment Rate',
    'total_procurement_cost': 'Total Procurement Cost',
    'round_procurement_cost': 'Round Procurement Cost',
    'total_demand_coverage': 'Total Demand Coverage',
    'round_demand_coverage': 'Round Demand Coverage',
    'total_imbalance': 'Total Imbalance Cost',
    'round_imbalance': 'Round Imbalance Cost'
  }

  const operatorSymbols = {
    '>=': '≥',
    '<=': '≤',
    '==': '='
  }

  const formatTarget = (metric, target) => {
    if (metric.includes('rate')) return `${target}%`
    if (metric.includes('profit') || metric.includes('revenue') || metric.includes('cost') || metric.includes('procurement')) {
      return `${target.toLocaleString()} ZAR`
    }
    if (metric.includes('dispatched') || metric.includes('curtailment') || metric.includes('coverage') || metric.includes('imbalance')) {
      return `${target.toLocaleString()} MWh`
    }
    return target.toLocaleString()
  }

  const selectedTypeChallenges = hasSelectedType ? getChallengesForType(selectedTypeId) : []
  const selectedTypeObjectives = selectedTypeChallenges.filter(c => c.required)
  const selectedTypeOptional = selectedTypeChallenges.filter(c => !c.required)
  const selectedTypeEvents = hasSelectedType ? getEventsForType(selectedTypeId) : []

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate(isSolo ? '/catalog' : '/home')}>
          {isSolo ? 'Back to Catalog' : 'Back to Home'}
        </Button>
        {hasSelectedType && (
          <Button variant="contained" onClick={() => navigate(`/player?sessionId=${sessionId}`)}>
            Return to Session
          </Button>
        )}
      </Stack>

      <Paper sx={{ p: 4 }}>
        {/* Compact Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={600}>
            Briefing
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.5 }}>
            <Typography variant="h4" fontWeight="bold">
              {data.name}
            </Typography>
            <Chip 
              label={isSolo ? 'Solo Mode' : 'Shared Market'} 
              color={isSolo ? 'default' : 'primary'}
              size="small"
            />
          </Stack>
        </Box>

        {/* Compact Game Structure - 3 Fact Cards */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Game Structure
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={4}>
              <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                <ClockIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="body1" fontWeight="bold">
                  {(() => {
                    const date = g.fake_date || '2024-01-01'
                    const [year, month, day] = date.split('-')
                    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                    return `${parseInt(day)}. ${months[parseInt(month) - 1]} ${year}`
                  })()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Start: {g.start_time || '00:00'}
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                <CalendarIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight="bold">
                  {maxRounds} Rounds
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {maxRounds * (g.round_span_hours || 6)} hrs ({g.round_span_hours || 6} hrs per round)
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
                <TimerIcon color="action" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="h5" fontWeight="bold">
                  {maxRounds * Math.floor((g.round_duration_seconds || 300) / 60)} min
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total playtime ({Math.floor((g.round_duration_seconds || 300) / 60)} min/round)
                </Typography>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Mission KPI Card - Only shown after type selection */}
        {hasSelectedType && requiredChallenges.length > 0 && (
          <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.lighter', borderColor: 'primary.main', borderWidth: 2 }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary" fontWeight={600}>
                Objective (Required)
              </Typography>
              {selectedTypeObjectives.map((challenge, idx) => (
                <Box key={idx} sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {challenge.name}
                  </Typography>
                  <Typography variant="h3" fontWeight="bold" color="primary.main">
                    {operatorSymbols[challenge.operator] || challenge.operator} {formatTarget(challenge.metric, challenge.target)}
                  </Typography>
                </Box>
              ))}
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Chip label={`Status: ${currentRound - 1}/${maxRounds} Rounds`} size="small" variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Briefing Text - Formatted */}
        <Box sx={{ mb: 3 }}>
          {data.objectives ? (
            <Box>
              {renderFormattedText(data.objectives)}
            </Box>
          ) : (
            <Typography variant="body1" color="text.secondary" fontStyle="italic">
              This scenario has no briefing text.
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Selected Player Type View (same content style as type selection, without switching) */}
        {hasSelectedType && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Your Role
              </Typography>

              <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={600}>
                  {selectedTypeInfo?.name || selectedTypeId}
                </Typography>
                {selectedTypeInfo?.description && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {selectedTypeInfo.description}
                  </Typography>
                )}
              </Alert>

              {(selectedTypeObjectives.length > 0 || selectedTypeOptional.length > 0) && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    🎯 Objectives & Challenges
                  </Typography>
                  <Grid container spacing={2}>
                    {selectedTypeObjectives.map((objective, oidx) => (
                      <Grid item xs={12} sm={6} md={4} key={`req-selected-${oidx}`}>
                        <Card variant="outlined" sx={{ height: '100%', bgcolor: 'primary.lighter', borderColor: 'primary.main', borderWidth: 2 }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <CheckIcon color="primary" />
                                <Chip 
                                  label="Required" 
                                  color="primary" 
                                  size="small"
                                  variant="filled"
                                />
                              </Box>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {objective.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {metricNames[objective.metric] || objective.metric}{' '}
                                {operatorSymbols[objective.operator] || objective.operator}{' '}
                                {formatTarget(objective.metric, objective.target)}
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                    {selectedTypeOptional.map((challenge, cidx) => (
                      <Grid item xs={12} sm={6} md={4} key={`opt-selected-${cidx}`}>
                        <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.default' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <CheckIcon color="disabled" />
                                <Chip 
                                  label={`+${challenge.points} pts`} 
                                  color="success" 
                                  size="small"
                                  variant="outlined"
                                />
                              </Box>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {challenge.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {metricNames[challenge.metric] || challenge.metric}{' '}
                                {operatorSymbols[challenge.operator] || challenge.operator}{' '}
                                {formatTarget(challenge.metric, challenge.target)}
                              </Typography>
                              {challenge.per_round && (
                                <Chip label="per round" color="info" size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  ⚡ Events
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={4}>
                    <Card variant="outlined" sx={{ height: '100%', bgcolor: 'info.lighter', borderColor: 'info.main', borderWidth: 1 }}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <BoltIcon color="info" sx={{ fontSize: 20 }} />
                            <Typography variant="subtitle2" fontWeight={600} sx={{ flexGrow: 1 }}>
                              Round 1: Baseline Setup
                            </Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            The first round establishes your baseline position. You'll set initial forecasts and day-ahead bids that serve as the foundation for subsequent trading rounds.
                          </Typography>
                          <Chip label="Round 1" size="small" variant="outlined" color="info" />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  {selectedTypeEvents.map((event, eidx) => (
                    <Grid item xs={12} sm={6} md={4} key={`event-selected-${eidx}`}>
                      <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.default' }}>
                        <CardContent>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                              <BoltIcon color="warning" sx={{ fontSize: 20 }} />
                              <Typography variant="subtitle2" fontWeight={600} sx={{ flexGrow: 1 }}>
                                {event.name}
                              </Typography>
                            </Box>
                            {event.description && (
                              <Typography variant="body2" color="text.secondary">
                                {event.description}
                              </Typography>
                            )}
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                              <Chip label={`Round ${event.trigger_value}`} size="small" variant="outlined" />
                              {event.duration_rounds > 1 && (
                                <Chip label={`${event.duration_rounds} rounds`} size="small" variant="outlined" color="info" />
                              )}
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Box>
            <Divider sx={{ my: 3 }} />
          </>
        )}

        {/* Player Type Tabs */}
        {!hasSelectedType && allowedTypes.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Select Your Role
              </Typography>
              
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
                  {allowedTypes.map((t, idx) => {
                    const typeInfo = playerTypes.find(pt => pt.id === t.type_id)
                    const typeName = typeInfo?.name || t.type_id
                    return (
                      <Tab key={t.type_id} label={typeName} icon={<BoltIcon />} iconPosition="start" />
                    )
                  })}
                </Tabs>
              </Box>

              {allowedTypes.map((t, idx) => {
                const typeInfo = playerTypes.find(pt => pt.id === t.type_id)
                const typeName = typeInfo?.name || t.type_id
                const typeDesc = typeInfo?.description || ''
                const isDisabled = t.remaining === 0
                const typeChallenges = getChallengesForType(t.type_id)
                const typeObjectives = typeChallenges.filter(c => c.required)
                const typeOptional = typeChallenges.filter(c => !c.required)
                const typeEvents = getEventsForType(t.type_id)

                if (idx !== activeTab) return null

                return (
                  <Box key={t.type_id} sx={{ py: 3 }}>
                    {/* Type Description */}
                    {typeDesc && (
                      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
                        <Typography variant="body2">{typeDesc}</Typography>
                      </Alert>
                    )}

                    {/* Objectives and Challenges Combined */}
                    {(typeObjectives.length > 0 || typeOptional.length > 0) && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                          🎯 Objectives & Challenges
                        </Typography>
                        <Grid container spacing={2}>
                          {typeObjectives.map((objective, oidx) => (
                            <Grid item xs={12} sm={6} md={4} key={`req-${oidx}`}>
                              <Card variant="outlined" sx={{ height: '100%', bgcolor: 'primary.lighter', borderColor: 'primary.main', borderWidth: 2 }}>
                                <CardContent>
                                  <Stack spacing={1}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                      <CheckIcon color="primary" />
                                      <Chip 
                                        label="Required" 
                                        color="primary" 
                                        size="small"
                                        variant="filled"
                                      />
                                    </Box>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                      {objective.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                      {metricNames[objective.metric] || objective.metric}{' '}
                                      {operatorSymbols[objective.operator] || objective.operator}{' '}
                                      {formatTarget(objective.metric, objective.target)}
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </Card>
                            </Grid>
                          ))}
                          {typeOptional.map((challenge, cidx) => (
                            <Grid item xs={12} sm={6} md={4} key={`opt-${cidx}`}>
                              <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.default' }}>
                                <CardContent>
                                  <Stack spacing={1}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                      <CheckIcon color="disabled" />
                                      <Chip 
                                        label={`+${challenge.points} pts`} 
                                        color="success" 
                                        size="small"
                                        variant="outlined"
                                      />
                                    </Box>
                                    <Typography variant="subtitle2" fontWeight={600}>
                                      {challenge.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                      {metricNames[challenge.metric] || challenge.metric}{' '}
                                      {operatorSymbols[challenge.operator] || challenge.operator}{' '}
                                      {formatTarget(challenge.metric, challenge.target)}
                                    </Typography>
                                    {challenge.per_round && (
                                      <Chip label="per round" color="info" size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                                    )}
                                  </Stack>
                                </CardContent>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    )}

                    {/* Events */}
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        ⚡ Events
                      </Typography>
                      <Grid container spacing={2}>
                        {/* Round 1 as first event card */}
                        <Grid item xs={12} sm={6} md={4}>
                          <Card variant="outlined" sx={{ height: '100%', bgcolor: 'info.lighter', borderColor: 'info.main', borderWidth: 1 }}>
                            <CardContent>
                              <Stack spacing={1}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                  <BoltIcon color="info" sx={{ fontSize: 20 }} />
                                  <Typography variant="subtitle2" fontWeight={600} sx={{ flexGrow: 1 }}>
                                    Round 1: Baseline Setup
                                  </Typography>
                                </Box>
                                <Typography variant="body2" color="text.secondary">
                                  The first round establishes your baseline position. You'll set initial forecasts and day-ahead bids that serve as the foundation for subsequent trading rounds.
                                </Typography>
                                <Chip label="Round 1" size="small" variant="outlined" color="info" />
                              </Stack>
                            </CardContent>
                          </Card>
                        </Grid>
                        {/* Other events */}
                        {typeEvents.map((event, eidx) => (
                          <Grid item xs={12} sm={6} md={4} key={eidx}>
                            <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.default' }}>
                              <CardContent>
                                <Stack spacing={1}>
                                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                    <BoltIcon color="warning" sx={{ fontSize: 20 }} />
                                    <Typography variant="subtitle2" fontWeight={600} sx={{ flexGrow: 1 }}>
                                      {event.name}
                                    </Typography>
                                  </Box>
                                  {event.description && (
                                    <Typography variant="body2" color="text.secondary">
                                      {event.description}
                                    </Typography>
                                  )}
                                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                    <Chip label={`Round ${event.trigger_value}`} size="small" variant="outlined" />
                                    {event.duration_rounds > 1 && (
                                      <Chip label={`${event.duration_rounds} rounds`} size="small" variant="outlined" color="info" />
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    </Box>



                    {/* Start Button */}
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                      <Button
                        variant="contained"
                        size="large"
                        startIcon={<PlayIcon />}
                        disabled={isDisabled || selecting}
                        onClick={() => handleSelectType(t.type_id)}
                        sx={{ minWidth: 300, py: 2 }}
                      >
                        Start as {typeName}
                      </Button>
                    </Box>
                    {!isDisabled && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                        {t.remaining === null ? 'Unlimited slots available' : `${t.remaining} slots remaining`}
                      </Typography>
                    )}
                    {isDisabled && (
                      <Typography variant="caption" color="error" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                        No slots available for this role
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Box>
            <Divider sx={{ my: 3 }} />
          </>
        )}

        {/* Additional Details - Collapsed */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandIcon />}>
            <Typography variant="body2" fontWeight={600}>Additional Details</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Markets
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Price Range</Typography>
                    <Typography variant="body2">{m.price_floor || 0} - {m.price_cap || 10000} ZAR/MWh</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Markets Active</Typography>
                    <Typography variant="body2">DAM, IDM</Typography>
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Grid Configuration
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Zones</Typography>
                    <Typography variant="body2">{grid.zones || 1} zone{grid.zones > 1 ? 's' : ''}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Grid Losses</Typography>
                    <Typography variant="body2">2% transmission loss</Typography>
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Market Schedule
                </Typography>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                      <Box component="thead">
                        <Box component="tr" sx={{ bgcolor: 'grey.100' }}>
                          <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" fontWeight={600}>Round</Typography>
                          </Box>
                          <Box component="th" sx={{ p: 1.5, textAlign: 'center', borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" fontWeight={600}>Day-Ahead</Typography>
                          </Box>
                          <Box component="th" sx={{ p: 1.5, textAlign: 'center', borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" fontWeight={600}>Intraday</Typography>
                          </Box>
                          <Box component="th" sx={{ p: 1.5, textAlign: 'left', borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" fontWeight={600}>Phase</Typography>
                          </Box>
                        </Box>
                      </Box>
                      <Box component="tbody">
                        {getMarketSchedule().map((row, idx) => (
                          <Box component="tr" key={idx} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            <Box component="td" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight={600}>Round {row.round}</Typography>
                            </Box>
                            <Box component="td" sx={{ p: 1.5, textAlign: 'center', borderBottom: 1, borderColor: 'divider' }}>
                              <Chip 
                                label={row.dam ? 'Trading' : 'Closed'} 
                                size="small" 
                                color={row.dam ? 'success' : 'default'}
                                variant="outlined"
                              />
                            </Box>
                            <Box component="td" sx={{ p: 1.5, textAlign: 'center', borderBottom: 1, borderColor: 'divider' }}>
                              <Chip 
                                label={row.id ? 'Trading' : 'Closed'} 
                                size="small" 
                                color={row.id ? 'info' : 'default'}
                                variant="outlined"
                              />
                            </Box>
                            <Box component="td" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                              <Typography variant="caption" color="text.secondary">
                                {row.round === 1 ? 'Baseline Setup' : row.dam && row.id ? 'Full Trading' : row.dam ? 'DA Only' : row.id ? 'ID Only' : 'Results Only'}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* CTA - Only show if type selected */}
        {hasSelectedType && (
          <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayIcon />}
              onClick={() => navigate(`/player?sessionId=${sessionId}`)}
              sx={{ minWidth: 240, py: 1.5, fontWeight: 600 }}
            >
              Continue Playing
            </Button>
            <Typography variant="caption" color="text.secondary">
              {isSolo ? 'The timer will start immediately.' : 'Waiting for trainer to start.'}
            </Typography>
          </Box>
        )}
      </Paper>
    </Container>
  )
}