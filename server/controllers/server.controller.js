const fs = require('fs').promises;
const path = require('path');
const { validationResult } = require('express-validator');
const Server = require('../models/server.model');
const { exec } = require('child_process');
const util = require('util');
const rateLimit = require('express-rate-limit'); // Add this for rate limiting

// Преобразуем функцию exec в промис
const execPromise = util.promisify(exec);

// Map to track unique client connections to servers
// Key: serverId_clientId, Value: connection timestamp
const activeConnectionsMap = new Map();

// Rate limiter storage for IP addresses
const ipLimiterMap = new Map();

// Rate limiter configurations
const rateLimitConfig = {
  standard: {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 60,     // 60 requests per minute
    message: 'Превышен лимит запросов. Пожалуйста, повторите через 60 секунд.'
  },
  serverConfig: {
    windowMs: 30 * 1000, // 30 seconds window
    maxRequests: 15,     // 15 requests per 30 seconds
    message: 'Превышен лимит запросов на получение конфигурации. Пожалуйста, повторите через 30 секунд.'
  },
  analytics: {
    windowMs: 2 * 60 * 1000, // 2 minute window
    maxRequests: 20,         // 20 requests per 2 minutes
    message: 'Превышен лимит запросов аналитики. Пожалуйста, повторите через 2 минуты.'
  }
};

// Helper function to check rate limit
function checkRateLimit(ip, limitType) {
  const config = rateLimitConfig[limitType] || rateLimitConfig.standard;
  const now = Date.now();
  const key = `${ip}:${limitType}`;
  
  // Initialize if this IP hasn't been seen for this limit type
  if (!ipLimiterMap.has(key)) {
    ipLimiterMap.set(key, {
      count: 0,
      resetAt: now + config.windowMs,
      windowMs: config.windowMs
    });
  }
  
  let limiter = ipLimiterMap.get(key);
  
  // Reset counter if the window has passed
  if (now > limiter.resetAt) {
    limiter = {
      count: 0,
      resetAt: now + config.windowMs,
      windowMs: config.windowMs
    };
    ipLimiterMap.set(key, limiter);
  }
  
  // Increment and check
  limiter.count++;
  
  if (limiter.count > config.maxRequests) {
    // Calculate time to wait in seconds
    const waitTimeSeconds = Math.ceil((limiter.resetAt - now) / 1000);
    return {
      limited: true,
      message: config.message,
      retryAfter: waitTimeSeconds,
      remainingRequests: 0
    };
  }
  
  return {
    limited: false,
    remainingRequests: config.maxRequests - limiter.count,
    resetAt: limiter.resetAt
  };
}

// Middleware to apply rate limiting
function applyRateLimit(req, res, next, limitType = 'standard') {
  const ip = req.ip || req.connection.remoteAddress;
  const result = checkRateLimit(ip, limitType);
  
  if (result.limited) {
    // Set proper headers for rate limiting
    res.setHeader('Retry-After', result.retryAfter);
    res.setHeader('X-RateLimit-Limit', rateLimitConfig[limitType].maxRequests);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + result.retryAfter);
    
    return res.status(429).json({
      error: 'Too many requests',
      message: result.message,
      retryAfter: result.retryAfter
    });
  }
  
  // Set headers for non-limited requests too
  res.setHeader('X-RateLimit-Limit', rateLimitConfig[limitType].maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remainingRequests);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  
  next();
}

// Cleanup stale IP rate limit data periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, limiter] of ipLimiterMap.entries()) {
    if (now > limiter.resetAt + 60000) { // Keep entries for 1 minute past reset
      ipLimiterMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Helper function to get active connection count for a server
function getActiveConnectionCount(serverId) {
  let count = 0;
  for (const key of activeConnectionsMap.keys()) {
    if (key.startsWith(`${serverId}_`)) {
      count++;
    }
  }
  return count;
}

// Helper function to cleanup stale connections (older than 1 hour)
function cleanupStaleConnections() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const [key, timestamp] of activeConnectionsMap.entries()) {
    if (timestamp < oneHourAgo) {
      const [serverId, clientId] = key.split('_');
      console.log(`Cleaning up stale connection: clientId=${clientId}, serverId=${serverId}`);
      activeConnectionsMap.delete(key);
      
      // Update server connection count in the database
      Server.findById(serverId).then(server => {
        if (server) {
          server.activeConnections = getActiveConnectionCount(serverId);
          server.save().catch(err => console.error('Error updating server after cleanup:', err));
        }
      }).catch(err => console.error('Error finding server during cleanup:', err));
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupStaleConnections, 15 * 60 * 1000);

// Получение списка всех серверов
exports.getAllServers = async (req, res) => {
  try {
    console.log('Запрос на получение списка серверов');
    const servers = await Server.find().select('-antizapretConfig -fullVpnConfig');
    console.log(`Найдено ${servers.length} серверов:`, servers);
    res.status(200).json({ servers });
  } catch (error) {
    console.error('Ошибка получения списка серверов:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении списка серверов' });
  }
};

