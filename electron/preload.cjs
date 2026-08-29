/* AquaFlow PMS — Electron preload (minimal, context-isolated bridge) */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__AQUAFLOW', {
  isDesktop: true,
  sendDb: (dbJson) => ipcRenderer.send('db-changed', dbJson),
  onDbChanged: (fn) => ipcRenderer.on('db-remote-push', (e, dbJson) => { try { fn(dbJson); } catch (err) {} }),
  lanToggle: (on) => ipcRenderer.invoke('lan-toggle', on),
  lanInfo: () => ipcRenderer.invoke('lan-info'),
  loadPersisted: () => ipcRenderer.invoke('load-persisted'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  openStateFile: () => ipcRenderer.invoke('open-state-file')
});
