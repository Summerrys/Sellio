// Handover QR in a real browser (Chrome, as a phone) with a camera that shows a QR: the seller's
// scanner reads the buyer's QR through the camera (getUserMedia, then the browser's own
// BarcodeDetector or jsQR), sends it, and shows the order collected with what to hand over;
// another app's QR is refused. The buyer's QR (My purchases) clears to "Collected ✓" when the
// seller has scanned it. The courier's page (sellio.sg/courier/…) reads the buyer's QR through the
// camera the same way and shows the order delivered. Also takes pictures of these, of Orders (Scan
// QR, the QR's track, the verified record, the courier link) and of the seller's courier link.
// Run after `npm run build` (for the app's styles):
//   node verification/handover-qr.browser.mjs /tmp/sellio-verification [picture folder]
// (/tmp/sellio-verification has playwright-core; Chrome at CHROME_PATH or /usr/bin/google-chrome;
// ffmpeg makes the camera's video.)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const appRequire = createRequire(path.join(app, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const shots = process.argv[3] || null;
const QRCode = appRequire('qrcode');

const TOKEN = '0123456789abcdef0123456789abcdef';
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const temporary = await mkdtemp(path.join(os.tmpdir(), 'sellio-handover-browser-'));
// A camera that sees a phone screen with a QR on it: a still picture as a Y4M video, which Chrome's
// fake camera plays in a loop.
async function cameraVideo(name, text) {
  const video = path.join(temporary, `${name}.y4m`);
  if (!text) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x334155:s=640x480:d=1',
      '-vf', 'format=yuv420p', '-frames:v', '1', '-f', 'yuv4mpegpipe', video]);
    return video;
  }
  const qr = path.join(temporary, `${name}.png`);
  await QRCode.toFile(qr, text, { width: 300, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x334155:s=640x480:d=1', '-i', qr,
    '-filter_complex', '[0][1]overlay=(W-w)/2:(H-h)/2,format=yuv420p', '-frames:v', '1', '-f', 'yuv4mpegpipe', video]);
  return video;
}
const sellioVideo = await cameraVideo('sellio', `https://sellio.sg/Orders?qr=${TOKEN}`);
const otherVideo = await cameraVideo('other', 'https://wa.me/6591234567');
const emptyVideo = await cameraVideo('empty', null);

const PAGE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import HandoverSheet from '@/components/handover/HandoverSheet';
import { PurchaseDetail } from '@/components/explore/ExplorePurchases';
import { ShopOrderHistory } from '@/components/shop/ShopStorefront';
import Orders from '@/pages/Orders';
import CourierHandover from '@/pages/CourierHandover';
import CourierLinkSheet from '@/components/handover/CourierLinkSheet';