// Получение информации о конкретном сервере
exports.getServerById = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id).select('-antizapretConfig -fullVpnConfig');
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    res.status(200).json({ server });
  } catch (error) {
    console.error('Ошибка получения информации о сервере:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении информации о сервере' });
  }
};

// Запуск OpenVPN сервера с указанным конфигом
const startOpenVpnServer = async (serverName, configPath) => {
  try {
    // Проверяем существование директории для логов
    const logDir = path.join(__dirname, '../logs');
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (err) {
      console.log('Директория логов уже существует или ошибка создания:', err);
    }
    
    const logPath = path.join(logDir, `${serverName}.log`);
    
    // Запуск OpenVPN в фоновом режиме
    const command = `openvpn --config ${configPath} --log ${logPath} --daemon`;
    
    console.log(`Запуск OpenVPN сервера: ${command}`);
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error(`Ошибка запуска OpenVPN: ${stderr}`);
      return false;
    }
    
    console.log(`OpenVPN успешно запущен, stdout: ${stdout}`);
    return true;
  } catch (error) {
    console.error('Ошибка запуска OpenVPN сервера:', error);
    return false;
  }
};

// Функция для извлечения данных из конфига OpenVPN
const extractServerInfo = (configContent, fileName) => {
  const info = {
    name: '',
    host: '',
    country: '',
    city: ''
  };
  
  // Извлечение имени сервера из имени файла
  if (fileName) {
    // Удаляем расширение .ovpn
    const baseName = fileName.replace(/\.ovpn$/, '');
    // Разделяем имя по разделителям
    const parts = baseName.split(/[-_\.]/);
    if (parts.length >= 2) {
      // Если в имени файла есть хотя бы 2 части, первую считаем страной/регионом, вторую - городом
      info.country = parts[0].toUpperCase();
      info.city = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      info.name = `${info.country}-${info.city}`;
    } else {
      info.name = baseName;
    }
  }
  
  // Извлечение данных из содержимого конфига
  const lines = configContent.split('\n');
  
  for (const line of lines) {
    // Ищем строку с remote (адрес сервера)
    if (line.startsWith('remote ')) {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        info.host = parts[1];
        // Если имя не было извлечено из имени файла, используем хост
        if (!info.name) {
          info.name = info.host;
        }
      }
    }
    
    // Ищем комментарии с информацией о сервере
    if (line.startsWith('#')) {
      const comment = line.substring(1).trim();
      
      // Проверяем наличие информации о стране
      if (/country:/i.test(comment)) {
        info.country = comment.replace(/.*country:\s*/i, '').trim();
      }
      
      // Проверяем наличие информации о городе
      if (/city:/i.test(comment)) {
        info.city = comment.replace(/.*city:\s*/i, '').trim();
      }
      
      // Проверяем наличие информации о названии
      if (/name:/i.test(comment)) {
        info.name = comment.replace(/.*name:\s*/i, '').trim();
      }
    }
  }
  
  return info;
};

