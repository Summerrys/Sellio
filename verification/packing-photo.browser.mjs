// Packing photo in a real browser (Chrome, as a phone) with a camera that sees a packed parcel with
// "ORD-000041" written on a note: Orders → Packed · take photo opens Sellio's camera (getUserMedia),
// the photo is drawn from the camera's picture with the stamp (order number · shop · time) across
// its foot, uploaded as a JPEG to <shop>/<order>/<uuid>.jpg and recorded; the order is packed and
// its photo shows on the card. My purchases shows the buyer the same photo. Takes pictures of each.
// Run after `npm run build` (for the app's styles):
//   node verification/packing-photo.browser.mjs /tmp/sellio-verification [picture folder]
// (/tmp/sellio-verification has playwright-core; Chrome at CHROME_PATH or /usr/bin/google-chrome;
// ffmpeg makes the camera's video; python3 with Pillow draws the parcel.)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const shots = process.argv[3] || null;

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const temporary = await mkdtemp(path.join(os.tmpdir(), 'sellio-packing-browser-'));
// The parcel (1280 × 960, as a phone's camera gives it), as a Y4M video Chrome's fake camera plays.
const scene = path.join(temporary, 'parcel.png');
await writeFile(path.join(temporary, 'parcel.py'), `
from PIL import Image, ImageDraw, ImageFont
W, H = 1280, 960
img = Image.new('RGB', (W, H), (44, 48, 58))
d = ImageDraw.Draw(img)
d.rectangle([0, 640, W, H], fill=(112, 82, 58))
d.rectangle([0, 640, W, 654], fill=(92, 66, 46))
d.polygon([(250, 330), (900, 290), (1010, 380), (360, 425)], fill=(214, 164, 107))
d.polygon([(360, 425), (1010, 380), (1010, 760), (360, 815)], fill=(196, 141, 85))
d.polygon([(250, 330), (360, 425), (360, 815), (250, 720)], fill=(168, 116, 63))
d.polygon([(575, 352), (650, 347), (690, 395), (614, 400)], fill=(233, 214, 183))
d.polygon([(614, 400), (690, 395), (690, 770), (614, 776)], fill=(222, 202, 170))
d.polygon([(420, 520), (760, 495), (768, 700), (428, 726)], fill=(255, 254, 246))
try:
    big = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/ofl/comicrelief/ComicRelief-Bold.ttf', 50)
    small = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/ofl/comicrelief/ComicRelief-Bold.ttf', 34)
except Exception:
    big = small = ImageFont.load_default()
note = Image.new('RGBA', (400, 230), (0, 0, 0, 0))
nd = ImageDraw.Draw(note)
nd.text((16, 48), 'ORD-000041', font=big, fill=(31, 41, 55, 255))
nd.text((20, 122), 'Cai Ling', font=small, fill=(55, 65, 81, 255))
note = note.rotate(4, expand=True, resample=Image.BICUBIC)
img.paste(note, (418, 478), note)
img.save(${JSON.stringify(scene)})
`);
execFileSync('python3', [path.join(temporary, 'parcel.py')]);
const parcelVideo = path.join(temporary, 'parcel.y4m');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', scene, '-vf', 'format=yuv420p', '-frames:v', '1', '-f', 'yuv4mpegpipe', parcelVideo]);

const PAGE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { PurchaseDetail } from '@/components/explore/ExplorePurchases';
import Orders from '@/pages/Orders';

const screen = location.hash.slice(1);
let view = null;
if (screen === 'orders') view = <QueryClientProvider client={new QueryClient()}><Orders /></QueryClientProvider>;
else if (screen === 'purchase') view = <Routes><Route path="/explore/purchases/:orderId" element={<PurchaseDetail />} /></Routes>;
const start = screen === 'purchase' ? ['/explore/purchases/p1'] : ['/Orders'];
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

