const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/admin.model');
const ActivationKey = require('../models/activation-key.model');
const User = require('../models/user.model');
const { validationResult } = require('express-validator');

// Генерация JWT токена
const generateToken = (id, username, role) => {
  return jwt.sign(
    { id, username, role },
    process.env.JWT_SECRET || 'secret_key',
    { expiresIn: '24h' }
  );
};

// Регистрация нового администратора
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Проверяем, существует ли уже пользователь с таким email
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Email уже используется' });
    }

    // Создаем нового администратора
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({
      username,
      email,
      password: hashedPassword,
      role: 'admin'
    });

    await newAdmin.save();

    // Создаем JWT токен
    const token = jwt.sign(
      { id: newAdmin._id, role: newAdmin.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpire }
    );

    res.status(201).json({
      success: true,
      message: 'Администратор успешно зарегистрирован',
      token,
      user: {
        id: newAdmin._id,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });
  } catch (error) {
    console.error('Ошибка при регистрации администратора:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера при регистрации' });
  }
};

// Вход администратора
exports.login = async (req, res) => {
  try {
    console.log('Login request body:', req.body);
    const { email, password } = req.body;
    console.log('Attempting login with email:', email);

    // Находим пользователя по email
    const admin = await Admin.findOne({ email });
    console.log('Found admin:', admin ? { 
      id: admin._id, 
      email: admin.email, 
      username: admin.username,
      hasPassword: !!admin.password
    } : 'Not found');
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }

    // Отладочная информация о пароле
    console.log('Password comparison:', {
      providedPassword: password,
      storedPassword: admin.password ? admin.password.substring(0, 15) + '...' : 'N/A', // Log only prefix of hash
      usingBcrypt: admin.password && admin.password.startsWith('$2') // Check if bcrypt should be used
    });

    // Проверяем пароль, используя метод comparePassword из модели
    console.log('[Login] Calling comparePassword...'); // New log
    const isPasswordValid = await admin.comparePassword(password);
    console.log(`[Login] comparePassword returned: ${isPasswordValid}`); // New log - THIS IS IMPORTANT
    
    if (!isPasswordValid) {
      console.log('[Login] Password validation failed.'); // New log
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }

    console.log('[Login] Password validation successful. Generating token...'); // New log

    // Создаем JWT токен
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpire }
    );

    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка при входе администратора:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера при входе' });
  }
};

