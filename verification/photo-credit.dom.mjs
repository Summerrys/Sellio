// Sample photos, credited (Alvin, 20 Nov 2026): from Pixabay now ("Let's go with using the
// pixabay"), from Unsplash before. src/lib/samplePhotos.js and src/components/ui-custom/
// PhotoCredit.jsx (used by the storefront, Explore's item page and Scan Menu's review; the scan's
// use is in scan-review.dom.mjs section 10):
//   • the credit kept for each photo still used, none for a photo replaced;
//   • "Sample photo · Photo by <name> on Pixabay", linking the photographer and Pixabay; a photo
//     saved from Unsplash before still says "on Unsplash", with Unsplash's links naming Sellio;
//   • search results say "Photos from Pixabay";
//   • the search's photos (only those that can be credited and copied), none found, a refusal in
//     its own words, anything that broke in plain words;
//   • the photos used copied into the shop's photos (8 at a time, each once), those that couldn't
//     be left out, a refusal in its own words.
// Run from the app root: node verification/photo-credit.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/store/cafe', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const temporary = await mkdtemp(path.join(app, '.photo-credit-verification-'));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const warned = [];
console.warn = (...args) => warned.push(args.join(' '));

try {
  const entry = path.join(temporary, 'entry.jsx');
  await writeFile(entry, "export * from '@/lib/samplePhotos';\nexport { PhotoCredit, PhotosFrom, SampleTag } from '@/components/ui-custom/PhotoCredit';\n");
  const outfile = path.join(temporary, 'bundle.mjs');
  await build({
    entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', logLevel: 'silent',
    alias: { '@': path.join(app, 'src') },
    plugins: [{ name: 'client', setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => globalThis.__client;' }));
    } }],
  });
  const lib = await import(pathToFileURL(outfile).href);
  const calls = [];
  let answer = () => ({ data: null, error: null });
  globalThis.__client = { functions: { invoke: async (name, { body }) => { calls.push({ name, body }); return answer(body); } } };

  // ── 1. Credits kept for the photos still used ──────────────────────────────────────────
  const credit = (n) => ({ source: 'unsplash', name: `Photographer ${n}`, profile: `https://unsplash.com/@p${n}?utm_source=sellio&utm_medium=referral`, photo: `https://unsplash.com/photos/x${n}?utm_source=sellio&utm_medium=referral` });
  const credits = { 'https://images.unsplash.com/a': credit(1), 'https://images.unsplash.com/b': credit(2) };
  assert.deepEqual(lib.creditFor(credits, 'https://images.unsplash.com/b'), credit(2));
  assert.equal(lib.creditFor(credits, 'https://files.invalid/own.webp'), null, 'the shop\'s own photo: no credit');
  assert.equal(lib.creditFor(null, 'https://images.unsplash.com/a'), null);
  assert.equal(lib.creditFor(['https://images.unsplash.com/a'], 'https://images.unsplash.com/a'), null, 'anything else than a map: none');
  assert.deepEqual(lib.keepCredits(credits, ['https://files.invalid/own.webp', { url: 'https://images.unsplash.com/b' }, null]), { 'https://images.unsplash.com/b': credit(2) }, 'only those still used (main photo or a photo object)');
  assert.equal(lib.keepCredits(credits, ['https://files.invalid/own.webp']), null, 'a sample replaced takes its credit along');
  assert.equal(lib.keepCredits(null, ['https://images.unsplash.com/a']), null);
  passed('credits are kept by photo address, only for photos still used');

  // ── 2. The credit, with its links ──────────────────────────────────────────────────────
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let opened = 0; // a tap on the photo the credit sits on (the product window opens the photo)
  const pixabay = { source: 'pixabay', name: 'Mei Lin', profile: 'https://pixabay.com/users/Mei%20Lin-78/', photo: 'https://pixabay.com/photos/laksa-1001/' };
  await act(async () => root.render(React.createElement('div', { onClick: () => { opened += 1; } },
    React.createElement(lib.PhotoCredit, { credit: credit(3) }),
    React.createElement(lib.PhotoCredit, { credit: { source: 'unsplash' } }),
    React.createElement(lib.PhotoCredit, { credit: pixabay }),
    React.createElement(lib.PhotosFrom),
    React.createElement(lib.SampleTag))));
  const shown = [...container.querySelectorAll('[data-testid="photo-credit"]')];
  assert.equal(shown.length, 2, 'no credit without a name');
  assert.equal(shown[1].textContent, 'Sample photo · Photo by Mei Lin on Pixabay');
  assert.deepEqual([...shown[1].querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]), [
    ['Mei Lin', 'https://pixabay.com/users/Mei%20Lin-78/'], ['Pixabay', 'https://pixabay.com/'],
  ], 'a Pixabay photo: its photographer and Pixabay');
  const from = container.querySelector('[data-testid="photos-from"]');
  assert.equal(from.textContent, 'Photos from Pixabay');
  assert.deepEqual([...from.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]), [['Pixabay', 'https://pixabay.com/', '_blank']]);
  assert.equal(shown[0].textContent, 'Sample photo · Photo by Photographer 3 on Unsplash');
  assert.deepEqual([...shown[0].querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]), [
    ['Photographer 3', 'https://unsplash.com/@p3?utm_source=sellio&utm_medium=referral', '_blank', 'noopener noreferrer'],
    ['Unsplash', 'https://unsplash.com/?utm_source=sellio&utm_medium=referral', '_blank', 'noopener noreferrer'],
  ], 'the photographer and Unsplash, each a link naming Sellio');
  shown[0].querySelector('a').addEventListener('click', (e) => e.preventDefault());
  await act(async () => { shown[0].querySelector('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  assert.equal(opened, 0, 'tapping the link doesn\'t also tap the photo under it');
  assert.equal(container.querySelector('[data-testid="sample-tag"]').textContent, 'Sample photo');
  await act(async () => root.unmount());
  passed('"Sample photo · Photo by <name> on Pixabay" (or "on Unsplash" for a photo saved from there before), with links; results say "Photos from Pixabay"');

  // ── 3. The search and its answers ──────────────────────────────────────────────────────
  answer = () => ({ data: { photos: [
    { id: 'pixabay-1', previewUrl: 'https://pixabay.com/get/a_640.jpg', keepUrl: 'https://pixabay.com/get/a_1280.jpg', alt: 'laksa', credit: pixabay },
    { id: 'pixabay-2', previewUrl: 'https://pixabay.com/get/b_640.jpg', keepUrl: 'https://pixabay.com/get/b_1280.jpg' },
    { id: 'old', url: 'https://images.unsplash.com/c?w=1080', previewUrl: 'https://images.unsplash.com/c?w=400', credit: credit(1) },
  ] }, error: null });
  const found = await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'Laksa '.repeat(30) });
  assert.deepEqual(calls.at(-1), { name: 'findProductImage', body: { query: 'Laksa '.repeat(30).slice(0, 100), page: 1, tenantId: 'shop-1' } }, 'the name (at most 100 characters), for this shop');
  assert.deepEqual(found, [{ id: 'pixabay-1', url: 'https://pixabay.com/get/a_640.jpg', thumb: 'https://pixabay.com/get/a_640.jpg', keepUrl: 'https://pixabay.com/get/a_1280.jpg', alt: 'laksa', credit: pixabay }], 'only photos that can be credited and copied');
  await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'Carrot Cake', hint: '  fried radish cake ' });
  assert.deepEqual(calls.at(-1).body, { query: 'Carrot Cake', page: 1, tenantId: 'shop-1', hint: 'fried radish cake' }, 'Scan Menu\'s words for the dish go with it');
  await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'Carrot Cake', hint: '   ' });
  assert.deepEqual(calls.at(-1).body, { query: 'Carrot Cake', page: 1, tenantId: 'shop-1' }, 'no words: no hint');
  answer = () => ({ data: null, error: { context: { status: 404 } } });
  assert.deepEqual(await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'xyz' }), [], 'none found');
  answer = () => ({ data: null, error: { context: { status: 429, clone() { return this; }, json: async () => ({ error: 'Too many image searches this hour. Please try again later.' }) } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.friendly && e.message === 'Too many image searches this hour. Please try again later.');
  answer = () => ({ data: null, error: { context: { status: 403, clone() { return this; }, json: async () => ({ error: 'You do not have access to image search.' }) } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.message === 'You do not have access to image search.');
  answer = () => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => { throw new Error('not JSON'); } } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.message === 'Search failed. Please try again.');
  // Something broke (20 Nov 2026: Unsplash refused the key; now Pixabay refusing): its technical
  // reason isn't shown.
  answer = () => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => ({ error: 'Pixabay API error: 429' }) } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.friendly && e.message === 'Search failed. Please try again.');
  assert.equal(await lib.photoSearchError({ context: { status: 502, clone() { return this; }, json: async () => ({ error: 'upstream' }) } }), 'Search failed. Please try again.');
  assert.equal(await lib.photoSearchError(new Error('Failed to send a request to the Edge Function')), 'Search failed. Please try again.', 'offline: plain words');
  passed('the search: photos with their credit, none found, a refusal in its own words, anything that broke in plain words (never the technical reason)');

  // ── 4. The photos used, copied into the shop's photos ───────────────────────────────────
  calls.length = 0;
  const used = Array.from({ length: 9 }, (_, i) => ({ id: `pixabay-${i}`, keepUrl: `https://pixabay.com/get/p${i}_1280.jpg`, credit: pixabay }));
  answer = (body) => ({ data: { kept: body.photos.filter((p) => p.id !== 'pixabay-3').map((p) => ({ from: p.url, url: `https://files.invalid/shop-1/products/${p.id}.jpg` })) }, error: null });
  const kept = await lib.keepSamplePhotos({ tenantId: 'shop-1', photos: [...used, used[0], { url: 'no-keep-url' }, null] });
  assert.deepEqual(calls.map((c) => [c.body.action, c.body.tenantId, c.body.photos.length]), [['keep', 'shop-1', 8], ['keep', 'shop-1', 1]], '8 at a time, each once');
  assert.deepEqual(calls[0].body.photos[0], { id: 'pixabay-0', url: 'https://pixabay.com/get/p0_1280.jpg' }, 'the full-size address, with its id');
  assert.equal(kept.size, 8, 'the one that couldn\'t be copied is left out');
  assert.equal(kept.get('https://pixabay.com/get/p0_1280.jpg'), 'https://files.invalid/shop-1/products/pixabay-0.jpg');
  assert.equal(kept.has('https://pixabay.com/get/p3_1280.jpg'), false);
  calls.length = 0;
  assert.equal((await lib.keepSamplePhotos({ tenantId: 'shop-1', photos: [] })).size, 0);
  assert.equal(calls.length, 0, 'nothing used: nothing sent');
  answer = () => ({ data: null, error: { context: { status: 429, clone() { return this; }, json: async () => ({ error: 'Too many photos this hour. Please try again later.' }) } } });
  await assert.rejects(lib.keepSamplePhotos({ tenantId: 'shop-1', photos: used.slice(0, 1) }), (e) => e.friendly && e.message === 'Too many photos this hour. Please try again later.');
  answer = () => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => ({ error: 'Storage error' }) } } });
  await assert.rejects(lib.keepSamplePhotos({ tenantId: 'shop-1', photos: used.slice(0, 1) }), (e) => e.friendly && e.message === 'Couldn’t save the sample photos. Please try again.');
  await assert.rejects(lib.keepSamplePhotos({ tenantId: 'shop-1', photos: used.slice(0, 1), fallback: 'Try another one.' }), (e) => e.message === 'Try another one.');
  passed('the photos used are copied into the shop\'s photos, 8 at a time, each once; one that couldn\'t be is left out; a refusal in its own words, a failure in plain words');
} finally {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} photo credit checks passed`);