const ready = window.__orders[0];
const screen = location.hash.slice(1);
let view = null;
if (screen === 'sheet-card') {
  view = <HandoverSheet tenantId="shop-1" orders={window.__orders} handovers={{ o12: { has_qr: true } }} startOrder={ready} onDone={() => window.__calls.push(['done'])} onClose={() => window.__calls.push(['closed'])} />;
} else if (screen === 'sheet-scan') {
  view = <HandoverSheet tenantId="shop-1" orders={window.__orders} handovers={{}} onDone={() => window.__calls.push(['done'])} onClose={() => {}} />;
} else if (screen === 'orders') {
  view = <QueryClientProvider client={new QueryClient()}><Orders /></QueryClientProvider>;
} else if (screen === 'purchase') {
  view = <Routes><Route path="/explore/purchases/:orderId" element={<PurchaseDetail />} /></Routes>;
} else if (screen === 'courier') {
  view = <Routes><Route path="/courier/:link" element={<CourierHandover />} /></Routes>;
} else if (screen === 'courier-sheet') {
  view = <CourierLinkSheet tenantId="shop-1" order={window.__orders[1]} shopName="Ann Bakes" onChanged={() => {}} onClose={() => {}}
    info={{ has_qr: true, courier_link: window.__link, courier_name: 'Ahmad', courier_link_expires_at: new Date(Date.now() + 23.5 * 3600000).toISOString(), courier_opened_at: null }} />;
} else if (screen === 'store') {
  view = <div style={{ padding: 16, background: '#fff' }}><p style={{ fontWeight: 700, fontSize: 17, margin: '4px 0 14px' }}>Your orders</p>
    <ShopOrderHistory showHandoverQr orders={[{ id: 's1', order_number: 'ORD-000014', status: 'ready', created_date: new Date().toISOString(), items: [{ name: 'Ondeh ondeh (10 pcs)', quantity: 1, price: 6 }], total_amount: 6, payment_status: 'paid', fulfilment: { method: 'collection', area: 'Tampines', collection_address: 'Blk 123 Tampines St 11' } }]} currency="SGD" lang="en" food primaryColor="#7c3aed" /></div>;
}
const start = screen === 'purchase' ? ['/explore/purchases/p1'] : screen === 'courier' ? ['/courier/' + window.__link] : ['/Orders'];
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={start}>{view}<Toaster position="top-center" /></MemoryRouter>);
`;

const stubs = {
  client: 'export const getSupabase = async () => window.__client; export const SUPABASE_URL = "https://x.invalid";',
  profile: 'export const useAppUser = () => ({ appUser: { id: "user-1", email: "ann@example.com" } }); export const cookieUtils = { clear() {} };',
  tenant: 'export const useTenant = () => window.__tenant;',
  permission: 'export default function RequirePermission({ children }) { return children; }',
  printer: 'export const loadPrinterConfig = async () => null; export const buildOrderReceipt = () => ""; export const buildOrderChit = () => ""; export const buildTableReceipt = () => ""; export const sendViaBluetooth = async () => {}; export const sendViaEpsonEPos = async () => {};',
  tableBill: 'export const loadTableBillForOrder = async () => null; export const paymentText = () => ""; export const tableReceiptHtml = () => "";',
  alerts: 'const alerts = { on: true, setOn() {}, every: 60, setEvery() {}, ring() {}, seen() {} }; export const useOrderAlerts = () => alerts; export const REMIND_EVERY = [30, 60, 120];',
  nothing: 'export default function Nothing() { return null; } export const OrderRateRow = () => null; export const RateOrderSheet = () => null;',
  tour: 'const tour = { eligible: false, completeStage() {} }; export const useProductTour = () => tour; export const getOrdersSteps = () => [];',
  tabbar: "export default function TabBar() { return null; } export const TAB_BAR_SPACE = '24px';",
};
const routes = [
  [/lib\/supabaseClient$/, 'client'], [/lib\/AppUserContext$/, 'profile'], [/tenant\/TenantContext$/, 'tenant'],
  [/auth\/RequirePermission$/, 'permission'], [/lib\/printerUtils$/, 'printer'], [/lib\/tableBill$/, 'tableBill'],
  [/lib\/useOrderAlerts$/, 'alerts'], [/orders\/(TableCallAlerts|EditOrderModal|ChitPreviewSheet)$|tour\/(TourGuide|DummyOrderCard)$|ratings\/RatingParts$/, 'nothing'],
  [/hooks\/useProductTour$|tour\/tourSteps$/, 'tour'], [/ExploreTabBar$/, 'tabbar'],
];
const plugin = { name: 'stand-ins', setup(b) {
  routes.forEach(([filter, key]) => b.onResolve({ filter }, () => ({ path: key, namespace: 'stub' })));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ loader: 'jsx', resolveDir: app, contents: stubs[args.path] }));
} };
const entry = path.join(temporary, 'page.jsx');
await writeFile(entry, PAGE);
const result = await build({
  entryPoints: [entry], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false, splitting: false,
  alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')], loader: { '.js': 'jsx' }, plugins: [plugin],
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const appHtml = await readFile(path.join(app, 'dist/app.html'), 'utf8');
const cssFiles = [...appHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(app, 'dist', f), 'utf8')))).join('\n').replace(/<\/style/gi, '<\\/style');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8fafc}:root{--color-primary:124 58 237;--color-primary-gradient:linear-gradient(135deg,#6366f1,#8b2fc9)}</style></head>
<body><div id="root"></div><script type="module">${js}</script></body></html>`;

