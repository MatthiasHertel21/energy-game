import React from 'react'
import { Paper, Typography, List, ListItem, ListItemText } from '@mui/material'

export default function ValidationPanel({ errors = [] }){
  if (!errors || errors.length === 0) return null
  return (
    <Paper elevation={3} sx={{ p: 2, position: 'sticky', top: 16, maxHeight: 320, overflow: 'auto' }}>
      <Typography variant="subtitle1" gutterBottom>Validation</Typography>
      <List dense>
        {errors.map((e, i) => (
          <ListItem key={i} component="a" href="#kse-top" sx={{ py: 0, alignItems: 'flex-start' }}>
            <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={e} />
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
