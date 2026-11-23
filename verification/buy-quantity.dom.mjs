// How many (Alvin, 23 Nov 2026): buying from Explore or from a store's item screen lets the buyer
// choose how many; and a business's store page has the same item bar as a home seller's (Like,
// Chat, Add to cart, Buy now), except for a table's order, staff taking an order or the preview
// (one Add to order button, with the quantity too).
// The real Explore listing and store page, with Supabase as a stand-in.
// Run: node verification/buy-quantity.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: (navigation|HTMLCanvasElement|window\.scrollTo)/.test(error?.message)) console.error(error); });
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/store/kopi-corner', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'MutationObserver', 'NodeFilter', 'SVGElement', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.scrollTo = () => {};
win.innerWidth = 390;
win.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.ResizeObserver = win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
win.Element.prototype.animate = function animate() { return { cancel() {}, finished: Promise.resolve() }; };
Object.defineProperty(win.navigator, 'onLine', { get: () => true, configurable: true });
if (!globalThis.crypto?.randomUUID) globalThis.crypto = require('node:crypto').webcrypto;
console.warn = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

// ── Stand-ins ───────────────────────────────────────────────────────────────────────────
const STORES = {
  'kopi-corner': { id: 'tenant-1', name: 'Kopi Corner', slug: 'kopi-corner', currency: 'SGD', industry: 'fnb', is_available: true },
  'ann-bakes': { id: 'tenant-2', name: 'Ann Bakes', slug: 'ann-bakes', currency: 'SGD', industry: 'retail', is_available: true },
};
const SELLING = { collection: { enabled: true, area: 'Tampines' }, delivery: { enabled: false }, preorder: { enabled: false }, today: '2026-11-23' };
globalThis.currentSlug = 'kopi-corner';
globalThis.rpcCalls = [];
const chain = (answer) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
    maybeSingle() { return Promise.resolve(answer); }, single() { return Promise.resolve(answer); },
    then(resolve, reject) { return Promise.resolve(answer).then(resolve, reject); },
  };
  return q;
};
const LISTING = {
  product: { id: 'p-kaya', name: 'Kaya jar', price: 5, images: [], description: 'Pandan kaya, 250 g.', likes: 2, listed_at: '2026-11-20T00:00:00Z', variants: [] },
  shop: { id: 'tenant-2', name: 'Ann Bakes', slug: 'ann-bakes', logo_url: null, currency: 'SGD', type: 'individual', item_count: 3, since: '2026-08-01T00:00:00Z' },
  viewer: null, visible: true, more: [], selling: SELLING,
};
globalThis.supabaseFixture = {
  rpc(name, args) {
    globalThis.rpcCalls.push({ name, args });
    if (name === 'get_storefront_tenant') return chain({ data: STORES[args.p_slug] || null, error: null });
    if (name === 'get_shop_selling') return chain({ data: args.p_tenant_id === 'tenant-2' ? SELLING : null, error: null });
    if (name === 'open_table_session') return chain({ data: { id: 't5', name: 'Table 5' }, error: null });
    if (name === 'explore_item') return chain({ data: LISTING, error: null });
    if (name === 'listing_likes_for') return chain({ data: [{ product_id: 'p-kaya', likes: 2, liked: false, own: false }], error: null });
    return chain({ data: null, error: null });
  },
  // An item's stock, read by Explore's listing and Cart pages (lib/stockInfo.js).
  from(table) { return chain({ data: table === 'products' ? globalThis.stockRows || [] : null, error: null }); },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
globalThis.catalogFor = {
  'tenant-1': { products: [
    { id: 'kaya', name: 'Kaya toast set', price: 4.5, category_id: 'c1', is_available: true },
    // Counted stock (Track stock on): 2 left, and one sold out.
    { id: 'otah', name: 'Otah bun', price: 2.2, category_id: 'c1', is_available: true, track_inventory: true, stock_quantity: 2 },
    { id: 'kopi-c', name: 'Kopi C peng', price: 2, category_id: 'c1', is_available: true, track_inventory: true, stock_quantity: 0 },
  ], categories: [{ id: 'c1', name: 'Breakfast' }] },
  'tenant-2': { products: [
    { id: 'jar', name: 'Pandan kaya jar', price: 7, category_id: 'c2', is_available: true },
    { id: 'cookies', name: 'Butter cookies', price: 6, category_id: 'c2', is_available: true, track_inventory: true, stock_quantity: 3 },
    { id: 'tart', name: 'Pineapple tart tin', price: 18, category_id: 'c2', is_available: true, track_inventory: true, stock_quantity: 0 },
  ], categories: [{ id: 'c2', name: 'Jars' }] },
};
globalThis.tenantFixture = { tenant: null, tenantId: null, user: null, hasPermission: () => true, isOwner: false, noStore: false, subscription: null };
globalThis.appUserState = { appUser: null, clearAppUser() {} };

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-buy-quantity-'));
const sonner = 'const note = (m) => { (globalThis.toasts ||= []).push(String(m)); }; export const toast = Object.assign(note, { success: note, error: note, info: note, custom: note, message: note, dismiss() {} }); export const Toaster = () => null;';
const supabase = 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://project.example.invalid";';
const back = [
  "import { useState } from 'react';",
  'export const useBackToClose = () => {}; export const handOverBackStep = () => false; export const removeBackStep = () => {};',
  'export const handleAndroidBack = () => false; export const STILL_OPEN_CHECK_MS = 500;',
  'export function useOpenWithBack(open, defaultOpen, onOpenChange) { const [own, setOwn] = useState(!!defaultOpen); return [open ?? own, onOpenChange || setOwn]; }',
].join('\n');

// The store page (as order-placed.dom.mjs builds it; an item on Explore has a known like).
const storeStubs = {
  sonner, supabase, back,
  catalog: 'export const fetchStorefrontCatalog = async (_s, id) => globalThis.catalogFor[id];',
  assistant: 'export default function MenuAssistantWidget(props) { globalThis.assistant = props; return null; }',
  ratings: 'export const fetchRatingSummaries = async () => ({}); export const forgetRatingSummary = () => {}; export const isSignedIn = async () => !!globalThis.signedIn; export const myOrderRatings = async () => ({});',
  chat: 'export const useChatUser = () => ({ user: null });',
  likes: 'export const likeErrorMessage = () => ""; export const needsSignIn = () => false; export const setListingLike = async () => {}; export const toggleKnownLike = async (id) => { globalThis.liked = id; }; export const useLikesFor = () => {}; export const useKnownLike = (id) => (id ? { liked: false, likes: 2, own: false } : null);',
  push: 'export const offerPushAlerts = () => {};',
  device: 'export const rememberThisPhone = () => {};',
  ratingParts: 'export const OrderRateRow = () => null; export const RateOrderSheet = () => null; export const RatePrompt = () => null; export const RatingSheet = () => null; export const RatingPill = () => null;',
  native: 'export const isNativeApp = () => false; export const isCapacitorApp = () => false; export const appPlatform = () => ""; export const mapLinkProps = () => ({}); export const placeWithCountry = (a) => a; export const outsideLinkProps = () => ({}); export const openOutside = () => {}; export const sellsPlans = () => true;',
  authNav: 'export const rememberReturnPath = () => {};',
  loading: 'export default function LoadingShapes() { return null; } export const StoreShapes = () => null;',
};
const storeMock = { name: 'buy-quantity-store', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/(^|\/)supabaseClient(\.js)?$/, 'supabase');
  route(/lib\/storefrontCatalog$/, 'catalog');
  route(/storefront\/MenuAssistantWidget$/, 'assistant');
  route(/lib\/ratings$/, 'ratings');
  route(/lib\/chat$/, 'chat');
  route(/lib\/likes$/, 'likes');
  route(/lib\/pushOffer$/, 'push');
  route(/lib\/deviceKey$/, 'device');
  route(/ratings\/RatingParts$/, 'ratingParts');
  route(/lib\/nativeApp$/, 'native');
  route(/lib\/authNavigation$/, 'authNav');
  route(/lib\/useBackToClose$/, 'back');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', resolveDir: process.cwd(), contents: storeStubs[args.path] }));
  b.onLoad({ filter: /src\/lib\/LanguageContext\.jsx$/ }, async (args) => ({
    loader: 'jsx', resolveDir: path.dirname(args.path),
    contents: `${await readFile(args.path, 'utf8')}\nexport { DICTIONARY as __DICTIONARY };\n`,
  }));
} };
// The Explore listing (as app-text-explore.dom.mjs builds it: the real likes, chat and cart).
const listingStubs = {
  sonner, supabase, back,
  tenant: "import { createContext } from 'react'; export const useTenant = () => globalThis.tenantFixture; export default createContext(null);",
  user: 'export const useAppUser = () => globalThis.appUserState; export const cookieUtils = { clear() {}, get() { return null; }, set() {} };',
  db: 'export default { entities: {} };',
};
const listingMock = { name: 'buy-quantity-listing', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/useBackToClose$/, 'back');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/lib\/AppUserContext$/, 'user');
  route(/^@\/lib\/db$/, 'db');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', resolveDir: process.cwd(), contents: listingStubs[args.path] }));
} };
async function bundle(name, lines, plugin) {
  const entry = path.join(tmp, `${name}.jsx`);
  await writeFile(entry, lines.join('\n'));
  const outfile = path.join(tmp, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent', loader: { '.js': 'jsx' } });
  const local = path.join(process.cwd(), `.buy-quantity-${name}.mjs`);
  await copyFile(outfile, local);
  return { app: await import(pathToFileURL(local)), local };
}
const store = await bundle('store', [
  "export { default as Storefront } from '@/pages/Storefront';",
  "export { __DICTIONARY as DICTIONARY } from '@/lib/LanguageContext';",
], storeMock);
const listing = await bundle('listing', [
  "export { default as ListingPage } from '@/components/explore/ListingPage';",
  "export { default as ExploreCart } from '@/components/explore/ExploreCart';",
  "export { readShopCart } from '@/lib/shopCart';",
], listingMock);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const byTest = (id) => document.body.querySelector(`[data-testid="${id}"]`);
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const buttonMatching = (pattern) => [...document.body.querySelectorAll('button')].find((b) => pattern.test(text(b)) || pattern.test(b.getAttribute('aria-label') || ''));
const exactly = (words) => [...document.body.querySelectorAll('*')].find((el) => el.children.length === 0 && text(el) === words);
const mounts = [];
async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  mounts.push({ root, container });
  return container;
}
async function unmountAll() {
  for (const { root, container } of mounts.splice(0)) { await act(async () => root.unmount()); container.remove(); }
}
const storePage = (at) => mount(h(MemoryRouter, { initialEntries: [at] },
  h(Routes, null,
    h(Route, { path: '/store/:tenantSlug', element: h(store.app.Storefront) }),
    h(Route, { path: '/order/:tenantSlug/:tableId', element: h(store.app.Storefront) }))));
