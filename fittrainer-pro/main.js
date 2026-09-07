const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const transcode = require('./transcode');

const VALID_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const CATEGORY_CODES = ['STR', 'MOV', 'CFR', 'CFS', 'CCB', 'CCS', 'STT', 'CAR'];
const VIDEO_PORT = 3737;

let mainWindow;
let libraryFolder = null;

// Windows 의 하드웨어 HEVC 디코더를 쓸 수 있게 한다.
// GPU 와 'HEVC 비디오 확장' 이 갖춰진 PC 에서는 H.265 원본이 변환 없이 바로 재생된다.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

function configPath() { return path.join(app.getPath('userData'), 'ft-config.json'); }
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function saveConfig(obj) {
  try { fs.writeFileSync(configPath(), JSON.stringify(obj), 'utf8'); } catch {}
}

function parseFileName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));

  // "AE 팔벌려뛰기(외발). 전신. 020" — 접두어 + 이름 . 부위 . 횟수
  const dotted = base.split('.').map(s => s.trim()).filter(Boolean);
  if (dotted.length >= 2) {
    const head = dotted[0].match(/^([A-Za-z]+)\s+(.+)$/);
    if (head) {
      const prefix = head[1].toUpperCase();
      return {
        code: CATEGORY_CODES.includes(prefix) ? prefix : '',
        part: dotted[1],
        name: head[2],
        reps: parseInt(dotted[2], 10) || 0,
      };
    }
  }

  const parts = base.split('_');
  if (parts.length >= 4 && CATEGORY_CODES.includes(parts[0])) {
    return {
      code: parts[0],
      part: parts[1],
      name: parts[2],
      reps: parseInt(parts[3], 10) || 0,
    };
  }
  if (parts.length >= 3 && CATEGORY_CODES.includes(parts[0])) {
    return { code: parts[0], part: parts[1], name: parts[2], reps: 0 };
  }
  return { code: '', part: '', name: base, reps: 0 };
}

function detectCategoryFromPath(filePath) {
  const dir = path.dirname(filePath);
  for (const code of CATEGORY_CODES) {
    if (dir.includes(code + '_') || dir.includes(code)) return code;
  }
  return '';
}

function scanFolder(folderPath) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (VALID_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        const parsed = parseFileName(entry.name);
        const folderCode = detectCategoryFromPath(fullPath);
        const code = parsed.code || folderCode;
        results.push({
          id: fullPath,
          fileName: entry.name,
          code,
          name: parsed.name,
          part: parsed.part,
          reps: parsed.reps,
          duration: 0,
          url: `http://localhost:${VIDEO_PORT}/localvideo?path=${encodeURIComponent(fullPath)}`,
          filePath: fullPath,
          playbackPath: transcode.hasConverted(fullPath) || fullPath,
        });
      }
    }
  }
  walk(folderPath);
  return results;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0A0A0C',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  require('./server');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  libraryFolder = result.filePaths[0];
  setLibraryRoot(libraryFolder);
  saveConfig({ ...loadConfig(), libraryFolder });
  return { folder: libraryFolder, clips: scanFolder(libraryFolder) };
});

ipcMain.handle('rescan-folder', async () => {
  if (!libraryFolder) return null;
  return { folder: libraryFolder, clips: scanFolder(libraryFolder) };
});

ipcMain.handle('get-library-folder', () => libraryFolder);

// 앱 시작 시 저장된 폴더 자동 재스캔
ipcMain.handle('auto-scan-saved-folder', () => {
  const cfg = loadConfig();
  const saved = cfg.libraryFolder;
  if (!saved || !fs.existsSync(saved)) return null;
  libraryFolder = saved;
  setLibraryRoot(libraryFolder);
  return { folder: libraryFolder, clips: scanFolder(libraryFolder) };
});

// 라이브러리 영상의 코덱을 읽어 돌려준다. 재생 가능 판정은 렌더러가 한다.
ipcMain.handle('probe-clips', async (_e, filePaths) => {
  const results = await transcode.probeAll(filePaths, p =>
    mainWindow?.webContents.send('probe-progress', p));
  return { results };
});

// 재생 불가 영상을 H.264 로 변환하고, 변환된 경로 맵을 돌려준다
ipcMain.handle('convert-clips', async (_e, filePaths) => {
  const { done, failed } = await transcode.convertAll(filePaths, p =>
    mainWindow?.webContents.send('convert-progress', p));
  return { done, failed };
});

// 이미 변환해 둔 파일들의 재생 경로 맵
ipcMain.handle('get-playback-paths', (_e, filePaths) => {
  const map = {};
  for (const fp of filePaths) {
    const converted = transcode.hasConverted(fp);
    if (converted) map[fp] = converted;
  }
  return map;
});

// 폰에서 접속할 주소와 PIN, 그리고 바로 찍을 수 있는 QR
ipcMain.handle('get-remote-info', async () => {
  const info = getRemoteInfo();
  let qr = null;
  if (info.url) {
    try {
      qr = await require('qrcode').toDataURL(info.url, {
        width: 320, margin: 1, color: { dark: '#0A0A0C', light: '#FFFFFF' },
      });
    } catch {}
  }
  return { ...info, qr };
});

ipcMain.handle('set-remote-pin', (_e, pin) => {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN 은 숫자 4~8자리여야 합니다');
  return setPin(pin);
});

ipcMain.handle('revoke-remote-devices', () => { revokeAll(); return true; });

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

const { getIO, updateState, setLibraryRoot, getRemoteInfo, setPin, revokeAll } = require('./server');
ipcMain.on('player-state', (_e, state) => {
  updateState(state);
  const io = getIO();
  if (io) io.emit('state', state);
});

ipcMain.handle('save-data', (_e, key, value) => {
  try {
    const dir = app.getPath('userData');
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(value), 'utf8');
    return true;
  } catch { return false; }
});

ipcMain.handle('load-data', (_e, key) => {
  try {
    const file = path.join(app.getPath('userData'), `${key}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
});
