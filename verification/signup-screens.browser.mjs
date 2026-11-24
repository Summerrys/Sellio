// The sign-up's next screens (Alvin, 17 Nov 2026), in Chrome as a phone, on the real pages:
// Check your email (the awning, step 1 of 3, the envelope with its sent tick, "We sent a link
// to…", the spam hint, Resend), Set up your account (step 2 of 3, "…is verified" or "Signed in
// with Google", no password after Google), the account page (step 3 of 3, welcome and confetti on
// the first visit only, the three choices, the plans, Explore), and Name your shop (the sign shows
// the name as it's typed, a missing name said under the field, then the shop opens and its setup
// starts), in English and 中文, on a regular phone, and still for a phone set to reduce motion.
//
//   node verification/signup-screens.browser.mjs <folder with playwright(-core)> [screenshot folder]
// The page is built from src with stand-ins for Supabase (as in form-errors.browser.mjs).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const shots = process.argv[3] || '';
let chromium;
let executablePath;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require('playwright-core'));
  executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
}
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const PAGE = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Auth from '@/pages/AUTH_FILE';
import Join from '@/pages/JOIN_FILE';
import Account from '@/pages/Account';

window.__calls = [];
const chain = (result) => {
  const q = { select: () => q, eq: () => q, limit: () => q, order: () => q, in: () => q, insert: () => q, update: () => q, upsert: () => q,
    maybeSingle: async () => result, single: async () => result, then: (resolve) => resolve(result) };
  return q;
};
window.__client = {
  auth: {
    // Signed out (this tab, across reloads): no session any more.
    getSession: async () => ({ data: { session: sessionStorage.getItem('__signedOut') ? null : window.__session || null } }),
    getUser: async () => ({ data: { user: sessionStorage.getItem('__signedOut') ? null : window.__session?.user || null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signUp: async (body) => { window.__calls.push(['signUp', body]); return window.__signUp || { data: {}, error: null }; },
    signInWithOtp: async (body) => { window.__calls.push(['signInWithOtp', body]); return { data: {}, error: window.__otpError || null }; },
    updateUser: async (body) => { window.__calls.push(['updateUser', body]); return { data: {}, error: window.__updateUserError || null }; },
    verifyOtp: async () => ({ data: {}, error: null }),
    setSession: async () => ({ error: null }),
    signOut: async (options) => {
      if (window.__signOutError) return { error: window.__signOutError };
      sessionStorage.setItem('__signedOut', JSON.stringify(options || {}));
      return { error: null };
    },
  },
  rpc: (name, args) => {
    window.__calls.push(['rpc', name, args]);
    // Kept across the page load that follows opening a shop.
    try { const log = JSON.parse(sessionStorage.getItem('__rpcLog') || '[]'); log.push([name, args]); sessionStorage.setItem('__rpcLog', JSON.stringify(log)); } catch {}
    if (name === 'create_personal_store') return chain({ data: window.__newShop || null, error: null });
    if (name === 'referral_code_info') return chain({ data: (window.__codes || {})[args.p_code] || { found: false }, error: null });
    if (name === 'referral_attach_free') return chain({ data: { ok: true }, error: null });
    if (name === 'get_invite_by_token') return chain({ data: window.__invite || null, error: null });
    if (name === 'my_account_status') return chain({ data: window.__status || null, error: null });
    if (name === 'complete_account_setup') return chain({ data: null, error: window.__setupError || null });
    return chain({ data: null, error: null });
  },
  from: () => chain({ data: [], error: null }),
  functions: { invoke: async () => ({ data: null, error: null }) },
};

const where = location.pathname.toLowerCase();
const screen = where.startsWith('/join') ? <Join /> : where.startsWith('/account') ? <Account /> : <Auth />;
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    {screen}
    <Toaster />
  </BrowserRouter>,
);
`;

const temporary = await mkdtemp(path.join(app, '.signup-screens-browser-'));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const authFile = 'Auth';
  const joinFile = 'Join';
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE.replace('AUTH_FILE', authFile).replace('JOIN_FILE', joinFile));
  const stub = (name, contents) => ({ name, contents });
  const stubs = [
    [/supabaseClient$/, stub('client', 'export const getSupabase = async () => window.__client; export const SUPABASE_URL = "https://x.invalid"; export const supabase = window.__client;')],
    [/AppUserContext$/, stub('profile', 'import React from "react"; const C = React.createContext(null); export default C; export const AppUserContext = C; export function useAppUser() { return { appUser: null, setAppUser: (u) => { window.__calls.push(["setAppUser", u]); }, clearAppUser: () => { window.__calls.push(["clearAppUser"]); }, loading: false }; } export const AppUserProvider = ({ children }) => children; export const cookieUtils = { get: () => null, set() {}, remove() {} };')],
    [/lib\/phoneAuth(\.js)?$/, stub('phone', 'export async function callPhoneAuth(body) { window.__calls.push(["phone-auth", body]); return window.__phoneAuth ? window.__phoneAuth(body) : null; }')],
    [/AuthPricingModal(\.jsx)?$/, stub('plans', 'export default function AuthPricingModal() { return <div data-testid="plans-modal">plans</div>; }')],
    [/authNavigation(\.js)?$/, stub('navigation', 'export function completeAuthNavigation(to) { window.__calls.push(["navigate", to]); } export const authNavigation = {};')],
  ];
  const plugin = { name: 'stand-ins', setup(b) {
    stubs.forEach(([filter, s]) => {
      b.onResolve({ filter }, () => ({ path: s.name, namespace: 'stub' }));
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ loader: 'jsx', resolveDir: app, contents: stubs.find(([, s]) => s.name === args.path)[1].contents }));
  } };
  const result = await build({
    entryPoints: [entry], write: false, bundle: true, format: 'esm', jsx: 'automatic', minify: false,
    alias: { '@': path.join(app, 'src') }, nodePaths: [path.join(app, 'node_modules')], loader: { '.js': 'jsx' }, plugins: [plugin],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const appHtml = await readFile(path.join(app, 'dist/app.html'), 'utf8');
  const cssFiles = [...appHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(app, 'dist', f), 'utf8')))).join('\n').replace(/<\/style/gi, '<\\/style');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script type="module">${js}</script></body></html>`;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore' });
  const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'forms.test') return route.abort();
    if (!u.pathname.includes('.')) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    // The app's own pictures (its logo), from the build.
    const file = path.join(app, 'dist', path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, ''));
    if (!file.startsWith(path.join(app, 'dist'))) return route.abort();
    try { return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: await readFile(file) }); } catch { return route.abort(); }
  });
  if (shots) await mkdir(shots, { recursive: true });
  const errors = [];
  async function open(address, setup = '') {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${address}: ${e.message}`));
    if (setup) await page.addInitScript(setup);
    await page.goto(`https://forms.test${address}`);
    return page;
  }
  const shoot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, selector);
  const invalid = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-invalid'), selector);
  const focused = (page) => page.evaluate(() => document.activeElement?.id || null);
  const calls = (page, kind) => page.evaluate((k) => window.__calls.filter((c) => c[0] === k), kind);

  const EMAIL_SESSION = `window.__session = { access_token: 'x.' + btoa(JSON.stringify({ amr: [{ method: 'otp', timestamp: 1 }] })).replace(/=+$/, '') + '.y', user: { id: 'u3', email: 'tan@kopi.sg', identities: [{ provider: 'email' }], app_metadata: { provider: 'email', providers: ['email'] } } };`;
  const GOOGLE_SESSION = `window.__session = { access_token: 'x.' + btoa(JSON.stringify({ amr: [{ method: 'oauth', timestamp: 1 }] })).replace(/=+$/, '') + '.y', user: { id: 'u2', email: 'mei@gmail.com', identities: [{ provider: 'google' }], app_metadata: { provider: 'google', providers: ['google'] } } };`;
  const SET_UP = `window.__session = { access_token: 'x.e30.y', user: { id: 'u4', email: 'mei@kopi.sg', identities: [{ provider: 'email' }] } }; window.__status = { email: 'mei@kopi.sg', email_proven: true, setup_done: true, profile: { full_name: 'Mei Ling', phone: '+6591234567' } };`;
  const english = "try { localStorage.setItem('sellio_app_language', 'en'); } catch {}";
  async function screen(address, setup = '', { width = 390, height = 844, motion } = {}) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    if (motion) await page.emulateMedia({ reducedMotion: motion });
    page.on('pageerror', (e) => errors.push(`${address}: ${e.message}`));
    await page.addInitScript(english + setup);
    await page.goto(`https://forms.test${address}`);
    return page;
  }
  const steps = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="signup-steps"] li')].map((li) => `${li.className || '-'}:${li.textContent}`));
  const cardBottom = (page) => page.evaluate(() => Math.round(document.querySelector('.rounded-2xl.shadow-xl').getBoundingClientRect().bottom + 16));

  // ── Check your email ──────────────────────────────────────────────────────────────────────
  {
    const page = await screen('/Join');
    await page.locator('#join-email').fill('mei@kopi.sg');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.join-stall-awning').count(), 1, 'the awning');
    assert.deepEqual(await steps(page), ['on:1Verify email', '-:2Your details', '-:3Get started']);
    assert.equal(await page.locator('[data-testid="email-sent-tick"]').count(), 1, 'the sent tick on the envelope');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.email-sent-tick-mark')).strokeDashoffset), '0px', 'the tick is drawn');
    const text = await page.locator('.rounded-2xl.shadow-xl').textContent();
    assert.match(text, /We sent a link to mei@kopi\.sg/);
    assert.match(text, /Not there\? Check your spam folder\./);
    assert.doesNotMatch(text, /on this device|newest email/, 'no "open it on this device" instructions');
    assert.equal(await page.getByRole('button', { name: /Resend in \d+s/ }).isDisabled(), true, 'Resend waits');
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    assert.equal(await page.locator('[data-testid="app-language-switch"]').count(), 0, 'flow-1-sent: no language button (picked on the first screen)');
    await shoot(page, 'flow-1-sent');
    await page.getByRole('button', { name: 'Use a different email' }).click();
    await page.locator('[data-testid="join-stall"]').waitFor();
    passed('Check your email: no language button (picked on the first screen), the awning, step 1 of 3, the envelope with its sent tick, the link and the spam hint, Resend waiting; Use a different email goes back');
    await page.close();
  }

  // ── Set up your account ───────────────────────────────────────────────────────────────────
  {
    const page = await screen('/Join', EMAIL_SESSION + "window.__status = { email: 'tan@kopi.sg', email_proven: true, setup_done: false, profile: {} };");
    await page.locator('#join-name').waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    assert.deepEqual(await steps(page), ['done:Verify email', 'on:2Your details', '-:3Get started']);
    assert.equal(await page.locator('[data-testid="join-verified"]').textContent(), 'tan@kopi.sg is verified');
    assert.equal(await page.locator('#join-password').count(), 1);
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    assert.equal(await page.locator('[data-testid="app-language-switch"]').count(), 0, 'flow-2-details: no language button (picked on the first screen)');
    assert.equal(await page.locator('[data-testid="join-different-account"]').textContent(), 'Use a different account');
    await shoot(page, 'flow-2-details');
    await page.locator('#join-name').fill('Tan');
    await page.locator('#join-phone').fill('91234567');
    await page.locator('#join-password').fill('sellio123');
    await page.locator('#join-confirm').fill('sellio123');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(600);
    assert.deepEqual(await calls(page, 'navigate'), [['navigate', '/Account']]);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sellio_account_welcome')), '1', 'the account page will say welcome');
    await page.close();
  }
  {
    const page = await screen('/Join', GOOGLE_SESSION + "window.__status = { email: 'mei@gmail.com', email_proven: true, setup_done: false, profile: { full_name: 'Mei Ling' } };");
    await page.locator('#join-name').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('[data-testid="join-verified"]').textContent(), 'Signed in with Google: mei@gmail.com');
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.equal(await page.locator('[data-testid="app-language-switch"]').count(), 0, 'flow-2-details-google: no language button (picked on the first screen)');
    await shoot(page, 'flow-2-details-google');
    // "Use a different account" (Alvin, 20 Nov 2026): if this device can't sign out, it says so
    // and stays; otherwise it signs out on this device only and starts again on the first screen.
    await page.evaluate(() => { window.__signOutError = { message: 'Failed to fetch' }; });
    await page.getByRole('button', { name: 'Use a different account' }).click();
    await page.locator('[data-sonner-toast]').first().waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#join-name').count(), 1, 'still on Your details');
    assert.equal(await page.getByRole('button', { name: 'Use a different account' }).isEnabled(), true, 'ready to try again');
    await page.evaluate(() => { window.__signOutError = null; });
    await page.getByRole('button', { name: 'Use a different account' }).click();
    await page.waitForURL((url) => url.pathname === '/Join');
    await page.locator('#join-email').waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('__signedOut')), '{"scope":"local"}', 'signed out on this device only');
    assert.equal(await page.locator('[data-testid="join-verified"]').count(), 0, 'nobody signed in');
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 1, 'Google again, to pick another account');
    passed('Set up your account: step 2 of 3 (1 ticked), "…is verified" or "Signed in with Google" (no password), and the account page is told to say welcome; "Use a different account" signs out on this device and starts again (and says so when it can\'t)');
    await page.close();
  }

  // ── The account page, its first visit and after ──────────────────────────────────────────
  {
    // As Join leaves it, once (an init script runs again on reload).
    const page = await screen('/Account', SET_UP + "if (!sessionStorage.getItem('__once')) { sessionStorage.setItem('__once', '1'); sessionStorage.setItem('sellio_account_welcome', '1'); }");
    await page.locator('[data-testid="account-card"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    assert.deepEqual(await steps(page), ['done:Verify email', 'done:Your details', 'on:3Get started']);
    assert.equal(await page.locator('h1').textContent(), 'Hi Mei, welcome to Sellio!');
    assert.match(await page.locator('[data-testid="account-card"]').textContent(), /What would you like to do first\?/);
    assert.equal(await page.locator('.sellio-confetti i').count(), 18, 'a little confetti');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sellio_account_welcome')), null, 'only once');
    const cards = await page.evaluate(() => [...document.querySelectorAll('.account-choice')].map((c) => [c.tagName, c.querySelector('.account-choice-tag')?.textContent || '', c.querySelector('.font-bold')?.textContent]));
    assert.deepEqual(cards, [['BUTTON', 'Free', 'Sell from home'], ['BUTTON', '7-day free trial', 'Run my business'], ['A', '', 'Explore and buy']]);
    assert.equal(await page.locator('a.account-choice').getAttribute('href'), '/explore');
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-testid="app-language-switch"]').count(), 0, 'flow-3-account: no language button (picked on the first screen)');
    await shoot(page, 'flow-3-account');
    // Name your shop, then Back: still the welcome and step 3, but no second confetti.
    await page.getByRole('button', { name: /Sell from home/ }).click();
    await page.locator('[data-testid="shop-name-form"]').waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('.account-choice').first().waitFor();
    assert.equal(await page.locator('.sellio-confetti').count(), 0, 'no confetti again after Back');
    assert.equal(await page.locator('h1').textContent(), 'Hi Mei, welcome to Sellio!');
    assert.equal(await page.locator('[data-testid="signup-steps"]').count(), 1);
    await page.reload();
    await page.locator('[data-testid="account-card"]').waitFor();
    assert.equal(await page.locator('[data-testid="signup-steps"]').count(), 0, 'no steps after the first visit');
    assert.equal(await page.locator('.sellio-confetti').count(), 0);
    assert.equal(await page.locator('h1').textContent(), 'Hi Mei!');
    await page.getByRole('button', { name: /Run my business/ }).click();
    await page.locator('[data-testid="plans-modal"]').waitFor();
    passed('The account page: step 3 of 3, "Hi Mei, welcome to Sellio!" and confetti (once) on the first visit only; Sell from home (Free), Run my business (7-day free trial, opens the plans), Explore and buy');
    await page.close();
  }

  // ── Name your shop ────────────────────────────────────────────────────────────────────────
  {
    const page = await screen('/Account', SET_UP);
    await page.getByRole('button', { name: /Sell from home/ }).click();
    await page.locator('[data-testid="shop-name-form"]').waitFor();
    assert.equal(await page.locator('.shop-name-sign-name').textContent(), 'Your shop');
    await page.getByRole('button', { name: 'Open my shop' }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#shop-name-error').textContent(), 'Please give your shop a name.');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'shop-name');
    assert.deepEqual((await calls(page, 'rpc')).filter((c) => c[1] === 'create_personal_store'), [], 'nothing sent');
    await page.locator('#shop-name').fill('Mei’s Home Bakes');
    assert.equal(await page.locator('.shop-name-sign-name').textContent(), 'Mei’s Home Bakes', 'the sign shows it as it’s typed');
    assert.equal(await page.locator('#shop-name-error').count(), 0, 'typing takes the problem off');
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    assert.equal(await page.locator('[data-testid="app-language-switch"]').count(), 0, 'flow-3b-name: no language button (picked on the first screen)');
    await shoot(page, 'flow-3b-name');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Sell from home/ }).click();
    await page.locator('#shop-name').fill('Mei’s Home Bakes');
    await Promise.all([page.waitForURL('**/ShopSetup'), page.getByRole('button', { name: 'Open my shop' }).click()]);
    passed('Name your shop: the sign shows the name as it’s typed; no name is said under the field, nothing sent; Back returns; then the shop opens and its setup starts');
    await page.close();
  }

  // ── Name your shop with a referral code (24 Nov 2026: 50 coins for whoever brought the shop) ──
  {
    const rpcLog = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__rpcLog') || '[]'));
    const NEW_SHOP = "window.__newShop = { tenant_id: 'shop-new', slug: 'siti-kitchen', name: 'Siti Kitchen' };";
    // The code kept from an invite link goes with the new shop, then it's forgotten on this device.
    const kept = "if (!sessionStorage.getItem('__kept')) { sessionStorage.setItem('__kept', '1'); localStorage.setItem('sellio_referral', JSON.stringify({ code: 'MEY234', shopName: 'Mei Bakes', firstName: 'Mei', typed: false, savedAt: Date.now() })); }";
    let page = await screen('/Account', SET_UP + NEW_SHOP + kept);
    await page.getByRole('button', { name: /Sell from home/ }).click();
    assert.equal((await page.locator('[data-testid="shop-referral-kept"]').textContent()).replace(/\s+/g, ' '), 'Referral code MEY234 applied Change');
    await page.locator('#shop-name').fill('Siti Kitchen');
    await Promise.all([page.waitForURL('**/ShopSetup'), page.getByRole('button', { name: 'Open my shop' }).click()]);
    let log = await rpcLog(page);
    assert.deepEqual(log.filter(([n]) => n === 'create_personal_store' || n.startsWith('referral_')), [
      ['create_personal_store', { p_name: 'Siti Kitchen', p_sells_food: null }],
      ['referral_attach_free', { p_tenant_id: 'shop-new', p_code: 'MEY234', p_typed: false }],
    ], "the link's code, with the new shop");
    assert.equal(await page.evaluate(() => localStorage.getItem('sellio_referral')), null, 'then forgotten');
    await page.close();
    // Typed: checked before the shop opens; a wrong one is said under the field and nothing is sent.
    page = await screen('/Account', SET_UP + NEW_SHOP + "window.__codes = { MEY234: { found: true, code: 'MEY234', shopName: 'Mei Bakes', firstName: 'Mei' } };");
    await page.getByRole('button', { name: /Sell from home/ }).click();
    await page.locator('#shop-name').fill('Siti Kitchen');
    await page.getByRole('button', { name: 'Have a referral code?' }).click();
    await page.locator('#referral-code').fill('zzz999');
    assert.equal(await page.locator('#referral-code').inputValue(), 'ZZZ999', 'in capitals');
    await page.getByRole('button', { name: 'Open my shop' }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#referral-code-error').textContent(), "That referral code isn't valid.");
    assert.equal(await invalid(page, '#referral-code'), 'true');
    assert.equal(await focused(page), 'referral-code');
    log = await rpcLog(page);
    assert.equal(log.filter(([n]) => n === 'create_personal_store').length, 0, 'no shop yet');
    await shoot(page, 'flow-3c-name-referral');
    await page.locator('#referral-code').fill('mey-234');
    await Promise.all([page.waitForURL('**/ShopSetup'), page.getByRole('button', { name: 'Open my shop' }).click()]);
    log = await rpcLog(page);
    assert.deepEqual(log.filter(([n]) => n === 'create_personal_store' || n === 'referral_attach_free'), [
      ['create_personal_store', { p_name: 'Siti Kitchen', p_sells_food: null }],
      ['referral_attach_free', { p_tenant_id: 'shop-new', p_code: 'MEY234', p_typed: true }],
    ], 'the typed code, checked, then with the new shop');
    passed('Name your shop with a referral code: a kept code goes with the new shop (then is forgotten); a typed one is checked first, a wrong one said under the field');
    await page.close();
  }

  // ── 中文, and Reduce motion ─────────────────────────────────────────────────────────────────
  {
    const page = await screen('/Account', SET_UP + "sessionStorage.setItem('sellio_account_welcome', '1'); localStorage.setItem('sellio_app_language', 'zh');");
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('欢迎来到'), null, { timeout: 10000 });
    assert.equal(await page.locator('h1').textContent(), 'Mei，您好！欢迎来到 Sellio！');
    assert.deepEqual(await steps(page), ['done:验证邮箱', 'done:您的资料', 'on:3开始使用']);
    await page.getByRole('button', { name: /在家开店/ }).click();
    assert.equal(await page.locator('.shop-name-sign-name').textContent(), '您的店铺');
    assert.equal(await page.locator('.shop-name-soon').textContent(), '即将开业');
    passed('中文: the welcome, the steps and the sign in Chinese');
    await page.close();
  }
  {
    const page = await screen('/Join', '', { motion: 'reduce' });
    await page.locator('#join-email').fill('mei@kopi.sg');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    const still = await page.evaluate(() => ({
      moving: document.getAnimations().filter((a) => a.effect?.target?.closest?.('.signup-steps, .email-sent-art')).length,
      tick: getComputedStyle(document.querySelector('.email-sent-tick-mark')).strokeDashoffset,
    }));
    assert.deepEqual(still, { moving: 0, tick: '0px' });
    passed('A phone set to reduce motion: nothing moves, and the sent tick is drawn');
    await page.close();
  }
  // ── Every language on a small phone: nothing wider than the screen, the step names fit ──────
  for (const language of ['en', 'id', 'zh', 'ms']) {
    const set = `localStorage.setItem('sellio_app_language', '${language}');`;
    const fits = (page) => page.evaluate(() => ({
      wide: document.documentElement.scrollWidth > window.innerWidth,
      steps: [...document.querySelectorAll('[data-testid="signup-steps"] li')].filter((li) => li.scrollWidth > li.clientWidth + 1).map((li) => li.textContent),
      sign: (() => { const n = document.querySelector('.shop-name-sign-name'); return n ? n.scrollWidth > n.clientWidth + 1 : false; })(),
    }));
    const sent = await screen('/Join', set, { width: 360, height: 740 });
    await sent.locator('#join-email').fill('mei@kopi.sg');
    await sent.locator('#join-email').press('Enter');
    await sent.locator('[data-testid="email-sent-art"]').waitFor();
    await sent.waitForTimeout(900);
    assert.deepEqual(await fits(sent), { wide: false, steps: [], sign: false }, `${language}: check your email fits`);
    assert.equal(await sent.evaluate(() => [...document.querySelectorAll('p span')].find((x) => x.textContent === 'mei@kopi.sg').getClientRects().length), 1, `${language}: the email address stays on one line`);
    await shoot(sent, `small-${language}-1-sent`);
    await sent.close();
    const account = await screen('/Account', SET_UP + set + "sessionStorage.setItem('sellio_account_welcome', '1');", { width: 360, height: 740 });
    await account.locator('.account-choice').first().waitFor({ timeout: 10000 });
    await account.waitForTimeout(2900);
    assert.deepEqual(await fits(account), { wide: false, steps: [], sign: false }, `${language}: the account page fits`);
    await shoot(account, `small-${language}-3-account`);
    await account.locator('.account-choice').first().click();
    await account.locator('#shop-name').fill('Warung Mak Cik Siti Nurhaliza');
    await account.waitForTimeout(300);
    assert.deepEqual(await fits(account), { wide: false, steps: [], sign: false }, `${language}: name your shop fits, with a long name`);
    await shoot(account, `small-${language}-3b-name`);
    await account.close();
  }
  passed('On a 360-pixel phone in English, Bahasa Indonesia, 中文 and Bahasa Melayu: nothing wider than the screen, the email address kept whole, the step names and a long shop name fit');

  assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} sign-up screens browser checks passed`);
