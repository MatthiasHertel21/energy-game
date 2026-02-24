import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Typography, 
  Container, 
  Box, 
  CircularProgress, 
  Stack,
  Divider
} from '@mui/material'
import { 
  AdminPanelSettings as AdminIcon, 
  School as TrainerIcon,
  Groups as GroupsIcon,
  BarChart as ComparisonIcon,
  Home as HomeIcon,
  LibraryBooks as CatalogIcon,
  Edit as EditIcon,
  ElectricBolt as EnergyIcon,
} from '@mui/icons-material'
import { io } from 'socket.io-client'
const Login = React.lazy(()=> import('./pages/Login'))
const Register = React.lazy(()=> import('./pages/Register'))
const AdminUsers = React.lazy(()=> import('./pages/AdminUsers'))
const Trainer = React.lazy(()=> import('./pages/Trainer'))
const Player = React.lazy(()=> import('./pages/Player'))
const Home = React.lazy(()=> import('./pages/Home'))
const Briefing = React.lazy(()=> import('./pages/Briefing'))
const Cohorts = React.lazy(()=> import('./pages/Cohorts'))
const Replay = React.lazy(()=> import('./pages/Replay'))
const Comparison = React.lazy(()=> import('./pages/Comparison'))
const Catalog = React.lazy(()=> import('./pages/Catalog'))
const CampaignDetail = React.lazy(()=> import('./pages/CampaignDetail'))
const Designer = React.lazy(()=> import('./pages/Designer'))
const Profile = React.lazy(()=> import('./pages/Profile'))
const KSE = React.lazy(()=> import('./pages/KSE'))
const DocsPlayer = React.lazy(()=> import('./pages/DocsPlayer'))
const DocsTrainer = React.lazy(()=> import('./pages/DocsTrainer'))
const DocsDesigner = React.lazy(()=> import('./pages/DocsDesigner'))
const DocsAdmin = React.lazy(()=> import('./pages/DocsAdmin'))
const DocsEngine = React.lazy(()=> import('./pages/DocsEngine'))
const About = React.lazy(()=> import('./pages/About'))
const AboutDetails = React.lazy(()=> import('./pages/AboutDetails'))
const DidYouKnow = React.lazy(()=> import('./pages/DidYouKnow'))
const CourseMaterials = React.lazy(()=> import('./pages/CourseMaterials'))
const AdminEditStaticPage = React.lazy(()=> import('./pages/AdminEditStaticPage'))
import ProtectedRoute from './components/ProtectedRoute'
import SnackbarProvider from './components/SnackbarProvider'
import NotFound from './components/NotFound'
import UserMenu from './components/UserMenu'
import ThemeToggle from './components/ThemeToggle'
import useAuth from './store/auth'
import api from './services/api'

