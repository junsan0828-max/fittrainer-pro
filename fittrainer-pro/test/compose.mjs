// 목표 시간이 실제 재생 시간과 맞는지 확인한다.
//
// "45분으로 맞췄는데 30분대가 나온다"는 제보에서 출발했다. 원인은 조합 계산이
// 아니라 영상 길이를 아직 못 읽은 상태였다. 조합기는 모르는 길이를 40초로
// 가정하는데 재생 큐는 0 으로 세기 때문에, 계획은 45분인데 실제는 20분대였다.
// 그 어긋남이 다시 생기면 여기서 걸린다.
//
// 지키는 약속은 둘이다.
//   1. 실제 재생 시간은 목표보다 짧지 않다. 이건 예외가 없다.
//      넘치면 트레이너가 건너뛰면 되지만, 모자라면 수업 중에 채울 수 없다.
//   2. 넘치더라도 목표 + 10분 안이다. 영상이 길면(150초짜리를 3세트 하면
//      한 동작에 9분이 넘는다) 마지막 한 동작 때문에 구조적으로 넘칠 수 있다.

import { composeProgram, CONCEPT_MAP, restAfterFor, withinGaps } from '../renderer/src/composeProgram.js';

// 재생 큐가 실제로 쓰는 계산. App.jsx 의 expandToQueue + itemSeconds 와 같은 규칙이다.
function actualSeconds(blocks) {
  return blocks.reduce((t, b) => {
    const list = b.clips?.length ? b.clips : [b.clip];
    const round = list.reduce((n, c) => n + (c?.duration || 0), 0)
      + (b.gaps || []).reduce((n, g) => n + g, 0);
    return t + round * b.sets + b.restBetweenSets * (b.sets - 1) + b.restAfter;
  }, 0);
}

// App.jsx 의 blocksFromPlan 과 같은 방식이어야 한다
function toBlocks(r) {
  const single = (list, phase) => list.map(clip => ({
    clip, clips: [clip], phase, sets: 1, restBetweenSets: 10, gaps: [],
    restAfter: phase === 'warmup' ? 10 : 15,
  }));
  const units = r.mainUnits || r.mainClips.map(c => [c]);
  const main = units.map(unit => ({
    clip: unit[0], clips: unit, phase: 'main',
    sets: r.mainSets,
    restBetweenSets: r.restBetweenSets,
    gaps: unit.length > 1 ? withinGaps(unit, r.restWithin || 0, r.restScale) : [],
    restAfter: restAfterFor(unit[0], r.restAfter, r.restScale),
  }));
  return [...single(r.warmupClips, 'warmup'), ...main, ...single(r.coolClips, 'cooldown')];
}

const CATS = ['STR', 'MOV', 'CFR', 'CFS', 'CCB', 'CCS', 'STT', 'CAR'];
const PARTS = ['전신', '하체', '상체', '코어'];
const lib = (n, durFn) => Array.from({ length: n }, (_, i) => ({
  id: 'c' + i, filePath: `C:/v/${i}.mp4`, fileName: `${i}.mp4`,
  code: CATS[i % CATS.length], part: PARTS[i % PARTS.length],
  name: '동작' + i, reps: 15, duration: durFn(i),
}));

// 실제 라이브러리에서 나올 법한 길이 분포들
const CASES = [
  ['짧은 영상 20~30초', lib(200, i => 20 + (i % 11))],
  ['보통 40~60초',      lib(200, i => 40 + (i % 21))],
  ['긴 영상 90~150초',  lib(200, i => 90 + (i % 61))],
  ['뒤섞인 길이',       lib(200, i => [18, 35, 52, 88, 140][i % 5])],
  ['영상 수 부족 24개', lib(24,  i => 40 + (i % 21))],
  // 풀이 바닥나 쓰던 동작을 다시 돌려야만 목표를 채울 수 있는 경우
  ['라이브러리 8개뿐',  lib(8,   i => 30 + (i % 7))],
];

const TARGETS = [30, 45, 60];
const RUNS = 25;
const fmt = s => (s / 60).toFixed(1) + '분';

const failures = [];
for (const [label, clips] of CASES) {
  for (const target of TARGETS) {
    let worst = Infinity, over = 0;
    for (const con of Object.values(CONCEPT_MAP)) {
      for (let k = 0; k < RUNS; k++) {
        const cfg = { duration: target, includeCats: con.cats, focus: con.focus, method: con.method };
        const r = composeProgram({ enrichedClips: clips, customer: {}, sessionCfg: cfg });
        const real = actualSeconds(toBlocks(r));
        worst = Math.min(worst, real);
        over = Math.max(over, real);
        // 조합기가 스스로 낸 예상과 실제 재생 시간이 달라서는 안 된다
        if (Math.abs(real - r.estimatedSeconds) > 1) {
          failures.push(`${label}/${target}분/${con.code}: 예상 ${fmt(r.estimatedSeconds)} ≠ 실제 ${fmt(real)}`);
        }
      }
    }
    const lo = target * 60, hi = (target + 10) * 60;
    if (worst < lo)
      failures.push(`${label} / 목표 ${target}분: 목표보다 짧다 — 최소 ${fmt(worst)}`);
    if (over > hi)
      failures.push(`${label} / 목표 ${target}분: 너무 넘친다 — 최대 ${fmt(over)} (허용 ${target + 10}분)`);
    const ok = worst >= lo && over <= hi;
    console.log(`${ok ? '  OK' : 'FAIL'}  ${label.padEnd(18)} 목표 ${target}분 → ${fmt(worst)} ~ ${fmt(over)}`
      + `  (+${((over - lo) / 60).toFixed(1)}분까지)`);
  }
}

