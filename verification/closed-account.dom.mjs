// A closed account (its deletion is pending) signing in again (Alvin, 5 Nov 2026). Supabase
// refuses the locked login, so the page hands its proof to the closed-account screen, whose
// server checks it itself: Google's ID token and nonce in Sellio's Android app, or the emailed
// link's token (a sign-in link on Join, a reset-password link on Auth). Start again on Join
// then emails a new sign-up link to the same address.
// Run: node verification/closed-account.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Auth', pretendToBeVisual: true });
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

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-closed-account-'));
const locals = [];
async function bundle(entry, name, contents) {
  const plugin = { name: 'closed-account-fixtures', setup(builder) {
    for (const [filter, key] of [[/supabaseClient$/, 'clients'], [/AppUserContext$/, 'profile'], [/authNavigation$/, 'navigation'],
      [/AccountDeletionForm$/, 'deletion'], [/^sonner$/, 'toast'], [/^@capgo\/capacitor-social-login$/, 'social'], [/googleSignIn$/, 'google']]) {
      if (contents[key]) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    }
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: contents[args.path] }));
  } };
  const outfile = path.join(tmp, name + '.mjs');
  await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent' });
  const local = path.join(process.cwd(), `.closed-account-${name}.mjs`);
  await copyFile(outfile, local);
  locals.push(local);
  return import(pathToFileURL(local));
}

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
// The "Welcome back!" a sign-in leaves for the page it opens (src/lib/signInWelcome.js).
const WELCOME_KEY = 'sellio-sign-in-welcome';
const welcomeLeft = () => JSON.parse(sessionStorage.getItem(WELCOME_KEY) || 'null')?.message ?? null;
const wait = ms => act(async () => new Promise(resolve => setTimeout(resolve, ms)));
const click = element => act(async () => { assert.ok(element, 'Control exists'); element.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const buttonText = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const setValue = (input, value) => act(async () => {
  assert.ok(input, 'Input exists');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
});
// A page as the app shows it: inside the router (the closed screen links to the sign-up page).
async function mount(Page) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const pageRoot = createRoot(host);
  await act(async () => { pageRoot.render(React.createElement(MemoryRouter, null, React.createElement(Page))); });
  await wait(40);
  return { host, unmount: () => act(async () => pageRoot.unmount()) };
}

try {
  // 1. nativeGoogle.js: a locked login hands back Google's ID token and the raw nonce.
  globalThis.socialLogins = [];
  globalThis.idTokenReply = { data: null, error: { code: 'user_banned', message: 'User is banned' } };
  const native = await bundle('src/lib/nativeGoogle.js', 'native', {
    social: "export const SocialLogin = { initialize: async () => {}, logout: async () => {}, login: async (args) => { globalThis.socialLogins.push(args); return { result: { idToken: 'google-id-token' } }; } };",
    clients: "export const getSupabase = async () => ({ auth: { signInWithIdToken: async (args) => { globalThis.idTokenCalls = args; return globalThis.idTokenReply; } } }); export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
  });
  let closedError = null;
  try { await native.signInWithNativeGoogle(); } catch (error) { closedError = error; }
  assert.equal(closedError?.name, 'GoogleAccountClosed');
  assert.ok(closedError instanceof native.GoogleAccountClosed);
  assert.equal(closedError.idToken, 'google-id-token');
  assert.equal(globalThis.idTokenCalls.nonce, closedError.nonce, 'The same raw nonce Supabase was given');
  assert.equal(createHash('sha256').update(closedError.nonce).digest('hex'), globalThis.socialLogins[0].options.nonce,
    "Google was given the nonce's SHA-256, so the server can check the token against it");
  globalThis.idTokenReply = { data: null, error: { code: 'unexpected_failure', message: 'Database error' } };
  await assert.rejects(native.signInWithNativeGoogle(), { message: 'Google sign-in could not be completed. Please try again.' });
  globalThis.idTokenReply = { data: { session: { access_token: 'a' } }, error: null };
  assert.deepEqual(await native.signInWithNativeGoogle(), { access_token: 'a' });
  passed("Google in the app: a locked login hands back Google's ID token and the nonce; other failures and success as before");

  // 2. The sign-in page: Google in the app on a closed account opens the closed-account screen.
  let calls = [];
  let reply = () => ({ ok: false });
  globalThis.fetch = async (url, init) => {
    calls.push([/\/functions\/v1\/([a-z-]+)/.exec(url)?.[1], JSON.parse(init.body)]);
    return new Response(JSON.stringify(reply(JSON.parse(init.body))), { status: 200 });
  };
  globalThis.toastErrors = [];
  const { default: Auth } = await bundle('src/pages/Auth.jsx', 'auth', {
    clients: "export const getSupabase = async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }); export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser() {} });',
    navigation: 'export const completeAuthNavigation = () => {};',
    deletion: 'export const accountDeletionDestination = value => value;',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
    google: [
      "export const GOOGLE_WEB_CLIENT_ID = 'client';",
      'export const googleSignInAvailable = () => true;',
      "export const startGoogleSignIn = async () => { const e = new Error('This account is closed.'); e.name = 'GoogleAccountClosed'; e.idToken = 'tok'; e.nonce = 'raw-nonce'; throw e; };",
    ].join('\n'),
  });
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Auth)); });
  await wait(20);

  reply = () => ({ ok: true, closed: { kind: 'member', deleteAfter: '2026-12-05T09:00:00Z', shops: [] } });
  await click(buttonText(container, 'Sign in with Google'));
  await wait(30);
  assert.deepEqual(calls, [['closed-account', { action: 'status', googleIdToken: 'tok', nonce: 'raw-nonce' }]]);
  const screen = container.querySelector('[data-testid="closed-account"]');
  assert.ok(screen, 'The closed-account screen is shown');
  assert.match(screen.textContent, /It will be deleted for good on 5 December 2026\./);
  assert.doesNotMatch(screen.textContent, /is closed too/, 'No shop line for an account without a shop');
  assert.deepEqual(globalThis.toastErrors, []);

  calls = [];
  reply = () => ({ ok: true, kind: 'restored' });
  await click(buttonText(container, 'Keep my account'));
  await wait(20);
  assert.deepEqual(calls, [['closed-account', { googleIdToken: 'tok', nonce: 'raw-nonce', action: 'restore' }]]);
  assert.match(container.textContent, /Your account is open again/);
  assert.match(container.textContent, /It won’t be deleted\. You can use Sellio as before\./);
  await click(buttonText(container, 'Sign in'));
  passed('Google in the app on a closed account: the screen, from a status check with the token and nonce; Keep my account sends them again and opens it at once');

  calls = [];
  reply = () => ({ ok: false, code: 'not_closed' });
  await click(buttonText(container, 'Sign in with Google'));
  await wait(30);
  assert.equal(container.querySelector('[data-testid="closed-account"]'), null);
  assert.deepEqual(globalThis.toastErrors, ['This account is not closed any more. Please sign in again.']);
  assert.ok(buttonText(container, 'Sign in with Google') && !buttonText(container, 'Sign in with Google').disabled, 'The Google button works again');
  passed('Google in the app: an account that is no longer closed is told to sign in again');

  await act(async () => root.unmount());

  // 3. Join: an emailed sign-in link to a closed account (Alvin, 5 Nov 2026). Supabase refuses
  // it without using it up, so the same link opens the closed-account screen.
  const HASH = 'ab'.repeat(28);
  const CLOSED_OWNER = { kind: 'owner', deleteAfter: '2027-05-05T09:00:00Z', shops: ['Kopi Corner'] };
  let authCalls = [];
  let verifyReply = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };
  let otpReply = { data: {}, error: null };
  let accountStatus = null;
  globalThis.supabaseMock = {
    auth: {
      verifyOtp: async (args) => { authCalls.push(['verifyOtp', args]); return typeof verifyReply === 'function' ? verifyReply(args) : verifyReply; },
      getSession: async () => ({ data: { session: accountStatus ? { user: { id: 'u-1', email: accountStatus.email } } : null } }),
      signInWithOtp: async (args) => { authCalls.push(['signInWithOtp', args]); return otpReply; },
    },
    rpc: async (name) => { authCalls.push(['rpc', name]); return { data: accountStatus, error: null }; },
    from: () => {
      const query = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: 'u-1', email: accountStatus?.email }] }) };
      return query;
    },
  };
  globalThis.navigatedTo = null;
  const { default: Join } = await bundle('src/pages/Join.jsx', 'join', {
    clients: "export const getSupabase = async () => globalThis.supabaseMock; export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser() {} });',
    navigation: 'export const completeAuthNavigation = (to) => { globalThis.navigatedTo = to; };',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
    google: "export const GOOGLE_WEB_CLIENT_ID = 'client'; export const googleSignInAvailable = () => false; export const startGoogleSignIn = async () => ({});",
  });

  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  calls = [];
  globalThis.toastErrors = [];
  reply = (body) => (body.action === 'status' ? { ok: true, closed: CLOSED_OWNER, email: 'owner@kopi.sg' }
    : body.action === 'delete' ? { ok: true, kind: 'deleted' } : { ok: false });
  let page = await mount(Join);
  assert.deepEqual(authCalls, [['verifyOtp', { token_hash: HASH, type: 'magiclink' }]]);
  assert.deepEqual(calls, [['closed-account', { action: 'status', emailTokenHash: HASH, emailLinkType: 'magiclink' }]]);
  assert.equal(window.location.search, '', 'The link is taken out of the address bar');
  let screen2 = page.host.querySelector('[data-testid="closed-account"]');
  assert.ok(screen2, 'The closed-account screen is shown');
  assert.match(screen2.textContent, /This account is closed/);
  assert.match(screen2.textContent, /It will be deleted for good on 5 May 2027\./);
  assert.match(screen2.textContent, /Kopi Corner is closed too: its page shows “Store unavailable”, it takes no orders/);
  assert.ok(buttonText(page.host, 'Keep my account') && buttonText(page.host, 'Start again'));
  assert.doesNotMatch(page.host.textContent, /By continuing, you agree/);
  passed('Join: a sign-in link to a closed account opens the closed screen (Store unavailable, Keep my account, Start again)');

  await click(buttonText(page.host, 'Start again'));
  assert.ok(buttonText(page.host, 'Delete for good').disabled, 'Delete for good waits for DELETE');
  await setValue(page.host.querySelector('#closed-account-confirmation'), 'DELETE');
  calls = [];
  await click(buttonText(page.host, 'Delete for good'));
  await wait(20);
  assert.deepEqual(calls, [['closed-account', { emailTokenHash: HASH, emailLinkType: 'magiclink', action: 'delete', confirmation: 'DELETE' }]]);
  assert.match(page.host.textContent, /Your account has been deleted/);
  assert.match(page.host.textContent, /Kopi Corner and its staff logins have been deleted too\./);
  assert.match(page.host.textContent, /You can sign up again with owner@kopi\.sg now, and open a new shop\./);
  authCalls = [];
  await click(buttonText(page.host, 'Sign up again'));
  await wait(20);
  assert.deepEqual(authCalls, [['signInWithOtp', { email: 'owner@kopi.sg', options: { emailRedirectTo: 'https://sellio.sg/Join', shouldCreateUser: true } }]]);
  assert.match(page.host.textContent, /Check your email/);
  assert.match(page.host.textContent, /We sent a verification email to owner@kopi\.sg/);
  assert.match(page.host.textContent, /Tap Verify my email in the newest email from Sellio, on this device, to continue\./);
  assert.deepEqual(globalThis.toastErrors, []);
  await page.unmount();
  passed('Join: Start again deletes it with the same link, then Sign up again emails a new sign-up link to the same address');

  // Keep my account from the link: it opens again at once, and Continue signs in with the same
  // link (Supabase didn't use it up while the account was closed), into the shop's dashboard.
  // A fresh copy of the page, as the link opens it: a new page load (the app loads the link's
  // address in full; a browser opens it in a new tab), without the Back steps of earlier screens.
  const { default: JoinAgain } = await bundle('src/pages/Join.jsx', 'join-keep', {
    clients: "export const getSupabase = async () => globalThis.supabaseMock; export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser() {} });',
    navigation: 'export const completeAuthNavigation = (to) => { globalThis.navigatedTo = to; };',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
    google: "export const GOOGLE_WEB_CLIENT_ID = 'client'; export const googleSignInAvailable = () => false; export const startGoogleSignIn = async () => ({});",
  });
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  verifyReply = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };
  accountStatus = null;
  globalThis.navigatedTo = null;
  reply = (body) => (body.action === 'status' ? { ok: true, closed: CLOSED_OWNER, email: 'owner@kopi.sg' } : body.action === 'restore' ? { ok: true, kind: 'restored' } : { ok: false });
  page = await mount(JoinAgain);
  calls = [];
  authCalls = [];
  await click(buttonText(page.host, 'Keep my account'));
  await wait(20);
  assert.deepEqual(calls, [['closed-account', { emailTokenHash: HASH, emailLinkType: 'magiclink', action: 'restore' }]]);
  assert.match(page.host.textContent, /Your account is open again/);
  assert.match(page.host.textContent, /Kopi Corner is open again: its page is back, it takes orders and its staff can sign in\./);
  verifyReply = { data: {}, error: null };
  accountStatus = { email: 'owner@kopi.sg', placeholder_email: false, email_proven: true, setup_done: true, profile: null,
    store: { tenant_id: 'shop-1', name: 'Kopi Corner', slug: 'kopi-corner', seller_type: 'individual', is_owner: true } };
  sessionStorage.removeItem(WELCOME_KEY);
  await click(buttonText(page.host, 'Continue'));
  await wait(30);
  assert.deepEqual(authCalls.slice(0, 2), [['verifyOtp', { token_hash: HASH, type: 'magiclink' }], ['rpc', 'my_account_status']]);
  assert.equal(globalThis.navigatedTo, '/Dashboard', 'Straight into their shop');
  assert.equal(welcomeLeft(), 'Welcome back!', 'and the shop says Welcome back!');
  assert.deepEqual(globalThis.toastErrors, []);
  await page.unmount();
  passed('Join: Keep my account opens it at once; Continue signs in with the same link and goes to the shop');
  verifyReply = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };
  accountStatus = null;

  // An expired or used link to a closed account, and older links that went through Supabase.
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  reply = () => ({ ok: false, code: 'link_invalid' });
  authCalls = [];
  page = await mount(Join);
  assert.equal(page.host.querySelector('[data-testid="closed-account"]'), null);
  assert.match(page.host.textContent, /This link has expired or was already used\. Ask for a new one\./);
  assert.ok(page.host.querySelector('#join-email'), 'The email form is shown');
  assert.ok(buttonText(page.host, 'Send verification email'), 'The button says what it does');
  await page.unmount();
  // A closed-account server from before email links answers as for phone sign-in ('invalid').
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  reply = () => ({ ok: false, code: 'invalid' });
  page = await mount(Join);
  assert.match(page.host.textContent, /This link has expired or was already used\. Ask for a new one\./);
  assert.doesNotMatch(page.host.textContent, /Phone number or password/);
  await page.unmount();

  dom.reconfigure({ url: 'https://sellio.sg/Join#error=access_denied&error_code=user_banned&error_description=User+is+banned' });
  calls = [];
  authCalls = [];
  page = await mount(Join);
  assert.deepEqual(calls, [], 'No proof to send');
  assert.deepEqual(authCalls, []);
  assert.match(page.host.textContent, /This account is closed\. To keep it, or to delete it and start again, send a new verification email and open its link\./);
  await page.unmount();
  passed('Join: an expired link says so; an older link to a closed account asks for a new link');

  // A link to an open account still signs in, as before (no closed-account call).
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  verifyReply = { data: {}, error: null };
  accountStatus = { email: 'new@kopi.sg', placeholder_email: false, email_proven: true, setup_done: false, profile: null, store: null };
  calls = [];
  authCalls = [];
  sessionStorage.removeItem(WELCOME_KEY);
  page = await mount(Join);
  assert.deepEqual(calls, []);
  assert.deepEqual(authCalls.map(c => c[0]), ['verifyOtp', 'rpc']);
  assert.match(page.host.textContent, /Set up your account/);
  assert.match(page.host.textContent, /new@kopi\.sg/);
  assert.equal(welcomeLeft(), null, 'A new account is not "back"');
  await page.unmount();
  // The page took the link out of its address: open it again, as a tapped link does.
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  accountStatus = { email: 'shop@kopi.sg', placeholder_email: false, email_proven: true, setup_done: true, profile: null, store: null };
  page = await mount(Join);
  assert.equal(globalThis.navigatedTo, '/Account', 'A finished account without a shop goes to Account (open a shop)');
  assert.equal(welcomeLeft(), 'Welcome back!', 'Signed in by the link: the page it opens says Welcome back!');
  await page.unmount();
  // A new account here for its business invite goes to Account too, but isn't welcomed back.
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  sessionStorage.removeItem(WELCOME_KEY);
  globalThis.navigatedTo = null;
  accountStatus = { email: 'invited@kopi.sg', placeholder_email: false, email_proven: true, setup_done: false, business_invite: true, profile: null, store: null };
  page = await mount(Join);
  assert.equal(globalThis.navigatedTo, '/Account');
  assert.equal(welcomeLeft(), null);
  await page.unmount();
  // Already signed in (no link): sent on, with no Welcome back!.
  dom.reconfigure({ url: 'https://sellio.sg/Join' });
  globalThis.navigatedTo = null;
  accountStatus = { email: 'owner@kopi.sg', placeholder_email: false, email_proven: true, setup_done: true, profile: null,
    store: { tenant_id: 'shop-1', name: 'Kopi Corner', slug: 'kopi-corner', seller_type: 'individual', is_owner: true } };
  page = await mount(Join);
  assert.equal(globalThis.navigatedTo, '/Dashboard');
  assert.equal(welcomeLeft(), null, 'Not a new sign-in');
  await page.unmount();
  passed('Join: a link to an open account signs in as before (new: set up; set up without a shop: Account), welcoming back only existing accounts');

  // Old and mismatched links (Alvin's test, 6 Nov 2026: Gmail grouped the verification emails
  // into one conversation, an older link was tapped, and the page then took five refused
  // "Send verification email" taps before a new email replaced the one that worked).
  const { default: JoinLinks } = await bundle('src/pages/Join.jsx', 'join-links', {
    clients: "export const getSupabase = async () => globalThis.supabaseMock; export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser() {} });',
    navigation: 'export const completeAuthNavigation = (to) => { globalThis.navigatedTo = to; };',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
    google: "export const GOOGLE_WEB_CLIENT_ID = 'client'; export const googleSignInAvailable = () => false; export const startGoogleSignIn = async () => ({});",
  });
  const EXPIRED = { data: {}, error: { code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 } };
  const BANNED = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };

  // A link marked with the other kind (an email template with the other file pasted in) still
  // signs in, as 'email', which takes either kind; to a closed account it opens the closed screen.
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=signup` });
  verifyReply = (args) => (args.type === 'email' ? { data: {}, error: null } : EXPIRED);
  accountStatus = { email: 'new@kopi.sg', placeholder_email: false, email_proven: true, setup_done: false, profile: null, store: null };
  calls = [];
  authCalls = [];
  globalThis.toastErrors = [];
  page = await mount(JoinLinks);
  assert.deepEqual(authCalls, [['verifyOtp', { token_hash: HASH, type: 'signup' }], ['verifyOtp', { token_hash: HASH, type: 'email' }], ['rpc', 'my_account_status']]);
  assert.match(page.host.textContent, /Set up your account/);
  await page.unmount();
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  verifyReply = (args) => (args.type === 'email' ? BANNED : EXPIRED);
  accountStatus = null;
  reply = (body) => (body.action === 'status' ? { ok: true, closed: CLOSED_OWNER, email: 'owner@kopi.sg' } : { ok: false });
  page = await mount(JoinLinks);
  assert.deepEqual(calls, [['closed-account', { action: 'status', emailTokenHash: HASH, emailLinkType: 'email' }]]);
  assert.ok(page.host.querySelector('[data-testid="closed-account"]'), 'The closed-account screen is shown');
  await page.unmount();
  passed('Join: a link marked with the other kind still signs in (as email), or opens the closed screen');

  // A link Supabase doesn't know (expired, used, or replaced by a newer email): open the newest
  // email, or send a new one.
  dom.reconfigure({ url: `https://sellio.sg/Join?token_hash=${HASH}&type=magiclink` });
  verifyReply = EXPIRED;
  calls = [];
  authCalls = [];
  page = await mount(JoinLinks);
  assert.deepEqual(authCalls, [['verifyOtp', { token_hash: HASH, type: 'magiclink' }], ['verifyOtp', { token_hash: HASH, type: 'email' }]]);
  assert.deepEqual(calls, [], 'Only a locked login asks the closed-account server');
  assert.equal(window.location.search, '', 'The link is taken out of the address bar');
  assert.match(page.host.textContent, /This link no longer works: it has expired, or a newer verification email replaced it\. Open the newest email from Sellio, or send a new one below\./);
  assert.ok(page.host.querySelector('#join-email'), 'The email form is shown');

  // Sending again within the minute: Supabase sends nothing (the last email's link is the one
  // that works), so the page says so and counts down instead of an error.
  otpReply = { data: {}, error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 13 seconds.', status: 429 } };
  await setValue(page.host.querySelector('#join-email'), ' Me@Kopi.sg ');
  authCalls = [];
  await act(async () => { page.host.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); });
  await wait(20);
  assert.deepEqual(authCalls, [['signInWithOtp', { email: 'me@kopi.sg', options: { emailRedirectTo: 'https://sellio.sg/Join', shouldCreateUser: true } }]]);
  assert.deepEqual(globalThis.toastErrors, []);
  assert.match(page.host.textContent, /Check your email/);
  assert.match(page.host.textContent, /We sent a verification email to me@kopi\.sg/);
  assert.match(page.host.textContent, /No new email was sent: one went to this address less than a minute ago\. Open the newest email from Sellio\./);
  assert.ok(buttonText(page.host, 'Resend in 13s')?.disabled, 'Resend waits out the time Supabase gave');

  // Sellio's limit on all emails in an hour is a different answer: an error, as before.
  await click(buttonText(page.host, 'Use a different email'));
  otpReply = { data: {}, error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 } };
  await act(async () => { page.host.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); });
  await wait(20);
  assert.deepEqual(globalThis.toastErrors, ['We’re sending a lot of emails right now. Please try again in a few minutes.']);
  assert.ok(page.host.querySelector('#join-email'), 'Still on the email form');
  await page.unmount();
  otpReply = { data: {}, error: null };
  verifyReply = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };
  passed('Join: an old link says to open the newest email; sending again within the minute counts down instead of an error');

  // 4. A reset-password link (forgot password) to a closed account opens the same screen.
  const { default: AuthAgain } = await bundle('src/pages/Auth.jsx', 'auth-recovery', {
    clients: "export const getSupabase = async () => globalThis.supabaseMock; export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
    profile: 'export const useAppUser = () => ({ setAppUser() {} });',
    navigation: 'export const completeAuthNavigation = () => {};',
    deletion: 'export const accountDeletionDestination = value => value;',
    toast: 'export const toast = { error: value => { globalThis.toastErrors.push(value); }, success() {}, custom() {} };',
    google: "export const GOOGLE_WEB_CLIENT_ID = 'client'; export const googleSignInAvailable = () => true; export const startGoogleSignIn = async () => ({});",
  });
  dom.reconfigure({ url: `https://sellio.sg/Auth?type=recovery&token_hash=${HASH}` });
  verifyReply = { data: {}, error: { code: 'user_banned', message: 'User is banned', status: 403 } };
  accountStatus = null;
  calls = [];
  authCalls = [];
  globalThis.toastErrors = [];
  reply = () => ({ ok: true, closed: { kind: 'member', deleteAfter: '2026-12-05T09:00:00Z', shops: [] }, email: 'me@kopi.sg' });
  page = await mount(AuthAgain);
  assert.deepEqual(authCalls, [['verifyOtp', { token_hash: HASH, type: 'recovery' }]]);
  assert.deepEqual(calls, [['closed-account', { action: 'status', emailTokenHash: HASH, emailLinkType: 'recovery' }]]);
  screen2 = page.host.querySelector('[data-testid="closed-account"]');
  assert.ok(screen2, 'The closed-account screen is shown');
  assert.match(screen2.textContent, /It will be deleted for good on 5 December 2026\./);
  assert.deepEqual(globalThis.toastErrors, []);
  await page.unmount();

  dom.reconfigure({ url: `https://sellio.sg/Auth?type=recovery&token_hash=${HASH}` });
  verifyReply = { data: {}, error: { code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 } };
  calls = [];
  page = await mount(AuthAgain);
  assert.deepEqual(calls, [], 'Only a locked login asks the closed-account server');
  assert.equal(page.host.querySelector('[data-testid="closed-account"]'), null);
  assert.deepEqual(globalThis.toastErrors, ['This reset link has expired or was already used. Please request a new one.']);
  await page.unmount();
  passed('A reset-password link to a closed account opens the closed screen; an expired one says so, as before');

  console.log(passes + ' closed-account checks passed');
} finally {
  for (const local of locals) await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
