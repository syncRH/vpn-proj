const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/admin.model');

// Middleware для проверки аутентификации
const auth = (req, res, next) => {
  // Получение токена из заголовка
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  // Проверка наличия токена
  if (!token) {
    return res.status(401).json({ message: 'Нет токена авторизации' });
  }

  try {
    // Верификация токена
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Добавление информации о пользователе в запрос
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Ошибка аутентификации:', err.message);
    res.status(401).json({ message: 'Токен недействителен' });
  }
};

// Middleware для проверки роли администратора
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      next();
    } else {
      res.status(403).json({ message: 'Доступ запрещён' });
    }
  });
};

// Middleware для проверки роли суперадминистратора
const superAdminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role === 'superadmin') {
      next();
    } else {
      res.status(403).json({ message: 'Доступ запрещён' });
    }
  });
};

module.exports = {
  auth,
  adminAuth,
  superAdminAuth
}; 