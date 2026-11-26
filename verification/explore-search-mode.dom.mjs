// Explore's search mode (Alvin, 26 Nov 2026: "When user begin to search, the top bar should be
// hidden … the moment that they click onto the search bar, they should be able to filter"):
// tapping the search box folds the logo row away (hidden and out of reach), shows Cancel and the
// sort / filter chips in place of the cart and the categories, and lists through explore_search;
// the category picked on Explore carries over; Sort and Category apply at once; the Filters sheet
// counts its matches and applies them together; nothing found with filters on offers Clear
// filters; Cancel goes back to Explore as it was.
// Run: TZ=Asia/Singapore node verification/explore-search-mode.dom.mjs /tmp/sellio-verification
process.env.TZ = 'Asia/Singapore';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://sellio.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage', 'history', 'location', 'PopStateEvent']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = (id) => win.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
win.scrollTo = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

// Listings the stand-in explore_search filters roughly as the database does.
const at = new Date().toISOString();
const LISTINGS = [
  { product_id: 'a', product_name: 'Pandan chiffon cake', price: 18, currency: 'SGD', country: 'Singapore', deal: ['meetup'], shop_type: 'individual', shop_id: 's1', shop_name: 'Pandan & Co.' },
  { product_id: 'b', product_name: 'Burnt cheesecake', price: 38, currency: 'SGD', country: 'Singapore', deal: ['meetup', 'delivery'], shop_type: 'individual', shop_id: 's2', shop_name: 'Bake Habit' },
  { product_id: 'c', product_name: 'Cake boxes', price: 9.5, currency: 'SGD', country: 'Singapore', deal: ['delivery'], shop_type: 'individual', shop_id: 's3', shop_name: 'Craft Nook' },
  { product_id: 'd', product_name: 'Lava cake', price: 7.9, currency: 'SGD', country: 'Singapore', deal: ['meetup'], shop_type: 'merchant', shop_id: 's4', shop_name: 'Kopi Corner' },
  { product_id: 'e', product_name: 'Kek lapis cake', price: 45, currency: 'MYR', country: 'Malaysia', deal: ['delivery'], shop_type: 'individual', shop_id: 's5', shop_name: 'Kuih Cik Nah' },
].map((l) => ({ ...l, listed_at: at, image_url: null, shop_slug: l.shop_id }));
globalThis.calls = [];
const searchCalls = () => globalThis.calls.filter(([n, a]) => n === 'explore_search' && a.p_limit !== 1).map(([, a]) => a);
const countCalls = () => globalThis.calls.filter(([n, a]) => n === 'explore_search' && a.p_limit === 1).map(([, a]) => a);
globalThis.fakeClient = {
  rpc: async (name, args) => {
    globalThis.calls.push([name, args]);
    if (name === 'explore_shops') return { data: [], error: null };
    if (name === 'explore_feed') return { data: LISTINGS, error: null };
    if (name === 'explore_search') {
      const q = String(args.p_search || '').toLowerCase();
      const found = LISTINGS.filter((l) => (!q || l.product_name.toLowerCase().includes(q))
        && (!args.p_kind || (args.p_kind === 'home' ? l.shop_type === 'individual' : args.p_kind === 'merchants' ? l.shop_type === 'merchant' : false))
        && (!args.p_deal || args.p_deal.some((d) => l.deal.includes(d)))
        && (!args.p_country || l.country === args.p_country)
        && ((args.p_min == null && args.p_max == null) || (l.currency === args.p_currency && (args.p_min == null || l.price >= args.p_min) && (args.p_max == null || l.price <= args.p_max))));
      const rows = found.map((l) => ({ ...l, total_count: found.length }));
      return { data: args.p_limit === 1 ? rows.slice(0, 1) : rows, error: null };
    }
    if (name === 'explore_suggest') return { data: { suggestion: null, popular: [] }, error: null };
    return { data: [], error: null };
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
const mock = { name: 'explore-search-mocks', setup(b) {
  const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
    [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell']];
  for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
} };
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-explore-search-'));
const outfile = path.join(tmp, 'explore.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as Explore } from '@/pages/Explore'; export * as search from '@/lib/exploreSearch';" },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.explore-search-mode-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const click = async (el, wait = 60) => { assert.ok(el, 'something to click'); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(wait); };
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
let root;
try {
  // The helpers on their own.
  const { readPrice, priceRange, searchArgs, searchFilters, activeFilterCount, shortPrice } = mod.search;
  assert.equal(readPrice('5.50', 'SGD'), 5.5);
  assert.equal(readPrice('1,000', 'MYR'), 1000);
  assert.equal(readPrice('15.000', 'IDR'), 15000);
  assert.equal(readPrice('', 'SGD'), null);
  assert.equal(readPrice('abc', 'SGD'), null);
  assert.equal(shortPrice(10, 'SGD'), 'S$10');
  assert.equal(shortPrice(5.5, 'MYR'), 'RM5.50');
  assert.equal(shortPrice(15000, 'IDR'), 'Rp15.000');
  assert.deepEqual(priceRange({ ...searchFilters('all', 'SGD'), min: '50', max: '10' }), { min: 10, max: 50, currency: 'SGD' }, 'the wrong way round means the same range');
  assert.equal(priceRange({ ...searchFilters('all', 'SGD'), country: 'Malaysia' }).currency, 'MYR', 'a picked country sets the currency');
  assert.deepEqual(searchArgs('cake', { ...searchFilters('home', 'SGD'), deal: ['delivery'], max: '40' }), {
    p_search: 'cake', p_kind: 'home', p_sort: 'best', p_deal: ['delivery'], p_country: null, p_currency: 'SGD', p_min: null, p_max: 40,
  });
  assert.equal(activeFilterCount(searchFilters('all', 'SGD')), 0);
  assert.equal(activeFilterCount({ ...searchFilters('home', 'SGD'), sort: 'recent', deal: ['meetup'], country: 'Malaysia', min: '5' }), 4, 'the sort is not a filter');
  assert.equal(searchFilters().currency, 'SGD', 'in Singapore, prices start in S$');
  passed('Prices read as typed in each currency (S$5.50, RM1,000, Rp15.000), ranges either way round, filters counted without the sort');

  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] }, React.createElement(mod.Explore)));
  await sleep(300);
  const input = () => container.querySelector('input[type="search"]');
  const topBar = () => container.querySelector('[data-testid="explore-top-bar"]');
  const chipsRow = () => container.querySelector('[data-testid="explore-filter-chips"]');
  const chip = (key) => container.querySelector(`[data-chip="${key}"]`);
  const kindsTab = (name) => [...container.querySelectorAll('[role="tablist"] button')].find((b) => text(b) === name);
  const dialog = () => win.document.querySelector('[role="dialog"]');
  const inDialog = (name) => [...(dialog()?.querySelectorAll('button') || [])].find((b) => text(b) === name);
  const type = async (value, wait = 380) => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    setter.call(input(), value);
    input().dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(wait);
  };

  // Explore before a search: the logo row, the categories and the cart; no filter chips.
  assert.equal(topBar().getAttribute('aria-hidden'), null);
  assert.equal(topBar().hasAttribute('inert'), false);
  assert.ok(kindsTab('Home sellers'), 'the categories');
  assert.equal(chipsRow(), null);
  assert.ok(container.querySelector('a[href="/explore/cart"], a[aria-label*="art"]'), 'the cart beside the search');
  assert.equal(container.querySelector('[data-testid="explore-search-cancel"]'), null);
  assert.ok(globalThis.calls.some(([n]) => n === 'explore_feed'), 'the feed');
  passed('Before a search: the logo row, categories and cart, and the feed (explore_feed)');

  // Pick Home sellers, then tap the search box.
  await click(kindsTab('Home sellers'), 150);
  globalThis.calls.length = 0;
  input().focus();
  await sleep(150);
  assert.equal(topBar().getAttribute('aria-hidden'), 'true', 'the logo row is hidden');
  assert.equal(topBar().hasAttribute('inert'), true, 'and out of reach');
  assert.match(topBar().className, /\bh-0\b/, 'folded to no height');
  assert.equal(container.querySelector('[role="tablist"]'), null, 'the categories give way');
  assert.ok(container.querySelector('[data-testid="explore-search-cancel"]'), 'Cancel');
  assert.deepEqual([...chipsRow().querySelectorAll('button')].map(text), ['Filters · 1', 'Sort: Best match', 'Home sellers', 'Deal method', 'Location', 'Price']);
  assert.deepEqual(searchCalls().at(-1), {
    p_search: null, p_kind: 'home', p_sort: 'best', p_deal: null, p_country: null, p_currency: 'SGD', p_min: null, p_max: null, p_limit: 24, p_offset: 0,
  }, 'the category picked on Explore carries over');
  passed('Tapping the search box: the logo row folds away (hidden, out of reach), Cancel and the chips show at once, the category carries over');

  // Category straight from its chip: All, applied at once.
  await click(chip('kind'), 80);
  assert.equal(text(dialog().querySelector('h2')), 'Category');
  await click(inDialog('All'), 120);
  assert.equal(dialog(), null, 'a pick closes it');
  assert.equal(text(chip('kind')), 'All categories');
  assert.equal(searchCalls().at(-1).p_kind, null);
  passed('Category: a pick applies at once and closes the sheet');

  // Typing searches as you type; the heading and the count follow.
  await type('cake', 450);
  assert.equal(searchCalls().at(-1).p_search, 'cake');
  assert.match(text(container), /Results for “cake”/);
  assert.equal(text(container.querySelector('[data-testid="explore-search-count"]')), '5 listings');
  passed('Typing searches (explore_search), with "Results for …" and how many listings it found');

  // Sort from its chip.
  await click(chip('sort'), 80);
  assert.equal(text(dialog().querySelector('h2')), 'Sort by');
  assert.deepEqual([...dialog().querySelectorAll('[role="radio"]')].map(text), ['Best match', 'Recent', 'Price: high to low', 'Price: low to high']);
  assert.equal(inDialog('Show results'), undefined, 'no footer: a pick applies');
  await click(inDialog('Price: low to high'), 150);
  assert.equal(dialog(), null);
  assert.equal(searchCalls().at(-1).p_sort, 'price_asc');
  assert.equal(text(chip('sort')), 'Sort: Price: low to high');
  passed('Sort: Best match, Recent, Price high to low, low to high; a pick applies at once');

  // Every filter in one sheet: Delivery and up to S$40, counted before they apply.
  await click(chip('all'), 80);
  assert.equal(text(dialog().querySelector('h2')), 'Filters');
  assert.deepEqual([...dialog().querySelectorAll('h3')].map(text), ['Sort by', 'Category', 'Deal method', 'Location', 'Price']);
  await click(inDialog('Delivery'), 30);
  const max = dialog().querySelector('input[placeholder="Max"]');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(max, '40');
  max.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(400);
  assert.deepEqual(countCalls().at(-1), {
    p_search: 'cake', p_kind: null, p_sort: 'price_asc', p_deal: ['delivery'], p_country: null, p_currency: 'SGD', p_min: null, p_max: 40, p_limit: 1, p_offset: 0,
  }, 'counted with one row');
  const apply = () => dialog().querySelector('[data-testid="explore-filter-apply"]');
  assert.equal(text(apply()), 'Show 2 results');
  assert.equal(searchCalls().at(-1).p_deal, null, 'not applied until asked');
  await click(apply(), 150);
  assert.equal(dialog(), null);
  assert.equal(searchCalls().at(-1).p_deal?.join(), 'delivery');
  assert.equal(searchCalls().at(-1).p_max, 40);
  assert.equal(text(chip('all')), 'Filters · 2');
  assert.equal(text(chip('deal')), 'Delivery');
  assert.equal(text(chip('price')), 'Up to S$40');
  assert.equal(text(container.querySelector('[data-testid="explore-search-count"]')), '2 listings');
  passed('Filters: one sheet in order (sort, category, deal method, location, price), "Show 2 results" counted first, applied together');

  // Location: Malaysia switches the price to RM (the S$ amount goes).
  await click(chip('location'), 80);
  await click(inDialog('Malaysia'), 400);
  assert.equal(countCalls().at(-1).p_country, 'Malaysia');
  assert.equal(countCalls().at(-1).p_currency, 'MYR');
  assert.equal(countCalls().at(-1).p_max, null, 'an S$ amount is not an RM amount');
  await click(apply(), 150);
  assert.equal(searchCalls().at(-1).p_country, 'Malaysia');
  assert.equal(text(chip('location')), 'Malaysia');
  assert.equal(text(chip('price')), 'Price');
  passed('Location: one country at a time, and its currency for the price');

  // Nothing found with filters on: Clear filters (the sort stays).
  await click(chip('price'), 80);
  const min = dialog().querySelector('input[placeholder="Min"]');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(min, '500');
  min.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(400);
  assert.equal(text(apply()), 'No matches');
  assert.match(text(dialog()), /RM/, 'the price box is in RM');
  await click(apply(), 200);
  const noMatch = container.querySelector('[data-testid="explore-no-match"]');
  assert.match(text(noMatch), /No listings match these filters/);
  await click([...noMatch.querySelectorAll('button')].find((b) => text(b) === 'Clear filters'), 200);
  const cleared = searchCalls().at(-1);
  assert.deepEqual([cleared.p_deal, cleared.p_country, cleared.p_min, cleared.p_max, cleared.p_kind, cleared.p_sort, cleared.p_search], [null, null, null, null, null, 'price_asc', 'cake']);
  passed('Nothing found with filters on: "No matches" on the button, then Clear filters (the search and the sort stay)');

  // Cancel: back to Explore as it was (Home sellers still picked there), the feed again.
  globalThis.calls.length = 0;
  await click(container.querySelector('[data-testid="explore-search-cancel"]'), 400);
  assert.equal(topBar().getAttribute('aria-hidden'), null);
  assert.equal(topBar().hasAttribute('inert'), false);
  assert.equal(chipsRow(), null);
  assert.equal(input().value, '');
  assert.equal(kindsTab('Home sellers').getAttribute('aria-selected'), 'true', 'Explore’s own category, as it was');
  assert.ok(globalThis.calls.some(([n, a]) => n === 'explore_feed' && a.p_kind === 'home' && a.p_search == null));
  passed('Cancel: the logo row, the categories (as they were) and the feed come back; the search is cleared');
} finally {
  root?.unmount();
  await rm(tmp, { recursive: true, force: true });
  await rm(path.join(process.cwd(), '.explore-search-mode-bundle.mjs'), { force: true });
}
console.log(`\n${passes} explore search-mode checks passed`);
