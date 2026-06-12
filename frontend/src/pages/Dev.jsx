import React from 'react'
import {
  Container, Typography, Paper, Box, Divider, Chip, Stack, Link, Grid
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CodeIcon from '@mui/icons-material/Code'
import StorageIcon from '@mui/icons-material/Storage'
import LayersIcon from '@mui/icons-material/Layers'
import GitHubIcon from '@mui/icons-material/GitHub'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

const REPO_URL = 'https://github.com/MatthiasHertel21/energy-game'

const Badge = ({ label, color = 'default' }) => (
  <Chip label={label} size="small" color={color} variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
)

export default function Dev() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const linkColor = isDark ? theme.palette.primary.light : theme.palette.primary.main

  const Section = ({ icon, title, children }) => (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        {icon}
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
      </Stack>
      {children}
    </Box>
  )

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <CodeIcon color="primary" />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Developer Info</Typography>
      </Stack>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Technical overview of the Energy Market Simulation Game (EMSG) platform.
      </Typography>

      {/* Repo link */}
      <Paper
        variant="outlined"
        sx={{ p: 3, mb: 4, display: 'flex', alignItems: 'center', gap: 2,
          borderColor: 'primary.main', bgcolor: isDark ? 'grey.900' : 'primary.50' }}
      >
        <GitHubIcon color="primary" sx={{ fontSize: 32 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Source Code</Typography>
          <Typography variant="body2" color="text.secondary">
            Open source under the MIT License
          </Typography>
        </Box>
        <Link
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: linkColor, fontWeight: 600 }}
        >
          GitHub <OpenInNewIcon sx={{ fontSize: 16 }} />
        </Link>
      </Paper>

      <Paper sx={{ p: 4 }}>
        <Section icon={<LayersIcon color="action" />} title="Architecture">
          <Typography variant="body2" paragraph>
            EMSG is a single-page web application backed by a Python API and a PostgreSQL database.
            Real-time updates (round transitions, market phase changes, timer ticks) are delivered via
            WebSocket.
          </Typography>
          <Box
            component="pre"
            sx={{
              bgcolor: isDark ? 'grey.900' : 'grey.100',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >
{`React (Vite) SPA
    │
    ├── REST API (Flask + Flask-RESTX)
    ├── WebSocket (Flask-SocketIO / eventlet)
    │
    ├── PostgreSQL 16   — sessions, results, scenarios, users
    └── Redis 7         — SocketIO broker, rate-limiter`}
          </Box>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section icon={<StorageIcon color="action" />} title="Tech Stack">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                Frontend
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Badge label="React 18" />
                <Badge label="Vite" />
                <Badge label="Material UI" />
                <Badge label="D3.js" />
                <Badge label="Socket.IO client" />
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                Backend
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Badge label="Python 3.12" />
                <Badge label="Flask" />
                <Badge label="SQLAlchemy" />
                <Badge label="Gunicorn / eventlet" />
                <Badge label="Flask-JWT-Extended" />
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                Data
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Badge label="PostgreSQL 16" />
                <Badge label="Redis 7" />
              </Stack>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                Testing
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Badge label="Pytest" />
                <Badge label="Cypress" />
                <Badge label="Locust" />
              </Stack>
            </Grid>
          </Grid>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section icon={<CodeIcon color="action" />} title="Key Source Locations">
          {[
            ['backend/app/engine.py', 'Market clearing, dispatch, KPI calculation'],
            ['backend/app/sessions.py', 'Session orchestration and result APIs'],
            ['backend/app/scheduler.py', 'Round timer, phase transitions'],
            ['frontend/src/pages/Player.jsx', 'Active player workspace'],
            ['frontend/src/pages/Trainer.jsx', 'Live trainer control panel'],
            ['frontend/src/pages/KSE.jsx', 'Scenario editor (KSE)'],
          ].map(([path, desc]) => (
            <Box key={path} sx={{ mb: 1.5 }}>
              <Link
                href={`${REPO_URL}/blob/main/${path}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: linkColor }}
              >
                {path}
              </Link>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                — {desc}
              </Typography>
            </Box>
          ))}
        </Section>

        <Divider sx={{ my: 3 }} />

        <Section icon={<StorageIcon color="action" />} title="Quick Start">
          <Box
            component="pre"
            sx={{
              bgcolor: isDark ? 'grey.900' : 'grey.100',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              overflowX: 'auto',
              lineHeight: 1.8,
            }}
          >
{`git clone https://github.com/MatthiasHertel21/energy-game.git
cd energy-game
cp .env.example .env
docker-compose up -d --build`}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            After startup: frontend on <code>:18080</code>, API docs at <code>/api/docs</code>,
            health check at <code>/api/health</code>.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <strong>First admin account:</strong> The first user to register at <code>/register</code> is
            automatically promoted to the <em>admin</em> role — no database seed or environment variable
            required. Subsequent users register as <em>player</em> by default and must be promoted by an
            admin via the Admin panel or via invite (<code>POST /api/admin/invite</code>).
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary">
          For contribution guidelines see{' '}
          <Link href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" sx={{ color: linkColor }}>
            CONTRIBUTING.md
          </Link>
          {' '}in the repository.
          For deployment and operations see{' '}
          <Link href="/docs/admin" sx={{ color: linkColor }}>
            the admin handbook
          </Link>.
        </Typography>
      </Paper>
    </Container>
  )
}
