// The account panel (AccountProfileModal) for an account without a shop (Alvin, 5 Nov 2026):
// after Cafetelier was removed, his panel read "Starter Plan · Unknown". Without a shop it now
// says so and offers to open one; with a shop it shows the shop's plan, and guesses none while
// the plan is loading.
// Run: node verification/account-panel.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore/me', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-account-panel-'));
const local = path.join(process.cwd(), '.account-panel-modal.mjs');
const mocks = {
  tenant: 'export const useTenant = () => globalThis.tenantState;',
  subscription: 'export const useSubscription = () => globalThis.subscriptionState;',
  clients: [
    'const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: null }) };',
    'export const getSupabase = async () => ({ from: () => query, auth: { getUser: async () => ({ data: {} }) } });',
    "export const SUPABASE_URL = 'https://project.example.invalid';",
  ].join('\n'),
  profile: 'export const cookieUtils = { clear() {} }; export const useAppUser = () => ({});',
  toast: 'export const toast = { error() {}, success() {} };',
  push: "export const pushStatus = async () => 'unavailable'; export const askAndroid = async () => false;",
};
const plugin = { name: 'account-panel-fixtures', setup(builder) {
  for (const [filter, key] of [[/TenantContext$/, 'tenant'], [/useSubscription$/, 'subscription'], [/supabaseClient$/, 'clients'],
    [/AppUserContext$/, 'profile'], [/^sonner$/, 'toast'], [/pushNotifications$/, 'push']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: mocks[args.path] }));
} };

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };

try {
  await build({ entryPoints: ['src/components/profile/AccountProfileModal.jsx'], outfile: path.join(tmp, 'modal.mjs'), bundle: true,
    packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent' });
  await copyFile(path.join(tmp, 'modal.mjs'), local);
  const { default: AccountProfileModal } = await import(pathToFileURL(local));

  const user = { id: 'u-1', email: 'alvin@example.com', full_name: 'Alvin' };
  let lastPanel = null; // what the last panel showed: { text, payLink, buttons }
  async function panel() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(MemoryRouter, null,
        React.createElement(AccountProfileModal, { open: true, onClose() {}, user, subscription: null })));
    });
    const text = document.body.textContent;
    const pay = document.body.querySelector('a[href^="https://invoice.stripe.com/"]');
    lastPanel = { text, payLink: pay ? { target: pay.getAttribute('target') } : null,
      buttons: [...document.body.querySelectorAll('button')].map((b) => b.textContent.trim()) };
    await act(async () => root.unmount());
    host.remove();
    return text;
  }

  // No shop: memberships read, none active (the shop was removed, or this login's access ended).
  globalThis.tenantState = { tenantId: 'shop-gone', isOwner: false, tenant: null, noStore: true, isLoading: false };
  globalThis.subscriptionState = { subscription: null, tier: 'starter' };
  let text = await panel();
  assert.match(text, /No shop on this account/);
  assert.match(text, /Open a shop/);
  assert.doesNotMatch(text, /Starter Plan|Unknown|Subscription/);
  globalThis.tenantState = { tenantId: null, isOwner: false, tenant: null, noStore: false, isLoading: false };
  text = await panel();
  assert.match(text, /No shop on this account/);
  assert.doesNotMatch(text, /Starter Plan|Unknown/);
  passed('No shop: "No shop on this account" and Open a shop, never "Starter Plan · Unknown"');

  // A shop whose plan is still loading: no plan name is guessed.
  globalThis.tenantState = { tenantId: 'shop-1', isOwner: true, tenant: { id: 'shop-1', name: 'Kopi', seller_type: 'merchant' }, noStore: false, isLoading: false };
  globalThis.subscriptionState = { subscription: undefined, tier: 'starter' };
  text = await panel();
  assert.match(text, /Loading plan…/);
  assert.doesNotMatch(text, /Starter Plan|Unknown|No shop/);

  // A shop on Pro: its plan and status, as before.
  globalThis.subscriptionState = { subscription: { tier: 'pro', status: 'active', billing_cycle: 'monthly' }, tier: 'pro' };
  text = await panel();
  assert.match(text, /Professional Plan · Active/);
  assert.match(text, /Subscription/);
  assert.doesNotMatch(text, /No shop|Unknown/);

  // A personal shop (free, no subscription row).
  globalThis.tenantState = { ...globalThis.tenantState, tenant: { id: 'shop-1', name: 'Kopi', seller_type: 'individual' } };
  globalThis.subscriptionState = { subscription: null, tier: 'starter' };
  text = await panel();
  assert.match(text, /Personal Seller \(free\) · Free/);
  passed('A shop: its plan (Professional Plan · Active, Personal Seller (free)), and none guessed while loading');

  // The owner's plan buttons in Sellio's Android app (Alvin, 9 Nov 2026): as on the website, with
  // Stripe's invoice page handed to the phone (no new window); the iPhone app sells no plans.
  globalThis.tenantState = { tenantId: 'shop-1', isOwner: true, tenant: { id: 'shop-1', name: 'Kopi', seller_type: 'merchant' }, noStore: false, isLoading: false };
  win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  globalThis.subscriptionState = { subscription: { tier: 'starter', status: 'active', billing_cycle: 'monthly', stripe_customer_id: 'cus_fixture' }, tier: 'starter' };
  await panel();
  assert.ok(lastPanel.buttons.includes('Upgrade Plan'), 'Upgrade Plan in the Android app');
  assert.ok(lastPanel.buttons.includes('Manage Billing'));
  assert.doesNotMatch(lastPanel.text, /Plans are managed on the Sellio website/);
  globalThis.subscriptionState = { subscription: { tier: 'starter', status: 'past_due', billing_cycle: 'monthly', stripe_customer_id: 'cus_fixture',
    invoice_hosted_url: 'https://invoice.stripe.com/i/fixture', invoice_amount_due_minor: 3900, invoice_currency: 'SGD' }, tier: 'starter' };
  await panel();
  assert.ok(lastPanel.payLink, 'Pay outstanding invoice in the Android app');
  assert.equal(lastPanel.payLink.target, null, 'handed to the phone, not a new window');
  win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  await panel();
  assert.equal(lastPanel.payLink, null);
  assert.equal(lastPanel.buttons.includes('Manage Billing'), false);
  assert.match(lastPanel.text, /Plans are managed on the Sellio website/);
  delete win.Capacitor;
  await panel();
  assert.equal(lastPanel.payLink?.target, '_blank', 'a browser: a new tab');
  passed("The owner's plan buttons: in the Android app as on the website (Stripe opens in the phone's browser); none in the iPhone app");

  console.log(passes + ' account-panel checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
