import React from 'react'
import { Stack, Tooltip, Typography, Box } from '@mui/material'

export default function InfoLabel({ title, tooltip }){
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {title}
      </Typography>
      <Tooltip title={tooltip} arrow enterDelay={300}>
        <Box
          component="span"
          sx={{
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            bgcolor: 'action.hover',
            color: 'text.secondary',
            fontSize: 12,
            cursor: 'help',
            userSelect: 'none',
          }}
          aria-label="More info"
        >
          i
        </Box>
      </Tooltip>
    </Stack>
  )
}
