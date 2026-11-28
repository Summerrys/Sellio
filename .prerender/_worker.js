// Sellio's website on Cloudflare Pages ("advanced mode": Pages runs this for each page
// address). Which page each address gets, as the earlier host's _redirects had it:
//   www.<domain>/…        →  301 to the same address without www
//   sellio.apptelier.sg/… and sellio-f1t.pages.dev/…  →  301 to the same address on sellio.sg
//   /Privacy, /privacy/, /Terms, /terms/, /index.html  →  301 to /privacy, /terms, /
//   /                     → index.html (the landing page, prerendered)
//   /privacy, /terms      → privacy/index.html, terms/index.html
//   /store/<slug>         → store.html (a shop's storefront), with the shop written in (below)
//   /explore, /listing/…  → explore.html (Explore and its items: public, unlike app.html), with
//                           the shops and items written in (below)
//   /store/<slug>/, /listing/<id>/, /explore/  →  301 to the same address without the last /
//   /sitemap.xml          → every public shop and item, from the database (sitemap below)
//   /llms.txt             → the llms.txt file, with the shops on Explore added (llms below)
//   /api/country          → the country the visitor's connection comes from (Explore's location
//                           pin, below)
//   any other address     → app.html (the app: sign-in, a shop's workspace, Explore's own tabs…)
// Files (scripts, styles, pictures, /.well-known/assetlinks.json…) skip this worker
// (_routes.json): Pages serves them itself, with the caching in _headers, and answers a missing
// one with 404.html. Pages answers x.html at /x and x/index.html at /x/, so pages are fetched
// in that form. See HOSTING.md.

const REDIRECTS = {
  '/Privacy': '/privacy',
  '/privacy/': '/privacy',
  '/Terms': '/terms',
  '/terms/': '/terms',
  '/index.html': '/',
};

// Sellio's address is sellio.sg. Its old address and Pages' own address answered with the
// same pages, so Google kept listing the old one (Alvin, 6 Nov 2026): their pages now move
// permanently to the same page on sellio.sg, which tells search engines to list sellio.sg
// instead, and old links, bookmarks and QR codes still land on the right page. Their files
// (_routes.json) are still served as they are. Preview deployments (<id>.sellio-f1t.pages.dev)
// are left alone.
const SITE = 'https://sellio.sg';
const MOVED_HOSTS = new Set(['sellio.apptelier.sg', 'sellio-f1t.pages.dev']);

async function fromPages(env, request, url, path) {
  const init = { method: request.method, headers: request.headers };
  let response = await env.ASSETS.fetch(new Request(new URL(path, url), init));
  // Pages may answer with its own form of the address (/app.html → /app): follow it here.
  const location = response.headers.get('Location');
  if (response.status >= 300 && response.status < 400 && location) {
    const next = new URL(location, url);
    if (next.origin === url.origin) response = await env.ASSETS.fetch(new Request(next, init));
  }
  return response;
}

// A page: always checked again with Pages (no-cache), so a new version shows at once.
async function page(env, request, url, path) {
  const response = await fromPages(env, request, url, path);
  const out = new Response(response.body, response);
  if (response.status === 200 || response.status === 304) out.headers.set('Cache-Control', 'no-cache');
  return out;
}

// sellio.sg/sitemap.xml: Sellio's own pages, then every public shop and item from the database
// (public.sitemap_pages(); Alvin, 6 Nov 2026: every seller, home or shop, should be found on
// Google). Made at most once an hour in each Cloudflare location. If the database can't be
// reached, the fixed sitemap.xml file is served instead. The key is Supabase's public (anon)
// key, the one the app itself ships with (src/lib/supabaseClient.js): everything this worker
// reads is what any visitor's browser can read.
const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6a3R1dGVlZGJ0bmF4ZmR5bHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzY2NzIsImV4cCI6MjA5MDU1MjY3Mn0.zZL0Tyizzj3U8JTggYYKZ8BFrhDOKAzwISGNPJDAFzg';
const SITEMAP_PAGES = ['/', '/explore', '/privacy', '/terms'];
// The same addresses the app links to (storeUrl, listingUrl in src/components/explore/shared.jsx).
const SITEMAP_ADDRESS = {
  shop: (key) => `/store/${encodeURIComponent(key)}`,
  item: (key) => `/listing/${encodeURIComponent(key)}`,
};
const SITEMAP_SECONDS = 3600;

// The database to read: Sellio's, or for a check on this computer only, a stand-in on it
// (wrangler pages dev --binding SELLIO_SUPABASE_URL=http://127.0.0.1:<port>; scripts/seo-audit.mjs).
function supabaseOrigin(env) {
  const local = env?.SELLIO_SUPABASE_URL;
  return typeof local === 'string' && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(local) ? local : SUPABASE_URL;
}

const xmlText = (text) => String(text).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

function sitemapXml(rows) {
  const urls = SITEMAP_PAGES.map((path) => ({ loc: SITE + path, lastmod: null }));
  for (const row of Array.isArray(rows) ? rows : []) {
    const address = SITEMAP_ADDRESS[row?.kind];
    const key = typeof row?.key === 'string' ? row.key.trim() : '';
    if (!address || !key) continue;
    const when = row.lastmod ? new Date(row.lastmod) : null;
    urls.push({ loc: SITE + address(key), lastmod: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null });
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${xmlText(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')
    + '\n</urlset>\n';
}

async function sitemap(env, request, url, ctx) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`${SITE}/sitemap.xml`);
  try {
    const kept = cache ? await cache.match(cacheKey) : null;
    if (kept) return kept;
  } catch { /* no cache here: make it */ }
  try {
    const answer = await fetch(`${supabaseOrigin(env)}/rest/v1/rpc/sitemap_pages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!answer.ok) throw new Error(`sitemap_pages answered ${answer.status}`);
    const response = new Response(sitemapXml(await answer.json()), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${SITEMAP_SECONDS}` },
    });
    if (cache) {
      const saving = cache.put(cacheKey, response.clone()).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(saving);
    }
    return response;
  } catch (error) {
    console.error('Sellio sitemap: the database list failed, so the fixed sitemap.xml is served.', String(error?.message || error));
    return env.ASSETS.fetch(new Request(new URL('/sitemap.xml', url), { method: request.method }));
  }
}

