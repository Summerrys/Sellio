// Scan Menu in a real browser (Chrome): what jsdom can't draw.
//   • the photo goes at the size the AI reads it (src/lib/menuScan.js aiPhotoSize), as a JPEG;
//   • a photo that came through cut short is refused before it's sent;
//   • each item's own picture is cut from the full photo at the box's place (the colour at its
//     middle is the colour drawn at the middle of that dish's picture);
//   • tapping a photo opens the photo editor on the whole menu with that picture boxed: Cancel
//     there changes nothing; the box moved onto another picture gives that picture, at the
//     photo's own pixels, and opens there next time; a photo chosen instead opens on its own;
//   • the items with no picture on the menu get a sample photo, hotlinked (as Unsplash requires)
//     from another site: found one by one, shown marked Sample, and in an item's editor the photos
//     found as square tiles, five a row, with the photographer's credit, all on the screen.
// The real ScanMenuDialog (src/pages/Products.jsx) and ImageEditModal, on a menu drawn in the
// page, with a stand-in for scanMenu that answers with the pictures' real places.
//
//   node verification/menu-scan.browser.mjs <folder with playwright(-core)> [screenshot folder]
// (playwright-core uses Chrome at CHROME_PATH, default /usr/bin/google-chrome)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
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

// ── The page ──────────────────────────────────────────────────────────────────────────────
const PAGE = String.raw`
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScanMenuDialog } from '@/pages/Products';
import { prepareMenuPhoto, aiPhotoSize } from '@/lib/menuScan';

// A phone photo of a menu (3024 × 4032): three dishes with pictures and prices, and drinks
// without prices. Each picture has a square of one colour at its middle.
const W = 3024, H = 4032;
const DISHES = [
  { name: 'Chicken Rice', price: '5.50', x: 150, y: 820, w: 820, h: 820, plate: '#fef3c7', middle: [240, 200, 60] },
  { name: 'Nasi Lemak', price: '6.00', x: 1102, y: 820, w: 820, h: 820, plate: '#dcfce7', middle: [40, 150, 80] },
  { name: 'Laksa', price: '6.50', x: 2054, y: 820, w: 820, h: 820, plate: '#ffedd5', middle: [230, 110, 40] },
];
window.__DISHES = DISHES;
function drawMenu() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7c2d12'; g.font = 'bold 190px Georgia, serif'; g.textAlign = 'center';
  g.fillText('CAFELICIOUS', W / 2, 330);
  g.font = 'italic 90px Georgia, serif'; g.fillStyle = '#9a3412'; g.fillText('Local favourites since 1998', W / 2, 470);
  g.textAlign = 'left'; g.font = 'bold 120px Georgia, serif'; g.fillStyle = '#7c2d12'; g.fillText('MAINS', 150, 740);
  for (const d of DISHES) {
    g.fillStyle = '#e7e5e4'; g.fillRect(d.x, d.y, d.w, d.h);
    g.fillStyle = d.plate; g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, d.w * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgb(' + d.middle.join(',') + ')'; g.fillRect(d.x + d.w / 2 - 160, d.y + d.h / 2 - 160, 320, 320);
    g.fillStyle = '#1c1917'; g.font = 'bold 96px Georgia, serif'; g.fillText(d.name, d.x, d.y + d.h + 130);
    g.fillStyle = '#b45309'; g.font = 'bold 92px Georgia, serif'; g.fillText('$' + d.price, d.x, d.y + d.h + 250);
  }
  g.fillStyle = '#7c2d12'; g.font = 'bold 120px Georgia, serif'; g.fillText('COFFEE & TEA', 150, 2280);
  g.font = '92px Georgia, serif'; g.fillStyle = '#1c1917';
  g.fillText('Kopi .............. Hot 1.80 / Iced 2.20', 150, 2450);
  g.fillText('Teh Tarik', 150, 2600);
  g.fillText('Iced Lemon Tea', 150, 2750);
  g.font = 'italic 80px Georgia, serif'; g.fillStyle = '#78716c'; g.fillText('Drinks: please ask at the counter for today’s prices', 150, 2930);
  return c;
}
const asFile = (canvas, quality = 0.92) => new Promise((resolve) => canvas.toBlob((b) => resolve(new File([b], 'menu.jpg', { type: 'image/jpeg' })), 'image/jpeg', quality));

// The stand-in for scanMenu v21: the pictures' real places, in pixels of the photo as sent.
window.fetch = async (url, options) => {
  if (String(url).startsWith('data:') || String(url).startsWith('blob:')) return window.__realFetch(url, options);
  const body = JSON.parse(options.body);
  // describeMenuItems: a description for each item the menu printed none for.
  if (String(url).endsWith('/describeMenuItems')) {
    window.__described = (window.__described || []).concat([body.items.map((i) => i.name)]);
    await new Promise((r) => setTimeout(r, 150));
    return { ok: true, text: async () => JSON.stringify({ descriptions: body.items.map((i) => i.name + ', as served at our stall.') }) };
  }
  window.__sent = { imageWidth: body.imageWidth, imageHeight: body.imageHeight, mediaType: body.mediaType, version: body.version, chars: body.imageBase64.length };
  const s = body.imageWidth / W;
  const box = (d) => [d.x, d.y, d.x + d.w, d.y + d.h].map((n) => Math.round(n * s));
  await new Promise((r) => setTimeout(r, 200));
  const answer = window.__mode === 'blurry' ? { items: [], count: 0, reason: 'too_blurry' } : {
    items: [
      { name: 'Chicken Rice', price: 5.5, category: 'Mains', description: 'Poached chicken, fragrant rice', variants: [], photo: box(DISHES[0]) },
      { name: 'Nasi Lemak', price: 6, category: 'Mains', description: 'Sambal, egg, anchovies, peanuts', variants: [], photo: box(DISHES[1]) },
      { name: 'Laksa', price: 6.5, category: 'Mains', description: '', variants: [], photo: box(DISHES[2]) },
      { name: 'Kopi', price: 1.8, category: 'Coffee & Tea', description: '', variants: [{ name: 'Hot or iced', type: 'other', options: [{ label: 'Hot', price_modifier: 0 }, { label: 'Iced', price_modifier: 0.4 }] }], photo: null },
      { name: 'Teh Tarik', price: null, category: 'Coffee & Tea', description: '', variants: [], photo: null },
      { name: 'Iced Lemon Tea', price: null, category: 'Coffee & Tea', description: '', variants: [], photo: null },
    ],
    count: 6, imageWidth: body.imageWidth, imageHeight: body.imageHeight,
  };
  return { ok: true, text: async () => '   ' + JSON.stringify(answer) };
};
// findProductImage: sample photos (Unsplash's are hotlinked from images.unsplash.com; here from
// images.unsplash.test, which the test serves), each with its photographer's credit.
window.__searched = [];
window.__used = [];
const sample = (query, n) => {
  const slug = query.toLowerCase().replace(/[^a-z]+/g, '-');
  return {
    id: slug + '-' + n, alt: query,
    url: 'https://images.unsplash.test/photo-' + slug + '-' + n + '?w=1080',
    previewUrl: 'https://images.unsplash.test/photo-' + slug + '-' + n + '?w=400',
    downloadLocation: 'https://api.unsplash.com/photos/' + slug + '-' + n + '/download',
    credit: { source: 'unsplash', name: 'Photographer ' + n, profile: 'https://unsplash.com/@p' + n + '?utm_source=sellio&utm_medium=referral', photo: 'https://unsplash.com/photos/' + slug + '-' + n + '?utm_source=sellio&utm_medium=referral' },
  };
};
window.__client = {
  functions: {
    invoke: async (name, { body }) => {
      if (name !== 'findProductImage') return { data: null, error: { context: { status: 404 } } };
      if (body.action === 'use') { window.__used = window.__used.concat(body.downloadLocations); return { data: { used: body.downloadLocations.length }, error: null }; }
      window.__searched.push(body.query);
      await new Promise((r) => setTimeout(r, 120));
      return { data: { photos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => sample(body.query, n)) }, error: null };
    },
  },
  auth: { getSession: async () => ({ data: { session: { access_token: 'owner' } } }) },
  from: () => ({ insert: () => ({ select: async () => ({ data: [], error: null }) }) }),
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.invalid/' + p } }), remove: async () => ({ error: null }) }) },
};

// Checks the page runs itself.
window.__checks = async () => {
  const menu = drawMenu();
  const whole = await asFile(menu);
  const prepared = await prepareMenuPhoto(whole);
  const cut = new File([whole.slice(0, Math.floor(whole.size * 0.55))], 'cut.jpg', { type: 'image/jpeg' });
  let cutError = null;
  try { await prepareMenuPhoto(cut); } catch (error) { cutError = error.name; }
  return { sent: [prepared.width, prepared.height], expected: aiPhotoSize(W, H), mediaType: prepared.mediaType, full: [prepared.full.width, prepared.full.height], cutError, chars: prepared.base64.length };
};

// A photo chosen with Replace: 600 × 400, one colour.
window.__replacement = () => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 400;
  const g = c.getContext('2d'); g.fillStyle = 'rgb(120,60,200)'; g.fillRect(0, 0, 600, 400);
  return c.toDataURL('image/png').split(',')[1];
};

// Opened with a tap, as in the app (Scan Menu, then the camera).
function App() {
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { asFile(drawMenu()).then(setFile); }, []);
  return (
    <>
      {!open && <button id="open-scan" type="button" disabled={!file} onClick={() => setOpen(true)} style={{ margin: 24, padding: 12 }}>Scan Menu</button>}
      {open && <ScanMenuDialog open photo={file} onPhoto={() => {}} onOpenChange={setOpen} tenantId="shop-1" categories={[]} maxProducts={null} currentProductCount={0} />}
    </>
  );
}
window.__realFetch = window.__realFetch || null;
createRoot(document.getElementById('root')).render(<App />);
`;

