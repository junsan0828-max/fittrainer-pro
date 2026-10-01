// 라이브러리에 영상 종류가 몇 가지밖에 없을 때도, 고른 성격에 맞는 시퀀스가
// 나와야 한다.
//
// 제보: "하체 집중을 눌렀는데 다 코어 종류가 나와?"
// 그때 라이브러리에는 유산소(CAR)로 분류된 하체 영상 — 박스스텝업(점프),
// 스쿼트(점프,박스), 스윙(런지,케틀벨) 같은 것들 — 이 가득했고 코어밸런스(CCB)
// 가 조금 있었다. 그런데 '하체 집중' 성격이 쓰는 종류 목록에 CAR 이 없어서,
// 하체 영상이 전부 걸러지고 남은 CCB 로만 시퀀스가 채워졌다.
//
// 지키는 약속:
//   1. '하체 집중'은 CAR 로 분류된 하체 동작을 쓴다.
//   2. 종류가 2가지뿐인 라이브러리에서도 어떤 성격이든 한 종류로만 짜이지 않는다.
//   3. 부위가 맞는 동작이 있으면 그게 먼저 들어간다.

import { composeProgram, CONCEPT_MAP } from '../renderer/src/composeProgram.js';

// 제보자의 라이브러리를 그대로 옮긴 것: 하체로 태그된 CAR 다수 + CCB 소수
const LOWER_CARDIO = ['박스스텝업(점프)', '박스스텝업', '발차기', '스윙(런지,케틀벨)',
  '스윙(사이드,밸쿠)', '스윙(케틀벨,leg)', '스쿼트(사이드스텝)', '스쿼트(점프,박스)',
  '점프(사이드)', '피치(외발)', '피치(외발차기)', '피치(잔발)', '피치(제기차기)'];
const CORE = ['버드독(스탠딩)', '덩키킥(폼)', '플랭크(사이드)', '데드버그'];

let i = 0;
const clip = (name, code, part) => ({
  id: 'c' + (++i), filePath: `C:/v/${i}.mp4`, fileName: `${i}.mp4`,
  code, part, name, reps: 15, duration: 30 + (i % 20),
});
const clips = [
  ...LOWER_CARDIO.map(n => clip(n, 'CAR', '하체')),
  ...CORE.map(n => clip(n, 'CCB', '코어')),
];

const failures = [];
const RUNS = 15;

for (const con of Object.values(CONCEPT_MAP)) {
  for (let k = 0; k < RUNS; k++) {
    const r = composeProgram({
      enrichedClips: clips, customer: {},
      sessionCfg: { duration: 45, includeCats: con.cats, focus: con.focus, method: con.method },
    });
    const units = r.mainUnits || r.mainClips.map(c => [c]);
    const used = [...r.warmupClips, ...units.flat(), ...r.coolClips];
    if (used.length === 0) { failures.push(`${con.code}: 동작이 하나도 없다`); continue; }

    const kinds = new Set(used.map(c => c.code));
    if (kinds.size < 2) {
      failures.push(`${con.code}(${con.label}): ${[...kinds]} 한 종류로만 짜였다 (${used.length}동작)`);
    }
    if (con.code === 'lower') {
      const lowerParts = used.filter(c => c.part === '하체').length;
      if (lowerParts / used.length < 0.5) {
        failures.push(`lower(하체 집중): 하체 동작이 ${lowerParts}/${used.length} 뿐이다`);
      }
      if (!used.some(c => c.code === 'CAR')) {
        failures.push('lower(하체 집중): CAR 로 분류된 하체 동작을 하나도 안 썼다');
      }
    }
  }
}

if (failures.length) {
  console.error('라이브러리 종류가 적을 때 실패:');
  for (const f of [...new Set(failures)]) console.error('  - ' + f);
  process.exit(1);
}
console.log(`라이브러리 2종류(CAR 하체 ${LOWER_CARDIO.length} + CCB ${CORE.length})에서 ` +
  `${Object.keys(CONCEPT_MAP).length}가지 성격 × ${RUNS}회 — 모두 통과`);
