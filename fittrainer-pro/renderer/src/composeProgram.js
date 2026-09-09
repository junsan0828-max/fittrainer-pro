// 운동 프로그램 조합 로직 — App.jsx(SessionTab)와 데모/테스트 스크립트가 공유하는 순수 함수 모듈.
// React에 의존하지 않아 Node에서도 그대로 import해서 실행/검증할 수 있다.
//
// 2026-08-26 개선 배경: 기존 로직은 "준비운동 → 본운동 → 정리운동"이 항상 고정 순서였고,
// 카테고리 풀에서 클립을 셔플 없이 앞에서부터 그대로 잘라 썼다(pool.slice(0,count)).
// 그 결과 (1) 유산소·회복 계열이 본운동 중간에 섞이는 구성이 구조적으로 불가능했고
// (2) 같은 조건이면 매번 같은 클립이 나와 "250개 영상"이 있어도 실제 체감 다양성은 거의 없었다.
// 이 모듈은 그 두 가지를 고친다: 여러 "훈련 기법(method)"으로 카테고리 배치 순서 자체를 다양화하고,
// 풀을 매번 셔플해 같은 조건에서도 다른 클립 조합이 나오게 한다.

export const CATS = [
  { code: 'STR', label: '근력', color: '#E84040' },
  { code: 'MOV', label: '움직임', color: '#9B5CF6' },
  { code: 'CFR', label: '폼롤링', color: '#F59E0B' },
  { code: 'CFS', label: '폼롤러스트레칭', color: '#F97316' },
  { code: 'CCB', label: '코어밸런스', color: '#3B82F6' },
  { code: 'CCS', label: '코어스트렝스', color: '#A78BFA' },
  { code: 'STT', label: '스트레칭', color: '#22C55E' },
  { code: 'CAR', label: '유산소', color: '#84CC16' },
  { code: 'TMR', label: '타이머', color: '#64748B' },
];
export const CAT_MAP = Object.fromEntries(CATS.map(c => [c.code, c]));

// 트레이너가 직접 고를 수도, 'auto'로 회원 레벨/강도에 맡길 수도 있다 —
// "다양한 방식으로 하라는거지 꼭 고집할 필요는 없어. 회원 체력이나 근력수준에 맞춰서
// 단순하게든 복합적이든 구성하는 게 중요한거야" (대표 피드백, 2026-08-26)를 그대로 반영.
export const TRAINING_METHODS = [
  { code: 'auto', label: '자동 (레벨·강도 기반)' },
  { code: 'block', label: '블록형 — 근력→코어→유산소 순차' },
  { code: 'circuit', label: '서킷형 — 근력·코어·유산소 라운드 반복' },
  { code: 'interleave', label: '복합교차형 — 유산소·회복을 전 구간에 교차 배치' },
  { code: 'superset', label: '슈퍼세트 — 부위 다른 근력 클립 페어 연속' },
];

// 프로그램 컨셉. 고르면 카테고리·집중 부위·구성 기법이 한 번에 잡힌다.
// 준비/정리운동 재료(CFR·CFS·MOV·STT)는 어느 컨셉에나 들어가야 구성이 완성된다.
export const CONCEPTS = [
  { code: 'full_strength', label: '전신 근력',
    cats: ['STR', 'MOV', 'CCS', 'CCB', 'CFR', 'CFS', 'STT'], focus: '전신', method: 'block' },
  { code: 'cardio_core', label: '유산소 · 코어',
    cats: ['CAR', 'CCB', 'CCS', 'MOV', 'CFR', 'CFS', 'STT'], focus: '코어', method: 'circuit' },
  { code: 'lower', label: '하체 집중',
    cats: ['STR', 'MOV', 'CCB', 'CFR', 'CFS', 'STT'], focus: '하체', method: 'block' },
  { code: 'circuit_full', label: '전신 순환운동',
    cats: ['STR', 'CAR', 'CCS', 'CCB', 'MOV', 'CFR', 'CFS', 'STT'], focus: '전신', method: 'interleave' },
  { code: 'upper_core', label: '상체 · 코어',
    cats: ['STR', 'CCS', 'CCB', 'MOV', 'CFR', 'CFS', 'STT'], focus: '상체', method: 'superset' },
  { code: 'recovery', label: '스트레칭 · 회복',
    cats: ['STT', 'CFR', 'CFS', 'MOV'], focus: '전신', method: 'block' },
];
export const CONCEPT_MAP = Object.fromEntries(CONCEPTS.map(c => [c.code, c]));