const temporary = await mkdtemp(path.join(app, '.menu-scan-browser-'));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE);
  const plugin = { name: 'stand-ins', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'stub' }));
    b.onLoad({ filter: /^client$/, namespace: 'stub' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => window.__client; export const SUPABASE_URL = "https://x.invalid";' }));
  } };
  const result = await build({
    entryPoints: [entry], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false,
    alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')], loader: { '.js': 'jsx' }, plugins: [plugin],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // The app's own styles (Tailwind), as app.html loads them.
  const appHtml = await readFile(path.join(app, 'dist/app.html'), 'utf8');
  const cssFiles = [...appHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(app, 'dist', f), 'utf8')))).join('\n').replace(/<\/style/gi, '<\\/style');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>:root{--color-primary:59 130 246;--color-primary-gradient:linear-gradient(135deg,#3b82f6 0%,#9333ea 100%)}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8fafc}</style></head>
<body><div id="root"></div><script>window.__realFetch = window.fetch.bind(window);</script><script type="module">${js}</script></body></html>`;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG' });
  // The sample photos: one colour each, at the size asked for (w=400 is Unsplash's small size).
  const COLOURS = ['#c2410c', '#15803d', '#1d4ed8', '#a16207', '#7e22ce', '#be123c', '#0f766e', '#4d7c0f', '#9a3412', '#334155'];
  const samplesServed = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'scan.test') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (url.hostname === 'images.unsplash.test') {
      samplesServed.push(url.pathname + url.search);
      const n = Number(url.pathname.match(/-(\d+)$/)?.[1] || 1);
      const [w, h] = url.searchParams.get('w') === '400' ? [400, 300] : [1080, 810];
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${COLOURS[(n - 1) % COLOURS.length]}"/></svg>` });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (shots) await mkdir(shots, { recursive: true });
  const shoot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name) }); };

  await page.goto('https://scan.test/', { waitUntil: 'load' });
  await page.waitForSelector('#open-scan:not([disabled])');

  // 1. Preparing the photo.
  const checks = await page.evaluate(() => window.__checks());
  assert.deepEqual(checks.sent, checks.expected, 'sent at the size the AI reads it');
  assert.ok(checks.sent[0] <= 2576 && checks.sent[1] <= 2576 && Math.ceil(checks.sent[0] / 28) * Math.ceil(checks.sent[1] / 28) <= 4784, `within the AI's limits: ${checks.sent}`);
  assert.deepEqual(checks.full, [3024, 4032], 'the full photo is kept for cutting pictures');
  assert.equal(checks.mediaType, 'image/jpeg');
  assert.ok(checks.chars < 7_000_000, `small enough to send (${checks.chars} base64 characters)`);
  assert.equal(checks.cutError, 'UnreadablePhotoError', 'a photo cut short is refused before it is sent');
  passed(`the photo goes at ${checks.sent.join(' × ')} (from 3024 × 4032), as a JPEG; one cut short is refused`);

  // 2. The review: each dish's picture, cut from the full photo at its place.
  await page.tap('#open-scan');
  await page.waitForSelector('[data-testid="scan-item"]', { timeout: 20000 });
  const SAMPLE_HOST = 'https://images.unsplash.test/';
  await page.waitForFunction((host) => [...document.querySelectorAll('[data-testid="scan-item-photo"] img')].filter((i) => !i.src.startsWith(host) && i.complete && i.naturalWidth > 0).length === 3, SAMPLE_HOST, { timeout: 20000 });
  const sent = await page.evaluate(() => window.__sent);
  assert.equal(sent.version, 2);
  assert.deepEqual([sent.imageWidth, sent.imageHeight], checks.expected);
  // Each photo in the review: its size, and the colours at its middle and its corner (a sample
  // is from another site, so the page can't read its colours).
  const pictures = () => page.evaluate((host) => [...document.querySelectorAll('[data-testid="scan-item-photo"]')].map((button) => {
    const img = button.querySelector('img');
    if (!img || !img.complete || !img.naturalWidth) return null;
    if (img.src.startsWith(host)) return { sample: img.getAttribute('src') };
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { size: [img.naturalWidth, img.naturalHeight], middle: [...g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data].slice(0, 3), corner: [...g.getImageData(4, 4, 1, 1).data].slice(0, 3) };
  }), SAMPLE_HOST);
  const near = (a, b, tolerance) => a.every((v, k) => Math.abs(v - b[k]) <= tolerance);
  const FRAME = [231, 229, 228];
  const middles = (await pictures()).slice(0, 3);
  const dishes = await page.evaluate(() => window.__DISHES);
  middles.forEach((m, i) => {
    assert.ok(near(m.middle, dishes[i].middle, 18), `${dishes[i].name}: the middle of its picture (${m.middle}) is the dish's colour (${dishes[i].middle})`);
    assert.ok(near(m.corner, FRAME, 18), `${dishes[i].name}: its corner is the picture's frame (${m.corner}), so the cut is on the picture`);
    assert.ok(m.size[0] >= 600 && m.size[0] <= 1600, `${dishes[i].name}: cut from the full photo (${m.size[0]} px wide)`);
  });
  await shoot('1-review.png');
  passed('each dish\'s picture is cut from the full photo exactly at its place');

  // 2b. Sample photos for the items with no picture on the menu: one by one, in the menu's order.
  await page.waitForSelector('[data-testid="scan-photos-added"]', { timeout: 15000 });
  assert.deepEqual(await page.evaluate(() => window.__searched), ['Kopi', 'Teh Tarik', 'Iced Lemon Tea'], 'a search for each item without a picture, one by one, in the menu\'s order');
  assert.equal(await page.textContent('[data-testid="scan-photos-added"]'), '3 sample photos added. Customers see each marked “Sample photo”, with the photographer’s credit.');
  const DRINKS = ['Kopi', 'Teh Tarik', 'Iced Lemon Tea'];
  await page.waitForFunction((names) => names.every((name) => { const img = document.querySelector(`[aria-label="Photo for ${name}"] img`); return img && img.complete && img.naturalWidth > 0; }), DRINKS, { timeout: 15000 });
  const tiles = await page.evaluate((names) => names.map((name) => {
    const tile = document.querySelector(`[aria-label="Photo for ${name}"]`);
    const badge = tile.querySelector('span');
    const t = tile.getBoundingClientRect();
    const b = badge.getBoundingClientRect();
    return { src: tile.querySelector('img').getAttribute('src'), loaded: tile.querySelector('img').naturalWidth, badge: badge.textContent, size: [t.width, t.height], badgeInside: b.left >= t.left && b.right <= t.right && b.top >= t.top && b.bottom <= t.bottom };
  }), DRINKS);
  assert.deepEqual(tiles.map((t) => t.src), ['https://images.unsplash.test/photo-kopi-1?w=400', 'https://images.unsplash.test/photo-teh-tarik-1?w=400', 'https://images.unsplash.test/photo-iced-lemon-tea-1?w=400'], 'each item\'s first sample, hotlinked at the small size');
  tiles.forEach((t, i) => {
    assert.equal(t.loaded, 400, `${DRINKS[i]}: the photo shows`);
    assert.equal(t.badge, 'Sample', `${DRINKS[i]}: marked Sample`);
    assert.deepEqual(t.size, [64, 64], `${DRINKS[i]}: the tile keeps its size`);
    assert.ok(t.badgeInside, `${DRINKS[i]}: the mark is on the photo`);
  });
  assert.deepEqual(samplesServed.filter((u) => u.includes('w=1080')), [], 'the full size isn\'t loaded in the review');
  await shoot('1b-sample-photos.png');
  passed('items with no picture on the menu get a sample photo, one by one in the menu\'s order, hotlinked and marked Sample');

  // 3. A price is needed before saving.
  await page.click('text=Add 6 Products');
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.textContent('[role="alert"]'), /Add a price for 2 selected items, or deselect them\./);
  await page.evaluate(() => document.querySelectorAll('[data-testid="scan-item"]')[4].scrollIntoView({ block: 'center' }));
  await shoot('2-prices-needed.png');
  passed('saving with an empty price asks for it first');

  // 3b. The descriptions the menu didn't print, written one by one; an item's editor from its price.
  await page.waitForSelector('[data-testid="scan-written"]', { timeout: 15000 });
  assert.deepEqual(await page.evaluate(() => window.__described), [['Laksa', 'Kopi', 'Teh Tarik', 'Iced Lemon Tea']], 'only those without printed words, in the menu\'s order');
  assert.equal(await page.textContent('[data-testid="scan-written"]'), '4 descriptions written. Check the ones marked AI draft.');
  await page.click('[aria-label="Add a price for Teh Tarik"]');
  await page.waitForSelector('[data-testid="scan-edit"]');
  const sheetBox = await page.locator('[data-testid="scan-edit"]').boundingBox();
  assert.ok(sheetBox.y >= 0 && sheetBox.y + sheetBox.height <= 844.5, `the editor fits the screen: ${JSON.stringify(sheetBox)}`);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), 'scan-edit-price', 'opened on the price');
  await page.keyboard.type('2.2');
  assert.equal(await page.inputValue('[data-testid="scan-edit"] textarea'), 'Teh Tarik, as served at our stall.');
  // Its sample photos: square tiles, five a row, the one shown marked, its photographer credited.
  const samples = () => page.evaluate(() => {
    const box = document.querySelector('[data-testid="scan-edit"] [data-testid="scan-samples"]');
    const sheet = document.querySelector('[data-testid="scan-edit"]').getBoundingClientRect();
    const buttons = [...box.querySelectorAll('button[aria-label^="Use sample photo"]')];
    const credit = box.querySelector('[data-testid="photo-credit"]');
    const c = credit.getBoundingClientRect();
    return {
      count: buttons.length,
      pressed: buttons.map((b) => b.getAttribute('aria-pressed') === 'true'),
      rows: [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))].length,
      square: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.width > 40 && Math.abs(r.width - r.height) <= 1; }),
      inside: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.left >= sheet.left && r.right <= sheet.right; }),
      loaded: buttons.every((b) => { const img = b.querySelector('img'); return img.complete && img.naturalWidth === 400; }),
      credit: credit.textContent,
      creditInside: c.left >= sheet.left && c.right <= sheet.right && credit.scrollWidth <= credit.clientWidth,
      links: [...credit.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]),
      photo: document.querySelector('[data-testid="scan-edit-photo"] img').getAttribute('src'),
    };
  });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="scan-samples"] button img')].every((img) => img.complete && img.naturalWidth > 0));
  let found = await samples();
  assert.deepEqual([found.count, found.rows, found.square, found.inside, found.loaded], [10, 2, true, true, true], `ten samples, square, five a row, on the sheet: ${JSON.stringify(found)}`);
  assert.deepEqual(found.pressed, [true, false, false, false, false, false, false, false, false, false]);
  assert.equal(found.credit, 'Sample photo · Photo by Photographer 1 on Unsplash');
  assert.ok(found.creditInside, 'the credit fits the sheet');
  assert.deepEqual(found.links, [['Photographer 1', 'https://unsplash.com/@p1?utm_source=sellio&utm_medium=referral', '_blank'], ['Unsplash', 'https://unsplash.com/?utm_source=sellio&utm_medium=referral', '_blank']]);
  const editorBox = await page.locator('[data-testid="scan-edit"]').boundingBox();
  assert.ok(editorBox.y >= 0 && editorBox.y + editorBox.height <= 844.5, `with its samples, the editor still fits the screen: ${JSON.stringify(editorBox)}`);
  await page.click('[aria-label="Use sample photo 3"]');
  found = await samples();
  assert.equal(found.photo, 'https://images.unsplash.test/photo-teh-tarik-3?w=400', 'the sample tapped is the item\'s photo');
  assert.deepEqual(found.pressed.map((p, i) => (p ? i + 1 : 0)).filter(Boolean), [3]);
  assert.equal(found.credit, 'Sample photo · Photo by Photographer 3 on Unsplash', 'credited to its photographer');
  await page.evaluate(() => document.querySelector('[data-testid="scan-samples"]').scrollIntoView({ block: 'end' }));
  await shoot('2b-item-editor.png');
  await page.click('[data-testid="scan-edit"] button:has-text("Done")');
  assert.equal(await page.locator('[data-testid="scan-edit"]').count(), 0);
  assert.equal((await page.textContent('[aria-label^="Price of Teh Tarik"]')).trim(), 'S$2.20');
  assert.equal(await page.getAttribute('[aria-label="Photo for Teh Tarik"] img', 'src'), 'https://images.unsplash.test/photo-teh-tarik-3?w=400', 'the list shows the sample chosen');
  passed('descriptions are written for the items the menu printed none for; an item\'s editor opens on its price, shows its sample photos (square, five a row) with the photographer credited, and fits the screen');

  // 4. The photo editor, on the whole menu, with the picture boxed.
  const EDITOR = 'div.fixed.inset-0';
  const openEditor = async (name, { box = true } = {}) => {
    await page.evaluate(() => document.querySelector('[data-testid="scan-item"]').scrollIntoView({ block: 'center' }));
    await page.click(`[aria-label="Photo for ${name}"]`);
    await page.waitForSelector(`${EDITOR} canvas`, { timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="photo-opening"]') && document.querySelector('div.fixed.inset-0 canvas').width > 0, null, { timeout: 15000 });
    if (box) await page.waitForSelector('.border-white.cursor-move', { timeout: 5000 });
    else await page.waitForTimeout(300);
    return page.evaluate(() => {
      const canvas = document.querySelector('div.fixed.inset-0 canvas');
      const boxed = document.querySelector('.border-white.cursor-move');
      const hint = document.querySelector('div.fixed.inset-0 h3 + p');
      return { canvas: [canvas.width, canvas.height], box: boxed ? ['left', 'top', 'width', 'height'].map((k) => parseFloat(boxed.style[k])) : null, hint: hint ? hint.textContent : null };
    });
  };
  const footer = (label) => page.locator(`${EDITOR} button`, { hasText: new RegExp(`^\\s*${label}\\s*$`) });
  const editorOpen = () => page.evaluate(() => !!document.querySelector('div.fixed.inset-0 canvas'));
  const boxOn = (placed, dish, what) => {
    const scale = placed.canvas[0] / 3024;
    const want = [dish.x, dish.y, dish.w, dish.h].map((n) => n * scale);
    placed.box.forEach((v, k) => assert.ok(Math.abs(v - want[k]) <= 3, `${what}: the box (${placed.box.map(Math.round)}) is on ${dish.name}'s picture (${want.map(Math.round)})`));
  };
  let placed = await openEditor('Nasi Lemak');
  boxOn(placed, dishes[1], 'opened');
  assert.ok(placed.canvas[1] > 300, `a taller view than before (${placed.canvas[1]} px)`);
  assert.equal(placed.hint, 'Move the box onto its picture, then tap Apply and Save.');
  await shoot('3-photo-editor.png');
  passed('tapping a photo opens the editor on the whole menu, with that dish\'s picture boxed');

  // Cancel there: the editor closes, the picture is as it was.
  await footer('Cancel').click();
  await page.waitForFunction(() => !document.querySelector('div.fixed.inset-0 canvas'));
  assert.ok(near((await pictures())[1].middle, dishes[1].middle, 18), 'Nasi Lemak keeps its picture');

  // The box moved onto another picture: that picture, from the photo's own pixels.
  placed = await openEditor('Nasi Lemak');
  const from = await page.locator('.border-white.cursor-move').boundingBox();
  const scale = placed.canvas[0] / 3024;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(start.x + ((dishes[2].x - dishes[1].x) * scale * step) / 8, start.y);
  await page.mouse.up();
  boxOn(await page.evaluate(() => ({ canvas: [document.querySelector('div.fixed.inset-0 canvas').width], box: ['left', 'top', 'width', 'height'].map((k) => parseFloat(document.querySelector('.border-white.cursor-move').style[k])) })), dishes[2], 'moved');
  await footer('Apply').click();
  await footer('Save').waitFor();
  await footer('Save').click();
  await page.waitForFunction(() => !document.querySelector('div.fixed.inset-0 canvas'));
  await page.waitForFunction(() => {
    const img = document.querySelectorAll('[data-testid="scan-item-photo"]')[1].querySelector('img');
    return img && img.complete && img.naturalWidth > 0 && img.src.startsWith('blob:');
  });
  let now = (await pictures())[1];
  assert.ok(near(now.middle, dishes[2].middle, 18), `Nasi Lemak now has the picture the box was moved to (${now.middle})`);
  assert.ok(near(now.corner, FRAME, 18), `cut on that picture (${now.corner})`);
  assert.ok(now.size[0] >= 780 && now.size[0] <= 860, `at the photo's own pixels: ${now.size.join(' × ')} (the picture is 820 × 820 on the photo)`);
  // Next time the editor opens there.
  placed = await openEditor('Nasi Lemak');
  boxOn(placed, dishes[2], 'opened again');
  await footer('Cancel').click();
  await page.waitForFunction(() => !document.querySelector('div.fixed.inset-0 canvas'));
  passed('Cancel on the box changes nothing; the box moved onto another picture gives that picture at full size, and opens there next time');

  // A photo chosen with Replace: it's the item's photo, and opens on its own next time.
  await openEditor('Nasi Lemak');
  const replacement = Buffer.from(await page.evaluate(() => window.__replacement()), 'base64');
  await page.setInputFiles(`${EDITOR} input[type="file"]`, { name: 'dish.png', mimeType: 'image/png', buffer: replacement });
  await page.waitForFunction(() => { const c = document.querySelector('div.fixed.inset-0 canvas'); return c && Math.abs(c.width / c.height - 1.5) < 0.02 && !document.querySelector('[data-testid="photo-opening"]'); }, null, { timeout: 15000 });
  await footer('Save').click();
  await page.waitForFunction(() => !document.querySelector('div.fixed.inset-0 canvas'));
  await page.waitForFunction(() => {
    const img = document.querySelectorAll('[data-testid="scan-item-photo"]')[1].querySelector('img');
    return img && img.complete && Math.abs(img.naturalWidth / img.naturalHeight - 1.5) < 0.02;
  });
  now = (await pictures())[1];
  assert.ok(near(now.middle, [120, 60, 200], 18), `Nasi Lemak's photo is the one chosen (${now.middle})`);
  placed = await openEditor('Nasi Lemak', { box: false });
  assert.ok(Math.abs(placed.canvas[0] / placed.canvas[1] - 1.5) < 0.02, `the editor opens on that photo (${placed.canvas.join(' × ')}), not the menu`);
  assert.equal(placed.box, null, 'nothing boxed');
  assert.equal(placed.hint, null, 'no menu hint');
  await footer('Cancel').click();
  await page.waitForFunction(() => !document.querySelector('div.fixed.inset-0 canvas'));
  assert.ok(near((await pictures())[1].middle, [120, 60, 200], 18), 'still that photo');
  assert.equal(await editorOpen(), false);
  passed('a photo chosen with Replace becomes the item\'s photo, and opens on its own next time');

  // 5. Nothing found says why.
  const second = await context.newPage();
  await second.addInitScript(() => { window.__mode = 'blurry'; });
  await second.goto('https://scan.test/', { waitUntil: 'load' });
  await second.waitForSelector('#open-scan:not([disabled])');
  await second.tap('#open-scan');
  await second.waitForSelector('[role="alert"]', { timeout: 20000 });
  assert.match(await second.textContent('[role="alert"]'), /The menu is too blurry to read\./);
  assert.equal(await second.locator('button', { hasText: /^Try Again$/ }).count(), 0, 'no Try Again for a blurry photo');
  if (shots) await second.screenshot({ path: path.join(shots, '4-too-blurry.png') });
  passed('a scan that finds nothing says why');

  assert.deepEqual(errors, [], 'no errors on the page');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} menu scan browser checks passed`);
