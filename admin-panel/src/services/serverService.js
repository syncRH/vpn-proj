import axios from 'axios';
import { API_CONFIG } from '../config/api.config';

// Use the centralized API configuration
const API_BASE = `${API_CONFIG.baseUrl}/servers`;

// Получение списка всех серверов
const getAllServers = async (token) => {
  return axios.get(API_BASE, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Получение данных сервера по ID
const getServerById = async (id, token) => {
  return axios.get(`${API_BASE}/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Создание нового сервера
const createServer = async (serverData, token) => {
  return axios.post(API_BASE, serverData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Обновление данных сервера
const updateServer = async (id, serverData, token) => {
  return axios.put(`${API_BASE}/${id}`, serverData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Удаление сервера
const deleteServer = async (id, token) => {
  return axios.delete(`${API_BASE}/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Получение данных для публичного списка серверов
const getPublicServers = async () => {
  return axios.get(`${API_CONFIG.baseUrl}/servers-public`);
};

const serverService = {
  getAllServers,
  getServerById,
  createServer,
  updateServer,
  deleteServer,
  getPublicServers
};

export default serverService;