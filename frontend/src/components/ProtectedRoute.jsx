import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useAuth from '../store/auth'

export default function ProtectedRoute({ roles = [] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles.length && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Outlet />
}