module.exports = {
  // Порт сервера
  port: process.env.PORT || 3000,
  
  // MongoDB URI
  mongoUri: process.env.MONGO_URI || 'mongodb://mongo:27017/vpn',
  
  // Секрет для JWT
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key',
  
  // Срок действия токена (в секундах)
  jwtExpire: 86400, // 24 часа
  
  // Настройки VPN
  vpn: {
    defaultProtocol: 'wireguard',
    serverPort: 51820
  }
}; 