const { app, BrowserWindow, ipcMain, Menu, dialog, shell, Notification, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn, execFile, exec } = require('child_process');
const os = require('os');
const electron = require('electron');
const https = require('https');
const sudo = require('sudo-prompt');

// Инициализируем временное хранилище для авторизации (будет заменено на electron-store позже)
let authStateStore = {
  isAuthenticated: false,
  user: null,
  token: null,
  refreshToken: null
};

// Базовый URL для API
const isDevelopment = process.env.NODE_ENV === 'development';
const API_URL = isDevelopment 
  ? 'http://127.0.0.1:3000/api'  // Локальный адрес для разработки
  : 'http://45.147.178.200:3000/api'; // Боевой сервер для продакшена

// URL для скачивания OpenVPN
const OPENVPN_DOWNLOAD_URL = 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-amd64.msi';
const OPENVPN_INSTALLER_PATH = path.join(os.tmpdir(), 'openvpn-installer.msi');

// Глобальный идентификатор клиента для статистики подключений
let clientId = null;

let mainWindow;
let vpnProcess = null;
let isConnected = false;
let selectedServer = null;
let tray = null;
let authToken = null;
let activeConnections = 0;
let serverLoad = 0;

// Пути к файлам иконок
const ICON_DIR = path.join(__dirname, 'assets', 'icons');
const TRAY_ICON_PATH = path.join(ICON_DIR, 'tray-icon.png');
const TRAY_ICON_CONNECTED_PATH = path.join(ICON_DIR, 'tray-icon-connected.png');
const TRAY_ICON_DISCONNECTED_PATH = path.join(ICON_DIR, 'tray-icon-disconnected.png');
const TRAY_ICON_DEFAULT_PATH = path.join(ICON_DIR, 'tray-icon-default.png');

// Improved authentication state handling
let authState = {
  isAuthenticated: false,
  user: null,
  token: null,
  refreshToken: null
};

// Global variable to store server analytics
let serverAnalytics = [];