// ── Pages written at the edge ────────────────────────────────────────────────────────────────
// A shop's storefront (/store/<slug>), an item (/listing/<id>) and Explore (/explore) are drawn
// by the app in the visitor's browser. Search engines' and AI tools' crawlers mostly don't run
// the app, so before (Ahrefs, 23 Nov 2026: health 29) they found an empty page: no heading, no
// text, no links and no canonical address. Here the page's own title, description, canonical
// address and structured data (schema.org JSON-LD) go into its head, and its content (name,
// items, prices, hours, links to the shop's items and to other shops) into a block before the
// app's root, the way the landing page carries its prerender (scripts/prerender-routes.mjs).
// Browsers never show that block: index.html hides it before it is drawn (data-sellio-shell)
// and src/main.jsx removes it; the app then draws the page itself. The app leaves these head
// tags (data-sellio-edge) as they are while the visitor stays on this page, and removes them
// when the visitor moves to another one (src/lib/pageMeta.js, App.jsx RouteIndexingGuard).
//
// Only public data is read, with the public key, as the storefront and Explore read it: no phone
// numbers, payment details or collection addresses are written into a page.
//
// Kept per Cloudflare location (Cache API): used as is for 10 minutes, then still answered with
// for up to a day while it is fetched again behind the answer, so crawlers get pages fast. A
// shop or item that isn't there is asked about again after a minute. If the database can't be
// reached and nothing is kept, the page goes out as before, with its address as canonical.
const EDGE_CACHE = 'v1';
const EDGE_FRESH_MS = 10 * 60 * 1000;
const EDGE_MISSING_FRESH_MS = 60 * 1000;
const EDGE_KEEP_SECONDS = 24 * 60 * 60;
const EDGE_TIMEOUT_MS = 5000;
const MAX_SHOP_ITEMS = 250; // items written into a storefront page
const MAX_LIST_ITEMS = 100; // of those, in its structured data
const SHOPS_LIMIT = 50; // explore_shops gives at most 50
const FEED_LIMIT = 60; // explore_feed gives at most 60 a page
const MORE_SHOPS = 8; // "More shops on Sellio" under a storefront

const PUBLIC_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const HIDDEN_ROBOTS = 'noindex, follow';
const PRIVATE_ROBOTS = 'noindex, nofollow';
const SHARE_IMAGE = `${SITE}/og/sellio-share.jpg`;
// Sellio's Android app (src/components/landing/landingSchema.js PLAY_STORE_URL).
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app';
const ORG_ID = `${SITE}/#organization`;
const WEBSITE_ID = `${SITE}/#website`;
// The same Sellio entity the landing page describes in full (src/components/landing/landingSchema.js).
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Sellio',
  url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/icons/sellio-pwa-512.png`, width: 512, height: 512 },
  email: 'sellio@apptelier.sg',
  parentOrganization: { '@type': 'Organization', name: 'Apptelier', url: 'https://apptelier.sg/' },
  sameAs: [PLAY_STORE_URL],
};
const WEBSITE = { '@type': 'WebSite', '@id': WEBSITE_ID, name: 'Sellio', url: `${SITE}/`, inLanguage: 'en', publisher: { '@id': ORG_ID } };

const EDGE_HEAD = /<!-- SELLIO_EDGE_HEAD -->[\s\S]*?<!-- \/SELLIO_EDGE_HEAD -->/;
const ROOT = '<div id="root"></div>';
// Only for a visitor whose browser runs no scripts (everyone else never sees the block).
const EDGE_STYLE = '.sellio-edge{max-width:960px;margin:0 auto;padding:24px 16px;font:16px/1.55 Inter,system-ui,sans-serif;color:#0f172a}'
  + '.sellio-edge h1{font-size:28px;font-weight:800;margin:8px 0}.sellio-edge h2{font-size:20px;font-weight:700;margin:24px 0 8px}'
  + '.sellio-edge h3{font-size:17px;font-weight:700;margin:16px 0 6px}.sellio-edge p{margin:6px 0}.sellio-edge a{color:#7c3aed;text-decoration:underline}'
  + '.sellio-edge main ul{list-style:disc;padding-left:20px}.sellio-edge li{margin:6px 0}.sellio-edge nav ol{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}'
  + '.sellio-edge nav ol li+li:before{content:"›";margin-right:8px;color:#94a3b8}.sellio-edge img{max-width:100%;height:auto;border-radius:12px}'
  + '.sellio-edge dt{font-weight:700}.sellio-edge dd{margin:0 0 6px}.sellio-edge th{text-align:left;padding-right:16px}'
  + '.sellio-edge header nav a,.sellio-edge footer nav a{margin-right:12px}';

// ── Words and numbers ──
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// At most `max` characters, cut at a word (as src/lib/pageMeta.js snippet()); counted in whole
// characters, so an emoji is never cut in half.
function clip(text, max) {
  const words = oneLine(text);
  const chars = Array.from(words);
  if (chars.length <= max) return words;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

// A seller's text as paragraphs, at most `max` characters in all.
function paragraphs(text, max = 1500) {
  const out = [];
  let left = max;
  for (const line of String(text ?? '').split(/\n+/)) {
    const words = oneLine(line);
    if (!words || left <= 0) continue;
    const kept = clip(words, left);
    out.push(`<p>${esc(kept)}</p>`);
    left -= Array.from(kept).length;
  }
  return out.join('');
}

// "A", "A and B", "A, B and C".
const listWords = (words) => (words.length <= 1 ? words[0] || '' : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// An https address for a picture or a link, or '' (never javascript:, data: or http:).
function httpsUrl(value) {
  const text = typeof value === 'string' ? value.trim() : typeof value?.url === 'string' ? value.url.trim() : '';
  if (!/^https:\/\/[^\s"'<>]+$/i.test(text)) return '';
  try { return new URL(text).href; } catch { return ''; }
}

const finite = (value) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

// As the app shows money (src/lib/money.js): S$5.50, RM5.50, Rp38.000.
const CURRENCY_PREFIX = { SGD: 'S$', MYR: 'RM', IDR: 'Rp' };
function money(amount, currency) {
  const n = finite(amount);
  if (n == null) return '';
  const code = currency || 'SGD';
  const prefix = CURRENCY_PREFIX[code] || `${code} `;
  if (code === 'IDR') {
    const whole = Math.round(Math.abs(n));
    return `${n < 0 && whole > 0 ? '-' : ''}${prefix}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }
  return `${n < 0 ? '-' : ''}${prefix}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// A price for structured data: "5.50", or whole rupiah.
const schemaPrice = (amount, currency) => (currency === 'IDR' ? String(Math.round(Number(amount))) : Number(amount).toFixed(2));

// A shop's country as the app has it (src/lib/countries.js shopCountry): its own, else its
// currency's, else Singapore.
const COUNTRIES = [
  { name: 'Singapore', code: 'SG', currency: 'SGD' },
  { name: 'Malaysia', code: 'MY', currency: 'MYR' },
  { name: 'Indonesia', code: 'ID', currency: 'IDR' },
];
const countryOf = (name, currency) => COUNTRIES.find((c) => c.name === name) || COUNTRIES.find((c) => c.currency === currency) || COUNTRIES[0];

// As src/lib/industry.js normalizeIndustry.
const isFood = (industry) => /f.?b|cafe|restaurant|food|beverage|bar/i.test(String(industry || ''));

const storeAddress = (slug) => `${SITE}/store/${encodeURIComponent(slug)}`;
const listingAddress = (id) => `${SITE}/listing/${encodeURIComponent(id)}`;
const storePath = (slug) => `/store/${encodeURIComponent(slug)}`;
const listingPath = (id) => `/listing/${encodeURIComponent(id)}`;

// For a <script type="application/ld+json">: "<" written as \u003c, so no text in it can end
// the script.
const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// ── Reading Sellio's public data ──
async function supabaseCall(env, path, body) {
  const response = await fetch(`${supabaseOrigin(env)}/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${path.split('?')[0]} answered ${response.status}`);
  return response.json();
}
const supabaseRpc = (env, name, args) => supabaseCall(env, `rpc/${name}`, args || {});
const supabaseRows = async (env, path) => {
  const rows = await supabaseCall(env, path);
  return Array.isArray(rows) ? rows : [];
};

// Kept per location (see above). Data, not pages, so a new version of this worker writes pages
// its own way at once.
// `info`, when given, notes how the page's data came: kept (fresh), kept-old (fetched again behind
// the answer) or read (from the database now); edgePage sends it as X-Sellio-Edge-Cache.
async function edgeCached(ctx, key, load, info = null) {
  const cache = globalThis.caches?.default;
  const cacheKey = cache ? new Request(`${SITE}/__sellio-edge/${EDGE_CACHE}/${key}`) : null;
  let kept = null;
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const parsed = await hit.json();
        if (parsed && typeof parsed.at === 'number' && 'data' in parsed) kept = parsed;
      }
    } catch { /* treated as nothing kept */ }
  }
  const fetchAndKeep = async () => {
    const data = await load();
    if (cache) {
      const saving = cache.put(cacheKey, new Response(JSON.stringify({ at: Date.now(), data }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${EDGE_KEEP_SECONDS}` },
      })).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(saving);
      else await saving;
    }
    return data;
  };
  if (kept) {
    const age = Date.now() - kept.at;
    const fresh = age >= 0 && age < (kept.data == null ? EDGE_MISSING_FRESH_MS : EDGE_FRESH_MS);
    if (fresh) {
      if (info) info.cache = 'kept';
      return kept.data;
    }
    // Older: a shop or item that is there is still answered with while it is fetched again; one
    // that wasn't is asked about again now (it may have just opened).
    if (kept.data != null) {
      const again = fetchAndKeep().catch((error) => console.error(`Sellio edge: ${key} could not be fetched again.`, String(error?.message || error)));
      if (ctx?.waitUntil) ctx.waitUntil(again);
      if (info) info.cache = 'kept-old';
      return kept.data;
    }
  }
  if (info) info.cache = 'read';
  return fetchAndKeep();
}

