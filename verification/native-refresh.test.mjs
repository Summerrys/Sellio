// The Android app's own pull to refresh (Alvin, 8 Nov 2026; the honeycomb since that evening).
// The page side: PullToRefresh with lib/nativeRefresh.js, against a stand-in for the app's
// SellioRefresh plugin. The app side: the Android project's pieces fitting together (layout,
// plugin, MainActivity, the native-code fingerprint for live updates), and the pull's own logic
// (honeycomb, ripple, colours, when a finger becomes a pull) compiled and run here with a JDK
// (verification/native-pull/PullChecks.java). The app itself is checked on the emulator
// (android-emulator-check.sh, step 6).
// Run: node verification/native-refresh.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://localhost/Dashboard', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(win, 'devicePixelRatio', { value: 2.625, configurable: true });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;
const h = React.createElement;

// ── A stand-in for the app's SellioRefresh plugin ──────────────────────────────────────
// Like Capacitor's plugin object, it answers to any other name as one of the app's methods,
// `then` included (a promise that resolves to it never settles; 8 Nov, the first emulator run).
const plugin = { touches: [], finishes: 0, removed: 0, listeners: {} };
const methods = {
  async touch(args) { plugin.touches.push(args); },
  async finish() { plugin.finishes++; },
  async addListener(name, callback) {
    plugin.listeners[name] = callback;
    return { remove: async () => { delete plugin.listeners[name]; plugin.removed++; } };
  },
};
globalThis.fakePlugin = new Proxy(methods, {
  get(target, name) {
    if (name in target) return target[name];
    if (name === '$$typeof') return undefined;
    if (name === 'toJSON') return () => ({});
    return () => Promise.reject(new Error(`"SellioRefresh.${String(name)}()" is not implemented on android`));
  },
});
globalThis.registered = [];
globalThis.toasts = [];
const logs = [];
const info = console.info;
console.info = (...args) => { logs.push(args.join(' ')); };
const headers = [{ name: 'SellioRefresh', methods: [{ name: 'touch', rtype: 'promise' }, { name: 'finish', rtype: 'promise' }] }];

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-native-refresh-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as PullToRefresh } from '@/components/ui-custom/PullToRefresh';",
  "export { NATIVE_REFRESH, hasNativeRefresh } from '@/lib/nativeRefresh';",
].join('\n'));
const mock = { name: 'native-refresh-fixtures', setup(b) {
  b.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'core', namespace: 'mock' }));
  b.onResolve({ filter: /^sonner$/ }, () => ({ path: 'sonner', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: {
    core: 'export const registerPlugin = (name) => { globalThis.registered.push(name); return globalThis.fakePlugin; };',
    sonner: [
      'const note = (kind) => (message) => { globalThis.toasts.push({ kind, message }); };',
      'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info") });',
    ].join('\n'),
  }[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.native-refresh.mjs');
await copyFile(outfile, local);
const app = await import(pathToFileURL(local));
const { NATIVE_INPUTS } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/app-update.mjs')));

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); });
// A touch as the phone sends it: the fingers on the screen, and the one that just landed.
const touch = (target, type, { x = 100, y = 300, fingers = 1, cancelable = true } = {}) => {
  const event = new win.Event(type, { bubbles: true, cancelable });
  const finger = { clientX: x, clientY: y };
  const on = type === 'touchend' ? [] : Array.from({ length: fingers }, (_, i) => (i === fingers - 1 ? finger : { clientX: 10, clientY: 10 }));
  Object.defineProperty(event, 'touches', { value: on });
  Object.defineProperty(event, 'changedTouches', { value: [finger] });
  target.dispatchEvent(event);
  return event;
};
const lastAnswer = () => plugin.touches[plugin.touches.length - 1];

function Page() {
  return h('div', null,
    h('header', { className: 'fixed', 'data-testid': 'top-bar' }, 'Sellio'),
    h('p', { 'data-testid': 'plain' }, 'Good afternoon'),
    h('input', { 'data-testid': 'search', 'aria-label': 'Search' }),
    h('div', { 'data-testid': 'list', style: { overflowY: 'auto', height: 100 } }, h('p', { 'data-testid': 'row' }, '#ORD-000128')),
    h('div', { 'data-pull-refresh-block': '', 'data-testid': 'map' }, 'map'));
}
const mount = async (props) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(app.PullToRefresh, props, h(Page))); });
  await flush();
  return { container, rerender: (next) => act(async () => { root.render(h(app.PullToRefresh, next, h(Page))); }), close: async () => { await act(async () => root.unmount()); container.remove(); } };
};
const byId = (container, id) => container.querySelector(`[data-testid="${id}"]`);