const cartOf = (key) => JSON.parse(localStorage.getItem(key) || '[]').map((l) => [l.product_id, l.quantity]);
const openItem = async (name) => { await click(exactly(name)); await wait(10); };
const quantityShown = () => text(byTest('item-quantity-value'));

try {
  // ── A business's store page: the same bar as a home seller's, and how many ──────────────
  {
    localStorage.clear();
    await storePage('/store/kopi-corner');
    await wait(40);
    await openItem('Kaya toast set');
    const bar = byTest('item-buyer-bar');
    assert.ok(bar, 'the item bar');
    assert.ok(byTest('item-like') && byTest('item-chat') && byTest('item-add-to-cart') && byTest('item-buy-now'), 'Like, Chat, Add to cart, Buy now');
    assert.ok(!buttonMatching(/^Add to order/), 'no single Add to order button on the public page');
    assert.equal(text(byTest('item-quantity')).replace(/\s/g, ''), 'Quantity1');
    assert.ok(byTest('item-quantity-less').disabled, 'not fewer than 1');
    assert.equal(text(byTest('item-buy-now-price')), 'S$4.50');
    await click(byTest('item-quantity-more'));
    await click(byTest('item-quantity-more'));
    assert.equal(quantityShown(), '3');
    assert.equal(text(byTest('item-buy-now-price')), 'S$13.50', 'Buy now shows the price of 3');
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.ok(!byTest('item-buyer-bar'), 'the item closed');
    assert.deepEqual(cartOf('sf_cart_kopi-corner'), [['kaya', 3]], '3 in the cart');
    assert.ok(buttonMatching(/^3 ?S\$13\.50$/), 'the cart button: 3, S$13.50');
    await openItem('Kaya toast set');
    assert.equal(quantityShown(), '1', 'opening the item again starts at 1');
    await click(byTest('item-quantity-more'));
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.deepEqual(cartOf('sf_cart_kopi-corner'), [['kaya', 5]], '2 more on the same line');
    // Buy now: at least that many, straight to checkout (a business on the website: no sign-in).
    await openItem('Kaya toast set');
    await click(byTest('item-quantity-more'));
    await click(byTest('item-buy-now'));
    await wait(20);
    assert.deepEqual(cartOf('sf_cart_kopi-corner'), [['kaya', 5]], 'Buy now 2 with 5 in the cart: still 5 (not added twice)');
    assert.ok(buttonMatching(/^Place order · S\$22\.50$/), 'the checkout, for the 5');
    await click(buttonMatching(/^✕$/));
    await openItem('Kaya toast set');
    for (let i = 0; i < 5; i++) await click(byTest('item-quantity-more'));
    assert.equal(text(byTest('item-buy-now-price')), 'S$27.00');
    await click(byTest('item-buy-now'));
    await wait(20);
    assert.deepEqual(cartOf('sf_cart_kopi-corner'), [['kaya', 6]], 'Buy now 6 with 5 in the cart: 6');
    assert.ok(buttonMatching(/^Place order · S\$27\.00$/));
    await click(buttonMatching(/^✕$/));
    // Like from the item screen (the shop's items on Explore can be liked and chatted about).
    globalThis.liked = null;
    globalThis.signedIn = true;
    await openItem('Kaya toast set');
    await click(byTest('item-like'));
    await wait(10);
    assert.equal(globalThis.liked, 'kaya', 'liked');
    globalThis.signedIn = false;
    await unmountAll();
    passed('A business’s store page: Like, Chat, Add to cart and Buy now on the item, as a home seller’s; how many (from 1, each time), the price for that many; Add to cart adds that many; Buy now puts at least that many in and opens the checkout');
  }

  // ── A home seller's store page: how many too ──────────────────────────────────────────
  {
    localStorage.clear();
    await storePage('/store/ann-bakes');
    await wait(40);
    await openItem('Pandan kaya jar');
    assert.ok(byTest('item-buyer-bar'), 'the bar');
    await click(byTest('item-quantity-more'));
    assert.equal(text(byTest('item-buy-now-price')), 'S$14.00');
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['jar', 2]]);
    await unmountAll();
    passed('A home seller’s store page: the item’s quantity goes into the cart');
  }

  // ── A table's order and staff taking one: one Add to order button, with how many ─────────
  {
    localStorage.clear();
    // A table's QR code: sellio.sg/order/<shop>/<table>.
    await storePage('/order/kopi-corner/t5');
    await wait(40);
    await openItem('Kaya toast set');
    assert.ok(!byTest('item-buyer-bar'), 'a table: no Like, Chat or Buy now');
    assert.ok(buttonMatching(/^Add to order · S\$4\.50$/));
    await click(byTest('item-quantity-more'));
    await click(buttonMatching(/^Add to order · S\$9\.00$/));
    await wait(10);
    assert.deepEqual(cartOf('sf_table_cart_kopi-corner_t5'), [['kaya', 2]], 'the table’s own cart');
    await unmountAll();
    localStorage.clear();
    // The store page reads ?staff= from the address itself.
    win.history.replaceState(null, '', '/store/kopi-corner?staff=true');
    await storePage('/store/kopi-corner?staff=true');
    await wait(40);
    await openItem('Kaya toast set');
    assert.ok(!byTest('item-buyer-bar'), 'staff taking an order: no bar');
    await click(byTest('item-quantity-more'));
    await click(byTest('item-quantity-more'));
    await click(buttonMatching(/^Add to order · S\$13\.50$/));
    await wait(10);
    assert.deepEqual(cartOf('sf_staff_cart_kopi-corner'), [['kaya', 3]]);
    await unmountAll();
    win.history.replaceState(null, '', '/store/kopi-corner');
    passed('A table’s order and staff taking one keep one Add to order button, which takes the quantity');
  }

  // ── The store page's words ──────────────────────────────────────────────────────────────
  {
    const d = store.app.DICTIONARY;
    for (const key of ['quantity', 'oneLess', 'oneMore']) {
      assert.ok(d.en[key], `English ${key}`);
      for (const code of ['zh', 'ms', 'id']) assert.ok(d[code][key] && d[code][key] !== d.en[key], `${code} has its own ${key}`);
    }
    passed('The quantity’s words on the store page in English, 中文, Malay and Indonesian');
  }

  // ── Explore: Add to cart and Buy now ask how many first ───────────────────────────────────
  {
    localStorage.clear();
    const Where = () => { const at = useLocation(); return h('p', { 'data-testid': 'where' }, `${at.pathname}${at.search}`); };
    await mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      h(MemoryRouter, { initialEntries: ['/listing/p-kaya'] },
        h(Routes, null,
          h(Route, { path: '/listing/:productId', element: h(listing.app.ListingPage) }),
          h(Route, { path: '/store/:slug', element: h(Where) })))));
    await wait(80);
    const sheet = () => document.body.querySelector('[role="dialog"][aria-labelledby="item-options-title"]');
    await click(buttonMatching(/^Add to cart$/));
    assert.ok(sheet(), 'Add to cart opens the sheet (the item has no options)');
    assert.match(text(sheet()), /Quantity/);
    await click(buttonMatching(/^One more$/));
    await click(buttonMatching(/^One more$/));
    await click(buttonMatching(/^Add to cart · S\$15\.00$/));
    await wait(10);
    assert.ok(!sheet(), 'closed');
    assert.deepEqual(listing.app.readShopCart('ann-bakes').map((l) => [l.product_id, l.quantity]), [['p-kaya', 3]]);
    assert.ok([...document.body.querySelectorAll('span')].some((s) => text(s) === 'Added to cart'), 'Added to cart');
    localStorage.clear();
    await click(buttonMatching(/^Buy now/));
    assert.ok(sheet(), 'Buy now opens it too');
    await click(buttonMatching(/^One more$/));
    await click(buttonMatching(/^Buy now · S\$10\.00$/));
    await wait(10);
    assert.equal(text(byTest('where')), '/store/ann-bakes?buy=1', 'to the shop’s checkout');
    assert.deepEqual(listing.app.readShopCart('ann-bakes').map((l) => [l.product_id, l.quantity]), [['p-kaya', 2]]);
    await unmountAll();
    passed('Explore: Add to cart and Buy now open the sheet to choose how many (items without options too); that many goes into the cart or to the checkout');
  }

  // ── Stock (Alvin, 23 Nov 2026): no more than the seller has, when they count it ──────────
  {
    localStorage.clear();
    await storePage('/store/ann-bakes');
    await wait(40);
    await openItem('Butter cookies');
    assert.equal(byTest('item-special-request').getAttribute('placeholder'), 'Anything the seller should know?', 'a buyer’s hint for any item');
    for (let i = 0; i < 5; i++) await click(byTest('item-quantity-more'));
    assert.equal(quantityShown(), '3', 'stops at the 3 the seller has');
    assert.ok(byTest('item-quantity-more').disabled, '+ off at the stock');
    assert.equal(text(byTest('item-quantity-stock')), 'That’s all the seller has left.');
    assert.equal(text(byTest('item-buy-now-price')), 'S$18.00');
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]]);
    // Again: Add to cart has no room left; the cart stays at 3, and the buyer is told why.
    await openItem('Butter cookies');
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]], 'no more than the stock, however it’s added');
    assert.equal(globalThis.toasts.at(-1), 'Everything the seller has left is in your cart.');
    // The cart's +: off at the stock; − works.
    await click(buttonMatching(/^3 ?S\$18\.00$/));
    await wait(10);
    assert.ok(byTest('store-cart-more').disabled, 'the cart’s + is off at the stock');
    await click(buttonMatching(/^−$/));
    await click(buttonMatching(/^−$/));
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 1]]);
    await click(buttonMatching(/^✕$/));
    // More asked than is left (1 in the cart, 3 asked): as many as fit, and told so.
    await openItem('Butter cookies');
    await click(byTest('item-quantity-more'));
    await click(byTest('item-quantity-more'));
    assert.equal(quantityShown(), '3');
    await click(byTest('item-add-to-cart'));
    await wait(10);
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]], '1 + 3 asked, 3 left: 3');
    assert.equal(globalThis.toasts.at(-1), 'That’s all the seller has left, counting what’s in your cart.');
    // The cart's + works below the stock and stops at it.
    await click(buttonMatching(/^3 ?S\$18\.00$/));
    await wait(10);
    await click(buttonMatching(/^−$/));
    assert.ok(!byTest('store-cart-more').disabled);
    await click(byTest('store-cart-more'));
    await click(byTest('store-cart-more'));
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]], 'the cart’s + stops at 3 too');
    await click(buttonMatching(/^✕$/));
    // The menu assistant changes amounts through the same cart: no more than the stock either.
    await act(async () => { globalThis.assistant.onUpdateCartQuantity('cookies-default', 9); });
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]], 'the assistant can’t go past the stock');
    await act(async () => { globalThis.assistant.onUpdateCartQuantity('cookies-default', 1); });
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 1]], 'fewer works');
    await act(async () => { globalThis.assistant.onAddToCart(globalThis.catalogFor['tenant-2'].products[1], null, null, 5); });
    assert.deepEqual(cartOf('sf_cart_ann-bakes'), [['cookies', 3]], 'the assistant’s add stops at the stock');
    // Sold out: no quantity, the bar says so.
    await openItem('Pineapple tart tin');
    assert.ok(byTest('item-sold-out'), 'sold out');
    assert.ok(!byTest('item-quantity'), 'no quantity for a sold-out item');
    await unmountAll();

    // A table's order: the kitchen's example, the same stock limit, and a sold-out item.
    localStorage.clear();
    await storePage('/order/kopi-corner/t5');
    await wait(40);
    await openItem('Kopi C peng');
    assert.equal(text(byTest('item-add-to-order')), 'Sold out');
    assert.ok(byTest('item-add-to-order').disabled, 'a sold-out item can’t be added to the table’s order');
    assert.ok(!byTest('item-quantity'));
    await click(buttonMatching(/^✕$/));
    await openItem('Otah bun');
    assert.equal(byTest('item-special-request').getAttribute('placeholder'), 'e.g. No onions, extra spicy...', 'a table keeps the kitchen’s example');
    for (let i = 0; i < 3; i++) await click(byTest('item-quantity-more'));
    assert.equal(quantityShown(), '2');
    await click(buttonMatching(/^Add to order · S\$4\.40$/));
    await wait(10);
    assert.deepEqual(cartOf('sf_table_cart_kopi-corner_t5'), [['otah', 2]]);
    await openItem('Otah bun');
    assert.equal(text(byTest('item-add-to-order')), 'All in your cart');
    assert.ok(byTest('item-add-to-order').disabled);
    assert.equal(text(byTest('item-quantity-stock')), 'Everything the seller has left is in your cart.');
    await unmountAll();

    const d = store.app.DICTIONARY;
    for (const key of ['specialRequestOptional', 'itemNoteHint', 'itemNoteFoodHint', 'stockAllLeft', 'stockLeftWithCart', 'stockAllInCart', 'allInCart']) {
      assert.ok(d.en[key], `English ${key}`);
      for (const code of ['zh', 'ms', 'id']) assert.ok(d[code][key] && d[code][key] !== d.en[key], `${code} has its own ${key}`);
    }
    passed('Store page: how many stops at the seller’s stock (item screen, the cart’s +, again later), sold-out items can’t be added, a buyer gets “Anything the seller should know?” and a table keeps the kitchen’s example, in four languages');
  }

  // ── Explore: the same limit, from the item's stock ───────────────────────────────────────
  {
    localStorage.clear();
    globalThis.stockRows = [{ id: 'p-kaya', track_inventory: true, stock_quantity: 2 }];
    const Where = () => { const at = useLocation(); return h('p', { 'data-testid': 'where' }, `${at.pathname}${at.search}`); };
    const listingApp = () => mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      h(MemoryRouter, { initialEntries: ['/listing/p-kaya'] },
        h(Routes, null,
          h(Route, { path: '/listing/:productId', element: h(listing.app.ListingPage) }),
          h(Route, { path: '/store/:slug', element: h(Where) })))));
    await listingApp();
    await wait(80);
    const sheet = () => document.body.querySelector('[role="dialog"][aria-labelledby="item-options-title"]');
    await click(buttonMatching(/^Add to cart$/));
    assert.equal(sheet().querySelector('#item-special-request').getAttribute('placeholder'), 'Anything the seller should know?');
    for (let i = 0; i < 4; i++) await click(buttonMatching(/^One more$/));
    assert.ok(byTest('item-options-more').disabled, '+ off at the 2 left');
    assert.equal(text(byTest('item-options-stock')), 'That’s all the seller has left.');
    await click(buttonMatching(/^Add to cart · S\$10\.00$/));
    await wait(10);
    assert.deepEqual(listing.app.readShopCart('ann-bakes').map((l) => [l.product_id, l.quantity]), [['p-kaya', 2]]);
    await click(buttonMatching(/^Add to cart$/));
    assert.equal(text(byTest('item-options-confirm')), 'All in your cart');
    assert.ok(byTest('item-options-confirm').disabled, 'nothing more to add');
    assert.equal(text(byTest('item-options-stock')), 'That’s all the seller has left, counting what’s in your cart.');
    await click(buttonMatching(/^Close$/));
    await wait(10);
    // Buy now fills its line up to the stock, and goes to the checkout.
    await click(buttonMatching(/^Buy now/));
    for (let i = 0; i < 3; i++) await click(buttonMatching(/^One more$/));
    await click(buttonMatching(/^Buy now · S\$10\.00$/));
    await wait(10);
    assert.equal(text(byTest('where')), '/store/ann-bakes?buy=1');
    assert.deepEqual(listing.app.readShopCart('ann-bakes').map((l) => [l.product_id, l.quantity]), [['p-kaya', 2]]);
    await unmountAll();

    // Explore's Cart page: + off at the stock; told when the seller has fewer than the cart holds.
    await mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      h(MemoryRouter, { initialEntries: ['/explore/cart'] }, h(listing.app.ExploreCart))));
    await wait(60);
    assert.ok(buttonMatching(/^One more Kaya jar$/).disabled, 'the Cart page’s + is off at the stock');
    assert.ok(!byTest('cart-line-stock'), 'no note while the cart is within the stock');
    await unmountAll();
    globalThis.stockRows = [{ id: 'p-kaya', track_inventory: true, stock_quantity: 1 }];
    await mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      h(MemoryRouter, { initialEntries: ['/explore/cart'] }, h(listing.app.ExploreCart))));
    await wait(60);
    assert.equal(text(byTest('cart-line-stock')), 'The seller has only 1 left.');
    await click(buttonMatching(/^One less Kaya jar$/));
    await wait(10);
    assert.deepEqual(listing.app.readShopCart('ann-bakes').map((l) => [l.product_id, l.quantity]), [['p-kaya', 1]], '− still works');
    assert.ok(!byTest('cart-line-stock'));
    await unmountAll();
    globalThis.stockRows = null;
    passed('Explore: the options sheet and the Cart page stop at the seller’s stock (Add to cart, Buy now, +), and say so; the hint is “Anything the seller should know?”');
  }

  console.log(`buy quantity: ${passes} passed`);
} finally {
  await unmountAll().catch(() => {});
  await rm(store.local, { force: true });
  await rm(listing.local, { force: true });
  await rm(tmp, { recursive: true, force: true });
}
process.exit(0);
