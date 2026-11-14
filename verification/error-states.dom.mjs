// Errors in plain words that stay on screen (UX states, 3; Alvin, 9 Nov 2026).
// Say what went wrong, whose side it's on and what to do; database and network wording never
// reaches the screen (lib/plainError.js). A save's error stays in its form (ErrorNote); a
// customer's order that didn't go through stays on the checkout and says whether it reached
// the shop and that nothing was paid, with Try again and "Show my order to staff"
// (components/storefront/CheckoutProblem.jsx, pages/Storefront.jsx); the Counter keeps its
// reason on the ticket.
// Run: node verification/error-states.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/store/kopi-corner', pretendToBeVisual: true });
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
win.scrollTo = () => {};
win.innerWidth = 390; // a phone
// The connection, switched by the tests (navigator.onLine and the online/offline events).
let online = true;
Object.defineProperty(win.navigator, 'onLine', { get: () => online, configurable: true });
const setOnline = (value) => { online = value; win.dispatchEvent(new win.Event(value ? 'online' : 'offline')); };
if (!globalThis.crypto?.randomUUID) globalThis.crypto = require('node:crypto').webcrypto;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
const quiet = console.warn; // explainError logs each error for us; keep the test output readable
console.warn = () => {};

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
globalThis.toasts = [];
globalThis.rpcCalls = [];
globalThis.placeOrder = null; // (args) => ({ data, error })
const TENANT = { id: 'tenant-1', name: 'Kopi Corner', slug: 'kopi-corner', currency: 'SGD', industry: 'fnb', is_available: true };
const chain = (answer) => {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
    maybeSingle() { return Promise.resolve(answer); }, single() { return Promise.resolve(answer); },
    then(resolve, reject) { return Promise.resolve(answer).then(resolve, reject); },
  };
  return q;
};
globalThis.supabaseFixture = {
  rpc(name, args) {
    globalThis.rpcCalls.push({ name, args });
    if (name === 'get_storefront_tenant') return chain({ data: TENANT, error: null });
    if (name === 'get_shop_selling') return chain({ data: null, error: null });
    if (name === 'place_order_once') return chain(globalThis.placeOrder(args));
    return chain({ data: null, error: null });
  },
  from() { return chain({ data: null, error: null }); },
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
};
const placed = () => globalThis.rpcCalls.filter((c) => c.name === 'place_order_once');

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-error-states-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * from '@/lib/plainError';",
  "export { isNetworkError, isOffline, useOnline } from '@/lib/network';",
  "export { counterSendNote } from '@/lib/counterSendNote';",
  "export { CheckoutProblem, CheckoutProblemActions, OrderForStaff, checkoutProblemFor, problemWords } from '@/components/storefront/CheckoutProblem';",
  "export { default as ErrorNote } from '@/components/ui-custom/ErrorNote';",
  "export { submitCheckout, forgetCheckout, getPendingCheckouts } from '@/lib/mobileCheckout';",
  "export { LanguageProvider, useLanguage } from '@/lib/LanguageContext';",
  "export { default as Storefront } from '@/pages/Storefront';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), custom: note("custom"), dismiss() {} });',
    'export const Toaster = () => null;',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://project.example.invalid";',
  catalog: 'export const fetchStorefrontCatalog = async () => ({ products: [], categories: [] });',
  view: 'export default function StorefrontView() { return null; }',
  assistant: 'export default function MenuAssistantWidget() { return null; }',
  ratings: 'export const fetchRatingSummaries = async () => ({}); export const forgetRatingSummary = () => {}; export const isSignedIn = async () => false; export const myOrderRatings = async () => ({});',
  chat: 'export const useChatUser = () => ({ user: null });',
  likes: 'export const likeErrorMessage = () => ""; export const needsSignIn = () => false; export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useLikesFor = () => {};',
  push: 'export const offerPushAlerts = () => {};',
  device: 'export const rememberThisPhone = () => {};',
  ratingParts: 'export const OrderRateRow = () => null; export const RateOrderSheet = () => null; export const RatePrompt = () => null; export const RatingSheet = () => null;',
  shopStore: 'export const ShopCheckout = () => null; export const ShopOrderDetails = () => null; export const ShopOrderHistory = () => null;',
  native: 'export const isNativeApp = () => false; export const isCapacitorApp = () => false; export const appPlatform = () => "web";',
  authNav: 'export const rememberReturnPath = () => {};',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
  loading: 'export default function LoadingShapes() { return null; } export const StoreShapes = () => null;',
};
const mock = { name: 'error-states-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/storefrontCatalog$/, 'catalog');
  route(/storefront\/StorefrontView$/, 'view');
  route(/storefront\/MenuAssistantWidget$/, 'assistant');
  route(/lib\/ratings$/, 'ratings');
  route(/lib\/chat$/, 'chat');
  route(/lib\/likes$/, 'likes');
  route(/lib\/pushOffer$/, 'push');
  route(/lib\/deviceKey$/, 'device');
  route(/ratings\/RatingParts$/, 'ratingParts');
  route(/shop\/ShopStorefront$/, 'shopStore');
  route(/lib\/nativeApp$/, 'native');
  route(/lib\/authNavigation$/, 'authNav');
  route(/lib\/useBackToClose$/, 'back');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.error-states.mjs');
await copyFile(outfile, local);
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
const buttons = (root) => [...root.querySelectorAll('button')].map((b) => text(b));
const button = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
// Words only a program would write: none may reach the screen.
const TECHNICAL = /violat|constraint|duplicate key|row-level|jwt|pgrst|typeerror|failed to fetch|null value|relation "|column "|status code|\b[a-z]+_[a-z_]+\b/i;

try {
  // ── 1. Plain words for each kind of error ───────────────────────────────────────────
  {
    const say = (error, title = 'Couldn’t save the product') => app.explainError(error, { title });
    const cases = [
      [{ message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch', hint: '', code: '' }, 'network', /couldn’t reach Sellio\. Check your internet connection, then try again\./],
      [Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }), 'network', /couldn’t reach Sellio/],
      [{ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }, 'network', /couldn’t reach Sellio/],
      [{ name: 'StorageUnknownError', message: 'Unknown error', originalError: new TypeError('Load failed') }, 'network', /couldn’t reach Sellio/],
      [{ code: 'P0002', message: 'An item in your cart is no longer available' }, 'own', /^An item in your cart is no longer available\.$/],
      [{ code: '22023', hint: 'own_shop', message: 'You can’t order from your own shop.' }, 'own', /^You can’t order from your own shop\.$/],
      [{ code: '40001', message: 'Stock changed on another device. Refresh and review the new quantity before saving.' }, 'own', /^Stock changed on another device/],
      [{ code: '40001', message: 'could not serialize access due to concurrent update' }, 'clash', /Someone else changed this at the same moment/],
      [{ code: '23505', message: 'duplicate key value violates unique constraint "products_tenant_id_sku_key"', details: 'Key (tenant_id, sku)=(t1, KC-01) already exists.' }, 'duplicate', /^That SKU is already in use\. Change it, then try again\.$/],
      [new Error('duplicate key value violates unique constraint "categories_tenant_id_name_key"'), 'duplicate', /^That name is already in use/],
      [{ code: '23505', message: 'duplicate key value violates unique constraint "x_pkey"', details: '' }, 'duplicate', /^Something with the same details is already in use/],
      [{ code: '23503', message: 'update or delete on table "categories" violates foreign key constraint "products_category_id_fkey" on table "products"', details: 'Key (id)=(c1) is still referenced from table "products".' }, 'in-use', /still used elsewhere in your shop/],
      [{ code: '23503', message: 'insert or update on table "products" violates foreign key constraint "products_category_id_fkey"', details: 'Key (category_id)=(c9) is not present in table "categories".' }, 'stale', /changed or removed somewhere else\. Refresh the page/],
      [{ code: '42501', message: 'new row violates row-level security policy for table "products"' }, 'no-access', /isn’t allowed to do this\. Ask the shop’s owner for access\./],
      [{ code: '42501', message: 'You do not have access to adjust inventory' }, 'own', /^You do not have access to adjust inventory\.$/],
      [{ code: 'PGRST301', message: 'JWT expired' }, 'signed-out', /signed out\. Sign in again/],
      [{ code: '23502', message: 'null value in column "name" of relation "products" violates not-null constraint' }, 'missing', /required detail is missing/],
      [{ code: '22001', message: 'value too long for type character varying(60)' }, 'too-long', /too long\. Shorten it/],
      [{ code: '22003', message: 'numeric field overflow' }, 'too-big', /number is too large/],
      [{ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' }, 'invalid', /weren’t accepted\. Check what you entered/],
      [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'stale', /Refresh the page/],
      [Object.assign(new Error('Payload too large'), { name: 'StorageApiError', status: 413 }), 'file-too-big', /That file is too big/],
      [{ message: 'Too many requests', status: 429 }, 'rate-limit', /Wait a minute/],
      [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'timeout', /took too long to answer\. That’s on our side/],
      [Object.assign(new Error('New password should be different from the old password.'), { name: 'AuthApiError', status: 422, code: 'same_password' }), 'own', /^New password should be different/],
      [Object.assign(new Error('Please use a photo under 5 MB'), { friendly: true }), 'own', /^Please use a photo under 5 MB\.$/],
      [new Error('Reassign 2 staff accounts before deleting this role.'), 'own', /^Reassign 2 staff accounts/],
      [new TypeError('Cannot read properties of undefined (reading \'id\')'), 'server', /Sellio’s side, not yours\. Try again in a moment\. If it keeps happening, email sellio@apptelier\.sg\./],
      [{ code: 'PGRST202', message: 'Could not find the function public.save_thing(p_x) in the schema cache' }, 'server', /Sellio’s side, not yours/],
      [new Error('Failed to save'), 'server', /Sellio’s side/],
      [Object.assign(new Error('The resource already exists'), { name: 'StorageApiError', statusCode: '409' }), 'duplicate', /^Something with the same details is already in use/],
      [Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError' }), 'server', /Sellio’s side/],
    ];
    for (const [error, kind, words] of cases) {
      const note = say(error);
      assert.equal(note.kind, kind, `${JSON.stringify(error.message)} is ${kind}`);
      assert.equal(note.title, 'Couldn’t save the product', 'the title is what went wrong, in the words of what was being done');
      assert.match(note.description, words, `${error.message} → ${note.description}`);
      if (kind !== 'own') assert.equal(TECHNICAL.test(note.description), false, `no technical words reach the screen: ${note.description}`);
    }
    assert.equal(app.explainError({ code: 'XX000', message: 'boom' }, { title: 'Couldn’t print', fallback: 'Check the printer is on.' }).description, 'Check the printer is on.', 'a fallback for what nothing else explains');
    assert.equal(app.explainError({ code: 'P0002', message: 'Order not found' }, { title: 'x', fallback: 'unused' }).description, 'Order not found.', 'the fallback never hides a known reason');
    passed('Each kind of error in plain words: what went wrong, whose side it is on, what to do; nothing technical shown');

    // Offline: whatever the error, it says so (no request needed to know).
    setOnline(false);
    assert.equal(app.isOffline(), true);
    for (const error of [undefined, { code: '23505', message: 'duplicate key' }, new Error('Anything')]) {
      const note = say(error);
      assert.equal(note.kind, 'offline');
      assert.equal(note.description, 'You’re offline. Connect to the internet, then try again.');
    }
    assert.deepEqual(app.offlineNote('Couldn’t update the order', 'Updating an order needs the internet.'), {
      kind: 'offline', title: 'Couldn’t update the order',
      description: 'You’re offline. Updating an order needs the internet. Connect to the internet, then try again.',
    });
    globalThis.toasts = [];
    assert.equal(app.blockedOffline('Couldn’t update the order', 'Updating an order needs the internet.'), true, 'offline: the change stops');
    assert.equal(globalThis.toasts.length, 1);
    assert.equal(globalThis.toasts[0].message, 'Couldn’t update the order');
    assert.equal(globalThis.toasts[0].options.description, 'You’re offline. Updating an order needs the internet. Connect to the internet, then try again.');
    setOnline(true);
    globalThis.toasts = [];
    assert.equal(app.blockedOffline('Couldn’t update the order', 'x'), false, 'online: the change goes ahead');
    assert.equal(globalThis.toasts.length, 0);
    passed('Offline: any change says "You’re offline", and what needs the internet, without trying');

    globalThis.toasts = [];
    const shown = app.showError({ code: '23505', message: 'duplicate key value violates unique constraint "tables_tenant_id_name_key"' }, 'Couldn’t create the table');
    assert.equal(globalThis.toasts.length, 1);
    const toast = globalThis.toasts[0];
    assert.deepEqual([toast.kind, toast.message, toast.options.description, toast.options.duration, toast.options.closeButton],
      ['error', 'Couldn’t create the table', 'That name is already in use. Change it, then try again.', 10000, true],
      'an error toast: title, plain reason, 10 seconds and a close button (not 4 seconds and gone)');
    assert.equal(shown.description, toast.options.description);
    passed('An error toast stays 10 seconds with a close button, with the plain reason under the title');

    for (const plain of ['An item in your cart is no longer available', 'Please choose a date from 9 Nov to 8 Jan.', 'You can’t order from your own shop.', 'Option "Large" is no longer available for Kopi']) {
      assert.equal(app.looksPlain(plain), true, plain);
    }
    for (const technical of ['duplicate key value violates unique constraint "x"', 'JWT expired', 'TypeError: Failed to fetch', 'permission denied for table orders',
      'column "foo" does not exist', 'Internal Server Error', 'Bad Request', 'Failed to save', 'query returned no rows', 'Bucket not found',
      'invalid input syntax for type uuid', 'checkout_actor_changed', 'cart is empty', '{"error":"x"}']) {
      assert.equal(app.looksPlain(technical), false, technical);
    }
    passed('Only messages written for people are shown as they are');
  }

  // ── 2. The Counter: why a send didn't go through, kept on the ticket ──────────────────
  {
    const unconfirmed = Object.assign(new Error('Order submission is unconfirmed. Retry this same cart to recover the result. Your cart has been kept.'), { checkoutUnconfirmed: true, cause: { message: 'TypeError: Failed to fetch' } });
    const earlier = Object.assign(new Error('An earlier submission is unconfirmed.'), { checkoutUnconfirmed: true, checkoutEarlier: true });
    const cases = [
      [unconfirmed, 'unconfirmed', 'Couldn’t confirm the order', /may or may not have reached the kitchen\. Tap Send to kitchen again: if it got there, it isn’t sent twice\./],
      [earlier, 'earlier', 'The last send wasn’t confirmed', /may already be in Orders\. Check Orders first\. If it isn’t there, send this ticket anyway\./],
      [Object.assign(new Error('x'), { checkoutStorage: true }), 'storage', 'Couldn’t send the order', /nothing was sent\. Reload the page/],
      [{ code: 'P0002', message: 'An item in your cart is no longer available' }, 'own', 'Couldn’t send the order', /^An item in your cart is no longer available\.$/],
      [{ code: 'P0001', message: 'Order limit reached for this month' }, 'own', 'Couldn’t send the order', /monthly order limit\. Ask the owner to upgrade the plan\./],
      [{ code: 'XX000', message: 'internal error' }, 'server', 'Couldn’t send the order', /Sellio’s side, not yours/],
    ];
    for (const [error, kind, title, words] of cases) {
      const note = app.counterSendNote(error);
      assert.deepEqual([note.kind, note.title], [kind, title]);
      assert.match(note.description, words);
    }
    const counter = await readFile('src/pages/Counter.jsx', 'utf8');
    assert.match(counter, /if \(isOffline\(\)\) \{\s*setSendNote\(\{ key: ticketKey, note: offlineNote\(appT\('Couldn’t send the order'\), appT\('Sending to the kitchen needs the internet\. The ticket is kept here\.'\), appT\) \}\);\s*return;\s*\}\s*if \(anyway === true\) forgetCheckout/, 'offline: nothing is sent, and the ticket says why');
    assert.match(counter, /setSendNote\(\{ key: ticketKey, note: counterSendNote\(e, appT\), earlier: !!e\?\.checkoutEarlier \}\)/);
    assert.match(counter, /sendNote && sendNote\.key === target\?\.key && \(\s*<ErrorNote note=\{sendNote\.note\}/, 'shown on the ticket it belongs to');
    assert.match(counter, /onClick=\{\(\) => send\(true\)\}[^>]*>\{appT\('Send anyway'\)\}<\/button>/, 'a different ticket after an unconfirmed send: Send anyway');
    assert.doesNotMatch(counter, /Could not send the order\. Check your connection and try again\./, 'the old vanishing message is gone');
    passed('Counter: the reason stays on the ticket in plain words; offline sends nothing; Send anyway after an unconfirmed send');
  }

  // ── 3. ErrorNote: stays where the person is working, until the next try or closed ─────
  {
    let closed = 0;
    const note = app.explainError({ code: '23505', message: 'duplicate key', details: 'Key (tenant_id, sku)=(t, X) already exists.' }, { title: 'Couldn’t save your changes' });
    const view = await mount(h(app.ErrorNote, { note, onDismiss: () => { closed += 1; } }));
    const box = view.container.querySelector('[data-testid="error-note"]');
    assert.equal(box.getAttribute('role'), 'alert', 'read out when it appears');
    assert.equal(text(box), 'Couldn’t save your changes That SKU is already in use. Change it, then try again.');
    await click(view.container.querySelector('button[aria-label="Close this message"]'));
    assert.equal(closed, 1);
    await view.render(h(app.ErrorNote, { note: null }));
    assert.equal(view.container.innerHTML, '', 'nothing when there is no error');
    await view.close();

    // Each save keeps its reason in its form, from explainError, instead of a vanishing toast.
    const forms = {
      'src/components/products/ProductFormDialog.jsx': [/setSaveNote\(explainError\(err, \{\s*title: product\?\.id \? t\('Couldn’t save your changes'\)[^\n]*\n\s*t,\n\s*\}\)\)/, /setSaveNote\(explainError\(err, \{ title: tenant\?\.seller_type === 'individual' \? t\('Couldn’t delete the listing'\) : t\('Couldn’t delete the product'\), t \}\)\)/, /<ErrorNote note=\{saveNote\}/, /useEffect\(\(\) => \{ if \(!open\) setSaveNote\(null\); \}, \[open\]\)/],
      'src/components/orders/EditOrderModal.jsx': [/setSaveNote\(explainError\(err, \{ title: t\('Couldn’t save the order'\), t \}\)\)/, /<ErrorNote note=\{saveNote\}/, /if \(isOffline\(\)\) \{ setSaveNote\(offlineNote\(t\('Couldn’t save the order'\), t\('Changing an order needs the internet\.'\), t\)\); return; \}/],
      'src/components/tables/TableFormDialog.jsx': [/setSaveNote\(explainError\(error, \{ title: table \? appT\('Couldn’t save the table'\) : appT\('Couldn’t create the table'\), t: appT \}\)\)/, /<ErrorNote note=\{saveNote\}/],
      'src/components/staff/EditStaffDialog.jsx': [/setStaffNote\(explainError\(error, \{ title: 'Couldn’t save the changes' \}\)\)/, /setStaffNote\(explainError\(error, \{ title: 'Couldn’t remove this person' \}\)\)/, /<ErrorNote note=\{staffNote\}/],
      'src/components/shop/SellingSettingsForm.jsx': [/setSaveNote\(explainError\(err, \{ title: t\('Couldn’t save your selling settings'\), t \}\)\)/, /<ErrorNote note=\{saveNote\}/],
      'src/components/inventory/StockAdjustmentPanel.jsx': [/setStockNote\(explainError\(error, \{ title: appT\('Couldn’t save the stock'\), t: appT \}\)\)/, /<ErrorNote note=\{stockNote\}/],
      'src/components/settings/BusinessProfileTab.jsx': [/setSaveNote\(explainError\(err, \{ title: t\('Couldn’t save your business settings'\), t \}\)\)/, /setHoursNote\(explainError\(err, \{ title: t\('Couldn’t save your opening hours'\), t \}\)\)/, /<ErrorNote note=\{saveNote\}/, /<ErrorNote note=\{hoursNote\}/],
      'src/pages/TenantSettings.jsx': [/setSaveNote\(explainError\(err, \{ title: t\('Couldn’t save your payment settings'\), t \}\)\)/, /<ErrorNote note=\{saveNote\}/],
    };
    for (const [file, patterns] of Object.entries(forms)) {
      const source = await readFile(file, 'utf8');
      for (const pattern of patterns) assert.match(source, pattern, `${file}: ${pattern}`);
      assert.doesNotMatch(source, /toast\.error\([^)]*\.message/, `${file}: no raw error text in a toast`);
    }
    passed('ErrorNote: an alert in the form, title and plain reason, closable; each main save keeps its reason in its form');
  }

  // ── 4. No raw database text or "Failed to …" left in error toasts ─────────────────────
  {
    const { execSync } = await import('node:child_process');
    const raw = execSync("grep -rnE \"toast\\.error\\([^;]*\\.message\" src --include=*.jsx --include=*.js || true", { encoding: 'utf8' })
      .split('\n').filter(Boolean)
      // Left as they are: the sign-in page (auth), printing (the printer's own words, about a
      // device on the counter) and a photo's own explanation (UnreadablePhotoError, friendly).
      .filter((line) => !/^src\/pages\/Auth\.jsx|Print failed|Printing failed|Kitchen print|Bluetooth scan|Couldn’t connect to \$?\{deviceName\}|err\?\.friendly|UnreadablePhotoError/.test(line));
    assert.deepEqual(raw, [], 'error toasts show plain words, not the error’s own text');
    const failed = execSync("grep -rnE \"toast\\.error\\(['\\\"\\`]Failed to\" src --include=*.jsx --include=*.js || true", { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.deepEqual(failed, [], 'no "Failed to …"');
    const orders = await readFile('src/pages/Orders.jsx', 'utf8');
    assert.match(orders, /if \(blockedOffline\(t\('Couldn’t update the order'\), t\('Updating an order needs the internet\.'\), t\)\) return;/);
    assert.match(orders, /if \(blockedOffline\(t\('Couldn’t mark it as paid'\), t\('Updating an order needs the internet\.'\), t\)\) return false;/);
    const kds = await readFile('src/pages/KitchenDisplay.jsx', 'utf8');
    assert.match(kds, /if \(blockedOffline\(t\('Couldn’t update the order'\), t\('Updating an order needs the internet\.'\), t\)\) return;/);
    const queryClient = await readFile('src/lib/query-client.js', 'utf8');
    assert.match(queryClient, /mutations: \{\s*networkMode: 'always',\s*\}/, 'a change made offline fails and says so, rather than waiting unseen');
    passed('No raw error text or "Failed to …" in error toasts; order updates stop offline and say so; changes are never queued unseen');
  }

  // ── 5. A failed order: what happened, in the customer's language ──────────────────────
  {
    const scope = 'storefront:tenant-1:takeaway';
    sessionStorage.clear();
    const params = { p_tenant_id: 'tenant-1', p_items: [{ product_id: 'kaya', quantity: 2 }], p_type: 'takeaway' };
    const reply = (answer) => ({ rpc: async () => answer });
    const kindOf = async (client, parameters = params) => {
      try { await app.submitCheckout(client, parameters, scope); return null; } catch (error) { return app.checkoutProblemFor(error); }
    };
    assert.deepEqual(await kindOf(reply({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })), { kind: 'unconfirmed' }, 'sent, no answer');
    assert.equal(app.getPendingCheckouts()[0]?.state, 'unconfirmed');
    assert.deepEqual(await kindOf(reply({ data: null, error: null }), { ...params, p_notes: 'less sugar' }), { kind: 'earlier' }, 'a different order after an unconfirmed one: nothing sent');
    app.forgetCheckout(scope);
    assert.equal(sessionStorage.getItem(`sellio_checkout_attempt:${scope}`), null, 'Send this order: the earlier key is forgotten');
    assert.equal(app.getPendingCheckouts().length, 0);
    assert.deepEqual(await kindOf(reply({ data: null, error: { code: 'P0002', message: 'An item in your cart is no longer available' } })),
      { kind: 'rejected', reason: 'An item in your cart is no longer available.' }, 'the shop’s own reason');
    assert.deepEqual(await kindOf(reply({ data: null, error: { code: '40001', message: 'could not serialize access due to concurrent update' } })), { kind: 'failed' });
    assert.deepEqual(await kindOf(reply({ data: null, error: { message: '<html>502 Bad Gateway</html>', code: '' } })), { kind: 'unconfirmed' },
      'an answer that isn’t a known "no" (a gateway page): it may have been placed');
    app.forgetCheckout(scope);
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem() { throw new Error('SecurityError'); } }, configurable: true });
    assert.deepEqual(await kindOf(reply({ data: null, error: null })), { kind: 'storage' }, 'no storage for the key: nothing sent');
    Object.defineProperty(globalThis, 'sessionStorage', storage);
    passed('Each way an order can fail is told apart: no answer, an earlier one unconfirmed, the shop’s reason, Sellio’s side, no storage');

    const en = (key) => ({
      orderNotSent: 'Your order wasn’t sent', orderOffline: 'Your phone is offline, so the order didn’t reach {shop}.',
      nothingSentNotPaid: 'Nothing was sent, and you haven’t paid.', orderFailed: 'Sellio couldn’t take your order just now. That’s on our side, not yours.',
      orderStorage: 'S', orderUnconfirmed: 'We couldn’t confirm your order', orderUnconfirmedText: 'U {shop}', orderEarlier: 'E', orderEarlierText: 'ET {shop}',
    }[key]);
    const words = (problem) => app.problemWords(problem, { t: en, lang: 'en', shop: 'Kopi Corner' });
    assert.deepEqual(words({ kind: 'offline' }), { title: 'Your order wasn’t sent', text: 'Your phone is offline, so the order didn’t reach Kopi Corner. Nothing was sent, and you haven’t paid.' });
    assert.deepEqual(words({ kind: 'rejected', reason: 'An item in your cart is no longer available.' }), { title: 'Your order wasn’t sent', text: 'An item in your cart is no longer available. Nothing was sent, and you haven’t paid.' });
    assert.deepEqual(words({ kind: 'failed' }), { title: 'Your order wasn’t sent', text: 'Sellio couldn’t take your order just now. That’s on our side, not yours. Nothing was sent, and you haven’t paid.' });
    assert.deepEqual(words({ kind: 'unconfirmed' }), { title: 'We couldn’t confirm your order', text: 'U Kopi Corner' }, 'unconfirmed never claims nothing was sent');
    assert.deepEqual(words({ kind: 'earlier' }), { title: 'E', text: 'ET Kopi Corner' });
    const zh = app.problemWords({ kind: 'offline' }, { t: (k) => ({ orderNotSent: '未发出', orderOffline: '没有送到{shop}。', nothingSentNotPaid: '您也没有付款。' }[k]), lang: 'zh', shop: 'Kopi Corner' });
    assert.equal(zh.text, '没有送到Kopi Corner。您也没有付款。', 'Chinese sentences join without a space');
    passed('The words: whether it reached the shop and that nothing was paid; "unconfirmed" never says nothing was sent');

    // Every word the checkout uses exists in English, Chinese and Malay.
    const keys = ['back', 'orderNotSent', 'orderOffline', 'nothingSentNotPaid', 'orderFailed', 'orderStorage', 'orderUnconfirmed', 'orderUnconfirmedText',
      'orderEarlier', 'orderEarlierText', 'waitingForInternet', 'backOnline', 'tryAgain', 'showOrderToStaff', 'changeMyOrder', 'sendThisOrder', 'myOrder',
      'takeaway', 'forStaffNotSent', 'forStaffMaybeSent'];
    const seen = {};
    for (const lang of ['en', 'zh', 'ms']) {
      localStorage.setItem('sellio_storefront_lang', lang);
      function Probe() { const { t } = app.useLanguage(); seen[lang] = Object.fromEntries(keys.map((k) => [k, t(k)])); return null; }
      const probe = await mount(h(app.LanguageProvider, null, h(Probe)));
      await probe.close();
    }
    localStorage.removeItem('sellio_storefront_lang');
    for (const key of keys) {
      assert.notEqual(seen.en[key], key, `English has ${key}`);
      assert.notEqual(seen.zh[key], seen.en[key], `Chinese has its own ${key}`);
      assert.notEqual(seen.ms[key], seen.en[key], `Malay has its own ${key}`);
      for (const lang of ['en', 'zh', 'ms']) {
        if (/\{shop\}/.test(seen.en[key])) assert.match(seen[lang][key], /\{shop\}/, `${lang} ${key} names the shop`);
      }
    }
    passed('Every checkout word is in English, Chinese and Malay, each naming the shop where English does');
  }

  // ── 6. The checkout itself: offline, no answer, the shop's reason, an earlier order ──
  {
    sessionStorage.clear();
    globalThis.rpcCalls = [];
    globalThis.toasts = [];
    localStorage.setItem('sf_cart_kopi-corner', JSON.stringify([
      { key: 'kaya-default', product_id: 'kaya', name: 'Kaya toast set', price: 4.5, quantity: 2, variant: 'Soft-boiled eggs', notes: null },
      { key: 'kopi-default', product_id: 'kopi', name: 'Kopi C', price: 1.8, quantity: 1, variant: null, notes: 'Less sugar' },
    ]));
    const page = await mount(h(MemoryRouter, { initialEntries: ['/store/kopi-corner'] },
      h(Routes, null, h(Route, { path: '/store/:tenantSlug', element: h(app.Storefront) }))));
    await wait(20);
    const body = document.body;
    const openCheckout = async () => {
      const bar = [...body.querySelectorAll('button')].find((b) => /^3 S\$10\.80$/.test(text(b)));
      await click(bar);
      await click(button(body, 'Proceed to checkout'));
    };
    await openCheckout();
    assert.ok(button(body, 'Place order · S$10.80'), 'the checkout is open');

    // Offline: nothing is sent; it says so, and that nothing was paid.
    setOnline(false);
    await click(button(body, 'Place order · S$10.80'));
    let problem = body.querySelector('[data-testid="checkout-problem"]');
    assert.ok(problem, 'the problem stays on the checkout');
    assert.equal(problem.getAttribute('data-kind'), 'offline');
    assert.equal(text(problem), 'Your order wasn’t sent Your phone is offline, so the order didn’t reach Kopi Corner. Nothing was sent, and you haven’t paid. Waiting for the internet…');
    assert.equal(placed().length, 0, 'offline: no request at all');
    assert.equal(button(body, 'Place order · S$10.80'), undefined, 'Place order gives way to the ways forward');
    assert.deepEqual(buttons(body.querySelector('[data-testid="checkout-problem-actions"]')), ['Try again', 'Show my order to staff']);
    assert.ok(text(body).includes('Kaya toast set'), 'the order is still there, under the message');
    assert.equal(globalThis.toasts.filter((t) => t.kind === 'error').length, 0, 'no vanishing toast instead');
    await click(button(body, 'Try again'));
    assert.equal(placed().length, 0, 'Try again while still offline: still nothing sent');
    await act(async () => setOnline(true));
    assert.equal(text(body.querySelector('[data-testid="checkout-connection"]')), 'You’re back online. You can send it now.', 'it notices the connection is back');
    passed('Offline: the order isn’t sent, the checkout says so (not sent, not paid) and waits for the internet');

    // Show my order to staff: the order, large.
    await click(button(body, 'Show my order to staff'));
    const staff = body.querySelector('[data-testid="order-for-staff"]');
    assert.ok(staff);
    assert.equal(text(staff), 'Kopi Corner · Takeaway My order This order hasn’t been sent. Please take it for me. 2 × Kaya toast set Soft-boiled eggs S$9.00 1 × Kopi C “Less sugar” S$1.80 Total S$10.80 Back');
    assert.equal(staff.querySelector('h2').style.fontSize, '28px', 'large, to be read across the counter');
    await click(button(staff, 'Back'));
    assert.equal(body.querySelector('[data-testid="order-for-staff"]'), null);
    assert.ok(body.querySelector('[data-testid="checkout-problem"]'), 'back on the checkout, message still there');
    passed('Show my order to staff: the order large, with "not sent yet", and Back to the checkout');

    // Sent, but no answer: it may have arrived. Try again sends the same key.
    globalThis.placeOrder = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } });
    await click(button(body, 'Try again'));
    await wait();
    problem = body.querySelector('[data-testid="checkout-problem"]');
    assert.equal(problem.getAttribute('data-kind'), 'unconfirmed');
    assert.equal(text(problem), 'We couldn’t confirm your order The connection dropped while it was sending, so it may or may not have reached Kopi Corner. Tap Try again: if it got there, you’ll see it, and nothing is ordered twice.');
    assert.equal(placed().length, 1);
    const key = placed()[0].args.p_request_id;
    await click(button(body, 'Show my order to staff'));
    assert.match(text(body.querySelector('[data-testid="order-for-staff"]')), /This order may already have reached you\. Please check before taking it\./, 'staff are told to check first');
    await click(button(body.querySelector('[data-testid="order-for-staff"]'), 'Back'));
    globalThis.placeOrder = () => ({ data: { id: 'order-1', order_number: 'ORD-000128', total_amount: 10.8, items: [] }, error: null });
    await click(button(body, 'Try again'));
    await wait();
    assert.equal(placed().length, 2);
    assert.equal(placed()[1].args.p_request_id, key, 'the same key: the shop can’t get it twice');
    assert.ok(text(body).includes('ORD-000128'), 'it went through: the order number shows');
    assert.equal(body.querySelector('[data-testid="checkout-problem"]'), null);
    assert.equal(JSON.parse(localStorage.getItem('sf_cart_kopi-corner')).length, 0, 'the cart is empty once placed');
    passed('No answer: "may or may not have reached"; Try again sends the same key and shows the order once it’s through');

    // The shop's own reason: not sent, and Change my order goes back to the cart.
    await page.close();
    document.body.innerHTML = '';
    globalThis.rpcCalls = [];
    sessionStorage.clear();
    localStorage.setItem('sf_cart_kopi-corner', JSON.stringify([{ key: 'kaya-default', product_id: 'kaya', name: 'Kaya toast set', price: 4.5, quantity: 2, variant: null, notes: null },
      { key: 'kopi-default', product_id: 'kopi', name: 'Kopi C', price: 1.8, quantity: 1, variant: null, notes: null }]));
    const again = await mount(h(MemoryRouter, { initialEntries: ['/store/kopi-corner'] },
      h(Routes, null, h(Route, { path: '/store/:tenantSlug', element: h(app.Storefront) }))));
    await wait(20);
    await openCheckout();
    globalThis.placeOrder = () => ({ data: null, error: { code: 'P0002', message: 'An item in your cart is no longer available', details: null, hint: null } });
    await click(button(body, 'Place order · S$10.80'));
    await wait();
    problem = body.querySelector('[data-testid="checkout-problem"]');
    assert.equal(text(problem), 'Your order wasn’t sent An item in your cart is no longer available. Nothing was sent, and you haven’t paid.');
    assert.deepEqual(buttons(body.querySelector('[data-testid="checkout-problem-actions"]')), ['Change my order', 'Show my order to staff']);
    await click(button(body, 'Change my order'));
    assert.equal(body.querySelector('[data-testid="checkout-problem"]'), null, 'the checkout closed');
    assert.ok(button(body, 'Proceed to checkout'), 'the cart is open to change it');
    await click(button(body, 'Proceed to checkout'));
    assert.equal(body.querySelector('[data-testid="checkout-problem"]'), null, 'a reopened checkout starts afresh');
    passed('The shop’s reason: not sent, not paid; Change my order opens the cart');

    // No answer, then a different order: it may have arrived; Send this order uses a new key.
    globalThis.placeOrder = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await click(button(body, 'Place order · S$10.80'));
    await wait();
    const firstKey = placed().at(-1).args.p_request_id;
    const notes = body.querySelector('textarea');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(notes, 'No ice please');
      notes.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    const before = placed().length;
    await click(button(body, 'Try again'));
    await wait();
    problem = body.querySelector('[data-testid="checkout-problem"]');
    assert.equal(problem.getAttribute('data-kind'), 'earlier');
    assert.equal(text(problem), 'Your last order wasn’t confirmed It may already have reached Kopi Corner. If you’re not sure, check with them first, then send this order.');
    assert.equal(placed().length, before, 'nothing sent until they choose');
    globalThis.placeOrder = () => ({ data: { id: 'order-2', order_number: 'ORD-000129', total_amount: 10.8, items: [] }, error: null });
    await click(button(body, 'Send this order'));
    await wait();
    assert.equal(placed().length, before + 1);
    assert.notEqual(placed().at(-1).args.p_request_id, firstKey, 'its own key');
    assert.equal(placed().at(-1).args.p_notes, 'No ice please');
    assert.ok(text(body).includes('ORD-000129'));
    passed('A different order after an unconfirmed one: told it may have arrived; Send this order sends it with its own key');
    await again.close();
  }

  console.log(`\n${passes} checks passed`);
} finally {
  console.warn = quiet;
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
