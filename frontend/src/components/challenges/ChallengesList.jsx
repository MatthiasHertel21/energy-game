import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  IconButton,
  Chip,
  Button
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

/**
 * ChallengesList - Display list of challenges with add/edit/delete actions
 */
export default function ChallengesList({ challenges = [], onAdd, onEdit, onDelete }) {
  if (challenges.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary" gutterBottom>
          No challenges defined yet
        </Typography>
        <Typography variant="caption" display="block" sx={{ mb: 2 }}>
          Challenges define goals for players to achieve during the scenario.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
          Add First Challenge
        </Button>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      {challenges.map((challenge, index) => (
        <Paper key={challenge.id || index} sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                  {challenge.name || 'Unnamed Challenge'}
                </Typography>
                {challenge.required && (
                  <Chip label="Required" size="small" color="error" sx={{ height: 20 }} />
                )}
                {challenge.per_round && (
                  <Chip label="Per Round" size="small" color="warning" sx={{ height: 20 }} />
                )}
                <Chip
                  label={`${challenge.points || 0} pts`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 20 }}
                />
              </Stack>

              {challenge.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {challenge.description}
                </Typography>
              )}

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', px: 1, py: 0.5, borderRadius: 1 }}>
                  {challenge.metric}
                </Typography>
                <Typography variant="caption" fontWeight={600}>
                  {challenge.operator}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'success.lighter', px: 1, py: 0.5, borderRadius: 1 }}>
                  {challenge.target}
                </Typography>
                {challenge.applicable_to && Array.isArray(challenge.applicable_to) && (
                  <>
                    <Typography variant="caption" color="text.secondary">•</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Applies to: {challenge.applicable_to.join(', ')}
                    </Typography>
                  </>
                )}
              </Stack>
            </Box>

            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={() => onEdit(index)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => onDelete(index)} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Paper>
      ))}

      <Button variant="outlined" startIcon={<AddIcon />} onClick={onAdd}>
        Add Challenge
      </Button>
    </Stack>
  );
}
