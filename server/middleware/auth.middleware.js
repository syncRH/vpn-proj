const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = (req, res, next) => {
  // Получение токена из заголовка
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');

  // Проверка наличия токена
  if (!token) {
    return res.status(401).json({ message: 'Токен не предоставлен, авторизация отклонена' });
  }

  try {
    // Проверка токена
    // Используем секретный ключ из config или переменной окружения, или стандартный ключ
    const jwtSecret = process.env.JWT_SECRET || config.jwtSecret || 'secret_key';
    
    // Проверка токена с поддержкой различных форматов
    const decoded = jwt.verify(token, jwtSecret);
    
    // Добавление информации о пользователе в объект запроса
    req.user = decoded;
    
    // Для обратной совместимости с более старыми токенами
    if (decoded.id) {
      req.userId = decoded.id;
    } else if (decoded.uid) {
      req.userId = decoded.uid;
    }
    
    // Логирование для отладки (только в разработке)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Успешная проверка токена:', {
        userId: req.userId,
        role: decoded.role || 'user',
        email: decoded.email
      });
    }
    
    next();
  } catch (err) {
    console.error('Ошибка проверки токена:', err.message);
    res.status(401).json({ message: 'Недействительный токен' });
  }
};