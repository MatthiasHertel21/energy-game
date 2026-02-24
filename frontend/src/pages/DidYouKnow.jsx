import React, { useEffect, useState } from 'react'
import { Container, Paper, Typography, Box, Skeleton, Button } from '@mui/material'
import { ArrowBack as BackIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import api from '../services/api'
import useAuth from '../store/auth'

export default function DidYouKnow() {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/api/static-pages/did-you-know')
        setContent(data)
      } catch (error) {
        console.error('Failed to load page:', error)
        setContent({
          title: 'Did You Know',
          content: 'Content not available yet.',
          key: 'did-you-know'
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <Container maxWidth={false} disableGutters sx={{ mt: 4, mb: 6, px: 3 }}>
        <Skeleton variant="text" height={60} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={400} />
      </Container>
    )
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ mt: 4, mb: 0, px: 3, height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 3, flex: 1, overflow: 'auto' }}>
        <Button
          variant="outlined"
          startIcon={<BackIcon />} 
          onClick={() => navigate('/home')} 
          sx={{ mb: 2 }}
        >
          Back to Home
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" gutterBottom>
            {content?.title || 'Did You Know'}
          </Typography>
          {user?.role === 'admin' && (
            <Button 
              variant="outlined" 
              size="small"
              onClick={() => navigate('/admin/edit-page/did-you-know')}
            >
              Edit
            </Button>
          )}
        </Box>

        <Box sx={{ 
          '& h1, & h2, & h3, & h4, & h5, & h6': { mt: 3, mb: 2 },
          '& p': { mb: 2 },
          '& ul, & ol': { mb: 2, pl: 3 },
          '& li': { mb: 1 },
          '& code': { 
            bgcolor: 'grey.100', 
            px: 0.5, 
            py: 0.25, 
            borderRadius: 0.5,
            fontFamily: 'monospace'
          },
          '& pre': { 
            bgcolor: 'grey.100', 
            p: 2, 
            borderRadius: 1, 
            overflow: 'auto',
            mb: 2
          }
        }}>
          {content?.content ? (
            <ReactMarkdown>{content.content}</ReactMarkdown>
          ) : (
            <Typography color="text.secondary">
              No content available. {user?.role === 'admin' && 'Click "Edit" to add content.'}
            </Typography>
          )}
        </Box>
      </Paper>
    </Container>
  )
}
