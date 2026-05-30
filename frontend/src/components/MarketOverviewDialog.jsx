import React, { useEffect, useMemo, useState } from 'react'
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

function OverviewPanel({ cards = [], sections = [], content = null }) {
  return (
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

      {content}
    </Stack>
  )
}

export default function MarketOverviewDialog({
  open,
  onClose,
  title = 'Market Overview',
  subtitle = '',
  cards = [],
  sections = [],
  tabs = [],
  defaultTabId = null,
  headerControls = null,
}) {
  const normalizedTabs = useMemo(() => {
    const tabItems = Array.isArray(tabs)
      ? tabs.filter(Boolean).map((tab, idx) => ({
          id: tab.id || `tab-${idx + 1}`,
          label: tab.label || `Tab ${idx + 1}`,
          cards: tab.cards || [],
          sections: tab.sections || [],
          content: tab.content || null,
          disabled: !!tab.disabled,
        }))
      : []

    if (tabItems.length > 0) return tabItems

    return [{
      id: 'overview',
      label: 'Overview',
      cards,
      sections,
      content: null,
      disabled: false,
    }]
  }, [cards, sections, tabs])

  const fallbackTabId = useMemo(() => {
    const enabledTabs = normalizedTabs.filter((tab) => !tab.disabled)
    const preferred = enabledTabs.find((tab) => tab.id === defaultTabId)
    return preferred?.id || enabledTabs[0]?.id || normalizedTabs[0]?.id || 'overview'
  }, [defaultTabId, normalizedTabs])

  const [activeTabId, setActiveTabId] = useState(fallbackTabId)

  useEffect(() => {
    setActiveTabId((current) => {
      const currentTab = normalizedTabs.find((tab) => tab.id === current)
      return currentTab && !currentTab.disabled ? current : fallbackTabId
    })
  }, [fallbackTabId, normalizedTabs])

  useEffect(() => {
    if (open) {
      setActiveTabId(fallbackTabId)
    }
  }, [fallbackTabId, open])

  const activeTab = normalizedTabs.find((tab) => tab.id === activeTabId) || normalizedTabs[0]
  const showTabs = normalizedTabs.length > 1

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
        <Stack direction="row" spacing={1} alignItems="center">
          {headerControls}
          <IconButton onClick={onClose} size="small" aria-label="Close market overview">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {showTabs ? (
            <Tabs
              value={activeTab?.id || false}
              onChange={(_, nextValue) => setActiveTabId(nextValue)}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Market overview tabs"
            >
              {normalizedTabs.map((tab) => (
                <Tab key={tab.id} value={tab.id} label={tab.label} disabled={tab.disabled} />
              ))}
            </Tabs>
          ) : null}

          <OverviewPanel
            cards={activeTab?.cards || []}
            sections={activeTab?.sections || []}
            content={activeTab?.content || null}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
