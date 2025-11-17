import React from 'react'
import { Box, Button, Stack } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DownloadIcon from '@mui/icons-material/Download'
import DescriptionIcon from '@mui/icons-material/Description'
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
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={onSave}
          disabled={disabled}
        >
          Save
        </Button>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={onValidate}
        >
          Validate + Preview
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={onImportExport}
        >
          Import/Export
        </Button>
        <Button
          variant="outlined"
          startIcon={<DescriptionIcon />}
          onClick={onEditDescription}
        >
          Edit Description
        </Button>
        <Button
          variant="outlined"
          startIcon={<TemplateIcon />}
          onClick={onLoadTemplate}
        >
          Load Template
        </Button>
      </Stack>
    </Box>
  )
}
