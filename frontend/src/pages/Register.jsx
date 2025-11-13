import React, { useEffect, useState } from 'react'
import { TextField, Button, Paper, Typography, Stack } from '@mui/material'
import api from '../services/api'
import useAuth from '../store/auth'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const setSession = useAuth((s) => s.setSession)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  useEffect(() => {
    const t = params.get('token')
    const e = params.get('email')
    if (t) setToken(t)
    if (e) setEmail(e)
  }, [params])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/api/auth/register', { email, password, invite_token: token || undefined })
      setSession(data)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    }
  }

  return (
    <Paper sx={{ maxWidth: 480, mx: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom>Create your account</Typography>
      <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>The first user becomes admin.</Typography>
      <form onSubmit={onSubmit}>
        <Stack spacing={2}>
          <TextField label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <TextField label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <TextField label="Invite Token (optional)" value={token} onChange={(e)=>setToken(e.target.value)} />
          {error && <Typography color="error">{error}</Typography>}
          <Button type="submit" variant="contained">Create account</Button>
        </Stack>
      </form>
    </Paper>
  )
}