import React from 'react'
import { Container, Typography, Paper, Grid, Box, Divider, List, ListItem, ListItemIcon, ListItemText } from '@mui/material'
import CircleIcon from '@mui/icons-material/Circle'
import { alpha, useTheme } from '@mui/material/styles'

export default function About() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const infoSurface = isDark ? alpha(theme.palette.info.main, 0.18) : '#e3f2fd'
  const successSurface = isDark ? alpha(theme.palette.success.main, 0.16) : '#e8f5e9'
  const accentLinkColor = isDark ? theme.palette.primary.light : theme.palette.primary.main

  const bulletItems = (items) => (
    <List dense disablePadding>
      {items.map((item, i) => (
        <ListItem key={i} sx={{ py: 0.25, alignItems: 'flex-start' }}>
          <ListItemIcon sx={{ minWidth: 24, mt: '6px' }}>
            <CircleIcon sx={{ fontSize: 7, color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
        </ListItem>
      ))}
    </List>
  )

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 1, fontWeight: 700 }}>
        About the Electricity Market Simulation Game (EMSG)
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        An interactive tool for understanding electricity markets
      </Typography>

      {/* Welcome Banner */}
      <Paper sx={{ p: 4, mb: 4, bgcolor: infoSurface, borderRadius: 2, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          Welcome to the EMSG!
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          Are you ready to trade electricity in the market?
        </Typography>
      </Paper>

      {/* Introduction */}
      <Paper sx={{ p: 4, mb: 4 }}>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          The Electricity Market Simulation Game (EMSG) is an interactive, web-based learning tool designed
          to help participants understand how competitive electricity markets operate in practice. Through a
          realistic market simulation, players take on the role of electricity market participants and make
          decisions under conditions similar to those faced by generators, traders, utilities, system
          operators and large electricity consumers.
        </Typography>
        <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
          Rather than learning market concepts through theory alone, participants experience first-hand how
          electricity is bought and sold, how prices are formed, and how market participants respond to
          uncertainty and changing system conditions.
        </Typography>
      </Paper>

      {/* How it works */}
      <Paper sx={{ p: 4, mb: 4, bgcolor: successSurface, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          How the EMSG works
        </Typography>
        <Typography variant="body2" paragraph>
          During the simulation, participants:
        </Typography>
        {bulletItems([
          'Submit bids and offers into the Day-Ahead Market',
          'Adjust their positions in the Intraday Market',
          'Respond to changing market conditions and unforeseen events',
          'Manage generation outages, weather impacts and forecast deviations',
          'Balance commercial objectives with operational constraints',
          'Minimise imbalance costs while maximising financial performance',
        ])}
        <Typography variant="body2" sx={{ mt: 2 }}>
          Each decision influences market outcomes, allowing participants to observe how individual actions
          collectively shape electricity prices, system balancing requirements and market efficiency.
        </Typography>
      </Paper>

      {/* Learning Objectives */}
      <Paper sx={{ p: 4, mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Learning Objectives
        </Typography>
        <Typography variant="body2" paragraph>
          The EMSG provides a practical introduction to key concepts of electricity markets, including:
        </Typography>
        {bulletItems([
          'Electricity market design and operation',
          'Price formation and market signals',
          'Day-Ahead and Intraday trading',
          'Balancing and settlement mechanisms',
          'Risk management and trading strategies',
          'System flexibility and security of supply',
          'Market participant behaviour and incentives',
        ])}
        <Typography variant="body2" sx={{ mt: 2 }}>
          The simulation is particularly valuable for professionals working in electricity regulation,
          system operation, market operation, policy-making, utility management, academia and the broader
          energy sector.
        </Typography>
      </Paper>

      {/* South Africa context */}
      <Paper sx={{ p: 4, mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Supporting South Africa's Energy Transition
        </Typography>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          South Africa is undergoing a significant transformation of its electricity sector, including the
          establishment of a competitive electricity market. The EMSG was developed to support capacity
          development and stakeholder preparedness for this transition by providing an accessible and
          engaging environment in which participants can explore market mechanisms and understand their
          practical implications.
        </Typography>
        <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
          By combining experiential learning with realistic market scenarios, the simulation helps bridge
          the gap between market theory and real-world application.
        </Typography>
      </Paper>

      {/* Development & Partners */}
      <Paper sx={{ p: 4, borderTop: 3, borderColor: 'primary.main' }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Development and Partners
        </Typography>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          The EMSG was developed in 2025 by{' '}
          <a href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Fastbreak.One
          </a>{' '}
          under the{' '}
          <a href="https://www.sagen.org.za" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            South African-German Energy Programme (SAGEN) | Capacities for the Energy Transition
          </a>{' '}
          and in close collaboration with the{' '}
          <a href="https://www.ntcsa.co.za" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            National Transmission Company South Africa (NTCSA)
          </a>{' '}
          and the{' '}
          <a href="https://www.gsb.uct.ac.za/power-futures-lab" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Power Futures Lab (PFL)
          </a>{' '}
          at the University of Cape Town Graduate School of Business.
        </Typography>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          SAGEN is implemented by{' '}
          <a href="https://www.giz.de" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Deutsche Gesellschaft für Internationale Zusammenarbeit (GIZ) GmbH
          </a>{' '}
          on behalf of the{' '}
          <a href="https://www.bmz.de" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Federal Ministry for Economic Development and Cooperation (BMZ)
          </a>.
        </Typography>
        <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
          The EMSG forms part of broader efforts to strengthen technical, regulatory and institutional
          capacities required for South Africa's evolving electricity market landscape.
        </Typography>

        <Divider sx={{ my: 4 }} />

        {/* Partner logos */}
        <Grid container spacing={4} alignItems="center" justifyContent="center">
          <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
            <Typography variant="overline" display="block" color="text.secondary" gutterBottom>Funded by</Typography>
            <Box component="img" src="/logos/bmz.png" alt="BMZ" sx={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }} />
          </Grid>
          <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
            <Typography variant="overline" display="block" color="text.secondary" gutterBottom>Implemented by</Typography>
            <Box component="img" src="/logos/sa-german-cooperation.png" alt="South African-German Cooperation / GIZ" sx={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }} />
          </Grid>
          <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
            <Typography variant="overline" display="block" color="text.secondary" gutterBottom>Programme</Typography>
            <Box component="img" src="/logos/sagen.png" alt="SAGEN" sx={{ maxHeight: 70, maxWidth: '100%', objectFit: 'contain' }} />
          </Grid>
        </Grid>
      </Paper>
    </Container>
  )
}