// Добавление нового сервера
exports.addServer = async (req, res) => {
  try {
    console.log('Запрос на добавление сервера:', req.body);
    
    // Проверка ошибок валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Ошибки валидации:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { ipAddress, name, host, country, city } = req.body;
    
    if (!ipAddress) {
      return res.status(400).json({ message: 'IP адрес сервера обязателен' });
    }
    
    // Улучшенная валидация IP-адреса
    const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    if (!ipRegex.test(ipAddress)) {
      return res.status(400).json({ message: 'Некорректный формат IP-адреса' });
    }
    
    // Проверка диапазона каждого октета (0-255)
    const octets = ipAddress.split('.').map(Number);
    if (octets.some(octet => octet < 0 || octet > 255)) {
      return res.status(400).json({ message: 'IP-адрес должен содержать числа от 0 до 255 в каждом октете' });
    }
    
    // Проверка наличия IP адреса в базе
    const existingServer = await Server.findOne({ ipAddress });
    if (existingServer) {
      return res.status(409).json({ message: 'Сервер с таким IP адресом уже существует' });
    }
    
    // Проверка наличия загруженных файлов
    if (!req.files) {
      return res.status(400).json({ message: 'Не получены файлы конфигурации' });
    }
    
    if (!req.files.antizapretConfig) {
      return res.status(400).json({ message: 'Требуется загрузить конфигурацию Anti-zapret VPN' });
    }
    
    if (!req.files.fullVpnConfig) {
      return res.status(400).json({ message: 'Требуется загрузить конфигурацию Full VPN' });
    }
    
    const antizapretFile = req.files.antizapretConfig[0];
    const fullVpnFile = req.files.fullVpnConfig[0];
    
    // Проверка MIME-типа и расширения файлов
    const validateFileType = (file) => {
      const validMimeTypes = ['application/octet-stream', 'text/plain'];
      const validExtensions = ['.ovpn'];
      const fileExt = path.extname(file.originalname).toLowerCase();
      
      if (!validMimeTypes.includes(file.mimetype) && !validExtensions.includes(fileExt)) {
        return { valid: false, message: `Недопустимый тип файла: ${file.originalname}. Разрешены только файлы .ovpn` };
      }
      
      if (!file.originalname.toLowerCase().endsWith('.ovpn')) {
        return { valid: false, message: `Файл ${file.originalname} должен иметь расширение .ovpn` };
      }
      
      return { valid: true };
    };
    
    const antizapretValidation = validateFileType(antizapretFile);
    if (!antizapretValidation.valid) {
      return res.status(415).json({ message: antizapretValidation.message });
    }
    
    const fullVpnValidation = validateFileType(fullVpnFile);
    if (!fullVpnValidation.valid) {
      return res.status(415).json({ message: fullVpnValidation.message });
    }
    
    console.log('Полученные файлы:', {
      antizapret: antizapretFile.path,
      fullVpn: fullVpnFile.path
    });
    
    // Создание директории для загрузки, если не существует
    const uploadsDir = path.join(__dirname, '../uploads');
    const configsDir = path.join(__dirname, '../uploads/configs');
    
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(configsDir, { recursive: true });
    } catch (err) {
      console.log('Директории уже существуют или ошибка создания:', err);
      if (err.code !== 'EEXIST') {
        return res.status(500).json({ message: 'Ошибка создания директорий для загрузки файлов' });
      }
    }
    
    // Чтение содержимого файлов с обработкой ошибок
    let antizapretConfig, fullVpnConfig;
    try {
      antizapretConfig = await fs.readFile(antizapretFile.path, 'utf8');
    } catch (err) {
      console.error('Ошибка чтения файла Anti-zapret:', err);
      return res.status(500).json({ message: 'Ошибка чтения файла конфигурации Anti-zapret' });
    }
    
    try {
      fullVpnConfig = await fs.readFile(fullVpnFile.path, 'utf8');
    } catch (err) {
      console.error('Ошибка чтения файла Full VPN:', err);
      return res.status(500).json({ message: 'Ошибка чтения файла конфигурации Full VPN' });
    }
    
    // Проверка валидности содержимого конфигурационных файлов
    const validateConfigContent = (content) => {
      // Проверка наличия ключевых параметров OpenVPN
      if (!content.includes('remote ')) {
        return { valid: false, message: 'Отсутствует параметр "remote" в конфигурационном файле' };
      }
      
      if (!content.includes('dev ')) {
        return { valid: false, message: 'Отсутствует параметр "dev" в конфигурационном файле' };
      }
      
      return { valid: true };
    };
    
    const antizapretContentValidation = validateConfigContent(antizapretConfig);
    if (!antizapretContentValidation.valid) {
      return res.status(400).json({ message: `Некорректный конфиг Anti-zapret: ${antizapretContentValidation.message}` });
    }
    
    const fullVpnContentValidation = validateConfigContent(fullVpnConfig);
    if (!fullVpnContentValidation.valid) {
      return res.status(400).json({ message: `Некорректный конфиг Full VPN: ${fullVpnContentValidation.message}` });
    }
    
    // Извлечение информации из конфигурационного файла
    const serverInfo = extractServerInfo(antizapretConfig, antizapretFile.originalname);
    console.log('Извлеченная информация о сервере:', serverInfo);
    
    // Создание нового сервера с дополнительной информацией
    const newServer = new Server({
      ipAddress,
      name: name || serverInfo.name || `VPN Server ${ipAddress}`,
      host: host || serverInfo.host || ipAddress,
      country: country || serverInfo.country || 'Unknown',
      city: city || serverInfo.city || 'Unknown',
      antizapretConfig,
      fullVpnConfig,
      antizapretFilePath: antizapretFile.path,
      fullVpnFilePath: fullVpnFile.path,
      isActive: true
    });
    
    await newServer.save();
    
    // Автоматический запуск OpenVPN сервера
    let serverStartResult = false;
    try {
      serverStartResult = await startOpenVpnServer(`antizapret_${ipAddress}`, antizapretFile.path);
      
      if (serverStartResult) {
        console.log(`OpenVPN сервер для ${ipAddress} (режим antizapret) успешно запущен`);
      } else {
        console.error(`Не удалось запустить OpenVPN сервер для ${ipAddress} (режим antizapret)`);
      }
    } catch (error) {
      console.error('Ошибка при запуске OpenVPN сервера:', error);
    }
    
    res.status(201).json({
      message: 'Сервер успешно добавлен' + (serverStartResult ? ' и запущен' : ', но не удалось запустить автоматически'),
      server: {
        id: newServer._id,
        name: newServer.name,
        host: newServer.host,
        ipAddress: newServer.ipAddress,
        country: newServer.country,
        city: newServer.city,
        isActive: newServer.isActive,
        createdAt: newServer.createdAt,
        serverStarted: serverStartResult
      }
    });
  } catch (error) {
    console.error('Ошибка добавления сервера:', error);
    
    // Более подробная обработка ошибок
    if (error.name === 'ValidationError') {
      // Обработка ошибок валидации Mongoose
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      return res.status(400).json({ message: 'Ошибка валидации данных', errors });
    }
    
    res.status(500).json({ message: `Ошибка сервера при добавлении нового сервера: ${error.message}` });
  }
};

