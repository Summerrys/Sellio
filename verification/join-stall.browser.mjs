// The free sign-up's stall (components/auth/JoinStall.jsx; Alvin, 17 Nov 2026, "J"), in Chrome as
// a phone, on the real Join page, in English, 中文, Bahasa Indonesia and Malay: the awning on the
// card's top edge; the counter centred; on it three sets in turn, 4 seconds each in step with the
// phone's order (Alvin, 19 Nov 2026: the steaming bowl, now with chopsticks, the cupcake and the jar;
// home bakes; handmade things), each centred, standing on the counter, its things apart and clear
// of the Sellio sign (at either end of its swing) and the phone; the sign going home; "Sell from
// home" and "Run your business" across the counter's lower edge, inside its ends and clear of FREE!
// and the headline; FREE! inside its star and clear of the headline; no emoji; the whole card on a
// regular phone's screen; still for a phone set to reduce motion, on the first set; and the next
// screen (check your email) keeps the awning, not the stall.
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
      signHref: sign.getAttribute('href'), signLabel: sign.getAttribute('aria-label'),
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
  // The counter's sets. Every animation in the stall starts as the page opens, so `seek` puts them
  // all at a moment after that, paused: 1.6 s into a set's 4 s it has popped up and the phone's "+1"
  // shows. Only the set in view is measured: the others wait shrunk, ready to pop.
  const SETS = ['now', 'bakes', 'handmade'];
  const seek = (page, seconds) => page.evaluate((ms) => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });
  }, seconds * 1000);
  const counter = (page) => page.evaluate(() => {
    const stall = document.querySelector('[data-testid="join-stall"]');
    const card = stall.closest('.rounded-2xl').getBoundingClientRect();
    const svg = stall.querySelector('.join-stall-scene > svg').getBoundingClientRect();
    const counterTop = svg.top + 100 * (svg.width / 358);
    // The sign at both ends of its swing.
    const sign = stall.querySelector('.join-stall-sign');
    const swing = document.getAnimations().find((a) => a.effect?.target === sign);
    const was = swing.currentTime;
    const signRight = Math.max(...[0, 3400].map((ms) => { swing.currentTime = ms; return sign.getBoundingClientRect().right; }));
    swing.currentTime = was;
    const phone = stall.querySelector('.join-stall-phone').getBoundingClientRect();
    const bubble = stall.querySelector('.join-stall-bubble');
    return {
      plusOne: Number(getComputedStyle(bubble).opacity),
      sets: [...stall.querySelectorAll('.join-stall-set')].map((set) => {
        const things = [...set.querySelectorAll('.join-stall-pop')];
        const r = things.map((e) => e.getBoundingClientRect());
        const left = Math.min(...r.map((b) => b.left));
        const right = Math.max(...r.map((b) => b.right));
        return {
          name: set.dataset.set, count: things.length, opacity: Number(getComputedStyle(set).opacity),
          centre: Math.round((left + right) / 2 - (card.left + card.right) / 2),
          standing: r.map((b) => Math.round(b.bottom - counterTop)),
          apart: r.slice(1).map((b, i) => Math.round(b.left - r[i].right)),
          signClear: Math.round(left - signRight), phoneClear: Math.round(phone.left - right),
          popped: things.every((e) => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(e).transform)),
          chopsticks: set.querySelectorAll('.join-stall-chopsticks').length,
        };
      }),
    };
  });

  // The Login / Sign Up row (Alvin, 19 Nov 2026): the tabs in the middle of the card, the language
  // at its far right, no pill. Measured on what is drawn: the globe, the code and the arrow.
  const languageRow = (page) => page.evaluate(() => {
    const card = document.querySelector('.rounded-2xl.shadow-xl').getBoundingClientRect();
    const tabs = document.querySelector('.auth-tabs-row > .auth-tabs').getBoundingClientRect();
    const holder = document.querySelector('.auth-tabs-row > .auth-tabs-language');
    const button = holder?.querySelector('[data-testid="app-language-switch"] button[aria-haspopup="menu"]');
    if (!button) return { inRow: false, count: document.querySelectorAll('[data-testid="app-language-switch"]').length };
    const parts = [...button.querySelectorAll('svg, span[lang]')].map((e) => e.getBoundingClientRect());
    const seen = { l: Math.min(...parts.map((b) => b.left)), r: Math.max(...parts.map((b) => b.right)), t: Math.min(...parts.map((b) => b.top)), b: Math.max(...parts.map((b) => b.bottom)) };
    const plain = (e) => { const s = getComputedStyle(e); return s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.boxShadow === 'none' && s.borderTopWidth === '0px'; };
    return {
      inRow: true, count: document.querySelectorAll('[data-testid="app-language-switch"]').length,
      centre: Math.round(((tabs.left + tabs.right) / 2 - (card.left + card.right) / 2) * 10) / 10,
      edge: Math.round(card.right - seen.r), gap: Math.round(seen.l - tabs.right),
      level: Math.round((seen.t + seen.b) / 2 - (tabs.top + tabs.bottom) / 2),
      plain: plain(holder) && plain(button),
      cut: [...document.querySelectorAll('.auth-tabs-row .auth-tabs button')].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > tabs.right + 0.5).map((b) => b.textContent),
      wide: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  const rowAsDesigned = (m, where, { centred = true } = {}) => {
    assert.ok(m.inRow, `${where}: the language at the end of the Login / Sign Up row`);
    assert.equal(m.count, 1, `${where}: one language button`);
    if (centred) assert.ok(Math.abs(m.centre) <= 1, `${where}: Login / Sign Up in the middle of the card (${m.centre}px off)`);
    assert.ok(m.edge >= 10 && m.edge <= 14, `${where}: the language at the card's far right (its arrow ${m.edge}px in)`);
    assert.ok(m.gap >= 6, `${where}: clear of Login / Sign Up (${m.gap}px)`);
    assert.ok(Math.abs(m.level) <= 1, `${where}: level with Login / Sign Up (${m.level}px)`);
    assert.ok(m.plain, `${where}: no pill`);
    assert.deepEqual(m.cut, [], `${where}: Login and Sign Up whole`);
    assert.equal(m.wide, false, `${where}: nothing wider than the screen`);
  };
  // Its list opens in full over the card, on top of what's under it, and folds away again.
  const listOpens = async (page, where) => {
    await page.locator('.auth-tabs-language button[aria-haspopup="menu"]').click();
    await page.locator('[data-testid="app-language-switch"] [role="menu"]').waitFor();
    await page.waitForTimeout(250);
    const list = await page.evaluate(() => {
      const card = document.querySelector('.rounded-2xl.shadow-xl').getBoundingClientRect();
      const menu = document.querySelector('[data-testid="app-language-switch"] [role="menu"]');
      const r = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll('[role="menuitemradio"]')];
      return {
        inside: r.left >= card.left && r.right <= card.right && r.bottom <= card.bottom,
        onTop: items.every((item) => { const b = item.getBoundingClientRect(); return menu.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); }),
        items: items.length,
      };
    });
    assert.deepEqual(list, { inside: true, onTop: true, items: 4 }, `${where}: the list of languages opens in full, on top`);
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="app-language-switch"] [role="menu"]').waitFor({ state: 'detached' });
    await page.evaluate(() => document.activeElement?.blur());
  };

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
      assert.ok(Math.abs(m.counterCentre) <= 1, `${where}: the counter is centred`);
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
      rowAsDesigned(await languageRow(page), `${where}: Sign Up`);
      if (w === 390) await shoot(page, `stall-${language}`);
      if (w === 390 && language === 'en') await listOpens(page, `${where}: Sign Up`);
      for (const [n, seconds] of [1.6, 5.6, 9.6, 13.6].entries()) {
        await seek(page, seconds);
        const { sets, plusOne } = await counter(page);
        const showing = n % 3;
        assert.deepEqual(sets.map((x) => [x.name, x.count]), SETS.map((name) => [name, 3]), `${where}: three sets of three`);
        assert.deepEqual(sets.map((x) => x.opacity), SETS.map((x, i) => (i === showing ? 1 : 0)), `${where} at ${seconds}s: ${SETS[showing]} on the counter`);
        assert.equal(plusOne, 1, `${where} at ${seconds}s: the phone's "+1" shows with it`);
        const x = sets[showing];
        const what = `${where}, ${x.name}`;
        assert.ok(x.popped, `${what}: popped up`);
        assert.ok(Math.abs(x.centre) <= 1, `${what}: centred on the counter (${x.centre})`);
        assert.ok(x.standing.every((d) => Math.abs(d) <= 1), `${what}: standing on the counter (${x.standing})`);
        assert.ok(x.apart.every((d) => d >= 1), `${what}: its things apart (${x.apart})`);
        assert.ok(x.signClear >= 6, `${what}: clear of the sign at either end of its swing (${x.signClear}px)`);
        assert.ok(x.phoneClear >= 20, `${what}: clear of the phone (${x.phoneClear}px)`);
        assert.equal(x.chopsticks, x.name === 'now' ? 1 : 0, `${what}: the bowl has its chopsticks`);
        if (w === 390 && language === 'en' && n < 3) await shoot(page, `stall-en-${x.name}`);
      }
      await page.close();
    }
    passed(`${language}: Login / Sign Up in the middle with the language at the far right (no pill), the awning on top, the counter centred, its three sets in turn with the phone's "+1" (each centred, standing on it, clear of the sign and the phone; the bowl's chopsticks), the sign going home, the stickers on the counter, "${free}" in its star and clear of the headline, no emoji`);
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
      sets: [...document.querySelectorAll('.join-stall-set')].map((s) => getComputedStyle(s).opacity),
    }));
    assert.equal(still.running, 0, 'nothing moves');
    assert.equal(still.tick, '0px', 'the tick is drawn');
    assert.equal(still.steam, '0.7', 'the steam shows');
    assert.deepEqual(still.sets, ['1', '0', '0'], 'the counter stays on its first set');
    await shoot(page, 'stall-en-small-still');
    passed('A phone set to reduce motion: the stall is still, on its first set, with its tick and steam showing');
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
    for (const name of ['sellio-stall-swing', 'sellio-stall-steam', 'sellio-stall-tick', 'sellio-stall-bubble', 'sellio-stall-twinkle', 'sellio-stall-bob', 'sellio-stall-tilt', 'sellio-stall-pulse', 'sellio-stall-set', 'sellio-stall-pop', 'sellio-stall-flame']) {
      assert.ok(moving.includes(name), `${name} runs`);
    }
    // The counter: 12 s round, a set every 4 s, the same 4 s as the phone's tick and "+1".
    const timing = await page.evaluate(() => {
      const of = (name) => document.getAnimations().filter((a) => a.animationName === name)
        .map((a) => { const t = a.effect.getTiming(); return [a.effect.target.dataset.set || a.effect.target.getAttribute('class'), t.duration, t.delay, t.iterations]; })
        .sort((a, b) => a[2] - b[2]);
      return { sets: of('sellio-stall-set'), tick: of('sellio-stall-tick'), plusOne: of('sellio-stall-bubble') };
    });
    assert.deepEqual(timing.sets, [['now', 12000, 0, Infinity], ['bakes', 12000, 4000, Infinity], ['handmade', 12000, 8000, Infinity]], 'a set every 4 s');
    assert.deepEqual(timing.tick, [['join-stall-tick', 4000, 0, Infinity]], 'the phone ticks every 4 s from the start');
    assert.deepEqual(timing.plusOne, [['join-stall-bubble', 4000, 0, Infinity]], 'its "+1" too');
    // When a set comes round again its things pop up in turn: none shows full-size before its pop.
    for (const [n, seconds] of [12.1, 16.1, 20.1].entries()) {
      await seek(page, seconds);
      const set = await page.evaluate((i) => {
        const s = document.querySelectorAll('.join-stall-set')[i];
        const scale = (e) => { const t = getComputedStyle(e).transform; return t === 'none' ? 1 : Number(new DOMMatrix(t).a.toFixed(2)); };
        return { opacity: Number(getComputedStyle(s).opacity), scales: [...s.querySelectorAll('.join-stall-pop')].map(scale) };
      }, n);
      assert.ok(set.opacity > 0.3, `${SETS[n]} coming in at ${seconds}s (${set.opacity})`);
      assert.ok(set.scales[0] > set.scales[1] && set.scales[1] >= set.scales[2] && set.scales[2] < 0.5, `${SETS[n]} at ${seconds}s: its things pop up in turn (${set.scales})`);
    }
    // The next screen has the awning and step 1 of 3, not the stall (signup-screens.browser.mjs).
    await page.locator('#join-email').fill('mei@kopi.sg');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 0, 'no stall after sending');
    assert.equal(await page.locator('.join-stall-awning').count(), 1, 'the awning stays');
    await shoot(page, 'sent-en');
    passed('Moving as designed (sign, steam, tick, +1, sparkles, the two stickers each its own way, FREE!, the counter\'s sets every 4 s with the phone\'s order, the candle\'s flame); the next screen keeps the awning, without the stall');
    await page.close();
  }
  assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} sign-up stall browser checks passed`);
