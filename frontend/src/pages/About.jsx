import React from 'react'
import { Container, Typography, Paper, Grid, Box, Button, Stack, Divider } from '@mui/material'
import { GitHub as GitHubIcon, Info as InfoIcon, Email as EmailIcon, MenuBook as DocsIcon, School as TrainerIcon } from '@mui/icons-material'
import { alpha, useTheme } from '@mui/material/styles'
import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const infoSurface = isDark ? alpha(theme.palette.info.main, 0.18) : '#e3f2fd'
  const successSurface = isDark ? alpha(theme.palette.success.main, 0.16) : '#e8f5e9'
  const warnSurface = isDark ? alpha(theme.palette.warning.main, 0.16) : '#fff3e0'
  const accentLinkColor = isDark ? theme.palette.primary.light : theme.palette.primary.main
  const highlightPillBg = isDark ? alpha(theme.palette.success.main, 0.35) : '#76ff03'
  const highlightPillColor = isDark ? theme.palette.success.contrastText : '#000'
  const githubBtnBg = isDark ? theme.palette.warning.main : '#ffd700'
  const githubBtnHover = isDark ? theme.palette.warning.dark : '#ffed4e'
  const githubBtnText = isDark ? theme.palette.getContrastText(theme.palette.warning.main) : '#000'

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 1, fontWeight: 600 }}>
        About EMSG (Electricity Market Simulation Game)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        An interactive tool for understanding electricity markets
      </Typography>

      {/* Welcome Section */}
      <Paper 
        sx={{ 
          p: 4, 
          mb: 4,
          bgcolor: infoSurface,
          borderRadius: 2,
          textAlign: 'center'
        }}
      >
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          Welcome to the EMSG!
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          Are you ready to trade electricity in the South African market?
        </Typography>
      </Paper>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Open Source Section */}
        <Grid item xs={12} md={6}>
          <Paper 
            sx={{ 
              p: 3, 
              height: '100%',
              bgcolor: infoSurface,
              borderRadius: 2
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Open Source
            </Typography>
            <Typography variant="body2" paragraph>
              EMSG is a free and open-source tool. The source code is openly published for use and modification on GitHub.
            </Typography>
            <Button
              variant="contained"
              startIcon={<GitHubIcon />}
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ mt: 2, bgcolor: githubBtnBg, color: githubBtnText, '&:hover': { bgcolor: githubBtnHover } }}
            >
              Click here to access GitHub
            </Button>
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'block', 
                mt: 1, 
                bgcolor: githubBtnBg, 
                color: githubBtnText,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                width: 'fit-content'
              }}
            >
              Code uploaded
            </Typography>
          </Paper>
        </Grid>

        {/* About EMSG Section */}
        <Grid item xs={12} md={6}>
          <Paper 
            sx={{ 
              p: 3, 
              height: '100%',
              bgcolor: successSurface,
              borderRadius: 2
            }}
          >
            <Box
              sx={{
                bgcolor: highlightPillBg,
                color: highlightPillColor,
                px: 2,
                py: 0.5,
                borderRadius: 1,
                display: 'inline-block',
                mb: 2,
                fontWeight: 600
              }}
            >
              About EMSG
            </Box>
            <Typography variant="body2" paragraph>
              EMSG's web interface and content was developed jointly by Fastbreak.One, GIZ, NTCSA and PFL.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<InfoIcon />}
              onClick={() => navigate('/about/details')}
              sx={{ mt: 2 }}
            >
              Click here to learn more
            </Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Learn More Section */}
      <Paper sx={{ p: 4, mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
          Learn more about the EMSG
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              fullWidth
              size="large"
              startIcon={<DocsIcon />}
              onClick={() => navigate('/docs/player')}
              sx={{ py: 2 }}
            >
              Documentation
            </Button>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              fullWidth
              size="large"
              startIcon={<TrainerIcon />}
              onClick={() => navigate('/about/details')}
              sx={{ py: 2 }}
            >
              How it works
            </Button>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              fullWidth
              size="large"
              startIcon={<InfoIcon />}
              onClick={() => navigate('/about/details')}
              sx={{ py: 2 }}
            >
              Project Background
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Feedback Section */}
      <Paper sx={{ p: 4, mb: 4, bgcolor: warnSurface, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Do you have questions or feedback?
        </Typography>
        <Typography variant="body2" paragraph>
          We'd love to hear from you! Please share your thoughts, questions, or suggestions.
        </Typography>
        <Button
          variant="contained"
          startIcon={<EmailIcon />}
          href="mailto:info@example.com"
          sx={{ mt: 1 }}
        >
          Contact Us
        </Button>
      </Paper>

      {/* Acknowledgements */}
      <Paper sx={{ p: 4, borderTop: 3, borderColor: 'primary.main' }}>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          The <strong>Electricity Market Simulation Game (EMSG)</strong> is an interactive tool that enables 
          participants to act as electricity market players, forecast generation and demand, trade in Day-Ahead 
          and Intraday markets, and respond to unexpected events. It builds practical understanding of price 
          formation, market coupling, and the dynamics of modern power markets.
        </Typography>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          Developed in 2025 by{' '}
          <a href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Fastbreak.One
          </a>{' '}
          under the{' '}
          <a href="https://www.giz.de/en/worldwide/86454.html" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            South African-German Energy Programme (SAGEN)
          </a>{' '}
          of{' '}
          <a href="https://www.giz.de" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            GIZ
          </a>
          , funded by{' '}
          <a href="https://www.bmz.de" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            BMZ
          </a>
          , in collaboration with{' '}
          <a href="https://www.ntcsa.co.za" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            NTCSA
          </a>{' '}
          and the{' '}
          <a href="https://www.gsb.uct.ac.za/power-futures-lab" target="_blank" rel="noopener noreferrer" style={{ color: accentLinkColor }}>
            Power Futures Lab (PFL)
          </a>{' '}
          at UCT Graduate School of Business.
        </Typography>

        <Divider sx={{ my: 3 }} />

        {/* Logos */}
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Partners
        </Typography>
        <Grid container spacing={3} alignItems="center" justifyContent="center">
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>GIZ</Typography>
            </Box>
          </Grid>
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>BMZ</Typography>
            </Box>
          </Grid>
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>SAGEN</Typography>
            </Box>
          </Grid>
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>NTCSA</Typography>
            </Box>
          </Grid>
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>PFL</Typography>
            </Box>
          </Grid>
          <Grid item>
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Fastbreak.One</Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  )
}
