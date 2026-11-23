// Handover QR (Alvin, 23 Nov 2026): the buyer's QR for a home seller's order, from the server, and
// the seller's scan that verifies it and marks the order collected / delivered in one go. Checks
// lib/handover.js; that the QR the buyer is shown reads back as the right link (jsQR, the
// scanner's own decoder) and clears to "Collected ✓" the moment the seller scans it; the scanner
// sheet's every path against stand-in server answers; the Orders page (Scan buyer's QR instead of
// Mark collected / delivered, the QR's track, the verified record, Scan QR, a sellio.sg/Orders?qr=
// link, the courier link); the courier's page (sellio.sg/courier/…); the store page's "Your
// orders"; and My purchases.
// Run: node verification/handover-qr.dom.mjs /tmp/sellio-verification   (jsdom installed there)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Orders', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLFormElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'SubmitEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'history', 'location']) {
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
win.HTMLCanvasElement.prototype.getContext = () => null; // no canvas here: the jsQR reader reads nothing

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
globalThis.__h = h;
console.warn = () => {};
console.info = () => {};

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
const TOKEN = '0123456789abcdef0123456789abcdef';
const TOKEN_B = 'fedcba9876543210fedcba9876543210';
globalThis.toasts = [];
globalThis.appUserFixture = { id: 'user-1', email: 'ann@example.com' };
const homeShop = { id: 'shop-1', name: 'Ann Bakes', industry: 'fnb', seller_type: 'individual', country: 'SG', settings: { currency: 'SGD' } };
globalThis.tenantFixture = {
  tenantId: 'shop-1', tenant: homeShop, hasPermission: () => true, subscription: null, canUseFeature: () => true, isLoading: false,
};
globalThis.rows = { orders: [] };
let calls = [];
globalThis.rpcHandler = async () => ({ data: null, error: null });
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
  rpc: async (name, args) => { calls.push({ name, args }); return globalThis.rpcHandler(name, args); },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};
const rpcs = (name) => calls.filter((c) => c.name === name);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-handover-qr-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * as handover from '@/lib/handover';",
  "export { default as HandoverPass } from '@/components/handover/HandoverPass';",
  "export { default as QrScanner } from '@/components/handover/QrScanner';",
  "export { default as HandoverSheet } from '@/components/handover/HandoverSheet';",
  "export { ShopOrderHistory, ShopHandoverCard } from '@/components/shop/ShopStorefront';",
  "export { PurchaseDetail } from '@/components/explore/ExplorePurchases';",
  "export { default as Orders } from '@/pages/Orders';",
  "export { default as CourierHandover } from '@/pages/CourierHandover';",
  "export { default as CourierLinkSheet } from '@/components/handover/CourierLinkSheet';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), message: note("message"), custom: note("custom"), dismiss() {} });',
    'export const Toaster = () => null;',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://x.invalid";',
  appUser: 'export const useAppUser = () => ({ appUser: globalThis.appUserFixture }); export const cookieUtils = { clear() {} };',
  tenant: 'export const useTenant = () => globalThis.tenantFixture;',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  printer: 'export const loadPrinterConfig = async () => null; export const buildOrderReceipt = () => ""; export const buildOrderChit = () => ""; export const buildTableReceipt = () => ""; export const sendViaBluetooth = async () => {}; export const sendViaEpsonEPos = async () => {};',
  tableBill: 'export const loadTableBillForOrder = async () => null; export const paymentText = () => ""; export const tableReceiptHtml = () => "";',
  alerts: 'const alerts = { on: false, setOn() {}, every: 60, setEvery() {}, ring() {}, seen() {} }; export const useOrderAlerts = () => alerts; export const REMIND_EVERY = [30, 60];',
  nothing: 'export default function Nothing() { return null; } export const ShopMethodBadge = () => null; export const SkeletonList = () => null; export const OrderRateRow = () => null; export const RateOrderSheet = () => null;',
  loading: 'export default function LoadingShapes({ label }) { return globalThis.__h("div", { "data-testid": "loading" }, label); }',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getOrdersSteps = () => [];',
  appFiles: 'export const inAppFiles = () => false; export const saveFileInApp = () => {};',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
  tabbar: "export default function TabBar() { return null; } export const TAB_BAR_SPACE = '80px';",
  // The sheet's camera: the test plays the scans (QrScanner itself is checked on its own).
  scanner: 'export default function QrScanner({ onResult, paused }) { globalThis.scan = (text) => { if (!paused) onResult(text); }; return globalThis.__h("div", { "data-testid": "qr-scanner" }); }',
};
const mock = { name: 'handover-qr-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/AppUserContext$/, 'appUser');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/lib\/printerUtils$/, 'printer');
  route(/lib\/tableBill$/, 'tableBill');
  route(/lib\/useOrderAlerts$/, 'alerts');
  route(/orders\/(TableCallAlerts|EditOrderModal|ChitPreviewSheet)$|tour\/(TourGuide|DummyOrderCard)$|shop\/ShopOrderInfo$|ui-custom\/AppLoader$|ratings\/RatingParts$/, 'nothing');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/lib\/useBackToClose$/, 'back');
  route(/ExploreTabBar$/, 'tabbar');
  b.onResolve({ filter: /QrScanner$/ }, (args) => (/(HandoverSheet|CourierHandover)\.jsx$/.test(args.importer) ? { path: 'scanner', namespace: 'mock' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path], resolveDir: process.cwd() }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.handover-qr.mjs');
await copyFile(outfile, local);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = async (ms = 0) => { await act(async () => { await sleep(ms); }); };
const click = async (el) => { assert.ok(el, 'nothing to click'); await act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); };
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const byTestId = (root, id) => root.querySelector(`[data-testid="${id}"]`);
const type = async (field, value) => {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new win.Event('input', { bubbles: true })); });
};
const submit = async (form) => { await act(async () => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); }); };
const roots = [];
async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  roots.push({ root, container });
  return { container, root };
}
async function closeAll() {
  for (const { root, container } of roots.splice(0)) { await act(async () => root.unmount()); container.remove(); }
  document.body.innerHTML = '';
}

