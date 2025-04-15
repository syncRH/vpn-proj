const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Маршруты аутентификации пользователей
router.post('/login', authController.login);

// Получение информации о текущем пользователе
router.get('/me', authController.me);

// Регистрация нового пользователя
router.post('/register', authController.register);

// Аутентификация администратора (старый маршрут для совместимости)
router.post('/admin/login', authController.login);

module.exports = router; 