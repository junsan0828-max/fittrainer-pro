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
    // ffprobe 는 길이를 소수로 준다. 반올림하지 않으면 화면에 그대로 샌다.
    part: '하체', reps: 15, duration: 39.163999999999, filePath: 'C:/v/a.mp4', playbackPath: 'C:/v/a.mp4' },
  { id: 'c2', fileName: 'ST 햄스트링. 하체. 030.mp4', code: 'STT', name: '햄스트링',
    part: '하체', reps: 30, duration: 35, filePath: 'C:/v/b.mp4', playbackPath: 'C:/v/b.mp4' },
  { id: 'c3', fileName: 'AE 점핑잭. 전신. 020.mp4', code: 'CAR', name: '점핑잭',
    part: '전신', reps: 20, duration: 45, filePath: 'C:/v/c.mp4', playbackPath: 'C:/v/c.mp4' },
  // 하루치를 여러 타임으로 짜려면 이 정도는 있어야 한다.
  // 실제 라이브러리는 수백 개라, 셋만 두면 겹칠 수밖에 없는 상황만 시험하게 된다.
  ...['STR', 'MOV', 'CFR', 'CFS', 'CCB', 'CCS', 'STT', 'CAR'].flatMap((code, ci) =>
    Array.from({ length: 12 }, (_, i) => {
      const n = ci * 12 + i;
      return {
        id: `x${n}`, fileName: `${code}_${n}.mp4`, code,
        name: `${code}동작${n}`, part: ['전신', '하체', '상체', '코어'][n % 4],
        reps: 15, duration: 35 + (n % 21),
        filePath: `C:/v/x${n}.mp4`, playbackPath: `C:/v/x${n}.mp4`,
      };
    })),
];

const block = (clip, sets = 2) =>
  ({ uid: 'b_' + clip.id, clip, clips: [clip], sets,
     restBetweenSets: 20, restWithin: 0, restAfter: 60 });

// 여러 동작을 한 라운드로 묶은 블록
const group = (clips, sets = 3) =>
  ({ uid: 'g_' + clips.map(c => c.id).join('_'), clip: clips[0], clips, sets,
     restBetweenSets: 20, restWithin: 10, restAfter: 60 });

const STORE = {
  ft_customers: [{ id: 'u1', name: '홍길동', goal: '체지방 감소', level: '초급', notes: '' }],
  ft_blocks: [block(CLIPS[0]), group([CLIPS[1], CLIPS[2]])],
  ft_clip_attrs: {},
  // 시퀀스 사이 간격을 시험하려면 두 개 이상이어야 한다
  ft_sessions: [
    { id: 's1', name: '아침 시퀀스', blocks: [block(CLIPS[0]), block(CLIPS[1])] },
    { id: 's2', name: '저녁 시퀀스', blocks: [block(CLIPS[2])] },
    // 길이를 못 읽은 채 저장된 시퀀스. ft_durations 로 되살아나야 한다.
    { id: 's3', name: '길이 잃은 시퀀스', queued: false,
      blocks: [block({ ...CLIPS[0], duration: 0 }), block({ ...CLIPS[1], duration: 0 })] },
    // 어제 만들어 체크해 둔 시퀀스. 오늘 앱을 켜면 대기열에서 빠져야 한다.
    { id: 's0', name: '어제 시퀀스', queued: true, startAt: '10:30',
      savedAt: Date.now() - 36 * 3600 * 1000, blocks: [block(CLIPS[0])] },
  ],
  // c1=40초, c2=35초 → 블록당 40*2+20+60=160, 35*2+20+60=150 → 합 310초 = 5분 10초
  ft_durations: { 'C:/v/a.mp4': 40, 'C:/v/b.mp4': 35, 'C:/v/c.mp4': 45 },
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
  // 예전 버전이 저장해 둔, 지금은 없어진 탭. 업데이트한 사람의 상황을 흉내 낸다.
  localStorage.setItem('ft_tab', JSON.stringify('builder'));
}, CLIPS);

await page.goto(base, { waitUntil: 'networkidle' });

