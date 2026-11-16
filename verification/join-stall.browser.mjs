// The free sign-up's stall (components/auth/JoinStall.jsx; Alvin, 17 Nov 2026, "J"), in Chrome as
// a phone, on the real Join page, in English, 中文, Bahasa Indonesia and Malay: the awning on the
// card's top edge; the counter and the food centred; the Sellio sign going home and clear of the
// food; "Sell from home" and "Run your business" across the counter's lower edge, inside its ends
// and clear of FREE! and the headline; FREE! inside its
// star and clear of the headline; no emoji; the whole card on a regular phone's screen; still for a
// phone set to reduce motion; and the other screens (check your email) keep their usual top.
//
//   node verification/join-stall.browser.mjs <folder with playwright(-core)> [screenshot folder]
// The page is built from src with stand-ins for Supabase (as in form-errors.browser.mjs).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
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
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Auth from '@/pages/AUTH_FILE';
import Join from '@/pages/JOIN_FILE';

window.__calls = [];
const chain = (result) => {
  const q = { select: () => q, eq: () => q, limit: () => q, order: () => q, in: () => q, insert: () => q, update: () => q, upsert: () => q,
    maybeSingle: async () => result, single: async () => result, then: (resolve) => resolve(result) };
  return q;
};
window.__client = {
  auth: {
    getSession: async () => ({ data: { session: window.__session || null } }),
    getUser: async () => ({ data: { user: window.__session?.user || null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signUp: async (body) => { window.__calls.push(['signUp', body]); return window.__signUp || { data: {}, error: null }; },
    signInWithOtp: async (body) => { window.__calls.push(['signInWithOtp', body]); return { data: {}, error: window.__otpError || null }; },
    updateUser: async (body) => { window.__calls.push(['updateUser', body]); return { data: {}, error: window.__updateUserError || null }; },
    verifyOtp: async () => ({ data: {}, error: null }),
    setSession: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
  rpc: (name, args) => {
    window.__calls.push(['rpc', name, args]);
    if (name === 'get_invite_by_token') return chain({ data: window.__invite || null, error: null });
    if (name === 'my_account_status') return chain({ data: window.__status || null, error: null });
    if (name === 'complete_account_setup') return chain({ data: null, error: window.__setupError || null });
    return chain({ data: null, error: null });
  },
  from: () => chain({ data: [], error: null }),
  functions: { invoke: async () => ({ data: null, error: null }) },
};

const screen = location.pathname.toLowerCase().startsWith('/join') ? <Join /> : <Auth />;
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    {screen}
    <Toaster />
  </BrowserRouter>,
);
`;

const temporary = await mkdtemp(path.join(app, '.join-stall-browser-'));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const authFile = 'Auth';
  const joinFile = 'Join';
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE.replace('AUTH_FILE', authFile).replace('JOIN_FILE', joinFile));
  const stub = (name, contents) => ({ name, contents });
  const stubs = [
    [/supabaseClient$/, stub('client', 'export const getSupabase = async () => window.__client; export const getMobileOAuthClient = () => window.__client; export const SUPABASE_URL = "https://x.invalid"; export const supabase = window.__client;')],
    [/base44Client$/, stub('base44', 'export const base44 = { auth: {}, entities: {} };')],
    [/AppUserContext$/, stub('profile', 'import React from "react"; const C = React.createContext(null); export default C; export const AppUserContext = C; export function useAppUser() { return { appUser: null, setAppUser: (u) => { window.__calls.push(["setAppUser", u]); }, loading: false }; } export const AppUserProvider = ({ children }) => children; export const cookieUtils = { get: () => null, set() {}, remove() {} };')],
    [/lib\/phoneAuth(\.js)?$/, stub('phone', 'export async function callPhoneAuth(body) { window.__calls.push(["phone-auth", body]); return window.__phoneAuth ? window.__phoneAuth(body) : null; }')],
    [/authNavigation(\.js)?$/, stub('navigation', 'export function completeAuthNavigation(to) { window.__calls.push(["navigate", to]); } export const authNavigation = {};')],
  ];
  const plugin = { name: 'stand-ins', setup(b) {
    stubs.forEach(([filter, s]) => {
      b.onResolve({ filter }, () => ({ path: s.name, namespace: 'stub' }));
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ loader: 'jsx', resolveDir: app, contents: stubs.find(([, s]) => s.name === args.path)[1].contents }));
  } };
  const result = await build({
    entryPoints: [entry], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false,
    alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')], loader: { '.js': 'jsx' }, plugins: [plugin],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const appHtml = await readFile(path.join(app, 'dist/app.html'), 'utf8');
  const cssFiles = [...appHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(app, 'dist', f), 'utf8')))).join('\n').replace(/<\/style/gi, '<\\/style');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script type="module">${js}</script></body></html>`;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore' });
  const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'forms.test') return route.abort();
    if (!u.pathname.includes('.')) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    // The app's own pictures (its logo), from the build.
    const file = path.join(app, 'dist', path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, ''));
    if (!file.startsWith(path.join(app, 'dist'))) return route.abort();
    try { return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: await readFile(file) }); } catch { return route.abort(); }
  });
  if (shots) await mkdir(shots, { recursive: true });
  const errors = [];
  async function open(address, setup = '') {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${address}: ${e.message}`));
    if (setup) await page.addInitScript(setup);
    await page.goto(`https://forms.test${address}`);
    return page;
  }
  const shoot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, selector);
  const invalid = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-invalid'), selector);
  const focused = (page) => page.evaluate(() => document.activeElement?.id || null);
  const calls = (page, kind) => page.evaluate((k) => window.__calls.filter((c) => c[0] === k), kind);

  // ── The stall, in each language, on a regular phone and a small one ──────────────────────
  const measure = (page) => page.evaluate(() => {
    const stall = document.querySelector('[data-testid="join-stall"]');
    const card = stall.closest('.rounded-2xl');
    const c = card.getBoundingClientRect();
    const svg = stall.querySelector('.join-stall-scene > svg').getBoundingClientRect();
    const k = svg.width / 358;
    const at = (x) => svg.left + x * k;
    const counter = { left: at(54), right: at(304), top: svg.top + 100 * k, bottom: svg.top + 134 * k };
    const sign = stall.querySelector('.join-stall-sign');
    const s = sign.getBoundingClientRect();
    const stickers = [...stall.querySelectorAll('.join-stall-sticker')].map((e) => e.getBoundingClientRect());
    const burst = stall.querySelector('.join-stall-burst');
    const b = burst.getBoundingClientRect();
    const h1 = stall.querySelector('h1');
    const line = parseFloat(getComputedStyle(h1).lineHeight);
    const hr = h1.getBoundingClientRect();
    const font = getComputedStyle(burst);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
    const awning = stall.querySelector('.join-stall-awning').getBoundingClientRect();
    return {
      awningOnTop: Math.round(awning.top - c.top), awningFull: Math.round(awning.width - c.width),
      counterCentre: Math.round((counter.left + counter.right) / 2 - (c.left + c.right) / 2),
      foodCentre: Math.round((at(114) + at(244)) / 2 - (c.left + c.right) / 2),
      signClear: Math.round(at(114) - s.right), signHref: sign.getAttribute('href'), signLabel: sign.getAttribute('aria-label'),
      stickersIn: stickers.map((r) => [Math.round(r.left - counter.left), Math.round(counter.right - r.right)]),
      stickersApart: stickers.length === 2 ? Math.round(stickers[1].left - stickers[0].right) : null,
      stickersBelowCounter: stickers.map((r) => Math.round(r.bottom - counter.bottom)),
      stickersClearOfFree: stickers.every((r) => r.right + 2 <= b.left || b.right + 2 <= r.left || r.bottom + 2 <= b.top || b.bottom + 2 <= r.top),
      stickersAboveHeadline: Math.round(hr.top - Math.max(...stickers.map((r) => r.bottom))),
      freeText: burst.textContent, freeFits: ctx.measureText(burst.textContent).width <= b.width * 0.78,
      freeClear: Math.round(hr.top - b.bottom), freeInCard: Math.round(b.left - c.left),
      lines: Math.round(hr.height / line), headline: h1.textContent,
      cardBottom: Math.round(c.bottom + 16),
      emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(stall.textContent),
    };
  });
  const LANGUAGES = { en: ['Open your shop on Sellio', 'FREE!', 'Sell from home'], zh: ['在 Sellio 开设您的店铺', '免费！', '在家开店'], id: ['Buka toko Anda di Sellio', 'GRATIS!', 'Jualan dari rumah'], ms: ['Buka kedai anda di Sellio', 'PERCUMA!', 'Jual dari rumah'] };
  for (const [language, [headline, free, home]] of Object.entries(LANGUAGES)) {
    for (const [w, h] of [[390, 844], [360, 740]]) {
      const page = await context.newPage();
      await page.setViewportSize({ width: w, height: h });
      page.on('pageerror', (e) => errors.push(`${language} ${w}: ${e.message}`));
      await page.addInitScript((code) => { try { localStorage.setItem('sellio_app_language', code); } catch {} }, language);
      await page.goto('https://forms.test/Join');
      await page.locator('[data-testid="join-stall"]').waitFor();
      await page.waitForFunction((text) => document.querySelector('[data-testid="join-stall"] h1')?.textContent === text, headline, { timeout: 10000 });
      await page.waitForTimeout(900);
      const m = await measure(page);
      const where = `${language} at ${w}px`;
      assert.equal(m.headline, headline, where);
      assert.equal(m.freeText, free, where);
      assert.equal(await page.locator('.join-stall-sticker.home').textContent(), home, where);
      assert.equal(m.awningOnTop, 0, `${where}: the awning sits on the card's top edge`);
      assert.ok(Math.abs(m.awningFull) <= 1, `${where}: the awning spans the card`);
      assert.ok(Math.abs(m.counterCentre) <= 1 && Math.abs(m.foodCentre) <= 1, `${where}: the counter and the food are centred`);
      assert.ok(m.signClear >= 6, `${where}: the sign is clear of the bowl (${m.signClear}px)`);
      assert.equal(m.signHref, '/', `${where}: on a website the sign goes home`);
      if (language === 'en') assert.equal(m.signLabel, 'Sellio home'); else assert.ok(m.signLabel && m.signLabel !== 'Sellio home', `${where}: the sign's name is translated`);
      m.stickersIn.forEach(([left, right], i) => assert.ok(left >= 0 && right >= -1, `${where}: sticker ${i + 1} on the counter (${left}, ${right})`));
      assert.ok(m.stickersApart >= 3, `${where}: the stickers don't overlap (${m.stickersApart})`);
      assert.ok(m.stickersBelowCounter.every((d) => d >= 4 && d <= 14), `${where}: the stickers hang a little below the counter (${m.stickersBelowCounter})`);
      assert.ok(m.stickersClearOfFree, `${where}: the stickers are clear of FREE!`);
      assert.ok(m.stickersAboveHeadline >= 6, `${where}: the stickers are clear of the headline (${m.stickersAboveHeadline})`);
      assert.ok(m.freeFits, `${where}: "${free}" fits inside its star`);
      assert.ok(m.freeClear >= -1, `${where}: FREE! is clear of the headline (${m.freeClear})`);
      assert.ok(m.freeInCard >= 0, `${where}: FREE! is inside the card`);
      assert.equal(m.emoji, false, `${where}: no emoji`);
      if (language !== 'zh' || w === 390) assert.equal(m.lines, 1, `${where}: the headline on one line`);
      if (w === 390) assert.ok(m.cardBottom <= h, `${where}: the whole card on a regular phone's screen (${m.cardBottom})`);
      if (w === 390) await shoot(page, `stall-${language}`);
      await page.close();
    }
    passed(`${language}: the awning on top, counter and food centred, the sign clear and going home, the stickers on the counter, "${free}" in its star and clear of the headline, no emoji`);
  }

  // ── A small phone; Reduce motion ─────────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => { try { localStorage.setItem('sellio_app_language', 'en'); } catch {} });
    await page.goto('https://forms.test/Join');
    await page.locator('[data-testid="join-stall"]').waitFor();
    await page.waitForTimeout(600);
    const still = await page.evaluate(() => ({
      running: document.getAnimations().filter((a) => a.effect?.target?.closest?.('[data-testid="join-stall"]')).length,
      tick: getComputedStyle(document.querySelector('.join-stall-tick')).strokeDashoffset,
      steam: getComputedStyle(document.querySelector('.join-stall-steam')).opacity,
    }));
    assert.equal(still.running, 0, 'nothing moves');
    assert.equal(still.tick, '0px', 'the tick is drawn');
    assert.equal(still.steam, '0.7', 'the steam shows');
    await shoot(page, 'stall-en-small-still');
    passed('A phone set to reduce motion: the stall is still, with its tick and steam showing');
    await page.close();
  }
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => { try { localStorage.setItem('sellio_app_language', 'en'); } catch {} });
    await page.goto('https://forms.test/Join');
    await page.locator('[data-testid="join-stall"]').waitFor();
    await page.waitForTimeout(400);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('[data-testid="join-stall"]') && a.playState === 'running').map((a) => a.animationName));
    for (const name of ['sellio-stall-swing', 'sellio-stall-steam', 'sellio-stall-tick', 'sellio-stall-bubble', 'sellio-stall-twinkle', 'sellio-stall-bob', 'sellio-stall-tilt', 'sellio-stall-pulse']) {
      assert.ok(moving.includes(name), `${name} runs`);
    }
    // The next screen keeps its usual top: the logo and "Check your email", no stall.
    await page.locator('#join-email').fill('mei@kopi.sg');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 0, 'no stall after sending');
    assert.equal(await page.locator('img[src="/branding/sellio-logo.webp"]').count(), 1, 'the logo is back');
    await shoot(page, 'sent-en');
    passed('Moving as designed (sign, steam, tick, +1, sparkles, the two stickers each its own way, FREE!), and the next screen keeps its usual top');
    await page.close();
  }
  assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} sign-up stall browser checks passed`);
