// The pages public/_worker.js writes at the edge (node verification/edge-pages.test.mjs): a shop's
// storefront (/store/<slug>), an item (/listing/<id>) and Explore (/explore), each with its own
// head (title, description, canonical, robots, Open Graph, schema.org structured data) and its
// content (heading, items, prices, links) for crawlers that run no scripts; plus /llms.txt with
// the shops added, and /api/country (the visitor's country, for Explore's location pin). No
// network: Supabase, Cloudflare's cache and Pages' files are stand-ins.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { default: worker } = await import(pathToFileURL(path.resolve('public/_worker.js')).href);
const passed = (name) => console.log(`PASS ${name}`);

// ── Stand-ins ──
const kept = new Map();
globalThis.caches = {
  default: {
    match: async (request) => kept.get(new URL(request.url).href)?.clone(),
    put: async (request, response) => { kept.set(new URL(request.url).href, response); },
  },
};
// The shells as scripts/prerender-routes.mjs writes them.
const shell = (title) => `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<!-- SELLIO_EDGE_HEAD -->
<title>${title}</title>
<!-- /SELLIO_EDGE_HEAD -->
</head><body><div id="sellio-launch-splash"></div><div id="root"></div><script type="module" src="/assets/index-x.js"></script></body></html>`;
const FILES = {
  '/store': shell('Sellio Storefront'),
  '/explore': shell('Explore shops and items · Sellio'),
  '/app': '<!doctype html><html><head><title>Sellio</title><meta name="robots" content="noindex, nofollow" /></head><body><div id="root"></div></body></html>',
  '/llms.txt': '# Sellio\n\n> About Sellio.\n',
};
const assetCalls = [];
const env = {
  ASSETS: {
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      assetCalls.push([request.method, pathname, request.headers.get('If-None-Match')]);
      const body = FILES[pathname];
      if (body == null) return new Response('missing', { status: 404 });
      if (request.headers.get('If-None-Match') === '"shell"') return new Response(null, { status: 304, headers: { ETag: '"shell"' } });
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'Content-Type': pathname.endsWith('.txt') ? 'text/plain' : 'text/html', ETag: '"shell"', 'X-Content-Type-Options': 'nosniff' },
      });
    },
  },
};
let waits = [];
let pendingAtAnswer = 0; // promises handed to waitUntil by the time the page was answered
const ctx = { waitUntil: (promise) => waits.push(promise) };
const settle = async () => { await Promise.all(waits); waits = []; };