// ---- 시간을 무엇으로 채우는가 ----
// 목표를 하한으로 삼으면 자칫 휴식만 늘리거나 같은 동작을 반복해 시간을 채우게 된다.
// 코어는 어느 구성에나 붙일 수 있으니 그걸로 메워야 한다.
const CORE = ['CCS', 'CCB'];
{
  const clips = lib(200, i => 40 + (i % 21));
  let restMax = 0, core = 0, main = 0, dup = 0, runs = 0;
  for (const con of Object.values(CONCEPT_MAP)) {
    if (!con.cats.some(c => CORE.includes(c))) continue;   // 코어 없는 컨셉은 해당 없음
    for (let k = 0; k < RUNS; k++) {
      const r = composeProgram({ enrichedClips: clips, customer: {},
        sessionCfg: { duration: 45, includeCats: con.cats, focus: con.focus, method: con.method } });
      restMax = Math.max(restMax, r.restAfter);
      core += r.mainClips.filter(c => CORE.includes(c.code)).length;
      main += r.mainClips.length;
      dup += r.mainClips.length - new Set(r.mainClips.map(c => c.id)).size;
      runs++;
    }
  }
  const corePct = (core / main) * 100;
  const dupAvg = dup / runs;

  // 휴식을 설정값(60초)의 두 배 넘게 부풀려 시간을 때우면 운동이 아니다
  if (restMax > 120) failures.push(`시간을 휴식으로 때운다 — 동작 사이 휴식 최대 ${restMax}초`);
  // 영상이 200개나 있는데 같은 동작을 반복할 이유가 없다
  if (dupAvg > 0.5) failures.push(`같은 동작이 반복된다 — 시퀀스당 평균 ${dupAvg.toFixed(2)}개`);
  // 코어로 메우는지 확인. 코어를 안 쓰면 30% 아래로 떨어진다
  if (corePct < 30) failures.push(`코어로 시간을 메우지 않는다 — 본운동 중 코어 ${corePct.toFixed(0)}%`);

  const ok = restMax <= 120 && dupAvg <= 0.5 && corePct >= 30;
  console.log(`\n${ok ? '  OK' : 'FAIL'}  시간을 채우는 재료 — `
    + `코어 ${corePct.toFixed(0)}% · 휴식 최대 ${restMax}초 · 중복 ${dupAvg.toFixed(2)}개`);
}

// ---- 묶음 안 전환 시간 ----
// 한 라운드 안이라고 30초, 30초 똑같이 쉴 이유는 없다.
// 방금 끝낸 동작이 근력이냐 폼롤링이냐에 따라 달라야 한다.
{
  const clips = lib(200, i => 40 + (i % 21));
  let variedPrograms = 0, programs = 0, minGap = Infinity, maxGap = 0;
  const byCode = new Map();
  for (const con of Object.values(CONCEPT_MAP)) {
    for (let k = 0; k < RUNS; k++) {
      const r = composeProgram({ enrichedClips: clips, customer: {},
        sessionCfg: { duration: 45, groupSize: 3, includeCats: con.cats,
                      focus: con.focus, method: con.method } });
      // 묶음이 2개로 줄면 한 묶음에 전환이 하나뿐이라, 시퀀스 전체를 놓고 본다
      const all = [];
      for (const u of r.mainUnits) {
        if (u.length < 2) continue;
        const g = withinGaps(u, r.restWithin, r.restScale);
        g.forEach((v, idx) => {
          all.push(v);
          minGap = Math.min(minGap, v);
          maxGap = Math.max(maxGap, v);
          const code = u[idx].code;
          if (!byCode.has(code)) byCode.set(code, new Set());
          byCode.get(code).add(v);
        });
      }
      if (all.length < 2) continue;
      programs++;
      if (new Set(all).size > 1) variedPrograms++;
    }
  }
  const pct = programs ? (variedPrograms / programs) * 100 : 0;

  // 지켜야 할 성질은 둘이다.
  //  - 같은 종류는 늘 같은 값이다(배수로 정해진다는 뜻).
  //  - 종류가 다르면 값도 다르다.
  // 시퀀스마다 값이 여러 가지인지는 컨셉에 달렸다. 회복 컨셉처럼 스트레칭과
  // 폼롤링만 나오면 값이 같은 게 오히려 맞다. 그래서 비율은 참고만 한다.
  const unstable = [...byCode.entries()].filter(([, v]) => v.size > 1).map(([c]) => c);
  const distinct = new Set([...byCode.values()].flatMap(v => [...v])).size;

  if (unstable.length)
    failures.push(`같은 종류인데 전환이 들쭉날쭉하다 — ${unstable.join(', ')}`);
  if (distinct < 4)
    failures.push(`종류가 달라도 전환이 같다 — 서로 다른 값이 ${distinct}가지뿐`);
  // 전환이 너무 길면 묶음이 아니라 그냥 따로 하는 것과 같다
  if (maxGap > 30) failures.push(`묶음 안 전환이 너무 길다 — 최대 ${maxGap}초`);
  if (minGap < 5) failures.push(`묶음 안 전환이 너무 짧다 — 최소 ${minGap}초`);

  const ok = !unstable.length && distinct >= 4 && maxGap <= 30 && minGap >= 5;
  console.log(`${ok ? '  OK' : 'FAIL'}  묶음 안 전환 — `
    + `${minGap}~${maxGap}초 · 종류별 ${distinct}가지 값 · 시퀀스의 ${pct.toFixed(0)}%가 섞어 씀`);
}

if (failures.length) {
  console.error('\n실패 ' + failures.length + '건:');
  for (const f of [...new Set(failures)].slice(0, 12)) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n구성 시간 테스트 통과');
