const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');

// Заглушка для пользователя (в реальном приложении будет модель базы данных)
const users = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@example.com',
    password: 'password123', // в реальном приложении должен быть хеширован
    role: 'admin'
  },
  {
    id: '2',
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123', // в реальном приложении должен быть хеширован
    role: 'user'
  },
  {
    id: '3',
    username: 'korsakov',
    email: 'korsakov@benice.games',
    password: 'fca776eb-ebb7-4d51-85f7-56ca512d1eaf', // в реальном приложении должен быть хеширован
    role: 'admin'
  },
  {
    id: '4',
    username: 'iva',
    email: 'iva@benice.games',
    password: '9443f03c-aa53-4d52-80c8-e9ba9afbc9cb', // в реальном приложении должен быть хеширован
    role: 'user'
  },
  {
    id: '5',
    username: 'mikheev',
    email: 'mikheev@benice.games',
    password: 'ff3a8ebf-9280-4740-a209-c9fd7953c34d', // в реальном приложении должен быть хеширован
    role: 'user'
  }
];

// Регистрация нового администратора
exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Проверка, существует ли пользователь с таким email
    if (users.some(user => user.email === email)) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }
    
    // Создание нового пользователя (без хеширования пароля для демо-версии)
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password, // в реальном приложении должен быть хеширован
      role: role || 'admin'
    };
    
    // Добавление пользователя в массив (в реальном приложении - в базу данных)
    users.push(newUser);
    
    res.status(201).json({ message: 'Администратор успешно зарегистрирован' });
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Аутентификация пользователя
exports.login = async (req, res) => {
  try {
    // Выводим полное содержимое запроса для отладки
    console.log('=========== ПОЛНАЯ ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===========');
    console.log('Заголовки запроса:', req.headers);
    console.log('Тело запроса:', req.body);
    console.log('Метод:', req.method);
    console.log('Путь:', req.path);
    console.log('=========== ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===========');
    
    // Проверяем формат email/password
    let email = req.body.email;
    let password = req.body.password;
    
    // Проверяем, не пришли ли данные в другом формате (например, если клиент использует другие имена полей)
    if (!email && req.body.username) {
      email = req.body.username;
      console.log('Используем поле username вместо email:', email);
    }
    
    if (!password && req.body.key) {
      password = req.body.key;
      console.log('Используем поле key вместо password:', password);
    }
    
    // Проверка формата email - должен иметь формат xxx@xxx.xxx
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`Недопустимый формат email: ${email}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Недопустимый формат email. Пожалуйста, введите корректный email.' 
      });
    }
    
    console.log('Запрос авторизации получен:', { 
      email, 
      password_provided: !!password,
      passwordLength: password ? password.length : 0 
    });
    
    // Выводим список зарегистрированных пользователей (для отладки)
    console.log('Зарегистрированные пользователи:', 
      users.map(u => ({ id: u.id, email: u.email, username: u.username }))
    );
    
    // Поиск пользователя по email в локальном массиве
    const user = users.find(u => u.email === email);
    
    // Если пользователь не найден в локальном массиве, проверяем базу данных MongoDB
    if (!user) {
      console.log(`Пользователь с email ${email} не найден в локальном массиве, проверяем MongoDB...`);
      
      try {
        // Пробуем найти пользователя в модели User
        const mongoUser = await User.findOne({ email: email });
        
        if (mongoUser) {
          console.log(`Пользователь найден в MongoDB: ${mongoUser.email}, проверяем ключ активации`);
          
          // Проверяем, совпадает ли ключ активации с паролем
          const isKeyValid = mongoUser.activationKey === password;
          
          if (isKeyValid) {
            console.log(`Ключ активации совпадает для пользователя ${email}`);
            
            // Создаем JWT токен
            const token = jwt.sign(
              { id: mongoUser._id, email: mongoUser.email, role: 'user' },
              process.env.JWT_SECRET || 'vpn-super-secret-key-change-in-production',
              { expiresIn: '24h' }
            );
            
            // Обновляем время последнего входа
            mongoUser.lastLogin = Date.now();
            await mongoUser.save();
            
            // Отправляем токен и информацию о пользователе
            return res.json({
              success: true,
              token,
              user: {
                id: mongoUser._id,
                email: mongoUser.email,
                role: 'user'
              }
            });
          } else {
            console.log(`Неверный ключ активации для пользователя ${email}`);
            console.log(`Ожидаемый ключ: ${mongoUser.activationKey}, Полученный ключ: ${password}`);
            return res.status(401).json({ success: false, message: 'Неверный email или ключ активации' });
          }
        } else {
          console.log(`Пользователь с email ${email} не найден в MongoDB`);
        }
      } catch (mongoError) {
        console.error('Ошибка при поиске пользователя в MongoDB:', mongoError);
      }
      
      console.log(`Пользователь с email ${email} не найден нигде`);
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }
    
    console.log(`Пользователь найден в локальном массиве: ${user.email}, проверяем пароль`);
    
    // Проверка пароля (без bcrypt для демо-версии)
    const passwordMatch = user.password === password;
    
    console.log(`Результат проверки пароля: ${passwordMatch ? 'СОВПАДАЕТ' : 'НЕ СОВПАДАЕТ'}`);
    console.log(`Ожидаемый пароль: ${user.password}, Полученный пароль: ${password}`);
    
    if (!passwordMatch) {
      console.log(`Неверный пароль для пользователя ${email}`);
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }
    
    console.log(`Успешная авторизация пользователя ${email}`);
    
    // Создание JWT токена
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'vpn-super-secret-key-change-in-production',
      { expiresIn: '24h' }
    );
    
    // Отправка токена и информации о пользователе
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
};

// Получение информации о текущем пользователе
exports.me = (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Токен не предоставлен' });
    }
    
    // Верификация токена
    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'vpn-super-secret-key-change-in-production',
      (err, decoded) => {
        if (err) {
          return res.status(401).json({ message: 'Недействительный токен' });
        }
        
        // Поиск пользователя
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
          return res.status(404).json({ message: 'Пользователь не найден' });
        }
        
        // Отправка информации о пользователе
        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        });
      }
    );
  } catch (error) {
    console.error('Ошибка при получении информации о пользователе:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
}; 