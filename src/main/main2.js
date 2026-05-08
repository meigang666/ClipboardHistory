const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

console.log('Test main starting...');

let mainWindow = null;

function createWindow() {
  console.log('Creating window...');
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  console.log('Window created');
}

ipcMain.handle('test', () => {
  console.log('IPC test called');
  return 'test result';
});

app.whenReady().then(() => {
  console.log('App ready');
  createWindow();
});

app.on('window-all-closed', () => {
  console.log('Window all closed');
  app.quit();
});