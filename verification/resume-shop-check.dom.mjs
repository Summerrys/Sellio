// Coming back to the app with no connection for a moment must not throw a shop's owner or staff
// out of their shop (and, when the Account page can't download either, leave the app blank): a
// read that fails keeps what was loaded, and only a read that worked and found nothing means
// "no store". A screen that fails to load or crashes shows a Reload screen, never a blank app.
// Run: node verification/resume-shop-check.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://sellio.apptelier.sg/Dashboard', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
// The page's address, with location.replace recorded instead of loading a page.
const navigations = [];
const location = { href: win.location.href, origin: win.location.origin, pathname: win.location.pathname, replace: url => navigations.push(url) };
globalThis.window = new Proxy(win, {
  get(target, key) {
    if (key === 'location') return location;
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' && ['addEventListener', 'removeEventListener'].includes(key) ? value.bind(target) : value;
  },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;

globalThis.backLines = [];
globalThis.steps = 0;
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-resume-'));
const mock = { name: 'resume-fixtures', setup(builder) {
  builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
  builder.onResolve({ filter: /\/backLog$/ }, () => ({ path: 'backLog', namespace: 'mock' }));
  builder.onResolve({ filter: /\/useBackToClose$/ }, () => ({ path: 'back', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: {
    client: 'export const getSupabase = async () => globalThis.client;',
    backLog: 'export const backLog = (line) => { globalThis.backLines.push(line); };',
    back: 'export const stepToFirstEntry = () => { globalThis.steps += 1; return Promise.resolve(); };',
  }[args.path] }));
} };
const outfile = path.join(tmp, 'resume.mjs');
await build({
  stdin: {
    contents: "export { TenantProvider } from './src/components/tenant/TenantContext.jsx';\n"
      + "export { default as AppErrorBoundary } from './src/components/ui-custom/AppErrorBoundary.jsx';\n",
    resolveDir: process.cwd(), loader: 'js',
  },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent',
});
const local = path.join(process.cwd(), '.resume-shop-check.mjs');
await copyFile(outfile, local);
const { TenantProvider, AppErrorBoundary } = await import(pathToFileURL(local));

// A Supabase client stand-in: a staff member of shop t1 with role r1, whose reads can fail (no
// connection) and whose sign-in renewal can fail (the token ran out while the app was away).
const EMAIL = 'staff@example.invalid';
const state = {
  memberships: [{ id: 'm1', tenant_id: 't1', user_email: EMAIL, status: 'active', is_owner: false, role_id: 'r1' }],
  readsFail: false, renewalFails: false, reads: [],
};
const failedFetch = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
globalThis.client = {
  auth: {
    getUser: async () => ({ data: { user: { email: EMAIL } }, error: null }),
    getSession: async () => (state.renewalFails
      ? { data: { session: null }, error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }) }
      : { data: { session: { user: { email: EMAIL } } }, error: null }),
  },
  from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      limit: async () => {
        state.reads.push(table);
        if (state.readsFail) return { data: null, error: failedFetch };
        if (table === 'app_users') return { data: [{ email: EMAIL, tenant_id: 't1', role: 'user' }], error: null };
        if (table === 'tenant_users') return { data: state.memberships, error: null };
        if (table === 'tenants') return { data: [{ id: 't1', name: 'Perfect Five', seller_type: 'individual' }], error: null };
        if (table === 'roles') return { data: [{ id: 'r1', name: 'Cashier', permissions: ['orders.view', 'orders.create'] }], error: null };
        return { data: [], error: null };
      },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return query;
  },
  rpc: async () => ({ data: null, error: null }),
};

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const settle = async () => { for (let i = 0; i < 25; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };

try {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  let shop = null;
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(TenantProvider, null, value => { shop = value; return null; })));
  });
  await settle();
  // The workspace re-reads memberships and the role each time the app comes back (Layout).
  const comeBack = async () => {
    await act(async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenantUser'] }, { cancelRefetch: false }),
        queryClient.invalidateQueries({ queryKey: ['userRole'] }, { cancelRefetch: false }),
      ]);
    });
    await settle();
  };
  assert.equal(shop.noStore, false);
  assert.equal(shop.tenantUser?.tenant_id, 't1');
  assert.deepEqual(shop.permissions, ['orders.view', 'orders.create']);
  passed('The shop, the membership and the role load');

  state.readsFail = true; state.reads = [];
  await comeBack();
  assert.ok(state.reads.includes('tenant_users'), 'the memberships were read again');
  assert.equal(shop.noStore, false, 'a failed read is not "no store" (that sends the person to Account)');
  assert.equal(shop.tenantUser?.tenant_id, 't1');
  assert.deepEqual(shop.permissions, ['orders.view', 'orders.create'], 'a failed role read keeps the permissions');
  passed('Back with no connection for a moment: the reads fail, and the shop, membership and permissions stay');

  state.readsFail = false; state.renewalFails = true; state.reads = [];
  await comeBack();
  assert.ok(!state.reads.includes('tenant_users'), 'no read went out without the sign-in (it would find nothing)');
  assert.equal(shop.noStore, false);
  assert.equal(shop.tenantUser?.tenant_id, 't1');
  passed('Back with a sign-in that ran out and can\'t be renewed just then: nothing is read as nobody, the shop stays');

  state.renewalFails = false; state.reads = [];
  await comeBack();
  assert.equal(shop.noStore, false);
  assert.deepEqual(shop.permissions, ['orders.view', 'orders.create']);
  state.memberships = [];
  await comeBack();
  assert.equal(shop.noStore, true, 'a read that worked and found no membership is still "no store"');
  passed('Once reads work again everything carries on, and a membership that really ended is still noticed');
  await act(async () => root.unmount());
  queryClient.clear(); // no cache timers left to keep the process running

  // The safety screen.
  const realError = console.error;
  const show = async (message) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const Broken = () => { throw new Error(message); };
    const screen = createRoot(host);
    console.error = () => {}; // React reports the caught error: expected here
    try { await act(async () => { screen.render(React.createElement(AppErrorBoundary, null, React.createElement(Broken))); }); }
    finally { console.error = realError; }
    return { host, screen };
  };
  const notDownloaded = await show('Failed to fetch dynamically imported module: https://sellio.apptelier.sg/assets/Account-x.js');
  assert.match(notDownloaded.host.textContent, /Sellio couldn’t load this screen/);
  assert.match(notDownloaded.host.textContent, /Check your connection, then reload\./);
  assert.ok(globalThis.backLines.some(line => /^crash: Failed to fetch dynamically imported module/.test(line)), 'noted in the Back log');
  const reload = notDownloaded.host.querySelector('button');
  assert.equal(reload.textContent, 'Reload');
  await act(async () => { reload.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
  assert.equal(globalThis.steps, 1, 'in the Android app it first steps to the first entry, like an update');
  assert.deepEqual(navigations, ['https://sellio.apptelier.sg/Dashboard'], 'then opens the same page again');
  passed('A page whose code can\'t download shows "couldn\'t load this screen" with Reload (not a blank app); Reload opens the same page again');

  const crashed = await show('Cannot read properties of undefined (reading \'name\')');
  assert.match(crashed.host.textContent, /Something went wrong/);
  assert.match(crashed.host.textContent, /Reload to carry on where you were\./);
  passed('Any other crash shows "Something went wrong" with Reload');
  await act(async () => { notDownloaded.screen.unmount(); crashed.screen.unmount(); });

  console.log(`\nAll ${passes} coming-back and safety-screen checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
  dom.window.close();
  // Data timers may still be running after a failed check: end here either way.
  process.exit(process.exitCode || 0);
}