try {
  const app = await import(pathToFileURL(local).href);


  const { handover } = app;
  const ready = (n, extra = {}) => ({
    id: `o${n}`, order_number: `ORD-0000${n}`, status: 'ready', type: 'takeaway', customer_name: 'Cai Ling', total_amount: 12.5,
    payment_status: 'unpaid', items: [{ name: 'Kaya toast', quantity: 2, price: 5 }, { name: 'Teh', quantity: 1, price: 2.5 }],
    fulfilment: { method: 'collection' }, created_date: new Date(Date.now() - n * 60000).toISOString(), ...extra,
  });
  const scanned = (extra = {}) => ({
    ok: true, order_id: 'o12', order_number: 'ORD-000012', method: 'collection', customer_name: 'Cai Ling',
    items: [{ name: 'Kaya toast', quantity: 2, price: 5 }, { name: 'Teh', quantity: 1, price: 2.5 }], total_amount: 12.5,
    verified_at: '2026-11-23T08:15:00Z', verified_via: 'qr', verified_by_name: 'Ann', ...extra,
  });

  // ── 1. The helpers ─────────────────────────────────────────────────────────────────────
  assert.equal(handover.handoverLink(TOKEN), `https://sellio.sg/Orders?qr=${TOKEN}`);
  assert.equal(handover.tokenFromScan(handover.handoverLink(TOKEN)), TOKEN);
  assert.equal(handover.tokenFromScan(`https://www.sellio.sg/Orders?qr=${TOKEN.toUpperCase()}`), TOKEN);
  assert.equal(handover.tokenFromScan(` ${TOKEN} `), TOKEN, 'a bare token');
  assert.equal(handover.tokenFromScan(`https://evil.example/Orders?qr=${TOKEN}`), null, 'another site');
  assert.equal(handover.tokenFromScan('https://sellio.sg/Orders?qr=abc'), null);
  assert.equal(handover.tokenFromScan('WIFI:S:cafe;T:WPA;P:secret;;'), null);
  assert.equal(handover.tokenFromScan(''), null);
  assert.equal(handover.cleanPin(' 12-34 56x7'), '123456');
  assert.equal(handover.spacedPin('012345'), '012 345');
  assert.equal(handover.spacedPin('12345'), '');
  assert.equal(handover.handoverMethod({ fulfilment: { method: 'delivery' } }), 'delivery');
  assert.equal(handover.handoverMethod({ type: 'delivery' }), 'delivery');
  assert.equal(handover.handoverMethod({ fulfilment: { method: 'collection' } }), 'collection');
  localStorage.clear();
  passed('Links (sellio.sg/Orders?qr=), tokens from scans (only sellio.sg or a bare token), codes typed with spaces');

  // ── 2. The buyer's QR: from the server, reads back right, clears when scanned ───────────
  {
    calls = [];
    let answer = { token: TOKEN, pin: '012345', issued_at: '2026-11-23T07:00:00Z', status: 'ready' };
    globalThis.rpcHandler = async (name) => (name === 'my_handover' ? { data: answer, error: null } : { data: null, error: null });
    let handedOver = null;
    const words = { title: 'Collection QR', hint: 'Show this', codeLabel: 'Or read out this code', done: 'Collected', verifiedQr: 'Verified by QR scan', verifiedPin: 'Verified with your code', when: () => '23 Nov, 4:15 pm' };
    const view = await mount(h(app.HandoverPass, { orderId: 'o1', words, onHandedOver: (a) => { handedOver = a; } }));
    for (let i = 0; i < 50 && !byTestId(view.container, 'handover-pass-qr'); i += 1) await wait(20);
    const img = byTestId(view.container, 'handover-pass-qr');
    assert.ok(img?.getAttribute('src')?.startsWith('data:image/png;base64,'));
    const { PNG } = appRequire('pngjs');
    const jsQR = appRequire('jsqr');
    const png = PNG.sync.read(Buffer.from(img.getAttribute('src').split(',')[1], 'base64'));
    const read = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: 'dontInvert' });
    assert.equal(read?.data, `https://sellio.sg/Orders?qr=${TOKEN}`);
    assert.equal(handover.tokenFromScan(read.data), TOKEN);
    assert.equal(text(byTestId(view.container, 'handover-pass-pin')), '012 345');
    assert.deepEqual(rpcs('my_handover')[0].args, { p_order_id: 'o1' });
    assert.equal(localStorage.length, 0, 'nothing kept on the phone');
    // The seller scans it: on the next ask the QR clears.
    answer = { status: 'completed', issued_at: '2026-11-23T07:00:00Z', verified_at: '2026-11-23T08:15:00Z', verified_via: 'qr' };
    await wait(4300);
    assert.ok(!byTestId(view.container, 'handover-pass-qr'), 'the QR is gone');
    assert.equal(text(byTestId(view.container, 'handover-pass-done')), '✓CollectedVerified by QR scan · 23 Nov, 4:15 pm');
    assert.equal(handedOver?.verified_via, 'qr', 'the screen is told, to reload the order');
    const asked = rpcs('my_handover').length;
    await wait(4300);
    assert.equal(rpcs('my_handover').length, asked, 'it stops asking once handed over');
    await closeAll();

    globalThis.rpcHandler = async () => ({ data: null, error: null });
    let none = 0;
    const nobody = await mount(h(app.HandoverPass, { orderId: 'o9', words, onNone: () => { none += 1; } }));
    await wait(20);
    assert.equal(nobody.container.innerHTML, '', 'no QR for this account: nothing');
    assert.equal(none, 1);
    await closeAll();
    passed('The buyer’s QR comes from the server (nothing kept on the phone), reads back as the sellio.sg link with their token, and clears to "✓ Collected" within seconds of the seller’s scan');
  }

  // ── 3. The camera, where there is none ─────────────────────────────────────────────────
  {
    const view = await mount(h(app.QrScanner, { onResult() {} }));
    await wait(20);
    assert.match(text(byTestId(view.container, 'qr-scanner-problem')), /can’t open the camera\. Type the buyer’s 6-digit code instead\./);
    await closeAll();
    let tracks = 0;
    let stopped = 0;
    const realMedia = Object.getOwnPropertyDescriptor(win.navigator, 'mediaDevices');
    Object.defineProperty(win.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } } });
    const blocked = await mount(h(app.QrScanner, { onResult() {} }));
    await wait(20);
    assert.match(text(byTestId(blocked.container, 'qr-scanner-problem')), /isn’t allowed to use the camera.*Try the camera again/);
    await closeAll();
    Object.defineProperty(win.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      tracks += 1;
      return { getTracks: () => [{ stop() { stopped += 1; } }], getVideoTracks: () => [{}] };
    } } });
    win.HTMLMediaElement.prototype.play = async () => {};
    await mount(h(app.QrScanner, { onResult() {} }));
    await wait(30);
    await closeAll();
    assert.equal(tracks, 1);
    assert.equal(stopped, 1, 'closing the scanner turns the camera off');
    if (realMedia) Object.defineProperty(win.navigator, 'mediaDevices', realMedia); else delete win.navigator.mediaDevices;
    passed('The scanner says what’s wrong with the camera (none, not allowed) and turns the camera off when it closes');
  }

  // ── 4. The seller: the 6-digit code; the success screen; Scan next ─────────────────────
  {
    calls = [];
    globalThis.rpcHandler = async (name, args) => {
      if (name === 'shop_handover_pin') {
        if (args.p_pin === '654321') return { data: scanned({ verified_via: 'pin' }), error: null };
        return { data: { ok: false, reason: 'wrong_pin', order_id: 'o12', tries_left: 4 }, error: null };
      }
      return { data: null, error: null };
    };
    const done = [];
    let closed = 0;
    const order = ready(12);
    const view = await mount(h(app.HandoverSheet, {
      tenantId: 'shop-1', orders: [order], handovers: { o12: { order_id: 'o12', has_qr: true, pin_paused_until: null } },
      startOrder: order, onDone: (a) => done.push(a), onClose: () => { closed += 1; },
    }));
    const sheet = byTestId(view.container, 'handover-sheet');
    assert.match(text(sheet), /^Order #ORD-000012/);
    assert.equal(text(byTestId(sheet, 'handover-order')), 'Cai Ling2× Kaya toast, 1× Teh');
    assert.ok(byTestId(sheet, 'qr-scanner'), 'the camera is open');
    await type(byTestId(sheet, 'handover-pin'), '11 11 11');
    assert.equal(byTestId(sheet, 'handover-pin').value, '111111');
    await submit(byTestId(sheet, 'handover-pin-form'));
    await wait();
    assert.equal(text(byTestId(sheet, 'handover-note')), 'That code is wrong. 4 more tries, then a 5-minute wait.');
    assert.deepEqual(rpcs('shop_handover_pin')[0].args, { p_tenant_id: 'shop-1', p_order_id: 'o12', p_pin: '111111' });
    await type(byTestId(sheet, 'handover-pin'), '654321');
    await submit(byTestId(sheet, 'handover-pin-form'));
    await wait();
    const success = byTestId(sheet, 'handover-done');
    assert.match(text(success), /^Collected/);
    assert.match(text(success), /Verified with the buyer’s code · Nov 23, \d{1,2}:15 (AM|PM)/);
    assert.deepEqual([...byTestId(sheet, 'handover-items').querySelectorAll('li')].map(text), ['2× Kaya toast', '1× Teh'], 'what to hand over');
    assert.ok(!byTestId(sheet, 'qr-scanner'), 'the camera is off');
    assert.equal(done.length, 1, 'the page is told (to reload its orders)');
    assert.ok(!sheet.textContent.includes('paid'), 'nothing about payment');
    await click(byTestId(sheet, 'handover-scan-next'));
    assert.match(text(sheet), /^Scan buyer’s QR/, 'Scan next: back to the camera, no order picked');
    assert.ok(byTestId(sheet, 'qr-scanner'));
    assert.ok(!byTestId(sheet, 'handover-pin-form'), 'a code is typed on its order’s card');
    assert.match(text(sheet), /To type a 6-digit code instead, tap Scan QR on the order\./);
    await closeAll();
    assert.equal(closed, 0);
    passed('Seller, typed code: a wrong code says the tries left before a 5-minute wait; the right one verifies, completes and shows what to hand over (no payment, no extra button); Scan next goes back to the camera');
  }

  // ── 5. The seller: scanning ────────────────────────────────────────────────────────────
  {
    calls = [];
    globalThis.rpcHandler = async (name, args) => {
      if (name !== 'shop_handover_scan') return { data: null, error: null };
      if (args.p_token === TOKEN) return { data: scanned({ order_id: 'o13', order_number: 'ORD-000013', method: 'delivery' }), error: null };
      if (args.p_token === TOKEN_B) return { data: { ok: false, reason: 'already', order_id: 'o12', order_number: 'ORD-000012', method: 'collection', verified_at: '2026-11-23T08:15:00Z', verified_by_name: 'Ann' }, error: null };
      if (args.p_token === '11111111111111111111111111111111') return { data: { ok: false, reason: 'other_shop' }, error: null };
      return { data: { ok: false, reason: 'unknown' }, error: null };
    };
    const view = await mount(h(app.HandoverSheet, { tenantId: 'shop-1', orders: [ready(12)], handovers: {}, onDone() {}, onClose() {} }));
    const sheet = byTestId(view.container, 'handover-sheet');
    assert.match(text(sheet), /^Scan buyer’s QR/);
    await act(async () => { globalThis.scan('https://wa.me/6591234567'); });
    assert.equal(text(byTestId(sheet, 'handover-note')), 'That isn’t a Sellio QR.');
    assert.equal(rpcs('shop_handover_scan').length, 0, 'nothing is sent for a QR that isn’t Sellio’s');
    await act(async () => { globalThis.scan(handover.handoverLink('11111111111111111111111111111111')); });
    await wait();
    assert.equal(text(byTestId(sheet, 'handover-note')), 'This QR is for an order from another shop.');
    await act(async () => { globalThis.scan(handover.handoverLink(TOKEN_B)); });
    await wait();
    assert.match(text(byTestId(sheet, 'handover-note')), /^Already used: order #ORD-000012 was collected Nov 23, \d{1,2}:15 (AM|PM)\. \(Ann\)$/, 'a QR used before says when and by whom');
    await act(async () => { globalThis.scan(handover.handoverLink('22222222222222222222222222222222')); });
    await wait();
    assert.match(text(byTestId(sheet, 'handover-note')), /^This QR isn’t one of your orders’/);
    await act(async () => { globalThis.scan(handover.handoverLink(TOKEN)); });
    await wait();
    assert.deepEqual(rpcs('shop_handover_scan').at(-1).args, { p_tenant_id: 'shop-1', p_token: TOKEN });
    assert.match(text(byTestId(sheet, 'handover-done')), /^Delivered/, 'a delivery order scanned at the door');
    assert.match(text(sheet), /^Order #ORD-000013/);
    await closeAll();
    passed('Seller, scanning: another app’s QR (nothing sent), another shop’s, one used before (when, by whom), an unknown one; a delivery order’s QR: Delivered');
  }

  // ── 6. The code's wait after wrong tries; not loaded yet; a link ───────────────────────
  {
    const order = ready(12);
    const until = new Date(Date.now() + 4 * 60000).toISOString();
    calls = [];
    globalThis.rpcHandler = async (name) => (name === 'shop_handover_pin'
      ? { data: { ok: false, reason: 'paused', order_id: 'o12', paused_until: until }, error: null }
      : { data: null, error: null });
    const paused = await mount(h(app.HandoverSheet, { tenantId: 'shop-1', orders: [order], handovers: { o12: { has_qr: true, pin_paused_until: until } }, startOrder: order, onDone() {}, onClose() {} }));
    assert.match(text(byTestId(paused.container, 'handover-paused')), /^Too many wrong codes\. Try the code again after \d{1,2}:\d\d (AM|PM), or scan the buyer’s QR\.$/);
    assert.ok(byTestId(paused.container, 'handover-pin-form'), 'never locked for good: the code can be typed again after the wait');
    await type(byTestId(paused.container, 'handover-pin'), '123456');
    await submit(byTestId(paused.container, 'handover-pin-form'));
    await wait();
    assert.match(text(byTestId(paused.container, 'handover-note')), /^Too many wrong codes\. Try the code again after /, 'the server’s answer says when');
    await closeAll();
    const over = await mount(h(app.HandoverSheet, { tenantId: 'shop-1', orders: [order], handovers: { o12: { has_qr: true, pin_paused_until: new Date(Date.now() - 1000).toISOString() } }, startOrder: order, onDone() {}, onClose() {} }));
    assert.ok(!byTestId(over.container, 'handover-paused'), 'a wait that’s over isn’t shown');
    await closeAll();
    const loading = await mount(h(app.HandoverSheet, { tenantId: 'shop-1', orders: [order], handovers: null, startOrder: order, onDone() {}, onClose() {} }));
    assert.ok(byTestId(loading.container, 'handover-pin-form'), 'not loaded yet: the code can be typed (the server says)');
    await closeAll();
    calls = [];
    globalThis.rpcHandler = async (name) => (name === 'shop_handover_scan' ? { data: scanned(), error: null } : { data: null, error: null });
    const link = await mount(h(app.HandoverSheet, { tenantId: 'shop-1', orders: [order], handovers: {}, startToken: TOKEN, onDone() {}, onClose() {} }));
    await wait();
    assert.deepEqual(rpcs('shop_handover_scan')[0].args, { p_tenant_id: 'shop-1', p_token: TOKEN });
    assert.match(text(byTestId(link.container, 'handover-done')), /^Collected/);
    await closeAll();
    passed('After 5 wrong codes the code waits (until when, from the page or the server’s answer; never locked for good), the list not loaded yet (the code can still be typed), and a link that scans straight away');
  }

  // ── 7. Orders: Scan buyer's QR instead of Mark collected / delivered; the track; a link ──
  {
    calls = [];
    const minute = 60000;
    const deliveryTo = { type: 'delivery', fulfilment: { method: 'delivery', address: '2 Test Ave' } };
    globalThis.rows.orders = [
      ready(31),
      ready(32, deliveryTo),
      ready(33),
      { ...ready(34), status: 'completed', payment_status: 'paid' },
      { ...ready(35), status: 'preparing' },
      ready(36, deliveryTo),
      { ...ready(37, deliveryTo), status: 'completed', payment_status: 'paid' },
    ];
    const shown = new Date(Date.now() - 2 * minute).toISOString();
    const LINK = 'abcdefabcdefabcdefabcdefabcdef12';
    let o32link = null; // what the server has for o32's courier link
    globalThis.rpcHandler = async (name, args) => {
      if (name === 'shop_handovers') {
        return { data: [
          { order_id: 'o31', has_qr: true, issued_at: '2026-11-23T07:02:00Z', first_shown_at: shown, last_shown_at: shown, verified_at: null },
          { order_id: 'o32', has_qr: true, issued_at: '2026-11-23T07:02:00Z', first_shown_at: null, last_shown_at: null, verified_at: null,
            courier_link: o32link?.link || null, courier_name: o32link?.courier_name || null, courier_link_expires_at: o32link?.expires_at || null,
            courier_opened_at: o32link ? '2026-11-23T08:52:00Z' : null },
          { order_id: 'o34', has_qr: true, issued_at: '2026-11-23T07:02:00Z', verified_at: '2026-11-23T08:15:00Z', verified_via: 'qr', verified_by_name: 'Ann' },
          { order_id: 'o35', has_qr: true, issued_at: '2026-11-23T07:02:00Z', verified_at: null },
          { order_id: 'o36', has_qr: true, issued_at: '2026-11-23T07:02:00Z', verified_at: null, courier_link: LINK, courier_name: null,
            courier_link_expires_at: '2026-11-24T08:30:00Z', courier_opened_at: '2026-11-23T08:52:00Z' },
          { order_id: 'o37', has_qr: true, issued_at: '2026-11-23T07:02:00Z', verified_at: '2026-11-23T08:10:00Z', verified_via: 'qr',
            verified_by_name: 'Ahmad', verified_by_courier: true },
        ].filter((r) => args.p_order_ids.includes(r.order_id)), error: null };
      }
      if (name === 'shop_handover_scan') return { data: { ok: false, reason: 'unknown' }, error: null };
      if (name === 'shop_courier_link') {
        if (args.p_stop) { o32link = null; return { data: { ok: true, order_id: args.p_order_id, stopped: true }, error: null }; }
        o32link = { link: LINK, courier_name: args.p_courier_name, expires_at: '2026-11-24T08:30:00Z' };
        return { data: { ok: true, order_id: args.p_order_id, ...o32link, made_at: '2026-11-23T08:30:00Z' }, error: null };
      }
      return { data: null, error: null };
    };
    let where = null;
    const Where = () => { where = useLocation(); return null; };
    const view = await mount(h(QueryClientProvider, { client: new QueryClient() },
      h(MemoryRouter, { initialEntries: [`/Orders?qr=${TOKEN}`] }, h(Routes, null, h(Route, { path: '/Orders', element: h(React.Fragment, null, h(app.Orders), h(Where)) })))));
    await wait(30);
    const card = (num) => [...view.container.querySelectorAll('[data-sellio-order-card]')].find((c) => text(c).includes(num));
    assert.equal(text(byTestId(card('ORD-000031'), 'order-scan-qr')), 'Scan QR', 'ready for collection: scan');
    assert.equal(text(byTestId(card('ORD-000032'), 'order-scan-qr')), 'Scan QR', 'out for delivery: scan too');
    assert.ok(!buttonNamed(card('ORD-000031'), 'Mark collected') && !buttonNamed(card('ORD-000032'), 'Mark delivered'));
    assert.equal(text(card('ORD-000033').querySelector('[data-tour="order-status-btn"]')), 'Mark collected', 'no buyer QR (placed signed out / before): as before');
    assert.equal(text(card('ORD-000035').querySelector('[data-tour="order-status-btn"]')), 'Ready for collection', 'earlier steps: as before');
    assert.match(text(byTestId(card('ORD-000031'), 'handover-track')), /^QR issued \d{1,2}:02 (AM|PM) · Shown on the buyer’s phone \d{1,2}:\d\d (AM|PM)$/);
    assert.match(text(byTestId(card('ORD-000032'), 'handover-track')), /^QR issued \d{1,2}:02 (AM|PM) · Not opened by the buyer yet$/);
    assert.match(text(byTestId(card('ORD-000034'), 'handover-record')), /^Verified by QR scan · Nov 23, \d{1,2}:15 (AM|PM) · Ann$/);
    assert.match(text(byTestId(card('ORD-000037'), 'handover-record')), /^Verified by QR scan · Nov 23, \d{1,2}:10 (AM|PM) · Courier \(Ahmad\)$/, 'delivered through the courier link');
    assert.deepEqual(rpcs('shop_handovers')[0].args.p_order_ids, ['o31', 'o32', 'o33', 'o34', 'o35', 'o36', 'o37'], 'every order of the shop');
    // The courier link: on delivery orders still to hand over, not on collection ones.
    assert.ok(!byTestId(card('ORD-000031'), 'order-courier-link'), 'self-collect: no courier link');
    assert.equal(text(byTestId(card('ORD-000032'), 'order-courier-link')), 'Send a courier link');
    assert.match(text(byTestId(card('ORD-000036'), 'order-courier-link')), /^Courier link · opened \d{1,2}:52 (AM|PM)$/);
    assert.ok(!byTestId(card('ORD-000037'), 'order-courier-link'), 'handed over: no link');
    assert.ok(!buttonNamed(card('ORD-000036'), 'Mark delivered'), 'no Mark delivered either');
    // The ?qr= link: the sheet opened and scanned it, and the link was taken off the address.
    assert.ok(byTestId(document.body, 'handover-sheet'));
    assert.deepEqual(rpcs('shop_handover_scan')[0].args, { p_tenant_id: 'shop-1', p_token: TOKEN });
    assert.equal(where.search, '');
    await click(buttonNamed(byTestId(document.body, 'handover-sheet'), ''));
    await wait();
    assert.ok(!byTestId(document.body, 'handover-sheet'), 'closed');
    await click(byTestId(card('ORD-000031'), 'order-scan-qr'));
    assert.match(text(byTestId(document.body, 'handover-sheet')), /^Order #ORD-000031/);
    assert.ok(byTestId(document.body, 'handover-pin-form'));
    await click(buttonNamed(byTestId(document.body, 'handover-sheet'), ''));
    await click(byTestId(view.container, 'orders-scan-qr'));
    assert.match(text(byTestId(document.body, 'handover-sheet')), /^Scan buyer’s QR/);
    await click(buttonNamed(byTestId(document.body, 'handover-sheet'), ''));
    // Make a courier link for o32, send it, copy it, stop it.
    let copiedText = null;
    Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { copiedText = value; } } });
    win.confirm = () => true;
    await click(byTestId(card('ORD-000032'), 'order-courier-link'));
    let sheet = byTestId(document.body, 'courier-sheet');
    assert.match(text(sheet), /^Courier linkOrder #ORD-000032/);
    assert.match(text(sheet), /Booked a courier or a runner\? Send them a link\./);
    await type(byTestId(sheet, 'courier-name-input'), '  Ahmad ');
    await submit(byTestId(sheet, 'courier-make-form'));
    await wait(30);
    assert.deepEqual(rpcs('shop_courier_link')[0].args, { p_tenant_id: 'shop-1', p_order_id: 'o32', p_courier_name: 'Ahmad', p_stop: false });
    sheet = byTestId(document.body, 'courier-sheet');
    assert.equal(text(byTestId(sheet, 'courier-url')), `https://sellio.sg/courier/${LINK}`);
    assert.equal(text(byTestId(sheet, 'courier-name')), 'For Ahmad');
    assert.match(text(byTestId(sheet, 'courier-status')), /^Works once, until Nov 24, \d{1,2}:30 (AM|PM)\. Opened by the courier Nov 23, \d{1,2}:52 (AM|PM)\.$/, 'the page’s info caught up (opened)');
    const wa = byTestId(sheet, 'courier-whatsapp').getAttribute('href');
    assert.ok(wa.startsWith('https://wa.me/?text='));
    assert.equal(decodeURIComponent(wa.split('text=')[1]),
      `Delivery for order #ORD-000032 from Ann Bakes. At the door, open this link and scan the QR in the buyer’s Sellio order: https://sellio.sg/courier/${LINK}`);
    await click(byTestId(sheet, 'courier-copy'));
    await wait();
    assert.equal(copiedText, `https://sellio.sg/courier/${LINK}`);
    assert.equal(text(byTestId(sheet, 'courier-copy')), 'Copied');
    assert.match(text(byTestId(card('ORD-000032'), 'order-courier-link')), /^Courier link · opened /, 'the card follows');
    await click(byTestId(sheet, 'courier-remake'));
    await wait(30);
    assert.deepEqual(rpcs('shop_courier_link')[1].args, { p_tenant_id: 'shop-1', p_order_id: 'o32', p_courier_name: 'Ahmad', p_stop: false }, 'a new link keeps the courier’s name');
    await click(byTestId(sheet, 'courier-stop'));
    await wait(30);
    assert.deepEqual(rpcs('shop_courier_link')[2].args, { p_tenant_id: 'shop-1', p_order_id: 'o32', p_courier_name: null, p_stop: true });
    sheet = byTestId(document.body, 'courier-sheet');
    assert.ok(byTestId(sheet, 'courier-make-form'), 'stopped: a new one can be made');
    assert.equal(text(byTestId(sheet, 'courier-note')), 'Link stopped. The courier can’t use it any more.');
    assert.equal(text(byTestId(card('ORD-000032'), 'order-courier-link')), 'Send a courier link');
    await click(buttonNamed(sheet, ''));
    assert.ok(!byTestId(document.body, 'courier-sheet'), 'closed');
    await closeAll();

    globalThis.tenantFixture = { ...globalThis.tenantFixture, tenant: { ...homeShop, seller_type: 'business' } };
    calls = [];
    const business = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(30);
    assert.ok(!byTestId(business.container, 'orders-scan-qr'), 'a business store: no Scan QR (yet)');
    assert.ok(!business.container.querySelector('[data-testid="order-scan-qr"]'));
    assert.equal(rpcs('shop_handovers').length, 0);
    await closeAll();
    globalThis.tenantFixture = { ...globalThis.tenantFixture, tenant: homeShop, hasPermission: (p) => p !== 'orders.edit' };
    const viewer = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(30);
    assert.ok(!byTestId(viewer.container, 'orders-scan-qr'), 'someone who can’t update orders: no Scan QR');
    await closeAll();
    globalThis.tenantFixture = { ...globalThis.tenantFixture, hasPermission: () => true };
    passed('Orders: ready / out-for-delivery orders whose buyer has a QR say Scan QR (no Mark collected / delivered; others as before), the QR’s track and the verified record (a courier’s too) show, Scan QR and a ?qr= link open the scanner; delivery orders get a courier link (made with the courier’s name, sent on WhatsApp, copied, remade, stopped); not for business stores or staff who can’t update orders');
  }

  // ── 8. The store page ──────────────────────────────────────────────────────────────────
  {
    calls = [];
    globalThis.rpcHandler = async (name, args) => (name === 'my_handover'
      ? { data: args.p_order_id === 's1' ? { token: TOKEN, pin: '987654', status: 'ready' } : null, error: null }
      : { data: null, error: null });
    const shopOrder = (id, status, method = 'collection') => ({
      id, order_number: `ORD-${id}`, status, created_date: new Date().toISOString(), items: [], total_amount: 5, payment_status: 'unpaid',
      fulfilment: { method },
    });
    const orders = [shopOrder('s1', 'ready'), shopOrder('s2', 'completed'), shopOrder('s3', 'confirmed', 'delivery')];
    const signedOut = await mount(h(app.ShopOrderHistory, { orders, currency: 'SGD', lang: 'en', food: true, primaryColor: '#7c3aed' }));
    assert.equal(signedOut.container.querySelectorAll('[data-testid="shop-history-show-qr"]').length, 0, 'signed out: no QR');
    await closeAll();
    const view = await mount(h(app.ShopOrderHistory, { orders, currency: 'SGD', lang: 'zh', food: true, primaryColor: '#7c3aed', showHandoverQr: true }));
    const buttons = [...view.container.querySelectorAll('[data-testid="shop-history-show-qr"]')];
    assert.deepEqual(buttons.map(text), ['显示自取二维码', '显示送货二维码'], 'orders still to collect / deliver, in the page’s language');
    await click(buttons[0]);
    for (let i = 0; i < 50 && !byTestId(view.container, 'handover-pass-qr'); i += 1) await wait(20);
    assert.equal(text(byTestId(view.container, 'handover-pass-pin')), '987 654');
    assert.match(text(byTestId(view.container, 'handover-pass')), /^自取二维码自取时出示此二维码，卖家扫描后即确认您已取货。或报出此号码987 654$/);
    assert.deepEqual(rpcs('my_handover')[0].args, { p_order_id: 's1' });
    await closeAll();
    const card = await mount(h(app.ShopHandoverCard, { order: shopOrder('s9', 'pending'), lang: 'en' }));
    await wait(20);
    assert.equal(card.container.innerHTML, '', 'the order-placed card goes when there’s no QR to show');
    await closeAll();
    passed('The store page: the QR for orders still to collect or deliver, from the server, in the page’s language; none signed out');
  }

  // ── 9. My purchases ─────────────────────────────────────────────────────────────────────
  {
    localStorage.clear();
    const purchase = (status, extra = {}) => ({
      id: 'p1', order_number: 'ORD-000077', status, type: 'takeaway', items: [{ name: 'Ondeh', quantity: 1, price: 6 }], subtotal: 6, total_amount: 6,
      payment_status: 'unpaid', fulfilment: { method: 'collection', area: 'Tampines' }, created_date: '2026-11-23T05:00:00Z', updated_date: '2026-11-23T05:00:00Z',
      status_times: {}, shop_id: 'shop-1', shop_name: 'Ann Bakes', shop_slug: 'ann-bakes', shop_type: 'individual', currency: 'SGD', can_cancel: false, ...extra,
    });
    let row = purchase('confirmed');
    let mine = { token: TOKEN, pin: '246810', status: 'confirmed' };
    calls = [];
    globalThis.rpcHandler = async (name) => {
      if (name === 'my_purchases') return { data: [row], error: null };
      if (name === 'my_handover') return { data: mine, error: null };
      return { data: null, error: null };
    };
    const show = async () => mount(h(MemoryRouter, { initialEntries: ['/explore/purchases/p1'] },
      h(Routes, null, h(Route, { path: '/explore/purchases/:orderId', element: h(app.PurchaseDetail) }))));
    let view = await show();
    await wait(30);
    assert.equal(rpcs('my_handover').length, 0, 'not asked (or noted as shown) until it’s on screen');
    const button = byTestId(view.container, 'purchase-show-qr');
    assert.equal(text(button), 'Show collection QR', 'accepted, not ready yet: a tap away');
    await click(button);
    for (let i = 0; i < 50 && !byTestId(view.container, 'purchase-handover-pass-qr'); i += 1) await wait(20);
    assert.equal(text(byTestId(view.container, 'purchase-handover-pass-pin')), '246 810');
    await closeAll();

    row = purchase('ready');
    mine = { token: TOKEN, pin: '246810', status: 'ready' };
    view = await show();
    for (let i = 0; i < 50 && !byTestId(view.container, 'purchase-handover-pass-qr'); i += 1) await wait(20);
    assert.ok(byTestId(view.container, 'purchase-handover-pass-qr'), 'ready for collection: the QR shows at once');
    // The seller scans it: the QR clears and the order reloads as collected.
    const before = rpcs('my_purchases').length;
    mine = { status: 'completed', verified_at: '2026-11-23T08:15:00Z', verified_via: 'qr' };
    row = purchase('completed', { payment_status: 'paid' });
    await wait(4400);
    assert.ok(!byTestId(view.container, 'purchase-handover-pass-qr'), 'the QR is gone');
    assert.ok(rpcs('my_purchases').length > before, 'the order reloaded');
    assert.match(text(byTestId(view.container, 'purchase-verified')), /^Verified by QR scan · 23 Nov/);
    await closeAll();

    row = purchase('ready', { fulfilment: { method: 'delivery', address: '2 Test Ave' } });
    mine = { token: TOKEN, pin: '246810', status: 'ready' };
    view = await show();
    for (let i = 0; i < 50 && !byTestId(view.container, 'purchase-handover-pass-qr'); i += 1) await wait(20);
    assert.match(text(byTestId(view.container, 'purchase-handover-pass')), /^Delivery QRShow this when your order is delivered\./);
    await closeAll();

    row = purchase('ready');
    mine = null;
    view = await show();
    await wait(30);
    assert.ok(!byTestId(view.container, 'purchase-handover'), 'no QR for this account (placed signed out): no card');
    await closeAll();
    passed('My purchases: the QR from the server (a tap away until ready), clearing to the verified time when the seller scans it; delivery orders say Delivery QR; none for an order placed signed out');
  }

  // ── 10. The courier's page (sellio.sg/courier/…) ─────────────────────────────────────────
  {
    const LINK = 'abcdefabcdefabcdefabcdefabcdef12';
    const open = (link) => mount(h(MemoryRouter, { initialEntries: [`/courier/${link}`] },
      h(Routes, null, h(Route, { path: '/courier/:link', element: h(app.CourierHandover) }))));
    let order = { ok: true, shop_name: 'Ann Bakes', order_number: 'ORD-000032', method: 'delivery', courier_name: 'Ahmad', expires_at: '2026-11-24T08:30:00Z', paused_until: null };
    calls = [];
    globalThis.rpcHandler = async (name, args) => {
      if (name === 'courier_handover') return { data: args.p_link === LINK ? order : { ok: false, reason: 'invalid' }, error: null };
      if (name === 'courier_handover_scan') {
        if (args.p_token === TOKEN) return { data: { ok: true, order_number: 'ORD-000032', method: 'delivery', verified_at: '2026-11-23T09:10:00Z', verified_via: 'qr' }, error: null };
        return { data: { ok: false, reason: 'not_this_order' }, error: null };
      }
      if (name === 'courier_handover_pin') {
        if (args.p_pin === '654321') return { data: { ok: true, order_number: 'ORD-000032', method: 'delivery', verified_at: '2026-11-23T09:10:00Z', verified_via: 'pin' }, error: null };
        if (args.p_pin === '000000') return { data: { ok: false, reason: 'paused', paused_until: new Date(Date.now() + 5 * 60000).toISOString() }, error: null };
        return { data: { ok: false, reason: 'wrong_pin', tries_left: 3 }, error: null };
      }
      return { data: null, error: null };
    };

    let view = await open('not-a-link');
    await wait(20);
    assert.match(text(byTestId(view.container, 'courier-invalid')), /^This link has expired or was already used\.Ask the seller for a new one\.$/);
    assert.equal(rpcs('courier_handover').length, 0, 'not a link: nothing asked');
    await closeAll();
    view = await open('11111111111111111111111111111111');
    await wait(20);
    assert.ok(byTestId(view.container, 'courier-invalid'), 'a link that doesn’t work (used, stopped, run out, cancelled)');
    await closeAll();

    view = await open(LINK.toUpperCase());
    await wait(20);
    assert.deepEqual(rpcs('courier_handover').at(-1).args, { p_link: LINK });
    const page = byTestId(view.container, 'courier-page');
    assert.equal(text(byTestId(page, 'courier-order')), 'DeliveryOrder #ORD-000032From Ann Bakes');
    assert.match(text(page), /At the door, ask the buyer to open this order in Sellio and show its QR\. Scan it here: that confirms the delivery\./);
    assert.match(text(byTestId(page, 'courier-expiry')), /^This link works once, until Nov 24, \d{1,2}:30 (AM|PM)\.$/);
    assert.ok(byTestId(page, 'qr-scanner'), 'the camera');
    assert.equal(document.title, 'Delivery · Sellio');
    await act(async () => { globalThis.scan('https://wa.me/6591234567'); });
    assert.equal(text(byTestId(page, 'courier-page-note')), 'That isn’t a Sellio QR.');
    assert.equal(rpcs('courier_handover_scan').length, 0);
    await act(async () => { globalThis.scan(handover.handoverLink(TOKEN_B)); });
    await wait();
    assert.equal(text(byTestId(page, 'courier-page-note')), 'That QR is for a different order. Ask the buyer to open order #ORD-000032 in Sellio.');
    await type(byTestId(page, 'courier-pin'), '111111');
    await submit(byTestId(page, 'courier-pin-form'));
    await wait();
    assert.equal(text(byTestId(page, 'courier-page-note')), 'That code is wrong. 3 more tries, then a 5-minute wait.');
    assert.deepEqual(rpcs('courier_handover_pin')[0].args, { p_link: LINK, p_pin: '111111' });
    await type(byTestId(page, 'courier-pin'), '000000');
    await submit(byTestId(page, 'courier-pin-form'));
    await wait();
    assert.match(text(byTestId(page, 'courier-page-note')), /^Too many wrong codes\. Try the code again after \d{1,2}:\d\d (AM|PM), or scan the buyer’s QR\.$/);
    await act(async () => { globalThis.scan(handover.handoverLink(TOKEN)); });
    await wait();
    assert.deepEqual(rpcs('courier_handover_scan').at(-1).args, { p_link: LINK, p_token: TOKEN });
    assert.match(text(byTestId(view.container, 'courier-done')), /^DeliveredOrder #ORD-000032Verified by QR scan · Nov 23, \d{1,2}:10 (AM|PM)Thank you! You can close this page\.$/);
    assert.ok(!byTestId(view.container, 'qr-scanner'), 'the camera is off');
    assert.ok(!view.container.textContent.includes('Cai'), 'nothing about the buyer');
    await closeAll();

    // The code instead; a wait already running when the page opens; no internet, then retry.
    view = await open(LINK);
    await wait(20);
    await type(byTestId(view.container, 'courier-pin'), '654 321');
    await submit(byTestId(view.container, 'courier-pin-form'));
    await wait();
    assert.match(text(byTestId(view.container, 'courier-done')), /Verified with the buyer’s code/);
    await closeAll();
    order = { ...order, paused_until: new Date(Date.now() + 3 * 60000).toISOString() };
    view = await open(LINK);
    await wait(20);
    assert.match(text(byTestId(view.container, 'courier-page-note')), /^Too many wrong codes\./, 'a wait already running shows on opening');
    await closeAll();
    let fail = true;
    globalThis.rpcHandler = async (name) => {
      if (name === 'courier_handover') { if (fail) throw new Error('Failed to fetch'); return { data: order, error: null }; }
      return { data: null, error: null };
    };
    view = await open(LINK);
    await wait(20);
    assert.match(text(byTestId(view.container, 'courier-error')), /^Couldn’t open the delivery\. Check the internet and try again\./);
    fail = false;
    await click(buttonNamed(byTestId(view.container, 'courier-error'), 'Try again'));
    await wait(20);
    assert.ok(byTestId(view.container, 'courier-order'), 'retried');
    await closeAll();

    // The seller's sheet once the courier has delivered.
    const delivered = await mount(h(app.CourierLinkSheet, {
      tenantId: 'shop-1', order: ready(32, { type: 'delivery', fulfilment: { method: 'delivery' } }), shopName: 'Ann Bakes', onChanged() {}, onClose() {},
      info: { has_qr: true, verified_at: '2026-11-23T09:10:00Z', verified_via: 'qr', verified_by_courier: true, verified_by_name: 'Ahmad' },
    }));
    assert.match(text(byTestId(delivered.container, 'courier-delivered')), /^DeliveredVerified by QR scan · Nov 23, \d{1,2}:10 (AM|PM) · Courier \(Ahmad\)Done$/);
    await closeAll();
    passed('The courier’s page: a link that doesn’t work says so; one that does shows the shop, order number and delivery only; scanning another app’s QR or another order’s says so; wrong codes and the wait; the right QR or code: Delivered; no internet: Try again. The seller’s sheet shows the courier’s delivery');
  }

  console.log(`handover QR (screens): ${passes} passed`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
process.exit(0);
