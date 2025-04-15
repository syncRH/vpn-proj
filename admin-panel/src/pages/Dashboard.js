import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Grid, Card, CardContent, 
  CardHeader, CircularProgress, LinearProgress
} from '@mui/material';
import { 
  People as PeopleIcon, 
  Dns as DnsIcon, 
  Speed as SpeedIcon, 
  Lock as LockIcon,
  BarChart as BarChartIcon
} from '@mui/icons-material';
import axios from 'axios';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/dashboard/stats');
        setStats(response.data);
        setError(null);
      } catch (err) {
        console.error('Ошибка загрузки данных дашборда:', err);
        setError('Не удалось загрузить статистику');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography color="error" variant="h6" align="center">
          {error}
        </Typography>
      </Box>
    );
  }

  // Используем тестовые данные, если API не вернул результатов
  const dashboardData = stats || {
    userCount: 24,
    serverCount: 8,
    activeConnections: 17,
    serverLoadPercent: 35, // Default load percentage
    keyCount: 35
  };

  // Ensure serverLoadPercent is always a valid number between 0-100
  const safeServerLoadPercent = 
    typeof dashboardData.serverLoadPercent === 'number' && !isNaN(dashboardData.serverLoadPercent) 
      ? Math.min(Math.max(0, dashboardData.serverLoadPercent), 100) 
      : 0;

  const statCards = [
    { 
      title: 'Пользователи', 
      value: dashboardData.userCount, 
      icon: <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      color: '#1976d2' 
    },
    { 
      title: 'Серверы', 
      value: dashboardData.serverCount, 
      icon: <DnsIcon sx={{ fontSize: 40, color: 'success.main' }} />,
      color: '#2e7d32' 
    },
    { 
      title: 'Активные подключения', 
      value: dashboardData.activeConnections, 
      icon: <SpeedIcon sx={{ fontSize: 40, color: 'warning.main' }} />,
      color: '#ed6c02' 
    },
    { 
      title: 'Ключи активации', 
      value: dashboardData.keyCount, 
      icon: <LockIcon sx={{ fontSize: 40, color: 'secondary.main' }} />,
      color: '#9c27b0' 
    }
  ];

  // Function to determine color based on load percentage
  const getLoadColor = (loadPercent) => {
    if (loadPercent < 30) return '#4caf50'; // Green for low load
    if (loadPercent < 70) return '#ff9800'; // Orange for medium load
    return '#f44336'; // Red for high load
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Панель управления
      </Typography>
      
      <Grid container spacing={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Paper elevation={3} sx={{ height: '100%' }}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${card.color}` }}>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Box sx={{ mb: 2 }}>
                    {card.icon}
                  </Box>
                  <Typography variant="h5" component="div" gutterBottom>
                    {card.value}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {card.title}
                  </Typography>
                </CardContent>
              </Card>
            </Paper>
          </Grid>
        ))}
      </Grid>
      
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3}>
            <Card>
              <CardHeader title="Последние события" />
              <CardContent>
                <Typography variant="body2">
                  Данные о последних событиях будут отображаться здесь
                </Typography>
              </CardContent>
            </Card>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3}>
            <Card>
              <CardHeader 
                title="Загрузка серверов" 
                avatar={<BarChartIcon color="primary" />}
              />
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h5" component="div" sx={{ mr: 2 }}>
                    {safeServerLoadPercent}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Текущая загрузка серверов
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={safeServerLoadPercent} 
                  sx={{ 
                    height: 10, 
                    borderRadius: 1,
                    backgroundColor: '#e0e0e0',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getLoadColor(safeServerLoadPercent)
                    }
                  }}
                />
                <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                  {dashboardData.activeConnections} активных подключений из {dashboardData.serverCount * 50} возможных
                </Typography>
              </CardContent>
            </Card>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;