// 화면이 아예 안 그려졌는지부터 본다. 흰 화면 사고가 여기서 걸린다.
const rendered = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
if (rendered === 0) failures.push('root 가 비어 있습니다 — 화면이 렌더되지 않았습니다');

// 없어진 탭이 저장돼 있어도 빈 화면이 아니라 만들기 탭이 열려야 한다
{
  const txt = await page.locator('#root').innerText();
  const ok = txt.includes('자동 구성') || txt.includes('직접 구성');
  console.log(`${ok ? '  OK' : 'FAIL'}  없어진 탭이 저장돼 있어도 화면이 뜬다`);
  if (!ok) failures.push('예전 탭(builder)이 저장돼 있으면 내용이 비어 있습니다');
}

const TABS = ['라이브러리', '고객', '시퀀스 만들기', '시퀀스 목록', '재생', '기록', '설정'];
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
    const n = await page.locator('input[type=checkbox][aria-label$="대기열에 포함"]').count();
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

  await step('길이를 못 읽고 저장된 시퀀스가 되살아나야 함', async () => {
    const all = await page.locator('#root').innerText();
    const i = all.indexOf('길이 잃은 시퀀스');
    if (i === -1) throw new Error('시퀀스가 목록에 없음');
    const near = all.slice(i, i + 80).replace(/\n/g, ' / ');
    // 되살아나지 않으면 휴식만 남아 2분 40초로 보인다
    if (!near.includes('5분 10초'))
      throw new Error(`길이가 되살아나지 않음 — 표시: ${near}`);
  });

  await step('체크를 풀면 간격 설정이 사라져야 함', async () => {
    // 화면에는 다른 체크박스도 있다. 시퀀스 줄의 것만 집는다.
    await page.locator('input[type=checkbox][aria-label$="대기열에 포함"]').first().uncheck();
    await page.waitForTimeout(250);
    if (await page.getByRole('button', { name: '지정 시각', exact: true }).count() !== 0)
      throw new Error('체크를 풀었는데도 간격 설정이 남아 있음');
    await page.locator('input[type=checkbox][aria-label$="대기열에 포함"]').first().check();
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  시퀀스 목록 · 체크와 간격`);
}
await checkQueueTab();

// 설정 탭: 동작 종류별 휴식 배수
async function checkRestScale() {
  const before = failures.length;
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  await page.waitForTimeout(300);
  try {
    const sliders = page.locator('input[type=range][aria-label$="휴식 배수"]');
    const n = await sliders.count();
    if (n < 8) throw new Error(`배수 조절기가 ${n}개뿐`);
    const txt = await page.locator('#root').innerText();
    // 기본값은 근력 ×1.00 60초, 스트레칭 ×0.30 18초
    for (const want of ['×1.00 · 60초', '×0.30 · 18초']) {
      if (!txt.includes(want)) throw new Error(`'${want}' 표시가 없음`);
    }
  } catch (e) {
    failures.push(`[설정] 휴식 배수: ${e.message.split('\n')[0]}`);
  }
  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  설정 · 동작 종류별 휴식`);
}
await checkRestScale();

