// The product form's stock photo search (StockImageSearch in AIProductAssistant.jsx), from
// Pixabay (Alvin, 20 Nov 2026: "Let's go with using the pixabay"), as Pixabay's API rules ask:
//   • results are shown from Pixabay's address while choosing, saying "Photos from Pixabay";
//   • the photo chosen is copied into the shop's product photos first (findProductImage
//     { action: 'keep' }: the app itself downloads and uploads nothing), and the form gets the
//     copy with its photographer's credit (onImageCredit; saved in products.image_credits);
//   • a copy that couldn't be made, or was refused, says so and sets no photo;
//   • a search refused says so in the function's words; one that broke says so in plain words,
//     never its technical reason ("Pixabay API error: …"; on 20 Nov 2026 Unsplash's "401").
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

  // Pixabay's photos, as findProductImage v24 sends them.
  const photo = (n) => ({
    id: `pixabay-${100 + n}`, previewUrl: `https://pixabay.com/get/laksa${n}_640.jpg`, keepUrl: `https://pixabay.com/get/laksa${n}_1280.jpg`, alt: 'laksa',
    credit: { source: 'pixabay', name: `Photographer ${n}`, profile: `https://pixabay.com/users/p${n}-${n}/`, photo: `https://pixabay.com/photos/laksa-${100 + n}/` },
  });
  const copyOf = (p) => `https://files.invalid/shop-1/products/${p.id}-1.jpg`;
  let searchAnswer = () => ({ data: { photos: [1, 2, 3, 4, 5].map(photo), keyword: 'laksa', page: 1 }, error: null });
  let keepAnswer = (body) => ({ data: { kept: body.photos.map((p) => ({ from: p.url, url: copyOf(p) })) }, error: null });
  const invoked = [];
  const uploads = [];
  const fetched = [];
  globalThis.__toasts = [];
  globalThis.__client = {
    rpc: async () => ({ data: { photo_search: { limit: null, used: 0 }, ai_analysis: { limit: null, used: 0 } }, error: null }),
    functions: { invoke: async (name, { body }) => { invoked.push({ name, body }); return body.action === 'keep' ? keepAnswer(body) : searchAnswer(body); } },
    storage: { from: () => ({ upload: async (...args) => { uploads.push(args); return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.invalid/' + p } }) }) },
  };
  // Nothing here may reach the network: the function copies the photo, not the app.
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

  // ── 1. A photo chosen: copied into the shop's photos, the copy and its credit to the form ──
  let view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(invoked.map((c) => [c.name, c.body]), [['findProductImage', { query: 'Laksa', page: 1, tenantId: 'shop-1' }]], 'searched for this shop');
  const shown = () => view.querySelector('img[alt="laksa"]')?.getAttribute('src');
  assert.equal(shown(), 'https://pixabay.com/get/laksa1_640.jpg', 'shown from Pixabay while choosing');
  const from = view.querySelector('[data-testid="photos-from"]');
  assert.equal(from?.textContent, 'Photos from Pixabay', 'the results say where they\'re from');
  assert.equal(from.querySelector('a')?.getAttribute('href'), 'https://pixabay.com/');
  await click(view.querySelector('button[aria-label="Next image"]'));
  assert.equal(shown(), 'https://pixabay.com/get/laksa2_640.jpg');
  await click(view.querySelector('button[aria-label="Use this image"]'));
  for (let i = 0; i < 5; i++) await act(async () => { await next(); });
  assert.deepEqual(invoked.slice(1).map((c) => [c.name, c.body]), [['findProductImage', { action: 'keep', tenantId: 'shop-1', photos: [{ id: 'pixabay-102', url: 'https://pixabay.com/get/laksa2_1280.jpg' }] }]], 'the function copies the full-size photo for this shop');
  assert.deepEqual(credits, [[copyOf(photo(2)), photo(2).credit]], 'the copy and its photographer\'s credit go to the form');
  assert.deepEqual(covers, [copyOf(photo(2))], 'the cover is the shop\'s own copy, never Pixabay\'s address');
  assert.deepEqual(uploads, [], 'the app uploads nothing itself');
  assert.deepEqual(fetched, [], 'nor downloads');
  passed('a stock photo chosen is copied into the shop\'s photos by the function; the copy and its credit go to the form; the results say "Photos from Pixabay"');

  // ── 1b. A copy that couldn't be made, or was refused: said so, no photo set ──────────────
  for (const [answer, says] of [
    [() => ({ data: { kept: [] }, error: null }), 'Couldn’t get that image. Try another one.'],
    [() => ({ data: null, error: { context: { status: 429, clone() { return this; }, json: async () => ({ error: 'Too many photos this hour. Please try again later.' }) } } }), 'Too many photos this hour. Please try again later.'],
    [() => ({ data: null, error: { context: { status: 500, clone() { return this; }, json: async () => ({ error: 'Pixabay API error: 503' }) } } }), 'Couldn’t get that image. Try another one.'],
  ]) {
    keepAnswer = answer;
    const before = [covers.length, credits.length];
    view = await mount();
    await search(view, 'Laksa');
    await click(view.querySelector('button[aria-label="Use this image"]'));
    for (let i = 0; i < 5; i++) await act(async () => { await next(); });
    assert.deepEqual(globalThis.__toasts.at(-1), ['error', says]);
    assert.deepEqual([covers.length, credits.length], before, 'no photo set');
    assert.ok(view.querySelector('button[aria-label="Use this image"]'), 'still choosing, to try again');
  }
  passed('a photo that couldn\'t be copied, or a copy refused, says so (in plain words when something broke) and sets no photo');

  // ── 2. A search that fails: refused in the function's words, broken in plain words ────────
  const failing = (status, error) => () => ({ data: null, error: { context: { status, clone() { return this; }, json: async () => ({ error }) } } });
  searchAnswer = failing(429, 'Too many image searches this hour. Please try again later.');
  view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(globalThis.__toasts.at(-1), ['error', 'Too many image searches this hour. Please try again later.'], 'a refusal, in the function\'s words');
  searchAnswer = failing(500, 'Pixabay API error: 429');
  view = await mount();
  await search(view, 'Laksa');
  assert.deepEqual(globalThis.__toasts.at(-1), ['error', 'Search failed. Please try again.'], 'something broke: plain words, not "Pixabay API error: 429"');
  assert.ok(!globalThis.__toasts.some((t) => /API error/.test(String(t[1]))), 'the technical reason is never shown');
  assert.deepEqual([uploads.length, fetched.length], [0, 0]);
  passed('a search refused says so in the function\'s words; one that broke (Pixabay refusing) in plain words');
} finally {
  for (const { root, client } of roots) {
    try { await act(async () => root.unmount()); } catch { /* already gone */ }
    client.clear(); // its clean-up timers would keep the test running
  }
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
}
console.log(`\n${passes} stock photo checks passed`);
