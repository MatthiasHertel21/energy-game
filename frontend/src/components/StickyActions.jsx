import React from 'react'
import { Paper, Stack, Button } from '@mui/material'

export default function StickyActions({ onSave, onPreview, onImport, onDescription, onTemplate, disabled }){
  return (
    <Paper elevation={6} sx={{ position: 'fixed', left: 16, right: 16, bottom: 16, p: 1.5, zIndex: 1300 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={onSave} disabled={disabled}>Save</Button>
        <Button variant="outlined" onClick={onPreview} disabled={disabled}>Validate + Preview</Button>
        <Button variant="outlined" onClick={onImport}>Import/Export</Button>
        <Button variant="outlined" onClick={onDescription}>Edit Description</Button>
        <Button variant="outlined" color="secondary" onClick={onTemplate}>Load Template</Button>
      </Stack>
    </Paper>
  )
}
