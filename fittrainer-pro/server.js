const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3737;

// ---------------------------------------------------------------------------
// 원격 조작 인증
// 같은 네트워크의 아무 기기나 세션을 조작하지 못하도록 PIN 으로 막는다.
// HTTP 평문이라 도청까지 막지는 못한다. 체육관 내부망 기준의 보호 수준이다.
// ---------------------------------------------------------------------------
let authFile = null;
let auth = null;

function loadAuth() {
  if (auth) return auth;
  try {
    const { app: electronApp } = require('electron');
    authFile = path.join(electronApp.getPath('userData'), 'remote-auth.json');
    auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch {
    auth = null;
  }
  // PIN 과 기기 ID 는 한 번 만들면 바뀌지 않는다.
  // 폰에 저장된 QR/토큰이 계속 쓸 수 있어야 하기 때문이다.
  let changed = false;
  if (!auth) { auth = {}; }
  if (!auth.pin) { auth.pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); changed = true; }
  if (!auth.deviceId) { auth.deviceId = crypto.randomBytes(8).toString('hex'); changed = true; }
  if (!auth.deviceName) { auth.deviceName = `${os.hostname() || 'FitTrainer'} PC`; changed = true; }
  auth.tokens = auth.tokens || [];
  if (changed) saveAuth();
  return auth;
}

function saveAuth() {
  try { fs.writeFileSync(authFile, JSON.stringify(auth), 'utf8'); } catch {}
}

function getPin() { return loadAuth().pin; }
function getDeviceName() { return loadAuth().deviceName; }
function getDeviceId() { return loadAuth().deviceId; }

function setDeviceName(name) {
  loadAuth();
  auth.deviceName = String(name || '').trim().slice(0, 40) || auth.deviceName;
  saveAuth();
  return auth.deviceName;
}

function setPin(pin) {
  loadAuth();
  auth.pin = String(pin);
  auth.tokens = []; // PIN 을 바꾸면 기존 기기는 다시 로그인해야 한다
  saveAuth();
  io.disconnectSockets();
  return auth.pin;
}

function issueToken() {
  loadAuth();
  const token = crypto.randomBytes(24).toString('hex');
  auth.tokens.push(token);
  if (auth.tokens.length > 20) auth.tokens.shift();
  saveAuth();
  return token;
}

function validToken(token) {
  return !!token && loadAuth().tokens.includes(token);
}

function revokeAll() {
  loadAuth();
  auth.tokens = [];
  saveAuth();
  io.disconnectSockets();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'mobile')));

app.post('/api/login', (req, res) => {
  const pin = String(req.body?.pin || '');
  // 타이밍 공격을 피하려고 길이를 맞춘 뒤 상수 시간 비교한다
  const expected = Buffer.from(getPin());
  const given = Buffer.from(pin.padEnd(expected.length).slice(0, expected.length));
  if (pin.length !== expected.length || !crypto.timingSafeEqual(expected, given)) {
    return res.status(401).json({ error: 'PIN 이 일치하지 않습니다' });
  }
  res.json({ token: issueToken() });
});

// 다른 PC 의 컨트롤러 화면이 이 PC 를 찾을 수 있어야 하므로 교차 출처를 허용한다.
// 이름과 기기 ID 만 알려주며 비밀은 담기지 않는다.
app.get('/api/info', (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json({ id: getDeviceId(), name: getDeviceName() });
});

app.get('/api/session', (req, res) => {
  res.json({ ok: validToken(req.headers['x-remote-token']),
             id: getDeviceId(), name: getDeviceName() });
});

io.use((socket, next) => {
  if (validToken(socket.handshake.auth?.token)) return next();
  next(new Error('unauthorized'));
});

// Serve local video files with range request support
app.get('/localvideo', (req, res) => {
  try {
    const filePath = path.resolve(decodeURIComponent(req.query.path || ''));
    const VALID_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    if (!filePath || !VALID_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
      return res.status(403).send('Forbidden');
    }
    if (!libraryRoot || !filePath.startsWith(path.resolve(libraryRoot) + path.sep)) {
      return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeMap = { mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm' };
    const mime = mimeMap[ext] || 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime,
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) {
    res.status(500).send('Error serving file');
  }
});

let currentState = { playing: false, queue: [], currentIndex: 0 };
let currentTick = {};
let libraryRoot = null;

function setLibraryRoot(folder) { libraryRoot = folder; }

io.on('connection', (socket) => {
  console.log('[Remote] connected:', socket.id);
  socket.emit('state', currentState);
  socket.emit('tick', currentTick);

  socket.on('command', (cmd) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('remote-command', cmd);
  });

  socket.on('disconnect', () => {
    console.log('[Remote] disconnected:', socket.id);
  });
});

function getIO() { return io; }
function updateState(state) { currentState = state; }
function updateTick(tick) { currentTick = tick; }

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let ip = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) { ip = cfg.address; break; }
    }
  }
  console.log(`[Server] http://${ip}:${PORT}`);
});

// 접속 주소를 구한다. 폰이 붙어야 하므로 루프백이 아닌 LAN 주소가 필요하다.
function getLocalIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const cfg of iface || []) {
      if (cfg.family === 'IPv4' && !cfg.internal) return cfg.address;
    }
  }
  return null;
}

function getRemoteInfo() {
  const ip = getLocalIp();
  return { url: ip ? `http://${ip}:${PORT}` : null, ip, port: PORT, pin: getPin(),
           deviceName: getDeviceName(), deviceId: getDeviceId() };
}

module.exports = { getIO, updateState, updateTick, setLibraryRoot, getRemoteInfo,
                   setPin, revokeAll, setDeviceName };
