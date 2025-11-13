import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Snackbar, Alert } from '@mui/material'

const SnackbarCtx = createContext({ notify: (_msg, _opts) => {}, showSnack: (_msg, _sev) => {} })

export function useSnackbar(){
  const ctx = useContext(SnackbarCtx)
  return {
    notify: ctx.notify,
    showSnack: ctx.showSnack // Alias for convenience
  }
}

export default function SnackbarProvider({ children }){
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState('info')
  const [duration, setDuration] = useState(6000) // Changed to 6s

  const notify = useCallback((msg, opts={}) => {
    setMessage(msg || '')
    setSeverity(opts.severity || 'info')
    setDuration(opts.duration || 6000)
    setOpen(true)
  }, [])

  // Alias: showSnack(message, severity)
  const showSnack = useCallback((msg, sev = 'info') => {
    notify(msg, { severity: sev })
  }, [notify])

  useEffect(()=>{
    // expose to non-react modules (e.g., axios interceptors)
    if (typeof window !== 'undefined') {
      window.__snack = notify
      window.__showSnack = showSnack // Alias
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__snack
        delete window.__showSnack
      }
    }
  }, [notify, showSnack])

  return (
    <SnackbarCtx.Provider value={{ notify, showSnack }}>
      {children}
      <Snackbar open={open} autoHideDuration={duration} onClose={()=>setOpen(false)} anchorOrigin={{ vertical:'bottom', horizontal:'center' }}>
        <Alert onClose={()=>setOpen(false)} severity={severity} variant="filled" sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </SnackbarCtx.Provider>
  )
}