// What the page's stand-in Supabase answers (the server's rules are checked in collection-qr.sql).
const SETUP = `
window.__calls = [];
const minute = 60000;
window.__orders = [
  { id: 'o12', order_number: 'ORD-000012', status: 'ready', type: 'takeaway', customer_name: 'Cai Ling', customer_phone: '+6591234567', total_amount: 12.5, payment_status: 'unpaid',
    items: [{ name: 'Kaya toast', quantity: 2, price: 5 }, { name: 'Teh', quantity: 1, price: 2.5 }], fulfilment: { method: 'collection', area: 'Tampines' }, created_date: new Date(Date.now() - 25 * minute).toISOString() },
  { id: 'o13', order_number: 'ORD-000013', status: 'ready', type: 'delivery', customer_name: 'Eve Lim', customer_phone: '+6587654321', total_amount: 18, payment_status: 'paid',
    items: [{ name: 'Pineapple tarts (box)', quantity: 1, price: 18 }], fulfilment: { method: 'delivery', address: 'Blk 456 Bedok North Ave 3 #05-12' }, created_date: new Date(Date.now() - 40 * minute).toISOString() },
  { id: 'o11', order_number: 'ORD-000011', status: 'completed', type: 'takeaway', customer_name: 'Dee Tan', customer_phone: '+6598765432', total_amount: 8, payment_status: 'paid', payment_method: 'cash',
    items: [{ name: 'Ondeh ondeh (10 pcs)', quantity: 1, price: 8 }], fulfilment: { method: 'collection', area: 'Tampines' }, created_date: new Date(Date.now() - 90 * minute).toISOString() },
];
window.__handedOver = false;
window.__link = 'abcdefabcdefabcdefabcdefabcdef12';
window.__tenant = { tenantId: 'shop-1', tenant: { id: 'shop-1', name: 'Ann Bakes', industry: 'fnb', seller_type: 'individual', country: 'SG', settings: { currency: 'SGD' } },
  hasPermission: () => true, subscription: null, canUseFeature: () => false, isLoading: false };
const chain = (result) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q, update: () => q,
  maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (a, b) => Promise.resolve(result).then(a, b) }; return q; };
window.__client = {
  from: (table) => chain({ data: table === 'orders' ? window.__orders : [], error: null }),
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  rpc: async (name, args) => {
    window.__calls.push([name, args]);
    if (name === 'shop_handover_scan') {
      if (args.p_token === '${TOKEN}') return { data: { ok: true, order_id: 'o12', order_number: 'ORD-000012', method: 'collection', customer_name: 'Cai Ling',
        items: window.__orders[0].items, total_amount: 12.5, verified_at: new Date().toISOString(), verified_via: 'qr', verified_by_name: 'Ann' }, error: null };
      return { data: { ok: false, reason: 'unknown' }, error: null };
    }
    if (name === 'shop_handovers') return { data: [
      { order_id: 'o12', has_qr: true, issued_at: new Date(Date.now() - 25 * minute).toISOString(), first_shown_at: new Date(Date.now() - 3 * minute).toISOString(), last_shown_at: new Date(Date.now() - minute).toISOString(), verified_at: null },
      { order_id: 'o13', has_qr: true, issued_at: new Date(Date.now() - 40 * minute).toISOString(), first_shown_at: null, last_shown_at: null, verified_at: null },
      { order_id: 'o11', has_qr: true, issued_at: new Date(Date.now() - 90 * minute).toISOString(), verified_at: new Date(Date.now() - 70 * minute).toISOString(), verified_via: 'qr', verified_by_name: 'Ann' }], error: null };
    if (name === 'courier_handover') return { data: args.p_link === window.__link
      ? { ok: true, shop_name: 'Ann Bakes', order_number: 'ORD-000013', method: 'delivery', courier_name: 'Ahmad', expires_at: new Date(Date.now() + 23.5 * 3600000).toISOString(), paused_until: null }
      : { ok: false, reason: 'invalid' }, error: null };
    if (name === 'courier_handover_scan') return { data: args.p_link === window.__link && args.p_token === '${TOKEN}'
      ? { ok: true, order_number: 'ORD-000013', method: 'delivery', verified_at: new Date().toISOString(), verified_via: 'qr' }
      : { ok: false, reason: 'not_this_order' }, error: null };
    if (name === 'my_purchases') return { data: [{ id: 'p1', order_number: 'ORD-000014', status: window.__handedOver ? 'completed' : 'ready', type: 'takeaway', items: [{ name: 'Ondeh ondeh (10 pcs)', quantity: 1, price: 6 }], subtotal: 6, total_amount: 6,
      payment_status: 'paid', fulfilment: { method: 'collection', area: 'Tampines', collection_address: 'Blk 123 Tampines St 11' }, created_date: new Date(Date.now() - 50 * minute).toISOString(), updated_date: new Date().toISOString(),
      status_times: { pending: new Date(Date.now() - 50 * minute).toISOString(), confirmed: new Date(Date.now() - 45 * minute).toISOString(), ready: new Date(Date.now() - 2 * minute).toISOString() },
      shop_id: 'shop-1', shop_name: 'Ann Bakes', shop_slug: 'ann-bakes', shop_type: 'individual', currency: 'SGD', can_cancel: false }], error: null };
    if (name === 'my_handover') return { data: window.__handedOver
      ? { status: 'completed', verified_at: new Date(Date.now() - 5000).toISOString(), verified_via: 'qr' }
      : { token: '${TOKEN}', pin: '482913', status: 'ready', issued_at: new Date(Date.now() - 50 * minute).toISOString() }, error: null };
    return { data: null, error: null };
  },
};
`;

