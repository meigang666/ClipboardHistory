// Test: what does require('electron') return when run via electron binary?
const electron = require('electron');
console.log('typeof electron:', typeof electron);
console.log('electron value:', electron);

if (typeof electron === 'object') {
  console.log('electron.app:', typeof electron.app);
  console.log('electron.ipcMain:', typeof electron.ipcMain);
} else {
  console.log('ERROR: electron is not an object!');
}

// Try using app and ipcMain
try {
  const { app, ipcMain } = require('electron');
  console.log('Destructured app:', typeof app);
  console.log('Destructured ipcMain:', typeof ipcMain);

  // Test ipcMain.handle
  ipcMain.handle('test', () => 'test result');
  console.log('ipcMain.handle works!');
} catch (err) {
  console.log('Error:', err.message);
}