// 영상 길이를 아직 못 읽은 클립의 대체값(초).
// 라이브러리를 한 번 훑고 나면 실제 길이가 들어와 정확해진다.
const FALLBACK_CLIP_SEC = 40;

const clipSec = c => (c?.duration > 0 ? c.duration : FALLBACK_CLIP_SEC);

// 블록 하나가 실제로 잡아먹는 시간. 재생 큐를 만드는 규칙과 같아야 한다.
export function blockSeconds(clip, phase, mainSets, restBetweenSets, restAfter) {
  const sets = phase === 'main' ? mainSets : 1;
  const between = phase === 'main' ? restBetweenSets : 10;
  const after = phase === 'warmup' ? 10 : phase === 'cooldown' ? 15 : restAfter;
  return clipSec(clip) * sets + between * (sets - 1) + after;
}

function planSeconds(warmupClips, mainClips, coolClips, mainSets, restBetweenSets, restAfter) {
  const sum = (list, phase) => list.reduce(
    (n, c) => n + blockSeconds(c, phase, mainSets, restBetweenSets, restAfter), 0);
  return sum(warmupClips, 'warmup') + sum(mainClips, 'main') + sum(coolClips, 'cooldown');
}

export function pickMethod(customer, sessionCfg) {
  const explicit = sessionCfg?.method;
  if (explicit && explicit !== 'auto') return explicit;

  const level = customer?.experience || '';
  const intensity = sessionCfg?.intensity || '중강도';
  const hasInjury = (customer?.injuries?.length || 0) > 0;

  // 초급이거나 부상 이력이 있으면 안전하고 예측 가능한 블록형이 기본.
  if (level.includes('초급') || hasInjury) return 'block';
  // 강도를 높이고 싶은(고강도) 중급 이상 회원 — 트레이너가 언급한 "단조로움" 문제가
  // 가장 크게 나타나는 구간이라 복합교차형을 기본값으로 삼는다.
  if (intensity === '고강도' && (level.includes('중급') || level.includes('고급'))) return 'interleave';
  if (customer?.goal === '다이어트') return 'circuit';
  if (level.includes('중급') || level.includes('고급')) return 'superset';
  return 'block';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 연속 두 클립이 같은 신체부위면 뒤쪽에서 다른 부위 클립과 자리를 바꾼다(best-effort).
// AI 생성 프롬프트가 이미 요구하던 규칙("연속 2회 이상 같은 bodyParts 금지")을
// 규칙기반 조합에도 동일하게 적용한다.
function avoidConsecutiveSamePart(list) {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    const prevPart = out[i - 1]?.part;
    if (!prevPart || out[i]?.part !== prevPart) continue;
    for (let j = i + 1; j < out.length; j++) {
      if (out[j]?.part !== prevPart) {
        [out[i], out[j]] = [out[j], out[i]];
        break;
      }
    }
  }
  return out;
}

/**
 * @param {object} args
 * @param {object[]} args.enrichedClips - code/name/part/level/pattern 등이 채워진 클립 목록
 * @param {object} args.customer
 * @param {object} args.sessionCfg - { duration, intensity, focus, condition, includeCats, method }
 * @returns {{ method: string, warmupClips: object[], mainClips: object[], coolClips: object[], mainSets: number, restBetweenSets: number, restAfter: number, rationale: string }}
 */
