// A closed account (its deletion is pending) signing in with Google in Sellio's Android app
// (Alvin, 5 Nov 2026): Supabase refuses the locked login, so the app hands Google's ID token
// and the raw nonce to the closed-account screen, whose server checks them itself.
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
const wait = ms => act(async () => new Promise(resolve => setTimeout(resolve, ms)));
const click = element => act(async () => { assert.ok(element, 'Control exists'); element.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
const buttonText = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);

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

  reply = () => ({ ok: true, closed: { kind: 'member', deleteAfter: '2026-12-05T09:00:00Z', shops: [], restoreAsked: false } });
  await click(buttonText(container, 'Sign in with Google'));
  await wait(30);
  assert.deepEqual(calls, [['closed-account', { action: 'status', googleIdToken: 'tok', nonce: 'raw-nonce' }]]);
  const screen = container.querySelector('[data-testid="closed-account"]');
  assert.ok(screen, 'The closed-account screen is shown');
  assert.match(screen.textContent, /It will be deleted for good on 5 December 2026\./);
  assert.doesNotMatch(screen.textContent, /is closed too/, 'No shop line for an account without a shop');
  assert.deepEqual(globalThis.toastErrors, []);

  calls = [];
  reply = () => ({ ok: true, kind: 'restore_asked', alreadyAsked: true });
  await click(buttonText(container, 'Keep my account'));
  await wait(20);
  assert.deepEqual(calls, [['closed-account', { googleIdToken: 'tok', nonce: 'raw-nonce', action: 'restore' }]]);
  assert.match(container.textContent, /We've asked Sellio to restore your account/);
  await click(buttonText(container, 'Back to sign in'));
  passed('Google in the app on a closed account: the screen, from a status check with the token and nonce; Keep my account sends them again');

  calls = [];
  reply = () => ({ ok: false, code: 'not_closed' });
  await click(buttonText(container, 'Sign in with Google'));
  await wait(30);
  assert.equal(container.querySelector('[data-testid="closed-account"]'), null);
  assert.deepEqual(globalThis.toastErrors, ['This account is not closed any more. Please sign in again.']);
  assert.ok(buttonText(container, 'Sign in with Google') && !buttonText(container, 'Sign in with Google').disabled, 'The Google button works again');
  passed('Google in the app: an account that is no longer closed is told to sign in again');

  await act(async () => root.unmount());
  console.log(passes + ' closed-account checks passed');
} finally {
  for (const local of locals) await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
