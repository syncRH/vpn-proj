# Интеграция модулей улучшения VPN

## Шаг 1: Добавить методы API в preload.js

Откройте файл `c:\Users\syncRH\vpn-proj\client-windows\preload.js` в любом текстовом редакторе и добавьте следующие методы перед закрывающей скобкой `};` (примерно на строке 451):

```javascript
  // Управление Kill Switch
  toggleKillSwitch: async (enable) => {
    console.log(`preload.js: переключение Kill Switch (${enable ? 'вкл' : 'выкл'})`);
    return ipcRenderer.invoke('kill-switch-toggle', enable);
  },
  
  // Управление Split Tunneling
  toggleSplitTunneling: async (enable) => {
    console.log(`preload.js: переключение Split Tunneling (${enable ? 'вкл' : 'выкл'})`);
    return ipcRenderer.invoke('split-tunneling-toggle', enable);
  },
  
  // Добавление домена в список обхода Split Tunneling
  addDomainToBypass: async (domain) => {
    console.log(`preload.js: добавление домена ${domain} в обход VPN`);
    return ipcRenderer.invoke('split-tunneling-add-domain', domain);
  },
  
  // Удаление домена из списка обхода Split Tunneling
  removeDomainFromBypass: async (domain) => {
    console.log(`preload.js: удаление домена ${domain} из обхода VPN`);
    return ipcRenderer.invoke('split-tunneling-remove-domain', domain);
  },
  
  // Получение конфигурации Split Tunneling
  getSplitTunnelingConfig: async () => {
    console.log('preload.js: запрос конфигурации Split Tunneling');
    return ipcRenderer.invoke('split-tunneling-config');
  },
  
  // Запуск ручного тестирования всех серверов
  forceTestServers: async () => {
    console.log('preload.js: запуск принудительного тестирования серверов');
    return ipcRenderer.invoke('force-test-servers');
  }
```

## Шаг 2: Обновить параметры подключения к VPN

Для поддержки Kill Switch и Split Tunneling при подключении, обновите вызов метода `connectToVPN` в интерфейсе:

```javascript
vpnAPI.connectToVPN({
  serverId: selectedServer.id,
  connectionType: 'full',
  enableKillSwitch: true, // Добавлен новый параметр
  enableSplitTunneling: false // Добавлен новый параметр
});
```

## Шаг 3: Пример использования новых функций в интерфейсе

### Пример включения/выключения Kill Switch:
```javascript
// Включение Kill Switch
vpnAPI.toggleKillSwitch(true)
  .then(result => {
    if (result.success) {
      console.log('Kill Switch активирован');
      // Обновить интерфейс
    } else {
      console.error('Ошибка активации Kill Switch:', result.error);
      // Показать ошибку пользователю
    }
  });

// Выключение Kill Switch
vpnAPI.toggleKillSwitch(false)
  .then(result => {
    if (result.success) {
      console.log('Kill Switch деактивирован');
      // Обновить интерфейс
    } else {
      console.error('Ошибка деактивации Kill Switch:', result.error);
      // Показать ошибку пользователю
    }
  });
```

### Пример работы со Split Tunneling:
```javascript
// Получение текущей конфигурации
vpnAPI.getSplitTunnelingConfig()
  .then(result => {
    if (result.success) {
      console.log('Конфигурация Split Tunneling:', result.config);
      // Отобразить список обходов домен в интерфейсе
      const bypassList = result.config.bypassList;
      // Отобразить статус (включен/выключен)
      const isEnabled = result.config.enabled;
    }
  });

// Добавление домена в список обхода
vpnAPI.addDomainToBypass('example.com')
  .then(result => {
    if (result.success) {
      console.log('Домен добавлен в обход');
      // Обновить список в интерфейсе
    } else {
      console.error('Ошибка добавления домена:', result.error);
    }
  });

// Удаление домена из списка обхода
vpnAPI.removeDomainFromBypass('example.com')
  .then(result => {
    if (result.success) {
      console.log('Домен удален из обхода');
      // Обновить список в интерфейсе
    }
  });
```

### Пример запуска тестирования серверов:
```javascript
// Запуск тестирования всех серверов
vpnAPI.forceTestServers()
  .then(result => {
    if (result.success) {
      console.log('Результаты тестирования серверов:', result.results);
      // Отобразить результаты в интерфейсе
    } else {
      console.error('Ошибка тестирования серверов:', result.error);
    }
  });
```
