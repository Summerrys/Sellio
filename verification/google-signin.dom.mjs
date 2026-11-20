// Google sign-in on the sign-in page (src/pages/Auth.jsx): the website's own Google redirect, and
// Google sign-in in Sellio's Android app, which signs in natively (src/lib/nativeGoogle.js), then
// finishes on Auth through the COMPLETE_KEY note (src/lib/mobileOAuth.js).
// Run: node verification/google-signin.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { webcrypto } from 'node:crypto';
import { COMPLETE_KEY } from '../src/lib/mobileOAuth.js';

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
  // Listeners are added at start-up (the phone's Back handling); jsdom needs the real window as `this`.
  if (key === 'addEventListener' || key === 'removeEventListener' || key === 'dispatchEvent') return target[key].bind(target);
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
    clients: 'export const getSupabase = async () => { globalThis.clientReads++; return globalThis.appClient; }; export const SUPABASE_URL = "https://project.example.invalid";',
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
const googleModule = await load('src/lib/googleSignIn.js'); loaded.push(googleModule.local);
const authModule = await load('src/pages/Auth.jsx'); loaded.push(authModule.local);
const splashModule = await load('src/pages/Splash.jsx'); loaded.push(splashModule.local);
// In a router, as in the app (the login page's stall links home with the router's Link there).
const { MemoryRouter: PageRouter } = await import('react-router-dom');
const mount = async Component => {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  const page = React.createElement(Component);
  await act(async () => { root.render(Component.ownRouter ? page : React.createElement(PageRouter, null, page)); });
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const welcomeLeft = () => JSON.parse(win.sessionStorage.getItem('sellio-sign-in-welcome') || 'null')?.message ?? null;
const reset = () => {
  win.localStorage.clear(); win.sessionStorage.clear();
  location.href = location.origin + '/Auth'; location.search = ''; location.hash = '';
  location.replaced = undefined; location.assigned = undefined;
  delete win.Capacitor;
  globalThis.clientReads = 0;
};
// Sellio's Android app (src/lib/nativeApp.js).
const inAndroidApp = () => { win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; };
try {
  reset();
  let regularRequest;
  globalThis.appClient = { auth: { signInWithOAuth: async request => { regularRequest = request; return { error: null }; } } };
  await googleModule.module.startGoogleSignIn({ redirectTo: location.origin + '/Auth?join=1' });
  // Google asks which account every time, so someone can pick another one (Alvin, 20 Nov 2026).
  assert.deepEqual(regularRequest, { provider: 'google', options: { redirectTo: location.origin + '/Auth?join=1', queryParams: { prompt: 'select_account' } } });
  passed('Ordinary browser Google sign-in keeps its original redirect and client, and Google asks which account');

  reset();
  inAndroidApp();
  let finishSessionCheck;
  globalThis.appClient = { auth: {
    getSession: () => new Promise(resolve => { finishSessionCheck = resolve; }),
  } };
  // The page shows the normal loader while it checks; in the app the launch splash
  // (LaunchSplash, mounted once in App.jsx) covers it, which tests/20 checks in a browser.
  const pending = await mount(authModule.module.default);
  assert.ok(pending.container.querySelector('[aria-label="Loading Sellio"]'));
  assert.equal(pending.container.querySelector('input[type="password"]'), null);
  await act(async () => { finishSessionCheck({ data: { session: null } }); });
  assert.equal(pending.container.querySelector('[aria-label="Loading Sellio"]'), null);
  assert.ok(pending.container.querySelector('input[type="password"]'));
  await pending.close();
  passed('The loader stays visible while session recovery is pending and yields directly to the login form');

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
  LegacySplashEntry.ownRouter = true;
  const legacy = await mount(LegacySplashEntry);
  assert.equal(legacy.container.textContent, '/Auth?type=recovery&token=invite-fixture#recovery-fixture');
  await legacy.close();
  passed('Existing Splash links immediately start Auth and preserve recovery and invite parameters');

  for (const onboarded of [true, false]) {
    reset(); inAndroidApp();
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
    // The page Google sign-in opens says "Welcome back!" (src/lib/signInWelcome.js); Join,
    // which still asks for the account's details, doesn't.
    assert.equal(welcomeLeft(), onboarded ? 'Welcome back!' : null);
    await auth.close();
  }
  passed('Completed Google returns preserve existing staff roles, welcome them back, and route free signups to Join');

  {
    // A brand-new Google account (from the free sign-up, ?join=1) is not "back".
    reset(); inAndroidApp();
    location.search = '?join=1';
    win.sessionStorage.setItem(COMPLETE_KEY, JSON.stringify({ origin: location.origin, createdAt: Date.now() }));
    const fresh = { id: 'new-profile', email: 'new-owner@example.invalid', role: 'admin', tenant_id: null, onboarding_completed: false };
    let rows = [];
    const chain = { select() { return this; }, eq() { return this; }, limit: async () => ({ data: rows }),
      insert: async () => { rows = [fresh]; return { error: null }; }, single: async () => ({ data: fresh, error: null }),
      update() { return this; }, then(resolve) { resolve({ error: null }); } };
    globalThis.appClient = {
      auth: { getSession: async () => ({ data: { session: { user: { email: fresh.email, created_at: new Date().toISOString(),
        identities: [{ provider: 'google' }], user_metadata: {} } } }, error: null }) },
      from: () => chain,
      rpc: async () => ({ data: { email: fresh.email }, error: null }),
    };
    globalThis.authDestination = undefined;
    const auth = await mount(authModule.module.default);
    await act(async () => {});
    assert.equal(globalThis.authDestination, '/Join');
    assert.equal(welcomeLeft(), null);
    await auth.close();
  }
  passed('A new account made by Google sign-in is not welcomed back');

  console.log(passes + ' Google sign-in DOM checks passed');
} finally {
  for (const file of loaded) await rm(file, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
