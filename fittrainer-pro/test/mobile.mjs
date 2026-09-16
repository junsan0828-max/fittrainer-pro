// 폰 페이지를 실제 브라우저로 띄워 본다. PC 앱과 달리 여긴 테스트가 없었다.
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';

const html = fs.readFileSync('/home/user/-/fittrainer-pro/mobile/index.html', 'utf8');
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/socket.io')) {   // 서버가 없으니 붙지 않는 게 정상
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const fails = [];
page.on('pageerror', e => fails.push(`pageerror: ${e.message}`));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR|Failed to load resource|socket\.io/i.test(t)) return;
  fails.push(`console: ${t}`);
});

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const check = async (what, fn) => {
  try { await fn(); console.log('  OK  ' + what); }
  catch (e) { fails.push(`${what}: ${e.message.split('\n')[0]}`); console.log('FAIL  ' + what); }
};

await check('로그인 화면이 보인다', async () => {
  if (!(await page.locator('#login').isVisible())) throw new Error('로그인 화면이 없음');
});

await check('로그인 전에는 다른 화면이 안 보인다', async () => {
  for (const id of ['#app', '#tabs', '#sc-settings', '#sc-builder', '#sc-remote']) {
    if (await page.locator(id).isVisible())
      throw new Error(`${id} 가 로그인 전에 보임`);
  }
});

await check('모든 화면이 앱 안에 들어 있다', async () => {
  // 닫는 태그가 어긋나면 화면 하나가 앱 바깥으로 빠진다.
  // 각 화면에 hidden 이 걸려 있어 눈에 띄지 않으니 구조로 확인한다.
  const stray = await page.evaluate(() =>
    [...document.querySelectorAll('.screen')]
      .filter(el => !document.getElementById('app')?.contains(el))
      .map(el => el.id));
  if (stray.length) throw new Error(`앱 바깥으로 빠진 화면: ${stray.join(', ')}`);
});

await check('PIN 칸에 입력할 수 있다', async () => {
  await page.locator('#pin').fill('123456');
  if (await page.locator('#pin').inputValue() !== '123456') throw new Error('입력이 안 됨');
});

await check('틀린 PIN 은 오류를 알려준다', async () => {
  await page.locator('#login-btn').click();
  await page.waitForTimeout(600);
  const err = (await page.locator('#login-err').textContent()) || '';
  if (!err.trim()) throw new Error('오류 문구가 비어 있음');
});

await browser.close();
server.close();

if (fails.length) {
  console.error('\n실패 ' + fails.length + '건:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n폰 화면 테스트 통과');
