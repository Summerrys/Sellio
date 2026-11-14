// No internet (UX states, 4; Alvin, 9 Nov 2026): keep what was loaded on screen and say what
// still works. The last orders and listings, and the app's own records, are kept on the phone
// for the next time the app opens offline (lib/offlineStore.js, lib/offlineQueries.js,
// components/ui-custom/OfflineKeeper.jsx); every page shows "You're offline. Reconnecting…"
// (ConnectionStatus); Orders and Explore say when their list is from (OfflineNote); pages
// refresh themselves when the connection comes back (AppRefreshProvider); copies go when the
// person signs out.
// Run: node verification/offline-states.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Orders', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
win.ResizeObserver = win.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
win.scrollTo = () => {};
let online = true;
Object.defineProperty(win.navigator, 'onLine', { get: () => online, configurable: true });
const setOnline = (value) => { online = value; win.dispatchEvent(new win.Event(value ? 'online' : 'offline')); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider, useQuery } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
const quiet = { warn: console.warn, info: console.info };
console.warn = () => {};
console.info = () => {};

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
globalThis.toasts = [];
globalThis.appUserFixture = { id: 'user-1', email: 'owner@kopi.example' };
globalThis.tenantFixture = {
  tenantId: 'tenant-1', tenant: { id: 'tenant-1', name: 'Kopi Corner', industry: 'fnb', seller_type: 'business', settings: { currency: 'SGD' } },
  hasPermission: () => true, subscription: null, canUseFeature: () => true,
};
globalThis.updates = [];
globalThis.ordersAnswer = () => ({ data: [], error: null });
globalThis.feedAnswer = () => ({ data: [], error: null });
globalThis.shopsAnswer = () => ({ data: [], error: null });
const NO_CONNECTION = { message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch', hint: '', code: '' };
const query = (answer, table) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
    update(values) { globalThis.updates.push({ table, values }); return q; },
    maybeSingle() { return Promise.resolve(answer()); },
    then(resolve, reject) { return Promise.resolve(answer()).then(resolve, reject); },
  };
  return q;
};
globalThis.supabaseFixture = {
  from: (table) => query(table === 'orders' ? () => globalThis.ordersAnswer() : () => ({ data: null, error: null }), table),
  rpc: (name, args) => query(() => (name === 'explore_feed' ? globalThis.feedAnswer(args) : name === 'explore_shops' ? globalThis.shopsAnswer() : { data: [], error: null })),
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-offline-states-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * from '@/lib/offlineStore';",
  "export * from '@/lib/offlineQueries';",
  "export { default as OfflineKeeper } from '@/components/ui-custom/OfflineKeeper';",
  "export { default as ConnectionStatus } from '@/components/ui-custom/ConnectionStatus';",
  "export { default as OfflineNote, listNoteWords } from '@/components/ui-custom/OfflineNote';",
  "export { default as AppRefreshProvider } from '@/components/ui-custom/AppRefreshProvider';",
  "export { useAppRefreshHandler } from '@/lib/AppRefreshContext';",
  "export { default as OrdersEmpty, ordersEmptyKind } from '@/components/orders/OrdersEmpty';",
  "export { default as Orders } from '@/pages/Orders';",
  "export { default as Explore } from '@/pages/Explore';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), custom: note("custom"), dismiss() {} });',
    'export const Toaster = () => null;',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://x.invalid";',
  appUser: 'export const useAppUser = () => ({ appUser: globalThis.appUserFixture });',
  tenant: 'export const useTenant = () => globalThis.tenantFixture;',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  printer: 'export const loadPrinterConfig = async () => null; export const buildOrderReceipt = () => ""; export const buildOrderChit = () => ""; export const buildTableReceipt = () => ""; export const sendViaBluetooth = async () => {}; export const sendViaEpsonEPos = async () => {};',
  tableBill: 'export const loadTableBillForOrder = async () => null; export const paymentText = () => ""; export const tableReceiptHtml = () => "";',
  alerts: 'const alerts = { on: false, setOn() {}, every: 60, setEvery() {}, ring() {}, seen() {} }; export const useOrderAlerts = () => alerts; export const REMIND_EVERY = [30, 60];',
  nothing: 'export default function Nothing() { return null; } export const ShopMethodBadge = () => null; export const SkeletonList = () => null; export const RatingPill = () => null; export const markExploreHome = () => {};',
  loading: 'export default function LoadingShapes({ label }) { return globalThis.__h("div", { "data-testid": "loading" }, label); } export const StoreShapes = () => null;',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getOrdersSteps = () => [];',
  appFiles: 'export const inAppFiles = () => false; export const saveFileInApp = () => {};',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false; export const stepToFirstEntry = async () => {};',
  native: 'export const isNativeApp = () => false; export const isCapacitorApp = () => false; export const isBase44Shell = () => false; export const appPlatform = () => "web";',
  pull: 'export default function PullToRefresh({ children }) { return children; }',
  updates: 'export const fetchPublishedAppVersion = async () => null; export const getAppAssetVersion = () => null; export const getAppReloadUrl = (u) => u; export const isNewAppVersion = () => false;',
  likes: 'export const likeErrorMessage = () => ""; export const likesText = () => ""; export const needsSignIn = () => false; export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useKnownLike = () => null; export const useLikesFor = () => {};',
  ratings: 'export const useRatingSummaries = () => [{}];',
  sell: 'export const useSell = () => ({ openSell() {} });',
  meta: 'export const applyPageMeta = () => () => {}; export const SITE = "https://sellio.sg";',
  authNav: 'export const rememberReturnPath = () => {};',
};
const mock = { name: 'offline-states-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/AppUserContext$/, 'appUser');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/lib\/printerUtils$/, 'printer');
  route(/lib\/tableBill$/, 'tableBill');
  route(/lib\/useOrderAlerts$/, 'alerts');
  route(/orders\/(TableCallAlerts|EditOrderModal|ChitPreviewSheet)$|tour\/(TourGuide|DummyOrderCard)$|shop\/ShopOrderInfo$|ui-custom\/AppLoader$|explore\/(ExploreTabBar|ShopBell|CartButton)$|ratings\/RatingParts$/, 'nothing');
  route(/ExploreChatCount$/, 'nothing');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/lib\/useBackToClose$/, 'back');
  route(/ui-custom\/PullToRefresh$/, 'pull');
  route(/lib\/appUpdates$/, 'updates');
  route(/lib\/likes$/, 'likes');
  route(/lib\/ratings$/, 'ratings');
  route(/lib\/sell$/, 'sell');
  route(/lib\/pageMeta$/, 'meta');
  route(/lib\/authNavigation$/, 'authNav');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.offline-states.mjs');
