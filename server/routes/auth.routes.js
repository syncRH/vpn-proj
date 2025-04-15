const express = require('express');
const { check } = require('express-validator');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// Маршрут для регистрации нового администратора
router.post('/register', [
  check('username', 'Имя пользователя обязательно').not().isEmpty(),
  check('email', 'Пожалуйста, укажите действительный email').isEmail(),
  check('password', 'Пароль должен содержать не менее 6 символов').isLength({ min: 6 })
], authController.register);

// Маршрут для входа администратора
router.post('/login', [
  check('email', 'Пожалуйста, укажите действительный email').isEmail(),
  check('password', 'Пароль обязателен').exists()
], authController.login);

// Маршрут для получения данных текущего пользователя
router.get('/me', require('../middleware/auth.middleware'), authController.getCurrentUser);

// Активация клиента по ключу
router.post('/activate', [
  check('activationKey', 'Ключ активации обязателен').not().isEmpty()
], authController.activateClient);

// Проверка статуса клиента
router.post('/verify', [
  check('clientId', 'ID клиента обязателен').not().isEmpty()
], authController.verifyClient);

// Проверка статуса активации по ключу
router.get('/verify/:activationKey', authController.verifyActivation);

// Маршрут для генерации токена для клиента VPN
router.post('/user/token', [
  check('email', 'Пожалуйста, укажите действительный email').isEmail(),
  check('activationKey', 'Ключ активации обязателен').not().isEmpty()
], authController.generateUserToken);

// Маршрут для регистрации клиента VPN
router.post('/user/register', [
  check('email', 'Пожалуйста, укажите действительный email').isEmail(),
  check('activationKey', 'Ключ активации обязателен').not().isEmpty()
], authController.generateUserToken); // Используем тот же контроллер

// Маршрут для отладки токена (используется клиентским приложением)
router.get('/debug-token', authController.debugToken);

module.exports = router;