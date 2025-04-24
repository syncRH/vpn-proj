const { app, BrowserWindow, ipcMain, Menu, dialog, shell, Notification, Tray, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn, execFile, exec } = require('child_process');
const os = require('os');
const electron = require('electron');
const https = require('https');
const sudo = require('sudo-prompt');

// IMPORTANT: Temporarily disable auto-updater since it's causing startup issues
// const { autoUpdater } = require('electron-updater');

console.log('Starting VPN Client application...');

// Log application details
console.log('Electron version:', process.versions.electron);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);

// Базовый URL для API
const isDevelopment = process.env.NODE_ENV === 'development';
const API_URL = isDevelopment 
  ? 'http://195.133.15.249:3000/api'  // Адрес вашего сервера
  : 'http://195.133.15.249:3000/api'; // Используем тот же адрес и для продакшена

// Add utility function for making API requests
async function makeApiRequest(method, endpoint, data = null, token = null) {
  try {
    const url = `${API_URL}${endpoint}`;
    console.log(`Making ${method.toUpperCase()} request to: ${url}`);
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    };
    
    const options = {
      method: method.toLowerCase(),
      headers: headers
    };
    
    if (data && method.toLowerCase() !== 'get') {
      options.body = JSON.stringify(data);
    };
    
    const response = await fetch(url, options);
    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(responseData.message || 'API request failed');
    };
    
    return responseData;
  } catch (error) {
    console.error(`API request error (${endpoint}):`, error);
    throw error;
  };
}

// URL для скачивания OpenVPN с учетом архитектуры процессора
function getOpenVpnDownloadUrl() {
  // Определяем архитектуру системы
  const arch = os.arch();
  console.log(`Обнаружена архитектура системы: ${arch}`);
  
  // Выбираем соответствующую версию OpenVPN
  if (arch === 'x64' || arch === 'amd64') {
    return 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-amd64.msi';
  } else if (arch === 'ia32' || arch === 'x86') {
    return 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-x86.msi';
  } else if (arch === 'arm64') {
    // Для ARM64 архитектуры (Windows на ARM)
    return 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-arm64.msi';
  } else {
    // Если архитектура не определена, используем x86 как наиболее совместимую
    console.log(`Неизвестная архитектура ${arch}, используем x86 версию OpenVPN`);
    return 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.5.8-I601-x86.msi';
  };
}

const OPENVPN_DOWNLOAD_URL = getOpenVpnDownloadUrl();
const OPENVPN_INSTALLER_PATH = path.join(os.tmpdir(), 'openvpn-installer.msi');

// Текущая версия и копирайт
const APP_VERSION = '1.0.0';
const COPYRIGHT_YEAR = '2025';

// Initial state variables (simplified from original version)
let mainWindow;
let tray = null;
let isConnected = false;
let selectedServer = null;
let authToken = null;
let vpnProcess = null;

// Simplified auth state
let authState = {
  isAuthenticated: false,
  user: null,
  token: null
};

