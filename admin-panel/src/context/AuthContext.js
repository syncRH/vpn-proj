import React, { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import jwtDecode from 'jwt-decode';
import authService from '../services/authService';

// Создание контекста аутентификации
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Проверка и обновление статуса аутентификации при загрузке
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          // Проверка срока действия токена
          const decodedToken = jwtDecode(token);
          const currentTime = Date.now() / 1000;
          
          if (decodedToken.exp < currentTime) {
            handleLogout();
          } else {
            // Получение информации о пользователе
            const userInfo = {
              id: decodedToken.id,
              username: decodedToken.username,
              role: decodedToken.role
            };
            setCurrentUser(userInfo);
          }
        } catch (error) {
          console.error('Ошибка проверки токена:', error);
          handleLogout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [token]);

  // Функция входа пользователя
  const login = async (username, password) => {
    try {
      const response = await authService.login(username, password);
      const { token, admin } = response.data;
      
      // Сохранение токена в локальном хранилище
      localStorage.setItem('token', token);
      setToken(token);
      setCurrentUser(admin);
      
      navigate('/');
      return { success: true };
    } catch (error) {
      console.error('Ошибка входа:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Ошибка входа в систему'
      };
    }
  };

  // Функция выхода пользователя
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    navigate('/login');
  };

  // Проверка статуса аутентификации
  const isAuthenticated = !!currentUser;

  // Проверка роли пользователя
  const hasRole = (role) => {
    return currentUser && currentUser.role === role;
  };

  // Значение контекста
  const contextValue = {
    currentUser,
    token,
    isAuthenticated,
    loading,
    login,
    logout: handleLogout,
    hasRole
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}; 