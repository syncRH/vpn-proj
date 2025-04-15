import React, { useState, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  AppBar, Box, CssBaseline, Divider, Drawer, IconButton, 
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  Toolbar, Typography, Button, Avatar, Menu, MenuItem
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Storage as ServerIcon,
  People as PeopleIcon,
  Person as PersonIcon,
  ExitToApp as LogoutIcon
} from '@mui/icons-material';
import { AuthContext } from '../../context/AuthContext';

const drawerWidth = 240;

const MainLayout = () => {
  const { currentUser, logout } = useContext(AuthContext);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Обработчик открытия/закрытия мобильного меню
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Обработчик открытия меню пользователя
  const handleUserMenuOpen = (event) => {
    setUserMenuAnchor(event.currentTarget);
  };

  // Обработчик закрытия меню пользователя
  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  // Обработчик выхода из системы
  const handleLogout = () => {
    handleUserMenuClose();
    logout();
  };

  // Обработчик перехода на страницу профиля
  const handleProfileClick = () => {
    handleUserMenuClose();
    navigate('/profile');
  };

  // Пункты меню навигации
  const menuItems = [
    { text: 'Панель управления', icon: <DashboardIcon />, path: '/' },
    { text: 'Серверы', icon: <ServerIcon />, path: '/servers' },
    { text: 'Пользователи', icon: <PeopleIcon />, path: '/users' }
  ];

  // Содержимое боковой панели
  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold' }}>
          VPN Админ-панель
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem 
            key={item.text} 
            disablePadding
            sx={{ 
              backgroundColor: location.pathname === item.path ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
            }}
          >
            <ListItemButton
              onClick={() => navigate(item.path)}
              selected={location.pathname === item.path}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  // Получение инициалов пользователя для аватара
  const getUserInitials = () => {
    if (!currentUser || !currentUser.username) return '?';
    return currentUser.username.charAt(0).toUpperCase();
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      
      {/* Верхняя панель */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find(item => item.path === location.pathname)?.text || 'VPN Админ-панель'}
          </Typography>
          
          {/* Аватар и имя пользователя */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body1" sx={{ mr: 2 }}>
              {currentUser?.username || 'Пользователь'}
            </Typography>
            
            <IconButton
              onClick={handleUserMenuOpen}
              size="small"
              sx={{ p: 0 }}
            >
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                {getUserInitials()}
              </Avatar>
            </IconButton>
            
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={handleUserMenuClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  overflow: 'visible',
                  filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                  mt: 1.5,
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={handleProfileClick}>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                Профиль
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Выйти
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      
      {/* Боковая панель */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        {/* Мобильная версия */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Для лучшей производительности на мобильных устройствах
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        
        {/* Десктопная версия */}
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
      
      {/* Основное содержимое */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar /> {/* Отступ под верхней панелью */}
        <Outlet /> {/* Рендеринг дочерних компонентов */}
      </Box>
    </Box>
  );
};

export default MainLayout; 