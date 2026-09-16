// 빌드된 화면을 실제 브라우저로 띄워 모든 탭을 눌러 본다.
//
// 이 테스트가 없던 시절 1.1.0~1.9.0 이 전부 흰 화면으로 죽은 채 배포됐다.
// 빌드가 성공해도 앱이 뜨는지는 알 수 없기 때문에, 실제로 띄워서 확인한다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('renderer/dist 가 없습니다. 먼저 `npm run build:renderer` 를 실행하세요.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

// file:// 로 열면 모듈 스크립트가 CORS 로 막히므로 간단한 정적 서버를 세운다
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(dist, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// 앱이 기대하는 최소한의 데이터. 각 탭이 빈 화면이 아니라 실제 목록을 그리게 한다.
const CLIPS = [
  { id: 'c1', fileName: 'MU 스쿼트. 하체. 015.mp4', code: 'STR', name: '스쿼트',
    part: '하체', reps: 15, duration: 40, filePath: 'C:/v/a.mp4', playbackPath: 'C:/v/a.mp4' },
  { id: 'c2', fileName: 'ST 햄스트링. 하체. 030.mp4', code: 'STT', name: '햄스트링',
    part: '하체', reps: 30, duration: 35, filePath: 'C:/v/b.mp4', playbackPath: 'C:/v/b.mp4' },
  { id: 'c3', fileName: 'AE 점핑잭. 전신. 020.mp4', code: 'CAR', name: '점핑잭',
    part: '전신', reps: 20, duration: 45, filePath: 'C:/v/c.mp4', playbackPath: 'C:/v/c.mp4' },
];

const block = (clip, sets = 2) =>
  ({ uid: 'b_' + clip.id, clip, sets, restBetweenSets: 20, restAfter: 60 });

const STORE = {
  ft_customers: [{ id: 'u1', name: '홍길동', goal: '체지방 감소', level: '초급', notes: '' }],
  ft_blocks: [block(CLIPS[0])],
  ft_clip_attrs: {},
  // 시퀀스 사이 간격을 시험하려면 두 개 이상이어야 한다
  ft_sessions: [
    { id: 's1', name: '아침 시퀀스', blocks: [block(CLIPS[0]), block(CLIPS[1])] },
    { id: 's2', name: '저녁 시퀀스', blocks: [block(CLIPS[2])] },
  ],
  ft_playlist: [],
  ft_history: [{ id: 'h1', at: Date.now(), name: '아침 시퀀스', seconds: 2700 }],
  ft_settings: {},
  ft_prefix_cats: { AE: 'CAR', MU: 'STR', ST: 'STT' },
};

// CI 는 playwright 가 받아 둔 브라우저를 쓰고,
// 이미 브라우저가 깔린 환경에서는 PW_CHROMIUM 으로 그 경로를 지정한다.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

// 흰 화면의 원인은 거의 항상 런타임 예외다. 하나라도 잡히면 실패시킨다.
const failures = [];
page.on('pageerror', e => failures.push(`pageerror: ${e.message}`));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // 가짜 경로의 영상과 외부 폰트는 이 환경에서 당연히 실패한다
  if (/net::ERR|Failed to load resource|MEDIA_ELEMENT_ERROR|play\(\) request|Not allowed to load local resource/i.test(t)) return;
  failures.push(`console: ${t}`);
});

await page.addInitScript(store => {
  window.electronAPI = {
    selectFolder: async () => null,
    rescanFolder: async () => null,
    getLibraryFolder: async () => 'C:/v',
    autoScanSavedFolder: async () => ({ folder: 'C:/v', clips: [] }),
    onRemote: () => () => {},
    sendPlayerState: () => {}, sendPlayerTick: () => {},
    minimize: () => {}, maximize: () => {}, close: () => {},
    saveData: async () => true,
    loadData: async key => store[key] ?? null,
    probeClips: async () => ({ results: [] }),
    convertClips: async () => ({ done: 0, failed: 0 }),
    cancelConvert: async () => true,
    getPlaybackPaths: async () => ({}),
    getRemoteInfo: async () => ({
      url: 'http://192.168.0.2:3737', ip: '192.168.0.2', port: 3737,
      pin: '123456', deviceName: '테스트 PC', deviceId: 'dev1', qr: null,
    }),
    setRemotePin: async p => p,
    setDeviceName: async n => n,
    revokeRemoteDevices: async () => true,
    onProbeProgress: () => () => {},
    onConvertProgress: () => () => {},
  };
}, STORE);

await page.addInitScript(clips => {
  // 라이브러리가 이미 채워진 상태로 시작시킨다
  localStorage.setItem('ft_clips', JSON.stringify(clips));
}, CLIPS);

await page.goto(base, { waitUntil: 'networkidle' });

// 화면이 아예 안 그려졌는지부터 본다. 흰 화면 사고가 여기서 걸린다.
const rendered = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
if (rendered === 0) failures.push('root 가 비어 있습니다 — 화면이 렌더되지 않았습니다');

const TABS = ['라이브러리', '고객', '시퀀스 설정', '시퀀스 빌더', '시퀀스 목록', '재생', '기록', '설정'];
for (const label of TABS) {
  const before = failures.length;
  try {
    await page.getByRole('button', { name: label, exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(350);
    const n = await page.evaluate(() => document.getElementById('root')?.innerText?.trim().length ?? 0);
    if (n < 10) failures.push(`[${label}] 탭 내용이 비어 있습니다`);
  } catch (e) {
    failures.push(`[${label}] 탭을 열지 못했습니다: ${e.message.split('\n')[0]}`);
  }
  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  ${label}`);
}

// 시퀀스 목록: 체크로 대기열을 고르고, 사이 간격을 정하는 화면
async function checkQueueTab() {
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[시퀀스 목록] ${what}: ${e.message.split('\n')[0]}`); }
  };
  const before = failures.length;
  await page.getByRole('button', { name: '시퀀스 목록', exact: true }).first().click();
  await page.waitForTimeout(300);

  await step('체크박스가 시퀀스마다 있어야 함', async () => {
    const n = await page.locator('input[type=checkbox]').count();
    if (n < 2) throw new Error(`체크박스 ${n}개`);
  });

  await step('간격 버튼이 보여야 함', async () => {
    for (const label of ['바로 시작', '5분 뒤', '10분 뒤', '15분 뒤', '지정 시각']) {
      if (await page.getByRole('button', { name: label, exact: true }).count() === 0)
        throw new Error(`'${label}' 없음`);
    }
  });

  await step('지정 시각을 고르면 시각 입력이 나와야 함', async () => {
    await page.getByRole('button', { name: '지정 시각', exact: true }).first().click();
    await page.waitForTimeout(250);
    if (await page.locator('input[type=time]').count() === 0)
      throw new Error('시각 입력이 나타나지 않음');
    if (await page.getByRole('button', { name: '다음 정각', exact: true }).count() === 0)
      throw new Error("'다음 정각' 버튼이 없음");
  });

  await step('체크를 풀면 간격 설정이 사라져야 함', async () => {
    await page.locator('input[type=checkbox]').first().uncheck();
    await page.waitForTimeout(250);
    if (await page.getByRole('button', { name: '지정 시각', exact: true }).count() !== 0)
      throw new Error('체크를 풀었는데도 간격 설정이 남아 있음');
    await page.locator('input[type=checkbox]').first().check();
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  시퀀스 목록 · 체크와 간격`);
}
await checkQueueTab();

await browser.close();
server.close();

if (failures.length) {
  console.error('\n실패 ' + failures.length + '건:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n스모크 테스트 통과 — 8개 탭 모두 정상');
