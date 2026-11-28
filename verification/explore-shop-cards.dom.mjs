// Shops on Sellio as cards, and past searches rolling through the search bar (Alvin, 28 Nov 2026,
// after Taobao: "Like cards etc and the searchbar with flipping of past searches"; he picked the
// carousel, and the search button searching the words showing):
//  - each shop a card in one row: its name, rating or item count, Home seller or Shop, a Visit
//    link to the shop, and its three newest listings with photos (explore_shops' picks), each
//    opening the listing at its price in the shop's currency; a "See shop" tile fills the gap of a
//    shop with fewer (a copy kept on the phone from before picks: See shop across the card);
//  - with nothing searched yet the bar reads "Search for an item or shop" and the button opens the
//    search; with past searches they roll through the empty bar, newest first, every 3 seconds
//    (waiting while the page is hidden; without the roll when the phone reduces motion), the
//    button searches the one showing, and a tap on the bar opens the search without searching it.
// Run: TZ=Asia/Singapore node verification/explore-shop-cards.dom.mjs /tmp/sellio-verification
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
// The page shown or hidden (another tab, the app in the background).
let pageHidden = false;
Object.defineProperty(win.document, 'hidden', { configurable: true, get: () => pageHidden });
// The phone's reduce-motion setting.
let reduce = false;
win.matchMedia = (query) => ({ matches: reduce && /prefers-reduced-motion:\s*reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {} });

// The search bar's 3-second timer, run by hand here (the others as usual).
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const flips = new Map();
let HINT_EVERY = 3000;
globalThis.setInterval = (fn, ms, ...rest) => {
  if (ms !== HINT_EVERY) return realSetInterval(fn, ms, ...rest);
  const id = { flip: flips.size + 1 };
  flips.set(id, fn);
  return id;
};
globalThis.clearInterval = (id) => { if (flips.has(id)) flips.delete(id); else realClearInterval(id); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');

const at = new Date().toISOString();
const LISTINGS = [
  { product_id: 'f1', product_name: 'Kaya toast set', price: 4.5, currency: 'SGD', shop_id: 's1', shop_name: 'Bake Habit', shop_type: 'individual' },
  { product_id: 'f2', product_name: 'Milk tea', price: 4.2, currency: 'SGD', shop_id: 's1', shop_name: 'Bake Habit', shop_type: 'individual' },
  { product_id: 'f3', product_name: 'Kuih lapis', price: 8, currency: 'MYR', shop_id: 's2', shop_name: 'Kopi Corner', shop_type: 'merchant' },
].map((l) => ({ ...l, listed_at: at, image_url: null, shop_slug: l.shop_id }));
const pick = (id, name, price) => ({ id, name, price, image_url: `https://img.example/${id}.jpg` });
const SHOPS = [
  { shop_id: 's1', shop_name: 'Bake Habit', shop_slug: 'bake-habit', shop_logo_url: null, shop_type: 'individual', item_count: 9, currency: 'SGD',
    picks: [pick('b3', 'Milk tea', 4.2), pick('b2', 'Kaya toast', 3.5), pick('b1', 'Lava cake', 9)] },
  { shop_id: 's2', shop_name: 'Kopi Corner', shop_slug: 'kopi-corner', shop_logo_url: null, shop_type: 'merchant', item_count: 4, currency: 'MYR',
    picks: [pick('k2', 'Roti bakar', 4.8), pick('k1', 'Half-boiled eggs', 3)] },
  { shop_id: 's3', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', shop_logo_url: null, shop_type: 'individual', item_count: 1, currency: 'IDR',
    picks: [pick('w1', 'Nasi uduk', 15000)] },
  { shop_id: 's4', shop_name: 'No Photos', shop_slug: 'no-photos', shop_logo_url: null, shop_type: 'individual', item_count: 2, currency: 'SGD', picks: [] },
  // A copy kept on the phone from before cards had picks.
  { shop_id: 's5', shop_name: 'Old Copy', shop_slug: 'old-copy', shop_logo_url: null, shop_type: 'merchant', item_count: 3 },
];
globalThis.calls = [];
globalThis.fakeClient = {
  rpc: async (name, args) => {
    globalThis.calls.push([name, args]);
    if (name === 'explore_shops') return { data: SHOPS, error: null };
    if (name === 'explore_feed') return { data: LISTINGS, error: null };
    if (name === 'explore_search') {
      const q = String(args.p_search || '').toLowerCase();
      const found = LISTINGS.filter((l) => !q || l.product_name.toLowerCase().includes(q));
      return { data: found.map((l) => ({ ...l, total_count: found.length })), error: null };
    }
    if (name === 'explore_suggest') return { data: { suggestion: null, popular: [] }, error: null };
    return { data: [], error: null };
  },
};
const mocks = {
  supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
  appUser: "export const useAppUser = () => ({ appUser: { id: 'u1', tenant_id: null } });",
  tabbar: 'export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};',
  chatCount: 'export default function ExploreChatCount() { return null; }',
  bell: 'export default function ShopBell() { return null; }',
  ratings: "export const useRatingSummaries = () => [{ s1: { rating: 4.8, rating_count: 11 } }];",
  ratingParts: "import React from 'react'; export const RatingPill = ({ summary }) => React.createElement('span', { 'data-testid': 'rating' }, '★' + summary.rating + ' (' + summary.rating_count + ')');",
  sell: 'export const useSell = () => ({ openSell() {} });',
  likes: `export const likeErrorMessage = () => ''; export const likesText = () => ''; export const needsSignIn = () => false;
    export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useKnownLike = () => null; export const useLikesFor = () => {};`,
};
const mock = { name: 'explore-shop-cards-mocks', setup(b) {
  const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
    [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell'], [/lib\/likes$/, 'likes']];
  for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-explore-shop-cards-'));
const outfile = path.join(tmp, 'explore.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as Explore } from '@/pages/Explore'; export { HINT_EVERY } from '@/components/explore/SearchHint';" },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.explore-shop-cards-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));
HINT_EVERY = mod.HINT_EVERY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const click = async (el, wait = 80) => { assert.ok(el, 'something to click'); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); await sleep(wait); };
const flip = async () => { for (const fn of [...flips.values()]) fn(); await sleep(40); };
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const RECENT_KEY = 'sellio:explore:recent:u1';

let where = '';
function Where() { where = useLocation().pathname; return null; }
let root;
let container;
const open = async () => {
  container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] },
    React.createElement(Where),
    React.createElement(Routes, null, React.createElement(Route, { path: '/explore', element: React.createElement(mod.Explore) }),
      React.createElement(Route, { path: '*', element: null }))));
  await sleep(300);
};
const close = async () => { root?.unmount(); root = null; container?.remove(); await sleep(20); };
const input = () => container.querySelector('input[type="search"]');
const button = () => container.querySelector('[data-testid="explore-search-button"]');
const hintText = () => container.querySelector('[data-testid="explore-search-hint-text"]');
const cancel = () => container.querySelector('[data-testid="explore-search-cancel"]');
const cards = () => [...container.querySelectorAll('[data-testid="shop-card"]')];
const card = (name) => cards().find((c) => text(c).includes(name));
const searchCalls = () => globalThis.calls.filter(([n]) => n === 'explore_search').map(([, a]) => a);

