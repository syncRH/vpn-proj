// Настройки API для разных окружений
const isDevelopment = process.env.NODE_ENV === 'development';

// Базовый URL API
const BASE_API_URL = isDevelopment 
    ? 'http://127.0.0.1:3000' // Локальный адрес для разработки
    : 'http://45.147.178.200:3000'; // Боевой сервер для продакшена

export const API_CONFIG = {
    baseUrl: BASE_API_URL,
};

export default API_CONFIG;