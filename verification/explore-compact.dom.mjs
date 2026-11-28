// Explore's compact top (Alvin, 28 Nov 2026, after Taobao's): the logo row and the search bar (a
// coloured ring with the search button inside it, the location pin left of it) stay at the top,
// the categories under them (words) scroll away with the page, and no filter button turns up in
// the search bar when scrolling; the feed uses narrow gaps on phones. Also the
// sign-in landing (Explore; staff: their shop), staff kept out of Explore, the darker
// bottom bar, Me's Privacy / Terms links and My listings' small-screen filters.
// Run: node verification/explore-compact.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://sellio.apptelier.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.requestAnimationFrame = cb => win.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = id => win.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

const items = Array.from({ length: 12 }, (_, i) => ({
  product_id: 'p' + i, product_name: 'Item ' + i, price: 5, shop_id: 's1', shop_name: 'Perfect Five',
  shop_type: 'individual', listed_at: new Date().toISOString(), image_url: null,
}));
globalThis.feedCalls = [];
globalThis.fakeClient = {
  rpc: async (name, args) => {
    globalThis.feedCalls.push([name, args]);
    if (name === 'explore_shops') return { data: [{ shop_id: 's1', shop_name: 'Perfect Five', shop_slug: 'perfect-five', item_count: 1 }], error: null };
    return { data: items, error: null };
  },
};
const mocks = {
  supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
  appUser: 'export const useAppUser = () => ({ appUser: null });',
  tabbar: 'export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};',
  chatCount: 'export default function ExploreChatCount() { return null; }',
  bell: 'export default function ShopBell() { return null; }',
  ratings: 'export const useRatingSummaries = () => [{}];',
  ratingParts: 'export const RatingPill = () => null;',
  sell: 'export const useSell = () => ({ openSell() {} });',
};
const mock = { name: 'explore-mocks', setup(b) {
  const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
    [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell']];
  for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
} };
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-explore-'));
const outfile = path.join(tmp, 'explore.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: `
    export { default as Explore } from '@/pages/Explore';
    export { isStaffAccount, homeFor } from '@/lib/staffAccess';
  ` },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.explore-compact-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
let root;
try {
  // Sign-in landing and staff.
  assert.equal(mod.homeFor({ role: 'admin' }), '/explore');
  assert.equal(mod.homeFor({ role: 'user' }), '/explore');
  assert.equal(mod.homeFor({ role: 'staff' }), '/Dashboard');
  assert.equal(mod.homeFor(null, { is_owner: false }), '/Dashboard', 'no role yet: membership decides');
  assert.equal(mod.homeFor(null, { is_owner: true }), '/explore');
  assert.equal(mod.homeFor(null, null), '/explore');
  assert.equal(mod.homeFor({ role: 'cashier' }), '/Dashboard', 'a shop role name: staff');
  assert.equal(mod.homeFor({ role: 'admin' }, { is_owner: false }), '/explore', 'an owner role wins over another shop membership');
  passed('Signed in: owners and buyers start on Explore; staff logins on their shop Dashboard');

  // Explore page.
  let scrollY = 0;
  Object.defineProperty(win, 'scrollY', { get: () => scrollY, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 844, configurable: true });
  Object.defineProperty(win.document.documentElement, 'scrollHeight', { value: 3000, configurable: true });
  const scrolls = [];
  win.scrollTo = (opts) => { scrolls.push(opts); scrollY = 0; win.dispatchEvent(new win.Event('scroll')); };
  const scrollToY = async (y) => { scrollY = y; win.dispatchEvent(new win.Event('scroll')); await sleep(60); };

  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] }, React.createElement(mod.Explore)));
  await sleep(400);

  const header = container.querySelector('header');
  const tablist = () => container.querySelector('[role="tablist"]');
  const categories = () => container.querySelector('[data-testid="explore-categories"]');
  const topBar = container.querySelector('[data-testid="explore-top-bar"]');
  const ring = container.querySelector('[data-testid="explore-search-ring"]');
  const searchButton = container.querySelector('[data-testid="explore-search-button"]');
  const pin = container.querySelector('[data-testid="explore-location"]');
  const input = container.querySelector('input[type="search"]');
  assert.match(header.className, /\bsticky\b/, 'the header stays at the top while scrolling');
  assert.match(header.className, /\btop-0\b/);
  assert.ok(header.contains(topBar) && header.contains(input), 'with the logo row and the search bar in it');
  assert.match(topBar.className, /\bh-12\b/, 'logo row 48px');
  assert.ok(!header.contains(tablist()), 'the categories are not in it');
  assert.equal(header.nextElementSibling, categories(), 'they come right after it, as part of the page');
  assert.ok(categories().contains(tablist()));
  assert.ok(!categories().className.includes('sticky') && !categories().className.includes('fixed'), 'and scroll away with it');
  passed('Top: the logo row and the search bar stay at the top; the categories under them are part of the page');

  assert.ok(!ring.contains(pin), 'the pin is outside the search bar');
  assert.equal(pin.nextElementSibling, ring, 'just left of it');
  assert.ok(header.contains(pin));
  assert.match(ring.style.background, /--color-primary-gradient/, 'the ring is the visitor\'s colour');
  assert.ok(ring.contains(searchButton) && searchButton === ring.firstElementChild.lastElementChild, 'the search button sits inside the ring, on its right');
  assert.match(searchButton.style.background, /--color-primary-gradient/, 'in the same colour');
  assert.equal(searchButton.getAttribute('aria-label'), 'Search');
  assert.match(input.className, /h-full/);
  assert.match(input.className, /text-ellipsis/, 'a placeholder too long for a narrow bar ends with "…"');
  assert.match(ring.firstElementChild.className, /h-\[38px\]/);
  passed('Search bar: a coloured ring with the search button inside it on the right; the location pin outside it on the left');

  const tabs = [...tablist().querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map((b) => b.textContent), ['All', 'Food & drinks', 'Goods', 'Home sellers', 'Merchants']);
  assert.deepEqual(tabs.map((b) => b.getAttribute('aria-selected')), ['true', 'false', 'false', 'false', 'false']);
  assert.ok(!tabs[0].className.includes('border'), 'words, not outlined pills');
  const lineOf = (b) => b.querySelector('span[aria-hidden="true"]');
  assert.equal(lineOf(tabs[0]).style.opacity, '1', 'a line under the picked one');
  assert.equal(lineOf(tabs[2]).style.opacity, '0');
  passed('Categories: words, the picked one in the visitor\'s colour with a line under it');

  assert.equal(container.querySelector('button[aria-label^="Show categories"]'), null, 'no categories button in the search bar');
  assert.ok(!/SlidersHorizontal|Show categories/.test(await readFile('src/pages/Explore.jsx', 'utf8')), 'and no code left for one');
  const ringButtons = () => [...ring.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
  await scrollToY(20);
  assert.equal(header.style.boxShadow, 'none', 'no line while the categories (on the same wash) pass under the header');
  await scrollToY(120);
  assert.deepEqual(ringButtons(), ['Search'], 'scrolled down: only the search button in the search bar');
  assert.ok(header.contains(topBar) && !topBar.getAttribute('aria-hidden'), 'the logo row stays');
  assert.equal(header.nextElementSibling, categories(), 'the categories stay in the page (scrolled away under the header)');
  assert.match(header.style.boxShadow, /rgba/, 'a hairline under the header once the page scrolls under it');
  await scrollToY(400);
  assert.deepEqual(ringButtons(), ['Search']);
  await scrollToY(0);
  assert.equal(header.style.boxShadow, 'none', 'none at the top');
  passed('Scrolling: no filter button turns up in the search bar; the logo row stays, a hairline under the header');

  const goods = tabs.find((b) => b.textContent === 'Goods');
  await scrollToY(30);
  goods.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'smooth' }, 'picking one goes back to the top of the results');
  assert.equal(globalThis.feedCalls.at(-1)[1].p_kind, 'goods');
  assert.equal(goods.getAttribute('aria-selected'), 'true');
  assert.equal(lineOf(goods).style.opacity, '1');
  passed('Picking a category shows its results from the top, with the line under it');

  const grid = container.querySelector('.grid');
  assert.match(grid.className, /gap-2 sm:gap-3/);
  assert.match(container.querySelector('main').className, /px-2 sm:px-4/);
  passed('Feed cards: 8px from the edges and 8px apart on phones (wider cards)');

  // Source wiring for the rest of this batch.
  const read = f => readFile(f, 'utf8');
  const auth = await read('src/pages/Auth.jsx');
  assert.equal((auth.match(/completeAuthNavigation\(accountDeletionDestination\('\/Dashboard'\)\)/g) || []).length, 0);
  assert.match(auth, /homeFor\(appUserRow\)\)\); \/\/ Explore; staff: their shop/);
  assert.match(auth, /appUser\.onboarding_completed \? homeFor\(appUser\)/);
  assert.match(auth, /appUserRow\.onboarding_completed \? homeFor\(appUserRow\) : await landingWithoutShop\(supabase, appUserRow\)/);
  assert.match(await read('src/App.jsx'), /<Navigate to=\{homeFor\(appUser\)\} replace \/>/);
  const nav = await read('src/lib/authNavigation.js');
  assert.match(nav, /browser\.location\.replace\(destination\);\n\}/);
  assert.doesNotMatch(nav, /location\.assign/);
  const layout = await read('src/Layout.jsx');
  assert.match(layout, /if \(currentPageName === 'Explore' && staffAccount\) \{\n\s*return <Navigate to=\{createPageUrl\('Dashboard'\)\} replace \/>;/);
  assert.match(layout, /!\(staff && item\.page === 'Explore'\)/);
  assert.equal((layout.match(/staff=\{staffAccount\}/g) || []).length, 3);
  const tabBar = await read('src/components/navigation/MerchantTabBar.jsx');
  assert.match(tabBar, /staff\n\s*\? tab\('home', t\('Home'\), House, createPageUrl\('Dashboard'\)\)/);
  assert.match(tabBar, /onStaffMe\?\.\(\)/);
  passed('Sign-in lands on Explore (staff: Dashboard) and never stays behind in Back; staff are kept out of Explore and its menu and bar links');

  const bottom = await read('src/components/navigation/BottomTabBar.jsx');
  assert.match(bottom, /'text-slate-600'/);
  assert.doesNotMatch(bottom, /'text-slate-400'/);
  assert.match(bottom, /w-\[22px\] h-\[22px\]/);
  passed('Bottom bar: icons and words in a darker grey (not black), slightly larger icons');

  const me = await read('src/components/explore/ExploreMe.jsx');
  const signOutAt = me.indexOf("{t('Sign out')}"); // the words through t() since group 3 (16 Nov 2026)
  assert.ok(signOutAt > 0 && me.indexOf('<Link to="/privacy"') > signOutAt && me.indexOf('<Link to="/terms"') > signOutAt);
  assert.doesNotMatch(me, /<Row to="\/privacy"/);
  passed('Me: Privacy and Terms are text links after Sign out');

  const products = await read('src/pages/Products.jsx');
  const searchRow = products.slice(products.indexOf('{/* Search */}'), products.indexOf('{/* Category Filter */}'));
  assert.match(searchRow, /flex-1 min-w-0/);
  assert.match(searchRow, /aria-label=\{t\('Show as a list'\)\}/, 'the grid/list switch sits beside the search');
  assert.doesNotMatch(products, /min-w-\[130px\]|min-w-\[120px\]|min-w-\[110px\]/);
  const grid2 = await read('src/components/products/ProductGrid.jsx');
  assert.match(grid2, /fontWeight: 600, fontSize: 14, margin: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'/);
  passed('My listings: the switch sits beside the search, the filters share one row, long names end in "…" in the list');

  console.log(`\nAll ${passes} Explore and tidy-up checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  try { root?.unmount(); } catch { /* ignore */ }
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
