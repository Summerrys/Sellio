// Indonesia's plan prices on the sign-up plans and the locked-shop wall (Alvin, 12 Nov 2026).
// With no shop yet, a visitor whose phone or computer is in Indonesia (its time zone) gets
// Indonesia's free-trial links and about what the prices come to in rupiah; anyone else the rest's,
// as before. A locked Indonesian shop resubscribes through Indonesia's shop links. Indonesia has no
// setup visit. (The plan window inside a shop: verification/plan-window.dom.mjs.)
// Run: node verification/indonesia-pricing.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: navigation/.test(error?.message)) console.error(error); });
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Auth', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-indonesia-pricing-'));
const local = path.join(process.cwd(), '.indonesia-pricing-bundle.mjs');
const zone = process.env.TZ;
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
// The page's words with a space between elements' texts (textContent runs them together).
const spaced = (el) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: [
      "export { default as AuthPricingModal } from '@/components/auth/AuthPricingModal';",
      "export { default as UpgradeWall } from '@/components/subscription/UpgradeWall';",
      "export { default as TenantContext } from '@/components/tenant/TenantContext';",
      "export { BUSINESS_PLANS, INDONESIA_PLANS } from '@/lib/plans';",
    ].join('\n') },
    outfile: path.join(tmp, 'pricing.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, logLevel: 'silent',
    plugins: [{ name: 'stand-ins', setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => ({}); export const SUPABASE_URL = "";' }));
    } }],
  });
  await copyFile(path.join(tmp, 'pricing.mjs'), local);
  const { AuthPricingModal, UpgradeWall, TenantContext, BUSINESS_PLANS, INDONESIA_PLANS } = await import(pathToFileURL(local));

  const opened = [];
  win.open = (url) => { opened.push(url); return null; };
  const host = document.createElement('div'); document.body.appendChild(host);
  let root = createRoot(host);
  const fresh = async () => { await act(async () => root.unmount()); root = createRoot(host); };
  const trialLinks = () => [...document.querySelectorAll('a[href^="https://buy.stripe.com/"]')].map((a) => a.getAttribute('href'));
  const bodyText = () => spaced(document.body);

  // A visitor in Jakarta (the phone's time zone), signing up.
  process.env.TZ = 'Asia/Jakarta';
  await act(async () => root.render(React.createElement(AuthPricingModal, { onClose: () => {}, prefilledEmail: 'sri@warung.id' })));
  assert.deepEqual(trialLinks(), INDONESIA_PLANS.map((p) => `${p.links.monthly}?locked_prefilled_email=sri%40warung.id`), "Indonesia's free-trial links");
  assert.match(bodyText(), /Starter SGD 18 \/ month about Rp255\.000, charged in Rupiah/);
  assert.match(bodyText(), /Growth Most Popular SGD 35 \/ month about Rp496\.000, charged in Rupiah/);
  assert.match(bodyText(), /Professional SGD 56 \/ month about Rp793\.000, charged in Rupiah/);
  assert.match(bodyText(), /Paid by card, in Rupiah: Stripe converts at the day's rate and adds a 2–4% conversion fee\. Prices are before PPN \(VAT\)\./);
  assert.equal(bodyText().includes('Done-for-you setup'), false, 'no setup visit in Indonesia');
  await click([...document.querySelectorAll('span')].find((el) => text(el) === 'Annual'));
  assert.deepEqual(trialLinks(), INDONESIA_PLANS.map((p) => `${p.links.yearly}?locked_prefilled_email=sri%40warung.id`));
  assert.match(bodyText(), /Starter SGD 180 \/ year about Rp2\.549\.000, charged in Rupiah Save SGD 36/);
  passed("a visitor in Indonesia signs up on Indonesia's prices and free-trial links, with about what they are in rupiah");

  // A visitor in Singapore: as before.
  await fresh();
  process.env.TZ = 'Asia/Singapore';
  await act(async () => root.render(React.createElement(AuthPricingModal, { onClose: () => {} })));
  assert.deepEqual(trialLinks(), BUSINESS_PLANS.map((p) => p.links.monthly));
  assert.match(bodyText(), /Starter SGD 39 \/ month Perfect for small businesses/);
  assert.equal(bodyText().includes('Rupiah'), false);
  assert.match(bodyText(), /Done-for-you setup is SGD 149/);
  passed('a visitor in Singapore: the prices, links and setup visit as before');

  // A locked Indonesian shop resubscribes through Indonesia's shop links.
  await fresh();
  process.env.TZ = 'Asia/Singapore'; // the shop's own country decides, wherever its owner is
  const tenant = { id: 'shop-3', name: 'Warung Bu Sri', seller_type: 'merchant', has_used_trial: true, country: 'Indonesia', currency: 'IDR' };
  const value = { tenantId: 'shop-3', tenant, user: { email: 'sri@warung.id' }, subscription: { status: 'cancelled', tier: 'starter' } };
  await act(async () => root.render(React.createElement(TenantContext.Provider, { value }, React.createElement(UpgradeWall, {}))));
  assert.match(bodyText(), /Starter Your previous plan SGD 18 \/ month about Rp255\.000, charged in Rupiah/);
  assert.match(bodyText(), /Paid by card, in Rupiah/);
  const resubscribe = [...document.querySelectorAll('button')].find((b) => text(b) === 'Resubscribe →');
  await click(resubscribe);
  assert.equal(opened.at(-1), `${INDONESIA_PLANS[0].shopLinks.monthly}?client_reference_id=shop-3&prefilled_email=sri%40warung.id`);
  passed("a locked Indonesian shop resubscribes on Indonesia's prices through its own shop link");

  // A locked Singapore shop whose owner is in Jakarta: its own country's prices.
  await fresh();
  process.env.TZ = 'Asia/Jakarta';
  const kopi = { ...value, tenant: { ...tenant, country: 'Singapore', currency: 'SGD' } };
  await act(async () => root.render(React.createElement(TenantContext.Provider, { value: kopi }, React.createElement(UpgradeWall, {}))));
  assert.match(bodyText(), /Starter Your previous plan SGD 39 \/ month/);
  assert.equal(bodyText().includes('Rupiah'), false);
  await click([...document.querySelectorAll('button')].find((b) => text(b) === 'Resubscribe →'));
  assert.equal(opened.at(-1).split('?')[0], BUSINESS_PLANS[0].shopLinks.monthly);
  passed("a shop's own country decides, not where its owner's phone is");

  await act(async () => root.unmount());
  console.log(passes + ' indonesia-pricing checks passed');
} finally {
  if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
