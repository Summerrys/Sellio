// "Welcome back!" after signing in: the sign-in page leaves the message (src/lib/signInWelcome.js)
// and the page the sign-in opens shows it once on screen, after the app's launch splash
// (src/components/auth/SignInWelcome.jsx). The sign-in pages' own part is checked in
// phone-signin.dom.mjs and mobile-oauth.dom.mjs.
// Run: node verification/sign-in-welcome.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { noteSignInWelcome, hasSignInWelcome, takeSignInWelcome } from '../src/lib/signInWelcome.js';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://localhost/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'DocumentFragment', 'Node', 'Event', 'MutationObserver',
  'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const KEY = 'sellio-sign-in-welcome';
const LAUNCH_KEY = 'sellio-launch'; // src/lib/appLaunch.js
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

// The message itself.
{
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const t = 1_000_000;
  noteSignInWelcome('Welcome back!', storage, t);
  assert.equal(hasSignInWelcome(storage, t + 5000), true);
  assert.equal(hasSignInWelcome(storage, t + 5000), true, 'looking does not use it up');
  assert.equal(takeSignInWelcome(storage, t + 5000), 'Welcome back!');
  assert.equal(takeSignInWelcome(storage, t + 5000), null, 'shown once');
  noteSignInWelcome('Welcome back!', storage, t);
  assert.equal(hasSignInWelcome(storage, t + 30000), false, 'too old for this page load');
  assert.equal(takeSignInWelcome(storage, t + 30000), null);
  assert.equal(store.has(KEY), false, 'an old one is dropped when taken');
  noteSignInWelcome('Welcome back!', storage, t + 60000);
  assert.equal(takeSignInWelcome(storage, t), null, 'a clock that went back counts as old');
  store.set(KEY, '{not json');
  assert.equal(hasSignInWelcome(storage, t), false);
  assert.equal(takeSignInWelcome(storage, t), null);
  store.set(KEY, JSON.stringify({ message: '', at: t }));
  assert.equal(takeSignInWelcome(storage, t), null, 'no empty message');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  noteSignInWelcome('Welcome back!', broken, t);
  assert.equal(hasSignInWelcome(broken, t), false);
  assert.equal(takeSignInWelcome(broken, t), null);
  passed('The message is kept for one page load (30 seconds), shown once, and blocked storage only means no message');
}

// The page it opens.
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-sign-in-welcome-'));
const mock = { name: 'sign-in-welcome-fixtures', setup(builder) {
  builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js',
    contents: 'export const toast = { custom: (render, options) => { globalThis.toasts.push({ render, options }); }, error() {}, success() {} };' }));
} };
const outfile = path.join(tmp, 'welcome.mjs');
await build({ entryPoints: ['src/components/auth/SignInWelcome.jsx'], outfile, bundle: true, packages: 'external', format: 'esm',
  platform: 'node', jsx: 'automatic', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent' });
// React and lucide-react resolve from the app, not /tmp.
const local = path.join(process.cwd(), '.sign-in-welcome.mjs');
await copyFile(outfile, local);
const { default: SignInWelcome } = await import(pathToFileURL(local));

const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const mount = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SignInWelcome)); });
  return { close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
const cardText = async (shown) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => { root.render(shown.render('toast-id')); });
  const text = container.textContent;
  await act(async () => root.unmount());
  return text;
};
const reset = () => { win.sessionStorage.clear(); globalThis.toasts = []; };

try {
  reset();
  let page = await mount();
  await wait(300);
  assert.equal(globalThis.toasts.length, 0, 'nothing when no sign-in just happened');
  await page.close();
  passed('An ordinary page load shows nothing');

  reset();
  noteSignInWelcome('Welcome back!');
  page = await mount();
  await wait(250);
  assert.equal(globalThis.toasts.length, 1, 'shown once the page is up');
  const text = await cardText(globalThis.toasts[0]);
  assert.match(text, /Welcome back!/);
  assert.match(text, /You’re all set\.|You're all set\./);
  assert.doesNotMatch(text, /Redirecting/, 'this page is where they were going');
  assert.equal(win.sessionStorage.getItem(KEY), null, 'used up');
  await wait(300);
  assert.equal(globalThis.toasts.length, 1, 'only once');
  await page.close();
  page = await mount();
  await wait(250);
  assert.equal(globalThis.toasts.length, 1, 'not again on the next page load');
  await page.close();
  passed('The page a sign-in opens shows Welcome back! once (on a website: straight away)');

  reset();
  noteSignInWelcome('Welcome back!');
  win.sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ start: Date.now(), done: false }));
  page = await mount();
  await wait(450);
  assert.equal(globalThis.toasts.length, 0, 'not under the app\'s splash');
  assert.ok(win.sessionStorage.getItem(KEY), 'kept while the splash is up (a reload then still shows it)');
  win.sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ start: Date.now() - 2000, done: true }));
  await wait(250);
  assert.equal(globalThis.toasts.length, 1, 'shown as the splash goes');
  await page.close();
  passed('In the app it waits for the launch splash to go');

  reset();
  noteSignInWelcome('Welcome back!');
  win.sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ start: Date.now(), done: false }));
  page = await mount();
  await wait(150);
  await page.close();
  win.sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ start: Date.now() - 2000, done: true }));
  await wait(250);
  assert.equal(globalThis.toasts.length, 0, 'a page that went away shows nothing');
  assert.ok(win.sessionStorage.getItem(KEY), 'the next page load still can');
  passed('A page that goes before showing it leaves it for the next one');

  console.log(passes + ' sign-in welcome checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
