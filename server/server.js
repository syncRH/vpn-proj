require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const jwt = require('jsonwebtoken');
const config = require('./config');
const serverRoutes = require('./routes/server.routes');
const userRoutes = require('./routes/user.routes');
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const authMiddleware = require('./middleware/auth.middleware');
const serverController = require('./controllers/server.controller');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 60; // увеличиваем до 60 минут
const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || 5000; // значительно увеличиваем до 5000 запросов
const LOGS_DIR = process.env.LOGS_DIR || './logs';

// Настройка доверия к прокси для работы через Nginx
app.set('trust proxy', 1);
console.log('Express trust proxy установлен в 1');

// Настройка логирования
const logsDir = path.join(__dirname, LOGS_DIR);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Директория ${logsDir} создана`);
}

// Создание логгера Winston
const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'vpn-api' },
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') })
  ]
});

// Если не в продакшне, также логируем в консоль
if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Создание необходимых директорий для хранения файлов
const uploadsDir = path.join(__dirname, 'uploads');
const configsDir = path.join(__dirname, 'uploads/configs');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Директория uploads создана');
  }
  
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
    logger.info('Директория uploads/configs создана');
  }
} catch (err) {
  logger.error('Ошибка при создании директорий:', err);
}

// Подключение к БД с увеличенным таймаутом
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, // Увеличиваем таймаут до 30 секунд
  socketTimeoutMS: 45000, // Увеличиваем Socket Timeout
  heartbeatFrequencyMS: 10000 // Увеличиваем частоту проверки соединения
})
.then(() => logger.info('MongoDB подключена'))
.catch(err => {
  logger.error('Ошибка подключения к MongoDB:', err);
  console.error('Ошибка подключения к MongoDB:', err);
});

// Настройка rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW * 60 * 1000, // в минутах
  max: RATE_LIMIT_MAX, // максимальное количество запросов
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Превышен лимит запросов, попробуйте позже или обратитесь к администратору'
});

// Создаем более мягкий лимитер для клиентских запросов
const clientLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 1000, // увеличиваем до 1000 запросов за 5 минут
  standardHeaders: true,
  legacyHeaders: false
});

// Создаем особо мягкий лимитер для критических операций
const softLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 200, // 200 запросов в минуту
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // не считаем успешные запросы
  skip: (req, res) => {
    // Пропускаем проверку для запросов аутентификации
    if (req.path.includes('/api/auth/login') || 
        req.path.includes('/api/auth/user/token') ||
        req.path.includes('/api/auth/user/register')) {
      return true;
    }
    return false;
  }
});

// Middleware
// Безопасность
app.use(helmet()); // Устанавливает различные HTTP заголовки для безопасности
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Производительность
app.use(compression()); // Сжатие ответов

// Применяем разные лимиты для разных путей вместо глобального ограничения
// Более жесткие ограничения только для административных маршрутов
app.use('/api/auth/admin', limiter);
app.use('/api/dashboard', limiter);

// Для публичных API применяем мягкий лимитер
app.use('/api/servers/public', softLimiter);
app.use('/api/servers-public', softLimiter);

// Для большинства маршрутов аутентификации пользователей НЕ применяем лимитер
// Особые пути (/api/auth/login, /api/auth/user/token, /api/auth/user/register) полностью исключены из лимитирования

// Применяем очень мягкий лимитер для остальных путей аутентификации
app.use('/api/auth', softLimiter);

// Для остальных путей применяем клиентский лимитер
app.use('/api/users', clientLimiter);
app.use('/api/servers', clientLimiter);

// Парсинг запросов
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Улучшенное логирование запросов для отладки
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} ${req.ip}`);
  console.log(`[REQUEST DEBUG] ${req.method} ${req.originalUrl}`);
  if (req.method === 'POST') {
    console.log('[REQUEST BODY]', req.body);
  }
  next();
});

// Директория для загруженных файлов
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Роуты для аутентификации
app.use('/api/auth', authRoutes);

// Удаляем дублирующиеся маршруты, так как они теперь правильно определены в auth.routes.js
// const authController = require('./controllers/auth.controller');
// app.post('/api/auth/user/token', authController.generateUserToken);
// app.post('/api/auth/user/register', authController.generateUserToken);

// Добавляем логирование для отладки запросов к API
app.use('/api/auth/user/*', (req, res, next) => {
  console.log(`[AUTH DEBUG] Запрос к ${req.method} ${req.originalUrl}`);
  console.log('[AUTH DEBUG] Тело запроса:', req.body);
  next();
});

// Создаем отдельный роутер для публичных маршрутов серверов
const publicServerRoutes = express.Router();
publicServerRoutes.get('/', serverController.getAllServers);
publicServerRoutes.get('/:id', serverController.getServerById);
publicServerRoutes.get('/:id/antizapret-config', serverController.getAntizapretConfig);
publicServerRoutes.get('/:id/vpn-config', serverController.getFullVpnConfig);
app.use('/api/servers/public', publicServerRoutes);

// Защищенные маршруты с аутентификацией
app.use('/api/servers', authMiddleware, serverRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);

// Эндпоинт для проверки работоспособности
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    uptime: process.uptime(), 
    timestamp: Date.now() 
  });
});

// Эндпоинт для отладки запросов
app.get('/api/debug-token', (req, res) => {
  const authHeader = req.header('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : req.header('x-auth-token');
  
  if (!token) {
    return res.status(200).json({
      tokenPresent: false,
      message: 'No token provided'
    });
  }
  
  try {
    // Проверка JWT токена
    const jwtSecret = process.env.JWT_SECRET || config.jwtSecret || 'secret_key';
    const decoded = jwt.verify(token, jwtSecret);
    
    return res.status(200).json({
      tokenPresent: true,
      tokenValid: true,
      decoded: {
        ...decoded,
        // Убираем потенциально чувствительные данные
        iat: decoded.iat,
        exp: decoded.exp
      },
      expiresIn: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (err) {
    return res.status(200).json({
      tokenPresent: true,
      tokenValid: false,
      error: err.message
    });
  }
});

// Специальный публичный эндпоинт для получения серверов
app.get('/api/servers-public', async (req, res) => {
  try {
    // Получаем серверы без проверки авторизации
    const ServerModel = require('./models/server.model');
    const servers = await ServerModel.find({ isActive: true });
    
    return res.status(200).json(servers);
  } catch (error) {
    logger.error('Ошибка при получении публичного списка серверов:', error);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Эндпоинт для проверки работы сервера
app.get('/', (req, res) => {
  res.send('VPN API Server is running');
});

// Обработка ошибок 404
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.originalUrl}`);
  res.status(404).json({ message: 'Route not found' });
});

// Обработка ошибок сервера
app.use((err, req, res, next) => {
  logger.error(`Ошибка сервера: ${err.message}`, { stack: err.stack });
  
  if (NODE_ENV === 'production') {
    // В продакшне не выдаем детали ошибки клиенту
    res.status(500).json({ message: 'Internal Server Error' });
  } else {
    // В разработке можем отдать больше информации
    res.status(500).json({
      message: err.message,
      stack: err.stack
    });
  }
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server is running in ${NODE_ENV} mode on port ${PORT} (0.0.0.0)`);
});