try {
  // ── 1. In the Android app with its own pull, the page's own is off ──────────────────
  window.Capacitor = { PluginHeaders: headers };
  assert.equal(app.hasNativeRefresh(), true);
  let pending = null;
  let refreshes = 0;
  const onRefresh = () => { refreshes++; return new Promise((resolve, reject) => { pending = { resolve, reject }; }); };
  const page = await mount({ appWide: true, onRefresh });
  assert.deepEqual(globalThis.registered, ['SellioRefresh'], 'the app\'s plugin is used');
  assert.ok(logs.includes("Sellio refresh: Android's own pull to refresh"), 'it says so in the log');
  assert.equal(!!page.container.querySelector('.sellio-pull-refresh-indicator'), false, 'no circle of the page\'s own');
  const plain = byId(page.container, 'plain');
  touch(plain, 'touchstart', { y: 120 });
  const held = touch(plain, 'touchmove', { y: 320 });
  touch(plain, 'touchend', { y: 320 });
  await flush();
  assert.equal(held.defaultPrevented, false, 'the page never holds a finger\'s moves (Android does the pulling)');
  assert.equal(refreshes, 0, 'a drag on the page doesn\'t refresh by itself');
  passed('In the app, Android\'s own pull replaces the page\'s: no page circle, no held moves');

  // ── 2. At each touch the app is told whether that finger may pull, where it landed ──
  plugin.touches.length = 0;
  touch(plain, 'touchstart', { x: 100, y: 300 });
  assert.deepEqual(lastAnswer(), { allowed: true, x: 262.5, y: 787.5 }, 'allowed, at its place in the app\'s pixels');
  touch(byId(page.container, 'search'), 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not on a text box');
  touch(byId(page.container, 'top-bar'), 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not on the fixed top bar');
  touch(byId(page.container, 'map'), 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not on a map or anything marked data-pull-refresh-block');
  const list = byId(page.container, 'list');
  Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
  Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });
  Object.defineProperty(list, 'scrollTop', { value: 40, writable: true, configurable: true });
  touch(byId(page.container, 'row'), 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not in a list that is scrolled down (it scrolls up first)');
  list.scrollTop = 0;
  touch(byId(page.container, 'row'), 'touchstart');
  assert.equal(lastAnswer().allowed, true, 'the same list at its top: allowed');
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.append(dialog);
  touch(plain, 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not while a window is open');
  dialog.setAttribute('data-reload-ok', '');
  touch(plain, 'touchstart');
  assert.equal(lastAnswer().allowed, true, 'the cookie notice (data-reload-ok) doesn\'t count');
  dialog.remove();
  const portal = document.createElement('p');
  document.body.append(portal);
  touch(portal, 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not outside the page (a window\'s own layer, the update notice)');
  portal.remove();
  touch(plain, 'touchstart', { fingers: 2, x: 200, y: 400 });
  assert.deepEqual(lastAnswer(), { allowed: false, x: 525, y: 1050 }, 'a second finger never pulls');
  await page.rerender({ appWide: true, onRefresh, disabled: true });
  touch(plain, 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'not while the page has pulling turned off');
  await page.rerender({ appWide: true, onRefresh });
  passed('At each touch the app is told whether that finger may pull, by the page\'s own rules, at its place in the app\'s pixels');

  // ── 3. A pull let go: the page refreshes once, then the app's circle goes ───────────
  logs.length = 0;
  const status = page.container.querySelector('.sellio-pull-refresh');
  await act(async () => { plugin.listeners.refresh(); });
  assert.equal(refreshes, 1, 'refreshes');
  assert.ok(logs.includes('Sellio refresh: refreshing'), 'logs "Sellio refresh: refreshing" (the emulator check looks for it)');
  assert.equal(status.getAttribute('aria-busy'), 'true', 'screen readers hear it is refreshing');
  assert.equal(plugin.finishes, 0, 'the circle stays while the page refreshes');
  touch(plain, 'touchstart');
  assert.equal(lastAnswer().allowed, false, 'no new pull while refreshing');
  await act(async () => { plugin.listeners.refresh(); });
  await flush();
  assert.equal(refreshes, 1, 'a second pull while refreshing starts nothing');
  assert.equal(plugin.finishes, 0, 'and its circle stays until the running refresh is done');
  await act(async () => { pending.resolve(); });
  await flush();
  assert.equal(plugin.finishes, 2, 'when it is done, the app is told for both pulls');
  assert.equal(status.getAttribute('aria-busy'), 'false');
  passed('A pull let go refreshes the page once; the circle goes when the refresh is done');

  // ── 4. A refresh that fails says so, and the circle still goes ──────────────────────
  await act(async () => { plugin.listeners.refresh(); });
  await act(async () => { pending.reject(new Error('Please wait for the current action to finish.')); });
  await flush();
  assert.equal(plugin.finishes, 3, 'the circle goes');
  assert.deepEqual(globalThis.toasts.at(-1), { kind: 'error', message: 'Please wait for the current action to finish.' }, 'and the reason shows');
  passed('A refresh that fails shows why, and the app\'s circle still goes');

  // ── 5. Refresh view (keyboard and screen readers) still refreshes ──────────────────
  const button = [...page.container.querySelectorAll('button')].find((b) => b.textContent === 'Refresh view');
  await act(async () => { button.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  assert.equal(refreshes, 3);
  await act(async () => { pending.resolve(); });
  await flush();
  passed('Refresh view (keyboard, screen readers) still refreshes');

  // ── 6. Leaving: the page stops answering and listening ─────────────────────────────
  const answers = plugin.touches.length;
  await page.close();
  assert.equal(plugin.removed, 1, 'stops listening for pulls');
  touch(document.body, 'touchstart');
  assert.equal(plugin.touches.length, answers, 'no more answers');
  passed('A page that goes stops listening and answering');

  // ── 7. The website, the iPhone app and older Android builds keep the page's own pull ─
  delete window.Capacitor;
  assert.equal(app.hasNativeRefresh(), false);
  window.Capacitor = { PluginHeaders: [{ name: 'App', methods: [] }] };
  assert.equal(app.hasNativeRefresh(), false, 'an app without the plugin');
  globalThis.registered.length = 0;
  plugin.touches.length = 0;
  let webRefreshes = 0;
  const web = await mount({ appWide: true, onRefresh: async () => { webRefreshes++; } });
  assert.ok(web.container.querySelector('.sellio-pull-refresh-indicator'), 'the page\'s own circle');
  assert.deepEqual(globalThis.registered, [], 'no app plugin is loaded');
  const webPlain = byId(web.container, 'plain');
  let webMove = null;
  await act(async () => {
    touch(webPlain, 'touchstart', { y: 0 });
    webMove = touch(webPlain, 'touchmove', { y: 160 });
    touch(webPlain, 'touchend', { y: 160 });
  });
  await flush();
  assert.equal(webMove.defaultPrevented, true, 'the page holds the pull');
  assert.equal(webRefreshes, 1, 'and refreshes');
  assert.equal(plugin.touches.length, 0, 'no answers sent anywhere');
  await web.close();
  delete window.Capacitor;
  passed('The website, the iPhone app and Android builds without it keep the page\'s own pull');

  // ── 8. The Android project's pieces fit together ───────────────────────────────────
  const read = (file) => readFile(file, 'utf8');
  const pkg = 'com.base6985959ce9aaceadb8b7cc41.app';
  const javaDir = `android/app/src/main/java/${pkg.replace(/\./g, '/')}`;
  const layout = await read('android/app/src/main/res/layout/capacitor_bridge_layout_main.xml');
  const wrapper = layout.match(new RegExp(`<${pkg.replace(/\./g, '\\.')}\\.SellioRefreshLayout[\\s\\S]*?</${pkg.replace(/\./g, '\\.')}\\.SellioRefreshLayout>`));
  assert.ok(wrapper, 'the layout has Sellio\'s pull (SellioRefreshLayout, by its full name)');
  assert.match(wrapper[0], /<com\.getcapacitor\.CapacitorWebView\s+android:id="@\+id\/webview"/, 'around Capacitor\'s web view, by the id Capacitor finds it with');
  assert.equal((layout.match(/CapacitorWebView/g) || []).length, 1, 'one web view');
  const library = await read('node_modules/@capacitor/android/capacitor/src/main/res/layout/capacitor_bridge_layout_main.xml');
  assert.deepEqual([...library.matchAll(/<([\w.]+)/g)].map((m) => m[1]).filter((tag) => tag !== '?xml'),
    ['androidx.coordinatorlayout.widget.CoordinatorLayout', 'com.getcapacitor.CapacitorWebView'],
    'Capacitor\'s own layout (which ours replaces) is still a CoordinatorLayout around the web view');
  assert.match(layout, /^<androidx\.coordinatorlayout\.widget\.CoordinatorLayout/m, 'ours has the same root');
  const view = await read(`${javaDir}/SellioRefreshLayout.java`);
  assert.match(view, new RegExp(`^package ${pkg.replace(/\./g, '\\.')};`, 'm'));
  assert.match(view, /public class SellioRefreshLayout extends FrameLayout/);
  assert.match(view, /public SellioRefreshLayout\(@NonNull Context context, @Nullable AttributeSet attrs\)/, 'the constructor a layout needs');
  assert.match(view, /protected void onFinishInflate\(\)[\s\S]*addView\(honeycomb/, 'the honeycomb goes in after the web view, so it is drawn over it');
  for (const used of ['setOnRefreshListener', 'isRefreshing', 'setRefreshing', 'setTouchVerdict']) {
    assert.match(view, new RegExp(`(public )?(void|boolean) ${used}\\(`), `the plugin's ${used}() exists`);
  }
  const honeycomb = await read(`${javaDir}/HoneycombView.java`);
  assert.match(honeycomb, /private static final boolean ORANGE_WHEN_BIG = true;/, 'X: orange at full size (Alvin\'s pick)');
  const math = await read(`${javaDir}/HoneycombMath.java`);
  assert.match(math, /ORANGE = 0xFFFB923C;[\s\S]*PINK = 0xFFE0449A;[\s\S]*PURPLE = 0xFF8B2FC9;/, 'Sellio\'s orange, pink and purple');
  const bridge = await read(`${javaDir}/SellioRefreshPlugin.java`);
  assert.equal(bridge.match(/@CapacitorPlugin\(name = "([^"]+)"\)/)?.[1], app.NATIVE_REFRESH, 'the plugin\'s name is the one the page looks for');
  for (const method of ['touch', 'finish']) assert.match(bridge, new RegExp(`@PluginMethod\\s+public void ${method}\\(PluginCall call\\)`), `the page's ${method}() exists`);
  assert.match(bridge, /notifyListeners\("refresh"/, 'the app sends "refresh"');
  assert.match(bridge, /call\.getFloat\("x"\)[\s\S]*call\.getFloat\("y"\)[\s\S]*call\.getBoolean\("allowed"/, 'it reads what the page sends');
  const activity = await read(`${javaDir}/MainActivity.java`);
  assert.match(activity, /registerPlugin\(SellioRefreshPlugin\.class\);\s+super\.onCreate\(savedInstanceState\);/, 'MainActivity adds the plugin before the app starts');
  assert.ok(NATIVE_INPUTS.android.includes('android/app/src/main/res/layout'), 'a change to the layout is a change to the app\'s native code (live updates wait for the store)');
  passed('The Android project\'s pieces fit together (layout, plugin, MainActivity, live-update fingerprint)');

  // ── 9. The pull's own logic, compiled and run here (needs a JDK) ───────────────────
  const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (javac.status !== 0) {
    console.log('SKIP the pull\'s own logic: no JDK here (javac)');
  } else {
    const classes = path.join(tmp, 'classes');
    const sources = [`${javaDir}/HoneycombMath.java`, `${javaDir}/PullGesture.java`, 'verification/native-pull/PullChecks.java'];
    const compiled = spawnSync('javac', ['-d', classes, ...sources], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, `compiles: ${compiled.stderr}`);
    const ran = spawnSync('java', ['-cp', classes, `${pkg}.PullChecks`], { encoding: 'utf8' });
    for (const line of ran.stdout.split('\n').filter((l) => l.startsWith('PASS '))) console.log('  ' + line);
    assert.equal(ran.status, 0, `the pull's own checks: ${(ran.stderr || '').split('\n').filter((l) => !l.startsWith('Picked up')).join(' ')}`);
    assert.match(ran.stdout, /8 pull checks passed/);
    passed('The pull\'s own logic: honeycomb, ripple, colours, and when a finger becomes a pull (8 checks, run with Java)');
  }

  console.log(passes + ' native pull-to-refresh checks passed');
} finally {
  console.info = info;
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