// 만들기 → 목록으로 넘기기 → 목록에서 날짜·구성 확인
async function checkComposeFlow() {
  const before = failures.length;
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[흐름] ${what}: ${e.message.split('\n')[0]}`); }
  };

  await page.getByRole('button', { name: '시퀀스 만들기', exact: true }).first().click();
  await page.waitForTimeout(300);

  await step('자동·직접 두 방식을 고를 수 있다', async () => {
    for (const label of ['자동 구성', '직접 구성']) {
      if (await page.getByRole('button', { name: label, exact: true }).count() === 0)
        throw new Error(`'${label}' 없음`);
    }
  });

  await step('자동 구성에 조건과 컨셉이 함께 있다', async () => {
    await page.getByRole('button', { name: '자동 구성', exact: true }).first().click();
    await page.waitForTimeout(250);
    const txt = await page.locator('#root').innerText();
    for (const want of ['운동 시간', '강도', '집중 부위', '전신 근력']) {
      if (!txt.includes(want)) throw new Error(`'${want}' 없음`);
    }
  });

  await step('작업대의 구성을 목록으로 넘길 수 있다', async () => {
    const btn = page.getByRole('button', { name: '목록으로 보내기', exact: true }).first();
    if (await btn.count() === 0) throw new Error('보내기 버튼이 없음');
    await page.locator('input[aria-label="시퀀스 이름"]').fill('테스트 시퀀스');
    await btn.click();
    await page.waitForTimeout(400);
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('목록에 넣었습니다')) throw new Error('보낸 뒤 안내가 없음');
  });

  await step('목록에 만든 날짜가 보인다', async () => {
    await page.getByRole('button', { name: '시퀀스 목록', exact: true }).first().click();
    await page.waitForTimeout(350);
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('테스트 시퀀스')) throw new Error('넘긴 시퀀스가 목록에 없음');
    if (!/오늘 \d\d:\d\d/.test(txt)) throw new Error('만든 날짜 표시가 없음');
  });

  await step('눌러서 구성 내용을 볼 수 있다', async () => {
    await page.getByText('테스트 시퀀스', { exact: false }).first().click();
    await page.waitForTimeout(300);
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('눌러서 접기')) throw new Error('구성이 펼쳐지지 않음');
  });

  await step('목록에서는 더 이상 만들지 않는다', async () => {
    const txt = await page.locator('#root').innerText();
    if (txt.includes('+ 전신 근력'))
      throw new Error('목록에 만들기 버튼이 남아 있음');
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  만들기 → 목록 흐름`);
}
await checkComposeFlow();

// 하루 시간표: 정한 시각에만 영상이 돌고 사이에는 남은 시간이 뜬다
async function checkSchedule() {
  const before = failures.length;
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[시간표] ${what}: ${e.message.split('\n')[0]}`); }
  };
  await page.getByRole('button', { name: '시퀀스 목록', exact: true }).first().click();
  await page.waitForTimeout(300);

  await step('시간표를 켤 수 있다', async () => {
    const btn = page.getByRole('button', { name: /시간표 (켜짐|꺼짐)/ }).first();
    if (await btn.count() === 0) throw new Error('시간표 스위치가 없음');
    await btn.click();
    await page.waitForTimeout(350);
    if (await page.getByRole('button', { name: '시간표 켜짐', exact: true }).count() === 0)
      throw new Error('켜지지 않음');
  });

  await step('시퀀스마다 시작 시각이 생긴다', async () => {
    const n = await page.locator('input[type=time][aria-label$="운동 시작 시각"]').count();
    if (n < 2) throw new Error(`시각 칸이 ${n}개뿐`);
  });

  await step('시간표일 때는 간격 설정이 사라진다', async () => {
    if (await page.getByRole('button', { name: '지정 시각', exact: true }).count() !== 0)
      throw new Error('간격 설정이 남아 있음');
  });

  await step('시작 버튼이 시간표 문구로 바뀐다', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('오늘 시간표 시작')) throw new Error("'오늘 시간표 시작' 이 없음");
    if (!txt.includes('다음 운동까지')
      && !txt.includes('정한 시각에만 영상이 돌아갑니다'))
      throw new Error('시간표 안내가 없음');
  });

  await step('다시 누르면 꺼지고 시각이 비워진다', async () => {
    await page.getByRole('button', { name: '시간표 켜짐', exact: true }).first().click();
    await page.waitForTimeout(350);
    if (await page.locator('input[type=time][aria-label$="운동 시작 시각"]').count() !== 0)
      throw new Error('껐는데 시각 칸이 남아 있음');
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  시간표 · 시각 지정`);
}
await checkSchedule();

