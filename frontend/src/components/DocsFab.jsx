import React from 'react'
import { Fab, Tooltip } from '@mui/material'
import { MenuBook as BookIcon } from '@mui/icons-material'

export default function DocsFab({ href = '#', label = 'Open handbook' }){
  return (
    <Tooltip title={label} placement="left">
      <Fab
        color="primary"
        size="medium"
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        sx={{ position:'fixed', right: 24, bottom: 24, zIndex: 1200 }}
      >
        <BookIcon />
      </Fab>
    </Tooltip>
  )
}
