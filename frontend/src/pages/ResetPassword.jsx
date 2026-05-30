import React, { useState } from 'react'
import { TextField, Button, Paper, Typography, Stack, Alert } from '@mui/material'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  // Request mode (no token)
  const [email, setEmail] = useState('')
  const [requestDone, setRequestDone] = useState(false)
  const [requestError, setRequestError] = useState('')

  // Confirm mode (token present)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmDone, setConfirmDone] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  const onRequest = async (e) => {
    e.preventDefault()
    setRequestError('')
    try {
      await api.post('/api/auth/password-reset/request', { email: email.trim().toLowerCase() })
      setRequestDone(true)
    } catch {
      setRequestError('An error occurred. Please try again.')
    }
  }

  const onConfirm = async (e) => {
    e.preventDefault()
    setConfirmError('')
    if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match.')
      return
    }
    try {
      await api.post('/api/auth/password-reset/confirm', { token, new_password: newPassword })
      setConfirmDone(true)
    } catch (err) {
      setConfirmError(err.response?.data?.message || 'Invalid or expired link. Please request a new one.')
    }
  }

  if (token) {
    return (
      <Paper sx={{ maxWidth: 480, mx: 'auto', p: 3 }}>
        <Typography variant="h5" gutterBottom>Set new password</Typography>
        {confirmDone ? (
          <Stack spacing={2}>
            <Alert severity="success">Your password has been updated.</Alert>
            <Button variant="contained" onClick={() => navigate('/login')}>Sign in</Button>
          </Stack>
        ) : (
          <form onSubmit={onConfirm}>
            <Stack spacing={2}>
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                inputProps={{ minLength: 8 }}
                helperText="Minimum 8 characters"
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmError && <Alert severity="error">{confirmError}</Alert>}
              <Button type="submit" variant="contained">Set password</Button>
              <Button size="small" onClick={() => navigate('/login')}>Back to sign in</Button>
            </Stack>
          </form>
        )}
      </Paper>
    )
  }

  return (
    <Paper sx={{ maxWidth: 480, mx: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom>Reset password</Typography>
      {requestDone ? (
        <Stack spacing={2}>
          <Alert severity="info">
            If that email address is registered, a reset link has been sent. Please check your inbox.
          </Alert>
          <Button size="small" onClick={() => navigate('/login')}>Back to sign in</Button>
        </Stack>
      ) : (
        <form onSubmit={onRequest}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Enter your email address and we will send you a link to reset your password.
            </Typography>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {requestError && <Alert severity="error">{requestError}</Alert>}
            <Button type="submit" variant="contained">Send reset link</Button>
            <Button size="small" onClick={() => navigate('/login')}>Back to sign in</Button>
          </Stack>
        </form>
      )}
    </Paper>
  )
}
