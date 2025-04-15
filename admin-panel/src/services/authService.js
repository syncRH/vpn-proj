import axios from 'axios';

const API_URL = '/api/auth';

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