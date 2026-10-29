// Real Chromium (Android phone settings) with the phone's real Back: Sellio's
// useBackToClose in a small app (back-harness/app.jsx).
//
// Back here is the browser's own Back (a test extension, verification/phone-back), the
// same call Android's Back makes in the app: it SKIPS every history entry the browser
// marked as added without a tap, and with nothing left it does nothing — exactly how
// Back went dead in the app. Reads go through DevTools without counting as a tap, and
// finger scrolls are raw touches (a scroll is not a tap), so nothing here fakes a tap.
//
// Needs Playwright with its full Chromium (extensions). Run from the app root:
//   node verification/back-navigation.browser.mjs
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
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
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error',
  alias: { '@': path.join(dir, '../src') } });
// Every page also runs index.html's first script as it is: in the app, a page that replaces
// another starts on the first history entry, by way of an older page there (goFresh), and
// that script is what moves the older page on.
const freshScript = (await readFile(path.join(dir, '../index.html'), 'utf8')).match(/<script id="sellio-fresh-start">[\s\S]*?<\/script>/)?.[0];
assert.ok(freshScript, "index.html's fresh-start script");
const html = `<!doctype html><html><head>${freshScript}<meta name="viewport" content="width=device-width"><style>body{min-height:3000px}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const js = await readFile(bundle);
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  if (req.url.startsWith('/frame')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><p>an embedded page</p>'); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
}).listen(0);
const origin = `http://127.0.0.1:${server.address().port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let context;
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

// inApp: as in Sellio's Android app — the app's bridge is there, the page can be shown again
// (window.__show(): hidden, then visible again, as when the app comes back on screen), and the
// page is the first entry of its history (the app's web view starts on it).
async function newPhone({ inApp = false } = {}) {
  if (context) await context.close();
  const ext = path.join(dir, 'phone-back');
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'sellio-phone-')), {
    channel: 'chromium', headless: true, ...pixel,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  // Google's map (AddressMap): a stand-in page, so nothing goes to the network.
  await context.route('https://maps.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>map</title><p>map</p>' }));
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  let page = context.pages()[0] || await context.newPage();
  if (inApp) {
    await context.addInitScript(() => {
      window.ReactNativeWebView = { postMessage() {} };
      let shown = 'visible';
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => shown });
      window.__show = () => {
        shown = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
        shown = 'visible'; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
      };
    });
    const opener = page;
    [page] = await Promise.all([context.waitForEvent('page'), opener.evaluate((url) => window.open(url, '_blank', 'noopener'), origin + '/')]);
    await opener.close();
    await page.bringToFront();
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  // Reads the page without counting as a tap (Playwright's own evaluate counts as one).
  const read = async (expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, userGesture: false, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const state = () => read('({ path: location.pathname, onStep: !!history.state?.sellioOverlay })');
  const visible = (id) => read(`!!document.getElementById(${JSON.stringify(id)})`);
  // The phone's Back. 'went back', or 'NOTHING…' when the browser finds nowhere to go.
  const back = async (wait = 250) => { const r = await worker.evaluate(() => self.phoneBack()); await sleep(wait); return r; };
  const tap = async (id) => { await page.tap('#' + id); await sleep(150); };
  // A finger scroll, as a phone sends it (the browser cancels the pointer: no tap).
  const scroll = async (dy = 300) => {
    const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
    await touch('touchStart', 600);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', 600 - (dy * i) / 14); await sleep(12); }
    await touch('touchEnd');
    await sleep(250);
  };
  if (!inApp) await page.goto(origin + '/');
  await sleep(inApp ? 800 : 300);
  return { page, cdp, read, state, visible, back, tap, scroll, errors };
}

