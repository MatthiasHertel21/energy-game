import React from 'react'
import { Container, Paper, Typography, Box, Alert } from '@mui/material'

export default function Settings() {
  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          Settings page coming soon! Here you'll be able to configure your preferences and application settings.
        </Alert>
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Planned features:
          </Typography>
          <ul>
            <li>Notification preferences</li>
            <li>Display settings (theme, language)</li>
            <li>Email preferences</li>
            <li>Privacy settings</li>
            <li>Account security</li>
          </ul>
        </Box>
      </Paper>
    </Container>
  )
}
