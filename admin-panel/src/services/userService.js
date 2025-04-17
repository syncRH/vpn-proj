import axios from 'axios';
import { API_CONFIG } from '../config/api.config';

// Use the centralized API configuration
const API_BASE = `${API_CONFIG.baseUrl}/users`;

// Получение списка всех пользователей
const getAllUsers = async (token) => {
  return axios.get(API_BASE, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Получение данных пользователя по ID
const getUserById = async (id, token) => {
  return axios.get(`${API_BASE}/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Создание нового пользователя
const createUser = async (userData, token) => {
  return axios.post(API_BASE, userData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Обновление данных пользователя
const updateUser = async (id, userData, token) => {
  return axios.put(`${API_BASE}/${id}`, userData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Удаление пользователя
const deleteUser = async (id, token) => {
  return axios.delete(`${API_BASE}/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

const userService = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};

export default userService;