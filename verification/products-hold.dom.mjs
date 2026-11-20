// Hold to select, hold and drag to rearrange, and delete with a clear warning (Alvin,
// 20 Nov 2026), and the confetti when a scanned menu is saved:
//   1. lib/productOrder.js: a move's new sort_order values for the section, the lists' order;
//   2. ProductGrid with lib/useHoldToReorder.js (pointer events; places faked, jsdom draws
//      nothing): a tap edits, a hold then let go selects, a hold then drag moves (the others make
//      room), a finger that moves first is a scroll, the handle in select mode drags at once and
//      takes the arrow keys, the page is nudged off its top while an item is up and its touch
//      moves are held, and no move without permission;
//   3. the Products page: the select bar (count, Select all / Select none, ✕), Delete in place of
//      the tab bar, the window that says what goes and what stays, Delete and Hide them instead,
//      and a move saved (sort_order) at once with Undo;
//   4. ui-custom/Celebrate.jsx: the tick, and confetti only where the browser can animate and
//      the phone doesn't ask for less motion.
// Run from the app root: node verification/products-hold.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/Products', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'DocumentFragment', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'NodeFilter']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
win.HTMLElement.prototype.scrollIntoView = () => {};
console.warn = () => {};
console.info = () => {};

// The page's scroll (the hook reads document.scrollingElement and calls window.scrollTo).
const scroll = { top: 0, height: 3000, client: 800 };
Object.defineProperty(win.document, 'scrollingElement', { configurable: true, value: { get scrollTop() { return scroll.top; }, get scrollHeight() { return scroll.height; }, get clientHeight() { return scroll.client; } } });
win.scrollTo = (opts) => { scroll.top = typeof opts === 'object' ? opts.top : opts; };
// Where each item is drawn (jsdom lays nothing out): a column of 100 px items, 10 px apart.
const placeOf = (index) => ({ left: 16, top: 200 + index * 110, width: 358, height: 100 });
win.HTMLElement.prototype.getBoundingClientRect = function rect() {
  const id = this.getAttribute?.('data-reorder-id');
  const list = id ? [...this.parentElement.querySelectorAll(':scope > [data-reorder-id]')] : [];
  const p = id ? placeOf(list.indexOf(this)) : { left: 0, top: 0, width: 0, height: 0 };
  const top = p.top - scroll.top;
  return { left: p.left, top, width: p.width, height: p.height, right: p.left + p.width, bottom: top + p.height, x: p.left, y: top };
};

const React = await import('react');
const act = React.act;
const h = React.createElement;
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');
globalThis.__h = h;

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const temporary = await mkdtemp(path.join(app, '.products-hold-verification-'));
process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = (ms = 0) => act(async () => { await sleep(ms); });
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

// ── Bundles ─────────────────────────────────────────────────────────────────────────────────
const order = await import(pathToFileURL(await (async () => {
  const out = path.join(temporary, 'order.mjs');
  await build({ entryPoints: [path.join(app, 'src/lib/productOrder.js')], outfile: out, bundle: true, packages: 'external', format: 'esm', platform: 'node', logLevel: 'silent' });
  return out;
})()).href);

