// Explore's compact top: categories fold into a button in the search bar when scrolling
// down and open out again at the top; the feed uses narrow gaps on phones. Also the
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
  const foldBox = () => tablist().parentElement.parentElement;
  const foldButton = () => container.querySelector('button[aria-label^="Show categories"]');
  const isFolded = () => foldBox().style.transform.includes('-100%');
  const buttonShown = () => foldButton().style.opacity === '1' && foldButton().style.pointerEvents === 'auto';
  assert.ok(header.contains(tablist()), 'categories sit in the header');
  assert.match(header.className, /sticky top-0/, 'the header stays at the top while scrolling');
  assert.match(header.querySelector('.h-14')?.className || '', /h-14/, 'logo row stays 56px');
  assert.match(container.querySelector('input[type="search"]').className, /h-\[38px\]/);
  assert.match(tablist().querySelector('button').className, /h-\[30px\]/);
  assert.ok(!isFolded());
  assert.ok(!buttonShown());
  passed('Top: 56px logo row, 38px search, 30px category pills; the header stays at the top');

  for (const style of [foldBox().style, foldButton().style]) {
    assert.match(style.transition, /transform/);
    assert.doesNotMatch(style.transition, /height|max-height|top|margin|padding/, 'only transform and opacity move: no layout, so it stays smooth');
  }
  assert.equal(foldBox().style.willChange, 'transform');
  passed('The slide moves only transform and opacity (smooth on phones: nothing is laid out again)');

  await scrollToY(30);
  assert.ok(!isFolded(), 'a little scroll changes nothing');
  await scrollToY(120);
  assert.ok(isFolded(), 'scrolled down: categories slide away');
  assert.equal(foldBox().style.visibility, 'hidden');
  assert.ok(buttonShown(), 'a categories button shows in the search bar');
  await scrollToY(20);
  assert.ok(isFolded(), 'stays folded until the top');
  await scrollToY(4);
  assert.ok(!isFolded(), 'back at the top: categories slide back');
  assert.ok(!buttonShown());
  passed('Scrolling down slides the categories away into a button in the search bar; back at the top they slide back');

  await scrollToY(400);
  foldButton().dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  assert.ok(!isFolded(), 'the button brings them back while scrolled down');
  await scrollToY(390);
  await scrollToY(398);
  assert.ok(!isFolded(), 'scrolling up a little keeps them');
  await scrollToY(420);
  assert.ok(isFolded(), 'any scroll down hides them again');
  assert.ok(buttonShown());
  passed('Opened from the button, the categories hide again on the next scroll down');

  foldButton().dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  const goods = [...tablist().querySelectorAll('button')].find(b => b.textContent === 'Goods');
  goods.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'smooth' }, 'picking one goes back to the top of the results');
  assert.equal(globalThis.feedCalls.at(-1)[1].p_kind, 'goods');
  await scrollToY(400);
  assert.ok(foldButton().querySelector('span'), 'a dot shows a category is picked');
  passed('Picking a category shows its results from the top; a dot marks a picked category');

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
  const signOutAt = me.indexOf('Sign out\n');
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
