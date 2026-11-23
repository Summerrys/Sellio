// Packing photo (Alvin, 23–24 Nov 2026): a home seller's order whose buyer has a handover QR is
// marked packed only with a photo of it packed, its order number in the picture, taken in
// Sellio's camera and stamped with the order number, shop and time; the buyer sees it in My
// purchases. Checks lib/packingPhoto.js (paths, the photo's size, the stamp drawn on it), the
// camera sheet (no camera, camera not allowed, take / retake / use, each refusal, offline, an
// upload the storage rules refuse), the Orders page (Packed · take photo instead of Ready for
// collection / Out for delivery, its hint, the photo on the card, the server's refusal opening
// the camera) and My purchases (the photo once packed, full screen on a tap).
// Run: node verification/packing-photo.dom.mjs /tmp/sellio-verification   (jsdom installed there)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: (navigation|HTMLCanvasElement|window\.scrollTo|HTMLMediaElement)/.test(error?.message)) console.error(error); });
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Orders', pretendToBeVisual: true, virtualConsole });
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

// ── The camera and the canvas, as a phone's would be ────────────────────────────────────────
// A stream with one track (stopped when the sheet closes); a video 1280 × 960 that plays.
let streams = [];
const newStream = () => {
  const track = { stopped: false, stop() { this.stopped = true; }, onended: null };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track], track };
  streams.push(stream);
  return stream;
};
let camera = async () => newStream(); // what getUserMedia does
const mediaDevices = { getUserMedia: (constraints) => camera(constraints) };
Object.defineProperty(win.navigator, 'mediaDevices', { configurable: true, get: () => globalThis.noCamera ? undefined : mediaDevices });
win.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
Object.defineProperty(win.HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get() { return 1280; } });
Object.defineProperty(win.HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get() { return 960; } });
// The canvas: what's drawn on it, and the JPEG it makes.
let drawn = [];
const context = {
  drawImage(...args) { drawn.push(['drawImage', ...args.slice(1)]); },
  fillRect(...args) { drawn.push(['fillRect', ...args]); },
  fillText(...args) { drawn.push(['fillText', ...args]); },
  set fillStyle(v) { drawn.push(['fillStyle', v]); },
  set font(v) { drawn.push(['font', v]); },
  set textBaseline(v) {},
};
win.HTMLCanvasElement.prototype.getContext = function getContext() { drawn.push(['canvas', this.width, this.height]); return context; };
win.HTMLCanvasElement.prototype.toBlob = function toBlob(done, type, quality) { drawn.push(['toBlob', type, quality]); done(new win.Blob(['jpeg'], { type })); };
const realObjectUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let objectUrls = 0;
URL.createObjectURL = () => `blob:https://sellio.sg/photo-${++objectUrls}`;
URL.revokeObjectURL = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
globalThis.__h = h;
console.warn = () => {};
console.info = () => {};

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
globalThis.toasts = [];
globalThis.appUserFixture = { id: 'user-1', email: 'ann@example.com' };
const homeShop = { id: 'shop-1', name: 'Ann Bakes', industry: 'retail', seller_type: 'individual', country: 'SG', settings: { currency: 'SGD' } };
globalThis.tenantFixture = {
  tenantId: 'shop-1', tenant: homeShop, hasPermission: () => true, subscription: null, canUseFeature: () => true, isLoading: false,
};
globalThis.rows = { orders: [] };
globalThis.updateError = null; // what an orders update answers
let calls = [];
let uploads = [];
globalThis.uploadAnswer = null; // { error } to refuse an upload
globalThis.rpcHandler = async () => ({ data: null, error: null });
const query = (table) => {
  let updating = null;
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
    update(values) { updating = values; calls.push({ name: `update ${table}`, args: values }); return q; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(resolve, reject) {
      const answer = updating ? { data: null, error: globalThis.updateError } : { data: globalThis.rows[table] ?? [], error: null };
      return Promise.resolve(answer).then(resolve, reject);
    },
  };
  return q;
};
globalThis.supabaseFixture = {
  from: (table) => query(table),
  rpc: async (name, args) => { calls.push({ name, args }); return globalThis.rpcHandler(name, args); },
  storage: {
    from: (bucket) => ({
      upload: async (where, blob, options) => { uploads.push({ bucket, where, blob, options }); return globalThis.uploadAnswer || { data: { path: where }, error: null }; },
      createSignedUrls: async (paths, seconds) => {
        calls.push({ name: 'createSignedUrls', args: { bucket, paths, seconds } });
        return { data: paths.map((p) => ({ path: p, signedUrl: `https://files.example/${p}?token=t`, error: null })), error: null };
      },
    }),
  },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};
