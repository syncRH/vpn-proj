// Новые методы API для работы с улучшениями VPN - добавить перед закрывающей скобкой vpnAPI (перед строкой "};")

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