// Обновление сервера
exports.updateServer = async (req, res) => {
  try {
    const serverId = req.params.id;
    const { ipAddress, name, host, country, city, isActive } = req.body;
    
    console.log('Запрос на обновление сервера:', {
      id: serverId,
      ipAddress,
      name,
      host,
      country,
      city,
      isActive,
      hasFiles: !!req.files
    });
    
    // Поиск сервера
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Валидация IP-адреса, если он был изменен
    if (ipAddress && ipAddress !== server.ipAddress) {
      // Проверка формата IP-адреса
      const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      if (!ipRegex.test(ipAddress)) {
        return res.status(400).json({ message: 'Некорректный формат IP-адреса' });
      }
      
      // Проверка диапазона каждого октета (0-255)
      const octets = ipAddress.split('.').map(Number);
      if (octets.some(octet => octet < 0 || octet > 255)) {
        return res.status(400).json({ message: 'IP-адрес должен содержать числа от 0 до 255 в каждом октете' });
      }
      
      // Проверка уникальности IP-адреса
      const existingServer = await Server.findOne({ ipAddress });
      if (existingServer && existingServer._id.toString() !== serverId) {
        return res.status(409).json({ message: 'Сервер с таким IP адресом уже существует' });
      }
      
      server.ipAddress = ipAddress;
    }
    
    // Обновление данных сервера
    if (name !== undefined) server.name = name;
    if (host !== undefined) server.host = host;
    if (country !== undefined) server.country = country;
    if (city !== undefined) server.city = city;
    
    // Обновление статуса активности (если передан)
    if (isActive !== undefined) {
      server.isActive = isActive === 'true' || isActive === true;
    }
    
    // Обновление файлов (если загружены)
    if (req.files) {
      // Функция для валидации типа файла
      const validateFileType = (file) => {
        const validMimeTypes = ['application/octet-stream', 'text/plain'];
        const validExtensions = ['.ovpn'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        
        if (!validMimeTypes.includes(file.mimetype) && !validExtensions.includes(fileExt)) {
          return { valid: false, message: `Недопустимый тип файла: ${file.originalname}. Разрешены только файлы .ovpn` };
        }
        
        if (!file.originalname.toLowerCase().endsWith('.ovpn')) {
          return { valid: false, message: `Файл ${file.originalname} должен иметь расширение .ovpn` };
        }
        
        return { valid: true };
      };
      
      // Функция для валидации содержимого конфига
      const validateConfigContent = (content) => {
        // Проверка наличия ключевых параметров OpenVPN
        if (!content.includes('remote ')) {
          return { valid: false, message: 'Отсутствует параметр "remote" в конфигурационном файле' };
        }
        
        if (!content.includes('dev ')) {
          return { valid: false, message: 'Отсутствует параметр "dev" в конфигурационном файле' };
        }
        
        return { valid: true };
      };
      
      // Обработка antizapret файла
      if (req.files.antizapretConfig) {
        const antizapretFile = req.files.antizapretConfig[0];
        
        // Валидация типа файла
        const fileValidation = validateFileType(antizapretFile);
        if (!fileValidation.valid) {
          return res.status(415).json({ message: fileValidation.message });
        }
        
        try {
          // Чтение содержимого файла
          const antizapretConfig = await fs.readFile(antizapretFile.path, 'utf8');
          
          // Валидация содержимого
          const contentValidation = validateConfigContent(antizapretConfig);
          if (!contentValidation.valid) {
            return res.status(400).json({ message: `Некорректный конфиг Anti-zapret: ${contentValidation.message}` });
          }
          
          // Обновляем конфигурацию
          server.antizapretConfig = antizapretConfig;
          server.antizapretFilePath = antizapretFile.path;
          
          // Удаляем старый файл, если путь отличается
          if (server.antizapretFilePath && server.antizapretFilePath !== antizapretFile.path) {
            try {
              await fs.unlink(server.antizapretFilePath);
            } catch (err) {
              console.log(`Не удалось удалить старый файл: ${server.antizapretFilePath}`, err);
            }
          }
          
          // Обновляем информацию о сервере на основе нового файла
          if (!name || !host || !country || !city) {
            const serverInfo = extractServerInfo(antizapretConfig, antizapretFile.originalname);
            if (!name && serverInfo.name) server.name = serverInfo.name;
            if (!host && serverInfo.host) server.host = serverInfo.host;
            if (!country && serverInfo.country) server.country = serverInfo.country;
            if (!city && serverInfo.city) server.city = serverInfo.city;
          }
        } catch (err) {
          console.error('Ошибка чтения файла Anti-zapret:', err);
          return res.status(500).json({ message: 'Ошибка чтения файла конфигурации Anti-zapret' });
        }
      }
      
      // Обработка fullVpn файла
      if (req.files.fullVpnConfig) {
        const fullVpnFile = req.files.fullVpnConfig[0];
        
        // Валидация типа файла
        const fileValidation = validateFileType(fullVpnFile);
        if (!fileValidation.valid) {
          return res.status(415).json({ message: fileValidation.message });
        }
        
        try {
          // Чтение содержимого файла
          const fullVpnConfig = await fs.readFile(fullVpnFile.path, 'utf8');
          
          // Валидация содержимого
          const contentValidation = validateConfigContent(fullVpnConfig);
          if (!contentValidation.valid) {
            return res.status(400).json({ message: `Некорректный конфиг Full VPN: ${contentValidation.message}` });
          }
          
          // Обновляем конфигурацию
          server.fullVpnConfig = fullVpnConfig;
          
          // Удаляем старый файл, если путь отличается
          if (server.fullVpnFilePath && server.fullVpnFilePath !== fullVpnFile.path) {
            try {
              await fs.unlink(server.fullVpnFilePath);
            } catch (err) {
              console.log(`Не удалось удалить старый файл: ${server.fullVpnFilePath}`, err);
            }
          }
          
          server.fullVpnFilePath = fullVpnFile.path;
        } catch (err) {
          console.error('Ошибка чтения файла Full VPN:', err);
          return res.status(500).json({ message: 'Ошибка чтения файла конфигурации Full VPN' });
        }
      }
    }
    
    await server.save();
    
    res.status(200).json({
      message: 'Сервер успешно обновлен',
      server: {
        id: server._id,
        name: server.name,
        host: server.host,
        ipAddress: server.ipAddress,
        country: server.country,
        city: server.city,
        isActive: server.isActive,
        updatedAt: server.updatedAt
      }
    });
  } catch (error) {
    console.error('Ошибка обновления сервера:', error);
    
    // Более подробная обработка ошибок
    if (error.name === 'ValidationError') {
      // Обработка ошибок валидации Mongoose
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      return res.status(400).json({ message: 'Ошибка валидации данных', errors });
    }
    
    res.status(500).json({ message: `Ошибка сервера при обновлении сервера: ${error.message}` });
  }
};

// Удаление сервера
exports.deleteServer = async (req, res) => {
  try {
    const serverId = req.params.id;
    
    // Поиск и удаление сервера
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Удаление файлов
    try {
      if (server.antizapretFilePath) {
        try {
          await fs.access(server.antizapretFilePath);
          await fs.unlink(server.antizapretFilePath);
        } catch (err) {
          console.log(`Файл ${server.antizapretFilePath} не найден или не может быть удален`);
        }
      }
      
      if (server.fullVpnFilePath) {
        try {
          await fs.access(server.fullVpnFilePath);
          await fs.unlink(server.fullVpnFilePath);
        } catch (err) {
          console.log(`Файл ${server.fullVpnFilePath} не найден или не может быть удален`);
        }
      }
    } catch (err) {
      console.error('Ошибка удаления файлов:', err);
      // Продолжаем удаление сервера даже если файлы не удалось удалить
    }
    
    // Используем deleteOne вместо remove (который устарел)
    await Server.deleteOne({ _id: serverId });
    
    res.status(200).json({ message: 'Сервер успешно удален' });
  } catch (error) {
    console.error('Ошибка удаления сервера:', error);
    res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
  }
};

// Получение конфигурационного файла Antizapret
exports.getAntizapretConfig = async (req, res) => {
  applyRateLimit(req, res, async () => {
    try {
      const server = await Server.findById(req.params.id);
      
      if (!server) {
        return res.status(404).json({ message: 'Сервер не найден' });
      }
      
      if (!server.isActive) {
        return res.status(403).json({ message: 'Сервер не активен' });
      }
      
      res.status(200).send(server.antizapretConfig);
    } catch (error) {
      console.error('Ошибка получения конфигурации Antizapret:', error);
      res.status(500).json({ message: 'Ошибка сервера при получении конфигурации' });
    }
  }, 'serverConfig');
};

// Получение конфигурационного файла полного VPN
exports.getFullVpnConfig = async (req, res) => {
  applyRateLimit(req, res, async () => {
    try {
      const server = await Server.findById(req.params.id);
      
      if (!server) {
        return res.status(404).json({ message: 'Сервер не найден' });
      }
      
      if (!server.isActive) {
        return res.status(403).json({ message: 'Сервер не активен' });
      }
      
      res.status(200).send(server.fullVpnConfig);
    } catch (error) {
      console.error('Ошибка получения конфигурации полного VPN:', error);
      res.status(500).json({ message: 'Ошибка сервера при получении конфигурации' });
    }
  }, 'serverConfig');
};

// Add server connection tracking endpoints
exports.recordServerConnect = async (req, res) => {
  try {
    const serverId = req.params.id;
    
    // Find the server by ID
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }
    
    // Increment active connections count
    server.activeConnections = server.activeConnections + 1;
    
    // Save the updated server
    await server.save();
    
    console.log(`User connected to server ${server.name}, active connections: ${server.activeConnections}`);
    
    res.status(200).json({ 
      message: 'Server connection recorded',
      activeConnections: server.activeConnections
    });
  } catch (error) {
    console.error('Error recording server connection:', error);
    res.status(500).json({ message: 'Server error while recording connection' });
  }
};