export function composeProgram({ enrichedClips, customer, sessionCfg }) {
  const isDiet = customer?.goal === '다이어트';
  const method = pickMethod(customer, sessionCfg);

  let pool = enrichedClips.filter(c => {
    if (sessionCfg.includeCats?.length > 0 && !sessionCfg.includeCats.includes(c.code)) return false;
    if (customer?.injuries?.length > 0 && c.injuryRisk?.length > 0) {
      if (c.injuryRisk.some(r => customer.injuries.includes(r))) return false;
    }
    return true;
  });

  const focus = sessionCfg.focus;
  if (focus && focus !== '전신') {
    const matched = pool.filter(c => (c.part || '').includes(focus) || (c.bodyParts || []).includes(focus));
    const rest = pool.filter(c => !(c.part || '').includes(focus) && !(c.bodyParts || []).includes(focus));
    // 포커스 우선순위는 유지하되, 그룹 내부는 매 실행마다 셔플 — 다양성 확보의 핵심.
    pool = [...shuffle(matched), ...shuffle(rest)];
  } else {
    pool = shuffle(pool);
  }

  const seen = new Set();
  pool = pool.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });

  const byCode = code => pool.filter(c => c.code === code);
  const byCodes = codes => pool.filter(c => codes.includes(c.code));
  const takeAndRemove = (source, count) => {
    const taken = source.splice(0, count);
    return taken;
  };

  const dur = sessionCfg.duration || 30;
  const targetCount = dur <= 20 ? 7 : dur <= 30 ? 10 : dur <= 45 ? 13 : 17;

  const condition = sessionCfg.condition || '';
  const condMod = condition.includes('피로') ? 0.6 : condition.includes('보통') ? 0.85 : 1;

  const intensity = sessionCfg.intensity || '중강도';
  const intSettings = isDiet
    ? { '저강도': { sets: 2, rest: 20, restAfter: 30, rpe: 11 },
        '중강도': { sets: 3, rest: 15, restAfter: 20, rpe: 13 },
        '고강도': { sets: 4, rest: 10, restAfter: 15, rpe: 15 } }[intensity]
      || { sets: 3, rest: 15, restAfter: 20, rpe: 13 }
    : { '저강도': { sets: 2, rest: 30, restAfter: 90, rpe: 11 },
        '중강도': { sets: 3, rest: 20, restAfter: 60, rpe: 13 },
        '고강도': { sets: 4, rest: 20, restAfter: 45, rpe: 15 } }[intensity]
      || { sets: 3, rest: 20, restAfter: 60, rpe: 13 };
  let mainSets = Math.max(1, Math.round(intSettings.sets * condMod));

  // 살아있는(아직 소비 안 된) 카테고리별 큐 — method별 조합 함수가 여기서 뽑아 쓴다.
  const queues = {
    warm: [...byCodes(['CFR', 'CFS', 'MOV'])],
    str: [...byCodes(['STR', 'MOV'])],
    core: [...byCodes(['CCS', 'CCB'])],
    car: [...byCodes(['CAR'])],
    cool: [...byCodes(['STT', 'CFR', 'CFS'])],
  };

  const warmupCount = Math.max(2, Math.round(targetCount * 0.20));
  const mainCount = targetCount - warmupCount - Math.round(targetCount * 0.15);
  const coolCount = Math.max(2, targetCount - warmupCount - mainCount);

  let warmupClips = takeAndRemove(queues.warm, warmupCount);
  let mainClips = [];
  let coolClips = [];

  if (method === 'circuit') {
    // 서킷형: [근력, 코어, 유산소] 한 라운드를 목표 개수만큼 반복 — 다이어트처럼
    // 심박수를 계속 흔드는 구성이지만 코어까지 매 라운드에 끼워 넣어 근력만 반복되지 않게 한다.
    while (mainClips.length < mainCount && (queues.str.length || queues.core.length || queues.car.length)) {
      if (queues.str.length) mainClips.push(queues.str.shift());
      if (mainClips.length >= mainCount) break;
      if (queues.core.length) mainClips.push(queues.core.shift());
      if (mainClips.length >= mainCount) break;
      if (queues.car.length) mainClips.push(queues.car.shift());
      if (!queues.str.length && !queues.core.length && !queues.car.length) break;
    }
  } else if (method === 'interleave') {
    // 복합교차형(요청 핵심): 유산소·회복 계열을 준비/정리운동에만 가두지 않고 세션 전체에
    // 흩뿌린다 — "유산소 > 폼롤링 > 유산소 > 스트레칭" 식으로 전환 자체가 자극이 되게.
    // 패턴: 근력/코어 1개당 유산소·회복(CFR/STT 교대) 1개를 붙인다.
    let recoveryToggle = 0;
    while (mainClips.length < mainCount && (queues.str.length || queues.core.length || queues.car.length || queues.cool.length)) {
      const mainSrc = mainClips.length % 3 === 2 && queues.core.length ? queues.core : queues.str;
      if (mainSrc.length) mainClips.push(mainSrc.shift());
      else if (queues.core.length) mainClips.push(queues.core.shift());
      if (mainClips.length >= mainCount) break;

      if (queues.car.length) {
        mainClips.push(queues.car.shift());
      }
      if (mainClips.length >= mainCount) break;

      const recoverySrc = recoveryToggle % 2 === 0 ? queues.warm : queues.cool;
      recoveryToggle++;
      if (recoverySrc.length) mainClips.push(recoverySrc.shift());
      else if (queues.warm.length) mainClips.push(queues.warm.shift());
      else if (queues.cool.length) mainClips.push(queues.cool.shift());

      if (!queues.str.length && !queues.core.length && !queues.car.length && !queues.cool.length && !queues.warm.length) break;
    }
    mainClips = mainClips.slice(0, mainCount);
  } else if (method === 'superset') {
    // 슈퍼세트: 서로 다른 부위 근력 클립을 페어로 묶어 휴식 없이 연속 배치, 페어 사이에만 휴식.
    // 페어 몇 개마다 코어를 끼워 근력만 반복되는 단조로움을 줄인다.
    let pairCount = 0;
    while (mainClips.length < mainCount && (queues.str.length || queues.core.length)) {
      const first = queues.str.shift();
      if (!first) break;
      mainClips.push(first);
      if (mainClips.length >= mainCount) break;
      // 같은 부위가 아닌 클립을 짝으로 찾는다.
      let pairIdx = queues.str.findIndex(c => c.part !== first.part);
      if (pairIdx === -1) pairIdx = queues.str.length ? 0 : -1;
      if (pairIdx !== -1) {
        const [second] = queues.str.splice(pairIdx, 1);
        mainClips.push(second);
      }
      pairCount++;
      if (pairCount % 2 === 0 && queues.core.length && mainClips.length < mainCount) {
        mainClips.push(queues.core.shift());
      }
    }
    if (mainClips.length < mainCount && queues.car.length) {
      mainClips.push(...takeAndRemove(queues.car, mainCount - mainClips.length));
    }
  } else {
    // block (기본): 근력/움직임 → 코어 → 유산소 순차. 초급·부상 회원에게 예측 가능하고 안전.
    const carRatio = isDiet ? 0.40 : 0.17;
    const strRatio = isDiet ? 0.40 : 0.51;
    const carN = Math.round(mainCount * carRatio);
    const strN = Math.round(mainCount * strRatio);
    const coreN = Math.max(0, mainCount - carN - strN);
    mainClips = [
      ...takeAndRemove(queues.str, strN),
      ...takeAndRemove(queues.core, coreN),
      ...takeAndRemove(queues.car, carN),
    ];
  }

  coolClips = [
    ...takeAndRemove(queues.cool, Math.ceil(coolCount * 0.6)),
    ...takeAndRemove(queues.warm, Math.ceil(coolCount * 0.4)),
  ].slice(0, coolCount);

  // ---- 목표 시간에 맞춘다 ----
  // 개수만 맞추면 영상 길이가 제각각이라 실제 소요 시간이 크게 어긋난다.
  // 남은 클립을 더 넣거나 덜어내서 목표 구간 안으로 들여놓는다.
  const targetSec = dur * 60;
  const maxSec = targetSec + 5 * 60;   // 45분 목표면 45~50분
  const restBetweenSets = intSettings.rest;
  let restAfter = intSettings.restAfter;
  const now = () => planSeconds(warmupClips, mainClips, coolClips, mainSets, restBetweenSets, restAfter);

  // 모자라면 남은 풀에서 본운동을 더 채운다
  const fillOrder = [queues.str, queues.core, queues.car, queues.warm, queues.cool];
  let guard = 0;
  while (now() < targetSec && guard++ < 200) {
    const src = fillOrder.find(q => q.length > 0);
    if (!src) break;
    const next = src.shift();
    if (now() + blockSeconds(next, 'main', mainSets, restBetweenSets, restAfter) > maxSec) {
      // 이걸 넣으면 넘친다. 다른 짧은 클립이 있으면 계속, 없으면 멈춘다.
      const shorter = fillOrder.find(q =>
        q.some(c => now() + blockSeconds(c, 'main', mainSets, restBetweenSets, restAfter) <= maxSec));
      if (!shorter) break;
      const idx = shorter.findIndex(c =>
        now() + blockSeconds(c, 'main', mainSets, restBetweenSets, restAfter) <= maxSec);
      mainClips.push(...shorter.splice(idx, 1));
      continue;
    }
    mainClips.push(next);
  }

  // 넘치면 본운동 뒤쪽부터 덜어낸다. 준비/정리운동은 건드리지 않는다.
  while (now() > maxSec && mainClips.length > 1) mainClips.pop();

  // 클립이 부족해 목표에 한참 못 미치면 세트를 늘려 채운다
  while (now() < targetSec && mainSets < 6) {
    const bumped = planSeconds(warmupClips, mainClips, coolClips, mainSets + 1, restBetweenSets, restAfter);
    if (bumped > maxSec) break;
    mainSets += 1;
  }

  // 영상이 길면 하나를 더 넣는 순간 넘쳐서, 목표에 조금 못 미친 채 끝나곤 한다.
  // 남은 만큼 동작 사이 휴식을 늘려 목표 시간을 채운다. 최소 시간은 지켜야 한다.
  if (now() < targetSec && mainClips.length > 0) {
    const gap = targetSec - now();
    const add = Math.ceil(gap / mainClips.length);
    restAfter = Math.min(restAfter + add, 180);
  }

  mainClips = avoidConsecutiveSamePart(mainClips);

  const estimatedSeconds = now();
  const rationale = buildRationale({
    method, customer, sessionCfg, targetCount: mainClips.length, mainSets,
    intensity: intSettings, estimatedSeconds,
  });

  return {
    method,
    warmupClips,
    mainClips,
    coolClips,
    mainSets,
    restBetweenSets,
    restAfter,
    estimatedSeconds,
    rationale,
  };
}

