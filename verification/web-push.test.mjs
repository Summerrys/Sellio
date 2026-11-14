// Browser alerts (14 Nov 2026): the website's settings file (scripts/web-push-config.mjs),
// send-push's messages for browsers and when it leaves them out, the service worker that shows
// them (public/sw.js), and src/lib/webPush.js with src/lib/pushAlerts.js. Nothing real is
// called: Firebase, Supabase, the edge runtime and the browser are stand-ins.
// Run from the app root: node verification/web-push.test.mjs
import assert from 'node:assert/strict';
import { createECDH, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const app = process.cwd();
const temporary = await mkdtemp(path.join(app, '.web-push-verification-'));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const plain = (value) => JSON.parse(JSON.stringify(value));

const mocks = {
  'supabase-js': 'export function createClient(...args) { return globalThis.__edge.createClient(...args); }',
  client: 'export const getSupabase = async () => globalThis.__web.supabase;',
  'firebase-app': [
    'export const initializeApp = (...args) => globalThis.__web.firebase.initializeApp(...args);',
    'export const getApps = () => globalThis.__web.firebase.apps;',
  ].join('\n'),
  'firebase-messaging': [
    'export const isSupported = (...args) => globalThis.__web.firebase.isSupported(...args);',
    'export const getMessaging = (...args) => globalThis.__web.firebase.getMessaging(...args);',
    'export const getToken = (...args) => globalThis.__web.firebase.getToken(...args);',
  ].join('\n'),
  android: "export const pushStatus = async () => 'android';",
};
const standIns = {
  name: 'stand-ins',
  setup(b) {
    const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    route(/^npm:@supabase\/supabase-js@/, 'supabase-js');
    route(/(^|\/)supabaseClient$/, 'client');
    route(/^firebase\/app$/, 'firebase-app');
    route(/^firebase\/messaging$/, 'firebase-messaging');
    route(/lib\/pushNotifications$/, 'android');
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
  },
};
async function bundle(entry, name) {
  const outfile = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node',
    alias: { '@': path.join(app, 'src') }, plugins: [standIns], logLevel: 'silent' });
  return outfile;
}