// The shops on Explore (explore_shops: listed, can sell, with items; newest items first).
async function loadShops(env) {
  const rows = await supabaseRpc(env, 'explore_shops', { p_limit: SHOPS_LIMIT });
  return (Array.isArray(rows) ? rows : [])
    .map((s) => ({
      id: String(s?.shop_id ?? ''),
      name: oneLine(s?.shop_name),
      slug: typeof s?.shop_slug === 'string' ? s.shop_slug.trim() : '',
      home: s?.shop_type === 'individual',
      count: Number(s?.item_count) || 0,
    }))
    .filter((s) => s.id && s.name && s.slug);
}
const shopsList = (env, ctx) => edgeCached(ctx, 'shops', () => loadShops(env));

// How a home seller sells (get_shop_selling), as the app sums it up (src/lib/shopSelling.js
// sellingSummary). Collection addresses and sellers' notes are never included.
function sellingFacts(selling, currency) {
  if (!selling || typeof selling !== 'object') return null;
  const c = selling.collection || {};
  const d = selling.delivery || {};
  const p = selling.preorder || {};
  const parts = [];
  const modes = [];
  if (c.enabled) {
    parts.push(`Self-collection${oneLine(c.area) ? ` (${oneLine(c.area)})` : ''}`);
    modes.push('self-collection');
  }
  if (d.enabled) {
    const fee = finite(d.fee);
    const freeAbove = finite(d.free_above);
    const areas = oneLine(d.areas);
    parts.push(d.fee_mode === 'extra' && fee > 0
      ? `Delivery${areas ? ` to ${areas}` : ''}, ${money(fee, currency)}${freeAbove ? `, free above ${money(freeAbove, currency)}` : ''}`
      : `Delivery${areas ? ` to ${areas}` : ''} (postage & courier included)`);
    modes.push('delivery');
  }
  if (p.enabled) {
    const days = Number.isInteger(p.min_days) ? p.min_days : 1;
    parts.push(`Pre-orders, ${plural(days, 'day', 'days')} notice`);
  }
  return parts.length ? { summary: parts.join(' · '), modes } : null;
}

function itemFacts(p) {
  return {
    id: String(p?.id ?? ''),
    name: oneLine(p?.name),
    description: String(p?.description ?? '').trim(),
    price: finite(p?.price),
    compare: finite(p?.compare_at_price),
    image: httpsUrl(p?.image_url),
    category: p?.category_id == null ? '' : String(p.category_id),
    soldOut: !!p?.track_inventory && Number(p?.stock_quantity) <= 0,
  };
}

const STORE_ITEM_FIELDS = 'id,name,description,price,compare_at_price,image_url,category_id,stock_quantity,track_inventory';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

async function loadStore(env, ctx, slug) {
  const rows = await supabaseRpc(env, 'get_storefront_tenant', { p_slug: slug });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return null;
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const shop = {
    id: String(row.id),
    name: oneLine(row.name) || slug,
    slug: typeof row.slug === 'string' && row.slug ? row.slug : slug,
    logo: httpsUrl(row.logo_url),
    industry: oneLine(row.industry),
    currency: oneLine(row.currency) || 'SGD',
    country: oneLine(row.country),
    address: oneLine(row.address),
    branch: oneLine(settings.branch_name),
    showRating: settings.show_rating_on_store !== false,
    available: row.is_available !== false,
  };
  if (!shop.available) return { shop };
  const id = encodeURIComponent(shop.id);
  const [products, categories, hours, configs, ratings, selling, shops] = await Promise.all([
    supabaseRows(env, `products?select=${STORE_ITEM_FIELDS}&tenant_id=eq.${id}&or=(is_active.eq.true,is_active.is.null)&order=sort_order.asc,created_date.desc,id.asc&limit=${MAX_SHOP_ITEMS}`),
    supabaseRows(env, `categories?select=id,name,description&tenant_id=eq.${id}&or=(is_active.eq.true,is_active.is.null)&order=sort_order.asc,id.asc`),
    supabaseRows(env, `business_hours?select=day_of_week,open_time,close_time,is_closed&tenant_id=eq.${id}`).catch(() => []),
    supabaseRows(env, `storefront_configs?select=banner_headline,banner_tagline,banner_bg_image_url&tenant_id=eq.${id}&limit=1`).catch(() => []),
    shop.showRating ? supabaseRpc(env, 'shop_rating_summary', { p_tenant_ids: [shop.id] }).catch(() => []) : [],
    supabaseRpc(env, 'get_shop_selling', { p_tenant_id: shop.id }).catch(() => null),
    shopsList(env, ctx).catch(() => []),
  ]);
  const items = products.map(itemFacts).filter((item) => item.id && item.name);
  // Item pages (/listing/<id>) open only for a shop listed on Explore: one of explore_shops, or,
  // past its 50, one whose item explore_item shows.
  const onExplore = shops.find((s) => s.slug === shop.slug);
  let listed = !!onExplore;
  if (!listed && shops.length >= SHOPS_LIMIT) {
    const first = items.find((item) => item.image);
    if (first) listed = !!(await supabaseRpc(env, 'explore_item', { p_product_id: first.id }).catch(() => null))?.product;
  }
  const config = configs[0] || {};
  const rating = Array.isArray(ratings) ? ratings[0] : null;
  const ratingValue = finite(rating?.rating);
  const ratingCount = Number(rating?.rating_count) || 0;
  return {
    shop: { ...shop, home: onExplore ? onExplore.home : !!selling },
    items,
    categories: categories.map((c) => ({ id: String(c.id), name: oneLine(c.name), description: oneLine(c.description) })).filter((c) => c.name),
    hours: hours
      .filter((h) => DAYS.includes(String(h.day_of_week || '').toLowerCase()))
      .map((h) => ({ day: String(h.day_of_week).toLowerCase(), closed: !!h.is_closed, open: oneLine(h.open_time), close: oneLine(h.close_time) })),
    promo: [oneLine(config.banner_headline), oneLine(config.banner_tagline)].filter(Boolean),
    banner: httpsUrl(config.banner_bg_image_url),
    rating: ratingValue && ratingCount > 0 ? { value: ratingValue, count: ratingCount } : null,
    selling: sellingFacts(selling, shop.currency),
    listed,
  };
}

