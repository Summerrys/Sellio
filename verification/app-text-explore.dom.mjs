// The owner app in Bahasa Indonesia, group 3 (Alvin, 16 Nov 2026: "Proceed with group 3"):
// Explore, a listing, the cart, My purchases, My likes, Me, chats and ratings. Covers: the
// explore catalog (complete, the same words as groups 1 and 2 where they share a phrase), the
// group switch (English for everyone but a reviewer until the group is live), real screens in
// Indonesian with no English phrase left on them, the database's own words through t(), and
// the shared pieces staying English where a store page shows them.
// Run: node verification/app-text-explore.dom.mjs   (jsdom installed in /tmp/sellio-verification)
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
// An Indonesian phone on Explore: groups 1 and 2 are live, group 3 isn't yet.
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'SVGElement', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
win.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
globalThis.IntersectionObserver = win.IntersectionObserver;
win.scrollTo = () => {};
win.HTMLElement.prototype.scrollIntoView = () => {};
Object.defineProperty(win.navigator, 'languages', { value: ['id-ID', 'id'], configurable: true });
console.warn = () => {};

const reactWarnings = [];
const realError = console.error;
console.error = (...args) => { const line = args.map(String).join(' '); if (/Warning|key/.test(line)) reactWarnings.push(line); realError(...args); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

// ── A small Sellio ───────────────────────────────────────────────────────────────────────
const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const SHOP = { id: 't-sri', name: 'Warung Bu Sri', slug: 'warung-bu-sri', logo_url: null, currency: 'IDR', type: 'individual', item_count: 4, since: '2025-08-01T00:00:00Z' };
const ITEMS = [
  { product_id: 'p-nasi', product_name: 'Nasi Goreng Spesial', price: 25000, compare_at_price: 30000, currency: 'IDR', image_url: null, shop_id: 't-sri', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', shop_type: 'individual', listed_at: minutesAgo(5) },
  { product_id: 'p-es', product_name: 'Es Teh Manis', price: 5000, currency: 'IDR', image_url: null, shop_id: 't-sri', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', shop_type: 'individual', listed_at: minutesAgo(60 * 50) },
];
const CHATS = [
  { id: 'c-1', box: 'buying', tenant_id: 't-sri', shop_name: 'Warung Bu Sri', buyer_name: 'Budi Santoso', product_name: 'Nasi Goreng Spesial', last_message_at: minutesAgo(5),
    last_message_preview: 'Bisa diambil jam 3', from_me: false, unread: 1, online: true, last_seen_at: minutesAgo(0) },
  { id: 'c-2', box: 'selling', tenant_id: 't-home', shop_name: 'Toko Kue Sri', buyer_name: 'Sri Wahyuni', product_name: 'Kue Lapis', last_message_at: minutesAgo(60 * 30),
    last_message_preview: 'Photo', from_me: true, unread: 0, online: false, last_seen_at: minutesAgo(12) },
];
const ORDER = {
  id: 'o-1', order_number: 'ORD-000121', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', shop_type: 'individual', status: 'confirmed', currency: 'IDR',
  created_date: '2026-11-14T06:30:00Z', status_times: { pending: '2026-11-14T06:30:00Z', confirmed: '2026-11-14T06:40:00Z' }, payment_status: 'unpaid',
  total_amount: 55000, items: [{ product_id: 'p-nasi', name: 'Nasi Goreng Spesial', quantity: 2, price: 25000, variant: 'Pedas', notes: 'Tanpa bawang' }],
  fulfilment: { method: 'collection', date: '2026-11-15', area: 'Kebayoran Baru', fee: 0 }, can_cancel: false,
};
globalThis.rpcCalls = [];
function rpc(name, args = {}) {
  globalThis.rpcCalls.push([name, args]);
  const rows = {
    explore_feed: ITEMS,
    explore_shops: [{ shop_id: 't-sri', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', item_count: 4 }],
    explore_merchants: [],
    shop_rating_summary: [],
    listing_likes_for: [{ product_id: 'p-nasi', likes: 3, liked: false, own: false }],
    explore_item: { product: { id: 'p-nasi', name: 'Nasi Goreng Spesial', price: 25000, compare_at_price: 30000, images: [], description: 'Nasi goreng dengan telur.', likes: 3, listed_at: minutesAgo(5), variants: [] },
      shop: SHOP, viewer: null, visible: true, more: [], selling: { collection: { enabled: true, area: 'Kebayoran Baru' }, delivery: { enabled: true, fee_mode: 'extra', fee: 10000, free_above: 100000 }, preorder: { enabled: true, min_days: 2 } } },
    explore_suggest: { suggestion: 'nasi goreng', popular: ['Es Teh Manis', 'Kue Lapis'] },
    chat_list: CHATS.filter((c) => args.p_box === c.box && !args.p_archived),
    chat_unread: { buying: 1, selling: 0, by_tenant: {}, archived: { buying: { chats: 0, unread: 0 }, selling: { chats: 0, unread: 0 }, by_tenant: {} } },
    chat_thread: { conversation: globalThis.threadHead, messages: globalThis.threadMessages || [], has_more: false },
    my_purchases: args.p_order_id ? [ORDER] : [ORDER],
    my_purchase_summary: { ongoing: 1, total: 1 },
    claim_my_orders: 0,
    my_order_ratings_v2: [],
    shop_rating_overview: { rating: 4.6, rating_count: 12, last_7_days: 3, shown: true, stars_5: 8, stars_4: 3, stars_3: 1, stars_2: 0, stars_1: 0 },
    get_shop_ratings_v2: [{ id: 'r-1', stars: 5, note: 'Enak sekali', note_public: true, note_state: 'visible', rater_name: 'Budi S.', order_number: 'ORD-000121', created_at: minutesAgo(60) }],
    shop_rating_comments: [{ id: 'r-1', stars: 5, note: 'Enak sekali', rater_name: 'Budi S.', posted_at: '2026-11-01T00:00:00Z', edited: true, mine: false }],
    get_storefront_tenant: { id: 't-sri', name: 'Warung Bu Sri', currency: 'IDR', logo_url: null, is_available: true },
  }[name];
  const result = Promise.resolve({ data: rows ?? null, error: null });
  return Object.assign(result, { maybeSingle: () => result });
}
const session = { user: { id: 'user-1', email: 'budi@example.com' } };
globalThis.signedIn = false;
globalThis.supabaseFixture = {
  rpc,
  from: () => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q, maybeSingle: () => q, then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return q; },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: {
    getSession: async () => ({ data: { session: globalThis.signedIn ? session : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({}),
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), upload: async () => ({ error: null }) }) },
};
globalThis.appUserState = { appUser: null, clearAppUser() {} };
globalThis.tenantFixture = { tenant: null, tenantId: null, user: null, hasPermission: () => true, isOwner: false, noStore: false, subscription: null };
globalThis.toasts = [];

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-app-text-explore-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * as appText from '@/lib/appText';",
  "export { default as exploreCatalog } from '@/locales/id/explore.json';",
  "export { default as shopCatalog } from '@/locales/id/shop.json';",
  "export { default as signupCatalog } from '@/locales/id/signup.json';",
  "export { ID_GROUPS } from '@/locales/id/index.js';",
  "export { default as Explore } from '@/pages/Explore';",
  "export { default as ListingPage } from '@/components/explore/ListingPage';",
  "export { default as ExploreCart } from '@/components/explore/ExploreCart';",
  "export { default as ExploreLikes } from '@/components/explore/ExploreLikes';",
  "export { default as ExplorePurchases, PurchaseDetail } from '@/components/explore/ExplorePurchases';",
  "export { default as ExploreMe } from '@/components/explore/ExploreMe';",
  "export { default as ExploreNoResults } from '@/components/explore/ExploreNoResults';",
  "export { default as ItemOptionsSheet } from '@/components/explore/ItemOptionsSheet';",
  "export { default as ShareSheet } from '@/components/explore/ShareSheet';",
  "export { default as ChatInbox } from '@/components/chat/ChatInbox';",
  "export { default as ChatThread } from '@/components/chat/ChatThread';",
  "export { default as ShopRatings } from '@/components/ratings/ShopRatingsPage';",
  "export { RatingPill, RatingSheet, RateOrderSheet, OrderRateRow } from '@/components/ratings/RatingParts';",
  "export { default as LoadingShapes } from '@/components/ui-custom/LoadingShapes';",
  "export { DidYouMean } from '@/components/ui-custom/NoMatches';",
  "export { likeErrorMessage, likesText } from '@/lib/likes';",
  "export { chatErrorMessage, lastSeenText } from '@/lib/chat';",
  "export { PurchaseError } from '@/lib/purchases';",
  "export { RatingError } from '@/lib/ratings';",
  "export { explainError } from '@/lib/plainError';",
  "export { addToShopCart } from '@/lib/shopCart';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), message: note("message"), dismiss() {} });',
    'export const Toaster = () => null;',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://x.invalid";',
  back: [
    "import { useState } from 'react';",
    'export const useBackToClose = () => {}; export const handOverBackStep = () => false; export const removeBackStep = () => {};',
    'export const stepToFirstEntry = () => {}; export const handleAndroidBack = () => false; export const STILL_OPEN_CHECK_MS = 500;',
    'export function useOpenWithBack(open, defaultOpen, onOpenChange) { const [own, setOwn] = useState(!!defaultOpen); return [open ?? own, onOpenChange || setOwn]; }',
  ].join("\n"),
  tenant: "import { createContext } from 'react'; export const useTenant = () => globalThis.tenantFixture; export default createContext(null);",
  user: 'export const useAppUser = () => globalThis.appUserState; export const cookieUtils = { clear() {}, get() { return null; }, set() {} };',
  db: 'export default { entities: {} };',
};
const mock = { name: 'app-text-explore-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/useBackToClose$/, 'back');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/lib\/AppUserContext$/, 'user');
  route(/^@\/lib\/db$/, 'db');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', resolveDir: process.cwd(), contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.app-text-explore.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));
const { appText, exploreCatalog, shopCatalog, signupCatalog } = app;
const { appT } = appText;

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (ms = 60) => act(async () => { await sleep(ms); });
const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const freshQueries = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
async function mount(element, { at = '/explore', path: routePath = null } = {}) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const routed = routePath ? h(Routes, null, h(Route, { path: routePath, element })) : element;
  await act(async () => {
    root.render(h(QueryClientProvider, { client: freshQueries() }, h(MemoryRouter, { initialEntries: [at] }, routed)));
  });
  await settle(120);
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
// What a screen shows, its open dialogs (drawn on the page's body) included.
const visible = (host) => {
  const copy = document.createElement('div');
  copy.appendChild(host.cloneNode(true));
  document.body.querySelectorAll('[role="dialog"]').forEach((d) => { if (!host.contains(d)) copy.appendChild(d.cloneNode(true)); });
  copy.querySelectorAll('style, script').forEach((el) => el.remove());
  return text(copy);
};
const labels = (host) => [host, ...[...document.body.querySelectorAll('[role="dialog"]')].filter((d) => !host.contains(d))]
  .flatMap((root) => [root, ...root.querySelectorAll('[aria-label], [placeholder], [title]')])
  .flatMap((el) => ['aria-label', 'placeholder', 'title'].map((a) => el.getAttribute?.(a)).filter(Boolean));

// English left on a screen: any 3-word stretch of a catalog phrase, and words only English uses.
const englishParts = [];
for (const phrase of Object.keys(exploreCatalog)) {
  for (const part of phrase.split(/\{[a-zA-Z0-9_]+\}/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3 && part.trim().length >= 12) englishParts.push(part.trim());
  }
}
const ENGLISH_WORDS = /\b(the|your|you|and|with|for|of|is|are|this|that|to|or|in|on|at|by|from|will|can|please|sign|our|listing|listings|likes|seller|buyer|cart|order|orders)\b/gi;
const checkScreen = (host, what, mustShow = []) => {
  const shown = visible(host);
  const said = [shown, ...labels(host)].join(' | ').replaceAll('sellio.sg/listing/p-nasi', ''); // addresses are data
  assert.ok(shown.length > 0, `${what}: something on screen`);
  assert.ok(!/\[object Object\]|undefined|NaN/.test(said), `${what}: no "[object Object]", "undefined" or "NaN": ${said}`);
  assert.deepEqual(englishParts.filter((part) => said.includes(part)), [], `${what}: English left on the Indonesian screen`);
  assert.deepEqual(said.match(ENGLISH_WORDS) || [], [], `${what}: English words on the Indonesian screen: ${said}`);
  for (const words of mustShow) assert.ok(said.includes(words), `${what} shows "${words}": ${said}`);
  return shown;
};

try {
  // 1. The catalog
  assert.deepEqual(Object.keys(app.ID_GROUPS), ['signup', 'shop', 'explore'], 'Group 3 has its own file');
  assert.ok(!appText.LIVE_GROUPS.includes('explore'), 'Group 3 waits for its sign-off: not live yet');
  const blanks = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
  const notIndonesian = /\b(kamu|kau|sila|percuma|kedai|kata laluan|telefon|bimbit|troli|anda)\b/;
  let shared = 0;
  for (const [english, indonesian] of Object.entries(exploreCatalog)) {
    assert.ok(typeof indonesian === 'string' && indonesian.trim(), `"${english}" has Indonesian`);
    assert.equal(blanks(indonesian), blanks(english), `"${english}" keeps its blanks`);
    assert.ok(!notIndonesian.test(indonesian), `"${indonesian}": Indonesian, formal "Anda" (not Malay, not "kamu")`);
    for (const other of [shopCatalog, signupCatalog]) {
      if (english in other) { shared++; assert.equal(indonesian, other[english], `"${english}": the same words in every group`); }
    }
  }
  assert.ok(shared > 40, 'Phrases group 3 shares with the live groups (Try again, Log in…) have the same words');
  passed(`The explore catalog: ${Object.keys(exploreCatalog).length} phrases, each with its blanks, formal Indonesian, the same words as the live groups (${shared} shared)`);

  // 2. The group switch: an Indonesian phone sees groups 1 and 2 in Indonesian, group 3 in English
  assert.equal(appText.appLanguage(), 'id', 'An Indonesian phone gets Bahasa Indonesia');
  await appText.appTextReady();
  assert.equal(appT('Save'), 'Simpan', 'The live groups’ words are loaded');
  assert.equal(appT('Fresh finds'), 'Fresh finds', 'Group 3’s words aren’t loaded for everyone yet');
  let page = await mount(h(app.ExploreNoResults, { search: 'nasgor', kind: null, onSearch() {}, onShowAll() {} }));
  const hidden = visible(page.host);
  assert.ok(hidden.includes('No results for “nasgor”') && hidden.includes('Did you mean nasi goreng?') && hidden.includes('Show everything'), `English, whole: ${hidden}`);
  assert.ok(!/Tampilkan|Maksud Anda/.test(hidden), 'Not half translated: no live group’s word on a group 3 screen');
  await page.unmount();
  page = await mount(h(app.LoadingShapes, { label: 'x', slowAfterMs: 1 }));
  await settle(40);
  assert.ok(document.body.textContent.includes('This is taking longer than usual.'), 'A shared piece with no t (a store page): English, and no app words loaded for it');
  await page.unmount();
  passed('Until it’s switched on, group 3’s screens are English for everyone (whole, not half translated), while groups 1 and 2 stay Indonesian');

  // A reviewer's preview: every group
  await act(async () => { await appText.resetAppTextForTests({ preview: true, choice: 'id' }); });
  await appText.appTextReady();
  assert.equal(appT('Fresh finds'), 'Temuan terbaru');

  // 3. Explore, signed out
  page = await mount(h(app.Explore));
  await settle(200);
  checkScreen(page.host, 'Explore', ['Toko di Sellio', 'Temuan terbaru', 'Nasi Goreng Spesial', 'Penjual rumahan', '5 menit lalu', '2 hari lalu', 'Masuk', 'Daftar',
    'Cari produk atau toko', 'Semua', 'Makanan & minuman', 'Barang', 'Merchant', 'Didukung oleh', 'Beranda', 'Produk', 'Saya', 'Sukai Nasi Goreng Spesial (3 suka)', 'Rp25.000']);
  await page.unmount();
  passed('Explore: the feed, its chips, cards (time, hearts, prices), the header and tab bar in Indonesian');

  // 4. A listing
  page = await mount(h(app.ListingPage), { at: '/listing/p-nasi', path: '/listing/:productId' });
  await settle(200);
  checkScreen(page.host, 'A listing', ['Rp25.000', '3 suka', 'Diunggah 5 menit lalu', 'Penjual rumahan · 4 item', 'Di Sellio sejak', 'Lihat toko', 'Opsi transaksi',
    'Ambil sendiri', 'Kebayoran Baru', 'Ongkir Rp10.000 · gratis di atas Rp100.000', 'Pesan minimal 2 hari sebelumnya', 'Deskripsi', 'Suka', 'Chat', 'Beli sekarang', 'Tambah ke keranjang']);
  await page.unmount();
  passed('A listing: likes, when it was listed, the shop, delivery and pre-order terms, the buyer’s bar in Indonesian');

  // 5. The cart
  app.addToShopCart('warung-bu-sri', { id: 'p-nasi', name: 'Nasi Goreng Spesial', price: 25000, image_url: null }, null, 'Tanpa bawang', 2, { name: 'Warung Bu Sri', currency: 'IDR' });
  page = await mount(h(app.ExploreCart));
  await settle(150);
  checkScreen(page.host, 'The cart', ['Keranjang', '2 item', 'Catatan: Tanpa bawang', 'Rp25.000 per item', 'Subtotal', 'Rp50.000', 'Checkout', 'Kurangi satu Nasi Goreng Spesial',
    'Tambah satu Nasi Goreng Spesial', 'Lanjut belanja']);
  await page.unmount();
  passed('The cart: its counts, prices, note, steppers and checkout in Indonesian');

  // 6. Signed out: My likes, My purchases, Me
  page = await mount(h(app.ExploreLikes));
  checkScreen(page.host, 'My likes, signed out', ['Produk yang Anda sukai', 'Masuk untuk menyimpan produk yang Anda sukai di satu tempat.']);
  await page.unmount();
  page = await mount(h(app.ExplorePurchases));
  checkScreen(page.host, 'My purchases, signed out', ['Pembelian Saya', 'Masuk untuk melihat pesanan yang Anda buat dan statusnya.']);
  await page.unmount();
  page = await mount(h(app.ExploreMe));
  checkScreen(page.host, 'Me, signed out', ['Saya', 'Beli dan jual di Sellio', 'Masuk untuk chat dengan penjual dan memantau produk Anda.', 'Privasi', 'Ketentuan']);
  await page.unmount();
  passed('Signed out: My likes, My purchases and Me ask to log in, in Indonesian');

  // 7. Signed in: an order, chats, a chat
  globalThis.signedIn = true;
  globalThis.appUserState = { appUser: { id: 'user-1', full_name: 'Budi Santoso', email: 'budi@example.com' }, clearAppUser() {} };
  page = await mount(h(app.PurchaseDetail), { at: '/explore/purchases/o-1', path: '/explore/purchases/:orderId' });
  await settle(200);
  checkScreen(page.host, 'An order', ['Pesanan #ORD-000121', 'Dibuat 14 Nov, 06.30', 'Diterima', 'Pesanan dibuat', 'Disiapkan', 'Siap diambil', 'Sudah diambil', 'Ambil sendiri',
    'Untuk Min, 15 Nov', 'Kebayoran Baru.', 'Penjual akan memberikan alamat lengkap setelah menerima pesanan Anda.', 'Pedas', 'Tanpa bawang', 'Total', 'Belum dibayar',
    'Chat dengan penjual', 'Kunjungi Warung Bu Sri']);
  await page.unmount();
  passed('An order: its status and steps, collection details, items, total and actions in Indonesian, dates day first');

  page = await mount(h(app.ChatInbox, { box: 'all', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: appT('Chats you start about listings show up here.') }));
  await settle(200);
  checkScreen(page.host, 'Chats', ['Warung Bu Sri', 'Bisa diambil jam 3', 'Sri Wahyuni', 'Anda:', 'Foto']);
  await page.unmount();
  globalThis.threadHead = { id: 'c-1', my_role: 'buyer', tenant_id: 't-sri', shop_name: 'Warung Bu Sri', shop_slug: 'warung-bu-sri', product_id: 'p-nasi', product_name: 'Nasi Goreng Spesial',
    price: 25000, currency: 'IDR', listing_available: true, sold_out: false, online: false, last_seen_at: minutesAgo(12), other_read_at: null };
  page = await mount(h(app.ChatThread, { conversationId: 'c-1', variant: 'page', onBack() {} }));
  await settle(200);
  checkScreen(page.host, 'A new chat', ['Terakhir dilihat 12 menit lalu', 'Penjual', 'Tanyakan produk ini ke Warung Bu Sri.', 'Apakah ini masih tersedia?', 'Bisa saya ambil hari ini?',
    'Bisa dikirim?', 'Tulis pesan']);
  await page.unmount();
  passed('Chats and a chat: who, when they were last on Sellio, the listing and the quick questions in Indonesian');

  // 8. Ratings: the shop's page, the sheets
  globalThis.tenantFixture = { tenant: { id: 't-sri', name: 'Warung Bu Sri', seller_type: 'individual' }, tenantId: 't-sri', user: null, hasPermission: () => true, isOwner: true, noStore: false, subscription: null };
  page = await mount(h(app.ShopRatings));
  await settle(200);
  checkScreen(page.host, 'The shop’s ratings', ['Penilaian', 'Pendapat pembeli tentang Warung Bu Sri', '12 pembeli sudah menilai Anda (3 baru minggu ini).', 'Ditampilkan di Jelajahi, produk Anda, dan halaman toko Anda.',
    'Terbaru', 'Budi S.', 'Enak sekali', 'Ditampilkan di halaman toko Anda', 'Laporkan']);
  await page.unmount();
  const summary = { rating: 4.6, rating_count: 12, stars_5: 8, stars_4: 3, stars_3: 1, stars_2: 0, stars_1: 0 };
  page = await mount(h(app.RatingSheet, { open: true, onClose() {}, shopName: 'Warung Bu Sri', summary, shopId: 't-sri', t: appT }));
  await settle(150);
  checkScreen(page.host, 'A shop’s rating window', ['12 penilaian', 'Kata pembeli', 'Enak sekali', 'diubah', 'Laporkan', 'Setiap pembeli dihitung sekali']);
  await page.unmount();
  page = await mount(h(app.RateOrderSheet, { open: true, onClose() {}, order: ORDER, shopName: 'Warung Bu Sri', initialStars: 4, signedIn: true, returnPath: '/explore', t: appT }));
  await settle(80);
  checkScreen(page.host, 'Rating an order', ['Beri nilai Warung Bu Sri', 'Pesanan #ORD-000121 · Nasi Goreng Spesial', 'Baik', 'Komentar Anda', 'Tampilkan komentar saya di halaman Warung Bu Sri sebagai',
    'Kirim penilaian', 'Anda bisa mengubahnya selama 30 hari.', '4 bintang: Baik']);
  await page.unmount();
  page = await mount(h('div', null, h(app.RatingPill, { summary, variant: 'long' }), h(app.OrderRateRow, { order: { ...ORDER, status: 'completed' }, rating: null, onPick() {} })));
  const store = [visible(page.host), ...labels(page.host)].join(' | ');
  assert.ok(store.includes('12 ratings') && store.includes('Rated 4.6 out of 5 by 12 buyers') && store.includes('How was your order?'), `On a store page (no t): English: ${store}`);
  await page.unmount();
  passed('Ratings: the shop’s page, the rating window and rating an order in Indonesian; on a store page (no t) the same parts stay English');

  // 9. Sheets
  page = await mount(h(app.ShareSheet, { open: true, onClose() {}, url: 'https://sellio.sg/listing/p-nasi', title: 'Nasi Goreng Spesial', priceText: 'Rp25.000', shopName: 'Warung Bu Sri', t: appT }));
  checkScreen(page.host, 'Share to', ['Bagikan ke', 'Salin tautan', 'WhatsApp', 'Telegram', 'Facebook']);
  const wa = page.host.ownerDocument.querySelector('a[href^="https://wa.me/"]')?.getAttribute('href') || '';
  assert.ok(decodeURIComponent(wa).includes('Nasi Goreng Spesial · Rp25.000 di Sellio'), `The shared message in the sharer’s words: ${decodeURIComponent(wa)}`);
  await page.unmount();
  const item = { name: 'Nasi Goreng Spesial', price: 25000, variants: [{ name: 'Level', type: 'single', options: [{ label: 'Pedas', price_modifier: 0 }, { label: 'Sedang', price_modifier: 0 }] }, { name: '', type: 'addon', options: [{ label: 'Telur', price_modifier: 5000 }] }] };
  page = await mount(h(app.ItemOptionsSheet, { open: true, mode: 'buy', item, currency: 'IDR', onClose() {}, onConfirm() {} }));
  checkScreen(page.host, 'Choosing options', ['Level', 'Pilih 1 · Wajib', 'Tambahan', 'Boleh lebih dari satu', 'Telur +Rp5.000', 'Permintaan khusus', 'opsional', 'Jumlah', 'Pilih Level']);
  await page.unmount();
  passed('The share sheet and the options sheet in Indonesian (the shared message too)');

  // 10. The database's own words, through the screen's t
  assert.equal(app.likeErrorMessage({ hint: 'own_listing', message: "You can't like your own listing." }, { t: appT }), 'Anda tidak bisa menyukai produk sendiri.');
  assert.equal(app.likeErrorMessage({ message: 'TypeError: Failed to fetch' }, { t: appT }), 'Suka Anda tidak bisa diperbarui. Periksa koneksi Anda, lalu coba lagi.');
  assert.equal(app.chatErrorMessage({ hint: 'rate_limited', message: "You're sending messages very quickly. Wait a moment and try again." }, { t: appT }),
    'Anda mengirim pesan terlalu cepat. Tunggu sebentar, lalu coba lagi.');
  assert.equal(app.explainError(new app.PurchaseError("This order isn't available.", 'not_found'), { t: appT }).description, 'Pesanan ini tidak tersedia.');
  assert.equal(appT(new app.RatingError("You can't rate your own shop.", 'own_shop').message), 'Anda tidak bisa menilai toko sendiri.');
  assert.equal(app.likeErrorMessage({ hint: 'own_listing', message: "You can't like your own listing." }), "You can't like your own listing.", 'No t: English as before');
  assert.equal(app.lastSeenText({ online: true }, new Date(), appT), 'Online');
  assert.equal(app.lastSeenText({ last_seen_at: '2026-11-14T06:30:00Z' }, new Date('2026-11-15T09:00:00Z'), appT, 'id-ID'), 'Terakhir dilihat kemarin pukul 06.30');
  assert.equal(app.lastSeenText({ last_seen_at: '2026-11-14T06:30:00Z' }, new Date('2026-11-15T09:00:00Z')), 'Last seen yesterday at 6:30 am');
  assert.equal(app.likesText(1, appT), '1 suka');
  assert.equal(app.likesText(5), '5 likes');
  passed('What the database says (likes, chats, orders, ratings) shows in Indonesian through the screen’s t, English without it');

  // 11. English stays as it was
  await act(async () => { appText.setAppLanguage('en'); });
  page = await mount(h(app.ExploreCart));
  await settle(150);
  const english = visible(page.host);
  for (const words of ['Cart', '2 items', 'Note: Tanpa bawang', 'Rp25.000 each', 'Subtotal', 'Checkout', 'Continue shopping']) assert.ok(english.includes(words), `English cart shows "${words}": ${english}`);
  await page.unmount();
  passed('In English, group 3 reads as before');

  assert.ok(!reactWarnings.some((line) => /unique "key"/.test(line)), 'Bold names and links in a sentence have keys: ' + reactWarnings.join('\n'));
  console.log(`\n${passes} checks passed`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
process.exit(0);
