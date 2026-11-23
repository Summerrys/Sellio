// The edge-written pages and the app together, in real Chrome (npm run build first): the built
// website served as https://sellio.sg through public/_worker.js itself (Pages' files from dist/,
// Supabase a stand-in), so each storefront, item and Explore page arrives with the head and
// content the worker writes, and the app then takes over:
// 1. A storefront: the app draws the shop (its name the page's H1); the head the worker wrote
//    stays as it is (title, description, canonical, robots), with one block of structured data,
//    not the app's second one; the written content block is gone from the page.
// 2. Moving on in the app (storefront → Explore): the written head goes; Explore sets its own.
// 3. Explore opened first, then a storefront in the app: the storefront sets its own head.
// 4. An item's page: the written head stays while it's shown.
// 5. The start page and the Privacy Policy: their structured data once each, after the app
//    has taken over from the prerender.
// Run: node verification/edge-pages.browser.mjs /tmp/sellio-verification
// (needs playwright there, or playwright-core and a Chrome: CHROME_PATH, default /usr/bin/google-chrome)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
let chromium;
let executablePath;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require('playwright-core'));
  executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
}
const { default: worker } = await import(pathToFileURL(path.join(app, 'public/_worker.js')).href);

// ── The stand-in database (the worker's reads and the app's) ──
const SHOP = { id: 'shop-1', name: 'Beijing Dumplings', slug: 'beijing-dumplings', logo_url: null, industry: 'f&b', currency: 'SGD', country: 'Singapore', phone: null, address: '', payment_qr_url: null, payment_qr_label: null, payment_reference: null, settings: { show_rating_on_store: true }, is_available: true, chat_enabled: false };
const PRODUCTS = [
  { id: 'p-1', tenant_id: 'shop-1', name: 'Pork Dumplings', description: 'Ten handmade dumplings.', price: 8, compare_at_price: null, image_url: 'https://cdn.example.com/p1.jpg', images: [], image_credits: {}, category_id: 'c-1', is_featured: false, is_active: true, stock_quantity: 5, track_inventory: false, low_stock_threshold: null, variants: [], tags: [], created_date: '2026-11-01T00:00:00Z', sort_order: 1 },
  { id: 'p-2', tenant_id: 'shop-1', name: 'Chive Dumplings', description: '', price: 7.5, compare_at_price: null, image_url: 'https://cdn.example.com/p2.jpg', images: [], image_credits: {}, category_id: 'c-1', is_featured: false, is_active: true, stock_quantity: 5, track_inventory: false, low_stock_threshold: null, variants: [], tags: [], created_date: '2026-11-02T00:00:00Z', sort_order: 2 },
];
const CATEGORIES = [{ id: 'c-1', tenant_id: 'shop-1', name: 'Dumplings', slug: 'dumplings', description: '', sort_order: 1 }];
const SHOPS = [{ shop_id: 'shop-1', shop_name: 'Beijing Dumplings', shop_slug: 'beijing-dumplings', shop_logo_url: null, shop_type: 'individual', item_count: 2 }];
const FEED = PRODUCTS.map((p) => ({ product_id: p.id, product_name: p.name, price: p.price, compare_at_price: null, image_url: p.image_url, listed_at: p.created_date, shop_id: 'shop-1', shop_name: SHOP.name, shop_slug: SHOP.slug, shop_logo_url: null, shop_type: 'individual', currency: 'SGD' }));
const ITEM = {
  visible: true,
  product: { id: 'p-1', name: 'Pork Dumplings', description: 'Ten handmade dumplings.', price: 8, compare_at_price: null, images: ['https://cdn.example.com/p1.jpg'], image_credits: {}, sold_out: false, variants: [], likes: 0, listed_at: '2026-11-01T00:00:00Z' },
  shop: { id: 'shop-1', name: SHOP.name, slug: SHOP.slug, logo_url: null, type: 'individual', industry: 'f&b', currency: 'SGD', since: '2026-10-01T00:00:00Z', item_count: 2 },
  selling: null,
  more: [{ id: 'p-2', name: 'Chive Dumplings', price: 7.5, compare_at_price: null, image_url: 'https://cdn.example.com/p2.jpg' }],
  viewer: null,
};
function database(pathname, body) {
  const rpc = pathname.startsWith('/rest/v1/rpc/') ? pathname.slice('/rest/v1/rpc/'.length) : null;
  const args = body ? JSON.parse(body) : {};
  if (rpc === 'get_storefront_tenant') return [args.p_slug === SHOP.slug ? SHOP : null].filter(Boolean);
  if (rpc === 'explore_shops') return SHOPS;
  if (rpc === 'explore_feed') return FEED;
  if (rpc === 'explore_item') return args.p_product_id === 'p-1' ? ITEM : null;
  if (rpc === 'shop_rating_summary' || rpc === 'rating_summaries') return [];
  if (rpc) return null;
  const table = pathname.slice('/rest/v1/'.length);
  if (table === 'products') return PRODUCTS;
  if (table === 'categories') return CATEGORIES;
  return [];
}
const SUPABASE = 'https://gzktuteedbtnaxfdylyu.supabase.co';
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== SUPABASE) throw new TypeError(`no network in this test: ${url.href}`);
  return new Response(JSON.stringify(database(url.pathname, init.body)), { headers: { 'Content-Type': 'application/json' } });
};

