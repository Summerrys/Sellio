// Pinch to zoom on photos (src/components/ui-custom/ZoomableImage.jsx): the zoom arithmetic,
// then real touch sequences on the component. No phone.
// Run: node verification/zoom.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const act = React.act || (await import('react-dom/test-utils')).act;
const { createRoot } = await import('react-dom/client');

const tmp = await mkdtemp(path.join(app, '.zoom-verification-'));
const outfile = path.join(tmp, 'ZoomableImage.mjs');
await build({ entryPoints: [path.join(app, 'src/components/ui-custom/ZoomableImage.jsx')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
const { default: ZoomableImage, clampView, pinchView, zoomAround } = await import(pathToFileURL(outfile).href);

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.01, `${label}: ${a} ≠ ${b}`);

// A phone-sized box (400 × 800) with a square photo in the middle (400 × 400, 200 from the top).
const BOX = { width: 400, height: 800 };
const PIC = { left: 0, top: 200, width: 400, height: 400 };

try {
  await check('Arithmetic: normal size sits still; zoomed, the photo covers the box edges it can and centres the rest', async () => {
    assert.deepEqual(clampView({ s: 1, x: 50, y: -30 }, BOX, PIC), { s: 1, x: 0, y: 0 });
    const v = clampView({ s: 2, x: 100, y: 0 }, BOX, PIC);
    near(v.x, 0, 'left edge stays at the box edge');
    near(v.y, -400, 'photo 800 tall in an 800 box: centred');
    near(clampView({ s: 2, x: -900, y: 0 }, BOX, PIC).x, -400, 'right edge stays at the box edge');
    assert.equal(clampView({ s: 9, x: 0, y: 0 }, BOX, PIC).s, 4, 'at most 4×');
    assert.equal(clampView({ s: 0.3, x: 0, y: 0 }, BOX, PIC).s, 1, 'never smaller than normal');
  });

  await check('Arithmetic: a pinch keeps the point between the fingers under them; a double tap zooms on its point', async () => {
    const v = pinchView({ s: 1, x: 0, y: 0 }, { x: 100, y: 300 }, { x: 100, y: 300 }, 100, 200);
    assert.equal(v.s, 2);
    near(v.x + 2 * 100, 100, 'x stays under the fingers');
    near(v.y + 2 * 300, 300, 'y stays under the fingers');
    const z = zoomAround({ s: 1, x: 0, y: 0 }, { x: 300, y: 500 }, 2.5);
    near(z.x + 2.5 * 300, 300, 'tapped point stays put');
    near(z.y + 2.5 * 500, 500, 'tapped point stays put');
  });

  // ── The component ───────────────────────────────────────────────────────────────────────
  const taps = [];
  const zooms = [];
  // The viewer around the photo, as in the shop's lightbox: its own swipe and tap handlers.
  const parent = { touchstart: 0, touchmove: 0, touchend: 0, click: 0 };
  const count = (type) => () => { parent[type] += 1; };
  const viewer = (props) => React.createElement('div', {
    onTouchStart: count('touchstart'), onTouchMove: count('touchmove'), onTouchEnd: count('touchend'), onClick: count('click'),
  }, React.createElement(ZoomableImage, props));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(viewer({ src: 'https://example.invalid/a.jpg', onTap: () => taps.push(Date.now()), onZoomChange: (z) => zooms.push(z) }));
  });
  const box = container.firstElementChild.firstElementChild;
  const layer = box.firstElementChild;
  const img = layer.firstElementChild;
  box.getBoundingClientRect = () => ({ left: 0, top: 0, right: BOX.width, bottom: BOX.height, width: BOX.width, height: BOX.height });
  Object.defineProperty(box, 'clientWidth', { value: BOX.width });
  Object.defineProperty(box, 'clientHeight', { value: BOX.height });
  for (const [key, value] of Object.entries({ offsetLeft: PIC.left, offsetTop: PIC.top, offsetWidth: PIC.width, offsetHeight: PIC.height })) {
    Object.defineProperty(img, key, { value });
  }
  const touch = async (type, points) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    const list = points.map(([clientX, clientY]) => ({ clientX, clientY }));
    Object.defineProperty(event, 'touches', { value: list });
    Object.defineProperty(event, 'changedTouches', { value: list });
    await act(async () => { box.dispatchEvent(event); });
    return event;
  };
  const click = async (x, y) => act(async () => { box.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); });
  const scale = () => Number((layer.style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
  const resetCounts = () => { for (const key of Object.keys(parent)) parent[key] = 0; };

  await check('One finger at normal size is left alone: no page-scroll blocking, and the viewer still gets its swipe', async () => {
    resetCounts();
    await touch('touchstart', [[300, 400]]);
    const move = await touch('touchmove', [[120, 400]]);
    await touch('touchend', []);
    assert.equal(move.defaultPrevented, false);
    assert.deepEqual(parent, { touchstart: 1, touchmove: 1, touchend: 1, click: 0 });
    assert.equal(layer.style.transform, '');
    assert.equal(box.style.touchAction, 'pan-x pan-y');
  });

  await check('Two fingers pinch it bigger; the page and the viewer never see the pinch', async () => {
    resetCounts();
    await touch('touchstart', [[150, 400]]);
    await touch('touchstart', [[150, 400], [250, 400]]);
    const move = await touch('touchmove', [[100, 400], [300, 400]]);
    assert.equal(move.defaultPrevented, true, 'the page does not scroll or zoom');
    assert.equal(scale(), 2);
    await touch('touchend', [[300, 400]]);
    await touch('touchend', []);
    assert.equal(parent.touchmove, 0);
    assert.equal(parent.touchend, 0, 'no swipe for the viewer');
    assert.equal(box.dataset.zoomed, '');
    assert.equal(box.style.touchAction, 'none');
    assert.deepEqual(zooms, [true]);
  });

  await check('Zoomed: one finger drags the photo around (not to the next photo)', async () => {
    resetCounts();
    const before = layer.style.transform;
    await touch('touchstart', [[200, 400]]);
    const move = await touch('touchmove', [[260, 380]]);
    await touch('touchend', []);
    assert.equal(move.defaultPrevented, true);
    assert.notEqual(layer.style.transform, before);
    assert.deepEqual(parent, { touchstart: 0, touchmove: 0, touchend: 0, click: 0 });
  });

  await check('Zoomed: a single tap does not close; a double tap goes back to normal size', async () => {
    await click(200, 400);
    await wait(350);
    assert.equal(taps.length, 0, 'no close while zoomed');
    await click(200, 400);
    await click(205, 402);
    assert.equal(layer.style.transform, '');
    assert.deepEqual(zooms, [true, false]);
    assert.equal(parent.click, 0, 'taps are the photo\'s own');
  });

  await check('Normal size: a double tap zooms in 2.5× on that point; a single tap closes once a double tap is no longer possible', async () => {
    await wait(350);
    await click(100, 300);
    await click(102, 301);
    assert.equal(scale(), 2.5);
    await click(100, 300);
    await click(100, 300);
    assert.equal(layer.style.transform, '');
    await wait(350);
    taps.length = 0;
    const tappedAt = Date.now();
    await click(200, 400);
    assert.equal(taps.length, 0, 'not straight away');
    await wait(350);
    assert.equal(taps.length, 1);
    assert.ok(taps[0] - tappedAt >= 290);
  });

  await check('Right after a pinch, the next tap still works (nothing swallowed)', async () => {
    taps.length = 0;
    await touch('touchstart', [[150, 400], [250, 400]]);
    await touch('touchmove', [[140, 400], [260, 400]]);
    await touch('touchmove', [[150, 400], [250, 400]]); // pinched back to normal
    await touch('touchend', []);
    assert.equal(layer.style.transform, '');
    await wait(400);
    await touch('touchstart', [[200, 400]]);
    await touch('touchend', []);
    await click(200, 400);
    await wait(350);
    assert.equal(taps.length, 1);
  });

  await check('ctrl + scroll zooms (a laptop pinch); plain scrolling is left to the page', async () => {
    const plain = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 200, clientY: 400 });
    await act(async () => { box.dispatchEvent(plain); });
    assert.equal(plain.defaultPrevented, false);
    assert.equal(layer.style.transform, '');
    const pinch = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true, clientX: 200, clientY: 400 });
    await act(async () => { box.dispatchEvent(pinch); });
    assert.equal(pinch.defaultPrevented, true);
    assert.ok(scale() > 2.5);
  });

  await check('A new photo starts at normal size', async () => {
    await act(async () => {
      root.render(viewer({ src: 'https://example.invalid/b.jpg', onTap: () => {}, onZoomChange: (z) => zooms.push(z) }));
    });
    assert.equal(layer.style.transform, '');
    assert.equal(zooms.at(-1), false);
  });

  await act(async () => root.unmount());
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`${passed} photo zoom checks passed (no phone).`);
