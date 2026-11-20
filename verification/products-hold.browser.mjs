// Products in real Chrome as a phone (390x844, touch through DevTools): what jsdom can't show.
//   1. Hold an item: it lifts and the page is nudged 2px off its top; drag it up two places with a
//      finger: the others make room straight down (measured without the lift's scale), the page
//      doesn't scroll, and the drop saves the order (Moved … / Undo).
//   2. Select mode: the bar sits flush under the header (the page's spacing doesn't push it down),
//      the tip isn't under it, Delete covers the tab bar and its raised button; the dots drag at
//      once; the delete window's cover reaches the top of the screen.
//   3. The scan's tick and confetti play, and the tick ends drawn.
// Needs the app's CSS: run `npm run build` first. Then:
//   node verification/products-hold.browser.mjs /tmp/sellio-browser   (playwright or playwright-core there)
// Uses /usr/bin/google-chrome when there (CHROME_PATH to choose another), else Playwright's Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-browser', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const css = existsSync(path.join(app, 'dist/assets')) && (await readdir(path.join(app, 'dist/assets'))).find((f) => /^index-.*\.css$/.test(f));
assert.ok(css, 'needs dist/assets/index-*.css: run npm run build first');
const tmp = await mkdtemp(path.join(app, '.products-hold-browser-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

// ── The page, with stand-ins for the shop and the database ──────────────────────────────────
const stubs = {
  supabase: 'export const getSupabase = async () => window.db; export const SUPABASE_URL = "https://x.invalid";',
  tenant: 'export const useTenant = () => ({ tenantId: "shop-1", tenant: { id: "shop-1", name: "Cafelicious", seller_type: "merchant", currency: "SGD" }, subscription: null, hasPermission: () => true, canUseFeature: () => true });',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  nothing: 'export default function Nothing() { return null; }',
  loading: 'export default function LoadingShapes() { return null; } export const StoreShapes = () => null;',
  skeleton: 'export const SkeletonList = () => null;',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getProductsSteps = () => [];',
  appFiles: 'export const inAppFiles = () => false; export const saveFileInApp = () => {};',
  subscription: 'export const useSubscription = () => ({ maxProducts: null });',
};
const mock = { name: 'products-hold-browser', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/lib\/supabaseClient$/, 'supabase');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/products\/(ProductFormDialog(\.jsx)?|ProductImportDialog)$|subscription\/PricingModal$|tour\/(TourGuide|DummyProductCard)$|onboarding\/ImageEditModal$/, 'nothing');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/ui-custom\/AppLoader$/, 'skeleton');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/hooks\/useSubscription$/, 'subscription');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
await writeFile(path.join(tmp, 'entry.jsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Products from '@/pages/Products';
import Celebrate from '@/components/ui-custom/Celebrate';
window.renderProducts = () => createRoot(document.getElementById('app')).render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><Products /></MemoryRouter><Toaster /></QueryClientProvider>);
window.renderCelebrate = () => createRoot(document.getElementById('app')).render(<Celebrate />);
`);
await build({
  entryPoints: [path.join(tmp, 'entry.jsx')], outfile: path.join(tmp, 'bundle.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': path.join(app, 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
});
const now = '2026-11-20T05:28:44Z';
const items = [
  ['Grilled Chicken Caesar Salad', 12.99, 'menu'], ['Classic Club Sandwich', 10.99, 'menu'], ['Margherita Pizza', 14.99, 'menu'], ['Spaghetti Carbonara', 13.99, 'menu'],
  ['Soft Drinks', 2.99, 'bev'], ['Iced Tea', 2.99, 'bev'], ['Freshly Squeezed Lemonade', 3.99, 'bev'], ['Fruit Smoothies', 4.99, 'bev'], ['Coffee', 2.49, 'bev'],
];
const fixture = {
  products: items.map(([name, price, category_id], i) => ({ id: `p${i}`, name, price, category_id, is_active: true, sort_order: i + 1, created_date: now })),
  categories: [{ id: 'menu', name: 'Menu and Prices', sort_order: 2 }, { id: 'bev', name: 'Beverages', sort_order: 3 }],
};
// As Layout draws it on a phone: the header (56px under the status bar), <main> padded below it
// with p-2 inside, and the tab bar with its raised middle button (sticking up 20px).
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="/dist/assets/${css}">
<style>body{margin:0;background:#f8fafc}
#hdr{position:fixed;top:0;left:0;right:0;height:calc(56px + env(safe-area-inset-top,0px));z-index:30;background:#fff;border-bottom:1px solid #e2e8f0}
#tabs{position:fixed;bottom:0;left:0;right:0;height:calc(60px + env(safe-area-inset-bottom,0px));z-index:30;background:#fff;border-top:1px solid #e2e8f0}
#raised{position:absolute;left:50%;top:-20px;width:56px;height:56px;margin-left:-28px;border-radius:999px;background:#8b2fc9}
main{padding-top:calc(56px + env(safe-area-inset-top,0px));padding-bottom:calc(72px + env(safe-area-inset-bottom,0px));min-height:100vh;overflow-x:hidden}</style></head><body>
<div id="hdr"></div><main><div class="p-2"><div id="app"></div></div></main><div id="tabs"><div id="raised"></div></div>
<script>
window.rows = ${JSON.stringify(fixture)};
window.writes = [];
window.db = { from(table) {
  const q = { table, op: 'select', filters: [], values: null };
  const chain = { select(){return chain}, order(){return chain}, limit(){return chain}, or(){return chain},
    eq(c, v){ q.filters.push([c, v]); return chain }, in(c, v){ q.filters.push([c, v]); return chain },
    update(v){ q.op = 'update'; q.values = v; window.writes.push(q); return chain }, delete(){ q.op = 'delete'; window.writes.push(q); return chain },
    then(res, rej) { return Promise.resolve({ data: q.op === 'select' ? (window.rows[table] || []) : null, error: null }).then(res, rej); } };
  return chain; },
  auth: { getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({}) } };
</script><script src="/bundle.js"></script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(await readFile(path.join(tmp, 'bundle.js'))); }
    if (req.url.startsWith('/dist/assets/') && req.url.endsWith('.css')) { res.setHeader('content-type', 'text/css'); return res.end(await readFile(path.join(app, req.url))); }
  } catch { /* 404 below */ }
  res.statusCode = 404;
  res.end();
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const chrome = process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const fingerMove = async (x, from, to, steps = 12) => {
    for (let i = 1; i <= steps; i++) { await touch('touchMove', x, from + ((to - from) * i) / steps); await sleep(16); }
  };
  const rect = (selector) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }, selector);
  const ids = (sectionIndex) => page.evaluate((i) => [...document.querySelectorAll('section')[i].querySelectorAll('[data-reorder-id]')].map((c) => c.getAttribute('data-reorder-id')), sectionIndex);
  await page.goto(url);
  await page.evaluate(() => window.renderProducts());
  await page.waitForSelector('[data-reorder-id="p8"]');
  await sleep(200);

  // ── 1. Hold and drag with a finger, at the top of the page ────────────────────────────────
  const pizza = await rect('[data-reorder-id="p2"]');
  const slot = (await rect('[data-reorder-id="p1"]')).top - (await rect('[data-reorder-id="p0"]')).top;
  const x = 150;
  await touch('touchStart', x, pizza.top + 40);
  await sleep(600);
  const lifted = await page.evaluate(() => ({ y: window.scrollY, transform: document.querySelector('[data-reorder-id="p2"]').style.transform }));
  assert.deepEqual(lifted, { y: 2, transform: 'scale(1.03)' }, 'held: lifted, and the page nudged 2px off its top');
  await fingerMove(x, pizza.top + 40, pizza.top + 40 - 2 * slot);
  await sleep(250);
  const mid = await page.evaluate(() => Object.fromEntries(['p0', 'p1', 'p3'].map((id) => { const r = document.querySelector(`[data-reorder-id="${id}"]`).getBoundingClientRect(); return [id, { left: r.left, top: r.top }]; })));
  assert.equal(mid.p0.left, mid.p3.left, 'the first item makes room straight down (no sideways shift)');
  assert.equal(mid.p1.left, mid.p3.left, 'so does the second');
  assert.ok(Math.abs(mid.p0.top - (pizza.top - 2 * slot + slot - 2)) <= 1 && Math.abs(mid.p1.top - (pizza.top - 2)) <= 1, `each one place down: ${JSON.stringify(mid)}`);
  assert.equal(await page.evaluate(() => window.scrollY), 2, 'the finger moved the item, not the page');
  await touch('touchEnd');
  await sleep(500);
  assert.deepEqual(await ids(0), ['p2', 'p0', 'p1', 'p3'], 'dropped first');
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'the nudge is put back');
  assert.deepEqual(await page.evaluate(() => window.writes.map((w) => [w.filters[0][1], w.values.sort_order])), [['p2', 1], ['p0', 2], ['p1', 3]]);
  assert.match(await page.evaluate(() => document.body.innerText), /Moved Margherita Pizza\s*Undo/);
  passed('a finger holds, drags and drops an item: lifted, the others make room straight down, the page stays, the order is saved');

  // ── 2. Select mode ────────────────────────────────────────────────────────────────────────
  await sleep(500);
  const club = await rect('[data-reorder-id="p1"]');
  await touch('touchStart', x, club.top + 40);
  await sleep(600);
  await touch('touchEnd');
  await sleep(500);
  await page.tap('[data-reorder-id="p3"]');
  await sleep(300);
  const bar = await rect('[data-testid="select-bar"]');
  const header = await rect('#hdr');
  assert.deepEqual([bar.top, bar.height], [header.bottom, 56], 'the select bar sits flush under the header');
  assert.ok((await rect('[data-testid="move-tip"]')).top >= bar.bottom, 'the tip isn\'t under it');
  assert.match(await page.evaluate(() => document.querySelector('[data-testid="select-bar"]').innerText), /2 selected/);
  const del = await rect('[data-testid="delete-bar"]');
  const raised = await rect('#raised');
  assert.ok(del.bottom === 844 && del.top <= raised.top, `Delete covers the tab bar and its raised button: ${JSON.stringify({ del, raised })}`);
  assert.equal(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-testid="delete-bar"]'), [195, raised.top + 2]), true, 'Delete is on top there');
  // The dots drag at once (no hold): Lemonade to the top of Beverages.
  await page.evaluate(() => document.querySelector('[data-reorder-id="p6"]').scrollIntoView({ block: 'center' }));
  await sleep(300);
  const grip = await rect('[data-reorder-id="p6"] button[aria-label^="Move "]');
  const gx = (grip.left + grip.right) / 2;
  const gy = (grip.top + grip.bottom) / 2;
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => { window.writes.length = 0; });
  await touch('touchStart', gx, gy);
  await sleep(40);
  await fingerMove(gx, gy, gy - 2 * slot);
  await sleep(200);
  await touch('touchEnd');
  await sleep(500);
  assert.deepEqual(await ids(1), ['p6', 'p4', 'p5', 'p7', 'p8'], 'moved by its dots');
  assert.equal(await page.evaluate(() => window.scrollY), scrolled, 'the page didn\'t scroll');
  assert.deepEqual(await page.evaluate(() => window.writes.map((w) => [w.filters[0][1], w.values.sort_order])), [['p6', 5], ['p4', 6], ['p5', 7]]);
  // The delete window covers the whole screen.
  await page.tap('[data-testid="delete-bar"] button');
  await sleep(400);
  assert.equal(await page.evaluate(() => !!document.elementFromPoint(195, 2)?.closest('[data-pull-refresh-block]') && !!document.querySelector('[data-testid="delete-sheet"]')), true, 'the cover reaches the top of the screen');
  assert.ok((await rect('[data-testid="delete-sheet"]')).bottom === 844, 'the window sits at the bottom');
  passed('select mode: the bar flush under the header, Delete over the tab bar, the dots drag at once, the delete window covers the screen');

  // ── 3. The tick and confetti ──────────────────────────────────────────────────────────────
  const party = await context.newPage();
  await party.goto(url);
  await party.evaluate(() => window.renderCelebrate());
  await sleep(700);
  const flying = await party.evaluate(() => [...document.querySelectorAll('[data-testid="confetti"]')].filter((el) => getComputedStyle(el).opacity !== '0' && getComputedStyle(el).transform !== 'none').length);
  assert.ok(flying >= 20, `confetti in the air: ${flying}`);
  await sleep(2600);
  assert.deepEqual(await party.evaluate(() => [getComputedStyle(document.querySelector('[data-testid="celebrate"] path')).strokeDashoffset, [...document.querySelectorAll('[data-testid="confetti"]')].every((el) => getComputedStyle(el).opacity === '0')]), ['0px', true], 'the tick ends drawn; the confetti is gone');
  passed('the scan\'s tick draws itself and the confetti flies, then settles');
  assert.deepEqual(errors, [], 'no page errors');
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} products-in-Chrome checks passed`);
