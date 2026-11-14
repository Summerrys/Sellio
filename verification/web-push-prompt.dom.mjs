// Browser alerts (14 Nov 2026), on screen: Sellio's own question (PushPrompt) in a browser that
// can show alerts and in the Android app, the empty notifications list's Turn on, and where
// nothing is offered. The alert modules (webPush.js, pushNotifications.js) are stand-ins.
// Run: node verification/web-push-prompt.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore/chats/c-1', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event', 'CustomEvent',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;
const h = React.createElement;

// A browser that can show alerts (jsdom has none of these).
const canAlert = (on) => {
  if (on) {
    win.Notification = function Notification() {};
    win.PushManager = function PushManager() {};
    Object.defineProperty(win.navigator, 'serviceWorker', { value: {}, configurable: true });
  } else {
    delete win.Notification;
    delete win.PushManager;
    delete win.navigator.serviceWorker;
  }
};

const fixture = () => ({ module: '', shouldAsk: true, asks: 0, allowed: true, permission: 'granted', status: 'off', later: [], inClick: false, askedInClick: [] });
globalThis.alertFixture = fixture();
globalThis.toasts = [];
const alertModule = (name) => [
  `export const shouldAsk = async () => { globalThis.alertFixture.module = '${name}'; globalThis.alertFixture.asks += 1; return globalThis.alertFixture.shouldAsk; };`,
  'export const ask = () => { globalThis.alertFixture.askedInClick.push(globalThis.alertFixture.inClick); return Promise.resolve(globalThis.alertFixture.allowed); };',
  'export const askLater = (days) => { globalThis.alertFixture.later.push(days); };',
  'export const permission = async () => globalThis.alertFixture.permission;',
  `export const pushStatus = async () => { globalThis.alertFixture.module = '${name}'; return globalThis.alertFixture.status; };`,
].join('\n');

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-web-push-prompt-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as PushPrompt } from '@/components/notifications/PushPrompt';",
  "export { default as NotificationsEmpty } from '@/components/notifications/NotificationsEmpty';",
  "export { offerPushAlerts, OFFER_PUSH_EVENT } from '@/lib/pushOffer';",
].join('\n'));
const mock = { name: 'web-push-prompt-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/webPush$/, 'web');
  route(/lib\/pushNotifications$/, 'android');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: {
    sonner: [
      'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
      'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info") });',
    ].join('\n'),
    web: alertModule('web'),
    android: alertModule('android'),
  }[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
// React and the rest resolve from the app (the same copies this file uses).
const local = path.join(process.cwd(), '.web-push-prompt.mjs');
await copyFile(outfile, local);
let copies = 0;
// A fresh copy: each kind of question is offered once per copy of pushOffer.js.
const fresh = () => import(`${pathToFileURL(local).href}?copy=${++copies}`);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 20) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const mount = async (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
const text = (node) => {
  const parts = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push(c.nodeValue); else { parts.push(' '); walk(c); parts.push(' '); } } };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const button = (root, label) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
// A real click: the alert module's ask() must run while it's going on (browsers only ask then).
const click = (node) => act(async () => {
  assert.ok(node, 'the button is there');
  globalThis.alertFixture.inClick = true;
  node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  globalThis.alertFixture.inClick = false;
});
const banner = () => document.querySelector('[data-sellio-push-prompt]');
const reset = (changes = {}) => { globalThis.alertFixture = { ...fixture(), ...changes }; globalThis.toasts = []; };

try {
  // ── 1. A browser that can show alerts ────────────────────────────────────────────────────
  {
    canAlert(true);
    reset();
    let app = await fresh();
    let view = await mount(h(app.PushPrompt));
    app.offerPushAlerts('chat');
    await wait();
    assert.equal(globalThis.alertFixture.module, 'web', "the browser's alerts (webPush.js)");
    assert.equal(text(banner()), 'Know when they reply Alerts in this browser, even when Sellio is closed Not now Turn on');
    await click(button(view.container, 'Turn on'));
    await wait();
    assert.deepEqual(globalThis.alertFixture.askedInClick, [true], 'asked during the click');
    assert.deepEqual(globalThis.toasts.map((t) => [t.kind, t.message]), [['success', 'Alerts are on for this browser']]);
    assert.equal(banner(), null);
    app.offerPushAlerts('chat');
    await wait();
    assert.equal(globalThis.alertFixture.asks, 1, 'each kind is offered once while Sellio is open');
    await view.close();

    reset({ allowed: false, permission: 'denied' });
    app = await fresh();
    view = await mount(h(app.PushPrompt));
    app.offerPushAlerts('shop');
    await wait();
    assert.equal(text(banner()), 'Get alerts for new orders In this browser, even when Sellio is closed Not now Turn on');
    await click(button(view.container, 'Turn on'));
    await wait();
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ['Alerts stay off']);
    assert.equal(globalThis.toasts[0].options.description, "You can allow them later in your browser's settings for this site.");
    assert.deepEqual(globalThis.alertFixture.later, [30]);
    await view.close();

    reset({ allowed: false, permission: 'granted' });
    app = await fresh();
    view = await mount(h(app.PushPrompt));
    app.offerPushAlerts('order');
    await wait();
    assert.equal(text(banner()), 'Know when your order is ready Alerts in this browser from the shop Not now Turn on');
    await click(button(view.container, 'Turn on'));
    await wait();
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ["Alerts couldn't be turned on just now. Sellio tries again next time you open it."], 'allowed, but not registered: not "stay off"');
    assert.deepEqual(globalThis.alertFixture.later, [], 'and asked again as usual');
    await view.close();

    reset();
    app = await fresh();
    view = await mount(h(app.PushPrompt));
    app.offerPushAlerts('chat');
    await wait();
    await click(button(view.container, 'Not now'));
    assert.deepEqual(globalThis.alertFixture.later, [30]);
    assert.equal(banner(), null);
    reset({ shouldAsk: false });
    app.offerPushAlerts('order');
    await wait();
    assert.equal(banner(), null, 'not when it can\'t help (on already, told no, not set up, Not now)');
    await view.close();
    passed('Browser: "Know when they reply" (and new orders, order ready) in this browser; Turn on asks the browser during the click; told no or not registered, it says which');
  }

  // ── 2. The Android app: as before ───────────────────────────────────────────────────────
  {
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    reset();
    const app = await fresh();
    const view = await mount(h(app.PushPrompt));
    app.offerPushAlerts('shop');
    await wait();
    assert.equal(globalThis.alertFixture.module, 'android');
    assert.equal(text(banner()), 'Get alerts for new orders On this phone, even when Sellio is closed Not now Turn on');
    await click(button(view.container, 'Turn on'));
    await wait();
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ['Alerts are on for this phone']);
    await view.close();
    delete win.Capacitor;
    passed('Android app: the same question on this phone, through pushNotifications.js');
  }

  // ── 3. The empty notifications list ─────────────────────────────────────────────────────
  {
    reset({ status: 'off' });
    let app = await fresh();
    let view = await mount(h(app.NotificationsEmpty));
    await wait();
    await click(button(view.container, 'Turn on browser alerts'));
    await wait();
    assert.deepEqual(globalThis.alertFixture.askedInClick, [true], 'asked during the click (the module was loaded already)');
    assert.deepEqual(globalThis.toasts.map((t) => t.message), ['Alerts are on for this browser']);
    assert.equal(button(view.container, 'Turn on browser alerts'), undefined);
    await view.close();
    for (const status of ['on', 'blocked', 'unavailable']) {
      reset({ status });
      view = await mount(h(app.NotificationsEmpty));
      await wait();
      assert.equal(button(view.container, 'Turn on browser alerts'), undefined, `alerts ${status}: nothing to turn on`);
      await view.close();
    }
    passed('Notifications, empty: Turn on browser alerts while they\'re off');

    // A browser without alerts (or a Safari tab on iPhone): nothing offered anywhere.
    canAlert(false);
    reset({ status: 'off' });
    app = await fresh();
    let offered = 0;
    const count = () => { offered++; };
    win.addEventListener(app.OFFER_PUSH_EVENT, count);
    app.offerPushAlerts('chat');
    win.removeEventListener(app.OFFER_PUSH_EVENT, count);
    assert.equal(offered, 0);
    view = await mount(h(app.NotificationsEmpty));
    await wait();
    assert.equal(view.container.querySelectorAll('button').length, 0);
    assert.equal(globalThis.alertFixture.module, '', 'no alert module loaded');
    await view.close();
    passed('A browser that can\'t show alerts: nothing is offered and no alert module loads');
  }

  console.log(`\nAll ${passes} browser alert screen checks passed.`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
