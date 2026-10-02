// 하루 시간표대로 큐가 짜이는지 본다.
//
// 아침 10시에 켜 두고 밤까지 두면, 정한 시각에만 영상이 돌고 그 사이에는
// 다음 운동까지 남은 시간이 떠야 한다. 예전에는 대기가 시퀀스 '사이'에만
// 들어가서 첫 운동 시각을 정할 수 없었다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.jsx'), 'utf8');

const fails = [];
const check = (what, ok, detail) => {
  console.log(`${ok ? '  OK' : 'FAIL'}  ${what}`);
  if (!ok) fails.push(`${what}${detail ? ' — ' + detail : ''}`);
};

// 큐를 만드는 규칙을 그대로 옮겨 와 돌려 본다
function secondsUntilClock(at, from, rollover = true) {
  const [h, m] = String(at || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const target = new Date(from); target.setHours(h, m, 0, 0);
  const diff = Math.round((target - from) / 1000);
  if (diff >= 0) return diff;
  return rollover ? diff + 24 * 3600 : 0;
}

function buildQueue(entries) {
  const q = [];
  entries.forEach((entry, i) => {
    if (!entry.blocks?.length) return;
    if (entry.startAt) {
      const prev = q[q.length - 1];
      if (prev?.type === 'rest') q.pop();
      q.push({ type: 'break', scheduled: true, untilClock: entry.startAt,
               sessionName: i > 0 ? entries[i - 1]?.name || '' : '', nextName: entry.name });
    }
    entry.blocks.forEach(() => {
      q.push({ type: 'clip', sessionName: entry.name });
      q.push({ type: 'rest', restKind: 'move' });
    });
    const next = entries[i + 1];
    if (!next || next.startAt) return;
    q.push({ type: 'break', duration: 600, nextName: next.name });
  });
  if (q.length > 0 && entries.some(e => e.startAt)) {
    const last = entries.filter(e => e.startAt).pop();
    if (q[q.length - 1]?.type === 'rest') q.pop();
    q.push({ type: 'standby', sessionName: last?.name || '',
             firstClock: entries.find(e => e.startAt)?.startAt || '' });
  }
  return q;
}

const day = [
  { name: '1부', startAt: '10:30', blocks: [1, 2] },
  { name: '2부', startAt: '12:00', blocks: [1] },
  { name: '3부', startAt: '14:00', blocks: [1] },
];
const q = buildQueue(day);

check('첫 운동 앞에도 대기가 들어간다',
  q[0]?.type === 'break' && q[0]?.untilClock === '10:30' && q[0].scheduled === true,
  `첫 항목: ${JSON.stringify(q[0])}`);

check('운동마다 대기가 하나씩 붙는다',
  q.filter(x => x.type === 'break' && x.scheduled).length === 3);

check('시각이 있으면 간격 대기는 안 생긴다',
  q.filter(x => x.type === 'break' && !x.scheduled).length === 0);

check('대기 앞 전환 휴식은 겹치지 않게 빠진다', (() => {
  const i = q.findIndex((x, k) => k > 0 && x.type === 'break');
  return q[i - 1]?.type === 'clip';
})());

check('대기 화면에 다음 운동 이름이 실린다',
  q.filter(x => x.scheduled).every(x => x.nextName));

// 10시에 켜면 각 운동까지 남는 시간
{
  const from = new Date(2026, 8, 28, 10, 0, 0);
  const waits = q.filter(x => x.scheduled)
    .map(x => secondsUntilClock(x.untilClock, from, false) / 60);
  check('10시에 켜면 30분·120분·240분 뒤',
    JSON.stringify(waits) === JSON.stringify([30, 120, 240]), `${waits}분`);
}

// 늦게 켠 경우 — 지난 운동은 기다리지 않는다
{
  const from = new Date(2026, 8, 28, 13, 0, 0);
  const waits = q.filter(x => x.scheduled)
    .map(x => secondsUntilClock(x.untilClock, from, false) / 60);
  check('13시에 켜면 지난 두 개는 바로, 다음은 60분 뒤',
    JSON.stringify(waits) === JSON.stringify([0, 0, 60]), `${waits}분`);
}

// 마지막 타임이 끝나도 멈추지 않는다. 멈추면 피시가 잠들어 다음 날 못 쓴다.
check('마지막 타임 뒤에 마감 화면이 붙는다',
  q[q.length - 1]?.type === 'standby', `마지막 항목: ${JSON.stringify(q[q.length - 1])}`);
check('마감 화면이 내일 첫 타임을 안다',
  q[q.length - 1]?.firstClock === '10:30');
check('시각이 없는 대기열에는 마감 화면이 안 붙는다',
  !buildQueue([{ name: 'ㄱ', blocks: [1] }]).some(x => x.type === 'standby'));

// 화면 문구
check("대기 화면이 '다음 운동까지' 로 뜬다", /다음 운동까지/.test(src));
check('마감 화면이 실제로 그려진다', /'standby'/.test(src) && /오늘 운동 마감/.test(src));
check("'수업' 이라는 말은 쓰지 않는다", !/수업/.test(src));
check('시간표를 켜고 끌 수 있다', /turnScheduleOn/.test(src) && /turnScheduleOff/.test(src));

// 운영 시각 사이에는 영상이 아니라 카운트다운만 돈다. 막지 않으면 화면이 꺼진다.
{
  const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  check('절전을 막는 배선이 끊기지 않았다',
    /powerSaveBlocker/.test(mainJs) && /prevent-display-sleep/.test(mainJs)
    && /'keep-awake'/.test(mainJs) && /keepAwake/.test(preload)
    && /electronAPI\?\.keepAwake/.test(src));
  // 재생 화면 안에서만 걸면, 탭을 옮기는 순간 그 화면이 사라지며 같이 풀린다.
  check('절전 차단이 재생 화면 밖에서 걸린다', /scheduleArmed/.test(src)
    && /shouldStayAwake/.test(src));
  check('절전 차단을 주기적으로 다시 건다',
    /setInterval\(apply, 60000\)/.test(src));
  check('걸렸는지 아닌지를 화면에 보여 준다', /화면 꺼짐 방지 켜짐/.test(src));
  check('실제로 걸렸는지 확인해서 돌려준다', /isStarted\(awakeId\)/.test(mainJs));
  check('앱을 닫을 때는 절전을 풀어 준다', /will-quit[\s\S]{0,60}keepAwake\(false\)/.test(mainJs));
}

if (fails.length) {
  console.error('\n실패 ' + fails.length + '건:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n하루 시간표 테스트 통과');
