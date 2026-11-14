// The web files Sellio's Android and iOS apps carry (Capacitor's webDir), made from the
// normal website build in dist/. The second-last step of `npm run build` (scripts/app-update.mjs
// then stamps and publishes them); `npm run build:app` adds `npx cap sync`, which copies them
// into the Android and iOS projects.
//
// The apps never show the landing page and aren't a website, so dist-app/ leaves out:
// - the landing page's media (assets/immersive*);
// - the files only a web host or a search engine reads (_redirects, .htaccess, Cloudflare
//   Pages' _worker.js, _routes.json, _headers and 404.html, robots.txt, sitemap.xml, llms.txt,
//   the share image), the prerendered /privacy and /terms copies, store.html and explore.html
//   (the web host's shells for those addresses; the app shows those pages itself, from its own
//   index.html), sw.js (the app registers no service worker), web-push.json (browser alerts'
//   settings, which only Cloudflare's build has: leaving it out keeps the apps' files the same
//   wherever they're built), and app-updates/ (these files themselves, published for the apps
//   by scripts/app-update.mjs).
// Its index.html is dist/app.html: the same page and scripts without the landing page's
// prerendered markup, which the app would only hide, and without the ChatGPT ads Pixel
// (index.html's #sellio-openai-pixel script): the apps measure no ads, and Apple and Google
// would count an ad pixel as tracking.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'dist';
const OUT = 'dist-app';
const LEFT_OUT = new Set([
  'assets/immersive',
  'assets/immersive-16x9',
  'assets/immersive-hd',
  '_redirects',
  '.htaccess',
  '_worker.js',
  '_routes.json',
  '_headers',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'web-push.json', // browser alerts' settings, the website's only (scripts/web-push-config.mjs)
  'og',
  'privacy',
  'terms',
  'store.html',
  'explore.html',
  'sw.js',
  'app-updates',
  'index.html', // replaced by app.html below
  'app.html',
]);

const PIXEL_SCRIPT = /\n[ \t]*<script id="sellio-openai-pixel">[\s\S]*?<\/script>/;
const PIXEL_TRACES = /sellio-openai-pixel|bzrcdn\.openai\.com|2bHx6GyaD53HN9UapJRGVS/;
const appShell = (await readFile(path.join(SRC, 'app.html'), 'utf8')).replace(PIXEL_SCRIPT, '');
if (PIXEL_TRACES.test(appShell)) {
  throw new Error('dist/app.html: the ChatGPT ads Pixel is still in the page the apps would carry.');
}
if (!/<script[^>]+type="module"[^>]+src="\/assets\/index-[^"]+\.js"/.test(appShell)) {
  throw new Error('dist/app.html has no entry script. Run the website build first.');
}
if (appShell.includes('id="sellio-prerender"')) {
  throw new Error('dist/app.html unexpectedly contains the landing prerender.');
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, {
  recursive: true,
  filter: (source) => {
    const rel = path.relative(SRC, source).split(path.sep).join('/');
    return rel === '' || !LEFT_OUT.has(rel);
  },
});
await writeFile(path.join(OUT, 'index.html'), appShell);

// A last look: every script and style the page names is in dist-app/.
const named = [...appShell.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
for (const file of named) {
  await stat(path.join(OUT, file)).catch(() => { throw new Error(`dist-app is missing ${file}`); });
}

// And nothing in dist-app/ loads or names the ChatGPT ads Pixel.
async function pixelTraces(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await pixelTraces(full));
    else if (/\.(?:html|js|mjs|css|json|txt|xml|webmanifest)$/.test(entry.name) && PIXEL_TRACES.test(await readFile(full, 'utf8'))) found.push(full);
  }
  return found;
}
const traces = await pixelTraces(OUT);
if (traces.length) throw new Error(`dist-app must not carry the ChatGPT ads Pixel: ${traces.join(', ')}`);

async function size(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await size(full) : (await stat(full)).size;
  }
  return total;
}
console.log(`dist-app ready: ${(await size(OUT) / 1048576).toFixed(1)} MB (${named.length} entry files checked).`);
