// Simple test - load electron and use without destructuring
const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron keys:', Object.keys(electron).slice(0, 10));

// Try without destructuring
const app = electron.app;
const ipcMain = electron.ipcMain;
console.log('app:', typeof app);
console.log('ipcMain:', typeof ipcMain);

if (app && ipcMain) {
  app.whenReady().then(() => {
    console.log('App ready');
    ipcMain.handle('test', () => 'test result');
    console.log('ipcMain.handle registered');
    app.quit();
  });
} else {
  console.log('ERROR: app or ipcMain is undefined');
  console.log('electron.app:', electron.app);
  console.log('electron.ipcMain:', electron.ipcMain);
}