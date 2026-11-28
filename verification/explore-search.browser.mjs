// Explore's search mode in real Chromium as a 360 px phone, with the app's built styles: a tap
// on the search box folds the logo row away (to no height, the search box at the top), the sort
// and filter chips show and scroll sideways, the Filters sheet opens over the page, and the
// phone's Back leaves the search (the logo row comes back). Screenshots go to SHOTS (a folder),
// when it is set, to look at.
// Run: npm run build (for the styles), then
//      node verification/explore-search.browser.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const taskRoot = process.argv[2] || '/tmp/sellio-verification';
const require = createRequire(path.join(taskRoot, 'package.json'));
const { chromium } = require('playwright');
const app = process.cwd();
const shots = process.env.SHOTS || '';
if (shots) await mkdir(shots, { recursive: true });

const assets = path.join(app, 'dist', 'assets');
const cssName = (await readdir(assets).catch(() => [])).find((file) => /^index-.*\.css$/.test(file));
if (!cssName) throw new Error('No built styles: run npm run build first (dist/assets/index-*.css).');
const css = await readFile(path.join(assets, cssName), 'utf8');
const logo = await readFile(path.join(app, 'public/branding/sellio-logo.webp'));

const mocks = {
  supabase: `
    const at = new Date(Date.now() - 3 * 3600e3).toISOString();
    const names = ['Pandan chiffon cake', 'Burnt Basque cheesecake', 'Cake boxes and boards', 'Chocolate lava cake', 'Glass cake stand', 'Rainbow cake slice'];
    const rows = names.map((name, i) => ({ product_id: 'p' + i, product_name: name, price: 6 + i * 7, currency: 'SGD', listed_at: at, image_url: null,
      shop_id: 's' + (i % 3), shop_name: ['Pandan & Co.', 'Bake Habit', 'Craft Nook'][i % 3], shop_slug: 's' + i, shop_type: 'individual' }));
    window.__calls = [];
    const client = { rpc: async (name, args) => {
      window.__calls.push([name, args]);
      if (name === 'explore_search') {
        const found = rows.filter((r) => !args.p_search || r.product_name.toLowerCase().includes(String(args.p_search).toLowerCase())).map((r, i, all) => ({ ...r, total_count: all.length }));
        return { data: args.p_limit === 1 ? found.slice(0, 1) : found, error: null };
      }
      if (name === 'explore_feed') return { data: rows, error: null };
      if (name === 'explore_suggest') return { data: { suggestion: null, popular: [] }, error: null };
      return { data: [], error: null };
    }, from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) };
    export const getSupabase = async () => client;`,
  appUser: `export const useAppUser = () => ({ appUser: { id: 'u1', tenant_id: 't1' } });`,
  tabbar: `export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};`,
  chatCount: `export default function ExploreChatCount() { return null; }`,
  bell: `import React from 'react';
    const box = (label) => React.createElement('button', { key: label, type: 'button', 'aria-label': label, className: 'relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-slate-700' },
      React.createElement('span', { style: { display: 'block', width: 20, height: 20, borderRadius: 4, background: '#334155' } }));
    export default function ShopBell() { return [box('Chats'), box('Notifications')]; }`,
  ratings: `export const useRatingSummaries = () => [{}];`,
  ratingParts: `export const RatingPill = () => null;`,
  sell: `export const useSell = () => ({ openSell() {} });`,
  likes: `export const likeErrorMessage = () => ''; export const likesText = () => ''; export const needsSignIn = () => false;
    export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useKnownLike = () => null; export const useLikesFor = () => {};`,
};
const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
  [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell'], [/lib\/likes$/, 'likes']];
const out = await build({
  stdin: {
    resolveDir: app, loader: 'jsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import Explore from '@/pages/Explore';
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] }, React.createElement(Explore)));
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(app, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'silent',
  plugins: [{ name: 'explore-search-mocks', setup(b) {
    for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'jsx', contents: mocks[args.path], resolveDir: app }));
  } }],
});
const script = out.outputFiles[0].text;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;

// A page of its own (not about:blank), so Back has real history to go through.
const server = createServer((req, res) => {
  if (req.url.startsWith('/app.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(script); return; }
  if (req.url.startsWith('/branding/sellio-logo.webp')) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(logo); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' }); }
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${base}/explore`);
  await page.waitForSelector('[data-testid="item-card"]');
  const box = (selector) => page.$eval(selector, (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom) }; });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  await shot('1-explore');

  await check('Before a search: the logo row is 48 px tall, the search box under it, "My shop" on one line', async () => {
    assert.equal((await box('[data-testid="explore-top-bar"]')).height, 48);
    assert.ok((await box('input[type="search"]')).top >= 48);
    const lines = await page.$eval('[data-testid="explore-my-shop"]', (el) => {
      const tops = new Set();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(node);
        for (const rect of r.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    });
    assert.equal(lines, 1);
  });

  await page.tap('input[type="search"]');
  await page.waitForTimeout(400);
  await shot('2-search-tapped');
  await check('A tap on the search box: the logo row folds to no height, the search box moves to the top, the chips show', async () => {
    assert.equal((await box('[data-testid="explore-top-bar"]')).height, 0);
    const input = await box('input[type="search"]');
    assert.ok(input.top <= 12, `search box at the top (top ${input.top})`);
    const chips = await box('[data-testid="explore-filter-chips"]');
    assert.ok(chips.top >= input.bottom && chips.height > 30, 'the chips under the search box');
    const scrolls = await page.$eval('[data-testid="explore-filter-chips"]', (el) => el.scrollWidth > el.clientWidth);
    assert.equal(scrolls, true, 'six chips are wider than a 360 px phone: they scroll sideways');
    assert.ok(await page.$('[data-testid="explore-search-cancel"]'));
    assert.equal(await page.evaluate(() => document.activeElement?.type), 'search', 'the keyboard can come up: the box keeps the focus');
  });

  await page.keyboard.type('cake');
  await page.waitForTimeout(700);
  await page.tap('[data-chip="all"]');
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(500);
  await shot('3-filters-sheet');
  await check('The Filters sheet rises over the page, with its count button in view', async () => {
    const sheet = await box('[role="dialog"] [tabindex="-1"]');
    assert.ok(sheet.bottom <= 800 && sheet.top > 60, `the sheet sits at the bottom (${sheet.top}–${sheet.bottom})`);
    const apply = await box('[data-testid="explore-filter-apply"]');
    assert.ok(apply.bottom <= 800, 'the button is on screen');
    assert.equal(await page.$eval('[data-testid="explore-filter-apply"]', (el) => el.textContent.trim()), 'Show 6 results');
  });

  await page.goBack();
  await page.waitForTimeout(400);
  await check('The phone’s Back closes the sheet first, the search stays', async () => {
    assert.equal(await page.$('[role="dialog"]'), null);
    assert.equal((await box('[data-testid="explore-top-bar"]')).height, 0);
  });

  await page.goBack();
  await page.waitForTimeout(500);
  await shot('4-after-back');
  await check('The phone’s Back again leaves the search: the logo row is back, the search cleared', async () => {
    assert.equal((await box('[data-testid="explore-top-bar"]')).height, 48);
    assert.equal(await page.$('[data-testid="explore-filter-chips"]'), null);
    assert.equal(await page.$eval('input[type="search"]', (el) => el.value), '');
  });
  await context.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} explore search browser checks passed`);