try {
  win.localStorage.removeItem(RECENT_KEY);
  await open();

  // The cards.
  assert.deepEqual(cards().map((c) => text(c.querySelector('a[tabindex="-1"]').querySelector('span span'))), ['Bake Habit', 'Kopi Corner', 'Warung Bu Sri', 'No Photos', 'Old Copy'], 'a card per shop, in explore_shops\' order');
  const rail = container.querySelector('[data-testid="explore-shops-rail"]');
  assert.equal(rail.tagName, 'UL');
  assert.match(rail.className, /\boverflow-x-auto\b/);
  assert.match(rail.className, /\bsnap-x\b/);
  assert.ok(cards().every((c) => c.parentElement === rail && c.tagName === 'LI' && /\bsnap-start\b/.test(c.className) && /w-\[86%\]/.test(c.className)), 'cards in one row that scrolls sideways, snapping a card at a time');
  assert.equal(text(container.querySelector('#explore-shops-heading')), 'Shops on Sellio');
  const bake = card('Bake Habit');
  const visit = bake.querySelector('[data-testid="shop-visit"]');
  assert.deepEqual([text(visit), visit.getAttribute('href'), visit.getAttribute('aria-label')], ['Visit', '/store/bake-habit', 'Visit Bake Habit']);
  assert.equal(bake.querySelector('a[tabindex="-1"]').getAttribute('href'), '/store/bake-habit', 'the logo and name open the shop too (Visit is the one to Tab to)');
  assert.equal(text(bake.querySelector('[data-testid="rating"]')), '★4.8 (11)', 'its rating');
  assert.match(text(bake), /9 items/);
  assert.equal(text(bake.querySelector('[data-testid="shop-kind"]')), 'Home seller');
  assert.equal(text(card('Kopi Corner').querySelector('[data-testid="shop-kind"]')), 'Shop');
  assert.equal(card('Kopi Corner').querySelector('[data-testid="rating"]'), null, 'no rating yet: just its item count');
  assert.match(text(card('Kopi Corner')), /4 items/);
  assert.match(text(card('Warung Bu Sri')), /1 item(?!s)/);
  assert.equal(card('Old Copy').querySelector('[data-testid="shop-visit"]').getAttribute('href'), '/store/old-copy');
  passed('Each shop is a card in one sideways row: its name, rating or item count, Home seller or Shop, and Visit (to the shop)');

  const picks = (c) => [...c.querySelectorAll('[data-testid="shop-pick"]')].map((a) => ({
    href: a.getAttribute('href'), name: text(a.querySelector('.sr-only')), price: text(a.lastElementChild), photo: a.querySelector('img')?.getAttribute('src') || null,
  }));
  assert.deepEqual(picks(bake), [
    { href: '/listing/b3', name: 'Milk tea', price: 'S$4.20', photo: 'https://img.example/b3.jpg' },
    { href: '/listing/b2', name: 'Kaya toast', price: 'S$3.50', photo: 'https://img.example/b2.jpg' },
    { href: '/listing/b1', name: 'Lava cake', price: 'S$9.00', photo: 'https://img.example/b1.jpg' },
  ]);
  assert.deepEqual(picks(card('Kopi Corner')).map((p) => p.price), ['RM4.80', 'RM3.00'], 'in the shop\'s currency');
  assert.deepEqual(picks(card('Warung Bu Sri')).map((p) => p.price), ['Rp15.000']);
  assert.equal(bake.querySelector('[data-testid="shop-see-shop"]'), null, 'three listings: no gap');
  passed('Its three newest listings with photos, newest first, each opening the listing, priced in the shop\'s currency (S$, RM, Rp)');

  const seeShop = (c) => c.querySelector('[data-testid="shop-see-shop"]');
  const tiles = [['Kopi Corner', '1', '4 items See shop'], ['Warung Bu Sri', '2', '1 item See shop'], ['No Photos', '3', '2 items See shop'], ['Old Copy', '3', '3 items See shop']];
  for (const [name, span, words] of tiles) {
    const tile = seeShop(card(name));
    assert.ok(tile, `${name}: a See shop tile`);
    assert.equal(tile.style.gridColumn, `span ${span} / span ${span}`, `${name}: across the ${span} column(s) left`);
    assert.equal(text(tile), words);
    assert.equal(tile.getAttribute('href'), card(name).querySelector('[data-testid="shop-visit"]').getAttribute('href'), 'it opens the shop');
    assert.equal(tile.getAttribute('tabindex'), '-1', 'out of the Tab order (Visit is there)');
  }
  assert.match(seeShop(card('No Photos')).firstElementChild.className, /aspect-\[3\/1\]/, 'no photos: a tile across the card, as tall as photos would be');
  assert.match(seeShop(card('Kopi Corner')).firstElementChild.className, /\bflex-1\b/, 'beside photos: as tall as they are');
  assert.equal(picks(card('Old Copy')).length, 0);
  passed('Fewer than three: a See shop tile fills the gap (a copy kept from before picks: See shop across the card)');

  await click(bake.querySelector('[data-testid="shop-pick"]'), 80);
  assert.equal(where, '/listing/b3', 'a listing opens');
  await close();
  await open();
  await click(card('Kopi Corner').querySelector('[data-testid="shop-visit"]'), 80);
  assert.equal(where, '/store/kopi-corner', 'Visit opens the shop');
  await close();
  passed('A listing opens its page; Visit opens the shop');

  // The search bar with nothing searched yet.
  await open();
  assert.equal(hintText(), null, 'no past searches: nothing rolls');
  assert.equal(input().getAttribute('placeholder'), 'Search for an item or shop');
  assert.equal(button().getAttribute('aria-label'), 'Search');
  assert.equal(flips.size, 0, 'no timer');
  globalThis.calls.length = 0;
  await click(button(), 200);
  assert.equal(win.document.activeElement, input(), 'the button opens the search, as a tap on the box does');
  assert.ok(cancel(), 'searching');
  assert.ok(searchCalls().every((a) => a.p_search == null), 'nothing searched');
  await click(cancel(), 200);
  await close();
  passed('Nothing searched yet: the bar reads "Search for an item or shop", and the button opens the search');

  // Past searches.
  win.localStorage.setItem(RECENT_KEY, JSON.stringify(['kaya toast', 'milk tea', 'kuih lapis']));
  await open();
  assert.equal(text(hintText()), 'kaya toast', 'the newest first');
  assert.equal(hintText().className.includes('sellio-hint-in'), false, 'there at once, no roll');
  assert.equal(container.querySelector('[data-testid="explore-search-hint"]').getAttribute('aria-hidden'), 'true', 'only for the eye');
  assert.equal(input().getAttribute('placeholder'), '', 'the box\'s own placeholder is blank meanwhile');
  assert.equal(button().getAttribute('aria-label'), 'Search “kaya toast”');
  assert.equal(flips.size, 1, 'one timer');
  await flip();
  assert.equal(text(hintText()), 'milk tea', 'the next one after 3 seconds');
  assert.match(hintText().className, /\bsellio-hint-in\b/, 'rolling up in');
  const leaving = container.querySelector('[data-testid="explore-search-hint"] .sellio-hint-out');
  assert.equal(text(leaving), 'kaya toast', 'as the last rolls away');
  assert.equal(button().getAttribute('aria-label'), 'Search “milk tea”');
  await flip();
  assert.equal(text(hintText()), 'kuih lapis');
  await flip();
  assert.equal(text(hintText()), 'kaya toast', 'and round again');
  pageHidden = true;
  await flip();
  await flip();
  assert.equal(text(hintText()), 'kaya toast', 'waits while the page is hidden');
  pageHidden = false;
  await flip();
  assert.equal(text(hintText()), 'milk tea');
  passed('Past searches roll through the empty bar, newest first, every 3 seconds (waiting while the page is hidden); the button says which it will search');

  globalThis.calls.length = 0;
  await click(button(), 300);
  assert.equal(input().value, 'milk tea', 'the button searched the words showing');
  assert.equal(searchCalls().at(-1)?.p_search, 'milk tea');
  assert.equal(text(container.querySelector('#explore-feed-heading')), 'Results for “milk tea”');
  assert.ok(cancel(), 'in the search, as if it had been typed');
  assert.equal(hintText(), null, 'nothing rolls while searching');
  assert.equal(flips.size, 0, 'the timer stopped');
  assert.notEqual(win.document.activeElement, input(), 'no keyboard: the results show');
  assert.deepEqual(JSON.parse(win.localStorage.getItem(RECENT_KEY)), ['milk tea', 'kaya toast', 'kuih lapis'], 'kept first among the past searches');
  passed('The search button searches the past search showing, as Taobao\'s does');

  await click(cancel(), 300);
  assert.equal(input().value, '');
  assert.equal(text(hintText()), 'milk tea', 'back on Explore: the newest (the one just searched) first');
  await flip();
  assert.equal(text(hintText()), 'kaya toast');
  globalThis.calls.length = 0;
  input().focus();
  await sleep(250);
  assert.ok(cancel(), 'a tap on the bar opens the search');
  assert.equal(input().value, '', 'with nothing in it');
  assert.ok(searchCalls().length >= 1 && searchCalls().every((a) => a.p_search == null), 'nothing searched');
  assert.equal(hintText(), null);
  assert.equal(input().getAttribute('placeholder'), 'Search for an item or shop');
  assert.ok(container.querySelector('[data-testid="explore-recent"]'), 'the past searches listed under it, as before');
  await click(cancel(), 300);
  assert.equal(text(hintText()), 'kaya toast', 'back from a search with nothing searched: on from where it was');
  passed('A tap on the bar opens the search with nothing searched, the past searches listed under it');

  reduce = true;
  await flip();
  assert.equal(text(hintText()), 'kuih lapis', 'the words still change');
  assert.equal(container.querySelector('[data-testid="explore-search-hint"] .sellio-hint-out'), null, 'without one rolling away');
  assert.equal(hintText().className.includes('sellio-hint-in'), false, 'or one rolling in');
  reduce = false;
  passed('With the phone set to reduce motion, the words change without the roll');
  await close();

  win.localStorage.setItem(RECENT_KEY, JSON.stringify(['only one']));
  await open();
  assert.equal(text(hintText()), 'only one');
  assert.equal(flips.size, 0, 'one past search: it stays, no timer');
  await close();
  passed('A single past search stays put');
} finally {
  await close();
  await rm(tmp, { recursive: true, force: true });
  await rm(path.join(process.cwd(), '.explore-shop-cards-bundle.mjs'), { force: true });
}
console.log(`\n${passes} explore shop-card and search-hint checks passed`);
