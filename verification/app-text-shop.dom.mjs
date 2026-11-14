// The owner app in Bahasa Indonesia, group 2 (Alvin, 14 Nov 2026: "proceed with group 2"): the
// Dashboard, Orders, Counter, Kitchen, Products and Settings, and what they open (plans, billing,
// the account panel). Covers: the shop catalog (complete, the same words as group 1 where both
// show a phrase), dates and times in Indonesian order, the shared helpers in the screen's
// language, and real screens in Indonesian with no English phrase left on them.
// Run: node verification/app-text-shop.dom.mjs   (jsdom installed in /tmp/sellio-verification)
process.env.TZ = 'UTC';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: (navigation|HTMLCanvasElement|window\.scrollTo)/.test(error?.message)) console.error(error); });
// A reviewer on the Dashboard with the preview link.
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Dashboard?preview_language=id', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'SVGElement', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
win.scrollTo = () => {};
Object.defineProperty(win.navigator, 'languages', { value: ['en-US'], configurable: true });

// React's own warnings (a list without keys, say) are failures here.
const reactWarnings = [];
const realError = console.error;
console.error = (...args) => { const line = args.map(String).join(' '); if (/Warning|key/.test(line)) reactWarnings.push(line); realError(...args); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

// ── Fixtures for the app modules the screens use ──────────────────────────────────────────
globalThis.tenantFixture = { tenant: { slug: 'warung-bu-sri', name: 'Warung Bu Sri', currency: 'IDR', country: 'Indonesia' }, tenantId: 'tenant-1', hasPermission: () => true, canUseFeature: () => true };
globalThis.supabaseRows = {};
const query = (table) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; }, update() { return q; },
    then(resolve, reject) { return Promise.resolve({ data: globalThis.supabaseRows[table] || [], error: null }).then(resolve, reject); },
  };
  return q;
};
globalThis.supabaseFixture = {
  from: (table) => query(table),
  channel: () => { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; },
  removeChannel() {},
  auth: { signOut: async () => ({}) },
};

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-app-text-shop-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * as appText from '@/lib/appText';",
  "export { formatAppDate, appTimeAgo } from '@/lib/appDates';",
  "export { formatBillingDate } from '@/lib/billing';",
  "export { listNoteWords } from '@/components/ui-custom/OfflineNote';",
  "export { timeAgo } from '@/components/explore/shared';",
  "export { itemWords } from '@/lib/planFeatures';",
  "export { default as shopCatalog } from '@/locales/id/shop.json';",
  "export { default as signupCatalog } from '@/locales/id/signup.json';",
  "export { ID_GROUPS } from '@/locales/id/index.js';",
  "export { default as OrdersEmpty } from '@/components/orders/OrdersEmpty';",
  "export { default as OrderCard } from '@/components/orders/OrderCard';",
  "export { default as Tables } from '@/pages/Tables';",
  "export { default as TagInput } from '@/components/products/TagInput';",
  "export { default as ProductFormPricing } from '@/components/products/ProductFormPricing';",
  "export { default as ProductFormVariants } from '@/components/products/ProductFormVariants';",
  "export { default as TrialReminderModal } from '@/components/subscription/TrialReminderModal';",
  "export { default as PlanFeatureNotice } from '@/components/subscription/PlanFeatureNotice';",
  "export { default as BillingStatusBanner } from '@/components/subscription/BillingStatusBanner';",
  "export { default as SubscriptionEndedNotice } from '@/components/subscription/SubscriptionEndedNotice';",
].join('\n'));
const mock = { name: 'app-text-shop-fixtures', setup(b) {
  b.onResolve({ filter: /tenant\/TenantContext$/ }, () => ({ path: 'tenant', namespace: 'mock' }));
  b.onResolve({ filter: /^sonner$/ }, () => ({ path: 'sonner', namespace: 'mock' }));
  b.onResolve({ filter: /lib\/supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
  b.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: 'db', namespace: 'mock' }));
  b.onResolve({ filter: /^qrcode$/ }, () => ({ path: 'qrcode', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', resolveDir: process.cwd(), contents: {
    tenant: "import { createContext } from 'react'; export const useTenant = () => globalThis.tenantFixture; export default createContext(null);",
    sonner: 'const note = () => {}; export const toast = Object.assign(note, { success: note, error: note, info: note, message: note, custom: note }); export const Toaster = () => null;',
    supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://project.example.invalid";',
    db: 'export default { entities: {} };',
    qrcode: 'export default { toDataURL: async () => "data:image/png;base64,AA==" };',
  }[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
// React and the rest resolve from the app (the same copies this file uses).
const local = path.join(process.cwd(), '.app-text-shop.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));
const { appText, shopCatalog, signupCatalog } = app;
const { appT } = appText;

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (ms = 40) => act(async () => { await sleep(ms); });
const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
async function mount(element) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await settle();
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const withQueries = (element) => h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MemoryRouter, null, element));

// English left on a screen: any 3-word stretch of a catalog phrase, and words only English uses.
const englishParts = [];
for (const phrase of Object.keys(shopCatalog)) {
  for (const part of phrase.split(/\{[a-zA-Z0-9_]+\}/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3 && part.trim().length >= 12) englishParts.push(part.trim());
  }
}
const ENGLISH_WORDS = /\b(the|your|you|and|with|for|of|is|are|this|that|to|or|in|on|at|by|from|will|can|please|sign|our)\b/gi;
const visible = (host) => { const copy = host.cloneNode(true); copy.querySelectorAll('style, script').forEach((el) => el.remove()); return text(copy); };
const checkScreen = (host, what, mustShow = []) => {
  const shown = visible(host);
  assert.ok(shown.length > 0, `${what}: something on screen`);
  assert.ok(!/\[object Object\]/.test(shown), `${what}: no "[object Object]"`);
  assert.deepEqual(englishParts.filter((part) => shown.includes(part)), [], `${what}: English left on the Indonesian screen`);
  assert.deepEqual(shown.match(ENGLISH_WORDS) || [], [], `${what}: English words on the Indonesian screen: ${shown}`);
  for (const words of mustShow) assert.ok(shown.includes(words), `${what} shows "${words}": ${shown}`);
  return shown;
};

try {
  // 1. The catalogs
  assert.deepEqual(Object.keys(app.ID_GROUPS), ['signup', 'shop'], 'Group 1 (sign-up) and group 2 (the shop screens)');
  const blanks = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
  const notIndonesian = /\b(kamu|kau|sila|percuma|kedai|kata laluan|telefon|bimbit|anda)\b/;
  let shared = 0;
  for (const [english, indonesian] of Object.entries(shopCatalog)) {
    assert.ok(typeof indonesian === 'string' && indonesian.trim(), `"${english}" has Indonesian`);
    assert.equal(blanks(indonesian), blanks(english), `"${english}" keeps its blanks`);
    assert.ok(!notIndonesian.test(indonesian), `"${indonesian}": Indonesian, formal "Anda" (not Malay, not "kamu")`);
    if (english in signupCatalog) { shared++; assert.equal(indonesian, signupCatalog[english], `"${english}": the same words in both groups`); }
  }
  assert.ok(shared > 100, 'Phrases both groups show (Save, Cancel, the selling settings…) are in both, so either can go live first');
  passed(`The shop catalog: ${Object.keys(shopCatalog).length} phrases (${shared} shared with sign-up, word for word), each with its blanks, formal Indonesian`);

  // The preview link from the Dashboard
  assert.equal(appText.appLanguage(), 'id');
  await appText.appTextReady();
  assert.equal(appT('Kitchen Display'), 'Layar Dapur', 'Group 2 words load with the preview');
  assert.equal(appT('Save'), 'Simpan');

  // 2. Dates and times
  const at = new Date('2026-11-14T06:30:00Z'); // a Saturday, 06:30 UTC
  assert.equal(app.formatAppDate(at, 'MMM d, yyyy'), '14 Nov 2026', 'Day first');
  assert.equal(app.formatAppDate(at, 'MMM dd, yyyy HH:mm'), '14 Nov 2026 06.30', 'The 24-hour clock with a dot');
  assert.equal(app.formatAppDate(at, 'h:mm a'), '06.30');
  assert.equal(app.formatAppDate(at, 'HH:mm'), '06.30');
  assert.equal(app.formatAppDate(at, 'EEE, MMM d'), 'Sab, 14 Nov', 'Indonesian day names');
  assert.equal(app.formatAppDate(at, 'd MMMM yyyy'), '14 November 2026');
  assert.equal(app.formatAppDate(new Date('2027-05-05T00:00:00Z'), 'd MMMM yyyy'), '5 Mei 2027', 'Indonesian month names');
  assert.equal(app.appTimeAgo(new Date(Date.now() - 5 * 60000)), '5 menit yang lalu');
  assert.match(app.formatBillingDate('2026-11-16T02:30:00Z'), /^16 Nov 2026,? 10\.30$/, "Stripe's dates (Singapore time) in Indonesian order");
  await act(async () => { appText.setAppLanguage('en'); });
  assert.equal(app.formatAppDate(at, 'MMM d, yyyy'), 'Nov 14, 2026', 'English keeps the pattern it was written with');
  assert.equal(app.formatAppDate(at, 'h:mm a'), '6:30 AM');
  assert.equal(app.appTimeAgo(new Date(Date.now() - 5 * 60000)), '5 minutes ago');
  assert.match(app.formatBillingDate('2026-11-16T02:30:00Z'), /^16 Nov 2026,? 10:30\s?am$/i);
  await act(async () => { appText.setAppLanguage('id'); });
  await appText.appTextReady();
  passed('Dates and times: day first, Indonesian names, 14.30 (English unchanged)');

  // 3. Shared helpers: English unless the screen passes its words
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
  assert.equal(app.timeAgo(fiveMinutesAgo), '5 min ago', 'No t: English (store pages, Explore)');
  assert.equal(app.timeAgo(fiveMinutesAgo, appT), '5 menit lalu');
  assert.deepEqual(app.itemWords('individual', appT), { Products: 'Produk', products: 'produk', Product: 'Produk', product: 'produk' });
  const loadedAt = new Date(Date.now() - 60000);
  const offline = app.listNoteWords({ online: false, what: appT('orders'), at: loadedAt, offlineText: 'x', failedText: 'y' }, Date.now(), appT);
  const clock = `${String(loadedAt.getHours()).padStart(2, '0')}.${String(loadedAt.getMinutes()).padStart(2, '0')}`;
  assert.equal(offline.title, `Anda sedang offline. Menampilkan pesanan yang dimuat pada ${clock}.`);
  const english = app.listNoteWords({ online: true, what: 'orders', at: loadedAt, latest: 50 }, Date.now());
  assert.match(english.title, /^Couldn’t update the orders\. Showing your latest 50 orders from \d{1,2}:\d{2} (am|pm)\.$/);
  passed('Shared helpers (time ago, item words, the offline note) in the screen’s words, English without them');

  // 4. Real screens in Indonesian
  let page = await mount(withQueries(h(app.OrdersEmpty, { kind: 'tab', tab: 'pending', onSeeAll() {} })));
  checkScreen(page.host, 'Orders, nothing new', ['Tidak ada pesanan baru', 'Pesanan baru menunggu di sini sampai Anda menerimanya.']);
  await page.unmount();
  page = await mount(withQueries(h(app.OrdersEmpty, { kind: 'search', query: 'nasi', foundElsewhere: 2, onSeeAll() {}, onClearSearch() {} })));
  checkScreen(page.host, 'Orders, a search with no match', ['Tidak ada pesanan yang cocok dengan “nasi”', '2 pesanan dengan status lain cocok.', 'Cari di semua pesanan']);
  await page.unmount();
  page = await mount(withQueries(h(app.OrdersEmpty, { kind: 'failed', onRetry() {} })));
  checkScreen(page.host, 'Orders, not loaded', ['Pesanan Anda tidak bisa dimuat', 'Coba lagi']);
  await page.unmount();

  const order = { id: 'o1', order_number: 'ORD-000123', created_date: at.toISOString(), type: 'dine_in', table_name: '5', status: 'pending', total_amount: 45000,
    notes: 'Tanpa sambal', items: [1, 2, 3, 4].map((n) => ({ product_name: `Nasi Goreng ${n}`, quantity: n, variant: n === 1 ? 'Pedas' : null })) };
  page = await mount(h(app.OrderCard, { order, currency: 'IDR', onStatusChange() {}, onClick() {} }));
  checkScreen(page.host, 'An order card', ['Meja 5', '+1 item lainnya', 'Catatan: Tanpa sambal', '06.30', 'Terima', 'Rp45.000']);
  await page.unmount();

  globalThis.supabaseRows = { tables: [], table_sessions: [] };
  page = await mount(withQueries(h(app.Tables)));
  await settle(120);
  checkScreen(page.host, 'Tables, none yet', ['Belum ada meja', 'Tambah meja', 'Pelanggan memindainya untuk memesan dari meja mereka.']);
  await page.unmount();
  globalThis.supabaseRows = { tables: [{ id: 'tb1', tenant_id: 'tenant-1', name: 'Meja 1', capacity: 4, zone: 'Teras', status: 'available', is_active: true, qr_code: 'tb1' }], table_sessions: [] };
  page = await mount(withQueries(h(app.Tables)));
  await settle(120);
  checkScreen(page.host, 'Tables, one table', ['Meja 1', '4 kursi', 'Tambah Meja']);
  await page.unmount();

  let tags = ['halal'];
  page = await mount(h(app.TagInput, { id: 'tags', value: tags, onChange: (next) => { tags = next; } }));
  checkScreen(page.host, 'Tags', ['halal']);
  assert.equal(page.host.querySelector('input')?.getAttribute('placeholder'), 'Tambah lagi');
  await page.unmount();

  page = await mount(h(app.ProductFormPricing, { formData: { price: '25000', cost_price: '15000', compare_at_price: '' }, onChange() {}, currency: 'IDR' }));
  checkScreen(page.host, 'Product pricing', ['Harga (IDR) *', 'Harga Modal (IDR)', 'Margin Keuntungan:']);
  await page.unmount();
  page = await mount(h(app.ProductFormVariants, { formData: { currency: 'IDR', variants: [{ name: 'Ukuran', type: 'single', options: [{ name: 'Besar', price_modifier: 5000 }] }] }, onChange() {} }));
  checkScreen(page.host, 'Variants and add-ons', ['Pilih satu', 'Tambah pilihan', 'Tambah grup varian']);
  await page.unmount();

  page = await mount(h(app.TrialReminderModal, { hoursLeft: 5, onUpgrade() {}, onDismiss() {} }));
  checkScreen(page.host, 'The trial reminder', ['Masa uji coba Anda segera berakhir', 'Sisa waktu Anda 5 jam.', 'Pilih Paket']);
  await page.unmount();
  page = await mount(h(MemoryRouter, null, h(app.PlanFeatureNotice, { feature: 'can_use_pos', onSeePlans() {}, freeTrial: true })));
  checkScreen(page.host, 'Not in your plan', ['Tidak termasuk dalam paket Anda', 'Kasir tidak termasuk dalam paket Anda. Fitur ini ada di paket bisnis, gratis selama 7 hari.']);
  await page.unmount();
  page = await mount(h(app.BillingStatusBanner, { tenantId: 'tenant-1', isOwner: true, subscription: { status: 'past_due', invoice_amount_due_minor: 3900, invoice_currency: 'SGD',
    next_payment_attempt: '2026-11-16T02:30:00Z', grace_period_ends_at: '2026-11-21T02:30:00Z' } }));
  checkScreen(page.host, 'A payment that needs attention', ['Pembayaran perlu perhatian · ', '39.00 belum dibayar', 'Stripe akan mencoba lagi pada 16 Nov 2026', 'Akses toko tetap tersedia sampai 21 Nov 2026']);
  await page.unmount();
  page = await mount(h(app.SubscriptionEndedNotice, { subscription: { status: 'active' }, storeName: 'Warung Bu Sri' }));
  checkScreen(page.host, 'A store whose plan ended', ['Langganan toko ini telah berakhir', 'Sellio dijeda untuk Warung Bu Sri.']);
  await page.unmount();
  assert.ok(!reactWarnings.some((line) => /unique "key"/.test(line)), 'Links and bold names in a sentence have keys: ' + reactWarnings.join('\n'));
  passed('Orders, an order card, Tables, tags, pricing, variants, the trial reminder, plan and billing notices in Indonesian, with no English left');

  // 5. Back to English, at once
  page = await mount(withQueries(h(app.OrdersEmpty, { kind: 'tab', tab: 'pending', onSeeAll() {} })));
  await act(async () => { appText.setAppLanguage('en'); });
  assert.match(text(page.host), /No new orders\s*New orders wait here until you accept them\./);
  await page.unmount();
  passed('The same screen in English as soon as English is picked');

  console.log(`\nAll ${passes} checks passed.`);
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
}
dom.window.close();
// React Query's refetch timers (Tables) would keep the process waiting.
process.exit(0);
