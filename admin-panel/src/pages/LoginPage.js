import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, TextField, Button, Typography, Paper,
  Avatar, Alert, CircularProgress
} from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const { login, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Если пользователь уже авторизован, перенаправляем на главную страницу
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);
  
  useEffect(() => {
    if (error) {
      setErrorMsg(error);
    }
  }, [error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Валидация
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Пожалуйста, заполните все поля');
      return;
    }
    
    setErrorMsg('');
    setLoading(true);
    
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/');
      }
    } catch (err) {
      setErrorMsg('Произошла ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 2,
            background: 'linear-gradient(to bottom, #1e1e1e, #2d2d2d)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              mb: 3,
            }}
          >
            <Avatar sx={{ 
              m: 1, 
              bgcolor: 'primary.main',
              width: 56,
              height: 56,
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)'
            }}>
              <LockOutlined color="primary" fontSize="large" />
            </Avatar>
            <Typography component="h1" variant="h4" sx={{ mt: 2, fontWeight: 600 }}>
              Вход в систему
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Администрирование VPN-сервиса
            </Typography>
          </Box>
          
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 1 }}>
              {errorMsg}
            </Alert>
          )}
          
          <Box component="form" onSubmit={handleLogin} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Имя пользователя"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Пароль"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              variant="outlined"
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                py: 1.5,
                mt: 1,
                mb: 1,
                fontSize: '1rem',
                position: 'relative',
                background: 'linear-gradient(45deg, #3a86ff 30%, #5c91fd 90%)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #3a86ff 10%, #8338ec 90%)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 12px rgba(58, 134, 255, 0.3)',
                },
                transition: 'all 0.3s ease',
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: 'white', position: 'absolute' }} />
              ) : (
                'Войти'
              )}
            </Button>
          </Box>
        </Paper>
        <Typography
          variant="body2"
          color="text.secondary"
          align="center"
          sx={{ mt: 3 }}
        >
          © {new Date().getFullYear()} VPN Management System
        </Typography>
      </Box>
    </Container>
  );
};

export default LoginPage; 