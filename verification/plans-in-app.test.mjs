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
  inApp('ios'); assert.equal(native.sellsPlans(), true);
  inApp(false); assert.equal(native.sellsPlans(), true);
  passed('the website, the Android app and (since 10 Nov 2026) the iPhone app sell the plans');

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
  passed('where no plans are sold (none today: sellsPlans): the plan and where plans are managed, no way to buy');

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
  const tryFree = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Upgrade to Business');
  assert.ok(tryFree, 'Upgrade to Business');
  await act(async () => { tryFree.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(seen, 1, 'it opens the plans');
  view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: true, freeTrial: false, onSeePlans: () => {} }));
  assert.match(view.textContent, /It comes with a business plan\. Your shop keeps/);
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent === 'Upgrade to Business'), 'trial used: the same Upgrade to Business');
  const layoutForNotice = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  assert.match(layoutForNotice, /onSeePlans=\{isOwner && sellsPlans\(\) \? \(\) => setShowPricingModal\(true\) : null\}/, "the owner, where plans are sold: the shop's plan window");
  assert.match(layoutForNotice, /freeTrial=\{!tenant\?\.has_used_trial\}/);
  passed('a page outside the plan: a free home shop\'s owner can move to a business plan from it (free for 7 days the first time); elsewhere it says how');

  const { default: BillingStatusBanner } = await load('src/components/subscription/BillingStatusBanner.jsx');
  const pastDue = { status: 'past_due', invoice_amount_due_minor: 3900, invoice_currency: 'SGD', invoice_hosted_url: 'https://invoice.stripe.com/i/fixture', next_payment_attempt: null, grace_period_ends_at: null };
  let payLink;
  for (const platform of ['android', 'ios']) {
    inApp(platform);
    view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
    assert.match(view.textContent, /Payment needs attention/);
    payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
    assert.ok(payLink, `The ${platform} app has Pay invoice`);
    assert.equal(payLink.getAttribute('target'), null, 'opened in place: the app hands it to the phone');
    assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
    assert.equal(view.textContent.includes(WEBSITE), false);
  }
  inApp(false);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
  assert.ok(payLink, 'The website keeps Pay invoice');
  assert.equal(payLink.getAttribute('target'), '_blank');
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
  passed('a payment problem: Pay invoice and Billing on the website and in both apps');

  const { default: BillingRecoveryWall } = await load('src/components/subscription/BillingRecoveryWall.jsx');
  inApp('android');
  view = await render(React.createElement(BillingRecoveryWall, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  payLink = view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]');
  assert.ok(payLink, 'The locked shop can pay its invoice from the Android app');
  assert.equal(payLink.getAttribute('target'), null);
  assert.ok([...view.querySelectorAll('button')].some((b) => /Update payment method/.test(b.textContent)));
  passed('a shop locked for an unpaid invoice can pay it from the Android app');

  const { default: TrialReminderModal } = await load('src/components/subscription/TrialReminderModal.jsx');
  let closed = 0;
  inApp('ios');
  view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: () => { closed++; } }));
  assert.match(view.textContent, /Your trial ends soon/);
  assert.equal(view.textContent.includes(WEBSITE), false);
  const later = [...view.querySelectorAll('button')].find((b) => /Remind me later/.test(b.textContent));
  assert.ok(later, 'closable when the shop may close it (canDismissTrialModal)');
  await act(async () => { later.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(closed, 1);
  for (const platform of ['android', 'ios', false]) {
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
  passed('the trial reminder offers Choose a Plan in both apps and on the website, and the plan is read again on return');

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
  // The short plan window (Alvin, 10 Nov 2026): one list of plans and one button.
  const planRadio = (key) => document.body.querySelector(`[role="radio"][data-plan="${key}"]`);
  const checkoutButton = () => document.body.querySelector('[data-testid="plan-checkout"]');
  const pickAndPay = async (keys = ['starter', 'growth', 'pro']) => {
    const labels = [];
    for (const key of keys) {
      await act(async () => { planRadio(key).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      labels.push(checkoutButton().textContent.trim());
      await act(async () => { checkoutButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }
    return labels;
  };
  inApp(false);
  const opened = [];
  window.open = (url) => { opened.push(url); return null; };
  // Only the plan window on the page (the earlier notices' Upgrade to Business buttons gone).
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  view = await render(React.createElement(PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' }));
  assert.match(document.body.textContent, /Choose your plan\s*You're on Starter\./);
  assert.equal(checkoutButton().textContent.trim(), 'Upgrade to Growth', 'the next plan up, picked first');
  const planLabels = await pickAndPay();
  assert.deepEqual(planLabels, ['Your current plan', 'Upgrade to Growth', 'Upgrade to Professional']);
  assert.equal(checkoutButton().disabled, false);
  await act(async () => { planRadio('starter').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(checkoutButton().disabled, true, 'the current plan: nothing to pay');
  const planButtons = ['growth', 'pro'];
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
  assert.equal(document.body.querySelectorAll('[role="radio"][data-plan]').length, 3, 'The Android app shows the plans');
  assert.equal(checkoutButton().textContent.trim(), 'Upgrade to Growth');
  assert.equal(document.body.textContent.includes(WEBSITE), false);
  inApp('ios');
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  await render(React.createElement(PricingModal, { open: true, onOpenChange: () => {}, tenantId: 'shop-1', currentTier: 'starter' }));
  assert.equal(document.body.textContent.includes(WEBSITE), false, 'The iPhone app: the plans too');
  assert.equal(document.body.querySelectorAll('[role="radio"][data-plan]').length, 3);
  assert.equal(checkoutButton().textContent.trim(), 'Upgrade to Growth');
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  inApp(false);
  for (const [file, opens] of [
    ['src/components/subscription/PricingModal.jsx', /openOutside\(shopCheckoutLink\(plan\.key, \{ yearly, trial: freeTrial, tenantId, email: ownerEmail, region \}\)\)/],
    ['src/components/subscription/UpgradeWall.jsx', /openOutside\(getLink\(plan\)\)/],
  ]) {
    const source = await readFile(path.join(app, file), 'utf8');
    assert.match(source, opens, `${file}: a plan opens through openOutside`);
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
  passed('both apps show the plan cards and hand checkout to the phone');

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
    await act(async () => { checkoutButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
    const fine = document.body.querySelector('[data-testid="plan-fine-print"]').textContent;
    const buttons = await pickAndPay();
    return { body, fine, buttons, urls: [...opened] };
  };
  let home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.match(home.body, /^Upgrade to Business ?7 days free\. Your shop keeps its link, listings and orders\./);
  assert.match(home.body, /Starter ?10 listings · 100 orders a month ?S\$39\/mo/, 'Starter: the same limits as free, said in its row');
  assert.match(home.body, /Growth ?Popular ?50 listings · 1,000 orders a month ?S\$79\/mo/);
  assert.match(home.body, /Professional ?Unlimited listings and orders ?S\$119\/mo/);
  assert.match(home.body, /Every plan: counter, kitchen display, tables & QR, staff logins and printing\. ?Compare plans/);
  assert.equal(home.fine, 'Then S$79 a month. If you stop paying, it goes back to a free home shop.', 'what it costs after the free week (Growth, picked first)');
  assert.deepEqual(home.buttons, ['Start 7 days free', 'Start 7 days free', 'Start 7 days free'], 'every plan starts with the free trial');
  assert.equal(home.body.includes('Multi-outlet'), false, 'no business footnotes for a home shop');
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
  assert.deepEqual(home.buttons, ['Upgrade to Starter', 'Upgrade to Growth', 'Upgrade to Professional'], 'trial used: Upgrade to …');
  assert.equal(home.body.includes('7 days free'), false);
  assert.equal(home.fine, 'S$79 a month. If you stop paying, it goes back to a free home shop.');
  for (const url of home.urls) assert.ok(shopLinks.has(url.split('?')[0]), 'trial used: charged now');
  inApp('android');
  home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.deepEqual(home.buttons, ['Start 7 days free', 'Start 7 days free', 'Start 7 days free'], 'the Android app too');
  assert.equal(home.urls.length, 0, 'in the app the checkout is handed to the phone, not a new window');
  inApp('ios');
  home = await homeShop({ id: 'shop-1', name: 'Mei’s Bakes', owner_email: 'mei@bakes.sg', seller_type: 'individual', has_used_trial: false });
  assert.deepEqual(home.buttons, ['Start 7 days free', 'Start 7 days free', 'Start 7 days free'], 'the iPhone app too (10 Nov 2026)');
  assert.equal(home.urls.length, 0, 'handed to the phone');
  assert.equal(home.body.includes(WEBSITE), false);
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
