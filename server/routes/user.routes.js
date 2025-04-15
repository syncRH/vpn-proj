const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');

// Получение списка всех пользователей
router.get('/', userController.getAllUsers);

// Получение информации о конкретном пользователе
router.get('/:id', userController.getUserById);

// Создание нового пользователя (генерация ключа активации)
router.post(
  '/',
  [
    body('email').optional().isEmail().withMessage('Некорректный формат email'),
    body('expirationDate').optional().isISO8601().withMessage('Некорректная дата окончания действия')
  ],
  userController.createUser
);

// Создание ключа активации
router.post(
  '/create-key',
  [
    body('email').optional().isEmail().withMessage('Некорректный формат email'),
    body('duration').optional().isInt({ min: 1, max: 365 }).withMessage('Срок действия должен быть от 1 до 365 дней'),
    body('activationLimit').optional().isInt({ min: 1, max: 10 }).withMessage('Лимит активаций должен быть от 1 до 10'),
    body('expirationDate').optional().isISO8601().withMessage('Некорректная дата окончания действия')
  ],
  userController.createUser
);

// Обновление данных пользователя
router.put(
  '/:id',
  [
    body('isActive').optional().isBoolean().withMessage('Некорректный статус активации'),
    body('expirationDate').optional().isISO8601().withMessage('Некорректная дата окончания действия')
  ],
  userController.updateUser
);

// Удаление пользователя
router.delete('/:id', userController.deleteUser);

// Получение статистики пользователей
router.get('/stats/overview', userController.getUserStats);

module.exports = router;