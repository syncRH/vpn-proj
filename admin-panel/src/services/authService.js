import axios from 'axios';
import { API_CONFIG } from '../config/api.config';

// Use the centralized API configuration
const API_BASE = `${API_CONFIG.baseUrl}/auth`;

// Вход администратора
const login = async (username, password) => {
  console.log(`Making POST request to: ${API_BASE}/login with username: ${username}`);
  return axios.post(`${API_BASE}/login`, { email: username, password });
};

// Регистрация нового администратора (только для суперадмина)
const register = async (userData, token) => {
  return axios.post(`${API_BASE}/register`, userData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

const authService = {
  login,
  register
};

export default authService;