// Supabase's REST API, answering from these rows.
const SHOP_ID = 'shop-1';
const OLD_LINKS = { 'old-dumplings': 'beijing-dumplings' }; // a renamed shop's old link → its link now
const shopRow = {
  id: SHOP_ID, name: 'Beijing Dumplings', slug: 'beijing-dumplings', logo_url: 'https://cdn.example.com/logo.png', industry: 'f&b',
  currency: 'SGD', country: 'Singapore', phone: '91234567', address: '1 Tampines Ave', payment_qr_url: 'https://cdn.example.com/paynow-secret.png',
  payment_qr_label: 'PayNow', payment_reference: 'UEN-SECRET', settings: { branch_name: 'Tampines', show_rating_on_store: true, tax_rate: 9 },
  is_available: true, chat_enabled: false,
};
const products = [
  { id: 'p-1', name: 'Pork Dumplings', description: 'Ten handmade dumplings.\n\nSteamed to order.', price: 8, compare_at_price: 10, image_url: 'https://cdn.example.com/p1.jpg', category_id: 'c-1', stock_quantity: 5, track_inventory: true },
  { id: 'p-2', name: 'Chive Dumplings', description: '', price: 7.5, compare_at_price: null, image_url: 'https://cdn.example.com/p2.jpg', category_id: 'c-1', stock_quantity: 0, track_inventory: true },
  { id: 'p-3', name: 'Soup of the day $1 off', description: 'No photo yet', price: 4, compare_at_price: null, image_url: '', category_id: 'c-2', stock_quantity: 0, track_inventory: false },
  { id: 'p-4', name: '<script>alert(1)</script> Bun', description: 'Ends </script><b>here', price: 2, compare_at_price: null, image_url: 'javascript:alert(1)', category_id: null, stock_quantity: 0, track_inventory: false },
];
const categories = [{ id: 'c-1', name: 'Dumplings', description: 'Made fresh daily' }, { id: 'c-2', name: 'Soups', description: '' }, { id: 'c-9', name: 'Empty', description: '' }];
const hours = [
  { day_of_week: 'monday', open_time: '13:00', close_time: '00:00', is_closed: false },
  { day_of_week: 'tuesday', open_time: '09:00', close_time: '09:00', is_closed: false },
  { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
];
const shopsRows = [
  { shop_id: SHOP_ID, shop_name: 'Beijing Dumplings', shop_slug: 'beijing-dumplings', shop_logo_url: null, shop_type: 'individual', item_count: 4 },
  { shop_id: 'shop-2', shop_name: 'Cafelicious', shop_slug: 'cafelicious', shop_logo_url: null, shop_type: 'merchant', item_count: 22 },
  { shop_id: 'shop-3', shop_name: 'Xie Lao Ma 蟹老妈', shop_slug: 'xie-lao-ma', shop_logo_url: null, shop_type: 'individual', item_count: 1 },
];
const selling = {
  collection: { enabled: true, area: 'Tampines', notes: 'Call me at 91234567' },
  delivery: { enabled: true, fee_mode: 'extra', fee: 3, free_above: 30, areas: 'East', notes: 'secret note' },
  preorder: { enabled: true, min_days: 2, earliest: '2026-11-25', latest: '2027-01-22' },
  today: '2026-11-23',
};
const item = {
  visible: true,
  product: {
    id: 'p-1', name: 'Pork Dumplings', description: 'Ten handmade dumplings.\nSteamed to order.', price: 8, compare_at_price: 10,
    images: ['https://cdn.example.com/p1.jpg', 'https://cdn.example.com/p1b.jpg', 'http://insecure.example.com/x.jpg'], sold_out: false,
    variants: [{ name: 'Add-ons', type: 'addon', options: [{ label: 'Egg', price_modifier: 2 }, { label: 'Chilli oil', price_modifier: 0 }] }, { name: '', type: 'size', options: [] }],
    likes: 3, listed_at: '2026-11-02T00:00:00Z',
  },
  shop: { id: SHOP_ID, name: 'Beijing Dumplings', slug: 'beijing-dumplings', logo_url: 'https://cdn.example.com/logo.png', type: 'individual', industry: 'f&b', currency: 'SGD', since: '2026-10-01', item_count: 4 },
  selling,
  more: [{ id: 'p-2', name: 'Chive Dumplings', price: 7.5, compare_at_price: null, image_url: 'https://cdn.example.com/p2.jpg' }],
  viewer: null,
};
const feed = [
  { product_id: 'p-1', product_name: 'Pork Dumplings', price: 8, compare_at_price: 10, image_url: 'x', listed_at: null, shop_id: SHOP_ID, shop_name: 'Beijing Dumplings', shop_slug: 'beijing-dumplings', shop_logo_url: null, shop_type: 'individual', currency: 'SGD' },
  { product_id: 'id-9', product_name: 'Nasi Lemak', price: 38000, compare_at_price: null, image_url: 'x', listed_at: null, shop_id: 'shop-4', shop_name: 'Warung', shop_slug: 'warung', shop_logo_url: null, shop_type: 'individual', currency: 'IDR' },
];

let db = {};
const resetDb = () => {
  db = {
    tenant: [shopRow], products, categories, hours, configs: [{ banner_headline: 'Fresh daily', banner_tagline: 'Handmade in Tampines', banner_bg_image_url: 'https://cdn.example.com/banner.jpg' }],
    rating: [{ tenant_id: SHOP_ID, rating: 4.75, rating_count: 12 }], selling, shops: shopsRows, item, feed, down: false,
  };
};
resetDb();
let calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ path: url.pathname, query: url.search, method: init.method, body: init.body, headers: init.headers });
  if (db.down) throw new TypeError('network down');
  if (db.slow) await new Promise((resolve) => setTimeout(resolve, db.slow));
  const json = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  const rpc = url.pathname.replace('/rest/v1/rpc/', '');
  const body = init.body ? JSON.parse(init.body) : {};
  switch (url.pathname) {
    case '/rest/v1/rpc/get_storefront_tenant': {
      // As the database: the shop's link now, else a link it had before (app.shop_link_history).
      const now = db.tenant.filter((t) => t.slug === body.p_slug);
      return json(now.length ? now : db.tenant.filter((t) => OLD_LINKS[body.p_slug] === t.slug));
    }
    case '/rest/v1/products': return json(db.products);
    case '/rest/v1/categories': return json(db.categories);
    case '/rest/v1/business_hours': return json(db.hours);
    case '/rest/v1/storefront_configs': return json(db.configs);
    case '/rest/v1/rpc/shop_rating_summary': return json(db.rating);
    case '/rest/v1/rpc/get_shop_selling': return json(db.selling);
    case '/rest/v1/rpc/explore_shops': return json(db.shops);
    case '/rest/v1/rpc/explore_item': return json(body.p_product_id === db.item?.product?.id ? db.item : null);
    case '/rest/v1/rpc/explore_feed': return json(db.feed);
    default: return new Response(`{"message":"unknown ${rpc}"}`, { status: 404 });
  }
};

const get = async (address, method = 'GET', headers = {}) => {
  const response = await worker.fetch(new Request(address, { method, headers }), env, ctx);
  pendingAtAnswer = waits.length;
  await settle();
  return response;
};
const fresh = () => { kept.clear(); calls = []; resetDb(); };

