// Глобальные переменные
let servers = [];
let selectedServer = null;
let isConnected = false;
let connectionType = 'fullVpn';  // По умолчанию полный VPN
let userInfo = null;

// Константы для классификации нагрузки
const LOAD_LEVELS = {
  LOW: { max: 30, class: 'server-load-low', text: 'Низкая' },
  MEDIUM: { max: 70, class: 'server-load-medium', text: 'Средняя' },
  HIGH: { max: 100, class: 'server-load-high', text: 'Высокая' }
};

// DOM элементы
const elements = {
  serverList: document.getElementById('server-list'),
  serverInfo: document.getElementById('server-info'),
  connectionControls: document.getElementById('connection-controls'),
  activeConnections: document.getElementById('active-connections'),
  serverLoadValue: document.getElementById('server-load-value'),
  serverLoadBar: document.getElementById('server-load-bar'),
  statusIndicator: document.getElementById('status-indicator'),
  statusText: document.getElementById('status-text'),
  connectionType: document.getElementById('connection-type'),
  logContainer: document.getElementById('log-container'),
  userEmail: document.getElementById('user-email'),
  logoutBtn: document.getElementById('logout-btn')
};

// Добавляем запись в лог
function addLogEntry(message) {
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.textContent = message;
  elements.logContainer.appendChild(logEntry);
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
}

// Функция для форматирования уровня нагрузки
function formatLoadLevel(load) {
  if (load <= LOAD_LEVELS.LOW.max) {
    return LOAD_LEVELS.LOW;
  } else if (load <= LOAD_LEVELS.MEDIUM.max) {
    return LOAD_LEVELS.MEDIUM;
  } else {
    return LOAD_LEVELS.HIGH;
  }
}

// Отображаем список серверов
function renderServerList(servers) {
  // Очищаем текущий список
  elements.serverList.innerHTML = '';
  
  if (!servers || servers.length === 0) {
    elements.serverList.innerHTML = `
      <div class="no-servers">
        <p>Серверы не найдены</p>
        <p>Проверьте подключение к интернету</p>
      </div>
    `;
    return;
  }
  
  // Сортируем серверы: сначала рекомендуемые, затем по нагрузке (от низкой к высокой)
  const sortedServers = [...servers].sort((a, b) => {
    // Сначала сортировка по доступности
    if (a.available && !b.available) return -1;
    if (!a.available && b.available) return 1;
    
    // Затем по рекомендуемости
    if (a.isRecommended && !b.isRecommended) return -1;
    if (!a.isRecommended && b.isRecommended) return 1;
    
    // Наконец по нагрузке (от низкой к высокой)
    return (a.load || 0) - (b.load || 0);
  });
  
  // Добавляем серверы в список
  sortedServers.forEach(server => {
    // Проверяем, является ли сервер тем, к которому мы подключены
    const isCurrentServer = isConnected && selectedServer && selectedServer._id === server._id;
    
    // Расчет показателей нагрузки с учетом данных с сервера
    let activeConnections = server.activeConnections || 0;
    
    // Если это текущий сервер и мы подключены, устанавливаем минимум 1 подключение
    if (isCurrentServer) {
      activeConnections = Math.max(1, activeConnections);
    }
    
    const maxConnections = server.maxConnections || 100;
    const load = server.load !== undefined ? server.load : Math.floor((activeConnections / maxConnections) * 100);
    
    // Определяем класс нагрузки
    const loadLevel = formatLoadLevel(load);
    
    // Создаем элемент для сервера
    const serverItem = document.createElement('div');
    serverItem.className = `server-item ${selectedServer && selectedServer._id === server._id ? 'active' : ''}`;
    serverItem.setAttribute('data-id', server._id);
    
    // Формируем HTML содержимое элемента
    serverItem.innerHTML = `
      <div class="server-header">
        <span class="server-name">${server.name}</span>
        <span class="server-load ${loadLevel.class}">${load}%</span>
      </div>
      <div class="server-country">${server.country || 'Неизвестно'}</div>
      <div class="server-status-wrapper">
        <span class="status-dot ${server.available !== false ? 'available' : 'unavailable'}"></span>
        <span class="status-text">${server.available !== false ? 'Доступен' : 'Недоступен'}</span>
      </div>
      <div class="server-connections">Подключено: <b>${activeConnections}</b> / ${maxConnections}</div>
    `;
    
    // Добавляем обработчик клика
    serverItem.addEventListener('click', () => selectServer(server));
    
    // Добавляем сервер в список
    elements.serverList.appendChild(serverItem);
  });
}