function variantFacts(variants) {
  const TYPE_NAMES = { size: 'Size', addon: 'Add-ons', color: 'Colour', other: 'Options' };
  return (Array.isArray(variants) ? variants : [])
    .map((group) => ({
      name: oneLine(group?.name) || TYPE_NAMES[group?.type] || 'Options',
      options: (Array.isArray(group?.options) ? group.options : [])
        .map((o) => ({ label: oneLine(o?.label ?? o?.name), extra: finite(o?.price_modifier) }))
        .filter((o) => o.label),
    }))
    .filter((group) => group.options.length);
}

async function loadListing(env, id) {
  const data = await supabaseRpc(env, 'explore_item', { p_product_id: id });
  if (!data || typeof data !== 'object' || !data.product || data.visible === false) return null;
  const p = data.product;
  const s = data.shop || {};
  // The shop's stars, as the item page in the app shows them (Explore shows them even where a
  // shop hides them on its own storefront).
  const ratings = s.id ? await supabaseRpc(env, 'shop_rating_summary', { p_tenant_ids: [String(s.id)] }).catch(() => []) : [];
  const rating = Array.isArray(ratings) ? ratings[0] : null;
  const currency = oneLine(s.currency) || 'SGD';
  const slug = typeof s.slug === 'string' ? s.slug.trim() : '';
  if (!slug) return null;
  const images = [...new Set((Array.isArray(p.images) ? p.images : []).map(httpsUrl).filter(Boolean))].slice(0, 8);
  return {
    item: {
      id: String(p.id ?? id),
      name: oneLine(p.name) || 'Item',
      description: String(p.description ?? '').trim(),
      price: finite(p.price),
      compare: finite(p.compare_at_price),
      images,
      soldOut: !!p.sold_out,
      options: variantFacts(p.variants),
      listedAt: Number.isNaN(Date.parse(p.listed_at)) ? null : new Date(p.listed_at).toISOString(),
    },
    shop: {
      name: oneLine(s.name) || slug,
      slug,
      logo: httpsUrl(s.logo_url),
      home: s.type === 'individual',
      industry: oneLine(s.industry),
      currency,
      count: Number(s.item_count) || 0,
      rating: finite(rating?.rating) && Number(rating?.rating_count) > 0 ? { value: finite(rating.rating), count: Number(rating.rating_count) } : null,
    },
    selling: sellingFacts(data.selling, currency),
    more: (Array.isArray(data.more) ? data.more : [])
      .map((m) => ({ id: String(m?.id ?? ''), name: oneLine(m?.name), price: finite(m?.price) }))
      .filter((m) => m.id && m.name),
  };
}

async function loadExplore(env, ctx) {
  const [shops, feed] = await Promise.all([
    shopsList(env, ctx),
    supabaseRpc(env, 'explore_feed', { p_search: null, p_kind: null, p_limit: FEED_LIMIT, p_offset: 0 }),
  ]);
  return {
    shops,
    items: (Array.isArray(feed) ? feed : [])
      .map((row) => ({
        id: String(row?.product_id ?? ''),
        name: oneLine(row?.product_name),
        price: finite(row?.price),
        currency: oneLine(row?.currency) || 'SGD',
        shop: oneLine(row?.shop_name),
        slug: typeof row?.shop_slug === 'string' ? row.shop_slug.trim() : '',
      }))
      .filter((item) => item.id && item.name && item.slug),
  };
}

// ── Writing a page ──
function headTags({ title, description, robots, canonical = '', image = '', imageAlt = '', ogType = 'website', graph = null, meta = [], card = 'summary_large_image' }) {
  const edge = 'data-sellio-edge';
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" ${edge} />`,
    `<meta name="robots" content="${esc(robots)}" ${edge} />`,
  ];
  if (canonical) lines.push(`<link rel="canonical" href="${esc(canonical)}" ${edge} />`);
  lines.push(
    `<meta property="og:type" content="${esc(ogType)}" ${edge} />`,
    `<meta property="og:site_name" content="Sellio" ${edge} />`,
    `<meta property="og:title" content="${esc(title)}" ${edge} />`,
    `<meta property="og:description" content="${esc(description)}" ${edge} />`,
  );
  if (canonical) lines.push(`<meta property="og:url" content="${esc(canonical)}" ${edge} />`);
  lines.push(`<meta property="og:image" content="${esc(image || SHARE_IMAGE)}" ${edge} />`);
  if (!image) {
    lines.push(
      `<meta property="og:image:type" content="image/jpeg" ${edge} />`,
      `<meta property="og:image:width" content="1200" ${edge} />`,
      `<meta property="og:image:height" content="630" ${edge} />`,
    );
  }
  lines.push(
    `<meta property="og:image:alt" content="${esc(image ? imageAlt || title : 'Sellio: your business, beautifully online.')}" ${edge} />`,
    `<meta name="twitter:card" content="${esc(image ? card : 'summary_large_image')}" ${edge} />`,
    `<meta name="twitter:title" content="${esc(title)}" ${edge} />`,
    `<meta name="twitter:description" content="${esc(description)}" ${edge} />`,
    `<meta name="twitter:image" content="${esc(image || SHARE_IMAGE)}" ${edge} />`,
  );
  for (const [property, content] of meta) lines.push(`<meta property="${esc(property)}" content="${esc(content)}" ${edge} />`);
  if (graph) lines.push(`<script type="application/ld+json" ${edge}>${jsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`);
  lines.push(`<style ${edge}>${EDGE_STYLE}</style>`);
  return lines.join('\n    ');
}

// The picture for a link preview: a banner uploaded through Sellio (photos are made small on the
// phone before upload, so they stay under WhatsApp's 600 KB), else the logo as a small card,
// else Sellio's own card (image '').
const SELLIO_UPLOADS = `${SUPABASE_URL}/storage/v1/object/public/`;
function previewPicture(banner, logo) {
  if (banner && banner.startsWith(SELLIO_UPLOADS)) return { image: banner, card: 'summary_large_image' };
  if (logo) return { image: logo, card: 'summary' };
  return { image: '' };
}

