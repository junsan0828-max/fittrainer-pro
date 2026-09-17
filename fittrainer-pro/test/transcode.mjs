// 변환 뒷정리가 앱을 죽이지 않는지 본다.
//
// 윈도우에서 변환된 파일 이름을 바꾸다 EBUSY 가 나면, 그 오류가 Promise 를
// 벗어나 "A JavaScript error occurred in the main process" 창으로 올라왔다.
// 수업 중에 앱이 닫히는 일이라 그냥 둘 수 없다.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'transcode.js'), 'utf8');

const fails = [];
const check = (what, ok, detail) => {
  console.log(`${ok ? '  OK' : 'FAIL'}  ${what}`);
  if (!ok) fails.push(`${what}${detail ? ' — ' + detail : ''}`);
};

// 콜백 안의 renameSync 는 Promise 가 잡아주지 못한다
check('이름 바꾸기를 콜백에서 그냥 부르지 않는다',
  !/proc\.on\('close'[\s\S]{0,400}?^\s*fs\.renameSync/m.test(src));

check('막혔을 때 다시 시도한다', /moveWithRetry/.test(src) && /EBUSY/.test(src));

check('임시 파일 지우기가 실패해도 넘어간다',
  /try \{ fs\.rmSync\(tmp, \{ force: true \} \); \} catch \{\}/.test(src)
  || /const dropTmp = \(\) => \{ try \{[\s\S]*?catch \{\} \};/.test(src));

// 재시도 로직이 실제로 EBUSY 를 넘기는지 같은 규칙으로 돌려 본다
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-'));
  const from = path.join(dir, 'a.part.mp4'), to = path.join(dir, 'a.mp4');
  fs.writeFileSync(from, 'x');

  let calls = 0;
  const realRename = fs.renameSync;
  fs.renameSync = (f, t) => {
    calls++;
    if (calls < 3) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; }
    return realRename(f, t);
  };

  const moveWithRetry = async (f, t, tries = 6) => {
    for (let i = 0; i < tries; i++) {
      try { fs.renameSync(f, t); return; }
      catch (e) {
        const transient = e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES';
        if (!transient || i === tries - 1) throw e;
        await new Promise(r => setTimeout(r, 5));
      }
    }
  };

  let moved = false;
  try { await moveWithRetry(from, to); moved = fs.existsSync(to); } catch {}
  fs.renameSync = realRename;
  fs.rmSync(dir, { recursive: true, force: true });

  check('EBUSY 가 두 번 나도 결국 옮긴다', moved && calls === 3, `시도 ${calls}회`);
}

// 앱이 통째로 죽지 않도록 하는 그물
{
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  check('처리되지 않은 오류가 앱을 죽이지 않는다',
    /process\.on\('uncaughtException'/.test(main)
    && /process\.on\('unhandledRejection'/.test(main));
}

if (fails.length) {
  console.error('\n실패 ' + fails.length + '건:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n변환 뒷정리 테스트 통과');
