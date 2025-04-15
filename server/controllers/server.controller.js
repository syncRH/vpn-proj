const fs = require('fs').promises;
const path = require('path');
const { validationResult } = require('express-validator');
const Server = require('../models/server.model');
const { exec } = require('child_process');
const util = require('util');

// Преобразуем функцию exec в промис
const execPromise = util.promisify(exec);

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
};

// Получение конфигурационного файла полного VPN
exports.getFullVpnConfig = async (req, res) => {
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