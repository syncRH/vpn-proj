const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Отладочное логирование окружения
console.log('------------------- PRELOAD.JS ЗАГРУЖЕН -------------------');
console.log('Путь к preload.js:', __filename);
console.log('Директория:', __dirname);
console.log('Процесс:', process.type);
console.log('Electron версии:', process.versions.electron);
console.log('Chrome версии:', process.versions.chrome);
console.log('Node версии:', process.versions.node);
console.log('Операционная система:', process.platform, os.release());
console.log('V8 версия:', process.versions.v8);
console.log('Доступность API:', 'contextBridge' in global ? 'ДА' : 'НЕТ', 'ipcRenderer' in global ? 'ДА' : 'НЕТ');

// Проверяем доступность и корректность contextBridge
if (!contextBridge) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: contextBridge не определен в preload.js!');
} else {
  console.log('contextBridge доступен:', typeof contextBridge.exposeInMainWorld === 'function' ? 'Полностью функциональный' : 'Не функциональный');
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

  // Linux
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      execSync('which openvpn');
      console.log('OpenVPN найден в Linux через which');
      return true;
    } catch (err) {
      console.log('OpenVPN не найден в Linux');
      return false;
    }
  }

  // macOS
  if (process.platform === 'darwin') {
    const macPaths = [
      '/usr/local/bin/openvpn',
      '/usr/bin/openvpn',
      '/opt/homebrew/bin/openvpn'
    ];

    for (const openVPNPath of macPaths) {
      try {
        if (fs.existsSync(openVPNPath)) {
          console.log('OpenVPN найден в macOS по пути:', openVPNPath);
          return true;
        }
      } catch (err) {
        console.error(`Ошибка при проверке macOS пути ${openVPNPath}:`, err);
      }
    }
    console.log('OpenVPN не найден в macOS');
    return false;
  }

  return false;
}

