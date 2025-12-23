import React, { useState } from 'react'
import { TextField, Button, Paper, Typography, Stack, Divider, Box } from '@mui/material'
import api from '../services/api'
import useAuth from '../store/auth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const setSession = useAuth((s) => s.setSession)
  const navigate = useNavigate()

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      setSession(data)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    }
  }

  return (
    <Paper sx={{ maxWidth: 520, mx: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom>Sign in to EMSG</Typography>
      <form onSubmit={onSubmit}>
        <Stack spacing={2}>
          <TextField label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <TextField label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          {error && <Typography color="error">{error}</Typography>}
          <Button type="submit" variant="contained">Sign in</Button>
        </Stack>
      </form>
      <Divider sx={{ my: 3 }} />
      <Box>
        <Typography variant="subtitle2" gutterBottom>Handbooks</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button size="small" component="a" href="/docs/player" target="_blank" rel="noopener noreferrer">Player</Button>
          <Button size="small" component="a" href="/docs/trainer" target="_blank" rel="noopener noreferrer">Trainer</Button>
          <Button size="small" component="a" href="/docs/designer" target="_blank" rel="noopener noreferrer">Designer</Button>
          <Button size="small" component="a" href="/docs/admin" target="_blank" rel="noopener noreferrer">Admin</Button>
          <Button size="small" component="a" href="/docs/engine" target="_blank" rel="noopener noreferrer">Calc Engine</Button>
        </Stack>
      </Box>
    </Paper>
  )
}