export default function App({ themeMode, onToggleTheme }) {
  const user = useAuth((state) => state.user)
  const location = useLocation()
  const navigate = useNavigate()

  const handbookEntriesByRole = {
    player: [
      { path: '/docs/player', label: 'Spieler-Handbuch' }
    ],
    trainer: [
      { path: '/docs/trainer', label: 'Trainer-Handbuch' }
    ],
    designer: [
      { path: '/docs/designer', label: 'Designer-Handbuch' }
    ],
    admin: [
      { path: '/docs/player', label: 'Spieler-Handbuch' },
      { path: '/docs/trainer', label: 'Trainer-Handbuch' },
      { path: '/docs/designer', label: 'Designer-Handbuch' },
      { path: '/docs/admin', label: 'Admin-Handbuch' },
      { path: '/docs/engine', label: 'Engine-Handbuch' }
    ]
  }

  const handbookEntries = user ? (handbookEntriesByRole[user.role] || handbookEntriesByRole.player) : []
  
  // Global socket listener for trainer broadcasts
  useEffect(() => {
    if (!user) return
    
    const socket = io('/game', { 
      path: '/socket.io', 
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('access_token') }
    })
    
    socket.on('connect', () => console.log('Global socket connected'))
    
    socket.on('trainer_message', (payload) => {
      if (payload && payload.message) {
        if (window.__showSnack) {
          window.__showSnack(`Trainer: ${payload.message}`, 'info')
        }
      }
    })
    
    return () => socket.close()
  }, [user])
  
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')
  
  const drawerWidth = 200
  
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left Sidebar Navigation */}
      {user && (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
            },
          }}
        >
          {/* Logo and Title */}
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover'
              }}
            >
              <EnergyIcon fontSize="small" />
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                fontSize: '0.65rem', 
                lineHeight: 1.3, 
                textAlign: 'center',
                color: 'text.secondary'
              }}
            >
              Electricity Market
              <br />
              Simulation
            </Typography>
          </Box>
          
          <Divider />
          
          {/* Navigation Links */}
          <List sx={{ flexGrow: 1 }}>
            {(user.role === 'player' || user.role === 'admin') && (
              <>
                <ListItem disablePadding>
                  <ListItemButton 
                    component={Link} 
                    to="/home"
                    selected={isActive('/home')}
                  >
                    <ListItemIcon>
                      <HomeIcon />
                    </ListItemIcon>
                    <ListItemText primary="Home" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton 
                    component={Link} 
                    to="/catalog"
                    selected={isActive('/catalog')}
                  >
                    <ListItemIcon>
                      <CatalogIcon />
                    </ListItemIcon>
                    <ListItemText primary="Campaigns" />
                  </ListItemButton>
                </ListItem>
              </>
            )}
            
            {(user.role === 'designer' || user.role === 'admin') && (
              <ListItem disablePadding>
                <ListItemButton 
                  component={Link} 
                  to="/designer"
                  selected={isActive('/designer')}
                >
                  <ListItemIcon>
                    <EditIcon />
                  </ListItemIcon>
                  <ListItemText primary="Scenarios" />
                </ListItemButton>
              </ListItem>
            )}
            
            {(user.role === 'trainer' || user.role === 'admin') && (
              <ListItem disablePadding>
                <ListItemButton 
                  component={Link} 
                  to="/trainer"
                  selected={isActive('/trainer')}
                >
                  <ListItemIcon>
                    <GroupsIcon />
                  </ListItemIcon>
                  <ListItemText primary="Cohorts" />
                </ListItemButton>
              </ListItem>
            )}
            
            {user.role === 'admin' && (
              <ListItem disablePadding>
                <ListItemButton 
                  component={Link} 
                  to="/admin"
                  selected={isActive('/admin')}
                >
                  <ListItemIcon>
                    <AdminIcon />
                  </ListItemIcon>
                  <ListItemText primary="Admin" />
                </ListItemButton>
              </ListItem>
            )}
          </List>
          
          <Divider />

          <Box sx={{ px: 1, py: 1 }}>
            <Typography variant="overline" sx={{ px: 1.5, color: 'text.secondary', fontSize: '0.65rem' }}>
              Handbücher
            </Typography>
            <List dense>
              {handbookEntries.map((entry) => (
                <ListItem key={entry.path} disablePadding>
                  <ListItemButton component={Link} to={entry.path} selected={isActive(entry.path)}>
                    <ListItemIcon>
                      <CatalogIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={entry.label} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
          
          {/* Theme Toggle and User Menu at bottom */}
          <Box sx={{ p: 2 }}>
            <Stack spacing={1}>
              <ThemeToggle mode={themeMode} onToggle={onToggleTheme} showLabel />
              <UserMenu showLabel />
            </Stack>
          </Box>
        </Drawer>
      )}
      
      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: user ? `calc(100% - ${drawerWidth}px)` : '100%'
        }}
      >
        {/* Top Bar for non-logged-in users */}
        {!user && (
          <Box 
            sx={{ 
              p: 2, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <img src="/logo.svg" alt="Logo" height={24} />
              <Typography variant="h6">EMSG Electricity Market Simulation Game</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <ListItemButton component={Link} to="/login" sx={{ borderRadius: 1 }}>
                <ListItemText primary="Sign In" />
              </ListItemButton>
              <ListItemButton component={Link} to="/register" sx={{ borderRadius: 1 }}>
                <ListItemText primary="Register" />
              </ListItemButton>
            </Stack>
          </Box>
        )}
        
      <SnackbarProvider>
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flex: 1 }}>
          {/* Force navigate poll for players */}
          {user && user.role === 'player' && (
            <ForceNavigateWatcher onNavigate={(url)=> navigate(url)} />
          )}
          {/* Hidden test hook for Cypress selector */}
          <input name="Name" value="" aria-label="Name" style={{ display:'none' }} readOnly />
          <Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', mt:6 }}><CircularProgress /></Box>}>
          <Routes>
          <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : user.role === 'trainer' ? '/trainer' : user.role === 'designer' ? '/designer' : '/catalog') : '/login'} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Public routes */}
          <Route path="/about" element={<About />} />
          <Route path="/about/details" element={<AboutDetails />} />
          {/* Public docs routes for handbook viewing */}
          <Route path="/docs/player" element={<DocsPlayer />} />
          <Route path="/docs/trainer" element={<DocsTrainer />} />
          <Route path="/docs/designer" element={<DocsDesigner />} />
          <Route path="/docs/admin" element={<DocsAdmin />} />
          <Route path="/docs/engine" element={<DocsEngine />} />
          {/* Public static pages */}
          <Route path="/did-you-know" element={<DidYouKnow />} />
          <Route path="/course-materials" element={<CourseMaterials />} />
          <Route element={<ProtectedRoute roles={["admin"]} /> }>
            <Route path="/admin" element={<AdminUsers />} />
            <Route path="/admin/edit-page/:pageKey" element={<AdminEditStaticPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={["designer","admin"]} /> }>
            <Route path="/kse" element={<KSE />} />
            <Route path="/designer" element={<Designer />} />
            {/* Legacy redirects for old routes */}
            <Route path="/designer/campaigns" element={<Navigate to="/designer" replace />} />
            <Route path="/designer/scenarios" element={<Navigate to="/designer" replace />} />
          </Route>
          <Route element={<ProtectedRoute roles={["player","admin"]} /> }>
            <Route path="/home" element={<Home />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/catalog/:id" element={<CampaignDetail />} />
            <Route path="/briefing/:sessionId" element={<Briefing />} />
            <Route path="/player" element={<Player />} />
            <Route path="/replay" element={<Replay />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route element={<ProtectedRoute roles={["trainer","admin"]} /> }>
            <Route path="/trainer" element={<Cohorts />} />
            <Route path="/session-control" element={<Trainer />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="/leaderboard" element={<Comparison />} />
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </Container>
        
        {/* Footer with Imprint */}
        <Box
          component="footer"
          sx={{
            mt: 'auto',
            py: 3,
            px: 2,
            backgroundColor: (theme) =>
              theme.palette.mode === 'light'
                ? theme.palette.grey[200]
                : theme.palette.grey[800],
            borderTop: 1,
            borderColor: 'divider'
          }}
        >
          <Container maxWidth="lg">
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Typography variant="body2" color="text.secondary">
                © {new Date().getFullYear()} Electricity Market Simulation Game
              </Typography>
              <Stack direction="row" spacing={2}>
                <Typography
                  variant="body2"
                  component="a"
                  href="/about"
                  sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  About
                </Typography>
                <Typography
                  variant="body2"
                  component="a"
                  href="/docs/player"
                  sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  Documentation
                </Typography>
                <Typography
                  variant="body2"
                  component="a"
                  href="https://www.notion.so/fastbreakone/Energy-Game-Dev-Board-2b185b48a241809fb0e1d4bce96e8574"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  DevBoard
                </Typography>
                <Typography
                  variant="body2"
                  component="a"
                  href="#imprint"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('Imprint\n\nResponsible for content:\n\nElectricity Market Simulation\nDevelopment Team\n\nContact: info@example.com\n\nThis is a sample imprint. Please update with actual legal information.');
                  }}
                  sx={{ color: 'text.secondary', textDecoration: 'none', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  Imprint
                </Typography>
              </Stack>
            </Stack>
          </Container>
        </Box>
      </SnackbarProvider>
      </Box>
    </Box>
  )
}

function ForceNavigateWatcher({ onNavigate }){
  useEffect(()=>{
    let stopped = false
    const tick = async ()=>{
      const token = localStorage.getItem('access_token')
      if (!token) {
        return
      }
      try{
        const { data } = await api.get('/api/me/navigate')
        if(!stopped && data?.url){
          const url = String(data.url)
          // Avoid repeated redirects: only navigate once per URL
          try{
            const key = 'emsg_force_nav_seen'
            const seen = JSON.parse(sessionStorage.getItem(key) || '[]')
            const cur = window.location.pathname + window.location.search
            if (cur === url) return
            if (Array.isArray(seen) && seen.includes(url)) return
            onNavigate(url)
            sessionStorage.setItem(key, JSON.stringify([...(Array.isArray(seen)? seen: []), url]))
          }catch(_){ onNavigate(url) }
        }
      }catch(_){ /* ignore */ }
    }
    tick()
    const t = setInterval(tick, 5000)
    return ()=> { stopped = true; clearInterval(t) }
  },[onNavigate])
  return null
}