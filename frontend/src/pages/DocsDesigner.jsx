import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Container, Paper, Typography } from '@mui/material'

export default function DocsDesigner(){
  const [content, setContent] = useState('# Designer Handbook\n\nLoading...')
  useEffect(()=>{
    fetch('/handbooks/designer-handbook.md').then(r=> r.text()).then(setContent).catch(()=> setContent('# Designer Handbook\n\nFailed to load.'))
  },[])
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Paper sx={{ p: 3, maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
        <Typography variant="h4" gutterBottom>Designer Handbook</Typography>
        <ReactMarkdown>{content}</ReactMarkdown>
      </Paper>
    </Container>
  )
}
