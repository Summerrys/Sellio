// Phone sign-in and forgot password go through the phone-auth server function, so the
// sign-in page never sees an account's email address.
// Run: node verification/phone-signin.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.apptelier.sg/Auth', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document','Element','HTMLElement','HTMLInputElement','DocumentFragment','Node','Event',
  'MouseEvent','MutationObserver','sessionStorage','localStorage','navigator','getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-phone-signin-'));
const mock = { name: 'phone-signin-fixtures', setup(builder) {
  builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'clients', namespace: 'mock' }));
  builder.onResolve({ filter: /AppUserContext$/ }, () => ({ path: 'profile', namespace: 'mock' }));
  builder.onResolve({ filter: /authNavigation$/ }, () => ({ path: 'navigation', namespace: 'mock' }));
  builder.onResolve({ filter: /AccountDeletionForm$/ }, () => ({ path: 'deletion', namespace: 'mock' }));
  builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: {
    clients: "export const getSupabase = async () => globalThis.appClient; export const getMobileOAuthClient = () => globalThis.appClient; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser: user => { globalThis.profile = user; } });',
    navigation: 'export const completeAuthNavigation = value => { globalThis.authDestination = value; };',
    deletion: 'export const accountDeletionDestination = value => value;',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
  }[args.path] }));
} };
const outfile = path.join(tmp, 'auth.mjs');
await build({ entryPoints: ['src/pages/Auth.jsx'], outfile, bundle: true, packages: 'external', format: 'esm',
  platform: 'node', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent' });
const local = path.join(process.cwd(), '.phone-signin-auth.mjs');
await copyFile(outfile, local);
const { default: Auth } = await import(pathToFileURL(local));

const profileRow = { id: 'profile-fixture', email: 'owner@example.invalid', full_name: 'Owner', role: 'admin',
  onboarding_completed: true, tenant_id: 'tenant-fixture', phone: '+6591234567' };
let calls = [];
// The phone-auth function's reply for the next request: an object (sent as JSON), a
// string (sent as-is, e.g. a gateway error page) or an Error (the request fails).
let invokeReply = () => new Error('no reply set');
globalThis.fetch = async (url, init) => {
  calls.push(['request', url, init]);
  calls.push(['invoke', 'phone-auth', JSON.parse(init.body)]);
  const reply = invokeReply(JSON.parse(init.body));
  if (reply instanceof Error) throw reply;
  return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status: 200 });
};
const forbidden = what => async () => { calls.push(['forbidden', what]); throw new Error('The page must not ' + what); };
globalThis.appClient = {
  auth: {
    getSession: async () => ({ session: null }),
    setSession: async tokens => { calls.push(['setSession', tokens]); return { session: { user: { email: profileRow.email } } }; },
    signInWithPassword: forbidden('sign in with an email itself'),
    resetPasswordForEmail: forbidden('send reset emails itself'),
  },
  functions: { invoke: forbidden('use the library call, which needs a separate pre-check') },
  rpc: forbidden('look up an account by phone'),
  from: table => {
    const filters = [];
    const query = { select() { return query; }, eq(column, value) { filters.push([column, value]); return query; },
      limit: async () => { calls.push(['from', table, filters]); return { data: table === 'app_users' ? [profileRow] : [], error: null }; },
      update() { return query; }, then(resolve) { resolve({ error: null }); } };
    return query;
  },
};