// Выбор сервера
function selectServer(server) {
  // Если уже подключены и выбран другой сервер, спрашиваем подтверждение
  if (isConnected && selectedServer && selectedServer._id !== server._id) {
    const confirmSwitch = confirm(`Вы уже подключены к серверу: ${selectedServer.name}.\nОтключиться и подключиться к серверу: ${server.name}?`);
    if (!confirmSwitch) {
      addLogEntry('Переключение отменено пользователем.');
      return;
    }
    // Отключаемся, затем выбираем новый сервер
    disconnectFromVPN().then(() => {
      selectedServer = server;
      renderServerInfo(server);
      updateConnectionControls();
      updateServerStatistics(server);
      addLogEntry(`Выбран сервер: ${server.name}`);
    });
    return;
  }
  // Сохраняем выбранный сервер
  selectedServer = server;
  
  // Обновляем UI - активный сервер в списке
  const serverItems = document.querySelectorAll('.server-item');
  serverItems.forEach(item => {
    if (item.getAttribute('data-id') === server._id) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Показываем информацию о сервере
  renderServerInfo(server);
  
  // Обновляем элементы управления подключением
  updateConnectionControls();
  
  // Обновляем статистику
  updateServerStatistics(server);
  
  addLogEntry(`Выбран сервер: ${server.name}`);
}

// Отображаем информацию о сервере
function renderServerInfo(server) {
  if (!server) {
    elements.serverInfo.innerHTML = '<p class="text-muted text-center">Выберите сервер из списка</p>';
    return;
  }
  
  // Получаем дополнительную информацию о нагрузке сервера
  const activeConnections = server.activeConnections || 0;
  const maxConnections = server.maxConnections || 100;
  let load = server.load;
  let loadLevel;
  let loadText;
  if (load === undefined || load === null) {
    loadText = '<span class="text-muted">нет данных</span>';
    loadLevel = { class: 'server-load-unknown', text: 'нет данных' };
    load = '';
  } else {
    loadLevel = formatLoadLevel(load);
    loadText = `<span class="${loadLevel.class}">${load}% (${loadLevel.text})</span>`;
  }
  
  // Отображаем информацию о сервере
  elements.serverInfo.innerHTML = `
    <div class="server-info-item">
      <div class="info-label">Название:</div>
      <div class="info-value">${server.name}</div>
    </div>
    <div class="server-info-item">
      <div class="info-label">Страна:</div>
      <div class="info-value">${server.country || 'Не указана'}</div>
    </div>
    <div class="server-info-item">
      <div class="info-label">Город:</div>
      <div class="info-value">${server.city || 'Не указан'}</div>
    </div>
    <div class="server-info-item">
      <div class="info-label">Статус:</div>
      <div class="info-value">
        <span class="status-dot ${server.available !== false ? 'available' : 'unavailable'}"></span>
        <span>${server.available !== false ? 'Доступен' : 'Недоступен'}</span>
      </div>
    </div>
    <div class="server-info-item">
      <div class="info-label">Нагрузка:</div>
      <div class="info-value">${loadText}</div>
    </div>
    <div class="server-info-item">
      <div class="info-label">Подключения:</div>
      <div class="info-value">${activeConnections} / ${maxConnections}</div>
    </div>
  `;
}

// Обновляем элементы управления подключением
function updateConnectionControls() {
  if (!selectedServer) {
    elements.connectionControls.innerHTML = `
      <p class="text-muted text-center">Выберите сервер для подключения</p>
    `;
    return;
  }
  
  // Если сервер недоступен, показываем предупреждение
  if (selectedServer.available === false) {
    elements.connectionControls.innerHTML = `
      <div class="alert alert-warning">
        <p>Этот сервер в настоящее время недоступен.</p>
        <p>Пожалуйста, выберите другой сервер.</p>
      </div>
    `;
    return;
  }
  
  // Если уже подключены к этому серверу
  if (isConnected && selectedServer) {
    elements.connectionControls.innerHTML = `
      <button id="disconnect-button" class="btn btn-danger">Отключиться</button>
      <p class="mt-2 text-center">Подключен к серверу: ${selectedServer.name}</p>
    `;
    
    document.getElementById('disconnect-button').addEventListener('click', disconnectFromVPN);
  } else {
    // Если не подключены или выбран другой сервер
    elements.connectionControls.innerHTML = `
      <button id="connect-button" class="btn btn-primary">Подключиться</button>
      <button id="auto-select-button" class="btn btn-secondary mt-2">Автовыбор сервера</button>
    `;
    
    document.getElementById('connect-button').addEventListener('click', connectToVPN);
    document.getElementById('auto-select-button').addEventListener('click', autoSelectServer);
  }
}

// Обновляем статистику сервера
function updateServerStatistics(server) {
  if (!server) return;
  
  const activeConnections = server.activeConnections || 0;
  const maxConnections = server.maxConnections || 100;
  let load = server.load;
  let loadLevel;
  if (load === undefined || load === null) {
    elements.serverLoadValue.textContent = 'нет данных';
    elements.serverLoadValue.className = 'server-load-unknown';
    elements.serverLoadBar.style.width = '0%';
    elements.serverLoadBar.className = 'progress-bar progress-bar-unknown';
    elements.activeConnections.textContent = activeConnections;
    return;
  }
  loadLevel = formatLoadLevel(load);
  
  // Обновляем отображение активных подключений
  elements.activeConnections.textContent = activeConnections;
  
  // Обновляем значение нагрузки
  elements.serverLoadValue.textContent = `${load}% (${loadLevel.text})`;
  elements.serverLoadValue.className = loadLevel.class;
  
  // Обновляем прогресс-бар нагрузки
  elements.serverLoadBar.style.width = `${load}%`;
  elements.serverLoadBar.className = `progress-bar progress-bar-${loadLevel.class.split('-').pop()}`;
}

// Автоматический выбор оптимального сервера
async function autoSelectServer() {
  try {
    addLogEntry('Поиск оптимального сервера...');
    
    // Запрашиваем оптимальный сервер с балансировкой нагрузки
    const result = await window.vpnAPI.autoSelectServer();
    
    if (result.success && result.serverId) {
      // Находим сервер по ID
      const optimalServer = servers.find(s => s._id === result.serverId);
      
      if (optimalServer) {
        addLogEntry(`Автоматически выбран оптимальный сервер: ${optimalServer.name}`);
        selectServer(optimalServer);
      } else {
        addLogEntry('Ошибка: Оптимальный сервер не найден в списке');
      }
    } else {
      addLogEntry(`Ошибка при автоматическом выборе сервера: ${result.error || 'Неизвестная ошибка'}`);
    }
  } catch (error) {
    console.error('Ошибка при автовыборе сервера:', error);
    addLogEntry(`Ошибка при автоматическом выборе сервера: ${error.message}`);
  }
}

// Подключение к VPN
async function connectToVPN() {
  try {
    if (!selectedServer) {
      addLogEntry('Ошибка: Не выбран сервер для подключения');
      return;
    }
    
    // Получаем выбранный тип подключения
    connectionType = elements.connectionType.value;
    
    addLogEntry(`Подключаемся к серверу ${selectedServer.name} (${connectionType})...`);
    
    // Обновляем состояние подключения в UI
    updateConnectionStatus('connecting');
    
    // Загружаем конфигурацию
    addLogEntry('Загрузка конфигурации VPN...');
    
    try {
      // Отправляем запрос на загрузку конфигурации и подключение
      const result = await window.vpnAPI.connectToVPN({
        serverId: selectedServer._id,
        connectionType: connectionType
      });
      
      if (result.success) {
        addLogEntry('Подключение инициировано успешно.');
        
        // Проверка статуса через несколько секунд для отслеживания успешного подключения
        setTimeout(async () => {
          const status = await window.vpnAPI.getConnectionStatus();
          if (status.connected) {
            // Подключение успешно
            isConnected = true;
            updateConnectionStatus('connected');
            updateConnectionControls();
            
            // Увеличиваем локальный счетчик подключений для текущего сервера на 1
            if (selectedServer) {
              selectedServer.activeConnections = (selectedServer.activeConnections || 0) + 1;
              // Обновляем отображение информации о сервере
              renderServerInfo(selectedServer);
              updateServerStatistics(selectedServer);
            }
            
            // Обновляем статистику на сервере
            await window.vpnAPI.updateConnectionStatus({
              serverId: selectedServer._id,
              status: 'connected'
            });
            
            // Перезапрашиваем статистику сервера
            setTimeout(fetchServersWithAnalytics, 2000);
          }
        }, 5000);
      } else {
        addLogEntry(`Ошибка при подключении: ${result.message || 'Неизвестная ошибка'}`);
        updateConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error('Ошибка при запросе подключения:', error);
      addLogEntry(`Ошибка при подключении: ${error.message}`);
      updateConnectionStatus('disconnected');
    }
  } catch (error) {
    console.error('Общая ошибка при подключении:', error);
    addLogEntry(`Ошибка: ${error.message}`);
    updateConnectionStatus('disconnected');
  }
}

// Отключение от VPN
async function disconnectFromVPN() {
  try {
    addLogEntry('Отключение от VPN...');
    
    // Обновляем состояние в UI
    updateConnectionStatus('disconnecting');
    
    // Отправляем запрос на отключение
    const result = await window.vpnAPI.disconnectFromVPN();
    
    if (result.success) {
      addLogEntry('Успешно отключено от VPN.');
      isConnected = false;
      
      // Уменьшаем локальный счетчик подключений для ранее подключенного сервера
      if (selectedServer && selectedServer.activeConnections > 0) {
        selectedServer.activeConnections -= 1;
        // Обновляем отображение информации о сервере
        renderServerInfo(selectedServer);
        updateServerStatistics(selectedServer);
      }
      
      updateConnectionStatus('disconnected');
      updateConnectionControls();
      
      // Обновляем статистику на сервере
      if (selectedServer) {
        await window.vpnAPI.updateConnectionStatus({
          serverId: selectedServer._id,
          status: 'disconnected'
        });
      }
      
      // Перезапрашиваем статистику сервера
      setTimeout(fetchServersWithAnalytics, 2000);
    } else {
      addLogEntry(`Ошибка при отключении: ${result.message}`);
      updateConnectionStatus('unknown');
    }
  } catch (error) {
    console.error('Ошибка при отключении:', error);
    addLogEntry(`Ошибка при отключении: ${error.message}`);
  }
}

// Обновление статуса подключения в UI
function updateConnectionStatus(status) {
  // Удаляем все классы статуса
  elements.statusIndicator.classList.remove('status-connected', 'status-disconnected', 'status-connecting');
  
  switch (status) {
    case 'connected':
      elements.statusIndicator.classList.add('status-connected');
      elements.statusText.textContent = 'Подключено';
      elements.statusText.classList.add('text-success');
      elements.statusText.classList.remove('text-danger', 'text-warning');
      break;
    
    case 'connecting':
    case 'disconnecting':
      elements.statusIndicator.classList.add('status-connecting');
      elements.statusText.textContent = status === 'connecting' ? 'Подключение...' : 'Отключение...';
      elements.statusText.classList.add('text-warning');
      elements.statusText.classList.remove('text-success', 'text-danger');
      break;
    
    case 'disconnected':
    default:
      elements.statusIndicator.classList.add('status-disconnected');
      elements.statusText.textContent = 'Отключено';
      elements.statusText.classList.add('text-danger');
      elements.statusText.classList.remove('text-success', 'text-warning');
      break;
  }
}

// Получение и обработка логов VPN
function setupVPNLogListeners() {
  // Слушаем логи от процесса VPN
  window.vpnAPI.onVpnLog((log) => {
    addLogEntry(log);
    
    // Проверяем сообщение о завершении подключения
    if (log.includes('Initialization Sequence Completed')) {
      isConnected = true;
      updateConnectionStatus('connected');
      updateConnectionControls();
      
      // Увеличиваем локальный счетчик подключений для текущего сервера на 1
      if (selectedServer) {
        selectedServer.activeConnections = (selectedServer.activeConnections || 0) + 1;
        // Обновляем отображение информации о сервере
        renderServerInfo(selectedServer);
        updateServerStatistics(selectedServer);
      }
    }
  });
  
  // Слушаем ошибки от процесса VPN
  window.vpnAPI.onVpnError((error) => {
    addLogEntry(`Ошибка: ${error}`);
  });
  
  // Слушаем событие отключения VPN
  window.vpnAPI.onVpnDisconnected(() => {
    isConnected = false;
    updateConnectionStatus('disconnected');
    updateConnectionControls();
    addLogEntry('VPN отключен.');
  });
  
  // Слушаем событие подключения VPN
  window.vpnAPI.onVpnConnected((data) => {
    isConnected = true;
    if (data && data.server) {
      selectedServer = data.server;
    }
    updateConnectionStatus('connected');
    updateConnectionControls();
    
    // Увеличиваем локальный счетчик подключений для текущего сервера на 1
    if (selectedServer) {
      selectedServer.activeConnections = Math.max(1, (selectedServer.activeConnections || 0) + 1);
      // Обновляем отображение информации о сервере
      renderServerInfo(selectedServer);
      updateServerStatistics(selectedServer);
    }
    
    addLogEntry(`VPN успешно подключен к серверу ${selectedServer ? selectedServer.name : ''}.`);
  });
}

// Отображение информации о пользователе
function renderUserInfo(user) {
  if (user && user.email) {
    elements.userEmail.textContent = user.email;
    userInfo = user;
  } else {
    elements.userEmail.textContent = 'Не авторизован';
  }
}

// Показываем форму авторизации и настраиваем обработчики событий
function showLoginForm() {
  console.log('showLoginForm called');
  try {
    // Показываем контейнер авторизации
    const authContainer = document.getElementById('auth-container');
    if (authContainer) {
      authContainer.style.display = 'flex';
    
      // Получаем элементы формы
      const loginBtn = document.getElementById('login-btn');
      const emailInput = document.getElementById('email');
      const keyInput = document.getElementById('key');
      const authError = document.getElementById('auth-error');
      const rememberMe = document.getElementById('remember-me');
    
      // Очищаем сообщения об ошибках
      if (authError) {
        authError.style.display = 'none';
        authError.textContent = '';
      }
    
      // Добавляем обработчик клика на кнопку "Войти"
      if (loginBtn) {
        // Удаляем все существующие обработчики событий, чтобы избежать дублирования
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        // Добавляем новый обработчик
        newLoginBtn.addEventListener('click', async () => {
          console.log('Клик по кнопке Войти');
          try {
            // Проверяем, что поля заполнены
            const email = emailInput.value.trim();
            const key = keyInput.value.trim();
            if (!email || !key) {
              if (authError) {
                authError.textContent = 'Пожалуйста, заполните все поля';
                authError.style.display = 'block';
              }
              return;
            }
            newLoginBtn.disabled = true;
            newLoginBtn.textContent = 'Авторизация...';
            const success = await handleLogin(email, key);
            if (success) {
              authContainer.style.display = 'none';
              if (rememberMe && rememberMe.checked) {
                await window.vpnAPI.saveAuthCredentials({ email, key, remember: true });
              }
            } else {
              if (authError) {
                authError.textContent = 'Неверные учетные данные или ошибка сервера';
                authError.style.display = 'block';
              }
            }
            newLoginBtn.disabled = false;
            newLoginBtn.textContent = 'Войти';
          } catch (error) {
            console.error('Ошибка при обработке входа:', error);
            if (authError) {
              authError.textContent = `Ошибка: ${error.message}`;
              authError.style.display = 'block';
            }
            newLoginBtn.disabled = false;
            newLoginBtn.textContent = 'Войти';
          }
        });
      }
      
      // Добавляем обработчик для Enter в полях ввода
      const handleEnterPress = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          loginBtn.click();
        }
      };
      
      if (emailInput) {
        emailInput.addEventListener('keypress', handleEnterPress);
      }
      
      if (keyInput) {
        keyInput.addEventListener('keypress', handleEnterPress);
      }
    } else {
      console.error('Ошибка: контейнер авторизации не найден');
      addLogEntry('Ошибка: форма авторизации не найдена');
    }
  } catch (error) {
    console.error('Ошибка при показе формы авторизации:', error);
    addLogEntry(`Ошибка при показе формы авторизации: ${error.message}`);
  }
}

// Скрытие формы авторизации
function hideLoginForm() {
  const authContainer = document.getElementById('auth-container');
  if (authContainer) {
    authContainer.style.display = 'none';
  }
}

// Получение и обработка аналитики серверов
async function fetchServerAnalytics() {
  try {
    console.log('Запрос аналитики серверов...');
    
    const analyticsResult = await window.vpnAPI.getServerAnalytics();
    console.log('Результат запроса аналитики:', analyticsResult);
    
    // Добавляем детальную проверку ответа
    if (analyticsResult && analyticsResult.success && Array.isArray(analyticsResult.analytics)) {
      // Обновляем данные о нагрузке серверов
      return { success: true, analytics: analyticsResult.analytics };
    } else if (analyticsResult && Array.isArray(analyticsResult.analytics)) {
      // Альтернативный формат ответа
      return { success: true, analytics: analyticsResult.analytics };
    } else if (analyticsResult && analyticsResult.warning) {
      // Данные из кэша или с предупреждением
      console.warn('Предупреждение при получении аналитики:', analyticsResult.warning);
      if (Array.isArray(analyticsResult.analytics)) {
        return { success: true, analytics: analyticsResult.analytics, warning: analyticsResult.warning };
      }
    }
    
    // Если ни один из форматов не подошел
    console.warn('Неизвестный формат данных аналитики:', analyticsResult);
    return { 
      success: false, 
      error: 'Неизвестный формат данных аналитики',
      analyticsResult
    };
  } catch (error) {
    console.error('Ошибка при получении аналитики серверов:', error);
    return { success: false, error: error.message };
  }
}

// Запрос данных серверов с аналитикой - с улучшенной обработкой ошибок
async function fetchServersWithAnalytics() {
  try {
    addLogEntry('Запрос списка серверов...');
    
    // Сохраняем ID выбранного сервера и его состояние подключения перед обновлением
    const previousSelectedServerId = selectedServer ? selectedServer._id : null;
    const wasConnected = isConnected;
    
    // Проверка доступности API
    if (!window.vpnAPI) {
      console.error('ОШИБКА: window.vpnAPI не определен');
      addLogEntry('Критическая ошибка: API не доступен. Пожалуйста, перезапустите приложение.');
      renderError('API недоступен. Перезапустите приложение.');
      return;
    }
    
    // Получаем список серверов
    const serversResult = await window.vpnAPI.getServers();
    console.log('Результат запроса серверов:', serversResult);
    
    if (!serversResult.success) {
      if (serversResult.authRequired) {
        console.log('Требуется авторизация для получения списка серверов');
        addLogEntry('Требуется авторизация для получения списка серверов');
        // Показываем форму авторизации
        showLoginForm();
        return;
      }
      
      const errorMessage = `Ошибка при получении списка серверов: ${serversResult.error || 'Неизвестная ошибка'}`;
      console.error(errorMessage);
      addLogEntry(errorMessage);
      
      // Если есть запасные серверы, используем их
      if (serversResult.servers && serversResult.servers.length > 0) {
        console.log('Используем запасные серверы:', serversResult.servers);
        servers = serversResult.servers;
        renderServerList(servers);
      } else {
        renderError('Не удалось загрузить список серверов');
      }
      return;
    }
    
    // Сохраняем список серверов
    servers = serversResult.servers || [];
    console.log(`Получено ${servers.length} серверов`);
    
    // Получаем аналитику серверов для обновления данных о нагрузке
    try {
      console.log('Запрашиваем аналитику серверов');
      const analyticsResult = await fetchServerAnalytics();
      console.log('Обработанный результат аналитики:', analyticsResult);
      
      if (analyticsResult.success && analyticsResult.analytics) {
        // Проверяем, что analytics это массив
        const analytics = Array.isArray(analyticsResult.analytics) 
          ? analyticsResult.analytics 
          : [];
        
        console.log(`Получено ${analytics.length} записей аналитики`);
        
        // Обновляем данные о нагрузке серверов
        servers = servers.map(server => {
          const serverAnalytics = analytics.find(a => 
            a.id === server._id || 
            a.serverId === server._id ||
            a.server_id === server._id
          );
          
          // Проверяем, является ли этот сервер выбранным и подключенным
          const isCurrentConnectedServer = wasConnected && 
                                         previousSelectedServerId === server._id;
          
          if (serverAnalytics) {
            // Если это подключенный сервер, убедимся, что счетчик активных подключений как минимум 1
            const activeConnections = isCurrentConnectedServer ? 
              Math.max(1, serverAnalytics.activeConnections || 0) : 
              serverAnalytics.activeConnections || 0;
              
            return {
              ...server,
              activeConnections: activeConnections,
              maxConnections: serverAnalytics.maxConnections || 100,
              load: serverAnalytics.load || Math.floor((activeConnections * 100) / (serverAnalytics.maxConnections || 100))
            };
          }
          
          // Если это подключенный сервер, но на нем нет данных аналитики
          if (isCurrentConnectedServer) {
            return {
              ...server,
              activeConnections: 1,
              maxConnections: 100,
              load: 1
            };
          }
          
          return {
            ...server,
            activeConnections: 0,
            maxConnections: 100,
            load: 0
          };
        });
        
        console.log('Обновлены данные серверов с аналитикой');
      } else {
        console.warn('Аналитика серверов не получена:', analyticsResult.error || 'Ответ не содержит данных аналитики');
        addLogEntry('Не удалось получить данные о нагрузке серверов');
        
        // Устанавливаем дефолтные значения для нагрузки
        servers = servers.map(server => {
          // Если это подключенный сервер, убедимся что счетчик активных подключений как минимум 1
          if (wasConnected && previousSelectedServerId === server._id) {
            return {
              ...server,
              activeConnections: 1,
              maxConnections: 100,
              load: 1
            };
          }
          
          return {
            ...server,
            activeConnections: 0,
            maxConnections: 100,
            load: 0
          };
        });
      }
    } catch (analyticsError) {
      console.error('Ошибка при получении аналитики серверов:', analyticsError);
      addLogEntry('Не удалось получить актуальные данные о нагрузке серверов');
    }
    
    // Отображаем список серверов
    renderServerList(servers);
    
    // Если список серверов пуст, показываем сообщение
    if (!servers || servers.length === 0) {
      console.warn('Получен пустой список серверов');
      addLogEntry('Получен пустой список серверов');
      renderError('Список серверов пуст. Проверьте подключение к интернету.');
      return;
    }
    
    // Если ранее был выбран сервер, пытаемся его найти в новом списке
    if (previousSelectedServerId) {
      const updatedServer = servers.find(s => s._id === previousSelectedServerId);
      if (updatedServer) {
        // Если мы были подключены, восстановим это состояние
        if (wasConnected) {
          updatedServer.activeConnections = Math.max(1, updatedServer.activeConnections || 0);
        }
        
        selectedServer = updatedServer;
        renderServerInfo(updatedServer);
        updateConnectionControls();
        updateServerStatistics(updatedServer);
      }
    } 
    // Если сервер не был выбран и есть рекомендуемый сервер, выбираем его
    else if (!selectedServer && servers.length > 0) {
      // Ищем рекомендуемый сервер
      const recommendedServer = servers.find(s => s.isRecommended);
      
      // Если есть рекомендуемый сервер, выбираем его
      if (recommendedServer) {
        selectServer(recommendedServer);
      } 
      // Иначе выбираем сервер с наименьшей нагрузкой
      else {
        // Сортируем серверы по нагрузке (от низкой к высокой)
        const sortedByLoad = [...servers]
          .filter(s => s.available !== false) // только доступные серверы
          .sort((a, b) => (a.load || 0) - (b.load || 0));
        
        // Выбираем первый сервер (с наименьшей нагрузкой)
        if (sortedByLoad.length > 0) {
          selectServer(sortedByLoad[0]);
        }
        // Если доступных серверов нет, берем первый из списка
        else if (servers.length > 0) {
          selectServer(servers[0]);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при запросе серверов:', error);
    addLogEntry(`Ошибка при получении списка серверов: ${error.message}`);
    renderError(`Ошибка: ${error.message}. Проверьте подключение.`);
  }
}

// Функция для отображения ошибок в интерфейсе
function renderError(message) {
  // Отображаем ошибку в списке серверов
  if (elements.serverList) {
    elements.serverList.innerHTML = `
      <div class="error">
        <p><i class="fa fa-exclamation-triangle"></i> ${message}</p>
        <button id="retry-button" class="btn btn-primary mt-3">Повторить</button>
      </div>
    `;
    
    // Добавляем обработчик для кнопки "Повторить"
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
      retryButton.addEventListener('click', fetchServersWithAnalytics);
    }
  }
}

// Проверка статуса подключения при загрузке
async function checkConnectionStatus() {
  try {
    const status = await window.vpnAPI.getConnectionStatus();
    
    isConnected = status.connected;
    if (status.connected && status.server) {
      selectedServer = status.server;
      
      // Убеждаемся, что активные подключения как минимум 1
      if (selectedServer) {
        selectedServer.activeConnections = Math.max(1, selectedServer.activeConnections || 0);
      }
      
      updateConnectionStatus('connected');
      updateConnectionControls();
      
      // Обновляем отображение для сервера
      renderServerInfo(selectedServer);
      updateServerStatistics(selectedServer);
    } else {
      updateConnectionStatus('disconnected');
    }
    
    updateConnectionControls();
  } catch (error) {
    console.error('Ошибка при проверке статуса подключения:', error);
    updateConnectionStatus('disconnected');
  }
}

// Обработка авторизации пользователя
async function handleLogin(email, key) {
  try {
    addLogEntry(`Авторизация пользователя: ${email}...`);
    
    const result = await window.vpnAPI.login({ email, password: key });
    
    if (result.success) {
      addLogEntry('Авторизация успешна!');
      renderUserInfo(result.user);
      
      // После успешной авторизации запрашиваем список серверов
      fetchServersWithAnalytics();
      
      return true;
    } else {
      addLogEntry(`Ошибка авторизации: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('Ошибка при авторизации:', error);
    addLogEntry(`Ошибка авторизации: ${error.message}`);
    return false;
  }
}

// Выход из системы
async function handleLogout() {
  try {
    // Если подключены к VPN, сначала отключаемся
    if (isConnected) {
      await disconnectFromVPN();
    }
    
    addLogEntry('Выход из системы...');
    
    // Отправляем запрос на выход
    const result = await window.vpnAPI.logout();
    
    if (result.success) {
      addLogEntry('Выход выполнен успешно');
      userInfo = null;
      renderUserInfo(null);
      
      // Перезагрузка страницы для сброса состояния
      window.location.reload();
    } else {
      addLogEntry(`Ошибка при выходе из системы: ${result.message}`);
    }
  } catch (error) {
    console.error('Ошибка при выходе из системы:', error);
    addLogEntry(`Ошибка при выходе из системы: ${error.message}`);
  }
}

// Экспортируем showLoginForm для ручного вызова из консоли
window.showLoginForm = showLoginForm;

// Инициализация приложения
async function initApp() {
  try {
    addLogEntry('Инициализация приложения...');
    
    console.log('window.vpnAPI:', window.vpnAPI);
    
    // Проверяем наличие сохраненной сессии
    const authState = await window.vpnAPI.checkAuthState();
    
    if (authState.isAuthenticated && authState.user) {
      // Пользователь авторизован
      renderUserInfo(authState.user);
      addLogEntry(`Пользователь авторизован: ${authState.user.email}`);
      
      // Запрашиваем список серверов
      fetchServersWithAnalytics();
    } else {
      // Загружаем сохраненный токен авторизации, если он есть
      const savedToken = await window.vpnAPI.loadSavedAuthToken();
      
      if (savedToken) {
        // Если токен есть, запрашиваем список серверов
        fetchServersWithAnalytics();
        
        // Пытаемся получить информацию о пользователе
        const userInfo = await window.vpnAPI.getUserInfo();
        if (userInfo && userInfo.email) {
          renderUserInfo(userInfo);
        }
      } else {
        // Если нет сохраненного токена, пытаемся получить список серверов
        // Если требуется авторизация, fetchServers покажет форму авторизации
        fetchServersWithAnalytics();
      }
    }
    
    // Настраиваем прослушивание событий VPN
    setupVPNLogListeners();
    
    // Проверяем статус подключения
    checkConnectionStatus();
    
    // Настраиваем обновление статистики серверов каждые 30 секунд
    setInterval(fetchServersWithAnalytics, 30000);
    
    // Добавляем обработчик изменения типа подключения
    if (elements.connectionType) {
      elements.connectionType.addEventListener('change', function() {
        connectionType = this.value;
        addLogEntry(`Выбран тип подключения: ${connectionType}`);
      });
    }
    
    // Добавляем обработчик для кнопки выхода
    if (elements.logoutBtn) {
      elements.logoutBtn.addEventListener('click', handleLogout);
    }

    // Явно вызываем форму авторизации для отладки
    showLoginForm();
  } catch (error) {
    console.error('Ошибка инициализации приложения:', error);
    addLogEntry(`Ошибка инициализации: ${error.message}`);
  }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
  // Инициализируем приложение
  initApp();
});

// Отслеживаем обновления аналитики серверов от основного процесса
window.vpnAPI.onServerAnalyticsUpdated((analytics) => {
  // Обновляем данные о серверах
  if (analytics && analytics.length > 0) {
    // Обновляем существующие данные о серверах
    servers = servers.map(server => {
      const serverAnalytics = analytics.find(a => a.id === server._id);
      
      // Если мы подключены к этому серверу, убедимся, что счетчик подключений не меньше 1
      const isCurrentConnectedServer = isConnected && selectedServer && selectedServer._id === server._id;
      
      if (serverAnalytics) {
        // Для текущего подключенного сервера убедимся, что счетчик как минимум 1
        const activeConnections = isCurrentConnectedServer ? 
          Math.max(1, serverAnalytics.activeConnections || 0) : 
          serverAnalytics.activeConnections || 0;
        
        return {
          ...server,
          activeConnections: activeConnections,
          maxConnections: serverAnalytics.maxConnections || 100,
          load: serverAnalytics.load || 0
        };
      }
      
      // Если это наш текущий подключенный сервер, сохраняем его состояние как минимум с 1 подключением
      if (isCurrentConnectedServer) {
        return {
          ...server,
          activeConnections: Math.max(1, server.activeConnections || 0)
        };
      }
      
      return server;
    });
    
    // Обновляем отображение серверов
    renderServerList(servers);
    
    // Если выбран сервер, обновляем его информацию
    if (selectedServer) {
      const updatedServer = servers.find(s => s._id === selectedServer._id);
      if (updatedServer) {
        // Сохраняем предыдущее значение activeConnections, если мы подключены
        if (isConnected) {
          updatedServer.activeConnections = Math.max(1, updatedServer.activeConnections || 0);
        }
        
        selectedServer = updatedServer;
        renderServerInfo(updatedServer);
        updateServerStatistics(updatedServer);
      }
    }
  }
});