function buildRationale({ method, customer, sessionCfg, targetCount, mainSets, intensity, estimatedSeconds }) {
  const name = customer?.name || '회원';
  const level = customer?.experience || '정보 없음';
  const goal = customer?.goal || '정보 없음';
  const methodLabel = TRAINING_METHODS.find(m => m.code === method)?.label || method;

  const why = {
    block: `${name}님은 경력·강도 조건상 근력→코어→유산소 순서로 예측 가능하게 진행하는 게 안전합니다. 동작 전환에 인지 부담을 주지 않고 폼에 집중시킬 수 있습니다.`,
    circuit: `근력·코어·유산소를 라운드 단위로 반복해 심박수를 계속 흔들면서도(체지방 감량 목표에 부합) 근력 부위가 매 라운드 바뀌어 국소 피로 누적을 줄입니다.`,
    interleave: `${name}님은 강도를 높이고 싶어하는 경력자라 근력/코어 사이사이에 유산소·폼롤링·스트레칭을 끼워 넣었습니다. 전환 동작 자체(서서↔바닥, 유산소↔회복)가 운동이 되면서 단조로움 없이 심박수·가동성·근력을 동시에 자극합니다.`,
    superset: `${name}님 레벨에서는 서로 다른 부위 근력 클립을 페어로 묶어 휴식 없이 연속 수행시켜 세션 밀도를 높였습니다. 페어 사이에만 휴식을 둬 전체 시간 대비 실제 운동시간 비율(운동 밀도)을 극대화합니다.`,
  }[method] || '';

  const mins = Math.round((estimatedSeconds || 0) / 60);
  return `[${methodLabel}] ${why} 본운동 ${targetCount}개 동작(세트 ${mainSets}회, RPE ${intensity.rpe}), `
    + `예상 소요 약 ${mins}분, 목표: ${goal}, 경력: ${level}. `
    + `카테고리 풀을 매 실행마다 셔플하므로 같은 조건으로 다시 생성해도 클립 조합은 달라집니다.`;
}
