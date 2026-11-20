// Scan Menu's review screen (Products.jsx ScanMenuDialog) with scanMenu v21's answers, and the
// helpers in src/lib/menuScan.js:
//   • items without a printed price are kept, marked, and must get a price (or be deselected)
//     before anything is saved; prices and option prices are saved as numbers;
//   • nothing found says why; a long menu read only in part says so;
//   • an item's own picture on the menu becomes its photo (cut from the full photo at the
//     box's place), is uploaded with it, and can be changed or deleted in the photo editor;
//     a failed upload saves nothing and leaves no photo behind;
//   • the menu's order: new sections after the shop's own, items numbered (sort_order) in
//     the order printed after the shop's highest number.
//   • the review redesigned (20 Nov 2026): sections in the menu's order with Rename; an item's
//     editor (price, name, section, Remove from scan, photos: the × on the photo, and Camera,
//     Gallery and Menu photo in one row, Alvin 20 Nov 2026); saved in the order shown;
//   • descriptions for items the menu printed none for, written by AI (describeMenuItems) six
//     at a time in the menu's order and typed out one by one, marked AI draft; Stop, failures
//     and Try again, Rewrite / Write one, the shop's own words, adding while they're written.
// Run from the app root: node verification/scan-review.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'DocumentFragment', 'CustomEvent', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'NodeFilter', 'HTMLButtonElement', 'Image']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const React = await import('react');
const act = React.act;
const { createRoot } = await import('react-dom/client');
const temporary = await mkdtemp(path.join(app, '.scan-review-verification-'));
const next = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => next()); };
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const toasts = [];
globalThis.__toasts = toasts;
const plugins = [
  { name: 'sonner', setup(b) {
    b.onResolve({ filter: /^sonner$/ }, () => ({ path: 'sonner', namespace: 'mock' }));
    b.onLoad({ filter: /^sonner$/, namespace: 'mock' }, () => ({ loader: 'js', contents: [
      'const note = (kind) => (message, options) => { globalThis.__toasts.push({ kind, message, ...(options?.description ? { description: options.description } : {}) }); };',
      'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), message: note("message"), info: note("info"), warning: note("warning"), dismiss() {} });',
      'export const Toaster = () => null;',
    ].join('\n') }));
  } },
  // Making a chosen photo item-photo size needs a real canvas: a stand-in when a test sets one.
  { name: 'shrink', setup(b) {
    b.onResolve({ filter: /lib\/imageShrink(\.js)?$/ }, (args) => (args.namespace === 'shrink' ? undefined : { path: 'imageShrink', namespace: 'shrink' }));
    b.onLoad({ filter: /.*/, namespace: 'shrink' }, () => ({ resolveDir: path.join(app, 'src/lib'), loader: 'js', contents: [
      "export * from './imageShrink.js';",
      "import { shrinkImage as real } from './imageShrink.js';",
      'export const shrinkImage = (blob, options) => (globalThis.__shrink ? globalThis.__shrink(blob, options) : real(blob, options));',
    ].join('\n') }));
  } },
  { name: 'client', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
    b.onLoad({ filter: /^client$/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => globalThis.__client;' }));
  } },
  // Preparing the photo and cutting pictures need a real canvas: stand-ins; the rest of
  // menuScan.js (prices, options, boxes, reasons) is the real one.
  { name: 'scan-photo', setup(b) {
    b.onResolve({ filter: /lib\/menuScan(\.js)?$/ }, (args) => (args.namespace === 'scan-photo' ? undefined : { path: 'menuScan', namespace: 'scan-photo' }));
    b.onLoad({ filter: /.*/, namespace: 'scan-photo' }, () => ({ resolveDir: path.join(app, 'src/lib'), loader: 'js', contents: [
      "export * from './menuScan.js';",
      'export const prepareMenuPhoto = (file) => globalThis.__scanPhoto(file);',
      'export const cutPicture = (img, rect) => globalThis.__cutPicture(img, rect);',
    ].join('\n') }));
  } },
];
const outfile = path.join(temporary, 'products.mjs');
await build({ entryPoints: [path.join(app, 'src/pages/Products.jsx')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, plugins, logLevel: 'silent', jsx: 'automatic' });
const { ScanMenuDialog } = await import(pathToFileURL(outfile).href);
const helpersFile = path.join(temporary, 'menuScan.mjs');
await build({ entryPoints: [path.join(app, 'src/lib/menuScan.js')], outfile: helpersFile, bundle: true, packages: 'external', format: 'esm', platform: 'node', logLevel: 'silent' });
const scan = await import(pathToFileURL(helpersFile).href);

// ── The world around the dialog ──────────────────────────────────────────────────────────
const FULL = { img: { full: true }, url: 'blob:full-photo', width: 4472, height: 3354 }; // twice the size sent
let photo = { base64: 'cGhvdG8=', mediaType: 'image/jpeg', width: 2236, height: 1677, full: FULL };
globalThis.__scanPhoto = async () => { await next(); return photo; };
const cuts = [];
globalThis.__cutPicture = async (img, rect) => { cuts.push({ img, rect }); return { blob: new window.Blob(['pic-' + cuts.length], { type: 'image/webp' }), url: `blob:picture-${cuts.length}`, type: 'image/webp', ext: 'webp' }; };
let urlCount = 0;
URL.createObjectURL = () => `blob:made-${++urlCount}`;
const revoked = [];
URL.revokeObjectURL = (url) => revoked.push(url);

let answer = null;
const requests = [];
// describeMenuItems (the descriptions the review writes): none by default; a test sets its own.
const described = [];
let describe = (body) => ({ descriptions: body.items.map(() => null) });
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('data:')) return { blob: async () => new window.Blob(['edited'], { type: 'image/jpeg' }) };
  if (String(url).endsWith('/functions/v1/describeMenuItems')) {
    const body = JSON.parse(options.body);
    described.push({ url, body, headers: options.headers, signal: options.signal });
    const reply = await describe(body, options);
    return { ok: !reply.status, status: reply.status || 200, text: async () => JSON.stringify(reply.json ?? reply) };
  }
  requests.push({ url, body: JSON.parse(options.body) });
  const body = typeof answer === 'function' ? answer() : answer;
  return { ok: !body.status, text: async () => '   ' + JSON.stringify(body.json ?? body) };
};
const writes = [];
const storage = { uploads: [], removed: [], failUploads: false };
// What the save reads first (the shop's highest item number), and the answer it gets.
const reads = [];
let lastItem = { data: [], error: null };
// findProductImage (sample photos): none found unless a test says otherwise.
const invoked = [];
let photosFor = () => ({ data: null, error: { context: { status: 404 } } });
// findProductImage { action: 'keep' }: copies the sample photos used into the shop's photos.
const copyOf = (p) => `https://files.invalid/shop-1/products/${p.id}-k.jpg`;
const keepAll = (body) => ({ data: { kept: body.photos.map((p) => ({ from: p.url, url: copyOf(p) })) }, error: null });
let keepFor = keepAll;
globalThis.__client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'owner-token' } } }) },
  functions: { invoke: async (name, { body }) => {
    invoked.push({ name, body });
    if (name !== 'findProductImage') return { data: null, error: { message: 'unknown function' } };
    return body.action === 'keep' ? keepFor(body) : photosFor(body);
  } },
  from: (table) => ({
    insert: (rows) => {
      writes.push({ table, rows });
      if (table === 'products') return { select: async () => ({ data: rows.map((row, i) => ({ ...row, id: 'p-' + i })), error: null }) };
      if (table === 'categories') return { select: () => ({ single: async () => ({ data: { id: 'cat-' + rows.name, name: rows.name }, error: null }) }) };
      return Promise.resolve({ error: null });
    },
    select: (columns) => {
      const query = { table, columns, eq: [], order: [], limit: null };
      reads.push(query);
      const chain = {
        eq: (column, value) => { query.eq.push([column, value]); return chain; },
        order: (column, options) => { query.order.push([column, options?.ascending]); return chain; },
        limit: async (n) => { query.limit = n; return table === 'products' ? lastItem : { data: [], error: null }; },
      };
      return chain;
    },
  }),
  storage: { from: () => ({
    upload: async (pathName, blob, options) => {
      if (storage.failUploads && storage.uploads.length >= 1) return { error: { message: 'Network request failed' } };
      storage.uploads.push({ pathName, blob, options });
      return { error: null };
    },
    getPublicUrl: (pathName) => ({ data: { publicUrl: `https://files.invalid/${pathName}` } }),
    remove: async (paths) => { storage.removed.push(...paths); return { error: null }; },
  }) },
};
const reset = () => { invoked.length = 0; keepFor = keepAll; photosFor = () => ({ data: null, error: { context: { status: 404 } } }); described.length = 0; describe = (body) => ({ descriptions: body.items.map(() => null) }); requests.length = 0; writes.length = 0; reads.length = 0; lastItem = { data: [], error: null }; cuts.length = 0; storage.uploads = []; storage.removed = []; storage.failUploads = false; revoked.length = 0; };

