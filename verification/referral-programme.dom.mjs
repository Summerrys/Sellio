// Refer & earn, phase 3: the app side of Sellio's referral programme (build plan, 10 Nov 2026;
// Alvin, 20 Nov 2026: the code part now, the wallet and payouts later, and only paying shops can
// join). Checks lib/referral.js (codes, the 60 days on this device, ref_CODE in sign-up
// checkouts), the invite page (/r/CODE), Refer & earn (/refer) in each of its states, the share
// and "i" sheets, the Me row, and the code fields in the two plan windows, against a stand-in
// for Sellio's database.
// Run: node verification/referral-programme.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/refer', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'PointerEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  if (win[key] !== undefined) Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.ResizeObserver = globalThis.ResizeObserver;
win.scrollTo = () => {};
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

// Sellio's database, as the screens see it: each function's answer, and every call.
const calls = [];
let answers = {};
const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle: async () => ({ data: null }), then(r) { return Promise.resolve({ data: [], error: null }).then(r); } };
globalThis.supabaseStub = {
  rpc: async (name, args) => {
    calls.push([name, args]);
    const answer = answers[name];
    return answer ? answer(args) : { data: null, error: null };
  },
  from: () => query,
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/qr.png' } }) }) },
  auth: { getUser: async () => ({ data: {} }), signOut: async () => ({}) },
};
const callsTo = (name) => calls.filter(([n]) => n === name);
globalThis.toasts = [];

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-referral-'));
const local = path.join(process.cwd(), '.referral-programme-bundle.mjs');
const mocks = {
  tenant: [
    "import React from 'react';",
    'const TenantContext = React.createContext(null);',
    'export default TenantContext;',
    'export const useTenant = () => globalThis.tenantState;',
  ].join('\n'),
  subscription: 'export const useSubscription = () => ({ subscription: null, tier: "starter" });',
  clients: "export const getSupabase = async () => globalThis.supabaseStub; export const SUPABASE_URL = 'https://project.example.invalid';",
  profile: 'export const cookieUtils = { clear() {} }; export const useAppUser = () => globalThis.appUserState;',
  toast: 'export const toast = { error(m) { globalThis.toasts.push(["error", m]); }, success(m) { globalThis.toasts.push(["success", m]); } }; export const Toaster = () => null;',
  push: "export const pushStatus = async () => 'unavailable'; export const askAndroid = async () => false; export const ask = askAndroid;",
  ratings: 'export const amIModerator = async () => false; export const moderationQueue = async () => []; export const ratingReviewQueue = async () => []; export const ratingText = () => ""; export const shopRatingOverview = async () => null;',
  purchases: 'export const purchaseSummary = async () => null;',
  nothing: 'export default function Nothing() { return null; } export const TAB_BAR_SPACE = "80px"; export const markExploreHome = () => {};',
};
const plugin = { name: 'referral-fixtures', setup(builder) {
  for (const [filter, key] of [[/tenant\/TenantContext$/, 'tenant'], [/useSubscription$/, 'subscription'], [/supabaseClient$/, 'clients'],
    [/AppUserContext$/, 'profile'], [/^sonner$/, 'toast'], [/pushNotifications$/, 'push'], [/lib\/ratings$/, 'ratings'],
    [/lib\/purchases$/, 'purchases'], [/(^|\/)ExploreTabBar$|(^|\/)ShopBell$|(^|\/)ExploreChatCount$/, 'nothing']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
// An element's words as read: each piece of text apart (block elements have no spaces between them
// in textContent).
const text = (el) => {
  if (!el) return '';
  const parts = [];
  const walker = document.createTreeWalker(el, win.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
  return parts.join(' ').replace(/\s+/g, ' ').replace(/ ([.,:;!?])/g, '$1').trim();
};
const pageText = () => text(document.body);
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await settle(); };
const buttonNamed = (label) => [...document.body.querySelectorAll('button')].find((b) => text(b) === label);
const byTestId = (id) => document.body.querySelector(`[data-testid="${id}"]`);
const allByTestId = (id) => [...document.body.querySelectorAll(`[data-testid="${id}"]`)];
async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new win.Event('input', { bubbles: true })); });
}
const params = (href) => new URL(href).searchParams;
const clipboard = [];
Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: { writeText: async (s) => { clipboard.push(s); } } });
const tabs = [];
win.open = (url = '') => { const tab = { url, location: { href: url }, closed: false, close() { this.closed = true; } }; tabs.push(tab); return tab; };

const RATES = { monthly: 0.03, yearly: 0.05, friendMonthly: 0.01, friendYearly: 0.03, milestoneShops: 10 };
const KOPI = { found: true, code: '4PWJDZ', shopName: 'Kopi Corner', logoUrl: null, firstName: 'Ah Hock', whatsapp: '6591234567' };

