// The last step of `npm run build` for the website. Cloudflare Pages builds Sellio's website with
// it (HOSTING.md) and sets CF_PAGES=1 while it does. Pages follows a _redirects rule even where a
// file exists, so the earlier host's catch-all (/* /app.html 200) would answer every script,
// style and picture with the app page. On Pages, _worker.js does the routing instead, and the
// earlier hosts' _redirects and .htaccess stay out of what Pages publishes.
// Anywhere else (a local build, the apps' build), that part does nothing.
// Browser alerts' settings (dist/web-push.json) are written wherever they are set: on Pages, from
// its settings (scripts/web-push-config.mjs).
import { rm, stat } from 'node:fs/promises';
import { writeWebPushConfig } from './web-push-config.mjs';

if (process.env.CF_PAGES === '1') {
  for (const name of ['_worker.js', '_routes.json', '_headers', '404.html']) {
    await stat(`dist/${name}`).catch(() => {
      throw new Error(`dist/${name} is missing: Sellio on Cloudflare Pages needs it (HOSTING.md).`);
    });
  }
  await rm('dist/_redirects', { force: true });
  await rm('dist/.htaccess', { force: true });
  console.log('Cloudflare Pages: _worker.js routes the pages; _redirects and .htaccess are left out.');
}

await writeWebPushConfig('dist');
