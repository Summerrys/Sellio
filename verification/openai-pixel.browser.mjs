// ChatGPT ads, end to end in real Chrome on the built website (npm run build first), served as
// https://sellio.sg the way public/_worker.js routes it. OpenAI's SDK is replaced by a stand-in
// that records every oaiq call (queued ones included); every other outside address is blocked.
// 1. The start page: no Pixel until the cookie bar's Allow; Allow starts it (consent, then init).
// 2. Start Free Trial on the pricing cards notes the trial checkout; Stripe's return,
//    /Auth?token=cs_…, measures trial_started with that checkout as event_id; reloading it sends
//    the same event_id (OpenAI keeps one).
// 3. With cookies allowed: no Pixel on a storefront or in the shop workspace.
// 4. Cookie settings → Decline stops the Pixel (oaiq('consent', false)) and the next page has none.
// 5. None in Sellio's app (Capacitor) or at the Cloudflare preview address, even with cookies allowed.
// Run: node verification/openai-pixel.browser.mjs /tmp/sellio-verification
// (needs playwright there, or playwright-core and a Chrome: CHROME_PATH, default /usr/bin/google-chrome)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
let chromium;
let executablePath;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require('playwright-core'));
  executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
}

const SDK = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
const PIXEL_ID = '2bHx6GyaD53HN9UapJRGVS';
const CHECKOUT = 'cs_live_a1B2c3D4e5F6g7H8';
const FAKE_SDK = `(function () {
  var calls = window.__oaiqCalls = [], waiting = (window.oaiq && window.oaiq.q) || [];
  for (var i = 0; i < waiting.length; i++) calls.push(Array.prototype.slice.call(waiting[i]));
  window.oaiq = function () { calls.push(Array.prototype.slice.call(arguments)); };
  window.__oaiqLoaded = true;
})();`;
const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' };

// public/_worker.js's routing, for any host serving the build.
function fileFor(pathname) {
  if (pathname === '/') return 'index.html';
  if (pathname === '/privacy' || pathname === '/terms') return `${pathname.slice(1)}/index.html`;
  if (pathname.startsWith('/store/')) return 'store.html';
  if (pathname === '/explore' || /^\/listing\/[^/]+$/.test(pathname)) return 'explore.html';
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (name.includes('.') && !name.endsWith('.html')) return decodeURIComponent(pathname.slice(1));
  return 'app.html';
}

const browser = await chromium.launch({ executablePath, headless: true });
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