// 요일별 운동: 오늘 할 운동이 먼저 뜨고, 요일표를 고칠 수 있다
async function checkWeekday() {
  const before = failures.length;
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[요일] ${what}: ${e.message.split('\n')[0]}`); }
  };
  const 요일 = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];

  await page.getByRole('button', { name: '시퀀스 만들기', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '자동 구성', exact: true }).first().click();
  await page.waitForTimeout(250);

  await step('오늘 요일이 보인다', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes(`오늘은 ${요일}요일`)) throw new Error(`'오늘은 ${요일}요일' 이 없음`);
  });

  await step('오늘의 운동이 먼저 뜬다', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('오늘의 운동')) throw new Error("'오늘의 운동' 안내가 없음");
  });

  await step('라이브러리 종류별 개수가 보인다', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('라이브러리에 있는 종류')) throw new Error('개수 표시가 없음');
    // 픽스처는 종류마다 12개씩 들어 있다
    if (!/STR 1[23]/.test(txt)) throw new Error('STR 개수가 보이지 않음');
  });

  await step('같은 컨셉을 또 눌러도 겹치지 않는다고 알린다', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('최근에 쓴 동작은 빼고')) throw new Error('안내 문구가 없음');
  });

  await step('설정에서 요일표를 고칠 수 있다', async () => {
    await page.getByRole('button', { name: '설정', exact: true }).first().click();
    await page.waitForTimeout(350);
    const n = await page.locator('select[aria-label$="요일 운동"]').count();
    if (n !== 7) throw new Error(`요일 칸이 ${n}개`);
    const mon = page.locator('select[aria-label="월요일 운동"]');
    if (await mon.inputValue() !== 'full_strength')
      throw new Error('월요일 기본값이 전신 근력이 아님');
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  요일별 운동`);
}
await checkWeekday();

// 아침에 한 번 눌러 하루치를 짜는 흐름
async function checkDayPlan() {
  const before = failures.length;
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[하루짜기] ${what}: ${e.message.split('\n')[0]}`); }
  };
  await page.getByRole('button', { name: '시퀀스 목록', exact: true }).first().click();
  await page.waitForTimeout(350);

  // 간격을 계산해서 넣는 게 아니라, 운영하는 시각을 그대로 누른다.
  await step('운영 시각을 눌러서 고른다', async () => {
    for (const h of [6, 13, 18, 22]) {
      if (await page.locator(`[aria-label="${h}시 운영"]`).count() === 0)
        throw new Error(`${h}시 칸이 없음`);
    }
  });

  await step('고른 시각을 그대로 보여 준다', async () => {
    await page.getByRole('button', { name: '시각 비우기', exact: true }).click();
    // 띄엄띄엄 운영해도 간격 계산이 필요 없어야 한다
    for (const h of [10, 11, 13, 18]) {
      await page.locator(`[aria-label="${h}시 운영"]`).click();
    }
    await page.waitForTimeout(250);
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('4타임 · 10:00 · 11:00 · 13:00 · 18:00'))
      throw new Error('고른 시각 안내가 다름');
  });

  await step('누르면 하루치가 만들어지고 시각이 붙는다', async () => {
    await page.getByRole('button', { name: '하루치 짜기', exact: true }).click();
    await page.waitForTimeout(1200);
    const txt = await page.locator('#root').innerText();
    if (!/\d타임을 짰습니다/.test(txt)) throw new Error('짜였다는 안내가 없음');
    if (!txt.includes('1타임 10:00')) throw new Error('타임에 시각이 안 붙음');
    // 간격이 아니라 누른 시각 그대로여야 한다
    if (!txt.includes('18:00')) throw new Error('18시 타임이 없음');
    const times = await page.locator('input[type=time][aria-label$="운동 시작 시각"]').count();
    if (times < 4) throw new Error(`시각 칸이 ${times}개`);
  });

  await step('짜고 나면 시간표가 켜진 상태다', async () => {
    if (await page.getByRole('button', { name: '시간표 켜짐', exact: true }).count() === 0)
      throw new Error('시간표가 꺼져 있음');
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('오늘 시간표 시작')) throw new Error('시작 버튼 문구가 다름');
  });

  // 겹침이 0 일 수는 없다. 부위를 고른 성격은 그 부위 동작만 쓰는데, 일곱 타임
  // × 열 동작을 부위가 맞는 동작 스무남은 개로 채우려면 산술적으로 돌려 쓸 수밖에
  // 없다. 부위를 안 지키면 0 이 나오지만, 그건 '하체 집중인데 코어가 나온다'는
  // 그 문제다. 그래서 겹침이 절반을 넘지 않는지를 본다.
  await step('타임끼리 겹침이 절반을 넘지 않는다', async () => {
    const names = await page.evaluate(() => {
      const ses = JSON.parse(localStorage.getItem('ft_sessions') || '[]')
        .filter(s => s.startAt);
      return ses.map(s => s.blocks.flatMap(b => (b.clips || [b.clip]).map(c => c?.filePath)));
    });
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const dup = names[i].filter(x => names[j].includes(x));
        const limit = Math.max(1, Math.floor(Math.min(names[i].length, names[j].length) / 2));
        if (dup.length > limit)
          throw new Error(`${i + 1}타임과 ${j + 1}타임이 ${dup.length}개 겹침 (한도 ${limit})`);
      }
    }
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  오늘 하루 짜기`);
}
await checkDayPlan();