// ── Reading a page ──
const between = (html, start, end) => { const i = html.indexOf(start); return i < 0 ? '' : html.slice(i + start.length, html.indexOf(end, i + start.length)); };
const head = (html) => between(html, '<head>', '</head>');
const block = (html) => between(html, '<div id="sellio-prerender"', '<div id="root"></div>');
const attr = (html, selector) => {
  const [tag, key, value] = selector;
  const match = html.match(new RegExp(`<${tag}[^>]*${key}="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`));
  if (!match) return null;
  return (match[0].match(/(?:content|href)="([^"]*)"/) || [])[1] ?? null;
};
const meta = (html, name) => attr(head(html), ['meta', 'name', name]);
const prop = (html, name) => attr(head(html), ['meta', 'property', name]);
const canonicalOf = (html) => attr(head(html), ['link', 'rel', 'canonical']);
const titleOf = (html) => (head(html).match(/<title>([^<]*)<\/title>/) || [])[1];
const graphOf = (html) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return blocks.flatMap((b) => b['@graph'] || [b]);
};
const links = (html) => [...block(html).matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
const unescape = (text) => text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// 1. A storefront: its own head, structured data and content.
fresh();
let response = await get('https://sellio.sg/store/beijing-dumplings?table=t-9');
let html = await response.text();
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
assert.equal(response.headers.get('Cache-Control'), 'no-cache');
assert.equal(response.headers.get('X-Sellio-Edge'), 'written');
assert.equal(response.headers.get('X-Sellio-Edge-Cache'), 'read', 'Read from the database this time');
assert.equal(response.headers.get('ETag'), null, 'The shell\'s ETag would be wrong for the written page');
assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', 'Pages\' own headers stay');
assert.equal(assetCalls.at(-1)[2], null, 'The shell is fetched without the visitor\'s conditional headers (a 304 has no body to write into)');
response = await get('https://sellio.sg/store/beijing-dumplings', 'GET', { 'If-None-Match': '"shell"' });
assert.equal(response.status, 200, 'A browser holding the shell still gets the written page');
assert.match(await response.text(), /<h1>Beijing Dumplings<\/h1>/);
assert.equal(titleOf(html), 'Beijing Dumplings – Order online in Singapore | Sellio');
assert.equal((head(html).match(/<title>/g) || []).length, 1, 'One title');
assert.doesNotMatch(html, /SELLIO_EDGE_HEAD/, 'The markers are replaced');
assert.equal(canonicalOf(html), 'https://sellio.sg/store/beijing-dumplings', 'Canonical without ?table');
assert.equal(prop(html, 'og:url'), 'https://sellio.sg/store/beijing-dumplings');
assert.match(meta(html, 'robots'), /^index, follow/);
const description = unescape(meta(html, 'description'));
assert.ok(description.length <= 160, description);
assert.equal(description, 'Order from Beijing Dumplings, a home seller in Singapore, on Sellio: 4 items from S$2.00 to S$8.00, including Pork Dumplings and Chive Dumplings.');
assert.equal(prop(html, 'og:image'), 'https://cdn.example.com/logo.png', 'A banner from outside Sellio gives way to the logo');
assert.equal(meta(html, 'twitter:card'), 'summary', 'A logo is a small card');
assert.equal(prop(html, 'og:image:alt'), 'Beijing Dumplings');
assert.equal((block(html).match(/<h1>/g) || []).length, 1, 'One heading');
assert.match(block(html), /<h1>Beijing Dumplings<\/h1>/);
assert.match(block(html), /Fresh daily · Handmade in Tampines/);
assert.match(block(html), /Beijing Dumplings is a home seller in Singapore on Sellio with 4 items\. Order online for self-collection or delivery\. Ordering needs a free Sellio account\.<\/p>/);
assert.match(block(html), /<dt>Location<\/dt><dd>Tampines · 1 Tampines Ave<\/dd>/);
assert.match(block(html), /<dt>Rating<\/dt><dd>4\.8 out of 5 from 12 buyer ratings on Sellio<\/dd>/);
assert.match(block(html), /Self-collection \(Tampines\) · Delivery to East, S\$3\.00, free above S\$30\.00 · Pre-orders, 2 days notice/);
assert.match(block(html), /<th scope="row">Monday<\/th><td>13:00 – 00:00<\/td>/);
assert.match(block(html), /<th scope="row">Tuesday<\/th><td>Open 24 hours<\/td>/);
assert.match(block(html), /<th scope="row">Sunday<\/th><td>Closed<\/td>/);
assert.match(block(html), /<h2 id="sellio-edge-items">Menu \(4\)<\/h2><h3>Dumplings<\/h3><p>Made fresh daily<\/p>/);
assert.match(block(html), /<li><a href="\/listing\/p-1">Pork Dumplings<\/a> – S\$8\.00 <s>S\$10\.00<\/s><p>Ten handmade dumplings\. Steamed to order\.<\/p><\/li>/);
assert.match(block(html), /<li><a href="\/listing\/p-2">Chive Dumplings<\/a> – S\$7\.50 \(sold out\)<\/li>/);
assert.match(block(html), /<li><strong>Soup of the day \$1 off<\/strong> – S\$4\.00/, 'No photo: no item page to link to');
assert.match(block(html), /<h3>More items<\/h3><ul><li><strong>&lt;script&gt;alert\(1\)&lt;\/script&gt; Bun<\/strong>/, 'Uncategorised items last; text escaped');
assert.doesNotMatch(block(html), /<h3>Empty<\/h3>/, 'A category with no items is left out');
assert.deepEqual(links(html), ['/', '/explore', '/', '/explore', '/listing/p-1', '/listing/p-2', '/store/cafelicious', '/store/xie-lao-ma', '/explore', '/', '/explore', 'https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app', '/privacy', '/terms']);
assert.doesNotMatch(html, /91234567|UEN-SECRET|paynow-secret|secret note|javascript:/, 'No phone, payment details, seller notes or unsafe links');
assert.doesNotMatch(html, /<script>alert/, 'A name can\'t inject a script');
let graph = graphOf(html);
assert.deepEqual(graph.map((n) => n['@type']), ['CollectionPage', 'FoodEstablishment', 'ItemList', 'BreadcrumbList', 'WebSite', 'Organization']);
const shopNode = graph[1];
assert.equal(shopNode['@id'], 'https://sellio.sg/store/beijing-dumplings#shop');
assert.deepEqual(shopNode.address, { '@type': 'PostalAddress', streetAddress: '1 Tampines Ave', addressCountry: 'SG' });
assert.equal(shopNode.priceRange, 'S$2.00–S$8.00');
assert.equal(shopNode.currenciesAccepted, 'SGD');
assert.deepEqual(shopNode.openingHoursSpecification, [
  { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '13:00', closes: '00:00' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Tuesday', opens: '00:00', closes: '23:59' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Sunday', opens: '00:00', closes: '00:00' },
]);
assert.equal(shopNode.telephone, undefined);
assert.equal(shopNode.aggregateRating, undefined, 'No self-served ratings in structured data');
const list = graph[2];
assert.equal(list.numberOfItems, 4);
assert.deepEqual(list.itemListElement[0].item, {
  '@type': 'Offer', name: 'Pork Dumplings', description: 'Ten handmade dumplings. Steamed to order.', image: 'https://cdn.example.com/p1.jpg',
  url: 'https://sellio.sg/listing/p-1', price: '8.00', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', seller: { '@id': 'https://sellio.sg/store/beijing-dumplings#shop' },
});
assert.equal(list.itemListElement[1].item.availability, 'https://schema.org/OutOfStock');
assert.equal(list.itemListElement[2].item.url, undefined);
assert.ok(!graph.some((n) => n['@type'] === 'Product'), 'Products only on their own pages');
assert.deepEqual(graph[3].itemListElement.map((c) => c.item), ['https://sellio.sg/', 'https://sellio.sg/explore', 'https://sellio.sg/store/beijing-dumplings']);
assert.match(between(html, '<script type="application/ld+json" data-sellio-edge>', '</script>'), /\\u003c\/script>/, 'A "</script>" in the data is written \\u003c');
const written = head(html).slice(head(html).indexOf('<title>'));
for (const tag of written.match(/<(?:meta|link|script|style)\b[^>]*>/g)) assert.match(tag, /data-sellio-edge/, `Marked for the app: ${tag}`);
assert.ok(html.indexOf('<div id="sellio-prerender"') < html.indexOf('<div id="root"></div>'), 'The content goes before the app\'s root');
const read = calls.map((c) => c.path).sort();
assert.deepEqual(read, ['/rest/v1/business_hours', '/rest/v1/categories', '/rest/v1/products', '/rest/v1/rpc/explore_shops', '/rest/v1/rpc/get_shop_selling', '/rest/v1/rpc/get_storefront_tenant', '/rest/v1/rpc/shop_rating_summary', '/rest/v1/storefront_configs']);
const productCall = calls.find((c) => c.path === '/rest/v1/products');
assert.match(decodeURIComponent(productCall.query), /tenant_id=eq\.shop-1&or=\(is_active\.eq\.true,is_active\.is\.null\)&order=sort_order\.asc,created_date\.desc,id\.asc&limit=250/);
assert.match(calls[0].headers.apikey, /^eyJ/, 'The public key');
fresh();
db.configs = [{ banner_headline: '', banner_tagline: '', banner_bg_image_url: 'https://gzktuteedbtnaxfdylyu.supabase.co/storage/v1/object/public/storefront/banner.webp' }];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.equal(prop(html, 'og:image'), 'https://gzktuteedbtnaxfdylyu.supabase.co/storage/v1/object/public/storefront/banner.webp', 'Its own banner');
assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
fresh();
db.configs = [];
db.tenant = [{ ...shopRow, logo_url: null }];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.equal(prop(html, 'og:image'), 'https://sellio.sg/og/sellio-share.jpg', 'No pictures: Sellio\'s card');
assert.equal(prop(html, 'og:image:width'), '1200');
// A business (not a home seller): no account needed, so none mentioned.
fresh();
db.selling = null;
db.shops = shopsRows.map((r) => (r.shop_id === SHOP_ID ? { ...r, shop_type: 'merchant' } : r));
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.match(block(html), /Beijing Dumplings is a shop in Singapore on Sellio with 4 items\. Browse and order online, straight from the seller\.<\/p>/);
assert.doesNotMatch(block(html), /Sellio account/);
passed('storefront: its title, description, canonical, structured data, items with prices, hours, links, and nothing private');

