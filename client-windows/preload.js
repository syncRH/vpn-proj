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