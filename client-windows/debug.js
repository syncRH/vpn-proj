// filepath: c:\Users\syncRH\vpn-proj\client-windows\debug.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable debug logging
console.log('Starting debug mode...');
console.log('Current directory:', __dirname);
console.log('Electron version:', process.versions.electron);
console.log('Node version:', process.versions.node);
console.log('Chrome version:', process.versions.chrome);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);

// Create a minimal window
function createWindow() {
  console.log('Creating debug window...');
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  console.log('Loading debug content...');
  mainWindow.loadURL('data:text/html,<html><body><h1>VPN Client Debug Mode</h1><p>If you can see this, Electron is working correctly.</p></body></html>');

  mainWindow.webContents.openDevTools();
  return mainWindow;
}

// Start app
app.whenReady().then(() => {
  console.log('App is ready, creating debug window...');
  const mainWindow = createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Debug information
  console.log('Listing available files in current directory:');
  try {
    const files = fs.readdirSync(__dirname);
    console.log(files);
  } catch (err) {
    console.error('Error listing files:', err);
  }

  console.log('Debug window created successfully');
}).catch(error => {
  console.error('Error during app initialization:', error);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});