try {
  let p = await newPhone();
  const { tap, back, state, visible, read } = p;
  const pushCount = () => read('window.__pushes.length');
  await tap('toHome');
  assert.equal((await state()).path, '/home');

  await tap('openA');
  assert.ok(await visible('A'));
  assert.ok((await state()).onStep);
  assert.equal(await back(), 'went back');
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
  assert.equal(await back(), 'went back');
  assert.equal((await state()).path, '/', 'then Back leaves the page');
  passed('Two windows: Back, Back closes them in turn, then leaves the page; nothing added after a Back');

  await tap('toHome');
  await tap('next'); await tap('next'); await tap('next');
  const pushesAtStep3 = await pushCount();
  for (const expected of ['2', '1', '0']) {
    await back();
    assert.equal(await read('document.getElementById("steps").textContent'), expected);
  }
  assert.equal((await state()).path, '/home');
  assert.ok(!(await state()).onStep);
  assert.equal(await pushCount(), pushesAtStep3);
  passed('Step-by-step screen: Back steps back one at a time with nothing added');

  await tap('openA');
  await read('window.__home.setBusy(true)');
  await back();
  assert.ok(await visible('A'), 'busy: stays open');
  assert.ok((await state()).onStep, 'and Back is ready again');
  await read('window.__home.setBusy(false)');
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
  await read('window.__home.setAuto(true)');
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
  await read('window.__home.setAuto(true)');
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
  assert.equal(await back(), 'went back');
  assert.equal((await state()).path, '/', 'history did not grow: Back leaves the page');
  passed('Opening and closing windows repeatedly reuses one step; history does not grow');

  let pushes = await read('window.__pushes');
  // Quick Back presses (a fresh phone, so earlier entries don't matter).
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('openA');
  await p.tap('openB');
  await p.back(60);
  await p.back(400);
  assert.ok(!(await p.visible('B')) && !(await p.visible('A')), 'both closed');
  assert.equal((await p.state()).path, '/home', 'still on the page');
  await p.tap('next'); await p.tap('next'); await p.tap('next');
  for (let i = 0; i < 3; i++) await p.back(60);
  await sleep(400);
  assert.equal(await p.read('document.getElementById("steps").textContent'), '0');
  assert.equal((await p.state()).path, '/home');
  assert.equal(await p.back(), 'went back');
  assert.equal((await p.state()).path, '/');
  passed('Quick Back presses (60ms apart) close windows / step back one at a time without leaving the page');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // A finger scroll is not a tap. Just after a Back a window opens by itself and the
  // person scrolls: no Back step may be added for it (the browser would skip the whole
  // history), and Back keeps working.
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('toOther');
  await p.back();
  await p.read('window.__home.setAuto(true)');
  await sleep(300);
  before = await p.read('window.__pushes.length');
  await p.scroll(300);
  await p.scroll(-200);
  assert.equal(await p.read('window.__pushes.length'), before, 'scrolling added nothing');
  assert.ok(!(await p.state()).onStep);
  assert.equal(await p.back(), 'went back', 'Back still has somewhere to go');
  assert.equal((await p.state()).path, '/', 'and goes to the page before, nothing skipped');
  passed('A finger scroll is never taken for a tap: after Back + a window opening by itself + scrolling, Back still goes back');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // The whole app is guarded: a page that navigates by itself just after a Back (no tap)
  // takes the current entry's place instead of adding one, so Back still works.
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('toOther');
  await p.back();
  assert.equal((await p.state()).path, '/home');
  await p.read('window.__home.go("/other")');
  await sleep(300);
  assert.equal((await p.state()).path, '/other');
  assert.equal(await p.back(), 'went back', 'Back still has somewhere to go');
  assert.equal((await p.state()).path, '/', 'to the page before the replaced one');
  // With a tap, a page still adds its entry normally.
  await p.tap('toHome');
  await p.tap('toOther');
  assert.equal(await p.back(), 'went back');
  assert.equal((await p.state()).path, '/home');
  passed('A page that navigates by itself after a Back (no tap) replaces its entry, so Back never goes dead; with a tap it adds one');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // A tap's moment can be over or used up (going full screen or opening a picker uses it;
  // after 5 seconds it ends): the browser still honours an entry added after it, as long
  // as no Back came since. A window that opens then gets its Back step at once.
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('page');
  await sleep(5600);
  assert.equal(await p.read('navigator.userActivation.isActive'), false, "the tap's moment is over");
  await p.read('window.__home.setAuto(true)');
  await sleep(300);
  assert.ok(await p.visible('AUTO'));
  assert.ok((await p.state()).onStep, 'its Back step is added at once');
  assert.equal(await p.back(), 'went back');
  assert.ok(!(await p.visible('AUTO')), 'Back closed it');
  assert.equal((await p.state()).path, '/home', 'and stayed on the page: the browser honoured the step');
  assert.equal(await p.back(), 'went back');
  assert.equal((await p.state()).path, '/', 'then Back goes to the page before, nothing skipped');
  // A click the page makes itself is not a tap: after a Back, it must not let a step in.
  await p.tap('toHome');
  await p.tap('toOther');
  await p.back();
  await p.read('document.getElementById("page").click()');
  await p.read('window.__home.setAuto(true)');
  await sleep(300);
  assert.ok(await p.visible('AUTO'));
  assert.ok(!(await p.state()).onStep, 'no Back step on a click the page made itself');
  await p.tap('page');
  assert.ok((await p.state()).onStep, 'added at the real tap');
  await p.back();
  assert.ok(!(await p.visible('AUTO')));
  assert.equal((await p.state()).path, '/home');
  passed('After a tap whose moment is over (5 s, full screen, a picker) a window still gets its Back step and Back works; a click the page makes itself is not a tap');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // A window that closes as the page goes to another page (a store's checkout sending a
  // visitor to sign in): that page stays, nothing pulls the person back; Back from it
  // returns to the page, and then on.
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('openA');
  await p.tap('leaveFromA');
  await sleep(2500);
  assert.equal((await p.state()).path, '/signin', 'went to the other page and stayed there');
  assert.equal(await p.back(1500), 'went back');
  assert.deepEqual([(await p.state()).path, (await p.state()).onStep], ['/home', false], 'Back returns to the page, window closed');
  assert.equal(await p.back(800), 'went back');
  assert.equal((await p.state()).path, '/', 'and then to the page before it');
  passed('A window that closes as the page goes to another page (sign in from a checkout): that page stays; Back returns, then goes on');

  // In Sellio's Android app: each time the app comes back on screen, Base44's app puts its
  // bottom-tab Back handler in front of the page's, and the page's handler only gets back in
  // front when "can go back" changes. So the page steps to its first entry and straight back.
  // Nothing else on the page sees it (react-router stays put, windows stay open, nothing
  // scrolls), a tap meanwhile is held off, and Back works as before afterwards.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('openA');
  await p.scroll(300);
  // Let the finger scroll's glide finish first.
  for (let last = -1, i = 0; i < 40; i++) { const y = await p.read('scrollY'); if (y === last) break; last = y; await sleep(150); }
  const shownBefore = await p.read('({ y: scrollY, length: history.length, at: navigation.currentEntry.index })');
  assert.equal(shownBefore.at, 2);
  const moves = [];
  p.cdp.on('Page.navigatedWithinDocument', (e) => moves.push(new URL(e.url).pathname));
  await p.cdp.send('Page.enable');
  await p.read('window.__show()');
  const pagesSeen = new Set();
  for (let i = 0; i < 90; i++) { pagesSeen.add(await p.read('document.getElementById("page").textContent')); await sleep(20); }
  await sleep(400);
  const out = moves.indexOf('/');
  assert.ok(out >= 0 && moves[out + 1] === '/home' && moves.lastIndexOf('/') === out, `stepped to the first entry and straight back (${moves.join(' ')})`);
  assert.deepEqual([...pagesSeen], ['home'], 'react-router never showed the first page');
  assert.ok(await p.visible('A'), 'the window stays open');
  assert.deepEqual(await p.read('({ y: scrollY, length: history.length, at: navigation.currentEntry.index })'), shownBefore, 'same entry, nothing scrolled, nothing added');
  assert.ok((await p.state()).onStep, 'Back is ready');
  assert.equal(await p.back(), 'went back');
  assert.ok(!(await p.visible('A')));
  assert.deepEqual([(await p.state()).path, (await p.state()).onStep], ['/home', false]);
  // A tap while on the first entry (a fraction of a second) is held off: nothing navigates.
  const pushesBeforeTap = await p.read('window.__pushes.length');
  await p.read('window.__show()');
  let onFirst = false;
  for (let i = 0; i < 150 && !onFirst; i++) { onFirst = await p.read('navigation.currentEntry.index === 0'); if (!onFirst) await sleep(10); }
  assert.ok(onFirst, 'stepped to the first entry');
  await p.page.tap('#toOther');
  await sleep(1000);
  assert.equal((await p.state()).path, '/home', 'the tap was held off');
  assert.equal(await p.read('window.__pushes.length'), pushesBeforeTap);
  assert.equal(await p.back(), 'went back');
  assert.equal((await p.state()).path, '/', 'and Back still goes back');
  passed('Android app: coming back on screen steps to the first entry and straight back, unseen by the page (windows, scroll, history unchanged; a tap meanwhile held off); Back works after');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // An update reload in the app (AppRefreshProvider) first steps to the first entry, unseen by
  // the page, so the new copy starts there with nothing of the old copy behind it: Back from
  // it doesn't load an old page, and the new copy can re-arm the app's Back.
  await p.tap('toHome');
  await p.tap('openA');
  await p.tap('closeA');
  await sleep(200);
  await p.tap('toOther');
  assert.equal(await p.read('navigation.currentEntry.index'), 2);
  const beforeReload = await p.read('({ length: history.length, starts: Number(sessionStorage.getItem("starts")) })');
  await p.read('void window.__stepToFirstEntry().then(() => location.replace("/other?reloaded=1")), 1');
  await sleep(1500);
  const afterReload = await p.read(`({ path: location.pathname + location.search, at: navigation.currentEntry.index,
    length: history.length, firstIsThisPage: navigation.entries()[0].sameDocument, starts: Number(sessionStorage.getItem("starts")) })`);
  assert.deepEqual(afterReload, { path: '/other?reloaded=1', at: 0, length: beforeReload.length, firstIsThisPage: true, starts: beforeReload.starts },
    'the new copy is on the first entry, react-router never showed it before the reload');
  assert.match(await p.back(), /^NOTHING/, 'nothing of the old copy behind it');
  passed('Android app: an update reload starts the new copy on the first entry, with nothing of the old copy behind it');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // ---- In the app, a page that replaces another (sign-in done, sign-out, a reload) starts on the
  // first entry of the history (goFresh in useBackToClose.js + index.html's first script). ----
  const where = (q) => q.read(`({ path: location.pathname + location.search, at: navigation.currentEntry.index,
    length: history.length, firstIsThisPage: navigation.entries()[0].sameDocument,
    starts: Number(sessionStorage.getItem('starts') || 0), note: sessionStorage.getItem('sellio-fresh-start'),
    arrived: sessionStorage.getItem('sellio-fresh-arrived') })`);
  const settled = async (q, test, ms = 6000) => {
    const until = Date.now() + ms;
    for (;;) {
      try { const now = await where(q); if (test(now)) return now; } catch { /* between pages */ }
      if (Date.now() > until) return where(q);
      await sleep(100);
    }
  };

  // Signing in over older pages (the sign-in page is another page than the first entry's): the
  // page after it starts on the first entry by way of the older page there, which never starts
  // Sellio (react-router never shows it); nothing is behind the new page; Back works from it and
  // the app's Back re-arms on it.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('openA');
  await p.tap('leaveFromA');
  let now = await settled(p, (x) => x.path === '/signin');
  assert.deepEqual([now.path, now.at, now.firstIsThisPage, now.starts], ['/signin', 3, false, 1], 'the sign-in page sits on older pages');
  const length = now.length;
  await p.read('location.replace("/other?signedIn=1"), 1'); // no tap: a sign-in finishing by itself
  now = await settled(p, (x) => x.path === '/other?signedIn=1');
  assert.deepEqual(now, { path: '/other?signedIn=1', at: 0, length, firstIsThisPage: true, starts: 1, note: null, arrived: null },
    'on the first entry, nothing added, the older page never started Sellio, the note used up');
  assert.match(await p.back(), /^NOTHING/, 'nothing behind the new page');
  await p.tap('otherToHome');
  assert.equal(await p.back(), 'went back', 'Back works from a page opened after it');
  assert.equal((await p.state()).path, '/other');
  await p.tap('otherToHome');
  const movesAfter = [];
  p.cdp.on('Page.navigatedWithinDocument', (e) => movesAfter.push(new URL(e.url).pathname));
  await p.cdp.send('Page.enable');
  await p.read('window.__show()');
  await sleep(2200);
  const outAt = movesAfter.indexOf('/other');
  assert.ok(outAt >= 0 && movesAfter[outAt + 1] === '/home' && movesAfter.lastIndexOf('/other') === outAt,
    `the app's Back re-arms on it: to the first entry and straight back (${movesAfter.join(' ')})`);
  assert.equal(await p.back(), 'went back');
  assert.equal((await p.state()).path, '/other');
  assert.deepEqual(p.errors, []);
  passed('Android app: a page that replaces another over older pages (sign-in) starts on the first entry by way of the older page, which never starts; nothing behind it, Back and the re-arm work');
  pushes = pushes.concat(await p.read('window.__pushes'));

  // Signing out from a page whose first entry is itself: stepped there unseen, the new page loads there.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('toOther');
  before = await where(p);
  assert.deepEqual([before.at, before.firstIsThisPage], [2, true]);
  await p.read('location.replace("/signin?out=1"), 1');
  now = await settled(p, (x) => x.path === '/signin?out=1');
  assert.deepEqual(now, { path: '/signin?out=1', at: 0, length: before.length, firstIsThisPage: true, starts: before.starts, note: null, arrived: null },
    'on the first entry, react-router never showed the first page, nothing added');
  assert.match(await p.back(), /^NOTHING/, 'nothing behind it');
  assert.deepEqual(p.errors, []);
  passed('Android app: a page that replaces this one (sign-out) loads on the first entry when that is this page, unseen');

  // A reload (Try again) from deeper in: the same page again, on the first entry.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('toOther');
  before = await where(p);
  await p.read('location.reload(), 1');
  now = await settled(p, (x) => x.at === 0 && x.path === '/other');
  assert.deepEqual([now.path, now.at, now.length, now.firstIsThisPage, now.starts], ['/other', 0, before.length, true, before.starts]);
  assert.match(await p.back(), /^NOTHING/);
  assert.deepEqual(p.errors, []);
  passed('Android app: a reload from deeper in loads the same page again on the first entry');

  // A reload, or a page asked for, while the app's Back re-arm stands on the first entry for a
  // moment: the reload is of the page itself (not of the first entry), once the re-arm is back;
  // a page asked for then loads right there.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('toOther');
  before = await where(p);
  await p.read('window.__show()');
  onFirst = false;
  for (let i = 0; i < 200 && !onFirst; i++) { onFirst = await p.read('navigation.currentEntry.index === 0'); if (!onFirst) await sleep(10); }
  assert.ok(onFirst, 're-arm on the first entry');
  await p.read('location.reload(), 1');
  now = await settled(p, (x) => x.at === 0 && x.path === '/other' && x.starts === before.starts);
  assert.deepEqual([now.path, now.at, now.length, now.starts], ['/other', 0, before.length, before.starts], 'reloaded the page itself, on the first entry');
  await p.tap('otherToHome');
  await p.read('window.__show()');
  onFirst = false;
  for (let i = 0; i < 200 && !onFirst; i++) { onFirst = await p.read('navigation.currentEntry.index === 0'); if (!onFirst) await sleep(10); }
  assert.ok(onFirst, 're-arm on the first entry again');
  await p.read('location.replace("/signin?during=1"), 1');
  now = await settled(p, (x) => x.path === '/signin?during=1');
  assert.deepEqual([now.at, now.firstIsThisPage], [0, true], 'the page asked for loads on the first entry');
  assert.deepEqual(p.errors, []);
  passed('Android app: a reload or a new page while the re-arm stands on the first entry: the reload is of the page itself, after; the new page loads there');

  // When the older first page can't be gone to (the step refused), the page loads here, as before.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.tap('openA');
  await p.tap('leaveFromA');
  now = await settled(p, (x) => x.path === '/signin');
  await p.read('navigation.traverseTo = () => { throw new Error("refused"); }, 1');
  await p.read('location.replace("/other?here=1"), 1');
  now = await settled(p, (x) => x.path === '/other?here=1');
  assert.deepEqual([now.at, now.note], [3, null], 'loaded where it was, no note left');
  assert.deepEqual(p.errors, []);
  passed('Android app: when the older first page cannot be gone to, the page loads where it was (as before)');

  // On the first entry already: left as it is. A note that isn't for this entry, or is old, is
  // dropped without going anywhere.
  p = await newPhone({ inApp: true });
  await p.read('location.replace("/home?first=1"), 1');
  now = await settled(p, (x) => x.path === '/home?first=1');
  assert.deepEqual([now.at, now.length], [0, 1]);
  for (const note of ['{ to: "/other?wrong=1", key: "not-this-entry", at: Date.now() }',
    '{ to: "/other?old=1", key: navigation.currentEntry.key, at: Date.now() - 20000 }',
    '{ to: "//elsewhere.example/", key: navigation.currentEntry.key, at: Date.now() }']) {
    await p.read(`sessionStorage.setItem('sellio-fresh-start', JSON.stringify(${note})), location.reload(), 1`);
    await sleep(1200);
    now = await settled(p, (x) => x.note === null);
    assert.deepEqual([now.path, now.at, now.note], ['/home?first=1', 0, null], `note ${note} dropped`);
  }
  assert.deepEqual(p.errors, []);
  passed('Android app: on the first entry a replace is left as it is; a note for another entry, an old one, or another site is dropped');

  // A page the app itself loads on top (as the app does with Google sign-in's return), which then
  // finishes signing in: the page after it starts on the first entry too.
  p = await newPhone({ inApp: true });
  await p.tap('toHome');
  await p.page.goto(origin + '/signin?sellio_mobile_oauth=1');
  now = await settled(p, (x) => x.path.startsWith('/signin'));
  assert.deepEqual([now.at, now.firstIsThisPage], [2, false]);
  await p.read('location.replace("/home?google=1"), 1');
  now = await settled(p, (x) => x.path === '/home?google=1');
  assert.deepEqual([now.at, now.firstIsThisPage, now.note], [0, true, null]);
  assert.match(await p.back(), /^NOTHING/);
  assert.deepEqual(p.errors, []);
  passed('Android app: a page the app loads on top (Google sign-in coming back) and its sign-in finishing: the next page starts on the first entry');

  // With another site's page before Sellio's in the history: a replace from deeper in still
  // starts on Sellio's first entry (the other site's page stays behind it, as it was).
  p = await newPhone({ inApp: true });
  const otherSite = origin.replace('127.0.0.1', 'localhost');
  await p.page.goto(otherSite + '/frame');
  await p.page.goto(origin + '/');
  await sleep(500);
  await p.tap('toHome');
  before = await where(p);
  assert.ok(await p.read('navigation.entries().length < history.length'), "the other site's page is in the history");
  assert.equal(before.at, 1);
  await p.read('location.replace("/other?mixed=1"), 1');
  now = await settled(p, (x) => x.path === '/other?mixed=1');
  assert.deepEqual([now.at, now.length, now.firstIsThisPage, now.note], [0, before.length, true, null], "on Sellio's first entry");
  assert.ok(await p.read('navigation.entries().length < history.length'), "the other site's page still behind it");
  assert.deepEqual(p.errors, []);
  passed("Android app: with another site's page before Sellio's, a replace from deeper in starts on Sellio's first entry");

  // Settings' address map (AddressMap) follows the address as it's typed. Each new map must not
  // add a history entry (a map's own entries made Back step through old maps on the same screen,
  // and stopped the app's Back re-arm); and if any embedded page ever adds some, the re-arm still
  // runs (it needs only the first entry to be this page).
  p = await newPhone({ inApp: true });
  await p.tap('toMap');
  before = await where(p);
  for (const text of ['178 Yishun', ' Ring Road', ' 760178']) {
    await p.page.type('#address', text, { delay: 20 });
    await sleep(1300);
  }
  assert.equal(await p.read('document.querySelector("iframe")?.src || ""'), 'https://maps.google.com/maps?q=178%20Yishun%20Ring%20Road%20760178%2C%20Singapore&z=16&output=embed', 'the map follows the address');
  now = await where(p);
  assert.deepEqual([now.length, now.at], [before.length, before.at], `no history added by the maps (${before.length} → ${now.length})`);
  await p.read(`(() => { const f = document.createElement('iframe'); f.id = 'stray'; f.src = '/frame?1'; document.body.appendChild(f); })(), 1`);
  await sleep(600);
  await p.read('document.getElementById("stray").src = "/frame?2", 1');
  await sleep(600);
  assert.ok(await p.read('navigation.entries().length < history.length'), 'an embedded page added an entry');
  const mapMoves = [];
  p.cdp.on('Page.navigatedWithinDocument', (e) => mapMoves.push(new URL(e.url).pathname));
  await p.cdp.send('Page.enable');
  await p.read('window.__show()');
  await sleep(2200);
  const mapOut = mapMoves.indexOf('/');
  assert.ok(mapOut >= 0 && mapMoves[mapOut + 1] === '/map', `re-armed despite the embedded page's entry (${mapMoves.join(' ')})`);
  assert.deepEqual(p.errors, []);
  passed("Android app: the address map adds no history as it follows the address; an embedded page's entry doesn't stop the re-arm");

  // Websites (no app): a replace is left as it is.
  p = await newPhone();
  await p.tap('toHome');
  await p.tap('toOther');
  await p.read('location.replace("/signin?web=1"), 1');
  now = await settled(p, (x) => x.path === '/signin?web=1');
  assert.deepEqual([now.at, now.note], [2, null]);
  assert.deepEqual(p.errors, []);
  passed('Websites: a replace stays where it was (only the Android app starts pages on the first entry)');

  assert.deepEqual(pushes.filter((x) => !x.honoured), [], 'every history entry was added after a tap the browser honours');
  passed(`All ${pushes.length} history entries (${pushes.filter((x) => x.ours).length} Back steps) were added after a real tap since the last Back`);

  assert.deepEqual(p.errors, []);
  console.log(`\nAll ${passes} real-Chrome Back checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  await context?.close();
  server.close();
}
