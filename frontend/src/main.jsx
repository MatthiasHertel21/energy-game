import React, { useState, useMemo, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import App from './App'
import { createAppTheme } from './theme'

function Root() {
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('themeMode')
    return savedMode === 'dark' ? 'dark' : 'light'
  })

  const theme = useMemo(() => createAppTheme(mode), [mode])

  const toggleTheme = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light'
      localStorage.setItem('themeMode', newMode)
      return newMode
    })
  }

  return (
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App themeMode={mode} onToggleTheme={toggleTheme} />
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>
  )
}

createRoot(document.getElementById('root')).render(<Root />)