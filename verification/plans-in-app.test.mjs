// Plans in Sellio's apps (Alvin, 5 Nov 2026): the apps sell no plans (no prices, plan buttons,
// checkout or billing links) and say "Plans are managed on the Sellio website" where the website
// would offer one. The plan wording otherwise matches the website (the trial reminder, "Run my
// business", "email us to change your plan", "Upgrade to Pro"). In the apps the trial reminder
// can always be closed, since they have no Choose a Plan. A plan bought on the website shows
// when the app comes back to the front. The app is detected the way the real one is
// (window.Capacitor.isNativePlatform()).
// Run from the app root after installing jsdom into a temporary directory:
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/plans-in-app.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/Dashboard', pretendToBeVisual: true });
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
const inApp = (yes) => {
  if (yes) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
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
  inApp(true); assert.equal(native.sellsPlans(), false);
  inApp(false); assert.equal(native.sellsPlans(), true);
  passed('the apps sell no plans and say they are managed on the website');

  const { default: PlansOnWebsite } = await load('src/components/subscription/PlansOnWebsite.jsx');
  inApp(true);
  let view = await render(React.createElement(PlansOnWebsite, { tier: 'growth', note: 'Your data is safe and comes back as soon as your plan is active again.' }));
  assert.match(view.textContent, /Your plan: Growth/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No links or buttons to buy');
  passed('the plan dialog and the locked-shop wall in the app: the plan and where plans are managed, no way to buy');

  const { default: PlanFeatureNotice } = await load('src/components/subscription/PlanFeatureNotice.jsx');
  for (const yes of [true, false]) {
    inApp(yes);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: false }));
    assert.match(view.textContent, /Email sellio@apptelier\.sg to change your plan/);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal: true }));
    assert.match(view.textContent, /coming soon/);
  }
  passed('a page outside the plan says how to change it, in the apps as on the website');

  const { default: BillingStatusBanner } = await load('src/components/subscription/BillingStatusBanner.jsx');
  const pastDue = { status: 'past_due', invoice_amount_due_minor: 3900, invoice_currency: 'SGD', invoice_hosted_url: 'https://invoice.stripe.com/i/fixture', next_payment_attempt: null, grace_period_ends_at: null };
  inApp(true);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  assert.match(view.textContent, /Payment needs attention/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No Pay invoice or Billing in the app');
  inApp(false);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  assert.ok(view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]'), 'The website keeps Pay invoice');
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
  passed('a payment problem: the app points to the website; the website has Pay invoice and Billing');

  const { default: TrialReminderModal } = await load('src/components/subscription/TrialReminderModal.jsx');
  inApp(true);
  let closed = 0;
  view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: () => { closed++; } }));
  assert.match(view.textContent, /Your trial ends soon/);
  assert.ok(view.textContent.includes(WEBSITE));
  assert.equal([...view.querySelectorAll('button')].some((b) => /Choose a Plan/.test(b.textContent)), false, 'No Choose a Plan in the app');
  const later = [...view.querySelectorAll('button')].find((b) => /Remind me later/.test(b.textContent));
  assert.ok(later, 'The app can close it');
  await act(async () => { later.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(closed, 1);
  inApp(false);
  view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: null }));
  assert.ok([...view.querySelectorAll('button')].some((b) => /Choose a Plan/.test(b.textContent)), 'The website offers Choose a Plan');
  const layout = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  assert.match(layout, /const trialReminderClosable = canDismissTrialModal \|\| !sellsPlans\(\);/, 'In the app the reminder can always be closed');
  assert.match(layout, /onDismiss=\{trialReminderClosable \? dismissTrialModal : null\}/);
  assert.match(layout, /useBackToClose\(showTrialModal && trialReminderClosable && workspaceShown, dismissTrialModal\)/);
  assert.doesNotMatch(layout, /if \(!sellsPlans\(\)\) return;/, 'The reminder shows in the app too');
  assert.match(layout, /document\.addEventListener\('visibilitychange', onFront\)/, 'Layout reads the plan again when the app comes back');
  assert.match(layout, /invalidateQueries\(\{ queryKey: \['entitlements', tenantId\] \}/);
  passed('the trial reminder shows in the app, can always be closed there, and the plan is read again on return');

  const tour = await load('src/components/tour/tourStepsContent.jsx');
  const text = (steps) => steps.map((s) => (typeof s.content === 'string' ? s.content : '')).join(' ');
  for (const yes of [true, false]) {
    inApp(yes);
    assert.match(text(tour.getProductsSteps({ tier: 'starter' })), /Upgrade to Growth or Professional/);
    assert.match(text(tour.getProductsSteps({ tier: 'growth' })), /Professional gives you unlimited/);
  }
  passed('the product tour names the bigger plans in the apps as on the website');

  const sources = Object.fromEntries(await Promise.all([
    'src/pages/Account.jsx', 'src/pages/UserManagement.jsx',
  ].map(async (file) => [file, await readFile(path.join(app, file), 'utf8')])));
  assert.match(sources['src/pages/Account.jsx'], /\{!businessReady && \(\s*<Card icon=\{Briefcase\} iconClass="bg-purple-50 text-purple-600" title="Run my business" badge="Paid plans">/, 'Run my business shows in the app too');
  assert.match(sources['src/pages/Account.jsx'], /\{sellsPlans\(\) \? \(\s*<button type="button" onClick=\{\(\) => setShowPlans\(true\)\}/, 'See plans is the website only');
  assert.match(sources['src/pages/UserManagement.jsx'], /Upgrade to Pro for unlimited roles\./);
  passed('Run my business and Upgrade to Pro show in the apps; See plans stays on the website');

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
  const noTrial = new Set(plans.BUSINESS_PLANS.flatMap((p) => [p.noTrialLinks.monthly, p.noTrialLinks.yearly]));
  const trial = new Set(plans.BUSINESS_PLANS.flatMap((p) => [p.links.monthly, p.links.yearly]));
  assert.equal(opened.length, planButtons.length);
  for (const url of opened) {
    const [base, query] = url.split('?');
    assert.ok(noTrial.has(base), `${base} is a no-trial checkout`);
    assert.equal(trial.has(base), false);
    assert.equal(new URLSearchParams(query).get('client_reference_id'), 'shop-1');
  }
  const step3 = await readFile(path.join(app, 'src/components/onboarding/Step3MenuSetup.jsx'), 'utf8');
  assert.doesNotMatch(step3, /PricingModal/, 'Setting up a business opens no plan checkout');
  passed('a shop that exists only ever gets the plans without a free trial; setup opens no checkout');

  for (const root of roots) await act(async () => root.unmount());
  console.log(passes + ' plans-in-app checks passed.');
} finally {
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
