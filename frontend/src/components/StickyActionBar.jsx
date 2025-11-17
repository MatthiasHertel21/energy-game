import React from 'react'
import { Box, Button, Stack } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TemplateIcon from '@mui/icons-material/GetApp'

export default function StickyActionBar({
  onSave,
  onValidate,
  onImportExport,
  onEditDescription,
  onLoadTemplate,
  disabled = false
}) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        py: 1.5,
        px: 3,
        zIndex: 1100,
        boxShadow: 3
      }}
    >
      <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={onValidate}
        >
          Validate + Preview
        </Button>
        {onLoadTemplate ? (
          <Button
            variant="outlined"
            startIcon={<TemplateIcon />}
            onClick={onLoadTemplate}
          >
            Load Template
          </Button>
        ) : null}
      </Stack>
    </Box>
  )
}