function crumbsHtml(crumbs) {
  return `<nav aria-label="Breadcrumb"><ol>${crumbs.map(([name, path], i) => (i === crumbs.length - 1
    ? `<li aria-current="page">${esc(name)}</li>`
    : `<li><a href="${esc(path)}">${esc(name)}</a></li>`)).join('')}</ol></nav>`;
}

function crumbsGraph(id, crumbs) {
  return {
    '@type': 'BreadcrumbList',
    '@id': id,
    itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  };
}

// The block every edge page shares: Sellio's links above and below its content.
function edgeBody(main) {
  return '<div id="sellio-prerender" data-prerendered="true" data-sellio-edge class="sellio-edge">'
    + '<header><nav aria-label="Sellio"><a href="/">Sellio</a><a href="/explore">Explore shops and items</a></nav></header>'
    + `<main>${main}</main>`
    + '<footer><p>Sellio: online storefronts, ordering and a public marketplace for shops and home sellers in Singapore, Malaysia and Indonesia.</p>'
    + `<nav aria-label="About Sellio"><a href="/">About Sellio</a><a href="/explore">Explore</a><a href="${PLAY_STORE_URL}">Sellio for Android</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms and Conditions</a></nav></footer>`
    + '</div>';
}

function itemsRange(items, currency) {
  const prices = items.map((i) => i.price).filter((p) => p != null && p > 0);
  if (!prices.length) return '';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low, currency) : `${money(low, currency)} to ${money(high, currency)}`;
}

// A title of at most 65 characters (longer ones are cut short in search results and flagged by
// site audits): the first of `choices` that fits, else the last one cut at a word.
function fitTitle(...choices) {
  const fits = choices.find((choice) => Array.from(choice).length <= 65);
  return fits || `${clip(choices[choices.length - 1].replace(/ \| Sellio$/, ''), 56)} | Sellio`;
}

// A description that keeps its facts whole: `lead`, then as many of `names` as fit in `max`.
function withExamples(lead, names, max = 160) {
  let picked = [];
  for (const name of names) {
    const next = [...picked, name];
    if (Array.from(`${lead}, including ${listWords(next)}.`).length > max) break;
    picked = next;
  }
  return clip(picked.length ? `${lead}, including ${listWords(picked)}.` : `${lead}.`, max);
}

function hoursText(h) {
  if (h.closed) return 'Closed';
  if (!/^\d{1,2}:\d{2}$/.test(h.open) || !/^\d{1,2}:\d{2}$/.test(h.close)) return '';
  return h.open === h.close ? 'Open 24 hours' : `${h.open} – ${h.close}`;
}
const dayName = (day) => day.charAt(0).toUpperCase() + day.slice(1);
// "2 November 2026", in Singapore time.
const longDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' });
const hhmm = (time) => (/^\d:\d{2}$/.test(time) ? `0${time}` : time);

// Not there: 404, kept out of search results, with the way back to Sellio's shops.
function missingView(kind) {
  const shop = kind === 'store';
  const title = shop ? 'Shop not found | Sellio' : 'Item not available | Sellio';
  const heading = shop ? 'Shop not found' : 'This item isn’t available';
  const text = shop
    ? 'There is no Sellio shop at this address. It may have moved or closed.'
    : 'This item is no longer listed on Sellio, or its shop is not taking orders right now.';
  return {
    status: 404,
    head: headTags({ title, description: text, robots: HIDDEN_ROBOTS }),
    body: edgeBody(`<h1>${esc(heading)}</h1><p>${esc(text)}</p><p><a href="/explore">Browse the shops and items on Sellio Explore</a></p>`),
  };
}

