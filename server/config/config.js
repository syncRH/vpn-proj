// Настройки приложения
const config = {
  // Настройки сервера
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  // Настройки базы данных
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service'
  },
  
  // Настройки JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'secret_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  // Для совместимости с клиентом и существующим кодом
  jwtSecret: process.env.JWT_SECRET || 'secret_key',
  jwtExpire: process.env.JWT_EXPIRES_IN || '24h',
  
  // Пути к файлам
  paths: {
    uploads: {
      configs: process.env.CONFIGS_UPLOAD_PATH || 'uploads/configs'
    }
  }
};

module.exports = config;