const { app, BrowserWindow, ipcMain, clipboard, nativeImage, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');
const initSqlJs = require('sql.js');

// Determine platform-specific paths
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Data storage path - D: on Windows, ~/ClipboardHistory on Mac
let DATA_PATH;
if (isWin) {
  DATA_PATH = 'D:\\ClipboardHistory';
} else {
  DATA_PATH = path.join(os.homedir(), 'ClipboardHistory');
}

const DB_PATH = path.join(DATA_PATH, 'db');
const IMAGES_PATH = path.join(DATA_PATH, 'images');
const DB_FILE = path.join(DB_PATH, 'clipboard.db');
const SETTINGS_FILE = path.join(DATA_PATH, 'settings.json');
const ERROR_LOG = path.join(DATA_PATH, 'error.log');

// Error handling
process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} UncaughtException: ${err.stack}\n`);
  } catch (e) {}
  console.error('UncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  try {
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} UnhandledRejection: ${err}\n`);
  } catch (e) {}
  console.error('UnhandledRejection:', err);
});

// Global variables
let mainWindow = null;
let tray = null;
let db = null;
let lastText = '';
let lastImage = null;
let lastFile = null;
let clipboardWatcher = null;
let settings = {
  retentionDays: 3,
  autoStart: false
};

// Web server for mobile access
let webServer = null;
let webServerPort = 3847;
let webServerRunning = false;

