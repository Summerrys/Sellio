// Sellio's website on Cloudflare Pages ("advanced mode": Pages runs this for each page
// address). Which page each address gets, as the earlier host's _redirects had it:
//   www.<domain>/…        →  301 to the same address without www
//   sellio.apptelier.sg/… and sellio-f1t.pages.dev/…  →  301 to the same address on sellio.sg
//                            (except /google-signin)
//   /Privacy, /privacy/, /Terms, /terms/, /index.html  →  301 to /privacy, /terms, /
//   /                     → index.html (the landing page, prerendered)
//   /privacy, /terms      → privacy/index.html, terms/index.html
//   /store/…              → store.html (a shop's storefront)
//   /explore, /listing/…  → explore.html (Explore and its items: public, unlike app.html)
//   /sitemap.xml          → every public shop and item, from the database (sitemap below)
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
// (_routes.json) are still served as they are. /google-signin stays: Base44's old Android
// app opens Google sign-in there (src/lib/googleRelay.js). Preview deployments
// (<id>.sellio-f1t.pages.dev) are left alone.
const SITE = 'https://sellio.sg';
const MOVED_HOSTS = new Set(['sellio.apptelier.sg', 'sellio-f1t.pages.dev']);
const STAYS_ON_OLD_HOST = new Set(['/google-signin']);

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
// key, the one the app itself ships with (src/lib/supabaseClient.js).
const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6a3R1dGVlZGJ0bmF4ZmR5bHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzY2NzIsImV4cCI6MjA5MDU1MjY3Mn0.zZL0Tyizzj3U8JTggYYKZ8BFrhDOKAzwISGNPJDAFzg';
const SITEMAP_PAGES = ['/', '/explore', '/privacy', '/terms'];
// The same addresses the app links to (storeUrl, listingUrl in src/components/explore/shared.jsx).
const SITEMAP_ADDRESS = {
  shop: (key) => `/store/${encodeURIComponent(key)}`,
  item: (key) => `/listing/${encodeURIComponent(key)}`,
};
const SITEMAP_SECONDS = 3600;

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
    const answer = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sitemap_pages`, {
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

export default {
  async fetch(request, env, ctx) {
    // www.sellio.sg → sellio.sg, same address: one address to sign in on (Google and emailed
    // sign-in links return to sellio.sg). Files on www (not run through here) are served as is.
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (MOVED_HOSTS.has(url.hostname) && !STAYS_ON_OLD_HOST.has(url.pathname)) {
      return Response.redirect(SITE + (REDIRECTS[url.pathname] || url.pathname) + url.search, 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const { pathname } = url;

    const to = REDIRECTS[pathname];
    if (to) return Response.redirect(new URL(to + url.search, url).toString(), 301);

    if (pathname === '/sitemap.xml') return sitemap(env, request, url, ctx);

    if (pathname === '/') return page(env, request, url, '/');
    if (pathname === '/privacy' || pathname === '/terms') return page(env, request, url, `${pathname}/`);
    if (pathname.startsWith('/store/')) return page(env, request, url, '/store');
    if (pathname === '/explore' || /^\/listing\/[^/]+$/.test(pathname)) return page(env, request, url, '/explore');

    // A file _routes.json doesn't list (one added at the top level later, say): as Pages has it.
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (name.includes('.') && !name.endsWith('.html')) return env.ASSETS.fetch(request);

    return page(env, request, url, '/app');
  },
};
