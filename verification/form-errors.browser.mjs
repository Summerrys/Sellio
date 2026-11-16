// Form problems on the form (UX state 9), in Chrome as a phone, on the real sign-in pages:
// Log in (empty fields, a wrong number or password, a locked number), Forgot password (a number
// with no account, new passwords that don't match), the business sign-up (a bad number), and
// the free sign-up (a bad email; every field at once; a number another account has). Each
// says what's wrong under its field (the field red and focused) or, when it's no field's,
// above the button; no pop-ups.
//
//   node verification/form-errors.browser.mjs <folder with playwright(-core)> [screenshot folder] [before]
// With "before" it shows the pages as they were (src/pages/Auth.jsx and Join.jsx from git's
// HEAD) for screenshots, and checks nothing.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const shots = process.argv[3] || '';
const before = process.argv[4] === 'before';
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
    signUp: async (body) => { window.__calls.push(['signUp', body]); return window.__signUp || { data: {}, error: null }; },
    signInWithOtp: async (body) => { window.__calls.push(['signInWithOtp', body]); return { data: {}, error: window.__otpError || null }; },
    updateUser: async () => ({ data: {}, error: window.__updateUserError || null }),
    verifyOtp: async () => ({ data: {}, error: null }),
    setSession: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
  rpc: (name, args) => {
    window.__calls.push(['rpc', name, args]);
    if (name === 'get_invite_by_token') return chain({ data: window.__invite || null, error: null });
    if (name === 'my_account_status') return chain({ data: window.__status || null, error: null });
    if (name === 'complete_account_setup') return chain({ data: null, error: window.__setupError || null });
    return chain({ data: null, error: null });
  },
  from: () => chain({ data: [], error: null }),
  functions: { invoke: async () => ({ data: null, error: null }) },
};

