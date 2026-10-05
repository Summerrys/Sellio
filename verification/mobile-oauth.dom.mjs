// DOM-level transport tests. These do not claim to test Android intent delivery.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { webcrypto } from 'node:crypto';
import {
  CALLBACK_PARAM, COMPLETE_KEY, VERIFIER_KEY, createMobileAuthAttempt,
} from '../src/lib/mobileOAuth.js';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.apptelier.sg/Auth', pretendToBeVisual: true });
const win = dom.window;
const location = { origin: 'https://sellio.apptelier.sg', href: 'https://sellio.apptelier.sg/Auth',
  search: '', hash: '', pathname: '/Auth', assign: value => { location.assigned = value; },
  replace: value => { location.replaced = value; } };
const browser = new Proxy(win, { get(target, key) {
  if (key === 'location') return location;
  if (key === 'crypto') return webcrypto;
  return Reflect.get(target, key);
} });
for (const key of ['document','Element','HTMLElement','HTMLInputElement','DocumentFragment','Node','Event',
  'MouseEvent','MutationObserver','sessionStorage','localStorage','navigator','getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = browser;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(win.navigator, 'userAgent', { value: 'Android Chrome', configurable: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-oauth-dom-'));
const mock = { name: 'isolated-auth-clients', setup(builder) {
  builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'clients', namespace: 'mock' }));
  builder.onResolve({ filter: /AppUserContext$/ }, () => ({ path: 'profile', namespace: 'mock' }));
  builder.onResolve({ filter: /authNavigation$/ }, () => ({ path: 'navigation', namespace: 'mock' }));
  builder.onResolve({ filter: /AccountDeletionForm$/ }, () => ({ path: 'deletion', namespace: 'mock' }));
  builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: {
    clients: 'export const getSupabase = async () => { globalThis.clientReads++; return globalThis.appClient; }; export const getMobileOAuthClient = () => { globalThis.mobileReads++; return globalThis.oauthClient; };',
    profile: 'export const useAppUser = () => ({ setAppUser: user => { globalThis.profile = user; } });',
    navigation: 'export const completeAuthNavigation = value => { globalThis.authDestination = value; };',
    deletion: 'export const accountDeletionDestination = value => value;',
    toast: 'export const toast = { error: value => { globalThis.toastError = value; }, success() {}, custom() {} };',
  }[args.path] }));
} };
const load = async relative => {
  const outfile = path.join(tmp, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  await build({ entryPoints: [relative], outfile, bundle: true, packages: 'external', format: 'esm',
    platform: 'node', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent' });
  // External package resolution belongs to the app, not /tmp.
  const local = path.join(process.cwd(), '.oauth-dom-' + relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  const { copyFile } = await import('node:fs/promises');
  await copyFile(outfile, local);
  return { module: await import(pathToFileURL(local)), local };
};
const loaded = [];
const callbackModule = await load('src/components/auth/MobileOAuthReturn.jsx'); loaded.push(callbackModule.local);
const googleModule = await load('src/lib/googleSignIn.js'); loaded.push(googleModule.local);
const authModule = await load('src/pages/Auth.jsx'); loaded.push(authModule.local);
const splashModule = await load('src/pages/Splash.jsx'); loaded.push(splashModule.local);
const mount = async Component => {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Component)); });
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const reset = () => {
  win.localStorage.clear(); win.sessionStorage.clear();
  location.href = location.origin + '/Auth'; location.search = ''; location.hash = '';
  location.replaced = undefined; location.assigned = undefined;
  win.ReactNativeWebView = undefined;
  globalThis.clientReads = 0; globalThis.mobileReads = 0;
};
try {
  reset();
  const attempt = createMobileAuthAttempt(browser);
  win.localStorage.clear(); // Browser and app are separate storage contexts.
  location.href = attempt.redirectTo + '&code=browser-code';
  location.search = new URL(location.href).search;
  globalThis.appClient = globalThis.oauthClient = { auth: { getSession() { throw new Error('Browser must never consume login'); } } };
  const outside = await mount(callbackModule.module.default);
  await act(async () => new Promise(resolve => setTimeout(resolve, 1150)));
  assert.match(outside.container.textContent, /Return to Sellio/);
  assert.ok(outside.container.querySelector('a[href^="intent://"]'));
  assert.equal(globalThis.clientReads, 0);
  assert.equal(globalThis.mobileReads, 0);
  await outside.close();
  passed('External browser renders a return button without initializing or consuming any auth session');

  reset();
  win.ReactNativeWebView = { postMessage() {} };
  const insideAttempt = createMobileAuthAttempt(browser, { join: true });
  win.localStorage.setItem(VERIFIER_KEY, '"app-verifier"');
  location.href = insideAttempt.redirectTo + '&code=native-code';
  let exchanges = 0; let sessions = 0;
  globalThis.oauthClient = { auth: { exchangeCodeForSession: async code => {
    exchanges++; assert.equal(code, 'native-code');
    return { data: { session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh',
      user: { identities: [{ provider: 'google' }] } } } };
  } } };
  globalThis.appClient = { auth: { setSession: async () => { sessions++; return { error: null }; } } };
  const inside = await mount(callbackModule.module.default);
  await act(async () => {});
  assert.equal(exchanges, 1); assert.equal(sessions, 1);
  assert.equal(location.replaced, '/Auth?join=1');
  assert.ok(win.sessionStorage.getItem(COMPLETE_KEY));
  await inside.close();
  passed('Native callback completes the session once and returns to the existing Google signup path');

  reset();
  win.ReactNativeWebView = { postMessage() {} };
  location.href = attempt.redirectTo + '&code=foreign-code';
  const foreign = await mount(callbackModule.module.default);
  assert.match(foreign.container.textContent, /another app window/);
  assert.equal(globalThis.clientReads, 0);
  assert.equal(globalThis.mobileReads, 0);
  await foreign.close();
  passed('Native returns without a matching local attempt show a recoverable error');

  reset();
  let regularRequest;
  globalThis.appClient = { auth: { signInWithOAuth: async request => { regularRequest = request; return { error: null }; } } };
  await googleModule.module.startGoogleSignIn({ redirectTo: location.origin + '/Auth?join=1' });
  assert.deepEqual(regularRequest, { provider: 'google', options: { redirectTo: location.origin + '/Auth?join=1' } });
  assert.equal(globalThis.mobileReads, 0);
  passed('Ordinary browser Google sign-in keeps its original redirect and client');

  reset();
  win.ReactNativeWebView = { postMessage() {} };
  let nativeRequest;
  globalThis.oauthClient = { auth: { signInWithOAuth: async request => {
    nativeRequest = request;
    const url = new URL('https://oauth.example.invalid/auth/v1/authorize');
    url.searchParams.set('code_challenge', 'fixture-S256');
    url.searchParams.set('code_challenge_method', 's256');
    return { data: { url: url.href } };
  } } };
  await googleModule.module.startGoogleSignIn({ redirectTo: location.origin + '/Auth?token=paid-invite',
    queryParams: { login_hint: 'fixture@example.invalid' } });
  assert.equal(nativeRequest.options.skipBrowserRedirect, true);
  assert.equal(new URL(nativeRequest.options.redirectTo).searchParams.get(CALLBACK_PARAM), '1');
  assert.equal(new URL(nativeRequest.options.redirectTo).searchParams.has('token'), false);
  assert.equal(globalThis.clientReads, 0);
  assert.match(location.assigned, /^https:\/\/oauth.example.invalid\/auth\/v1\/authorize/);
  assert.equal(JSON.parse(win.localStorage.getItem('sellio-mobile-google-pending')).inviteToken, 'paid-invite');
  passed('Android sign-in requests PKCE and launches the wrapper external flow while retaining invite context');

  reset();
  win.ReactNativeWebView = { postMessage() {} };
  let finishSessionCheck;
  globalThis.appClient = { auth: {
    getSession: () => new Promise(resolve => { finishSessionCheck = resolve; }),
  } };
  const pending = await mount(authModule.module.default);
  assert.ok(pending.container.querySelector('[data-sellio-startup]'));
  assert.ok(pending.container.querySelector('img[alt="Your business, beautifully online."]'));
  assert.equal(pending.container.querySelector('input[type="password"]'), null);
  await act(async () => { finishSessionCheck({ data: { session: null } }); });
  assert.equal(pending.container.querySelector('[data-sellio-startup]'), null);
  assert.ok(pending.container.querySelector('input[type="password"]'));
  await pending.close();
  passed('Startup branding stays visible while session recovery is pending and yields directly to the login form');

  const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');
  function Destination() {
    const route = useLocation();
    return React.createElement('output', null, route.pathname + route.search + route.hash);
  }
  function LegacySplashEntry() {
    return React.createElement(MemoryRouter, {
      initialEntries: ['/Splash?type=recovery&token=invite-fixture#recovery-fixture'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }, React.createElement(Routes, null,
      React.createElement(Route, { path: '/Splash', element: React.createElement(splashModule.module.default) }),
      React.createElement(Route, { path: '/Auth', element: React.createElement(Destination) }),
    ));
  }
  const legacy = await mount(LegacySplashEntry);
  assert.equal(legacy.container.textContent, '/Auth?type=recovery&token=invite-fixture#recovery-fixture');
  await legacy.close();
  passed('Existing Splash links immediately start Auth and preserve recovery and invite parameters');

  for (const onboarded of [true, false]) {
    reset(); win.ReactNativeWebView = { postMessage() {} };
    location.search = onboarded ? '' : '?join=1';
    win.sessionStorage.setItem(COMPLETE_KEY, JSON.stringify({ origin: location.origin, createdAt: Date.now() }));
    const row = { id: 'profile-fixture', email: 'fixture@example.invalid', role: onboarded ? 'cashier' : 'admin',
      tenant_id: onboarded ? 'tenant-fixture' : null, onboarding_completed: onboarded };
    const chain = { select() { return this; }, eq() { return this; }, limit: async () => ({ data: [row] }),
      update() { return this; }, then(resolve) { resolve({ error: null }); } };
    globalThis.appClient = {
      auth: { getSession: async () => ({ data: { session: { user: { email: row.email, created_at: '2020-01-01',
        identities: [{ provider: 'google' }], user_metadata: {} } } }, error: null }) },
      from: () => chain,
    };
    globalThis.authDestination = undefined;
    const auth = await mount(authModule.module.default);
    await act(async () => {});
    assert.equal(globalThis.authDestination, onboarded ? '/Dashboard' : '/Join');
    assert.equal(globalThis.profile.role, row.role);
    assert.equal(win.sessionStorage.getItem(COMPLETE_KEY), null);
    await auth.close();
  }
  passed('Completed Google returns preserve existing staff roles and route free signups to Join');

  console.log(passes + ' mobile OAuth DOM checks passed');
} finally {
  for (const file of loaded) await rm(file, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
