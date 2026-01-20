import React, { useEffect, useState } from 'react'
import { 
  Container, 
  Paper, 
  Typography, 
  Stack, 
  TextField, 
  Button, 
  Box,
  Alert,
  CircularProgress
} from '@mui/material'
import { ArrowBack as BackIcon, Save as SaveIcon } from '@mui/icons-material'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'

const PAGE_NAMES = {
  'did-you-know': 'Did You Know',
  'course-materials': 'Course Materials'
}

export default function AdminEditStaticPage() {
  const { pageKey } = useParams()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/api/static-pages/${pageKey}`)
        setTitle(data.title || PAGE_NAMES[pageKey] || pageKey)
        setContent(data.content || '')
      } catch (error) {
        console.error('Failed to load page:', error)
        setTitle(PAGE_NAMES[pageKey] || pageKey)
        setContent('')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [pageKey])

  const handleSave = async () => {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Title is required' })
      return
    }

    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      await api.put(`/api/static-pages/${pageKey}`, {
        title: title.trim(),
        content: content
      })
      setMessage({ type: 'success', text: 'Page saved successfully!' })
      
      // Navigate back after short delay
      setTimeout(() => {
        navigate(-1)
      }, 1500)
    } catch (error) {
      console.error('Failed to save page:', error)
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to save page' 
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Button 
        startIcon={<BackIcon />} 
        onClick={() => navigate(-1)} 
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Edit Static Page: {PAGE_NAMES[pageKey] || pageKey}
        </Typography>

        {message.text && (
          <Alert severity={message.type} sx={{ mb: 3 }}>
            {message.text}
          </Alert>
        )}

        <Stack spacing={3}>
          <TextField
            label="Page Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            helperText="The title displayed at the top of the page"
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Content (Markdown supported)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              You can use Markdown syntax: **bold**, *italic*, ## headings, lists, links, etc.
            </Typography>
            <TextField
              multiline
              rows={20}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              placeholder="Enter your content here... Markdown is supported."
              sx={{
                '& textarea': {
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {content.length} characters
            </Typography>
          </Box>

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? 'Saving...' : 'Save Page'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(-1)}
              disabled={saving}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ mt: 4, pt: 4, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom>
            Markdown Preview
          </Typography>
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 3, 
              minHeight: 200,
              bgcolor: 'grey.50',
              '& h1, & h2, & h3, & h4, & h5, & h6': { mt: 2, mb: 1 },
              '& p': { mb: 2 },
              '& ul, & ol': { mb: 2, pl: 3 },
              '& li': { mb: 0.5 },
              '& code': { 
                bgcolor: 'grey.200', 
                px: 0.5, 
                py: 0.25, 
                borderRadius: 0.5,
                fontFamily: 'monospace'
              },
              '& pre': { 
                bgcolor: 'grey.200', 
                p: 2, 
                borderRadius: 1, 
                overflow: 'auto',
                mb: 2
              }
            }}
          >
            {content ? (
              <div dangerouslySetInnerHTML={{ 
                __html: content
                  .split('\n')
                  .map(line => {
                    // Very basic markdown rendering for preview
                    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>')
                    line = line.replace(/^## (.+)$/g, '<h2>$1</h2>')
                    line = line.replace(/^### (.+)$/g, '<h3>$1</h3>')
                    line = line.replace(/^# (.+)$/g, '<h1>$1</h1>')
                    return line
                  })
                  .join('<br/>')
              }} />
            ) : (
              <Typography color="text.secondary" fontStyle="italic">
                Preview will appear here...
              </Typography>
            )}
          </Paper>
        </Box>
      </Paper>
    </Container>
  )
}
