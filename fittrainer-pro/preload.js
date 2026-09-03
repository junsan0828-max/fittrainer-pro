const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  rescanFolder: () => ipcRenderer.invoke('rescan-folder'),
  getLibraryFolder: () => ipcRenderer.invoke('get-library-folder'),
  onRemote: (callback) => {
    ipcRenderer.on('remote-command', (_e, cmd) => callback(cmd));
    return () => ipcRenderer.removeAllListeners('remote-command');
  },
  sendPlayerState: (state) => ipcRenderer.send('player-state', state),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  saveData: (key, value) => ipcRenderer.invoke('save-data', key, value),
  loadData: (key) => ipcRenderer.invoke('load-data', key),
  autoScanSavedFolder: () => ipcRenderer.invoke('auto-scan-saved-folder'),
});
