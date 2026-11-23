import { access, readFile, stat } from 'node:fs/promises';

// Each page names its sellio.sg address as canonical (null would mean a page served at every
// address, which must name none). '/' is served only at "/" (public/_worker.js).
const routes = {
  '/': ['Commerce has a place to grow.', 'https://sellio.sg/'],
  '/privacy': ['Privacy Policy', 'https://sellio.sg/privacy'],
  '/terms': ['Terms and Conditions', 'https://sellio.sg/terms'],
};
// The structured data (schema.org JSON-LD) each prerendered page carries for crawlers that run no
// scripts: the start page says who Sellio is (src/components/landing/landingSchema.js).
const schemaTypes = {
  '/': ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'],
  '/privacy': ['WebPage'],
  '/terms': ['WebPage'],
};
// Every JSON-LD block in a page, parsed; a block that isn't valid JSON is a failure.
function jsonLdTypes(html, label) {
  const types = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1]);
      for (const node of data['@graph'] || [data]) types.push(...[].concat(node['@type']));
    } catch (error) {
      failures.push(`${label}: structured data is not valid JSON (${error.message})`);
    }
  }
  return types;
}

const SHARE_IMAGE = 'https://sellio.sg/og/sellio-share.jpg';
const INDEXNOW_KEY = '1f3882ad422aa7f69880e733ef9d710f'; // scripts/indexnow.mjs
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
  const types = jsonLdTypes(html, path);
  for (const type of schemaTypes[path]) {
    if (!types.includes(type)) failures.push(`${path}: ${type} structured data missing`);
  }
  if (types.length !== new Set(types).size) failures.push(`${path}: the same structured data twice (${types.join(', ')})`);
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

// The storefront and Explore shells: public/_worker.js writes each page's head between the
// SELLIO_EDGE_HEAD markers and its content before the empty root.
for (const file of ['store.html', 'explore.html']) {
  const shell = await readFile(`dist/${file}`, 'utf8').catch(() => '');
  if (!shell.includes('<div id="root"></div>')) failures.push(`${file}: missing, or its SPA root is not empty`);
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(shell)) failures.push(`${file}: a public page's shell must not be noindex`);
  if (!/<!-- SELLIO_EDGE_HEAD -->\s*<title>[^<]+<\/title>\s*<!-- \/SELLIO_EDGE_HEAD -->/.test(shell)) {
    failures.push(`${file}: the SELLIO_EDGE_HEAD markers (around its title) are missing`);
  }
  if (/rel="canonical"|property="og:url"/.test(shell)) failures.push(`${file}: served at many addresses, so it must name no canonical itself`);
}

const redirects = await readFile('dist/_redirects', 'utf8');
for (const line of ['/ /index.html 200', '/privacy /privacy/index.html 200', '/terms /terms/index.html 200', '/store/* /store.html 200', '/explore /explore.html 200', '/listing/* /explore.html 200', '/* /app.html 200']) {
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
  // The worker makes /sitemap.xml from the database; listed here, Pages would serve the fixed file.
  if (routes.exclude?.includes('/sitemap.xml')) failures.push('_routes.json: /sitemap.xml must go through _worker.js');
  // And /llms.txt, with the shops on Explore added.
  if (routes.exclude?.includes('/llms.txt')) failures.push('_routes.json: /llms.txt must go through _worker.js');
  if (!routes.exclude?.includes(`/${INDEXNOW_KEY}.txt`)) failures.push(`_routes.json: /${INDEXNOW_KEY}.txt (IndexNow's key) should be left to Pages`);
} catch (error) {
  failures.push(`_routes.json: ${error.message}`);
}
const worker = await readFile('dist/_worker.js', 'utf8').catch(() => '');
for (const route of ["'/store'", "'/explore'", "'/app'", "'/sitemap.xml'", "/rest/v1/rpc/sitemap_pages", "'/Privacy': '/privacy'", "'sellio.apptelier.sg'", "const SITE = 'https://sellio.sg'",
  "'/llms.txt'", '<!-- SELLIO_EDGE_HEAD -->', "'get_storefront_tenant'", "'explore_item'", "'explore_shops'", "'explore_feed'"]) {
  if (!worker.includes(route)) failures.push(`_worker.js: ${route} routing missing`);
}

// Bing Webmaster Tools verifies sellio.sg by this tag in the home page's head, now and later.
const home = await readFile('dist/index.html', 'utf8').catch(() => '');
const head = home.split('</head>')[0];
if (!head.includes('<meta name="msvalidate.01" content="2791838D4B843C4AA43170B569418838" />')) failures.push('index.html: the Bing verification tag (msvalidate.01) is missing from the head');

// robots.txt: open to every crawler, with the sitemap and the content signals.
const robots = await readFile('dist/robots.txt', 'utf8').catch(() => '');
if (!robots.includes('Sitemap: https://sellio.sg/sitemap.xml')) failures.push('robots.txt: the Sitemap line is missing');
if (!/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m.test(robots)) failures.push('robots.txt: the Content-Signal line is missing or changed');
if (/^Disallow:\s*\/\s*$/m.test(robots)) failures.push('robots.txt: must not shut crawlers out');

// IndexNow (scripts/indexnow.mjs): the key file at the top of the site, holding the key.
const indexNowKey = await readFile(`dist/${INDEXNOW_KEY}.txt`, 'utf8').catch(() => '');
if (indexNowKey !== INDEXNOW_KEY) failures.push(`${INDEXNOW_KEY}.txt: IndexNow's key file is missing or wrong`);

// The ChatGPT ads Pixel (index.html's #sellio-openai-pixel) is in every website page's head, once;
// the script itself decides where it runs. scripts/build-app.mjs takes it out of the apps' copy.
for (const file of ['dist/index.html', 'dist/privacy/index.html', 'dist/terms/index.html', 'dist/app.html', 'dist/store.html', 'dist/explore.html']) {
  const html = await readFile(file, 'utf8').catch(() => '');
  const count = (html.match(/<script id="sellio-openai-pixel">/g) || []).length;
  if (count !== 1) failures.push(`${file}: the ChatGPT ads Pixel script appears ${count} times (expected once)`);
  else if (html.indexOf('<script id="sellio-openai-pixel">') > html.indexOf('</head>')) failures.push(`${file}: the ChatGPT ads Pixel must be in the head`);
}

if (failures.length) throw new Error('Sellio prerender validation failed:\n' + failures.join('\n'));
console.log('Sellio prerender validation passed for 3 public routes.');
