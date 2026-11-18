// The login page as designed (Alvin, 17 Nov 2026), in Chrome as a phone, on the real pages: the
// sign-up's card (the awning, the stall without its stickers, "Welcome back!"), Login / Sign Up,
// and Mobile No. / Email. Email: the address (a wrong one, a staff login, one with no
// account and its way to sign up), "Email me a code" (no new accounts, the redirect that picks
// the code email), the six boxes (typing, a pasted code, a wrong or expired code, the last
// digit checking it), Resend's wait, Back and "Use a different email", the sign-in, and a
// closed account's code (its token_hash sent to the closed-account server). Sign Up: the free
// sign-up's first step straight away, on /Auth and /Join alike. A paid invite's sign-up and
// Forgot password in the same card. Every language on a small phone.
//
//   node verification/login-page.browser.mjs <folder with playwright(-core)> [screenshot folder]
// The page is built from src with stand-ins for Supabase (as in form-errors.browser.mjs).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

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
    getSession: async () => ({ data: { session: window.__session || null } }),
    getUser: async () => ({ data: { user: window.__session?.user || null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signUp: async (body) => { window.__calls.push(['signUp', body]); return { data: {}, error: null }; },
    signInWithOtp: async (body) => { window.__calls.push(['signInWithOtp', body]); return { data: {}, error: window.__otpError || null }; },
    verifyOtp: async (body) => { window.__calls.push(['verifyOtp', body]); return window.__verify ? window.__verify(body) : { data: {}, error: null }; },
    updateUser: async () => ({ data: {}, error: null }),
    setSession: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
  rpc: (name, args) => {
    window.__calls.push(['rpc', name, args]);
    if (name === 'get_invite_by_token') return chain({ data: window.__invite || null, error: null });
    if (name === 'my_account_status') return chain({ data: window.__status || null, error: null });
    return chain({ data: null, error: null });
  },
  from: (name) => chain({ data: (window.__tables && window.__tables[name]) || [], error: null }),
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

const temporary = await mkdtemp(path.join(app, '.login-page-browser-'));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const authFile = 'Auth';
  const joinFile = 'Join';
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE.replace('AUTH_FILE', authFile).replace('JOIN_FILE', joinFile));
  const stub = (name, contents) => ({ name, contents });
  const stubs = [
    [/supabaseClient$/, stub('client', 'export const getSupabase = async () => window.__client; export const getMobileOAuthClient = () => window.__client; export const SUPABASE_URL = "https://x.invalid"; export const supabase = window.__client;')],
    [/base44Client$/, stub('base44', 'export const base44 = { auth: {}, entities: {} };')],
    [/AppUserContext$/, stub('profile', 'import React from "react"; const C = React.createContext(null); export default C; export const AppUserContext = C; export function useAppUser() { return { appUser: null, setAppUser: (u) => { window.__calls.push(["setAppUser", u]); }, clearAppUser: () => { window.__calls.push(["clearAppUser"]); }, loading: false }; } export const AppUserProvider = ({ children }) => children; export const cookieUtils = { get: () => null, set() {}, remove() {} };')],
    [/phoneAuth(\.js)?$/, stub('phone', 'export const PHONE_AUTH_REGION = "ap-southeast-1"; export async function callPhoneAuth(body) { window.__calls.push(["phone-auth", body]); return window.__phoneAuth ? window.__phoneAuth(body) : null; }')],
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
  // Sellio's closed-account server (lib/closedAccount.js calls it with fetch): what it was asked,
  // and its answer for the scenario.
  const closedRequests = [];
  let closedReply = () => ({ ok: false, code: 'failed' });
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'x.invalid' && u.pathname.endsWith('/functions/v1/closed-account')) {
      const body = JSON.parse(route.request().postData() || '{}');
      closedRequests.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(closedReply(body)) });
    }
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

  const english = "try { localStorage.setItem('sellio_app_language', 'en'); } catch {}";
  async function screen(address, setup = '', { width = 390, height = 844 } = {}) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    page.on('pageerror', (e) => errors.push(`${address}: ${e.message}`));
    await page.addInitScript(english + setup);
    await page.goto(`https://forms.test${address}`);
    return page;
  }
  const cardBottom = (page) => page.evaluate(() => Math.round(document.querySelector('.rounded-2xl.shadow-xl').getBoundingClientRect().bottom + 16));
  const pressed = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(`${s} button`)].map((b) => `${b.getAttribute('aria-pressed')}:${b.textContent}`), selector);
  const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('.login-code-box')].map((b) => `${b.classList.contains('on') ? '>' : ''}${b.textContent || '_'}`).join(' '));
  const SIGNED_UP = "window.__tables = { app_users: [{ id: 'a1', email: 'mei.ling@gmail.com', full_name: 'Mei Ling', role: 'admin', onboarding_completed: true, tenant_id: 't1', phone: '+6591234567' }] };";
  const sha224 = (text) => createHash('sha224').update(text).digest('hex');

  // ── Login, as it opens ────────────────────────────────────────────────────────────────────
  {
    const page = await screen('/Auth');
    await page.getByRole('heading', { name: 'Welcome back!' }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.join-stall-awning').count(), 1, 'the awning');
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 1, 'the stall');
    assert.equal(await page.locator('[data-testid="join-stall-stickers"]').count(), 0, 'no stickers on Login');
    assert.equal(await page.locator('.join-stall-burst').count(), 0, 'no FREE!');
    assert.equal(await text(page, '.join-stall-welcome p'), 'Log in to your Sellio account.');
    assert.deepEqual(await pressed(page, '.auth-tabs'), ['true:Login', 'false:Sign Up']);
    assert.deepEqual(await pressed(page, '.auth-how'), ['true:Mobile No.', 'false:Email']);
    // No pills (Alvin, 18 Nov 2026): the one in use is underlined, in Sellio's orange.
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.auth-how button')].map((b) => {
      const button = getComputedStyle(b);
      const label = getComputedStyle(b.querySelector('.auth-how-label'));
      return [button.borderTopWidth, button.backgroundColor, label.borderBottomWidth, label.borderBottomColor];
    })), [['0px', 'rgba(0, 0, 0, 0)', '2px', 'rgb(251, 146, 60)'], ['0px', 'rgba(0, 0, 0, 0)', '2px', 'rgba(0, 0, 0, 0)']]);
    assert.equal(await text(page, 'label[for="auth-phone"]'), 'Mobile number');
    assert.equal(await text(page, 'label[for="auth-password"]'), 'Password');
    assert.equal(await page.getByRole('button', { name: 'Forgot password?' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Sign in with Google' }).count(), 1);
    assert.equal(await page.locator('img[src="/branding/sellio-logo.webp"]').count(), 0, 'the old logo header is gone');
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    await shoot(page, 'login-1-phone');
    passed('Login: the sign-up card (awning, the stall without its stickers, "Welcome back!"), Login / Sign Up, Mobile No. / Email (no pills, the one in use underlined), the number and password, Forgot password?, Google, on one screen');

    // ── Email: the address ──────────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    assert.deepEqual(await pressed(page, '.auth-how'), ['false:Mobile No.', 'true:Email']);
    assert.equal(await page.locator('#auth-phone').count(), 0);
    assert.equal(await text(page, '#auth-login-email-hint'), 'We’ll email you a 6-digit code. No password needed.');
    assert.equal(await page.getByRole('button', { name: 'Email me a code' }).isDisabled(), true, 'nothing to send yet');
    assert.equal(await page.getByRole('button', { name: 'Sign in with Google' }).count(), 1, 'Google stays');
    await page.locator('#auth-login-email').fill('mei@');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    assert.equal(await text(page, '#auth-login-email-error'), 'Please enter a valid email address.');
    assert.equal(await invalid(page, '#auth-login-email'), 'true');
    assert.equal(await focused(page), 'auth-login-email');
    await page.locator('#auth-login-email').fill('6591234567@sellio.app');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    assert.equal(await text(page, '#auth-login-email-error'), 'That’s a staff login. Staff log in with their mobile number and password.');
    assert.deepEqual(await calls(page, 'signInWithOtp'), [], 'nothing sent');
    await page.locator('#auth-login-email').fill('Mei.Ling@Gmail.com ');
    assert.equal(await page.locator('#auth-login-email-error').count(), 0, 'typing takes the problem off');
    await shoot(page, 'login-2-email');
    await page.evaluate(() => { window.__otpError = { code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 }; });
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.locator('#auth-login-email-error').waitFor();
    assert.equal(await text(page, '#auth-login-email-error'), 'There’s no Sellio account with this email.');
    assert.deepEqual((await calls(page, 'signInWithOtp'))[0][1], { email: 'mei.ling@gmail.com', options: { shouldCreateUser: false, emailRedirectTo: 'https://sellio.sg/Auth' } },
      'an account\'s address only, and the redirect that picks the code email');
    // The Magic Link email picks its code version by that same redirect (scripts/email-templates.py).
    for (const file of ['supabase/templates/verify-email.html', 'supabase/templates/verify-email.subject.txt']) {
      const template = await readFile(path.join(app, file), 'utf8');
      assert.ok(template.startsWith('{{ if eq .RedirectTo "https://sellio.sg/Auth" }}'), `${file} picks the code by the login page's redirect`);
      assert.match(template.slice(0, template.indexOf('{{ else }}')), /\{\{ \.Token \}\}/, `${file}: the code in the login version`);
    }
    await page.getByRole('button', { name: 'Create a free account' }).click();
    await page.locator('#join-email').waitFor();
    assert.equal(await page.locator('#join-email').inputValue(), 'mei.ling@gmail.com', 'the sign-up starts with that address');
    assert.deepEqual(await pressed(page, '.auth-tabs'), ['false:Login', 'true:Sign Up']);
    assert.equal(new URL(page.url()).pathname, '/Auth', 'still the login page');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back!' }).waitFor();
    assert.deepEqual(await pressed(page, '.auth-how'), ['false:Mobile No.', 'true:Email'], 'back where they were');
    passed('Email: the address (checked first: a wrong one, a staff login); no account for it says so, and "Create a free account" opens Sign Up with it; Login comes back');

    // ── The code ────────────────────────────────────────────────────────────────────────────
    await page.evaluate(() => { window.__otpError = null; window.__calls = []; });
    await page.locator('#auth-login-email').fill('mei.ling@gmail.com');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.locator('[data-testid="login-code-form"]').waitFor();
    assert.equal(await text(page, '[data-testid="login-code-sent"]'), 'Code sent to mei.ling@gmail.com');
    assert.equal(await text(page, 'label[for="auth-code"]'), 'Enter the 6-digit code');
    assert.equal(await focused(page), 'auth-code', 'the keyboard opens on the code');
    assert.equal(await page.locator('#auth-code').getAttribute('autocomplete'), 'one-time-code');
    assert.equal(await page.locator('#auth-code').getAttribute('inputmode'), 'numeric');
    assert.match(await page.locator('form[data-testid="login-code-form"]').textContent(), /Not there\? Check your spam folder\./);
    assert.match(await page.getByRole('button', { name: /Resend code in / }).textContent(), /Resend code in (1:00|0:59)/);
    assert.equal(await page.getByRole('button', { name: /Resend code in / }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Sign in with Google' }).count(), 0, 'no Google while typing the code');
    await page.keyboard.type('482');
    assert.equal(await boxes(page), '4 8 2 >_ _ _', 'the digits in their boxes, the next one marked');
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    await shoot(page, 'login-3-code');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    assert.equal(await text(page, '#auth-code-error'), 'Please enter the 6-digit code from the email.');
    assert.deepEqual(await calls(page, 'verifyOtp'), [], 'not sent with three digits');
    await page.evaluate(() => { window.__verify = () => ({ data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 } }); });
    await page.keyboard.type('111');
    await page.locator('#auth-code-error').waitFor();
    assert.deepEqual((await calls(page, 'verifyOtp')).map((c) => c[1]), [{ email: 'mei.ling@gmail.com', token: '482111', type: 'email' }], 'the sixth digit checks it');
    assert.equal(await text(page, '#auth-code-error'), 'That code isn’t right, or it has expired. Check the newest email from Sellio, or send a new code.');
    assert.equal(await page.locator('.login-code.bad').count(), 1, 'the boxes turn red');
    assert.equal(await page.locator('#auth-code').inputValue(), '', 'emptied for the next try');
    await shoot(page, 'login-4-wrong-code');
    passed('The code: "Code sent to…", six boxes (the phone\'s code suggestion, numbers), the spam hint, Resend waits, no Google; three digits are not enough; the sixth checks it; a wrong or expired one is said under the boxes');

    // A pasted code ("Your code is 482 731") signs in, and the page it belongs on opens.
    assert.equal(await page.evaluate(() => Boolean(window.history.state?.sellioOverlay)), true, 'the code screen has its Back step (Back returns to the address)');
    await page.evaluate((rows) => { eval(rows); window.__verify = (b) => ({ data: { session: { user: { email: b.email } }, user: { email: b.email } }, error: null }); window.__calls = []; }, SIGNED_UP);
    await page.locator('#auth-code').focus();
    await page.evaluate(() => {
      const field = document.getElementById('auth-code');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(field, 'Your code is 482 731');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    assert.deepEqual((await calls(page, 'verifyOtp')).map((c) => c[1]), [{ email: 'mei.ling@gmail.com', token: '482731', type: 'email' }]);
    assert.equal((await calls(page, 'setAppUser'))[0][1].email, 'mei.ling@gmail.com', 'this device knows who it is');
    assert.deepEqual(await calls(page, 'navigate'), [['navigate', '/explore']], 'where a signed-in shop owner goes, as after a phone sign-in');
    assert.equal(await page.evaluate(() => Boolean(window.history.state?.sellioOverlay)), false, 'the code\'s Back step went before the next page');
    passed('A pasted code signs in: the account\'s profile on this device, then where it belongs, with no Back step left behind');
    await page.close();
  }

  // ── Resend, Back, a different email ───────────────────────────────────────────────────────
  {
    const page = await screen('/Auth', "window.__otpError = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 2 seconds.', status: 429 };");
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.locator('#auth-login-email').fill('mei.ling@gmail.com');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.locator('[data-testid="login-code-form"]').waitFor();
    assert.match(await page.locator('[data-testid="login-code-form"] [role="status"]').textContent(), /^No new code was sent: one went to this address less than a minute ago\./);
    assert.match(await page.getByRole('button', { name: /Resend code in / }).textContent(), /Resend code in 0:0[12]/);
    await page.getByRole('button', { name: 'Resend code', exact: true }).waitFor({ timeout: 5000 });
    await page.evaluate(() => { window.__otpError = null; window.__calls = []; });
    await page.getByRole('button', { name: 'Resend code', exact: true }).click();
    await page.getByRole('button', { name: /Resend code in / }).waitFor();
    assert.deepEqual((await calls(page, 'signInWithOtp')).map((c) => c[1].email), ['mei.ling@gmail.com'], 'sent again to the same address');
    assert.equal(await page.locator('[data-testid="login-code-form"] [role="status"]').count(), 0);
    await page.goBack();
    await page.locator('#auth-login-email').waitFor();
    assert.equal(await page.locator('#auth-login-email').inputValue(), 'mei.ling@gmail.com', 'Back returns to the address');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.locator('[data-testid="login-code-form"]').waitFor();
    await page.getByRole('button', { name: 'Use a different email' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'auth-login-email', null, { timeout: 3000 });
    passed('Resend: an address emailed under a minute ago says so and waits it out; then Resend sends again; Back and "Use a different email" return to the address');
    await page.close();
  }

  // ── A closed account's code ───────────────────────────────────────────────────────────────
  {
    const page = await screen('/Auth', "window.__verify = () => ({ data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } });");
    closedReply = (b) => (b.emailTokenHash === sha224('owner@kopi.sg' + '482731')
      ? { ok: true, closed: { kind: 'owner', deleteAfter: '2027-05-17T00:00:00.000Z', shops: ['Kopi Corner'] }, email: 'owner@kopi.sg' }
      : { ok: false, code: 'link_invalid' });
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.locator('#auth-login-email').fill('owner@kopi.sg');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.locator('#auth-code').waitFor();
    await page.keyboard.type('000000');
    await page.locator('#auth-code-error').waitFor();
    assert.equal(await text(page, '#auth-code-error'), 'That code isn’t right, or it has expired. Check the newest email from Sellio, or send a new code.', 'a wrong code for a closed account');
    assert.equal(await focused(page), 'auth-code', 'still on the boxes for the next try');
    await page.keyboard.type('482731');
    await page.locator('[data-testid="closed-account"]').waitFor();
    assert.deepEqual(closedRequests.map((b) => [b.action, b.emailTokenHash, b.emailLinkType]), [
      ['status', sha224('owner@kopi.sg000000'), 'magiclink'],
      ['status', sha224('owner@kopi.sg482731'), 'magiclink'],
    ], 'the code\'s token_hash, as Supabase Auth makes it (sha224 of the address and the code)');
    assert.match(await page.locator('[data-testid="closed-account"]').textContent(), /Kopi Corner/);
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 0, 'the awning only');
    await shoot(page, 'login-5-closed');
    passed('A closed account\'s code opens the closed-account screen: the code\'s token_hash goes to the closed-account server, as Join\'s link does; a wrong code is said under the boxes');
    await page.close();
  }

  // ── Sign Up: the free sign-up's first step straight away ──────────────────────────────────
  {
    const page = await screen('/Auth');
    await page.getByRole('heading', { name: 'Welcome back!' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.locator('#join-email').waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-testid="join-stall-stickers"]').count(), 1, 'the stickers');
    assert.match(await text(page, '.join-stall-hl h1'), /^Open your shop on Sellio$/);
    assert.deepEqual(await pressed(page, '.auth-tabs'), ['false:Login', 'true:Sign Up']);
    assert.equal(await page.getByRole('button', { name: 'Send verification email' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 1);
    assert.doesNotMatch(await page.locator('.rounded-2xl.shadow-xl').textContent(), /Already have an account|Create my free account|Business plans/);
    assert.ok(await cardBottom(page) <= 844, 'on one screen');
    await shoot(page, 'signup-1-tab');
    await page.locator('#join-email').fill('new@kopi.sg');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    assert.deepEqual((await calls(page, 'signInWithOtp'))[0][1], { email: 'new@kopi.sg', options: { emailRedirectTo: 'https://sellio.sg/Join', shouldCreateUser: true } }, 'the verify email, as on /Join');
    assert.equal(new URL(page.url()).pathname, '/Auth');
    passed('Sign Up: the free sign-up\'s first step straight away (the stall with its stickers, Open your shop on Sellio, the email, Google), on one screen; it sends the verify email and goes on to Check your email');
    await page.close();
  }
  {
    const page = await screen('/Join');
    await page.locator('#join-email').waitFor({ timeout: 10000 });
    assert.deepEqual(await pressed(page, '.auth-tabs'), ['false:Login', 'true:Sign Up']);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL('**/Auth');
    passed('/Join has Login / Sign Up too: Login opens the login page');
    await page.close();
  }

  // ── A paid invite's sign-up, and Forgot password, in the same card ────────────────────────
  {
    const page = await screen('/Auth?token=abc', "window.__invite = { status: 'pending', email: 'boss@kopi.sg', full_name: 'Boss Tan', phone: '+6591234567' };");
    await page.locator('#auth-full_name').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 1);
    assert.equal(await page.locator('[data-testid="join-stall-stickers"]').count(), 0);
    assert.equal(await page.locator('#join-email').count(), 0, 'not the free sign-up');
    assert.equal(await page.locator('#auth-email').inputValue(), 'boss@kopi.sg');
    assert.deepEqual(await pressed(page, '.auth-tabs'), ['false:Login', 'true:Sign Up']);
    await shoot(page, 'signup-2-invite');
    passed('A paid invite\'s link: its sign-up (name, number, email, password) in the same card');
    await page.close();
  }
  {
    const page = await screen('/Auth');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByText('Reset Password', { exact: true }).waitFor();
    assert.equal(await page.locator('.join-stall-awning').count(), 1);
    assert.equal(await page.locator('[data-testid="join-stall"]').count(), 0);
    await shoot(page, 'login-6-forgot');
    passed('Forgot password: the same card, its awning on top');
    await page.close();
  }

  // ── Every language on a small phone ───────────────────────────────────────────────────────
  for (const language of ['en', 'id', 'zh', 'ms']) {
    const set = `localStorage.setItem('sellio_app_language', '${language}');`;
    const fits = (page) => page.evaluate(() => ({
      wide: document.documentElement.scrollWidth > window.innerWidth,
      cut: [...document.querySelectorAll('.auth-tabs button, .auth-how button, .login-code-box')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
    }));
    const page = await screen('/Auth', set, { width: 360, height: 740 });
    await page.locator('.auth-how').waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);
    assert.deepEqual(await fits(page), { wide: false, cut: [] }, `${language}: login fits`);
    await shoot(page, `small-${language}-login`);
    await page.locator('.auth-how button').nth(1).click();
    await page.locator('#auth-login-email').fill('mei.ling@gmail.com');
    await page.locator('#auth-login-email').press('Enter');
    await page.locator('#auth-code').waitFor();
    await page.keyboard.type('48');
    assert.deepEqual(await fits(page), { wide: false, cut: [] }, `${language}: the code fits`);
    await shoot(page, `small-${language}-code`);
    await page.close();
  }
  passed('On a 360-pixel phone in English, Bahasa Indonesia, 中文 and Bahasa Melayu: nothing wider than the screen, the tabs, the two ways in and the six boxes fit');
  assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} login page browser checks passed`);
