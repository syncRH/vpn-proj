import axios from 'axios';

const API_URL = '/api/users';

// Настройка axios для включения токена в заголовки
const axiosWithToken = (token) => {
  return axios.create({
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// Получение списка пользователей
const getUsers = (token) => {
  return axiosWithToken(token).get(API_URL);
};

// Получение информации о пользователе по ID
const getUserById = (id, token) => {
  return axiosWithToken(token).get(`${API_URL}/${id}`);
};

// Создание нового пользователя (генерация ключа активации)
const createUser = (userData, token) => {
  return axiosWithToken(token).post(API_URL, userData);
};

// Обновление данных пользователя
const updateUser = (id, userData, token) => {
  return axiosWithToken(token).put(`${API_URL}/${id}`, userData);
};

// Удаление пользователя
const deleteUser = (id, token) => {
  return axiosWithToken(token).delete(`${API_URL}/${id}`);
};

// Получение статистики пользователей
const getUserStats = (token) => {
  return axiosWithToken(token).get(`${API_URL}/stats/overview`);
};

const userService = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats
};

export default userService; 