async function withBrowser(video, run) {
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore', permissions: ['camera'] });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'collect.test') return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });
    await context.addInitScript(SETUP);
    const errors = [];
    const open = async (hash) => {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${hash}: ${e.message}`));
      await page.goto(`https://collect.test/#${hash}`);
      return page;
    };
    await run(open);
    assert.deepEqual(errors, [], 'no errors on the page');
  } finally {
    await browser.close();
  }
}
const shoot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
if (shots) await mkdir(shots, { recursive: true });

try {
  // ── The seller scans another app's QR: refused, and the camera keeps going ──────────────
  await withBrowser(otherVideo, async (open) => {
    const page = await open('sheet-scan');
    await page.locator('[data-testid="handover-note"]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('[data-testid="handover-note"]').textContent(), 'That isn’t a Sellio QR.');
    assert.ok(await page.evaluate(() => { const v = document.querySelector('[data-testid="qr-scanner"] video'); return !!v && v.videoWidth > 0 && !v.paused; }), 'the camera is on');
    assert.deepEqual(await page.evaluate(() => window.__calls.filter((c) => c[0] === 'shop_handover_scan')), [], 'nothing sent for it');
    const decoder = await page.evaluate(() => ('BarcodeDetector' in window ? 'BarcodeDetector' : 'jsQR'));
    passed(`Another app's QR seen by the camera (read with ${decoder}): "That isn’t a Sellio QR.", nothing sent, the camera stays on`);
  });

  // ── The camera, nothing in front of it yet (for the picture) ────────────────────────────
  await withBrowser(emptyVideo, async (open) => {
    const page = await open('sheet-card');
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="qr-scanner"] video'); return !!v && v.videoWidth > 0; }, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await shoot(page, 'seller-2-scanning');
  });

  // ── The seller scans the buyer's QR: verified and collected in one go ───────────────────
  await withBrowser(sellioVideo, async (open) => {
    const page = await open('sheet-scan');
    await page.locator('[data-testid="handover-done"]').waitFor({ timeout: 15000 });
    const scans = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'shop_handover_scan').map((c) => c[1]));
    assert.deepEqual(scans, [{ p_tenant_id: 'shop-1', p_token: TOKEN }]);
    assert.match(await page.locator('[data-testid="handover-done"]').textContent(), /^Collected/);
    assert.deepEqual(await page.locator('[data-testid="handover-items"] li').allTextContents(), ['2× Kaya toast', '1× Teh']);
    assert.equal(await page.locator('[data-testid="qr-scanner"]').count(), 0, 'the camera is off');
    assert.deepEqual(await page.evaluate(() => window.__calls.filter((c) => c[0] === 'done').length), 1);
    await page.waitForTimeout(300);
    await shoot(page, 'seller-3-scanned');
    passed('The buyer’s QR seen by the camera: sent once, the order collected, what to hand over shown, the camera off');

    // Pictures: Orders, and the buyer's QR before and after the scan.
    const orders = await open('orders');
    await orders.locator('[data-testid="order-scan-qr"]').first().waitFor({ timeout: 10000 });
    await orders.locator('[data-testid="handover-record"]').waitFor({ timeout: 10000 });
    assert.equal(await orders.locator('[data-testid="order-scan-qr"]').count(), 2, 'collection and delivery');
    assert.match(await orders.locator('[data-testid="handover-track"]').first().textContent(), /^QR issued .* · Shown on the buyer’s phone /);
    assert.match(await orders.locator('[data-testid="handover-record"]').textContent(), /^Verified by QR scan · /);
    assert.equal(await orders.locator('[data-testid="order-courier-link"]').count(), 1, 'the delivery order only');
    assert.equal(await orders.locator('[data-testid="order-courier-link"]').textContent(), 'Send a courier link');
    await shoot(orders, 'seller-1-orders');
    const sheet = await open('courier-sheet');
    await sheet.locator('[data-testid="courier-url"]').waitFor({ timeout: 10000 });
    assert.equal(await sheet.locator('[data-testid="courier-url"]').textContent(), 'https://sellio.sg/courier/abcdefabcdefabcdefabcdefabcdef12');
    await sheet.waitForTimeout(300);
    await shoot(sheet, 'seller-4-courier-link');
    const purchase = await open('purchase');
    await purchase.locator('[data-testid="purchase-handover-pass-qr"]').waitFor({ timeout: 10000 });
    await purchase.locator('[data-testid="purchase-handover"]').scrollIntoViewIfNeeded();
    await shoot(purchase, 'buyer-1-qr');
    await purchase.evaluate(() => { window.__handedOver = true; });
    await purchase.locator('[data-testid="purchase-verified"]').waitFor({ timeout: 10000 });
    assert.equal(await purchase.locator('[data-testid="purchase-handover-pass-qr"]').count(), 0, 'the QR cleared');
    assert.match(await purchase.locator('[data-testid="purchase-verified"]').textContent(), /^Verified by QR scan · /);
    await purchase.evaluate(() => window.scrollTo(0, 0));
    await shoot(purchase, 'buyer-2-cleared');
    passed('Orders (Scan buyer’s QR for collection and delivery, the QR’s track, the verified record); the buyer’s QR clears within seconds of the scan');
  });
  // ── The courier's page: the camera reads the buyer's QR, the order is delivered ────────────
  await withBrowser(emptyVideo, async (open) => {
    const page = await open('courier');
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="qr-scanner"] video'); return !!v && v.videoWidth > 0; }, null, { timeout: 15000 });
    assert.equal(await page.locator('[data-testid="courier-order"]').textContent(), 'DeliveryOrder #ORD-000013From Ann Bakes');
    assert.equal(await page.title(), 'Delivery · Sellio');
    await page.waitForTimeout(500);
    await shoot(page, 'courier-1-page');
  });
  await withBrowser(sellioVideo, async (open) => {
    const page = await open('courier');
    await page.locator('[data-testid="courier-done"]').waitFor({ timeout: 15000 });
    const scans = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'courier_handover_scan').map((c) => c[1]));
    assert.deepEqual(scans, [{ p_link: 'abcdefabcdefabcdefabcdefabcdef12', p_token: TOKEN }]);
    assert.match(await page.locator('[data-testid="courier-done"]').textContent(), /^DeliveredOrder #ORD-000013Verified by QR scan · /);
    assert.equal(await page.locator('[data-testid="qr-scanner"]').count(), 0, 'the camera is off');
    await page.waitForTimeout(300);
    await shoot(page, 'courier-2-delivered');
    passed('The courier’s page (no account): the buyer’s QR seen by the camera is sent once with the link, and the order shows delivered');
  });
  console.log(`handover QR (browser): ${passes} passed`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
