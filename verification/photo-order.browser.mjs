// Putting product photos in order (components/ui-custom/PhotoOrderGrid.jsx), in Chrome as a
// phone, with the real screens:
//   • the Add/Edit product window (products/AIProductAssistant.jsx, wired as ProductFormDialog
//     wires it): press and hold a photo, drag it first → it's the cover (image_url) and the
//     others shift along (images); the photos don't go back to the ones it opened with; a
//     quick swipe scrolls, a tap opens the photo editor; a mouse drags without holding and its
//     click doesn't open anything; the keyboard moves a photo; deleting the cover makes the
//     next photo the cover;
//   • sign-up Step 3 (onboarding/Step3MenuSetup.jsx): photos uploaded, one held and dragged
//     first, the item added with that order;
//   • Step 3's Edit item window (onboarding/EditItemModal.jsx): held and dragged, saved in
//     that order; a mouse let go over the backdrop doesn't close the window.
//
//   node verification/photo-order.browser.mjs <folder with playwright(-core)> [screenshot folder]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const shots = process.argv[3] || '';
let chromium;
let executablePath;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require('playwright-core'));
  executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
}
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const PAGE = String.raw`
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AIProductAssistant from '@/components/products/AIProductAssistant';
import EditItemModal from '@/components/onboarding/EditItemModal';
import Step3MenuSetup from '@/components/onboarding/Step3MenuSetup';
import AppUserContext from '@/lib/AppUserContext';

const url = (name) => 'https://files.test/photos/' + name + '.svg';
window.__calls = { uploads: [], saved: null, closed: false, products: [] };
window.__client = {
  rpc: async () => ({ data: { ai_analysis: { limit: null, used: 0 }, photo_search: { limit: null, used: 0 } }, error: null }),
  from: () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, in: () => chain,
      maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }) };
    return chain;
  },
  storage: { from: () => ({
    upload: async (p) => { window.__calls.uploads.push(p); return { error: null }; },
    getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.test/' + p } }),
    remove: async () => ({ error: null }),
  }) },
  functions: { invoke: async () => ({ data: { confidence: 0.1 }, error: null }) },
  auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) },
};

// The Add/Edit product window, wired as ProductFormDialog wires it.
function ProductWindow() {
  const product = { image_url: url('red'), images: [url('green'), url('blue'), url('yellow')] };
  const [form, setForm] = useState({ image_url: product.image_url, images: product.images });
  window.__form = form;
  return (
    <div id="product-window" role="dialog" style={{ height: 600, overflowY: 'auto' }}>
      <div style={{ padding: 16 }}>
        <AIProductAssistant tenantId="shop-1" currency="SGD" categories={[]} currentImageUrl={form.image_url}
          onImageChange={(u) => setForm((f) => ({ ...f, image_url: u }))}
          onAdditionalImagesChange={(images) => setForm((f) => ({ ...f, images }))}
          additionalImagesOnOpen={product.images}
          onApply={() => {}} onImageDelete={() => {}} />
        <div style={{ height: 1400, background: 'linear-gradient(#fff,#e2e8f0)' }} />
      </div>
    </div>
  );
}

function EditItemScreen() {
  const [open, setOpen] = useState(true);
  if (!open) return <p id="closed">closed</p>;
  return (
    <EditItemModal item={{ id: 1, name: 'Laksa', price: 6.5, category: 'Mains', description: '', image_url: url('red'), images: [url('green'), url('blue')] }}
      categories={['Mains']} themeColor="linear-gradient(135deg,#3b82f6,#9333ea)" primaryColor="#3b82f6"
      onSave={(item) => { window.__calls.saved = item; setOpen(false); }}
      onClose={() => { window.__calls.closed = true; setOpen(false); }} />
  );
}

function Step3Screen() {
  const [formData, setFormData] = useState({ pendingTenantId: '11111111-2222-4333-8444-555555555555', currency: 'SGD', businessType: 'F&B', products: [], menuCategories: [] });
  window.__calls.products = formData.products;
  return (
    <AppUserContext.Provider value={{ appUser: { email: 'owner@shop.test' } }}>
      <Step3MenuSetup formData={formData} updateFormData={setFormData} nextStep={() => {}} prevStep={() => {}} />
    </AppUserContext.Provider>
  );
}

const screen = location.hash.slice(1);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={client}>
    {screen === 'product' ? <ProductWindow /> : screen === 'edit-item' ? <EditItemScreen /> : <Step3Screen />}
  </QueryClientProvider>,
);
`;

