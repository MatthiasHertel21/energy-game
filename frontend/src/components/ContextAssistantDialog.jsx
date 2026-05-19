import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  Close as CloseIcon,
  Person as PersonIcon,
  Send as SendIcon,
  SmartToy as BotIcon,
} from '@mui/icons-material'
import ReactMarkdown from 'react-markdown'
import api from '../services/api'

function MessageBubble({ message }) {
  const isUser = message.role === 'user'

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

      <Box sx={{ maxWidth: '82%', minWidth: 60 }}>
        <Paper
          elevation={0}
          sx={{
            px: 2,
            py: 1.5,
            bgcolor: isUser ? 'primary.main' : 'action.hover',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            '& p': { m: 0 },
            '& ul, & ol': { my: 0, pl: 3 },
            '& > *:first-of-type': { mt: 0 },
            '& > *:last-child': { mb: 0 },
          }}
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <Box>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </Box>
          )}
        </Paper>
      </Box>
    </Stack>
  )
}

export default function ContextAssistantDialog({
  title = 'AI Assistant',
  buttonLabel = 'Ask AI',
  intro = 'Ask questions about the current page. I will answer based on the visible context.',
  placeholder = 'Ask a question...',
  contextLabel = 'Current page context',
  context = null,
  resetKey = 'default',
  buttonVariant = 'outlined',
  buttonColor = 'primary',
  buttonSize = 'medium',
  buttonSx,
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', content: intro }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [providerInfo, setProviderInfo] = useState({ provider: '', model: '' })
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setMessages([{ role: 'assistant', content: intro }])
    setInput('')
    setLoading(false)
    setError(null)
    setProviderInfo({ provider: '', model: '' })
  }, [intro, resetKey])

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [open])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const payload = {
        messages: nextMessages.filter((message, index) => !(message.role === 'assistant' && index === 0)),
        context_label: contextLabel,
        context,
      }
      const { data } = await api.post('/api/ksechat/qa', payload)
      if (data.provider) {
        setProviderInfo({ provider: data.provider, model: data.model })
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply || 'No answer available.' }])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The assistant request failed. Please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      <Button
        variant={buttonVariant}
        color={buttonColor}
        size={buttonSize}
        startIcon={<BotIcon />}
        onClick={() => setOpen(true)}
        sx={buttonSx}
      >
        {buttonLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { height: { xs: '85vh', md: '78vh' } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              Question-answer assistant for this page
              {providerInfo.provider ? ` - ${providerInfo.provider} / ${providerInfo.model}` : ''}
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} size="small" aria-label="Close assistant">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0 }}>
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
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} message={message} />
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

            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

            <div ref={bottomRef} />
          </Box>

          <Divider />

          <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={6}
              size="small"
              placeholder={placeholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              variant="outlined"
            />
            <IconButton color="primary" onClick={sendMessage} disabled={!input.trim() || loading} sx={{ mb: 0.25 }}>
              <SendIcon />
            </IconButton>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
