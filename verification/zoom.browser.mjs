// Real Chromium as a phone (touch, no page zoom as in the apps): photos pinch-zoom and drag
// in a swipeable photo viewer (ListingPage's), a swipe still changes photo at normal size,
// and pull to refresh follows a finger at the top of a page. Raw touches through DevTools.
// Run: node verification/zoom.browser.mjs /tmp/sellio-verification   (needs playwright there)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ZoomableImage from '@/components/ui-custom/ZoomableImage';
import PullToRefresh from '@/components/ui-custom/PullToRefresh';
const photo = (fill) => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="' + fill + '"/><circle cx="400" cy="400" r="200" fill="white"/></svg>');
window.__refreshes = 0;
function Viewer() {
  const [zoomed, setZoomed] = useState(false);
  return React.createElement('div', { id: 'viewer', style: { position: 'fixed', inset: 0, background: 'black', display: 'flex', flexDirection: 'column' }, 'data-pull-refresh-block': '' },
    React.createElement('div', { id: 'scroller', className: zoomed ? 'z' : '', style: { flex: 1, display: 'flex', overflowX: zoomed ? 'hidden' : 'auto', scrollSnapType: 'x mandatory' } },
      ['#7c3aed', '#ea580c'].map((fill, i) => React.createElement('div', { key: i, style: { width: '100%', height: '100%', flexShrink: 0, scrollSnapAlign: 'center' } },
        React.createElement(ZoomableImage, { src: photo(fill), style: { width: '100%', height: '100%' }, imgStyle: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }, onZoomChange: setZoomed })))));
}
function Page() {
  const [viewer, setViewer] = useState(false);
  window.__openViewer = () => setViewer(true);
  return React.createElement(PullToRefresh, { onRefresh: async () => { window.__refreshes += 1; } },
    React.createElement('div', { id: 'feed', style: { height: '2400px', background: 'linear-gradient(#fff, #ddd)' } }, 'Feed'),
    viewer && React.createElement(Viewer));
}
createRoot(document.getElementById('root')).render(React.createElement(Page));
`;
const out = await build({ stdin: { contents: entry, resolveDir: app, loader: 'jsx' }, bundle: true, write: false, format: 'iife', alias: { '@': path.join(app, 'src') }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
const script = out.outputFiles[0].text;

const browser = await chromium.launch();
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html data-sellio-no-zoom><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><style>html[data-sellio-no-zoom]{touch-action:pan-x pan-y} body{margin:0}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await page.waitForSelector('#feed');
  const cdp = await context.newCDPSession(page);
  const touches = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const drag = async (from, to, steps = 12) => {
    await touches('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      await touches('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
      await page.waitForTimeout(16);
    }
    await touches('touchEnd', []);
    await page.waitForTimeout(300);
  };

  await check('Pull to refresh: a finger dragged down from the top of a page refreshes it', async () => {
    await drag([200, 150], [200, 420]);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__refreshes), 1);
  });

  await check('Pull to refresh: scrolled down, a drag just scrolls the page (no refresh)', async () => {
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    await drag([200, 300], [200, 500]);
    assert.equal(await page.evaluate(() => window.__refreshes), 1);
    assert.ok(await page.evaluate(() => window.scrollY) < 600, 'the page scrolled up instead');
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await page.evaluate(() => window.__openViewer());
  await page.waitForSelector('#viewer img');
  const scrollLeft = () => page.evaluate(() => document.getElementById('scroller').scrollLeft);
  // The first photo's zoom layer (the photo's parent).
  const transform = () => page.evaluate(() => document.querySelector('#viewer img').parentElement.style.transform || '');

  await check('Photo viewer at normal size: a one-finger swipe goes to the next photo', async () => {
    await drag([330, 430], [60, 430], 10);
    await page.waitForTimeout(500);
    assert.ok(await scrollLeft() > 300, `moved on to photo 2 (scrollLeft ${await scrollLeft()})`);
    await page.evaluate(() => { document.getElementById('scroller').scrollLeft = 0; });
    await page.waitForTimeout(200);
  });

  await check('Two fingers pinch the photo bigger; the viewer does not scroll to another photo', async () => {
    const before = await scrollLeft();
    await touches('touchStart', [[180, 430], [230, 430]]);
    for (let i = 1; i <= 10; i++) {
      await touches('touchMove', [[180 - i * 8, 430], [230 + i * 8, 430]]);
      await page.waitForTimeout(16);
    }
    await touches('touchEnd', []);
    await page.waitForTimeout(300);
    const t = await transform();
    const scale = Number((t.match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
    assert.ok(scale > 2, `zoomed in (${t})`);
    assert.equal(await scrollLeft(), before);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('scroller')).overflowX), 'hidden');
  });

  await check('Zoomed: one finger drags the photo around instead of changing photo', async () => {
    const before = await transform();
    await drag([300, 430], [120, 380], 10);
    const after = await transform();
    assert.notEqual(after, before);
    assert.equal(await scrollLeft(), 0);
  });

  await check('Two fingers pinch back to normal size; swiping between photos works again', async () => {
    await touches('touchStart', [[100, 430], [310, 430]]);
    for (let i = 1; i <= 10; i++) {
      await touches('touchMove', [[100 + i * 9, 430], [310 - i * 9, 430]]);
      await page.waitForTimeout(16);
    }
    await touches('touchEnd', []);
    await page.waitForTimeout(400);
    assert.equal(await transform(), '');
    await drag([330, 430], [60, 430], 10);
    await page.waitForTimeout(500);
    assert.ok(await scrollLeft() > 300);
  });
} finally {
  await browser.close();
}
console.log(`${passed} photo zoom and pull to refresh checks passed in Chromium (phone touch).`);
