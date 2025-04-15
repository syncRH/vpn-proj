import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useAuth } from './contexts/AuthContext';

// Компоненты страниц
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ServersPage from './pages/ServersPage';
import UsersPage from './pages/UsersPage';
import Layout from './components/Layout';

// Защищенный маршрут
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Создание темы Material UI (темная)
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#3a86ff',
    },
    secondary: {
      main: '#8338ec',
    },
    success: {
      main: '#38b000',
    },
    warning: {
      main: '#ffbe0b',
    },
    error: {
      main: '#ff006e',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#b0b0b0',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
}

export default App; 