// Create the browser window
function createWindow() {
  console.log('Creating main window...');
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Only show when ready
    icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
  });

  // Load the index.html of the app
  console.log('Loading index.html...');
  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorDescription} (${errorCode})`);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Create application menu
  setupApplicationMenu();
  
  return mainWindow;
}

// Setup application menu
function setupApplicationMenu() {
  console.log('Setting up application menu...');
  
  const template = [
    {
      label: 'Файл',
      submenu: [
        { 
          label: 'Выход', 
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Помощь',
      submenu: [
        {
          label: 'О программе',
          click: () => {
            dialog.showMessageBox({
              title: 'О программе',
              message: `BeNice VPN Client v${APP_VERSION}`,
              detail: `© ${COPYRIGHT_YEAR} BeNice Team\nВсе права защищены.`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Basic error handling for entire application
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  
  if (mainWindow) {
    mainWindow.webContents.send('error', {
      message: 'Произошла ошибка приложения',
      details: error.message
    });
  }
});

// App startup events
app.whenReady().then(() => {
  console.log('App is ready...');
  
  createWindow();
  
  // Create a basic implementation of the VPN API for the renderer
  setupVpnApi();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  console.error('Error during app startup:', error);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Setup minimal API implementation for core functionality
function setupVpnApi() {
  console.log('Setting up VPN API...');
  
  // Modified login handler to validate email matches what's stored on the server
  ipcMain.handle('login', async (event, credentials) => {
    console.log('Login requested with email:', credentials.email);
    
    try {
      if (!credentials.email || !credentials.password) {
        return { 
          success: false, 
          error: 'Необходимо ввести email и ключ активации' 
        };
      }
      
      // Проверка формата email на стороне клиента
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(credentials.email)) {
        console.log(`Недопустимый формат email: ${credentials.email}`);
        return { 
          success: false, 
          error: 'Недопустимый формат email. Пожалуйста, введите корректный email в формате name@domain.com' 
        };
      }
      
      try {
        // First step: Check if the activation key exists and has an associated user
        let existingUser = null;
        let existingEmail = null;
        
        try {
          // Check if there's already a user with this activation key
          const userCheckResponse = await axios.get(
            `${API_URL}/auth/verify/${credentials.password}`,
            { validateStatus: status => true }
          );
          
          if (userCheckResponse.data.success) {
            // If there's a user record associated with this key
            if (userCheckResponse.data.email) {
              existingEmail = userCheckResponse.data.email;
              console.log(`Found existing user with email: ${existingEmail}`);
            }
          }
        } catch (checkError) {
          console.log('Error checking existing user, will continue with activation key:', checkError.message);
        }
        
        // If we found an existing email and it doesn't match what the user entered, return an error
        if (existingEmail && existingEmail !== credentials.email) {
          console.log(`Email mismatch: User entered ${credentials.email}, but server has ${existingEmail}`);
          return {
            success: false,
            error: 'Неверный email. Пожалуйста, используйте email, привязанный к этому ключу активации.'
          };
        }
        
        // If email validation passed (or no existing email to validate against), proceed with login
        console.log(`Proceeding with login using email: ${credentials.email}`);
        
        // Login with credentials
        const response = await axios.post(`${API_URL}/auth/user/token`, {
          email: credentials.email,
          activationKey: credentials.password
        });
        
        console.log('Login API response:', response.status);
        
        if (response.data && response.data.token) {
          // Verify that the email in the response matches what the user entered
          const serverEmail = response.data.user?.email;
          
          if (serverEmail && serverEmail !== credentials.email) {
            console.log(`Server returned different email (${serverEmail}) than entered (${credentials.email})`);
            return {
              success: false,
              error: 'Сервер вернул другой email. Пожалуйста, используйте email, привязанный к этому ключу активации.'
            };
          }
          
          // Save the auth token
          authToken = response.data.token;
          
          // Update auth state
          authState = {
            isAuthenticated: true,
            user: response.data.user || { email: credentials.email },
            token: response.data.token
          };
          
          // Save the token to file for future use
          try {
            const tokenPath = path.join(app.getPath('userData'), 'auth.json');
            fs.writeFileSync(tokenPath, JSON.stringify({ 
              token: response.data.token,
              email: credentials.email, // Use the email the user entered
              activationKey: credentials.password,
              timestamp: new Date().toISOString()
            }));
            console.log('Auth token saved to:', tokenPath);
          } catch (saveError) {
            console.error('Error saving token:', saveError);
          }
          
          return { 
            success: true, 
            message: 'Авторизация успешна', 
            user: response.data.user || { email: credentials.email }
          };
        } else {
          return { 
            success: false, 
            error: 'Неверный ответ от сервера авторизации' 
          };
        }
      } catch (apiError) {
        console.error('API error during login:', apiError.message);
        
        // Special handling for common error cases
        if (apiError.response) {
          const status = apiError.response.status;
          const data = apiError.response.data;
          
          if (status === 401 || status === 404) {
            return { 
              success: false, 
              error: 'Неверный email или ключ активации'
            };
          } else if (status === 403) {
            return { 
              success: false, 
              error: 'Ключ активации недействителен или истек срок его действия'
            };
          } else if (data && data.message) {
            return { 
              success: false, 
              error: data.message
            };
          }
        }
        
        return { 
          success: false, 
          error: 'Не удалось подключиться к серверу авторизации'
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: 'Произошла ошибка при авторизации' 
      };
    }
  });
  
  // Handle get-servers request to fetch real servers from the backend
  ipcMain.handle('get-servers', async (event, withAnalytics = false) => {
    console.log('Servers list requested');
    
    try {
      // Try to fetch servers from the real API
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await axios.get(`${API_URL}/servers`, { headers });
      
      if (response.data && response.data.servers) {
        console.log(`Fetched ${response.data.servers.length} servers from API`);
        return { 
          success: true, 
          servers: response.data.servers
        };
      } else {
        console.warn('API returned invalid server data format');
        throw new Error('Invalid server data format');
      }
    } catch (error) {
      console.error('Error fetching servers from API:', error.message);
      
      // If we failed to fetch from API, try using cached servers
      try {
        const cachePath = path.join(app.getPath('userData'), 'servers-cache.json');
        
        if (fs.existsSync(cachePath)) {
          const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          const cacheTime = new Date(cacheData.timestamp || 0);
          const now = new Date();
          
          // Check if cache is no older than 1 day
          if (now - cacheTime < 24 * 60 * 60 * 1000) {
            console.log(`Using ${cacheData.servers.length} servers from cache`);
            return { 
              success: true, 
              servers: cacheData.servers,
              fromCache: true
            };
          }
        }
      } catch (cacheError) {
        console.error('Error reading server cache:', cacheError);
      }
      
      // If API and cache both failed, return fallback data
      console.log('Using fallback server data');
      return { 
        success: true, 
        servers: [
          { 
            _id: 'server1', 
            name: 'Russia Server (Fallback)', 
            location: 'Moscow', 
            status: 'active'
          },
          { 
            _id: 'server2', 
            name: 'Europe Server (Fallback)', 
            location: 'Amsterdam', 
            status: 'active'
          }
        ],
        fallback: true
      };
    }
  });
  
  // Handle connect-vpn request with improved launcher
  ipcMain.handle('connect-vpn', async (event, params) => {
    console.log('Connect VPN requested for server:', params.serverId);
    
    try {
      // Check if OpenVPN is installed
      if (!isOpenVPNInstalled()) {
        console.error('OpenVPN not installed');
        return { 
          success: false, 
          error: 'OpenVPN не установлен. Пожалуйста, установите OpenVPN перед подключением.' 
        };
      }
      
      // Check if we're already connected
      if (isConnected && vpnProcess) {
        console.warn('Already connected to VPN, disconnecting first');
        
        try {
          await disconnectVPN();
          // Wait for network connections to clean up
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (disconnectError) {
          console.error('Error disconnecting before new connection:', disconnectError);
        }
      }
      
      // Determine the configuration type
      const configType = params.connectionType === 'antizapret' ? 'antizapret-config' : 'vpn-config';
      console.log(`Using config type: ${configType}`);
      
      // Fetch the VPN configuration from the server
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      let configContent = null;
      
      try {
        // Make request to get the configuration
        const response = await axios.get(
          `${API_URL}/servers/${params.serverId}/${configType}`, 
          { 
            headers,
            responseType: 'text'
          }
        );
        
        if (response.data) {
          // Configuration might be in different formats
          if (typeof response.data === 'string') {
            configContent = response.data;
          } else if (response.data.config) {
            configContent = response.data.config;
          } else if (response.data.data) {
            configContent = typeof response.data.data === 'string' 
              ? response.data.data 
              : JSON.stringify(response.data.data);
          }
        }
        
        if (!configContent) {
          throw new Error('Received empty configuration from server');
        }
        
        console.log('Received VPN configuration from server');
      } catch (configError) {
        console.error('Error fetching config:', configError.message);
        
        // Check if we have test configurations in the project folder
        try {
          const testConfigPath = path.join(
            __dirname, 
            params.connectionType === 'antizapret' ? 'test-antizapret.ovpn' : 'test-full-vpn.ovpn'
          );
          
          if (fs.existsSync(testConfigPath)) {
            configContent = fs.readFileSync(testConfigPath, 'utf8');
            console.log('Using test configuration from file:', testConfigPath);
          } else {
            throw new Error('Test configuration not found');
          }
        } catch (testConfigError) {
          console.error('Error loading test config:', testConfigError);
          return { 
            success: false, 
            error: 'Не удалось получить конфигурацию VPN' 
          };
        }
      }
      
      // Prepare directory for configs
      const configDir = path.join(app.getPath('userData'), 'configs');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Create config filename based on server ID and connection type
      const configFileName = `${params.serverId}-${params.connectionType || 'fullVpn'}.ovpn`;
      const configPath = path.join(configDir, configFileName);
      
      // Save config to file
      fs.writeFileSync(configPath, configContent);
      console.log('Configuration saved to:', configPath);
      
      // Notify UI
      mainWindow.webContents.send('vpn-log', {
        message: `Connecting to VPN server with ${params.connectionType || 'full'} mode...`,
        level: 'info'
      });
      
      // Use our VPN launcher script for better permission handling
      const launcherScriptPath = path.join(__dirname, 'vpn-launcher.js');
      console.log('Using VPN launcher script:', launcherScriptPath);
      
      // On Windows, we use a special method to elevate privileges
      if (process.platform === 'win32') {
        try {
          // Create a shortcut to launch the script with elevated permissions
          const elevateScriptPath = path.join(configDir, 'vpn-connect.vbs');
          const nodePath = process.execPath; // Path to the Electron/Node executable
          
          // Create VBS script to request elevation
          const scriptContent = `
            Set UAC = CreateObject("Shell.Application")
            UAC.ShellExecute "${nodePath.replace(/\\/g, '\\\\')}", "${launcherScriptPath.replace(/\\/g, '\\\\')} --config ""${configPath.replace(/\\/g, '\\\\')}"" --type ${params.connectionType || 'fullVpn'}", "", "runas", 1
          `;
          
          fs.writeFileSync(elevateScriptPath, scriptContent);
          console.log('Created elevation script at:', elevateScriptPath);
          
          // Run the script (this will trigger UAC prompt)
          const elevateProcess = spawn('wscript.exe', [elevateScriptPath], {
            windowsHide: false,
            detached: true,
            stdio: 'ignore'
          });
          
          // Detach from parent process
          elevateProcess.unref();
          
          // Since we can't directly monitor the elevated process output,
          // we assume the connection is successful after a delay
          // Later we'll check for connection state in a more reliable way
          setTimeout(() => {
            isConnected = true;
            selectedServer = params.serverId;
            
            // Send connected event
            mainWindow.webContents.send('vpn-connected', {
              serverId: params.serverId,
              connectionType: params.connectionType || 'fullVpn'
            });
            
            // Show notification
            new Notification({
              title: 'VPN Подключен',
              body: `Вы подключены к серверу VPN`,
              icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
            }).show();
            
            // Update connection status on server
            updateConnectionStatus(params.serverId, 'connected');
          }, 8000); // Allow 8 seconds for connection
          
          // Start checking connection status periodically
          startConnectionCheck(params.serverId, params.connectionType);
          
          return { 
            success: true, 
            message: 'Соединение устанавливается с повышенными привилегиями...',
            serverId: params.serverId,
            connectionType: params.connectionType || 'fullVpn'
          };
        } catch (elevateError) {
          console.error('Error launching elevated VPN process:', elevateError);
          return {
            success: false,
            error: `Ошибка при запуске VPN с повышенными привилегиями: ${elevateError.message}`
          };
        }
      } else {
        // For non-Windows platforms, use the launcher script directly
        try {
          // Run the launcher script
          const vpnProcess = spawn(process.execPath, [
            launcherScriptPath,
            '--config', configPath,
            '--type', params.connectionType || 'fullVpn'
          ], {
            stdio: 'pipe'
          });
          
          // Set up event handlers for the VPN process
          vpnProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('VPN launcher output:', output);
            
            // Send log to UI
            mainWindow.webContents.send('vpn-log', {
              message: output,
              level: 'info'
            });
            
            // Check for successful connection in output
            if (output.includes('VPN CONNECTED SUCCESSFULLY') || 
                output.includes('Initialization Sequence Completed')) {
              
              // Update connection state
              isConnected = true;
              selectedServer = params.serverId;
              
              // Send connected event
              mainWindow.webContents.send('vpn-connected', {
                serverId: params.serverId,
                connectionType: params.connectionType || 'fullVpn'
              });
              
              // Show notification
              new Notification({
                title: 'VPN Подключен',
                body: `Вы подключены к серверу VPN`,
                icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
              }).show();
              
              // Update connection status on server
              updateConnectionStatus(params.serverId, 'connected');
            }
          });
          
          vpnProcess.stderr.on('data', (data) => {
            const error = data.toString();
            console.error('VPN launcher error:', error);
            
            // Send error to UI
            mainWindow.webContents.send('vpn-log', {
              message: error,
              level: 'error'
            });
          });
          
          vpnProcess.on('close', (code) => {
            console.log(`VPN launcher process closed with code ${code}`);
            
            // Only handle as a disconnection if we were connected
            if (isConnected) {
              isConnected = false;
              
              // Send disconnected event
              mainWindow.webContents.send('vpn-disconnected');
              mainWindow.webContents.send('vpn-log', {
                message: 'Отключено от VPN',
                level: 'info'
              });
              
              // Update connection status on server
              updateConnectionStatus(selectedServer, 'disconnected');
              
              selectedServer = null;
              vpnProcess = null;
            }
          });
          
          return { 
            success: true, 
            message: 'Соединение устанавливается...',
            serverId: params.serverId,
            connectionType: params.connectionType || 'fullVpn'
          };
        } catch (spawnError) {
          console.error('Error starting VPN launcher:', spawnError);
          return {
            success: false,
            error: `Не удалось запустить VPN: ${spawnError.message}`
          };
        }
      }
    } catch (error) {
      console.error('Error connecting to VPN:', error);
      return { 
        success: false, 
        error: error.message || 'Неизвестная ошибка при подключении к VPN' 
      };
    }
  });
  
  // Function to periodically check VPN connection status
  function startConnectionCheck(serverId, connectionType) {
    // Clear any existing check interval
    if (global.connectionCheckInterval) {
      clearInterval(global.connectionCheckInterval);
    }
    
    // Set up new check interval
    global.connectionCheckInterval = setInterval(async () => {
      // Implement a connection check logic here
      // For now, we'll use a simplified check
      
      try {
        // If we're still in connected state, verify the connection
        if (isConnected && selectedServer === serverId) {
          // Check if OpenVPN process is still running (Windows-specific)
          if (process.platform === 'win32') {
            exec('tasklist /FI "IMAGENAME eq openvpn.exe" /FO CSV /NH', (error, stdout) => {
              if (error) {
                console.error('Error checking OpenVPN process:', error);
                return;
              }
              
              // If OpenVPN is not in the process list, we're disconnected
              if (!stdout.includes('openvpn.exe')) {
                console.log('OpenVPN process not found, marking as disconnected');
                
                isConnected = false;
                const disconnectedServer = selectedServer; // Save for status update
                selectedServer = null;
                
                // Send disconnected event
                mainWindow.webContents.send('vpn-disconnected');
                mainWindow.webContents.send('vpn-log', {
                  message: 'Соединение с VPN потеряно',
                  level: 'warning'
                });
                
                // Update connection status on server
                updateConnectionStatus(disconnectedServer, 'disconnected');
                
                // Clear the check interval
                clearInterval(global.connectionCheckInterval);
                global.connectionCheckInterval = null;
              }
            });
          }
        } else {
          // If we're no longer connected, clear the interval
          clearInterval(global.connectionCheckInterval);
          global.connectionCheckInterval = null;
        }
      } catch (error) {
        console.error('Error in connection check:', error);
      }
    }, 10000); // Check every 10 seconds
  }
  
  // Improved disconnect-vpn handler using the launcher script
  ipcMain.handle('disconnect-vpn', async () => {
    console.log('Disconnect VPN requested');
    
    try {
      // If we're not connected, just return success
      if (!isConnected) {
        console.log('No active VPN connection to disconnect');
        return { 
          success: true, 
          message: 'Нет активного подключения VPN' 
        };
      }
      
      const serverId = selectedServer;
      
      // Use our launcher script for disconnection on Windows
      if (process.platform === 'win32') {
        try {
          const launcherScriptPath = path.join(__dirname, 'vpn-launcher.js');
          const configDir = path.join(app.getPath('userData'), 'configs');
          const elevateScriptPath = path.join(configDir, 'vpn-disconnect.vbs');
          const nodePath = process.execPath;
          
          // Create VBS script to request elevation for disconnect
          const scriptContent = `
            Set UAC = CreateObject("Shell.Application")
            UAC.ShellExecute "${nodePath.replace(/\\/g, '\\\\')}", "${launcherScriptPath.replace(/\\/g, '\\\\')} --action disconnect", "", "runas", 1
          `;
          
          fs.writeFileSync(elevateScriptPath, scriptContent);
          console.log('Created disconnect elevation script at:', elevateScriptPath);
          
          // Run the disconnect script
          const elevateProcess = spawn('wscript.exe', [elevateScriptPath], {
            windowsHide: false,
            detached: true,
            stdio: 'ignore'
          });
          
          // Detach from parent process
          elevateProcess.unref();
          
          // Reset connection state
          isConnected = false;
          selectedServer = null;
          
          // Send disconnected event after a short delay
          setTimeout(() => {
            if (mainWindow) {
              mainWindow.webContents.send('vpn-disconnected');
              mainWindow.webContents.send('vpn-log', {
                message: 'Отключено от VPN',
                level: 'info'
              });
            }
            
            // Update connection status on server
            updateConnectionStatus(serverId, 'disconnected');
          }, 2000);
          
          return { 
            success: true, 
            message: 'Отключение от VPN...' 
          };
        } catch (elevateError) {
          console.error('Error launching elevated disconnect process:', elevateError);
          
          // Fallback to direct taskkill method
          try {
            // Force kill any OpenVPN processes
            exec('taskkill /F /IM openvpn.exe', (error, stdout, stderr) => {
              if (error) {
                console.error('Error force killing OpenVPN:', error);
              } else {
                console.log('OpenVPN processes terminated:', stdout);
              }
            });
            
            // Reset connection state
            isConnected = false;
            selectedServer = null;
            
            // Send disconnected event
            mainWindow.webContents.send('vpn-disconnected');
            mainWindow.webContents.send('vpn-log', {
              message: 'Отключено от VPN (принудительно)',
              level: 'warning'
            });
            
            // Update connection status on server
            updateConnectionStatus(serverId, 'disconnected');
            
            return { 
              success: true, 
              message: 'Отключено от VPN (принудительно)' 
            };
          } catch (killError) {
            console.error('Error force killing OpenVPN process:', killError);
            return { 
              success: false, 
              error: `Ошибка при отключении от VPN: ${killError.message}` 
            };
          }
        }
      } else {
        // For non-Windows platforms, use the direct approach
        // Find and kill all OpenVPN processes
        if (process.platform === 'darwin') {
          // macOS
          exec('pkill -f openvpn', (error) => {
            if (error) {
              console.error('Error killing OpenVPN processes:', error);
            }
          });
        } else {
          // Linux
          exec('killall openvpn', (error) => {
            if (error) {
              console.error('Error killing OpenVPN processes:', error);
            }
          });
        }
        
        // Reset connection state
        isConnected = false;
        selectedServer = null;
        
        // Send disconnected event
        mainWindow.webContents.send('vpn-disconnected');
        mainWindow.webContents.send('vpn-log', {
          message: 'Отключено от VPN',
          level: 'info'
        });
        
        // Update connection status on server
        updateConnectionStatus(serverId, 'disconnected');
        
        return { 
          success: true, 
          message: 'Отключено от VPN' 
        };
      }
    } catch (error) {
      console.error('Error in disconnect-vpn handler:', error);
      return { 
        success: false, 
        error: error.message || 'Ошибка при отключении от VPN' 
      };
    }
  });
  
  // Function to find OpenVPN executable path
  function findOpenVpnPath() {
    if (process.platform === 'win32') {
      // Common installation paths on Windows
      const commonPaths = [
        'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
        'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
        path.join(os.homedir(), 'OpenVPN\\bin\\openvpn.exe')
      ];
      
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          console.log('Found OpenVPN at:', p);
          return p;
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS paths
      const macPaths = [
        '/usr/local/bin/openvpn',
        '/usr/bin/openvpn',
        '/opt/homebrew/bin/openvpn'
      ];
      
      for (const p of macPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    } else {
      // Linux likely has it in PATH
      return 'openvpn';
    }
    
    console.error('OpenVPN executable not found');
    return null;
  }
  
  // Function to check if OpenVPN is installed
  function isOpenVPNInstalled() {
    return findOpenVpnPath() !== null;
  }
  
  // Function to update connection status on the server
  async function updateConnectionStatus(serverId, status) {
    if (!serverId || !authToken) {
      console.log('Cannot update connection status: missing serverId or token');
      return false;
    }
    
    try {
      const response = await axios.post(
        `${API_URL}/servers/${serverId}/connection-status`,
        {
          status,
          timestamp: Date.now(),
          platform: process.platform,
          version: APP_VERSION
        },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`Connection status updated for server ${serverId}: ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating connection status:', error.message);
      return false;
    }
  }
  
  // Handle check-auth-state request
  ipcMain.handle('check-auth-state', async () => {
    console.log('Auth state check requested');
    return { 
      isAuthenticated: authState.isAuthenticated,
      user: authState.user 
    };
  });
  
  // Handle load-saved-auth-token request
  ipcMain.handle('load-saved-auth-token', async () => {
    console.log('Loading saved auth token requested');
    
    try {
      const tokenPath = path.join(app.getPath('userData'), 'auth.json');
      
      if (!fs.existsSync(tokenPath)) {
        console.log('No saved auth token found');
        return { success: false, error: 'Токен не найден' };
      }
      
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      if (!tokenData.token) {
        console.log('Token data exists but token is missing');
        return { success: false, error: 'Некорректный формат токена' };
      }
      
      console.log('Found saved token for user:', tokenData.email);
      
      // Verify the token by making a request to the API
      try {
        const response = await axios.get(`${API_URL}/users/me`, {
          headers: {
            'Authorization': `Bearer ${tokenData.token}`
          }
        });
        
        if (response.data && response.data.user) {
          // Update auth state with the user data
          authToken = tokenData.token;
          authState = {
            isAuthenticated: true,
            user: response.data.user,
            token: tokenData.token
          };
          
          console.log('Token verified and user authenticated');
          
          return { 
            success: true, 
            token: tokenData.token,
            user: response.data.user
          };
        } else {
          console.log('Token verification failed - invalid response');
          return { success: false, error: 'Токен недействителен' };
        }
      } catch (verifyError) {
        console.error('Token verification failed:', verifyError.message);
        
        // If verification fails, remove the invalid token
        try {
          fs.unlinkSync(tokenPath);
          console.log('Removed invalid token file');
        } catch (removeError) {
          console.error('Error removing token file:', removeError);
        }
        
        return { success: false, error: 'Токен недействителен или истек' };
      }
    } catch (error) {
      console.error('Error loading saved auth token:', error);
      return { success: false, error: 'Ошибка при загрузке токена' };
    }
  });
  
  // Handle get-user-info request
  ipcMain.handle('get-user-info', async () => {
    console.log('User info requested');
    if (authState.isAuthenticated && authState.user) {
      return { 
        success: true, 
        user: authState.user 
      };
    } else {
      return { 
        success: false, 
        error: 'Пользователь не авторизован' 
      };
    }
  });
  
  // Handle get-server-analytics request to fetch real server analytics
  ipcMain.handle('get-server-analytics', async () => {
    console.log('Server analytics requested');
    
    try {
      // Try to fetch server analytics from the real API
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await axios.get(`${API_URL}/servers/analytics`, { headers });
      
      if (response.data) {
        // The data might be in different formats depending on the API
        let analytics = [];
        
        if (Array.isArray(response.data)) {
          analytics = response.data;
        } else if (response.data.analytics && Array.isArray(response.data.analytics)) {
          analytics = response.data.analytics;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          analytics = response.data.data;
        } else if (typeof response.data === 'object') {
          // Convert object format to array if needed
          analytics = Object.keys(response.data).map(key => ({
            serverId: key,
            ...response.data[key]
          }));
        }
        
        console.log(`Fetched analytics for ${analytics.length} servers from API`);
        return { 
          success: true, 
          analytics: analytics
        };
      } else {
        console.warn('API returned invalid analytics data format');
        throw new Error('Invalid analytics data format');
      }
    } catch (error) {
      console.error('Error fetching server analytics from API:', error.message);
      
      // Return fallback data in case of error
      return { 
        success: true, 
        analytics: [
          { 
            serverId: 'server1', 
            activeConnections: 42, 
            loadAverage: 0.31, 
            uptime: 1234567 
          },
          { 
            serverId: 'server2', 
            activeConnections: 18, 
            loadAverage: 0.22, 
            uptime: 2345678 
          }
        ],
        fallback: true
      };
    }
  });
  
  // Handle check-vpn-status request
  ipcMain.handle('check-vpn-status', async () => {
    console.log('VPN status check requested');
    return { 
      connected: isConnected, 
      server: selectedServer ? {
        id: selectedServer,
        name: selectedServer === 'server1' ? 'Russia Server' : 'Europe Server',
        location: selectedServer === 'server1' ? 'Moscow' : 'Amsterdam'
      } : null 
    };
  });
  
  // Handle show-notification request
  ipcMain.handle('show-notification', async (event, notification) => {
    console.log('Notification requested:', notification);
    
    try {
      new Notification({
        title: notification.title || 'BeNice VPN',
        body: notification.body || '',
        icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
      }).show();
      
      return { success: true };
    } catch (error) {
      console.error('Error showing notification:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Handle auto-select-server request
  ipcMain.handle('auto-select-server', async () => {
    console.log('Auto-select server requested');
    // Return mock result for testing
    return { 
      success: true, 
      server: { 
        _id: 'server2', 
        name: 'Europe Server', 
        location: 'Amsterdam', 
        status: 'active',
        analytics: {
          activeConnections: 18,
          loadAverage: 0.22
        }
      } 
    };
  });
  
  // Handle update-connection-status request
  ipcMain.handle('update-connection-status', async (event, params) => {
    console.log('Connection status update requested:', params);
    return { success: true };
  });
}

console.log('Main process initialization complete');