// 2. Kept: the next visit reads nothing; after 10 minutes it is answered from what was kept and
//    fetched again behind the answer.
calls = [];
response = await get('https://sellio.sg/store/beijing-dumplings');
assert.equal(response.status, 200);
assert.equal(calls.length, 0);
assert.equal(response.headers.get('X-Sellio-Edge-Cache'), 'kept', 'Says it came from what was kept');
const realNow = Date.now;
Date.now = () => realNow() + 11 * 60 * 1000;
db.products = [products[0]];
db.slow = 20;
response = await get('https://sellio.sg/store/beijing-dumplings');
db.slow = 0;
assert.match(await response.text(), /Menu \(4\)/, 'Answered at once with what was kept');
assert.equal(response.headers.get('X-Sellio-Edge-Cache'), 'kept-old');
assert.ok(pendingAtAnswer >= 1, 'The fetch behind the answer is handed to waitUntil, so Cloudflare lets it finish');
assert.ok(calls.some((c) => c.path === '/rest/v1/products'), 'Fetched again behind the answer');
calls = [];
response = await get('https://sellio.sg/store/beijing-dumplings');
assert.match(await response.text(), /Menu \(1\)/, 'The next visit has the new items');
assert.equal(calls.length, 0);
Date.now = realNow;
passed('storefront: kept per location; older than 10 minutes, answered at once and fetched again behind the answer');