function storeView(data, { canonical, privateVariant, shops }) {
  const { shop } = data;
  const path = storePath(shop.slug);
  const crumbs = [['Sellio', '/'], ['Explore', '/explore'], [shop.name, path]];
  const others = (shops || []).filter((s) => s.slug !== shop.slug).slice(0, MORE_SHOPS);
  const othersHtml = others.length
    ? `<section aria-labelledby="sellio-edge-more"><h2 id="sellio-edge-more">More shops on Sellio</h2><ul>${others.map((s) => `<li><a href="${esc(storePath(s.slug))}">${esc(s.name)}</a> – ${s.home ? 'home seller' : 'shop'}, ${esc(plural(s.count, 'item', 'items'))}</li>`).join('')}</ul><p><a href="/explore">See every shop and item on Explore</a></p></section>`
    : '<p><a href="/explore">See the shops and items on Explore</a></p>';
  const logo = shop.logo ? `<img src="${esc(shop.logo)}" alt="${esc(`${shop.name} logo`)}" width="96" height="96" loading="lazy" decoding="async" />` : '';

  // A shop that isn't taking orders (closed for now, or its plan has ended): kept out of search
  // results, as the app does.
  if (!shop.available) {
    const text = `${shop.name} isn’t taking orders on Sellio right now.`;
    return {
      status: 200,
      head: headTags({ title: `${shop.name} | Sellio`, description: text, robots: HIDDEN_ROBOTS, canonical: privateVariant ? '' : canonical }),
      body: edgeBody(`${crumbsHtml(crumbs)}<article>${logo}<h1>${esc(shop.name)}</h1><p>${esc(text)}</p></article>${othersHtml}`),
    };
  }

  const { items } = data;
  const country = countryOf(shop.country, shop.currency);
  const food = isFood(shop.industry);
  const kind = shop.home ? 'home seller' : 'shop';
  const range = itemsRange(items, shop.currency);
  const place = [shop.branch, shop.address].filter(Boolean).join(' · ');
  const title = fitTitle(`${shop.name} – Order online in ${country.name} | Sellio`, `${shop.name} – Order online | Sellio`, `${shop.name} | Sellio`);
  const lede = `${shop.name} is a ${kind} in ${country.name} on Sellio${items.length ? ` with ${plural(items.length, 'item', 'items')}` : ''}. `
    + (data.selling?.modes.length ? `Order online for ${listWords(data.selling.modes).replace(' and ', ' or ')}.` : 'Browse and order online, straight from the seller.')
    // Buying from a home seller needs a Sellio account, which holds the order's QR code (Alvin,
    // 23 Nov 2026); a business's customers order without one on the web.
    + (shop.home ? ' Ordering needs a free Sellio account.' : '');
  const facts = [['Seller', shop.home ? 'Home seller on Sellio' : 'Shop on Sellio']];
  if (place) facts.push(['Location', place]);
  facts.push(['Country', country.name]);
  if (range) facts.push(['Prices', range]);
  if (data.rating) facts.push(['Rating', `${data.rating.value.toFixed(1)} out of 5 from ${plural(data.rating.count, 'buyer rating', 'buyer ratings')} on Sellio`]);
  if (data.selling) facts.push(['Ordering', data.selling.summary]);
  const hours = DAYS.map((day) => data.hours.find((h) => h.day === day)).filter((h) => h && hoursText(h));

  // Items under their categories, in the shop's own order; the rest under "More items".
  const groups = [];
  const byCategory = new Map(data.categories.map((c) => [c.id, { ...c, items: [] }]));
  const loose = [];
  for (const item of items) (byCategory.get(item.category)?.items || loose).push(item);
  for (const group of byCategory.values()) if (group.items.length) groups.push(group);
  if (loose.length) groups.push({ name: groups.length ? 'More items' : '', description: '', items: loose });
  const shown = groups.flatMap((group) => group.items); // the items in the order the page lists them
  const description = items.length
    ? withExamples(`Order from ${shop.name}, a ${kind} in ${country.name}, on Sellio: ${plural(items.length, 'item', 'items')}${range ? ` ${range.includes(' to ') ? 'from' : 'at'} ${range}` : ''}`, shown.slice(0, 3).map((item) => item.name))
    : clip(`${shop.name} is a ${kind} in ${country.name} on Sellio.`, 160);
  const linked = (item) => data.listed && !!item.image;
  const itemHtml = (item) => {
    const name = linked(item) ? `<a href="${esc(listingPath(item.id))}">${esc(item.name)}</a>` : `<strong>${esc(item.name)}</strong>`;
    const price = item.price != null ? ` – ${esc(money(item.price, shop.currency))}` : '';
    const was = item.compare != null && item.price != null && item.compare > item.price ? ` <s>${esc(money(item.compare, shop.currency))}</s>` : '';
    const soldOut = item.soldOut ? ' (sold out)' : '';
    const text = item.description ? `<p>${esc(clip(item.description, 300))}</p>` : '';
    return `<li>${name}${price}${was}${soldOut}${text}</li>`;
  };
  const listHeading = food ? 'Menu' : 'Items';
  const itemsHtml = items.length
    ? `<section aria-labelledby="sellio-edge-items"><h2 id="sellio-edge-items">${listHeading} (${items.length})</h2>${groups.map((g) => `${g.name ? `<h3>${esc(g.name)}</h3>` : ''}${g.description ? `<p>${esc(g.description)}</p>` : ''}<ul>${g.items.map(itemHtml).join('')}</ul>`).join('')}</section>`
    : `<p>${esc(shop.name)} hasn’t listed any items yet.</p>`;
  const hoursHtml = hours.length
    ? `<section aria-labelledby="sellio-edge-hours"><h2 id="sellio-edge-hours">Opening hours</h2><table><tbody>${hours.map((h) => `<tr><th scope="row">${dayName(h.day)}</th><td>${esc(hoursText(h))}</td></tr>`).join('')}</tbody></table></section>`
    : '';
  const promoHtml = data.promo.length ? `<p>${esc(data.promo.join(' · '))}</p>` : '';
  const body = edgeBody(`${crumbsHtml(crumbs)}<article>${logo}<h1>${esc(shop.name)}</h1>${promoHtml}<p>${esc(lede)}</p>`
    + `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${hoursHtml}${itemsHtml}</article>${othersHtml}`);

  // Structured data. A shop with a street address is a local business (a food business when it
  // says so); one without is an online store. Items are offers in a list, each with its own page
  // where there is one; their full Product data is on those pages (Google wants a Product on its
  // own page, not in a list).
  const shopId = `${canonical}#shop`;
  const local = !!shop.address;
  const type = !local ? 'OnlineStore' : food ? 'FoodEstablishment' : /retail|fashion|electronics/i.test(shop.industry) ? 'Store' : 'LocalBusiness';
  const images = [data.banner, shop.logo].filter(Boolean);
  const shopNode = {
    '@type': type,
    '@id': shopId,
    name: shop.name,
    url: canonical,
    description: lede.trim(),
    ...(shop.logo ? { logo: shop.logo } : {}),
    ...(images.length ? { image: images } : {}),
    ...(local
      ? {
        address: { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: country.code },
        currenciesAccepted: shop.currency,
        ...(range ? { priceRange: range.replace(' to ', '–') } : {}),
        ...(hours.length ? {
          openingHoursSpecification: hours.map((h) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${dayName(h.day)}`,
            opens: h.closed ? '00:00' : h.open === h.close ? '00:00' : hhmm(h.open),
            closes: h.closed ? '00:00' : h.open === h.close ? '23:59' : hhmm(h.close),
          })),
        } : {}),
      }
      : { areaServed: { '@type': 'Country', name: country.name } }),
    potentialAction: {
      '@type': 'OrderAction',
      target: { '@type': 'EntryPoint', urlTemplate: canonical, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] },
    },
  };
  const listNode = {
    '@type': 'ItemList',
    '@id': `${canonical}#items`,
    name: `${shop.name} ${food ? 'menu' : 'items'}`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, MAX_LIST_ITEMS).map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        name: item.name,
        ...(item.description ? { description: clip(item.description, 300) } : {}),
        ...(item.image ? { image: item.image } : {}),
        ...(linked(item) ? { url: listingAddress(item.id) } : {}),
        ...(item.price != null ? { price: schemaPrice(item.price, shop.currency), priceCurrency: shop.currency } : {}),
        availability: item.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        seller: { '@id': shopId },
      },
    })),
  };
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': shopId },
      mainEntity: { '@id': `${canonical}#items` },
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
    },
    shopNode,
    listNode,
    crumbsGraph(`${canonical}#breadcrumb`, crumbs),
    WEBSITE,
    ORGANIZATION,
  ];
  // A shop with no items yet is kept out of search results until it has some (the sitemap
  // lists it from then on: public.sitemap_pages). Previews and staff orders never are.
  const robots = privateVariant ? PRIVATE_ROBOTS : items.length ? PUBLIC_ROBOTS : HIDDEN_ROBOTS;
  return {
    status: 200,
    head: headTags({
      title,
      description,
      robots,
      canonical: privateVariant ? '' : canonical,
      // A shared shop link shows the shop's own picture (Alvin, 24 Nov 2026; Oct 2026 had it Sellio's
      // card): its storefront banner, else its logo (a small square card), else Sellio's card.
      ...previewPicture(data.banner, shop.logo),
      imageAlt: shop.name,
      graph: privateVariant ? null : graph,
    }),
    body,
  };
}