async function newSite({ hosts = ['sellio.sg'], cookie = null, app: inApp = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const sdkLoads = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === SDK) {
      sdkLoads.push(route.request().frame().url());
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK });
    }
    if (url.hostname === 'buy.stripe.com') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stripe</title>' });
    if (!hosts.includes(url.hostname)) return route.abort();
    const file = fileFor(url.pathname);
    try {
      const body = await readFile(path.join(app, 'dist', file));
      return route.fulfill({ status: 200, contentType: TYPES[file.split('.').pop()] || 'application/octet-stream', body });
    } catch {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    }
  });
  if (cookie !== null) {
    const updatedAt = Date.now() - 1000;
    const value = encodeURIComponent(JSON.stringify({ version: 1, analytics: cookie, updatedAt, expiresAt: updatedAt + 180 * 24 * 60 * 60 * 1000 }));
    await context.addCookies(hosts.map((domain) => ({ name: 'sellio_cookie_consent', value, domain, path: '/', secure: true, sameSite: 'Lax' })));
  }
  if (inApp) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; });
  const page = await context.newPage();
  return { context, page, sdkLoads };
}
const calls = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__oaiqCalls || null)));
const settle = (page) => page.waitForTimeout(1500); // main.jsx and the head have both run
const SET_UP = [['consent', true], ['init', { pixelId: PIXEL_ID, debug: true }]];
const TRIAL = ['measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: CHECKOUT }];

try {
  // 1-2. A first visit from an ad.
  {
    const { context, page, sdkLoads } = await newSite();
    await page.goto('https://sellio.sg/?oppref=test-ad-click', { waitUntil: 'load' });
    const allow = page.getByRole('button', { name: 'Allow' });
    await allow.waitFor({ timeout: 20000 });
    await settle(page);
    assert.equal(sdkLoads.length, 0, 'no SDK before Allow');
    assert.equal(await page.evaluate(() => typeof window.oaiq), 'undefined', 'no oaiq before Allow');
    assert.equal(await page.evaluate(() => typeof window.__sellioOpenAIPixel), 'function');
    await allow.click();
    await page.waitForFunction(() => window.__oaiqLoaded === true, null, { timeout: 10000 });
    assert.equal(sdkLoads.length, 1, 'Allow loads the SDK once');
    assert.deepEqual(await calls(page), SET_UP, 'Allow: consent, then init with the Pixel ID');
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('oppref')), 'test-ad-click', 'the ad reference is still in the address when the SDK loads');
    passed('start page: no Pixel until Allow; Allow starts it once');

    const trial = page.locator('a.sellio-button--plan').first();
    await trial.scrollIntoViewIfNeeded();
    const [stripe] = await Promise.all([context.waitForEvent('page'), trial.click()]);
    assert.match(stripe.url(), /^https:\/\/buy\.stripe\.com\//, 'Start Free Trial opens Stripe');
    await stripe.close();
    const note = await page.evaluate(() => JSON.parse(localStorage.getItem('sellio-ads-trial-checkout')));
    assert.ok(note && Number.isFinite(note.at) && note.checkout === null, 'the trial checkout is noted');
    assert.equal((await calls(page)).filter((call) => call[0] === 'measure').length, 0, 'opening checkout measures nothing');
    passed('Start Free Trial notes the trial checkout');

    await page.goto(`https://sellio.sg/Auth?token=${CHECKOUT}`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window.__oaiqCalls || []).some((call) => call[0] === 'measure'), null, { timeout: 10000 });
    await settle(page);
    assert.deepEqual(await calls(page), [...SET_UP, TRIAL], "Stripe's return: the Pixel, then trial_started for that checkout");
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => (window.__oaiqCalls || []).some((call) => call[0] === 'measure'), null, { timeout: 10000 });
    assert.deepEqual((await calls(page)).filter((call) => call[0] === 'measure'), [TRIAL], 'a reload sends the same event_id');
    passed("Stripe's return (/Auth?token=cs_…) measures trial_started with the checkout id");

    // 3. Pages without the Pixel, cookies allowed.
    for (const where of ['/store/beijing-dumplings', '/Dashboard', '/Orders', '/Counter']) {
      const before = sdkLoads.length;
      await page.goto(`https://sellio.sg${where}`, { waitUntil: 'load' });
      await settle(page);
      assert.equal(sdkLoads.length, before, `${where}: no SDK`);
      assert.equal(await page.evaluate(() => typeof window.oaiq), 'undefined', `${where}: no oaiq`);
    }
    passed('cookies allowed: no Pixel on a storefront or in the shop workspace');

    // 4. Decline.
    await page.goto('https://sellio.sg/privacy', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__oaiqLoaded === true, null, { timeout: 10000 });
    await page.getByRole('button', { name: 'Cookie settings' }).click();
    await page.getByRole('button', { name: 'Decline' }).click();
    await page.waitForFunction(() => (window.__oaiqCalls || []).some((call) => call[0] === 'consent' && call[1] === false), null, { timeout: 5000 });
    assert.deepEqual((await calls(page)).slice(-1), [['consent', false]], 'Decline stops the Pixel');
    const before = sdkLoads.length;
    await page.goto('https://sellio.sg/', { waitUntil: 'load' });
    await settle(page);
    assert.equal(sdkLoads.length, before, 'after Decline: no SDK on the next page');
    passed('Cookie settings → Decline stops the Pixel; the next page has none');
    await context.close();
  }

  // 5. The app and other addresses.
  {
    const { context, page, sdkLoads } = await newSite({ cookie: true, app: true });
    await page.goto(`https://sellio.sg/Auth?token=${CHECKOUT}`, { waitUntil: 'load' });
    await settle(page);
    assert.equal(sdkLoads.length, 0, 'the app: no SDK');
    assert.equal(await page.evaluate(() => typeof window.oaiq), 'undefined', 'the app: no oaiq');
    await context.close();
  }
  {
    const { context, page, sdkLoads } = await newSite({ hosts: ['sellio-f1t.pages.dev'], cookie: true });
    await page.goto('https://sellio-f1t.pages.dev/', { waitUntil: 'load' });
    await settle(page);
    assert.equal(sdkLoads.length, 0, 'the preview address: no SDK');
    await context.close();
  }
  {
    const { context, page, sdkLoads } = await newSite({ cookie: true });
    await page.goto('https://sellio.sg/explore', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__oaiqLoaded === true, null, { timeout: 10000 });
    assert.equal(sdkLoads.length, 1, 'Explore with cookies allowed: the Pixel');
    await context.close();
  }
  passed("no Pixel in Sellio's app or at the preview address; Explore has it");
} finally {
  await browser.close();
}
console.log(`\n${passes} checks passed`);
