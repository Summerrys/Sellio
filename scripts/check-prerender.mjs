import { access, readFile, stat } from 'node:fs/promises';

// Each page names its sellio.sg address as canonical (null would mean a page served at every
// address, which must name none). '/' is served only at "/" (public/_worker.js).
const routes = {
  '/': ['Commerce has a place to grow.', 'https://sellio.sg/'],
  '/privacy': ['Privacy Policy', 'https://sellio.sg/privacy'],
  '/terms': ['Terms and Conditions', 'https://sellio.sg/terms'],
};

const SHARE_IMAGE = 'https://sellio.sg/og/sellio-share.jpg';
const failures = [];

for (const [path, [signature, canonical]] of Object.entries(routes)) {
  const file = `dist${path === '/' ? '' : path}/index.html`;
  try {
    await access(file);
  } catch {
    failures.push(`${path}: prerendered HTML missing`);
    continue;
  }

  const html = await readFile(file, 'utf8');
  if (!html.includes('id="sellio-prerender" data-prerendered="true"')) failures.push(`${path}: prerender marker missing`);
  if (!html.includes('<div id="root"></div>')) failures.push(`${path}: SPA root should remain empty`);
  if (!html.includes(signature)) failures.push(`${path}: visible route content missing`);
  if (canonical === null) {
    if (/rel="canonical"/i.test(html)) failures.push(`${path}: served at every address, so it must not name a canonical`);
    if (/property="og:url"/i.test(html)) failures.push(`${path}: served at every address, so it must not name an og:url`);
  } else {
    if (!html.includes(`rel="canonical" href="${canonical}"`) && !html.includes(`href="${canonical}" rel="canonical"`)) {
      failures.push(`${path}: canonical missing or incorrect`);
    }
    if (!html.includes(`property="og:url" content="${canonical}"`)) failures.push(`${path}: og:url missing or incorrect`);
    if ((html.match(/rel="canonical"/g) || []).length !== 1) failures.push(`${path}: more than one canonical`);
  }
  if (!html.includes(`property="og:image" content="${SHARE_IMAGE}"`)) failures.push(`${path}: og:image is not the share card`);
  if (!html.includes('property="og:image:width" content="1200"') || !html.includes('property="og:image:height" content="630"')) {
    failures.push(`${path}: og:image size tags missing`);
  }
  if (!/<h1[\s>]/i.test(html)) failures.push(`${path}: H1 missing`);
  if (!/<a[\s>]/i.test(html)) failures.push(`${path}: outgoing/internal links missing`);
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(html)) failures.push(`${path}: public route is noindex`);
  if (!/<script[^>]+type="module"[^>]+src="\/assets\//i.test(html)) failures.push(`${path}: client bundle missing`);
}

// WhatsApp shows no preview image when the file is over 600 KB.
try {
  const { size } = await stat('dist/og/sellio-share.jpg');
  if (size > 600 * 1024) failures.push(`og/sellio-share.jpg: ${size} bytes, over WhatsApp's 600 KB limit`);
} catch {
  failures.push('og/sellio-share.jpg: missing from the build');
}

const appShell = await readFile('dist/app.html', 'utf8');
if (!appShell.includes('<div id="root"></div>')) failures.push('app.html: SPA root should stay empty');
if (!/name="robots"[^>]*content="noindex, nofollow"/i.test(appShell)) failures.push('app.html: noindex missing');

const storeShell = await readFile('dist/store.html', 'utf8');
if (!storeShell.includes('<div id="root"></div>')) failures.push('store.html: SPA root should stay empty');
if (/name="robots"[^>]*content="[^"]*noindex/i.test(storeShell)) failures.push('store.html: public storefront shell must not be noindex');

const redirects = await readFile('dist/_redirects', 'utf8');
for (const line of ['/ /index.html 200', '/privacy /privacy/index.html 200', '/terms /terms/index.html 200', '/store/* /store.html 200', '/* /app.html 200']) {
  if (!redirects.includes(line)) failures.push(`_redirects: missing ${line}`);
}

// Cloudflare Pages (HOSTING.md): the worker that routes the pages, the files it leaves to
// Pages, their caching, and the page for a missing file.
for (const file of ['_worker.js', '_routes.json', '_headers', '404.html']) {
  await stat(`dist/${file}`).catch(() => failures.push(`${file}: missing from the build (Cloudflare Pages needs it)`));
}
try {
  const routes = JSON.parse(await readFile('dist/_routes.json', 'utf8'));
  if (routes.version !== 1 || !routes.include?.includes('/*') || !routes.exclude?.includes('/assets/*')) {
    failures.push('_routes.json: should send pages to _worker.js and leave /assets/* to Pages');
  }
} catch (error) {
  failures.push(`_routes.json: ${error.message}`);
}
const worker = await readFile('dist/_worker.js', 'utf8').catch(() => '');
for (const route of ["'/store'", "'/app'", "'/Privacy': '/privacy'", "'sellio.apptelier.sg'", "const SITE = 'https://sellio.sg'"]) {
  if (!worker.includes(route)) failures.push(`_worker.js: ${route} routing missing`);
}

if (failures.length) throw new Error('Sellio prerender validation failed:\n' + failures.join('\n'));
console.log('Sellio prerender validation passed for 3 public routes.');
