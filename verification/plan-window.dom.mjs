// The short plan window (Alvin, 10 Nov 2026: "Redesign the modal with less words. Keep it short and
// sweet"): one list of plans, one button; Yearly shows the year's prices; Compare plans opens the
// full list; ✕ and Escape close it.
// Run: node verification/plan-window.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Dashboard', pretendToBeVisual: true });
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

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-plan-window-'));
const local = path.join(process.cwd(), '.plan-window-bundle.mjs');
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as PricingModal } from '@/components/subscription/PricingModal'; export { default as TenantContext } from '@/components/tenant/TenantContext';" },
    outfile: path.join(tmp, 'plans.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, logLevel: 'silent',
    plugins: [{ name: 'stand-ins', setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => ({}); export const SUPABASE_URL = "";' }));
    } }],
  });
  await copyFile(path.join(tmp, 'plans.mjs'), local);
  const { PricingModal, TenantContext } = await import(pathToFileURL(local));

  const opened = [];
  win.open = (url) => { opened.push(url); return null; };
  let closes = 0;
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const show = async (tenant, currentTier = null, open = true) => {
    await act(async () => root.render(React.createElement(TenantContext.Provider, { value: { tenant } },
      React.createElement(PricingModal, { open, onOpenChange: (next) => { if (!next) closes++; }, tenantId: tenant.id, currentTier }))));
  };
  const cta = () => document.querySelector('[data-testid="plan-checkout"]');
  const fine = () => text(document.querySelector('[data-testid="plan-fine-print"]'));
  const radio = (key) => document.querySelector(`[role="radio"][data-plan="${key}"]`);
  const billing = (label) => [...document.querySelectorAll('[aria-label="Billing"] [role="radio"]')].find((b) => text(b).startsWith(label));

  const mei = { id: 'shop-1', name: 'Mei’s Bakes', seller_type: 'individual', has_used_trial: false, owner_email: 'mei@bakes.sg' };
  await show(mei);
  assert.ok(document.querySelector('[role="dialog"][aria-modal="true"]'), 'a panel over the page');
  assert.equal(radio('growth').getAttribute('aria-checked'), 'true', 'Growth picked first');
  assert.equal(billing('Monthly').getAttribute('aria-checked'), 'true');
  // Yearly: the year's prices, and what it costs after the free week.
  await click(billing('Yearly'));
  assert.equal(billing('Yearly').getAttribute('aria-checked'), 'true');
  assert.match(text(radio('starter')), /S\$390\/yr$/);
  assert.match(text(radio('growth')), /S\$790\/yr$/);
  assert.match(text(radio('pro')), /S\$1,190\/yr$/);
  assert.equal(fine(), 'Then S$790 a year. If you stop paying, it goes back to a free home shop.');
  await click(radio('pro'));
  assert.equal(fine(), 'Then S$1,190 a year. If you stop paying, it goes back to a free home shop.');
  await click(cta());
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/buy\.stripe\.com\/28EeVf0M9e7935Vc3C7bW0I\?/, "Pro yearly, the shop's free-trial checkout");
  passed('Yearly: the year’s prices and the cost after the free week; the picked plan and billing go to Stripe');

  // Compare plans: the full list, then hidden again.
  assert.equal(document.querySelector('[data-testid="plan-compare"]'), null);
  const compare = [...document.querySelectorAll('button')].find((b) => text(b) === 'Compare plans');
  await click(compare);
  const full = document.querySelector('[data-testid="plan-compare"]');
  assert.ok(full);
  assert.match(text(full), /^Starter\s*10 products\s*Up to 100 orders\/month\s*3 staff accounts/);
  assert.match(text(full), /Professional\s*Everything in Growth\s*Unlimited products and orders/);
  await click([...document.querySelectorAll('button')].find((b) => text(b) === 'Hide the full list'));
  assert.equal(document.querySelector('[data-testid="plan-compare"]'), null);
  passed('Compare plans opens the full list of what each plan has, and hides it again');

  // ✕ and Escape close it.
  await click(document.querySelector('[data-testid="plan-window"] button[aria-label="Close"]'));
  assert.equal(closes, 1, '✕ closes');
  await act(async () => { win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(closes, 2, 'Escape closes');
  // Opened again: Growth and the full list closed, as at first.
  await show(mei, null, false);
  assert.equal(document.querySelector('[data-testid="plan-window"]'), null, 'closed: nothing on the page');
  await show(mei, null, true);
  assert.equal(radio('growth').getAttribute('aria-checked'), 'true');
  passed('✕ and Escape close it; opened again, it starts as at first');

  // A business on Growth: its plan marked Current, Professional picked first; moving down says so.
  await show({ id: 'shop-2', name: 'Kopi Corner', seller_type: 'merchant', has_used_trial: true }, 'growth');
  assert.match(text(document.querySelector('[data-testid="plan-window"]')), /Choose your plan\s*You're on Growth\./);
  assert.match(text(radio('growth')), /^Growth\s*Current/);
  assert.equal(text(radio('growth')).includes('Popular'), false);
  assert.match(text(radio('starter')), /10 products · 100 orders a month/, 'a business: products');
  assert.equal(radio('pro').getAttribute('aria-checked'), 'true');
  assert.equal(text(cta()), 'Upgrade to Professional');
  await click(radio('starter'));
  assert.equal(text(cta()), 'Move to Starter');
  await click(radio('growth'));
  assert.equal(text(cta()), 'Your current plan');
  assert.equal(cta().disabled, true);
  assert.match(text(document.body), /Multi-outlet\?/, 'a business keeps the multi-outlet line');
  passed('a business: Current on its plan, the next one up picked first, Move to … for a smaller plan');

  // An Indonesian shop (Alvin, 12 Nov 2026): Indonesia's prices and links, about what they come to
  // in rupiah, how they're paid, and no setup visit.
  assert.match(text(document.body), /Done-for-you setup is SGD 149/, 'a Singapore business: the setup visit');
  opened.length = 0;
  const warung = { id: 'shop-3', name: 'Warung Bu Sri', seller_type: 'merchant', has_used_trial: true, country: 'Indonesia', currency: 'IDR', owner_email: 'sri@warung.id' };
  await show(warung);
  await click(billing('Monthly'));
  assert.match(text(radio('starter')), /S\$18\/mo≈ Rp255\.000$/);
  assert.match(text(radio('growth')), /S\$35\/mo≈ Rp496\.000$/);
  assert.match(text(radio('pro')), /S\$56\/mo≈ Rp793\.000$/);
  assert.equal(radio('growth').getAttribute('aria-checked'), 'true');
  assert.equal(fine(), 'S$35 a month, about Rp496.000, charged in Rupiah.');
  assert.match(text(document.querySelector('[data-testid="plan-payment-note"]')), /^Paid by card, in Rupiah: Stripe converts at the day's rate/);
  assert.equal(text(document.body).includes('Done-for-you setup'), false, 'no setup visit in Indonesia');
  assert.match(text(document.body), /Multi-outlet\?/);
  await click(cta());
  assert.equal(opened.at(-1), 'https://buy.stripe.com/dRmcN7gL75AD35Vd7G7bW0X?client_reference_id=shop-3&prefilled_email=sri%40warung.id', "Growth monthly: Indonesia's shop link");
  await click(billing('Yearly'));
  assert.match(text(radio('growth')), /S\$350\/yr≈ Rp4\.957\.000$/);
  assert.equal(fine(), 'S$350 a year, about Rp4.957.000, charged in Rupiah.');
  await click(cta());
  assert.match(opened.at(-1), /^https:\/\/buy\.stripe\.com\/aFa14p7ax6EH9uj0kU7bW0Y\?client_reference_id=shop-3&/, 'Growth yearly');
  // An Indonesian home shop: its free week on Indonesia's trial link; no business footnotes.
  const ibu = { id: 'shop-4', name: 'Kue Ibu', seller_type: 'individual', has_used_trial: false, country: 'Indonesia', currency: 'IDR', owner_email: 'ibu@kue.id' };
  await show(ibu);
  await click(billing('Monthly'));
  assert.equal(fine(), 'Then S$35 a month, about Rp496.000, charged in Rupiah. If you stop paying, it goes back to a free home shop.');
  assert.ok(document.querySelector('[data-testid="plan-payment-note"]'));
  assert.equal(text(document.body).includes('Multi-outlet'), false);
  await click(cta());
  assert.equal(opened.at(-1), 'https://buy.stripe.com/8x2bJ3eCZ0gj49Z2t27bW13?client_reference_id=shop-4&prefilled_email=ibu%40kue.id', "Growth monthly: Indonesia's free-week link");
  passed("an Indonesian shop: Indonesia's prices and links with about what they are in rupiah; no setup visit");

  await act(async () => root.unmount());
  console.log(passes + ' plan-window checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
