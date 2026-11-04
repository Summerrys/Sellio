// Sellio's apps sell no plans (5 Nov 2026): Google Play and Apple require their own billing for
// subscriptions sold in an app and forbid sending people elsewhere to buy. In the apps there are
// no prices, upgrade buttons, trial offers or billing links, and nothing says where plans are
// sold; the website keeps all of them. The app is detected the way the real one is
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
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'DocumentFragment', 'CustomEvent', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'NodeFilter']) {
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
// Words that would send someone elsewhere to buy, or sell them a plan.
const SELLING = /website|sellio\.sg|sellio@apptelier|stripe\.com|upgrade|free trial|choose a plan|whatsapp|S\$|\/month/i;

try {
  const native = await load('src/lib/nativeApp.js');
  assert.equal(native.NO_PLANS_IN_APP, "Plans can't be bought in the app");
  assert.equal(native.PLANS_ON_WEBSITE, native.NO_PLANS_IN_APP, 'The old name (still on the sign-in page) says the same');
  assert.doesNotMatch(native.NO_PLANS_IN_APP, SELLING);
  inApp(true); assert.equal(native.sellsPlans(), false);
  inApp(false); assert.equal(native.sellsPlans(), true);
  passed('the apps say only that plans can\'t be bought in the app, never where');

  const { default: PlansOnWebsite } = await load('src/components/subscription/PlansOnWebsite.jsx');
  inApp(true);
  let view = await render(React.createElement(PlansOnWebsite, { tier: 'growth', note: 'Your data is safe and comes back as soon as your plan is active again.' }));
  assert.match(view.textContent, /Your plan: Growth/);
  assert.match(view.textContent, /Plans can't be bought in the app\./);
  assert.doesNotMatch(view.textContent, SELLING);
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No links or buttons');
  passed('the plan dialog and the locked-shop wall in the app: the plan as it is, no way to buy');

  const { default: PlanFeatureNotice } = await load('src/components/subscription/PlanFeatureNotice.jsx');
  for (const personal of [true, false]) {
    inApp(true);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal }));
    assert.match(view.textContent, /isn’t included in your plan\./);
    assert.doesNotMatch(view.textContent, /sellio@apptelier|change your plan|coming soon|business plan/i);
    inApp(false);
    view = await render(React.createElement(PlanFeatureNotice, { feature: 'pos', personal }));
    assert.match(view.textContent, personal ? /coming soon/ : /Email sellio@apptelier\.sg to change your plan/);
  }
  passed('a page outside the plan: the app doesn\'t say how to change plans; the website does');

  const { default: BillingStatusBanner } = await load('src/components/subscription/BillingStatusBanner.jsx');
  const pastDue = { status: 'past_due', invoice_amount_due_minor: 3900, invoice_currency: 'SGD', invoice_hosted_url: 'https://invoice.stripe.com/i/fixture', next_payment_attempt: null, grace_period_ends_at: null };
  inApp(true);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  assert.match(view.textContent, /Payment needs attention/);
  assert.equal(view.querySelectorAll('a, button').length, 0, 'No Pay invoice or Billing in the app');
  assert.doesNotMatch(view.textContent, /update the payment method|website|Plans/i);
  inApp(false);
  view = await render(React.createElement(BillingStatusBanner, { subscription: pastDue, tenantId: 't1', isOwner: true }));
  assert.ok(view.querySelector('a[href="https://invoice.stripe.com/i/fixture"]'), 'The website keeps Pay invoice');
  assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.includes('Billing')));
  passed('a payment problem in the app: its status only; the website keeps Pay invoice and Billing');

  const { default: TrialReminderModal } = await load('src/components/subscription/TrialReminderModal.jsx');
  inApp(true);
  view = await render(React.createElement(TrialReminderModal, { hoursLeft: 5, onUpgrade: () => {}, onDismiss: null }));
  assert.doesNotMatch(view.textContent, SELLING);
  assert.equal([...view.querySelectorAll('button')].some((b) => /plan/i.test(b.textContent)), false);
  const layout = await readFile(path.join(app, 'src/Layout.jsx'), 'utf8');
  const trialEffect = layout.slice(layout.indexOf('// The trial reminder sells a plan'), layout.indexOf("sessionStorage.getItem('trial_modal_dismissed')"));
  assert.match(trialEffect, /if \(!sellsPlans\(\)\) return;/, 'Layout never shows the trial reminder in the app');
  assert.match(layout, /document\.addEventListener\('visibilitychange', onFront\)/, 'Layout reads the plan again when the app comes back');
  assert.match(layout, /invalidateQueries\(\{ queryKey: \['entitlements', tenantId\] \}/);
  passed('the trial reminder is the website\'s only, and the plan is read again when the app comes back');

  const tour = await load('src/components/tour/tourStepsContent.jsx');
  const text = (steps) => steps.map((s) => (typeof s.content === 'string' ? s.content : '')).join(' ');
  for (const tier of ['starter', 'growth']) {
    inApp(true);
    assert.doesNotMatch(text(tour.getProductsSteps({ tier })), /Upgrade|Professional gives/);
    inApp(false);
    assert.match(text(tour.getProductsSteps({ tier })), /Upgrade|Professional gives/);
  }
  passed('the product tour names bigger plans on the website only');

  const sources = Object.fromEntries(await Promise.all([
    'src/pages/Account.jsx', 'src/pages/UserManagement.jsx', 'src/pages/Products.jsx', 'src/components/profile/AccountProfileModal.jsx',
  ].map(async (file) => [file, await readFile(path.join(app, file), 'utf8')])));
  assert.match(sources['src/pages/Account.jsx'], /\{!businessReady && sellsPlans\(\) && \(\s*<Card icon=\{Briefcase\}/, 'The paid plans card is the website\'s only');
  assert.match(sources['src/pages/UserManagement.jsx'], /sellsPlans\(\) \? ' Upgrade to Pro for unlimited roles\.' : ''/);
  assert.match(sources['src/pages/UserManagement.jsx'], /sellsPlans\(\) \? 'Upgrade your plan to add more staff' : "Your plan's staff limit is reached"/);
  assert.match(sources['src/pages/Products.jsx'], /sellsPlans\(\) \? `Deselect some items or upgrade your plan/);
  assert.match(sources['src/components/profile/AccountProfileModal.jsx'], /\{sellsPlans\(\) && \(\s*<p className="text-\[11px\] text-red-600 mt-0\.5">\s*Update the payment method/);
  passed('the account home, staff, products and account panel keep their plan wording to the website');

  // The built app (dist-app, what the Android and iPhone apps carry) no longer says where plans are sold.
  const { readdir } = await import('node:fs/promises');
  const assets = path.join(app, 'dist-app', 'assets');
  const files = (await readdir(assets).catch(() => [])).filter((name) => name.endsWith('.js'));
  if (files.length) {
    for (const name of files) {
      const code = await readFile(path.join(assets, name), 'utf8');
      assert.equal(code.includes('Plans are managed on the Sellio website'), false, `${name} still points to the website`);
    }
    passed(`the built app files (${files.length} scripts) don't point to the website for plans`);
  } else {
    console.log('SKIP the built app files (run npm run build first)');
  }

  for (const root of roots) await act(async () => root.unmount());
  console.log(passes + ' plans-in-app checks passed.');
} finally {
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
