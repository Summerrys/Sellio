// Explore: suggestions while typing (Alvin, 10 Nov 2026: "Explore suggested spelling check should
// be checking before users enter full word. Eg. Dum > Words that have dum will be suggested or
// nas > nasi lemak"). From the second letter, a list under the search box (explore_complete):
// searches with what's typed in plain and the rest in bold, and shops that open the shop.
// Run: node verification/explore-typeahead.dom.mjs   (jsdom installed in /tmp/sellio-verification)
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
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = (id) => win.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
win.scrollTo = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');

const fresh = [{ product_id: 'p2', product_name: 'Ghana Coffee', price: 18, shop_id: 's2', shop_name: 'Wanderlust', shop_type: 'individual', listed_at: new Date().toISOString(), image_url: null }];
const dumplings = [{ product_id: 'p1', product_name: 'Pork prawn dumplings', price: 12, shop_id: 's1', shop_name: 'Beijing Dumplings', shop_type: 'individual', listed_at: new Date().toISOString(), image_url: null }];
const SUGGESTIONS = {
  du: [{ type: 'search', text: 'dumplings' }, { type: 'search', text: 'duper tissue pouch' }, { type: 'shop', text: 'Beijing Dumplings', slug: 'beijing-dumplings' }],
  dum: [{ type: 'search', text: 'dumplings' }, { type: 'search', text: 'pork prawn dumplings' }, { type: 'shop', text: 'Beijing Dumplings', slug: 'beijing-dumplings' }],
  nas: [{ type: 'search', text: 'nasi lemak' }, { type: 'search', text: 'ayam nasi goreng' }],
};
globalThis.calls = [];
globalThis.slowFor = null; // a search whose suggestions take a while
globalThis.fakeClient = {
  rpc: async (name, args) => {
    globalThis.calls.push([name, args]);
    if (name === 'explore_complete') {
      if (globalThis.slowFor === args.p_search) await new Promise((resolve) => setTimeout(resolve, 600));
      return { data: SUGGESTIONS[args.p_search] || [], error: null };
    }
    if (name === 'explore_feed') {
      const q = String(args.p_search || '').toLowerCase();
      return { data: !q ? fresh : q.includes('dumpling') ? dumplings : [], error: null };
    }
    if (name === 'explore_suggest') return { data: { suggestion: null, popular: [] }, error: null };
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
const mock = { name: 'explore-typeahead-mocks', setup(b) {
  const map = [[/supabaseClient$/, 'supabase'], [/AppUserContext$/, 'appUser'], [/explore\/ExploreTabBar$/, 'tabbar'], [/ExploreChatCount$/, 'chatCount'],
    [/explore\/ShopBell$/, 'bell'], [/lib\/ratings$/, 'ratings'], [/ratings\/RatingParts$/, 'ratingParts'], [/lib\/sell$/, 'sell']];
  for (const [filter, key] of map) b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
} };
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-explore-typeahead-'));
const outfile = path.join(tmp, 'explore.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as Explore } from '@/pages/Explore'; export { typedAt } from '@/components/explore/ExploreSuggestions';" },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.explore-typeahead-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
let root;
let where = '/explore';
function Where() { where = useLocation().pathname; return null; }
try {
  // The words: what's typed in plain, the rest in bold.
  assert.equal(mod.typedAt('nasi lemak', 'nas'), 0);
  assert.equal(mod.typedAt('ayam nasi goreng', 'NAS'), 5);
  assert.equal(mod.typedAt('Beijing Dumplings', 'dum'), 8);
  assert.equal(mod.typedAt('fish oil', 'dum'), -1);
  passed('where what’s typed sits: the start, or a later word’s start');

  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] },
    React.createElement(Where),
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/explore', element: React.createElement(mod.Explore) }),
      React.createElement(Route, { path: '/store/:slug', element: React.createElement('p', null, 'a shop') }))));
  await sleep(300);
  const input = () => container.querySelector('input[type="search"]');
  const list = () => container.querySelector('[data-testid="explore-suggestions"]');
  const options = () => [...(list()?.querySelectorAll('[role="option"]') || [])];
  const focus = () => input().dispatchEvent(new win.FocusEvent('focus', { bubbles: false }));
  const focusIn = async () => { input().focus(); await sleep(20); };
  const type = async (value, wait = 250) => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    setter.call(input(), value);
    input().dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(wait);
  };
  const key = async (k) => { input().dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await sleep(30); };
  const completeCalls = () => globalThis.calls.filter(([n]) => n === 'explore_complete').map(([, a]) => a);
  void focus;

  // One letter: nothing asked, nothing shown.
  await focusIn();
  await type('d');
  assert.equal(list(), null);
  assert.equal(completeCalls().length, 0, 'not from one letter');
  passed('one letter: no suggestions');

  // "dum": the list, typed part plain, the rest bold, the shop marked Shop.
  await type('dum');
  assert.ok(list(), 'the list under the box');
  assert.deepEqual(options().map(text), ['dumplings', 'pork prawn dumplings', 'Beijing Dumplings Shop']);
  assert.deepEqual(completeCalls().at(-1), { p_search: 'dum', p_kind: null });
  const first = options()[0];
  assert.equal(first.querySelector('span.font-normal')?.textContent, 'dum', 'what’s typed, plain');
  assert.equal(first.querySelector('b')?.textContent, 'plings', 'the rest, bold');
  const later = options()[1];
  assert.deepEqual([...later.querySelectorAll('b')].map((b) => b.textContent), ['pork prawn ', 'plings']);
  assert.equal(input().getAttribute('aria-expanded'), 'true');
  assert.equal(input().getAttribute('aria-controls'), list().id);
  passed('"dum": dumplings, pork prawn dumplings and the Beijing Dumplings shop, what’s typed in plain');

  // A tap on a search: it's searched at once, the list closes.
  globalThis.calls.length = 0;
  options()[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  assert.equal(input().value, 'dumplings');
  assert.equal(list(), null, 'the list closes');
  assert.equal(globalThis.calls.filter(([n]) => n === 'explore_feed').at(-1)?.[1]?.p_search, 'dumplings', 'searched at once');
  assert.match(text(container), /Results for “dumplings”/);
  passed('a tap on a suggestion searches it at once and closes the list');

  // Keys: ↓ picks the next, Enter searches it; Escape closes the list.
  await focusIn();
  await type('nas');
  assert.deepEqual(options().map(text), ['nasi lemak', 'ayam nasi goreng']);
  await key('ArrowDown');
  await key('ArrowDown');
  assert.equal(options()[1].getAttribute('aria-selected'), 'true');
  assert.equal(input().getAttribute('aria-activedescendant'), options()[1].id);
  await key('ArrowDown');
  assert.equal(options()[0].getAttribute('aria-selected'), 'true', 'round to the top');
  await key('Enter');
  await sleep(100);
  assert.equal(input().value, 'nasi lemak');
  assert.equal(list(), null);
  await focusIn();
  await type('dum');
  assert.ok(list());
  await key('Escape');
  assert.equal(list(), null, 'Escape closes it');
  await type('dump', 50);
  passed('↓/↑ move through it, Enter searches the one picked, Escape closes it');

  // Enter with nothing picked: what's typed is searched now.
  globalThis.calls.length = 0;
  await type('du');
  assert.ok(list());
  await key('Enter');
  await sleep(100);
  assert.equal(list(), null);
  assert.equal(globalThis.calls.filter(([n]) => n === 'explore_feed').at(-1)?.[1]?.p_search, 'du', 'searched now, no wait');
  passed('Enter with nothing picked searches what’s typed straight away');

  // A shop opens the shop.
  await focusIn();
  await type('dum');
  options().find((o) => /Shop$/.test(text(o))).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  assert.equal(where, '/store/beijing-dumplings', 'the shop opens');
  passed('a shop suggestion opens the shop');

  // While the next answer is on its way, the last list narrows instead of flickering.
  root.render(React.createElement(MemoryRouter, { key: 'again', initialEntries: ['/explore'] },
    React.createElement(Where),
    React.createElement(Routes, null, React.createElement(Route, { path: '/explore', element: React.createElement(mod.Explore) }))));
  await sleep(200);
  await focusIn();
  await type('du');
  assert.equal(options().length, 3);
  globalThis.slowFor = 'dum';
  await type('dum', 200);
  assert.deepEqual(options().map(text), ['dumplings', 'Beijing Dumplings Shop'], 'the earlier list, narrowed to what still fits');
  await sleep(700);
  assert.deepEqual(options().map(text), ['dumplings', 'pork prawn dumplings', 'Beijing Dumplings Shop'], 'then the new answer');
  globalThis.slowFor = null;
  passed('while the next answer is on its way, the list narrows to what still fits');

  // The chosen kind goes along; off the box, no list.
  const homeChip = [...container.querySelectorAll('[role="tablist"] button')].find((b) => /Home/.test(text(b)));
  homeChip.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  await focusIn();
  await type('nas');
  assert.equal(completeCalls().at(-1)?.p_kind, 'home');
  input().blur();
  await sleep(30);
  assert.equal(list(), null, 'the box lost the focus: no list');
  passed('the chosen kind (Home sellers) goes along; the list shows only while the box has the focus');

  console.log(passes + ' explore-typeahead checks passed');
} finally {
  root?.unmount();
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
