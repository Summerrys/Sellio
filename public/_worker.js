// Sellio's website on Cloudflare Pages ("advanced mode": Pages runs this for each page
// address). Which page each address gets, as the earlier host's _redirects had it:
//   /Privacy, /privacy/, /Terms, /terms/, /index.html  →  301 to /privacy, /terms, /
//   /                     → index.html (the landing page, prerendered)
//   /privacy, /terms      → privacy/index.html, terms/index.html
//   /store/…              → store.html (a shop's storefront)
//   any other address     → app.html (the app: sign-in, a shop's workspace, Explore…)
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

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    const { pathname } = url;

    const to = REDIRECTS[pathname];
    if (to) return Response.redirect(new URL(to + url.search, url).toString(), 301);

    if (pathname === '/') return page(env, request, url, '/');
    if (pathname === '/privacy' || pathname === '/terms') return page(env, request, url, `${pathname}/`);
    if (pathname.startsWith('/store/')) return page(env, request, url, '/store');

    // A file _routes.json doesn't list (one added at the top level later, say): as Pages has it.
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (name.includes('.') && !name.endsWith('.html')) return env.ASSETS.fetch(request);

    return page(env, request, url, '/app');
  },
};
