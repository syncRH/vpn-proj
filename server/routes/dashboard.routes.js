const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Server = require('../models/server.model');

// Получение статистики для панели управления
router.get('/stats', async (req, res) => {
  try {
    // Статистика пользователей
    const userCount = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    // Статистика серверов
    const serverCount = await Server.countDocuments();
    const activeServers = await Server.countDocuments({ isActive: true });
    
    // Активные подключения
    let activeConnections = 0;
    const servers = await Server.find();
    servers.forEach(server => {
      activeConnections += server.activeConnections;
    });
    
    // Ключи активации
    const keyCount = await User.countDocuments();
    
    res.status(200).json({
      userCount,
      activeUsers,
      serverCount,
      activeServers,
      activeConnections,
      keyCount
    });
  } catch (error) {
    console.error('Ошибка получения статистики для дашборда:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении статистики' });
  }
});

module.exports = router; 