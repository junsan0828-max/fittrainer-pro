// 같은 성격의 운동이 반복돼도 내용이 겹치지 않는지 본다.
//
// 월요일은 늘 전신 근력이다. 그런데 같은 날 10시 반과 12시 운동이 똑같거나,
// 이번 주 월요일과 다음 주 월요일이 똑같으면 회원이 바로 알아챈다.
// 조합기는 최근에 쓴 동작을 뒤로 미뤄 이걸 막는다.

import { composeProgram, CONCEPT_MAP } from '../renderer/src/composeProgram.js';

const CATS = ['STR', 'MOV', 'CFR', 'CFS', 'CCB', 'CCS', 'STT', 'CAR'];
const PARTS = ['전신', '하체', '상체', '코어'];
const lib = n => Array.from({ length: n }, (_, i) => ({
  id: 'c' + i, filePath: `C:/v/${i}.mp4`, fileName: `${i}.mp4`,
  code: CATS[i % CATS.length], part: PARTS[i % PARTS.length],
  name: '동작' + i, reps: 15, duration: 40 + (i % 21),
}));

const fails = [];
const check = (what, ok, detail) => {
  console.log(`${ok ? '  OK' : 'FAIL'}  ${what}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(what + (detail ? ' — ' + detail : ''));
};

// 한 번 짜고, 쓴 동작을 기록에 남긴다 (앱의 markUsed 와 같은 규칙)
function run(clips, con, use, at) {
  const r = composeProgram({
    enrichedClips: clips, customer: {},
    sessionCfg: {
      duration: 45, includeCats: con.cats, focus: con.focus,
      method: con.method, recentUse: use,
    },
  });
  const used = [...r.warmupClips, ...r.mainClips, ...r.coolClips].map(c => c.filePath);
  for (const fp of new Set(used)) use[fp] = at;
  return new Set(used);
}

const overlap = (a, b) => [...a].filter(x => b.has(x)).length / Math.max(1, Math.min(a.size, b.size));
const con = CONCEPT_MAP.full_strength;
const DAY = 86400000;

// ---- 같은 날 여러 타임 ----
{
  const clips = lib(200);
  const use = {};
  const morning = new Date(2026, 8, 28, 10, 30).getTime();
  const sets = [0, 1, 2, 3].map(i => run(clips, con, use, morning + i * 5400000));
  let worst = 0;
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++)
      worst = Math.max(worst, overlap(sets[i], sets[j]));
  check('같은 날 네 타임이 서로 겹치지 않는다', worst === 0,
    `가장 많이 겹친 쌍 ${Math.round(worst * 100)}%`);
}

// ---- 주마다 ----
{
  const clips = lib(200);
  const use = {};
  const mon = new Date(2026, 8, 28, 10, 30).getTime();
  const weeks = [0, 1, 2, 3].map(w => run(clips, con, use, mon + w * 7 * DAY));
  let worst = 0;
  for (let i = 0; i < weeks.length; i++)
    for (let j = i + 1; j < weeks.length; j++)
      worst = Math.max(worst, overlap(weeks[i], weeks[j]));
  check('네 주 연속 월요일이 서로 겹치지 않는다', worst === 0,
    `가장 많이 겹친 쌍 ${Math.round(worst * 100)}%`);
}

// ---- 영상이 적어 어쩔 수 없이 돌려써야 할 때 ----
{
  const clips = lib(40);
  const use = {};
  const mon = new Date(2026, 8, 28, 10, 30).getTime();
  const a = run(clips, con, use, mon);
  const b = run(clips, con, use, mon + 5400000);
  // 40개뿐이면 다 피할 수는 없다. 그래도 절반 넘게 같으면 안 된다.
  check('영상이 적어도 절반 넘게 겹치지는 않는다', overlap(a, b) <= 0.5,
    `${Math.round(overlap(a, b) * 100)}% 겹침`);
}

// ---- 기록을 안 주면 예전처럼 무작위 ----
{
  const clips = lib(200);
  const a = run(clips, con, {}, 0);
  const b = run(clips, con, {}, 0);
  check('기록이 없으면 그냥 섞어서 짠다', a.size > 0 && b.size > 0);
}

// ---- 요일 표 ----
{
  const { conceptForDay, WEEKDAY_CONCEPT_DEFAULT } = await import('../renderer/src/composeProgram.js');
  const want = ['full_strength', 'cardio_core', 'lower', 'circuit_full', 'upper_core'];
  const got = [1, 2, 3, 4, 5].map(d => {
    const day = new Date(2026, 8, 28);           // 2026-09-28 은 월요일
    day.setDate(day.getDate() + (d - 1));
    return conceptForDay(day);
  });
  check('월~금이 요일표대로 나온다', JSON.stringify(got) === JSON.stringify(want), got.join(', '));

  const custom = conceptForDay(new Date(2026, 8, 28), { 1: 'recovery' });
  check('요일표를 바꿀 수 있다', custom === 'recovery', custom);
}

if (fails.length) {
  console.error('\n실패 ' + fails.length + '건:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n반복 구성 다양성 테스트 통과');
