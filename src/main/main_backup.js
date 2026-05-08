const { app, BrowserWindow, ipcMain, clipboard, nativeImage, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// Error handling
process.on('uncaughtException', (err) => {
  fs.appendFileSync('D:\\ClipboardHistory\\error.log', `${new Date().toISOString()} UncaughtException: ${err.stack}\n`);
  console.error('UncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  fs.appendFileSync('D:\\ClipboardHistory\\error.log', `${new Date().toISOString()} UnhandledRejection: ${err}\n`);
  console.error('UnhandledRejection:', err);
});

// Data storage path
const DATA_PATH = 'D:\\ClipboardHistory';
const DB_PATH = path.join(DATA_PATH, 'db');
const IMAGES_PATH = path.join(DATA_PATH, 'images');
const DB_FILE = path.join(DB_PATH, 'clipboard.db');
const SETTINGS_FILE = path.join(DATA_PATH, 'settings.json');

// Global variables
let mainWindow = null;
let tray = null;
let db = null;
let lastText = '';
let lastImage = null;
let clipboardWatcher = null;
let settings = {
  retentionDays: 3,
  autoStart: false
};

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
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create tray
function createTray() {
  // Create simple default icon (blue square)
  const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAApklEQVQ4jWNgGAWjYBQMRsEoGAWjYBSMglEwCkbBKBgF1AxGRkb+QjAyMv5nZGT8z8jI+J+BgeE/AwPDfwYGBgaoAIyCoWYwMjL+Z2Rk/M/IyPifkZHxPyMj439GRkb4N4IMADnUCR1s7KQCAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(iconDataUrl);

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ClipboardHistory');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Start clipboard watcher
function startClipboardWatcher() {
  lastText = clipboard.readText();
  const img = clipboard.readImage();
  lastImage = img.isEmpty() ? null : img.toDataURL();

  clipboardWatcher = setInterval(() => {
    try {
      const currentText = clipboard.readText();
      const currentImg = clipboard.readImage();

      // Detect text changes
      if (currentText && currentText !== lastText) {
        lastText = currentText;
        lastImage = null;

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
    if (type === 'text') {
      clipboard.writeText(content);
    } else if (type === 'image') {
      if (fs.existsSync(content)) {
        const img = nativeImage.createFromPath(content);
        clipboard.writeImage(img);
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
  ensureDirectories();
  loadSettings();
  await initDatabase();
  createWindow();
  createTray();

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
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});