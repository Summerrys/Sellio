// sellio.sg/sitemap.xml (node verification/sitemap.test.mjs): public/_worker.js makes it from
// public.sitemap_pages() (every public shop and item), keeps it an hour, and serves the fixed
// sitemap.xml file when the database can't be reached. No network: Supabase, Cloudflare's cache
// and Pages' files are stand-ins.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { default: worker } = await import(pathToFileURL(path.resolve('public/_worker.js')).href);
const passed = (name) => console.log(`PASS ${name}`);

// Cloudflare's cache: one per location.
const kept = new Map();
globalThis.caches = {
  default: {
    match: async (request) => kept.get(new URL(request.url).href)?.clone(),
    put: async (request, response) => { kept.set(new URL(request.url).href, response); },
  },
};
// Pages' own files.
const assetCalls = [];
const env = {
  ASSETS: {
    fetch: async (request) => {
      assetCalls.push([request.method, new URL(request.url).pathname]);
      return new Response('<fixed sitemap/>', { headers: { 'Content-Type': 'application/xml' } });
    },
  },
};
const waits = [];
const ctx = { waitUntil: (promise) => waits.push(promise) };
// Supabase's REST API.
let calls = [];
let answer = () => new Response('[]', { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  calls.push({ url: String(input), method: init.method, headers: init.headers, body: init.body });
  return answer();
};
const get = (address, method = 'GET') => worker.fetch(new Request(address, { method }), env, ctx);

// 1. From the database: Sellio's pages, then every shop and item, each address as the app makes
//    it, with its date.
answer = () => Response.json([
  { kind: 'shop', key: 'beijing-dumplings', lastmod: '2026-11-02T14:34:55.903151+00:00' },
  { kind: 'shop', key: "o'neil & co", lastmod: '2026-10-29T10:06:34+00:00' },
  { kind: 'item', key: '35a9f64c-eef8-445d-a43a-44f27ecd65b2', lastmod: '2026-11-02T14:34:55+00:00' },
  { kind: 'item', key: 'no-date', lastmod: null },
  { kind: 'secret', key: 'x' },
  { kind: 'shop', key: '  ' },
  null,
]);
let response = await get('https://sellio.sg/sitemap.xml');
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), 'application/xml; charset=utf-8');
assert.equal(response.headers.get('Cache-Control'), 'public, max-age=3600');
let body = await response.text();
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://gzktuteedbtnaxfdylyu.supabase.co/rest/v1/rpc/sitemap_pages');
assert.equal(calls[0].method, 'POST');
assert.match(calls[0].headers.apikey, /^eyJ/);
assert.equal(calls[0].headers.Authorization, `Bearer ${calls[0].headers.apikey}`);
assert.ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(locs, [
  'https://sellio.sg/',
  'https://sellio.sg/explore',
  'https://sellio.sg/privacy',
  'https://sellio.sg/terms',
  'https://sellio.sg/store/beijing-dumplings',
  'https://sellio.sg/store/o&apos;neil%20%26%20co',
  'https://sellio.sg/listing/35a9f64c-eef8-445d-a43a-44f27ecd65b2',
  'https://sellio.sg/listing/no-date',
]);
assert.match(body, /<loc>https:\/\/sellio\.sg\/store\/beijing-dumplings<\/loc><lastmod>2026-11-02T14:34:55\.903Z<\/lastmod>/);
assert.match(body, /<loc>https:\/\/sellio\.sg\/listing\/no-date<\/loc><\/url>/, 'No date, no lastmod');
assert.doesNotMatch(body, /secret/);
assert.ok(body.trimEnd().endsWith('</urlset>'));
await Promise.all(waits);
passed('sitemap: Sellio\'s pages, then each shop and item from the database, with dates; unknown rows skipped');

// 2. Kept for an hour: the next visit doesn't ask the database.
calls = [];
response = await get('https://sellio.sg/sitemap.xml');
assert.equal(await response.text(), body);
assert.equal(calls.length, 0);
passed('sitemap: kept in Cloudflare\'s cache, so the database is asked at most once an hour per location');

// 3. The database can't be reached (or the function is missing): the fixed file.
kept.clear();
for (const failure of [() => new Response('{"code":"PGRST202"}', { status: 404 }), () => { throw new TypeError('network'); }]) {
  answer = failure;
  assetCalls.length = 0;
  const logged = console.error;
  console.error = () => {};
  response = await get('https://sellio.sg/sitemap.xml');
  console.error = logged;
  assert.equal(await response.text(), '<fixed sitemap/>');
  assert.deepEqual(assetCalls, [['GET', '/sitemap.xml']]);
  assert.equal(kept.size, 0, 'A failure is not kept');
}
passed('sitemap: without the database, the fixed sitemap.xml file');

// 4. The old addresses move to it; HEAD works.
response = await get('https://sellio.apptelier.sg/sitemap.xml');
assert.equal(response.status, 301);
assert.equal(response.headers.get('Location'), 'https://sellio.sg/sitemap.xml');
response = await get('https://www.sellio.sg/sitemap.xml');
assert.equal(response.status, 301);
assert.equal(response.headers.get('Location'), 'https://sellio.sg/sitemap.xml');
answer = () => Response.json([]);
response = await get('https://sellio.sg/sitemap.xml', 'HEAD');
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), 'application/xml; charset=utf-8');
passed('sitemap: the old addresses move to sellio.sg/sitemap.xml; HEAD works');
