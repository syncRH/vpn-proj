const { app, BrowserWindow, ipcMain, Menu, dialog, shell, Notification, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn, execFile, exec } = require('child_process');
const os = require('os');
const electron = require('electron');
const https = require('https');
const sudo = require('sudo-prompt');

// Базовый URL для API
const API_URL = 'http://127.0.0.1:3000/api';

// URL для скачивания OpenVPN
const OPENVPN_DOWNLOAD_URL = 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-amd64.msi';
const OPENVPN_INSTALLER_PATH = path.join(os.tmpdir(), 'openvpn-installer.msi');

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

// Load auth state from storage on startup
function loadAuthState() {
  try {
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
function saveAuthState() {
  try {
    store.set('authState', authState);
    console.log('Saved authentication state');
  } catch (error) {
    console.error('Failed to save authentication state:', error);
  }
}

// Clear auth state
function clearAuthState() {
  authState = {
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null
  };
  try {
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
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAFCSURBVHjaYvz//z8DJYCJgUIwdAxgYWBgYNiwfv3/P79/M/z984cBxGeEsP/++cMQFRPDwMTExPD161cGf39/RqK8sGH9+v9z58xh+PnzJwMrKysDCwsLAxMTE8Pfv38ZPn36RJwXfv/+zfD48WOGjx8/MvDw8DDw8/Mz8PPzM3z79o1hxYoVDH/+/CHOBf///2dYuXIlQ05ODkNQUBCDlJQUw9evXxnWrl3LsGfPHoafP38SH4iwAP/37x/DixcvGNatW8fw4cMHop3GCPPCnz9/cPK3bt3KMGvWLOI0g1xQUVHBIC8vj9cF9+/fZ8jMzCROMyMsc0RGRuI0/MOHD6SlaFZWVoaAgACsBjx//pyhvb2dNM0gF3BxcTHw8vIyXLt2jYGZmZk0zTBQXl7OwMbGRl6WYBwNRIoBGADSlEe2CvKyFwAAAABJRU5ErkJggg==', 'base64')
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
    // Создаем пустую иконку размером 16x16 пикселей
    const emptyIcon = nativeImage.createEmpty();
    
    if (isConnected) {
      // Подключено - зеленая иконка
      console.log('VPN подключен, устанавливаем иконку активного соединения');
      try {
        // Вместо загрузки из файла создаем зеленую иконку
        const connectedIcon = nativeImage.createFromBuffer(
          Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAE3SURBVHjaYvz//z8DJYCJgUIwdAxgYWBgYNiwfv3/P79/M/z984cBxGeEsP/++cMQFRPDwMTExPD161cGf39/RqK8sGH9+v9z58xh+PnzJwMrKysDCwsLAxMTE8Pfv38ZPn36RJwXfv/+zfD48WOGjx8/MvDw8DDw8/Mz8PPzM3z79o1hxYoVDH/+/CHOBf///2dYuXIlQ05ODkNQUBCDlJQUw9evXxnWrl3LsGfPHoafP38SH4iwAP/37x/DixcvGNatW8fw4cMHop3GCPPCnz9/cPK3bt3KMGvWLOI0g1xQUVHBIC8vj9cF9+/fZ8jMzCROMyMsc0RGRuI0/MOHD6SlaFZWVoaAgACsBjx//pyhvb2dNM0gF3BxcTHw8vIyXLt2jYGZmZk0zTBQXl7OwMbGRl6WYBwNRIoBGADMIUp+zQZI9QAAAABJRU5ErkJggg==', 'base64')
        );
        tray.setImage(connectedIcon);
        console.log('Установлена иконка активного VPN');
      } catch (err) {
        console.error('Ошибка при установке иконки активного состояния:', err);
        tray.setImage(emptyIcon);
        console.log('Установлена пустая иконка из-за ошибки');
      }
    } else {
      // Отключено - красная иконка
      console.log('VPN отключен, устанавливаем иконку неактивного соединения');
      try {
        // Вместо загрузки из файла создаем красную иконку
        const disconnectedIcon = nativeImage.createFromBuffer(
          Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAFCSURBVHjaYvz//z8DJYCJgUIwdAxgYWBgYNiwfv3/P79/M/z984cBxGeEsP/++cMQFRPDwMTExPD161cGf39/RqK8sGH9+v9z58xh+PnzJwMrKysDCwsLAxMTE8Pfv38ZPn36RJwXfv/+zfD48WOGjx8/MvDw8DDw8/Mz8PPzM3z79o1hxYoVDH/+/CHOBf///2dYuXIlQ05ODkNQUBCDlJQUw9evXxnWrl3LsGfPHoafP38SH4iwAP/37x/DixcvGNatW8fw4cMHop3GCPPCnz9/cPK3bt3KMGvWLOI0g1xQUVHBIC8vj9cF9+/fZ8jMzCROMyMsc0RGRuI0/MOHD6SlaFZWVoaAgACsBjx//pyhvb2dNM0gF3BxcTHw8vIyXLt2jYGZmZk0zTBQXl7OwMbGRl6WYBwNRIoBGADSlEe2CvKyFwAAAABJRU5ErkJggg==', 'base64')
        );
        tray.setImage(disconnectedIcon);
        console.log('Установлена иконка неактивного VPN');
      } catch (err) {
        console.error('Ошибка при загрузке иконки неактивного состояния:', err);
        tray.setImage(emptyIcon);
        console.log('Установлена стандартная иконка трея');
      }
    }
  } catch (err) {
    console.error('Общая ошибка при обновлении иконки трея:', err);
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
    const config = {
      headers: {},
      timeout: 10000 // таймаут 10 сек
    };
    
    // Добавляем заголовок с токеном авторизации, если он есть
    if (authToken) {
      console.log('Используем токен авторизации для запроса серверов');
      config.headers['Authorization'] = `Bearer ${authToken}`;
    } else {
      console.warn('Токен авторизации отсутствует, запрос будет выполнен без авторизации');
    }
    
    const response = await axios.get(`${API_URL}/servers`, config);
    
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
    return { servers: serverList };
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
      }
      
      // Детали ответа сервера при ошибке
      console.error('Детали ошибки:', error.response.data);
    }
    
    // Возвращаем пустой список при ошибке
    return { servers: [], error: error.message };
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
      // Sort servers by load (lowest first)
      const sortedServers = [...serverAnalytics].sort((a, b) => a.load - b.load);
      
      console.log('Server load distribution:');
      sortedServers.forEach(server => {
        console.log(`- ${server.name}: ${server.load}% (${server.activeConnections}/${server.maxConnections} connections)`);
      });
      
      // Return the server with the lowest load
      return sortedServers[0];
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
    
    // Нормализуем ID сервера
    let serverIdString = serverId;
    if (typeof serverId === 'object' && serverId._id) {
      serverIdString = serverId._id;
    }
    
    // Отправляем запрос на обновление статистики
    const response = await axios.post(`${API_URL}/servers/analytics/update`, {
      serverId: serverIdString,
      status: status, // 'connected' или 'disconnected'
      clientId: clientId
    }, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
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
    console.error('Ошибка при обновлении статистики подключения:', error);
    return { 
      success: false, 
      error: `Ошибка: ${error.message || 'Неизвестная ошибка'}`
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

// Обработчик для скачивания конфигурации VPN
ipcMain.handle('download-config', async (event, params) => {
  try {
    console.log('Запрос на скачивание конфигурации VPN:', params);
    
    // Проверяем наличие необходимых параметров
    if (!params || !params.serverId || !params.configType) {
      console.error('Ошибка: Не указан ID сервера или тип конфигурации');
      return { 
        success: false, 
        error: 'Не указан ID сервера или тип конфигурации' 
      };
    }
    
    // Преобразуем serverId в строку, если это объект
    let serverIdStr = params.serverId;
    if (typeof params.serverId === 'object') {
      serverIdStr = params.serverId._id || params.serverId.id || JSON.stringify(params.serverId);
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
    
    console.log(`Скачивание конфигурации для сервера ${serverIdStr}, тип: ${params.configType}`);
    
    // Формируем URL для запроса конфигурации
    const configUrl = `${API_URL}/servers/${serverIdStr}/config/${params.configType}`;
    console.log('URL запроса конфигурации:', configUrl);
    
    // Отправляем запрос на получение конфигурации
    const response = await axios.get(configUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`
      },
      responseType: 'text' // Важно для получения текстового файла
    });
    
    if (response.status !== 200) {
      console.error('Ошибка при получении конфигурации:', response.status);
      return { 
        success: false, 
        error: `Ошибка сервера: ${response.status}` 
      };
    }
    
    // Получаем содержимое файла конфигурации
    const configContent = response.data;
    
    // Создаем папку для конфигураций, если её нет
    const configDir = path.join(app.getPath('userData'), 'configs');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log('Создана директория для конфигураций:', configDir);
    }
    
    // Формируем имя файла конфигурации
    const configFileName = `${serverIdStr}_${params.configType}.ovpn`;
    const configPath = path.join(configDir, configFileName);
    
    // Сохраняем файл конфигурации
    fs.writeFileSync(configPath, configContent, 'utf8');
    console.log('Конфигурация успешно сохранена:', configPath);
    
    return {
      success: true,
      configPath: configPath,
      configFileName: configFileName
    };
  } catch (error) {
    console.error('Ошибка при скачивании конфигурации:', error);
    
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
});

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
    
    // Отправляем запрос на сервер для авторизации
    console.log('Отправка запроса авторизации на сервер...');
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: credentials.email,
      activationKey: credentials.password
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