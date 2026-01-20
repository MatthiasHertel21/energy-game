import React from 'react'
import { Container, Typography, Paper, Box, Button } from '@mui/material'
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

export default function AboutDetails() {
  const navigate = useNavigate()

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/about')}
        sx={{ mb: 3 }}
      >
        Back to About
      </Button>

      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        About EMSG
      </Typography>

      <Paper sx={{ p: 4 }}>
        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8 }}>
          The <strong>Electricity Market Simulation Game (EMSG)</strong> is an interactive learning tool that 
          allows participants to step into the role of an electricity market actor and experience the dynamics 
          of modern power markets. Players develop generation and demand forecasts, trade electricity in the 
          Day-Ahead and Intraday markets, respond to unexpected events such as outages or weather changes, and 
          aim to maximise profits while minimising imbalances. Through hands-on decision-making, EMSG builds a 
          practical understanding of price formation, market coupling, and the interaction between different 
          trading horizons.
        </Typography>

        <Typography variant="body1" paragraph sx={{ lineHeight: 1.8, mt: 3 }}>
          EMSG was developed in 2025 by{' '}
          <a href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            Fastbreak.One
          </a>{' '}
          under the{' '}
          <a href="https://www.giz.de/en/worldwide/86454.html" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            South African-German Energy Programme (SAGEN) | Capacities for the Energy Transition
          </a>
          , implemented by{' '}
          <a href="https://www.giz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            Deutsche Gesellschaft für Internationale Zusammenarbeit (GIZ) GmbH
          </a>{' '}
          and funded by the{' '}
          <a href="https://www.bmz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            Federal Ministry for Economic Development and Cooperation (BMZ)
          </a>
          . The initiative was carried out in collaboration with the{' '}
          <a href="https://www.ntcsa.co.za" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            National Transmission Company South Africa (NTCSA)
          </a>{' '}
          and the{' '}
          <a href="https://www.gsb.uct.ac.za/power-futures-lab" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', fontWeight: 600 }}>
            Power Futures Lab (PFL)
          </a>{' '}
          at the University of Cape Town Graduate School of Business.
        </Typography>

        <Box sx={{ mt: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Partners
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>
              <a href="https://fastbreak.one" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                Fastbreak.One
              </a>
            </strong> - Software development and platform architecture
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>
              <a href="https://www.giz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                GIZ (Deutsche Gesellschaft für Internationale Zusammenarbeit)
              </a>
            </strong> - International development cooperation
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>
              <a href="https://www.bmz.de" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                BMZ (Federal Ministry for Economic Development and Cooperation)
              </a>
            </strong> - Funding
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>
              <a href="https://www.giz.de/en/worldwide/86454.html" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                SAGEN (South African-German Energy Programme)
              </a>
            </strong> - Programme framework
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>
              <a href="https://www.ntcsa.co.za" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                NTCSA (National Transmission Company South Africa)
              </a>
            </strong> - Collaboration partner
          </Typography>
          <Typography variant="body2">
            <strong>
              <a href="https://www.gsb.uct.ac.za/power-futures-lab" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                PFL (Power Futures Lab)
              </a>
            </strong> - UCT Graduate School of Business
          </Typography>
        </Box>
      </Paper>
    </Container>
  )
}
