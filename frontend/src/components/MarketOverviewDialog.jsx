import React from 'react'
import {
  Box,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

export default function MarketOverviewDialog({
  open,
  onClose,
  title = 'Market Overview',
  subtitle = '',
  cards = [],
  sections = [],
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close market overview">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {cards.length > 0 ? (
            <Grid container spacing={2}>
              {cards.map((card) => (
                <Grid item xs={12} sm={6} md={3} key={card.key || card.title}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="overline" color="text.secondary">
                        {card.title}
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: card.color || 'text.primary' }}>
                        {card.value}
                      </Typography>
                      {card.caption ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {card.caption}
                        </Typography>
                      ) : null}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : null}

          {sections.map((section, idx) => (
            <Paper key={section.title || idx} variant="outlined" sx={{ p: 2 }}>
              {section.title ? (
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                  {section.title}
                </Typography>
              ) : null}

              {Array.isArray(section.rows) && section.rows.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    {section.columns ? (
                      <TableHead>
                        <TableRow>
                          {section.columns.map((column) => (
                            <TableCell key={column.key || column.label} align={column.align || 'left'}>
                              {column.label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                    ) : null}
                    <TableBody>
                      {section.rows.map((row, rowIdx) => (
                        <TableRow key={row.key || rowIdx}>
                          {section.columns
                            ? section.columns.map((column) => (
                                <TableCell key={column.key} align={column.align || 'left'}>
                                  {row[column.key]}
                                </TableCell>
                              ))
                            : (
                              <>
                                <TableCell sx={{ fontWeight: 600, width: '40%' }}>{row.label}</TableCell>
                                <TableCell>{row.value}</TableCell>
                              </>
                            )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : null}

              {Array.isArray(section.items) && section.items.length > 0 ? (
                <Stack spacing={0.75}>
                  {section.items.map((item, itemIdx) => (
                    <Typography key={item.key || itemIdx} variant="body2" color="text.secondary">
                      • {item.text}
                    </Typography>
                  ))}
                </Stack>
              ) : null}

              {idx < sections.length - 1 ? <Divider sx={{ mt: 2 }} /> : null}
            </Paper>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
