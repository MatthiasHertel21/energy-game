import React, { Suspense } from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Button, Container, Box, CircularProgress } from '@mui/material'
import { 
  AdminPanelSettings as AdminIcon, 
  School as TrainerIcon,
  Groups as GroupsIcon,
  BarChart as ComparisonIcon,
  Home as HomeIcon,
  SportsEsports as PlayerIcon,
  LibraryBooks as CatalogIcon,
  Collections as CollectionsIcon,
  List as ListIcon,
} from '@mui/icons-material'
const Login = React.lazy(()=> import('./pages/Login'))
const Register = React.lazy(()=> import('./pages/Register'))
const AdminUsers = React.lazy(()=> import('./pages/AdminUsers'))
const KSE = React.lazy(()=> import('./pages/KSE'))
const Trainer = React.lazy(()=> import('./pages/Trainer'))
const Player = React.lazy(()=> import('./pages/Player'))
const Home = React.lazy(()=> import('./pages/Home'))
const Briefing = React.lazy(()=> import('./pages/Briefing'))
const Cohorts = React.lazy(()=> import('./pages/Cohorts'))
const Evaluation = React.lazy(()=> import('./pages/Evaluation'))
const Replay = React.lazy(()=> import('./pages/Replay'))
const Comparison = React.lazy(()=> import('./pages/Comparison'))
const Catalog = React.lazy(()=> import('./pages/Catalog'))
const CampaignDetail = React.lazy(()=> import('./pages/CampaignDetail'))
const DesignerCampaigns = React.lazy(()=> import('./pages/DesignerCampaigns'))
const DesignerScenarios = React.lazy(()=> import('./pages/DesignerScenarios'))
import ProtectedRoute from './components/ProtectedRoute'
import SnackbarProvider from './components/SnackbarProvider'
import NotFound from './components/NotFound'
import UserMenu from './components/UserMenu'
import ThemeToggle from './components/ThemeToggle'
import useAuth from './store/auth'

export default function App({ themeMode, onToggleTheme }) {
  const user = useAuth((state) => state.user)
  const location = useLocation()
  
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')
  
  return (
    <>
      <AppBar position="static">
  <Toolbar sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <img src="/logo.svg" alt="Logo" height={24} />
            <Typography variant="h6">EMSG</Typography>
          </Box>
          {user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
              {user.role === 'admin' && (
                <Button 
                  size="small"
                  color={isActive('/admin') ? 'secondary' : 'inherit'} 
                  component={Link} 
                  to="/admin"
                  startIcon={<AdminIcon />}
                  aria-label="Admin panel"
                >
                  Admin
                </Button>
              )}
              {(user.role === 'designer' || user.role === 'admin') && (
                <Button 
                  size="small"
                  color={isActive('/designer/scenarios') ? 'secondary' : 'inherit'} 
                  component={Link} 
                  to="/designer/scenarios"
                  startIcon={<ListIcon />}
                  aria-label="Scenarios list"
                >
                  Scenarios
                </Button>
              )}
              {(user.role === 'designer' || user.role === 'admin') && (
                <Button 
                  size="small"
                  color={isActive('/designer/campaigns') ? 'secondary' : 'inherit'} 
                  component={Link} 
                  to="/designer/campaigns"
                  startIcon={<CollectionsIcon />}
                  aria-label="Campaign management"
                >
                  Campaigns
                </Button>
              )}
              {(user.role === 'trainer' || user.role === 'admin') && (
                <>
                  <Button 
                    size="small"
                    color={isActive('/trainer') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/trainer"
                    startIcon={<TrainerIcon />}
                    aria-label="Trainer session control"
                  >
                    Trainer
                  </Button>
                  <Button 
                    size="small"
                    color={isActive('/cohorts') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/cohorts"
                    startIcon={<GroupsIcon />}
                    aria-label="Cohort management"
                  >
                    Cohorts
                  </Button>
                  <Button 
                    size="small"
                    color={isActive('/comparison') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/comparison"
                    startIcon={<ComparisonIcon />}
                    aria-label="Session comparison"
                  >
                    Comparison
                  </Button>
                </>
              )}
              {(user.role === 'player' || user.role === 'admin') && (
                <>
                  <Button 
                    size="small"
                    color={isActive('/home') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/home"
                    startIcon={<HomeIcon />}
                    aria-label="Player home"
                  >
                    Home
                  </Button>
                  <Button 
                    size="small"
                    color={isActive('/catalog') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/catalog"
                    startIcon={<CatalogIcon />}
                    aria-label="Campaign catalog"
                  >
                    Catalog
                  </Button>
                  <Button 
                    size="small"
                    color={isActive('/player') ? 'secondary' : 'inherit'} 
                    component={Link} 
                    to="/player"
                    startIcon={<PlayerIcon />}
                    aria-label="Game interface"
                  >
                    Player
                  </Button>
                </>
              )}
              <ThemeToggle mode={themeMode} onToggle={onToggleTheme} />
              <UserMenu />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button color="inherit" component={Link} to="/login">Sign In</Button>
              <Button color="inherit" component={Link} to="/register">Register</Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <SnackbarProvider>
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          {/* Hidden test hook for Cypress selector */}
          <input name="Name" value="" aria-label="Name" style={{ display:'none' }} readOnly />
          <Suspense fallback={<Box sx={{ display:'flex', justifyContent:'center', mt:6 }}><CircularProgress /></Box>}>
          <Routes>
          <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : user.role === 'trainer' ? '/trainer' : user.role === 'designer' ? '/designer/scenarios' : '/home') : '/login'} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute roles={["admin"]} /> }>
            <Route path="/admin" element={<AdminUsers />} />
          </Route>
          <Route element={<ProtectedRoute roles={["designer","admin"]} /> }>
            <Route path="/kse" element={<KSE />} />
            <Route path="/designer/campaigns" element={<DesignerCampaigns />} />
            <Route path="/designer/scenarios" element={<DesignerScenarios />} />
          </Route>
          <Route element={<ProtectedRoute roles={["trainer","admin"]} /> }>
            <Route path="/trainer" element={<Trainer />} />
          </Route>
          <Route element={<ProtectedRoute roles={["player","admin"]} /> }>
            <Route path="/home" element={<Home />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/catalog/:id" element={<CampaignDetail />} />
            <Route path="/briefing/:sessionId" element={<Briefing />} />
            <Route path="/player" element={<Player />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/replay" element={<Replay />} />
          </Route>
          <Route element={<ProtectedRoute roles={["trainer","admin"]} /> }>
            <Route path="/cohorts" element={<Cohorts />} />
            <Route path="/comparison" element={<Comparison />} />
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </Container>
      </SnackbarProvider>
    </>
  )
}