await copyFile(outfile, local);
globalThis.__h = h;
const app = await import(pathToFileURL(local));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const mount = async (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return { container, render: (next) => act(async () => { root.render(next); }), close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
const text = (node) => {
  const parts = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push(c.nodeValue); else { parts.push(' '); walk(c); parts.push(' '); } } };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const button = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const SESSION_KEY = 'sb-gzktuteedbtnaxfdylyu-auth-token';
const at = (h24, m) => { const d = new Date(); d.setHours(h24, m, 0, 0); return d.getTime(); };

try {
  // ── 1. Copies on the phone: one person's, kept small, gone when they sign out ─────────
  {
    localStorage.clear();
    assert.equal(app.saveSnapshot('orders:tenant-1', { orders: [1, 2] }, 'user-1', 1000), true);
    assert.deepEqual(app.loadSnapshot('orders:tenant-1', 'user-1'), { data: { orders: [1, 2] }, savedAt: 1000 });
    assert.equal(app.loadSnapshot('orders:tenant-1', 'user-2'), null, 'someone else signed in can’t read them');
    assert.equal(app.loadSnapshot('orders:tenant-1'), null);
    assert.equal(app.saveSnapshot('explore:feed', [{ product_id: 'p1' }]), true, 'what anyone may see');
    assert.equal(app.saveSnapshot('too-big', 'x'.repeat(70000), 'user-1'), false, 'a copy too large for the phone isn’t kept');
    assert.equal(app.loadSnapshot('too-big', 'user-1'), null);
    assert.equal(app.saveSnapshot('orders:tenant-2', 'x'.repeat(300000), 'user-1'), true, 'orders have a larger ceiling');
    assert.equal(app.saveSnapshot('orders:tenant-2', 'x'.repeat(410000), 'user-1'), false);
    assert.equal(app.loadSnapshot('orders:tenant-2', 'user-1'), null, 'and an older copy goes rather than pass for the current list');
    assert.ok(app.MAX_CHARS.orders + app.MAX_CHARS.products + app.MAX_CHARS.feed + 8 * app.MAX_CHARS.other < 1500000, 'all together stay well within the phone’s storage');
    app.saveSnapshot('orders:tenant-9', { orders: [] }, 'user-2');
    app.pruneSnapshots('user-1');
    assert.ok(app.loadSnapshot('orders:tenant-1', 'user-1'), 'the person signed in keeps theirs');
    assert.equal(app.loadSnapshot('orders:tenant-9', 'user-2'), null, 'others’ go');
    assert.ok(app.loadSnapshot('explore:feed'), 'what anyone may see stays');
    app.pruneSnapshots(null);
    assert.equal(app.loadSnapshot('orders:tenant-1', 'user-1'), null, 'signed out: every personal copy goes');
    assert.ok(app.loadSnapshot('explore:feed'));
    passed('Copies on the phone belong to the person signed in; too-large ones aren’t kept; signing out removes them');

    // Written at most every 2 seconds per kind; at once when the phone goes offline.
    localStorage.clear();
    app.keepSnapshot('orders:tenant-1', { orders: ['a'] }, 'user-1');
    app.keepSnapshot('orders:tenant-1', { orders: ['a', 'b'] }, 'user-1');
    assert.equal(app.loadSnapshot('orders:tenant-1', 'user-1'), null, 'not written on every change');
    await act(async () => setOnline(false));
    assert.deepEqual(app.loadSnapshot('orders:tenant-1', 'user-1')?.data, { orders: ['a', 'b'] }, 'going offline writes the latest at once');
    await act(async () => setOnline(true));
    app.keepSnapshot('orders:tenant-1', { orders: ['c'] }, 'user-1');
    await wait(2100);
    assert.deepEqual(app.loadSnapshot('orders:tenant-1', 'user-1')?.data, { orders: ['c'] }, 'or 2 seconds after the last change');
    passed('Copies are written 2 seconds after the last change, or at once when the connection goes');

    const now = at(16, 0);
    assert.equal(app.loadedAtText(at(15, 42), now), '3:42 pm');
    assert.equal(app.loadedAtText(at(0, 5), now), '12:05 am');
    assert.equal(app.loadedAtText(at(12, 0), now), '12:00 pm');
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 7);
    assert.match(app.loadedAtText(yesterday.getTime(), now), /^\d{1,2} [A-Z][a-z]{2}, 9:07 am$/, 'another day: the date too');
    assert.deepEqual(app.listNoteWords({ online: false, what: 'orders', at: at(15, 42), offlineText: 'O', failedText: 'F' }, now),
      { title: 'You’re offline. Showing orders from 3:42 pm.', text: 'O' });
    assert.deepEqual(app.listNoteWords({ online: false, what: 'orders', at: at(15, 42), latest: 100, offlineText: 'O', failedText: 'F' }, now),
      { title: 'You’re offline. Showing your latest 100 orders from 3:42 pm.', text: 'O' });
    assert.deepEqual(app.listNoteWords({ online: true, what: 'listings', at: at(15, 42), offlineText: 'O', failedText: 'F' }, now),
      { title: 'Couldn’t update the listings. Showing listings from 3:42 pm.', text: 'F' });
    passed('The words: when the list is from ("3:42 pm"; another day with its date), offline or not updated');
  }

  // ── 2. The app's own records: kept on each load, back when the app opens offline ──────
  {
    localStorage.clear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let owner = 'user-1';
    const stop = app.keepQueriesOffline(client, () => owner);
    const tenantRow = [{ id: 'tenant-1', name: 'Kopi Corner' }];
    await client.fetchQuery({ queryKey: ['currentTenant', 'tenant-1'], queryFn: async () => tenantRow });
    await client.fetchQuery({ queryKey: ['userRole', 'role-1'], queryFn: async () => [{ id: 'role-1', permissions: ['orders.view'] }] });
    await client.fetchQuery({ queryKey: ['revenueOrders', 'tenant-1'], queryFn: async () => [{ id: 'not kept' }] });
    client.setQueryData(['products', 'tenant-1'], [{ id: 'edited here' }]);
    const loadedAt = client.getQueryState(['currentTenant', 'tenant-1']).dataUpdatedAt;
    app.flushSnapshots();
    const kept = app.listSnapshots('q:', 'user-1').map((s) => s.data.queryKey[0]).sort();
    assert.deepEqual(kept, ['currentTenant', 'userRole'], 'the shop and role are kept; reports aren’t; an edit made here waits for the next load');
    stop();

    const fresh = new QueryClient();
    assert.equal(app.restoreKeptQueries(fresh, 'user-1'), 0, 'not signed in on this phone (no session): nothing used');
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}');
    assert.equal(app.restoreKeptQueries(fresh, 'user-2'), 0, 'someone else: nothing used');
    assert.equal(app.restoreKeptQueries(fresh, 'user-1'), 2);
    assert.deepEqual(fresh.getQueryData(['currentTenant', 'tenant-1']), tenantRow);
    assert.equal(fresh.getQueryState(['currentTenant', 'tenant-1']).dataUpdatedAt, loadedAt, 'with the time it was loaded (so it counts as old, and reloads as soon as it can)');
    passed('The app’s records are kept on each load and come back only for the same person, signed in on this phone');

    // Online by the phone's account but no connection in fact: a first load that fails uses the copy.
    const later = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stop2 = app.keepQueriesOffline(later, () => 'user-1');
    await assert.rejects(later.fetchQuery({ queryKey: ['currentTenant', 'tenant-1'], queryFn: async () => { throw NO_CONNECTION; } }));
    assert.deepEqual(later.getQueryData(['currentTenant', 'tenant-1']), tenantRow, 'no connection: the copy');
    await assert.rejects(later.fetchQuery({ queryKey: ['userRole', 'role-1'], queryFn: async () => { throw { code: '42501', message: 'permission denied for table roles' }; } }));
    assert.equal(later.getQueryData(['userRole', 'role-1']), undefined, 'a refusal isn’t covered up with an old copy');
    stop2();
    passed('A first load that fails for want of a connection uses the copy; a refusal doesn’t');

    // OfflineKeeper: opening offline, the records are back before the first page asks for them.
    setOnline(false);
    const appClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let firstRead;
    function Page() {
      const { data } = useQuery({ queryKey: ['currentTenant', 'tenant-1'], queryFn: () => new Promise(() => {}) });
      if (firstRead === undefined) firstRead = data ?? null;
      return h('p', null, data?.[0]?.name || 'nothing');
    }
    const view = await mount(h(QueryClientProvider, { client: appClient }, h(app.OfflineKeeper), h(Page)));
    assert.deepEqual(firstRead, tenantRow, 'the page’s first render already has the shop');
    assert.equal(text(view.container), 'Kopi Corner');
    await view.close();
    setOnline(true);
    // Signed out: the copies go.
    globalThis.appUserFixture = null;
    const out = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(app.OfflineKeeper)));
    assert.deepEqual(app.listSnapshots('q:', 'user-1'), [], 'signed out: the app’s records are gone from the phone');
    await out.close();
    globalThis.appUserFixture = { id: 'user-1', email: 'owner@kopi.example' };
    const appSource = await readFile('src/App.jsx', 'utf8');
    assert.match(appSource, /<QueryClientProvider client=\{queryClientInstance\}>\s*\{\/\*[^*]*\*\/\}\s*<OfflineKeeper \/>\s*<AppRefreshProvider>/, 'above the pages');
    assert.match(appSource, /<SonnerToaster \/>\s*\{\/\*[^*]*\*\/\}\s*<ConnectionStatus \/>/, 'the pill on every page');
    passed('Opening offline, the app’s records are there for the first render; signing out removes them');
  }

  // ── 3. "You're offline. Reconnecting…", then "Back online" ────────────────────────────
  {
    const view = await mount(h(app.ConnectionStatus));
    assert.equal(view.container.innerHTML, '', 'online: nothing');
    await act(async () => setOnline(false));
    let pill = view.container.querySelector('[data-testid="connection-status"]');
    assert.equal(text(pill), 'You’re offline. Reconnecting…');
    assert.equal(pill.getAttribute('role'), 'status');
    assert.match(pill.className, /pointer-events-none/, 'taps pass through it');
    // (jsdom can't read env(); the source says where it sits.)
    assert.match(await readFile('src/components/ui-custom/ConnectionStatus.jsx', 'utf8'), /bottom: 'calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\)'/, 'above the bottom bar');
    await act(async () => setOnline(true));
    pill = view.container.querySelector('[data-testid="connection-status"]');
    assert.equal(text(pill), 'Back online');
    await wait(2600);
    assert.equal(view.container.innerHTML, '', 'then it goes');
    await view.close();
    passed('Every page: "You’re offline. Reconnecting…" above the bottom bar, then "Back online" for a moment');

    // The connection back: each page that refreshes itself does, once, a second later.
    let refreshed = 0;
    function Page() { app.useAppRefreshHandler(() => { refreshed += 1; }); return null; }
    const client = new QueryClient();
    const provider = await mount(h(QueryClientProvider, { client }, h(app.AppRefreshProvider, null, h(Page))));
    await act(async () => { setOnline(false); setOnline(true); setOnline(false); setOnline(true); });
    await wait(500);
    assert.equal(refreshed, 0, 'waits for the connection to settle');
    await wait(700);
    assert.equal(refreshed, 1, 'then refreshes the page once');
    await provider.close();
    passed('When the connection comes back, the page refreshes itself (once, a second after it settles)');
  }

  // ── 4. Orders: the last list stays, says when it's from and what still works ─────────
  {
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}');
    const order = (n, status, minutesAgo) => ({
      id: `o${n}`, order_number: `ORD-${String(n).padStart(6, '0')}`, status, type: 'dine_in', table_name: 'Table 4',
      created_date: new Date(Date.now() - minutesAgo * 60000).toISOString(), items: [{ name: 'Kopi C', quantity: 1, price: 1.8 }],
      total_amount: 1.8, payment_status: 'unpaid',
    });
    const live = [order(128, 'pending', 2), order(127, 'ready', 9), order(126, 'completed', 25)];
    globalThis.ordersAnswer = () => ({ data: live, error: null });
    // As in the app: under the refresh provider (pull to refresh, refresh on reconnecting).
    const page = () => mount(h(QueryClientProvider, { client: new QueryClient() }, h(app.AppRefreshProvider, null, h(MemoryRouter, null, h(app.Orders)))));
    let view = await page();
    await wait(10);
    assert.ok(text(view.container).includes('ORD-000128'));
    assert.equal(view.container.querySelector('[data-testid="offline-note"]'), null, 'online and up to date: no note');
    app.flushSnapshots();
    assert.deepEqual(app.loadSnapshot('orders:tenant-1', 'user-1')?.data.orders.map((o) => o.id), ['o128', 'o127', 'o126'], 'the list is kept on the phone');

    // The connection goes: the list stays, and says so.
    await act(async () => setOnline(false));
    let note = view.container.querySelector('[data-testid="offline-note"]');
    assert.match(text(note), /^You’re offline\. Showing orders from \d{1,2}:\d{2} [ap]m\. You can look through them\. Updating an order needs the internet\.$/);
    assert.ok(text(view.container).includes('ORD-000127'), 'the orders are still there');
    globalThis.toasts = [];
    await click(button(view.container, 'Accept'));
    assert.deepEqual(globalThis.updates, [], 'nothing is sent');
    assert.deepEqual([globalThis.toasts[0]?.message, globalThis.toasts[0]?.options?.description],
      ['Couldn’t update the order', 'You’re offline. Updating an order needs the internet. Connect to the internet, then try again.']);
    await view.close();

    // The app opens offline: the latest orders kept on the phone, and when they're from.
    const many = Array.from({ length: 120 }, (_, i) => order(1000 - i, 'completed', 30 + i));
    app.saveSnapshot('orders:tenant-1', { orders: many.slice(0, 100), total: 120 }, 'user-1', at(15, 42));
    globalThis.ordersAnswer = () => ({ data: null, error: NO_CONNECTION });
    view = await page();
    await wait(10);
    note = view.container.querySelector('[data-testid="offline-note"]');
    assert.equal(text(note), 'You’re offline. Showing your latest 100 orders from 3:42 pm. You can look through them. Updating an order needs the internet.');
    assert.ok(text(view.container).includes('ORD-001000') && text(view.container).includes('ORD-000901'), 'the kept orders show');
    await view.close();

    // Online by the phone's account, but no answer: the copy, "couldn't update", pull to retry.
    await act(async () => setOnline(true));
    view = await page();
    await wait(10);
    note = view.container.querySelector('[data-testid="offline-note"]');
    assert.equal(text(note), 'Couldn’t update the orders. Showing your latest 100 orders from 3:42 pm. Pull down to try again.');
    // The connection works again: the page's own refresh (pull, or the connection coming back) brings the live list.
    globalThis.ordersAnswer = () => ({ data: live, error: null });
    await act(async () => { setOnline(false); setOnline(true); });
    await wait(1200);
    assert.ok(text(view.container).includes('ORD-000128'), 'reconnected: the live list');
    assert.equal(view.container.querySelector('[data-testid="offline-note"]'), null, 'and the note goes');
    await view.close();

    // Offline with nothing kept: say so, rather than "No orders yet".
    app.flushSnapshots(); // (the live list just loaded is written first; then removed for this check)
    localStorage.removeItem('sellio_offline:v1:user-1:orders:tenant-1');
    await act(async () => setOnline(false));
    globalThis.ordersAnswer = () => ({ data: null, error: NO_CONNECTION });
    view = await page();
    await wait(10);
    assert.match(text(view.container), /You’re offline Your orders show here once you’re back online\. Sellio reconnects by itself\./);
    assert.doesNotMatch(text(view.container), /No orders yet/);
    await view.close();
    await act(async () => setOnline(true));
    assert.equal(app.ordersEmptyKind({ failed: true, total: 0, query: '', offline: true }), 'offline');
    assert.equal(app.ordersEmptyKind({ failed: true, total: 0, query: '' }), 'failed');
    assert.equal(app.ordersEmptyKind({ failed: false, total: 0, query: '', offline: true }), 'none');
    passed('Orders: the list stays when the connection goes, says when it’s from and that updating needs the internet; opens offline with the latest kept; reconnects by itself');
  }

  // ── 5. Explore: the listings stay too ──────────────────────────────────────────────────
  {
    const item = (n) => ({ product_id: `p${n}`, product_name: `Kaya jar ${n}`, price: 6 + n, image_url: null, shop_id: 's1', shop_name: 'Auntie Mei', shop_slug: 'auntie-mei', kind: 'item' });
    const shop = { shop_id: 's1', shop_name: 'Auntie Mei', shop_slug: 'auntie-mei', shop_logo_url: null, item_count: 3 };
    globalThis.feedAnswer = () => ({ data: [item(1), item(2), item(3)], error: null });
    globalThis.shopsAnswer = () => ({ data: [shop], error: null });
    let view = await mount(h(MemoryRouter, null, h(app.Explore)));
    await wait(10);
    assert.ok(text(view.container).includes('Kaya jar 2'));
    assert.equal(view.container.querySelector('[data-testid="offline-note"]'), null);
    app.flushSnapshots();
    assert.equal(app.loadSnapshot('explore:feed')?.data.length, 3, 'the listings are kept on the phone');
    await view.close();

    // Opening Explore offline: the listings and shops kept, and when they're from.
    await act(async () => setOnline(false));
    app.saveSnapshot('explore:feed', [item(1), item(2), item(3)], null, at(15, 42));
    globalThis.feedAnswer = () => ({ data: null, error: NO_CONNECTION });
    globalThis.shopsAnswer = () => ({ data: null, error: NO_CONNECTION });
    view = await mount(h(MemoryRouter, null, h(app.Explore)));
    await wait(10);
    const note = view.container.querySelector('[data-testid="offline-note"]');
    assert.equal(text(note), 'You’re offline. Showing listings from 3:42 pm. You can look through them. Opening a listing or ordering needs the internet.');
    assert.ok(text(view.container).includes('Kaya jar 3'), 'the kept listings show');
    assert.ok(text(view.container).includes('Shops on Sellio') && text(view.container).includes('Auntie Mei'), 'and the shops');

    // A search needs the internet: it says so.
    const input = view.container.querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, 'kaya');
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    await wait(400);
    assert.match(text(view.container), /You’re offline, so listings can’t load just now\. They’ll load when you’re back online\./);

    // Back online: the feed loads again by itself.
    await act(async () => {
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, '');
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    await wait(400);
    globalThis.feedAnswer = () => ({ data: [item(7)], error: null });
    globalThis.shopsAnswer = () => ({ data: [shop], error: null });
    await act(async () => setOnline(true));
    await wait(20);
    assert.ok(text(view.container).includes('Kaya jar 7'), 'reconnected: the live feed');
    assert.equal(view.container.querySelector('[data-testid="offline-note"]'), null);
    await view.close();
    passed('Explore: opens offline with the listings and shops kept, says when they’re from and what needs the internet; reloads when back online');
  }

  console.log(`\n${passes} checks passed`);
} finally {
  console.warn = quiet.warn;
  console.info = quiet.info;
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
// React Query's clean-up timers (5 minutes) would keep the process waiting.
process.exit(0);
