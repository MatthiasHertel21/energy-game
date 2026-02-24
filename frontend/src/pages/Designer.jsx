import React from 'react'
import { Box, Container, Typography, Button } from '@mui/material'
import { Add as AddIcon } from '@mui/icons-material'
import DesignerScenariosTab from '../components/DesignerScenariosTab'
import DocsFab from '../components/DocsFab'
import { useNavigate } from 'react-router-dom'

export default function Designer() {
  const navigate = useNavigate()

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Scenarios
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />}
          onClick={() => navigate('/kse')}
        >
          Add Scenario
        </Button>
      </Box>

      <DesignerScenariosTab />

      <DocsFab href="/docs/designer" label="Open Designer Handbook" />
    </Container>
  )
}
