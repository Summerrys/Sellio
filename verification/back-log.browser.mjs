// The "Back log" button (src/lib/backLog.js) in real Chromium, as on Alvin's Android phone:
// a tap copies the log; a drag moves the button anywhere on the screen (Alvin, 11 Nov 2026:
// "Make the 'Back log' pill draggable so I can move anywhere I want") and it stays where it's
// left: after the app is opened again and when the phone turns, always whole on the screen.
// A drag isn't a tap: it doesn't copy, and the log doesn't note it as one.
//
// Fingers are the phone's own touches (DevTools touch input), so Chromium makes the pointer
// events, taps and clicks itself. Run from the app root:
//   node verification/back-log.browser.mjs
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

const bundle = path.join(os.tmpdir(), 'sellio-back-log.js');
await build({ stdin: { contents: "import '@/lib/backLog';", resolveDir: dir, loader: 'js' }, bundle: true, outfile: bundle,
  format: 'iife', logLevel: 'error', alias: { '@': path.join(dir, '../src') } });
const js = await readFile(bundle);
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>'
  + '<body style="margin:0;min-height:2000px"><h1>A page</h1><script src="/back-log.js"></script></body></html>';
const server = createServer((req, res) => {
  if (req.url === '/back-log.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
}).listen(0);
const origin = `http://127.0.0.1:${server.address().port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
const context = await browser.newContext({ ...pixel });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
// Sellio's Android app, on a phone where Alvin's account has been signed in.
await context.addInitScript(() => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  localStorage.setItem('sellio-back-log-phone', '1');
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const tabBox = () => page.evaluate(() => {
  const box = document.getElementById('sellio-back-log-tab')?.getBoundingClientRect();
  return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
});
const view = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
const note = () => page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => /Back log/.test(t)) || null);
const logLines = () => page.evaluate(() => JSON.parse(localStorage.getItem('sellio-back-log') || '[]'));
const tapsOnTab = async () => (await logLines()).filter((line) => line.includes('tap button "Copy the Back log"')).length;
const waitForTab = async () => {
  for (let i = 0; i < 50 && !(await tabBox()); i++) await sleep(100);
  assert.ok(await tabBox(), 'the Back log button shows');
};
const notes = () => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /Back log/.test(d.textContent)).length);
const clearNote = () => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /Back log/.test(d.textContent)).forEach((d) => d.remove()));

// A finger: down at `from`, moved through `steps` points to `to`, up.
async function finger(from, to, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
}
const tap = async (at) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
};
const near = (a, b, within = 2) => Math.abs(a - b) <= within;

try {
  await page.goto(origin);
  await waitForTab();
  const size = await view();
  const start = await tabBox();
  assert.ok(near(start.left, 40), `starts 40px in from the left (${start.left})`);
  assert.ok(near(size.height - start.bottom, 68), `and 68px up from the bottom (${size.height - start.bottom})`);
  passed('the button starts low on the left, above the bottom bar');

  // A tap copies the log, once.
  await tap(start);
  assert.equal(await note(), 'Back log copied. Paste it to Claude.');
  assert.equal(await notes(), 1, 'copied once');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^Sellio Back log, copied /);
  assert.equal(await tapsOnTab(), 1, 'the tap is in the log');
  await clearNote();
  passed('a tap on it copies the log');

  // A finger drags it to the middle of the screen: it follows, and doesn't copy.
  const middle = { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
  await finger(start, middle);
  let box = await tabBox();
  assert.ok(near(box.x, middle.x) && near(box.y, middle.y), `moved under the finger (${box.x}, ${box.y})`);
  assert.equal(await note(), null, 'a drag doesn’t copy');
  assert.equal(await tapsOnTab(), 1, 'nor is it noted as a tap');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sellio-back-log-place')));
  assert.ok(near(saved.x * size.width, middle.x) && near(saved.y * size.height, middle.y), 'its place is kept');
  passed('a finger drags it anywhere, without copying');

  // Once there, a tap still copies (right after the drag, when Chrome makes no click of it);
  // a finger that wobbles a little is still a tap.
  await tap(box);
  assert.equal(await note(), 'Back log copied. Paste it to Claude.');
  assert.equal(await notes(), 1, 'copied once');
  await clearNote();
  await finger(box, { x: box.x + 4, y: box.y + 3 }, 2);
  assert.equal(await note(), 'Back log copied. Paste it to Claude.', 'a wobble under 8px is a tap');
  box = await tabBox();
  assert.ok(near(box.x, middle.x) && near(box.y, middle.y), 'and doesn’t move it');
  await clearNote();
  passed('where it was left, a tap (even a wobbly one) copies');

  // Dragged past the edges: kept whole on the screen.
  await finger(box, { x: size.width + 80, y: -60 });
  box = await tabBox();
  assert.ok(near(box.right, size.width) && near(box.top, 0), `stops at the top right corner (${box.right}, ${box.top})`);
  await finger(box, { x: -90, y: size.height + 90 });
  box = await tabBox();
  assert.ok(near(box.left, 0) && near(box.bottom, size.height), `stops at the bottom left corner (${box.left}, ${box.bottom})`);
  passed('dragged off the screen, it stops at the edge, whole');

  // Left somewhere, the app opened again: it's there.
  const spot = { x: Math.round(size.width * 0.7), y: Math.round(size.height * 0.3) };
  await finger(box, spot);
  await page.reload();
  await waitForTab();
  box = await tabBox();
  assert.ok(near(box.x, spot.x) && near(box.y, spot.y), `back where it was left (${box.x}, ${box.y})`);
  passed('the app opened again: it’s where it was left');

  // The phone turned: the same part of the screen, still whole.
  await page.setViewportSize({ width: size.height, height: size.width });
  await sleep(300);
  box = await tabBox();
  assert.ok(near(box.x, Math.round(size.height * 0.7), 3) && near(box.y, Math.round(size.width * 0.3), 3), `turned with the screen (${box.x}, ${box.y})`);
  await finger(box, { x: size.height - 5, y: size.width - 5 });
  await page.setViewportSize({ width: size.width, height: size.height });
  await sleep(300);
  box = await tabBox();
  assert.ok(box.left >= 0 && box.top >= 0 && box.right <= size.width + 0.5 && box.bottom <= size.height + 0.5, 'whole on the screen after turning back');
  passed('the phone turned: same part of the screen, whole');

  // A mouse (or a stylus) drag doesn't copy either: its click is not a tap.
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y - 60, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  assert.equal(await note(), null, 'the click after a mouse drag doesn’t copy');
  box = await tabBox();
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  assert.equal(await note(), 'Back log copied. Paste it to Claude.', 'a mouse click still copies');
  assert.equal(await notes(), 1, 'once');
  passed('a mouse drag moves it without copying; a click copies');

  // The keyboard: Enter on the button copies.
  await clearNote();
  await page.focus('#sellio-back-log-tab');
  await page.keyboard.press('Enter');
  await sleep(300);
  assert.equal(await note(), 'Back log copied. Paste it to Claude.');
  passed('Enter on it copies too');

  console.log(`${passes} Back log button checks passed`);
} finally {
  await browser.close();
  server.close();
}