// Record user disconnection from server
exports.recordServerDisconnect = async (req, res) => {
  try {
    const serverId = req.params.id;
    
    // Find the server by ID
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }
    
    // Decrement active connections count (prevent negative values)
    if (server.activeConnections > 0) {
      server.activeConnections = server.activeConnections - 1;
    }
    
    // Save the updated server
    await server.save();
    
    console.log(`User disconnected from server ${server.name}, active connections: ${server.activeConnections}`);
    
    res.status(200).json({ 
      message: 'Server disconnection recorded',
      activeConnections: server.activeConnections
    });
  } catch (error) {
    console.error('Error recording server disconnection:', error);
    res.status(500).json({ message: 'Server error while recording disconnection' });
  }
};

// Получение аналитики серверов
exports.getAnalytics = async (req, res) => {
  applyRateLimit(req, res, async () => {
    try {
      // Get all servers with their connection data
      const servers = await Server.find().select('_id name ipAddress activeConnections maxConnections country city');
      
      // Calculate additional analytics for each server
      const serversWithAnalytics = servers.map(server => {
        // Calculate load percentage (default max connections to 100 if not specified)
        const maxConnections = server.maxConnections || 100;
        const load = Math.floor((server.activeConnections / maxConnections) * 100);
        
        return {
          _id: server._id,
          name: server.name,
          ipAddress: server.ipAddress,
          country: server.country,
          city: server.city,
          activeConnections: server.activeConnections || 0,
          maxConnections: maxConnections,
          load: load > 100 ? 100 : load, // Cap at 100%
          isActive: server.isActive
        };
      });
      
      res.status(200).json({ 
        servers: serversWithAnalytics,
        totalServers: serversWithAnalytics.length,
        totalConnections: serversWithAnalytics.reduce((sum, server) => sum + (server.activeConnections || 0), 0)
      });
    } catch (error) {
      console.error('Ошибка при получении аналитики серверов:', error);
      res.status(500).json({ message: 'Ошибка сервера при получении аналитики' });
    }
  }, 'analytics');
};