// 3. A shop not listed on Explore: its items have no pages to link to.
fresh();
db.shops = shopsRows.filter((s) => s.shop_id !== SHOP_ID);
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.ok(!links(html).some((l) => l.startsWith('/listing/')));
assert.ok(graphOf(html)[2].itemListElement.every((e) => !e.item.url));
passed('storefront: a shop hidden from Explore links to no item pages (they open only for listed shops)');

// 4. No street address: an online store, with the country it serves; no hours in the data.
fresh();
db.tenant = [{ ...shopRow, address: '', industry: null, settings: { show_rating_on_store: false } }];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
graph = graphOf(html);
assert.equal(graph[1]['@type'], 'OnlineStore');
assert.deepEqual(graph[1].areaServed, { '@type': 'Country', name: 'Singapore' });
assert.equal(graph[1].address, undefined);
assert.equal(graph[1].openingHoursSpecification, undefined, 'Opening hours are a place\'s');
assert.equal(graph[1].currenciesAccepted, undefined);
assert.doesNotMatch(block(html), /Rating/, 'The shop hides its stars');
assert.ok(!calls.some((c) => c.path === '/rest/v1/rpc/shop_rating_summary'));
assert.match(block(html), /<h2 id="sellio-edge-items">Items \(4\)<\/h2>/, 'Not a food business: "Items"');
passed('storefront: without an address, an online store; stars hidden when the shop hides them');

// 5. No items yet; not taking orders; not there; a preview.
fresh();
db.products = [];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.equal(meta(html, 'robots'), 'noindex, follow');
assert.match(block(html), /Beijing Dumplings hasn’t listed any items yet\./);
fresh();
db.tenant = [{ ...shopRow, is_available: false }];
response = await get('https://sellio.sg/store/beijing-dumplings');
html = await response.text();
assert.equal(response.status, 200);
assert.equal(meta(html, 'robots'), 'noindex, follow');
assert.match(block(html), /<h1>Beijing Dumplings<\/h1><p>Beijing Dumplings isn’t taking orders on Sellio right now\.<\/p>/);
assert.deepEqual(calls.map((c) => c.path).sort(), ['/rest/v1/rpc/explore_shops', '/rest/v1/rpc/get_storefront_tenant'], 'Nothing else is read');
fresh();
response = await get('https://sellio.sg/store/no-such-shop');
html = await response.text();
assert.equal(response.status, 404);
assert.equal(meta(html, 'robots'), 'noindex, follow');
assert.equal(canonicalOf(html), null);
assert.match(block(html), /<h1>Shop not found<\/h1>/);
assert.ok(links(html).includes('/explore'));
fresh();
html = await (await get('https://sellio.sg/store/beijing-dumplings?preview=true')).text();
assert.equal(meta(html, 'robots'), 'noindex, nofollow');
assert.equal(canonicalOf(html), null);
assert.equal(graphOf(html).length, 0);
response = await get('https://sellio.sg/store/a/b');
assert.equal(response.status, 404);
assert.equal(meta(await response.text(), 'robots'), 'noindex, follow');
passed('storefront: no items yet, not taking orders, not there (404), previews and deeper addresses kept out of search results');

// 6. One address per page.
for (const [from, to] of [
  ['https://sellio.sg/store/beijing-dumplings/?table=1', 'https://sellio.sg/store/beijing-dumplings?table=1'],
  ['https://sellio.sg/listing/p-1/', 'https://sellio.sg/listing/p-1'],
  ['https://sellio.sg/explore/', 'https://sellio.sg/explore'],
]) {
  response = await get(from);
  assert.equal(response.status, 301, from);
  assert.equal(response.headers.get('Location'), to);
}
passed('one address per page: a last "/" moves to the address without it');