try {
  // ── 1. The website's settings (scripts/web-push-config.mjs) ─────────────────────────────
  {
    const { webPushConfig, writeWebPushConfig, WEB_PUSH_FILE } = await import(pathToFileURL(path.join(app, 'scripts/web-push-config.mjs')).href);
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const vapidKey = ecdh.getPublicKey().toString('base64url');
    const apiKey = `AIzaSy${'B'.repeat(33)}`;
    const snippet = [
      '// Import the functions you need from the SDKs you need',
      'import { initializeApp } from "firebase/app";',
      "// Your web app's Firebase configuration",
      '// For Firebase JS SDK v7.20.0 and later, measurementId is optional',
      'const firebaseConfig = {',
      `  apiKey: "${apiKey}",`,
      '  authDomain: "sellio-push.firebaseapp.com",',
      '  projectId: "sellio-push",',
      '  storageBucket: "sellio-push.firebasestorage.app",',
      '  messagingSenderId: "123456789012",',
      '  appId: "1:123456789012:web:0a1b2c3d4e5f60718293a4",',
      '  measurementId: "G-ABCDEF1234"',
      '};',
      'const app = initializeApp(firebaseConfig);',
    ].join('\n');
    const expected = { apiKey, projectId: 'sellio-push', messagingSenderId: '123456789012', appId: '1:123456789012:web:0a1b2c3d4e5f60718293a4', vapidKey };
    assert.deepEqual(webPushConfig({ FIREBASE_WEB_CONFIG: snippet, FIREBASE_WEB_PUSH_KEY: vapidKey }), expected);
    assert.deepEqual(webPushConfig({ FIREBASE_WEB_CONFIG: snippet.replace(/\n/g, ' '), FIREBASE_WEB_PUSH_KEY: ` ${vapidKey}\n` }), expected, 'pasted on one line, key with spaces');
    assert.deepEqual(webPushConfig({ FIREBASE_WEB_CONFIG: JSON.stringify(expected), FIREBASE_WEB_PUSH_KEY: vapidKey }), expected, 'as JSON');
    assert.equal(webPushConfig({}), null, 'neither set: off');
    assert.throws(() => webPushConfig({ FIREBASE_WEB_PUSH_KEY: vapidKey }), /FIREBASE_WEB_CONFIG is not/);
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet }), /FIREBASE_WEB_PUSH_KEY is not/);
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet.replace(apiKey, 'AIzaShort'), FIREBASE_WEB_PUSH_KEY: vapidKey }), /apiKey/);
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet.replace('1:123456789012:web:', '1:999999999999:web:'), FIREBASE_WEB_PUSH_KEY: vapidKey }), /different projects/);
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet.replace(':web:', ':android:'), FIREBASE_WEB_PUSH_KEY: vapidKey }), /web appId/, "the Android app's config");
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet, FIREBASE_WEB_PUSH_KEY: ecdh.getPrivateKey().toString('base64url') }), /Web Push public key/, 'the private key');
    const notAPoint = Buffer.from(ecdh.getPublicKey());
    notAPoint[0] = 5;
    assert.throws(() => webPushConfig({ FIREBASE_WEB_CONFIG: snippet, FIREBASE_WEB_PUSH_KEY: notAPoint.toString('base64url') }), /Web Push public key/);

    const logged = console.log;
    console.log = () => {};
    try {
      assert.equal(await writeWebPushConfig(temporary, {}), null);
      await assert.rejects(stat(path.join(temporary, WEB_PUSH_FILE)), 'no file without the settings');
      await writeWebPushConfig(temporary, { FIREBASE_WEB_CONFIG: snippet, FIREBASE_WEB_PUSH_KEY: vapidKey });
    } finally {
      console.log = logged;
    }
    assert.deepEqual(JSON.parse(await readFile(path.join(temporary, WEB_PUSH_FILE), 'utf8')), expected);
    const buildApp = await readFile(path.join(app, 'scripts/build-app.mjs'), 'utf8');
    assert.match(buildApp.slice(buildApp.indexOf('const LEFT_OUT'), buildApp.indexOf(']);', buildApp.indexOf('const LEFT_OUT'))), /'web-push\.json'/, 'the apps never carry it');
    const pagesOutput = await readFile(path.join(app, 'scripts/pages-output.mjs'), 'utf8');
    assert.match(pagesOutput, /await writeWebPushConfig\('dist'\)/);
    passed('Settings: a pasted firebaseConfig block (JavaScript or JSON) and the Web Push key make web-push.json; missing, off; wrong, the build stops; the apps leave it out');
  }

  // ── 2. send-push: browsers' messages, and none while the person is on Sellio ────────────
  {
    let handler = null;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const env = {
      SUPABASE_URL: 'https://sb.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'sellio-push', client_email: 'push@sellio-push.iam.gserviceaccount.com', private_key: privateKey }),
    };
    globalThis.Deno = { env: { get: (name) => env[name] }, serve: (callback) => { handler = callback; } };
    const edge = { payload: null, presence: null, email: 'Buyer@Example.com', lookups: [], deleted: [], fcm: [], failLookups: false, answer: () => ({ status: 200, body: { name: 'projects/sellio-push/messages/1' } }) };
    const query = (table) => {
      const q = { table, filters: [] };
      const api = {
        select() { return api; },
        delete() { q.op = 'delete'; return api; },
        eq(column, value) { q.filters.push([column, value]); return api; },
        in(column, values) { edge.deleted.push(...values); return Promise.resolve({ error: null }); },
        async maybeSingle() {
          edge.lookups.push(q);
          if (edge.failLookups) throw new Error('lookup failed');
          if (table === 'notifications') return { data: { user_email: edge.email }, error: null };
          if (table === 'user_presence') return { data: edge.presence, error: null };
          return { data: null, error: null };
        },
      };
      return api;
    };
    globalThis.__edge = { createClient: () => ({ rpc: async () => ({ data: edge.payload, error: null }), from: query }) };
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      if (href === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'google-token', expires_in: 3600 }), { status: 200 });
      if (href === 'https://fcm.googleapis.com/v1/projects/sellio-push/messages:send') {
        const { message } = JSON.parse(init.body);
        edge.fcm.push(message);
        const { status, body } = edge.answer(message);
        return new Response(JSON.stringify(body), { status });
      }
      throw new Error(`unexpected fetch ${href}`);
    };
    await import(pathToFileURL(await bundle(path.join(app, 'supabase/functions/send-push/index.ts'), 'send-push')).href);
    assert.equal(typeof handler, 'function');

    const ANDROID = { token: 'android-token-aaaaaaaaaaaaaaaaaaaa', platform: 'android' };
    const BROWSER = { token: 'web-token-bbbbbbbbbbbbbbbbbbbbbbbb', platform: 'web' };
    const chat = (devices) => ({ ok: true, found: true, devices, notification: {
      id: 'n-1', type: 'chat_message', title: 'New message about Watch', message: 'Perfect Five: Hello there',
      link: '/explore/chats/c-1', data: { conversation_id: 'c-1' }, priority: 'normal', is_read: false } });
    const send = async (payload, { presence = null } = {}) => {
      Object.assign(edge, { payload, presence, lookups: [], deleted: [], fcm: [] });
      const logged = console.log;
      console.log = () => {};
      try {
        const res = await handler(new Request('https://fn.invalid/send-push', {
          method: 'POST', headers: { 'x-sellio-push': 'a'.repeat(64), 'content-type': 'application/json' },
          body: JSON.stringify({ notification_id: 'n-1' }),
        }));
        return { status: res.status, body: await res.json() };
      } finally {
        console.log = logged;
      }
    };
    const to = (token) => edge.fcm.find((m) => m.token === token);
    const now = () => new Date().toISOString();

    let r = await send(chat([ANDROID, BROWSER]));
    assert.deepEqual(r, { status: 200, body: { sent: 2, failed: 0, removed: 0 } });
    assert.deepEqual(to(ANDROID.token), {
      notification: { title: 'New message about Watch', body: 'Perfect Five: Hello there' },
      data: { notification_id: 'n-1', type: 'chat_message', link: '/explore/chats/c-1' },
      android: { priority: 'HIGH', ttl: '86400s', notification: { channel_id: 'messages', tag: 'chat:c-1', notification_priority: 'PRIORITY_HIGH', default_sound: true, default_vibrate_timings: true } },
      token: ANDROID.token,
    }, 'the Android message is as before');
    assert.deepEqual(to(BROWSER.token), {
      data: { notification_id: 'n-1', type: 'chat_message', link: '/explore/chats/c-1', title: 'New message about Watch', body: 'Perfect Five: Hello there', tag: 'chat:c-1' },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } },
      token: BROWSER.token,
    }, 'a browser gets data only: its service worker shows it');
    assert.deepEqual(edge.lookups.map((q) => [q.table, q.filters]), [['notifications', [['id', 'n-1']]], ['user_presence', [['email', 'buyer@example.com']]]]);
    passed('send-push: an Android phone gets the same message as before; a browser gets the alert as data, high urgency, kept a day');

    r = await send(chat([ANDROID, BROWSER]), { presence: { online: true, last_seen_at: now() } });
    assert.deepEqual(r.body, { sent: 1, failed: 0, removed: 0 });
    assert.deepEqual(edge.fcm.map((m) => m.token), [ANDROID.token], 'on Sellio now: browsers left out, the phone as before');
    r = await send(chat([BROWSER]), { presence: { online: true, last_seen_at: now() } });
    assert.deepEqual(r.body, { sent: 0, reason: 'on_sellio' });
    assert.equal(edge.fcm.length, 0);
    for (const presence of [{ online: true, last_seen_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() }, { online: false, last_seen_at: now() }, null]) {
      r = await send(chat([BROWSER]), { presence });
      assert.deepEqual(edge.fcm.map((m) => m.token), [BROWSER.token], `not on Sellio (${JSON.stringify(presence)}): sent`);
    }
    edge.failLookups = true;
    r = await send(chat([BROWSER]));
    edge.failLookups = false;
    assert.deepEqual(edge.fcm.map((m) => m.token), [BROWSER.token], 'presence unknown: sent');
    r = await send(chat([ANDROID]), { presence: { online: true, last_seen_at: now() } });
    assert.deepEqual(edge.lookups, [], 'no browser: no presence lookup');
    assert.deepEqual(edge.fcm.map((m) => m.token), [ANDROID.token], 'phones get it whether or not the person is on Sellio');
    passed('send-push: while the person is on Sellio (a ping in the last 2 minutes, not left) browsers get nothing; otherwise, or when unknown, they do');

    const order = chat([BROWSER]);
    Object.assign(order.notification, { type: 'new_order', data: { order_id: 'o-1' }, link: '/Orders' });
    await send(order);
    assert.deepEqual(to(BROWSER.token).webpush, { headers: { Urgency: 'high', TTL: '3600' } });
    assert.equal(to(BROWSER.token).data.tag, 'order:o-1');
    const rating = chat([BROWSER]);
    Object.assign(rating.notification, { type: 'new_rating', data: {}, link: 'https://evil.example/' });
    await send(rating);
    assert.deepEqual(to(BROWSER.token).webpush, { headers: { Urgency: 'normal', TTL: '86400' } });
    assert.equal(to(BROWSER.token).data.tag, 'n:n-1');
    assert.equal(to(BROWSER.token).data.link, '/Notifications', "Sellio's own pages only");
    edge.answer = (message) => (message.token === BROWSER.token
      ? { status: 404, body: { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] } } }
      : { status: 200, body: {} });
    r = await send(chat([ANDROID, BROWSER]));
    assert.deepEqual(r.body, { sent: 1, failed: 1, removed: 1 });
    assert.deepEqual(edge.deleted, [BROWSER.token], 'a browser that unsubscribed is taken off, as a phone is');
    passed('send-push: new orders are kept an hour, other news is normal urgency, links stay on Sellio, and a dead browser token is removed');
    delete globalThis.Deno;
  }

  // ── 3. The service worker (public/sw.js) ─────────────────────────────────────────────────
  {
    const source = await readFile(path.join(app, 'public/sw.js'), 'utf8');
    const worker = (windows = []) => {
      const handlers = {};
      const shown = [];
      const opened = [];
      let looked = 0;
      const sandbox = {
        URL, console,
        fetch: async () => new Response('ok'),
        location: new URL('https://sellio.sg/sw.js'),
        addEventListener: (type, callback) => { handlers[type] = callback; },
        skipWaiting: () => {},
        clients: {
          claim: async () => {},
          matchAll: async () => { looked++; return windows; },
          openWindow: async (href) => { opened.push(href); return null; },
        },
        registration: { showNotification: async (title, options) => { shown.push(plain({ title, options })); } },
      };
      sandbox.self = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(source, sandbox, { filename: 'sw.js' });
      return { handlers, shown, opened, looked: () => looked };
    };
    const push = async (sw, data) => {
      const event = { data, waitUntil(promise) { event.done = promise; } };
      sw.handlers.push(event);
      await event.done;
    };
    const json = (payload) => ({ json: () => payload });
    const fcm = (data) => json({ data, from: '123456789012', priority: 'high', fcmMessageId: 'm-1' });

    let sw = worker([{ url: 'https://sellio.sg/explore/chats/c-1', focused: true, visibilityState: 'visible' }]);
    assert.deepEqual(Object.keys(sw.handlers).sort(), ['activate', 'fetch', 'install', 'notificationclick', 'push']);
    await push(sw, fcm({ title: 'New message about Watch', body: 'Perfect Five: Hello', link: '/explore/chats/c-1', tag: 'chat:c-1', notification_id: 'n-1', type: 'chat_message' }));
    assert.deepEqual(sw.shown, [{ title: 'New message about Watch', options: {
      body: 'Perfect Five: Hello', icon: '/icons/sellio-pwa-192.png', tag: 'chat:c-1', renotify: true, data: { link: '/explore/chats/c-1', id: 'n-1' } } }]);
    assert.equal(sw.looked(), 0, 'shown straight away, even with Sellio in use (Safari ends alerts after three not shown)');

    sw = worker();
    await push(sw, json({ notification: { title: 'Order ready', body: 'Pick it up' } }));
    await push(sw, null);
    await push(sw, { json: () => { throw new SyntaxError('not JSON'); } });
    await push(sw, fcm({ title: `  ${'T'.repeat(150)} `, body: 'line one\n\nline   two', link: '//evil.example/x', notification_id: '<b>' }));
    await push(sw, fcm({ title: 'x', link: 'https://evil.example/' }));
    assert.deepEqual(sw.shown.map((s) => s.title), ['Order ready', 'Sellio', 'Sellio', 'T'.repeat(100), 'x']);
    assert.deepEqual(sw.shown[0].options, { body: 'Pick it up', icon: '/icons/sellio-pwa-192.png', data: { link: '/Notifications', id: '' } }, 'no tag: nothing to replace');
    assert.equal(sw.shown[3].options.body, 'line one line two');
    assert.deepEqual(sw.shown[3].options.data, { link: '/Notifications', id: '' }, "another site's address and an odd id are dropped");
    assert.equal(sw.shown[4].options.data.link, '/Notifications');
    passed('Service worker: every alert is shown at once (title, text, tag, page), even while Sellio is in use; other sites\' links and odd data are dropped');

    const click = async (sw, data) => {
      let closed = false;
      const event = { notification: { data, close: () => { closed = true; } }, waitUntil(promise) { event.done = promise; } };
      sw.handlers.notificationclick(event);
      await event.done;
      return closed;
    };
    const tab = (url, { fails = false } = {}) => {
      const t = { url, focused: 0, messages: [] };
      t.focus = async () => { t.focused++; if (fails) throw new Error('not allowed'); return t; };
      t.postMessage = (message) => t.messages.push(plain(message));
      return t;
    };
    let same = tab('https://sellio.sg/explore/chats/c-1');
    let other = tab('https://sellio.sg/KitchenDisplay');
    sw = worker([other, same]);
    assert.equal(await click(sw, { link: '/explore/chats/c-1', id: 'n-1' }), true, 'the alert closes');
    assert.equal(same.focused, 1);
    assert.deepEqual(same.messages, [{ type: 'sellio:alert-opened', id: 'n-1' }], 'that window marks it read');
    assert.equal(other.focused, 0, 'a window on another page is left alone');
    assert.deepEqual(sw.opened, []);

    other = tab('https://sellio.sg/KitchenDisplay');
    sw = worker([other, tab('https://elsewhere.example/explore/chats/c-1')]);
    await click(sw, { link: '/explore/chats/c-1', id: 'n-1' });
    assert.deepEqual(sw.opened, ['https://sellio.sg/explore/chats/c-1?sellio_alert=n-1']);
    assert.equal(other.focused, 0);

    sw = worker([tab('https://sellio.sg/Chats?c=c-2')]);
    await click(sw, { link: '/Chats?c=c-1', id: 'n-1' });
    await click(sw, { link: '/Orders', id: '' });
    await click(sw, { link: '//evil.example', id: 'n-2' });
    assert.deepEqual(sw.opened, ['https://sellio.sg/Chats?c=c-1&sellio_alert=n-1', 'https://sellio.sg/Orders', 'https://sellio.sg/Notifications?sellio_alert=n-2']);

    same = tab('https://sellio.sg/Orders', { fails: true });
    sw = worker([same]);
    await click(sw, { link: '/Orders', id: 'n-3' });
    assert.deepEqual(sw.opened, ['https://sellio.sg/Orders?sellio_alert=n-3'], "a window that can't come to the front: a new one");
    same = tab('https://sellio.sg/Orders');
    sw = worker([same]);
    await click(sw, { link: '/Orders' });
    assert.equal(same.focused, 1);
    assert.deepEqual(same.messages, [], 'no id: nothing to mark');
    passed('Service worker: opening an alert brings a Sellio window already on that page to the front, otherwise opens the page (with the alert to mark read); a window on another page is left alone');
  }

  // ── 4. webPush.js and pushAlerts.js ──────────────────────────────────────────────────────
  {
    const entry = path.join(temporary, 'web-entry.mjs');
    await (await import('node:fs/promises')).writeFile(entry, [
      `export * as webPush from ${JSON.stringify(path.join(app, 'src/lib/webPush.js'))};`,
      `export * as pushAlerts from ${JSON.stringify(path.join(app, 'src/lib/pushAlerts.js'))};`,
    ].join('\n'));
    const webBundle = await bundle(entry, 'web');
    let copies = 0;
    const fresh = () => import(`${pathToFileURL(webBundle).href}?copy=${++copies}`);

    // The page: storage, events, address; the browser's Notification, push and service worker.
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    const page = new EventTarget();
    let changes = 0;
    page.addEventListener('sellio:push-changed', () => { changes++; });
    const history = { state: { idx: 4 }, calls: [], replaceState(state, title, url) { this.calls.push([state, url]); } };
    const registration = { active: {} };
    const workers = { registered: [] };
    const Notification = { permission: 'default', answer: 'granted', asked: 0, requestPermission() { Notification.asked++; Notification.permission = Notification.answer; return Promise.resolve(Notification.answer); } };
    globalThis.window = {
      addEventListener: page.addEventListener.bind(page), removeEventListener: page.removeEventListener.bind(page),
      dispatchEvent: page.dispatchEvent.bind(page),
      location: { href: 'https://sellio.sg/explore' }, history,
      Notification, PushManager: function PushManager() {}, indexedDB: {},
    };
    globalThis.Notification = Notification;
    globalThis.ServiceWorkerRegistration = function ServiceWorkerRegistration() {};
    globalThis.ServiceWorkerRegistration.prototype.showNotification = () => {};
    globalThis.PushSubscription = function PushSubscription() {};
    globalThis.PushSubscription.prototype.getKey = () => null;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      cookieEnabled: true,
      serviceWorker: { register: async (url) => { workers.registered.push(url); return registration; }, ready: Promise.resolve(registration) },
    } });
    const SETTINGS = { apiKey: `AIzaSy${'C'.repeat(33)}`, projectId: 'sellio-push', messagingSenderId: '123456789012', appId: '1:123456789012:web:abcdef012345', vapidKey: 'B'.repeat(87) };
    let settingsAnswer = { status: 404 };
    const fetched = [];
    globalThis.fetch = async (url, init) => {
      fetched.push([String(url), plain(init)]);
      if (settingsAnswer.offline) throw new TypeError('Failed to fetch');
      return new Response(settingsAnswer.body ? JSON.stringify(settingsAnswer.body) : 'Not found', { status: settingsAnswer.status });
    };
    const web = { rpcs: [], updates: [], session: null, fail: () => null, auth: null };
    web.supabase = {
      auth: {
        getSession: async () => ({ data: { session: web.session } }),
        onAuthStateChange: (callback) => { web.auth = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      },
      rpc: async (name, params) => { web.rpcs.push({ name, params }); return { error: web.fail(name) }; },
      from: (table) => ({ update: (values) => ({ eq: async (column, value) => { web.updates.push({ table, values, column, value }); return { error: null }; } }) }),
    };
    web.firebase = {
      apps: [], inits: [], tokenCalls: [], supported: true, token: `fcm-web-${'d'.repeat(40)}`, tokenError: null,
      initializeApp(config, name) { const made = { name }; web.firebase.apps.push(made); web.firebase.inits.push({ config, name }); return made; },
      isSupported: async () => web.firebase.supported,
      getMessaging: (made) => ({ made }),
      getToken: async (messaging, options) => { web.firebase.tokenCalls.push(options); if (web.firebase.tokenError) throw web.firebase.tokenError; return web.firebase.token; },
    };
    globalThis.__web = web;
    const reset = ({ permission = 'default', answer = 'granted', session = { user: { id: 'u-1' } }, settings = SETTINGS } = {}) => {
      store.clear();
      Object.assign(Notification, { permission, answer, asked: 0 });
      settingsAnswer = settings ? { status: 200, body: settings } : { status: 404 };
      fetched.length = 0;
      Object.assign(web, { rpcs: [], updates: [], session, fail: () => null, auth: null });
      Object.assign(web.firebase, { apps: [], inits: [], tokenCalls: [], supported: true, tokenError: null });
      workers.registered.length = 0;
      changes = 0;
    };
    const rpcNames = () => web.rpcs.map((c) => c.name);

    // pushAlerts.js: which alerts, which words, the opened alert.
    let { pushAlerts } = await fresh();
    const browserLike = { navigator: { serviceWorker: {} }, Notification: {}, PushManager: {} };
    assert.equal(pushAlerts.alertsKind({ ...browserLike, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }), 'android');
    assert.equal(pushAlerts.alertsKind({ ...browserLike, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }), '', 'the iPhone app: none yet');
    assert.equal(pushAlerts.alertsKind({ ...browserLike, ReactNativeWebView: { postMessage() {} } }), '', "Base44's old app: none");
    assert.equal(pushAlerts.alertsKind(browserLike), 'web');
    assert.equal(pushAlerts.alertsKind({ navigator: {}, Notification: {} }), '', 'no push in this browser (a Safari tab on iPhone)');
    assert.equal(pushAlerts.alertsKind(undefined), '');
    assert.equal(await (await pushAlerts.loadAlerts('android')).pushStatus(), 'android');
    assert.equal(typeof (await pushAlerts.loadAlerts('web')).ask, 'function');
    await assert.rejects(pushAlerts.loadAlerts(''), /No alerts/);
    assert.equal(pushAlerts.alertWords('web').button, 'Turn on browser alerts');
    assert.equal(pushAlerts.alertWords('android').button, 'Turn on phone alerts');
    assert.match(pushAlerts.alertWords('web').settings, /browser's settings/);
    assert.match(pushAlerts.alertWords('android').settings, /Apps → Sellio → Notifications/);

    window.location.href = 'https://sellio.sg/explore/chats/c-1?x=1&sellio_alert=n-1#end';
    assert.equal(pushAlerts.takeOpenedAlert(), 'n-1');
    assert.deepEqual(history.calls, [[{ idx: 4 }, '/explore/chats/c-1?x=1#end']], 'the id comes off the address; the rest and the history entry stay');
    history.calls.length = 0;
    window.location.href = 'https://sellio.sg/Orders';
    assert.equal(pushAlerts.takeOpenedAlert(), null);
    assert.deepEqual(history.calls, [], 'no alert: the address is left alone');
    window.location.href = 'https://sellio.sg/Orders?sellio_alert=%3Cb%3E';
    assert.equal(pushAlerts.takeOpenedAlert(), null, 'an odd id is dropped');
    assert.deepEqual(history.calls, [[{ idx: 4 }, '/Orders']]);
    passed('pushAlerts: the Android app and browsers that can show alerts get them (not the iPhone app yet, Base44 or a Safari tab on iPhone); an opened alert comes off the address');

    // No settings for the site: nothing is offered and Firebase is never loaded.
    reset({ settings: null });
    let { webPush } = await fresh();
    assert.equal(await webPush.pushStatus(), 'unavailable');
    assert.equal(await webPush.shouldAsk(), false);
    assert.equal(await webPush.register({ force: true }), false);
    assert.deepEqual(fetched[0], ['/web-push.json', { cache: 'no-cache', credentials: 'same-origin' }]);
    assert.deepEqual(web.firebase.inits, []);
    assert.deepEqual(web.rpcs, []);
    reset();
    settingsAnswer = { offline: true };
    ({ webPush } = await fresh());
    assert.equal(await webPush.pushStatus(), 'unavailable', 'offline: not now');
    settingsAnswer = { status: 200, body: SETTINGS };
    assert.equal(await webPush.pushStatus(), 'off', 'and read again next time');
    reset({ settings: { ...SETTINGS, appId: '' } });
    ({ webPush } = await fresh());
    assert.equal(await webPush.pushStatus(), 'unavailable', 'incomplete settings');
    passed('webPush: without the site\'s settings (or with incomplete ones) no browser is offered alerts and Firebase never loads; offline, the settings are read again later');

    // Asking: signed in only, not after Not now, and the browser asked first thing.
    reset({ session: null });
    ({ webPush } = await fresh());
    assert.equal(await webPush.pushStatus(), 'off');
    assert.equal(await webPush.shouldAsk(), false, 'signed out: not asked');
    web.session = { user: { id: 'u-1' } };
    assert.equal(await webPush.shouldAsk(), true);
    webPush.askLater(30);
    assert.equal(await webPush.shouldAsk(), false, 'Not now: not for 30 days');
    assert.ok(Math.abs(Number(store.get('sellio.webpush.askAfter')) - (Date.now() + 30 * 864e5)) < 5000);
    reset();
    ({ webPush } = await fresh());
    const answer = webPush.ask();
    assert.equal(Notification.asked, 1, "the browser's question comes first, during the click");
    assert.equal(await answer, true);
    assert.deepEqual(web.firebase.inits, [{ config: { apiKey: SETTINGS.apiKey, projectId: 'sellio-push', messagingSenderId: '123456789012', appId: SETTINGS.appId }, name: 'sellio-web-push' }]);
    assert.equal(web.firebase.tokenCalls.length, 1);
    assert.equal(web.firebase.tokenCalls[0].vapidKey, SETTINGS.vapidKey);
    assert.equal(web.firebase.tokenCalls[0].serviceWorkerRegistration, registration, "on the site's own service worker");
    assert.deepEqual(workers.registered, ['/sw.js']);
    assert.deepEqual(web.rpcs, [{ name: 'register_push_device', params: { p_token: web.firebase.token, p_platform: 'web', p_app_version: 'web Chrome Windows' } }]);
    assert.deepEqual(JSON.parse(store.get('sellio.webpush.device')), { token: web.firebase.token, userId: 'u-1' });
    assert.ok(changes >= 1, 'the account panel hears of it');
    assert.equal(await webPush.pushStatus(), 'on');
    assert.equal(typeof web.auth, 'function', 'it follows sign-in and sign-out from now on');
    assert.equal(await webPush.register(), true);
    web.auth('SIGNED_IN', web.session);
    await settle();
    assert.deepEqual(rpcNames(), ['register_push_device'], 'registered a moment ago: not again');
    passed('webPush: offered when signed in (not after Not now); Turn on asks the browser first, then registers this browser for the account on the site\'s own service worker');

    // Signing out takes the browser off; offline, at the next start.
    web.session = null;
    web.auth('SIGNED_OUT', null);
    await settle();
    assert.deepEqual(web.rpcs.at(-1), { name: 'unregister_push_device', params: { p_token: web.firebase.token } });
    assert.equal(store.has('sellio.webpush.device'), false);
    web.session = { user: { id: 'u-2' } };
    assert.equal(await webPush.register({ force: true }), true);
    assert.equal(web.rpcs.at(-1).name, 'register_push_device', 'the next account to sign in gets this browser');
    web.fail = (name) => (name === 'unregister_push_device' ? { message: 'Failed to fetch' } : null);
    web.session = null;
    web.auth('SIGNED_OUT', null);
    await settle();
    assert.equal(JSON.parse(store.get('sellio.webpush.forget')), web.firebase.token, 'offline: remembered');
    web.fail = () => null;
    web.auth('INITIAL_SESSION', null);
    await settle();
    assert.deepEqual(web.rpcs.at(-1), { name: 'unregister_push_device', params: { p_token: web.firebase.token } });
    assert.equal(store.has('sellio.webpush.forget'), false, 'and taken off at the next start');
    passed('webPush: signing out takes this browser off the account (offline: at the next start), and the next account to sign in gets it');

    // Told no, allowed already, and when Firebase can't.
    reset({ answer: 'denied' });
    ({ webPush } = await fresh());
    assert.equal(await webPush.ask(), false);
    assert.equal(await webPush.pushStatus(), 'blocked');
    assert.equal(await webPush.shouldAsk(), false, "only the browser's settings can allow them now");
    assert.deepEqual(web.rpcs, []);
    reset({ permission: 'granted' });
    ({ webPush } = await fresh());
    assert.equal(await webPush.shouldAsk(), false, 'allowed already: not asked…');
    await settle();
    assert.deepEqual(rpcNames(), ['register_push_device'], '…but registered');
    reset({ permission: 'granted' });
    ({ webPush } = await fresh());
    web.firebase.tokenError = Object.assign(new Error('Request is missing required authentication credential'), { code: 'messaging/token-subscribe-failed' });
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => warned.push(args.join(' '));
    try {
      assert.equal(await webPush.register({ force: true }), false);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(web.rpcs, []);
    assert.equal(warned.length, 1);
    assert.match(warned[0], /no token from Firebase messaging\/token-subscribe-failed/);
    reset({ permission: 'granted' });
    ({ webPush } = await fresh());
    web.firebase.supported = false;
    assert.equal(await webPush.register({ force: true }), false);
    assert.deepEqual(web.firebase.tokenCalls, [], "a browser Firebase can't serve: no token asked for");
    passed('webPush: told no, it stays blocked; allowed already, the browser is registered without asking; when Firebase gives no token it says why in the console and registers nothing');

    // An opened alert is marked read.
    reset();
    ({ webPush } = await fresh());
    assert.equal(await webPush.markAlertRead('n-1'), true);
    assert.equal(web.updates.length, 1);
    assert.equal(web.updates[0].table, 'notifications');
    assert.equal(web.updates[0].values.is_read, true);
    assert.ok(!Number.isNaN(Date.parse(web.updates[0].values.read_at)));
    assert.deepEqual([web.updates[0].column, web.updates[0].value], ['id', 'n-1']);
    web.session = null;
    assert.equal(await webPush.markAlertRead('n-2'), false);
    assert.equal(await webPush.markAlertRead(''), false);
    assert.equal(web.updates.length, 1);
    passed('webPush: an alert opened from the browser is marked read for the signed-in person');
  }

  console.log(`\n${passes} browser alert checks passed.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
