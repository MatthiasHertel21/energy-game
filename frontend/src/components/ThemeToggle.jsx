import React from 'react'
import { IconButton, Tooltip, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'

export default function ThemeToggle({ mode, onToggle, showLabel = false }) {
  const icon = mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />
  const tooltip = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  if (showLabel) {
    return (
      <Tooltip title={tooltip}>
        <ListItemButton onClick={onToggle} sx={{ borderRadius: 1 }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            {icon}
          </ListItemIcon>
          <ListItemText primary="Tag/Nachtmodus" />
        </ListItemButton>
      </Tooltip>
    )
  }

  return (
    <Tooltip title={tooltip}>
      <IconButton onClick={onToggle} color="inherit">
        {icon}
      </IconButton>
    </Tooltip>
  )
}
