import React from 'react'
import { Box, Container, Typography, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import useAuth from '../store/auth'
import { Home as HomeIcon } from '@mui/icons-material'

export default function NotFound(){
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)

  const getHomePath = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'player':
        return '/home'
      case 'trainer':
        return '/trainer'
      case 'designer':
        return '/kse'
      case 'admin':
        return '/admin'
      default:
        return '/home'
    }
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
          gap: 3,
          mt: 4
        }}
      >
        <Typography variant="h1" sx={{ fontSize: '6rem', fontWeight: 'bold', color: 'text.secondary' }}>
          404
        </Typography>
        <Typography variant="h5" gutterBottom>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          The page you're looking for doesn't exist or has been moved.
        </Typography>
        <Button
          variant="contained"
          startIcon={<HomeIcon />}
          onClick={() => navigate(getHomePath())}
          size="large"
        >
          Go to Home
        </Button>
      </Box>
    </Container>
  )
}
