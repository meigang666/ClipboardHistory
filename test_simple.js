// Simple test - load electron and use ipcMain
const { app, ipcMain } = require('electron');
console.log('electron loaded successfully');
console.log('app:', typeof app);
console.log('ipcMain:', typeof ipcMain);

app.whenReady().then(() => {
  console.log('App ready');
  ipcMain.handle('test', () => 'test result');
  console.log('ipcMain.handle registered');
  app.quit();
});