import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Container, Paper, Typography } from '@mui/material'

export default function DocsPlayer(){
  const [content, setContent] = useState('# Player Handbook\n\nLoading...')
  useEffect(()=>{
    fetch('/handbooks/player-handbook.md').then(r=> r.text()).then(setContent).catch(()=> setContent('# Player Handbook\n\nFailed to load.'))
  },[])
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
        <Paper sx={{ p: 3, maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
        <Typography variant="h4" gutterBottom>Player Handbook</Typography>
        <ReactMarkdown>{content}</ReactMarkdown>
      </Paper>
    </Container>
  )
}
