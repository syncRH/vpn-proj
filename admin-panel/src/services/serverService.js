import axios from 'axios';
import { API_CONFIG } from '../config/api.config';

const API_URL = `${API_CONFIG.baseUrl}/api/servers`;

// Настройка axios для включения токена в заголовки
const axiosWithToken = (token) => {
  return axios.create({
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Получение списка серверов
const getServers = (token) => {
  return axiosWithToken(token).get(API_URL);
};

// Получение информации о сервере по ID
const getServerById = (id, token) => {
  return axiosWithToken(token).get(`${API_URL}/${id}`);
};

// Добавление нового сервера
const addServer = (serverData, token) => {
  // Создание FormData для отправки файлов
  const formData = new FormData();
  formData.append('ipAddress', serverData.ipAddress);
  
  if (serverData.antizapretConfig) {
    formData.append('antizapretConfig', serverData.antizapretConfig);
  }
  
  if (serverData.fullVpnConfig) {
    formData.append('fullVpnConfig', serverData.fullVpnConfig);
  }
  
  return axiosWithToken(token).post(API_URL, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

// Обновление сервера
const updateServer = (id, serverData, token) => {
  // Создание FormData для отправки файлов
  const formData = new FormData();
  
  if (serverData.ipAddress) {
    formData.append('ipAddress', serverData.ipAddress);
  }
  
  if (serverData.isActive !== undefined) {
    formData.append('isActive', serverData.isActive);
  }
  
  if (serverData.antizapretConfig) {
    formData.append('antizapretConfig', serverData.antizapretConfig);
  }
  
  if (serverData.fullVpnConfig) {
    formData.append('fullVpnConfig', serverData.fullVpnConfig);
  }
  
  return axiosWithToken(token).put(`${API_URL}/${id}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

// Удаление сервера
const deleteServer = (id, token) => {
  return axiosWithToken(token).delete(`${API_URL}/${id}`);
};

// Получение конфигурационного файла Antizapret
const getAntizapretConfig = (id, token) => {
  return axiosWithToken(token).get(`${API_URL}/${id}/antizapret-config`);
};

// Получение конфигурационного файла полного VPN
const getFullVpnConfig = (id, token) => {
  return axiosWithToken(token).get(`${API_URL}/${id}/vpn-config`);
};

const serverService = {
  getServers,
  getServerById,
  addServer,
  updateServer,
  deleteServer,
  getAntizapretConfig,
  getFullVpnConfig
};

export default serverService;