// Slow network (UX states, 5; Alvin, 9 Nov 2026): show real progress, and offer a lighter way.
// A shop's menu shows its words at once; when the photos on screen are slow (2.5 s), a card at
// the top counts them ("Loading photos 6 of 24") and offers the menu without photos, which
// stops the photos on their way, keeps the choice for the tab, and has a way back. Android's
// Data Saver starts the menu without photos. Design Store's preview always shows photos.
// (components/storefront/MenuPhotos.jsx, StorefrontView.jsx)
// Run: node verification/slow-network.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/shop/kopi-corner', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = win.ResizeObserver;
win.scrollTo = () => {};
win.HTMLElement.prototype.scrollIntoView = () => {};

// What the phone's screen shows: which photos have been on it (IntersectionObserver), which have
// arrived (img.complete), where the top of the menu and the card are (getBoundingClientRect).
const observers = new Set();
win.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; this.watched = new Set(); observers.add(this); }
  observe(el) { this.watched.add(el); }
  unobserve(el) { this.watched.delete(el); }
  disconnect() { this.watched.clear(); observers.delete(this); }
};
globalThis.IntersectionObserver = win.IntersectionObserver;
const onScreen = (match = () => true) => {
  for (const observer of observers) {
    const entries = [...observer.watched].filter(match).map((target) => ({ target, isIntersecting: true }));
    if (entries.length) observer.callback(entries);
  }
};
const arrived = new Set();
Object.defineProperty(win.HTMLImageElement.prototype, 'complete', {
  configurable: true,
  get() { const src = this.getAttribute('src'); return !src || arrived.has(src); },
});
const screen = { slotTop: 300, card: { top: 300, bottom: 420 } };
const realRect = win.Element.prototype.getBoundingClientRect;
win.Element.prototype.getBoundingClientRect = function rect() {
  if (this.dataset?.testid === 'photo-progress-slot') return { top: screen.slotTop, bottom: screen.slotTop, left: 0, right: 390, width: 390, height: 0 };
  if (this.firstElementChild?.dataset?.testid === 'photo-progress') return { ...screen.card, left: 0, right: 390, width: 390, height: screen.card.bottom - screen.card.top };
  return realRect.call(this);
};
// The shop's header is 76 px tall on a phone (jsdom has no layout, and drops its calc()).
const HEADER_HEIGHT = 76;
Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
  if (this.style.position === 'sticky' && this.style.zIndex === '50') return HEADER_HEIGHT;
  return parseFloat(this.style.height) || 0;
} });
let skew = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + skew;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;
const h = React.createElement;
const infos = [];
console.info = (...args) => { infos.push(args.join(' ')); };

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-slow-network-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as StorefrontView } from '@/components/storefront/StorefrontView';",
  "export * from '@/components/storefront/MenuPhotos';",
  "export { LanguageProvider } from '@/lib/LanguageContext';",
].join('\n'));
const stubs = {
  supabase: 'export const getSupabase = async () => ({ functions: { invoke: async () => ({ data: null, error: null }) } });',
  edges: 'export const extractBannerEdgeAssets = async () => null; export const isValidBannerEdgeColor = () => false;',
  ratingParts: 'export const RatingPill = () => null;',
  likes: 'export const useKnownLike = () => null;',
  native: 'export const mapLinkProps = () => ({}); export const placeWithCountry = (p) => p;',
  back: 'export const useBackToClose = () => {};',
};
const mock = { name: 'slow-network-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/bannerEdgeColors$/, 'edges');
  route(/ratings\/RatingParts$/, 'ratingParts');
  route(/lib\/likes$/, 'likes');
  route(/lib\/nativeApp$/, 'native');
  route(/lib\/useBackToClose$/, 'back');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.slow-network.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const later = async (ms) => { skew += ms; await wait(app.TICK_MS + 80); };
const text = (node) => {
  const parts = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push(c.nodeValue); else { parts.push(' '); walk(c); parts.push(' '); } } };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const click = (node) => act(async () => { assert.ok(node, 'the button is there'); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });

const PRIMARY = '#c2410c';
const tenant = { id: 'tenant-1', name: 'Kopi Corner', currency: 'SGD' };
const split = { banner_bg_color: PRIMARY, banner_bg_image_url: 'https://img.test/banner.jpg', product_layout: 'split', show_promo_ticker: false };
const grid = { ...split, product_layout: 'grid' };
const products = [
  { id: 'p1', name: 'Kaya toast set', description: 'Toast, 2 soft-boiled eggs, kopi', price: 4.5, image_url: 'https://img.test/kaya.jpg', category_id: 'c1', is_featured: true },
  { id: 'p2', name: 'Kopi C', price: 1.8, image_url: 'https://img.test/kopi.jpg', category_id: 'c2' },
  { id: 'p3', name: 'Mee siam', price: 5.2, image_url: 'https://img.test/mee.jpg', category_id: 'c1' },
  { id: 'p4', name: 'Teh tarik', price: 1.9, image_url: null, category_id: 'c2', track_inventory: true, stock_quantity: 0 },
];
const categories = [{ id: 'c1', name: 'Breakfast' }, { id: 'c2', name: 'Drinks' }];