const COLORS = { red: '#dc2626', green: '#16a34a', blue: '#2563eb', yellow: '#eab308' };
const temporary = await mkdtemp(path.join(app, '.photo-order-browser-'));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE);
  const plugin = { name: 'stand-ins', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'stub' }));
    b.onResolve({ filter: /base44Client$/ }, () => ({ path: 'base44', namespace: 'stub' }));
    b.onLoad({ filter: /^client$/, namespace: 'stub' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => window.__client; export const SUPABASE_URL = "https://x.invalid"; export const supabase = window.__client;' }));
    b.onLoad({ filter: /^base44$/, namespace: 'stub' }, () => ({ loader: 'js', contents: 'export const base44 = { auth: {}, entities: {} };' }));
  } };
  const result = await build({
    entryPoints: [entry], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false,
    alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')], loader: { '.js': 'jsx' }, plugins: [plugin],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const { readFile } = await import('node:fs/promises');
  const appHtml = await readFile(path.join(app, 'dist/app.html'), 'utf8');
  const cssFiles = [...appHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(app, 'dist', f), 'utf8')))).join('\n').replace(/<\/style/gi, '<\\/style');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>:root{--color-primary:59 130 246;--color-primary-gradient:linear-gradient(135deg,#3b82f6 0%,#9333ea 100%)}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8fafc}</style></head>
<body><div id="root"></div><script type="module">${js}</script></body></html>`;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'photos.test') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (u.hostname === 'files.test') {
      const name = Object.keys(COLORS).find((c) => u.pathname.includes(c)) || 'red';
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${COLORS[name]}"/></svg>` });
    }
    return route.abort();
  });
  if (shots) await mkdir(shots, { recursive: true });
  const errors = [];

  async function open(screen) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${screen}: ${e.message}`));
    await page.goto(`https://photos.test/#${screen}`);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    return { page, touch };
  }
  const colorsIn = (page, grid) => page.evaluate((grid) => [...document.querySelectorAll(`[data-testid="${grid}"] [data-photo-tile] img`)].map((img) => (img.src.match(/red|green|blue|yellow/) || ['?'])[0]), grid);
  const centreOf = (page, grid, place) => page.evaluate(([grid, place]) => {
    const r = document.querySelectorAll(`[data-testid="${grid}"] [data-photo-tile]`)[place].getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, [grid, place]);
  async function holdAndDrag({ page, touch }, grid, from, to, shot) {
    const [x0, y0] = await centreOf(page, grid, from);
    const [x1, y1] = await centreOf(page, grid, to);
    await touch('touchStart', x0, y0);
    await page.waitForTimeout(450);
    for (let s = 1; s <= 10; s++) { await touch('touchMove', x0 + ((x1 - x0) * s) / 10 + 3, y0 + ((y1 - y0) * s) / 10 + 3); await page.waitForTimeout(20); }
    await page.waitForTimeout(250);
    if (shot && shots) await page.screenshot({ path: path.join(shots, shot) });
    await touch('touchEnd');
    await page.waitForTimeout(450);
  }
  const coverOf = (page, grid) => page.evaluate((grid) => {
    const tiles = [...document.querySelectorAll(`[data-testid="${grid}"] [data-photo-tile]`)];
    return tiles.map((t) => (/Cover|Sampul/.test(t.textContent) ? 'cover' : '')).join(',');
  }, grid);

  // ── 1. The Add/Edit product window ─────────────────────────────────────────────────────
  {
    const s = await open('product');
    const { page } = s;
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="product-photos"] [data-photo-tile] img').length === 4);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="product-photos"] img')].every((i) => i.complete && i.naturalWidth > 0));
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['red', 'green', 'blue', 'yellow']);
    assert.equal(await coverOf(page, 'product-photos'), 'cover,,,');
    assert.match(await page.textContent('[data-testid="product-photos-hint"]'), /Press and hold a photo to move it\. The first one is the cover\./);
    if (shots) await page.screenshot({ path: path.join(shots, '1-product-before.png') });

    await holdAndDrag(s, 'product-photos', 2, 0, '2-product-dragging.png');
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['blue', 'red', 'green', 'yellow'], 'held and dragged first: the others shift along');
    assert.equal(await coverOf(page, 'product-photos'), 'cover,,,', 'the Cover band is on the first photo');
    let form = await page.evaluate(() => window.__form);
    assert.match(form.image_url, /blue/, 'the form\'s cover (image_url) is the photo put first');
    assert.deepEqual(form.images.map((u) => u.match(/red|green|blue|yellow/)[0]), ['red', 'green', 'yellow'], 'the other photos, in order');
    await page.waitForTimeout(300);
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['blue', 'red', 'green', 'yellow'], 'and they stay so (not back to the ones it opened with)');
    assert.equal(await page.locator('[data-photo-ghost]').count(), 0, 'the lifted copy is gone');
    if (shots) await page.screenshot({ path: path.join(shots, '3-product-after.png') });
    passed('Add/Edit product: hold a photo and drag it first: it is the cover, the others shift along, and the form gets that order');

    // A quick swipe over the photos scrolls; nothing moves.
    // (The finger rests a moment first, well under the hold that lifts a photo.)
    const [sx, sy] = await centreOf(page, 'product-photos', 1);
    await s.touch('touchStart', sx, sy);
    await page.waitForTimeout(160);
    for (let i = 1; i <= 8; i++) { await s.touch('touchMove', sx, sy - i * 25); await page.waitForTimeout(16); }
    await s.touch('touchEnd');
    await page.waitForTimeout(500);
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['blue', 'red', 'green', 'yellow'], 'a swipe moves no photo');
    const scrolled = await page.evaluate(() => document.getElementById('product-window').scrollTop);
    assert.ok(scrolled > 20, `a swipe over the photos scrolls the window (${scrolled}px)`);
    await page.evaluate(() => { document.getElementById('product-window').scrollTop = 0; });
    await page.waitForTimeout(200);

    // A tap opens the photo editor.
    const [tx, ty] = await centreOf(page, 'product-photos', 1);
    await s.touch('touchStart', tx, ty); await page.waitForTimeout(60); await s.touch('touchEnd');
    await page.getByRole('heading', { name: 'Edit Image' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('heading', { name: 'Edit Image' }).waitFor({ state: 'detached' });
    passed('Add/Edit product: a quick swipe over the photos scrolls, a tap opens the photo editor');

    // A mouse drags without holding, and its click doesn't open the editor.
    const [mx0, my0] = await centreOf(page, 'product-photos', 3);
    const [mx1, my1] = await centreOf(page, 'product-photos', 1);
    await page.mouse.move(mx0, my0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(mx0 + ((mx1 - mx0) * i) / 8, my0 + ((my1 - my0) * i) / 8);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['blue', 'yellow', 'red', 'green'], 'mouse: yellow to second place');
    assert.equal(await page.getByRole('heading', { name: 'Edit Image' }).count(), 0, 'letting go is not a tap');
    // The keyboard: arrow left puts the photo one place earlier.
    await page.focus('[data-testid="product-photos"] [data-photo-tile]:nth-child(3)');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['blue', 'red', 'yellow', 'green'], 'keyboard: red one place earlier');
    assert.equal(await page.evaluate(() => document.activeElement?.querySelector('img')?.src.match(/red|green|blue|yellow/)?.[0]), 'red', 'the moved photo keeps the focus');
    passed('Add/Edit product: a mouse drags without holding (its click opens nothing); arrow keys move a photo');

    // Deleting the cover: the next photo becomes the cover.
    const [cx, cy] = await centreOf(page, 'product-photos', 0);
    await s.touch('touchStart', cx, cy); await page.waitForTimeout(60); await s.touch('touchEnd');
    await page.getByRole('heading', { name: 'Edit Image' }).waitFor();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(400);
    assert.deepEqual(await colorsIn(page, 'product-photos'), ['red', 'yellow', 'green']);
    form = await page.evaluate(() => window.__form);
    assert.match(form.image_url, /red/, 'the next photo is the cover');
    assert.deepEqual(form.images.map((u) => u.match(/red|green|blue|yellow/)[0]), ['yellow', 'green']);
    passed('Add/Edit product: deleting the cover makes the next photo the cover');
    await page.close();
  }

  // ── 2. Sign-up Step 3 ──────────────────────────────────────────────────────────────────
  {
    const s = await open('step3');
    const { page } = s;
    const png = async (name) => Buffer.from(await page.evaluate((fill) => {
      const c = document.createElement('canvas'); c.width = c.height = 120;
      const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, 120, 120);
      return c.toDataURL('image/png').split(',')[1];
    }, COLORS[name]), 'base64');
    const file = async (name) => ({ name: `${name}.png`, mimeType: 'image/png', buffer: await png(name) });
    await page.setInputFiles('input[type="file"][accept="image/*"]:not([multiple])', await file('red'));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="step3-photos"] [data-photo-tile] img').length === 1 && document.querySelector('[data-testid="step3-photos"] img').src.startsWith('https://'), null, { timeout: 15000 });
    await page.setInputFiles('[data-testid="step3-photos"] input[type="file"][multiple]', [await file('green'), await file('blue')]);
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('[data-testid="step3-photos"] [data-photo-tile] img')];
      return imgs.length === 3 && imgs.every((i) => i.src.startsWith('https://') && i.complete && i.naturalWidth > 0);
    }, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await colorsIn(page, 'step3-photos'), ['red', 'green', 'blue']);
    await page.locator('[data-testid="step3-photos"]').scrollIntoViewIfNeeded();
    await holdAndDrag(s, 'step3-photos', 2, 0, '4-step3-dragging.png');
    assert.deepEqual(await colorsIn(page, 'step3-photos'), ['blue', 'red', 'green'], 'Step 3: held and dragged first, the others shift along (it swapped two before)');
    assert.equal(await coverOf(page, 'step3-photos'), 'cover,,');
    assert.ok(await page.locator('[data-testid="step3-photos-hint"]').isVisible());
    // The item is added with that order.
    await page.getByPlaceholder('Appetizers, Mains, Desserts...').fill('Mains');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByPlaceholder('eg., Caesar Salad').fill('Laksa');
    await page.locator('input[type="number"]').first().fill('6.5');
    await page.getByRole('button', { name: '+ Add Item' }).click();
    await page.waitForFunction(() => window.__calls.products.length === 1, null, { timeout: 10000 });
    const item = await page.evaluate(() => window.__calls.products[0]);
    assert.match(item.image_url, /blue/, 'the cover is the photo put first');
    assert.deepEqual(item.images.map((u) => u.match(/red|green|blue/)[0]), ['red', 'green']);
    passed('Step 3: photos held and dragged; the item is added with the cover put first and the others in order');
    await page.close();
  }

  // ── 3. Step 3's Edit item window ───────────────────────────────────────────────────────
  {
    const s = await open('edit-item');
    const { page } = s;
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="edit-item-photos"] [data-photo-tile] img')].filter((i) => i.complete && i.naturalWidth > 0).length === 3);
    await holdAndDrag(s, 'edit-item-photos', 2, 0);
    assert.deepEqual(await colorsIn(page, 'edit-item-photos'), ['blue', 'red', 'green']);
    // A mouse drag let go over the backdrop: the window stays open.
    const [mx0, my0] = await centreOf(page, 'edit-item-photos', 1);
    const [mx1, my1] = await centreOf(page, 'edit-item-photos', 2);
    await page.mouse.move(mx0, my0);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(mx0 + ((mx1 - mx0) * i) / 6, my0 + ((my1 - my0) * i) / 6);
    for (let i = 1; i <= 6; i++) await page.mouse.move(mx1, my1 + i * 120); // off the window, over the backdrop
    await page.mouse.move(8, 836);
    await page.mouse.up();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__calls.closed), false, 'letting go over the backdrop does not close the window');
    assert.deepEqual(await colorsIn(page, 'edit-item-photos'), ['blue', 'green', 'red'], 'red went where it was last shown');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForFunction(() => !!window.__calls.saved);
    const saved = await page.evaluate(() => window.__calls.saved);
    assert.match(saved.image_url, /blue/);
    assert.deepEqual(saved.images.map((u) => u.match(/red|green|blue/)[0]), ['green', 'red']);
    passed('Step 3 Edit item: held and dragged, saved in that order; a mouse let go over the backdrop leaves the window open');
    await page.close();
  }

  assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} photo order browser checks passed`);
