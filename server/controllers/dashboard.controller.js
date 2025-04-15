const User = require('../models/user.model');
const Server = require('../models/server.model');

// Получение статистики для панели управления
exports.getDashboardStats = async (req, res) => {
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
      activeConnections += server.activeConnections || 0;
    });
    
    // Вычисление загрузки серверов (средний процент)
    let totalServerLoad = 0;
    let serverLoadPercent = 0;
    
    if (activeServers > 0) {
      // Вычисляем загрузку на основе активных подключений и общего количества активных серверов
      // Принимаем в среднем, что один сервер может обслуживать до 50 одновременных подключений при 100% нагрузке
      const maxConnectionsPerServer = 50;
      const totalMaxConnections = activeServers * maxConnectionsPerServer;
      
      if (totalMaxConnections > 0) {
        // Рассчитываем процент загрузки серверов
        serverLoadPercent = Math.min(Math.round((activeConnections / totalMaxConnections) * 100), 100);
      }
    }
    
    // Ключи активации
    const keyCount = await User.countDocuments();
    
    res.status(200).json({
      userCount,
      activeUsers,
      serverCount,
      activeServers,
      activeConnections,
      serverLoadPercent,
      keyCount
    });
  } catch (error) {
    console.error('Ошибка получения статистики для дашборда:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении статистики' });
  }
};