// Ensure directories exist
function ensureDirectories() {
  [DATA_PATH, DB_PATH, IMAGES_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  try {
    if (fs.existsSync(DB_FILE)) {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    db = new SQL.Database();
  }

  // Create table
  db.run(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_pinned INTEGER DEFAULT 0
    )
  `);

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_items(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_is_pinned ON clipboard_items(is_pinned)');

  saveDatabase();
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  }
}

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      settings = JSON.parse(data);
    }
  } catch (err) {
    settings = { retentionDays: 3, autoStart: false };
  }
}

// Save settings
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Cleanup expired data
function cleanupExpired() {
  if (!db) return;
  const cutoff = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
  db.run('DELETE FROM clipboard_items WHERE is_pinned = 0 AND created_at < ?', [cutoff]);
  saveDatabase();
}

// Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      if (isMac) {
        // On macOS, allow closing window but keep app running in tray
        event.preventDefault();
        mainWindow.hide();
      } else {
        // On Windows, hide to tray
        event.preventDefault();
        mainWindow.hide();
      }
    }
  });
}

// Create tray
function createTray() {
  const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAApklEQVQ4jWNgGAWjYBQMRsEoGAWjYBSMglEwCkbBKBgF1AxGRkb+QjAyMv5nZGT8z8jI+J+BgeE/AwPDfwYGBgaoAIyCoWYwMjL+Z2Rk/M/IyPifkZHxPyMj439GRkb4N4IMADnUCR1s7KQCAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(iconDataUrl);

  tray = new Tray(icon);
  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// Start clipboard watcher
function startClipboardWatcher() {
  lastText = clipboard.readText();
  const img = clipboard.readImage();
  lastImage = img.isEmpty() ? null : img.toDataURL();
  lastFile = null;

  clipboardWatcher = setInterval(() => {
    try {
      const currentText = clipboard.readText();
      const currentImg = clipboard.readImage();

      // Detect file changes (Windows)
      let currentFile = null;
      if (isWin) {
        try {
          const fileBuffer = clipboard.readBuffer('FileNameW');
          if (fileBuffer && fileBuffer.length > 0) {
            // Convert buffer to string (UTF-16 LE on Windows)
            currentFile = fileBuffer.toString('utf16le').replace(/\0+$/, '');
            // Check if it's a valid file path
            if (currentFile && (currentFile.includes('\\') || currentFile.includes('/')) && fs.existsSync(currentFile)) {
              // It's a valid file path
            } else {
              currentFile = null;
            }
          }
        } catch (e) {
          currentFile = null;
        }
      }

      // Detect file changes
      if (currentFile && currentFile !== lastFile) {
        lastFile = currentFile;
        lastText = '';
        lastImage = null;

        if (db) {
          db.run('INSERT INTO clipboard_items (type, content, created_at, is_pinned) VALUES (?, ?, ?, 0)',
            ['file', currentFile, Date.now()]);
          saveDatabase();
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard-change', { type: 'file', content: currentFile });
        }
        return;
      }

      // Detect text changes
      if (currentText && currentText !== lastText) {
        lastText = currentText;
        lastImage = null;
        lastFile = null;

        // Save to database
        if (db) {
          db.run('INSERT INTO clipboard_items (type, content, created_at, is_pinned) VALUES (?, ?, ?, 0)',
            ['text', currentText, Date.now()]);
          saveDatabase();
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard-change', { type: 'text', content: currentText });
        }
        return;
      }

      // Detect image changes
      if (!currentImg.isEmpty()) {
        const currentDataUrl = currentImg.toDataURL();
        if (currentDataUrl !== lastImage) {
          lastImage = currentDataUrl;
          lastText = '';
          lastFile = null;

          // Save image to local
          const uuid = require('crypto').randomUUID();
          const imagePath = path.join(IMAGES_PATH, `${uuid}.png`);

          try {
            fs.writeFileSync(imagePath, currentImg.toPNG());

            // Save to database
            if (db) {
              db.run('INSERT INTO clipboard_items (type, content, created_at, is_pinned) VALUES (?, ?, ?, 0)',
                ['image', imagePath, Date.now()]);
              saveDatabase();
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('clipboard-change', { type: 'image', content: imagePath });
            }
          } catch (err) {
            console.error('Save image failed:', err);
          }
        }
      }
    } catch (err) {
      console.error('Clipboard watch error:', err);
    }
  }, 500);
}

// Stop clipboard watcher
function stopClipboardWatcher() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
}

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Get all items for web server
function getAllItems() {
  if (!db) return [];
  const results = [];
  const stmt = db.prepare('SELECT * FROM clipboard_items ORDER BY is_pinned DESC, created_at DESC');
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Web server for mobile access
function startWebServer() {
  if (webServer) return;

  webServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      try {
        const html = fs.readFileSync(path.join(__dirname, 'mobile.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(500);
        res.end('Error loading page');
      }
      return;
    }

    if (req.url === '/api/items' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getAllItems()));
      return;
    }

    if (req.url === '/api/copy' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { type, content } = JSON.parse(body);
          if (type === 'text') {
            clipboard.writeText(content);
            lastText = content;
          }
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.url.startsWith('/api/pin/') && req.method === 'POST') {
      const id = parseInt(req.url.split('/')[3]);
      if (db) { db.run('UPDATE clipboard_items SET is_pinned = 1 WHERE id = ?', [id]); saveDatabase(); }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url.startsWith('/api/unpin/') && req.method === 'POST') {
      const id = parseInt(req.url.split('/')[3]);
      if (db) { db.run('UPDATE clipboard_items SET is_pinned = 0 WHERE id = ?', [id]); saveDatabase(); }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url.startsWith('/api/delete/') && req.method === 'POST') {
      const id = parseInt(req.url.split('/')[3]);
      if (db) { db.run('DELETE FROM clipboard_items WHERE id = ?', [id]); saveDatabase(); }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url.startsWith('/api/image/') && req.method === 'GET') {
      const imagePath = decodeURIComponent(req.url.split('/api/image/')[1]);
      try {
        if (fs.existsSync(imagePath)) {
          const ext = path.extname(imagePath).toLowerCase();
          const ct = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
          res.writeHead(200, { 'Content-Type': ct[ext] || 'image/png' });
          res.end(fs.readFileSync(imagePath));
          return;
        }
      } catch (err) {}
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  webServer.on('listening', () => {
    webServerRunning = true;
    console.log(`Mobile web: http://${getLocalIP()}:${webServerPort}`);
    updateTrayMenu();
  });

  webServer.on('error', (err) => {
    console.error('Web server error:', err);
    webServer = null;
    webServerRunning = false;
    updateTrayMenu();
  });

  webServer.listen(webServerPort, '0.0.0.0');
}

function stopWebServer() {
  if (webServer) {
    webServer.close();
    webServer = null;
    webServerRunning = false;
    updateTrayMenu();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const status = webServerRunning ? 'Web ON' : 'Web OFF';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: `${status} - Click to toggle`, click: () => { webServerRunning ? stopWebServer() : startWebServer(); } },
    { label: `http://${getLocalIP()}:${webServerPort}`, enabled: false },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.setToolTip(`ClipboardHistory [${status}]`);
}

// IPC handlers
ipcMain.handle('get-data-path', () => DATA_PATH);
ipcMain.handle('get-images-path', () => IMAGES_PATH);
ipcMain.handle('get-db-path', () => DB_PATH);

