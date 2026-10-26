// Staying signed in: the app's own sign-in record (the app_session cookie) follows the
// Supabase session, which lasts until sign-out. Run: node verification/session-sync.dom.mjs
// (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://sellio.apptelier.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document','Element','HTMLElement','Node','Event','MutationObserver','navigator','getComputedStyle','localStorage']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Every cookie the app writes, with its attributes (document.cookie only shows values).
const cookieWrites = [];
const cookieDescriptor = Object.getOwnPropertyDescriptor(win.Document.prototype, 'cookie');
Object.defineProperty(win.document, 'cookie', {
  configurable: true,
  get() { return cookieDescriptor.get.call(win.document); },
  set(value) { cookieWrites.push(value); cookieDescriptor.set.call(win.document, value); },
});

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-session-sync-'));
const mock = { name: 'session-fixtures', setup(builder) {
  builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
  builder.onResolve({ filter: /themeUtils$/ }, () => ({ path: 'theme', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: {
    client: 'export const getSupabase = async () => globalThis.client;',
    theme: 'export const generateThemeVariables = () => ({}); export const resolveSavedTheme = () => ({ dark: {}, light: {} });',
  }[args.path] }));
} };
const outfile = path.join(tmp, 'context.mjs');
await build({ entryPoints: ['src/lib/AppUserContext.jsx'], outfile, bundle: true, packages: 'external', format: 'esm',
  platform: 'node', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent' });
const local = path.join(process.cwd(), '.session-sync-context.mjs');
await copyFile(outfile, local);
const { AppUserProvider, useAppUser, syncAppUserWithSession, cookieUtils } = await import(pathToFileURL(local));

const owner = { id: 'u1', email: 'owner@example.invalid', full_name: 'Owner', role: 'admin', onboarding_completed: true, tenant_id: 't1', phone: '+6591234567' };
// A Supabase client stand-in: getSession() result, and the signed-in person's own rows.
const fakeClient = ({ session = null, error = null, rows = [owner], memberships = [], profileError = null } = {}) => {
  const queries = [];
  return {
    queries,
    auth: { getSession: async () => ({ data: { session }, error }) },
    from(table) {
      const filters = [];
      const query = {
        select() { return query; }, eq(column, value) { filters.push([column, value]); return query; },
        limit: async () => {
          queries.push([table, filters]);
          if (table === 'app_users') return { data: profileError ? null : rows, error: profileError };
          if (table === 'tenant_users') return { data: memberships, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  };
};
const sessionFor = email => ({ user: { email } });

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
try {
  assert.deepEqual(await syncAppUserWithSession(fakeClient(), null), { action: 'keep' });
  assert.deepEqual(await syncAppUserWithSession(fakeClient(), owner), { action: 'clear' });
  passed('No Supabase session: nothing to do for a visitor; a leftover record is dropped');

  for (const status of [400, 401, 403]) {
    assert.deepEqual(await syncAppUserWithSession(fakeClient({ error: { status, message: 'Invalid Refresh Token' } }), owner), { action: 'clear' });
  }
  for (const error of [{ status: 0, message: 'Failed to fetch' }, { message: 'offline' }, { status: 429 }, { status: 500 }]) {
    assert.deepEqual(await syncAppUserWithSession(fakeClient({ error }), owner), { action: 'keep' }, JSON.stringify(error));
  }
  passed('Sign-in refused by Supabase: dropped. Offline, rate-limited or Supabase down: nobody is signed out');

  const sameUpper = fakeClient({ session: sessionFor('OWNER@example.invalid') });
  assert.deepEqual(await syncAppUserWithSession(sameUpper, owner), { action: 'renew', user: owner });
  assert.deepEqual(sameUpper.queries, [], 'Renewing needs no database call');
  passed('Same person still signed in: the record is renewed without any database call');

  let client = fakeClient({ session: sessionFor('owner@example.invalid') });
  assert.deepEqual(await syncAppUserWithSession(client, null), { action: 'restore', user: owner });
  client = fakeClient({ session: sessionFor('buyer@example.invalid'), rows: [{ ...owner, id: 'u2', email: 'buyer@example.invalid', tenant_id: null, onboarding_completed: false }] });
  assert.deepEqual((await syncAppUserWithSession(client, null)).user.tenant_id, null);
  passed('Record gone but still signed in: rebuilt from the own profile, for buyers as well as shops');

  client = fakeClient({ session: sessionFor('staff@sellio.app'), rows: [{ ...owner, id: 'u3', email: 'staff@sellio.app', tenant_id: null }], memberships: [{ tenant_id: 'shop-9' }] });
  const restored = await syncAppUserWithSession(client, owner);
  assert.equal(restored.action, 'restore'); assert.equal(restored.user.email, 'staff@sellio.app'); assert.equal(restored.user.tenant_id, 'shop-9');
  assert.deepEqual(client.queries[1], ['tenant_users', [['user_email', 'staff@sellio.app'], ['status', 'active']]]);
  passed("Record from a different account: replaced by the signed-in person's own, shop found from their membership");

  assert.deepEqual(await syncAppUserWithSession(fakeClient({ session: sessionFor('owner@example.invalid'), rows: [] }), null), { action: 'keep' });
  assert.deepEqual(await syncAppUserWithSession(fakeClient({ session: sessionFor('owner@example.invalid'), rows: [{ ...owner, email: 'someone-else@example.invalid' }] }), null), { action: 'keep' });
  assert.deepEqual(await syncAppUserWithSession(fakeClient({ session: sessionFor('owner@example.invalid'), profileError: { message: 'offline' } }), null), { action: 'keep' });
  passed("Profile missing, not the signed-in person's, or unreadable: nothing is changed");

  // The provider, as mounted when the app opens.
  let shown;
  function Probe() { const { appUser } = useAppUser(); shown = appUser; return null; }
  const mount = async () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(React.createElement(AppUserProvider, null, React.createElement(Probe))); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    return async () => { await act(async () => root.unmount()); container.remove(); };
  };
  const appCookie = () => cookieWrites.filter(w => w.startsWith('app_session='));

  cookieUtils.set(owner); cookieWrites.length = 0;
  globalThis.client = fakeClient({ session: sessionFor('owner@example.invalid') });
  let close = await mount();
  assert.equal(shown?.email, 'owner@example.invalid');
  assert.equal(appCookie().length, 1, 'Renewed once on opening');
  assert.match(appCookie()[0], /; max-age=34560000;/, '400 days');
  await close();
  passed('Opening the app renews the record for another 400 days');

  cookieUtils.clear(); cookieWrites.length = 0;
  globalThis.client = fakeClient({ session: sessionFor('owner@example.invalid') });
  close = await mount();
  assert.equal(shown?.email, 'owner@example.invalid', 'Signed in again without the sign-in page');
  assert.equal(cookieUtils.get()?.tenant_id, 't1');
  assert.match(appCookie()[0], /max-age=34560000/);
  await close();
  passed('Opening the app after the old 7-day record ran out: still signed in, no sign-in page');

  cookieUtils.set(owner); cookieWrites.length = 0;
  globalThis.client = fakeClient({ session: null });
  close = await mount();
  assert.equal(shown, null); assert.equal(cookieUtils.get(), null);
  await close();
  cookieUtils.set(owner);
  globalThis.client = fakeClient({ error: { message: 'Failed to fetch' } });
  close = await mount();
  assert.equal(shown?.email, 'owner@example.invalid', 'Offline: still shown as signed in');
  await close();
  passed('Signed out underneath: shown as signed out at once. Offline: left signed in');

  console.log(passes + ' staying-signed-in checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
