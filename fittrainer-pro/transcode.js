// 재생 불가 코덱(H.265 등) 영상을 H.264 mp4 로 변환해 캐시에 보관한다.
// Chromium 은 H.265 를 디코딩하지 못하므로 앱에 내장한 ffmpeg 로 미리 바꿔둔다.

const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// asar 안의 바이너리는 실행할 수 없어 unpacked 경로로 바꿔준다
function unpacked(p) {
  return p ? p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) : p;
}

// ffmpeg 를 못 찾아도 앱 자체는 떠야 한다. 변환 기능만 비활성화된다.
function resolveBin(load) {
  try {
    const p = unpacked(load());
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const FFMPEG = resolveBin(() => require('ffmpeg-static'));
const FFPROBE = resolveBin(() => require('ffprobe-static').path);
const MISSING = 'ffmpeg 를 찾을 수 없어 변환할 수 없습니다.';

// 백그라운드 변환은 사용자가 언제든 멈출 수 있어야 한다
let cancelled = false;
let running = null;   // 지금 돌고 있는 ffmpeg 프로세스

function cancelAll() {
  cancelled = true;
  if (running) { try { running.kill('SIGKILL'); } catch {} }
}

// Chromium 이 재생할 수 있는 코덱
const OK_VIDEO = ['h264', 'vp8', 'vp9', 'av1', 'theora'];
const OK_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le'];

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'converted');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 파일 경로 + 크기 + 수정시각으로 캐시 키를 만든다. 원본이 바뀌면 다시 변환된다.
function cacheKey(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return null; }
  return crypto.createHash('sha1')
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}`)
    .digest('hex');
}

function convertedPath(filePath) {
  const key = cacheKey(filePath);
  return key ? path.join(cacheDir(), `${key}.mp4`) : null;
}

function hasConverted(filePath) {
  const out = convertedPath(filePath);
  return out && fs.existsSync(out) ? out : null;
}

// ffprobe 로 코덱을 읽어 재생 가능 여부를 판단한다
function probe(filePath) {
  return new Promise(resolve => {
    if (!FFPROBE) return resolve({ ok: false, video: null, audio: null, audioOk: true, error: MISSING });
    execFile(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name:format=duration',
      '-of', 'json',
      filePath,
    ], { timeout: 15000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return resolve({ ok: false, video: null, audio: null, error: err.message });
      let streams = [], duration = 0;
      try {
        const out = JSON.parse(stdout);
        streams = out.streams || [];
        duration = Number(out.format?.duration) || 0;
      } catch {}
      const video = streams.find(s => s.codec_type === 'video')?.codec_name || null;
      const audio = streams.find(s => s.codec_type === 'audio')?.codec_name || null;
      // 영상 코덱의 최종 판정은 렌더러가 canPlayType 으로 내린다.
      // 하드웨어 디코더 유무에 따라 PC 마다 달라지기 때문이다.
      const audioOk = !audio || OK_AUDIO.includes(audio);
      resolve({ ok: !!video && OK_VIDEO.includes(video) && audioOk, video, audio, audioOk, duration });
    });
  });
}

// 여러 파일을 순서대로 검사한다. onEach 로 진행 상황을 알린다.
async function probeAll(filePaths, onEach) {
  const results = {};
  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    const converted = hasConverted(fp);
    results[fp] = converted
      ? { ...(await probe(converted)), ok: true, converted: true }
      : await probe(fp);
    onEach?.({ index: i, total: filePaths.length, filePath: fp, result: results[fp] });
  }
  return results;
}

function convert(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error(MISSING));
    const out = convertedPath(filePath);
    if (!out) return reject(new Error('파일을 찾을 수 없습니다'));
    if (fs.existsSync(out)) return resolve(out);

    // 확장자로 포맷을 정하므로 임시 파일도 .mp4 로 끝나야 한다
    const tmp = out.replace(/\.mp4$/, '.part.mp4');
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', filePath,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '128k',
      '-progress', 'pipe:1', '-nostats',
      tmp,
    ];

    const proc = spawn(FFMPEG, args);
    running = proc;
    let stderr = '';

    proc.stdout.on('data', chunk => {
      const m = String(chunk).match(/out_time_ms=(\d+)/);
      if (m) onProgress?.({ seconds: Number(m[1]) / 1e6 });
    });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('error', err => {
      running = null;
      fs.rmSync(tmp, { force: true });
      reject(err);
    });
    proc.on('close', code => {
      running = null;
      if (code === 0 && fs.existsSync(tmp)) {
        fs.renameSync(tmp, out);
        resolve(out);
      } else {
        fs.rmSync(tmp, { force: true });
        reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg 종료 코드 ${code}`));
      }
    });
  });
}

// 재생 불가 파일들을 차례로 변환한다. 실패한 파일은 건너뛰고 계속 진행한다.
async function convertAll(filePaths, onProgress) {
  cancelled = false;
  const done = {};
  const failed = {};
  for (let i = 0; i < filePaths.length; i++) {
    if (cancelled) break;
    const fp = filePaths[i];
    onProgress?.({ index: i, total: filePaths.length, filePath: fp, stage: 'start' });
    try {
      done[fp] = await convert(fp, p =>
        onProgress?.({ index: i, total: filePaths.length, filePath: fp, stage: 'progress', ...p }));
    } catch (e) {
      if (!cancelled) failed[fp] = e.message;
    }
    onProgress?.({ index: i, total: filePaths.length, filePath: fp, stage: 'done' });
  }
  return { done, failed, cancelled };
}

module.exports = { probe, probeAll, convert, convertAll, cancelAll, hasConverted, convertedPath };
