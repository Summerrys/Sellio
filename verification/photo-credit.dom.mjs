// Sample photos from Unsplash, credited (Alvin, 20 Nov 2026): src/lib/samplePhotos.js and
// src/components/ui-custom/PhotoCredit.jsx (used by the storefront, Explore's item page and Scan
// Menu's review; the scan's use is in scan-review.dom.mjs section 10):
//   • the credit kept for each photo still used, none for a photo replaced;
//   • "Sample photo · Photo by <name> on Unsplash", both links to Unsplash with Sellio named;
//   • the search's photos (only those with a credit), none found, a refusal in its own words;
//   • Unsplash told of the photos used, 30 at a time, never failing a save.
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
  await writeFile(entry, "export * from '@/lib/samplePhotos';\nexport { PhotoCredit, SampleTag } from '@/components/ui-custom/PhotoCredit';\n");
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
  await act(async () => root.render(React.createElement('div', { onClick: () => { opened += 1; } },
    React.createElement(lib.PhotoCredit, { credit: credit(3) }),
    React.createElement(lib.PhotoCredit, { credit: { source: 'unsplash' } }),
    React.createElement(lib.SampleTag))));
  const shown = [...container.querySelectorAll('[data-testid="photo-credit"]')];
  assert.equal(shown.length, 1, 'no credit without a name');
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
  passed('"Sample photo · Photo by <name> on Unsplash", with links to the photographer and Unsplash');

  // ── 3. The search and its answers ──────────────────────────────────────────────────────
  answer = () => ({ data: { photos: [
    { id: 'a', url: 'https://images.unsplash.com/a?w=1080', previewUrl: 'https://images.unsplash.com/a?w=400', alt: 'laksa', downloadLocation: 'https://api.unsplash.com/photos/a/download?ixid=1', credit: credit(1) },
    { id: 'b', url: 'https://images.unsplash.com/b?w=1080', previewUrl: 'https://images.unsplash.com/b?w=400', downloadLocation: 'https://api.unsplash.com/photos/b/download' },
  ] }, error: null });
  const found = await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'Laksa '.repeat(30) });
  assert.deepEqual(calls.at(-1), { name: 'findProductImage', body: { query: 'Laksa '.repeat(30).slice(0, 100), page: 1, tenantId: 'shop-1' } }, 'the name (at most 100 characters), for this shop');
  assert.deepEqual(found, [{ id: 'a', url: 'https://images.unsplash.com/a?w=1080', thumb: 'https://images.unsplash.com/a?w=400', alt: 'laksa', credit: credit(1), downloadLocation: 'https://api.unsplash.com/photos/a/download?ixid=1' }], 'only photos that can be credited');
  answer = () => ({ data: null, error: { context: { status: 404 } } });
  assert.deepEqual(await lib.findSamplePhotos({ tenantId: 'shop-1', query: 'xyz' }), [], 'none found');
  answer = () => ({ data: null, error: { context: { status: 429, clone() { return this; }, json: async () => ({ error: 'Too many image searches this hour. Please try again later.' }) } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.friendly && e.message === 'Too many image searches this hour. Please try again later.');
  answer = () => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => { throw new Error('not JSON'); } } } });
  await assert.rejects(lib.findSamplePhotos({ tenantId: 'shop-1', query: 'laksa' }), (e) => e.message === 'Search failed. Please try again.');
  passed('the search: photos with their credit, none found, a refusal in its own words, else plain words');

  // ── 4. Unsplash told of the photos used ────────────────────────────────────────────────
  calls.length = 0;
  answer = () => ({ data: { used: 1 }, error: null });
  const used = Array.from({ length: 31 }, (_, i) => ({ downloadLocation: `https://api.unsplash.com/photos/p${i}/download` }));
  await lib.reportUsedPhotos({ tenantId: 'shop-1', photos: [...used, used[0], { url: 'no-location' }] });
  assert.deepEqual(calls.map((c) => [c.body.action, c.body.tenantId, c.body.downloadLocations.length]), [['use', 'shop-1', 30], ['use', 'shop-1', 1]], '30 at a time, each once');
  globalThis.__client = { functions: { invoke: async () => { throw new Error('offline'); } } };
  await lib.reportUsedPhotos({ tenantId: 'shop-1', photos: used.slice(0, 1) });
  assert.ok(warned.some((w) => w.includes('Unsplash wasn’t told')), 'a failure is noted, never thrown');
  calls.length = 0;
  await lib.reportUsedPhotos({ tenantId: 'shop-1', photos: [] });
  assert.equal(calls.length, 0, 'nothing used: nothing sent');
  passed('Unsplash is told of the photos used, 30 at a time, each once; a failure never fails the save');
} finally {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} photo credit checks passed`);
