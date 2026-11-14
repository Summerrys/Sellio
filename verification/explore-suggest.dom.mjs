// Explore search that forgives typos (UX states, 6; Alvin approved it, 9 Nov 2026). A search that
// finds nothing says so ("No results for “dumplngs”"), offers the likely spelling from Sellio's
// server (explore_suggest: "Did you mean dumplings?", and a "Search “dumplings”" button), popular
// listings to try, and Show everything. The chosen kind (Home, Food…) goes along.
// Run: node verification/explore-suggest.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://sellio.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = (id) => win.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
win.scrollTo = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

const dumplings = [{ product_id: 'p1', product_name: 'Pork prawn dumplings', price: 12, shop_id: 's1', shop_name: 'Beijing Dumplings', shop_type: 'individual', listed_at: new Date().toISOString(), image_url: null }];
const fresh = [{ product_id: 'p2', product_name: 'Ghana Coffee', price: 18, shop_id: 's2', shop_name: 'Wanderlust', shop_type: 'individual', listed_at: new Date().toISOString(), image_url: null }];
const POPULAR = ['Cute Beary Ears Hair Clip', 'Ghana Coffee', 'Pork prawn dumplings'];
globalThis.calls = [];
globalThis.fakeClient = {
  rpc: async (name, args) => {
    globalThis.calls.push([name, args]);
    if (name === 'explore_shops') return { data: [], error: null };
    if (name === 'explore_suggest') {
      const q = String(args.p_search || '').toLowerCase();
      if (q === 'boom') return { data: null, error: { message: 'offline' } };
      return { data: { suggestion: q === 'dumplngs' ? 'dumplings' : null, popular: [...POPULAR, 'Pizza'] }, error: null };
    }
    if (name === 'explore_feed') {
      const q = String(args.p_search || '').toLowerCase();
      if (!q) return { data: fresh, error: null };
      return { data: q.includes('dumpling') ? dumplings : q === 'ghana coffee' ? fresh : [], error: null };
    }
    return { data: [], error: null };
  },
};
const mocks = {
  supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
  appUser: 'export const useAppUser = () => ({ appUser: null });',
  tabbar: 'export default function ExploreTabBar() { return null; } export const markExploreHome = () => {};',
  chatCount: 'export default function ExploreChatCount() { return null; }',
  bell: 'export default function ShopBell() { return null; }',
  ratings: 'export const useRatingSummaries = () => [{}];',
  ratingParts: 'export const RatingPill = () => null;',
  sell: 'export const useSell = () => ({ openSell() {} });',
};
const mock = { name: 'explore-suggest-mocks', setup(b) {
  const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
    [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell']];
  for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
} };
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-explore-suggest-'));
const outfile = path.join(tmp, 'explore.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as Explore } from '@/pages/Explore';" },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.explore-suggest-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
let root;
try {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] }, React.createElement(mod.Explore)));
  await sleep(300);
  const input = () => container.querySelector('input[type="search"]');
  const type = async (value) => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    setter.call(input(), value);
    input().dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(500); // past the 300 ms wait, and the answers
  };
  const noResults = () => container.querySelector('[data-testid="explore-no-results"]');
  const button = (label) => [...container.querySelectorAll('button')].find((b) => text(b) === label);
  const lastCall = (name) => [...globalThis.calls].reverse().find(([n]) => n === name)?.[1];

  // A typo: the likely spelling, a one-tap search for it, popular listings, Show everything.
  await type('dumplngs');
  assert.ok(noResults(), 'nothing found: the no-results card');
  assert.match(text(noResults()), /^No results for “dumplngs”\s*Did you mean dumplings\?/);
  assert.deepEqual(lastCall('explore_suggest'), { p_search: 'dumplngs', p_kind: null });
  const popular = noResults().querySelector('[data-testid="explore-popular"]');
  assert.match(text(popular), /^Popular on Sellio/);
  assert.deepEqual([...popular.querySelectorAll('button')].map(text), [...POPULAR, 'Pizza']);
  assert.ok(button('Search “dumplings”'), 'Search “dumplings”');
  assert.ok(button('Show everything'));
  passed('a search with a typo: "No results for", "Did you mean dumplings?", a Search “dumplings” button and popular listings');

  globalThis.calls.length = 0;
  button('Search “dumplings”').click();
  await sleep(150);
  assert.equal(input().value, 'dumplings', 'the search box says it');
  assert.deepEqual(lastCall('explore_feed')?.p_search, 'dumplings', 'searched at once');
  assert.equal(noResults(), null);
  assert.match(text(container), /Results for “dumplings”/);
  assert.match(text(container), /Pork prawn dumplings/);
  passed('one tap searches for the spelling, and finds it');

  // No likely spelling: say what to try; a popular listing is one tap away.
  await type('pizza');
  assert.match(text(noResults()), /^No results for “pizza”\s*Check the spelling, or try fewer words\./);
  assert.equal(button('Search “pizza”'), undefined);
  assert.equal(noResults().querySelector('[data-testid="did-you-mean"]'), null);
  assert.deepEqual([...noResults().querySelectorAll('[data-testid="explore-popular"] button')].map(text), POPULAR, 'not the search itself');
  [...noResults().querySelectorAll('[data-testid="explore-popular"] button')].find((b) => text(b) === 'Ghana Coffee').click();
  await sleep(150);
  assert.equal(input().value, 'Ghana Coffee');
  assert.match(text(container), /Results for “Ghana Coffee”/);
  passed('no likely spelling: "Check the spelling, or try fewer words", and a popular listing searches for itself');

  // The underlined word in "Did you mean" searches too.
  await type('dumplngs');
  noResults().querySelector('[data-testid="did-you-mean"] button').click();
  await sleep(150);
  assert.equal(input().value, 'dumplings');
  assert.match(text(container), /Pork prawn dumplings/);
  passed('the underlined word in "Did you mean dumplings?" searches for it');

  // Suggestions can't load (offline): still says what to try.
  await type('boom');
  assert.match(text(noResults()), /^No results for “boom”\s*Check the spelling, or try fewer words\.\s*Show everything$/);
  passed('suggestions unavailable: "Check the spelling, or try fewer words" and Show everything, no chips');

  // The chosen kind goes along to the suggestion.
  const homeChip = [...container.querySelectorAll('[role="tablist"] button')].find((b) => /Home/.test(text(b)));
  assert.ok(homeChip, 'a Home sellers chip');
  homeChip.click();
  await sleep(200);
  await type('dumplngs');
  assert.equal(lastCall('explore_suggest')?.p_kind, 'home', 'the Home kind goes along');
  passed('the chosen kind (Home sellers) goes along to the suggestion');

  // Show everything clears the search and the kind.
  button('Show everything').click();
  await sleep(150);
  assert.equal(input().value, '');
  assert.equal(container.querySelector('#explore-feed-heading')?.textContent, 'Fresh finds', 'back to everything, not Home sellers');
  assert.equal(noResults(), null);
  passed('Show everything goes back to the whole feed (search and the Home sellers chip cleared)');

  console.log(passes + ' explore-suggest checks passed');
} finally {
  root?.unmount();
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