const wait = ms => act(async () => new Promise(resolve => setTimeout(resolve, ms)));
const setValue = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
});
const click = element => act(async () => { assert.ok(element, 'Control exists'); element.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const submit = form => act(async () => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); });
const buttonText = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const reset = () => { calls = []; globalThis.toastErrors = []; globalThis.authDestination = undefined; globalThis.profile = undefined; };

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const container = document.createElement('div'); document.body.appendChild(container);
const root = createRoot(container);
try {
  reset();
  await act(async () => { root.render(React.createElement(Auth)); });
  await wait(20);
  const form = container.querySelector('form.auth-fields');
  assert.ok(form, 'Login form is shown');
  const phone = form.querySelector('input[type="tel"]');
  const password = form.querySelector('input[type="password"]');
  await setValue(phone, '091234567');
  await setValue(password, 'right-password');

  invokeReply = () => ({ ok: true, session: { access_token: 'access-fixture', refresh_token: 'refresh-fixture' } });
  await submit(form);
  await wait(30);
  assert.deepEqual(calls.find(c => c[0] === 'invoke'), ['invoke', 'phone-auth', { action: 'sign_in', phone: '+6591234567', password: 'right-password' }]);
  const [, signInUrl, signInInit] = calls.find(c => c[0] === 'request');
  assert.equal(signInUrl, 'https://project.example.invalid/functions/v1/phone-auth?forceFunctionRegion=ap-southeast-2', 'Runs in Sydney, next to the database');
  assert.equal(signInInit.method, 'POST');
  assert.deepEqual(signInInit.headers, { 'Content-Type': 'text/plain;charset=UTF-8' }, 'A plain request: no pre-check needed, no keys or tokens sent');
  assert.deepEqual(calls.find(c => c[0] === 'setSession'), ['setSession', { access_token: 'access-fixture', refresh_token: 'refresh-fixture' }]);
  assert.deepEqual(calls.find(c => c[0] === 'from' && c[1] === 'app_users'), ['from', 'app_users', [['phone', '+6591234567']]]);
  assert.equal(globalThis.profile?.tenant_id, 'tenant-fixture');
  assert.equal(globalThis.authDestination, '/explore', 'an owner starts on Explore (staff logins: their Dashboard)');
  assert.deepEqual(globalThis.toastErrors, []);
  assert.ok(!calls.some(c => c[0] === 'forbidden'));
  passed('Phone sign-in: one plain request to Sydney, sets the returned session, loads only the own profile, opens Explore with no pause');

  const refusals = [
    [{ ok: false, code: 'invalid' }, 'Phone number or password is incorrect.'],
    [{ ok: false, code: 'locked', retry_after_minutes: 15 }, 'Too many wrong passwords for this number. Try again in 15 minutes, or reset your password.'],
    [{ ok: false, code: 'too_many', retry_after_minutes: 1 }, 'Too many sign-in attempts from this network. Try again in 1 minute.'],
    [{ ok: false, code: 'busy' }, 'Sign-in is busy right now. Please try again in a minute.'],
    [{ ok: true }, 'Could not sign in right now. Please try again.'],
    [new TypeError('Failed to fetch'), 'Could not sign in right now. Please try again.'],
    ['<html>502 Bad Gateway</html>', 'Could not sign in right now. Please try again.'],
  ];
  for (const [reply, message] of refusals) {
    reset();
    invokeReply = () => reply;
    await submit(form);
    await wait(30);
    assert.deepEqual(globalThis.toastErrors, [message]);
    assert.ok(!calls.some(c => c[0] === 'setSession'), 'No session is set when sign-in is refused');
    assert.equal(globalThis.authDestination, undefined);
  }
  passed('Wrong number or password, the 15-minute lock, the network limit, no connection and gateway errors each show one clear message and never sign in');

  reset();
  await click(buttonText(container, 'Forgot password?'));
  let continueButton = buttonText(container, 'Continue');
  const forgotPhone = continueButton.parentElement.querySelector('input[type="tel"]');
  await setValue(forgotPhone, '81234567');
  invokeReply = () => ({ ok: true, kind: 'email', masked_email: 'ow•••@example.invalid', priority_support: true });
  await click(continueButton);
  await wait(20);
  assert.deepEqual(calls.find(c => c[0] === 'invoke'), ['invoke', 'phone-auth', { action: 'reset', phone: '+6581234567', redirect_to: 'https://sellio.apptelier.sg/Auth?type=recovery' }]);
  assert.equal(calls.find(c => c[0] === 'request')[1], 'https://project.example.invalid/functions/v1/phone-auth?forceFunctionRegion=ap-southeast-2', 'Forgot password runs in Sydney too');
  assert.deepEqual(calls.find(c => c[0] === 'request')[2].headers, { 'Content-Type': 'text/plain;charset=UTF-8' });
  assert.match(container.textContent, /Reset link sent!/);
  assert.match(container.textContent, /We sent it to ow•••@example\.invalid\. Check your email inbox/);
  const whatsapp = container.querySelector('a[href^="https://wa.me/6582228103"]');
  assert.ok(whatsapp && decodeURIComponent(whatsapp.href).includes('+6581234567'), 'Pro accounts keep WhatsApp priority support');
  assert.ok(!calls.some(c => c[0] === 'forbidden'));
  passed('Forgot password asks the server to send the link and shows only the masked address, with WhatsApp support for Pro');

  await click(buttonText(container, 'Back to Login'));
  await click(buttonText(container, 'Forgot password?'));
  const forgotCases = [
    [{ ok: true, kind: 'staff', priority_support: false }, 'Staff passwords are reset by the shop owner. Please ask your owner to reset yours.'],
    [{ ok: false, code: 'not_found' }, 'No account found for this phone number.'],
    [{ ok: false, code: 'too_many', retry_after_minutes: 42 }, 'Too many reset requests. Please try again in 42 minutes.'],
    [new TypeError('Failed to fetch'), 'Something went wrong. Please try again.'],
  ];
  for (const [reply, message] of forgotCases) {
    reset();
    continueButton = buttonText(container, 'Continue');
    await setValue(continueButton.parentElement.querySelector('input[type="tel"]'), '81234567');
    invokeReply = () => reply;
    await click(continueButton);
    await wait(20);
    assert.deepEqual(globalThis.toastErrors, [message]);
    assert.ok(buttonText(container, 'Continue'), 'Stays on the phone step');
    assert.doesNotMatch(container.textContent, /Reset link sent!/);
  }
  passed('Staff are told to ask their owner; unknown numbers, the reset limit and server failures show their messages');

  reset();
  invokeReply = () => ({ ok: true, kind: 'email', masked_email: 'ow•••@example.invalid', priority_support: false });
  continueButton = buttonText(container, 'Continue');
  await setValue(continueButton.parentElement.querySelector('input[type="tel"]'), '81234567');
  await click(continueButton);
  await wait(20);
  assert.match(container.textContent, /Reset link sent!/);
  assert.equal(container.querySelector('a[href^="https://wa.me/6582228103"]'), null);
  passed('Non-Pro accounts get the reset link without the WhatsApp line');

  console.log(passes + ' phone sign-in checks passed');
} finally {
  await act(async () => root.unmount());
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
