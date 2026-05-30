import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Container, Paper, Typography } from '@mui/material'

export default function DocsPlayer(){
  const [content, setContent] = useState('# Player Handbook\n\nLoading...')
  useEffect(()=>{
    fetch('/handbooks/player-handbook.md?v=20260527').then(r=> r.text()).then(setContent).catch(()=> setContent('# Player Handbook\n\nFailed to load.'))
  },[])
  return (
    <Container maxWidth={false} disableGutters sx={{ mt: 4, mb: 0, px: 3, height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
        <Paper sx={{ p: 3, flex: 1, overflow: 'auto' }}>
        <Typography variant="h4" gutterBottom>Player Handbook</Typography>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </Paper>
    </Container>
  )
}