const roots = [];
async function open(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const all = { open: true, photo: new window.File(['menu'], 'menu.jpg', { type: 'image/jpeg' }), onPhoto() {}, onOpenChange() {}, tenantId: 'shop-1', categories: [{ id: 'cat-drinks', name: 'Drinks' }], maxProducts: null, currentProductCount: 0, ...props };
  await act(async () => root.render(React.createElement(ScanMenuDialog, all)));
  await settle(10);
  return { container, root, rerender: async (more) => { await act(async () => root.render(React.createElement(ScanMenuDialog, { ...all, ...more }))); await settle(); } };
}
const closeAll = async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ''; };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const byTest = (c, id) => [...c.querySelectorAll(`[data-testid="${id}"]`)];
const button = (c, pattern) => [...c.querySelectorAll('button')].find((b) => pattern.test(text(b)) || pattern.test(b.getAttribute('aria-label') || ''));
const click = async (el) => { assert.ok(el, 'control must exist'); await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pills = (c) => byTest(c, 'scan-item-price');
// A price is typed in the item's editor, opened from its price.
const setPrice = async (c, index, value) => {
  await click(pills(c)[index]);
  const input = c.querySelector('[data-testid="scan-edit-price"]');
  assert.ok(document.activeElement === input, 'the editor opens on the price');
  await type(input, value);
  await click(button(c, /^Done$/));
  assert.equal(byTest(c, 'scan-edit').length, 0, 'Done closes the editor');
};

try {
  // ── 1. The helpers ──────────────────────────────────────────────────────────────────────
  // The docs' worked example (standard limits), and the high-resolution limits.
  assert.deepEqual(scan.aiPhotoSize(1075, 1520, 1568, 1568), [924, 1307]);
  assert.deepEqual(scan.aiPhotoSize(1075, 1520), [1075, 1520], 'fits the high-resolution limits as it is');
  for (const [w, h] of [[4000, 3000], [3000, 4000], [4032, 1816], [1200, 9000], [8000, 8000]]) {
    const [sw, sh] = scan.aiPhotoSize(w, h);
    const patches = (a, b) => Math.ceil(a / 28) * Math.ceil(b / 28);
    assert.ok(Math.ceil(sw / 28) * 28 <= 2576 && Math.ceil(sh / 28) * 28 <= 2576 && patches(sw, sh) <= 4784, `${w}×${h} → ${sw}×${sh} is within the limits`);
    assert.ok(Math.abs(sw / sh - w / h) < 0.01, `${w}×${h} keeps its shape`);
    if (w >= h) assert.ok(!(Math.ceil((sw + 1) / 28) * 28 <= 2576 && patches(sw + 1, Math.round((sw + 1) * h / w)) <= 4784), `${w}×${h}: as large as fits`);
  }
  assert.equal(scan.typedPrice(''), null);
  assert.equal(scan.typedPrice('  '), null);
  assert.equal(scan.typedPrice('4.5'), 4.5);
  assert.equal(scan.typedPrice('1,250'), 1250);
  assert.equal(scan.typedPrice('0'), 0);
  assert.equal(scan.typedPrice('-2'), null);
  assert.equal(scan.typedPrice('abc'), null);
  assert.deepEqual(scan.cleanScannedOptions([{ name: 'Size', type: 'other', options: [{ label: 'S', price_modifier: 0 }, { label: 'L', price_modifier: '1.50' }, { label: ' ', price_modifier: 1 }] }, { name: 'Add-ons', type: 'addon', options: [{ label: 'Egg', price_modifier: 'x' }] }, { name: 'Empty', options: [] }, null]),
    [{ name: 'Size', type: 'other', options: [{ label: 'S', price_modifier: 0 }, { label: 'L', price_modifier: 1.5 }] }, { name: 'Add-ons', type: 'addon', options: [{ label: 'Egg', price_modifier: 0 }] }]);
  assert.deepEqual(scan.fullPhotoRect([100, 50, 300, 250], { width: 2236, height: 1677 }, { width: 4472, height: 3354 }), { x: 200, y: 100, width: 400, height: 400 });
  assert.deepEqual(scan.fullPhotoRect([300, 250, 100, 50], { width: 1000, height: 1000 }, { width: 1000, height: 1000 }), { x: 100, y: 50, width: 200, height: 200 }, 'corners in either order');
  assert.deepEqual(scan.fullPhotoRect([900, 900, 1200, 1200], { width: 1000, height: 1000 }, { width: 1000, height: 1000 }), { x: 900, y: 900, width: 100, height: 100 }, 'kept inside the photo');
  assert.equal(scan.fullPhotoRect(null, { width: 1, height: 1 }, { width: 1, height: 1 }), null);
  assert.equal(scan.fullPhotoRect([0, 0, 10, 10], { width: 1000, height: 1000 }, null), null);
  assert.deepEqual(Object.keys(scan.SCAN_REASONS).sort(), ['cut_off', 'no_items', 'not_a_menu', 'too_blurry', 'too_long']);
  passed('helpers: the size the AI reads a photo at, typed prices, options as numbers, boxes on the full photo');

  // ── 2. Items without a printed price ───────────────────────────────────────────────────
  reset();
  answer = { items: [
    { name: 'Kopi', price: 1.8, category: 'Drinks', description: '', variants: [{ name: 'Hot or iced', type: 'other', options: [{ label: 'Hot', price_modifier: 0 }, { label: 'Iced', price_modifier: '0.40' }] }], photo: null },
    { name: 'Teh Tarik', price: null, category: 'Drinks', description: 'Pulled milk tea', variants: [], photo: null },
    { name: 'Milo', price: null, category: 'Drinks', description: '', variants: [], photo: null },
  ], count: 3 };
  let view = await open();
  assert.equal(requests[0].body.version, 2);
  assert.equal(byTest(view.container, 'scan-item').length, 3);
  assert.equal(text(byTest(view.container, 'scan-need-price')[0]), '2 items have no price on the menu. Add them below, or deselect them.');
  assert.deepEqual(byTest(view.container, 'scan-item-price').map((b) => b.dataset.missing), ['no', 'yes', 'yes']);
  assert.deepEqual(pills(view.container).map((b) => text(b)), ['S$1.80', 'Add price', 'Add price'], 'a scanned price shows with its cents');
  assert.equal(text(byTest(view.container, 'scan-item-options')[0]), 'Hot or iced: Hot / Iced +0.40', 'each choice with its extra price, to check');
  await click(button(view.container, /^Add 3 products$/));
  assert.match(text(view.container.querySelector('[role="alert"]')), /^Add a price for 2 selected items, or deselect them\.$/);
  assert.equal(writes.length, 0, 'nothing is saved while a selected item has no price');
  assert.equal(pills(view.container)[1].style.border, '1.5px solid rgb(239, 68, 68)', 'a missing price turns red once Add was tapped');
  await click(pills(view.container)[2]);
  assert.equal(view.container.querySelector('[data-testid="scan-edit-price"]').getAttribute('aria-invalid'), 'true', 'and its editor says so');
  await click(button(view.container, /^Done$/));
  // One gets a price, one is deselected.
  await setPrice(view.container, 1, '2.20');
  assert.equal(text(pills(view.container)[1]), 'S$2.20');
  await click(view.container.querySelectorAll('input[type="checkbox"]')[2]);
  assert.equal(byTest(view.container, 'scan-need-price').length, 0, 'no more items need a price');
  await click(button(view.container, /^Add 2 products$/));
  const products = writes.find((w) => w.table === 'products').rows;
  assert.deepEqual(products.map((p) => [p.name, p.price, p.category_id, p.image_url, p.is_active]), [['Kopi', 1.8, 'cat-drinks', null, true], ['Teh Tarik', 2.2, 'cat-drinks', null, true]]);
  assert.deepEqual(products[0].variants, [{ name: 'Hot or iced', type: 'other', options: [{ label: 'Hot', price_modifier: 0 }, { label: 'Iced', price_modifier: 0.4 }] }], 'an extra price is saved as a number (checkout needs one)');
  assert.equal(typeof products[1].price, 'number', 'saved as a number');
  assert.match(text(byTest(view.container, 'scan-done')[0]), /^2 products added/, 'done: how many');
  assert.equal(text(byTest(view.container, 'scan-done-sections')[0]), 'In your menu’s order: Drinks (2).', 'and in which sections, in the menu’s order');
  assert.ok(byTest(view.container, 'celebrate').length === 1 && button(view.container, /^See my products$/), 'the tick (confetti where the phone animates) and See my products');
  await closeAll();
  // One item: its own words.
  reset();
  answer = { items: [{ name: 'Nasi Lemak', price: null, category: 'Mains', variants: [] }], count: 1 };
  view = await open();
  assert.equal(text(byTest(view.container, 'scan-need-price')[0]), '1 item has no price on the menu. Add it below, or deselect it.');
  await click(button(view.container, /^Add 1 product$/));
  assert.match(text(view.container.querySelector('[role="alert"]')), /^Add a price for 1 selected item, or deselect it\.$/);
  await closeAll();
  passed('items without a printed price are kept and marked, and need a price (or deselecting) before anything is saved; prices save as numbers');

  // ── 3. Nothing found says why; a long menu read in part says so ────────────────────────
  for (const [reason, words] of Object.entries({
    not_a_menu: 'This photo doesn’t look like a menu. Take a photo of the menu or price list.',
    too_blurry: 'The menu is too blurry to read. Hold the phone steady, get closer and make sure the menu is well lit.',
    cut_off: 'Only part of the menu is in the photo. Step back so the whole menu fits, or scan it in parts.',
    no_items: 'No items to order were found in this photo. Try a clearer photo of the menu.',
    too_long: 'This menu is too long to read in one go. Scan half of it at a time.',
    something_new: 'No items found. Try a clearer photo.',
  })) {
    reset();
    answer = { items: [], count: 0, reason };
    view = await open();
    assert.equal(text(view.container.querySelector('[role="alert"]')), words, reason);
    assert.equal(button(view.container, /^Try Again$/), undefined, `${reason}: the same photo would give the same answer, so no Try Again`);
    assert.ok(button(view.container, /Retake/) || [...view.container.querySelectorAll('label, button')].some((el) => /Retake/.test(text(el))), `${reason}: Retake`);
    assert.match(text(view.container), /Take another photo/, `${reason}: says to take another photo`);
    await closeAll();
  }
  reset();
  answer = { error: 'The AI menu scanner is unavailable right now. Please try again.', reason: 'unavailable' };
  view = await open();
  assert.equal(text(view.container.querySelector('[role="alert"]')), 'The AI menu scanner is unavailable right now. Please try again.');
  assert.ok(button(view.container, /^Try Again$/), 'a failure that isn\'t the photo can be tried again');
  assert.match(text(view.container), /Try again or take another photo/);
  await closeAll();
  reset();
  answer = { items: [{ name: 'Nasi Lemak', price: 5, category: 'Mains', variants: [] }], count: 1, partial: true };
  view = await open();
  assert.equal(text(byTest(view.container, 'scan-partial')[0]), 'This menu is long, so only part of it was read. Scan the rest in another photo.');
  await closeAll();
  passed('nothing found says why (not a menu, blurry, cut off, no items, too long) and offers Retake only; other failures Try Again too; a menu read in part says so');

  // ── 4. Pictures from the menu ──────────────────────────────────────────────────────────
  reset();
  answer = { items: [
    { name: 'Chicken Rice', price: 5.5, category: 'Mains', variants: [], photo: [100, 50, 300, 250] },
    { name: 'Laksa', price: 6, category: 'Mains', variants: [], photo: [400, 50, 600, 250] },
    { name: 'Kopi', price: 1.8, category: 'Drinks', variants: [], photo: null },
  ], count: 3, imageWidth: 2236, imageHeight: 1677 };
  view = await open();
  assert.deepEqual(cuts.map((c) => [c.img, c.rect]), [[FULL.img, { x: 200, y: 100, width: 400, height: 400 }], [FULL.img, { x: 800, y: 100, width: 400, height: 400 }]], 'cut from the full photo, at twice the box (it was sent at half size)');
  const thumbs = () => byTest(view.container, 'scan-item-photo');
  assert.deepEqual(thumbs().map((b) => b.querySelector('img')?.getAttribute('src') ?? null), ['blob:picture-1', 'blob:picture-2', null]);
  assert.equal(thumbs()[0].getAttribute('aria-label'), 'Photo for Chicken Rice');
  assert.equal(thumbs()[2].disabled, false, 'an item without a picture can get one from the menu photo');
  assert.match(text(byTest(view.container, 'scan-photo-hint')[0]), /Tap a photo to change it/);
  // The photo editor: opens on the item, Delete takes its picture away.
  await click(thumbs()[1]);
  assert.ok([...document.body.querySelectorAll('h3')].some((h) => text(h) === 'Photo for Laksa'), 'the editor opens for this item');
  assert.match(text(document.body), /Move the box onto its picture, then tap Apply and Save\./);
  await click([...document.body.querySelectorAll('button')].find((b) => text(b) === 'Delete'));
  assert.ok(![...document.body.querySelectorAll('h3')].some((h) => text(h) === 'Photo for Laksa'), 'the editor closed');
  assert.equal(thumbs()[1].querySelector('img'), null, 'Laksa has no photo now');
  await click(thumbs()[2]);
  assert.match(text(document.body), /Tap Crop to box its picture on the menu, or Replace to choose a photo\./);
  await click([...document.body.querySelectorAll('button')].find((b) => text(b) === 'Cancel'));
  // Saved: the picture is uploaded first, and the product points at it.
  await click(button(view.container, /^Add 3 products$/));
  assert.equal(storage.uploads.length, 1, 'only the picture still there is uploaded');
  assert.match(storage.uploads[0].pathName, /^shop-1\/products\/\d+-chicken-rice-0\.webp$/);
  assert.equal(storage.uploads[0].options.cacheControl, '31536000');
  const saved = writes.find((w) => w.table === 'products').rows;
  assert.deepEqual(saved.map((p) => [p.name, p.image_url]), [['Chicken Rice', `https://files.invalid/${storage.uploads[0].pathName}`], ['Laksa', null], ['Kopi', null]]);
  await closeAll();
  assert.ok(revoked.includes('blob:full-photo') && revoked.includes('blob:picture-1'), 'the photos held on the phone are let go when the scan closes');
  passed('each item\'s own picture is cut from the full photo, can be deleted in the photo editor, and is uploaded with its product');

  // A failed upload: nothing is added, and the photos already uploaded are taken away again.
  reset();
  view = await open();
  storage.failUploads = true;
  await click(button(view.container, /^Add 3 products$/));
  assert.equal(writes.filter((w) => w.table === 'products').length, 0, 'no products without their photos');
  assert.deepEqual(storage.removed, [storage.uploads[0].pathName], 'the photo uploaded before the failure is removed');
  assert.ok(view.container.querySelector('[role="alert"]'), 'the problem is shown');
  assert.match(text(byTest(view.container, 'scan-subtitle')[0]), /in your menu’s order$/, 'still on the review, to try again');
  await closeAll();
  passed('a failed photo upload adds nothing and leaves no photo behind');

  // A photo the phone couldn't prepare (no full photo): no pictures, nothing to edit.
  reset();
  photo = { base64: 'cGhvdG8=', mediaType: 'image/heic', width: null, height: null, full: null };
  answer = { items: [{ name: 'Kopi', price: 1.8, category: 'Drinks', variants: [], photo: [10, 10, 100, 100] }], count: 1 };
  view = await open();
  assert.equal(requests[0].body.imageWidth, null);
  assert.equal(cuts.length, 0);
  assert.equal(thumbs()[0].disabled, true);
  await closeAll();
  passed('a photo sent as it is (the phone couldn\'t open it): the scan works, without pictures');

  // ── 5. The menu's order ────────────────────────────────────────────────────────────────
  // New sections go after the shop's own, in the menu's order (20 Nov 2026: they were all
  // saved at 0, so the lists showed "Beverages" above the mains printed before it). A section
  // the shop already has (any capitals) is used as it is, and keeps its place.
  reset();
  answer = { items: [
    { name: 'Grilled Chicken Caesar Salad', price: 12.99, category: 'Menu and Prices', variants: [] },
    { name: 'Classic Club Sandwich', price: 10.99, category: 'Menu and Prices', variants: [] },
    { name: 'Soft Drinks', price: 2.99, category: 'Beverages', variants: [] },
    { name: 'Iced Tea', price: 2.99, category: 'Beverages', variants: [] },
    { name: 'Kopi', price: 1.8, category: 'drinks', variants: [] },
  ], count: 5 };
  view = await open({ categories: [{ id: 'cat-specials', name: 'Specials', sort_order: 1 }, { id: 'cat-drinks', name: 'Drinks', sort_order: 4 }, { id: 'cat-old', name: 'Old', sort_order: null }] });
  lastItem = { data: [{ sort_order: 7 }], error: null }; // the shop's items go up to 7
  await click(button(view.container, /^Add 5 products$/));
  assert.deepEqual(reads, [{ table: 'products', columns: 'sort_order', eq: [['tenant_id', 'shop-1']], order: [['sort_order', false]], limit: 1 }], 'the shop\'s highest item number, read first');
  assert.deepEqual(writes.filter((w) => w.table === 'categories').map((w) => [w.rows.name, w.rows.sort_order]), [['Menu and Prices', 5], ['Beverages', 6]],
    'new sections after the shop\'s highest (4), in the menu\'s order');
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, p.category_id, p.sort_order]), [
    ['Grilled Chicken Caesar Salad', 'cat-Menu and Prices', 8], ['Classic Club Sandwich', 'cat-Menu and Prices', 9],
    ['Soft Drinks', 'cat-Beverages', 10], ['Iced Tea', 'cat-Beverages', 11], ['Kopi', 'cat-drinks', 12],
  ], 'items numbered in the menu\'s order after the shop\'s highest (7); "drinks" into the shop\'s own Drinks');
  await closeAll();
  reset();
  view = await open({ categories: [] });
  // A deselected item takes no number: the rest stay one after another.
  await click(view.container.querySelectorAll('input[type="checkbox"]')[1]);
  await click(button(view.container, /^Add 4 products$/));
  assert.deepEqual(writes.filter((w) => w.table === 'categories').map((w) => [w.rows.name, w.rows.sort_order]), [['Menu and Prices', 1], ['Beverages', 2], ['drinks', 3]],
    'a shop with no sections: 1, 2, 3 in the menu\'s order');
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, p.sort_order]),
    [['Grilled Chicken Caesar Salad', 1], ['Soft Drinks', 2], ['Iced Tea', 3], ['Kopi', 4]], 'a shop with no items: from 1');
  await closeAll();
  // The highest number can't be read: nothing is saved, no photo is uploaded, and it says so.
  reset();
  answer = { items: [{ name: 'Chicken Rice', price: 5.5, category: 'Mains', variants: [], photo: [100, 50, 300, 250] }], count: 1, imageWidth: 2236, imageHeight: 1677 };
  photo = { base64: 'cGhvdG8=', mediaType: 'image/jpeg', width: 2236, height: 1677, full: FULL };
  view = await open({ categories: [] });
  assert.equal(cuts.length, 1, 'it has a picture to upload');
  lastItem = { data: null, error: { message: 'Network request failed' } };
  await click(button(view.container, /^Add 1 product$/));
  assert.deepEqual([writes.length, storage.uploads.length], [0, 0], 'no section, item or photo');
  assert.ok(view.container.querySelector('[role="alert"]'), 'the problem is shown');
  assert.match(text(byTest(view.container, 'scan-subtitle')[0]), /in your menu’s order$/, 'still on the review, to try again');
  await closeAll();
  passed('the menu\'s order: new sections go after the shop\'s own, and items are numbered in the order printed after the shop\'s highest');

  // ── 6. Sections, Rename, an item's editor, and the order saved ──────────────────────────
  reset();
  photo = { base64: 'cGhvdG8=', mediaType: 'image/jpeg', width: 2236, height: 1677, full: FULL };
  answer = { items: [
    { name: 'Grilled Chicken Caesar Salad', price: 12.99, category: 'Menu and Prices', variants: [] },
    { name: 'Classic Club Sandwich', price: 10.99, category: 'Menu and Prices', variants: [] },
    { name: 'Soup of the Day', price: null, category: 'Menu and Prices', description: 'Changes daily', variants: [] },
    { name: 'Soft Drinks', price: 2.99, category: 'Beverages', variants: [] },
    { name: 'Iced Tea', price: 2.99, category: 'Beverages', variants: [{ name: 'Size', type: 'other', options: [{ label: 'Regular', price_modifier: 0 }, { label: 'Large', price_modifier: 1 }] }] },
  ], count: 5 };
  view = await open({ categories: [] });
  const heads = () => byTest(view.container, 'scan-section').map((h) => [text(h.querySelector('h3')), text(h.querySelector('h3 + span'))]);
  const names = () => byTest(view.container, 'scan-item-name').map((n) => text(n));
  assert.equal(text(byTest(view.container, 'scan-subtitle')[0]), '5 items in 2 sections, in your menu’s order');
  assert.deepEqual(heads(), [['Menu and Prices', '3'], ['Beverages', '2']], 'sections in the menu\'s order, with their counts');
  assert.deepEqual(names(), ['Grilled Chicken Caesar Salad', 'Classic Club Sandwich', 'Soup of the Day', 'Soft Drinks', 'Iced Tea'], 'full names, in order');
  assert.equal(text(byTest(view.container, 'scan-item-options')[0]), 'Size: Regular / Large +1', 'options shown on the item');
  assert.deepEqual(byTest(view.container, 'scan-item-description').map((d) => text(d)), ['Changes daily'], 'words printed on the menu are kept (no AI draft)');
  assert.equal(byTest(view.container, 'ai-draft').length, 0);
  // Rename a section: every item in it moves with it.
  await click(button(view.container, /^Rename Beverages$/));
  const sectionInput = view.container.querySelector('input[aria-label="Section name"]');
  assert.ok(document.activeElement === sectionInput, 'the name is ready to type');
  await type(sectionInput, '  Drinks ');
  await act(async () => { sectionInput.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(heads(), [['Menu and Prices', '3'], ['Drinks', '2']]);
  // An item's editor: where it is, its section, its name; Remove from scan.
  await click(button(view.container, /^Edit Iced Tea$/));
  const sheet = () => byTest(view.container, 'scan-edit')[0];
  assert.equal(text(sheet().querySelector('h2 + p')), '2 of 2 in Drinks');
  const nameInput = () => sheet().querySelector('input:not([type="file"])');
  assert.ok(document.activeElement === nameInput(), 'opens on the name');
  const sectionSelect = sheet().querySelector('select');
  assert.deepEqual([...sectionSelect.options].map((o) => o.textContent), ['Menu and Prices', 'Drinks']);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(sectionSelect, 'menu and prices');
    sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(text(sheet().querySelector('h2 + p')), '4 of 4 in Menu and Prices', 'moved to the end of Menu and Prices');
  assert.match(text(sheet()), /Size: Regular \/ Large \+1/);
  await click(button(view.container, /^Done$/));
  assert.deepEqual(heads(), [['Menu and Prices', '4'], ['Drinks', '1']]);
  await click(byTest(view.container, 'scan-item-name')[1]);
  assert.equal(text(sheet().querySelector('h2 + p')), '2 of 4 in Menu and Prices');
  await click(button(view.container, /^Remove from scan$/));
  assert.equal(byTest(view.container, 'scan-edit').length, 0, 'the editor closes');
  assert.deepEqual(names(), ['Grilled Chicken Caesar Salad', 'Soup of the Day', 'Iced Tea', 'Soft Drinks']);
  await click(byTest(view.container, 'scan-item-name')[0]);
  await type(nameInput(), 'Caesar Salad');
  await click(button(view.container, /^Close$/));
  assert.equal(names()[0], 'Caesar Salad');
  // Select none, Select all.
  await click(button(view.container, /^Select none$/));
  assert.match(text(view.container), /0 of 4 selected/);
  assert.equal(button(view.container, /^Add 0 products$/)?.disabled ?? true, true);
  await click(button(view.container, /^Select all$/));
  assert.match(text(view.container), /4 of 4 selected/);
  // The soup needs a price; saved in the order shown.
  await setPrice(view.container, 1, '5.90');
  await click(button(view.container, /^Add 4 products$/));
  assert.deepEqual(writes.filter((w) => w.table === 'categories').map((w) => [w.rows.name, w.rows.sort_order]), [['Menu and Prices', 1], ['Drinks', 2]], 'the renamed section is saved by its new name');
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, p.price, p.category_id, p.sort_order, p.description]), [
    ['Caesar Salad', 12.99, 'cat-Menu and Prices', 1, null],
    ['Soup of the Day', 5.9, 'cat-Menu and Prices', 2, 'Changes daily'],
    ['Iced Tea', 2.99, 'cat-Menu and Prices', 3, null],
    ['Soft Drinks', 2.99, 'cat-Drinks', 4, null],
  ], 'in the order shown: an item moved to another section is numbered there');
  assert.equal(text(byTest(view.container, 'scan-done-sections')[0]), 'In your menu’s order: Menu and Prices (3), Drinks (1).');
  await closeAll();
  passed('sections in the menu\'s order with Rename; an item\'s editor (where it is, section, name, Remove from scan); saved in the order shown');

  // ── 7. Descriptions, written by AI for what the menu didn't print ──────────────────────
  reset();
  answer = { items: [
    ...['Grilled Chicken Caesar Salad', 'Classic Club Sandwich', 'Spinach and Feta Stuffed Chicken', 'Vegetable Quinoa Bowl', 'Fish Tacos'].map((name) => ({ name, price: 12, category: 'Menu and Prices', variants: [] })),
    { name: 'Soup of the Day', price: 5.99, category: 'Menu and Prices', description: 'Changes daily', variants: [] },
    { name: 'Soft Drinks', price: 2.99, category: 'Beverages', variants: [] },
    { name: 'Iced Tea', price: 2.99, category: 'Beverages', variants: [{ name: 'Size', type: 'other', options: [{ label: 'Regular', price_modifier: 0 }, { label: 'Large', price_modifier: 1 }] }] },
  ], count: 8 };
  describe = (body) => ({ descriptions: body.items.map((item) => (item.name === 'Fish Tacos' ? null : `${item.name}, as made here.`)) });
  view = await open({ categories: [] });
  await settle(10);
  assert.equal(described.length, 2, 'six at a time, then the rest');
  assert.deepEqual(described.map((d) => d.body.items.map((i) => i.name)), [
    ['Grilled Chicken Caesar Salad', 'Classic Club Sandwich', 'Spinach and Feta Stuffed Chicken', 'Vegetable Quinoa Bowl', 'Fish Tacos', 'Soft Drinks'],
    ['Iced Tea'],
  ], 'in the menu\'s order, without the soup (its words are printed)');
  assert.deepEqual(described[1].body, { tenantId: 'shop-1', rewrite: false, items: [{ name: 'Iced Tea', section: 'Beverages', options: 'Size: Regular / Large +1' }] });
  assert.equal(described[0].headers.Authorization, 'Bearer owner-token');
  const descriptionOf = (name) => {
    const row = byTest(view.container, 'scan-item').find((r) => text(r.querySelector('[data-testid="scan-item-name"]')) === name);
    const d = row.querySelector('[data-testid="scan-item-description"]');
    return d ? [text(d).replace(/ AI draft$/, ''), !!d.querySelector('[data-testid="ai-draft"]')] : text(row).includes('+ Add a description') ? 'add' : null;
  };
  assert.deepEqual(descriptionOf('Classic Club Sandwich'), ['Classic Club Sandwich, as made here.', true], 'an AI draft, marked');
  assert.deepEqual(descriptionOf('Soup of the Day'), ['Changes daily', false], 'the printed words, unmarked');
  assert.equal(descriptionOf('Fish Tacos'), 'add', 'none came back: blank, to add one');
  assert.equal(text(byTest(view.container, 'scan-written')[0]), '6 descriptions written. Check the ones marked AI draft.');
  // The shop's own words take the place of a draft; Rewrite asks again.
  await click(button(view.container, /^Edit Soft Drinks$/));
  const area = () => byTest(view.container, 'scan-edit')[0].querySelector('textarea');
  assert.equal(area().value, 'Soft Drinks, as made here.');
  assert.equal(byTest(view.container, 'scan-edit')[0].querySelectorAll('[data-testid="ai-draft"]').length, 1);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(area(), 'Coke, Sprite or 100Plus.');
    area().dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(byTest(view.container, 'scan-edit')[0].querySelectorAll('[data-testid="ai-draft"]').length, 0, 'the shop\'s own words: no longer a draft');
  describe = (body) => ({ descriptions: [`Chilled ${body.items[0].name.toLowerCase()}, rewritten.`] });
  await click(button(view.container, /^Rewrite$/));
  await settle();
  assert.deepEqual(described.at(-1).body, { tenantId: 'shop-1', rewrite: true, items: [{ name: 'Soft Drinks', section: 'Beverages', options: '', now: 'Coke, Sprite or 100Plus.' }] });
  assert.equal(area().value, 'Chilled soft drinks, rewritten.');
  await click(button(view.container, /^Done$/));
  assert.deepEqual(descriptionOf('Soft Drinks'), ['Chilled soft drinks, rewritten.', true]);
  // Write one, for the item without one.
  await click(button(view.container, /^Edit Fish Tacos$/));
  describe = () => ({ descriptions: ['Soft tacos with battered fish.'] });
  await click(button(view.container, /^Write one$/));
  await settle();
  assert.deepEqual(described.at(-1).body.rewrite, false);
  assert.equal(area().value, 'Soft tacos with battered fish.');
  await click(button(view.container, /^Done$/));
  // A failed rewrite says so and keeps the words.
  await click(button(view.container, /^Edit Iced Tea$/));
  describe = () => ({ status: 429, json: { error: 'This store has written as many descriptions as it can today. Please try again tomorrow.' } });
  toasts.length = 0;
  await click(button(view.container, /^Rewrite$/));
  await settle();
  assert.deepEqual(toasts.at(-1), { kind: 'error', message: 'Couldn’t write a description', description: 'This store has written as many descriptions as it can today. Please try again tomorrow.' }, 'the service\'s reason, in its words');
  assert.equal(area().value, 'Iced Tea, as made here.');
  await click(button(view.container, /^Done$/));
  await click(button(view.container, /^Add 8 products$/));
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => p.description), [
    'Grilled Chicken Caesar Salad, as made here.', 'Classic Club Sandwich, as made here.', 'Spinach and Feta Stuffed Chicken, as made here.', 'Vegetable Quinoa Bowl, as made here.',
    'Soft tacos with battered fish.', 'Changes daily', 'Chilled soft drinks, rewritten.', 'Iced Tea, as made here.',
  ], 'saved with their descriptions');
  await closeAll();
  // Words that come back after the scan was taken again land nowhere (items are numbered from 0
  // in every scan: the new scan's first item must not get them).
  reset();
  answer = { items: [{ name: 'Kopi', price: 1.8, category: 'Drinks', variants: [] }], count: 1 };
  view = await open({ categories: [] });
  await click(button(view.container, /^Edit Kopi$/));
  let late;
  describe = () => new Promise((resolve) => { late = resolve; });
  await click(button(view.container, /^Write one$/));
  answer = { items: [{ name: 'Teh', price: 1.5, category: 'Drinks', variants: [] }], count: 1 };
  describe = (body) => ({ descriptions: body.items.map(() => null) });
  await view.rerender({ photo: new window.File(['again'], 'again.jpg', { type: 'image/jpeg' }) });
  await settle(10);
  assert.deepEqual(byTest(view.container, 'scan-item-name').map((n) => text(n)), ['Teh']);
  await act(async () => { late({ descriptions: ['Kopi words, too late.'] }); await next(); });
  await settle();
  assert.equal(descriptionOf('Teh'), 'add', 'the late words are dropped');
  await closeAll();
  passed('descriptions: the AI writes those the menu didn\'t print, six at a time in the menu\'s order, marked AI draft; the shop\'s own words replace a draft; Rewrite and Write one ask again; a failure says so');

  // ── 8. One by one: typed out, Stop, a failure and Try again, adding while writing ──────
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = (ms) => act(async () => { await sleep(ms); });
  // Waits for what's on screen rather than for a time (typing runs on timers; a busy machine is slow).
  const until = async (what, ms = 5000) => {
    const end = Date.now() + ms;
    while (!what()) {
      if (Date.now() > end) throw new Error('timed out waiting');
      await act(async () => { await sleep(10); });
    }
  };
  // Long words take about 14 steps (~0.6 s) to type: time to act while one is being typed.
  const words = (name) => `Hot ${name.toLowerCase()} here, pulled and poured twice for a frothy top.`;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); // the phone allows motion
  const drinks = ['Kopi', 'Teh', 'Milo', 'Bandung', 'Kopi C', 'Teh C', 'Milo Dinosaur', 'Horlicks'].map((name) => ({ name, price: 2, category: 'Drinks', variants: [] }));
  const gate = [];
  reset();
  describe = (body) => new Promise((resolve) => gate.push({ body, resolve }));
  answer = { items: drinks, count: 8 };
  view = await open({ categories: [] });
  assert.equal(gate.length, 1, 'the first six asked for');
  assert.equal(byTest(view.container, 'scan-item-waiting').length, 8, 'each waits for its words');
  assert.equal(text(byTest(view.container, 'scan-writing')[0]), 'Writing descriptions · 0 of 8StopYou can check items or add them now. Any still waiting stay blank.');
  // The shop's own words for one still waiting: kept when the AI's come.
  const typeOwn = async (name, words) => {
    await click(button(view.container, new RegExp(`^Edit ${name}$`)));
    const box = byTest(view.container, 'scan-edit')[0].querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(box, words);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(button(view.container, /^Done$/));
  };
  await typeOwn('Milo', 'Iced chocolate malt.');
  await act(async () => { gate[0].resolve({ descriptions: gate[0].body.items.map((i) => words(i.name)) }); await sleep(20); });
  await until(() => byTest(view.container, 'scan-item-writing').length === 1);
  assert.equal(byTest(view.container, 'scan-item-writing').length, 1, 'one typed at a time');
  assert.match(text(byTest(view.container, 'scan-item-writing')[0]), /^Writing…Ho/);
  assert.ok(text(byTest(view.container, 'scan-item-writing')[0]).length < `Writing…${words('Kopi')}`.length, 'typed out bit by bit');
  assert.equal(gate.length, 2, 'the next ones are asked for while these are typed');
  await until(() => descriptionOf('Kopi')?.[1] === true);
  assert.deepEqual(descriptionOf('Kopi'), [words('Kopi'), true]);
  // ... and for the one being typed: the typing stops there.
  const writingName = () => text(byTest(view.container, 'scan-item-writing')[0]?.closest('[data-testid="scan-item"]')?.querySelector('[data-testid="scan-item-name"]'));
  assert.equal(writingName(), 'Teh', 'Teh is being typed');
  await typeOwn('Teh', 'Pulled tea.');
  assert.equal(writingName(), 'Bandung', 'the next is typed at once (Milo skipped)');
  assert.deepEqual([descriptionOf('Teh'), descriptionOf('Milo')], [['Pulled tea.', false], ['Iced chocolate malt.', false]], 'the shop\'s own words are never written over');
  assert.match(text(byTest(view.container, 'scan-writing')[0]), /^Writing descriptions · 3 of 8/, 'Kopi, Teh and Milo are done with');
  await click(button(view.container, /^Stop$/));
  const written = byTest(view.container, 'ai-draft').length;
  assert.equal(written, 2, 'Kopi, and Bandung put whole');
  assert.deepEqual(descriptionOf('Bandung'), [words('Bandung'), true]);
  assert.equal(byTest(view.container, 'scan-item-waiting').length + byTest(view.container, 'scan-item-writing').length, 0, 'nothing waits after Stop');
  assert.equal(described[1].signal.aborted, true, 'the next ones aren\'t waited for');
  assert.equal(text(byTest(view.container, 'scan-written')[0]), `${written} descriptions written. Check the ones marked AI draft.`);
  await act(async () => { gate[1].resolve({ descriptions: ['Late words.', 'Late words.'] }); await sleep(100); });
  assert.equal(byTest(view.container, 'ai-draft').length, written, 'a late answer changes nothing');
  await closeAll();
  // A failure says so; Try again writes the rest.
  reset();
  describe = () => ({ status: 502, json: { error: 'Descriptions can’t be written right now. Please try again.', reason: 'unavailable' } });
  answer = { items: drinks.slice(0, 2), count: 2 };
  view = await open({ categories: [] });
  await settle();
  assert.equal(text(byTest(view.container, 'scan-writing-failed')[0]), 'Descriptions can’t be written right now. Please try again. Items without one stay blank.Try again');
  assert.equal(byTest(view.container, 'scan-item-waiting').length, 0, 'none left waiting');
  describe = (body) => ({ descriptions: body.items.map((i) => `${i.name}, made fresh.`) });
  await click(button(view.container, /^Try again$/));
  await until(() => descriptionOf('Teh')?.[1] === true);
  assert.deepEqual([descriptionOf('Kopi'), descriptionOf('Teh')], [['Kopi, made fresh.', true], ['Teh, made fresh.', true]]);
  assert.equal(text(byTest(view.container, 'scan-written')[0]), '2 descriptions written. Check the ones marked AI draft.');
  await closeAll();
  // Adding while they're written: the one being typed is saved whole, those waiting blank.
  reset();
  gate.length = 0;
  describe = (body) => new Promise((resolve) => gate.push({ body, resolve }));
  answer = { items: drinks, count: 8 };
  view = await open({ categories: [] });
  await act(async () => { gate[0].resolve({ descriptions: gate[0].body.items.map((i) => `Hot ${i.name.toLowerCase()} with condensed milk, pulled here.`) }); await sleep(100); });
  assert.equal(byTest(view.container, 'scan-item-writing').length, 1, 'still typing the first');
  await click(button(view.container, /^Add 8 products$/));
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => p.description), ['Hot kopi with condensed milk, pulled here.', null, null, null, null, null, null, null]);
  assert.equal(described[1].signal.aborted, true);
  await closeAll();
  delete dom.window.matchMedia;
  passed('one by one: each typed out while the next are asked for; Stop keeps the one being typed and leaves the rest blank; a failure says so and Try again writes the rest; adding saves what\'s written');

  // ── 9. Photos in an item's editor ───────────────────────────────────────────────────────
  reset();
  photo = { base64: 'cGhvdG8=', mediaType: 'image/jpeg', width: 2236, height: 1677, full: FULL };
  answer = { items: [
    { name: 'Chicken Rice', price: 5.5, category: 'Mains', variants: [], photo: [100, 50, 300, 250] },
    { name: 'Laksa', price: 6, category: 'Mains', variants: [], photo: null },
  ], count: 2, imageWidth: 2236, imageHeight: 1677 };
  const shrunk = [];
  globalThis.__shrink = async (blob, options) => { shrunk.push({ blob, options }); return { blob: new window.Blob(['small'], { type: 'image/webp' }), type: 'image/webp', ext: 'webp' }; };
  view = await open({ categories: [] });
  assert.equal(text(byTest(view.container, 'scan-item-photo')[0]), 'Menu', 'a picture cut from the menu says so');
  await click(button(view.container, /^Edit Chicken Rice$/));
  const editPhoto = () => byTest(view.container, 'scan-edit-photo')[0];
  assert.ok(editPhoto().querySelector('img'));
  // Where a photo comes from: one row of three (Alvin, 20 Nov 2026: option 2).
  const sources = byTest(view.container, 'scan-photo-sources')[0];
  assert.deepEqual([...sources.children].map((c) => [text(c), c.querySelector('input')?.getAttribute('aria-label') || c.getAttribute('aria-label')]), [
    ['Camera', 'Take a photo'], ['Gallery', 'Choose from phone'], ['Menu photo', 'Box it on the menu photo'],
  ]);
  assert.equal(text(byTest(view.container, 'scan-edit')[0]).includes('Tap the photo to adjust it.'), true, 'its own photo: tap it to adjust');
  // Remove: the × on the photo.
  const remove = byTest(view.container, 'scan-remove-photo')[0];
  assert.equal(remove.getAttribute('aria-label'), 'Remove photo');
  await click(remove);
  assert.equal(editPhoto().querySelector('img'), null);
  assert.equal(text(editPhoto()), 'No photo yet');
  assert.equal(byTest(view.container, 'scan-remove-photo').length, 0, 'no photo, no ×');
  assert.ok(button(view.container, /^Find sample photos$/), 'no samples yet: Find sample photos');
  // Box it on the menu photo: the photo editor on the whole menu, at the AI's box.
  await click(button(view.container, /^Box it on the menu photo$/));
  assert.ok([...document.body.querySelectorAll('h3')].some((h) => text(h) === 'Photo for Chicken Rice'));
  assert.match(text(document.body), /Move the box onto its picture, then tap Apply and Save\./);
  await click([...document.body.querySelectorAll('button')].find((b) => text(b) === 'Cancel'));
  assert.equal(byTest(view.container, 'scan-edit').length, 1, 'back in the item\'s editor');
  await click(button(view.container, /^Done$/));
  // Choose from phone, for Laksa: made item-photo size at once, and not marked as from the menu.
  await click(button(view.container, /^Edit Laksa$/));
  const chooser = byTest(view.container, 'scan-edit')[0].querySelector('input[type="file"][aria-label="Choose from phone"]');
  assert.ok(chooser, 'Choose from phone');
  assert.ok(byTest(view.container, 'scan-edit')[0].querySelector('input[type="file"][aria-label="Take a photo"][capture="environment"]'), 'Take a photo opens the camera');
  const chosen = new window.File(['big photo'], 'laksa.jpg', { type: 'image/jpeg' });
  await act(async () => {
    Object.defineProperty(chooser, 'files', { configurable: true, value: [chosen] });
    chooser.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
  assert.deepEqual(shrunk.map((s) => [s.blob, s.options.maxSide]), [[chosen, 1600]]);
  assert.ok(editPhoto().querySelector('img'), 'shown');
  assert.equal(text(editPhoto()), '', 'not marked as from the menu');
  // A chosen photo opens on its own; Box it on the menu photo opens the menu instead.
  await click(editPhoto());
  assert.doesNotMatch(text(document.body), /Tap Crop to box its picture on the menu/);
  await click([...document.body.querySelectorAll('button')].find((b) => text(b) === 'Cancel'));
  await click(button(view.container, /^Box it on the menu photo$/));
  assert.match(text(document.body), /Tap Crop to box its picture on the menu, or Replace to choose a photo\./);
  await click([...document.body.querySelectorAll('button')].find((b) => text(b) === 'Cancel'));
  await click(button(view.container, /^Done$/));
  await click(button(view.container, /^Add 2 products$/));
  assert.deepEqual(storage.uploads.map((u) => [u.pathName.replace(/\/\d+-/, '/T-'), u.blob.type]), [['shop-1/products/T-laksa-1.webp', 'image/webp']], 'only Laksa\'s photo (Chicken Rice\'s was removed), not shrunk twice');
  assert.equal(shrunk.length, 1);
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, p.image_url && p.image_url.replace(/\/\d+-/, '/T-')]), [['Chicken Rice', null], ['Laksa', 'https://files.invalid/shop-1/products/T-laksa-1.webp']]);
  await closeAll();
  delete globalThis.__shrink;
  passed('photos in an item\'s editor: marked when from the menu; Camera, Gallery and Menu photo in one row; the × removes it; Box it on the menu photo; Take a photo or Choose from phone, made item-photo size and uploaded');

  // ── 10. Sample photos (Pixabay), found one by one, credited, copied when saved ───────────
  reset();
  photo = { base64: 'cGhvdG8=', mediaType: 'image/jpeg', width: 2236, height: 1677, full: FULL };
  answer = { items: [
    { name: 'Chicken Rice', price: 5.5, category: 'Mains', variants: [], photo: [100, 50, 300, 250] },
    { name: 'Laksa', price: 6, category: 'Mains', variants: [] },
    { name: 'Teh Tarik', price: 2, category: 'Drinks', variants: [] },
  ], count: 3, imageWidth: 2236, imageHeight: 1677 };
  // Pixabay's photos, as findProductImage v24 sends them.
  const sample = (q, n) => ({
    id: `pixabay-${q.length}${n}`, previewUrl: `https://pixabay.com/get/${q}-${n}_640.jpg`, keepUrl: `https://pixabay.com/get/${q}-${n}_1280.jpg`, alt: q,
    credit: { source: 'pixabay', name: `Photographer ${n}`, profile: `https://pixabay.com/users/p${n}-${n}/`, photo: `https://pixabay.com/photos/${q}-${n}/` },
  });
  photosFor = (body) => ({ data: { photos: [1, 2, 3].map((n) => sample(body.query.split(' ')[0].toLowerCase(), n)) }, error: null });
  view = await open({ categories: [] });
  await settle(10);
  assert.deepEqual(invoked.filter((c) => !c.body.action).map((c) => [c.body.query, c.body.tenantId]), [['Laksa', 'shop-1'], ['Teh Tarik', 'shop-1']], 'one search each, in the menu\'s order; none for the item with its own picture on the menu');
  const tile = (name) => byTest(view.container, 'scan-item').find((r) => text(r.querySelector('[data-testid="scan-item-name"]')) === name).querySelector('[data-testid="scan-item-photo"]');
  assert.deepEqual([text(tile('Chicken Rice')), tile('Laksa').querySelector('img').getAttribute('src'), text(tile('Laksa'))], ['Menu', 'https://pixabay.com/get/laksa-1_640.jpg', 'Sample'], 'shown from Pixabay while choosing, marked Sample');
  const added = byTest(view.container, 'scan-photos-added')[0];
  assert.equal(text(added.firstChild), '2 sample photos added. Customers see each marked “Sample photo”, with the photographer’s credit.');
  assert.equal(text(added.querySelector('[data-testid="photos-from"]')), 'Photos from Pixabay', 'the results say where they\'re from');
  // Its editor: the photos found, the one shown, and its photographer credited.
  await click(tile('Laksa'));
  const samplesBox = () => byTest(view.container, 'scan-samples')[0];
  const credit = () => byTest(view.container, 'scan-edit')[0].querySelector('[data-testid="photo-credit"]');
  assert.deepEqual([...samplesBox().querySelectorAll('button[aria-label^="Use sample photo"]')].map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false'], 'tapping a sample opens the item (a sample is never cropped or copied)');
  assert.equal(byTest(view.container, 'scan-sample-row')[0].children.length, 3, 'the samples in one row');
  assert.equal(text(credit().previousElementSibling), 'Sample photo', 'beside the photo: "Sample photo"');
  assert.equal(text(credit()), 'Photo by Photographer 1 on Pixabay', 'and its photographer');
  assert.deepEqual([...credit().querySelectorAll('a')].map((a) => a.getAttribute('href')), ['https://pixabay.com/users/p1-1/', 'https://pixabay.com/']);
  assert.equal(text(samplesBox().querySelector('[data-testid="photos-from"]')), 'Photos from Pixabay');
  assert.ok(byTest(view.container, 'scan-remove-photo')[0], 'a sample can be removed with the × too');
  await click(samplesBox().querySelectorAll('button[aria-label^="Use sample photo"]')[1]);
  assert.equal(text(credit()), 'Photo by Photographer 2 on Pixabay');
  await click(button(view.container, /^Done$/));
  // Removed: stays removed.
  await click(button(view.container, /^Edit Teh Tarik$/));
  await click(button(view.container, /^Remove photo$/));
  await click(button(view.container, /^Done$/));
  assert.equal(tile('Teh Tarik').querySelector('img'), null);
  await click(button(view.container, /^Add 3 products$/));
  assert.deepEqual(storage.uploads.map((u) => u.pathName.replace(/\/\d+-/, '/T-')), ['shop-1/products/T-chicken-rice-0.webp'], 'the app uploads only the shop\'s own photo');
  assert.deepEqual(invoked.filter((c) => c.body.action === 'keep').map((c) => [c.body.tenantId, c.body.photos]), [['shop-1', [{ id: 'pixabay-52', url: 'https://pixabay.com/get/laksa-2_1280.jpg' }]]], 'the sample used is copied into the shop\'s photos (by the function), before the products are saved');
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, p.image_url && p.image_url.replace(/\/\d+-/, '/T-'), p.image_credits]), [
    ['Chicken Rice', 'https://files.invalid/shop-1/products/T-chicken-rice-0.webp', null],
    ['Laksa', copyOf(sample('laksa', 2)), { [copyOf(sample('laksa', 2))]: sample('laksa', 2).credit }],
    ['Teh Tarik', null, null],
  ], 'saved with the shop\'s copy and the photographer\'s credit, never Pixabay\'s address');
  await closeAll();
  // A sample that couldn't be copied (its address had expired): its item is saved without a
  // photo, and the merchant is told; a copying that couldn't be asked for at all saves nothing.
  reset();
  photosFor = (body) => ({ data: { photos: [1, 2, 3].map((n) => sample(body.query.split(' ')[0].toLowerCase(), n)) }, error: null });
  keepFor = (body) => ({ data: { kept: body.photos.filter((p) => !p.url.includes('teh')).map((p) => ({ from: p.url, url: copyOf(p) })) }, error: null });
  toasts.length = 0;
  view = await open({ categories: [] });
  await settle(10);
  await click(button(view.container, /^Add 3 products$/));
  await settle();
  assert.deepEqual(writes.find((w) => w.table === 'products').rows.map((p) => [p.name, Boolean(p.image_url), Boolean(p.image_credits)]), [['Chicken Rice', true, false], ['Laksa', true, true], ['Teh Tarik', false, false]], 'the item whose sample couldn\'t be copied has no photo');
  assert.ok(!writes.find((w) => w.table === 'products').rows.some((p) => /pixabay\.com/.test(String(p.image_url))), 'never Pixabay\'s address');
  assert.deepEqual(toasts.filter((t) => t.kind === 'warning').map((t) => t.message), ['A sample photo couldn’t be saved, so its item has no photo yet.']);
  await closeAll();
  reset();
  photosFor = (body) => ({ data: { photos: [sample(body.query.split(' ')[0].toLowerCase(), 1)] }, error: null });
  keepFor = () => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => ({ error: 'Pixabay API error: 503' }) } } });
  view = await open({ categories: [] });
  await settle(10);
  await click(button(view.container, /^Add 3 products$/));
  await settle();
  assert.equal(writes.filter((w) => w.table === 'products').length, 0, 'nothing saved');
  assert.match(text(view.container), /Couldn’t save the sample photos\. Please try again\./, 'said in plain words, to try again');
  assert.deepEqual(storage.removed.flat().map((p) => p.replace(/\/\d+-/, '/T-')), ['shop-1/products/T-chicken-rice-0.webp'], 'the photo uploaded for it is taken away again');
  await closeAll();
  // A search refused (too many this hour) says so; the rest stay without one.
  reset();
  photosFor = () => ({ data: null, error: { context: { status: 429, clone() { return this; }, json: async () => ({ error: 'Too many image searches this hour. Please try again later.' }) } } });
  view = await open({ categories: [] });
  await settle(10);
  assert.equal(text(byTest(view.container, 'scan-photos-failed')[0]), 'Sample photos stopped: Too many image searches this hour. Please try again later.');
  assert.equal(byTest(view.container, 'scan-photo-waiting').length, 0);
  assert.equal(invoked.filter((c) => !c.body.action).length, 1, 'no more searches after a refusal');
  await closeAll();
  // The menu reader's words for a dish (scanMenu v22 photo_search) go with its search as `hint`;
  // renamed, the new name goes alone (Alvin, 20 Nov 2026: hawker dishes, cafe dishes alike).
  reset();
  answer = { items: [
    { name: 'Carrot Cake', price: 4, category: 'Mains', variants: [], photoSearch: 'fried radish cake' },
    { name: 'Kopi', price: 1.8, category: 'Drinks', variants: [], photoSearch: '' },
  ], count: 2, imageWidth: 2236, imageHeight: 1677 };
  view = await open({ categories: [] });
  await settle(10);
  assert.deepEqual(invoked.filter((c) => !c.body.action).map((c) => c.body), [
    { query: 'Carrot Cake', page: 1, tenantId: 'shop-1', hint: 'fried radish cake' },
    { query: 'Kopi', page: 1, tenantId: 'shop-1' },
  ], 'the menu\'s words for the dish with its name; none when there are none');
  invoked.length = 0;
  await click(button(view.container, /^Edit Carrot Cake$/));
  await type(byTest(view.container, 'scan-edit')[0].querySelector('input:not([type="file"])'), 'Chai Tow Kway');
  await click(button(view.container, /^Find sample photos$/));
  await settle();
  assert.deepEqual(invoked.filter((c) => !c.body.action).map((c) => c.body), [{ query: 'Chai Tow Kway', page: 1, tenantId: 'shop-1' }], 'renamed: the new name alone');
  await closeAll();
  // A photo chosen while its sample is still being looked for: the sample doesn't replace it.
  reset();
  answer = { items: [{ name: 'Laksa', price: 6, category: 'Mains', variants: [] }], count: 1, imageWidth: 2236, imageHeight: 1677 };
  let release;
  photosFor = (body) => new Promise((resolve) => { release = () => resolve({ data: { photos: [sample('laksa', 1)] }, error: null }); });
  globalThis.__shrink = async () => ({ blob: new window.Blob(['small'], { type: 'image/webp' }), type: 'image/webp', ext: 'webp' });
  view = await open({ categories: [] });
  await click(button(view.container, /^Edit Laksa$/));
  const picker = byTest(view.container, 'scan-edit')[0].querySelector('input[type="file"][aria-label="Choose from phone"]');
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [new window.File(['mine'], 'mine.jpg', { type: 'image/jpeg' })] });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
  await act(async () => { release(); await next(); });
  await settle();
  assert.match(byTest(view.container, 'scan-edit-photo')[0].querySelector('img').getAttribute('src'), /^blob:/, 'the shop\'s own photo stays');
  assert.equal(byTest(view.container, 'scan-samples')[0].querySelectorAll('button[aria-pressed="true"]').length, 0, 'the sample is offered, not used');
  delete globalThis.__shrink;
  await closeAll();
  passed('sample photos: one search per item without its own picture, in the menu\'s order; shown from Pixabay while choosing ("Photos from Pixabay"), marked Sample; another chosen in its editor with its photographer credited; removed stays removed; copied into the shop\'s photos when saved, saved with the copy and its credit; one that couldn\'t be copied leaves its item without a photo, said; a copying that failed saves nothing; a refusal stops the rest');
} finally {
  await closeAll().catch(() => {});
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} scan review checks passed`);