// 7. An item's page: Product data with its offer, and its content.
fresh();
response = await get('https://sellio.sg/listing/p-1?ref=ABC');
html = await response.text();
assert.equal(response.status, 200);
assert.equal(titleOf(html), 'Pork Dumplings – Beijing Dumplings | Sellio');
assert.equal(canonicalOf(html), 'https://sellio.sg/listing/p-1');
assert.equal(prop(html, 'og:type'), 'product');
assert.equal(prop(html, 'og:image'), 'https://cdn.example.com/p1.jpg');
assert.equal(prop(html, 'product:price:amount'), '8.00');
assert.equal(prop(html, 'product:price:currency'), 'SGD');
assert.equal(unescape(meta(html, 'description')), 'Pork Dumplings – S$8.00 from Beijing Dumplings, a home seller on Sellio. Ten handmade dumplings. Steamed to order.');
assert.match(block(html), /<h1>Pork Dumplings<\/h1><p><strong>S\$8\.00<\/strong> <s>S\$10\.00<\/s> · Available to order<\/p>/);
assert.match(block(html), /Sold by <a href="\/store\/beijing-dumplings">Beijing Dumplings<\/a>, a home seller in Singapore on Sellio with 4 items\. Beijing Dumplings is rated 4\.8 out of 5 by 12 buyers\. Listed on Sellio on 2 November 2026\.<\/p>/);
assert.match(block(html), /<img src="https:\/\/cdn\.example\.com\/p1\.jpg" alt="Pork Dumplings" loading="lazy" decoding="async" \/><img src="https:\/\/cdn\.example\.com\/p1b\.jpg" alt="Pork Dumplings, photo 2"/);
assert.doesNotMatch(html, /insecure\.example\.com/);
assert.match(block(html), /<p>Ten handmade dumplings\.<\/p><p>Steamed to order\.<\/p>/);
assert.match(block(html), /<li>Add-ons: Egg \(\+S\$2\.00\), Chilli oil<\/li>/);
assert.doesNotMatch(block(html), /Size:/, 'A group with no options is left out');
assert.match(block(html), /Order Pork Dumplings from <a href="\/store\/beijing-dumplings">Beijing Dumplings<\/a>’s storefront on Sellio: Self-collection \(Tampines\)/);
assert.match(block(html), /Pre-orders, 2 days notice\. Buying from a home seller needs a free Sellio account, which holds the order and its QR code for collection or delivery\.<\/p>/);
assert.match(block(html), /<h2 id="sellio-edge-more">More from Beijing Dumplings<\/h2><ul><li><a href="\/listing\/p-2">Chive Dumplings<\/a> – S\$7\.50<\/li>/);
assert.doesNotMatch(html, /91234567|secret note/);
graph = graphOf(html);
assert.deepEqual(graph.map((n) => n['@type']), ['ItemPage', 'Product', 'BreadcrumbList', 'WebSite', 'Organization']);
assert.equal(graph[0].datePublished, '2026-11-02T00:00:00.000Z');
assert.deepEqual(graph[1], {
  '@type': 'Product', '@id': 'https://sellio.sg/listing/p-1#product', name: 'Pork Dumplings', url: 'https://sellio.sg/listing/p-1', sku: 'p-1',
  description: 'Ten handmade dumplings. Steamed to order.', image: ['https://cdn.example.com/p1.jpg', 'https://cdn.example.com/p1b.jpg'],
  offers: {
    '@type': 'Offer', url: 'https://sellio.sg/listing/p-1', price: '8.00', priceCurrency: 'SGD', availability: 'https://schema.org/InStock',
    priceSpecification: { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '10.00', priceCurrency: 'SGD' },
    seller: { '@type': 'Organization', '@id': 'https://sellio.sg/store/beijing-dumplings#shop', name: 'Beijing Dumplings', url: 'https://sellio.sg/store/beijing-dumplings' },
  },
});
assert.deepEqual(graph[2].itemListElement.map((c) => c.name), ['Sellio', 'Explore', 'Beijing Dumplings', 'Pork Dumplings']);
passed('item page: Product structured data with its offer and price, photos, options, how to order, more from the shop');

// A seller's text can't become markup: names, descriptions, options, shop names (23 Nov 2026: the
// item's name in "How to order" went out unescaped; fixed 24 Nov).
fresh();
const evil = '<img src=x onerror=alert(1)>';
db.item = {
  ...item,
  product: { ...item.product, name: `Bun ${evil}`, description: `Tasty ${evil}`, variants: [{ name: `Size ${evil}`, options: [{ label: `Big ${evil}`, price_modifier: 1 }] }] },
  shop: { ...item.shop, name: `Shop ${evil}` },
  more: [{ id: 'p-2', name: `Other ${evil}`, price: 1 }],
};
html = await (await get('https://sellio.sg/listing/p-1')).text();
assert.doesNotMatch(html, /<img src=x/, 'No seller text becomes a tag');
assert.ok((block(html).match(/&lt;img src=x onerror=alert\(1\)&gt;/g) || []).length >= 6, 'Every one of them written as text');
assert.match(block(html), /Order Bun &lt;img src=x onerror=alert\(1\)&gt; from <a href/);
passed('item page: a seller\'s text (names, description, options) is always text, never markup');

