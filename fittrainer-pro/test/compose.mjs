// 목표 시간이 실제 재생 시간과 맞는지 확인한다.
//
// "45분으로 맞췄는데 30분대가 나온다"는 제보에서 출발했다. 원인은 조합 계산이
// 아니라 영상 길이를 아직 못 읽은 상태였다. 조합기는 모르는 길이를 40초로
// 가정하는데 재생 큐는 0 으로 세기 때문에, 계획은 45분인데 실제는 20분대였다.
// 그 어긋남이 다시 생기면 여기서 걸린다.

import { composeProgram, CONCEPT_MAP } from '../renderer/src/composeProgram.js';

// 재생 큐가 실제로 쓰는 계산. App.jsx 의 expandToQueue + itemSeconds 와 같은 규칙이다.
function actualSeconds(blocks) {
  return blocks.reduce((t, b) =>
    t + (b.clip?.duration || 0) * b.sets + b.restBetweenSets * (b.sets - 1) + b.restAfter, 0);
}

// generateConcept 이 조합 결과를 블록으로 바꾸는 방식과 같아야 한다
function toBlocks(r) {
  const mk = (list, phase) => list.map(clip => ({
    clip, phase,
    sets: phase === 'main' ? r.mainSets : 1,
    restBetweenSets: phase === 'main' ? r.restBetweenSets : 10,
    restAfter: phase === 'warmup' ? 10 : phase === 'cooldown' ? 15 : r.restAfter,
  }));
  return [...mk(r.warmupClips, 'warmup'), ...mk(r.mainClips, 'main'), ...mk(r.coolClips, 'cooldown')];
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
    const lo = target * 60, hi = (target + 5) * 60;
    const ok = worst >= lo && over <= hi;
    if (!ok) failures.push(`${label} / 목표 ${target}분: 최소 ${fmt(worst)}, 최대 ${fmt(over)} (허용 ${target}~${target + 5}분)`);
    console.log(`${ok ? '  OK' : 'FAIL'}  ${label.padEnd(18)} 목표 ${target}분 → ${fmt(worst)} ~ ${fmt(over)}`);
  }
}

if (failures.length) {
  console.error('\n실패 ' + failures.length + '건:');
  for (const f of [...new Set(failures)].slice(0, 12)) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n구성 시간 테스트 통과');
