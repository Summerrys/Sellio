// Plans in Sellio's apps (Alvin, 9 Nov 2026: "revert back to that upgrade wall"; from 5 Nov 2026
// the apps sold none). The Android app sells Sellio's plans as the website does: the plan cards,
// the upgrade wall, Pay invoice and Billing. Stripe's pages open in the phone's browser (the app
// hands the address to the phone), and Stripe's billing page returns to sellio.sg, not the app's
// own address. The iPhone app sells none: it shows the plan and "Plans are managed on the Sellio
// website" where the website would offer one (Apple rejects a way to pay outside the App Store).
// The plan wording otherwise matches the website. A plan bought in the browser shows when the
// app comes back to the front. The app is detected the way the real one is
// (window.Capacitor.isNativePlatform() and getPlatform()).
// Run from the app root after installing jsdom into a temporary directory:
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/plans-in-app.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
// In the app a checkout goes to Stripe's address in place (openOutside), which jsdom can't do.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: navigation/.test(error?.message)) console.error(error); });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/Dashboard', pretendToBeVisual: true, virtualConsole });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'DocumentFragment', 'CustomEvent', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'NodeFilter']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const temporary = await mkdtemp(path.join(app, '.plans-in-app-verification-'));
const standIns = {
  name: 'stand-ins',
  setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const getSupabase = async () => ({});', loader: 'js' }));
  },
};
async function load(relative) {
  const outfile = path.join(temporary, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  await build({ entryPoints: [path.join(app, relative)], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', alias: { '@': path.join(app, 'src') }, plugins: [standIns], logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
// inApp('android') or inApp('ios'): Sellio's app on that phone; inApp(false): a browser.
const inApp = (platform) => {
  if (platform) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
  else delete window.Capacitor;
};
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const roots = [];
async function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(React.createElement(MemoryRouter, null, element)); });
  return container;
}
const WEBSITE = 'Plans are managed on the Sellio website';

try {
  const native = await load('src/lib/nativeApp.js');
  assert.equal(native.PLANS_ON_WEBSITE, WEBSITE);
  inApp('android'); assert.equal(native.sellsPlans(), true);
  inApp('ios'); assert.equal(native.sellsPlans(), false);
  inApp(false); assert.equal(native.sellsPlans(), true);
  passed('the Android app and the website sell the plans; the iPhone app sells none');

  // Stripe's pages: a browser opens a new tab; the app goes to the address in place, which the
  // app hands to the phone (the browser opens it). A stand-in window shows where it went.
  {
    const jsdomWindow = globalThis.window;
    const tabs = [];
    const phone = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, location: { href: 'https://localhost/Dashboard' }, open: (...a) => { tabs.push(a); } };
    globalThis.window = phone;
    try {
      native.openOutside('https://buy.stripe.com/fixture?client_reference_id=shop-1');
    } finally {
      globalThis.window = jsdomWindow;
    }
    assert.equal(phone.location.href, 'https://buy.stripe.com/fixture?client_reference_id=shop-1');
    assert.equal(tabs.length, 0, 'No new window in the app');
    inApp(false);
    const opened = [];
    const realOpen = window.open;
    window.open = (...a) => { opened.push(a); return null; };
    native.openOutside('https://buy.stripe.com/fixture');
    window.open = realOpen;
    assert.deepEqual(opened, [['https://buy.stripe.com/fixture', '_blank']]);
  }
  const billing = await load('src/lib/billing.js');
  const where = { href: 'https://localhost/Settings?tab=billing', pathname: '/Settings', search: '?tab=billing' };
  inApp('android');
  assert.equal(billing.billingReturnUrl(where), 'https://sellio.sg/Settings?tab=billing', "The app's billing page returns to sellio.sg");
  inApp(false);
  const site = { href: 'https://sellio.sg/Settings?tab=billing', pathname: '/Settings', search: '?tab=billing' };
  assert.equal(billing.billingReturnUrl(site), site.href);
  passed("Stripe's pages open in the phone's browser from the app, and its billing page returns to sellio.sg");

  const { default: PlansOnWebsite } = await load('src/components/subscription/PlansOnWebsite.jsx');
  inApp('ios');
  let view = await render(React.createElement(PlansOnWebsite, { tier: 'growth', note: 'Your data is safe and comes back as soon as your plan is active again.' }));
  assert.match(view.textContent, /Your plan: Growth/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No links or buttons to buy');
  passed('the iPhone app: the plan and where plans are managed, no way to buy');

  const { default: PlanFeatureNotice } = await load('src/components/subscription/PlanFeatureNotice.jsx');
  for (const platform of ['android', 'ios', false]) {
    inApp(platform);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: false }));
    assert.match(view.textContent, /Email sellio@apptelier\.sg to change your plan/);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: true }));
    assert.match(view.textContent, /It comes with a business plan\. Plans are managed on the Sellio website\./, 'no way to buy here: where plans are managed');
    assert.equal(view.textContent.includes('coming soon'), false);
  }
  // A free home shop's owner where plans are sold (Alvin, 9 Nov 2026): the business plans from here.
  let seen = 0;
  view = await render(React.createElement(PlanFeatureNotice, { feature: 'can_use_pos', personal: true, freeTrial: true, onSeePlans: () => { seen++; } }));
  assert.match(view.textContent, /The Counter isn’t included in your plan\. It comes with a business plan, free for 7 days\. Your shop keeps its link, listings and orders\./);
  const tryFree = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Try a business plan free');
  assert.ok(tryFree, 'Try a business plan free');
  await act(async () => { tryFree.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(seen, 1, 'it opens the plans');
  view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: true, freeTrial: false, onSeePlans: () => {} }));
  assert.match(view.textContent, /It comes with a business plan\. Your shop keeps/);
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent === 'See business plans'), 'trial used: See business plans');
  const layoutForNotice = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  assert.match(layoutForNotice, /onSeePlans=\{isOwner && sellsPlans\(\) \? \(\) => setShowPricingModal\(true\) : null\}/, "the owner, where plans are sold: the shop's plan window");
  assert.match(layoutForNotice, /freeTrial=\{!tenant\?\.has_used_trial\}/);
  passed('a page outside the plan: a free home shop\'s owner can move to a business plan from it (free for 7 days the first time); elsewhere it says how');

  const { default: BillingStatusBanner } = await load('src/components/subscription/BillingStatusBanner.jsx');
  const pastDue = { status: 'past_due', invoice_amount_due_minor: 3900, invoice_currency: 'SGD', invoice_hosted_url: 'https://invoice.stripe.com/i/fixture', next_payment_attempt: null, grace_period_ends_at: null };
  inApp('ios');
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  assert.match(view.textContent, /Payment needs attention/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No Pay invoice or Billing in the iPhone app');
  inApp('android');
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  let payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
  assert.ok(payLink, 'The Android app has Pay invoice');
  assert.equal(payLink.getAttribute('target'), null, 'opened in place: the app hands it to the phone');
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
  assert.equal(view.textContent.includes(WEBSITE), false);
  inApp(false);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
  assert.ok(payLink, 'The website keeps Pay invoice');
  assert.equal(payLink.getAttribute('target'), '_blank');
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
  passed('a payment problem: Pay invoice and Billing on the website and in the Android app; the iPhone app points to the website');

  const { default: BillingRecoveryWall } = await load('src/components/subscription/BillingRecoveryWall.jsx');
  inApp('android');
  view = await render(React.createElement(BillingRecoveryWall, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
  assert.ok(payLink, 'The locked shop can pay its invoice from the Android app');
  assert.equal(payLink.getAttribute('target'), null);
  assert.ok([...view.querySelectorAll('button')].some((b) => /Update payment method/.test(b.textContent)));
  passed('a shop locked for an unpaid invoice can pay it from the Android app');

  const { default: TrialReminderModal } = await load('src/components/subscription/TrialReminderModal.jsx');
  inApp('ios');
  let closed = 0;
  view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: () => { closed++; } }));
  assert.match(view.textContent, /Your trial ends soon/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal([...view.querySelectorAll('button')].some((b) => /Choose a Plan/.test(b.textContent)), false, 'No Choose a Plan in the iPhone app');
  const later = [...view.querySelectorAll('button')].find((b) => /Remind me later/.test(b.textContent));
  assert.ok(later, 'The iPhone app can close it');
  await act(async () => { later.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(closed, 1);
  for (const platform of ['android', false]) {
    inApp(platform);
    view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: null }));
    assert.ok([...view.querySelectorAll('button')].some((b) => /Choose a Plan/.test(b.textContent)), `${platform || 'The website'} offers Choose a Plan`);
  }
  const layout = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  assert.match(layout, /const trialReminderClosable = canDismissTrialModal \|\| !sellsPlans\(\);/, 'Where no plan is sold the reminder can always be closed');
  assert.match(layout, /onDismiss=\{trialReminderClosable \? dismissTrialModal : null\}/);
  assert.match(layout, /useBackToClose\(showTrialModal && trialReminderClosable && workspaceShown, dismissTrialModal\)/);
  assert.doesNotMatch(layout, /if \(!sellsPlans\(\)\) return;/, 'The reminder shows in the apps too');
  assert.match(layout, /document\.addEventListener\('visibilitychange', onFront\)/, 'Layout reads the plan again when the app comes back');
  assert.match(layout, /invalidateQueries\(\{ queryKey: \['entitlements', tenantId\] \}/);
  passed('the trial reminder offers Choose a Plan in the Android app, can be closed in the iPhone app, and the plan is read again on return');

  const tour = await load('src/components/tour/tourStepsContent.jsx');
  const text = (steps) => steps.map((s) => (typeof s.content === 'string' ? s.content : '')).join(' ');
  for (const platform of ['android', 'ios', false]) {
    inApp(platform);
    assert.match(text(tour.getProductsSteps({ tier: 'starter' })), /Upgrade to Growth or Professional/);
    assert.match(text(tour.getProductsSteps({ tier: 'growth' })), /Professional gives you unlimited/);
  }
  passed('the product tour names the bigger plans in the apps as on the website');

  const sources = Object.fromEntries(await Promise.all([
    'src/pages/Account.jsx', 'src/pages/UserManagement.jsx',
  ].map(async (file) => [file, await readFile(path.join(app, file), 'utf8')])));
  assert.match(sources['src/pages/Account.jsx'], /\{!businessReady && \(\s*<Card icon=\{Briefcase\} iconClass="bg-purple-50 text-purple-600" title="Run my business" badge="Paid plans">/, 'Run my business shows in the app too');
  assert.match(sources['src/pages/Account.jsx'], /\{sellsPlans\(\) \? \(\s*<button type="button" onClick=\{\(\) => setShowPlans\(true\)\}/, 'See plans wherever plans are sold');
  assert.match(sources['src/pages/UserManagement.jsx'], /Upgrade to Pro for unlimited roles\./);
  passed('Run my business and Upgrade to Pro show in the apps; See plans wherever plans are sold');

  // No second free trial (Alvin, 5 Nov 2026): a shop that exists gets the plans without a trial,
  // wherever its plan window opens (the account panel, Settings, Products, Reports, Sell).
  const plans = await load('src/lib/plans.js');
  const { default: PricingModal } = await load('src/components/subscription/PricingModal.jsx');
  inApp(false);
  const opened = [];
  window.open = (url) => { opened.push(url); return null; };
  view = await render(React.createElement(PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' }));
  const planButtons = [...document.body.querySelectorAll('button')].filter((b) => /Upgrade|Downgrade|Get Started/.test(b.textContent));
  assert.ok(planButtons.length >= 2, 'The plans have buttons');
  for (const button of planButtons) await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const linkSet = (key) => new Set(plans.BUSINESS_PLANS.flatMap((p) => [p[key].monthly, p[key].yearly]));
  const shopLinks = linkSet('shopLinks');
  const shopTrialLinks = linkSet('shopTrialLinks');
  const signUpLinks = new Set([...linkSet('links'), ...linkSet('noTrialLinks')]);
  assert.equal(new Set([...shopLinks, ...shopTrialLinks, ...signUpLinks]).size, 24, 'four different links per plan and billing');
  assert.equal(opened.length, planButtons.length);
  for (const url of opened) {
    const [base, query] = url.split('?');
    assert.ok(shopLinks.has(base), `${base} is a shop's checkout without a trial`);
    assert.equal(signUpLinks.has(base), false, "not a sign-up link (those return to the sign-up page)");
    assert.equal(new URLSearchParams(query).get('client_reference_id'), 'shop-1');
  }
  const step3 = await readFile(path.join(app, 'src/components/onboarding/Step3MenuSetup.jsx'), 'utf8');
  assert.doesNotMatch(step3, /PricingModal/, 'Setting up a business opens no plan checkout');
  passed('a shop that exists only ever gets the plans without a free trial; setup opens no checkout');

  // The Android app: the same plan cards; a plan's button hands Stripe's page to the phone
  // (openOutside) instead of opening a window the app's web view doesn't have.
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  opened.length = 0;
  inApp('android');
  await render(React.createElement(PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' }));
  const appButtons = [...document.body.querySelectorAll('button')].filter((b) => /Upgrade|Downgrade/.test(b.textContent));
  assert.equal(appButtons.length, 2, 'The Android app shows the plans to move to');
  assert.equal(document.body.textContent.includes(WEBSITE), false);
  inApp('ios');
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  await render(React.createElement(PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' }));
  assert.ok(document.body.textContent.includes(WEBSITE), 'The iPhone app: where plans are managed');
  assert.equal([...document.body.querySelectorAll('button')].filter((b) => /Upgrade|Downgrade/.test(b.textContent)).length, 0);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  inApp(false);
  for (const file of ['src/components/subscription/PricingModal.jsx', 'src/components/subscription/UpgradeWall.jsx']) {
    const source = await readFile(path.join(app, file), 'utf8');
    assert.match(source, /openOutside\(getLink\(plan\)\)/, `${file}: a plan opens through openOutside`);
    assert.doesNotMatch(source, /window\.open\(/, `${file}: no window.open`);
  }
  const { default: AuthPricingModal } = await load('src/components/auth/AuthPricingModal.jsx');
  for (const platform of ['android', false]) {
    inApp(platform);
    await render(React.createElement(AuthPricingModal, { onClose: () => {}, prefilledEmail: 'new@shop.sg' }));
    const trials = [...document.body.querySelectorAll('a[href^="https://buy.stripe.com/"]')];
    assert.equal(trials.length, 3, `${platform || 'the website'}: a free-trial checkout per plan`);
    for (const a of trials) assert.equal(a.getAttribute('target'), platform ? null : '_blank');
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
  }
  passed('the Android app shows the plan cards and hands checkout to the phone; the iPhone app shows where plans are managed');

  // Only the shop's owner pays for the shop (stripe-webhook, 5 Nov 2026), so Stripe's form starts
  // with the owner's email; not a phone sign-in's placeholder, and not another shop's owner.
  const together = path.join(temporary, 'pricing-with-shop.jsx');
  await writeFile(together, [
    "export { default as PricingModal } from '@/components/subscription/PricingModal.jsx';",
    "export { default as TenantContext } from '@/components/tenant/TenantContext.jsx';",
  ].join('\n'));
  const withShop = await load(path.relative(app, together));
  const prefilled = async (tenant) => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
    opened.length = 0;
    await render(React.createElement(withShop.TenantContext.Provider, { value: { tenant } },
      React.createElement(withShop.PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' })));
    const button = [...document.body.querySelectorAll('button')].filter((b) => /Upgrade/.test(b.textContent)).pop();
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const params = new URLSearchParams(opened.at(-1).split('?')[1]);
    assert.equal(params.get('client_reference_id'), 'shop-1');
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
    return params.get('prefilled_email');
  };
  assert.equal(await prefilled({ id: 'shop-1', owner_email: ' Owner@Shop.SG ', seller_type: 'merchant' }), 'Owner@Shop.SG');
  assert.equal(await prefilled({ id: 'shop-1', owner_email: '6588833442@sellio.app', seller_type: 'merchant' }), null);
  assert.equal(await prefilled({ id: 'shop-2', owner_email: 'other@shop.sg', seller_type: 'merchant' }), null);
  passed("the plan checkout starts with the shop owner's email");

  // A free home shop (Alvin, 9 Nov 2026): the business plans, free for 7 days if the shop hasn't
  // had its trial, through the shop's own links (Stripe's page then says to go back to Sellio).
  const homeShop = async (tenant) => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
    opened.length = 0;
    await render(React.createElement(withShop.TenantContext.Provider, { value: { tenant } },
      React.createElement(withShop.PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' })));
    const body = document.body.textContent.replace(/\s+/g, ' ');
    const buttons = [...document.body.querySelectorAll('button')].map((b) => b.textContent.trim());
    const plan = [...document.body.querySelectorAll('button')].filter((b) => /Start free trial|Choose plan/.test(b.textContent));
    for (const button of plan) await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return { body, buttons, urls: [...opened] };
  };
  let home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.match(home.body, /Move to a business plan/);
  assert.match(home.body, /Free for 7 days, then the plan’s price\. Mei’s Bakes keeps its link, listings, orders and ratings, and gets the counter, kitchen display, tables & QR, staff logins and printing\./);
  assert.match(home.body, /Its order page becomes a business one \(takeaway or dine-in, pay by PayNow or at the counter\)\. If you stop paying, it goes back to a free home shop\./);
  assert.match(home.body, /Same 10 listings and 100 orders a month as your free shop\./, 'Starter: the same limits as free');
  assert.equal(home.buttons.filter((b) => b === 'Start free trial →').length, 3, 'every plan starts with the free trial');
  assert.equal(home.body.includes('Current Plan'), false, 'a home shop is on none of them');
  assert.equal(home.body.includes('coming soon'), false);
  assert.equal(home.urls.length, 3);
  for (const url of home.urls) {
    const [base, query] = url.split('?');
    assert.ok(shopTrialLinks.has(base), `${base}: the shop's free-trial checkout`);
    const params = new URLSearchParams(query);
    assert.equal(params.get('client_reference_id'), 'shop-1');
    assert.equal(params.get('prefilled_email'), 'mei@bakes.sg');
  }
  home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: true });
  assert.equal(home.buttons.filter((b) => b === 'Choose plan →').length, 3, 'trial used: Choose plan');
  assert.equal(home.body.includes('Free for 7 days'), false);
  for (const url of home.urls) assert.ok(shopLinks.has(url.split('?')[0]), 'trial used: charged now');
  inApp('android');
  home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.equal(home.buttons.filter((b) => b === 'Start free trial →').length, 3, 'the Android app too');
  assert.equal(home.urls.length, 0, 'in the app the checkout is handed to the phone, not a new window');
  inApp('ios');
  home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.ok(home.body.includes(WEBSITE), 'the iPhone app: where plans are managed');
  assert.match(home.body, /Your personal shop is on the free plan/);
  inApp(false);
  passed('a free home shop: the business plans, free for 7 days the first time, through its own checkout; what changes is said first');

  // The locked-shop wall: the shop's own links, never a second trial.
  const wallEntry = path.join(temporary, 'wall-with-shop.jsx');
  await writeFile(wallEntry, [
    "export { default as UpgradeWall } from '@/components/subscription/UpgradeWall.jsx';",
    "export { default as TenantContext } from '@/components/tenant/TenantContext.jsx';",
  ].join('\n'));
  const wall = await load(path.relative(app, wallEntry));
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  opened.length = 0;
  await render(React.createElement(wall.TenantContext.Provider, { value: {
    tenantId: 'shop-9', user: { email: 'owner@kopi.sg' }, tenant: { id: 'shop-9', has_used_trial: true, seller_type: 'merchant' },
    subscription: { status: 'cancelled', tier: 'growth' },
  } }, React.createElement(wall.UpgradeWall)));
  const wallButtons = [...document.body.querySelectorAll('button')].filter((b) => /Resubscribe|Choose plan/.test(b.textContent));
  assert.equal(wallButtons.length, 3);
  for (const button of wallButtons) await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(opened.length, 3);
  for (const url of opened) {
    const [base, query] = url.split('?');
    assert.ok(shopLinks.has(base), `${base}: the shop's checkout, no trial`);
    assert.equal(new URLSearchParams(query).get('client_reference_id'), 'shop-9');
    assert.equal(new URLSearchParams(query).get('prefilled_email'), 'owner@kopi.sg');
  }
  const layoutLock = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  assert.match(layoutLock, /const isLocked = tenant\?\.seller_type !== 'individual' && subscription && \(/, 'a home shop is never locked by an ended plan');
  assert.equal((layoutLock.match(/invalidateQueries\(\{ queryKey: \['currentTenant', tenantId\] \}/g) || []).length, 2,
    'the shop is read again when the app comes back and when its plan changes');
  assert.match(layoutLock, /if \(lastPlan\.current !== null && lastPlan\.current !== plan\) \{/);
  passed("the locked-shop wall resubscribes through the shop's own checkout; a home shop is never locked by an ended plan");

  for (const root of roots) await act(async () => root.unmount());
  console.log(passes + ' plans-in-app checks passed.');
} finally {
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
