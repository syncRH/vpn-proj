import axios from 'axios';
import { API_CONFIG } from '../config/api.config';

const API_URL = `${API_CONFIG.baseUrl}/api/auth`;

// Вход администратора
const login = async (username, password) => {
  return axios.post(`${API_URL}/admin/login`, { username, password });
};

// Регистрация нового администратора (только для суперадмина)
const register = async (userData, token) => {
  return axios.post(`${API_URL}/admin/register`, userData, {
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