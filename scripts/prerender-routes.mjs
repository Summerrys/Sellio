import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const template = await readFile('dist/index.html', 'utf8');
const serverBundle = pathToFileURL(`${process.cwd()}/.prerender/entry-server.js`).href;
const { PRERENDER_ROUTES, renderRoute } = await import(serverBundle);

const SEO_BLOCK = /<!-- ROUTE_SEO_START -->[\s\S]*?<!-- ROUTE_SEO_END -->/;

// The prerender serves crawlers and the website's first paint; Sellio replaces it at
// once, and index.html hides it everywhere else (the host serves this page for every
// address). So its video never preloads or autoplays, and its images are lazy, which
// keeps them from downloading while hidden.
const inertMedia = (html) => html
  .replace(/<video\b[^>]*>/g, (tag) => tag
    .replace(/\sautoplay(?:="[^"]*")?(?=[\s/>])/g, '')
    .replace(/\spreload="[^"]*"/g, '')
    .replace(/^<video\b/, '<video preload="none"'))
  .replace(/<img\b[^>]*>/g, (tag) => {
    const lazy = tag.replace(/\sfetchpriority="[^"]*"/g, '').replace(/\sloading="[^"]*"/g, '');
    return lazy.replace(/^<img\b/, '<img loading="lazy"');
  });
const ROOT = '<div id="root"></div>';

if (!SEO_BLOCK.test(template)) throw new Error('Missing ROUTE_SEO markers in index.html.');
if (!template.includes(ROOT)) throw new Error('Missing empty React root in index.html.');

const appShell = template
  .replace(
    SEO_BLOCK,
    '<title>Sellio</title>\n<meta name="robots" content="noindex, nofollow" />'
  )
  .replace(ROOT, ROOT);

await writeFile('dist/app.html', appShell);

// Public storefronts remain client-rendered because their metadata/content is
// tenant-specific. Keep this shell crawlable by default; preview/staff variants
// are still switched to noindex by RouteIndexingGuard in the browser.
const storeShell = template
  .replace(SEO_BLOCK, '<title>Sellio Storefront</title>')
  .replace(ROOT, ROOT);
await writeFile('dist/store.html', storeShell);

for (const path of PRERENDER_ROUTES) {
  const { html, head } = renderRoute(path);
  if (!html || html.length < 1000) throw new Error(`Prerender output for ${path} is unexpectedly small.`);
  if (!/<h1[\s>]/i.test(html)) throw new Error(`Prerender output for ${path} has no H1.`);
  if (!/<a[\s>]/i.test(html)) throw new Error(`Prerender output for ${path} has no links.`);

  const output = template
    .replace(SEO_BLOCK, head)
    .replace(
      ROOT,
      `<div id="sellio-prerender" data-prerendered="true">${inertMedia(html)}</div>\n    ${ROOT}`
    );

  const directory = path === '/' ? 'dist' : `dist${path}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, output);
  console.log(`Prerendered ${path}`);
}
