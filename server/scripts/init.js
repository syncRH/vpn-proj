/**
 * Скрипт для инициализации системы и создания первого администратора
 * 
 * Использование:
 * node scripts/init.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Путь к моделям относительно корневой директории проекта
const Admin = require('../models/admin.model');

// Настройки администратора из .env
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service';

// Создание необходимых директорий
const createDirectories = async () => {
  const dirs = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../uploads/configs'),
    path.join(__dirname, '../logs')
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Директория ${dir} создана`);
      }
    } catch (error) {
      console.error(`Ошибка при создании директории ${dir}:`, error);
      throw error;
    }
  }
};

// Создание администратора
const createAdmin = async () => {
  try {
    // Проверяем, существует ли уже администратор
    const existingAdmin = await Admin.findOne({ username: ADMIN_USER });
    
    if (existingAdmin) {
      console.log(`Администратор с именем ${ADMIN_USER} уже существует.`);
      return;
    }
    
    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    
    // Создаем нового администратора
    const newAdmin = new Admin({
      username: ADMIN_USER,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'superadmin'
    });
    
    await newAdmin.save();
    
    console.log(`Администратор создан:
      Имя пользователя: ${ADMIN_USER}
      Email: ${ADMIN_EMAIL}
      Пароль: ${ADMIN_PASSWORD}
      
      ВНИМАНИЕ: Смените пароль после первого входа в систему!`);
  } catch (error) {
    console.error('Ошибка при создании администратора:', error);
    throw error;
  }
};

// Инициализация
const init = async () => {
  try {
    console.log('Начинаем инициализацию системы...');
    
    // Создаем необходимые директории
    await createDirectories();
    
    // Подключаемся к MongoDB
    console.log(`Подключение к MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Подключение к MongoDB установлено.');
    
    // Создаем администратора
    await createAdmin();
    
    console.log('Инициализация завершена успешно.');
    
    // Закрываем соединение с БД
    await mongoose.connection.close();
    console.log('Соединение с MongoDB закрыто.');
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при инициализации:', error);
    
    // Если соединение с БД было установлено, закрываем его
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
      console.log('Соединение с MongoDB закрыто.');
    }
    
    process.exit(1);
  }
};

// Запуск инициализации
init(); 