// Explore after Taobao (Alvin, 28 Nov 2026), in real Chromium as a 360 px phone with the app's
// built styles:
//  - scrolling: the logo row and the search bar (the location pin left of it) stay at the top, one
//    slim header ending at the bottom of the search bar; the categories under it scroll away with
//    the page, and no filter button turns up in the search bar;
//  - the location pin: a tap opens the countries, one tap shows Explore in that country (listings,
//    shops, searches) and is kept on the phone for next time; every country again from the pin;
//  - the search: recent searches (kept per account on the phone) above the recommended listings,
//    sent ones remembered, a tap on one searches it, the bin clears them; "Recommended" turns into
//    "All listings" with a count once a filter changes;
//  - Shops on Sellio as cards (Alvin, 28 Nov 2026, the carousel): a sideways row, a card snapping
//    to the left edge with the next peeking in, its photos square with their prices under them and
//    a See shop tile as tall as them in a gap; arrows only with a mouse, a card a step;
//  - past searches rolling up through the empty search bar every 3 seconds, the search button
//    searching the one showing (with reduced motion: no roll).
// Screenshots go to SHOTS (a folder), when it is set.
// Run: npm run build (for the styles), then
//      node verification/explore-look.browser.mjs /tmp/sellio-verification
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
    const photo = (a, b, c) => 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x2='1' y2='1'><stop offset='0' stop-color='" + a + "'/><stop offset='1' stop-color='" + b + "'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/><circle cx='50' cy='56' r='25' fill='" + c + "'/><ellipse cx='50' cy='44' rx='17' ry='9' fill='#fff' opacity='.55'/></svg>");
    const colours = [['#fde7d3', '#f7c39e', '#c2410c'], ['#e3f3d8', '#c4e3ae', '#3f6212'], ['#fce7f3', '#f3c9e2', '#be185d'], ['#e0f2fe', '#b6e1fb', '#0369a1']];
    // Pandan & Co. (a shop) and Bake Habit have three listings with photos; Kuih Mak Teh two, so a See shop tile fills its gap.
    // Three more shops with no listings in the feed here, so the row is longer than a computer's screen too.
    const shopRows = shops.map(([name, currency, country], i) => ({ shop_id: 's' + i, shop_name: name, shop_slug: 's' + i, item_count: 3 + i * 3, currency, country,
      shop_type: i === 0 ? 'merchant' : 'individual',
      picks: rows.filter((r) => r.shop_id === 's' + i).slice(0, i === 2 ? 2 : 3).map((r, k) => ({ id: r.product_id, name: r.product_name, price: r.price, image_url: photo(...colours[(i + k) % 4]) })) }))
      .concat([['Grill Street', 'MYR', 'Malaysia', 'merchant'], ['Herbal House', 'MYR', 'Malaysia', 'merchant'], ['Dumpling Corner', 'SGD', 'Singapore', 'individual']].map(([name, currency, country, type], j) => ({
        shop_id: 'm' + j, shop_name: name, shop_slug: 'm' + j, item_count: 5, currency, country, shop_type: type,
        picks: [0, 1, 2].map((k) => ({ id: 'm' + j + k, name: name + ' ' + (k + 1), price: 2 + k, image_url: photo(...colours[(j + k + 1) % 4]) })) })));
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
// main.jsx's: a photo (class sellio-photo) shows once it has loaded.
const photos = `const mark = (e) => { const img = e.target; if (img instanceof HTMLImageElement && img.classList.contains('sellio-photo')) img.dataset.loaded = '1'; };
  document.addEventListener('load', mark, true); document.addEventListener('error', mark, true);`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><script>${photos}</script></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
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
  const box = (selector) => page.$eval(selector, (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const calls = (name) => page.evaluate((n) => window.__calls.filter(([c]) => c === n).map(([, a]) => a), name);
  const text = (selector) => page.$eval(selector, (el) => el.textContent.trim());
  await shot('1-top');

  await check('At the top: the logo row, then the pin, the search bar (coloured ring, search button inside on the right) and the cart, then the categories', async () => {
    const bar = await box('[data-testid="explore-top-bar"]');
    const ring = await box('[data-testid="explore-search-ring"]');
    const button = await box('[data-testid="explore-search-button"]');
    const pin = await box('[data-testid="explore-location"]');
    const cart = await box('a[href="/explore/cart"]');
    const cats = await box('[data-testid="explore-categories"]');
    assert.equal(bar.top, 0);
    assert.ok(ring.top >= bar.bottom && cats.top >= ring.bottom, 'in that order');
    assert.ok(pin.right <= ring.left && pin.left >= 0, `the pin is outside the search bar, on its left (${pin.left}-${pin.right} | ${ring.left})`);
    assert.ok(Math.abs((pin.top + pin.bottom) / 2 - (ring.top + ring.bottom) / 2) <= 2, 'level with it');
    assert.ok(cart.left >= ring.right && cart.right <= 360, 'the cart right of it');
    assert.ok(button.right <= ring.right && button.right >= ring.right - 8 && button.top > ring.top && button.bottom < ring.bottom, 'the button sits in the ring at its right end');
    const ringBg = await page.$eval('[data-testid="explore-search-ring"]', (el) => getComputedStyle(el).backgroundImage);
    assert.match(ringBg, /gradient/, 'the ring is the visitor\'s gradient');
    assert.ok(cats.bottom <= 150, `the whole top is slim (ends at ${cats.bottom}px)`);
    const header = await box('[data-testid="explore-header"]');
    assert.ok(header.bottom <= cats.top + 1, 'the header ends at the bottom of the search bar, the categories under it');
  });

  await check('Shops on Sellio: cards in a sideways row, the first 12px in from the edge and the next peeking in; no arrows on a phone', async () => {
    const r = await page.evaluate(() => {
      const rect = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
      const rail = document.querySelector('[data-testid="explore-shops-rail"]');
      const cards = [...rail.querySelectorAll('[data-testid="shop-card"]')].map(rect);
      const arrows = document.querySelector('[data-testid="explore-shops-arrows"]');
      return { cards, scrolls: rail.scrollWidth > rail.clientWidth, page: document.documentElement.scrollWidth, arrows: arrows ? getComputedStyle(arrows).display : 'absent',
        heading: rect(document.querySelector('#explore-shops-heading')), feed: rect(document.querySelector('#explore-feed-heading')) };
    });
    assert.equal(r.cards.length, 6);
    assert.equal(r.cards[0].left, 12, 'the first card 12px in');
    assert.ok(Math.abs(r.cards[0].width - 0.86 * (360 - 24)) <= 1, `86% of the row wide (${r.cards[0].width}px)`);
    assert.equal(r.cards[1].left, r.cards[0].right + 10, '10px apart');
    assert.ok(r.cards[1].left < 360 && 360 - r.cards[1].left >= 20, `the next peeks in (${360 - r.cards[1].left}px)`);
    assert.ok(r.scrolls, 'the row scrolls sideways');
    assert.equal(r.page, 360, 'the page itself is no wider than the phone');
    assert.equal(r.arrows, 'none', 'no arrows on a phone: it swipes');
    assert.ok(r.cards[0].top >= r.heading.bottom && r.feed.top > r.cards[0].bottom, 'under its heading, above Fresh finds');
    assert.ok(r.feed.top <= 470, `Fresh finds starts high on the screen (${r.feed.top}px)`);
  });
  await check('A card: logo, name, item count, Home seller or Shop, Visit on the right; three square photos with their prices under them; a See shop tile as tall as the photos in a gap', async () => {
    const r = await page.evaluate(() => {
      const rect = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
      return [...document.querySelectorAll('[data-testid="shop-card"]')].map((card) => ({
        card: rect(card), visit: rect(card.querySelector('[data-testid="shop-visit"]')), visitText: card.querySelector('[data-testid="shop-visit"]').textContent,
        kind: card.querySelector('[data-testid="shop-kind"]').textContent,
        photos: [...card.querySelectorAll('[data-testid="shop-pick"] > span:first-child')].map(rect),
        prices: [...card.querySelectorAll('[data-testid="shop-pick"] > span:last-child')].map((el) => ({ ...rect(el), text: el.textContent })),
        shown: [...card.querySelectorAll('[data-testid="shop-pick"] img')].map((img) => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1'),
        tile: card.querySelector('[data-testid="shop-see-shop"] > span:first-child') ? rect(card.querySelector('[data-testid="shop-see-shop"] > span:first-child')) : null,
      }));
    });
    const [pandan, bake, kuih] = r;
    assert.deepEqual(r.map((c) => c.kind), ['Shop', 'Home seller', 'Home seller', 'Shop', 'Shop', 'Home seller']);
    for (const c of r) {
      assert.equal(c.visitText, 'Visit');
      assert.equal(c.visit.height, 34);
      assert.equal(c.card.right - c.visit.right, 12, 'Visit at the card\'s right, inside its padding');
    }
    assert.equal(pandan.photos.length, 3);
    for (const p of pandan.photos) assert.ok(Math.abs(p.width - p.height) <= 1 && p.width >= 80, `square photos (${p.width}x${p.height})`);
    assert.ok(pandan.shown.every(Boolean), 'the photos show');
    assert.deepEqual(pandan.prices.map((p) => p.text), ['S$6.00', 'S$9.00', 'S$12.00'], 'priced in S$');
    assert.ok(pandan.prices.every((p, i) => p.top >= pandan.photos[i].bottom && p.top - pandan.photos[i].bottom <= 6), 'each price just under its photo');
    assert.deepEqual(kuih.prices.map((p) => p.text), ['RM8.00', 'RM11.00'], 'Kuih Mak Teh in RM');
    assert.equal(pandan.tile, null);
    assert.ok(kuih.tile, 'a See shop tile in Kuih Mak Teh\'s gap');
    assert.equal(kuih.tile.top, kuih.photos[0].top);
    assert.equal(kuih.tile.height, kuih.photos[0].height, 'as tall as the photos beside it');
    assert.equal(kuih.tile.width, kuih.photos[0].width, 'one column wide');
    assert.ok(r.every((c) => c.card.height === pandan.card.height), `cards the same height (${r.map((c) => c.card.height).join(', ')})`);
    assert.equal(bake.photos.length, 3);
  });
  await page.$eval('[data-testid="explore-shops-rail"]', (el) => el.scrollTo({ left: 150 }));
  await page.waitForTimeout(700);
  await shot('1b-cards-scrolled');
  await check('Scrolled part way, the row settles with a card at the left edge (12px in)', async () => {
    const lefts = await page.$$eval('[data-testid="shop-card"]', (els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    assert.ok(lefts.includes(12), `a card snapped to the edge (${lefts.join(', ')})`);
  });
  await page.$eval('[data-testid="explore-shops-rail"]', (el) => el.scrollTo({ left: 0 }));
  await page.waitForTimeout(400);

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  await shot('2-scrolled');
  await check('Scrolled down: the logo row and search bar stay at the top, the header ending at the search bar; the categories have gone up with the page; no filter button in the search bar', async () => {
    const bar = await box('[data-testid="explore-top-bar"]');
    const header = await box('[data-testid="explore-header"]');
    const ring = await box('[data-testid="explore-search-ring"]');
    assert.equal(bar.top, 0, 'the logo row stays');
    assert.equal(header.top, 0);
    // Alvin, 28 Nov 2026: the search bar almost touches the header's bottom edge, as on Taobao.
    assert.ok(header.bottom - ring.bottom >= 1 && header.bottom - ring.bottom <= 3, `the search bar almost touches the header's bottom edge (${header.bottom - ring.bottom}px under it)`);
    assert.ok(header.height <= 100, `a slim header (${header.height}px)`);
    assert.ok((await box('[data-testid="explore-categories"]')).bottom <= 0, 'the categories scrolled away');
    const inRing = await page.$$eval('[data-testid="explore-search-ring"] button', (els) => els.map((el) => el.getAttribute('aria-label')));
    assert.deepEqual(inRing, ['Search'], 'only the search button in the search bar');
    assert.ok(await page.$('[data-testid="explore-location"]'), 'the pin stays beside it');
    assert.notEqual(await page.$eval('[data-testid="explore-header"]', (el) => el.style.boxShadow), 'none', 'a hairline under it');
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // The location pin.
  await page.tap('[data-testid="explore-location"]');
  await page.waitForSelector('[data-testid="explore-location-sheet"]');
  await page.waitForTimeout(400);
  await shot('3-location');
  await check('The pin opens the countries at once, "Use my location" ticked to start with (nothing found here: every country)', async () => {
    const options = await page.$$eval('[data-testid="explore-location-sheet"] [role="radio"]', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('aria-checked')]));
    assert.deepEqual(options, [['Use my locationNot found', 'true'], ['All countries', 'false'], ['SGSingapore', 'false'], ['MYMalaysia', 'false'], ['IDIndonesia', 'false']]);
    assert.equal(await page.$('[data-testid="explore-location-code"]'), null, 'no code beside the pin for every country');
  });
  const before = { search: (await calls('explore_search')).length, shops: (await calls('explore_shops')).length };
  await page.tap('[data-testid="explore-location-sheet"] [data-option="Malaysia"]');
  await page.waitForTimeout(700);
  await shot('4-malaysia');
  await check('One tap on Malaysia: the sheet closes, MY shows by the pin, and only Malaysia\'s listings and shops show', async () => {
    assert.equal(await page.$('[data-testid="explore-location-sheet"]'), null);
    assert.equal(await text('[data-testid="explore-location-code"]'), 'MY');
    const search = (await calls('explore_search')).slice(before.search);
    assert.ok(search.length >= 1 && search.every((a) => a.p_country === 'Malaysia' && a.p_sort === 'best' && a.p_search === null), JSON.stringify(search));
    const shopsCalls = (await calls('explore_shops')).slice(before.shops);
    assert.deepEqual(shopsCalls.at(-1), { p_limit: 20, p_country: 'Malaysia' });
    const cards = await page.$$eval('[data-testid="item-card"]', (els) => els.map((el) => el.textContent));
    assert.ok(cards.length === 4 && cards.every((c) => c.includes('Kuih Mak Teh')), `only Malaysia's (${cards.length})`);
    assert.equal(await page.evaluate(() => localStorage.getItem('sellio:explore:country')), 'Malaysia', 'kept on the phone');
    assert.match(await page.$eval('[data-testid="explore-location"]', (el) => el.getAttribute('aria-label')), /Malaysia/);
  });

  await page.reload();
  await page.waitForSelector('[data-testid="item-card"]');
  await page.waitForTimeout(300);
  await check('Opened again later: still Malaysia', async () => {
    assert.equal(await text('[data-testid="explore-location-code"]'), 'MY');
    assert.equal((await calls('explore_feed')).length, 0, 'the feed comes from explore_search with the country');
    assert.equal((await calls('explore_shops')).at(-1).p_country, 'Malaysia');
  });

  await page.tap('input[type="search"]');
  await page.waitForTimeout(500);
  await check('A search starts in the pinned country (its Location chip shows it; the pin steps aside while searching)', async () => {
    assert.equal(await page.$eval('[data-chip="location"]', (el) => el.textContent.trim()), 'Malaysia');
    assert.equal(await page.$('[data-testid="explore-location"]'), null);
    assert.equal((await calls('explore_search')).at(-1).p_country, 'Malaysia');
  });
  await page.tap('[data-testid="explore-search-cancel"]');
  await page.waitForTimeout(500);

  await page.tap('[data-testid="explore-location"]');
  await page.waitForSelector('[data-testid="explore-location-sheet"]');
  await page.tap('[data-testid="explore-location-sheet"] [data-option="all"]');
  await page.waitForTimeout(700);
  await check('Every country again: no code by the pin, the feed and shops as before (no country sent)', async () => {
    assert.equal(await page.$('[data-testid="explore-location-code"]'), null);
    assert.deepEqual((await calls('explore_feed')).at(-1), { p_search: null, p_kind: null, p_limit: 24, p_offset: 0 });
    assert.deepEqual((await calls('explore_shops')).at(-1), { p_limit: 20 });
    assert.equal(await page.evaluate(() => localStorage.getItem('sellio:explore:country')), 'all', 'every country, kept as picked');
    assert.equal((await page.$$('[data-testid="item-card"]')).length, 14);
  });

  // Recent searches.
  await page.tap('input[type="search"]');
  await page.waitForTimeout(500);
  await check('The search, before anything was ever searched: no recent searches, "Recommended" with no count', async () => {
    assert.equal(await page.$('[data-testid="explore-recent"]'), null);
    assert.equal(await text('#explore-feed-heading'), 'Recommended');
    assert.equal(await page.$('[data-testid="explore-search-count"]'), null);
  });
  await page.keyboard.type('cake');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await page.fill('input[type="search"]', 'kuih');
  await page.tap('[data-testid="explore-search-button"]');
  await page.waitForTimeout(700);
  await check('Searches sent with Enter and the search button: results with their count, kept as recent searches', async () => {
    assert.equal(await text('#explore-feed-heading'), 'Results for “kuih”');
    assert.equal(await text('[data-testid="explore-search-count"]'), '2 listings');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('sellio:explore:recent:u1'))), ['kuih', 'cake']);
    assert.notEqual(await page.evaluate(() => document.activeElement?.type), 'search', 'the keyboard went down to show the results');
  });
  await page.tap('input[type="search"]');
  await page.fill('input[type="search"]', '');
  await page.waitForTimeout(500);
  await shot('5-recent');
  await check('The search box emptied: recent searches, newest first, above the recommended listings', async () => {
    const chips = await page.$$eval('[data-testid="explore-recent"] li button', (els) => els.map((el) => el.textContent));
    assert.deepEqual(chips, ['kuih', 'cake']);
    const recent = await box('[data-testid="explore-recent"]');
    assert.ok(recent.top >= (await box('[data-testid="explore-filter-chips"]')).bottom, 'under the filter chips');
    assert.ok((await box('#explore-feed-heading')).top > recent.bottom, 'above the listings');
    assert.equal(await text('#explore-feed-heading'), 'Recommended');
  });
  await page.tap('[data-testid="explore-recent"] li:nth-child(2) button');
  await page.waitForTimeout(700);
  await check('A tap on a recent search searches it again and moves it to the front', async () => {
    assert.equal(await page.$eval('input[type="search"]', (el) => el.value), 'cake');
    assert.equal(await text('#explore-feed-heading'), 'Results for “cake”');
    assert.equal(await page.$('[data-testid="explore-recent"]'), null, 'hidden while there are words in the box');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('sellio:explore:recent:u1'))), ['cake', 'kuih']);
  });

  await page.fill('input[type="search"]', 'brownies');
  await page.waitForTimeout(800);
  await page.tap('[data-testid="item-card"] a');
  await page.waitForSelector('#elsewhere');
  await check('A typed search kept when a listing is opened from its results (without Enter)', async () => {
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('sellio:explore:recent:u1'))), ['brownies', 'cake', 'kuih']);
  });
  // Leaving Explore mid-search takes its Back step off (a history traversal): let it settle first.
  await page.waitForTimeout(1000);
  await page.goto(`${base}/explore`).catch(() => page.goto(`${base}/explore`));
  await page.waitForSelector('[data-testid="item-card"]');

  await check('Past searches in the empty search bar: the newest, inside the ring, level with where typing goes; the box\'s placeholder blank', async () => {
    const r = await page.evaluate(() => {
      const hint = document.querySelector('[data-testid="explore-search-hint-text"]');
      const ring = document.querySelector('[data-testid="explore-search-ring"]').getBoundingClientRect();
      const input = document.querySelector('input[type="search"]');
      const button = document.querySelector('[data-testid="explore-search-button"]').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(hint);
      const words = range.getBoundingClientRect();
      return { text: hint.textContent, placeholder: input.placeholder, label: document.querySelector('[data-testid="explore-search-button"]').getAttribute('aria-label'),
        mid: (words.top + words.bottom) / 2, ringMid: (ring.top + ring.bottom) / 2, left: words.left, right: words.right, ringLeft: ring.left, buttonLeft: button.left,
        colour: getComputedStyle(hint).color, opacity: getComputedStyle(hint).opacity };
    });
    assert.equal(r.text, 'brownies');
    assert.equal(r.placeholder, '');
    assert.equal(r.label, 'Search “brownies”');
    assert.ok(Math.abs(r.mid - r.ringMid) <= 1.5, `centred in the bar (${r.mid} / ${r.ringMid})`);
    assert.ok(r.left >= r.ringLeft + 14 && r.right <= r.buttonLeft, 'inside the bar, clear of the button');
    assert.equal(r.colour, 'rgb(71, 85, 105)', 'in a darker grey than a placeholder');
    assert.equal(r.opacity, '1');
  });
  await page.waitForTimeout(3150);
  const rolling = await page.evaluate(() => [...document.querySelectorAll('[data-testid="explore-search-hint"] > span')].map((el) => ({ text: el.textContent, cls: el.className, transform: getComputedStyle(el).transform })));
  await page.waitForTimeout(600);
  await shot('6-hint');
  await check('3 seconds on, the next past search rolls up in as the last rolls away above', async () => {
    assert.deepEqual(rolling.map((x) => x.text), ['brownies', 'cake'], JSON.stringify(rolling));
    assert.match(rolling[0].cls, /sellio-hint-out/);
    assert.match(rolling[1].cls, /sellio-hint-in/);
    const now = await page.evaluate(() => [...document.querySelectorAll('[data-testid="explore-search-hint"] > span')].map((el) => ({ text: el.textContent, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })));
    assert.deepEqual(now.map((x) => [x.text, x.opacity]), [['brownies', '0'], ['cake', '1']], 'then the new one shows alone');
    assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(now[1].transform), `in its place (${now[1].transform})`);
    assert.equal(await page.$eval('[data-testid="explore-search-button"]', (el) => el.getAttribute('aria-label')), 'Search “cake”');
  });
  await page.tap('[data-testid="explore-search-button"]');
  await page.waitForTimeout(800);
  await shot('7-hint-searched');
  await check('The search button searches the past search showing', async () => {
    assert.equal(await page.$eval('input[type="search"]', (el) => el.value), 'cake');
    assert.equal(await text('#explore-feed-heading'), 'Results for “cake”');
    assert.ok(await page.$('[data-testid="explore-search-cancel"]'), 'in the search');
    assert.equal(await page.$('[data-testid="explore-search-hint"]'), null);
    assert.equal((await calls('explore_search')).at(-1).p_search, 'cake');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('sellio:explore:recent:u1'))), ['cake', 'brownies', 'kuih']);
  });
  await page.tap('[data-testid="explore-search-cancel"]');
  await page.waitForTimeout(500);
  assert.equal(await page.$eval('[data-testid="explore-search-hint-text"]', (el) => el.textContent), 'cake', 'back on Explore: the newest first');

  await page.tap('input[type="search"]');
  await page.waitForTimeout(500);
  await page.tap('[data-chip="price"]');
  await page.waitForSelector('[role="dialog"]');
  await page.fill('[role="dialog"] input[placeholder="Max"]', '10');
  await page.waitForTimeout(500);
  await page.tap('[data-testid="explore-filter-apply"]');
  await page.waitForTimeout(700);
  await check('A filter changed: "All listings" with their count (recent searches still there)', async () => {
    assert.equal(await text('#explore-feed-heading'), 'All listings');
    assert.match(await text('[data-testid="explore-search-count"]'), /listings?$/);
    assert.ok(await page.$('[data-testid="explore-recent"]'));
  });
  await page.tap('[data-testid="explore-recent-clear"]');
  await page.waitForTimeout(300);
  await check('The bin clears the recent searches', async () => {
    assert.equal(await page.$('[data-testid="explore-recent"]'), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('sellio:explore:recent:u1')), null);
  });
  await context.close();

  // A narrow phone with large text (the Oppo Find N5's cover screen, where "My shop" once wrapped):
  // every text made 30% larger, as Android's font size setting does in the app.
  const narrow = await browser.newContext({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const small = await narrow.newPage();
  await small.goto(`${base}/explore`);
  await small.waitForSelector('[data-testid="item-card"]');
  await small.evaluate(() => {
    const els = [...document.querySelectorAll('#root *')];
    const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
    els.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.3}px`; });
  });
  await small.waitForTimeout(300);
  if (shots) await small.screenshot({ path: path.join(shots, '6-narrow-large-text.png') });
  await check('320 px with the text 30% larger: the pin, the search bar, its button and the cart fit; the categories row scrolls sideways on one line', async () => {
    const fit = await small.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const ring = r('[data-testid="explore-search-ring"]');
      const button = r('[data-testid="explore-search-button"]');
      const cart = r('a[href="/explore/cart"]');
      const pin = r('[data-testid="explore-location"]');
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const lines = tabs.map((tab) => { const range = document.createRange(); range.selectNodeContents(tab.firstChild); return new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size; });
      const row = document.querySelector('[data-testid="explore-categories"]');
      return { ringLeft: ring.left, ringRight: ring.right, ringWidth: ring.width, pinLeft: pin.left, pinRight: pin.right, buttonRight: button.right, buttonWidth: button.width, cartRight: cart.right, lines,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth, rowHeight: row.getBoundingClientRect().height,
        tabsScroll: (() => { const list = row.querySelector('[role="tablist"]'); return list.scrollWidth > list.clientWidth; })() };
    });
    assert.ok(fit.buttonRight <= fit.ringRight && fit.buttonWidth >= 50, JSON.stringify(fit));
    assert.ok(fit.pinLeft >= 0 && fit.pinRight <= fit.ringLeft && fit.ringWidth >= 180, `pin, then a usable search bar (${JSON.stringify(fit)})`);
    assert.ok(fit.cartRight <= 320, `cart on screen (${fit.cartRight})`);
    assert.equal(fit.pageOverflow, 0, 'nothing wider than the phone');
    assert.deepEqual(fit.lines, [1, 1, 1, 1, 1], 'each category on one line');
    assert.equal(fit.rowHeight, 40);
    assert.equal(fit.tabsScroll, true, 'the rest of the categories scroll sideways');
  });
  await narrow.close();

  // A computer with a mouse, set to reduce motion, with past searches.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await desk.addInitScript(() => { if (!localStorage.getItem('sellio:explore:recent:u1')) localStorage.setItem('sellio:explore:recent:u1', JSON.stringify(['pandan', 'kuih'])); });
  const wide = await desk.newPage();
  await wide.goto(`${base}/explore`);
  await wide.waitForSelector('[data-testid="item-card"]');
  await wide.waitForTimeout(300);
  if (shots) await wide.screenshot({ path: path.join(shots, '8-computer.png') });
  const railLeft = () => wide.$eval('[data-testid="explore-shops-rail"]', (el) => Math.round(el.scrollLeft));
  const arrowsShown = () => wide.$$eval('[data-testid="explore-shops-arrows"] button', (els) => els.map((el) => ({ label: el.getAttribute('aria-label'), disabled: el.disabled, shown: getComputedStyle(el.parentElement).display !== 'none' })));
  await check('With a mouse: Previous and Next shop arrows beside the heading; Next moves one card along, Previous back', async () => {
    const atStart = await arrowsShown();
    assert.deepEqual(atStart, [{ label: 'Previous shop', disabled: true, shown: true }, { label: 'Next shop', disabled: false, shown: true }]);
    const width = await wide.$eval('[data-testid="shop-card"]', (el) => el.getBoundingClientRect().width);
    assert.equal(width, 330, 'at most 330px wide');
    await wide.click('[aria-label="Next shop"]');
    await wide.waitForTimeout(400);
    assert.equal(await railLeft(), 340, 'one card along (its width and the gap)');
    assert.equal((await arrowsShown())[0].disabled, false, 'Previous works now');
    await wide.click('[aria-label="Previous shop"]');
    await wide.waitForTimeout(400);
    assert.equal(await railLeft(), 0);
  });
  await check('Reduced motion: the past searches change without rolling', async () => {
    assert.equal(await wide.$eval('[data-testid="explore-search-hint-text"]', (el) => el.textContent), 'pandan');
    await wide.waitForTimeout(3200);
    const spans = await wide.$$eval('[data-testid="explore-search-hint"] > span', (els) => els.map((el) => ({ text: el.textContent, cls: el.className })));
    assert.deepEqual(spans.map((x) => x.text), ['kuih'], 'the next one, alone');
    assert.doesNotMatch(spans[0].cls, /sellio-hint-in/);
  });
  await desk.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} explore look browser checks passed`);