// Utility function for making API requests with retry logic and rate limit handling
async function makeApiRequest(config) {
  const { method = 'get', url, data, headers = {}, maxRetries = 3, baseDelay = 1000 } = config;
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      console.log(`Попытка запроса ${retries > 0 ? `(повтор ${retries}/${maxRetries})` : ''}: ${method.toUpperCase()} ${url}`);
      
      const requestConfig = {
        method,
        url,
        headers: {
          ...headers,
          // Add auth token if available and not already set
          ...(authToken && !headers['Authorization'] ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        timeout: 15000 // 15 seconds timeout
      };
      
      // Add data payload for POST/PUT requests
      if (data && (method === 'post' || method === 'put')) {
        requestConfig.data = data;
      }
      
      const response = await axios(requestConfig);
      return response;
    } catch (error) {
      if (error.response) {
        const { status, headers } = error.response;
        
        // If rate limited (429 error)
        if (status === 429) {
          retries++;
          
          if (retries > maxRetries) {
            console.error(`Превышено максимальное количество попыток (${maxRetries}) для ${url}`);
            throw error;
          }
          
          // Get retry-after header or use exponential backoff
          let retryDelay;
          if (headers && headers['retry-after']) {
            retryDelay = parseInt(headers['retry-after'], 10) * 1000;
            console.log(`Сервер запросил ожидание ${retryDelay/1000} секунд`);
          } else {
            // Exponential backoff with jitter
            retryDelay = baseDelay * Math.pow(2, retries) + Math.random() * 1000;
            console.log(`Применяем экспоненциальную задержку: ${Math.round(retryDelay/1000)} секунд`);
          }
          
          // Notify the renderer process about the rate limiting
          if (mainWindow) {
            mainWindow.webContents.send('api-rate-limited', { 
              retryDelay: Math.round(retryDelay/1000),
              retryCount: retries,
              maxRetries,
              endpoint: url
            });
          }
          
          console.log(`Слишком много запросов (429), ожидание ${Math.round(retryDelay/1000)} секунд...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        } 
        // If other server error that might be transient (500-range)
        else if (status >= 500 && status < 600 && retries < maxRetries) {
          retries++;
          const retryDelay = baseDelay * Math.pow(1.5, retries);
          console.log(`Ошибка сервера (${status}), повтор через ${Math.round(retryDelay/1000)} секунд...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
      
      // If network error or request timeout, retry with backoff
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || !error.response) {
        retries++;
        if (retries <= maxRetries) {
          const retryDelay = baseDelay * Math.pow(2, retries);
          console.log(`Проблема с сетью, повтор через ${Math.round(retryDelay/1000)} секунд...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
      
      // If we've reached here, it's a non-recoverable error
      throw error;
    }
  }
  
  throw new Error(`Превышено максимальное количество попыток (${maxRetries})`);
}

// Load auth state from storage on startup
async function loadAuthState() {
  try {
    const Store = (await import('electron-store')).default;
    const store = new Store({
      name: 'vpn-client-preferences',
      encryptionKey: 'your-encryption-key', // Замените на реальный ключ шифрования
      defaults: {
        authState: {
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null
        }
      }
    });

    const savedState = store.get('authState');
    if (savedState) {
      console.log('Loaded saved authentication state');
      authState = savedState;
      return true;
    }
  } catch (error) {
    console.error('Failed to load authentication state:', error);
  }
  return false;
}

// Save auth state to storage
async function saveAuthState() {
  try {
    const Store = (await import('electron-store')).default;
    const store = new Store({
      name: 'vpn-client-preferences',
      encryptionKey: 'your-encryption-key'
    });

    store.set('authState', authState);
    console.log('Saved authentication state');
  } catch (error) {
    console.error('Failed to save authentication state:', error);
  }
}

// Clear auth state
async function clearAuthState() {
  authState = {
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null
  };
  try {
    const Store = (await import('electron-store')).default;
    const store = new Store({
      name: 'vpn-client-preferences',
      encryptionKey: 'your-encryption-key'
    });

    store.delete('authState');
    console.log('Cleared authentication state');
  } catch (error) {
    console.error('Failed to clear authentication state:', error);
  }
}

// Загрузка сохраненного токена при запуске
function loadSavedAuthToken() {
  try {
    const tokenPath = path.join(app.getPath('userData'), 'auth.json');
    
    if (fs.existsSync(tokenPath)) {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      if (data && data.token) {
        console.log('Загружен сохраненный токен авторизации');
        authToken = data.token;
        return true;
      }
    }
    
    console.log('Сохраненный токен авторизации не найден');
    return false;
  } catch (error) {
    console.error('Ошибка при загрузке токена авторизации:', error);
    return false;
  }
}

// Проверка, запущено ли приложение с правами администратора
function isRunAsAdmin() {
  if (process.platform !== 'win32') {
    return Promise.resolve(true); // На не-Windows платформах всегда возвращаем true
  }
  
  return new Promise((resolve) => {
    exec('net session', (error, stdout, stderr) => {
      if (error) {
        console.log('Приложение запущено БЕЗ прав администратора');
        resolve(false);
      } else {
        console.log('Приложение запущено С правами администратора');
        resolve(true);
      }
    });
  });
}

// Перезапуск приложения с правами администратора
function restartAsAdmin() {
  if (process.platform !== 'win32') {
    return; // Функция актуальна только для Windows
  }
  
  const appPath = process.execPath;
  const args = process.argv.slice(1);
  
  console.log('Перезапуск с правами администратора');
  console.log('Путь:', appPath);
  console.log('Аргументы:', args);
  
  const options = {
    type: 'info',
    title: 'Требуются права администратора',
    message: 'Для корректной работы VPN требуются права администратора. Приложение будет перезапущено.',
    buttons: ['OK']
  };
  
  dialog.showMessageBox(options).then(() => {
    const elevated = spawn('powershell.exe', [
      '-Command', 
      `Start-Process -FilePath "${appPath}" -ArgumentList "${args.join(' ')}" -Verb RunAs`
    ], { detached: true });
    
    elevated.on('error', (err) => {
      console.error('Ошибка при повышении прав:', err);
      dialog.showErrorBox('Ошибка', 'Не удалось запустить приложение с правами администратора.');
    });
    
    elevated.on('exit', () => {
      app.quit();
    });
    
    elevated.unref();
  });
}

// Регистрация приложения для автозапуска
function setAutoLaunch(enable) {
  if (process.platform !== 'win32') {
    return Promise.resolve(false); // Поддерживается только на Windows
  }
  
  const appPath = process.execPath;
  const appName = 'BeNiceVPN';
  const regCommand = enable
    ? `REG ADD HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /f /v ${appName} /t REG_SZ /d "${appPath}"`
    : `REG DELETE HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /f /v ${appName}`;
  
  return new Promise((resolve) => {
    exec(regCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Ошибка при настройке автозапуска:', error);
        resolve(false);
      } else {
        console.log(enable ? 'Автозапуск включен' : 'Автозапуск отключен');
        resolve(true);
      }
    });
  });
}

// Проверка, включен ли автозапуск
function checkAutoLaunchEnabled() {
  if (process.platform !== 'win32') {
    return Promise.resolve(false); // Поддерживается только на Windows
  }
  
  const appName = 'BeNiceVPN';
  const regCommand = `REG QUERY HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /v ${appName}`;
  
  return new Promise((resolve) => {
    exec(regCommand, (error, stdout, stderr) => {
      if (error) {
        // Запись отсутствует
        resolve(false);
      } else {
        // Запись найдена
        resolve(true);
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    resizable: false,
    transparent: false,
    show: false, // Окно скрыто при запуске
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icons/icon.png')
  });

  // Центрирование окна
  mainWindow.center();

  // Добавляем обработчик загрузки страницы
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Страница загружена полностью');
    
    // Проверка доступности API
    mainWindow.webContents.executeJavaScript(`
      console.log('Проверка API из основного процесса: vpnAPI определен =', !!window.vpnAPI);
      if (window.vpnAPI) {
        console.log('Доступные методы API:', Object.keys(window.vpnAPI).join(', '));
      } else {
        console.error('ОШИБКА: window.vpnAPI не определен в рендерер процессе!');
      }
    `).catch(err => {
      console.error('Ошибка при выполнении проверки API:', err);
    });
    
    // Проверяем наличие OpenVPN при загрузке приложения
    checkAndInstallOpenVPN();
    
    // Показываем окно после загрузки
    mainWindow.show();
  });

  // Скрываем приложение в трей при закрытии окна
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  // Отключаем меню в production режиме
  if (process.env.NODE_ENV !== 'development') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Меню приложения
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Настройки',
          click: () => mainWindow.webContents.send('open-settings')
        },
        { type: 'separator' },
        {
          label: 'Выход',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Помощь',
      submenu: [
        {
          label: 'О программе',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'О программе',
              message: 'BeNice VPN v1.0.0',
              detail: 'Приложение для подключения к VPN серверам.\nРазработано BeNice Games.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Открыть Dev Tools в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Создание системного трея
function createTray() {
  try {
    console.log('Создание системного трея...');
    
    // Создаем пустую иконку
    let trayIcon = nativeImage.createEmpty();
    
    try {
      // Вместо загрузки из файла создаем иконку программно
      const defaultIcon = nativeImage.createFromBuffer(
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAE3SURBVHjaYvz//z8DJYCJgUIwdAxgYWBgYNiwfv3/P79/M/z984cBxGeEsP/++cMQFRPDwMTExPD161cGf39/RqK8sGH9+v9z58xh+PnzJwMrKysDCwsLAxMTE8Pfv38ZPn36RJwXfv/+zfD48WOGjx8/MvDw8DDw8/Mz8PPzM3z79o1hxYoVDH/+/CHOBf///2dYuXIlQ05ODkNQUBCDlJQUw9evXxnWrl3LsGfPHoafP38SH4iwAP/37x/DixcvGNatW8fw4cMHop3GCPPCnz9/cPK3bt3KMGvWLOI0g1xQUVHBIC8vj9cF9+/fZ8jMzCROMyMsc0RGRuI0/MOHD6SlaFZWVoaAgACsBjx//pyhvb2dNM0gF3BxcTHw8vIyXLt2jYGZmZk0zTBQXl7OwMbGRl6WYBwNRIoBGADMIUp+zQZI9QAAAABJRU5ErkJggg==', 'base64')
      );
      trayIcon = defaultIcon;
      console.log('Создана иконка трея программно');
    } catch (iconError) {
      console.error('Ошибка при создании иконки трея:', iconError);
      console.log('Создание пустой иконки для трея...');
    }
    
    // Создаем объект трея с настроенной иконкой
    tray = new Tray(trayIcon);
    tray.setToolTip('BeNice VPN');
    console.log('Объект трея создан');
    
    // Обновляем меню и иконку трея
    updateTrayMenu();
    updateTrayIcon();
    
    // Обработчики событий трея
    tray.on('click', () => {
      if (mainWindow) {
        // Если окно существует, показываем его и выводим на передний план
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    });
    
    tray.on('right-click', () => {
      // Открываем контекстное меню при правом клике
      tray.popUpContextMenu();
    });
    
    console.log('Трей успешно инициализирован');
    return true;
  } catch (error) {
    console.error('Ошибка при создании трея:', error);
    return false;
  }
}

// Обновление меню в трее
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Открыть BeNice VPN', 
      click: () => {
        mainWindow.show();
      }
    },
    { 
      label: 'Статус', 
      submenu: [
        { 
          label: isConnected ? 'Подключено' : 'Отключено',
          enabled: false
        },
        { type: 'separator' },
        { 
          label: 'Отключиться', 
          enabled: isConnected,
          click: () => {
            if (isConnected) {
              disconnectVPN();
              // Обновляем меню трея
              updateTrayMenu();
            }
          }
        }
      ]
    },
    { type: 'separator' },
    { 
      label: 'Выход', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Обновляем иконку трея в зависимости от статуса подключения
  updateTrayIcon();
  
  // Меняем иконку в зависимости от статуса подключения
  // Так как у нас могут отсутствовать иконки, делаем это безопасно
  try {
    if (isConnected) {
      tray.setToolTip('BeNice VPN - Подключено');
    } else {
      tray.setToolTip('BeNice VPN - Отключено');
    }
  } catch (error) {
    console.error('Ошибка при обновлении иконки трея:', error);
  }
}

// При запуске приложения
app.whenReady().then(async () => {
  console.log('Очищаем кэш сессии...');
  await electron.session.defaultSession.clearCache();
  console.log('Кэш очищен успешно');
  
  // Инициализируем уникальный ID клиента
  await initializeClientId();
  
  // Загружаем сохраненный токен авторизации, если он есть
  loadSavedAuthToken();
  
  // Временно отключаем проверку прав администратора для тестирования
  // const isAdmin = await isRunAsAdmin();
  // 
  // if (!isAdmin) {
  //   // Предупреждаем и перезапускаем с правами администратора
  //   restartAsAdmin();
  //   return;
  // }
  
  // Включаем автозапуск
  // await setAutoLaunch(true);
  
  // Создаем трей
  createTray();
  
  // Создаем окно приложения
  createWindow();
  
  // Запускаем обновления аналитики серверов
  startAnalyticsUpdates();
  
  // Обработчик активации приложения (например, клик по иконке)
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    app.quit();
  }
});

// При завершении приложения отключаем VPN (если подключен)
app.on('before-quit', async () => {
  if (isConnected && vpnProcess) {
    try {
      disconnectVPN();
    } catch (error) {
      console.error('Ошибка при отключении VPN:', error);
    }
  }
});

// Обновление иконки трея в зависимости от статуса подключения
function updateTrayIcon() {
  if (!tray) return;
  
  try {
    // Используем реальные файлы иконок
    if (isConnected) {
      // Подключено - зеленая иконка
      console.log('VPN подключен, устанавливаем иконку активного соединения');
      try {
        if (fs.existsSync(TRAY_ICON_CONNECTED_PATH)) {
          const connectedIcon = nativeImage.createFromPath(TRAY_ICON_CONNECTED_PATH);
          tray.setImage(connectedIcon);
          console.log('Установлена иконка активного VPN');
        } else {
          console.error('Файл иконки не найден:', TRAY_ICON_CONNECTED_PATH);
          // Используем стандартную иконку
          const defaultIcon = nativeImage.createFromPath(TRAY_ICON_DEFAULT_PATH);
          tray.setImage(defaultIcon);
        }
      } catch (err) {
        console.error('Ошибка при установке иконки активного состояния:', err);
        // Используем стандартную иконку
        const defaultIcon = nativeImage.createFromPath(TRAY_ICON_DEFAULT_PATH);
        tray.setImage(defaultIcon);
      }
    } else {
      // Отключено - красная иконка
      console.log('VPN отключен, устанавливаем иконку неактивного соединения');
      try {
        if (fs.existsSync(TRAY_ICON_DISCONNECTED_PATH)) {
          const disconnectedIcon = nativeImage.createFromPath(TRAY_ICON_DISCONNECTED_PATH);
          tray.setImage(disconnectedIcon);
          console.log('Установлена иконка неактивного VPN');
        } else {
          console.error('Файл иконки не найден:', TRAY_ICON_DISCONNECTED_PATH);
          // Используем стандартную иконку
          const defaultIcon = nativeImage.createFromPath(TRAY_ICON_DEFAULT_PATH);
          tray.setImage(defaultIcon);
        }
      } catch (err) {
        console.error('Ошибка при загрузке иконки неактивного состояния:', err);
        // Используем стандартную иконку
        const defaultIcon = nativeImage.createFromPath(TRAY_ICON_DEFAULT_PATH);
        tray.setImage(defaultIcon);
      }
    }
  } catch (err) {
    console.error('Общая ошибка при обновлении иконки трея:', err);
    // В случае ошибки пробуем установить стандартную иконку
    try {
      const defaultIcon = nativeImage.createFromPath(TRAY_ICON_DEFAULT_PATH);
      tray.setImage(defaultIcon);
    } catch (fallbackError) {
      console.error('Критическая ошибка при установке иконки трея:', fallbackError);
    }
  }
}

// Function to verify VPN connection by pinging a remote server
async function verifyVpnConnection() {
  try {
    console.log('Проверка реального статуса VPN-соединения...');
    
    // Use ping to test connection to a reliable server (like Google's DNS)
    const pingTarget = '8.8.8.8'; // Google's DNS server
    
    return new Promise((resolve) => {
      const pingProcess = spawn(
        'ping', 
        ['-n', '2', pingTarget], // -n 2: send 2 packets (Windows command)
        { windowsHide: true }
      );
      
      let pingOutput = '';
      let pingSuccess = false;
      
      pingProcess.stdout.on('data', (data) => {
        // Convert buffer to string, handling potential encoding issues
        try {
          const output = data.toString('utf8');
          pingOutput += output;
          
          // Check for successful ping reply regardless of language
          // Looking for common patterns in ping output that indicate success
          if (output.includes('Reply from') || 
              output.includes('bytes from') || 
              output.includes('TTL=') || 
              output.includes('time=')) {
            pingSuccess = true;
          }
        } catch (encodingError) {
          console.error('Ошибка кодировки при обработке вывода ping:', encodingError);
          // Try alternative encoding or raw check
          const rawOutput = data.toString('binary');
          if (rawOutput.includes('TTL=') || rawOutput.includes('time=')) {
            pingSuccess = true;
          }
        }
      });
      
      pingProcess.on('error', (error) => {
        console.error('Ошибка при проверке соединения:', error);
        resolve(false);
      });
      
      pingProcess.on('close', (code) => {
        console.log(`Результат проверки соединения: ${pingSuccess ? 'успешно' : 'неудачно'} (код ${code})`);
        
        // Code 0 typically means success even if our string parsing failed
        if (code === 0) {
          pingSuccess = true;
        }
        
        resolve(pingSuccess);
      });
    });
  } catch (error) {
    console.error('Ошибка при проверке VPN-соединения:', error);
    return false;
  }
}

// Enhanced connection status update function that verifies actual connectivity
async function updateConnectionStatusWithValidation(connected, server) {
  try {
    console.log(`Обновление статуса подключения: ${connected ? 'подключено' : 'отключено'}`);
    
    // Update internal state first
    isConnected = connected;
    selectedServer = connected ? server : null;
    
    // If we're supposedly connected, verify it's actually working
    if (connected) {
      console.log('Выполняем проверку реального соединения...');
      
      // Wait a moment for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the connection is actually working
      const isReallyConnected = await verifyVpnConnection();
      
      if (!isReallyConnected) {
        console.error('ПРЕДУПРЕЖДЕНИЕ: VPN показывает как подключенный, но соединение не работает!');
        
        // Notify the user that the connection isn't working properly
        if (mainWindow) {
          mainWindow.webContents.send('vpn-connection-problem', {
            message: 'VPN подключение установлено, но интернет не работает. Проверьте настройки сети.'
          });
        }
        
        // You could attempt reconnection here or show options to the user
      } else {
        console.log('Проверка соединения успешна, VPN работает корректно.');
        
        // Notify the renderer about successful connection
        if (mainWindow) {
          mainWindow.webContents.send('vpn-connection-verified', {
            server: selectedServer
          });
        }
      }
    }
    
    // Update tray icon and menu regardless of verification result
    updateTrayIcon();
    updateTrayMenu();
    
    return {
      success: true,
      verified: connected ? await verifyVpnConnection() : true // Always true when disconnected
    };
  } catch (error) {
    console.error('Ошибка при обновлении и проверке статуса подключения:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Обновляем функцию updateConnectionStatus чтобы она вызывала обновление иконки
function updateConnectionStatus(connected, server) {
  isConnected = connected;
  selectedServer = connected ? server : null;
  
  // Обновляем иконку трея
  updateTrayIcon();
  
  // Обновляем меню трея
  updateTrayMenu();
}

// Функция для проверки наличия OpenVPN
function checkOpenVPNInstalled() {
  console.log('Проверка наличия OpenVPN...');
  
  // Windows
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
      path.join(os.homedir(), 'OpenVPN\\bin\\openvpn.exe')
    ];
    
    for (const openVPNPath of possiblePaths) {
      try {
        console.log(`Проверка пути: ${openVPNPath}`);
        if (fs.existsSync(openVPNPath)) {
          console.log('OpenVPN найден по пути:', openVPNPath);
          return true;
        }
      } catch (err) {
        console.error(`Ошибка при проверке пути ${openVPNPath}:`, err);
      }
    }
    console.log('OpenVPN не найден в стандартных директориях');
    return false;
  }
  
  // Заглушки для других платформ
  return false;
}

// Функция для проверки и установки OpenVPN
async function checkAndInstallOpenVPN() {
  try {
    console.log('Проверка наличия OpenVPN...');
    const isInstalled = checkOpenVPNInstalled();
    
    if (!isInstalled) {
      console.log('OpenVPN не найден. Предлагаем установить...');
      
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'OpenVPN не установлен',
        message: 'Для работы VPN требуется установить OpenVPN',
        detail: 'Хотите перейти на сайт OpenVPN для скачивания?',
        buttons: ['Открыть сайт', 'Отмена'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (response.response === 0) {
        // Вместо автоматической установки открываем браузер
        await shell.openExternal('https://openvpn.net/community-downloads/');
        
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Установка OpenVPN',
          message: 'После установки OpenVPN перезапустите приложение',
          detail: 'Для работы VPN-клиента требуется установить OpenVPN и перезапустить приложение после установки.'
        });
      } else {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'OpenVPN требуется',
          message: 'VPN не будет работать без установленного OpenVPN',
          detail: 'Вы можете установить его позже через настройки приложения.'
        });
      }
      return false;
    } else {
      console.log('OpenVPN уже установлен.');
      return true;
    }
  } catch (error) {
    console.error('Ошибка при проверке/установке OpenVPN:', error);
    return false;
  }
}

// Функция для получения списка серверов
async function getServerList() {
  console.log('Запрос списка серверов...');
  
  try {
    // Используем нашу функцию makeApiRequest с поддержкой повторных попыток
    const response = await makeApiRequest({
      method: 'get',
      url: `${API_URL}/servers`,
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
      maxRetries: 2, // Максимум 2 повторные попытки
      baseDelay: 1000 // Начальная задержка 1 секунда
    });
    
    // Проверяем формат ответа и извлекаем список серверов
    let serverList = [];
    if (response.data) {
      if (Array.isArray(response.data)) {
        // Если ответ уже массив
        serverList = response.data;
      } else if (response.data.servers && Array.isArray(response.data.servers)) {
        // Если ответ в формате {servers: [...]}
        serverList = response.data.servers;
      }
    }
    
    console.log(`Получено ${serverList.length} серверов от API`);
    
    // Возвращаем список серверов
    return { 
      success: true,
      servers: serverList 
    };
  } catch (error) {
    console.error(`Ошибка при получении серверов: ${error.message}`);
    
    // Проверяем статус код ошибки для определения типа проблемы
    if (error.response) {
      const statusCode = error.response.status;
      console.error(`Статус код ответа: ${statusCode}`);
      
      if (statusCode === 401) {
        console.error('Ошибка авторизации: требуется авторизация');
        
        // Уведомляем окно об ошибке авторизации
        if (mainWindow) {
          mainWindow.webContents.send('auth-required', { 
            message: 'Требуется авторизация для получения списка серверов' 
          });
        }
        
        return { 
          success: false, 
          authRequired: true, 
          error: 'Требуется авторизация' 
        };
      } else if (statusCode === 429) {
        return {
          success: false,
          error: 'Слишком много запросов, попробуйте позже',
          retryAfter: error.response.headers['retry-after'] || 60
        };
      }
      
      // Детали ответа сервера при других ошибках
      console.error('Детали ошибки:', error.response.data);
    }
    
    // Возвращаем пустой список при ошибке
    return { success: false, servers: [], error: error.message };
  }
}

// Функция возвращает запасной список серверов на случай ошибок API
function getFallbackServers() {
  console.log('Использование запасного списка серверов');
  return [
    {
      _id: 'server1',
      name: 'Основной сервер',
      host: '127.0.0.1',
      port: 1194,
      country: 'Россия',
      city: 'Москва',
      status: 'active',
      protocol: 'udp',
      isRecommended: true
    },
    {
      _id: 'server2',
      name: 'Запасной сервер',
      host: '127.0.0.1',
      port: 1194,
      country: 'Россия', 
      city: 'Санкт-Петербург',
      status: 'active',
      protocol: 'tcp',
      isRecommended: false
    }
  ];
}

// Function to fetch and update server analytics data
async function updateServerAnalytics() {
  try {
    if (!authToken) {
      console.log('No authentication token, skipping analytics update');
      return { success: false };
    }
    
    // Prepare request headers with authorization
    const headers = {
      'Authorization': `Bearer ${authToken}`
    };
    
    // Fetch server analytics data from API
    const response = await axios.get(`${API_URL}/servers/analytics`, { headers });
    
    if (response.data && response.data.servers) {
      console.log(`Received analytics for ${response.data.servers.length} servers`);
      
      // Store server analytics data for load balancing
      serverAnalytics = response.data.servers.map(server => {
        return {
          id: server._id,
          name: server.name,
          activeConnections: server.activeConnections || 0,
          maxConnections: server.maxConnections || 100,
          load: server.load || Math.floor((server.activeConnections || 0) * 100 / (server.maxConnections || 100))
        };
      });
      
      // Notify the renderer process about updated analytics
      if (mainWindow) {
        mainWindow.webContents.send('server-analytics-updated', serverAnalytics);
      }
      
      return { success: true, analytics: serverAnalytics };
    }
    
    return { success: false, message: 'Invalid response format' };
  } catch (error) {
    console.error('Failed to update server analytics:', error.message);
    return { success: false, error: error.message };
  }
}

// Start server analytics update interval
let analyticsInterval = null;
function startAnalyticsUpdates() {
  // Clear existing interval if any
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
  }
  
  // Update immediately
  updateServerAnalytics();
  
  // Then update every 30 seconds
  analyticsInterval = setInterval(updateServerAnalytics, 30000);
}

// Function to find the optimal server based on load and latency
async function getOptimalServer() {
  try {
    // First try to get fresh analytics data
    await updateServerAnalytics();
    
    // If we have analytics data, use it to find the best server
    if (serverAnalytics && serverAnalytics.length > 0) {
      // Находим минимальную загрузку
      const minLoad = Math.min(...serverAnalytics.map(s => s.load));
      // Фильтруем серверы с минимальной загрузкой
      let minLoadServers = serverAnalytics.filter(s => s.load === minLoad);
      // Если среди них есть рекомендуемые — выбираем только их
      const recommended = minLoadServers.filter(s => s.isRecommended);
      if (recommended.length > 0) minLoadServers = recommended;
      // Случайный выбор среди подходящих
      const chosen = minLoadServers[Math.floor(Math.random() * minLoadServers.length)];
      console.log('Server load distribution:');
      serverAnalytics.forEach(server => {
        console.log(`- ${server.name}: ${server.load}% (${server.activeConnections}/${server.maxConnections} connections)`);
      });
      return chosen;
    }
    
    // Fallback to getting the server list and choosing one with random load
    const serversResponse = await getServerList();
    
    if (serversResponse.servers && serversResponse.servers.length > 0) {
      // Since we don't have real load data, use a round-robin approach
      // by picking a random server from the list
      const randomIndex = Math.floor(Math.random() * serversResponse.servers.length);
      return {
        id: serversResponse.servers[randomIndex]._id,
        name: serversResponse.servers[randomIndex].name
      };
    }
    
    throw new Error('No available servers');
  } catch (error) {
    console.error('Error finding optimal server:', error);
    throw error;
  }
}

// Automatic server selection based on load balancing
ipcMain.handle('auto-select-server', async () => {
  try {
    const optimalServer = await getOptimalServer();
    console.log(`Auto-selected optimal server: ${optimalServer.name}`);
    return { success: true, serverId: optimalServer.id, serverName: optimalServer.name };
  } catch (error) {
    console.error('Failed to auto-select server:', error);
    return { success: false, error: error.message };
  }
});

// Функция для автоматического выбора оптимального сервера
async function findOptimalServer() {
  try {
    console.log('Запрашиваем список серверов для автоматического выбора...');
    
    // Получаем список серверов
    const response = await axios.get(`${API_URL}/servers`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    if (response.status !== 200 || !response.data || !Array.isArray(response.data)) {
      console.error('Ошибка при получении списка серверов для автовыбора:', response.status);
      return { success: false, error: 'Не удалось получить список серверов' };
    }
    
    const servers = response.data;
    
    // Фильтруем только доступные серверы
    const availableServers = servers.filter(server => server.available !== false);
    
    if (availableServers.length === 0) {
      console.log('Нет доступных серверов для автоматического выбора');
      return { 
        success: false, 
        error: 'Нет доступных серверов',
        servers: servers // Возвращаем все серверы для информации
      };
    }
    
    try {
      // Запрашиваем аналитику по нагрузке серверов
      const analyticsResponse = await axios.get(`${API_URL}/servers/analytics`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      
      if (analyticsResponse.status === 200 && analyticsResponse.data) {
        const analytics = analyticsResponse.data;
        
        // Объединяем данные серверов с аналитикой
        const serversWithAnalytics = availableServers.map(server => {
          const serverAnalytics = analytics.find(a => a.id === server._id);
          if (serverAnalytics) {
            return {
              ...server,
              activeConnections: serverAnalytics.activeConnections || 0,
              maxConnections: serverAnalytics.maxConnections || 100,
              load: serverAnalytics.load || 0
            };
          }
          // Если данных нет, предполагаем нагрузку 0
          return {
            ...server,
            activeConnections: 0,
            maxConnections: 100,
            load: 0
          };
        });
        
        // Сортируем серверы по нагрузке (от низкой к высокой)
        serversWithAnalytics.sort((a, b) => {
          // Если один из серверов рекомендуемый, отдаем ему приоритет
          if (a.isRecommended && !b.isRecommended) return -1;
          if (!a.isRecommended && b.isRecommended) return 1;
          
          // Иначе сортировка по нагрузке
          return (a.load || 0) - (b.load || 0);
        });
        
        // Выбираем сервер с наименьшей нагрузкой
        const optimalServer = serversWithAnalytics[0];
        
        console.log(`Автоматически выбран оптимальный сервер: ${optimalServer.name}, нагрузка: ${optimalServer.load}%`);
        
        return {
          success: true,
          serverId: optimalServer._id,
          server: optimalServer
        };
      }
    } catch (analyticsError) {
      console.error('Ошибка при получении аналитики серверов:', analyticsError);
    }
    
    // Если не удалось получить аналитику, выбираем случайный сервер из доступных
    const randomIndex = Math.floor(Math.random() * availableServers.length);
    const randomServer = availableServers[randomIndex];
    
    console.log(`Выбран случайный доступный сервер (аналитика недоступна): ${randomServer.name}`);
    
    return {
      success: true,
      serverId: randomServer._id,
      server: randomServer
    };
    
  } catch (error) {
    console.error('Ошибка при поиске оптимального сервера:', error);
    return { 
      success: false, 
      error: `Ошибка при выборе сервера: ${error.message || 'Неизвестная ошибка'}` 
    };
  }
}

// Функция для обновления статистики подключения
async function updateServerConnectionStatus(serverId, status) {
  try {
    if (!serverId || !status) {
      console.error('Не указан ID сервера или статус подключения');
      return { success: false, error: 'Недостаточно данных' };
    }
    
    console.log(`Обновление статистики подключения для сервера ${serverId}: ${status}`);
    
    // Normalize server ID
    let serverIdString = serverId;
    if (typeof serverId === 'object' && serverId._id) {
      serverIdString = serverId._id;
    }
    
    // Send request to update connection statistics with retry logic
    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    
    while (retries <= maxRetries) {
      try {
        const response = await axios.post(`${API_URL}/servers/analytics/update`, {
          serverId: serverIdString,
          status: status, // 'connected' or 'disconnected'
          clientId: clientId
        }, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5 second timeout
        });
        
        if (response.status === 200) {
          console.log('Статистика успешно обновлена');
          return { success: true };
        } else {
          console.error('Ошибка при обновлении статистики:', response.status, response.data);
          return { 
            success: false, 
            error: `Ошибка сервера: ${response.status}` 
          };
        }
      } catch (error) {
        retries++;
        
        // Check if we should retry
        if (retries <= maxRetries) {
          const retryDelay = baseDelay * Math.pow(2, retries) + Math.random() * 1000;
          console.log(`Ошибка при обновлении статуса соединения (попытка ${retries}/${maxRetries}). Повтор через ${Math.round(retryDelay/1000)} сек...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // If it's a server error (404, etc), log it but don't fail the connection
        if (error.response) {
          console.error(`Ошибка API при обновлении статуса соединения (${error.response.status}): ${error.message}`);
          // For 404 errors, make a note that we should implement the endpoint
          if (error.response.status === 404) {
            console.warn('Эндпоинт /api/servers/analytics/update не найден на сервере. Убедитесь, что API обновлен до последней версии.');
          }
          // Return partial success - we don't want to fail the connection just because stats updates failed
          return { 
            success: true, 
            warning: `Не удалось обновить статистику: ${error.message}`,
            serverError: error.response.status
          };
        }
        
        // Network errors shouldn't fail the connection
        console.error('Ошибка сети при обновлении статистики подключения:', error);
        return { 
          success: true, 
          warning: 'Не удалось обновить статистику из-за проблем с сетью' 
        };
      }
    }
    
    // If we've exhausted all retries
    return { 
      success: true, 
      warning: `Не удалось обновить статистику после ${maxRetries} попыток, но соединение работает` 
    };
  } catch (error) {
    console.error('Необработанная ошибка при обновлении статистики подключения:', error);
    // Don't let statistics errors affect the connection
    return { 
      success: true, 
      error: `Ошибка: ${error.message || 'Неизвестная ошибка'}`,
      critical: false
    };
  }
}

// Функция для получения аналитики серверов
async function getServerAnalytics() {
  try {
    console.log('Запрос аналитики серверов...');
    
    const response = await axios.get(`${API_URL}/servers/analytics`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    if (response.status === 200) {
      console.log('Успешно получены данные аналитики серверов');
      return { 
        success: true, 
        analytics: response.data
      };
    } else {
      console.error('Ошибка при запросе аналитики серверов:', response.status);
      return { 
        success: false, 
        error: `Ошибка сервера: ${response.status}` 
      };
    }
  } catch (error) {
    console.error('Не удалось получить аналитику серверов:', error);
    return { 
      success: false, 
      error: `Ошибка при запросе аналитики: ${error.message || 'Неизвестная ошибка'}` 
    };
  }
}

// Function for downloading VPN configuration with improved rate limiting handling
async function downloadVPNConfig(serverId, configType) {
  try {
    console.log(`Запрос на скачивание конфигурации: ${serverId}, тип: ${configType}`);
    
    // Проверяем наличие необходимых параметров
    if (!serverId || !configType) {
      console.error('Ошибка: Не указан ID сервера или тип конфигурации');
      return { 
        success: false, 
        error: 'Не указан ID сервера или тип конфигурации' 
      };
    }
    
    // Преобразуем serverId в строку, если это объект
    let serverIdStr = serverId;
    if (typeof serverId === 'object') {
      serverIdStr = serverId._id || serverId.id;
      if (!serverIdStr) {
        console.error('Ошибка: serverId не содержит _id или id');
        return {
          success: false,
          error: 'Некорректный ID сервера для скачивания конфигурации'
        };
      }
      console.log('Преобразован ID сервера из объекта в строку:', serverIdStr);
    }
    
    // Проверяем авторизацию
    if (!authToken) {
      console.error('Ошибка: Отсутствует токен авторизации');
      return { 
        success: false, 
        error: 'Требуется авторизация для скачивания конфигурации' 
      };
    }
    
    // Выбираем правильный URL эндпоинта на основе типа конфигурации
    let endpointSuffix;
    let configFileSuffix;
    
    if (configType === 'fullVpn') {
      endpointSuffix = 'vpn-config';
      configFileSuffix = 'fullVpn';
    } else if (configType === 'antizapret') {
      endpointSuffix = 'antizapret-config';
      configFileSuffix = 'antizapret';
    } else {
      console.error(`Неизвестный тип конфигурации: ${configType}`);
      return {
        success: false,
        error: `Неизвестный тип конфигурации: ${configType}`
      };
    }
    
    console.log(`Скачивание конфигурации для сервера ${serverIdStr}, тип: ${configType}`);
    
    // Формируем URL для запроса конфигурации
    const configUrl = `${API_URL}/servers/${serverIdStr}/${endpointSuffix}`;

    // Проверка локального кэша конфигураций
    const configDir = path.join(app.getPath('userData'), 'configs');
    const cachedConfigFilename = `${serverIdStr}_${configFileSuffix}.ovpn`;
    const cachedConfigPath = path.join(configDir, cachedConfigFilename);
    
    // Проверяем наличие локального кэша конфигурации
    try {
      if (fs.existsSync(configDir) && fs.existsSync(cachedConfigPath)) {
        // Проверяем время последнего изменения файла
        const stats = fs.statSync(cachedConfigPath);
        const fileModTime = new Date(stats.mtime);
        const now = new Date();
        const fileAgeHours = (now - fileModTime) / (1000 * 60 * 60);
        
        // Если файл был создан менее 24 часов назад, используем кэшированный файл
        if (fileAgeHours < 24) {
          console.log(`Используем кэшированную конфигурацию (возраст: ${Math.round(fileAgeHours)} часов): ${cachedConfigPath}`);
          return {
            success: true,
            configPath: cachedConfigPath,
            configFileName: cachedConfigFilename,
            fromCache: true
          };
        } else {
          console.log(`Кэшированная конфигурация устарела (${Math.round(fileAgeHours)} часов), загружаем новую`);
        }
      }
    } catch (cacheError) {
      console.error('Ошибка при проверке кэша конфигурации:', cacheError);
      // Продолжаем загрузку с сервера при ошибке проверки кэша
    }
    
    // Добавляем механизм задержки и повтора при ошибках
    const maxRetries = 3;
    let retryCount = 0;
    let retryDelay = 2000; // Начальная задержка 2 секунды
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`Попытка загрузки конфигурации ${retryCount > 0 ? `(попытка ${retryCount}/${maxRetries})` : ''}: ${configUrl}`);
        
        // Отправляем запрос на получение конфигурации с более долгим таймаутом
        const response = await axios.get(configUrl, {
          headers: {
            Authorization: `Bearer ${authToken}`
          },
          responseType: 'text',
          timeout: 10000 // 10 seconds timeout
        });
        
        if (response.status !== 200) {
          throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        // Получаем содержимое файла конфигурации
        const configContent = response.data;
        
        // Создаем папку для конфигураций, если её нет
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
          console.log('Создана директория для конфигураций:', configDir);
        }
        
        // Сохраняем файл конфигурации
        fs.writeFileSync(cachedConfigPath, configContent, 'utf8');
        console.log('Конфигурация успешно сохранена:', cachedConfigPath);
        
        return {
          success: true,
          configPath: cachedConfigPath,
          configFileName: cachedConfigFilename
        };
      } catch (error) {
        retryCount++;
        
        // Обработка ошибки превышения лимита запросов (429)
        if (error.response && error.response.status === 429) {
          // Определяем время ожидания из заголовка Retry-After или используем экспоненциальную задержку
          let waitTime;
          if (error.response.headers && error.response.headers['retry-after']) {
            waitTime = parseInt(error.response.headers['retry-after'], 10) * 1000;
          } else {
            waitTime = retryDelay * Math.pow(2, retryCount - 1); // Экспоненциальное увеличение задержки
          }
          
          console.log(`Сервер ограничивает запросы (429). Ожидание ${Math.round(waitTime/1000)} секунд...`);
          
          // Показываем уведомление пользователю
          if (mainWindow) {
            mainWindow.webContents.send('rate-limit-warning', {
              message: `Слишком много запросов. Повторная попытка через ${Math.round(waitTime/1000)} секунд...`,
              waitTime: Math.round(waitTime/1000)
            });
          }
          
          // Если есть кэшированный файл, используем его даже если он устарел
          try {
            if (fs.existsSync(cachedConfigPath)) {
              console.log(`Используем существующий кэшированный файл из-за ограничения запросов:`, cachedConfigPath);
              return {
                success: true,
                configPath: cachedConfigPath,
                configFileName: cachedConfigFilename,
                fromCache: true,
                rateLimited: true
              };
            }
          } catch (cacheError) {
            console.error('Ошибка при проверке кэшированного файла:', cacheError);
          }
          
          // Ожидаем указанное время перед следующей попыткой
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Если это последняя попытка или ошибка не связана с превышением лимита, выбрасываем её
        if (retryCount > maxRetries) {
          throw error;
        }
        
        // Для других ошибок повторяем с увеличивающейся задержкой
        const waitTime = retryDelay * Math.pow(1.5, retryCount - 1);
        console.log(`Ошибка при загрузке конфигурации, повторная попытка через ${Math.round(waitTime/1000)} сек... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw new Error(`Превышено максимальное количество попыток (${maxRetries})`);
  } catch (error) {
    console.error('Ошибка при скачивании конфигурации:', error);
    
    // Проверяем, есть ли кэшированный файл для аварийного использования
    try {
      const configDir = path.join(app.getPath('userData'), 'configs');
      const cachedConfigFilename = `${typeof serverId === 'object' ? (serverId._id || serverId.id) : serverId}_${configType === 'fullVpn' ? 'fullVpn' : 'antizapret'}.ovpn`;
      const cachedConfigPath = path.join(configDir, cachedConfigFilename);
      
      if (fs.existsSync(cachedConfigPath)) {
        console.log(`Используем существующий кэшированный файл из-за ошибки загрузки:`, cachedConfigPath);
        return {
          success: true,
          configPath: cachedConfigPath,
          configFileName: cachedConfigFilename,
          fromCache: true,
          warning: 'Используется кэшированная конфигурация из-за ошибки обновления'
        };
      }
    } catch (cacheError) {
      console.error('Ошибка при проверке кэшированного файла:', cacheError);
    }
    
    // Подробная информация об ошибке для отладки
    let errorDetails = 'Неизвестная ошибка';
    
    if (error.response) {
      // Ошибка от сервера
      console.error('Статус код ответа:', error.response.status);
      console.error('Данные ответа:', error.response.data);
      errorDetails = `Ошибка сервера: ${error.response.status}`;
      
      // Если ошибка авторизации
      if (error.response.status === 401) {
        return {
          success: false,
          error: 'Требуется авторизация',
          needAuth: true
        };
      }
    } else if (error.request) {
      // Ошибка сети
      console.error('Ошибка запроса (нет ответа):', error.request);
      errorDetails = 'Сервер не отвечает';
    } else {
      // Другие ошибки
      console.error('Ошибка запроса:', error.message);
      errorDetails = error.message;
    }
    
    return {
      success: false,
      error: errorDetails
    };
  }
}

// Обработчик авторизации пользователя
ipcMain.handle('login', async (event, credentials) => {
  try {
    console.log('Попытка авторизации пользователя:', credentials.email);
    
    // Проверяем наличие обязательных полей
    if (!credentials || !credentials.email || !credentials.password) {
      console.error('Ошибка: отсутствуют данные для авторизации');
      return { 
        success: false, 
        error: 'Необходимо ввести email и ключ активации' 
      };
    }
    
    // Отправляем запрос на сервер для авторизации с использованием функции makeApiRequest
    console.log('Отправка запроса авторизации на сервер...');
    
    // Уведомляем пользователя о начале процесса авторизации
    if (mainWindow) {
      mainWindow.webContents.send('auth-progress', { 
        step: 'start',
        message: 'Авторизация...' 
      });
    }
    
    const response = await makeApiRequest({
      method: 'post',
      url: `${API_URL}/auth/user/token`,
      data: {
        email: credentials.email,
        activationKey: credentials.password
      },
      headers: {
        'Content-Type': 'application/json'
      },
      maxRetries: 3 // Максимально 3 попытки при ошибках
    });
    
    console.log('Ответ сервера авторизации:', response.status);
    
    // Проверяем успешность ответа
    if (response.status !== 200 || !response.data || !response.data.token) {
      console.error('Ошибка авторизации: некорректный ответ сервера', response.status);
      return { 
        success: false, 
        error: 'Ошибка авторизации: некорректный ответ сервера' 
      };
    }
    
    // Сохраняем токен авторизации
    const token = response.data.token;
    authToken = token;
    
    // Сохраняем токен в локальное хранилище
    try {
      const tokenPath = path.join(app.getPath('userData'), 'auth.json');
      fs.writeFileSync(tokenPath, JSON.stringify({ 
        token,
        email: credentials.email,
        timestamp: new Date().toISOString()
      }));
      console.log('Токен авторизации сохранен в:', tokenPath);
    } catch (saveError) {
      console.error('Ошибка при сохранении токена:', saveError);
      // Продолжаем работу даже при ошибке сохранения
    }
    
    // Обновляем состояние аутентификации
    authState.isAuthenticated = true;
    authState.token = token;
    authState.user = {
      email: credentials.email
    };
    saveAuthState();
    
    console.log('Авторизация успешна');
    
    // Обновляем меню трея после авторизации
    updateTrayMenu();
    
    // Запрашиваем обновление аналитики серверов
    updateServerAnalytics()
      .catch(err => console.error('Ошибка при обновлении аналитики серверов после авторизации:', err));
    
    // Возвращаем результат авторизации
    return { 
      success: true, 
      token,
      user: {
        email: credentials.email
      }
    };
    
  } catch (error) {
    console.error('Ошибка при авторизации:', error);
    
    // Подробная информация об ошибке для отладки
    let errorMessage = 'Ошибка при авторизации';
    
    if (error.response) {
      // Получен ответ от сервера с ошибкой
      console.error('Статус ответа:', error.response.status);
      console.error('Данные ответа:', error.response.data);
      
      if (error.response.status === 401 || error.response.status === 403) {
        errorMessage = 'Неверный email или ключ активации';
      } else if (error.response.status === 404) {
        errorMessage = 'Сервер авторизации недоступен';
      } else if (error.response.status === 429) {
        errorMessage = 'Слишком много попыток авторизации. Пожалуйста, подождите несколько минут и попробуйте снова.';
      } else {
        errorMessage = `Ошибка сервера: ${error.response.status}`;
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответ не получен
      console.error('Ошибка сети (нет ответа):', error.request);
      errorMessage = 'Сервер не отвечает. Проверьте подключение к интернету.';
    } else {
      // Ошибка при подготовке запроса
      console.error('Ошибка запроса:', error.message);
      errorMessage = error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage
    };
  }
});

// Обработчик для получения списка серверов
ipcMain.handle('get-servers', async () => {
  try {
    console.log('Получение списка серверов...');
    
    // Проверяем наличие токена авторизации
    if (!authToken) {
      console.log('Отсутствует токен авторизации. Возвращаем authRequired');
      return { 
        success: false, 
        authRequired: true, 
        error: 'Требуется авторизация' 
      };
    }
    
    // Запрашиваем список серверов
    const serverList = await getServerList();
    
    // Проверяем на ошибки
    if (!serverList.servers || serverList.error) {
      console.error('Ошибка при получении списка серверов:', serverList.error);
      // Если есть запасные серверы, возвращаем их
      const fallbackServers = getFallbackServers();
      return { 
        success: false, 
        error: serverList.error || 'Не удалось получить список серверов',
        servers: fallbackServers
      };
    }
    
    return { success: true, servers: serverList.servers };
  } catch (error) {
    console.error('Ошибка при получении списка серверов:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Обработчик для получения аналитики серверов
ipcMain.handle('get-server-analytics', async () => {
  try {
    console.log('Запрос аналитики серверов...');
    
    // Проверяем наличие токена авторизации
    if (!authToken) {
      console.log('Отсутствует токен авторизации для получения аналитики серверов');
      return { 
        success: false, 
        error: 'Требуется авторизация для получения аналитики' 
      };
    }
    
    // Запрашиваем аналитику серверов с сервера или из кэша
    const analyticData = await getServerAnalytics();
    
    if (analyticData.success && analyticData.analytics) {
      return {
        success: true,
        analytics: analyticData.analytics
      };
    } else {
      console.warn('Не удалось получить аналитику серверов:', analyticData.error);
      
      // Возвращаем текущие локальные данные, если они есть
      if (serverAnalytics && serverAnalytics.length > 0) {
        return {
          success: true,
          analytics: serverAnalytics,
          warning: 'Данные из локального кэша'
        };
      }
      
      return { 
        success: false, 
        error: analyticData.error || 'Не удалось получить аналитику серверов' 
      };
    }
  } catch (error) {
    console.error('Ошибка при получении аналитики серверов:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Обработчик для обновления статуса подключения к серверу
ipcMain.handle('update-connection-status', async (event, params) => {
  try {
    console.log('Обновление статуса подключения к серверу:', params);
    
    if (!params || !params.serverId || !params.status) {
      return { 
        success: false, 
        error: 'Неверные параметры: требуется serverId и status' 
      };
    }
    
    // Обновляем статистику подключения на сервере
    const updateResult = await updateServerConnectionStatus(params.serverId, params.status);
    
    return updateResult;
  } catch (error) {
    console.error('Ошибка при обновлении статуса подключения к серверу:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Обработчик для проверки состояния авторизации
ipcMain.handle('check-auth-state', () => {
  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user
  };
});

// Обработчик для получения информации о пользователе
ipcMain.handle('get-user-info', async () => {
  try {
    // Если есть информация о пользователе в состоянии авторизации
    if (authState.user) {
      return authState.user;
    }
    
    // Если есть токен авторизации, пытаемся получить информацию о пользователе
    if (authToken) {
      try {
        // Здесь может быть запрос к серверу для получения информации о пользователе
        // На данном этапе просто возвращаем базовую информацию из токена
        return {
          email: authState.user?.email || 'Пользователь'
        };
      } catch (error) {
        console.error('Ошибка при получении информации о пользователе:', error);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Ошибка при получении информации о пользователе:', error);
    return null;
  }
});

// Обработчик для загрузки сохраненного токена авторизации
ipcMain.handle('load-saved-auth-token', async () => {
  try {
    const loaded = loadSavedAuthToken();
    return { 
      success: loaded,
      hasToken: !!authToken
    };
  } catch (error) {
    console.error('Ошибка при загрузке сохраненного токена:', error);
    return { success: false, error: error.message };
  }
});

// Обработчик для сохранения учетных данных
ipcMain.handle('save-auth-credentials', async (event, credentials) => {
  try {
    console.log('Сохранение учетных данных...');
    
    if (!credentials || !credentials.email) {
      return { success: false, error: 'Недостаточно данных для сохранения' };
    }
    
    // Сохраняем в файл
    const credentialsPath = path.join(app.getPath('userData'), 'credentials.json');
    
    // Проверяем, нужно ли сохранять пароль
    const dataToSave = {
      email: credentials.email,
      timestamp: new Date().toISOString()
    };
    
    // Если установлен флаг "запомнить меня" и есть ключ, сохраняем его
    if (credentials.remember && credentials.key) {
      dataToSave.key = credentials.key;
    }
    
    fs.writeFileSync(credentialsPath, JSON.stringify(dataToSave));
    console.log('Учетные данные сохранены в:', credentialsPath);
    
    return { success: true };
  } catch (error) {
    console.error('Ошибка при сохранении учетных данных:', error);
    return { success: false, error: error.message };
  }
});

// Обработчик для выхода из системы
ipcMain.handle('logout', async () => {
  try {
    console.log('Выход из системы...');
    
    // Очищаем токен авторизации
    authToken = null;
    
    // Очищаем состояние авторизации
    clearAuthState();
    
    // Удаляем файл с сохраненным токеном
    try {
      const tokenPath = path.join(app.getPath('userData'), 'auth.json');
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
        console.log('Файл с сохраненным токеном удален');
      }
    } catch (fileError) {
      console.error('Ошибка при удалении файла с токеном:', fileError);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Ошибка при выходе из системы:', error);
    return { success: false, error: error.message };
  }
});

// Обработчик для проверки статуса подключения
ipcMain.handle('check-vpn-status', async () => {
  try {
    console.log('Проверка статуса подключения VPN...');
    
    // Здесь обычно была бы логика проверки состояния VPN подключения
    // Возвращаем текущее состояние из глобальной переменной
    const status = {
      connected: isConnected,
      server: selectedServer
    };
    
    return status;
  } catch (error) {
    console.error('Ошибка при проверке статуса подключения:', error);
    return { 
      connected: false, 
      error: error.message 
    };
  }
});

// Обработчик для подключения к VPN
if (!ipcMain.eventNames().includes('connect-vpn')) {
  ipcMain.handle('connect-vpn', async (event, params) => {
    try {
      console.log('Запрос на подключение к VPN:', params);
      
      if (!params || !params.serverId) {
        return {
          success: false,
          message: 'Не указан ID сервера для подключения'
        };
      }
      
      // Получаем конфигурацию сервера если её ещё нет
      let configPath;
      
      if (params.configPath) {
        configPath = params.configPath;
      } else {
        // Используем выделенную функцию для скачивания конфигурации
        const configType = params.connectionType || 'fullVpn';
        console.log(`Скачивание конфигурации для подключения (тип: ${configType})...`);
        
        const configResult = await downloadVPNConfig(params.serverId, configType);
        
        if (!configResult.success || !configResult.configPath) {
          console.error('Ошибка при получении конфигурации:', configResult.error);
          return {
            success: false,
            message: `Ошибка при получении конфигурации: ${configResult.error || 'Неизвестная ошибка'}`
          };
        }
        
        configPath = configResult.configPath;
      }
      
      // Находим сервер по ID
      const server = await findServerById(params.serverId);
      
      // Здесь должен быть код для реального подключения к VPN,
      // используя openvpn и configPath
      console.log(`Подключаемся к серверу ${params.serverId} (${params.connectionType})...`);
      console.log(`Загрузка конфигурации VPN...`);
      
      // Запуск OpenVPN с указанной конфигурацией
      const openVpnPath = getOpenVpnPath();
      if (!openVpnPath) {
        return {
          success: false,
          message: 'Не найден исполняемый файл OpenVPN'
        };
      }
      
      // Запускаем процесс OpenVPN
      vpnProcess = spawn(
        openVpnPath,
        ['--config', configPath],
        { windowsHide: true }
      );
      
      // Обработка вывода OpenVPN
      vpnProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`OpenVPN вывод: ${output}`);
        
        // Проверяем признаки успешного подключения
        if (output.includes('Initialization Sequence Completed') || 
            output.includes('Sequence Completed')) {
          console.log('Обнаружено успешное подключение VPN');
          
          // Вместо простого обновления статуса теперь используем функцию с проверкой
          updateConnectionStatusWithValidation(true, server)
            .then(validationResult => {
              console.log('Результат проверки подключения:', validationResult);
              
              // Отправляем обновление статуса в рендерер
              if (mainWindow) {
                mainWindow.webContents.send('vpn-connected', {
                  server: server,
                  validated: validationResult.verified
                });
              }
              
              // Обновляем статистику на сервере
              updateServerConnectionStatus(params.serverId, 'connected')
                .catch(err => console.error('Ошибка при обновлении статистики подключения:', err));
            })
            .catch(err => {
              console.error('Ошибка при проверке подключения:', err);
            });
        }
      });
      
      vpnProcess.stderr.on('data', (data) => {
        console.error(`OpenVPN ошибка: ${data.toString().trim()}`);
      });
      
      vpnProcess.on('close', (code) => {
        console.log(`Процесс OpenVPN завершен с кодом: ${code}`);
        
        // Обновляем состояние при отключении
        updateConnectionStatusWithValidation(false, null);
        vpnProcess = null;
        
        // Отправляем обновление статуса в рендерер
        if (mainWindow) {
          mainWindow.webContents.send('vpn-disconnected', { code });
        }
        
        // Обновляем статистику на сервере
        if (selectedServer) {
          updateServerConnectionStatus(selectedServer._id, 'disconnected')
            .catch(err => console.error('Ошибка при обновлении статистики отключения:', err));
        }
      });
      
      // Возвращаем начальный статус запуска процесса
      return {
        success: true,
        message: 'Подключение инициировано',
        server: server
      };
    } catch (error) {
      console.error('Ошибка при подключении к VPN:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
}

// Функция для поиска сервера по ID
async function findServerById(serverId) {
  try {
    if (!serverId) return null;
    
    // Получаем список серверов
    const serverList = await getServerList();
    
    if (serverList.success && serverList.servers && serverList.servers.length > 0) {
      return serverList.servers.find(server => server._id === serverId);
    } else if (serverList.servers && serverList.servers.length > 0) {
      // Если успех не указан, но есть серверы
      return serverList.servers.find(server => server._id === serverId);
    }
    
    // Если не удалось получить серверы, возвращаем null
    return null;
  } catch (error) {
    console.error('Ошибка при поиске сервера по ID:', error);
    return null;
  }
}

// Обработчик для отключения от VPN
ipcMain.handle('disconnect-vpn', async () => {
  try {
    console.log('Запрос на отключение от VPN');
    
    return disconnectVPN()
      ? { success: true, message: 'Отключение выполнено успешно' }
      : { success: false, message: 'Ошибка при отключении VPN' };
  } catch (error) {
    console.error('Ошибка при отключении от VPN:', error);
    return {
      success: false,
      message: error.message
    };
  }
});

// Функция для инициализации уникального идентификатора клиента
async function initializeClientId() {
  try {
    const clientIdPath = path.join(app.getPath('userData'), 'clientId.json');
    
    if (fs.existsSync(clientIdPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(clientIdPath, 'utf8'));
        if (data && data.clientId) {
          console.log('Загружен существующий clientId:', data.clientId);
          clientId = data.clientId;
          return;
        }
      } catch (parseError) {
        console.error('Ошибка при чтении существующего clientId:', parseError);
        // Продолжаем и создаем новый ID
      }
    }
    
    // Генерируем новый clientId, включая машинную информацию для уникальности
    const machineId = os.hostname() + '-' + os.platform() + '-' + os.arch();
    clientId = `vpn-${Date.now()}-${machineId}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('Сгенерирован новый clientId:', clientId);
    
    // Сохраняем clientId в файл
    fs.writeFileSync(clientIdPath, JSON.stringify({ 
      clientId,
      createdAt: new Date().toISOString(),
      machine: machineId
    }), 'utf8');
    console.log('clientId сохранен в:', clientIdPath);
  } catch (error) {
    console.error('Ошибка при инициализации clientId:', error);
    // В случае ошибки создаем временный ID в памяти
    clientId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('Создан временный clientId в памяти:', clientId);
  }
}

// Function to verify and fix VPN routing after connection
async function verifyAndFixVpnRouting() {
  if (!isConnected || !selectedServer) return false;

  try {
    console.log('Проверка и корректировка маршрутизации VPN...');

    // First check if our connection verification passes
    const isConnected = await verifyVpnConnection();
    if (!isConnected) {
      console.error('Проблема с VPN соединением: ping-тест не прошел');
      
      // Try to reset routing table on Windows
      if (process.platform === 'win32') {
        console.log('Попытка восстановления таблицы маршрутизации...');
        
        // Create a batch script to fix routing issues
        const tempBatchPath = path.join(os.tmpdir(), 'fix-vpn-routes.bat');
        const batchContent = `
@echo off
echo Восстановление маршрутизации VPN...
ipconfig /release
ipconfig /renew
ipconfig /flushdns
netsh interface ip delete arpcache
netsh winsock reset catalog
route print
echo Готово.
`;
        
        fs.writeFileSync(tempBatchPath, batchContent);
        
        // Run the batch file as administrator
        const cmdProcess = spawn('powershell', [
          '-Command', 
          `Start-Process -FilePath "${tempBatchPath}" -Verb RunAs -Wait`
        ]);
        
        // Wait for the process to finish
        await new Promise((resolve) => {
          cmdProcess.on('close', (code) => {
            console.log(`Процесс восстановления маршрутизации завершен с кодом ${code}`);
            resolve();
          });
        });
        
        // Try to verify connection again after fixing
        const isFixedConnected = await verifyVpnConnection();
        if (isFixedConnected) {
          console.log('Маршрутизация успешно восстановлена, VPN теперь работает');
          return true;
        } else {
          console.error('Не удалось восстановить маршрутизацию, VPN по-прежнему не работает');
          
          // Notify the user
          if (mainWindow) {
            mainWindow.webContents.send('vpn-routing-error', {
              message: 'Проблема с маршрутизацией VPN. Попробуйте переподключиться или перезапустить приложение.'
            });
          }
          return false;
        }
      } else {
        // For non-Windows platforms
        console.log('Проверка маршрутизации на этой платформе не поддерживается');
        return false;
      }
    }
    
    console.log('Маршрутизация VPN в порядке');
    return true;
  } catch (error) {
    console.error('Ошибка при проверке маршрутизации VPN:', error);
    return false;
  }
}

// Function to get OpenVPN installation path
function getOpenVpnPath() {
  // Check common installation paths for Windows
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe'
    ];
    
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
  }
  
  // Default fallback (should not reach this in production)
  return null;
}

// Function to disconnect from VPN
function disconnectVPN() {
  if (vpnProcess) {
    try {
      console.log('Отключение VPN...');
      
      // Kill the OpenVPN process
      if (process.platform === 'win32') {
        // On Windows we need to use taskkill to force kill the process tree
        exec(`taskkill /F /T /PID ${vpnProcess.pid}`, (error) => {
          if (error) {
            console.error('Ошибка при завершении процесса OpenVPN:', error);
          } else {
            console.log('Процесс OpenVPN успешно завершен');
          }
        });
      } else {
        vpnProcess.kill('SIGTERM');
      }
      
      // Update connection status
      updateConnectionStatus(false, null);
      
      // Update server statistics
      if (selectedServer) {
        updateServerConnectionStatus(selectedServer._id, 'disconnected')
          .catch(err => console.error('Ошибка при обновлении статистики отключения:', err));
      }
      
      vpnProcess = null;
      return true;
    } catch (error) {
      console.error('Ошибка при отключении VPN:', error);
      return false;
    }
  } else {
    console.log('VPN не подключен, отключение не требуется');
    return true;
  }
}

// Handler for fixing VPN routing problems
ipcMain.handle('fix-vpn-routing', async () => {
  try {
    console.log('Запрос на исправление маршрутизации VPN...');
    
    if (!isConnected) {
      return {
        success: false,
        message: 'VPN не подключен'
      };
    }
    
    const result = await verifyAndFixVpnRouting();
    
    return {
      success: result,
      message: result 
        ? 'Маршрутизация VPN успешно исправлена' 
        : 'Не удалось исправить маршрутизацию VPN'
    };
  } catch (error) {
    console.error('Ошибка при исправлении маршрутизации VPN:', error);
    return {
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
});