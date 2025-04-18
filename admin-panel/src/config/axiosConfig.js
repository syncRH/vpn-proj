import axios from 'axios';

// Configure axios based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

// In development, use localhost
// In production, use relative URLs that will be handled by Nginx proxy
axios.defaults.baseURL = isDevelopment ? 'http://127.0.0.1:3000' : '';

// Убедимся, что в production baseURL действительно пустой
if (!isDevelopment && window.location.hostname !== 'localhost') {
  console.log('Running in production mode, using relative paths for API requests');
  axios.defaults.baseURL = '';
}

console.log(`Axios baseURL configured as: ${axios.defaults.baseURL} (${process.env.NODE_ENV || 'production'} mode)`);

// Добавляем обработку ошибок сетевого соединения
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      console.error('Ошибка сетевого соединения:', error.message);
    }
    return Promise.reject(error);
  }
);

// Add interceptor for logging
axios.interceptors.request.use(
  config => {
    console.log(`Making ${config.method.toUpperCase()} request to: ${config.baseURL || ''}${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default axios;