// "Order placed!" with next steps and tracking (UX state 10; Alvin, 15 Nov 2026): the check
// pops in with confetti (still for people who turn motion off), the order number is bigger than
// the heading, the order's status follows the shop every 5 seconds while the page is open (and
// at once when it comes back to the front) and stops once the order is done, the line under it
// says what to do next, the buyer's notes are shown, and Your orders uses the same words.
// The real store page, with Supabase as a stand-in.
// Run: node verification/order-placed.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/store/kopi-corner', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'NodeFilter', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
let reduceMotion = false;
win.matchMedia = (query) => ({ matches: /reduce/.test(query) ? reduceMotion : false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.scrollTo = () => {};
win.innerWidth = 390;
win.HTMLElement.prototype.scrollIntoView = () => {};
// The store page's banner measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver = win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = win.IntersectionObserver = win.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
// jsdom has no Web Animations: count what the confetti asks for.
const animations = [];
win.Element.prototype.animate = function animate(keyframes, options) { animations.push({ el: this, keyframes, options }); return { cancel() {}, finished: Promise.resolve() }; };
Object.defineProperty(win.navigator, 'onLine', { get: () => true, configurable: true });
if (!globalThis.crypto?.randomUUID) globalThis.crypto = require('node:crypto').webcrypto;
let visibility = 'visible';
Object.defineProperty(win.document, 'visibilityState', { get: () => visibility, configurable: true });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
console.warn = () => {};

// ── Stand-ins ───────────────────────────────────────────────────────────────────────────
const TENANT = { id: 'tenant-1', name: 'Kopi Corner', slug: 'kopi-corner', currency: 'SGD', industry: 'fnb', is_available: true };
globalThis.rpcCalls = [];
globalThis.orderStatus = 'pending'; // what the shop's side says now
const order = (over = {}) => ({
  id: 'order-1', order_number: 'A12', status: 'pending', type: 'takeaway', table_name: null, total_amount: 10.8, payment_status: 'unpaid',
  notes: 'Please pack the sauce separately.',
  items: [
    { name: 'Kaya toast set', price: 4.5, quantity: 2, variant: null, notes: 'Less sugar, extra crispy' },
    { name: 'Kopi C', price: 1.8, quantity: 1, variant: null, notes: null },
  ],
  created_date: '2026-11-15T03:30:00Z', ...over,
});
const chain = (answer) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
    maybeSingle() { return Promise.resolve(answer); }, single() { return Promise.resolve(answer); },
    then(resolve, reject) { return Promise.resolve(answer).then(resolve, reject); },
  };
  return q;
};
globalThis.supabaseFixture = {
  rpc(name, args) {
    globalThis.rpcCalls.push({ name, args });
    if (name === 'get_storefront_tenant') return chain({ data: TENANT, error: null });
    if (name === 'place_order_once') return chain({ data: order(), error: null });
    if (/^get_(storefront|shop)_orders(_v2)?$/.test(name)) {
      // As the database: the _v2 lookups give each order's note, the old ones don't.
      if (name.endsWith('_v2') && globalThis.v2Missing) return chain({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      const ids = args?.p_order_ids || [];
      const rows = [order({ status: globalThis.orderStatus }), order({ id: 'order-0', order_number: 'A09', status: 'completed', notes: null })]
        .filter((row) => ids.includes(row.id))
        .map((row) => (name.endsWith('_v2') ? row : (({ notes, ...rest }) => rest)(row)));
      return chain({ data: rows, error: null });
    }
    return chain({ data: null, error: null });
  },
  from() { return chain({ data: null, error: null }); },
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
};
const statusChecks = () => globalThis.rpcCalls.filter((c) => c.name === 'get_storefront_orders' && c.args?.p_order_ids?.length === 1);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-order-placed-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as Storefront } from '@/pages/Storefront';",
  "export { default as OrderTracker, orderStatusLine, useOrderStatus } from '@/components/storefront/OrderTracker';",
  "export { default as OrderPlacedCheck, launchConfetti } from '@/components/storefront/OrderPlacedCheck';",
  "export { __DICTIONARY as DICTIONARY } from '@/lib/LanguageContext';",
  "export { ShopOrderHistory } from '@/components/shop/ShopStorefront';",
].join('\n'));
const stubs = {
  sonner: 'const note = () => {}; export const toast = Object.assign(note, { success: note, error: note, info: note, custom: note, message: note, dismiss() {} }); export const Toaster = () => null;',
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://project.example.invalid";',
  catalog: 'export const fetchStorefrontCatalog = async () => ({ products: [{ id: "kaya", name: "Kaya toast set", price: 4.5, category_id: "c1", is_available: true }], categories: [{ id: "c1", name: "Breakfast" }] });',
  assistant: 'export default function MenuAssistantWidget() { return null; }',
  ratings: 'export const fetchRatingSummaries = async () => ({}); export const forgetRatingSummary = () => {}; export const isSignedIn = async () => false; export const myOrderRatings = async () => ({});',
  chat: 'export const useChatUser = () => ({ user: null });',
  likes: 'export const likeErrorMessage = () => ""; export const needsSignIn = () => false; export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useLikesFor = () => {}; export const useKnownLike = () => [false, () => {}];',
  push: 'export const offerPushAlerts = () => {};',
  device: 'export const rememberThisPhone = () => {};',
  ratingParts: 'export const OrderRateRow = () => null; export const RateOrderSheet = () => null; export const RatePrompt = () => null; export const RatingSheet = () => null; export const RatingPill = () => null;',
  native: 'export const isNativeApp = () => false; export const isCapacitorApp = () => false; export const appPlatform = () => ""; export const mapLinkProps = () => ({}); export const placeWithCountry = (a) => a; export const outsideLinkProps = () => ({}); export const openOutside = () => {}; export const sellsPlans = () => true;',
  authNav: 'export const rememberReturnPath = () => {};',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
  loading: 'export default function LoadingShapes() { return null; } export const StoreShapes = () => null;',
};
const mock = { name: 'order-placed-fixtures', setup(b) {
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
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
  // The store page's words, as they are (the test reads them).
  b.onLoad({ filter: /src\/lib\/LanguageContext\.jsx$/ }, async (args) => ({
    loader: 'jsx', resolveDir: path.dirname(args.path),
    contents: `${await readFile(args.path, 'utf8')}\nexport { DICTIONARY as __DICTIONARY };\n`,
  }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.order-placed.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const byTest = (id) => document.body.querySelector(`[data-testid="${id}"]`);
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const buttonMatching = (pattern) => [...document.body.querySelectorAll('button')].find((b) => pattern.test(text(b)) || pattern.test(b.getAttribute('aria-label') || ''));
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
const en = (key) => app.DICTIONARY.en[key] ?? key;

try {
  // ── The words for each status ────────────────────────────────────────────────────────
  {
    const line = (status, kind, extra = {}) => app.orderStatusLine(status, { kind, shopName: 'Kopi Corner', tableName: 'Table 5', orderNumber: 'A12', ...extra }, en);
    assert.equal(line('pending', 'counter'), 'Waiting for Kopi Corner to accept your order.');
    assert.equal(line('pending', 'counter', { shopName: '' }), 'Waiting for the shop to accept your order.');
    assert.equal(line('confirmed', 'table'), 'Kopi Corner has accepted your order.');
    assert.equal(line('preparing', 'table'), 'Your order is being prepared.');
    assert.equal(line('preparing', 'delivery', { packing: true }), 'Your order is being packed.');
    assert.equal(line('ready', 'table'), 'Ready! Staff will bring it to Table 5.');
    assert.equal(line('ready', 'counter'), 'Ready! Collect it at the counter with order #A12.');
    assert.equal(line('served', 'table'), 'Served. Enjoy your meal!');
    assert.equal(line('ready', 'collection'), 'Ready for collection.');
    assert.equal(line('ready', 'delivery'), 'Out for delivery.');
    assert.equal(line('completed', 'collection'), 'Collected. Thank you!');
    assert.equal(line('completed', 'delivery'), 'Delivered. Thank you!');
    assert.equal(line('completed', 'counter'), 'Done. Thank you!');
    assert.equal(line('cancelled', 'counter'), 'This order was cancelled. Please check with the shop.');
    for (const code of ['zh', 'ms', 'id']) {
      for (const key of ['orderStatus', 'statusWaiting', 'statusReadyCounter', 'yourOrderNumber', 'itemNote', 'yourNote', 'findLater', 'yourOrders']) {
        assert.ok(app.DICTIONARY[code][key] && app.DICTIONARY[code][key] !== app.DICTIONARY.en[key], `${code} has its own ${key}`);
      }
      assert.ok(app.DICTIONARY[code].findLater.includes('{icon}'), `${code}: the clock goes in the sentence`);
    }
    passed('What the buyer reads for each status, by how the order is collected; in all four languages');
  }

  // ── The tracker follows the shop, and stops when it's done ──────────────────────────────
  {
    globalThis.rpcCalls = [];
    globalThis.orderStatus = 'pending';
    await mount(h(app.OrderTracker, { tenantId: 'tenant-1', order: order(), kind: 'counter', shopName: 'Kopi Corner', t: en, primaryColor: '#4f46e5', every: 25 }));
    assert.equal(byTest('order-tracker').getAttribute('data-status'), 'pending');
    assert.equal(document.body.querySelector('[aria-current="step"]')?.textContent, 'Sent');
    assert.match(text(byTest('order-tracker')), /This updates by itself while this page is open\./);
    globalThis.orderStatus = 'preparing';
    await wait(60);
    assert.equal(byTest('order-tracker').getAttribute('data-status'), 'preparing');
    assert.equal(document.body.querySelector('[aria-current="step"]')?.textContent, 'Preparing');
    assert.deepEqual(statusChecks().at(-1).args, { p_tenant_id: 'tenant-1', p_order_ids: ['order-1'] });
    // In the background: no checks; back on screen: one at once.
    visibility = 'hidden';
    globalThis.orderStatus = 'ready';
    const before = statusChecks().length;
    await wait(80);
    assert.equal(statusChecks().length, before, 'nothing while the page is in the background');
    visibility = 'visible';
    await act(async () => { document.dispatchEvent(new win.Event('visibilitychange')); });
    await wait(5);
    assert.equal(byTest('order-tracker').getAttribute('data-status'), 'ready');
    assert.equal(text(byTest('order-tracker-line')), 'Ready! Collect it at the counter with order #A12.');
    globalThis.orderStatus = 'completed';
    await wait(60);
    assert.equal(byTest('order-tracker').getAttribute('data-status'), 'completed');
    assert.doesNotMatch(text(byTest('order-tracker')), /updates by itself/, 'done: no more updates promised');
    const done = statusChecks().length;
    await wait(100);
    assert.equal(statusChecks().length, done, 'done: no more checks');
    await unmountAll();
    // Cancelled: no steps, the reason in red.
    globalThis.orderStatus = 'cancelled';
    await mount(h(app.OrderTracker, { tenantId: 'tenant-1', order: order({ status: 'cancelled' }), kind: 'counter', t: en, primaryColor: '#4f46e5', every: 25 }));
    assert.equal(document.body.querySelector('ol'), null);
    assert.equal(text(byTest('order-tracker-line')), 'This order was cancelled. Please check with the shop.');
    await unmountAll();
    // A home shop's order: its own lookup.
    globalThis.rpcCalls = [];
    globalThis.orderStatus = 'confirmed';
    await mount(h(app.OrderTracker, { tenantId: 'tenant-1', order: order(), homeShop: true, kind: 'delivery', packing: true, t: en, primaryColor: '#4f46e5', every: 25 }));
    await wait(60);
    assert.ok(globalThis.rpcCalls.some((c) => c.name === 'get_shop_orders'));
    assert.ok(!globalThis.rpcCalls.some((c) => c.name === 'get_storefront_orders'));
    assert.equal(document.body.querySelectorAll('ol li')[2].textContent, 'Packing');
    await unmountAll();
    passed('The tracker follows the shop, skips the background, checks on coming back, stops when done; home shops too');
  }

  // ── The check and its confetti ───────────────────────────────────────────────────────
  {
    animations.length = 0;
    await mount(h(app.OrderPlacedCheck));
    const pieces = document.body.querySelectorAll('[data-confetti]');
    assert.equal(pieces.length, 36, 'a burst of confetti');
    assert.equal(animations.length, 36);
    assert.ok(animations.every((a) => a.options.delay >= 360 && a.options.duration >= 1500), 'after the check pops, for about two seconds');
    await wait(2900);
    assert.equal(document.body.querySelectorAll('[data-confetti]').length, 0, 'and gone after');
    await unmountAll();
    reduceMotion = true;
    animations.length = 0;
    await mount(h(app.OrderPlacedCheck));
    assert.equal(document.body.querySelectorAll('[data-confetti]').length, 0, 'motion turned off: no confetti');
    assert.ok(byTest('order-placed-check'), 'the check is still there');
    reduceMotion = false;
    await unmountAll();
    passed('The check pops in with a burst of confetti that clears itself; none for people who turn motion off');
  }

  // ── On the real store page ───────────────────────────────────────────────────────────
  {
    sessionStorage.clear();
    localStorage.clear();
    globalThis.rpcCalls = [];
    globalThis.orderStatus = 'pending';
    localStorage.setItem('sf_cart_kopi-corner', JSON.stringify([
      { key: 'kaya-default', product_id: 'kaya', name: 'Kaya toast set', price: 4.5, quantity: 2, variant: null, notes: 'Less sugar, extra crispy' },
      { key: 'kopi-default', product_id: 'kopi', name: 'Kopi C', price: 1.8, quantity: 1, variant: null, notes: null },
    ]));
    await mount(h(MemoryRouter, { initialEntries: ['/store/kopi-corner'] },
      h(Routes, null, h(Route, { path: '/store/:tenantSlug', element: h(app.Storefront) }))));
    await wait(30);
    await click(buttonMatching(/^3 ?S\$10\.80$/));
    await click(buttonMatching(/^Proceed to checkout$/));
    await click(buttonMatching(/^Place order · S\$10\.80$/));
    await wait(30);
    assert.ok(byTest('order-placed-check'), 'the check');
    const heading = [...document.body.querySelectorAll('p')].find((p) => text(p) === 'Order placed!');
    const number = byTest('placed-order-number');
    assert.match(text(number), /^Your order number ?#A12$/);
    const numberSize = parseFloat([...number.querySelectorAll('p')].find((p) => text(p) === '#A12').style.fontSize);
    assert.ok(numberSize > parseFloat(heading.style.fontSize), `the number (${numberSize}px) is bigger than "Order placed!" (${heading.style.fontSize})`);
    assert.equal(text(byTest('order-tracker-line')), 'Waiting for Kopi Corner to accept your order.');
    assert.equal(text(byTest('item-note')), 'Note: Less sugar, extra crispy', "the item's note");
    assert.deepEqual([...byTest('order-note').querySelectorAll('p')].map(text), ['Your note', 'Please pack the sauce separately.'], "the order's note");
    assert.match(text(byTest('find-order-later')), /^Find this order again any time: tap at the top of the menu\.$/);
    // Every 5 seconds: the shop accepts it.
    globalThis.orderStatus = 'confirmed';
    await wait(5200);
    assert.equal(text(byTest('order-tracker-line')), 'Kopi Corner has accepted your order.');
    await click(buttonMatching(/^Back to menu$/));
    assert.equal(byTest('order-tracker'), null);
    passed('On the store page: the check, the number bigger than the heading, the status every 5 seconds, the notes, where to find it again');

    // Your orders: the same words, and the item notes.
    localStorage.setItem('sf_session_orders_kopi-corner_notab', JSON.stringify(['order-1', 'order-0']));
    globalThis.orderStatus = 'preparing';
    await click(buttonMatching(/^Your orders$/));
    await wait(30);
    const statuses = [...document.body.querySelectorAll('[data-testid="history-status"]')].map((s) => text(s));
    assert.deepEqual(statuses, ['Preparing', 'Done'], 'not the database’s own words');
    assert.ok([...document.body.querySelectorAll('p')].some((p) => text(p) === 'Your orders'), 'titled Your orders');
    assert.equal(text(document.body.querySelector('[data-testid="history-item-note"]')), 'Note: Less sugar, extra crispy');
    assert.ok(globalThis.rpcCalls.some((c) => c.name === 'get_storefront_orders_v2' && c.args.p_order_ids.length === 2), 'Your orders asks the lookup with notes');
    const orderNotes = [...document.body.querySelectorAll('[data-testid="history-order-note"]')];
    assert.equal(orderNotes.length, 1, 'only the order with a note shows one');
    assert.deepEqual([...orderNotes[0].querySelectorAll('p')].map(text), ['Your note', 'Please pack the sauce separately.'], "the whole order's note");
    passed('Your orders: titled so, the same status words, what was asked for each item, and the note for the whole order');

    // Without the lookup with notes (an older database): the orders still show, without the note.
    await click(buttonMatching(/^✕$/));
    globalThis.v2Missing = true;
    globalThis.rpcCalls = [];
    await click(buttonMatching(/^Your orders$/));
    await wait(30);
    assert.ok(globalThis.rpcCalls.some((c) => c.name === 'get_storefront_orders' && c.args.p_order_ids.length === 2), 'falls back to the old lookup');
    assert.deepEqual([...document.body.querySelectorAll('[data-testid="history-status"]')].map((s) => text(s)), ['Preparing', 'Done']);
    assert.equal(document.body.querySelector('[data-testid="history-order-note"]'), null);
    globalThis.v2Missing = false;
    passed('Your orders: if the lookup with notes fails, the old lookup still lists the orders');
  }

  // ── A home shop's Your orders: the whole order's note too, in the buyer's language ────────
  {
    const shopOrder = (over = {}) => ({ id: 'shop-1', order_number: 'S01', status: 'confirmed', payment_status: 'unpaid', total_amount: 12, created_date: '2026-11-15T03:30:00Z',
      fulfilment: { method: 'collection', area: 'Woodlands' }, items: [{ name: 'Brownies', price: 6, quantity: 2, notes: null }], notes: 'Leave at the guardhouse please', ...over });
    const words = { en: 'Your note', zh: '您的备注', ms: 'Nota anda', id: 'Catatan Anda' };
    for (const [lang, label] of Object.entries(words)) {
      await mount(h(app.ShopOrderHistory, { orders: [shopOrder(), shopOrder({ id: 'shop-2', order_number: 'S02', notes: null })], currency: 'SGD', lang, food: true, primaryColor: '#4f46e5' }));
      const notes = [...document.body.querySelectorAll('[data-testid="shop-history-order-note"]')];
      assert.equal(notes.length, 1, `${lang}: only the order with a note`);
      assert.deepEqual([...notes[0].querySelectorAll('p')].map(text), [label, 'Leave at the guardhouse please'], lang);
      await unmountAll();
    }
    passed("A home shop's Your orders shows the whole order's note, in all four languages");
  }

  console.log(`${passes} order-placed checks passed`);
} finally {
  await unmountAll().catch(() => {});
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