const mounted = [];
const mount = async (props = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(h(app.LanguageProvider, null, h(app.StorefrontView, { tenant, storefrontConfig: split, products, categories, isDesktop: false, isLandscape: false, ...props })));
  });
  await wait(20);
  const view = {
    container,
    photos: () => [...container.querySelectorAll('img[data-menu-photo]')],
    banner: () => container.querySelector('img[data-banner-photo]'),
    card: () => container.querySelector('[data-testid="photo-progress"]'),
    count: () => text(container.querySelector('[data-testid="photo-progress-count"]')),
    bar: () => container.querySelector('[role="progressbar"]'),
    note: () => container.querySelector('[data-testid="photos-off-note"]'),
    close: async () => { await act(async () => root.unmount()); container.remove(); },
  };
  mounted.push(view);
  return view;
};
const fresh = () => {
  for (const key of [app.PHOTOS_KEY, 'sellio_storefront_lang']) { sessionStorage.removeItem(key); localStorage.removeItem(key); }
  delete win.navigator.connection;
  arrived.clear();
  screen.slotTop = 300;
  screen.card = { top: 300, bottom: 420 };
  infos.length = 0;
};
const closeAll = async () => { while (mounted.length) await mounted.pop().close(); };

try {
  // ── 1. The menu's words show at once; photos load as before; no card while they're quick
  fresh();
  let view = await mount();
  assert.equal(view.photos().length, 4, 'Kaya toast (Today’s picks and Breakfast), Kopi C and Mee siam');
  assert.ok(view.photos().every((img) => img.getAttribute('loading') === 'lazy' && img.classList.contains('sellio-photo')));
  assert.ok(view.photos().every((img) => img.parentElement.classList.contains('sellio-photo-slot')), 'each photo sits in a slot that is grey until it arrives');
  const css = await readFile('src/index.css', 'utf8');
  assert.match(css, /\.sellio-photo-slot:has\(> img\.sellio-photo:not\(\[data-loaded\]\)\) \{ background-color: #f1f5f9; \}/);
  assert.equal(view.banner()?.getAttribute('src'), 'https://img.test/banner.jpg');
  assert.match(text(view.container), /Kaya toast set.*Kopi C/);
  onScreen();
  await later(2000);
  assert.ok(!view.card(), 'under 2.5 s: no card');
  arrived.add('https://img.test/kaya.jpg'); arrived.add('https://img.test/kopi.jpg'); arrived.add('https://img.test/mee.jpg');
  await later(3000);
  assert.ok(!view.card(), 'photos that arrived in time: no card at all');
  await closeAll();
  passed('Photos that arrive within 2.5 s: the menu looks as before (a grey square until each arrives), no card');

  // ── 2. Slow photos on screen: the card counts them, and the bar fills as they arrive
  fresh();
  view = await mount();
  await later(5000);
  assert.ok(!view.card(), 'photos not yet on screen (still below) are not counted, so no card');
  onScreen((img) => img.getAttribute('src') !== 'https://img.test/mee.jpg');
  await later(1000);
  assert.ok(!view.card());
  await later(1600);
  assert.ok(view.card(), 'a photo on screen still loading after 2.5 s: the card');
  assert.match(text(view.card()), /^Loading photos 0 of 3 Show menu without photos$/);
  assert.equal(view.bar().getAttribute('aria-valuenow'), '0');
  assert.equal(view.bar().getAttribute('aria-valuemax'), '3');
  assert.equal(view.bar().getAttribute('aria-label'), 'Loading photos');
  assert.equal(view.card().querySelector('[data-testid="photo-progress-bar"]').style.width, '0%');
  arrived.add('https://img.test/kaya.jpg');
  await later(100);
  assert.equal(view.count(), '2 of 3');
  assert.equal(view.bar().getAttribute('aria-valuenow'), '2');
  assert.equal(view.card().querySelector('[data-testid="photo-progress-bar"]').style.width, '67%');
  assert.equal(view.card().querySelector('[data-testid="photo-progress-bar"]').style.background, 'rgb(194, 65, 12)', 'the shop’s colour');
  onScreen();
  await later(100);
  assert.equal(view.count(), '2 of 4', 'scrolled to Mee siam: it counts too');
  assert.equal(view.card().style.pointerEvents, 'auto', 'tappable even while the shop is closed');
  passed('Slow photos on screen: "Loading photos 2 of 4" with a bar in the shop’s colour; only photos that have been on screen count');

  // ── 3. Everything arrived: the full bar shows, then the card folds away, never off screen
  screen.card = { top: -200, bottom: -80 };
  arrived.add('https://img.test/kopi.jpg'); arrived.add('https://img.test/mee.jpg');
  await later(100);
  assert.equal(view.count(), '4 of 4');
  await later(3000);
  assert.equal(view.card()?.dataset.phase, 'shown', 'scrolled past the card: it stays, so the menu doesn’t move under the customer');
  screen.card = { top: 300, bottom: 420 };
  await later(100);
  assert.equal(view.card()?.dataset.phase, 'shown', 'just back in view: the full bar shows first');
  skew += 800;
  const phases = new Set();
  for (let i = 0; i < 40 && view.card(); i++) { phases.add(view.card().dataset.phase); await wait(25); }
  assert.ok(phases.has('folding'), 'it folds (rather than vanishing)');
  assert.ok(!view.card(), 'folded away');
  assert.ok(view.container.querySelector('[data-testid="photo-progress-slot"]'));
  await closeAll();
  passed('All photos in: the full bar shows, then the card folds away, and only while it’s in view');

  // ── 4. The card only appears at the top of the menu, where the customer is looking
  fresh();
  screen.slotTop = 40;
  view = await mount();
  onScreen();
  await later(3000);
  assert.ok(!view.card(), 'top of the menu under the shop’s header (scrolled down): no card');
  screen.slotTop = 900;
  await later(500);
  assert.ok(!view.card(), 'top of the menu below the screen: no card');
  screen.slotTop = 300;
  await later(500);
  assert.ok(view.card(), 'back at the top: the card');
  await closeAll();
  passed('The card appears only where the customer can see it, at the top of the menu');

  // ── 5. Show menu without photos: photos stop loading, the menu becomes words, the choice lasts
  fresh();
  view = await mount();
  onScreen();
  arrived.add('https://img.test/kaya.jpg');
  await later(3000);
  const before = view.photos();
  const banner = view.banner();
  const loading = before.filter((img) => img.getAttribute('src') !== 'https://img.test/kaya.jpg');
  assert.equal(loading.length, 2);
  await click(view.container.querySelector('[data-testid="photos-off-button"]'));
  assert.ok(loading.every((img) => !img.hasAttribute('src')), 'photos still on their way are stopped');
  assert.ok(!banner.hasAttribute('src'), 'the banner photo too');
  assert.ok(before.filter((img) => !loading.includes(img)).every((img) => img.getAttribute('src') === 'https://img.test/kaya.jpg'), 'photos already here are left alone');
  assert.equal(view.photos().length, 0, 'no photos on the menu');
  assert.equal(view.container.querySelectorAll('.sellio-photo-slot').length, 0, 'and no empty spaces where they were');
  assert.ok(!view.banner(), 'no banner photo: the banner is the shop’s colour');
  assert.equal(view.container.querySelector('[data-storefront-banner]').style.background, 'rgb(194, 65, 12)');
  assert.ok(!view.card());
  assert.ok(view.note());
  assert.equal(text(view.note()), 'Showing the menu without photos. Show photos');
  assert.equal(view.note().style.pointerEvents, 'auto');
  assert.equal(sessionStorage.getItem(app.PHOTOS_KEY), 'off');
  assert.ok(infos.includes('Sellio menu: photos off'));
  const menuText = text(view.container);
  assert.match(menuText, /★ Featured Kaya toast set/, 'Today’s picks keeps its Featured mark, before the name');
  assert.doesNotMatch(menuText, /🛍️/, 'no empty photo squares');
  assert.match(menuText, /Teh tarik.*Sold out/);
  passed('"Show menu without photos": photos on their way stop, the menu is words only, the banner its colour');

  // ── 6. Show photos: back as before, and the tab remembers either way
  await click(view.container.querySelector('[data-testid="photos-on-button"]'));
  assert.equal(view.photos().length, 4);
  assert.equal(view.banner()?.getAttribute('src'), 'https://img.test/banner.jpg');
  assert.ok(!view.note());
  assert.equal(sessionStorage.getItem(app.PHOTOS_KEY), 'on');
  assert.ok(infos.includes('Sellio menu: photos on'));
  await closeAll();
  sessionStorage.setItem(app.PHOTOS_KEY, 'off');
  view = await mount();
  assert.ok(view.note(), 'another shop in the same tab: still without photos');
  assert.equal(view.photos().length, 0);
  await closeAll();
  passed('"Show photos" brings them back; the choice lasts for the tab');

  // ── 7. Grid menus, and Data Saver
  fresh();
  view = await mount({ storefrontConfig: grid });
  assert.equal(view.photos().length, 4, 'grid: Kaya toast in Today’s picks and the list, Kopi C, Mee siam');
  assert.match(text(view.container), /Sold out/, 'sold out shows on the photo square');
  await closeAll();
  Object.defineProperty(win.navigator, 'connection', { value: { saveData: true }, configurable: true });
  view = await mount({ storefrontConfig: grid });
  assert.equal(view.photos().length, 0, 'Data Saver on: the menu starts without photos');
  assert.equal(view.container.querySelectorAll('.sellio-photo-slot').length, 0);
  assert.ok(view.note());
  const gridText = text(view.container);
  assert.match(gridText, /Teh tarik S\$1\.90 Sold out/, 'grid without photos: Sold out where the + would be');
  assert.doesNotMatch(gridText, /🛍️/);
  await closeAll();
  view = await mount({ storefrontConfig: { ...split, product_layout: 'list' } });
  assert.equal(view.photos().length, 0, 'list menus too, Today’s picks included');
  assert.equal(view.container.querySelectorAll('.sellio-photo-slot').length, 0, 'and no empty spaces where photos were');
  assert.match(text(view.container), /Kaya toast set Toast, 2 soft-boiled eggs, kopi S\$4\.50/);
  await closeAll();
  sessionStorage.setItem(app.PHOTOS_KEY, 'on');
  view = await mount({ storefrontConfig: grid });
  assert.equal(view.photos().length, 4, 'chose photos in this tab: Data Saver doesn’t override that');
  await closeAll();
  view = await mount({ storefrontConfig: { ...split, product_layout: 'list' } });
  assert.equal(view.photos().length, 4, 'list: Kaya toast in Today’s picks and the list, Kopi C, Mee siam');
  await closeAll();
  passed('Grid and list menus work without photos too; Data Saver starts without photos unless the customer chose them');

  // ── 8. Design Store's preview, and menus with no photos
  fresh();
  sessionStorage.setItem(app.PHOTOS_KEY, 'off');
  view = await mount({ previewMode: true });
  assert.equal(view.photos().length, 4, 'the preview always shows the photos');
  assert.ok(!view.note());
  assert.ok(!view.container.querySelector('[data-testid="photo-progress-slot"]'));
  await closeAll();
  view = await mount({ storefrontConfig: { ...split, banner_bg_image_url: null }, products: products.map((p) => ({ ...p, image_url: null })) });
  assert.ok(!view.note(), 'a menu without photos anyway: nothing to say');
  await closeAll();
  passed('Design Store’s preview always shows photos; a menu with no photos says nothing');

  // ── 9. In Chinese and Malay
  fresh();
  localStorage.setItem('sellio_storefront_lang', 'zh');
  view = await mount();
  onScreen();
  await later(3000);
  assert.match(text(view.card()), /^正在加载图片 0\/4 显示无图菜单$/);
  await click(view.container.querySelector('[data-testid="photos-off-button"]'));
  assert.equal(text(view.note()), '正在显示无图菜单。 显示图片');
  await closeAll();
  fresh();
  localStorage.setItem('sellio_storefront_lang', 'ms');
  view = await mount();
  onScreen();
  await later(3000);
  assert.match(text(view.card()), /^Memuatkan foto 0 daripada 4 Tunjuk menu tanpa foto$/);
  await closeAll();
  passed('The card and the note in Chinese and Malay');

  // ── 10. Where the browser can't tell what's on screen, or storage is blocked
  fresh();
  const io = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = undefined;
  assert.equal(app.createPhotoTracker(), null, 'no IntersectionObserver: no count (and so no card), photos as before');
  globalThis.IntersectionObserver = io;
  const store = win.sessionStorage.getItem;
  win.sessionStorage.getItem = () => { throw new Error('blocked'); };
  assert.equal(app.initialPhotosOff(), false);
  Object.defineProperty(win.navigator, 'connection', { value: { saveData: true }, configurable: true });
  assert.equal(app.initialPhotosOff(), true, 'storage blocked: Data Saver decides');
  win.sessionStorage.getItem = store;
  passed('No IntersectionObserver: no card; storage blocked: Data Saver decides');

  console.log(`\n${passes} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeAll().catch(() => {});
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
process.exit(process.exitCode || 0);