function listingView(data, { canonical }) {
  const { item, shop } = data;
  const store = storeAddress(shop.slug);
  const crumbs = [['Sellio', '/'], ['Explore', '/explore'], [shop.name, storePath(shop.slug)], [item.name, listingPath(item.id)]];
  const price = money(item.price, shop.currency);
  const kind = shop.home ? 'home seller' : 'shop';
  const country = countryOf('', shop.currency);
  const title = fitTitle(`${item.name} – ${shop.name} | Sellio`, `${item.name} – ${shop.name}`, `${item.name} | Sellio`);
  const description = clip(`${item.name}${price ? ` – ${price}` : ''} from ${shop.name}, a ${kind} on Sellio. ${item.description || `Order it online from ${shop.name}.`}`, 160);
  const was = item.compare != null && item.price != null && item.compare > item.price ? ` <s>${esc(money(item.compare, shop.currency))}</s>` : '';
  const images = item.images.map((src, i) => `<img src="${esc(src)}" alt="${esc(i ? `${item.name}, photo ${i + 1}` : item.name)}" loading="lazy" decoding="async" />`).join('');
  const optionsHtml = item.options.length
    ? `<section aria-labelledby="sellio-edge-options"><h2 id="sellio-edge-options">Options</h2><ul>${item.options.map((g) => `<li>${esc(g.name)}: ${esc(g.options.map((o) => `${o.label}${o.extra ? ` (+${money(o.extra, shop.currency)})` : ''}`).join(', '))}</li>`).join('')}</ul></section>`
    : '';
  const moreHtml = data.more.length
    ? `<section aria-labelledby="sellio-edge-more"><h2 id="sellio-edge-more">More from ${esc(shop.name)}</h2><ul>${data.more.map((m) => `<li><a href="${esc(listingPath(m.id))}">${esc(m.name)}</a>${m.price != null ? ` – ${esc(money(m.price, shop.currency))}` : ''}</li>`).join('')}</ul></section>`
    : '';
  const how = `Order ${esc(item.name)} from <a href="${esc(storePath(shop.slug))}">${esc(shop.name)}</a>’s storefront on Sellio`
    + (data.selling ? `: ${esc(data.selling.summary)}.` : '.')
    + (shop.home ? ' Buying from a home seller needs a free Sellio account, which holds the order and its QR code for collection or delivery.' : '');
  const body = edgeBody(`${crumbsHtml(crumbs)}<article><h1>${esc(item.name)}</h1>`
    + `<p>${price ? `<strong>${esc(price)}</strong>${was} · ` : ''}${item.soldOut ? 'Sold out' : 'Available to order'}</p>`
    + `<p>Sold by <a href="${esc(storePath(shop.slug))}">${esc(shop.name)}</a>, a ${kind} in ${esc(country.name)} on Sellio${shop.count > 1 ? ` with ${esc(plural(shop.count, 'item', 'items'))}` : ''}.`
    + `${shop.rating ? ` ${esc(shop.name)} is rated ${shop.rating.value.toFixed(1)} out of 5 by ${esc(plural(shop.rating.count, 'buyer', 'buyers'))}.` : ''}`
    + `${item.listedAt ? ` Listed on Sellio on ${esc(longDate(item.listedAt))}.` : ''}</p>`
    + images
    + (item.description ? `<section aria-labelledby="sellio-edge-about"><h2 id="sellio-edge-about">About this item</h2>${paragraphs(item.description)}</section>` : '')
    + optionsHtml
    + `<section aria-labelledby="sellio-edge-order"><h2 id="sellio-edge-order">How to order</h2><p>${how}</p></section>`
    + `${moreHtml}</article><p><a href="/explore">Explore more shops and items on Sellio</a></p>`);

  const productId = `${canonical}#product`;
  const product = item.price != null ? {
    '@type': 'Product',
    '@id': productId,
    name: item.name,
    url: canonical,
    sku: item.id,
    ...(item.description ? { description: clip(item.description, 5000) } : {}),
    ...(item.images.length ? { image: item.images } : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      price: schemaPrice(item.price, shop.currency),
      priceCurrency: shop.currency,
      availability: item.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      ...(item.compare != null && item.compare > item.price ? {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          priceType: 'https://schema.org/StrikethroughPrice',
          price: schemaPrice(item.compare, shop.currency),
          priceCurrency: shop.currency,
        },
      } : {}),
      seller: { '@type': 'Organization', '@id': `${store}#shop`, name: shop.name, url: store },
    },
  } : null;
  const graph = [
    {
      '@type': 'ItemPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
      ...(item.listedAt ? { datePublished: item.listedAt } : {}),
      ...(product ? { mainEntity: { '@id': productId } } : {}),
      ...(item.images[0] ? { primaryImageOfPage: { '@type': 'ImageObject', url: item.images[0] } } : {}),
    },
    ...(product ? [product] : []),
    crumbsGraph(`${canonical}#breadcrumb`, crumbs),
    WEBSITE,
    ORGANIZATION,
  ];
  const meta = item.price != null ? [['product:price:amount', schemaPrice(item.price, shop.currency)], ['product:price:currency', shop.currency]] : [];
  return {
    status: 200,
    head: headTags({ title, description, robots: PUBLIC_ROBOTS, canonical, image: item.images[0] || shop.logo, imageAlt: item.name, ogType: 'product', graph, meta }),
    body,
  };
}

function exploreView(data, { canonical }) {
  const crumbs = [['Sellio', '/'], ['Explore', '/explore']];
  const title = 'Explore shops and items · Sellio';
  const description = withExamples('Browse shops and home sellers on Sellio and order from them directly, no account needed', data.shops.slice(0, 3).map((s) => s.name));
  const shopsHtml = data.shops.length
    ? `<section aria-labelledby="sellio-edge-shops"><h2 id="sellio-edge-shops">Shops on Sellio (${data.shops.length})</h2><ul>${data.shops.map((s) => `<li><a href="${esc(storePath(s.slug))}">${esc(s.name)}</a> – ${s.home ? 'home seller' : 'shop'}, ${esc(plural(s.count, 'item', 'items'))}</li>`).join('')}</ul></section>`
    : '';
  const itemsHtml = data.items.length
    ? `<section aria-labelledby="sellio-edge-latest"><h2 id="sellio-edge-latest">Latest items</h2><ul>${data.items.map((item) => `<li><a href="${esc(listingPath(item.id))}">${esc(item.name)}</a>${item.price != null ? ` – ${esc(money(item.price, item.currency))}` : ''} from <a href="${esc(storePath(item.slug))}">${esc(item.shop || item.slug)}</a></li>`).join('')}</ul></section>`
    : '';
  const body = edgeBody(`${crumbsHtml(crumbs)}<h1>Explore shops and items on Sellio</h1>`
    + '<p>Sellio Explore is a public feed of items from shops and home sellers on Sellio. Browse without an account, then order straight from the seller’s own storefront.</p>'
    + `${shopsHtml}${itemsHtml}`
    + '<section aria-labelledby="sellio-edge-sell"><h2 id="sellio-edge-sell">Sell on Sellio</h2><p>Run a café, a shop or a business from home? <a href="/">See how Sellio works and what it costs</a>.</p></section>');
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
      mainEntity: { '@id': `${canonical}#shops` },
    },
    {
      '@type': 'ItemList',
      '@id': `${canonical}#shops`,
      name: 'Shops on Sellio',
      numberOfItems: data.shops.length,
      itemListElement: data.shops.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: storeAddress(s.slug), name: s.name })),
    },
    {
      '@type': 'ItemList',
      '@id': `${canonical}#latest`,
      name: 'Latest items on Sellio',
      numberOfItems: data.items.length,
      itemListElement: data.items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, url: listingAddress(item.id), name: item.name })),
    },
    crumbsGraph(`${canonical}#breadcrumb`, crumbs),
    WEBSITE,
    ORGANIZATION,
  ];
  return { status: 200, head: headTags({ title, description, robots: PUBLIC_ROBOTS, canonical, graph }), body };
}

// Without the database (and nothing kept): the page as before, with its own address as canonical.
function fallbackView(kind, canonical) {
  const words = {
    store: ['Sellio storefront', 'A shop on Sellio. Browse its items and order online.'],
    listing: ['An item on Sellio', 'An item from a shop on Sellio. Order it online.'],
    explore: ['Explore shops and items · Sellio', 'Browse shops and home sellers on Sellio, and order from them directly.'],
  }[kind];
  return { status: 200, head: headTags({ title: words[0], description: words[1], robots: PUBLIC_ROBOTS, canonical }), body: '', fallback: true };
}