// What the page's stand-in Supabase answers (the server's rules: verification/packing-photo.sql).
// Uploaded photos are kept on the page; their links are the photos themselves.
const SETUP = `
window.__calls = [];
window.__uploads = {};
const minute = 60000;
window.__orders = [
  { id: 'o41', order_number: 'ORD-000041', status: 'preparing', type: 'takeaway', customer_name: 'Cai Ling', customer_phone: '+6591234567', total_amount: 24, payment_status: 'paid', payment_method: 'qr',
    items: [{ name: 'Pineapple tarts (box of 20)', quantity: 1, price: 18 }, { name: 'Kaya jar', quantity: 1, price: 6 }], fulfilment: { method: 'collection', area: 'Tampines' }, created_date: new Date(Date.now() - 35 * minute).toISOString() },
  { id: 'o40', order_number: 'ORD-000040', status: 'confirmed', type: 'delivery', customer_name: 'Eve Lim', customer_phone: '+6587654321', total_amount: 18, payment_status: 'unpaid',
    items: [{ name: 'Pineapple tarts (box of 20)', quantity: 1, price: 18 }], fulfilment: { method: 'delivery', address: 'Blk 456 Bedok North Ave 3 #05-12' }, created_date: new Date(Date.now() - 50 * minute).toISOString() },
];
window.__tenant = { tenantId: 'shop-1', tenant: { id: 'shop-1', name: 'Ann Bakes', industry: 'retail', seller_type: 'individual', country: 'SG', settings: { currency: 'SGD' } },
  hasPermission: () => true, subscription: null, canUseFeature: () => false, isLoading: false };
window.__photos = [];
const chain = (result) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q, update: () => q,
  maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (a, b) => Promise.resolve(result).then(a, b) }; return q; };
window.__client = {
  from: (table) => chain({ data: table === 'orders' ? window.__orders : [], error: null }),
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  storage: { from: (bucket) => ({
    upload: async (where, blob, options) => { window.__calls.push(['upload', bucket, where, blob.type, blob.size, options]); window.__uploads[where] = blob; return { data: { path: where }, error: null }; },
    createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: window.__uploads[p] ? URL.createObjectURL(window.__uploads[p]) : window.__photoLink || null })), error: null }),
  }) },
  rpc: async (name, args) => {
    window.__calls.push([name, args]);
    if (name === 'shop_handovers') return { data: window.__orders.map((o) => ({ order_id: o.id, has_qr: true, issued_at: o.created_date,
      first_shown_at: null, last_shown_at: null, verified_at: null })), error: null };
    if (name === 'shop_packing_photos') return { data: window.__photos, error: null };
    if (name === 'shop_packing_photo') {
      const made = { order_id: args.p_order_id, path: args.p_path, taken_at: new Date().toISOString(), taken_by_name: 'Ann', photos: 1 };
      window.__photos = [made];
      window.__orders = window.__orders.map((o) => (o.id === args.p_order_id ? { ...o, status: 'ready' } : o));
      return { data: { ok: true, order_number: 'ORD-000041', status: 'ready', ...made }, error: null };
    }
    if (name === 'my_purchases') return { data: [{ id: 'p1', order_number: 'ORD-000041', status: 'ready', type: 'takeaway', items: window.__orders[0].items, subtotal: 24, total_amount: 24,
      payment_status: 'paid', fulfilment: { method: 'collection', area: 'Tampines', collection_address: 'Blk 123 Tampines St 11' }, created_date: new Date(Date.now() - 35 * minute).toISOString(), updated_date: new Date().toISOString(),
      status_times: { pending: new Date(Date.now() - 35 * minute).toISOString(), confirmed: new Date(Date.now() - 30 * minute).toISOString(), preparing: new Date(Date.now() - 20 * minute).toISOString(), ready: new Date(Date.now() - minute).toISOString() },
      shop_id: 'shop-1', shop_name: 'Ann Bakes', shop_slug: 'ann-bakes', shop_type: 'individual', currency: 'SGD', can_cancel: false }], error: null };
    if (name === 'my_packing_photo') return { data: { path: 'shop-1/p1/photo.jpg', taken_at: new Date(Date.now() - minute).toISOString() }, error: null };
    if (name === 'my_handover') return { data: { token: '0123456789abcdef0123456789abcdef', pin: '482913', status: 'ready', issued_at: new Date(Date.now() - 35 * minute).toISOString() }, error: null };
    return { data: null, error: null };
  },
};
`;

