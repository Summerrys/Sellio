// Run from the app root after installing jsdom into a temporary directory:
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/mobile.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const React = await import('react');
const { act } = await import('react-dom/test-utils');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const temporary = await mkdtemp(path.join(app, '.mobile-verification-'));
const mock = {
  name: 'isolated-client',
  setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const getSupabase = async () => globalThis.__sellioTestClient;', loader: 'js' }));
  },
};
async function loadComponent(relative, plugins = [mock]) {
  const outfile = path.join(temporary, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  await build({ entryPoints: [path.join(app, relative)], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, plugins, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
const next = () => new Promise(resolve => setTimeout(resolve, 0));
const click = element => { assert.ok(element, 'Control must exist'); element.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const roots = [];
function mount(Component, props = {}, client = queryClient()) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); roots.push({ root, container, client });
  return { container, root, client, render: async values => act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Component, values || props)))) };
}
try {
  // A lost response must keep the same checkout request key; changed carts are blocked.
  const checkout = await import(pathToFileURL(path.join(app, 'src/lib/mobileCheckout.js')).href);
  const params = { p_tenant_id: 'test-store', p_items: [{ product_id: 'p', quantity: 2 }], p_type: 'takeaway' };
  const calls = [];
  let fail = true;
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return fail ? { data: null, error: { message: 'Network failure' } } : { data: { id: 'server-order', order_number: 'ORD1', total_amount: 5 }, error: null }; } };
  await assert.rejects(checkout.submitCheckout(client, params, 'test-cart'), error => error.checkoutUnconfirmed === true);
  const requestKey = calls[0].args.p_request_id;
  assert.equal(checkout.getPendingCheckouts()[0].state, 'unconfirmed');
  await assert.rejects(checkout.submitCheckout(client, { ...params, p_notes: 'changed' }, 'test-cart'), /earlier submission is unconfirmed/);
  assert.equal(calls.length, 1);
  fail = false;
  assert.equal((await checkout.submitCheckout(client, params, 'test-cart')).id, 'server-order');
  assert.equal(calls[1].args.p_request_id, requestKey);
  assert.equal(checkout.getPendingCheckouts().length, 0);
  assert.equal(sessionStorage.getItem('sellio_checkout_attempt:test-cart'), null);
  passed('lost checkout response, same-key retry and changed-cart protection');

  const denied = { rpc: async () => ({ error: { code: '22023', message: 'Cart invalid' } }) };
  await assert.rejects(checkout.submitCheckout(denied, params, 'invalid-cart'));
  assert.equal(sessionStorage.getItem('sellio_checkout_attempt:invalid-cart'), null);
  assert.equal(checkout.getPendingCheckouts().length, 0);
  passed('definite checkout rejection clears the pending attempt');

  const { default: PullToRefresh, isRefreshAtTop, getRefreshScrollTarget } = await loadComponent('src/components/ui-custom/PullToRefresh.jsx');
  let refreshCalls = 0; let finishRefresh;
  const view = mount(PullToRefresh, { onRefresh: () => { refreshCalls++; return new Promise(resolve => { finishRefresh = resolve; }); }, children: React.createElement('p', { id: 'feed-text' }, 'Feed') });
  await view.render();
  const root = view.container.firstElementChild; const target = view.container.querySelector('p');
  Object.defineProperty(document, 'scrollingElement', { value: document.documentElement, configurable: true });
  document.documentElement.scrollTop = 40;
  assert.equal(isRefreshAtTop(target, root), false);
  document.documentElement.scrollTop = 0;
  assert.equal(isRefreshAtTop(target, root), true);
  function touch(type, x = 0, y = 0, targetElement = target, count = 1) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) });
    targetElement.dispatchEvent(event);
  }
  await act(async () => { touch('touchstart'); touch('touchmove', 0, 180); touch('touchcancel'); touch('touchend'); });
  assert.equal(refreshCalls, 0);
  await act(async () => { touch('touchstart'); touch('touchmove', 200, 30); touch('touchend'); });
  assert.equal(refreshCalls, 0);
  document.documentElement.scrollTop = 50;
  await act(async () => { touch('touchstart'); touch('touchmove', 0, 180); touch('touchend'); });
  assert.equal(refreshCalls, 0);
  document.documentElement.scrollTop = 0;
  await act(async () => { touch('touchstart'); touch('touchmove', 0, 180); touch('touchend'); });
  assert.equal(refreshCalls, 1);
  await act(async () => { touch('touchstart'); touch('touchmove', 0, 180); touch('touchend'); click(root.querySelector('button')); });
  assert.equal(refreshCalls, 1);
  await act(async () => { finishRefresh(); await next(); });
  assert.equal(root.getAttribute('aria-busy'), 'false');
  passed('pull cancellation, horizontal gestures, page scroll and duplicate refresh lock');
  const nested = document.createElement('div'); nested.style.overflowY = 'auto'; root.appendChild(nested); nested.appendChild(target);
  Object.defineProperty(nested, 'scrollHeight', { value: 300 }); Object.defineProperty(nested, 'clientHeight', { value: 100 });
  assert.equal(getRefreshScrollTarget(target, root), nested);
  nested.scrollTop = 20;
  assert.equal(isRefreshAtTop(target, root), false);
  nested.scrollTop = 0; document.documentElement.scrollTop = 30;
  assert.equal(isRefreshAtTop(target, root), false);
  document.documentElement.scrollTop = 0;
  passed('nested scroll container and scrolled parent do not trigger refresh');
  await view.render({ onRefresh: async () => { throw new Error('Test refresh rejection'); }, children: React.createElement('p', null, 'Feed') });
  await act(async () => { click(view.container.querySelector('button')); await next(); });
  assert.equal(view.container.firstElementChild.getAttribute('aria-busy'), 'false');
  passed('failed refresh releases the spinner');

  let mode = false; let listener; let removed;
  window.matchMedia = () => ({ get matches() { return mode; }, addEventListener: (_event, callback) => { listener = callback; }, removeEventListener: (_event, callback) => { removed = callback; } });
  const { ThemeProvider } = await loadComponent('src/components/theme/ThemeProvider.jsx');
  const theme = mount(ThemeProvider, { children: React.createElement('p', null, 'Brand') });
  await theme.render();
  assert.equal(document.documentElement.classList.contains('dark'), false);
  await act(async () => { mode = true; listener(); });
  assert.equal(document.documentElement.classList.contains('dark'), true);
  assert.equal(document.documentElement.style.colorScheme, 'dark');
  await act(async () => { mode = false; listener(); });
  assert.equal(document.documentElement.classList.contains('dark'), false);
  await act(async () => theme.root.unmount());
  assert.equal(removed, listener);
  passed('system appearance changes dynamically and its listener is removed');

  let respond;
  globalThis.__sellioTestClient = { rpc: () => new Promise(resolve => { respond = resolve; }) };
  const { default: StockAdjustmentPanel } = await loadComponent('src/components/inventory/StockAdjustmentPanel.jsx');
  const stockClient = queryClient();
  stockClient.setQueryData(['products', 'test-store'], [{ id: 'p', stock_quantity: 10, low_stock_threshold: 5 }, { id: 'other', stock_quantity: 8 }]);
  const stock = mount(StockAdjustmentPanel, { open: true, product: { id: 'p', name: 'Test', current_stock: 10, low_stock_threshold: 5 }, tenantId: 'test-store', onOpenChange: () => {} }, stockClient);
  await stock.render();
  await act(async () => click([...stock.container.querySelectorAll('button')].find(button => button.textContent.trim() === '+')));
  await act(async () => { click([...stock.container.querySelectorAll('button')].find(button => button.textContent.includes('Save —'))); await next(); });
  assert.equal(stockClient.getQueryData(['products', 'test-store'])[0].stock_quantity, 11);
  stockClient.setQueryData(['products', 'test-store'], rows => rows.map(row => row.id === 'other' ? { ...row, stock_quantity: 99 } : row));
  await act(async () => { respond({ data: null, error: { code: '42501', message: 'Permission denied' } }); await next(); });
  assert.equal(stockClient.getQueryData(['products', 'test-store'])[0].stock_quantity, 10);
  assert.equal(stockClient.getQueryData(['products', 'test-store'])[1].stock_quantity, 99);
  passed('stock updates immediately and rejection restores only its own item');

  const { default: DeletionForm } = await loadComponent('src/components/profile/AccountDeletionForm.jsx');
  let deletionCalls = 0;
  const verified = { id: 'auth-fixture', email: 'fixture@example.invalid' };
  globalThis.__sellioTestClient = {
    auth: { getUser: async () => ({ data: { user: verified } }), signOut: async () => ({ error: null }) },
    functions: { invoke: async () => { deletionCalls++; return { data: null, error: { context: { json: async () => ({ code: 'REAUTH_REQUIRED', error: 'Sign in again to verify your identity.' }) } } }; } },
  };
  const deletion = mount(DeletionForm, { expectedEmail: verified.email });
  await deletion.render(); await act(async () => { await next(); });
  const submitButton = deletion.container.querySelector('button[type="submit"]');
  assert.equal(submitButton.disabled, true);
  const input = deletion.container.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'DELETE');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(deletion.container.querySelector('button[type="submit"]').disabled, false);
  await act(async () => { deletion.container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await next(); });
  assert.equal(deletionCalls, 1);
  assert.match(deletion.container.textContent, /Sign in again to verify/);
  assert.doesNotMatch(deletion.container.textContent, /account has been deleted/);
  passed('deletion requires typed confirmation and preserves reauthentication failure');

  // Mock the edge runtime; no real user or network call is made.
  let handler;
  globalThis.Deno = { env: { get: () => 'isolated-test-value' }, serve: callback => { handler = callback; } };
  const edge = await loadComponent('supabase/functions/delete-account/index.ts', [{
    name: 'edge-client', setup(builder) {
      builder.onResolve({ filter: /^npm:/ }, () => ({ path: 'edge-client', namespace: 'edge-mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'edge-mock' }, () => ({ contents: 'export const createClient = () => globalThis.__edgeClient;', loader: 'js' }));
    },
  }]);
  const now = 2000;
  const token = payload => 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
  assert.equal(edge.hasRecentVerification(token({ amr: [{ method: 'password', timestamp: now - 1 }] }), now), true);
  assert.equal(edge.hasRecentVerification(token({ iat: now, amr: [{ method: 'password', timestamp: now - 601 }] }), now), false);
  assert.equal(edge.hasRecentVerification(token({ amr: [{ method: 'oauth', timestamp: now + 61 }] }), now), false);
  assert.equal(edge.hasRecentVerification('invalid', now), false);
  passed('deletion freshness uses authentication time rather than token refresh time');
  let rpcCalls = 0;
  globalThis.__edgeClient = { auth: { getUser: async () => ({ error: new Error('Unverified token'), data: {} }) }, rpc: () => { rpcCalls++; } };
  const invalid = await handler(new Request('https://example.invalid/delete-account', { method: 'POST', headers: { Authorization: 'Bearer ' + token({ amr: [{ method: 'password', timestamp: Date.now() / 1000 }] }) }, body: JSON.stringify({ confirmation: 'DELETE' }) }));
  assert.equal(invalid.status, 401); assert.equal(rpcCalls, 0);
  passed('unverified tokens cannot reach account deletion preparation');

  const rpcNames = [];
  globalThis.__edgeClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }),
      admin: { signOut: async () => ({ error: null }), deleteUser: async () => ({ error: { status: 500 } }), getUserById: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    },
    rpc: async name => { rpcNames.push(name); return { data: { requestId: 'fixture-request', status: 'processing' }, error: null }; },
  };
  const failedDeletion = await handler(new Request('https://example.invalid/delete-account', { method: 'POST', headers: { Authorization: 'Bearer ' + token({ amr: [{ method: 'password', timestamp: Date.now() / 1000 }] }) }, body: JSON.stringify({ confirmation: 'DELETE' }) }));
  assert.equal(failedDeletion.status, 500);
  assert.deepEqual(rpcNames, ['account_deletion_prepare', 'account_deletion_restore']);
  passed('Auth deletion failure restores access and cannot return completed');
  console.log(passes + ' interaction and failure checks passed.');
} finally {
  for (const item of roots) {
    try { await act(async () => item.root.unmount()); } catch { /* Already unmounted. */ }
    item.client.clear(); item.container.remove();
  }
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
