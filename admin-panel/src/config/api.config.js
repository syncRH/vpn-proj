// Настройки API для разных окружений
const isDevelopment = process.env.NODE_ENV === 'development';

// Базовый URL API
const BASE_API_URL = isDevelopment 
    ? 'http://127.0.0.1:3000' // Локальный адрес для разработки
    : '/api'; // Используем '/api' для запросов через Nginx прокси

console.log(`API URL configured as: ${BASE_API_URL} (${process.env.NODE_ENV || 'production'} mode)`);

export const API_CONFIG = {
    baseUrl: BASE_API_URL,
};

export default API_CONFIG;