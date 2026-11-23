// scripts/indexnow.mjs (node verification/indexnow.test.mjs): which sitemap pages it sends to
// IndexNow, and what it sends. No network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KEY, KEY_LOCATION, body, parseSitemap, pick } from '../scripts/indexnow.mjs';

const passed = (name) => console.log(`PASS ${name}`);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sellio.sg/</loc></url>
  <url><loc>https://sellio.sg/explore</loc></url>
  <url><loc>https://sellio.sg/store/o&apos;neil%20%26%20co</loc><lastmod>2026-11-23T08:00:00.000Z</lastmod></url>
  <url><loc>https://sellio.sg/listing/p-1</loc><lastmod>2026-11-20T08:00:00.000Z</lastmod></url>
  <url><loc>https://sellio.sg/listing/p-2</loc><lastmod>not a date</lastmod></url>
  <url><loc>https://elsewhere.example.com/x</loc><lastmod>2026-11-23T08:00:00.000Z</lastmod></url>
</urlset>`;

const pages = parseSitemap(xml);
assert.deepEqual(pages.map((p) => p.loc), [
  'https://sellio.sg/',
  'https://sellio.sg/explore',
  "https://sellio.sg/store/o'neil%20%26%20co",
  'https://sellio.sg/listing/p-1',
  'https://sellio.sg/listing/p-2',
]);
assert.equal(pages[2].lastmod.toISOString(), '2026-11-23T08:00:00.000Z');
assert.equal(pages[4].lastmod, null);
passed('sitemap: sellio.sg pages with their dates; other hosts and bad dates left out');

assert.deepEqual(pick(pages, { since: new Date('2026-11-23T01:00:00Z') }), ["https://sellio.sg/store/o'neil%20%26%20co"]);
assert.deepEqual(pick(pages, { since: new Date('2026-11-19T00:00:00Z') }), ["https://sellio.sg/store/o'neil%20%26%20co", 'https://sellio.sg/listing/p-1']);
assert.equal(pick(pages, { all: true }).length, 5);
assert.deepEqual(pick([...pages, ...pages], { all: true }), pick(pages, { all: true }), 'Each page once');
passed('pick: the pages changed since the last run, or all of them');

assert.deepEqual(body(['https://sellio.sg/']), {
  host: 'sellio.sg', key: KEY, keyLocation: `https://sellio.sg/${KEY}.txt`, urlList: ['https://sellio.sg/'],
});
assert.equal(KEY_LOCATION, `https://sellio.sg/${KEY}.txt`);
assert.equal(await readFile(`public/${KEY}.txt`, 'utf8'), KEY, 'The key file holds the key');
const routes = JSON.parse(await readFile('public/_routes.json', 'utf8'));
assert.ok(routes.exclude.includes(`/${KEY}.txt`), 'Pages serves the key file itself');
passed('what is sent: the host, the key and where to check it');
