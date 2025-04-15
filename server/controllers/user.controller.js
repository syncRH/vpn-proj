const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');

// Получение списка всех пользователей
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    
    // Преобразуем данные для DataGrid (id вместо _id)
    const formattedUsers = users.map(user => ({
      id: user._id,
      email: user.email,
      activationKey: user.activationKey,
      status: user.isActive ? 'active' : 'inactive',
      createdAt: user.createdAt,
      expiresAt: user.expirationDate
    }));
    
    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Ошибка получения списка пользователей:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении списка пользователей' });
  }
};

// Получение информации о конкретном пользователе
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    res.status(200).json({ user });
  } catch (error) {
    console.error('Ошибка получения информации о пользователе:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении информации о пользователе' });
  }
};

// Создание нового пользователя (генерация ключа активации)
exports.createUser = async (req, res) => {
  try {
    // Проверка ошибок валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { expirationDate, email, duration, activationLimit } = req.body;
    
    // Генерация уникального ключа активации
    const activationKey = uuidv4();
    
    // Установка даты истечения на основе duration (дни)
    let expDate = expirationDate;
    if (duration && !expDate) {
      expDate = new Date();
      expDate.setDate(expDate.getDate() + parseInt(duration));
    }
    
    // Получаем ID создателя если есть
    const creatorId = req.admin && req.admin.id ? req.admin.id : 'admin-panel';
    
    // Создание нового пользователя
    const newUser = new User({
      activationKey,
      email: email || null,
      expirationDate: expDate || null,
      activationLimit: activationLimit || 1,
      createdBy: creatorId
    });
    
    await newUser.save();
    
    // Преобразуем ответ в формат, который ожидает админ-панель
    res.status(201).json({
      message: 'Пользователь успешно создан',
      activationKey: newUser.activationKey,
      user: {
        id: newUser._id,
        email: newUser.email,
        activationKey: newUser.activationKey,
        isActive: newUser.isActive,
        activationDate: newUser.activationDate,
        expirationDate: newUser.expirationDate,
        activationLimit: newUser.activationLimit
      }
    });
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера при создании пользователя: ' + error.message });
  }
};

// Обновление данных пользователя
exports.updateUser = async (req, res) => {
  try {
    // Проверка ошибок валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const userId = req.params.id;
    const { isActive, expirationDate } = req.body;
    
    // Поиск пользователя
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    // Обновление полей
    if (isActive !== undefined) {
      user.isActive = isActive;
    }
    
    if (expirationDate !== undefined) {
      user.expirationDate = expirationDate;
    }
    
    await user.save();
    
    res.status(200).json({
      message: 'Пользователь успешно обновлен',
      user: {
        id: user._id,
        activationKey: user.activationKey,
        isActive: user.isActive,
        activationDate: user.activationDate,
        expirationDate: user.expirationDate
      }
    });
  } catch (error) {
    console.error('Ошибка обновления пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера при обновлении пользователя' });
  }
};

// Удаление пользователя
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Поиск пользователя
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    // Updated to use deleteOne() instead of the deprecated remove() method
    await User.deleteOne({ _id: userId });
    
    res.status(200).json({ message: 'Пользователь успешно удален' });
  } catch (error) {
    console.error('Ошибка удаления пользователя:', error);
    res.status(500).json({ message: 'Ошибка сервера при удалении пользователя' });
  }
};

// Получение статистики пользователей
exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const expiredUsers = await User.countDocuments({
      expirationDate: { $lt: new Date() }
    });
    
    const lastCreatedUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id activationKey isActive activationDate expirationDate');
    
    const lastActiveUsers = await User.find({ lastLogin: { $ne: null } })
      .sort({ lastLogin: -1 })
      .limit(5)
      .select('_id activationKey isActive activationDate lastLogin');
    
    res.status(200).json({
      stats: {
        totalUsers,
        activeUsers,
        expiredUsers,
        inactiveUsers: totalUsers - activeUsers
      },
      lastCreatedUsers,
      lastActiveUsers
    });
  } catch (error) {
    console.error('Ошибка получения статистики пользователей:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении статистики' });
  }
};