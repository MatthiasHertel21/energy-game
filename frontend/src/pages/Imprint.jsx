import React from 'react'
import { Container, Typography, Paper, Grid, Box, Divider, Link } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'

export default function Imprint() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accentLinkColor = isDark ? theme.palette.primary.light : theme.palette.primary.main

  const Section = ({ title, children }) => (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
        Imprint
      </Typography>

      <Paper sx={{ p: 4 }}>
        <Section title="Publisher">
          <Typography variant="body1" paragraph>
            Deutsche Gesellschaft für Internationale Zusammenarbeit (GIZ) GmbH
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Registered offices: Bonn and Eschborn, Germany
          </Typography>
          <Typography variant="body2" paragraph>
            South African-German Energy Programme (SAGEN) – Capacities for the Energy Transition (CET)
          </Typography>
          <Typography variant="body2">
            GIZ South Africa<br />
            Hatfield Gardens, Block C<br />
            333 Grosvenor Street<br />
            Hatfield, Pretoria<br />
            South Africa
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="Contact">
          <Typography variant="body2">
            E-mail:{' '}
            <Link href="mailto:sagen@giz.de" sx={{ color: accentLinkColor }}>
              sagen@giz.de
            </Link>
          </Typography>
          <Typography variant="body2">
            Website:{' '}
            <Link href="https://www.sagen.org.za" target="_blank" rel="noopener noreferrer" sx={{ color: accentLinkColor }}>
              www.sagen.org.za
            </Link>
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="Responsible for Content">
          <Typography variant="body2">
            Deutsche Gesellschaft für Internationale Zusammenarbeit (GIZ) GmbH
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="Technical Development">
          <Typography variant="body2">
            <Link href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" sx={{ color: accentLinkColor }}>
              Fastbreak.One
            </Link>
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="Disclaimer">
          <Typography variant="body2" paragraph>
            The Electricity Market Simulation Game is intended for educational and capacity-development
            purposes. Market outcomes, prices, scenarios and results generated within the simulation do
            not represent actual market forecasts, operational instructions or investment advice.
          </Typography>
          <Typography variant="body2">
            While every effort has been made to ensure the accuracy and relevance of the simulation,
            neither GIZ, National Transmission Company South Africa, Power Futures Lab nor Fastbreak.One
            assume liability for decisions taken on the basis of information generated through the game.
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="Data Protection">
          <Typography variant="body2">
            The processing of personal data on this platform is carried out in accordance with applicable
            data protection legislation. Further information can be found in the Data Privacy Notice.
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section title="External Links">
          <Typography variant="body2">
            This website may contain links to external websites. Responsibility for the content of
            external websites lies solely with their respective operators. GIZ assumes no responsibility
            for the content of external sites linked from this platform.
          </Typography>
        </Section>

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