function withEdge(shell, { head, body }) {
  let html = shell;
  if (head) html = EDGE_HEAD.test(html) ? html.replace(EDGE_HEAD, () => head) : html.replace(/<title>[\s\S]*?<\/title>/i, () => head);
  if (body && html.includes(ROOT)) html = html.replace(ROOT, () => `${body}\n    ${ROOT}`);
  return html;
}

// The page's shell from Pages (store.html or explore.html), with the page written in.
async function edgePage(env, request, url, shellPath, view) {
  const shell = await fromPages(env, new Request(url.toString(), { method: 'GET' }), url, shellPath);
  if (shell.status !== 200) return page(env, request, url, shellPath);
  const html = await shell.text();
  const info = {};
  let written;
  try {
    written = await view(info);
  } catch (error) {
    console.error(`Sellio edge: ${url.pathname} was sent without its content.`, String(error?.message || error));
    written = null;
  }
  const headers = new Headers(shell.headers);
  for (const name of ['ETag', 'Last-Modified', 'Content-Length', 'Content-Encoding']) headers.delete(name);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  headers.set('X-Sellio-Edge', written && !written.fallback ? 'written' : 'fallback');
  if (info.cache) headers.set('X-Sellio-Edge-Cache', info.cache);
  return new Response(request.method === 'HEAD' ? null : withEdge(html, written || {}), { status: written?.status || 200, headers });
}

async function storeEdge(env, ctx, url, rawSlug, info) {
  let slug;
  try { slug = decodeURIComponent(rawSlug).trim(); } catch { return missingView('store'); }
  if (!slug || slug.length > 120) return missingView('store');
  const canonical = storeAddress(slug);
  const privateVariant = url.searchParams.get('preview') === 'true' || url.searchParams.get('staff') === 'true';
  let data;
  try {
    data = await edgeCached(ctx, `store/${encodeURIComponent(slug)}`, () => loadStore(env, ctx, slug), info);
  } catch (error) {
    console.error(`Sellio edge: shop ${slug} could not be read.`, String(error?.message || error));
    return fallbackView('store', canonical);
  }
  if (!data) return missingView('store');
  const shops = await shopsList(env, ctx).catch(() => []);
  return storeView(data, { canonical: storeAddress(data.shop.slug), privateVariant, shops });
}

async function listingEdge(env, ctx, rawId, info) {
  let id;
  try { id = decodeURIComponent(rawId).trim(); } catch { return missingView('listing'); }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return missingView('listing');
  const canonical = listingAddress(id);
  let data;
  try {
    data = await edgeCached(ctx, `listing/${encodeURIComponent(id)}`, () => loadListing(env, id), info);
  } catch (error) {
    console.error(`Sellio edge: item ${id} could not be read.`, String(error?.message || error));
    return fallbackView('listing', canonical);
  }
  return data ? listingView(data, { canonical }) : missingView('listing');
}

async function exploreEdge(env, ctx, info) {
  const canonical = `${SITE}/explore`;
  try {
    return exploreView(await edgeCached(ctx, 'explore', () => loadExplore(env, ctx), info), { canonical });
  } catch (error) {
    console.error('Sellio edge: Explore could not be read.', String(error?.message || error));
    return fallbackView('explore', canonical);
  }
}

// sellio.sg/llms.txt (llmstxt.org): the file in public/, then the shops on Explore, so AI tools
// that read it find each shop's storefront. Without the database, the file alone.
async function llms(env, request, url, ctx) {
  const file = await env.ASSETS.fetch(new Request(new URL('/llms.txt', url), { method: 'GET' }));
  if (file.status !== 200) return file;
  let text = await file.text();
  try {
    const shops = await shopsList(env, ctx);
    if (shops.length) {
      const name = (value) => value.replace(/[[\]\\]/g, (c) => `\\${c}`);
      text = `${text.trimEnd()}\n\n## Shops on Sellio\n\nShops and home sellers listed on Sellio Explore, each with its own storefront:\n\n`
        + shops.map((s) => `- [${name(s.name)}](${storeAddress(s.slug)}): ${s.home ? 'home seller' : 'shop'}, ${plural(s.count, 'item', 'items')}`).join('\n')
        + '\n';
    }
  } catch (error) {
    console.error('Sellio llms.txt: the shops could not be read, so the file alone is served.', String(error?.message || error));
  }
  return new Response(request.method === 'HEAD' ? null : text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

// Where a visitor is, for Explore's location pin (Alvin, 28 Nov 2026: "make it detect where the
// location is and immediately show that location items"): the country Cloudflare sees the request
// come from, as an ISO code (SG, MY, ID, …), or null when it can't tell (XX) or it's Tor (T1). Only
// the country: no address, nothing kept. Sellio's app asks from its own pages (another origin), so
// any page may read the answer; every visitor gets their own (no-store).
function visitorCountryAnswer(request) {
  const code = String(request.cf?.country || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null;
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ country }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // www.sellio.sg → sellio.sg, same address: one address to sign in on (Google and emailed
    // sign-in links return to sellio.sg). Files on www (not run through here) are served as is.
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (MOVED_HOSTS.has(url.hostname)) {
      return Response.redirect(SITE + (REDIRECTS[url.pathname] || url.pathname) + url.search, 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const { pathname } = url;

    if (pathname === '/api/country') return visitorCountryAnswer(request);

    const to = REDIRECTS[pathname];
    if (to) return Response.redirect(new URL(to + url.search, url).toString(), 301);

    if (pathname === '/sitemap.xml') return sitemap(env, request, url, ctx);
    if (pathname === '/llms.txt') return llms(env, request, url, ctx);

    if (pathname === '/') return page(env, request, url, '/');
    if (pathname === '/privacy' || pathname === '/terms') return page(env, request, url, `${pathname}/`);

    // One address per page: the same without a last "/".
    const store = /^\/store\/([^/]+)\/?$/.exec(pathname);
    const listing = /^\/listing\/([^/]+)\/?$/.exec(pathname);
    if (pathname === '/explore/' || ((store || listing) && pathname.endsWith('/'))) {
      return Response.redirect(new URL(pathname.slice(0, -1) + url.search, url).toString(), 301);
    }
    if (store) return edgePage(env, request, url, '/store', (info) => storeEdge(env, ctx, url, store[1], info));
    // /store/ alone or with more after the shop: no such storefront.
    if (pathname.startsWith('/store/')) return edgePage(env, request, url, '/store', () => missingView('store'));
    if (pathname === '/explore') return edgePage(env, request, url, '/explore', (info) => exploreEdge(env, ctx, info));
    if (listing) return edgePage(env, request, url, '/explore', (info) => listingEdge(env, ctx, listing[1], info));

    // A file _routes.json doesn't list (one added at the top level later, say): as Pages has it.
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (name.includes('.') && !name.endsWith('.html')) return env.ASSETS.fetch(request);

    return page(env, request, url, '/app');
  },
};
