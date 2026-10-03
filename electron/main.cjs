const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    title: 'FAB Trainer – Fachangestellte/r für Bäderbetriebe',
    backgroundColor: '#0f172a', // slate-900
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    },
    autoHideMenuBar: false,
    show: false
  });

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Robust path resolution for packaged electron asar & unpackaged
    const primaryPath = path.join(__dirname, '../dist/index.html');
    const fallbackPath = path.join(__dirname, 'dist/index.html');
    const appPath = path.join(app.getAppPath(), 'dist/index.html');

    if (fs.existsSync(primaryPath)) {
      mainWindow.loadFile(primaryPath);
    } else if (fs.existsSync(fallbackPath)) {
      mainWindow.loadFile(fallbackPath);
    } else if (fs.existsSync(appPath)) {
      mainWindow.loadFile(appPath);
    } else {
      mainWindow.loadFile(primaryPath);
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
