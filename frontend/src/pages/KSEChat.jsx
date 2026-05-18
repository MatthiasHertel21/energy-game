import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  Stack,
  CircularProgress,
  Avatar,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  Chip,
  Alert,
} from '@mui/material'
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  OpenInNew as OpenInNewIcon,
  ContentCopy as CopyIcon,
  Clear as ClearIcon,
  ElectricBolt as EnergyIcon,
} from '@mui/icons-material'
import ReactMarkdown from 'react-markdown'
import api from '../services/api'

// ─── Szenario-JSON aus Markdown-Text extrahieren ──────────────────────────────
function extractScenarioJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/i)
  if (!match) return null
  try {
    const data = JSON.parse(match[1].trim())
    return typeof data === 'object' && data !== null ? data : null
  } catch {
    return null
  }
}

// ─── Einzelne Nachrichtenblase ─────────────────────────────────────────────────
function MessageBubble({ msg, onOpenInEditor, onSaveToScenario, selectedScenario }) {
  const isUser = msg.role === 'user'
  // scenario_json can be stored directly on the message object (from API response)
  // or extracted from legacy text blocks
  const scenarioJson = !isUser ? (msg.scenario_json || extractScenarioJson(msg.content)) : null
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveToScenario(scenarioJson)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="flex-start"
      sx={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
    >
      <Avatar
        sx={{
          width: 32,
          height: 32,
          bgcolor: isUser ? 'primary.main' : 'secondary.main',
          flexShrink: 0,
          mt: 0.5,
        }}
      >
        {isUser ? <PersonIcon sx={{ fontSize: 18 }} /> : <BotIcon sx={{ fontSize: 18 }} />}
      </Avatar>

      <Box sx={{ maxWidth: '80%', minWidth: 60 }}>
        <Paper
          elevation={0}
          sx={{
            px: 2,
            py: 1.5,
            bgcolor: isUser ? 'primary.main' : 'action.hover',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            '& p': { m: 0 },
            '& pre': {
              background: isUser ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)',
              borderRadius: 1,
              p: 1,
              overflowX: 'auto',
              fontSize: '0.78rem',
            },
            '& code': { fontSize: '0.78rem' },
          }}
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </Typography>
          ) : (
            <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </Box>
          )}
        </Paper>

        {/* Actions below the bubble */}
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: isUser ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
          {!isUser && (
            <Tooltip title={copied ? 'Copied!' : 'Copy'}>
              <IconButton size="small" onClick={handleCopy} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                <CopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {scenarioJson && (
            <Tooltip title="Open in KSE Editor">
              <Chip
                size="small"
                icon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                label="Open in editor"
                color="success"
                variant="outlined"
                onClick={() => onOpenInEditor(scenarioJson)}
                sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
              />
            </Tooltip>
          )}
          {scenarioJson && selectedScenario && (
            <Tooltip title={`Overwrite "${selectedScenario.name}" with this config`}>
              <Chip
                size="small"
                label={saving ? 'Saving…' : `Save to "${selectedScenario.name}"`}
                color="primary"
                variant="outlined"
                onClick={handleSave}
                disabled={saving}
                sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
              />
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Stack>
  )
}

// ─── Hauptkomponente ───────────────────────────────────────────────────────────
export default function KSEChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hi! I am your KSE assistant. I help you create and edit game scenarios.\n\n' +
        '**To edit an existing scenario:**\n' +
        '1. Select it from the *Scenario context* dropdown (top right)\n' +
        '2. Describe the changes you want in plain language — I\'ll ask if anything is unclear\n' +
        '3. I\'ll confirm what I changed, then you can **Save** directly or **Open in editor** to review\n\n' +
        '**I can also explain how calculations work** — market clearing, dispatch, KPIs, balancing — just ask.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [scenarios, setScenarios] = useState([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [error, setError] = useState(null)
  const [providerInfo, setProviderInfo] = useState({ provider: '', model: '' })
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const selectedScenario = scenarios.find((s) => String(s.id) === String(selectedScenarioId)) || null

  // Szenarien für den Kontext-Picker laden
  useEffect(() => {
    api.get('/api/kse/scenarios').then((r) => setScenarios(r.data || [])).catch(() => {})
  }, [])

  // Auto-scroll zum Ende
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const payload = {
        // Nur tatsächliche Gesprächsnachrichten (nicht die Begrüßung) senden
        messages: nextMessages.filter((m) => !(m.role === 'assistant' && nextMessages.indexOf(m) === 0)),
        scenario_id: selectedScenarioId || undefined,
      }
      const { data } = await api.post('/api/ksechat/chat', payload)
      if (data.provider) setProviderInfo({ provider: data.provider, model: data.model })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, scenario_json: data.scenario_json || null },
      ])
    } catch (err) {
      setError(err.response?.data?.message || 'Network error – please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleOpenInEditor = (scenarioJson) => {
    sessionStorage.setItem('ksechat_prefill', JSON.stringify(scenarioJson))
    if (selectedScenarioId) sessionStorage.setItem('ksechat_prefill_id', String(selectedScenarioId))
    navigate(selectedScenarioId ? `/kse?id=${selectedScenarioId}` : '/kse')
  }

  const handleSaveToScenario = async (scenarioJson) => {
    if (!selectedScenario) return
    try {
      await api.put(`/api/kse/scenarios/${selectedScenario.id}`, {
        name: selectedScenario.name,
        campaign_id: selectedScenario.campaign_id ?? null,
        config: scenarioJson,
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `✅ Scenario **"${selectedScenario.name}"** saved successfully.` },
      ])
    } catch (err) {
      const respData = err.response?.data || {}
      const validationErrors = Array.isArray(respData.errors) ? respData.errors : null
      const statusCode = err.response?.status

      if (validationErrors && validationErrors.length > 0) {
        // Show validation errors inline and trigger auto-healing via LLM
        const errorList = validationErrors.map((e) => `- ${e}`).join('\n')
        const healMsg = `The scenario could not be saved because it contains **${validationErrors.length} validation error(s)**:\n\n${errorList}\n\nI will now fix these issues automatically.`
        setMessages((prev) => [...prev, { role: 'assistant', content: healMsg }])

        // Auto-heal: send the errors back to the LLM with the broken JSON and ask for a fix
        setLoading(true)
        setError(null)
        try {
          const healPrompt = `The scenario config you provided failed backend validation with these errors:\n${errorList}\n\nPlease fix ALL of these issues and return the corrected complete scenario JSON.`
          const healPayload = {
            messages: [
              ...messages.filter((m) => !(m.role === 'assistant' && messages.indexOf(m) === 0)),
              { role: 'user', content: healPrompt },
            ],
            scenario_id: selectedScenarioId || undefined,
            scenario_context: scenarioJson,
          }
          const { data } = await api.post('/api/ksechat/chat', healPayload)
          if (data.provider) setProviderInfo({ provider: data.provider, model: data.model })
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.reply, scenario_json: data.scenario_json || null },
          ])
          if (!data.scenario_json) {
            setError('Auto-healing failed to produce a valid scenario. Please review the errors and try again manually.')
          }
        } catch (healErr) {
          setError('Auto-healing request failed. Please fix the errors manually and try again.')
        } finally {
          setLoading(false)
        }
      } else if (statusCode === 404) {
        setError(`Scenario "${selectedScenario.name}" was not found. It may have been deleted.`)
      } else if (statusCode === 403) {
        setError('You do not have permission to save this scenario.')
      } else {
        setError(respData.message || `Failed to save scenario (HTTP ${statusCode || 'unknown'}).`)
      }
    }
  }

  const handleClearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Chat cleared. How can I help you?',
      },
    ])
    setError(null)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        maxWidth: 900,
        mx: 'auto',
        gap: 0,
      }}
    >
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderRadius: 0,
        }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
          <EnergyIcon sx={{ fontSize: 18 }} />
        </Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
            KSE Assistant
          </Typography>
          <Typography variant="caption" color="text.secondary">
            LLM-assisted scenario design · designers only
            {providerInfo.provider && (
              <> · <strong>{providerInfo.provider}</strong> / {providerInfo.model}</>
            )}
          </Typography>
        </Box>

        {/* Szenario-Kontext auswählen */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Scenario context</InputLabel>
          <Select
            label="Scenario context"
            value={selectedScenarioId}
            onChange={(e) => setSelectedScenarioId(e.target.value)}
          >
            <MenuItem value="">
              <em>No context</em>
            </MenuItem>
            {scenarios.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Clear chat">
          <IconButton size="small" onClick={handleClearChat}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* ─── Verlauf ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          px: 2,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onOpenInEditor={handleOpenInEditor}
            onSaveToScenario={handleSaveToScenario}
            selectedScenario={selectedScenario}
          />
        ))}

        {loading && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              <BotIcon sx={{ fontSize: 18 }} />
            </Avatar>
            <Paper
              elevation={0}
              sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderRadius: '4px 16px 16px 16px' }}
            >
              <CircularProgress size={16} />
            </Paper>
          </Stack>
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div ref={bottomRef} />
      </Box>

      <Divider />

      {/* ─── Eingabe ─────────────────────────────────────────────────── */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="Type a message… (Enter = Send, Shift+Enter = new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          variant="outlined"
        />
        <IconButton
          color="primary"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          sx={{ mb: 0.25 }}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  )
}
