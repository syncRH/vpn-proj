import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { 
  AppBar, Box, Toolbar, Typography, Drawer, List, ListItem, 
  ListItemIcon, ListItemText, IconButton, Divider 
} from '@mui/material';
import { 
  Menu as MenuIcon, Dashboard, Dns, People, 
  ExitToApp, Person 
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 240;

const Layout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { text: 'Панель управления', icon: <Dashboard />, path: '/' },
    { text: 'Серверы', icon: <Dns />, path: '/servers' },
    { text: 'Пользователи', icon: <People />, path: '/users' }
  ];

  const drawer = (
    <div>
      <Toolbar sx={{ minHeight: '56px' }}>
        <Typography 
          variant="subtitle1" 
          sx={{ 
            fontWeight: 500, 
            fontSize: '16px',
            color: '#666'
          }}
        >
          BeNice VPN
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem 
            button 
            key={item.text} 
            onClick={() => navigate(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem button onClick={() => navigate('/profile')}>
          <ListItemIcon><Person /></ListItemIcon>
          <ListItemText primary="Профиль" />
        </ListItem>
        <ListItem button onClick={handleLogout}>
          <ListItemIcon><ExitToApp /></ListItemIcon>
          <ListItemText primary="Выйти" />
        </ListItem>
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{ 
          width: { sm: `calc(100% - ${drawerWidth}px)` }, 
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: '#f5f5f5', // Light gray background
          color: '#666', // Neutral gray text
          boxShadow: 'none', // Remove shadow
          borderBottom: '1px solid #e0e0e0', // Subtle border
          height: '50px' // Reduced height
        }}
      >
        <Toolbar sx={{ minHeight: '50px !important', px: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography 
            variant="subtitle1" 
            component="div" 
            sx={{ 
              flexGrow: 1, 
              fontWeight: 500,
              fontSize: '14px' // Reduced font size
            }}
          >
            Панель администратора VPN
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '13px' }}>
            {currentUser?.username}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;