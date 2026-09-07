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

  probeClips: (filePaths) => ipcRenderer.invoke('probe-clips', filePaths),
  convertClips: (filePaths) => ipcRenderer.invoke('convert-clips', filePaths),
  getPlaybackPaths: (filePaths) => ipcRenderer.invoke('get-playback-paths', filePaths),
  onProbeProgress: (callback) => {
    const h = (_e, p) => callback(p);
    ipcRenderer.on('probe-progress', h);
    return () => ipcRenderer.removeListener('probe-progress', h);
  },
  onConvertProgress: (callback) => {
    const h = (_e, p) => callback(p);
    ipcRenderer.on('convert-progress', h);
    return () => ipcRenderer.removeListener('convert-progress', h);
  },
});
