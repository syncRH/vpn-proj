import axios from 'axios';

// Configure axios based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

// In development, use localhost
// In production, use relative URLs that will be handled by Nginx proxy
axios.defaults.baseURL = isDevelopment ? 'http://127.0.0.1:3000' : '';

console.log(`Axios baseURL configured as: ${axios.defaults.baseURL} (${process.env.NODE_ENV || 'production'} mode)`);

// Add interceptor for logging
axios.interceptors.request.use(
  config => {
    console.log(`Making ${config.method.toUpperCase()} request to: ${config.baseURL}${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default axios;