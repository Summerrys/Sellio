// The product form's stock photo search (StockImageSearch in AIProductAssistant.jsx). Alvin,
// 20 Nov 2026: credit Unsplash photographers, as Unsplash's API guidelines ask:
//   • the photo chosen is used from Unsplash's own address with its photographer's credit
//     (onImageCredit; the form saves it in products.image_credits): never downloaded or uploaded;
//   • Unsplash is told it was used (findProductImage { action: 'use' }, which has the key);
//   • a search refused says so in the function's words; one that broke says so in plain words,
//     never its technical reason (on 20 Nov 2026 "Unsplash API error: 401": the key was refused).
// Run from the app root: node verification/stock-photo.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/Products', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'DocumentFragment', 'CustomEvent', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'NodeFilter', 'HTMLButtonElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const temporary = await mkdtemp(path.join(app, '.stock-photo-verification-'));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const next = () => new Promise((resolve) => setTimeout(resolve, 0));
const roots = [];

try {
  const outfile = path.join(temporary, 'assistant.mjs');
  await build({
    entryPoints: [path.join(app, 'src/components/products/AIProductAssistant.jsx')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', logLevel: 'silent',
    alias: { '@': path.join(app, 'src') },
    plugins: [{ name: 'stand-ins', setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
      b.onResolve({ filter: /^sonner$/ }, () => ({ path: 'sonner', namespace: 'mock' }));
      b.onLoad({ filter: /^client$/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => globalThis.__client;' }));
      b.onLoad({ filter: /^sonner$/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'const say = (kind) => (...args) => globalThis.__toasts.push([kind, ...args]); export const toast = Object.assign(say("toast"), { error: say("error"), success: say("success"), message: say("message"), info: say("info"), warning: say("warning") }); export const Toaster = () => null;' }));
    } }],
  });
  const { default: AIProductAssistant } = await import(pathToFileURL(outfile).href);

  // Unsplash's photos, as findProductImage v23 sends them.
  const UTM = 'utm_source=sellio&utm_medium=referral';
  const photo = (n) => ({
    id: `laksa-${n}`, url: `https://images.unsplash.com/laksa-${n}?w=1080`, previewUrl: `https://images.unsplash.com/laksa-${n}?w=400`, downloadUrl: `https://images.unsplash.com/laksa-${n}?w=1080`,
    downloadLocation: `https://api.unsplash.com/photos/laksa-${n}/download?ixid=x`, alt: 'laksa',
    credit: { source: 'unsplash', name: `Photographer ${n}`, profile: `https://unsplash.com/@p${n}?${UTM}`, photo: `https://unsplash.com/photos/laksa-${n}?${UTM}` },
  });
  let searchAnswer = () => ({ data: { photos: [1, 2, 3, 4, 5].map(photo), keyword: 'laksa', page: 1 }, error: null });
  const invoked = [];
  const uploads = [];
  const fetched = [];
  globalThis.__toasts = [];
  globalThis.__client = {
    rpc: async () => ({ data: { photo_search: { limit: null, used: 0 }, ai_analysis: { limit: null, used: 0 } }, error: null }),
    functions: { invoke: async (name, { body }) => { invoked.push({ name, body }); return body.action === 'use' ? { data: { used: body.downloadLocations.length }, error: null } : searchAnswer(body); } },
    storage: { from: () => ({ upload: async (...args) => { uploads.push(args); return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.invalid/' + p } }) }) },
  };
  // Nothing here may reach the network (the old way downloaded the photo to upload it again).
  globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error('Unexpected network request: ' + url); };

  const covers = [];
  const credits = [];
  const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    roots.push({ root, client });
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AIProductAssistant, {
      tenantId: 'shop-1', currency: 'SGD', categories: [], onApply: () => {},
      onImageChange: (url) => covers.push(url), onImageCredit: (url, credit) => credits.push([url, credit]),
    }))));
    return container;
  };
  const click = async (element) => {
    assert.ok(element, 'the control is there');
    await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await next(); });
  };
  const search = async (container, words) => {
    const input = container.querySelector('input[placeholder="Find a stock image with AI…"]');
    assert.ok(input, 'the stock photo search is there');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, words);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(container.querySelector('button[aria-label="Search"]'));
    for (let i = 0; i < 20; i++) await act(async () => { await next(); });
  };

  // ── 1. A photo chosen: Unsplash's address and its credit, nothing copied ─────────────────
  let view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(invoked.map((c) => [c.name, c.body]), [['findProductImage', { query: 'Laksa', page: 1, tenantId: 'shop-1' }]], 'searched for this shop');
  const shown = () => view.querySelector('img[alt="laksa"]')?.getAttribute('src');
  assert.equal(shown(), 'https://images.unsplash.com/laksa-1?w=400', 'shown from Unsplash, at its small size');
  await click(view.querySelector('button[aria-label="Next image"]'));
  assert.equal(shown(), 'https://images.unsplash.com/laksa-2?w=400');
  await click(view.querySelector('button[aria-label="Use this image"]'));
  for (let i = 0; i < 5; i++) await act(async () => { await next(); });
  assert.deepEqual(credits, [['https://images.unsplash.com/laksa-2?w=1080', photo(2).credit]], 'the photo and its photographer\'s credit go to the form');
  assert.deepEqual(covers, ['https://images.unsplash.com/laksa-2?w=1080'], 'the cover is Unsplash\'s own address (hotlinked)');
  assert.deepEqual(uploads, [], 'never uploaded (copied)');
  assert.deepEqual(fetched, [], 'never downloaded');
  assert.deepEqual(invoked.slice(1).map((c) => [c.name, c.body]), [['findProductImage', { action: 'use', tenantId: 'shop-1', downloadLocations: ['https://api.unsplash.com/photos/laksa-2/download?ixid=x'] }]], 'Unsplash is told it was used (by the function, which has the key)');
  passed('a stock photo chosen is used from Unsplash\'s address with its photographer\'s credit, never downloaded or uploaded; Unsplash is told it was used');

  // ── 2. A search that fails: refused in the function's words, broken in plain words ────────
  const failing = (status, error) => () => ({ data: null, error: { context: { status, clone() { return this; }, json: async () => ({ error }) } } });
  searchAnswer = failing(429, 'Too many image searches this hour. Please try again later.');
  view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(globalThis.__toasts.at(-1), ['error', 'Too many image searches this hour. Please try again later.'], 'a refusal, in the function\'s words');
  searchAnswer = failing(500, 'Unsplash API error: 401');
  view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(globalThis.__toasts.at(-1), ['error', 'Search failed. Please try again.'], 'something broke: plain words, not "Unsplash API error: 401"');
  assert.ok(!globalThis.__toasts.some((t) => /Unsplash API error/.test(String(t[1]))), 'the technical reason is never shown');
  assert.deepEqual([uploads.length, fetched.length], [0, 0]);
  passed('a search refused says so in the function\'s words; one that broke (Unsplash refusing the key) in plain words');
} finally {
  for (const { root, client } of roots) {
    try { await act(async () => root.unmount()); } catch { /* already gone */ }
    client.clear(); // its clean-up timers would keep the test running
  }
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} stock photo checks passed`);