ipcMain.handle('get-items', (event, filter) => {
  try {
    if (!db) return [];

    let query = 'SELECT * FROM clipboard_items WHERE 1=1';
    const params = [];

    if (filter && filter.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter && filter.days) {
      const cutoff = Date.now() - (filter.days * 24 * 60 * 60 * 1000);
      query += ' AND created_at >= ?';
      params.push(cutoff);
    }

    query += ' ORDER BY is_pinned DESC, created_at DESC';

    const stmt = db.prepare(query);
    if (params.length > 0) {
      stmt.bind(params);
    }

    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();

    // Keyword filter (sql.js doesn't support LIKE binding)
    if (filter && filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      return results.filter(item =>
        item.type === 'text' && item.content.toLowerCase().includes(kw)
      );
    }

    return results;
  } catch (err) {
    console.error('Get items failed:', err);
    return [];
  }
});

ipcMain.handle('pin-item', (event, id) => {
  try {
    console.log('pin-item called with id:', id);
    if (db) {
      db.run('UPDATE clipboard_items SET is_pinned = 1 WHERE id = ?', [id]);
      saveDatabase();
    }
    return true;
  } catch (err) {
    console.error('Pin failed:', err);
    return false;
  }
});

ipcMain.handle('unpin-item', (event, id) => {
  try {
    console.log('unpin-item called with id:', id);
    if (db) {
      db.run('UPDATE clipboard_items SET is_pinned = 0 WHERE id = ?', [id]);
      saveDatabase();
    }
    return true;
  } catch (err) {
    console.error('Unpin failed:', err);
    return false;
  }
});

ipcMain.handle('delete-item', (event, id) => {
  try {
    console.log('delete-item called with id:', id);
    if (!db) return false;

    // Get content to check if it's an image
    const stmt = db.prepare('SELECT type, content FROM clipboard_items WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      console.log('Row to delete:', row);
      if (row.type === 'image' && row.content) {
        // Delete image file
        try {
          if (fs.existsSync(row.content)) {
            fs.unlinkSync(row.content);
          }
        } catch (err) {
          console.error('Delete image file failed:', err);
        }
      }
    }
    stmt.free();

    db.run('DELETE FROM clipboard_items WHERE id = ?', [id]);
    saveDatabase();
    console.log('Delete successful');
    return true;
  } catch (err) {
    console.error('Delete failed:', err);
    return false;
  }
});

ipcMain.handle('copy-to-clipboard', (event, type, content) => {
  try {
    console.log('[Copy] type:', type, 'content:', content);
    if (type === 'text') {
      clipboard.writeText(content);
      // Update tracking to prevent re-recording
      lastText = content;
    } else if (type === 'image') {
      if (fs.existsSync(content)) {
        const img = nativeImage.createFromPath(content);
        clipboard.writeImage(img);
        // Update tracking to prevent re-recording
        lastImage = img.toDataURL();
      } else {
        console.log('[Copy] Image file not found:', content);
      }
    } else if (type === 'file') {
      if (isWin && fs.existsSync(content)) {
        // On Windows, use .NET Clipboard to copy file as file object
        const filePath = content.replace(/'/g, "''");
        const psScript = `Add-Type -AssemblyName System.Windows.Forms; $files = [System.Collections.Specialized.StringCollection]::new(); $files.Add('${filePath}'); [System.Windows.Forms.Clipboard]::SetFileDropList($files)`;
        try {
          execSync(`powershell -Command "${psScript}"`, { windowsHide: true, encoding: 'utf8' });
        } catch (err) {
          clipboard.writeText(content);
        }
        // Update tracking
        lastFile = content;
      } else if (isMac && fs.existsSync(content)) {
        execSync(`osascript -e 'set the clipboard to POSIX file "${content}"'`, { windowsHide: true });
        lastFile = content;
      }
    }
    return true;
  } catch (err) {
    console.error('Copy to clipboard failed:', err);
    return false;
  }
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', (event, newSettings) => {
  settings = newSettings;
  saveSettings();
  // Cleanup expired data
  cleanupExpired();
  return true;
});

// App startup
app.whenReady().then(async () => {
  try {
    ensureDirectories();
    loadSettings();
    await initDatabase();
    createWindow();
    createTray();
  } catch (err) {
    console.error('Init error:', err);
  }

  // Cleanup expired data on startup
  cleanupExpired();

  // Check auto start on startup
  if (settings.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true
    });
  }

  // Register global shortcut
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Start clipboard watcher
  startClipboardWatcher();
});

app.on('window-all-closed', () => {
  // Don't quit, keep tray running
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopClipboardWatcher();
  stopWebServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});