globalThis.toasts = [];
globalThis.permissions = new Set(['products.view', 'products.edit', 'products.delete', 'products.create']);
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), message: note("message"), dismiss() {} });',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.db; export const SUPABASE_URL = "https://x.invalid";',
  tenant: 'export const useTenant = () => ({ tenantId: "shop-1", tenant: { id: "shop-1", name: "Cafe", seller_type: "merchant", currency: "SGD" }, subscription: null, hasPermission: (p) => globalThis.permissions.has(p), canUseFeature: () => true });',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  nothing: 'export default function Nothing() { return null; }',
  loading: 'export default function LoadingShapes() { return null; } export const StoreShapes = () => null;',
  skeleton: 'export const SkeletonList = () => null;',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getProductsSteps = () => [];',
  appFiles: 'export const inAppFiles = () => false; export const saveFileInApp = () => {};',
  back: 'export const useBackToClose = (open, close) => { globalThis.backOpen = globalThis.backOpen || []; if (open) globalThis.backOpen.push(close); };',
  subscription: 'export const useSubscription = () => ({ maxProducts: null });',
  camera: 'export default function Camera({ children }) { return globalThis.__h("span", null, children); }',
  select: [
    'const h = (...a) => globalThis.__h(...a);',
    'export const Select = ({ value, onValueChange, children }) => h("select", { value, onChange: (e) => onValueChange(e.target.value), "data-testid": "filter" }, children);',
    'export const SelectTrigger = () => null; export const SelectValue = () => null;',
    'export const SelectContent = ({ children }) => children;',
    'export const SelectItem = ({ value, children }) => h("option", { value }, children);',
  ].join('\n'),
  dropdown: 'export const DropdownMenu = ({ children }) => children; export const DropdownMenuTrigger = () => null; export const DropdownMenuContent = () => null; export const DropdownMenuItem = () => null;',
};
const mock = { name: 'products-hold', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/products\/(ProductFormDialog(\.jsx)?|ProductImportDialog)$|subscription\/PricingModal$|tour\/(TourGuide|DummyProductCard)$|onboarding\/ImageEditModal$/, 'nothing');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/ui-custom\/AppLoader$/, 'skeleton');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/lib\/useBackToClose$/, 'back');
  route(/hooks\/useSubscription$/, 'subscription');
  route(/ui-custom\/NativeCameraScanControl$/, 'camera');
  route(/components\/ui\/select$/, 'select');
  route(/components\/ui\/dropdown-menu$/, 'dropdown');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const entry = path.join(temporary, 'entry.jsx');
await writeFile(entry, [
  "export { default as ProductGrid } from '@/components/products/ProductGrid';",
  "export { default as Products } from '@/pages/Products';",
  "export { default as Celebrate, CONFETTI_PIECES } from '@/components/ui-custom/Celebrate';",
  "export { HOLD_MS } from '@/lib/useHoldToReorder';",
].join('\n'));
const bundled = path.join(temporary, 'bundle.mjs');
await build({ entryPoints: [entry], outfile: bundled, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', alias: { '@': path.join(app, 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const ui = await import(pathToFileURL(bundled).href);

// Pointer events as a finger (or the mouse) sends them.
const pointer = (type, target, { x = 100, y = 250, id = 1, kind = 'touch', button = 0 } = {}) => {
  const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: kind });
  Object.defineProperty(event, 'isPrimary', { value: true });
  target.dispatchEvent(event);
  return event;
};
const down = (el, at) => act(async () => { pointer('pointerdown', el, at); });
const move = (at) => act(async () => { pointer('pointermove', win, at); await sleep(20); });
const up = (at) => act(async () => { pointer('pointerup', win, at); await sleep(20); });
const click = (el) => act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); });
const touchMove = (el) => {
  const event = new win.Event('touchmove', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event.defaultPrevented;
};

const mounted = [];
async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await wait(20);
  const view = { container, root, render: (el) => act(async () => root.render(el)) };
  mounted.push(view);
  return view;
}
const closeAll = async () => { for (const v of mounted.splice(0)) await act(async () => v.root.unmount()); document.body.innerHTML = ''; };

