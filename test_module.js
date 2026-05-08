console.log('Module loaded');
console.log('require.main:', require.main ? require.main.filename : 'undefined');
console.log('module.id:', module.id);
console.log('module.filename:', module.filename);

// Try to load electron
try {
  const electron = require('electron');
  console.log('electron type:', typeof electron);
  if (typeof electron === 'string') {
    console.log('electron value:', electron);
  } else {
    console.log('electron.app:', typeof electron.app);
    console.log('electron.ipcMain:', typeof electron.ipcMain);
  }
} catch (err) {
  console.log('Error loading electron:', err.message);
}