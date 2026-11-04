// Account deletion (5 Nov 2026): the delete-account edge function and the request form shown
// in the app and at sellio.sg/delete-account. Nothing real is called: the edge runtime, Supabase
// and Stripe are stand-ins.
// Run from the app root after installing jsdom into a temporary directory:
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/account-deletion.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid/delete-account', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'DocumentFragment', 'CustomEvent', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'getComputedStyle', 'navigator', 'NodeFilter', 'HTMLButtonElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const temporary = await mkdtemp(path.join(app, '.account-deletion-verification-'));

const standIns = {
  name: 'stand-ins',
  setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js@/ }, () => ({ path: 'supabase-js', namespace: 'mock' }));
    builder.onResolve({ filter: /^npm:stripe@/ }, () => ({ path: 'stripe', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
      loader: 'js',
      contents: {
        client: 'export const getSupabase = async () => globalThis.__sellioTestClient;',
        'supabase-js': 'export function createClient(url, key, options) { return globalThis.__edge.createClient(url, key, options); }',
        stripe: 'export default class Stripe { constructor(key, options) { return globalThis.__edge.stripe(key, options); } }',
      }[args.path],
    }));
  },
};
async function load(relative) {
  const outfile = path.join(temporary, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  await build({ entryPoints: [path.join(app, relative)], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, plugins: [standIns], logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
const next = () => new Promise((resolve) => setTimeout(resolve, 0));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

try {
  // ---- The edge function ----
  let handler;
  const env = { SUPABASE_URL: 'https://sb.invalid', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key', STRIPE_SECRET_KEY: 'sk_fixture' };
  globalThis.Deno = { env: { get: (name) => env[name] }, serve: (callback) => { handler = callback; } };
  const edge = {
    calls: [],
    user: { data: { user: { id: 'user-1' } }, error: null },
    request: null, // answer of account_deletion_request
    subs: {},
    createClient(url, key, options) {
      return {
        auth: { getUser: async () => { edge.calls.push({ kind: 'getUser', url, key, authorization: options?.global?.headers?.Authorization }); return edge.user; } },
        rpc: async (name, params) => {
          edge.calls.push({ kind: 'rpc', key, name, params });
          return name === 'account_deletion_request' ? edge.request : { data: null, error: null };
        },
      };
    },
    stripe(key, options) {
      edge.calls.push({ kind: 'stripe', key, apiVersion: options?.apiVersion });
      const find = (id) => {
        const sub = edge.subs[id];
        if (!sub) throw new Error(`No such subscription: '${id}'`);
        return sub;
      };
      return {
        subscriptions: {
          retrieve: async (id) => { edge.calls.push({ kind: 'retrieve', id }); return { id, ...find(id) }; },
          update: async (id, params) => { edge.calls.push({ kind: 'update', id, params }); return { id, ...find(id), cancel_at_period_end: true, cancel_at: 1800000000 }; },
          cancel: async (id) => { edge.calls.push({ kind: 'cancel', id }); find(id); return { id, status: 'canceled' }; },
        },
      };
    },
  };
  globalThis.__edge = edge;
  await load('supabase/functions/delete-account/index.ts');
  const call = (body, auth = 'Bearer user-jwt', raw = false) => handler(new Request('https://fn.invalid/delete-account', {
    method: 'POST',
    headers: { ...(auth ? { Authorization: auth } : {}), 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  }));
  const answer = async (response) => ({ status: response.status, body: await response.json() });
  const reset = (request, subs = {}) => { edge.calls = []; edge.request = request; edge.subs = subs; edge.user = { data: { user: { id: 'user-1' } }, error: null }; };
  const ofKind = (kind) => edge.calls.filter((c) => c.kind === kind);
  const requested = (subscriptions = [], extra = {}) => ({ data: { requestId: 'req-1', status: 'requested', deleteAfter: '2027-05-05T02:00:00+00:00', shops: ['Test Shop'], subscriptions, alreadyRequested: false, ...extra }, error: null });

  const preflight = await handler(new Request('https://fn.invalid/delete-account', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /apikey/);
  assert.equal((await answer(await handler(new Request('https://fn.invalid/delete-account')))).status, 405);
  passed('delete-account: browsers may call it (CORS); only POST is taken');

  reset(requested());
  let r = await answer(await call({ confirmation: 'DELETE' }, null));
  assert.equal(r.status, 401); assert.equal(r.body.code, 'AUTH_REQUIRED'); assert.equal(edge.calls.length, 0);
  for (const body of [{}, { confirmation: 'delete' }, { confirmation: ' DELETE' }]) {
    r = await answer(await call(body));
    assert.equal(r.status, 400); assert.equal(r.body.code, 'CONFIRMATION_REQUIRED');
  }
  r = await answer(await call('not json', 'Bearer user-jwt', true));
  assert.equal(r.status, 400); assert.equal(r.body.code, 'CONFIRMATION_REQUIRED');
  assert.equal(edge.calls.length, 0, 'Nothing is looked up before DELETE is confirmed');
  passed('delete-account: needs a signed-in caller and exactly DELETE');

  reset(requested());
  edge.user = { data: { user: null }, error: { message: 'Session from session_id claim in JWT does not exist' } };
  r = await answer(await call({ confirmation: 'DELETE' }));
  assert.equal(r.status, 401); assert.equal(r.body.code, 'REAUTH_REQUIRED');
  assert.deepEqual(ofKind('getUser').map((c) => [c.key, c.authorization]), [['anon-key', 'Bearer user-jwt']], 'The caller is checked with their own token');
  assert.equal(ofKind('rpc').length, 0);
  passed('delete-account: a session Supabase no longer accepts saves nothing');

  reset({ data: { status: 'refused', reason: 'admin' }, error: null });
  r = await answer(await call({ confirmation: 'DELETE' }));
  assert.equal(r.status, 403); assert.equal(r.body.code, 'ADMIN_ACCOUNT'); assert.equal(ofKind('stripe').length, 0);
  reset({ data: null, error: { code: 'P0001', message: 'boom' } });
  r = await answer(await call({ confirmation: 'DELETE' }));
  assert.equal(r.status, 500); assert.equal(r.body.code, 'FAILED'); assert.match(r.body.error, /sellio@apptelier\.sg/);
  passed('delete-account: admin accounts are refused; a database error says so');

  reset(requested([], { shops: [], deleteAfter: '2026-12-05T02:00:00+00:00' }));
  r = await answer(await call({ confirmation: 'DELETE', reason: '   ' }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { requestId: 'req-1', status: 'requested', deleteAfter: '2026-12-05T02:00:00+00:00', shops: [], alreadyRequested: false });
  const saved = ofKind('rpc')[0];
  assert.equal(saved.key, 'service-key'); assert.equal(saved.name, 'account_deletion_request');
  assert.deepEqual(saved.params, { p_auth_user_id: 'user-1', p_reason: null });
  assert.equal(ofKind('stripe').length, 0); assert.equal(ofKind('rpc').length, 1);
  passed('delete-account: a buyer\'s request is saved for the signed-in user (blank reason as none), no Stripe');

  reset(requested([
    { tenantId: 't1', stripeSubscriptionId: 'sub_active' },
    { tenantId: 't2', stripeSubscriptionId: 'sub_trial_stopping' },
    { tenantId: 't3', stripeSubscriptionId: 'sub_past_due' },
    { tenantId: 't4', stripeSubscriptionId: 'sub_ended' },
    { tenantId: 't5', stripeSubscriptionId: 'sub_missing' },
  ]), {
    sub_active: { status: 'active', cancel_at_period_end: false },
    sub_trial_stopping: { status: 'trialing', cancel_at_period_end: true },
    sub_past_due: { status: 'past_due', cancel_at_period_end: false },
    sub_ended: { status: 'canceled', cancel_at_period_end: false },
  });
  r = await answer(await call({ confirmation: 'DELETE', reason: `  ${'x'.repeat(1500)}  ` }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.shops, ['Test Shop']);
  assert.equal(ofKind('rpc')[0].params.p_reason.length, 1000);
  assert.deepEqual(ofKind('stripe').map((c) => [c.key, c.apiVersion]), [['sk_fixture', '2026-06-24.dahlia']]);
  assert.deepEqual(ofKind('update'), [{ kind: 'update', id: 'sub_active', params: { cancel_at_period_end: true, metadata: { sellio_deletion_request: 'req-1' } } }]);
  assert.deepEqual(ofKind('cancel').map((c) => c.id), ['sub_past_due']);
  const recorded = ofKind('rpc').filter((c) => c.name === 'account_deletion_stripe_result');
  assert.equal(recorded.length, 1); assert.equal(recorded[0].key, 'service-key'); assert.equal(recorded[0].params.p_request_id, 'req-1');
  const by = Object.fromEntries(recorded[0].params.p_result.map((x) => [x.id, x]));
  assert.equal(recorded[0].params.p_result.length, 5);
  assert.deepEqual([by.sub_active.ok, by.sub_active.action, by.sub_active.tenantId], [true, 'stops_renewing', 't1']);
  assert.deepEqual([by.sub_trial_stopping.ok, by.sub_trial_stopping.action], [true, 'stops_renewing']);
  assert.deepEqual([by.sub_past_due.ok, by.sub_past_due.action, by.sub_past_due.was], [true, 'cancelled_now', 'past_due']);
  assert.deepEqual([by.sub_ended.ok, by.sub_ended.action], [true, 'already_ended']);
  assert.equal(by.sub_missing.ok, false); assert.match(by.sub_missing.error, /No such subscription/);
  passed('delete-account: paid plans stop renewing, overdue ones are cancelled now, ended ones are left, failures are recorded for the admins');

  delete env.STRIPE_SECRET_KEY;
  reset(requested([{ tenantId: 't1', stripeSubscriptionId: 'sub_active' }]), { sub_active: { status: 'active' } });
  r = await answer(await call({ confirmation: 'DELETE' }));
  assert.equal(r.status, 200);
  const unconfigured = ofKind('rpc').find((c) => c.name === 'account_deletion_stripe_result').params.p_result[0];
  assert.equal(unconfigured.ok, false); assert.match(unconfigured.error, /STRIPE_SECRET_KEY/);
  env.STRIPE_SECRET_KEY = 'sk_fixture';
  passed('delete-account: without a Stripe key the request still stands and the admins are told');

  // ---- The request form ----
  const { default: AccountDeletionRequest } = await load('src/components/profile/AccountDeletionRequest.jsx');
  const roots = [];
  const mount = async (props) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => { root.render(React.createElement(AccountDeletionRequest, props)); await next(); await next(); });
    return container;
  };
  const type = async (element, value) => act(async () => {
    const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = async (container) => act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await next(); await next(); await next();
  });
  const button = (container, text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const client = (overrides = {}) => {
    const c = {
      invokes: [], signOuts: [],
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1', email: 'owner@example.invalid' } }, error: null }),
        signOut: async (options) => { c.signOuts.push(options); return { error: null }; },
      },
      functions: { invoke: async (name, options) => { c.invokes.push({ name, options }); return c.reply; } },
      reply: { data: { requestId: 'req-1', status: 'requested', deleteAfter: '2027-05-05T02:00:00+00:00', shops: ['Test Shop'], alreadyRequested: false }, error: null },
      ...overrides,
    };
    return c;
  };

  globalThis.__sellioTestClient = client({ auth: { getUser: async () => ({ data: { user: null }, error: { message: 'Auth session missing!' } }), signOut: async () => ({ error: null }) } });
  let view = await mount({});
  assert.ok(view.querySelector('[data-testid="deletion-what-happens"]'), 'What happens is shown before signing in');
  assert.match(view.textContent, /Store unavailable/);
  assert.match(view.textContent, /6 months if you own a shop, or 30 days/);
  assert.ok(button(view, 'Sign in to continue'));
  assert.equal(view.querySelector('form'), null, 'No form without a signed-in account');
  assert.match(view.querySelector('a[href^="mailto:sellio@apptelier.sg"]').getAttribute('href'), /subject=Account%20deletion%20request/);
  passed('form: signed out, it explains what happens and offers sign-in or email');

  document.cookie = 'app_session=' + encodeURIComponent(JSON.stringify({ id: 'profile-1' })) + '; path=/';
  localStorage.setItem('app_user', '{}');
  let requestedWith = null;
  let finished = 0;
  const signedIn = client();
  globalThis.__sellioTestClient = signedIn;
  view = await mount({ onRequested: (data) => { requestedWith = data; }, onFinished: () => { finished++; } });
  assert.match(view.textContent, /owner@example\.invalid/);
  const send = () => button(view, 'Request deletion');
  assert.equal(send().disabled, true, 'Nothing is sent before DELETE is typed');
  await type(view.querySelector('#deletion-confirmation'), 'delete');
  assert.equal(send().disabled, true, 'Lower case is not DELETE');
  await submit(view);
  assert.equal(signedIn.invokes.length, 0);
  await type(view.querySelector('#deletion-reason'), '  Closing the business  ');
  await type(view.querySelector('#deletion-confirmation'), 'DELETE');
  assert.equal(send().disabled, false);
  await submit(view);
  assert.deepEqual(signedIn.invokes, [{ name: 'delete-account', options: { body: { confirmation: 'DELETE', reason: 'Closing the business' } } }]);
  assert.deepEqual(signedIn.signOuts, [{ scope: 'local' }], 'This phone is signed out too (this device only: the server has ended the rest)');
  assert.doesNotMatch(document.cookie, /app_session=%7B/, 'The profile cookie is cleared');
  assert.equal(localStorage.getItem('app_user'), null);
  assert.equal(requestedWith?.requestId, 'req-1');
  assert.ok(view.querySelector('[data-testid="account-deletion-done"]'));
  assert.match(view.textContent, /Test Shop is closed now/);
  assert.match(view.textContent, /deleted for good on 5 May 2027/);
  await act(async () => { button(view, 'Continue to Explore').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(finished, 1);
  passed('form: DELETE sends the request with the reason, signs this phone out, shows the date, then goes on');

  const stale = client();
  stale.reply = { data: null, error: { context: { json: async () => ({ code: 'REAUTH_REQUIRED', error: 'Sign in again to request deletion.' }) } } };
  globalThis.__sellioTestClient = stale;
  view = await mount({});
  await type(view.querySelector('#deletion-confirmation'), 'DELETE');
  await submit(view);
  assert.equal(stale.signOuts.length, 0, 'Not signed out when nothing was requested');
  assert.ok(button(view, 'Sign in to continue'), 'A stale session leads to signing in again');
  assert.match(view.textContent, /sign in again/i);
  passed('form: a session the server refuses asks to sign in again');

  const failing = client();
  failing.reply = { data: null, error: { context: { json: async () => ({ code: 'FAILED', error: 'Your request could not be saved. Please try again, or email sellio@apptelier.sg.' }) } } };
  globalThis.__sellioTestClient = failing;
  view = await mount({});
  await type(view.querySelector('#deletion-confirmation'), 'DELETE');
  await submit(view);
  assert.match(view.querySelector('[role="alert"]').textContent, /could not be saved/);
  assert.ok(view.querySelector('form'), 'The form stays to try again');
  assert.equal(failing.signOuts.length, 0);
  const offline = client();
  offline.reply = { data: null, error: { message: 'Failed to send a request to the Edge Function', context: new Error('network') } };
  globalThis.__sellioTestClient = offline;
  view = await mount({});
  await type(view.querySelector('#deletion-confirmation'), 'DELETE');
  await submit(view);
  assert.match(view.querySelector('[role="alert"]').textContent, /didn't go through/);
  passed('form: a failed or unsent request says so and keeps the form');

  for (const root of roots) await act(async () => root.unmount());
  console.log(passes + ' account deletion checks passed.');
} finally {
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
