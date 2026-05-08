const e = require('electron');
console.log('Type:', typeof e);
if (typeof e === 'object') {
  console.log('app:', typeof e.app);
  console.log('ipcMain:', typeof e.ipcMain);
} else {
  console.log('Value:', e);
}