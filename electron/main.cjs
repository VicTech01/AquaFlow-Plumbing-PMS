/* AquaFlow PMS — Electron main process (Windows desktop app) */
'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const lan = require('../js/lan-server.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = 8484;

let win = null;
let server = null;

const stateFile = () => path.join(app.getPath('userData'), 'db.json');

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'AquaFlow PMS',
    backgroundColor: '#f3f6fa',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(ROOT, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url); // wa.me links etc. open in the browser
    return { action: 'deny' };
  });
}

function startServer() {
  if (server) return server.info();
  return lan.start({
    rootDir: ROOT,
    port: PORT,
    initialDb: (() => { try { return fs.existsSync(stateFile()) ? fs.readFileSync(stateFile(), 'utf8') : null; } catch (e) { return null; } })(),
    stateFile: stateFile(),
    onPush: (dbObj) => {
      // phone pushed new state → merge into the open desktop app
      if (win && !win.isDestroyed()) {
        win.webContents.send('db-remote-push', JSON.stringify(dbObj));
      }
    }
  }).then(api => { server = api; return server.info(); });
}

function stopServer() {
  if (!server) return null;
  const s = server;
  server = null;
  return s.stop().then(() => null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // renderer → main: db changed (keep the server + backup file current)
  ipcMain.on('db-changed', (e, dbJson) => {
    if (typeof dbJson !== 'string') return;
    if (server) server.setDb(dbJson);
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
      fs.writeFileSync(stateFile(), dbJson);
    } catch (e2) {}
  });

  ipcMain.handle('lan-toggle', (e, on) => on ? startServer() : stopServer());
  ipcMain.handle('lan-info', () => server ? server.info() : null);
  ipcMain.handle('load-persisted', () => {
    try { return fs.existsSync(stateFile()) ? fs.readFileSync(stateFile(), 'utf8') : null; } catch (e) { return null; }
  });
  ipcMain.handle('app-info', () => ({
    isDesktop: true,
    version: app.getVersion(),
    userData: app.getPath('userData'),
    stateFile: stateFile()
  }));
  ipcMain.handle('open-state-file', async () => {
    if (!fs.existsSync(stateFile())) {
      dialog.showErrorBox('No data file yet', 'Use AquaFlow once — your database file is created on the first change.');
      return null;
    }
    shell.showItemInFolder(stateFile());
    return stateFile();
  });
  ipcMain.on('window-closed', () => { server && server.stop(); });
});

app.on('window-all-closed', () => {
  if (server) server.stop();
  app.quit();
});
