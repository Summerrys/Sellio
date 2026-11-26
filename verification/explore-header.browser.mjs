// Explore's top row on narrow phones (real Chromium, the app's built styles): "My shop" (and "My
// account", "Log in", "Sign up") stays on one line at every width from 320 to 412 px, with the
// phone's text at 100%, 115% and 130% — Android's font size setting, tried two ways: the text alone
// made larger, and everything sized in rem made larger with it. On the Oppo Find N5's cover screen
// "My shop" wrapped onto two lines (Alvin, 26 Nov 2026). The row stays inside the phone wherever it
// can fit at all, and the grey "Explore" word shows when the row has room for it and steps aside
// when it hasn't.
// Run: npm run build (for the styles), then
//      node verification/explore-header.browser.mjs /tmp/sellio-verification
// EXPLORE_FILE=<path> runs it on another copy of src/pages/Explore.jsx (the version before the fix
// must fail it).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const taskRoot = process.argv[2] || '/tmp/sellio-verification';
const require = createRequire(path.join(taskRoot, 'package.json'));
const { chromium } = require('playwright');
const app = process.cwd();
const exploreFile = process.env.EXPLORE_FILE ? path.resolve(process.env.EXPLORE_FILE) : path.join(app, 'src/pages/Explore.jsx');

const assets = path.join(app, 'dist', 'assets');
const cssName = (await readdir(assets).catch(() => [])).find((file) => /^index-.*\.css$/.test(file));
if (!cssName) throw new Error('No built styles: run npm run build first (dist/assets/index-*.css).');
const css = await readFile(path.join(assets, cssName), 'utf8');

// The bell (and, for a business, its chats button) as ShopBell draws them: 44 px tap areas.
const mocks = {
  supabase: `export const getSupabase = async () => ({ rpc: async () => ({ data: [], error: null }), from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) });`,
  appUser: `export const useAppUser = () => ({ appUser: window.__who === 'guest' ? null : { id: 'u1', tenant_id: window.__who === 'buyer' ? null : 't1' } });`,
  tabbar: `export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};`,
  chatCount: `export default function ExploreChatCount() { return null; }`,
  bell: `import React from 'react';
    const box = (label) => React.createElement('button', { key: label, type: 'button', 'aria-label': label, className: 'relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-slate-700' },
      React.createElement('span', { className: 'block w-5 h-5 rounded bg-slate-700' }));
    export default function ShopBell() {
      if (window.__who === 'guest') return null;
      return window.__who === 'business' ? [box('Chats'), box('Notifications')] : box('Notifications');
    }`,
  ratings: `export const useRatingSummaries = () => [{}];`,
  ratingParts: `export const RatingPill = () => null;`,
  sell: `export const useSell = () => ({ openSell() {} });`,
  likes: `export const likeErrorMessage = () => ''; export const likesText = () => ''; export const needsSignIn = () => false;
    export const setListingLike = async () => {}; export const toggleKnownLike = async () => {}; export const useKnownLike = () => null; export const useLikesFor = () => {};`,
};
const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
  [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell'], [/lib\/likes$/, 'likes']];
const out = await build({
  stdin: {
    resolveDir: app, loader: 'jsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import Explore from ${JSON.stringify(exploreFile)};
      const root = createRoot(document.getElementById('root'));
      window.__show = (who) => {
        window.__who = who;
        root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'], key: who }, React.createElement(Explore)));
      };
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(app, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'silent',
  plugins: [{ name: 'explore-header-mocks', setup(b) {
    for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'jsx', contents: mocks[args.path], resolveDir: app }));
  } }],
});
const script = out.outputFiles[0].text;

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' }); }

// Larger text, two ways: 'text' makes the header's words larger and nothing else; 'rem' makes
// the page's root size larger, so everything sized in rem (paddings, the logo, the buttons) grows too.
const scaleCss = (mode, scale) => (mode === 'text'
  ? `header .text-sm { font-size: calc(0.875rem * ${scale}) !important; }`
  : `html { font-size: calc(16px * ${scale}) !important; }`);

const measure = () => {
  const lines = (el) => {
    const tops = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    return tops.size;
  };
  const actions = document.querySelector('[data-testid="explore-top-actions"]') || document.querySelector('header .ml-auto');
  const row = actions.parentElement;
  const word = [...row.children].find((el) => el.textContent.includes('Explore'));
  const label = word.querySelector('span') || word;
  const w = word.getBoundingClientRect();
  const l = label.getBoundingClientRect();
  return {
    buttons: [...actions.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), lines: lines(a) })),
    rowOverflow: Math.max(0, Math.round(row.scrollWidth - row.clientWidth)),
    rightEdge: Math.round(actions.getBoundingClientRect().right),
    width: window.innerWidth,
    wordShown: l.width > 0 && l.top >= w.top - 0.5 && l.bottom <= w.bottom + 0.5 && l.right <= w.right + 0.5,
  };
};

const results = [];
try {
  for (const width of [320, 340, 360, 380, 412]) {
    const context = await browser.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style id="scale"></style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    for (const who of ['business', 'buyer', 'guest']) {
      await page.evaluate((w) => window.__show(w), who);
      await page.waitForSelector('header a');
      for (const mode of ['text', 'rem']) {
        for (const scale of [1, 1.15, 1.3]) {
          await page.evaluate((text) => { document.getElementById('scale').textContent = text; }, scaleCss(mode, scale));
          await page.waitForTimeout(30);
          results.push({ who, width, mode, scale, ...(await page.evaluate(measure)) });
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (process.env.VERBOSE) {
  console.table(results.map((r) => ({ who: r.who, width: r.width, mode: r.mode, scale: r.scale,
    lines: r.buttons.map((b) => `${b.text}:${b.lines}`).join(' '), rowOverflow: r.rowOverflow, rightEdge: r.rightEdge, wordShown: r.wordShown })));
}

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`); };

check('"My shop", "My account", "Log in" and "Sign up" stay on one line at 320–412 px and 100–130% text', () => {
  const wrapped = results.filter((r) => r.buttons.some((b) => b.lines !== 1));
  assert.deepEqual(wrapped.map((r) => `${r.who} ${r.width}px ${r.mode} ${r.scale}: ${r.buttons.map((b) => `${b.text}=${b.lines}`).join(', ')}`), []);
});

// Where the row can fit at all, it does: the larger-text cases a phone of that width can hold.
const fits = (r) => r.mode === 'text' || r.scale === 1 || r.width >= 360 || (r.width >= 340 && r.scale <= 1.15);
check('The row stays inside the phone (no sideways overflow, the bell on screen) wherever it can fit', () => {
  const over = results.filter((r) => fits(r) && (r.rowOverflow > 0 || r.rightEdge > r.width));
  assert.deepEqual(over.map((r) => `${r.who} ${r.width}px ${r.mode} ${r.scale}: overflow ${r.rowOverflow}, right edge ${r.rightEdge}`), []);
});

check('The grey "Explore" shows when there is room (412 px, normal text) and steps aside when there is not', () => {
  for (const who of ['business', 'buyer', 'guest']) {
    const roomy = results.find((r) => r.who === who && r.width === 412 && r.mode === 'text' && r.scale === 1);
    assert.equal(roomy.wordShown, true, `${who} at 412 px should show "Explore"`);
  }
  const tight = results.find((r) => r.who === 'business' && r.width === 320 && r.mode === 'text' && r.scale === 1.3);
  assert.equal(tight.wordShown, false, 'a business at 320 px with 130% text has no room for "Explore"');
});

console.log(`\n${passed} checks passed (${results.length} layouts measured)`);
