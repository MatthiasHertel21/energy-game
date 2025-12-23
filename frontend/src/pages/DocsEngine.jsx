import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Container, Paper, Typography } from '@mui/material'

export default function DocsEngine(){
  const [content, setContent] = useState('# Calculation Engine Documentation\n\nLoading...')
  useEffect(()=>{
    fetch('/handbooks/calculation-engine.md')
      .then(r=> r.text())
      .then(setContent)
      .catch(()=> setContent('# Calculation Engine Documentation\n\nFailed to load.'))
  },[])
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Paper sx={{ p: 3, maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
        <Typography variant="h4" gutterBottom>Calculation Engine</Typography>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </Paper>
    </Container>
  )
}