// Long names: a title search results show whole (65 characters at most).
fresh();
html = await (await get('https://sellio.sg/listing/p-1')).text();
assert.equal(titleOf(html), 'Pork Dumplings – Beijing Dumplings | Sellio', 'Short enough: item, shop and Sellio');
db.item = { ...item, product: { ...item.product, name: 'Ma You Jiang Mian Xian 麻油姜面线 with ginger' } };
kept.clear();
html = await (await get('https://sellio.sg/listing/p-1')).text();
assert.equal(titleOf(html), 'Ma You Jiang Mian Xian 麻油姜面线 with ginger – Beijing Dumplings', 'Then item and shop');
db.item = { ...item, product: { ...item.product, name: 'Ma You Jiang Mian Xian 麻油姜面线 with extra ginger and sesame oil' } };
kept.clear();
html = await (await get('https://sellio.sg/listing/p-1')).text();
assert.equal(titleOf(html), 'Ma You Jiang Mian Xian 麻油姜面线 with extra ginger and… | Sellio', 'Then the name, cut at a word');
db.item = { ...item, product: { ...item.product, name: 'A very long item name that keeps going and going past what any search result shows' } };
kept.clear();
html = await (await get('https://sellio.sg/listing/p-1')).text();
assert.ok(Array.from(titleOf(html)).length <= 65, titleOf(html));
assert.equal(titleOf(html), 'A very long item name that keeps going and going past… | Sellio');
passed('item page: long names keep the title within 65 characters');

// 8. An item that isn't listed (or a strange address): 404, and nothing asked for a strange one.
fresh();
response = await get('https://sellio.sg/listing/p-404');
assert.equal(response.status, 404);
html = await response.text();
assert.match(block(html), /<h1>This item isn’t available<\/h1>/);
assert.equal(meta(html, 'robots'), 'noindex, follow');
calls = [];
response = await get('https://sellio.sg/listing/a%22b');
assert.equal(response.status, 404);
assert.equal(calls.length, 0);
passed('item page: not listed, 404 and kept out of search results; a strange address isn\'t looked up');

// 9. Explore: the shops and the latest items, as lists in the structured data too.
fresh();
html = await (await get('https://sellio.sg/explore?like=p-1')).text();
assert.equal(titleOf(html), 'Explore shops and items · Sellio');
assert.equal(canonicalOf(html), 'https://sellio.sg/explore');
assert.match(meta(html, 'robots'), /^index, follow/);
assert.match(block(html), /<h1>Explore shops and items on Sellio<\/h1>/);
assert.match(block(html), /<li><a href="\/store\/cafelicious">Cafelicious<\/a> – shop, 22 items<\/li>/);
assert.match(block(html), /<li><a href="\/store\/xie-lao-ma">Xie Lao Ma 蟹老妈<\/a> – home seller, 1 item<\/li>/);
assert.match(block(html), /<li><a href="\/listing\/id-9">Nasi Lemak<\/a> – Rp38\.000 from <a href="\/store\/warung">Warung<\/a><\/li>/);
graph = graphOf(html);
assert.deepEqual(graph.map((n) => n['@type']), ['CollectionPage', 'ItemList', 'ItemList', 'BreadcrumbList', 'WebSite', 'Organization']);
assert.deepEqual(graph[1].itemListElement[1], { '@type': 'ListItem', position: 2, url: 'https://sellio.sg/store/cafelicious', name: 'Cafelicious' });
assert.deepEqual(graph[2].itemListElement[1], { '@type': 'ListItem', position: 2, url: 'https://sellio.sg/listing/id-9', name: 'Nasi Lemak' });
const feedCall = calls.find((c) => c.path === '/rest/v1/rpc/explore_feed');
assert.deepEqual(JSON.parse(feedCall.body), { p_search: null, p_kind: null, p_limit: 60, p_offset: 0 });
passed('Explore: every listed shop and the latest items, linked, and as ItemLists in its structured data');

// 10. Without the database and nothing kept: the page as before, with its address as canonical.
fresh();
db.down = true;
const logged = console.error;
console.error = () => {};
response = await get('https://sellio.sg/store/beijing-dumplings?table=t-1');
html = await response.text();
assert.equal(response.status, 200);
assert.equal(response.headers.get('X-Sellio-Edge'), 'fallback');
assert.equal(canonicalOf(html), 'https://sellio.sg/store/beijing-dumplings');
assert.doesNotMatch(html, /sellio-prerender/);
assert.match(html, /<div id="root"><\/div>/);
response = await get('https://sellio.sg/explore');
assert.equal(response.status, 200);
assert.equal(canonicalOf(await response.text()), 'https://sellio.sg/explore');
response = await get('https://sellio.sg/listing/p-1');
assert.equal(response.status, 200);
// What was kept still answers while the database is away.
db.down = false;
await get('https://sellio.sg/store/beijing-dumplings?x=1');
db.down = true;
Date.now = () => realNow() + 11 * 60 * 1000;
response = await get('https://sellio.sg/store/beijing-dumplings');
assert.equal(response.headers.get('X-Sellio-Edge'), 'written');
Date.now = realNow;
console.error = logged;
passed('without the database: the page as before with its canonical, or what was kept');