async function withBrowser(run) {
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${parcelVideo}`],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore', permissions: ['camera'] });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'packing.test') return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });
    await context.addInitScript(SETUP);
    const errors = [];
    const open = async (hash, before = null) => {
      if (before) await context.addInitScript(before);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${hash}: ${e.message}`));
      await page.goto(`https://packing.test/#${hash}`);
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
  await withBrowser(async (open) => {
    const page = await open('orders');
    const step = page.locator('[data-testid="order-packing-photo"]');
    await step.waitFor({ timeout: 15000 });
    assert.equal(await step.textContent(), 'Packed · take photo');
    assert.equal(await page.locator('[data-testid="packing-hint"]').textContent(), 'The buyer sees this photo. Write ORD-000041 on the parcel or a note, and keep it in the photo.');
    await page.waitForTimeout(300);
    await shoot(page, 'packing-1-orders');

    // A card's pop-up covers the whole screen, from the very top: the list's 12px between cards
    // isn't put above it too. A tap in the top strip lands on the pop-up's backdrop and closes it.
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-sellio-order-card]')].map((c) => { const r = c.getBoundingClientRect(); return [r.top, r.bottom]; }));
    assert.equal(cards.length, 2);
    assert.equal(cards[1][0] - cards[0][1], 12, '12px between the cards');
    await page.locator('[data-sellio-order-card]').nth(1).getByRole('button', { name: '💳 Mark as Paid' }).click();
    const pay = page.getByRole('dialog', { name: 'Take payment' });
    await pay.waitFor({ timeout: 5000 });
    assert.deepEqual(await pay.evaluate((d) => { const r = d.parentElement.getBoundingClientRect(); return [r.top, r.height]; }), [0, 844], 'the pop-up’s backdrop: the whole screen');
    await page.mouse.click(195, 5);
    await pay.waitFor({ state: 'detached', timeout: 5000 });
    passed('Orders: 12px between cards; a card’s pop-up covers the whole screen from the top, and a tap in its top strip closes it');

    // Sellio's camera: the parcel, the order number large, where the stamp goes.
    await step.click();
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="packing-sheet"] video'); return !!v && v.videoWidth > 0 && !v.paused; }, null, { timeout: 15000 });
    assert.ok(await page.locator('[data-testid="packing-shutter"]').isEnabled());
    assert.equal(await page.locator('[data-testid="packing-number"]').textContent(), 'ORD-000041');
    assert.match(await page.locator('[data-testid="packing-stamp"]').textContent(), /^ORD-000041 · Ann Bakes · \d{1,2} [A-Z][a-z]{2} 2026, \d{1,2}:\d\d (am|pm)$/);
    assert.equal(await page.locator('[data-testid="packing-sheet"] input[type="file"]').count(), 0, 'no photo from the gallery');
    await page.waitForTimeout(400);
    await shoot(page, 'packing-2-camera');

    // Taken: the camera's picture, stamped across its foot.
    await page.locator('[data-testid="packing-shutter"]').click();
    const preview = page.locator('[data-testid="packing-preview"]');
    await preview.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="packing-preview"]')?.complete);
    const photo = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="packing-preview"]');
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext('2d');
      c.drawImage(img, 0, 0);
      const strip = (y0, y1) => {
        const { data } = c.getImageData(0, y0, canvas.width, y1 - y0);
        let dark = 0; let white = 0; let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
          n += 1; if (v < 70) dark += 1; if (v > 225) white += 1;
        }
        return { dark: dark / n, white: white / n };
      };
      const band = Math.round(Math.max(16, Math.round(canvas.width / 34)) * 2.1);
      return { width: canvas.width, height: canvas.height, band: strip(canvas.height - band + 4, canvas.height - 4), above: strip(canvas.height - band - 60, canvas.height - band - 20) };
    });
    assert.deepEqual([photo.width, photo.height], [1280, 960], 'the camera’s whole picture (1280 × 960, under 1600)');
    assert.ok(photo.band.dark > 0.6, `the stamp's dark band across the foot (${photo.band.dark.toFixed(2)})`);
    assert.ok(photo.band.white > 0.01, `with the stamp's white words on it (${photo.band.white.toFixed(3)})`);
    assert.ok(photo.above.dark < 0.2, `the parcel's table above it, not darkened (${photo.above.dark.toFixed(2)})`);
    assert.equal(await page.locator('[data-testid="packing-instruction"]').textContent(), 'Can you read ORD-000041 in the photo? The buyer will see it.');
    await page.waitForTimeout(200);
    await shoot(page, 'packing-3-taken');

    // Use photo: uploaded as a JPEG into the order's folder, recorded, packed; its photo on the card.
    await page.locator('[data-testid="packing-use"]').click();
    await page.locator('[data-testid="packing-sheet"]').waitFor({ state: 'detached', timeout: 10000 });
    const sent = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'upload' || c[0] === 'shop_packing_photo'));
    assert.equal(sent.length, 2);
    const [, bucket, where, type, size, options] = sent[0];
    assert.equal(bucket, 'order-photos');
    assert.match(where, /^shop-1\/o41\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/);
    assert.equal(type, 'image/jpeg');
    assert.ok(size > 20000 && size < 1500000, `a real photo's size (${size} bytes)`);
    assert.deepEqual(options, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    assert.deepEqual(sent[1], ['shop_packing_photo', { p_tenant_id: 'shop-1', p_order_id: 'o41', p_path: where }]);
    await page.locator('[data-testid="packing-thumb"] img').waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="packing-thumb"] img')?.naturalWidth === 1280, null, { timeout: 10000 });
    assert.match(await page.locator('[data-testid="packing-record"]').textContent(), /^Packing photoPacked [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d (AM|PM) · Ann$/);
    assert.equal(await page.locator('[data-testid="order-scan-qr"]').count(), 1, 'packed: next, the buyer’s QR');
    await page.waitForTimeout(600);
    await shoot(page, 'packing-4-packed');
    await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10000 });
    await page.locator('[data-testid="packing-thumb"]').click();
    await page.locator('[data-testid="packing-viewer"] img').waitFor({ timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('[data-testid="packing-viewer"]').getBoundingClientRect(); return [r.top, r.height]; }), [0, 844], 'the whole screen (not pushed down by the list’s spacing)');
    assert.ok(await page.getByRole('button', { name: 'Close photo' }).isVisible());
    await page.waitForTimeout(300);
    await shoot(page, 'packing-5-viewer');
    passed('Orders → Packed · take photo: Sellio’s camera shows the parcel with the order number large; the photo is the camera’s picture with the stamp across its foot; Use photo uploads a JPEG to the order’s folder, records it, the order is packed (Scan QR next) and its photo shows on the card, full screen on a tap');

    // The buyer: the same photo in My purchases.
    const jpeg = await page.evaluate(async () => {
      const blob = Object.values(window.__uploads)[0];
      return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
    });
    const purchase = await open('purchase', `window.__photoLink = ${JSON.stringify(jpeg)};`);
    await purchase.locator('[data-testid="purchase-packing-photo"] img').waitFor({ timeout: 10000 });
    await purchase.waitForFunction(() => document.querySelector('[data-testid="purchase-packing-photo"] img')?.naturalWidth === 1280, null, { timeout: 10000 });
    assert.match(await purchase.locator('[data-testid="purchase-packing-when"]').textContent(), /^Packed \d{1,2} [A-Z][a-z]{2}, \d{1,2}:\d\d (am|pm)\. The seller took this photo in Sellio\.$/);
    await purchase.locator('[data-testid="purchase-packing"]').scrollIntoViewIfNeeded();
    await purchase.waitForTimeout(300);
    await shoot(purchase, 'packing-6-buyer');
    passed('My purchases: the buyer sees the packing photo (stamped) and when it was packed');
  });
  console.log(`packing photo (browser): ${passes} passed`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