const screen = location.pathname.toLowerCase().startsWith('/join') ? <Join /> : <Auth />;
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    {screen}
    <Toaster />
  </BrowserRouter>,
);
`;

const temporary = await mkdtemp(path.join(app, '.form-errors-browser-'));
const copies = [];
const browser = await chromium.launch({ executablePath, headless: true });
try {
  let authFile = 'Auth';
  let joinFile = 'Join';
  if (before) {
    // The pages as they are in git (before these changes), next to the real ones so their
    // own imports work.
    for (const [name, file] of [['Auth', 'AuthBefore'], ['Join', 'JoinBefore']]) {
      const text = execFileSync('git', ['show', `HEAD:src/pages/${name}.jsx`], { cwd: app, encoding: 'utf8', maxBuffer: 1 << 26 });
      const target = path.join(app, 'src/pages', `${file}.jsx`);
      await writeFile(target, text);
      copies.push(target);
    }
    authFile = 'AuthBefore';
    joinFile = 'JoinBefore';
  }
  const entry = path.join(temporary, 'page.jsx');
  await writeFile(entry, PAGE.replace('AUTH_FILE', authFile).replace('JOIN_FILE', joinFile));
  const stub = (name, contents) => ({ name, contents });
  const stubs = [
    [/supabaseClient$/, stub('client', 'export const getSupabase = async () => window.__client; export const getMobileOAuthClient = () => window.__client; export const SUPABASE_URL = "https://x.invalid"; export const supabase = window.__client;')],
    [/base44Client$/, stub('base44', 'export const base44 = { auth: {}, entities: {} };')],
    [/AppUserContext$/, stub('profile', 'import React from "react"; const C = React.createContext(null); export default C; export const AppUserContext = C; export function useAppUser() { return { appUser: null, setAppUser: (u) => { window.__calls.push(["setAppUser", u]); }, loading: false }; } export const AppUserProvider = ({ children }) => children; export const cookieUtils = { get: () => null, set() {}, remove() {} };')],
    [/lib\/phoneAuth(\.js)?$/, stub('phone', 'export async function callPhoneAuth(body) { window.__calls.push(["phone-auth", body]); return window.__phoneAuth ? window.__phoneAuth(body) : null; }')],
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
  const shoot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${before ? 'before' : 'after'}-${name}.png`) }); };
  const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, selector);
  const invalid = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-invalid'), selector);
  const focused = (page) => page.evaluate(() => document.activeElement?.id || null);
  const calls = (page, kind) => page.evaluate((k) => window.__calls.filter((c) => c[0] === k), kind);
  const check = (fn) => { if (!before) fn(); };

  // ── Log in ──────────────────────────────────────────────────────────────────────────────
  {
    const page = await open('/Auth');
    await page.getByRole('button', { name: 'Login', exact: true }).last().waitFor();
    await page.locator('form.auth-fields button[type="submit"]').click();
    await page.waitForTimeout(400);
    await shoot(page, '1-login-empty');
    check(async () => {});
    if (!before) {
      assert.equal(await text(page, '#auth-phone-error'), 'Please enter your mobile number.');
      assert.equal(await text(page, '#auth-password-error'), 'Please enter your password.');
      assert.equal(await focused(page), 'auth-phone', 'the first field with a problem has the focus');
      assert.deepEqual(await calls(page, 'phone-auth'), [], 'nothing is sent');
      passed('Log in, nothing typed: both fields say so (no browser bubble), the phone number focused, nothing sent');
    }

    await page.locator('form.auth-fields input[type="tel"]').fill('91234567');
    await page.locator('form.auth-fields input[type="password"]').fill('wrong-password');
    await page.evaluate(() => { window.__phoneAuth = () => ({ ok: false, code: 'invalid' }); });
    await page.locator('form.auth-fields button[type="submit"]').click();
    await page.waitForTimeout(600);
    await shoot(page, '2-login-wrong');
    if (!before) {
      assert.equal(await text(page, '#auth-password-error'), 'Phone number or password is incorrect.');
      assert.equal(await invalid(page, '#auth-phone'), 'true', 'the number is marked too');
      assert.equal(await invalid(page, '#auth-password'), 'true');
      assert.equal(await focused(page), 'auth-password', 'the password is the one to type again');
      assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'no pop-up');
      await page.locator('#auth-password').fill('right-password');
      assert.equal(await invalid(page, '#auth-phone'), null, 'typing again takes both marks off');
      assert.equal(await text(page, '#auth-password-error'), null);
      passed('Log in, wrong number or password: said under the password, both fields marked, no pop-up; typing takes the marks off');
    }

    await page.evaluate(() => { window.__phoneAuth = () => ({ ok: false, code: 'locked', retry_after_minutes: 15 }); });
    await page.locator('form.auth-fields button[type="submit"]').click();
    await page.waitForTimeout(500);
    if (!before) {
      assert.equal(await text(page, '[data-form-error]'), 'Too many wrong passwords for this number. Try again in 15 minutes, or reset your password.');
      assert.equal(await invalid(page, '#auth-password'), null, 'not a field\'s fault');
      await shoot(page, '3-login-locked');
      passed('Log in, locked number: said above Login, no field marked');
    }

    // Forgot password: a number with no account.
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.locator('#forgot-phone, input[type="tel"]').first().fill('81234567');
    await page.evaluate(() => { window.__phoneAuth = () => ({ ok: false, code: 'not_found' }); });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(500);
    await shoot(page, '4-forgot-unknown');
    if (!before) {
      assert.equal(await text(page, '#forgot-phone-error'), 'No account found for this phone number.');
      assert.equal(await invalid(page, '#forgot-phone'), 'true');
      assert.equal(await focused(page), 'forgot-phone');
      passed('Forgot password, a number with no account: said under the number');
    }
    await page.close();
  }

  if (before) {
    // A locked number, on its own page (so the earlier pop-ups aren't in the picture).
    const page = await open('/Auth');
    await page.getByRole('button', { name: 'Login', exact: true }).last().waitFor();
    await page.locator('form.auth-fields input[type="tel"]').fill('91234567');
    await page.locator('form.auth-fields input[type="password"]').fill('sellio123');
    await page.evaluate(() => { window.__phoneAuth = () => ({ ok: false, code: 'locked', retry_after_minutes: 15 }); });
    await page.locator('form.auth-fields button[type="submit"]').click();
    await page.waitForTimeout(600);
    await shoot(page, '3-login-locked');
    await page.close();
  }

  // ── Forgot password, the new password (opened from the reset email) ──────────────────────
  {
    const page = await open('/Auth?type=recovery');
    await page.getByRole('button', { name: 'Set New Password' }).waitFor();
    const fields = page.locator('input[type="password"]');
    await fields.nth(0).fill('sellio1');
    await fields.nth(1).fill('sellio2');
    await page.getByRole('button', { name: 'Set New Password' }).click();
    await page.waitForTimeout(400);
    await shoot(page, '5-new-password');
    if (!before) {
      assert.equal(await text(page, '#forgot-confirm-error'), 'The passwords don’t match.');
      assert.equal(await focused(page), 'forgot-confirm');
      await fields.nth(0).fill('abc');
      await fields.nth(1).fill('abc');
      await page.getByRole('button', { name: 'Set New Password' }).click();
      await page.waitForTimeout(300);
      assert.equal(await text(page, '#forgot-password-error'), 'Please choose a password of at least 6 characters.');
      assert.equal(await text(page, '#forgot-confirm-error'), null);
      passed('New password: too short or not matching, said under the field it\'s about');
    }
    await page.close();
  }

  // ── The business sign-up (from a paid plan's invite) ─────────────────────────────────────
  {
    const page = await open('/Auth?token=tok-1', `window.__invite = { status: 'pending', email: 'owner@kopi.sg', full_name: 'Tan Ah Huat', phone: '+65912' };`);
    await page.getByRole('button', { name: 'Sign Up', exact: true }).last().waitFor({ timeout: 10000 });
    await page.locator('form.auth-fields button[type="submit"]').click();
    await page.waitForTimeout(400);
    await shoot(page, '6-business-signup');
    if (!before) {
      assert.equal(await text(page, '#auth-phone-error'), 'Please enter a valid SG mobile number (8 digits, starting with 8 or 9).');
      assert.equal(await text(page, '#auth-password-error'), 'Please choose a password of at least 6 characters.');
      assert.equal(await focused(page), 'auth-phone');
      assert.deepEqual(await calls(page, 'signUp'), [], 'nothing is sent');
      // The email already has an account: said under the email.
      await page.locator('#auth-phone').fill('91234567');
      await page.locator('#auth-password').fill('sellio123');
      await page.evaluate(() => { window.__signUp = { data: {}, error: { message: 'User already registered', code: 'user_already_exists' } }; });
      await page.locator('form.auth-fields button[type="submit"]').click();
      await page.waitForTimeout(500);
      assert.equal(await text(page, '#auth-email-error'), 'This email already has a Sellio account. Log in instead.');
      passed('Business sign-up: a bad number and a short password on their fields, nothing sent; an email with an account, under the email');
    }
    await page.close();
  }

  // ── The free sign-up ─────────────────────────────────────────────────────────────────────
  {
    const page = await open('/Join');
    await page.locator('#join-email').waitFor();
    await page.locator('#join-email').fill('me@kopi');
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await page.waitForTimeout(400);
    await shoot(page, '7-join-email');
    if (!before) {
      assert.equal(await text(page, '#join-email-error'), 'Please enter a valid email address.');
      assert.equal(await invalid(page, '#join-email'), 'true');
      assert.deepEqual(await calls(page, 'signInWithOtp'), [], 'nothing is sent');
      await page.locator('#join-email').fill('kopi@sellio.app');
      await page.getByRole('button', { name: 'Send verification email' }).click();
      await page.waitForTimeout(300);
      assert.equal(await text(page, '#join-email-error'), 'That’s a staff login. Staff sign in with their phone number on the login page.');
      passed('Free sign-up, the email: not an email, or a staff login, said under it, nothing sent');
    }
    await page.close();
  }
  {
    const page = await open('/Join', `window.__session = { user: { id: 'u1', email: 'me@kopi.sg' } }; window.__status = { email: 'me@kopi.sg', email_proven: true, setup_done: false, profile: {} };`);
    await page.locator('#join-name').waitFor({ timeout: 10000 });
    await page.locator('#join-phone').fill('1234');
    await page.locator('#join-password').fill('abc');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(500);
    await shoot(page, '8-join-finish');
    if (!before) {
      assert.equal(await text(page, '#join-name-error'), 'Please enter your name.');
      assert.equal(await text(page, '#join-phone-error'), 'Please enter a valid SG mobile number (8 digits, starting with 8 or 9).');
      assert.equal(await text(page, '#join-password-error'), 'Please choose a password of at least 6 characters.');
      assert.equal(await focused(page), 'join-name', 'every problem at once, the first focused');
      assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'no pop-up');
      await page.locator('#join-name').fill('Mei Ling');
      assert.equal(await text(page, '#join-name-error'), null, 'typing takes that field\'s mark off');
      assert.equal(await text(page, '#join-phone-error'), 'Please enter a valid SG mobile number (8 digits, starting with 8 or 9).', 'the others stay');
      // Another account has the number: said under it.
      await page.locator('#join-phone').fill('91234567');
      await page.locator('#join-password').fill('sellio123');
      await page.locator('#join-confirm').fill('sellio124');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForTimeout(300);
      assert.equal(await text(page, '#join-confirm-error'), 'The passwords don’t match.');
      await page.locator('#join-confirm').fill('sellio123');
      await page.evaluate(() => { window.__setupError = { message: 'phone taken', hint: 'phone_taken', code: 'P0001' }; });
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForTimeout(500);
      assert.match(await text(page, '#join-phone-error'), /This phone number is already used by another Sellio account/);
      assert.equal(await focused(page), 'join-phone');
      const link = await page.evaluate(() => { const a = document.querySelector('#join-phone-error a'); return a && [a.getAttribute('href'), a.textContent]; });
      assert.deepEqual(link, ['mailto:sellio@apptelier.sg', 'sellio@apptelier.sg'], 'the email address is a link to write to us');
      assert.equal(await page.locator('text=You’ll log in with this mobile number and password.').count(), 0, 'no "you’ll log in with" line (Google sign-ups too)');
      await shoot(page, '9-join-taken');
      passed('Free sign-up, the last step: every problem at once on its field (first focused), passwords that don\'t match, a number another account has (its email address a link)');
    }
    await page.close();
  }
  if (before) {
    // A number another account has: what the last step of the free sign-up showed.
    const page = await open('/Join', `window.__session = { user: { id: 'u1', email: 'me@kopi.sg' } }; window.__status = { email: 'me@kopi.sg', email_proven: true, setup_done: false, profile: {} }; window.__setupError = { message: 'phone taken', hint: 'phone_taken', code: 'P0001' };`);
    await page.locator('#join-name').waitFor({ timeout: 10000 });
    await page.locator('#join-name').fill('Mei Ling');
    await page.locator('#join-phone').fill('91234567');
    await page.locator('input[type="password"]').nth(0).fill('sellio123');
    await page.locator('input[type="password"]').nth(1).fill('sellio123');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(800);
    await shoot(page, '9-join-taken');
    await page.close();
  }
  if (!before) assert.deepEqual(errors, [], 'no errors on the pages');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
  for (const file of copies) await rm(file, { force: true });
}
console.log(before ? '\nbefore screenshots taken' : `\n${passes} form problem browser checks passed`);