const rpcs = (name) => calls.filter((c) => c.name === name);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-packing-photo-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * as packing from '@/lib/packingPhoto';",
  "export { default as PackingPhotoSheet } from '@/components/handover/PackingPhotoSheet';",
  "export { PurchaseDetail } from '@/components/explore/ExplorePurchases';",
  "export { default as Orders } from '@/pages/Orders';",
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
  // The order editor a tap on a card opens (a marker, to check a tap on the photo isn't one).
  editOrder: 'export default function EditOrderModal() { return globalThis.__h("div", { "data-testid": "edit-order-sheet" }); }',
  native: 'export const isNativeApp = () => !!globalThis.inApp; export const isCapacitorApp = () => !!globalThis.inApp; export const appPlatform = () => ""; export const mapLinkProps = () => ({}); export const outsideLinkProps = () => ({}); export const openOutside = () => {}; export const placeWithCountry = (a) => a; export const sellsPlans = () => true;',
};
const mock = { name: 'packing-photo-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/AppUserContext$/, 'appUser');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/auth\/RequirePermission$/, 'permission');
  route(/lib\/printerUtils$/, 'printer');
  route(/lib\/tableBill$/, 'tableBill');
  route(/lib\/useOrderAlerts$/, 'alerts');
  route(/orders\/(TableCallAlerts|ChitPreviewSheet)$|tour\/(TourGuide|DummyOrderCard)$|shop\/ShopOrderInfo$|ui-custom\/AppLoader$|ratings\/RatingParts$/, 'nothing');
  route(/orders\/EditOrderModal$/, 'editOrder');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  route(/hooks\/useProductTour$|tour\/tourSteps$/, 'tour');
  route(/lib\/appFiles$/, 'appFiles');
  route(/lib\/useBackToClose$/, 'back');
  route(/ExploreTabBar$/, 'tabbar');
  route(/lib\/nativeApp$/, 'native');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path], resolveDir: process.cwd() }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.packing-photo.mjs');
await copyFile(outfile, local);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = async (ms = 0) => { await act(async () => { await sleep(ms); }); };
const click = async (el) => { assert.ok(el, 'nothing to click'); await act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); };
const byTestId = (root, id) => root.querySelector(`[data-testid="${id}"]`);
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
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
const UUID_JPG = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/;

