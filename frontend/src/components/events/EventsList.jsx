import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Box,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
} from '@mui/icons-material';

/**
 * EventsList - Table view of scenario events with actions
 * 
 * @param {array} events - Array of event objects
 * @param {function} onEdit - Callback (event, index) => void
 * @param {function} onDelete - Callback (index) => void
 * @param {function} onDuplicate - Callback (index) => void
 */
export default function EventsList({ events = [], onEdit, onDelete, onDuplicate }) {
  if (events.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No events defined yet. Click "Add Event" to create one.
        </Typography>
      </Paper>
    );
  }

  const getTriggerDisplay = (event) => {
    if (event.trigger_type === 'round') {
      return `Round ${event.trigger_value || 1}`;
    } else if (event.trigger_type === 'prob') {
      return `${(event.trigger_value * 100 || 0).toFixed(0)}% chance`;
    }
    return event.trigger_type || 'Unknown';
  };

  const getTargetDisplay = (event) => {
    if (event.target === 'all') return 'All';
    if (event.target === 'zone' && event.target_id) return `Zone ${event.target_id}`;
    if (event.target === 'player' && event.target_id) return `Player ${event.target_id}`;
    return event.target || 'All';
  };

  const getImpactDisplay = (event) => {
    const parts = [];
    if (event.multiplier && event.multiplier !== 1.0) {
      parts.push(`×${event.multiplier}`);
    }
    if (event.additive && event.additive !== 0) {
      parts.push(`${event.additive > 0 ? '+' : ''}${event.additive}`);
    }
    return parts.length > 0 ? parts.join(' ') : '—';
  };

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Trigger</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Target</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Impact</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((event, idx) => (
            <TableRow key={idx} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={500}>
                  {event.name || `Event ${idx + 1}`}
                </Typography>
                {event.description && (
                  <Typography variant="caption" color="text.secondary">
                    {event.description.length > 50
                      ? event.description.substring(0, 50) + '...'
                      : event.description}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Chip
                  label={event.type || 'systemic'}
                  size="small"
                  color={event.type === 'systemic' ? 'primary' : 'default'}
                />
              </TableCell>
              <TableCell>{getTriggerDisplay(event)}</TableCell>
              <TableCell>
                {event.duration_rounds || 1} round{event.duration_rounds > 1 ? 's' : ''}
              </TableCell>
              <TableCell>{getTargetDisplay(event)}</TableCell>
              <TableCell>
                <Typography variant="body2" fontFamily="monospace">
                  {getImpactDisplay(event)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => onEdit(event, idx)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplicate">
                  <IconButton size="small" onClick={() => onDuplicate(idx)}>
                    <DuplicateIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => onDelete(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