// Экспортируем API для рендерера
const vpnAPI = {
  // Получение списка серверов
  getServers: async () => {
    try {
      console.log('preload.js: вызов getServers');
      const result = await ipcRenderer.invoke('get-servers');
      console.log('preload.js: получен результат getServers', result ? 'данные получены' : 'нет данных');
      if (result) {
        console.log('preload.js: Данные серверов:', JSON.stringify(result));
      }
      return result;
    } catch (error) {
      console.error('preload.js: ошибка в getServers', error);
      throw error;
    }
  },

  // Получение аналитики серверов (статистика нагрузки)
  getServerAnalytics: async () => {
    try {
      console.log('preload.js: запрос аналитики серверов');
      const result = await ipcRenderer.invoke('get-server-analytics');
      console.log('preload.js: получены данные аналитики:', result ? 'данные получены' : 'нет данных');
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при получении аналитики серверов', error);
      return { success: false, error: error.message };
    }
  },

  // Автоматический выбор оптимального сервера
  autoSelectServer: async () => {
    try {
      console.log('preload.js: запрос на автоматический выбор сервера');
      const result = await ipcRenderer.invoke('auto-select-server');
      console.log('preload.js: результат автовыбора сервера:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при автовыборе сервера', error);
      return { success: false, error: error.message };
    }
  },

  // Получение статуса подключения VPN
  getConnectionStatus: async () => {
    try {
      console.log('preload.js: запрос статуса подключения');
      const result = await ipcRenderer.invoke('check-vpn-status');
      console.log('preload.js: получен статус подключения:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при получении статуса подключения', error);
      return { connected: false, error: error.message };
    }
  },

  // Обновление статуса подключения к серверу (для аналитики)
  updateConnectionStatus: async (params) => {
    try {
      console.log('preload.js: обновление статуса подключения:', params);
      const result = await ipcRenderer.invoke('update-connection-status', params);
      console.log('preload.js: результат обновления статуса:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при обновлении статуса подключения', error);
      return { success: false, error: error.message };
    }
  },

  // Проверка состояния авторизации
  checkAuthState: async () => {
    try {
      console.log('preload.js: запрос состояния авторизации');
      const result = await ipcRenderer.invoke('check-auth-state');
      console.log('preload.js: получено состояние авторизации:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при проверке состояния авторизации', error);
      return { isAuthenticated: false, error: error.message };
    }
  },

  // Получение информации о пользователе
  getUserInfo: async () => {
    try {
      console.log('preload.js: запрос информации о пользователе');
      const result = await ipcRenderer.invoke('get-user-info');
      console.log('preload.js: получена информация о пользователе:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при получении информации о пользователе', error);
      return null;
    }
  },

  // Загрузка сохраненного токена авторизации
  loadSavedAuthToken: async () => {
    try {
      console.log('preload.js: загрузка сохраненного токена авторизации');
      const result = await ipcRenderer.invoke('load-saved-auth-token');
      console.log('preload.js: результат загрузки токена:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при загрузке сохраненного токена', error);
      return { success: false, error: error.message };
    }
  },

  // Сохранение учетных данных
  saveAuthCredentials: async (credentials) => {
    try {
      console.log('preload.js: сохранение учетных данных');
      const result = await ipcRenderer.invoke('save-auth-credentials', credentials);
      console.log('preload.js: результат сохранения учетных данных:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при сохранении учетных данных', error);
      return { success: false, error: error.message };
    }
  },

  // Выход из системы
  logout: async () => {
    try {
      console.log('preload.js: выход из системы');
      const result = await ipcRenderer.invoke('logout');
      console.log('preload.js: результат выхода:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при выходе из системы', error);
      return { success: false, error: error.message };
    }
  },

  // Метод для совместимости с кодом рендерера
  login: async (credentials) => {
    console.log('preload.js: вызов login() (обертка для authenticate)');
    if (credentials && typeof credentials === 'object') {
      const { email, password } = credentials;
      console.log(`preload.js: login с объектом credentials, email=${email}, password длиной ${password ? password.length : 0}`);
      return await vpnAPI.authenticate(email, password);
    } else {
      console.log('preload.js: login с прямыми параметрами');
      return await vpnAPI.authenticate(credentials, arguments[1]); // поддержка старого формата
    }
  },

  // Аутентификация пользователя
  authenticate: async (email, key) => {
    try {
      console.log(`preload.js: аутентификация пользователя ${email}`);
      console.log(`preload.js: ТРАССИРОВКА СТЕКА:`, new Error().stack);
      console.log(`preload.js: пароль имеет длину: ${key ? key.length : 0}`);

      if (key && key.length > 4) {
        console.log(`preload.js: первые 2 символа пароля: ${key.substring(0, 2)}, последние 2: ${key.substring(key.length - 2)}`);
      }

      console.log('preload.js: вызываем ipcRenderer.invoke("login", ...)');

      const result = await ipcRenderer.invoke('login', { email, password: key });

      console.log('preload.js: получен результат аутентификации:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('preload.js: ошибка аутентификации', error);
      throw error;
    }
  },

  // Получение статистики сервера
  getServerStats: async () => {
    try {
      console.log('preload.js: запрос статистики сервера');
      const result = await ipcRenderer.invoke('get-server-stats');
      console.log('preload.js: получена статистика сервера', result ? 'данные получены' : 'нет данных');
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при получении статистики', error);
      throw error;
    }
  },

  // Загрузка конфигурации VPN
  downloadConfig: (serverId, connectionType) => {
    console.log(`Preload: Downloading config for server ${serverId}, type: ${connectionType}`);
    return ipcRenderer.invoke('download-config', {
      serverId,
      configType: connectionType
    });
  },

  // Подключение к VPN
  connectVPN: (serverId, configPath, connectionType) => {
    console.log(`Preload: Connecting to VPN server ${serverId}, type: ${connectionType}`);
    return ipcRenderer.invoke('connect-vpn', {
      serverId,
      configPath,
      connectionType
    });
  },

  // Подключение к VPN (комбинированный метод для скачивания конфигурации и подключения)
  connectToVPN: async (params) => {
    try {
      console.log('preload.js: запрос на подключение к VPN:', params);
      
      if (!params || !params.serverId) {
        console.error('preload.js: не указан ID сервера для подключения');
        return { 
          success: false, 
          error: 'Не указан ID сервера для подключения' 
        };
      }
      
      // Вызываем обработчик connect-vpn в main процессе
      const result = await ipcRenderer.invoke('connect-vpn', params);
      console.log('preload.js: результат подключения к VPN:', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка при подключении к VPN:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка при подключении к VPN'
      };
    }
  },

  // Отключение от VPN
  disconnectFromVPN: async () => {
    try {
      console.log('preload.js: отключение от VPN');
      const result = await ipcRenderer.invoke('disconnect-vpn');
      console.log('preload.js: результат отключения', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка отключения', error);
      throw error;
    }
  },

  // Отключение от VPN
  disconnectVPN: async () => {
    try {
      console.log('preload.js: отключение от VPN');
      const result = await ipcRenderer.invoke('disconnect-vpn');
      console.log('preload.js: результат отключения', result);
      return result;
    } catch (error) {
      console.error('preload.js: ошибка отключения', error);
      throw error;
    }
  },

  // Проверка статуса VPN
  checkVpnStatus: () => ipcRenderer.invoke('check-vpn-status'),

  // Проверка, установлен ли OpenVPN
  isOpenVPNInstalled: () => {
    console.log('preload.js: вызов isOpenVPNInstalled');
    try {
      const result = checkOpenVPNInstalled();
      console.log('preload.js: результат проверки OpenVPN:', result);
      return Promise.resolve(result);
    } catch (error) {
      console.error('preload.js: ошибка при проверке OpenVPN:', error);
      return Promise.resolve(false);
    }
  },

  // Регистрация обработчиков событий
  onVpnLog: (callback) => {
    console.log('preload.js: регистрация обработчика для vpn-log');
    ipcRenderer.on('vpn-log', (_, data) => {
      console.log('preload.js: получен vpn-log:', data);
      callback(data);
    });
  },

  onVpnConnected: (callback) => {
    console.log('preload.js: регистрация обработчика для vpn-connected');
    ipcRenderer.on('vpn-connected', (_, data) => {
      console.log('preload.js: получен vpn-connected:', data);
      callback(data);
    });
  },

  onVpnDisconnected: (callback) => {
    console.log('preload.js: регистрация обработчика для vpn-disconnected');
    ipcRenderer.on('vpn-disconnected', () => {
      console.log('preload.js: получен vpn-disconnected');
      callback();
    });
  },

  onVpnError: (callback) => {
    console.log('preload.js: регистрация обработчика для vpn-error');
    ipcRenderer.on('vpn-error', (_, error) => {
      console.log('preload.js: получен vpn-error:', error);
      callback(error);
    });
  },

  onOpenSettings: (callback) => {
    console.log('preload.js: регистрация обработчика для open-settings');
    ipcRenderer.on('open-settings', () => {
      console.log('preload.js: получен open-settings');
      callback();
    });
  },

  // Обработчик для обновления аналитики серверов
  onServerAnalyticsUpdated: (callback) => {
    console.log('preload.js: регистрация обработчика для server-analytics-updated');
    ipcRenderer.on('server-analytics-updated', (_, data) => {
      console.log('preload.js: получено обновление аналитики серверов');
      callback(data);
    });
  },

  // Отображение уведомления
  showNotification: async (notification) => {
    return ipcRenderer.invoke('show-notification', notification);
  }
};

// Выводим доступные методы API
console.log('Экспортируемые методы API:', Object.keys(vpnAPI).join(', '));

// Экспортируем API в окно рендерера
try {
  console.log('Пытаемся экспортировать API через contextBridge...');
  if (!contextBridge) {
    console.error('ОШИБКА: contextBridge не определен!');
  } else {
    contextBridge.exposeInMainWorld('vpnAPI', vpnAPI);
    console.log('API успешно экспортирован в окно рендерера через contextBridge');
    console.log('Экспортированные методы:', Object.keys(vpnAPI).join(', '));
  }
} catch (error) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА при экспорте API:', error);
}