// ── Pages: its files from dist/, its pages through the worker ──
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', txt: 'text/plain; charset=utf-8', xml: 'application/xml', woff2: 'font/woff2' };
async function distFile(pathname) {
  const file = { '/': 'index.html', '/store': 'store.html', '/explore': 'explore.html', '/app': 'app.html', '/privacy/': 'privacy/index.html', '/terms/': 'terms/index.html' }[pathname] || decodeURIComponent(pathname.slice(1));
  try {
    return new Response(await readFile(path.join(app, 'dist', file)), { headers: { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
const env = { ASSETS: { fetch: async (request) => distFile(new URL(request.url).pathname) } };
const ctx = { waitUntil: () => {} };
const routes = JSON.parse(await readFile(path.join(app, 'dist/_routes.json'), 'utf8'));
const leftToPages = (pathname) => routes.exclude.some((rule) => (rule.endsWith('/*') ? pathname.startsWith(rule.slice(0, -1)) : pathname === rule));

const browser = await chromium.launch({ executablePath, headless: true });
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/rest/v1/')) {
      const data = database(url.pathname, request.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (url.hostname !== 'sellio.sg') return route.abort();
    const answer = leftToPages(url.pathname)
      ? await distFile(url.pathname)
      : await worker.fetch(new Request(url.href, { method: request.method(), headers: request.headers() }), env, ctx);
    const headers = Object.fromEntries(answer.headers);
    return route.fulfill({ status: answer.status, headers, body: Buffer.from(await answer.arrayBuffer()) });
  });
  return context.newPage();
}

// What the page's head says now.
const headNow = (page) => page.evaluate(() => {
  const all = (selector) => [...document.querySelectorAll(selector)];
  return {
    title: document.title,
    canonical: all('link[rel="canonical"]').map((n) => n.getAttribute('href')),
    description: all('meta[name="description"]').map((n) => n.getAttribute('content')),
    robots: all('meta[name="robots"]').map((n) => n.getAttribute('content')),
    edge: all('head [data-sellio-edge]').length,
    structured: all('script[type="application/ld+json"]').map((n) => JSON.parse(n.textContent)).flatMap((d) => (d['@graph'] || [d]).map((x) => x['@type'])),
    prerender: !!document.getElementById('sellio-prerender'),
  };
});
// Moves to another page the way the app does (React Router follows the history).
const moveTo = (page, to) => page.evaluate((address) => { window.history.pushState({}, '', address); window.dispatchEvent(new PopStateEvent('popstate')); }, to);

try {
  // 1. A storefront.
  let page = await newPage();
  await page.goto('https://sellio.sg/store/beijing-dumplings');
  const written = await headNow(page);
  await page.locator('#root h1', { hasText: 'Beijing Dumplings' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  let now = await headNow(page);
  assert.equal(now.title, 'Beijing Dumplings – Order online in Singapore | Sellio');
  assert.equal(now.title, written.title);
  assert.deepEqual(now.canonical, ['https://sellio.sg/store/beijing-dumplings']);
  assert.deepEqual(now.description, written.description);
  assert.equal(now.description.length, 1);
  assert.match(now.robots[0], /^index, follow/);
  assert.equal(now.robots.length, 1);
  assert.deepEqual(now.structured, ['CollectionPage', 'OnlineStore', 'ItemList', 'BreadcrumbList', 'WebSite', 'Organization'], 'The written structured data, once; not the app\'s too');
  assert.equal(now.prerender, false, 'The written content is gone once the app runs');
  assert.ok(now.edge > 10);
  passed('storefront: the app draws the shop (H1); the written head stays as it is, structured data once');

  // 2. Moving on in the app: the written head goes, Explore sets its own.
  await moveTo(page, '/explore');
  await page.locator('#root h1', { hasText: 'Explore shops and items on Sellio' }).waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(300);
  now = await headNow(page);
  assert.equal(now.edge, 0, 'No written tags left');
  assert.equal(now.title, 'Explore shops and items · Sellio');
  assert.deepEqual(now.canonical, ['https://sellio.sg/explore']);
  assert.equal(now.robots.length, 1);
  assert.match(now.robots[0], /^index, follow/);
  assert.deepEqual(now.structured, [], 'No storefront structured data on Explore');
  passed('moving on in the app: the written head goes and Explore sets its own');
  await page.context().close();

  // 3. Explore first: its written head stays; then a storefront sets its own.
  page = await newPage();
  await page.goto('https://sellio.sg/explore');
  await page.locator('#root h1', { hasText: 'Explore shops and items on Sellio' }).waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(300);
  now = await headNow(page);
  assert.deepEqual(now.structured, ['CollectionPage', 'ItemList', 'ItemList', 'BreadcrumbList', 'WebSite', 'Organization']);
  assert.match(now.description[0], /^Browse shops and home sellers on Sellio and order from them directly, no account needed, including Beijing Dumplings\.$/);
  await moveTo(page, '/store/beijing-dumplings');
  await page.locator('#root h1', { hasText: 'Beijing Dumplings' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  now = await headNow(page);
  assert.equal(now.edge, 0);
  assert.equal(now.title, 'Beijing Dumplings | Sellio Storefront', 'The app\'s own title for a storefront');
  assert.deepEqual(now.canonical, ['https://sellio.sg/store/beijing-dumplings']);
  assert.deepEqual(now.structured, ['WebPage'], 'The app\'s own structured data, once');
  passed('Explore first: its written head stays; a storefront opened in the app then sets its own');
  await page.context().close();

  // 4. An item's page.
  page = await newPage();
  await page.goto('https://sellio.sg/listing/p-1');
  await page.locator('#root h1', { hasText: 'Pork Dumplings' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  now = await headNow(page);
  assert.equal(now.title, 'Pork Dumplings – Beijing Dumplings | Sellio');
  assert.deepEqual(now.canonical, ['https://sellio.sg/listing/p-1']);
  assert.deepEqual(now.structured, ['ItemPage', 'Product', 'BreadcrumbList', 'WebSite', 'Organization']);
  assert.equal(now.prerender, false);
  passed('item page: the written head and Product data stay while it is shown');
  await page.context().close();

  // 5. The start page and the Privacy Policy: structured data once each, after the app took over.
  page = await newPage();
  await page.goto('https://sellio.sg/');
  await page.waitForFunction(() => !document.getElementById('sellio-prerender') && document.querySelector('#root .sellio-landing'), null, { timeout: 30000 });
  now = await headNow(page);
  assert.deepEqual(now.structured, ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']);
  assert.deepEqual(now.canonical, ['https://sellio.sg/']);
  await page.goto('https://sellio.sg/privacy');
  await page.waitForFunction(() => !document.getElementById('sellio-prerender') && document.querySelector('#root .sellio-legal-page'), null, { timeout: 30000 });
  now = await headNow(page);
  assert.deepEqual(now.structured, ['WebPage']);
  assert.deepEqual(now.canonical, ['https://sellio.sg/privacy']);
  passed('start page and Privacy Policy: their structured data once each, in the page the app draws');
  await page.context().close();
} finally {
  await browser.close();
}
console.log(`${passes} passed`);
