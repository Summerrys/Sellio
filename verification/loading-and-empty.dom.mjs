// Loading and empty states (Alvin, 7 Nov 2026).
// Loading: placeholder shapes with Sellio's small logo and bouncing dots over them (8 Nov: the
// full-screen loader's mark), in one element, so both appear together and go together the
// moment the page shows its content (LoadingShapes); a
// page made of cards waits for all of them (useFirstLoad), so it shows everything at once.
// Empty: say why it's empty, then one next step (Orders, the Dashboard's Recent Orders,
// Reports, Notifications, Tables).
// Run: node verification/loading-and-empty.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
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
win.scrollTo = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider, useQuery } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

// ── Fixtures for the app modules the components use ────────────────────────────────────
globalThis.tenantFixture = { tenant: { slug: 'kopi-corner', name: 'Kopi Corner', logo_url: null, currency: 'SGD' }, tenantId: 'tenant-1', hasPermission: () => true, canUseFeature: () => true };
globalThis.toasts = [];
globalThis.pushFixture = { status: 'off', allowed: true, asked: 0, later: [] };
globalThis.supabaseRows = {};
const builder = (table) => {
  const query = {
    select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; }, in() { return query; },
    then(resolve, reject) {
      const answer = { data: globalThis.supabaseRows[table] || [], error: null };
      return new Promise((done) => setTimeout(() => done(answer), globalThis.supabaseDelay || 0)).then(resolve, reject);
    },
  };
  return query;
};
globalThis.supabaseFixture = {
  from: (table) => builder(table),
  channel: () => { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; },
  removeChannel() {},
};

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-loading-empty-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as LoadingShapes, Shape, DashboardShapes, ListShapes } from '@/components/ui-custom/LoadingShapes';",
  "export { useFirstLoad } from '@/lib/useFirstLoad';",
  "export { default as OrdersEmpty, ordersEmptyKind } from '@/components/orders/OrdersEmpty';",
  "export { default as ReportsEmpty, emptyRangeTitle } from '@/components/reports/ReportsEmpty';",
  "export { default as NotificationsEmpty } from '@/components/notifications/NotificationsEmpty';",
  "export { default as RecentOrders } from '@/components/dashboard/RecentOrders';",
  "export { default as Tables } from '@/pages/Tables';",
].join('\n'));
const mock = { name: 'loading-empty-fixtures', setup(b) {
  b.onResolve({ filter: /tenant\/TenantContext$/ }, () => ({ path: 'tenant', namespace: 'mock' }));
  b.onResolve({ filter: /^sonner$/ }, () => ({ path: 'sonner', namespace: 'mock' }));
  b.onResolve({ filter: /lib\/pushNotifications$/ }, () => ({ path: 'push', namespace: 'mock' }));
  b.onResolve({ filter: /lib\/supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
  b.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: 'db', namespace: 'mock' }));
  b.onResolve({ filter: /^qrcode$/ }, () => ({ path: 'qrcode', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: {
    tenant: 'export const useTenant = () => globalThis.tenantFixture;',
    sonner: [
      'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
      'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), custom: note("custom") });',
      'export const Toaster = () => null;',
    ].join('\n'),
    push: [
      'export const pushStatus = async () => globalThis.pushFixture.status;',
      'export const askAndroid = async () => { globalThis.pushFixture.asked += 1; return globalThis.pushFixture.allowed; };',
      'export const askLater = (days) => { globalThis.pushFixture.later.push(days); };',
    ].join('\n'),
    supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://project.example.invalid";',
    db: 'export default { entities: {} };',
    qrcode: 'export default { toDataURL: async () => "data:image/png;base64,AA==" };',
  }[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
// React, React Query and the rest resolve from the app (the same copies this file uses).
const local = path.join(process.cwd(), '.loading-and-empty.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const mount = async (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return { container, render: (next) => act(async () => { root.render(next); }), close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
// The words on screen, a space between elements (as they'd read).
const text = (node) => {
  const parts = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push(c.nodeValue); else { parts.push(' '); walk(c); parts.push(' '); } } };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const button = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });

try {
  // ── 1. LoadingShapes: shapes and Sellio's mark in one element ────────────────────────
  {
    function Page({ loading }) {
      return loading
        ? h(app.LoadingShapes, { label: 'Loading orders' }, h(app.ListShapes, { rows: 3 }))
        : h('p', { 'data-testid': 'content' }, 'Order #ORD-000128');
    }
    const page = await mount(h(Page, { loading: true }));
    const status = page.container.querySelector('[role="status"]');
    assert.ok(status, 'the loading state is announced');
    assert.equal(status.getAttribute('aria-label'), 'Loading orders');
    assert.equal(status.getAttribute('aria-busy'), 'true');
    assert.ok(status.querySelector('.sellio-shape'), 'shapes');
    const mark = status.querySelector('[data-testid="loading-mark"]');
    assert.ok(mark, 'Sellio\'s mark, inside the same element as the shapes');
    const logo = mark.querySelector('img');
    assert.equal(logo?.getAttribute('src'), '/branding/sellio-logo.webp', 'the Sellio logo, as on the full-screen loader');
    assert.ok(logo.classList.contains('sellio-logo-pulse'), 'the logo pulses, as on the full-screen loader');
    assert.deepEqual([logo.getAttribute('width'), logo.getAttribute('height')], ['80', '80'], 'its size is set before the picture arrives, so nothing jumps');
    const dots = [...mark.querySelectorAll('span[class^="sellio-dot-"]')];
    assert.deepEqual(dots.map((dot) => dot.className), ['sellio-dot-1', 'sellio-dot-2', 'sellio-dot-3'], 'the three dots, as on the full-screen loader');
    assert.ok(logo.compareDocumentPosition(dots[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING, 'the dots under the logo');
    assert.deepEqual([mark, ...mark.querySelectorAll('*')].map((el) => el.getAttribute('style') || '').filter((css) => /background|box-shadow/.test(css)), [], 'nothing drawn behind the logo and dots');
    assert.equal(page.container.querySelector('[data-testid="content"]'), null, 'no content yet');
    await page.render(h(Page, { loading: false }));
    assert.equal(page.container.querySelector('[data-testid="loading-shapes"]'), null, 'shapes gone');
    assert.equal(page.container.querySelector('[data-testid="loading-mark"]'), null, 'logo and dots gone in the same render');
    assert.equal(text(page.container), 'Order #ORD-000128', 'the content is all that shows');
    await page.close();

    const css = document.getElementById('sellio-loading-shapes-css')?.textContent || '';
    const allCss = [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    const beat = (source, re) => (source.match(re) || [])[1];
    assert.equal(beat(css, /animation: sellio-loading-sweep ([\d.]+s)/), '1.2s', 'the shapes sweep every 1.2 s');
    assert.equal(beat(allCss, /\.sellio-dot-1 \{ animation: sellio-bounce ([\d.]+s)/), '1.2s', 'the dots bounce every 1.2 s');
    assert.match(allCss, /\.sellio-dot-2 \{ animation: sellio-bounce 1\.2s ease-in-out infinite 200ms[\s\S]*\.sellio-dot-3 \{ animation: sellio-bounce 1\.2s ease-in-out infinite 400ms/, 'the dots one after another, as on the full-screen loader');
    assert.equal(beat(css, /\.sellio-loading \.sellio-logo-pulse \{ animation-duration: ([\d.]+s)/), '1.2s', 'the logo pulses on the same beat');
    const markRule = beat(css, /\.sellio-loading-mark \{([^}]*)\}/);
    assert.ok(markRule !== undefined, 'the mark has its rule');
    assert.doesNotMatch(markRule, /background|box-shadow|border|padding/, 'just the logo and dots: no card behind them');
    assert.match(css, /\.sellio-loading \.sellio-shimmer, \.sellio-loading \.animate-pulse \{ animation-duration: 1\.2s/, 'older skeletons inside it keep the same beat');
    passed('LoadingShapes: shapes with Sellio\'s logo and three dots in one element, appearing and going together, on one 1.2 s beat');

    const slow = await mount(h(app.LoadingShapes, { slowAfterMs: 30 }, h(app.Shape)));
    assert.equal(button(slow.container, 'Reload'), undefined, 'no Reload offer at first');
    await wait(60);
    assert.match(text(slow.container), /This is taking longer than usual\./);
    assert.ok(button(slow.container, 'Reload'), 'a Reload offer under the logo and dots');
    await slow.close();
    const usual = await mount(h(app.LoadingShapes, {}, h(app.Shape)));
    await wait(60);
    assert.equal(button(usual.container, 'Reload'), undefined, 'the usual wait is 12 seconds');
    await usual.close();
    passed('Still loading after the wait: a Reload offer, as on the full-screen loader');
  }

  // ── 2. useFirstLoad: a page of cards shows everything at once ────────────────────────
  {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const later = (ms, value, fail = false) => () => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('down')) : resolve(value)), ms));
    const Card = ({ name, ms, fail }) => {
      const { data } = useQuery({ queryKey: [name, 'shop-1'], queryFn: later(ms, `${name} ready`, fail) });
      return h('p', { 'data-card': name }, data || `${name} empty`);
    };
    const Elsewhere = () => { useQuery({ queryKey: ['elsewhere', 'shop-1'], queryFn: () => new Promise(() => {}) }); return null; };
    let renders = [];
    function Page({ extra = false, failB = false }) {
      const loading = app.useFirstLoad([['cardA', 'shop-1'], ['cardB', 'shop-1'], ['cardC', 'shop-1']]);
      renders.push({ loading });
      return h('div', null,
        loading && h(app.LoadingShapes, { label: 'Loading your dashboard' }, h(app.DashboardShapes)),
        h('div', { hidden: loading, 'data-testid': 'cards' },
          h(Card, { name: 'cardA', ms: 20 }), h(Card, { name: 'cardB', ms: 80, fail: failB }),
          extra && h(Card, { name: 'cardC', ms: 5000 })),
        h(Elsewhere));
    }
    const page = await mount(h(QueryClientProvider, { client }, h(Page)));
    const shapes = () => page.container.querySelector('[data-testid="loading-shapes"]');
    const mark = () => page.container.querySelector('[data-testid="loading-mark"]');
    const cards = () => page.container.querySelector('[data-testid="cards"]');
    assert.ok(shapes() && mark(), 'shapes and Sellio\'s mark from the first render');
    assert.equal(cards().hidden, true, 'the cards are mounted but hidden');
    await wait(45);
    assert.equal(text(page.container.querySelector('[data-card="cardA"]')), 'cardA ready', 'one card has its numbers');
    assert.ok(shapes() && mark() && cards().hidden, 'still loading: the other card hasn\'t');
    await wait(80);
    assert.equal(shapes(), null, 'shapes gone');
    assert.equal(mark(), null, 'logo and dots gone with them');
    assert.equal(cards().hidden, false, 'every card shows');
    assert.deepEqual([...cards().querySelectorAll('[data-card]')].map((card) => card.textContent), ['cardA ready', 'cardB ready'], 'all at once, with their numbers (no "empty" on show)');
    assert.ok(!renders.some((r, i) => i > 0 && !renders[i - 1].loading && r.loading), 'never back to loading once shown');
    // A query of another page, never finishing, doesn't hold this one; a card added later doesn't bring the loading state back.
    await page.render(h(QueryClientProvider, { client }, h(Page, { extra: true })));
    await wait(20);
    assert.equal(shapes(), null, 'a later card doesn\'t bring the shapes back');
    await page.close();
    passed('useFirstLoad: the shapes, logo and dots stay until every card has its numbers, then go in the same moment all the cards show');

    const failing = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renders = [];
    const page2 = await mount(h(QueryClientProvider, { client: failing }, h(Page, { failB: true })));
    await wait(130);
    assert.equal(page2.container.querySelector('[data-testid="loading-shapes"]'), null, 'a card that fails doesn\'t keep the page loading');
    assert.equal(page2.container.querySelector('[data-testid="cards"]').hidden, false);
    await page2.close();
    passed('A card whose load fails doesn\'t leave the page loading for ever');
  }

  // The Dashboard waits for every card it has: its own numbers and its cards' (each key as the card has it).
  {
    const dashboard = await readFile('src/pages/Dashboard.jsx', 'utf8');
    const gate = dashboard.match(/useFirstLoad\(\[([\s\S]*?)\]\);/);
    assert.ok(gate, 'the Dashboard uses useFirstLoad');
    const heads = [...gate[1].matchAll(/\['([^']+)', tenantId\]/g)].map((m) => m[1]);
    const sources = {
      todayOrders: 'src/pages/Dashboard.jsx', dashboardProducts: 'src/pages/Dashboard.jsx', dashboardInventoryItems: 'src/pages/Dashboard.jsx',
      dashboardStaff: 'src/pages/Dashboard.jsx', recentOrders: 'src/components/dashboard/RecentOrders.jsx',
      revenueOrders: 'src/components/dashboard/RevenueChart.jsx', 'shop-setup-status': 'src/components/shop/ShopSetupCard.jsx',
      subscription: 'src/hooks/useSubscription.js',
    };
    assert.deepEqual([...heads].sort(), Object.keys(sources).sort(), 'every card\'s data, nothing else');
    for (const [head, file] of Object.entries(sources)) {
      const code = await readFile(file, 'utf8');
      assert.ok(code.includes(`queryKey: ['${head}', tenantId`), `${file} still loads ['${head}', tenantId, …]`);
    }
    assert.match(dashboard, /<div hidden=\{loading\}[^>]*>/, 'the cards are hidden, not left out, while loading');
    assert.match(dashboard, /dashboardTour\.eligible && !loading/, 'the tour starts once the cards show');
    passed('The Dashboard waits for each of its cards\' data (checked against the cards themselves)');
  }

  // ── 3. Orders: why it's empty, and one next step ─────────────────────────────────────
  {
    assert.equal(app.ordersEmptyKind({ failed: true, total: 0, query: '' }), 'failed');
    assert.equal(app.ordersEmptyKind({ failed: true, total: 3, query: '' }), 'tab', 'a failed refresh with orders on screen isn\'t "couldn\'t load"');
    assert.equal(app.ordersEmptyKind({ failed: false, total: 0, query: 'kaya' }), 'none', 'no orders at all: not a search problem');
    assert.equal(app.ordersEmptyKind({ failed: false, total: 3, query: ' kaya ' }), 'search');
    assert.equal(app.ordersEmptyKind({ failed: false, total: 3, query: '  ' }), 'tab');

    const calls = [];
    const props = { onSeeAll: () => calls.push('see all'), onClearSearch: () => calls.push('clear'), onRetry: () => calls.push('retry') };
    let view = await mount(h(app.OrdersEmpty, { kind: 'none', tableOrdering: true, counter: true, ...props }));
    assert.match(text(view.container), /No orders yet/);
    assert.match(text(view.container), /Orders from your shop page, table QR codes and the Counter show up here\./);
    await click(button(view.container, 'Share your shop link'));
    const sheet = document.body.querySelector('[role="dialog"]') || document.body;
    assert.match(text(sheet), /Share to/, 'the Share to sheet opens');
    assert.match(text(sheet), /sellio\.sg\/store\/kopi-corner/, 'with the shop\'s own link');
    assert.ok(button(document.body, 'Copy link'), 'which can be copied');
    await view.close();
    for (const [extra, words] of [
      [{ tableOrdering: false, counter: true }, 'Orders from your shop page and the Counter show up here.'],
      [{ tableOrdering: true, counter: false }, 'Orders from your shop page and table QR codes show up here.'],
      [{ isShop: true, tableOrdering: true, counter: true }, 'Orders from your shop page show up here.'],
    ]) {
      view = await mount(h(app.OrdersEmpty, { kind: 'none', ...extra, ...props }));
      assert.match(text(view.container), new RegExp(words.replace(/\./g, '\\.')));
      await view.close();
    }
    globalThis.tenantFixture = { ...globalThis.tenantFixture, tenant: { ...globalThis.tenantFixture.tenant, slug: '' } };
    view = await mount(h(app.OrdersEmpty, { kind: 'none', ...props }));
    assert.equal(button(view.container, 'Share your shop link'), undefined, 'no link to share before the shop has one');
    await view.close();
    globalThis.tenantFixture = { ...globalThis.tenantFixture, tenant: { ...globalThis.tenantFixture.tenant, slug: 'kopi-corner' } };

    view = await mount(h(app.OrdersEmpty, { kind: 'tab', tab: 'pending', ...props }));
    assert.match(text(view.container), /No new orders New orders wait here until you accept them\./);
    await click(button(view.container, 'See all orders'));
    await view.close();
    view = await mount(h(app.OrdersEmpty, { kind: 'tab', tab: 'confirmed', isShop: true, ...props }));
    assert.match(text(view.container), /Nothing accepted Orders you’ve accepted wait here/);
    await view.close();
    view = await mount(h(app.OrdersEmpty, { kind: 'search', query: ' kaya ', ...props }));
    assert.match(text(view.container), /No orders match “kaya”/);
    await click(button(view.container, 'Clear search'));
    await view.close();
    view = await mount(h(app.OrdersEmpty, { kind: 'failed', ...props }));
    assert.match(text(view.container), /Couldn’t load your orders/);
    assert.match(text(view.container), /Check your connection, then try again\./);
    await click(button(view.container, 'Try again'));
    await view.close();
    assert.deepEqual(calls, ['see all', 'clear', 'retry']);
    passed('Orders: no orders yet (where they come from, Share your shop link), an empty tab (See all orders), a search (Clear search), and a failed load (Try again)');
  }

  // ── 4. Dashboard's Recent Orders ─────────────────────────────────────────────────────
  {
    globalThis.supabaseRows = { orders: [] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await mount(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(app.RecentOrders, { tenantId: 'tenant-1', currency: 'SGD' }))));
    await wait(30);
    const empty = view.container.querySelector('[data-testid="recent-orders-empty"]');
    assert.ok(empty, 'the empty card');
    assert.match(text(empty), /^No orders yet Your newest orders show up here as they come in\. Share your shop link$/);
    assert.doesNotMatch(text(view.container), /today/, 'its last five orders, not today\'s: no "yet today"');
    await view.close();
    passed('Dashboard: Recent Orders with none says why and offers Share your shop link');
  }

  // ── 5. Reports ───────────────────────────────────────────────────────────────────────
  {
    const now = new Date(2026, 10, 7, 15, 0);
    assert.equal(app.emptyRangeTitle(new Date(2026, 9, 9), now, now), 'No orders between 9 Oct and 7 Nov');
    assert.equal(app.emptyRangeTitle(new Date(2026, 10, 7, 9), new Date(2026, 10, 7, 23), now), 'No orders on 7 Nov');
    assert.equal(app.emptyRangeTitle(new Date(2025, 11, 20), new Date(2026, 0, 5), now), 'No orders between 20 Dec 2025 and 5 Jan 2026');
    let shown = 0;
    let view = await mount(h(app.ReportsEmpty, { dateRange: { from: new Date(2026, 9, 9), to: now }, now, onShowUsualDays: () => { shown += 1; } }));
    assert.match(text(view.container), /Reports are made from your orders, so they fill in as orders come in\./);
    assert.ok(button(view.container, 'Share your shop link'), 'the usual 30 days and none: get orders');
    assert.equal(button(view.container, 'Show the last 30 days'), undefined);
    await view.close();
    view = await mount(h(app.ReportsEmpty, { dateRange: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 3) }, now, onShowUsualDays: () => { shown += 1; } }));
    assert.equal(button(view.container, 'Share your shop link'), undefined);
    await click(button(view.container, 'Show the last 30 days'));
    assert.equal(shown, 1, 'a few days chosen: back to the usual 30');
    await view.close();
    passed('Reports: which days had no orders, why reports are empty, and one step (the last 30 days, or the shop link)');
  }

  // ── 6. Notifications ─────────────────────────────────────────────────────────────────
  {
    let view = await mount(h(app.NotificationsEmpty));
    await wait(20);
    assert.match(text(view.container), /No notifications yet Sellio lets you know here when something needs you, like a new order\./);
    assert.equal(button(view.container, 'Turn on phone alerts'), undefined, 'a website: no phone alerts to offer');
    await view.close();

    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    globalThis.pushFixture = { status: 'off', allowed: true, asked: 0, later: [] };
    globalThis.toasts = [];
    view = await mount(h(app.NotificationsEmpty));
    await wait(20);
    await click(button(view.container, 'Turn on phone alerts'));
    await wait(10);
    assert.equal(globalThis.pushFixture.asked, 1, 'Android is asked');
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ['Alerts are on for this phone']);
    assert.equal(button(view.container, 'Turn on phone alerts'), undefined, 'and the button goes');
    await view.close();

    globalThis.pushFixture = { status: 'off', allowed: false, asked: 0, later: [] };
    globalThis.toasts = [];
    view = await mount(h(app.NotificationsEmpty));
    await wait(20);
    await click(button(view.container, 'Turn on phone alerts'));
    await wait(10);
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ['Alerts stay off']);
    assert.match(globalThis.toasts[0].options.description, /Settings: Apps → Sellio → Notifications/);
    assert.deepEqual(globalThis.pushFixture.later, [30], 'asked again in 30 days, as from the banner');
    await view.close();

    for (const status of ['on', 'blocked', 'unavailable']) {
      globalThis.pushFixture = { status, allowed: true, asked: 0, later: [] };
      view = await mount(h(app.NotificationsEmpty));
      await wait(20);
      assert.equal(button(view.container, 'Turn on phone alerts'), undefined, `alerts ${status}: nothing to turn on here`);
      await view.close();
    }
    delete win.Capacitor;
    passed('Notifications: why the list is empty, and in the Android app with alerts off, Turn on phone alerts');
  }

  // ── 7. Tables ────────────────────────────────────────────────────────────────────────
  {
    globalThis.supabaseRows = { tables: [], table_sessions: [] };
    globalThis.supabaseDelay = 40;
    globalThis.tenantFixture = { ...globalThis.tenantFixture, hasPermission: () => true };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await mount(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(app.Tables))));
    assert.ok(view.container.querySelector('[data-testid="loading-shapes"]'), 'shapes and dots while the tables load');
    await wait(120);
    assert.equal(view.container.querySelector('[data-testid="loading-shapes"]'), null);
    const empty = view.container.querySelector('[data-testid="tables-empty"]');
    assert.ok(empty, 'then the empty state');
    assert.match(text(empty), /No tables yet Add your tables to get a QR code for each one\. Customers scan it to order from their table\./,
      'with every filter on "all" it is "No tables yet", not "No tables found"');
    assert.ok(button(empty, 'Add a table'), 'one next step');
    await view.close();
    passed('Tables: shapes while loading, then no tables yet with Add a table');
  }

  console.log(passes + ' loading and empty-state checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
// React Query's refetch timers (Recent Orders, Tables) would keep the process waiting.
process.exit(0);
