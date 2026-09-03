const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3737;

app.use(express.static(path.join(__dirname, 'mobile')));

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
let libraryRoot = null;

function setLibraryRoot(folder) { libraryRoot = folder; }

io.on('connection', (socket) => {
  console.log('[Remote] connected:', socket.id);
  socket.emit('state', currentState);

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

module.exports = { getIO, updateState, setLibraryRoot };
