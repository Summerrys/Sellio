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

const plugins = [
  { name: 'client', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
    b.onResolve({ filter: /base44Client$/ }, () => ({ path: 'base44', namespace: 'mock' }));
    b.onLoad({ filter: /^client$/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => globalThis.__client;' }));
    b.onLoad({ filter: /^base44$/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const base44 = {};' }));
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
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('data:')) return { blob: async () => new window.Blob(['edited'], { type: 'image/jpeg' }) };
  requests.push({ url, body: JSON.parse(options.body) });
  const body = typeof answer === 'function' ? answer() : answer;
  return { ok: !body.status, text: async () => '   ' + JSON.stringify(body.json ?? body) };
};
const writes = [];
const storage = { uploads: [], removed: [], failUploads: false };
// What the save reads first (the shop's highest item number), and the answer it gets.
const reads = [];
let lastItem = { data: [], error: null };
globalThis.__client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'owner-token' } } }) },
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
const reset = () => { requests.length = 0; writes.length = 0; reads.length = 0; lastItem = { data: [], error: null }; cuts.length = 0; storage.uploads = []; storage.removed = []; storage.failUploads = false; revoked.length = 0; };

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
const priceInputs = (c) => byTest(c, 'scan-item-price').map((box) => box.querySelector('input'));

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
  assert.deepEqual(priceInputs(view.container).map((i) => [i.value, i.placeholder]), [['1.80', 'Add price'], ['', 'Add price'], ['', 'Add price']], 'a scanned price shows with its cents');
  assert.equal(text(byTest(view.container, 'scan-item-options')[0]), 'Hot or iced: Hot / Iced +0.40', 'each choice with its extra price, to check');
  await click(button(view.container, /^Add 3 Products$/));
  assert.match(text(view.container.querySelector('[role="alert"]')), /^Add a price for 2 selected items, or deselect them\.$/);
  assert.equal(writes.length, 0, 'nothing is saved while a selected item has no price');
  assert.equal(priceInputs(view.container)[1].getAttribute('aria-invalid'), 'true');
  // One gets a price, one is deselected.
  await type(priceInputs(view.container)[1], '2.20');
  await click(view.container.querySelectorAll('input[type="checkbox"]')[2]);
  assert.equal(byTest(view.container, 'scan-need-price').length, 0, 'no more items need a price');
  await click(button(view.container, /^Add 2 Products$/));
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
  await click(button(view.container, /^Add 1 Products$/));
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
  await click(button(view.container, /^Add 3 Products$/));
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
  await click(button(view.container, /^Add 3 Products$/));
  assert.equal(writes.filter((w) => w.table === 'products').length, 0, 'no products without their photos');
  assert.deepEqual(storage.removed, [storage.uploads[0].pathName], 'the photo uploaded before the failure is removed');
  assert.ok(view.container.querySelector('[role="alert"]'), 'the problem is shown');
  assert.match(text(view.container), /items found — review before saving/, 'still on the review, to try again');
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
  await click(button(view.container, /^Add 5 Products$/));
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
  await click(button(view.container, /^Add 4 Products$/));
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
  await click(button(view.container, /^Add 1 Products$/));
  assert.deepEqual([writes.length, storage.uploads.length], [0, 0], 'no section, item or photo');
  assert.ok(view.container.querySelector('[role="alert"]'), 'the problem is shown');
  assert.match(text(view.container), /items found — review before saving/, 'still on the review, to try again');
  await closeAll();
  passed('the menu\'s order: new sections go after the shop\'s own, and items are numbered in the order printed after the shop\'s highest');
} finally {
  await closeAll().catch(() => {});
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} scan review checks passed`);