// Обновление статистики подключения клиентов
exports.updateConnectionStats = async (req, res) => {
  try {
    const { serverId, status, clientId } = req.body;
    
    if (!serverId) {
      return res.status(400).json({ message: 'Требуется указать ID сервера' });
    }
    
    if (!status) {
      return res.status(400).json({ message: 'Требуется указать статус подключения' });
    }
    
    if (!clientId) {
      return res.status(400).json({ message: 'Требуется указать ID клиента' });
    }
    
    // Находим сервер
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    console.log(`Обновление статистики подключения: ${clientId} ${status} к серверу ${server.name}`);
    
    const connectionKey = `${serverId}_${clientId}`;
    
    // Обновляем счетчик активных подключений в зависимости от статуса
    if (status === 'connected') {
      // Check if this client is already connected to prevent duplicate counts
      if (!activeConnectionsMap.has(connectionKey)) {
        activeConnectionsMap.set(connectionKey, Date.now());
        console.log(`New connection from ${clientId} to server ${server.name}`);
      } else {
        console.log(`Client ${clientId} already connected to server ${server.name}, refreshing timestamp`);
        activeConnectionsMap.set(connectionKey, Date.now()); // Update timestamp
      }
    } else if (status === 'disconnected') {
      // Remove the connection if it exists
      if (activeConnectionsMap.has(connectionKey)) {
        activeConnectionsMap.delete(connectionKey);
        console.log(`Client ${clientId} disconnected from server ${server.name}`);
      }
    }
    
    // Update the server's active connection count based on the actual map state
    const realConnectionCount = getActiveConnectionCount(serverId);
    console.log(`Server ${server.name} real connection count: ${realConnectionCount}`);
    
    // Update the server's connection count in the database
    server.activeConnections = realConnectionCount;
    await server.save();
    
    res.status(200).json({
      message: `Статус подключения к ${server.name} обновлен: ${status}`,
      serverId: serverId,
      status: status,
      activeConnections: server.activeConnections,
      success: true
    });
  } catch (error) {
    console.error('Ошибка при обновлении статистики подключения:', error);
    res.status(500).json({ 
      message: 'Ошибка сервера при обновлении статистики подключения',
      error: error.message,
      success: false
    });
  }
};