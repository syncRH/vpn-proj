import axios from 'axios';

// Configure axios based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

// In development, use localhost
// In production, use relative URLs that will be handled by Nginx proxy
axios.defaults.baseURL = isDevelopment ? 'http://127.0.0.1:3000' : '';

// Explicitly override the baseURL for production
if (window.location.hostname !== 'localhost') {
  // Force empty baseURL in production to use relative paths
  console.log('Production environment detected, forcing relative API paths');
  axios.defaults.baseURL = '';
}

console.log(`Axios baseURL configured as: ${axios.defaults.baseURL} (${process.env.NODE_ENV || 'production'} mode)`);

// Add interceptor to fix request URLs in production
axios.interceptors.request.use(
  config => {
    // For debugging
    if (config.baseURL === '' && config.url.startsWith('/api')) {
      console.log(`Making ${config.method.toUpperCase()} request with relative path: ${config.url}`);
    } else {
      console.log(`Making ${config.method.toUpperCase()} request to: ${config.baseURL || ''}${config.url}`);
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add error handling for network issues
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      console.error('Network connection error:', error.message);
    } else if (error.response) {
      console.error(`API error: ${error.response.status} - ${error.response.statusText}`);
    }
    return Promise.reject(error);
  }
);

export default axios;