try {
  const app = await import(pathToFileURL(local).href);
  const { packing } = app;

  // ── 1. The helpers ─────────────────────────────────────────────────────────────────────
  {
    const where = packing.packingPath('shop-1', 'o35');
    const parts = where.split('/');
    assert.deepEqual(parts.slice(0, 2), ['shop-1', 'o35'], '<shop>/<order>/…');
    assert.match(parts[2], UUID_JPG, 'a new name each time, as the storage rules want');
    assert.notEqual(packing.packingPath('shop-1', 'o35'), where);
    assert.deepEqual(packing.photoSize(4032, 3024), { width: 1600, height: 1200 }, 'a phone photo: 1600 on its long side');
    assert.deepEqual(packing.photoSize(1080, 1920), { width: 900, height: 1600 });
    assert.deepEqual(packing.photoSize(1280, 960), { width: 1280, height: 960 }, 'never made bigger');
    assert.equal(packing.stampText({ orderNumber: 'ORD-000035', shopName: ' Ann Bakes ', at: new Date(2026, 10, 24, 21, 52), locale: 'en-SG' }), 'ORD-000035 · Ann Bakes · 24 Nov 2026, 9:52 pm');
    assert.equal(packing.stampText({ orderNumber: 'ORD-000035', shopName: '', at: new Date(2026, 10, 24, 9, 5), locale: 'en-SG' }), 'ORD-000035 · 24 Nov 2026, 9:05 am');
    drawn = [];
    const video = document.createElement('video');
    const blob = await packing.stampedPhoto(video, 'ORD-000035 · Ann Bakes · 24 Nov 2026, 9:52 pm');
    assert.equal(blob.type, 'image/jpeg');
    assert.deepEqual(drawn.find((d) => d[0] === 'canvas'), ['canvas', 1280, 960]);
    assert.deepEqual(drawn.find((d) => d[0] === 'drawImage'), ['drawImage', 0, 0, 1280, 960], 'the camera’s picture, whole');
    const stamp = drawn.find((d) => d[0] === 'fillText');
    assert.equal(stamp[1], 'ORD-000035 · Ann Bakes · 24 Nov 2026, 9:52 pm', 'the stamp drawn into the photo');
    const band = drawn.filter((d) => d[0] === 'fillRect').at(-1);
    assert.equal(band[3], 1280, 'a band across the whole foot');
    assert.equal(band[2] + band[4], 960, 'at the very bottom');
    assert.ok(stamp[3] > band[2] && stamp[3] < 960, 'the stamp on the band');
    assert.deepEqual(drawn.find((d) => d[0] === 'toBlob'), ['toBlob', 'image/jpeg', 0.82]);
    const empty = Object.defineProperty(document.createElement('video'), 'videoWidth', { value: 0 });
    assert.equal(await packing.stampedPhoto(empty, 'x'), null, 'no picture yet: nothing');
    passed('Helpers: <shop>/<order>/<new name>.jpg, the photo at most 1600 on its long side, the stamp (order number · shop · time) drawn across its foot, a JPEG');
  }

  // ── 2. The camera sheet ──────────────────────────────────────────────────────────────────
  const order35 = { id: 'o35', order_number: 'ORD-000035', status: 'preparing' };
  const sheet = async ({ onDone = () => {}, onClose = () => {} } = {}) => mount(h(app.PackingPhotoSheet, { tenantId: 'shop-1', order: order35, shopName: 'Ann Bakes', onDone, onClose }));
  {
    // No camera at all (a computer, an old browser): says so, nothing to take.
    globalThis.noCamera = true;
    let view = await sheet();
    await wait(10);
    assert.equal(text(byTestId(view.container, 'packing-camera-problem')), 'This device can’t open a camera. Open this order in Sellio on your phone to take the packing photo.');
    assert.ok(byTestId(view.container, 'packing-shutter').disabled, 'nothing to take');
    assert.ok(!buttonNamed(view.container, 'Try the camera again'), 'nothing to try again');
    await closeAll();
    globalThis.noCamera = false;
    // Not allowed: in the app, the phone's settings; on the website, the browser's. Try again works.
    camera = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
    globalThis.inApp = true;
    view = await sheet();
    await wait(10);
    assert.equal(text(byTestId(view.container, 'packing-camera-problem')),
      'Sellio isn’t allowed to use the camera. Turn on camera access for Sellio in your phone’s settings, then try again.Try the camera again');
    globalThis.inApp = false;
    await closeAll();
    view = await sheet();
    await wait(10);
    assert.match(text(byTestId(view.container, 'packing-camera-problem')), /^This page isn’t allowed to use the camera\. Allow camera access for this site in your browser, then try again\./);
    camera = async () => newStream();
    await click(buttonNamed(view.container, 'Try the camera again'));
    await wait(10);
    assert.ok(!byTestId(view.container, 'packing-camera-problem'), 'allowed now: the camera');
    assert.ok(!byTestId(view.container, 'packing-shutter').disabled);
    await closeAll();
    passed('Camera sheet: no camera says to use the phone (nothing to take), not allowed says where to allow it (the app’s settings or the browser’s), and Try the camera again');
  }
  {
    streams = [];
    calls = [];
    uploads = [];
    globalThis.toasts = [];
    let done = null;
    let closed = 0;
    const answer = { ok: true, order_id: 'o35', order_number: 'ORD-000035', status: 'ready', path: null, taken_at: '2026-11-24T13:52:00Z', taken_by_name: 'Ann' };
    globalThis.rpcHandler = async (name, args) => (name === 'shop_packing_photo' ? { data: { ...answer, path: args.p_path }, error: null } : { data: null, error: null });
    const view = await sheet({ onDone: (a) => { done = a; }, onClose: () => { closed += 1; } });
    await wait(10);
    const body = view.container;
    assert.equal(text(byTestId(body, 'packing-number')), 'ORD-000035', 'the order number, large');
    assert.equal(text(byTestId(body, 'packing-instruction')), 'Write ORD-000035 on the parcel or a note, and keep it in the photo.');
    assert.match(text(byTestId(body, 'packing-stamp')), /^ORD-000035 · Ann Bakes · \d{1,2} [A-Z][a-z]{2} 2026, \d{1,2}:\d\d (am|pm)$/, 'where the stamp goes, shown on the picture');
    assert.equal(byTestId(body, 'packing-sheet').getAttribute('aria-label'), 'Packing photo for order #ORD-000035');
    assert.ok(!byTestId(body, 'packing-use'), 'no Use photo before one is taken');
    assert.ok(!body.querySelector('input[type="file"]'), 'Sellio’s camera only: no photo from the gallery');
    drawn = [];
    await click(byTestId(body, 'packing-shutter'));
    await wait(10);
    assert.equal(byTestId(body, 'packing-preview').getAttribute('src'), 'blob:https://sellio.sg/photo-1', 'the photo taken');
    assert.match(drawn.find((d) => d[0] === 'fillText')[1], /^ORD-000035 · Ann Bakes · /, 'stamped');
    assert.equal(text(byTestId(body, 'packing-instruction')), 'Can you read ORD-000035 in the photo? The buyer will see it.');
    await click(byTestId(body, 'packing-retake'));
    assert.ok(!byTestId(body, 'packing-preview'), 'Retake: back to the camera');
    await click(byTestId(body, 'packing-shutter'));
    await wait(10);
    await click(byTestId(body, 'packing-use'));
    await wait(10);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].bucket, 'order-photos');
    assert.match(uploads[0].where, /^shop-1\/o35\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(uploads[0].blob.type, 'image/jpeg');
    assert.deepEqual(uploads[0].options, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }, 'never replaces a photo');
    assert.deepEqual(rpcs('shop_packing_photo')[0].args, { p_tenant_id: 'shop-1', p_order_id: 'o35', p_path: uploads[0].where }, 'then recorded, by its path');
    assert.equal(done?.status, 'ready', 'the order moves on');
    assert.equal(closed, 1, 'and the sheet closes');
    assert.deepEqual(globalThis.toasts.at(-1), { kind: 'success', message: 'Order #ORD-000035 packed. The buyer can see the photo.', options: undefined });
    await closeAll();
    assert.ok(streams.every((s) => s.track.stopped), 'the camera is off once the sheet goes');
    passed('Camera sheet: the order number large with what to write, the stamp shown where it goes, Sellio’s camera only; a photo taken and stamped, Retake, Use photo uploads it (never replacing one) and records it; the order is packed and the sheet closes; the camera turns off');
  }
  {
    // The server's reasons: those a new photo fixes go back to the camera; the others stay.
    const reasons = [
      ['photo_old', 'That photo was taken too long ago. Take a new one.', true],
      ['photo_missing', 'The photo didn’t arrive. Take it again.', true],
      ['bad_photo', 'That photo isn’t for this order. Take it again.', true],
      ['cancelled', 'Order #ORD-000035 was cancelled.', false],
      ['already_completed', 'Order #ORD-000035 is already completed.', false],
      ['not_accepted', 'Accept order #ORD-000035 first.', false],
      ['not_needed', 'This order doesn’t need a packing photo.', false],
      ['unknown', 'This order isn’t in your shop any more.', false],
      ['something_new', 'Couldn’t save the packing photo. Try again.', false],
    ];
    for (const [reason, words, retake] of reasons) {
      let closed = 0;
      globalThis.rpcHandler = async (name) => (name === 'shop_packing_photo' ? { data: { ok: false, reason, order_number: 'ORD-000035' }, error: null } : { data: null, error: null });
      const view = await sheet({ onClose: () => { closed += 1; } });
      await wait(10);
      await click(byTestId(view.container, 'packing-shutter'));
      await wait(10);
      await click(byTestId(view.container, 'packing-use'));
      await wait(10);
      assert.equal(text(byTestId(view.container, 'packing-note')), words, reason);
      assert.equal(!byTestId(view.container, 'packing-preview'), retake, `${reason}: ${retake ? 'back to the camera' : 'the photo stays'}`);
      assert.equal(closed, 0, 'stays open');
      await closeAll();
    }
    // The storage rules refused the upload (cancelled or handed over meanwhile): nothing recorded.
    calls = [];
    globalThis.uploadAnswer = { data: null, error: Object.assign(new Error('new row violates row-level security policy'), { statusCode: '403' }) };
    let view = await sheet();
    await wait(10);
    await click(byTestId(view.container, 'packing-shutter'));
    await wait(10);
    await click(byTestId(view.container, 'packing-use'));
    await wait(10);
    assert.equal(text(byTestId(view.container, 'packing-note')), 'Order #ORD-000035 can’t take a photo now: it may have been cancelled or handed over. Refresh Orders to check.');
    assert.equal(rpcs('shop_packing_photo').length, 0);
    globalThis.uploadAnswer = null;
    await closeAll();
    // Offline: nothing sent, and it says so.
    uploads = [];
    globalThis.toasts = [];
    Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => false });
    win.dispatchEvent(new win.Event('offline'));
    view = await sheet();
    await wait(10);
    await click(byTestId(view.container, 'packing-shutter'));
    await wait(10);
    await click(byTestId(view.container, 'packing-use'));
    await wait(10);
    assert.equal(uploads.length, 0, 'offline: nothing uploaded');
    assert.equal(globalThis.toasts.at(-1)?.message, 'Couldn’t save the packing photo');
    assert.match(globalThis.toasts.at(-1)?.options?.description || '', /^You’re offline\. Saving a photo needs the internet\./);
    assert.ok(byTestId(view.container, 'packing-preview'), 'the photo is kept to send once online');
    Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => true });
    win.dispatchEvent(new win.Event('online'));
    await closeAll();
    passed('Camera sheet: each refusal in words (too old, didn’t arrive, another order’s: take again; cancelled, completed, not accepted, not needed, gone: stays), an upload the storage rules refuse, and offline (nothing sent, the photo kept)');
  }

  // ── 3. Orders ─────────────────────────────────────────────────────────────────────────────
  {
    calls = [];
    uploads = [];
    const minute = 60000;
    const order = (n, extra = {}) => ({
      id: `o${n}`, order_number: `ORD-0000${n}`, status: 'preparing', type: 'takeaway', customer_name: 'Cai Ling', total_amount: 12.5,
      payment_status: 'unpaid', items: [{ name: 'Kaya jar', quantity: 2, price: 6.25 }], fulfilment: { method: 'collection' },
      created_date: new Date(Date.now() - n * minute).toISOString(), ...extra,
    });
    globalThis.rows.orders = [
      order(41),                                                                                   // preparing, QR: the photo
      order(42, { type: 'delivery', fulfilment: { method: 'delivery', address: '2 Test Ave' } }), // out for delivery next: the photo too
      order(43),                                                                                   // preparing, no QR: as before
      order(44, { status: 'ready' }),                                                              // packed: its photo shows
      order(45, { status: 'confirmed' }),                                                          // accepted: Start preparing first
      order(47),                                                                                   // preparing again, its photo taken already
    ];
    const qr = (id, extra = {}) => ({ order_id: id, has_qr: true, issued_at: '2026-11-24T07:02:00Z', first_shown_at: null, last_shown_at: null, verified_at: null, ...extra });
    let photos = [
      { order_id: 'o44', path: 'shop-1/o44/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', taken_at: '2026-11-24T13:52:00Z', taken_by_name: 'Ann', photos: 1 },
      { order_id: 'o47', path: 'shop-1/o47/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg', taken_at: '2026-11-24T13:40:00Z', taken_by_name: 'Ann', photos: 1 },
    ];
    globalThis.rpcHandler = async (name, args) => {
      if (name === 'shop_handovers') {
        return { data: [qr('o41'), qr('o42'), { order_id: 'o43', has_qr: false }, qr('o44'), qr('o45'), qr('o47')]
          .filter((r) => args.p_order_ids.includes(r.order_id)), error: null };
      }
      if (name === 'shop_packing_photos') return { data: photos.filter((p) => args.p_order_ids.includes(p.order_id)), error: null };
      if (name === 'shop_packing_photo') {
        const made = { order_id: args.p_order_id, path: args.p_path, taken_at: '2026-11-24T14:05:00Z', taken_by_name: 'Ann', photos: 1 };
        photos = [...photos, made];
        globalThis.rows.orders = globalThis.rows.orders.map((o) => (o.id === args.p_order_id ? { ...o, status: 'ready' } : o));
        return { data: { ok: true, order_number: 'ORD-000041', status: 'ready', ...made }, error: null };
      }
      return { data: null, error: null };
    };
    let view = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(40);
    const card = (num) => [...view.container.querySelectorAll('[data-sellio-order-card]')].find((c) => text(c).includes(num));
    const step = (num) => card(num).querySelector('[data-tour="order-status-btn"]');
    assert.equal(text(step('ORD-000041')), 'Packed · take photo', 'ready for collection: with its photo');
    assert.equal(text(step('ORD-000042')), 'Packed · take photo', 'out for delivery: with its photo too');
    assert.equal(text(byTestId(card('ORD-000041'), 'packing-hint')), 'The buyer sees this photo. Write ORD-000041 on the parcel or a note, and keep it in the photo.');
    assert.equal(text(step('ORD-000043')), 'Ready for collection', 'no QR (placed signed out): as before');
    assert.ok(!byTestId(card('ORD-000043'), 'packing-hint'));
    assert.equal(text(step('ORD-000045')), 'Start preparing', 'accepted: preparing first, as before');
    assert.ok(!byTestId(card('ORD-000045'), 'packing-hint'));
    assert.deepEqual(rpcs('shop_packing_photos')[0].args, { p_tenant_id: 'shop-1', p_order_ids: ['o41', 'o42', 'o44', 'o45', 'o47'] }, 'asked only for orders with a QR');
    // Back to preparing with its photo already taken (the server lets it be marked ready again).
    assert.equal(text(step('ORD-000047')), 'Ready for collection', 'its photo is taken: no second one');
    assert.ok(!byTestId(card('ORD-000047'), 'packing-hint'));
    assert.match(text(byTestId(card('ORD-000047'), 'packing-record')), /^Packing photoPacked Nov 24, \d{1,2}:40 (AM|PM) · Ann$/);
    // The packed order: its photo, when and by whom; full screen on a tap.
    const record = byTestId(card('ORD-000044'), 'packing-record');
    assert.match(text(record), /^Packing photoPacked Nov 24, \d{1,2}:52 (AM|PM) · Ann$/);
    assert.equal(byTestId(record, 'packing-thumb').querySelector('img').getAttribute('src'), 'https://files.example/shop-1/o44/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg?token=t');
    assert.deepEqual(rpcs('createSignedUrls')[0].args, { bucket: 'order-photos', paths: ['shop-1/o44/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'shop-1/o47/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'], seconds: 3600 }, 'links for the photos, in one go');
    assert.equal(text(step('ORD-000044')), 'Scan QR', 'packed: scanned at the handover, as before');
    await click(byTestId(record, 'packing-thumb'));
    const viewer = byTestId(document.body, 'packing-viewer');
    assert.equal(viewer.getAttribute('aria-label'), 'Packing photo for order #ORD-000044');
    await click(buttonNamed(viewer, 'Close photo'));
    assert.ok(!byTestId(document.body, 'packing-viewer'), 'closed');
    assert.ok(!byTestId(document.body, 'edit-order-sheet'), 'a tap on the photo isn’t a tap on the card');
    await click(card('ORD-000043').querySelector('.text-sm'));
    assert.ok(byTestId(document.body, 'edit-order-sheet'), '(a tap on the card itself opens the editor)');
    await closeAll();
    view = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(40);
    // Packed · take photo: Sellio's camera for that order; the photo packs it.
    await click(step('ORD-000041'));
    await wait(10);
    const body = document.body;
    assert.equal(text(byTestId(body, 'packing-number')), 'ORD-000041');
    assert.equal(rpcs('update orders').length, 0, 'nothing marked without the photo');
    await click(byTestId(body, 'packing-shutter'));
    await wait(10);
    await click(byTestId(body, 'packing-use'));
    await wait(40);
    assert.ok(!byTestId(body, 'packing-sheet'), 'closed once packed');
    assert.match(uploads.at(-1).where, /^shop-1\/o41\//);
    assert.equal(text(step('ORD-000041')), 'Scan QR', 'packed: next, the buyer’s QR');
    assert.match(text(byTestId(card('ORD-000041'), 'packing-record')), /^Packing photoPacked Nov 24, \d{1,2}:05 (AM|PM) · Ann$/);
    assert.ok(byTestId(card('ORD-000041'), 'packing-thumb'), 'its photo on the card');
    await closeAll();

    // The server refuses a step to ready without the photo (an order whose QR hadn't loaded, an
    // old copy of the page): the camera opens instead of an error.
    calls = [];
    globalThis.rows.orders = [order(46)];
    globalThis.updateError = { code: '42501', hint: 'packing_photo_required', message: 'Take the packing photo to mark this order packed.' };
    globalThis.rpcHandler = async () => ({ data: [], error: null });
    globalThis.toasts = [];
    const again = await mount(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(app.Orders))));
    await wait(40);
    const card46 = [...again.container.querySelectorAll('[data-sellio-order-card]')][0];
    assert.equal(text(card46.querySelector('[data-tour="order-status-btn"]')), 'Ready for collection');
    await click(card46.querySelector('[data-tour="order-status-btn"]'));
    await wait(20);
    assert.equal(rpcs('update orders').length, 1);
    assert.equal(text(byTestId(document.body, 'packing-number')), 'ORD-000046', 'the camera, for that order');
    assert.equal(globalThis.toasts.filter((t) => t.kind === 'error').length, 0, 'no error shown');
    globalThis.updateError = null;
    await closeAll();
    passed('Orders: Packed · take photo instead of Ready for collection / Out for delivery when the buyer has a QR (with what to write), others as before; the packed order’s photo, when and by whom, full screen on a tap; the photo packs the order (then Scan QR); the server’s refusal opens the camera');
  }

  // ── 4. My purchases ───────────────────────────────────────────────────────────────────────
  {
    calls = [];
    localStorage.clear();
    const purchase = (status, extra = {}) => ({
      id: 'p1', order_number: 'ORD-000077', status, type: 'takeaway', items: [{ name: 'Ondeh', quantity: 1, price: 6 }], subtotal: 6, total_amount: 6,
      payment_status: 'unpaid', fulfilment: { method: 'collection', area: 'Tampines' }, created_date: '2026-11-24T05:00:00Z', updated_date: '2026-11-24T05:00:00Z',
      status_times: {}, shop_id: 'shop-1', shop_name: 'Ann Bakes', shop_slug: 'ann-bakes', shop_type: 'individual', currency: 'SGD', can_cancel: false, ...extra,
    });
    let row = purchase('preparing');
    let mine = { path: 'shop-1/p1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg', taken_at: '2026-11-24T05:52:00Z' };
    globalThis.rpcHandler = async (name) => {
      if (name === 'my_purchases') return { data: [row], error: null };
      if (name === 'my_packing_photo') return { data: mine, error: null };
      return { data: null, error: null };
    };
    const show = async () => mount(h(MemoryRouter, { initialEntries: ['/explore/purchases/p1'] },
      h(Routes, null, h(Route, { path: '/explore/purchases/:orderId', element: h(app.PurchaseDetail) }))));
    let view = await show();
    await wait(30);
    assert.equal(rpcs('my_packing_photo').length, 0, 'not packed yet: not asked');
    assert.ok(!byTestId(view.container, 'purchase-packing'));
    await closeAll();
    row = purchase('ready');
    view = await show();
    await wait(30);
    assert.deepEqual(rpcs('my_packing_photo')[0].args, { p_order_id: 'p1' });
    const card = byTestId(view.container, 'purchase-packing');
    assert.equal(text(card.querySelector('h2')), 'Packing photo');
    assert.equal(byTestId(card, 'purchase-packing-photo').querySelector('img').getAttribute('src'), 'https://files.example/shop-1/p1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg?token=t');
    assert.match(text(byTestId(card, 'purchase-packing-when')), /^Packed 24 Nov, \d{1,2}:52 (am|pm)\. The seller took this photo in Sellio\.$/);
    await click(byTestId(card, 'purchase-packing-photo'));
    assert.equal(byTestId(document.body, 'packing-viewer').getAttribute('aria-label'), 'Packing photo');
    await click(buttonNamed(byTestId(document.body, 'packing-viewer'), 'Close photo'));
    assert.ok(!byTestId(document.body, 'packing-viewer'));
    await closeAll();
    row = purchase('completed', { payment_status: 'paid' });
    view = await show();
    await wait(30);
    assert.ok(byTestId(view.container, 'purchase-packing'), 'still there once collected');
    await closeAll();
    mine = null;
    row = purchase('ready');
    view = await show();
    await wait(30);
    assert.ok(!byTestId(view.container, 'purchase-packing'), 'packed before photos (or none for this account): no card');
    await closeAll();
    row = purchase('ready', { shop_type: 'business' });
    const asked = rpcs('my_packing_photo').length;
    view = await show();
    await wait(30);
    assert.equal(rpcs('my_packing_photo').length, asked, 'a business’s order: not asked');
    await closeAll();
    passed('My purchases: the packing photo once the order is packed (ready, out for delivery, done), when it was packed, full screen on a tap; nothing before that, for an order without one, or for a business’s order');
  }

  console.log(`packing photo (screens): ${passes} passed`);
} finally {
  await closeAll().catch(() => {});
  URL.createObjectURL = realObjectUrl.create;
  URL.revokeObjectURL = realObjectUrl.revoke;
  await rm(path.join(process.cwd(), '.packing-photo.mjs'), { force: true });
  await rm(tmp, { recursive: true, force: true });
}
process.exit(0);
