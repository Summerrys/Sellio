// No search results (UX states, 6; Alvin, 9 Nov 2026): fix the typo for them, and suggest a next
// search. Where the list is on the phone already, a search that finds nothing offers the likely
// spelling ("Did you mean Kaya toast?", one tap to search for it), says when tabs or filters hide
// what it finds (Orders' other statuses, Products' filters), and otherwise how to get back.
// Spaces either side of a search no longer hide everything; a shop's menu finds a dish by its
// translated name or the shop's own. (lib/searchSuggest.js, ui-custom/NoMatches.jsx,
// StorefrontView, OrdersEmpty, Orders, Products.) Explore's search runs on Sellio's server.
// Run: node verification/search-suggest.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Orders', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = win.IntersectionObserver;
win.scrollTo = () => {};
win.HTMLElement.prototype.scrollIntoView = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
console.warn = () => {};
console.info = () => {};

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
globalThis.toasts = [];
globalThis.appUserFixture = { id: 'user-1', email: 'owner@kopi.example' };
globalThis.tenantFixture = {
  tenantId: 'tenant-1', tenant: { id: 'tenant-1', name: 'Kopi Corner', industry: 'fnb', seller_type: 'business', settings: { currency: 'SGD' } },
  hasPermission: () => true, subscription: null, canUseFeature: () => true,
};
globalThis.rows = { orders: [], products: [], categories: [], inventory_items: [] };
globalThis.translations = {};
const query = (table) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; }, update() { return q; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: globalThis.rows[table] ?? [], error: null }).then(resolve, reject); },
  };
  return q;
};
globalThis.supabaseFixture = {
  from: (table) => query(table),
  rpc: () => query('none'),
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  functions: { invoke: async (name, { body }) => ({ data: { translations: Object.fromEntries(body.texts.map((t) => [t, globalThis.translations[body.language]?.[t] || t])) }, error: null }) },
};

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-search-suggest-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * from '@/lib/searchSuggest';",
  "export { default as StorefrontView } from '@/components/storefront/StorefrontView';",
  "export { LanguageProvider } from '@/lib/LanguageContext';",
  "export { default as Orders } from '@/pages/Orders';",
  "export { default as Products } from '@/pages/Products';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), message: note("message"), custom: note("custom"), dismiss() {} });',
    'export const Toaster = () => null;',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://x.invalid";',
  appUser: 'export const useAppUser = () => ({ appUser: globalThis.appUserFixture });',
  tenant: 'export const useTenant = () => globalThis.tenantFixture;',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  printer: 'export const loadPrinterConfig = async () => null; export const buildOrderReceipt = () => ""; export const buildOrderChit = () => ""; export const buildTableReceipt = () => ""; export const sendViaBluetooth = async () => {}; export const sendViaEpsonEPos = async () => {};',
  tableBill: 'export const loadTableBillForOrder = async () => null; export const paymentText = () => ""; export const tableReceiptHtml = () => "";',
  alerts: 'const alerts = { on: false, setOn() {}, every: 60, setEvery() {}, ring() {}, seen() {} }; export const useOrderAlerts = () => alerts; export const REMIND_EVERY = [30, 60];',
  nothing: 'export default function Nothing() { return null; } export const ShopMethodBadge = () => null; export const SkeletonList = () => null; export const RatingPill = () => null;',
  loading: 'export default function LoadingShapes({ label }) { return globalThis.__h("div", { "data-testid": "loading" }, label); } export const StoreShapes = () => null;',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getOrdersSteps = () => []; export const getProductsSteps = () => [];',
  appFiles: 'export const inAppFiles = () => false; export const saveFileInApp = () => {};',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false; export const stepToFirstEntry = async () => {};',
  pull: 'export default function PullToRefresh({ children }) { return children; }',
  likes: 'export const useKnownLike = () => null;',
  edges: 'export const extractBannerEdgeAssets = async () => null; export const isValidBannerEdgeColor = () => false;',
  catalog: 'export const applyCanonicalProductOrder = (q) => q;',
  subscription: 'export const useSubscription = () => ({ maxProducts: null });',
  grid: 'export default function ProductGrid({ products }) { return globalThis.__h("div", { "data-testid": "product-grid" }, products.map((p) => globalThis.__h("p", { key: p.id }, p.name))); }',
  select: [
    'const h = (...a) => globalThis.__h(...a);',
    'export const Select = ({ value, onValueChange, children }) => h("select", { value, onChange: (e) => onValueChange(e.target.value) }, children);',
    'export const SelectTrigger = () => null; export const SelectValue = () => null;',
    'export const SelectContent = ({ children }) => children;',
    'export const SelectItem = ({ value, children }) => h("option", { value }, children);',
  ].join('\n'),
  dropdown: 'export const DropdownMenu = ({ children }) => children; export const DropdownMenuTrigger = () => null; export const DropdownMenuContent = () => null; export const DropdownMenuItem = () => null;',
};
const mock = { name: 'search-suggest-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/AppUserContext$/, 'appUser');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/lib\/printerUtils$/, 'printer');
  route(/lib\/tableBill$/, 'tableBill');
  route(/lib\/useOrderAlerts$/, 'alerts');
  route(/orders\/(TableCallAlerts|EditOrderModal|ChitPreviewSheet)$|tour\/(TourGuide|DummyOrderCard|DummyProductCard)$|shop\/ShopOrderInfo$|ui-custom\/AppLoader$|ratings\/RatingParts$|products\/(ProductFormDialog(\.jsx)?|ProductImportDialog)$|subscription\/PricingModal$|ui-custom\/NativeCameraScanControl$/, 'nothing');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/lib\/useBackToClose$/, 'back');
  route(/ui-custom\/PullToRefresh$/, 'pull');
  route(/lib\/likes$/, 'likes');
  route(/lib\/bannerEdgeColors$/, 'edges');
  route(/lib\/storefrontCatalog$/, 'catalog');
  route(/hooks\/useSubscription$/, 'subscription');
  route(/products\/ProductGrid$/, 'grid');
  route(/components\/ui\/select$/, 'select');
  route(/components\/ui\/dropdown-menu$/, 'dropdown');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.search-suggest.mjs');
