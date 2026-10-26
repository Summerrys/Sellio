// Real Chromium (Android phone settings): the phone's Back with Sellio's useBackToClose.
// Android skips ALL of a page's history once the page adds an entry without a fresh tap
// (Back then looks dead in the app), so this also checks every entry came after a tap.
// Needs Playwright with its Chromium. Run from the app root: node verification/back-navigation.browser.mjs
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const bundle = path.join(os.tmpdir(), 'sellio-back-harness.js');
await build({ entryPoints: [path.join(dir, 'back-harness/app.jsx')], bundle: true, outfile: bundle,
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error' });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const js = await readFile(bundle);
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => ({ path: location.pathname, onStep: !!history.state?.sellioOverlay, length: history.length }));
const visible = (id) => page.evaluate((i) => !!document.getElementById(i), id);
const pushCount = () => page.evaluate(() => window.__pushes.length);
const back = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await sleep(250); };
const tap = async (id) => { await page.tap('#' + id); await sleep(150); };
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await tap('toHome');
  assert.equal((await state()).path, '/home');

  await tap('openA');
  assert.ok(await visible('A'));
  assert.ok((await state()).onStep);
  await back();
  assert.ok(!(await visible('A')));
  assert.deepEqual([(await state()).path, (await state()).onStep], ['/home', false]);
  passed('Back closes an open window and stays on the page');

  await tap('openA');
  await tap('openB');
  const pushesBefore = await pushCount();
  await back();
  assert.ok(!(await visible('B')) && (await visible('A')), 'B closed, A still open');
  assert.ok((await state()).onStep, 'Back is ready for A without a tap');
  await back();
  assert.ok(!(await visible('A')));
  assert.equal((await state()).path, '/home');
  assert.equal(await pushCount(), pushesBefore, 'no history added after a Back');
  await back();
  assert.equal((await state()).path, '/', 'then Back leaves the page');
  passed('Two windows: Back, Back closes them in turn, then leaves the page; nothing added after a Back');

  await tap('toHome');
  await tap('next'); await tap('next'); await tap('next');
  const pushesAtStep3 = await pushCount();
  for (const expected of ['2', '1', '0']) {
    await back();
    assert.equal(await page.textContent('#steps'), expected);
  }
  assert.equal((await state()).path, '/home');
  assert.ok(!(await state()).onStep);
  assert.equal(await pushCount(), pushesAtStep3);
  passed('Step-by-step screen: Back steps back one at a time with nothing added');

  await tap('openA');
  await page.evaluate(() => window.__home.setBusy(true));
  await back();
  assert.ok(await visible('A'), 'busy: stays open');
  assert.ok((await state()).onStep, 'and Back is ready again');
  await page.evaluate(() => window.__home.setBusy(false));
  await sleep(100);
  await back();
  assert.ok(!(await visible('A')));
  passed('A busy window stays open on Back; Back closes it once done');

  await tap('openA');
  await tap('closeA');
  await sleep(200);
  assert.deepEqual([(await state()).path, (await state()).onStep], ['/home', false]);
  passed('Closing a window with its own button takes its Back step away');

  await tap('openA');
  await tap('linkInA');
  assert.equal((await state()).path, '/other');
  await back();
  await sleep(200);
  assert.deepEqual([(await state()).path, (await state()).onStep], ['/home', false], 'one Back returns, nothing left to press through');
  passed('A page opened from a window without handing over: one Back returns (the leftover step is skipped)');

  await tap('openA');
  await tap('handOverInA');
  assert.equal((await state()).path, '/other');
  await back();
  assert.deepEqual([(await state()).path, (await state()).onStep], ['/home', false]);
  passed('A link that hands over its Back step: one Back returns');

  await tap('openA');
  await back();
  let before = await pushCount();
  await page.evaluate(() => window.__home.setAuto(true));
  await sleep(300);
  assert.ok(await visible('AUTO'));
  assert.ok((await state()).onStep, 'moved forward onto the step Back left');
  assert.equal(await pushCount(), before, 'nothing added');
  await back();
  assert.ok(!(await visible('AUTO')));
  passed('A window that opens by itself right after a Back reuses the step Back left (nothing added)');

  await tap('toOther');
  await back();
  assert.equal((await state()).path, '/home');
  before = await pushCount();
  await page.evaluate(() => window.__home.setAuto(true));
  await sleep(300);
  assert.ok(await visible('AUTO'));
  assert.equal(await pushCount(), before, 'nothing added without a tap');
  assert.ok(!(await state()).onStep);
  await tap('page');
  assert.ok((await state()).onStep, 'its Back step is added at the next tap');
  await back();
  assert.ok(!(await visible('AUTO')));
  assert.equal((await state()).path, '/home');
  passed('With no step to reuse, a window that opens by itself gets its Back step at the next tap');

  await tap('openA');
  await tap('closeA');
  await sleep(150);
  before = await pushCount();
  await tap('openA');
  assert.ok((await state()).onStep);
  assert.equal(await pushCount(), before, 'reopening moves back onto the same step');
  await back();
  assert.ok(!(await visible('A')));
  await back();
  assert.equal((await state()).path, '/', 'history did not grow: Back leaves the page');
  passed('Opening and closing windows repeatedly reuses one step; history does not grow');

  const earlierPushes = await page.evaluate(() => window.__pushes);
  await page.goto(`http://127.0.0.1:${port}/`);
  await tap('toHome');
  await tap('openA');
  await tap('openB');
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await sleep(60);
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await sleep(400);
  assert.ok(!(await visible('B')) && !(await visible('A')), 'both closed');
  assert.equal((await state()).path, '/home', 'still on the page');
  await tap('next'); await tap('next'); await tap('next');
  for (let i = 0; i < 3; i++) { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await sleep(60); }
  await sleep(400);
  assert.equal(await page.textContent('#steps'), '0');
  assert.equal((await state()).path, '/home');
  passed('Quick Back presses (60ms apart) close windows / step back one at a time without leaving the page');

  const pushes = [...earlierPushes, ...(await page.evaluate(() => window.__pushes))];
  assert.deepEqual(pushes.filter((p) => !(p.active && p.tapSinceTraversal)), [], 'every history entry was added straight after a tap');
  passed(`All ${pushes.length} history entries (${pushes.filter((p) => p.ours).length} Back steps) were added straight after a tap`);

  assert.deepEqual(errors, []);
  console.log(`\nAll ${passes} real-Chrome Back checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