// 11. HEAD: the status and headers, no body.
fresh();
response = await get('https://sellio.sg/store/no-such-shop', 'HEAD');
assert.equal(response.status, 404);
assert.equal(await response.text(), '');
response = await get('https://sellio.sg/store/beijing-dumplings', 'HEAD');
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
passed('HEAD: the same status and headers, no body');

// 12. Ringgit and rupiah, as the app writes them; a Malaysian shop says so.
fresh();
db.tenant = [{ ...shopRow, currency: 'MYR', country: 'Malaysia' }];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.equal(titleOf(html), 'Beijing Dumplings – Order online in Malaysia | Sellio');
assert.match(block(html), /RM8\.00 <s>RM10\.00<\/s>/);
assert.equal(graphOf(html)[1].address.addressCountry, 'MY');
fresh();
db.tenant = [{ ...shopRow, currency: 'IDR', country: 'Indonesia' }];
db.products = [{ ...products[0], price: 38000, compare_at_price: null }];
html = await (await get('https://sellio.sg/store/beijing-dumplings')).text();
assert.match(block(html), /Rp38\.000/);
assert.equal(graphOf(html)[2].itemListElement[0].item.price, '38000');
passed('money: S$, RM and Rp as the app shows them; whole rupiah in structured data');

// 13. /llms.txt: the file, then the shops on Explore; the file alone without the database.
fresh();
response = await get('https://sellio.sg/llms.txt');
let text = await response.text();
assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
assert.ok(text.startsWith('# Sellio\n\n> About Sellio.\n\n## Shops on Sellio\n'));
assert.match(text, /^- \[Cafelicious\]\(https:\/\/sellio\.sg\/store\/cafelicious\): shop, 22 items$/m);
assert.match(text, /^- \[Beijing Dumplings\]\(https:\/\/sellio\.sg\/store\/beijing-dumplings\): home seller, 4 items$/m);
fresh();
db.down = true;
console.error = () => {};
text = await (await get('https://sellio.sg/llms.txt')).text();
console.error = logged;
assert.equal(text, FILES['/llms.txt']);
passed('llms.txt: the file and the shops on Explore; the file alone without the database');

// 14. The other pages are as before (the app shell keeps its ETag and noindex).
fresh();
response = await get('https://sellio.sg/Dashboard', 'GET', { 'If-None-Match': '"shell"' });
assert.equal(response.status, 304, 'The app shell still answers conditional requests');
assert.equal(response.headers.get('ETag'), '"shell"');
response = await get('https://sellio.sg/Dashboard');
assert.equal(response.status, 200);
assert.match(await response.text(), /noindex, nofollow/);
assert.equal(calls.length, 0);
passed('app pages: as before, nothing read from the database');

// /api/country: the country Cloudflare sees the request come from (request.cf.country), for
// Explore's location pin; readable from the app's pages (another origin), never cached.
const askCountry = async (cf, method = 'GET') => {
  const request = new Request('https://sellio.sg/api/country', { method });
  if (cf !== undefined) Object.defineProperty(request, 'cf', { value: cf });
  const response = await worker.fetch(request, env, ctx);
  return { response, body: method === 'HEAD' ? await response.text() : await response.json() };
};
fresh();
for (const [cf, want] of [[{ country: 'SG' }, 'SG'], [{ country: 'MY' }, 'MY'], [{ country: 'id' }, 'ID'], [{ country: 'TH' }, 'TH'],
  [{ country: 'XX' }, null], [{ country: 'T1' }, null], [{ country: '' }, null], [{}, null], [undefined, null], [{ country: 'S G1' }, null]]) {
  const { response, body } = await askCountry(cf);
  assert.equal(response.status, 200);
  assert.deepEqual(body, { country: want }, JSON.stringify(cf));
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store', 'each visitor gets their own answer');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*', 'the app (another origin) may read it');
}
const headOnly = await askCountry({ country: 'SG' }, 'HEAD');
assert.equal(headOnly.response.status, 200);
assert.equal(headOnly.body, '');
const posted = await worker.fetch(new Request('https://sellio.sg/api/country', { method: 'POST' }), env, ctx);
assert.equal(posted.status, 405);
assert.equal(calls.length, 0, 'nothing read from the database');
passed('/api/country: the visitor\'s country code from Cloudflare (null when unknown or Tor), never cached, readable by the app');

// A renamed shop's old link (its link follows its name): moved for good to the link now, query kept.
fresh();
const moved = await get('https://sellio.sg/store/old-dumplings?ref=qr');
assert.equal(moved.status, 301);
assert.equal(moved.headers.get('Location'), 'https://sellio.sg/store/beijing-dumplings?ref=qr');
const stays = await get('https://sellio.sg/store/beijing-dumplings');
assert.equal(stays.status, 200, 'the link now is written as before');
passed('/store/<old link>: 301 to the renamed shop\'s link now');