// 날이 바뀌면 어제 대기열은 비워야 한다
async function checkRollover() {
  const before = failures.length;
  try {
    const y = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem('ft_sessions') || '[]')
        .find(s => s.id === 's0')) || null);
    if (!y) throw new Error('어제 시퀀스가 사라졌습니다 — 지우면 안 됩니다');
    if (y.queued !== false) throw new Error('어제 시퀀스가 아직 대기열에 있습니다');
    if (y.startAt) throw new Error(`어제 시각이 남아 있습니다 (${y.startAt})`);
  } catch (e) {
    failures.push(`[날 바뀜] ${e.message.split('\n')[0]}`);
  }
  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  날이 바뀌면 어제 대기열은 비운다`);
}
await checkRollover();

// 시퀀스 빌더: 묶음 표시와 묶기/풀기
async function checkGrouping() {
  const before = failures.length;
  await page.getByRole('button', { name: '시퀀스 만들기', exact: true }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '직접 구성', exact: true }).first().click();
  await page.waitForTimeout(350);
  const step = async (what, fn) => {
    try { await fn(); } catch (e) { failures.push(`[빌더] ${what}: ${e.message.split('\n')[0]}`); }
  };

  await step('묶음이 동작을 이어서 보여야 함', async () => {
    const txt = await page.locator('#root').innerText();
    if (!txt.includes('햄스트링 → 점핑잭')) throw new Error('묶음 표시가 없음');
    if (!txt.includes('묶음 2동작')) throw new Error("'묶음 2동작' 안내가 없음");
  });

  await step('시간이 소수로 새어 나오지 않는다', async () => {
    const txt = await page.locator('#root').innerText();
    const bad = txt.match(/\d+[.:]\d*\d{4,}/);
    if (bad) throw new Error(`소수가 그대로 보임: ${bad[0]}`);
  });

  await step('묶음은 풀 수 있어야 함', async () => {
    if (await page.getByRole('button', { name: '묶음 풀기', exact: true }).count() === 0)
      throw new Error("'묶음 풀기' 버튼이 없음");
  });

  await step('낱개 동작은 위와 묶을 수 있어야 함', async () => {
    if (await page.getByRole('button', { name: '위와 묶기', exact: true }).count() === 0)
      throw new Error("'위와 묶기' 버튼이 없음");
  });

  await step('풀면 낱개 두 줄이 되어야 함', async () => {
    await page.getByRole('button', { name: '묶음 풀기', exact: true }).first().click();
    await page.waitForTimeout(300);
    const txt = await page.locator('#root').innerText();
    if (txt.includes('묶음 2동작')) throw new Error('풀었는데 묶음이 남아 있음');
  });

  console.log(`${failures.length === before ? '  OK' : 'FAIL'}  만들기 · 동작 묶기/풀기`);
}
await checkGrouping();

await browser.close();
server.close();

if (failures.length) {
  console.error('\n실패 ' + failures.length + '건:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n스모크 테스트 통과 — 모든 탭 정상');
