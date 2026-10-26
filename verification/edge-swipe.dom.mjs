// iPhone / iPad from the Home Screen: swiping right from the left edge does what the
// phone's Back does elsewhere. Run: node verification/edge-swipe.dom.mjs
// (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { installEdgeSwipeBack, isHomeScreenApple } from '../src/lib/edgeSwipeBack.js';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body><main id="page"><input id="field"><div id="row" style="overflow-x:auto"></div></main></body></html>',
  { url: 'https://sellio.apptelier.sg/Orders', pretendToBeVisual: true });
const win = dom.window;
const $ = id => win.document.getElementById(id);

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };

let now = 1000;
const realNow = Date.now;
Date.now = () => now;
const backs = [];
win.history.back = () => backs.push(now);

// One finger: start, moves, end. Each step is `ms` later.
function swipe(points, { target = $('page'), ms = 16 } = {}) {
  const fire = (type, point, list) => {
    const event = new win.Event(type, { bubbles: true, cancelable: true });
    const touch = { clientX: point[0], clientY: point[1] };
    Object.defineProperty(event, 'touches', { value: list ? [touch] : [] });
    Object.defineProperty(event, 'changedTouches', { value: [touch] });
    target.dispatchEvent(event);
    return event;
  };
  const [first, ...rest] = points;
  fire('touchstart', first, true);
  const moves = [];
  for (const point of rest) { now += ms; moves.push(fire('touchmove', point, true)); }
  now += ms;
  fire('touchend', rest[rest.length - 1] || first, false);
  return moves;
}
const arrow = () => win.document.querySelector('[data-edge-swipe-arrow]');

try {
  const fakeWin = (ua, standalone, touchPoints = 5, displayStandalone = false) => ({
    navigator: { userAgent: ua, standalone, maxTouchPoints: touchPoints },
    matchMedia: () => ({ matches: displayStandalone }),
  });
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  assert.equal(isHomeScreenApple(fakeWin(IPHONE, true)), true);
  assert.equal(isHomeScreenApple(fakeWin(IPAD, true)), true);
  assert.equal(isHomeScreenApple(fakeWin(IPHONE, false)), false, 'Safari has its own swipe back');
  assert.equal(isHomeScreenApple(fakeWin(IPAD, false, 0)), false, 'a Mac');
  assert.equal(isHomeScreenApple(fakeWin(ANDROID, false, 5, true)), false, 'Android has its own Back');
  assert.equal(installEdgeSwipeBack({ win }), null, 'not installed in a normal browser');
  passed('Only on an iPhone / iPad running Sellio from the Home Screen (not Safari, Android or desktop)');

  const remove = installEdgeSwipeBack({ win, force: true });
  win.history.pushState({ idx: 1, key: 'j' }, '', '/Products');
  win.history.pushState({ idx: 2, key: 'k' }, '', '/Orders');

  const moves = swipe([[8, 300], [30, 302], [60, 305], [90, 306], [110, 306]]);
  assert.equal(backs.length, 1);
  assert.ok(moves.slice(1).every(e => e.defaultPrevented), 'the page does not scroll under the swipe');
  assert.ok(arrow() && arrow().style.opacity === '0', 'the arrow shows during the swipe and hides after');
  passed('Swiping right from the left edge goes back');

  swipe([[8, 300], [30, 300], [60, 301], [80, 301], [20, 301]]);
  assert.equal(backs.length, 1);
  passed('Dragging back towards the edge before letting go cancels');

  swipe([[60, 300], [90, 300], [130, 300], [170, 300]]);
  assert.equal(backs.length, 1);
  passed('A swipe that starts away from the edge is left to the page');

  swipe([[8, 300], [12, 330], [15, 380], [18, 450]]);
  assert.equal(backs.length, 1);
  passed('Scrolling up or down near the edge is not taken as Back');

  swipe([[8, 300], [20, 300], [35, 300]], { ms: 120 });
  assert.equal(backs.length, 1);
  swipe([[8, 300], [30, 300], [55, 300]], { ms: 10 });
  assert.equal(backs.length, 2);
  passed('A short slow drag does nothing; a short quick flick goes back');

  swipe([[8, 300], [40, 300], [80, 300], [120, 300]], { target: $('field') });
  $('row').scrollLeft = 0;
  Object.defineProperty($('row'), 'scrollWidth', { value: 900, configurable: true });
  Object.defineProperty($('row'), 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty($('row'), 'scrollLeft', { value: 200, configurable: true, writable: true });
  swipe([[8, 300], [40, 300], [80, 300], [120, 300]], { target: $('row') });
  assert.equal(backs.length, 2);
  passed('Not on a text field, or a row of items scrolled sideways (that swipe scrolls it back)');

  // The very first page (nothing behind it in the browser's history, even after an app
  // update or reload reset the app's own page count): nothing to go back to.
  const first = new JSDOM('<html><body><main id="p"></main></body></html>', { url: 'https://sellio.apptelier.sg/explore' });
  const firstBacks = [];
  first.window.history.back = () => firstBacks.push(1);
  const removeFirst = installEdgeSwipeBack({ win: first.window, force: true });
  swipe([[8, 300], [40, 300], [80, 300], [120, 300]], { target: first.window.document.getElementById('p') });
  assert.equal(firstBacks.length, 0);
  first.window.history.replaceState({ idx: 0, key: 'first', sellioOverlay: true }, '');
  swipe([[8, 300], [40, 300], [80, 300], [120, 300]], { target: first.window.document.getElementById('p') });
  assert.equal(firstBacks.length, 1);
  removeFirst();
  win.history.replaceState({ idx: 0, key: 'reset-by-update' }, '');
  swipe([[8, 300], [40, 300], [80, 300], [120, 300]]);
  assert.equal(backs.length, 3, 'pages behind it count even when the app\'s page count was reset');
  passed('On the very first page it does nothing; with a window or step open, or pages behind (even after an update), it goes back');

  remove();
  swipe([[8, 300], [40, 300], [80, 300], [120, 300]]);
  assert.equal(backs.length, 3);
  assert.equal(arrow(), null);
  passed('Removing it removes the gesture and its arrow');

  const main = await readFile('src/main.jsx', 'utf8');
  assert.match(main, /import \{ installEdgeSwipeBack \} from '@\/lib\/edgeSwipeBack'/);
  assert.match(main, /\ninstallEdgeSwipeBack\(\)\n/);
  passed('The app installs it at start-up');

  console.log(`\nAll ${passes} edge-swipe checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  Date.now = realNow;
}