try {
  // ── 1. The order helpers ────────────────────────────────────────────────────────────────
  assert.deepEqual(order.moveItem(['a', 'b', 'c', 'd'], 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(order.moveItem(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(order.moveItem(['a', 'b'], 1, 5), ['a', 'b'], 'nowhere to go: unchanged');
  const scanned = [{ id: 's', sort_order: 16 }, { id: 'i', sort_order: 17 }, { id: 'l', sort_order: 18 }];
  assert.deepEqual(order.sectionSortOrders(order.moveItem(scanned, 2, 0)), [
    { id: 'l', sort_order: 16, before: 18 }, { id: 's', sort_order: 17, before: 16 }, { id: 'i', sort_order: 18, before: 17 },
  ], 'a scanned section keeps its own numbers (its place among the other sections)');
  // planMove: a section with numbers all different keeps them; numbers alike number the whole shop.
  const row = (id, sort_order) => ({ id, sort_order });
  assert.deepEqual(order.planMove([[row('c', 1), row('d', 2)], [row('s', 16), row('i', 17), row('l', 18)], []], 1, 2, 0), [
    { id: 'l', sort_order: 16, before: 18 }, { id: 's', sort_order: 17, before: 16 }, { id: 'i', sort_order: 18, before: 17 },
  ], 'a scanned section: only its own rows, its own numbers');
  assert.deepEqual(order.planMove([[row('c', 0), row('d', 0)], [row('s', 0), row('i', 0), row('l', 0)], [row('u', 0)]], 1, 2, 0), [
    { id: 'c', sort_order: 1, before: 0 }, { id: 'd', sort_order: 2, before: 0 }, { id: 'l', sort_order: 3, before: 0 },
    { id: 's', sort_order: 4, before: 0 }, { id: 'i', sort_order: 5, before: 0 }, { id: 'u', sort_order: 6, before: 0 },
  ], 'items added one at a time (all 0): the whole shop numbered in menu order, once');
  assert.deepEqual(order.planMove([[row('c', 1), row('d', 2)], [row('x', 0), row('y', 0)], []], 1, 1, 0), [
    { id: 'y', sort_order: 3, before: 0 }, { id: 'x', sort_order: 4, before: 0 },
  ], 'a scanned menu plus a section added by hand: numbered after the menu, not mixed in among it');
  assert.deepEqual(order.planMove([[row('n', 0), row('a', 5), row('b', 6)]], 0, 2, 0), [
    { id: 'b', sort_order: 0, before: 6 }, { id: 'n', sort_order: 5, before: 0 }, { id: 'a', sort_order: 6, before: 5 },
  ], 'one item added by hand to a scanned section: the numbers are still all different');
  assert.deepEqual(order.planMove([[row('a', 0), row('b', 0)]], 0, 1, 1), [], 'put back where it was: nothing');
  assert.deepEqual(order.planMove([[row('a', 0), row('b', 0)]], 0, 1, 7), [], 'nowhere to go: nothing');
  const lists = [
    { id: 'old', sort_order: 0, created_date: '2026-11-01T00:00:00Z' },
    { id: 'b', sort_order: 2, created_date: '2026-11-20T05:00:00Z' },
    { id: 'a', sort_order: 2, created_date: '2026-11-20T05:00:00Z' },
    { id: 'new', sort_order: 0, created_date: '2026-11-21T00:00:00Z' },
    { id: 'first', sort_order: 1, created_date: '2026-11-20T05:00:00Z' },
  ];
  assert.deepEqual(lists.slice().sort(order.compareProducts).map((p) => p.id), ['new', 'old', 'first', 'a', 'b'], 'sort_order, then newest first, then id');
  assert.deepEqual(order.withSortOrders(lists, [{ id: 'new', sort_order: 9 }]).map((p) => p.id), ['old', 'first', 'a', 'b', 'new']);
  passed('order helpers: a move keeps a section\'s own numbers, or numbers the whole shop in menu order once; the lists\' order');

  // ── 2. Holding and dragging in the list ─────────────────────────────────────────────────
  const drinks = [
    { id: 'soft', name: 'Soft Drinks', price: 2.99, is_active: true },
    { id: 'iced', name: 'Iced Tea', price: 2.99, is_active: true },
    { id: 'lemon', name: 'Freshly Squeezed Lemonade', price: 3.99, is_active: true },
    { id: 'smoothie', name: 'Fruit Smoothies', price: 4.99, is_active: true },
  ];
  const calls = { edit: [], hold: [], toggle: [], move: [] };
  const gridProps = (more = {}) => ({
    products: drinks, viewMode: 'list', currency: 'SGD',
    onEdit: (p) => calls.edit.push(p.id), onLongPress: (id) => calls.hold.push(id), onToggleSelect: (id) => calls.toggle.push(id),
    onMove: (from, to) => calls.move.push([from, to]), canMove: true, ...more,
  });
  const reset = () => { for (const k of Object.keys(calls)) calls[k].length = 0; scroll.top = 0; };
  let view = await mount(h(ui.ProductGrid, gridProps()));
  const cards = () => [...view.container.querySelectorAll('[data-reorder-id]')];
  assert.deepEqual(cards().map((c) => c.getAttribute('data-reorder-id')), ['soft', 'iced', 'lemon', 'smoothie']);
  // A tap edits.
  reset();
  await down(cards()[1], { y: 360 });
  await up({ y: 360 });
  await click(cards()[1]);
  assert.deepEqual([calls.edit, calls.hold, calls.move], [['iced'], [], []], 'a tap opens the item');
  // A finger that moves before the hold is up: the page scrolls, nothing is lifted.
  reset();
  await down(cards()[1], { y: 360 });
  await move({ y: 330 });
  await wait(ui.HOLD_MS + 60);
  assert.equal(cards()[1].style.transform, '', 'not lifted');
  assert.equal(touchMove(cards()[1]), false, 'its moves still scroll the page');
  await up({ y: 330 });
  assert.deepEqual([calls.edit, calls.hold, calls.move], [[], [], []]);
  // Hold, then let go: selected (no edit).
  reset();
  await down(cards()[2], { y: 470 });
  await wait(ui.HOLD_MS + 60);
  assert.equal(cards()[2].style.transform, 'scale(1.03)', 'lifted');
  assert.equal(scroll.top, 2, 'the page is nudged off its very top (no pull to refresh)');
  assert.equal(touchMove(cards()[2]), true, 'its touch moves no longer scroll the page');
  await up({ y: 470 });
  await click(cards()[2]);
  assert.deepEqual([calls.hold, calls.edit, calls.move], [['lemon'], [], []], 'let go: selected, and the click that follows doesn\'t open it');
  assert.equal(scroll.top, 0, 'the nudge is put back');
  assert.equal(cards()[2].style.transform, '', 'set down');
  // Hold, then drag up two places: the others make room, then the move.
  reset();
  await down(cards()[2], { y: 470 });
  await wait(ui.HOLD_MS + 60);
  await move({ y: 400 });
  await move({ y: 300 });
  await move({ y: 250 });
  await wait(40);
  assert.match(cards()[2].style.transform, /^translate\(0px, -2(1|2)\dpx\) scale\(1\.03\)$/, 'the item follows the finger');
  assert.equal(cards()[0].style.transform, 'translate(0px, 110px)', 'Soft Drinks makes room');
  assert.equal(cards()[1].style.transform, 'translate(0px, 110px)', 'Iced Tea makes room');
  assert.equal(cards()[3].style.transform, '', 'Fruit Smoothies stays');
  await up({ y: 250 });
  await click(cards()[2]);
  assert.deepEqual([calls.move, calls.hold, calls.edit], [[[2, 0]], [], []], 'moved from 3rd to 1st; not selected, not opened');
  await wait(40);
  assert.equal(cards()[0].style.transform, '', 'the room closes');
  // Dragged back to where it was: no move.
  reset();
  await down(cards()[1], { y: 360 });
  await wait(ui.HOLD_MS + 60);
  await move({ y: 420 });
  await move({ y: 362 });
  await up({ y: 362 });
  assert.deepEqual(calls.move, [], 'let go in its own place: nothing to save');
  passed('list: a tap opens, a finger that moves first scrolls, hold and let go selects, hold and drag moves (the others make room), no pull to refresh');

  // Without permission to move: holding still selects; dragging doesn't move.
  reset();
  await view.render(h(ui.ProductGrid, gridProps({ canMove: false })));
  await down(cards()[2], { y: 470 });
  await wait(ui.HOLD_MS + 60);
  await move({ y: 300 });
  await up({ y: 300 });
  assert.deepEqual([calls.move, calls.hold], [[], ['lemon']], 'no move without products.edit');
  passed('no move without permission (or while searching): holding still selects');

  // Select mode: the handle drags at once, and takes the arrow keys; a tap ticks.
  reset();
  await view.render(h(ui.ProductGrid, gridProps({ selectionMode: true, selectedIds: new Set(['iced']) })));
  const handles = () => [...view.container.querySelectorAll('button[aria-label^="Move "]')];
  assert.deepEqual(handles().map((b) => b.getAttribute('aria-label')), ['Move Soft Drinks', 'Move Iced Tea', 'Move Freshly Squeezed Lemonade', 'Move Fruit Smoothies']);
  assert.ok(handles().every((b) => b.hasAttribute('data-pull-refresh-block') && b.style.touchAction === 'none'), 'a handle never scrolls or pulls to refresh');
  await wait(480); // the click a hold ends with is ignored for a moment
  await click(cards()[0]);
  assert.deepEqual(calls.toggle, ['soft'], 'a tap ticks the item');
  calls.toggle.length = 0;
  await down(handles()[1], { y: 360 });
  await wait(ui.HOLD_MS + 60);
  await up({ y: 360 });
  await click(handles()[1]);
  assert.deepEqual([calls.hold, calls.toggle, calls.move, calls.edit], [[], [], [], []], 'a handle pressed and let go does nothing');
  await wait(480);
  await down(handles()[0], { y: 250 });
  assert.equal(scroll.top, 0, 'a handle needs no nudge');
  await move({ y: 330 });
  await move({ y: 470 });
  await up({ y: 470 });
  assert.deepEqual([calls.move, calls.hold], [[[0, 2]], []], 'dragged by the handle at once, no hold');
  reset();
  await act(async () => { handles()[3].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); });
  await act(async () => { handles()[0].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); });
  assert.deepEqual(calls.move, [[3, 2]], 'the arrow keys move it (not past the top)');
  await view.render(h(ui.ProductGrid, gridProps({ selectionMode: true, canMove: false })));
  assert.equal(handles().length, 0, 'no handles without permission to move');
  await view.render(h(ui.ProductGrid, gridProps({ selectionMode: false })));
  assert.equal(handles().length, 0, 'no handles outside select mode');
  passed('select mode: a tap ticks; the handle drags at once and takes the arrow keys; none without permission');
  await closeAll();

  // ── 3. The Products page ────────────────────────────────────────────────────────────────
  const now = '2026-11-20T05:28:44Z';
  globalThis.rows = {
    products: [
      { id: 'caesar', name: 'Grilled Chicken Caesar Salad', price: 12.99, category_id: 'menu', is_active: true, sort_order: 1, created_date: now },
      { id: 'club', name: 'Classic Club Sandwich', price: 10.99, category_id: 'menu', is_active: true, sort_order: 2, created_date: now },
      { id: 'soft', name: 'Soft Drinks', price: 2.99, category_id: 'bev', is_active: true, sort_order: 3, created_date: now },
      { id: 'iced', name: 'Iced Tea', price: 2.99, category_id: 'bev', is_active: true, sort_order: 4, created_date: now },
      { id: 'lemon', name: 'Freshly Squeezed Lemonade', price: 3.99, category_id: 'bev', is_active: true, sort_order: 5, created_date: now },
    ],
    categories: [{ id: 'menu', name: 'Menu and Prices', sort_order: 2 }, { id: 'bev', name: 'Beverages', sort_order: 3 }],
    inventory_items: [],
  };
  const writes = [];
  const query = (table) => {
    const q = { table, op: 'select', filters: [], values: null };
    const chain = {
      select() { return chain; }, order() { return chain; }, limit() { return chain; },
      eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
      in(col, val) { q.filters.push(['in', col, val]); return chain; },
      update(values) { q.op = 'update'; q.values = values; writes.push(q); return chain; },
      delete() { q.op = 'delete'; writes.push(q); return chain; },
      then(resolve, reject) {
        const error = globalThis.failWrites && q.op !== 'select' ? { message: 'Network request failed' } : null;
        return Promise.resolve({ data: q.op === 'select' ? (globalThis.rows[table] || []) : null, error }).then(resolve, reject);
      },
    };
    return chain;
  };
  globalThis.db = { from: query, auth: { getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({}) } };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  view = await mount(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(ui.Products))));
  await wait(40);
  const page = view.container;
  const named = (name) => [...page.querySelectorAll('[data-reorder-id]')].find((c) => text(c).includes(name));
  const sectionNames = () => [...page.querySelectorAll('section')].map((s) => [text(s.querySelector('h2')), [...s.querySelectorAll('[data-reorder-id]')].map((c) => c.getAttribute('data-reorder-id'))]);
  assert.deepEqual(sectionNames(), [['Menu and Prices', ['caesar', 'club']], ['Beverages', ['soft', 'iced', 'lemon']]]);
  assert.equal(page.querySelector('[data-testid="select-bar"]'), null);
  // Hold Iced Tea and let go: select mode.
  await down(named('Iced Tea'), { y: 360 });
  await wait(ui.HOLD_MS + 60);
  await up({ y: 360 });
  await wait(20);
  const bar = () => page.querySelector('[data-testid="select-bar"]');
  const deleteBar = () => page.querySelector('[data-testid="delete-bar"]');
  const barState = () => [text(bar().querySelector('[role="status"]')), text([...bar().querySelectorAll('button')].at(-1))];
  assert.ok(bar(), 'the select bar');
  assert.deepEqual(barState(), ['1 selected', 'Select all']);
  assert.equal(page.querySelector('h1'), null, 'the title and its buttons step aside');
  assert.equal(text(deleteBar()), 'Delete 1 product');
  assert.ok(page.querySelector('[data-testid="move-tip"]'), 'says the dots move items');
  // Hold another: added (not instead).
  await down(named('Soft Drinks'), { y: 250 });
  await wait(ui.HOLD_MS + 60);
  await up({ y: 250 });
  await wait(20);
  assert.deepEqual(barState(), ['2 selected', 'Select all']);
  // Select all, then Select none, then pick two.
  await click([...bar().querySelectorAll('button')].find((b) => text(b) === 'Select all'));
  assert.deepEqual(barState(), ['5 selected', 'Select none']);
  assert.equal(text(deleteBar()), 'Delete 5 products');
  await click([...bar().querySelectorAll('button')].find((b) => text(b) === 'Select none'));
  assert.deepEqual(barState(), ['0 selected', 'Select all']);
  assert.equal(text(deleteBar()), 'Select items to delete');
  assert.equal(deleteBar().querySelector('button').disabled, true);
  await click(named('Grilled Chicken Caesar Salad'));
  await click(named('Classic Club Sandwich'));
  assert.equal(text(deleteBar()), 'Delete 2 products');
  // The window that asks first.
  await click(deleteBar().querySelector('button'));
  const sheet = () => document.querySelector('[data-testid="delete-sheet"]');
  assert.ok(sheet(), 'asks first');
  assert.equal(sheet().getAttribute('role'), 'alertdialog');
  assert.equal(text(sheet().querySelector('h2')), 'Delete 2 products?');
  assert.match(text(sheet()), /Grilled Chicken Caesar Salad and Classic Club Sandwich will come off your menu, the Counter and your storefront, with their stock counts\./);
  assert.match(text(sheet()), /Past orders keep their names and prices\. This can’t be undone\./);
  const sheetButton = (label) => [...sheet().querySelectorAll('button')].find((b) => text(b) === label);
  assert.ok(sheetButton('Cancel') && sheetButton('Delete 2') && sheetButton('Hide them instead'));
  await click(sheetButton('Cancel'));
  assert.equal(sheet(), null, 'Cancel: nothing deleted');
  assert.equal(writes.length, 0);
  // Delete: stock counts, then the products (this shop's only), then select mode ends.
  await click(deleteBar().querySelector('button'));
  await click(sheetButton('Delete 2'));
  await wait(40);
  assert.deepEqual(writes.map((w) => [w.table, w.op, w.filters]), [
    ['inventory_items', 'delete', [['in', 'product_id', ['caesar', 'club']]]],
    ['products', 'delete', [['in', 'id', ['caesar', 'club']], ['eq', 'tenant_id', 'shop-1']]],
  ]);
  assert.deepEqual(globalThis.toasts.at(-1), { kind: 'success', message: '2 products deleted', options: undefined });
  assert.equal(bar(), null, 'select mode ends');
  assert.equal(sheet(), null);
  // Hide instead, for one.
  writes.length = 0;
  await down(named('Soft Drinks'), { y: 250 });
  await wait(ui.HOLD_MS + 60);
  await up({ y: 250 });
  await wait(20);
  await click(deleteBar().querySelector('button'));
  assert.equal(text(sheet().querySelector('h2')), 'Delete Soft Drinks?');
  assert.match(text(sheet()), /Soft Drinks will come off your menu, the Counter and your storefront, with its stock count\./);
  await click(sheetButton('Hide it instead'));
  await wait(40);
  assert.deepEqual(writes.map((w) => [w.table, w.op, w.values, w.filters]), [['products', 'update', { is_active: false }, [['in', 'id', ['soft']], ['eq', 'tenant_id', 'shop-1']]]]);
  assert.equal(globalThis.toasts.at(-1).message, 'Soft Drinks is hidden');
  assert.equal(bar(), null);
  // A failed delete says so and keeps select mode.
  writes.length = 0;
  globalThis.failWrites = true;
  await down(named('Iced Tea'), { y: 360 });
  await wait(ui.HOLD_MS + 60);
  await up({ y: 360 });
  await wait(20);
  await click(deleteBar().querySelector('button'));
  await click(sheetButton('Delete'));
  await wait(40);
  globalThis.failWrites = false;
  assert.equal(globalThis.toasts.at(-1).kind, 'error', 'a failure is shown (it used to fail in silence)');
  assert.ok(bar(), 'still selecting, to try again');
  await click(bar().querySelector('button[aria-label="Stop selecting"]'));
  assert.equal(bar(), null, '✕ ends select mode');
  passed('Products: hold selects (more holds add), Select all / none, Delete in the bottom bar, a window that says what goes and what stays, Delete, Hide instead, failures shown');

  // A move: saved at once, shown at once, with Undo.
  writes.length = 0;
  globalThis.toasts.length = 0;
  await down(named('Freshly Squeezed Lemonade'), { y: 420 });
  await wait(ui.HOLD_MS + 60);
  // In Beverages (soft, iced, lemon at places 0-2 of its own list): up two places.
  await move({ y: 350 });
  await move({ y: 260 });
  await move({ y: 200 });
  await up({ y: 200 });
  await wait(40);
  assert.deepEqual(sectionNames()[1], ['Beverages', ['lemon', 'soft', 'iced']], 'shown in the new order at once');
  assert.deepEqual(writes.map((w) => [w.op, w.values, w.filters]), [
    ['update', { sort_order: 3 }, [['eq', 'id', 'lemon'], ['eq', 'tenant_id', 'shop-1']]],
    ['update', { sort_order: 4 }, [['eq', 'id', 'soft'], ['eq', 'tenant_id', 'shop-1']]],
    ['update', { sort_order: 5 }, [['eq', 'id', 'iced'], ['eq', 'tenant_id', 'shop-1']]],
  ], 'the section keeps its numbers (3-5), in the new order');
  const moved = globalThis.toasts.at(-1);
  assert.equal(moved.message, 'Moved Freshly Squeezed Lemonade');
  assert.equal(moved.options.action.label, 'Undo');
  writes.length = 0;
  await act(async () => { moved.options.action.onClick(); await sleep(20); });
  assert.deepEqual(sectionNames()[1], ['Beverages', ['soft', 'iced', 'lemon']], 'Undo puts it back');
  assert.deepEqual(writes.map((w) => w.values.sort_order), [5, 3, 4]);
  // Items added one at a time (all 0, newest first): the first move numbers the whole shop.
  await closeAll();
  const at = (sec) => `2026-11-20T05:00:0${sec}Z`;
  globalThis.rows.products = globalThis.rows.products.map((p, i) => ({ ...p, sort_order: 0, created_date: at(5 - i) }));
  writes.length = 0;
  globalThis.toasts.length = 0;
  view = await mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MemoryRouter, null, h(ui.Products))));
  await wait(40);
  const page2 = view.container;
  const sections2 = () => [...page2.querySelectorAll('section')].map((sec) => [...sec.querySelectorAll('[data-reorder-id]')].map((c) => c.getAttribute('data-reorder-id')));
  assert.deepEqual(sections2(), [['caesar', 'club'], ['soft', 'iced', 'lemon']]);
  const lemon2 = [...page2.querySelectorAll('[data-reorder-id="lemon"]')][0];
  await down(lemon2, { y: 450 });
  await wait(ui.HOLD_MS + 60);
  await move({ y: 350 });
  await move({ y: 260 });
  await move({ y: 200 });
  await up({ y: 200 });
  await wait(40);
  assert.deepEqual(sections2(), [['caesar', 'club'], ['lemon', 'soft', 'iced']], 'shown at once');
  assert.deepEqual(writes.map((w) => [w.filters[0][2], w.values.sort_order]), [['caesar', 1], ['club', 2], ['lemon', 3], ['soft', 4], ['iced', 5]],
    'the whole shop numbered in menu order (so the storefront\'s All follows it too)');
  writes.length = 0;
  await act(async () => { globalThis.toasts.at(-1).options.action.onClick(); await sleep(20); });
  assert.deepEqual(writes.map((w) => w.values.sort_order), [0, 0, 0, 0, 0], 'Undo puts every number back');
  assert.deepEqual(sections2(), [['caesar', 'club'], ['soft', 'iced', 'lemon']]);
  await closeAll();
  globalThis.rows.products = globalThis.rows.products.map((p, i) => ({ ...p, sort_order: i + 1, created_date: now }));
  view = await mount(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MemoryRouter, null, h(ui.Products))));
  await wait(40);
  const page3 = view.container;
  const named3 = (name) => [...page3.querySelectorAll('[data-reorder-id]')].find((c) => text(c).includes(name));
  const bar3 = () => page3.querySelector('[data-testid="select-bar"]');

  // While searching: no move (the list is flat, mixing sections), even for spaces alone.
  const search = page3.querySelector('input[placeholder^="Search"]');
  const typeSearch = (value) => act(async () => {
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(search, value);
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(20);
  });
  const shown = () => [...page3.querySelectorAll('[data-reorder-id]')].map((c) => c.getAttribute('data-reorder-id'));
  for (const [typed, ids] of [['a', ['caesar', 'club', 'iced', 'lemon']], ['   ', ['caesar', 'club', 'soft', 'iced', 'lemon']]]) {
    writes.length = 0;
    await typeSearch(typed);
    assert.deepEqual(shown(), ids, `searching "${typed}": one flat list`);
    assert.equal(page3.querySelectorAll('section').length, 0);
    const last = ids.length - 1;
    await down(named3('Freshly Squeezed Lemonade'), { y: placeOf(last).top + 30 });
    await wait(ui.HOLD_MS + 60);
    await move({ y: 300 });
    await move({ y: 200 });
    await up({ y: 200 });
    await wait(20);
    assert.equal(writes.length, 0, `no move while searching "${typed}"`);
    assert.deepEqual(shown(), ids);
    if (bar3()) await click(bar3().querySelector('button[aria-label="Stop selecting"]'));
  }
  passed('Products: a move shows at once, saves sort_order (the section\'s, or the whole shop\'s once), and Undo puts it back; none while searching');
  await closeAll();

  // ── 4. The confetti ─────────────────────────────────────────────────────────────────────
  view = await mount(h(ui.Celebrate));
  assert.equal(view.container.querySelectorAll('[data-testid="confetti"]').length, 0, 'a browser that can\'t animate: no confetti');
  assert.equal(view.container.querySelector('path').style.strokeDashoffset, '0', 'the tick is simply there');
  await closeAll();
  const played = [];
  win.HTMLElement.prototype.animate = function animate(frames, options) { played.push({ el: this, frames, options }); return { cancel() {} }; };
  win.document.documentElement.animate = win.HTMLElement.prototype.animate;
  win.SVGElement.prototype.animate = win.HTMLElement.prototype.animate;
  view = await mount(h(ui.Celebrate));
  assert.equal(view.container.querySelectorAll('[data-testid="confetti"]').length, ui.CONFETTI_PIECES);
  assert.equal(played.length, ui.CONFETTI_PIECES + 2, 'the ring, the tick and every piece, once each');
  assert.ok(played.every((p) => p.options.iterations === undefined), 'played once');
  await closeAll();
  win.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} });
  played.length = 0;
  view = await mount(h(ui.Celebrate));
  assert.equal(view.container.querySelectorAll('[data-testid="confetti"]').length, 0, 'less motion asked for: no confetti');
  assert.equal(played.length, 0);
  await closeAll();
  passed('confetti: once, with the tick; none where the browser can\'t animate or the phone asks for less motion');
} finally {
  await closeAll().catch(() => {});
  dom.window.close();
}
console.log(`\n${passes} hold, move and delete checks passed`);
setTimeout(() => process.exit(process.exitCode ?? 0), 50);
