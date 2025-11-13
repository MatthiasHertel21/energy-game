import { createTheme } from '@mui/material/styles'

const primary = import.meta.env.VITE_PRIMARY_COLOR || '#0B5AA3' // Eskom-like blue
const secondary = import.meta.env.VITE_SECONDARY_COLOR || '#FFC107'

// Factory function to create theme with light/dark mode support
export const createAppTheme = (mode = 'light') => createTheme({
  palette: {
    mode,
    primary: { main: primary },
    secondary: { main: secondary },
    ...(mode === 'dark' ? {
      background: {
        default: '#0a1929',
        paper: '#132f4c',
      },
    } : {}),
  },
  typography: {
    h1: { fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.2 },
    h2: { fontSize: '2rem', fontWeight: 600, lineHeight: 1.3 },
    h3: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.4 },
    h4: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          transition: 'all 0.2s ease-in-out',
          '&:focus-visible': {
            outline: `2px solid ${mode === 'dark' ? '#90caf9' : '#1976d2'}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          transition: 'box-shadow 0.2s ease-in-out',
          '&:hover': {
            boxShadow: mode === 'dark' 
              ? '0 4px 20px 0 rgba(0,0,0,0.5)' 
              : '0 4px 20px 0 rgba(0,0,0,0.12)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.3s ease-in-out, box-shadow 0.2s ease-in-out',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.2s ease-in-out',
          '&:focus-visible': {
            outline: `2px solid ${mode === 'dark' ? '#90caf9' : '#1976d2'}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:focus-within': {
              '& fieldset': {
                borderWidth: 2,
              },
            },
          },
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        transitionDuration: 300,
      },
    },
  },
})

// Default light theme
const theme = createAppTheme('light')

export default theme