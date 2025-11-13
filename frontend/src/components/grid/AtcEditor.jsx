import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  IconButton,
  FormControlLabel,
  Switch,
  Tooltip,
  Typography,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  LockOutlined as LockIcon,
  LockOpen as UnlockIcon,
} from '@mui/icons-material';

/**
 * AtcEditor - Fullscreen modal for editing ATC (Available Transfer Capacity) matrix
 * 
 * Features:
 * - Fullscreen dialog with sticky headers
 * - Symmetry lock (enforces atc[i][j] = atc[j][i])
 * - CSV Import/Export
 * - Validation (non-negative, numeric)
 */
export default function AtcEditor({ open, onClose, zones, atcMatrix, onSave }) {
  const [matrix, setMatrix] = useState([]);
  const [symmetryLock, setSymmetryLock] = useState(true);

  useEffect(() => {
    if (open && zones && atcMatrix) {
      // Initialize matrix with current values
      const n = zones.length;
      const newMatrix = Array(n).fill(0).map((_, i) =>
        Array(n).fill(0).map((_, j) => atcMatrix[i]?.[j] ?? 0)
      );
      setMatrix(newMatrix);
    }
  }, [open, zones, atcMatrix]);

  const handleCellChange = (i, j, value) => {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;

    const newMatrix = matrix.map(row => [...row]);
    newMatrix[i][j] = val;

    // Apply symmetry if locked
    if (symmetryLock && i !== j) {
      newMatrix[j][i] = val;
    }

    setMatrix(newMatrix);
  };

  const handleSave = () => {
    onSave(matrix);
    onClose();
  };

  const handleExportCSV = () => {
    if (!zones || matrix.length === 0) return;

    // Create CSV content with zone names as headers
    let csv = ',' + zones.map(z => z.name).join(',') + '\n';
    matrix.forEach((row, i) => {
      csv += zones[i].name + ',' + row.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atc_matrix.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result;
        const lines = csv.split('\n').filter(line => line.trim());
        
        // Skip header row
        const dataLines = lines.slice(1);
        const newMatrix = dataLines.map(line => {
          const cells = line.split(',').slice(1); // Skip zone name column
          return cells.map(cell => {
            const val = parseFloat(cell.trim());
            return isNaN(val) ? 0 : Math.max(0, val);
          });
        });

        // Validate dimensions
        if (newMatrix.length === zones.length && newMatrix.every(row => row.length === zones.length)) {
          setMatrix(newMatrix);
        } else {
          alert('CSV dimensions do not match zone count');
        }
      } catch (error) {
        alert('Failed to parse CSV file');
        console.error(error);
      }
    };
    reader.readAsText(file);
    
    // Reset input
    e.target.value = '';
  };

  if (!zones || zones.length === 0) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: {
          bgcolor: 'background.default',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Edit ATC Matrix
        </Typography>
        
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={symmetryLock ? "Symmetry Locked" : "Symmetry Unlocked"}>
            <FormControlLabel
              control={
                <Switch
                  checked={symmetryLock}
                  onChange={(e) => setSymmetryLock(e.target.checked)}
                  icon={<UnlockIcon />}
                  checkedIcon={<LockIcon />}
                />
              }
              label="Symmetry"
            />
          </Tooltip>

          <Tooltip title="Export CSV">
            <IconButton onClick={handleExportCSV}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Import CSV">
            <IconButton component="label">
              <UploadIcon />
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={handleImportCSV}
              />
            </IconButton>
          </Tooltip>

          <IconButton onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Box
          sx={{
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 200px)',
          }}
        >
          <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 3,
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    border: '1px solid rgba(224, 224, 224, 1)',
                    padding: '8px',
                    fontWeight: 600,
                  }}
                >
                  From / To
                </th>
                {zones.map((zone, j) => (
                  <th
                    key={j}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      backgroundColor: 'var(--mui-palette-background-paper)',
                      border: '1px solid rgba(224, 224, 224, 1)',
                      padding: '8px',
                      minWidth: 100,
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    {zone.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((zone, i) => (
                <tr key={i}>
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      backgroundColor: 'var(--mui-palette-background-paper)',
                      border: '1px solid rgba(224, 224, 224, 1)',
                      padding: '8px',
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {zone.name}
                  </th>
                  {zones.map((_, j) => (
                    <td
                      key={j}
                      style={{
                        border: '1px solid rgba(224, 224, 224, 1)',
                        padding: '4px',
                        backgroundColor: i === j ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                      }}
                    >
                      {i === j ? (
                        <Box sx={{ textAlign: 'center', color: 'text.disabled', py: 1 }}>
                          —
                        </Box>
                      ) : (
                        <TextField
                          type="number"
                          value={matrix[i]?.[j] ?? 0}
                          onChange={(e) => handleCellChange(i, j, e.target.value)}
                          size="small"
                          inputProps={{
                            min: 0,
                            step: 10,
                            style: { textAlign: 'center' },
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              '& fieldset': { border: 'none' },
                            },
                          }}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Units: MW • Diagonal cells (same zone) are disabled • 
            {symmetryLock && ' Symmetry locked: changes to (i,j) also update (j,i)'}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
