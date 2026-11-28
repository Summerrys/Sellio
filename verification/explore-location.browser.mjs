// Explore's location pin finds where the visitor is (Alvin, 28 Nov 2026: "make it detect where the
// location is and immediately show that location items"), in real Chromium as a 360 px phone. The
// website's /api/country (public/_worker.js: the country Cloudflare sees) is a stand-in here,
// answering what each step sets:
//  - first visit: the listings wait for the answer and open in that country (Malaysia), with MY
//    by the pin; the answer is kept on the phone;
//  - next visit: Explore opens at once in the kept country while it asks again, and moves to the
//    new answer (Singapore);
//  - somewhere Sellio isn't (Thailand): every country, "Not found" in the sheet;
//  - a country picked with the pin wins over where the visitor is, until "Use my location";
//  - no answer within 3 seconds: every country.
// Run: npm run build (for the styles), then
//      node verification/explore-location.browser.mjs /tmp/sellio-verification
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
    const at = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    const shops = [['Pandan & Co.', 'SGD', 'Singapore'], ['Bake Habit', 'SGD', 'Singapore'], ['Kuih Mak Teh', 'MYR', 'Malaysia']];
    const names = ['Pandan chiffon cake', 'Burnt Basque cheesecake', 'Kuih lapis', 'Chocolate lava cake', 'Glass cake stand', 'Ondeh ondeh',
      'Rainbow cake slice', 'Butter cookies', 'Kuih seri muka', 'Banana loaf', 'Lemon tart', 'Onde onde box', 'Brownies', 'Scones'];
    const rows = names.map((name, i) => ({ product_id: 'p' + i, product_name: name, price: 6 + i, currency: shops[i % 3][1], listed_at: at(i + 1),
      image_url: null, shop_id: 's' + (i % 3), shop_name: shops[i % 3][0], shop_slug: 's' + (i % 3), shop_type: 'individual', country: shops[i % 3][2] }));
    const shopRows = shops.map(([name, , country], i) => ({ shop_id: 's' + i, shop_name: name, shop_slug: 's' + i, item_count: 3, country }));
    window.__calls = [];
    const pick = ({ country, ...row }) => row;
    const client = { rpc: async (name, args) => {
      window.__calls.push([name, args]);
      if (name === 'explore_search') {
        const found = rows.filter((r) => (!args.p_search || r.product_name.toLowerCase().includes(String(args.p_search).toLowerCase()))
          && (!args.p_country || r.country === args.p_country)).map((r, i, all) => ({ ...pick(r), total_count: all.length }));
        return { data: found.slice(args.p_offset || 0, (args.p_offset || 0) + (args.p_limit || 24)), error: null };
      }
      if (name === 'explore_feed') return { data: rows.map(pick).slice(args.p_offset || 0, (args.p_offset || 0) + (args.p_limit || 24)), error: null };
      if (name === 'explore_shops') return { data: shopRows.filter((s) => !args.p_country || s.country === args.p_country).map(pick), error: null };
      if (name === 'explore_suggest') return { data: { suggestion: null, popular: [] }, error: null };
      return { data: [], error: null };
    }, from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) };
    export const getSupabase = async () => client;`,
  appUser: `export const useAppUser = () => ({ appUser: { id: 'u1', tenant_id: 't1' } });`,
  tabbar: `export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};`,
  chatCount: `export default function ExploreChatCount() { return null; }`,
  bell: `export default function ShopBell() { return null; }`,
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
      import { MemoryRouter, Routes, Route } from 'react-router-dom';
      import Explore from '@/pages/Explore';
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/explore', element: React.createElement(Explore) }),
          React.createElement(Route, { path: '*', element: React.createElement('p', { id: 'elsewhere' }, 'a listing') }))));
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(app, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'silent',
  plugins: [{ name: 'explore-look-mocks', setup(b) {
    for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'jsx', contents: mocks[args.path], resolveDir: app }));
  } }],
});
const script = out.outputFiles[0].text;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
// /api/country answers as each step sets: { country, delay (ms), status }.
let where = { country: 'MY', delay: 0, status: 200 };
let asked = 0;
const server = createServer((req, res) => {
  if (req.url.startsWith('/app.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(script); return; }
  if (req.url.startsWith('/branding/sellio-logo.webp')) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(logo); return; }
  if (req.url.startsWith('/api/country')) {
    asked += 1;
    const { country, delay, status } = where;
    setTimeout(() => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(status === 200 ? JSON.stringify({ country }) : '{"error":"down"}');
    }, delay);
    return;
  }
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
  const calls = () => page.evaluate(() => window.__calls.map(([name, args]) => [name, args.p_country ?? null]));
  const feedCalls = async () => (await calls()).filter(([name]) => name === 'explore_search' || name === 'explore_feed');
  const code = async () => (await page.$('[data-testid="explore-location-code"]')) ? page.$eval('[data-testid="explore-location-code"]', (el) => el.textContent) : null;
  // [the pick kept, the answer kept ('none': nothing kept yet)]
  const kept = () => page.evaluate(() => {
    const found = JSON.parse(localStorage.getItem('sellio:explore:detected') || 'null');
    return [localStorage.getItem('sellio:explore:country'), found ? found.country : 'none'];
  });
  const open = async () => {
    await page.goto(`${base}/explore`);
    await page.waitForSelector('[data-testid="item-card"]');
  };
  const sheet = async () => {
    await page.tap('[data-testid="explore-location"]');
    await page.waitForSelector('[data-testid="explore-location-sheet"]');
    return page.$$eval('[data-testid="explore-location-sheet"] [role="radio"]', (els) => els.map((el) => [el.dataset.option, el.getAttribute('aria-checked'), el.querySelector('[data-testid="explore-location-found"]')?.textContent || '']));
  };
  const closeSheet = async () => { await page.tap('[data-testid="explore-location-sheet"] [aria-checked="true"]'); await page.waitForTimeout(500); };

  where = { country: 'MY', delay: 400, status: 200 };
  await open();
  await page.waitForTimeout(300);
  await check('First visit, in Malaysia: the listings wait for the answer and open in Malaysia (no every-country load first), MY by the pin', async () => {
    const feed = await feedCalls();
    assert.ok(feed.length >= 1 && feed.every(([name, c]) => name === 'explore_search' && c === 'Malaysia'), JSON.stringify(feed));
    assert.deepEqual((await calls()).filter(([name]) => name === 'explore_shops'), [['explore_shops', 'Malaysia']]);
    assert.equal(await code(), 'MY');
    assert.deepEqual(await kept(), [null, 'Malaysia'], 'no pick kept, the answer kept');
    const cards = await page.$$eval('[data-testid="item-card"]', (els) => els.map((el) => el.textContent));
    assert.ok(cards.length && cards.every((c) => c.includes('Kuih Mak Teh')), 'only Malaysia\'s listings');
  });
  await check('The sheet: "Use my location" ticked, saying Malaysia', async () => {
    const options = await sheet();
    assert.deepEqual(options[0], ['auto', 'true', 'Malaysia']);
    assert.ok(options.slice(1).every(([, on]) => on === 'false'));
    await closeSheet();
  });

  where = { country: 'SG', delay: 800, status: 200 };
  await open();
  const early = await feedCalls();
  await page.waitForTimeout(1200);
  await check('Next visit, now in Singapore: opens at once in the kept Malaysia, then moves to Singapore when the answer comes', async () => {
    assert.ok(early.length >= 1 && early[0][1] === 'Malaysia', `listings straight away, in the kept country: ${JSON.stringify(early)}`);
    const feed = await feedCalls();
    assert.equal(feed.at(-1)[1], 'Singapore');
    assert.equal(await code(), 'SG');
    assert.deepEqual(await kept(), [null, 'Singapore']);
  });

  where = { country: 'TH', delay: 0, status: 200 };
  await open();
  await page.waitForTimeout(600);
  await check('Somewhere Sellio isn\'t (Thailand): every country, no code by the pin, "Not found" in the sheet', async () => {
    const feed = await feedCalls();
    assert.deepEqual(feed.at(-1), ['explore_feed', null]);
    assert.equal(await code(), null);
    assert.deepEqual(await kept(), [null, null]);
    const options = await sheet();
    assert.deepEqual(options[0], ['auto', 'true', 'Not found']);
    await page.tap('[data-testid="explore-location-sheet"] [data-option="Singapore"]');
    await page.waitForTimeout(600);
  });

  where = { country: 'MY', delay: 0, status: 200 };
  const askedBefore = asked;
  await open();
  await page.waitForTimeout(500);
  await check('A country picked with the pin wins over where the visitor is (Singapore picked, in Malaysia)', async () => {
    const feed = await feedCalls();
    assert.ok(feed.every(([, c]) => c === 'Singapore'), JSON.stringify(feed));
    assert.equal(await code(), 'SG');
    assert.equal((await kept())[0], 'Singapore');
    assert.equal(asked, askedBefore, 'not even asked');
    const options = await sheet();
    assert.deepEqual(options.find(([key]) => key === 'Singapore').slice(0, 2), ['Singapore', 'true']);
    assert.equal(options[0][1], 'false');
    await page.tap('[data-testid="explore-location-sheet"] [data-option="auto"]');
    await page.waitForTimeout(700);
  });
  await check('"Use my location": asked again, Malaysia shown, the pick forgotten', async () => {
    assert.ok(asked > askedBefore);
    assert.equal((await feedCalls()).at(-1)[1], 'Malaysia');
    assert.equal(await code(), 'MY');
    assert.deepEqual(await kept(), [null, 'Malaysia']);
  });

  where = { country: 'SG', delay: 0, status: 500 };
  await open();
  await page.waitForTimeout(500);
  await check('No answer this time (the website down): the kept country stays (Malaysia)', async () => {
    assert.ok((await feedCalls()).every(([, c]) => c === 'Malaysia'));
    assert.equal(await code(), 'MY');
  });
  await context.close();

  const fresh = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const slow = await fresh.newPage();
  where = { country: 'MY', delay: 6000, status: 200 };
  const started = Date.now();
  await slow.goto(`${base}/explore`);
  await slow.waitForSelector('[data-testid="item-card"]', { timeout: 10000 });
  const waited = Date.now() - started;
  await check('First visit with no answer within 3 seconds: every country, after waiting no longer than that', async () => {
    assert.ok(waited >= 2500 && waited < 5500, `waited ${waited}ms`);
    const feed = await slow.evaluate(() => window.__calls.filter(([n]) => n === 'explore_feed' || n === 'explore_search').map(([n, a]) => [n, a.p_country ?? null]));
    assert.deepEqual(feed, [['explore_feed', null]]);
    assert.equal(await slow.$('[data-testid="explore-location-code"]'), null);
  });
  await fresh.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} explore location browser checks passed`);
