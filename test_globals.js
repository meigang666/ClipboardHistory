// Test what global variables are available when running via electron binary
console.log('process.version:', process.version);
console.log('process.execPath:', process.execPath);
console.log('typeof global.electron:', typeof global.electron);

// Check if there's a special require method
console.log('module id:', module.id);
console.log('module filename:', module.filename);

// Try using process.global
console.log('process.global === global:', process.global === global);

// Check if electron is available as a native module
try {
  const path = require('path');
  console.log('path module works:', typeof path.join);
} catch (e) {
  console.log('path module failed:', e.message);
}