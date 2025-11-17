import React from 'react'
import { Alert, AlertTitle, Box, Typography, Collapse, IconButton } from '@mui/material'
import { Close as CloseIcon, Warning as WarningIcon, Info as InfoIcon } from '@mui/icons-material'

/**
 * EventNotification - Displays active events during gameplay
 * 
 * Props:
 * - events: Array of active event objects { id, type, name, description, trigger, duration_rounds, target }
 * - onDismiss: Callback when notification is dismissed (receives event id)
 * - variant: 'warning' | 'info' (default 'info')
 */
export default function EventNotification({ events = [], onDismiss, variant = 'info' }) {
  if (!events || events.length === 0) return null

  const getSeverity = (eventType) => {
    const criticalTypes = ['plant_outage', 'grid_congestion', 'fuel_spike']
    return criticalTypes.includes(eventType) ? 'warning' : 'info'
  }

  const getEventIcon = (eventType) => {
    const criticalTypes = ['plant_outage', 'grid_congestion', 'fuel_spike']
    return criticalTypes.includes(eventType) ? <WarningIcon /> : <InfoIcon />
  }

  const getEventTitle = (event) => {
    const titles = {
      fuel_spike: '⚡ Fuel Price Spike',
      renewable_drought: '☀️ Renewable Generation Drop',
      plant_outage: '🔧 Plant Outage',
      demand_surge: '📈 Demand Surge',
      grid_congestion: '⚠️ Grid Congestion',
      carbon_tax: '💰 Carbon Tax Increase',
      battery_degradation: '🔋 Battery Degradation'
    }
    return titles[event.type] || event.name || 'Event Active'
  }

  const formatEventDescription = (event) => {
    const parts = []
    
    if (event.multiplier && event.multiplier !== 1.0) {
      const pct = ((event.multiplier - 1.0) * 100).toFixed(0)
      parts.push(`${pct > 0 ? '+' : ''}${pct}% impact`)
    }
    
    if (event.additive && event.additive !== 0) {
      parts.push(`${event.additive > 0 ? '+' : ''}${event.additive} adjustment`)
    }
    
    if (event.duration_rounds) {
      parts.push(`Duration: ${event.duration_rounds} round${event.duration_rounds > 1 ? 's' : ''}`)
    }
    
    if (event.target) {
      parts.push(`Target: ${event.target}`)
    }
    
    return parts.join(' • ')
  }

  return (
    <Box sx={{ mb: 2 }}>
      {events.map((event, index) => (
        <Collapse key={event.id || index} in={true} timeout={300}>
          <Alert
            severity={getSeverity(event.type)}
            icon={getEventIcon(event.type)}
            action={
              onDismiss && (
                <IconButton
                  aria-label="dismiss"
                  color="inherit"
                  size="small"
                  onClick={() => onDismiss(event.id)}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              )
            }
            sx={{ 
              mb: 1,
              '& .MuiAlert-message': { width: '100%' }
            }}
          >
            <AlertTitle sx={{ fontWeight: 'bold' }}>
              {getEventTitle(event)}
            </AlertTitle>
            <Typography variant="body2">
              {event.description || formatEventDescription(event)}
            </Typography>
          </Alert>
        </Collapse>
      ))}
    </Box>
  )
}
