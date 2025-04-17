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
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 15;
const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || 100;
const LOGS_DIR = process.env.LOGS_DIR || './logs';

// Настройка доверия к прокси для работы через Nginx
app.set('trust proxy', true);
console.log('Express trust proxy установлен в true');

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
  message: { message: 'Слишком много запросов, попробуйте позже' }
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

// Ограничение запросов
app.use('/api/', limiter);

// Парсинг запросов
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} ${req.ip}`);
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
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');
  
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
    const servers = await ServerModel.find({ status: 'active' });
    
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