await copyFile(outfile, local);
globalThis.__h = h;
const app = await import(pathToFileURL(local));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const text = (node) => {
  const parts = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push(c.nodeValue); else { parts.push(' '); walk(c); parts.push(' '); } } };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const type = (input, value) => act(async () => {
  assert.ok(input, 'the search box is there');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
});
const choose = (select, value) => act(async () => {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value').set.call(select, value);
  select.dispatchEvent(new win.Event('change', { bubbles: true }));
});
const mounted = [];
const mount = async (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  await wait(20);
  const view = { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
  mounted.push(view);
  return view;
};
const closeAll = async () => { while (mounted.length) await mounted.pop().close(); };

try {
  // ── 1. The likely spelling, from the names on the page ───────────────────────────────
  {
    const menu = ['Kaya toast set', 'Kopi C', 'Kopi O kosong', 'Mee siam', 'Teh tarik', 'Nasi lemak with egg', 'Lontong', 'Otah toast', 'Crème brûlée', 'Chicken rice (large)'];
    const finds = (t) => menu.some((n) => n.toLowerCase().includes(t.toLowerCase()));
    const cases = {
      'nasi lmak': 'Nasi lemak', nasilemak: 'Nasi lemak', 'kaya tost': 'Kaya toast', lontog: 'Lontong', 'teh tarek': 'Teh tarik',
      'creme brulee': 'Crème brûlée', 'chiken rice': 'Chicken rice', 'kopi kosong': 'Kopi O kosong', 'mee siem': 'Mee siam',
      tea: null, egg: null, pizza: null, '   ': null,
    };
    for (const [typed, expected] of Object.entries(cases)) assert.equal(app.didYouMean(typed, menu, finds), expected, typed);
    assert.equal(app.didYouMean('kaya woast', ['Kaya toast', 'Kaya roast']), 'Kaya roast', 'equally close: alphabetical');
    assert.equal(app.didYouMean('kaya woast', ['Kaya toast', 'Kaya roast'], (t) => t !== 'Kaya roast'), 'Kaya toast', 'a phrase that wouldn’t show anything is skipped');
    assert.equal(app.didYouMean('kaya woast', ['Kaya toast', 'Kaya roast', 'Kaya toast set']), 'Kaya toast', 'equally close: the one in more names');
    assert.equal(app.didYouMean('kaya tost', menu, () => false), null, 'nothing that would show anything: no suggestion');
    assert.equal(app.didYouMean('Lontong', ['Lontong'], () => true), null, 'never suggests what was typed');
    assert.equal(app.didYouMean('kopi peng', ['Kopi C', 'Teh peng']), null, 'too far from anything: no guess');
    assert.equal(app.typoDistance('kaya', 'kaya'), 0);
    assert.equal(app.typoDistance('teh', 'the'), 1, 'two letters swapped is one typo');
    assert.equal(app.typoDistance('kitten', 'sitting'), 3);
    assert.equal(app.typoDistance('ab', 'abcdef', 2), 3, 'stops counting past the limit');
    assert.deepEqual([3, 4, 5, 6, 9, 10].map(app.typosAllowed), [0, 1, 1, 2, 2, 3]);
    assert.equal(app.searchWords('  Kaya-Toast (2) Crème '), 'kaya toast 2 creme');
    passed('"Did you mean": the closest phrase in the names on the page, a typo or two away, and only one that finds something');
  }

  // ── 2. A shop's menu (grid): Did you mean, one tap to search it, else the whole menu ─
  const tenant = { id: 'tenant-1', name: 'Kopi Corner', currency: 'SGD' };
  const products = [
    { id: 'p1', name: 'Kaya toast set', description: 'Toast, 2 soft-boiled eggs, kopi', price: 4.5, category_id: 'c1' },
    { id: 'p2', name: 'Kopi C', description: 'Coffee with evaporated milk', price: 1.8, category_id: 'c2' },
    { id: 'p3', name: 'Mee siam', description: 'Spicy rice vermicelli', price: 5.2, category_id: 'c3' },
    { id: 'p4', name: 'Lontong', description: 'Rice cakes in coconut curry', price: 5.5, category_id: 'c1' },
    { id: 'p5', name: 'Otah toast', price: 3.8, category_id: 'c1' },
  ];
  const categories = [{ id: 'c1', name: 'Breakfast' }, { id: 'c2', name: 'Drinks' }, { id: 'c3', name: 'Noodles' }];
  const menuView = (config) => mount(h(app.LanguageProvider, null, h(app.StorefrontView, {
    tenant, products, categories, isDesktop: false, isLandscape: false,
    storefrontConfig: { banner_bg_color: '#c2410c', show_promo_ticker: false, ...config },
  })));
  {
    let view = await menuView({ product_layout: 'grid' });
    const searchButton = [...view.container.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-search') && !text(b));
    await click(searchButton);
    const box = () => view.container.querySelector('input');
    assert.equal(box().getAttribute('placeholder'), 'Search the menu…');
    await type(box(), 'kaya tost');
    const none = () => view.container.querySelector('[data-testid="menu-no-match"]');
    assert.ok(none());
    assert.equal(text(none()), '🔍 Nothing on the menu matches “kaya tost” Did you mean Kaya toast ? Search “Kaya toast”');
    assert.match(text(view.container), /0 results for “kaya tost”/);
    assert.equal(none().querySelector('[data-testid="menu-no-match-action"]').style.background, 'rgb(194, 65, 12)', 'the shop’s colour');
    await click(none().querySelector('[data-testid="menu-no-match-action"]'));
    assert.equal(box().value, 'Kaya toast');
    assert.ok(!none());
    assert.match(text(view.container), /1 result for “Kaya toast” 🛍️ Kaya toast set/);
    await type(box(), 'lontog');
    await click(none().querySelector('[data-testid="did-you-mean"] button'));
    assert.equal(box().value, 'Lontong', 'the suggested word itself is a link too');
    await type(box(), 'pizza');
    assert.equal(text(none()), '🔍 Nothing on the menu matches “pizza” Show the whole menu');
    assert.ok(!none().querySelector('[data-testid="did-you-mean"]'));
    await click(none().querySelector('[data-testid="menu-no-match-action"]'));
    assert.equal(box().value, '');
    assert.match(text(view.container), /Kaya toast set.*Kopi C.*Mee siam/, 'the whole menu again');
    await type(box(), 'siam ');
    assert.match(text(view.container), /1 result for “siam” 🛍️ Mee siam/, 'a space after the word (phone keyboards add one) still finds it');
    await closeAll();

    // Split menus: the search button appears once scrolled.
    view = await menuView({ product_layout: 'split' });
    Object.defineProperty(win, 'scrollY', { value: 400, configurable: true });
    await act(async () => { win.dispatchEvent(new win.Event('scroll')); });
    await click([...view.container.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-search')));
    await type(view.container.querySelector('input'), 'otah tost');
    assert.match(text(view.container.querySelector('[data-testid="menu-no-match"]')), /Did you mean Otah toast \?/);
    await click(view.container.querySelector('[data-testid="menu-no-match-action"]'));
    assert.match(text(view.container), /1 result for “Otah toast” 🛍️ Otah toast/);
    Object.defineProperty(win, 'scrollY', { value: 0, configurable: true });
    await closeAll();
    passed('A shop’s menu (grid and split): "Did you mean Kaya toast?" and one tap to search it; nothing close: back to the whole menu; a trailing space still finds');
  }

  // ── 3. The menu in Chinese and Malay; dishes found by the shop's own name too ────────
  {
    globalThis.translations = { zh: { 'Kopi C': '咖啡C', 'Kaya toast set': '咖椰吐司套餐' } };
    localStorage.setItem('sellio_storefront_lang', 'zh');
    const view = await menuView({ product_layout: 'grid' });
    await wait(30);
    assert.match(text(view.container), /咖啡C/, 'shown translated');
    const searchButton = [...view.container.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-search') && !text(b));
    await click(searchButton);
    const box = view.container.querySelector('input');
    assert.equal(box.getAttribute('placeholder'), '搜索菜单…');
    await type(box, 'kopi c');
    assert.match(text(view.container), /“kopi c”：1 个结果 🛍️ 咖啡C/, 'found by the shop’s own name');
    await type(box, '咖啡');
    assert.match(text(view.container), /“咖啡”：1 个结果 🛍️ 咖啡C/, 'and by the translated one');
    await type(box, 'kaya tost');
    assert.equal(text(view.container.querySelector('[data-testid="menu-no-match"]')), '🔍 菜单上没有与“kaya tost”相符的项目 您是不是要找 Kaya toast ？ 搜索“Kaya toast”');
    await type(box, 'pizza');
    assert.match(text(view.container.querySelector('[data-testid="menu-no-match"]')), /显示全部菜单$/);
    await closeAll();
    localStorage.setItem('sellio_storefront_lang', 'ms');
    const ms = await menuView({ product_layout: 'grid' });
    await click([...ms.container.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-search') && !text(b)));
    await type(ms.container.querySelector('input'), 'lontog');
    assert.equal(text(ms.container.querySelector('[data-testid="menu-no-match"]')), '🔍 Tiada apa-apa dalam menu yang sepadan dengan “lontog” Adakah anda maksudkan Lontong ? Cari “Lontong”');
    assert.match(text(ms.container), /0 hasil untuk “lontog”/);
    await closeAll();
    localStorage.removeItem('sellio_storefront_lang');
    globalThis.translations = {};
    passed('The menu’s search in Chinese and Malay; a dish is found by its translated name or the shop’s own');
  }

  // ── 4. Orders: other statuses first, then the likely spelling, else what search looks at ─
  {
    const order = (n, status, items, extra = {}) => ({
      id: `o${n}`, order_number: `ORD-${String(n).padStart(6, '0')}`, status, type: 'dine_in', table_name: 'Table 4',
      created_date: new Date(Date.now() - n * 60000).toISOString(), items, total_amount: 5, payment_status: 'unpaid', ...extra,
    });
    globalThis.rows.orders = [
      order(128, 'preparing', [{ name: 'Kaya toast set', quantity: 2, price: 4.5 }], { customer_name: 'Mei Ling' }),
      order(127, 'ready', [{ name: 'Mee siam', quantity: 1, price: 5.2 }]),
      order(126, 'completed', [{ name: 'Kopi C', quantity: 1, price: 1.8 }], { table_name: 'Table 12' }),
    ];
    const view = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(20);
    const box = view.container.querySelector('input[placeholder="Search orders, table, items..."]');
    const empty = () => view.container.querySelector('[data-testid="orders-empty"]');
    await type(box, 'kaya tost');
    assert.equal(text(empty()), 'No orders match “kaya tost” Did you mean Kaya toast ? Search “Kaya toast”');
    await click(buttonNamed(empty(), 'Search “Kaya toast”'));
    assert.equal(box.value, 'Kaya toast');
    assert.ok(!empty());
    assert.match(text(view.container), /ORD-000128/);
    await type(box, 'mei lng');
    await click(empty().querySelector('[data-testid="did-you-mean"] button'));
    assert.equal(box.value, 'Mei Ling', 'customers’ names too');
    await type(box, 'siam ');
    assert.match(text(view.container), /ORD-000127/, 'a space after the word still finds it');
    // The Ready tab: what's typed matches an order that's being prepared.
    await click([...view.container.querySelectorAll('[data-tour="order-tabs"] button')].find((b) => text(b).startsWith('Ready')));
    await type(box, 'kaya');
    assert.equal(text(empty()), 'No orders match “kaya” One order with another status matches. Search all orders');
    await click(buttonNamed(empty(), 'Search all orders'));
    assert.match(text(view.container), /ORD-000128/, 'All orders: there it is');
    await type(box, 'zzzz');
    assert.equal(text(empty()), 'No orders match “zzzz” Search looks at order numbers, tables, customers’ names and items. Clear search');
    await click(buttonNamed(empty(), 'Clear search'));
    assert.equal(box.value, '');
    await closeAll();
    passed('Orders: "One order with another status matches" with Search all orders; else "Did you mean Kaya toast?" (items, customers, tables); else what search looks at');
  }

  // ── 5. Products: filters hiding a match, the likely spelling, and filters alone ──────
  {
    globalThis.rows.products = [
      { id: 'p1', name: 'Kaya toast set', description: 'Toast with kaya', price: 4.5, category_id: 'c1', is_active: true },
      { id: 'p2', name: 'Kopi C', description: 'Coffee', price: 1.8, category_id: 'c2', is_active: true },
      { id: 'p3', name: 'Lontong', description: 'Rice cakes', price: 5.5, category_id: 'c1', is_active: false },
    ];
    globalThis.rows.categories = [{ id: 'c1', name: 'Breakfast' }, { id: 'c2', name: 'Drinks' }];
    const view = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Products))));
    await wait(30);
    const box = view.container.querySelector('input[placeholder="Search products..."]');
    const none = () => view.container.querySelector('[data-testid="no-matches"]');
    const [category, status] = view.container.querySelectorAll('select');
    await type(box, 'kaya tost');
    assert.equal(text(none()), 'No products match “kaya tost” Did you mean Kaya toast ? Search “Kaya toast”');
    await click(buttonNamed(none(), 'Search “Kaya toast”'));
    assert.equal(box.value, 'Kaya toast');
    assert.match(text(view.container.querySelector('[data-testid="product-grid"]')), /Kaya toast set/);
    await type(box, 'toast ');
    assert.match(text(view.container.querySelector('[data-testid="product-grid"]')), /Kaya toast set/, 'a trailing space still finds it');
    // Drinks only: the search finds a Breakfast dish.
    await choose(category, 'c2');
    await type(box, 'lontong');
    assert.equal(text(none()), 'No products match “lontong” Your filters hide one product that matches. Show all products');
    await click(buttonNamed(none(), 'Show all products'));
    assert.equal(category.value, 'all');
    assert.match(text(view.container.querySelector('[data-testid="product-grid"]')), /Lontong/);
    // Hidden only: a suggestion comes from what the filters show.
    await choose(status, 'inactive');
    await type(box, 'lontog');
    assert.equal(text(none()), 'No products match “lontog” Did you mean Lontong ? Search “Lontong”');
    await type(box, 'kaya tost');
    assert.equal(text(none()), 'No products match “kaya tost” Search looks at names and descriptions. Clear search', 'nothing close within the filters: what search looks at');
    await click(buttonNamed(none(), 'Clear search'));
    assert.equal(box.value, '');
    assert.match(text(view.container.querySelector('[data-testid="product-grid"]')), /^Lontong$/, 'the filters stay');
    await choose(category, 'c2');
    assert.equal(text(none()), 'No products match these filters Try another category or status. Show all products', 'filters alone: hidden drinks');
    await click(buttonNamed(none(), 'Show all products'));
    assert.equal(status.value, 'all');
    assert.equal(category.value, 'all');
    assert.match([...view.container.querySelectorAll('[data-testid="product-grid"]')].map(text).join(' '), /Kaya toast set.*Lontong.*Kopi C/, 'everything, by category');
    await closeAll();
    passed('Products: filters that hide a match say so (Show all products); else "Did you mean"; else what search looks at; filters alone say so too');
  }

  console.log(`\n${passes} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeAll().catch(() => {});
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
process.exit(process.exitCode || 0);
