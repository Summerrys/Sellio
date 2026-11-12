// Indonesia's prices on the start page's pricing, in real Chrome on the built website (npm run
// build first), served as https://sellio.sg the way public/_worker.js routes it; every outside
// address is blocked. A visitor whose computer or phone is in Jakarta sees S$18, S$35 and S$56 on
// Indonesia's free-trial links, about what they come to in rupiah (on a phone too) and how they're
// paid, with no setup visit; a visitor in Singapore sees the page as before.
// Run: node verification/indonesia-pricing.browser.mjs /tmp/sellio-verification [screenshot-dir]
// (needs playwright there, or playwright-core and a Chrome: CHROME_PATH, default /usr/bin/google-chrome)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
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
const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' };

function fileFor(pathname) {
  if (pathname === '/') return 'index.html';
  if (pathname === '/privacy' || pathname === '/terms') return `${pathname.slice(1)}/index.html`;
  if (pathname.startsWith('/store/')) return 'store.html';
  if (pathname === '/explore' || /^\/listing\/[^/]+$/.test(pathname)) return 'explore.html';
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (name.includes('.') && !name.endsWith('.html')) return decodeURIComponent(pathname.slice(1));
  return 'app.html';
}

// The links the cards should carry, from lib/plans.js.
const temporary = await mkdtemp(path.join(app, '.indonesia-pricing-browser-'));
let plans;
try {
  const outfile = path.join(temporary, 'plans.mjs');
  await build({ entryPoints: [path.join(app, 'src/lib/plans.js')], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
  const { INDONESIA_PLANS, BUSINESS_PLANS } = await import(pathToFileURL(outfile).href);
  plans = {
    indonesiaTrialMonthly: INDONESIA_PLANS.map((plan) => plan.links.monthly),
    restTrialMonthly: BUSINESS_PLANS.map((plan) => plan.links.monthly),
  };
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const browser = await chromium.launch({ executablePath, headless: true });
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

async function pricing({ timezoneId, viewport, label }) {
  const context = await browser.newContext({ viewport, timezoneId, locale: 'en-US', serviceWorkers: 'block', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'sellio.sg') return route.abort();
    try {
      const file = fileFor(url.pathname);
      const body = await readFile(path.join(app, 'dist', file));
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file).slice(1)] || 'application/octet-stream', body });
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
  });
  const page = await context.newPage();
  await page.goto('https://sellio.sg/', { waitUntil: 'load' });
  await page.waitForSelector('#pricing .sellio-pricing-card', { timeout: 20000 });
  await page.evaluate(() => document.getElementById('pricing').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  const seen = await page.evaluate(() => {
    const section = document.getElementById('pricing');
    const visible = (el) => {
      if (!el) return false;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    return {
      cards: [...section.querySelectorAll('.sellio-pricing-card')].map((card) => ({
        name: card.querySelector('h3')?.textContent.trim(),
        price: card.querySelector('.sellio-plan-price')?.textContent.replace(/\s+/g, ' ').trim(),
        rupiah: card.querySelector('[data-testid="plan-rupiah"]')?.textContent.trim() || null,
        rupiahShown: visible(card.querySelector('[data-testid="plan-rupiah"]')),
        link: card.querySelector('a.sellio-button--plan')?.getAttribute('href'),
      })),
      note: section.querySelector('[data-testid="plan-payment-note"]')?.textContent.trim() || null,
      setup: /Done-for-you setup/.test(section.textContent),
    };
  });
  if (shots) await page.locator('#pricing').screenshot({ path: path.join(shots, `pricing-${label}.png`) });
  await context.close();
  return seen;
}

try {
  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const jakarta = await pricing({ timezoneId: 'Asia/Jakarta', viewport, label: `jakarta-${label}` });
    assert.deepEqual(jakarta.cards.map((c) => [c.name, c.price, c.rupiah]), [
      ['Starter', 'SGD18/month', 'about Rp255.000, charged in Rupiah'],
      ['Growth', 'SGD35/month', 'about Rp496.000, charged in Rupiah'],
      ['Professional', 'SGD56/month', 'about Rp793.000, charged in Rupiah'],
    ], label);
    for (const card of jakarta.cards) assert.equal(card.rupiahShown, true, `${label}: ${card.name}'s rupiah line is on screen`);
    assert.deepEqual(jakarta.cards.map((c) => c.link), plans.indonesiaTrialMonthly, `${label}: Indonesia's free-trial links`);
    assert.match(jakarta.note, /^Paid by card, in Rupiah/);
    assert.equal(jakarta.setup, false, 'no setup visit in Indonesia');
    passed(`${label}, a visitor in Jakarta: S$18, S$35 and S$56 with about what they are in rupiah, on Indonesia's links`);

    const singapore = await pricing({ timezoneId: 'Asia/Singapore', viewport, label: `singapore-${label}` });
    assert.deepEqual(singapore.cards.map((c) => [c.name, c.price, c.rupiah]), [
      ['Starter', 'SGD39/month', null],
      ['Growth', 'SGD79/month', null],
      ['Professional', 'SGD119/month', null],
    ], label);
    assert.deepEqual(singapore.cards.map((c) => c.link), plans.restTrialMonthly, `${label}: the free-trial links as before`);
    assert.equal(singapore.note, null);
    assert.equal(singapore.setup, true);
    passed(`${label}, a visitor in Singapore: the prices and links as before, with the setup visit`);
  }
  console.log(passes + ' indonesia-pricing browser checks passed');
} finally {
  await browser.close();
}
