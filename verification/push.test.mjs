// Checks src/lib/pushNotifications.js (the Android app's push alerts) with a stand-in for the
// Firebase plugin, the App plugin and Supabase: no phone, no network, no real account.
// Run: node verification/push.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = `
const mocks = {
  '@capacitor-firebase/messaging': 'export const FirebaseMessaging = globalThis.__push.firebase;',
  '@capacitor/app': 'export const App = globalThis.__push.app;',
  './supabaseClient': 'export const getSupabase = async () => globalThis.__push.supabase;',
};
export async function resolve(specifier, context, next) {
  if (mocks[specifier] && context.parentURL && context.parentURL.includes('/src/lib/')) {
    return { url: 'mock:' + specifier, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('mock:')) return { format: 'module', source: mocks[url.slice(5)], shortCircuit: true };
  return next(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks), import.meta.url);

// The page: window events, localStorage and location.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const target = new EventTarget();
const assigned = [];
globalThis.window = {
  addEventListener: target.addEventListener.bind(target),
  removeEventListener: target.removeEventListener.bind(target),
  dispatchEvent: target.dispatchEvent.bind(target),
  location: { pathname: '/Explore', search: '', assign: (to) => assigned.push(to) },
};
const logs = [];
console.info = (line) => logs.push(line);

// Firebase, App and Supabase stand-ins.
const listeners = {};
const channels = [];
const firebase = {
  permission: 'prompt',
  answer: 'granted',
  token: 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa',
  async checkPermissions() { return { receive: this.permission }; },
  async requestPermissions() { this.permission = this.answer; return { receive: this.permission }; },
  async getToken() { if (!this.token) throw new Error('Default FirebaseApp is not initialized'); return { token: this.token }; },
  async createChannel(c) { channels.push(c); },
  async addListener(name, fn) { listeners[name] = fn; return { remove() {} }; },
};
const rpcs = [];
const updates = [];
let session = null;
let authCallback = null;
const supabase = {
  auth: {
    async getSession() { return { data: { session } }; },
    onAuthStateChange(fn) { authCallback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  },
  async rpc(name, args) { rpcs.push({ name, args }); return { data: null, error: null }; },
  from(table) {
    return {
      update(values) {
        return { eq: async (col, val) => { updates.push({ table, values, col, val }); return { error: null }; } };
      },
    };
  },
};
globalThis.__push = { firebase, app: { async getInfo() { return { version: '2.0', build: '110' }; } }, supabase };

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = async (event, s) => { session = s; authCallback(event, s); await tick(20); };
const user = (id, email) => ({ user: { id, email } });
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

const push = await import('../src/lib/pushNotifications.js');
push.startPushNotifications();
await tick(20);

await check('Start: three channels (Orders, Messages high; Other updates default), tap and token listeners', async () => {
  assert.deepEqual(channels.map((c) => [c.id, c.importance]), [['orders', 4], ['messages', 4], ['updates', 3]]);
  assert.ok(listeners.notificationActionPerformed && listeners.tokenReceived);
  assert.ok(logs.includes('Sellio push: ready'));
});

await check('Signed in, notifications not allowed yet: nothing registered', async () => {
  await auth('INITIAL_SESSION', user('u1', 'owner@example.com'));
  assert.equal(rpcs.length, 0);
});

await check('Sellio asks (banner) while Android can still ask; not after Not now', async () => {
  assert.equal(await push.shouldAsk(), true);
  push.askLater(30);
  assert.equal(await push.shouldAsk(), false);
  store.delete('sellio.push.askAfter');
  assert.equal(await push.shouldAsk(), true);
});

await check('Turn on, allowed: the phone is registered for the account (token, android, app version)', async () => {
  assert.equal(await push.askAndroid(), true);
  assert.equal(rpcs.length, 1);
  assert.deepEqual(rpcs[0], { name: 'register_push_device', args: { p_token: firebase.token, p_platform: 'android', p_app_version: '2.0 (110)' } });
  assert.equal(await push.pushStatus(), 'on');
  assert.equal(await push.shouldAsk(), false);
});

await check('Started again soon after: not registered twice', async () => {
  await auth('SIGNED_IN', user('u1', 'owner@example.com'));
  assert.equal(rpcs.filter((r) => r.name === 'register_push_device').length, 1);
});

await check('Firebase gives a new token: registered again with it', async () => {
  firebase.token = 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbb';
  listeners.tokenReceived({ token: firebase.token });
  await tick(20);
  const last = rpcs.at(-1);
  assert.equal(last.name, 'register_push_device');
  assert.equal(last.args.p_token, 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbb');
});

await check('Sign-out: the phone is taken off (with the token it was registered with)', async () => {
  await auth('SIGNED_OUT', null);
  const last = rpcs.at(-1);
  assert.deepEqual(last, { name: 'unregister_push_device', args: { p_token: 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbb' } });
});

await check('Another account signs in on the phone: registered for them', async () => {
  await auth('SIGNED_IN', user('u2', 'buyer@example.com'));
  const last = rpcs.at(-1);
  assert.equal(last.name, 'register_push_device');
  assert.equal(JSON.parse(store.get('sellio.push.device')).userId, 'u2');
});

await check('Signed out: Sellio never asks', async () => {
  await auth('SIGNED_OUT', null);
  firebase.permission = 'prompt';
  assert.equal(await push.shouldAsk(), false);
});

await check('Tapped alert: marked read, then its page opens', async () => {
  listeners.notificationActionPerformed({ actionId: 'tap', notification: { data: { link: '/Orders', notification_id: 'n-1', type: 'new_order' } } });
  await tick(30);
  assert.deepEqual(updates.at(-1).val, 'n-1');
  assert.equal(updates.at(-1).values.is_read, true);
  assert.equal(assigned.at(-1), '/Orders');
});

await check("Tapped alert with a link that isn't Sellio's own page: Notifications instead", async () => {
  for (const link of ['https://evil.example/x', '//evil.example/x', '/\\evil', '', undefined]) {
    listeners.notificationActionPerformed({ notification: { data: { link } } });
    await tick(10);
    assert.equal(assigned.at(-1), '/Notifications', `link ${link}`);
  }
});

await check('Android told no: Turn on reports off; Sellio stops asking once Android won\'t ask again', async () => {
  session = user('u3', 'x@example.com');
  firebase.permission = 'prompt';
  firebase.answer = 'denied';
  assert.equal(await push.askAndroid(), false);
  assert.equal(await push.pushStatus(), 'blocked');
  assert.equal(await push.shouldAsk(), false);
});

await check('A build without Firebase: unavailable, never asks, nothing registered', async () => {
  const before = rpcs.length;
  firebase.token = null;
  // a fresh copy of the module (its token is remembered per app start)
  const fresh = await import('../src/lib/pushNotifications.js?fresh');
  firebase.permission = 'prompt';
  assert.equal(await fresh.pushStatus(), 'unavailable');
  assert.equal(await fresh.shouldAsk(), false);
  assert.equal(rpcs.length, before);
});

console.log(`${passed} push alert checks passed (no phone, no network, no real account).`);