// Получение информации о текущем пользователе
exports.getCurrentUser = async (req, res) => {
  try {
    // req.userId устанавливается middleware аутентификации
    const admin = await Admin.findById(req.userId).select('-password');
    
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    res.json({
      success: true,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка при получении данных пользователя:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
};

// Активация клиента с помощью ключа
exports.activateClient = async (req, res) => {
  try {
    const { activationKey } = req.body;

    const key = await ActivationKey.findOne({ key: activationKey });
    if (!key) {
      return res.status(404).json({ message: 'Ключ активации не найден' });
    }

    if (key.isUsed) {
      return res.status(400).json({ message: 'Ключ активации уже использован' });
    }

    // Помечаем ключ как использованный
    key.isUsed = true;
    key.activatedAt = Date.now();
    await key.save();

    res.json({ message: 'Клиент успешно активирован', key });
  } catch (error) {
    console.error('Ошибка при активации клиента:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Проверка статуса активации по ключу
exports.verifyActivation = async (req, res) => {
  try {
    const { activationKey } = req.params;

    // Проверяем сначала модель User
    const user = await User.findOne({ activationKey });
    
    if (user) {
      const isValid = user.isValidUser();
      return res.status(200).json({
        success: true,
        isActive: isValid,
        email: user.email, // Добавляем email для проверки соответствия
        activationDate: user.activationDate,
        expirationDate: user.expirationDate,
        message: isValid ? 'Ключ активации действителен' : 'Ключ активации недействителен'
      });
    }
    
    // Если пользователь не найден, проверяем модель ActivationKey
    const activationKeyRecord = await ActivationKey.findOne({ key: activationKey });
    if (!activationKeyRecord) {
      return res.status(404).json({ 
        success: false,
        message: 'Ключ активации не найден' 
      });
    }

    return res.status(200).json({
      success: true,
      key: activationKeyRecord.key,
      isUsed: activationKeyRecord.isUsed,
      activatedAt: activationKeyRecord.activatedAt,
      expirationDate: activationKeyRecord.expirationDate,
      message: activationKeyRecord.isUsed ? 'Ключ активации использован' : 'Ключ активации не использован'
    });
  } catch (error) {
    console.error('Ошибка при проверке ключа активации:', error);
    res.status(500).json({ 
      success: false,
      message: 'Ошибка сервера при проверке ключа активации' 
    });
  }
};

// Проверка статуса клиента
exports.verifyClient = async (req, res) => {
  try {
    // Проверяем наличие ошибок валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { clientId } = req.body;

    // Ищем пользователя по ID (clientId в этом случае - это activationKey)
    const user = await User.findOne({ activationKey: clientId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Клиент не найден' 
      });
    }

    // Проверяем валидность пользователя
    const isValid = user.isValidUser();
    
    // Обновляем дату последнего входа
    if (isValid) {
      user.lastLogin = Date.now();
      await user.save();
    }

    // Формируем ответ
    return res.status(200).json({
      success: true,
      isActive: isValid,
      activationKey: user.activationKey,
      activationDate: user.activationDate,
      expirationDate: user.expirationDate,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Ошибка при проверке статуса клиента:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Ошибка сервера при проверке статуса клиента' 
    });
  }
};

// Генерация токена для клиента VPN
exports.generateUserToken = async (req, res) => {
  try {
    const { email, activationKey } = req.body;
    
    if (!email || !activationKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email и ключ активации обязательны' 
      });
    }
    
    // Проверяем существование пользователя с данным ключом активации
    const user = await User.findOne({ activationKey });
    
    if (!user) {
      // Проверяем, есть ли такой ключ в таблице ключей активации
      const keyRecord = await ActivationKey.findOne({ key: activationKey });
      if (!keyRecord) {
        return res.status(404).json({
          success: false,
          message: 'Ключ активации не найден'
        });
      }
      
      // Если ключ найден, но пользователя нет, создаем его
      const newUser = new User({
        email,
        activationKey,
        isActive: true,
        activationDate: Date.now(),
        // Срок действия - 1 год от текущей даты
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });
      
      await newUser.save();
      console.log(`Создан новый пользователь с email ${email} и ключом ${activationKey}`);
      
      // Создаем JWT токен для нового пользователя
      const token = jwt.sign(
        { id: newUser._id, email: newUser.email, role: 'user' },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '30d' }
      );
      
      return res.status(201).json({
        success: true,
        message: 'Пользователь успешно зарегистрирован',
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          activationKey: newUser.activationKey,
          expirationDate: newUser.expirationDate
        }
      });
    }
    
    // Проверяем валидность пользователя
    const isValid = user.isValidUser();
    if (!isValid) {
      return res.status(403).json({
        success: false,
        message: 'Ключ активации недействителен или истек срок его действия'
      });
    }
    
    // Проверяем, соответствует ли предоставленный email тому, что зарегистрирован для активационного ключа
    if (user.email !== email) {
      return res.status(401).json({
        success: false,
        message: 'Указанный email не соответствует ключу активации'
      });
    }
    
    // Генерируем JWT токен
    const token = jwt.sign(
      { id: user._id, email: user.email, role: 'user' },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '30d' }
    );
    
    // Обновляем дату последнего входа
    user.lastLogin = Date.now();
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'Токен успешно сгенерирован',
      token,
      user: {
        id: user._id,
        email: user.email,
        activationKey: user.activationKey,
        expirationDate: user.expirationDate
      }
    });
  } catch (error) {
    console.error('Ошибка при генерации токена для клиента:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка сервера при генерации токена'
    });
  }
};

// Отладка токена для клиентских запросов
exports.debugToken = async (req, res) => {
  try {
    // Получаем токен из заголовка Authorization
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Убираем 'Bearer ' из строки
    } else if (req.query.token) {
      // Альтернативно, токен может быть в query параметрах
      token = req.query.token;
    } else if (req.cookies && req.cookies.token) {
      // Или в куках
      token = req.cookies.token;
    }
    
    if (!token) {
      return res.status(200).json({ 
        success: false, 
        isValid: false,
        message: 'Токен не предоставлен' 
      });
    }
    
    // Проверяем валидность токена
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      
      // Получаем информацию о пользователе, если токен валиден
      const userInfo = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        exp: decoded.exp
      };
      
      // Вычисляем оставшееся время жизни токена
      const currentTime = Math.floor(Date.now() / 1000);
      const tokenExpiry = decoded.exp;
      const timeRemaining = tokenExpiry - currentTime;
      
      return res.status(200).json({
        success: true,
        isValid: true,
        user: userInfo,
        expiresIn: timeRemaining,
        expiresAt: new Date(tokenExpiry * 1000).toISOString(),
        message: 'Токен действителен'
      });
    } catch (error) {
      // Если произошла ошибка верификации, токен недействителен или истек
      return res.status(200).json({
        success: false,
        isValid: false,
        error: error.name,
        message: error.message === 'jwt expired' ? 'Токен истек' : 'Недействительный токен'
      });
    }
  } catch (error) {
    console.error('Ошибка при проверке токена:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка сервера при проверке токена'
    });
  }
};