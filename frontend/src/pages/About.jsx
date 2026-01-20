import React from 'react'
import { Container, Typography, Paper, Grid, Box, Button, Stack, Divider } from '@mui/material'
import { GitHub as GitHubIcon, Info as InfoIcon, Email as EmailIcon, MenuBook as DocsIcon, School as TrainerIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()

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
          bgcolor: '#e3f2fd',
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
              bgcolor: '#e3f2fd',
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
              sx={{ mt: 2, bgcolor: '#ffd700', color: '#000', '&:hover': { bgcolor: '#ffed4e' } }}
            >
              Click here to access GitHub
            </Button>
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'block', 
                mt: 1, 
                bgcolor: '#ffd700', 
                color: '#000',
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
              bgcolor: '#e8f5e9',
              borderRadius: 2
            }}
          >
            <Box
              sx={{
                bgcolor: '#76ff03',
                color: '#000',
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
      <Paper sx={{ p: 4, mb: 4, bgcolor: '#fff3e0' }}>
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
          <a href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
            Fastbreak.One
          </a>{' '}
          under the{' '}
          <a href="https://www.giz.de/en/worldwide/86454.html" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
            South African-German Energy Programme (SAGEN)
          </a>{' '}
          of{' '}
          <a href="https://www.giz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
            GIZ
          </a>
          , funded by{' '}
          <a href="https://www.bmz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
            BMZ
          </a>
          , in collaboration with{' '}
          <a href="https://www.ntcsa.co.za" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
            NTCSA
          </a>{' '}
          and the{' '}
          <a href="https://www.gsb.uct.ac.za/power-futures-lab" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
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