try {
  await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'js',
      contents: [
        "export * as referral from '@/lib/referral';",
        "export { default as Refer } from '@/pages/Refer';",
        "export { default as ReferralInvite } from '@/pages/ReferralInvite';",
        "export { default as ExploreMe } from '@/components/explore/ExploreMe';",
        "export { default as PricingModal } from '@/components/subscription/PricingModal';",
        "export { default as AuthPricingModal } from '@/components/auth/AuthPricingModal';",
        "export { default as TenantContext } from '@/components/tenant/TenantContext';",
        "export { BUSINESS_PLANS } from '@/lib/plans';",
        "export { resetAppTextForTests } from '@/lib/appText';",
      ].join('\n'),
    },
    outfile: path.join(tmp, 'referral.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'referral.mjs'), local);
  const app = await import(pathToFileURL(local));
  const { referral, BUSINESS_PLANS } = app;

  async function show(element, entries = ['/']) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(h(app.TenantContext.Provider, { value: globalThis.tenantState }, h(MemoryRouter, { initialEntries: entries }, element)));
    });
    await settle();
    return async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; };
  }
  const reset = () => { calls.length = 0; answers = {}; globalThis.toasts = []; clipboard.length = 0; tabs.length = 0; referral.forgetReferral(); };
  const owner = (tenant = {}, extra = {}) => {
    const shop = { id: 'shop-1', name: 'Kopi Corner', slug: 'kopi-corner', seller_type: 'merchant', owner_email: 'hock@kopi.sg', ...tenant };
    globalThis.appUserState = { appUser: { id: 'u-1', full_name: 'Ah Hock Tan', email: 'hock@kopi.sg', phone: '91234567', tenant_id: shop.id }, clearAppUser() {} };
    globalThis.tenantState = { user: { id: 'u-1', email: 'hock@kopi.sg', full_name: 'Ah Hock Tan' }, tenant: shop, tenantId: shop.id, isOwner: true,
      subscription: { status: 'active', tier: 'growth' }, noStore: false, isLoading: false, hasPermission: () => true, ...extra };
  };

  // 1. Codes as the database reads them (app.referral_normal_code), and sign-up links.
  reset();
  assert.equal(referral.referralCode('4pwjdz'), '4PWJDZ');
  assert.equal(referral.referralCode(' 4PW-JDZ '), '4PWJDZ');
  assert.equal(referral.referralCode('ref_4PWJDZ'), '4PWJDZ', 'the checkout reference');
  assert.equal(referral.referralCode('ref4pwjdz'), '4PWJDZ');
  assert.equal(referral.referralCode('REFABC'), 'REFABC', 'six letters that start with REF are a code');
  for (const bad of ['4PWJD0', 'IOU123', '4PWJD', '4PWJDZZ', '', null, 'ref_4PWJ']) assert.equal(referral.referralCode(bad), null, `${bad} is no code`);
  const plain = 'https://buy.stripe.com/14A28t1Qd2or6i72t27bW0r';
  assert.equal(referral.withReferral(plain, '4pwjdz'), `${plain}?client_reference_id=ref_4PWJDZ`);
  const withEmail = referral.withReferral(`${plain}?locked_prefilled_email=a%2Bb%40kopi.sg`, '4PWJDZ');
  assert.equal(params(withEmail).get('locked_prefilled_email'), 'a+b@kopi.sg', 'the email stays');
  assert.equal(params(withEmail).get('client_reference_id'), 'ref_4PWJDZ');
  assert.equal(referral.withReferral(plain, '4PWJDZ', { typed: true }), `${plain}?client_reference_id=reft_4PWJDZ`, 'typed: reft_ (Sellio records it as typed)');
  assert.equal(referral.withReferral(plain, null), plain, 'no code, the link as it was');
  assert.equal(referral.withReferral(plain, 'nonsense'), plain);
  assert.equal(referral.ratePercent(0.03), '3%');
  assert.equal(referral.ratePercent(0.035), '3.5%');
  passed('codes read as the database reads them (case, dashes, ref_), and a sign-up link carries client_reference_id=ref_CODE');

  // 2. Kept on this device for 60 days; ?ref= on any page is checked first.
  reset();
  const t0 = Date.parse('2026-11-20T12:00:00Z');
  referral.keepReferral(KOPI, t0);
  assert.equal(referral.keptReferral(t0 + 59 * 864e5)?.code, '4PWJDZ', 'still kept on day 59');
  assert.equal(referral.keptReferral(t0 + 59 * 864e5)?.typed, false, 'from a link');
  assert.equal(referral.keptReferral(t0 + 59 * 864e5)?.shopName, 'Kopi Corner');
  assert.equal(referral.keptReferral(t0 + 61 * 864e5), null, 'gone after 60 days');
  assert.equal(localStorage.getItem('sellio_referral'), null, 'and taken off the device');
  answers.referral_code_info = ({ p_code }) => ({ data: p_code === '4PWJDZ' ? KOPI : { found: false }, error: null });
  assert.equal((await referral.captureReferral('?utm_source=wa&ref=4pwjdz'))?.code, '4PWJDZ');
  assert.equal(referral.keptReferral()?.code, '4PWJDZ', '?ref= keeps a working code');
  assert.deepEqual(callsTo('referral_code_info')[0][1], { p_code: '4PWJDZ' });
  referral.forgetReferral();
  assert.equal(await referral.captureReferral('?ref=ZZZZZZ'), null);
  assert.equal(referral.keptReferral(), null, 'a code Sellio doesn\'t know is not kept');
  calls.length = 0;
  assert.equal(await referral.captureReferral('?ref=hello'), null);
  assert.equal(callsTo('referral_code_info').length, 0, 'something that is no code is not even checked');
  const appSource = await readFile(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
  assert.match(appSource, /function ReferralCapture\(\) \{\s*const \{ search \} = useLocation\(\);\s*useEffect\(\(\) => \{\s*if \(\/\[\?&\]ref=\/i\.test\(search\)\) captureReferral\(search\);/);
  assert.match(appSource, /<RouteIndexingGuard \/>\s*<ReferralCapture \/>/, 'on every page');
  passed('a code is kept on this device for 60 days, and ?ref=CODE on any page keeps it once Sellio says it works');

  // 3. The invite page, sellio.sg/r/CODE.
  reset();
  globalThis.appUserState = { appUser: null };
  globalThis.tenantState = { tenant: null, isOwner: false, subscription: null, noStore: true, isLoading: false, hasPermission: () => false };
  answers.referral_code_info = () => ({ data: KOPI, error: null });
  let close = await show(h(Routes, null, h(Route, { path: '/r/:code', element: h(app.ReferralInvite) })), ['/r/4pwjdz']);
  assert.deepEqual(callsTo('referral_code_info')[0][1], { p_code: '4PWJDZ' }, 'the code from the address, as Sellio writes it');
  assert.match(text(byTestId('invite-from')), /Ah Hock from Kopi Corner invited you to Sellio\. Kopi Corner uses Sellio for its counter and orders\./);
  assert.equal(text(byTestId('invite-applied')), 'Referral code 4PWJDZ applied');
  assert.equal(referral.keptReferral()?.code, '4PWJDZ', 'kept for the sign-up');
  let trials = allByTestId('invite-trial');
  assert.equal(trials.length, 3, 'Starter, Growth and Professional');
  BUSINESS_PLANS.forEach((plan, i) => {
    const href = trials[i].getAttribute('href');
    assert.equal(href.split('?')[0], plan.links.monthly, `${plan.name}: its 7-day trial link`);
    assert.equal(params(href).get('client_reference_id'), 'ref_4PWJDZ', `${plan.name}: with the code`);
    assert.equal(trials[i].getAttribute('target'), '_blank');
  });
  assert.match(pageText(), /S\$39 \/month or S\$390\/year/, 'the price, and the other billing beside it');
  await click([...document.body.querySelectorAll('[role="radio"]')].find((b) => /Yearly/.test(text(b))));
  trials = allByTestId('invite-trial');
  assert.equal(trials[1].getAttribute('href').split('?')[0], BUSINESS_PLANS[1].links.yearly, 'yearly: the yearly trial links');
  assert.equal(params(trials[1].getAttribute('href')).get('client_reference_id'), 'ref_4PWJDZ');
  const wa = byTestId('invite-whatsapp');
  assert.ok(wa.getAttribute('href').startsWith('https://wa.me/6591234567?text='), "Ah Hock's WhatsApp, as he chose to show it");
  assert.match(decodeURIComponent(wa.getAttribute('href').split('text=')[1]), /code 4PWJDZ/);
  assert.equal(text(wa), 'WhatsApp Ah Hock');
  assert.equal(text(byTestId('invite-disclosure')), 'Ah Hock earns a commission from Sellio if you subscribe. Your price is the same.');
  assert.match(pageText(), /Already selling from home on Sellio\? Log in and move your shop to a business plan\. The code stays applied\./);
  assert.ok(!/wallet/i.test(pageText()), 'nothing about wallets');
  await close();
  passed('the invite page: who invited them, the code applied, the three plans with 7-day trial links carrying ref_CODE, their WhatsApp, and the commission line');

  // The distributor didn't choose to show WhatsApp: Sellio's own; a code that stopped working.
  reset();
  answers.referral_code_info = () => ({ data: { ...KOPI, whatsapp: null, firstName: null }, error: null });
  close = await show(h(Routes, null, h(Route, { path: '/r/:code', element: h(app.ReferralInvite) })), ['/r/4PWJDZ']);
  assert.equal(byTestId('invite-whatsapp'), null, 'no WhatsApp button for the distributor');
  assert.match(pageText(), /Message Sellio on WhatsApp and we’ll help you set up\. WhatsApp Sellio/);
  assert.match(text(byTestId('invite-from').querySelector('p')), /^Kopi Corner invited you to Sellio\./, 'the shop when there is no first name');
  assert.equal(text(byTestId('invite-disclosure')), 'Kopi Corner earns a commission from Sellio if you subscribe. Your price is the same.');
  await close();
  referral.keepReferral(KOPI);
  answers.referral_code_info = () => ({ data: { found: false }, error: null });
  close = await show(h(Routes, null, h(Route, { path: '/r/:code', element: h(app.ReferralInvite) })), ['/r/4PWJDZ']);
  assert.match(text(byTestId('invite-missing')), /This invite link isn’t active\. You can still try Sellio free for 7 days\. See plans/);
  assert.equal(allByTestId('invite-trial').length, 0);
  assert.equal(referral.keptReferral(), null, 'a code that stopped working is not carried into a checkout');
  await close();
  calls.length = 0;
  close = await show(h(Routes, null, h(Route, { path: '/r/:code', element: h(app.ReferralInvite) })), ['/r/not-a-code']);
  assert.ok(byTestId('invite-missing'));
  assert.equal(callsTo('referral_code_info').length, 0);
  await close();
  passed("the invite page without the distributor's WhatsApp offers Sellio's; a code that no longer works says so and is forgotten");

  // 4. Refer & earn, first visit: one tap records the terms and makes the code.
  reset();
  owner();
  let joined = false;
  const joinedAnswer = { joined: true, code: '4PWJDZ', link: 'https://sellio.sg/r/4PWJDZ', status: 'active', showWhatsapp: false, joinedAt: '2026-11-20T12:00:00Z',
    earning: true, notEarningReason: null, wallet: 12.5, pending: 3.2, earnedInAll: 15.7, rates: RATES };
  answers.referral_dashboard = () => ({ data: joined ? joinedAnswer : { joined: false, joiningOpen: true, termsVersion: '2026-11-draft', canJoin: true, rates: RATES }, error: null });
  answers.referral_join = () => { joined = true; return { data: { ok: true, code: '4PWJDZ' }, error: null }; };
  close = await show(h(app.Refer), ['/refer']);
  assert.deepEqual(callsTo('referral_dashboard')[0][1], { p_tenant_id: 'shop-1' });
  assert.match(text(byTestId('refer-pitch')), /Earn on every shop you bring to Sellio 3% of every monthly payment and 5% of every yearly payment from shops that join with your code\./);
  assert.match(text(byTestId('refer-pitch')), /By tapping, you agree to the Sellio Distributor Terms\./);
  assert.match(pageText(), /Share your code WhatsApp it, show the QR on your phone, or tell owners the code\./);
  await click(byTestId('refer-join'));
  assert.deepEqual(callsTo('referral_join')[0][1], { p_tenant_id: 'shop-1', p_terms_version: '2026-11-draft' }, 'the terms version shown');
  assert.equal(text(byTestId('refer-code')), '4PWJDZ', 'the code, straight away');
  assert.deepEqual(globalThis.toasts.at(-1), ['success', 'Your referral code is ready.']);
  await close();
  passed('first visit: the rates from Sellio, and "Get my referral code" joins with the terms version it showed');

  // Refused: the database's words, in the screen's words.
  reset();
  owner();
  answers.referral_dashboard = () => ({ data: { joined: false, joiningOpen: true, termsVersion: '2026-11-draft', canJoin: true, rates: RATES }, error: null });
  answers.referral_join = () => ({ data: null, error: { code: '42501', message: "Refer & earn isn't open yet." } });
  close = await show(h(app.Refer), ['/refer']);
  await click(byTestId('refer-join'));
  assert.equal(text(byTestId('refer-join-error')), "Refer & earn isn't open yet.");
  await close();
  answers.referral_join = () => ({ data: null, error: { code: '42501', message: "Refer & earn opens after your shop's first payment." } });
  close = await show(h(app.Refer), ['/refer']);
  await click(byTestId('refer-join'));
  assert.equal(text(byTestId('refer-join-error')), "Refer & earn opens after your shop's first payment.", 'paying shops only (20 Nov)');
  await close();
  answers.referral_join = () => ({ data: null, error: { message: 'connection reset' } });
  close = await show(h(app.Refer), ['/refer']);
  await click(byTestId('refer-join'));
  assert.equal(text(byTestId('refer-join-error')), 'Something went wrong. Please try again.', "words Sellio doesn't know aren't shown as they are");
  await close();
  passed("a refusal shows the database's own sentence; anything else a plain retry line");

  // 5. Not yet: still on the free trial (Alvin: paying shops only), joining closed, plan lapsed.
  for (const [label, setup, dashboard, admin, want] of [
    ['trial', () => owner({}, { subscription: { status: 'trial', tier: 'growth' } }), { joiningOpen: true, canJoin: false, joinBlock: 'trial' }, false, /Refer & earn opens after your shop’s first payment\. Your code will be here then\./],
    ['trial', () => owner(), { joiningOpen: true, canJoin: false, joinBlock: 'no payment' }, false, /Refer & earn opens after your shop’s first payment\./],
    ['soon', () => owner(), { joiningOpen: false, canJoin: true, joinBlock: null }, false, /Refer & earn isn't open yet\./],
    ['inactive', () => owner({}, { subscription: { status: 'cancelled', tier: 'growth' } }), { joiningOpen: true, canJoin: false, joinBlock: 'plan lapsed' }, false, /Refer & earn opens when your business plan is active\./],
  ]) {
    reset();
    setup();
    answers.referral_dashboard = () => ({ data: { joined: false, termsVersion: '2026-11-draft', rates: RATES, ...dashboard }, error: null });
    answers.am_i_sellio_admin = () => ({ data: admin, error: null });
    close = await show(h(app.Refer), ['/refer']);
    assert.match(text(byTestId(`refer-${label}`)), want, label);
    assert.equal(byTestId('refer-join'), null, `${label}: no join button`);
    await close();
  }
  // Joining closed, but a Sellio admin: can join (to try it before it opens).
  reset();
  owner();
  answers.referral_dashboard = () => ({ data: { joined: false, joiningOpen: false, termsVersion: '2026-11-draft', canJoin: true, rates: RATES }, error: null });
  answers.am_i_sellio_admin = () => ({ data: true, error: null });
  close = await show(h(app.Refer), ['/refer']);
  assert.ok(byTestId('refer-join'), 'an admin can join');
  assert.match(text(byTestId('refer-admin-only')), /Joining is closed for now\. You can join because you’re a Sellio admin\./);
  await close();
  passed('a shop on its free trial, or with no payment recorded, waits for its first payment; closed joining says so (but lets a Sellio admin in); a lapsed plan waits until it is active');

  // 6. A distributor: the code, the link, sharing, and the WhatsApp switch. No wallet yet.
  reset();
  owner();
  answers.referral_dashboard = () => ({ data: joinedAnswer, error: null });
  answers.referral_set_whatsapp = ({ p_show }) => ({ data: { ok: true, showWhatsapp: p_show }, error: null });
  close = await show(h(app.Refer), ['/refer']);
  assert.equal(text(byTestId('refer-code')), '4PWJDZ');
  assert.match(text(byTestId('refer-code-card')), /sellio\.sg\/r\/4PWJDZ/);
  const message = 'Hi! I run Kopi Corner on Sellio: counter, QR ordering and kitchen display in one app. Try it free for 7 days with my link: https://sellio.sg/r/4PWJDZ';
  assert.equal(decodeURIComponent(byTestId('refer-card-whatsapp').getAttribute('href').split('text=')[1]), message, 'WhatsApp: the message with the link');
  await click(byTestId('refer-copy'));
  assert.deepEqual(clipboard, ['https://sellio.sg/r/4PWJDZ'], 'Copy: the link');
  assert.ok(!/wallet|pending|earned in all|S\$/i.test(pageText()), 'no wallet, pending or earnings figures (Alvin: put aside)');
  await click(byTestId('refer-qr-button'));
  const sheet = byTestId('refer-share-sheet');
  assert.ok(sheet, 'the share sheet');
  assert.equal(text(byTestId('refer-message')), message);
  await settle(20);
  assert.match(byTestId('refer-qr')?.getAttribute('src') || '', /^data:image\/png;base64,/, 'the QR of the link');
  assert.equal(byTestId('refer-save-qr').getAttribute('download'), 'sellio-invite-4PWJDZ.png');
  await click(buttonNamed('Copy message'));
  assert.equal(clipboard.at(-1), message);
  assert.match(text(sheet), /Owners who sign up within 60 days of opening your link, or who type your code, count as yours\./);
  await click(document.body.querySelector('[role="dialog"] button[aria-label="Close"]'));
  const toggle = document.body.querySelector('#refer-whatsapp-switch');
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
  await click(toggle);
  assert.deepEqual(callsTo('referral_set_whatsapp')[0][1], { p_tenant_id: 'shop-1', p_show: true });
  assert.equal(document.body.querySelector('#refer-whatsapp-switch').getAttribute('aria-checked'), 'true');
  await close();
  // Saving the switch fails: it goes back, with a message.
  reset();
  owner();
  answers.referral_dashboard = () => ({ data: joinedAnswer, error: null });
  answers.referral_set_whatsapp = () => ({ data: null, error: { message: 'timeout' } });
  close = await show(h(app.Refer), ['/refer']);
  await click(document.body.querySelector('#refer-whatsapp-switch'));
  assert.equal(document.body.querySelector('#refer-whatsapp-switch').getAttribute('aria-checked'), 'false', 'back as it was');
  assert.deepEqual(globalThis.toasts.at(-1), ['error', 'Couldn’t save that. Check your connection and try again.']);
  await close();
  passed('a distributor: the code and link, WhatsApp with the message, Copy, the QR sheet (QR, message, save), the WhatsApp switch; no wallet figures');

  // 7. The "i" sheet: the rules, from Sellio's rates; nothing about where the money goes yet.
  reset();
  owner();
  answers.referral_dashboard = () => ({ data: joinedAnswer, error: null });
  close = await show(h(app.Refer), ['/refer']);
  await click(byTestId('refer-info'));
  const info = text(byTestId('refer-info-sheet'));
  assert.match(info, /How Refer & earn works/);
  assert.match(info, /3% of monthly, 5% of yearly payments Every time a shop that joined with your code pays its plan, for as long as it stays\. Free trials and failed payments don’t earn\./);
  assert.match(info, /Your plan fee back at 10 shops When 10 shops on the same billing as you \(monthly or yearly\) have paid, you earn one month’s or one year’s fee of your plan\. Any plan counts\. Once\./);
  assert.match(info, /once 10 of their shops pay monthly, you get an extra 1% of those payments; 10 yearly, an extra 3%\./);
  assert.match(info, /Read the Sellio Distributor Terms/);
  assert.ok(!/wallet|Friday|payout/i.test(info), 'not the wallet or pay runs');
  await close();
  passed('the "i" sheet: the rates, the plan fee back and the friend bonus from Sellio\'s settings, and the terms; not the wallet');

  // 8. When a distributor doesn't earn, the page says why; a paused code isn't shared.
  for (const [extra, want, shares] of [
    [{ earning: false, notEarningReason: 'own plan not active' }, /Your plan isn’t active, so shops you brought in don’t earn for you until it is\./, true],
    [{ status: 'paused', earning: false, notEarningReason: 'distributor paused' }, /Sellio has paused your code\. Sign-ups with it don’t count while it’s paused\./, false],
    [{ status: 'closed', earning: false, notEarningReason: 'distributor closed' }, /Refer & earn is closed for this shop\./, false],
  ]) {
    reset();
    owner();
    answers.referral_dashboard = () => ({ data: { ...joinedAnswer, ...extra }, error: null });
    close = await show(h(app.Refer), ['/refer']);
    assert.match(text(byTestId('refer-not-earning')), want);
    assert.equal(!!byTestId('refer-copy'), shares, shares ? 'still shared' : 'not shared');
    await close();
  }
  passed('not earning: a lapsed plan, a paused code and a closed one each say so; a paused or closed code has no share buttons');

  // 9. Not for them: a free home shop (no call to Sellio), a staff login, signed out.
  reset();
  owner({ seller_type: 'individual' });
  close = await show(h(app.Refer), ['/refer']);
  assert.equal(text(byTestId('refer-not-for-you')), 'Refer & earn is for the owners of business shops on a paid plan.');
  assert.equal(callsTo('referral_dashboard').length, 0);
  await close();
  reset();
  owner({}, { isOwner: false });
  close = await show(h(app.Refer), ['/refer']);
  assert.equal(text(byTestId('refer-not-for-you')), "Only the shop's owner can see this.");
  assert.equal(callsTo('referral_dashboard').length, 0);
  await close();
  reset();
  globalThis.appUserState = { appUser: null };
  globalThis.tenantState = { tenant: null, isOwner: false, subscription: null, noStore: true, isLoading: false, hasPermission: () => false };
  close = await show(h(app.Refer), ['/refer']);
  assert.match(pageText(), /Log in to your shop to see your referral code\./);
  await close();
  passed("a free home shop, a staff login and a signed-out visitor don't get a code (and Sellio isn't asked)");

  // 10. The Me row: a business shop's owner, once joining is open (or a Sellio admin before).
  async function meRow(dashboard, { admin = false, setup = () => owner() } = {}) {
    reset();
    setup();
    answers.referral_dashboard = () => ({ data: dashboard, error: null });
    answers.am_i_sellio_admin = () => ({ data: admin, error: null });
    const done = await show(h(app.ExploreMe), ['/explore/me']);
    await settle();
    const row = byTestId('refer-row');
    const result = row ? { text: text(row), href: row.getAttribute('href') } : null;
    await done();
    return result;
  }
  let row = await meRow(joinedAnswer);
  assert.equal(row?.href, '/refer');
  assert.equal(row?.text, 'Refer & earn Your code: 4PWJDZ');
  row = await meRow({ joined: false, joiningOpen: true, canJoin: true, rates: RATES });
  assert.equal(row?.text, 'Refer & earn NEW Earn 3% of monthly and 5% of yearly payments from shops you bring to Sellio');
  assert.equal(await meRow({ joined: false, joiningOpen: false, canJoin: true, rates: RATES }), null, 'joining closed: no row');
  assert.ok(await meRow({ joined: false, joiningOpen: false, canJoin: true, rates: RATES }, { admin: true }), "a Sellio admin's row, to try it");
  assert.equal(await meRow(joinedAnswer, { setup: () => owner({ seller_type: 'individual' }) }), null, 'a free home shop: no row');
  assert.equal(callsTo('referral_dashboard').length, 0, '…and no call');
  assert.equal(await meRow(joinedAnswer, { setup: () => owner({}, { isOwner: false }) }), null, 'staff: no row');
  passed("Me: the Refer & earn row for a business shop's owner (their code once joined), once joining opens or for a Sellio admin");

  // 11. The shop's plan window: a free home shop moving to a business plan names its distributor.
  const homeShop = () => owner({ seller_type: 'individual', has_used_trial: false }, { subscription: null });
  async function planWindow(setup) {
    setup();
    return show(h(app.PricingModal, { open: true, onOpenChange() {}, tenantId: 'shop-1', currentTier: null }), ['/explore/me']);
  }
  reset();
  referral.keepReferral(KOPI);
  answers.referral_attach = () => ({ data: { ok: true, code: '4PWJDZ', shopName: 'Kopi Corner' }, error: null });
  close = await planWindow(homeShop);
  assert.equal(byTestId('plan-referral-input').value, '4PWJDZ', "the code from the distributor's link");
  assert.equal(text(byTestId('plan-referral-who')), 'Ah Hock from Kopi Corner referred you');
  await click(byTestId('plan-checkout'));
  assert.deepEqual(callsTo('referral_attach')[0][1], { p_tenant_id: 'shop-1', p_code: '4PWJDZ' }, 'recorded before Stripe');
  assert.equal(tabs.length, 1, 'one tab, opened from the tap');
  assert.equal(params(tabs[0].location.href).get('client_reference_id'), 'shop-1', "Stripe's page, for the shop (its id, not ref_)");
  assert.equal(tabs[0].closed, false);
  await close();
  // Refused (it's the shop's own code, say): the reason, and Stripe doesn't open.
  reset();
  referral.keepReferral(KOPI);
  answers.referral_attach = () => ({ data: null, error: { code: '22023', message: "That's this shop's own code." } });
  close = await planWindow(homeShop);
  await click(byTestId('plan-checkout'));
  assert.equal(text(byTestId('plan-referral-error')), "That's this shop's own code.");
  assert.equal(tabs[0].closed, true, 'the tab closes again');
  await close();
  // Typed, checked, removed; with no code Stripe opens as before.
  reset();
  answers.referral_code_info = ({ p_code }) => ({ data: p_code === '4PWJDZ' ? KOPI : { found: false }, error: null });
  close = await planWindow(homeShop);
  assert.equal(byTestId('plan-referral-input').value, '');
  await type(byTestId('plan-referral-input'), 'zzzzzz');
  await click(buttonNamed('Apply'));
  assert.equal(text(byTestId('plan-referral-error')), "That referral code isn't valid.");
  await type(byTestId('plan-referral-input'), '4pwjdz');
  await click(buttonNamed('Apply'));
  assert.equal(text(byTestId('plan-referral-who')), 'Ah Hock from Kopi Corner referred you');
  assert.equal(referral.keptReferral()?.code, '4PWJDZ', 'a typed code takes the place of a link\'s');
  assert.equal(referral.keptReferral()?.typed, true);
  await click(buttonNamed('Remove'));
  assert.equal(byTestId('plan-referral-who'), null);
  assert.equal(referral.keptReferral(), null);
  await click(byTestId('plan-checkout'));
  assert.equal(callsTo('referral_attach').length, 0, 'no code, nothing to record');
  assert.equal(tabs.length, 1);
  assert.equal(params(tabs[0].url).get('client_reference_id'), 'shop-1', 'straight to Stripe, as before');
  await close();
  // Who sees the field: a business shop still on its trial (no payment yet) does; a paying one and staff don't.
  for (const [label, setup, shown] of [
    ['a business shop on its trial', () => owner({}, { subscription: { status: 'trial', tier: 'growth' } }), true],
    ['a paying business shop', () => owner(), false],
    ['staff', () => owner({ seller_type: 'individual' }, { isOwner: false, subscription: null }), false],
  ]) {
    reset();
    close = await planWindow(setup);
    assert.equal(!!byTestId('plan-referral'), shown, label);
    await close();
  }
  passed("the plan window: a home shop's first business plan names its distributor (from the link or typed), recorded before Stripe opens; refused codes say why");

  // 12. Sign-up's plan window: "Have a referral code?", and the links carry it.
  reset();
  answers.referral_code_info = ({ p_code }) => ({ data: p_code === '4PWJDZ' ? KOPI : { found: false }, error: null });
  globalThis.appUserState = { appUser: { id: 'u-2', email: 'mei@bakes.sg' } };
  globalThis.tenantState = { tenant: null, isOwner: false, subscription: null, noStore: true, isLoading: false, hasPermission: () => false };
  close = await show(h(app.AuthPricingModal, { onClose() {}, prefilledEmail: 'mei@bakes.sg' }), ['/Account']);
  const trialLinks = () => [...document.body.querySelectorAll('a[href^="https://buy.stripe.com/"]')].map((a) => a.getAttribute('href'));
  assert.equal(trialLinks().length, 3);
  assert.ok(trialLinks().every((href) => !params(href).get('client_reference_id')), 'no code, no reference');
  await click(byTestId('signup-referral-open'));
  await type(byTestId('signup-referral-input'), 'ref_4pwjdz');
  await act(async () => { byTestId('signup-referral-input').form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.match(text(byTestId('signup-referral')), /Referral code 4PWJDZ applied Invited by Ah Hock from Kopi Corner Remove/);
  assert.equal(referral.keptReferral()?.typed, true);
  for (const href of trialLinks()) {
    assert.equal(params(href).get('client_reference_id'), 'reft_4PWJDZ', 'typed: reft_, so Sellio records it as typed');
    assert.equal(params(href).get('locked_prefilled_email'), 'mei@bakes.sg', 'the account still locked');
  }
  await click(buttonNamed('Remove'));
  assert.ok(trialLinks().every((href) => !params(href).get('client_reference_id')), 'removed');
  await close();
  passed('sign-up\'s plans: a typed code is checked, then every trial link carries it (with the account\'s email); Remove takes it off');

  // 13. The landing page's plan buttons carry a kept code, with a line saying so.
  const landing = await readFile(path.join(process.cwd(), 'src/components/landing/LandingPage.jsx'), 'utf8');
  assert.match(landing, /const kept = useKeptReferral\(\);/);
  assert.match(landing, /const href = withReferral\(annual \? plan\.links\.annual : plan\.links\.monthly, kept\?\.code, \{ typed: kept\?\.typed \}\);/);
  assert.match(landing, /\{kept && \([\s\S]{0,400}data-testid="landing-referral"[\s\S]{0,400}\{referralLine\(kept\)\}/);
  assert.match(appSource, /<Route path="\/r\/:code" element=\{<ReferralInvite \/>\} \/>/, 'the invite page is public');
  assert.match(appSource, /<Route path="\/refer" element=\{<LayoutWrapper currentPageName="Explore"><Refer \/><\/LayoutWrapper>\} \/>/);
  passed("the landing page's plan buttons carry a kept code; /r/CODE is public and /refer is in the app");

  // 14. In 中文 (and the other languages): the explore group's words.
  reset();
  await app.resetAppTextForTests({ preview: 'zh', choice: 'zh' });
  owner();
  answers.referral_dashboard = () => ({ data: { joined: false, joiningOpen: true, termsVersion: '2026-11-draft', canJoin: true, rates: RATES }, error: null });
  close = await show(h(app.Refer), ['/refer']);
  await settle(10);
  assert.match(pageText(), /推荐赚佣金/);
  assert.match(text(byTestId('refer-join')), /获取我的推荐码/);
  assert.match(text(byTestId('refer-pitch')), /每笔按月付款您赚 3%，每笔按年付款赚 5%/);
  await close();
  await app.resetAppTextForTests();
  passed('Refer & earn in 中文');

  console.log(passes + ' referral-programme checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
