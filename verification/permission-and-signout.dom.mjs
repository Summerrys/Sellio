// UX states 7 and 8 (14 Nov 2026), on screen and in the watch behind them:
// - A permission that's off: the sheet (why Sellio needs it, the steps, Open Settings in Sellio's
//   apps), the camera in Sellio's Android app asking first so a "Don't allow" shows it, a refused
//   printer, and the empty notifications list with phone alerts off.
// - Signed out without asking (src/lib/signOutWatch.js): told only for sign-outs nobody asked
//   for, now or while Sellio was closed; the sheet with what's still kept, Not now's pill, and
//   Sign in again.
// Supabase, the Bluetooth plugin and the alert module are stand-ins.
// Run: node verification/permission-and-signout.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const navigations = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (/navigation/i.test(error.message)) navigations.push(error.message);
  else console.error(error);
});
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Orders', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'MutationObserver', 'NodeFilter', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.HTMLElement.prototype.scrollIntoView = () => {};
win.HTMLElement.prototype.hasPointerCapture = () => false;
win.HTMLElement.prototype.releasePointerCapture = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

globalThis.settingsOpened = 0;
globalThis.alertState = 'blocked';
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-permission-signout-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export { default as PermissionHelp, permissionWords } from '@/components/ui-custom/PermissionHelp';",
  "export { default as SignedOutNotice, keptOnDevice, counterItemsKept } from '@/components/ui-custom/SignedOutNotice';",
  "export { default as NativeCameraScanControl } from '@/components/ui-custom/NativeCameraScanControl';",
  "export { default as NotificationsEmpty } from '@/components/notifications/NotificationsEmpty';",
  "export { showPermissionHelp, helpWithPrinterError, BLUETOOTH_PERMISSION } from '@/lib/permissionHelp';",
  "export { startSignOutWatch, resetSignOutWatchForTests, readSignedOutNotice, saveSignedOutNotice, SIGNED_OUT_EVENT } from '@/lib/signOutWatch';",
].join('\n'));
const mock = { name: 'permission-signout-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/(^|\/)supabaseClient(\.js)?$/, 'supabase');
  route(/^@capacitor-community\/bluetooth-le$/, 'ble');
  route(/(^|\/)pushNotifications(\.js)?$/, 'alerts');
  route(/(^|\/)webPush(\.js)?$/, 'alerts');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: {
    sonner: 'const note = () => {}; export const toast = Object.assign(note, { success: note, error: note, info: note, message: note });',
    supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
    ble: 'export const BluetoothLe = { openAppSettings: async () => { globalThis.settingsOpened += 1; } };',
    alerts: [
      'export const pushStatus = async () => globalThis.alertState;',
      'export const ask = async () => false;',
      'export const askLater = () => {};',
    ].join('\n'),
  }[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.permission-signout.mjs');
await copyFile(outfile, local);
const ui = await import(pathToFileURL(local).href);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms = 20) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const mounted = [];
async function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push({ root, host });
  return { root, host };
}
async function unmountAll() {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
}
const app = (platform) => { win.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform }; };
const website = () => { delete win.Capacitor; };
const sheet = (id) => document.body.querySelector(`[data-testid="${id}"]`);
const click = async (element) => { await act(async () => { element.click(); }); await wait(); };

try {
  // ---------------------------------------------------------------- the sheet (permission off)
  website();
  await mount(h(ui.PermissionHelp));

  app('android');
  await act(async () => ui.showPermissionHelp('camera', { action: 'Take photo' }));
  let help = sheet('permission-help');
  assert.ok(help, 'the sheet shows');
  assert.match(help.textContent, /Camera is off for Sellio/);
  assert.match(help.textContent, /Sellio uses the camera to photograph your menu, your items and your profile picture\. It only opens when you tap Scan Menu or Take photo\./);
  assert.match(help.textContent, /In Settings, tap Permissions → Camera → Allow\. Then come back and tap Take photo again\./);
  // A second request while one shows is ignored.
  await act(async () => ui.showPermissionHelp('bluetooth', { action: 'Scan for Printers' }));
  assert.match(sheet('permission-help').textContent, /Camera is off/);
  await click(sheet('permission-open-settings'));
  assert.equal(globalThis.settingsOpened, 1, "Open Settings: Sellio's page in the phone's Settings");
  assert.equal(sheet('permission-help'), null, 'and the sheet closes');
  passed("Camera off in Sellio's Android app: why, the steps, Open Settings");

  app('ios');
  await act(async () => ui.showPermissionHelp('camera', { action: 'Take photo' }));
  assert.match(sheet('permission-help').textContent, /In Settings, turn on Camera\. Then come back and tap Take photo again\./);
  await click(sheet('permission-not-now'));
  assert.equal(sheet('permission-help'), null);
  assert.equal(globalThis.settingsOpened, 1, 'Not now opens nothing');
  website();
  await act(async () => ui.showPermissionHelp('camera', { action: 'Scan' }));
  help = sheet('permission-help');
  assert.match(help.textContent, /In your phone’s Settings, open Apps → Sellio → Permissions and allow Camera\. Then tap Scan again\./);
  assert.equal(sheet('permission-open-settings'), null, 'no Settings button where Sellio cannot open them');
  assert.equal(sheet('permission-not-now'), null);
  await click(sheet('permission-ok'));
  assert.equal(sheet('permission-help'), null);
  passed('iPhone app: its own steps; elsewhere: the written steps and OK, no Settings button');

  app('android');
  await act(async () => ui.showPermissionHelp('bluetooth', { action: 'Scan for Printers' }));
  help = sheet('permission-help');
  assert.match(help.textContent, /Sellio can’t look for your printer/);
  assert.match(help.textContent, /Sellio needs “Nearby devices” to find and connect to your Bluetooth printer\. It’s only used for printing\./);
  assert.match(help.textContent, /In Settings, tap Permissions → Nearby devices → Allow \(older phones: Location\)\. Then tap Scan for Printers again\./);
  await click(sheet('permission-not-now'));
  // A print that failed for it: no button to name.
  let shown = false;
  await act(async () => { shown = ui.helpWithPrinterError(Object.assign(new Error('Bluetooth permission is off for Sellio.'), { code: ui.BLUETOOTH_PERMISSION })); });
  assert.equal(shown, true);
  await wait();
  help = sheet('permission-help');
  assert.match(help.textContent, /Sellio can’t reach your printer/);
  assert.match(help.textContent, /Then try printing again\./);
  await click(sheet('permission-not-now'));
  assert.equal(ui.helpWithPrinterError(new Error("Couldn't reach the printer.")), false, 'other printer errors keep their own message');
  await wait();
  assert.equal(sheet('permission-help'), null);
  app('ios');
  assert.match(String(ui.permissionWords('bluetooth', 'ios', 'Scan for Printers', (p, v) => p.replace(/\{(\w+)\}/g, (_, k) => (typeof v?.[k] === 'string' ? v[k] : `{${k}}`))).why),
    /Sellio needs Bluetooth to find and connect to your printer/);
  passed('Printer: why, Nearby devices (older phones: Location), for a search or a print; other errors untouched');
  await unmountAll();

  // ---------------------------------------------------- the camera in Sellio's Android app
  const gum = { calls: 0, result: 'refuse', stopped: 0 };
  Object.defineProperty(win.navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async () => {
      gum.calls += 1;
      if (gum.result === 'refuse') throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      return { getTracks: () => [{ stop: () => { gum.stopped += 1; } }] };
    },
  } });
  const errors = [];
  const files = [];
  app('android');
  win.localStorage.removeItem('sellio.cameraAllowed');
  await mount(h(React.Fragment, null,
    h(ui.PermissionHelp),
    h(ui.NativeCameraScanControl, { label: 'Take photo', action: 'Take photo', onFile: (f) => files.push(f), onError: (m) => errors.push(m) }, 'Take photo')));
  const input = () => document.body.querySelector('input[type="file"]');
  const tap = async () => {
    let notPrevented;
    await act(async () => { notPrevented = input().dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(30);
    return notPrevented;
  };
  assert.equal(await tap(), false, 'Sellio asks first: the camera waits');
  assert.equal(gum.calls, 1);
  assert.match(sheet('permission-help')?.textContent || '', /Camera is off for Sellio/);
  assert.deepEqual(errors, [], 'the sheet, not a pop-up');
  assert.equal(win.localStorage.getItem('sellio.cameraAllowed'), null);
  await click(sheet('permission-not-now'));
  passed("Sellio's Android app, camera refused: the sheet shows, where the button used to do nothing");

  gum.result = 'allow';
  input().showPicker = () => { input().dataset.picked = '1'; };
  assert.equal(await tap(), false);
  assert.equal(gum.calls, 2);
  assert.equal(gum.stopped, 1, 'the check stops the camera at once (the photo is the camera app’s)');
  assert.equal(input().dataset.picked, '1', 'then the camera opens');
  assert.equal(win.localStorage.getItem('sellio.cameraAllowed'), '1');
  assert.equal(await tap(), true, 'allowed before: straight to the camera');
  assert.equal(gum.calls, 2, 'no second check');
  // The camera closes without a photo: the next tap checks again.
  await act(async () => { input().dispatchEvent(new win.Event('cancel', { bubbles: false })); });
  assert.equal(win.localStorage.getItem('sellio.cameraAllowed'), null);
  assert.equal(await tap(), false);
  assert.equal(gum.calls, 3);
  assert.equal(sheet('permission-help'), null, 'allowed: no sheet');
  // A photo was taken: still straight to the camera next time.
  assert.equal(await tap(), true);
  await act(async () => { input().dispatchEvent(new win.Event('change', { bubbles: true })); });
  assert.equal(win.localStorage.getItem('sellio.cameraAllowed'), '1');
  passed("Camera allowed: opens after the check, then straight away; a camera closed without a photo checks again");
  await unmountAll();

  // A website: the camera asks for itself.
  website();
  gum.calls = 0;
  await mount(h(ui.NativeCameraScanControl, { label: 'Scan', onFile: () => {}, onError: (m) => errors.push(m) }, 'Scan'));
  assert.equal(await tap(), true, 'a website: the camera opens at once');
  assert.equal(gum.calls, 0);
  await unmountAll();
  passed('Websites: the camera opens at once and asks for itself');

  // ------------------------------------------- the empty notifications list, alerts off
  app('android');
  globalThis.alertState = 'blocked';
  globalThis.settingsOpened = 0;
  await mount(h(ui.NotificationsEmpty));
  await wait(30);
  assert.match(document.body.textContent, /Phone alerts are off for Sellio, so new orders won’t ring on this phone\./);
  const openSettings = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open Settings');
  assert.ok(openSettings);
  await click(openSettings);
  assert.equal(globalThis.settingsOpened, 1);
  globalThis.alertState = 'on';
  await act(async () => { document.dispatchEvent(new win.Event('visibilitychange')); });
  await wait(30);
  assert.equal(document.body.querySelector('[data-testid="alerts-blocked"]'), null, 'allowed in Settings: gone on coming back');
  await unmountAll();
  globalThis.alertState = 'off';
  await mount(h(ui.NotificationsEmpty));
  await wait(30);
  assert.ok([...document.body.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Turn on phone alerts'), 'still askable: Turn on, as before');
  assert.equal(document.body.querySelector('[data-testid="alerts-blocked"]'), null);
  await unmountAll();
  passed('Empty notifications list, phone alerts off for Sellio: Open Settings, and it follows on coming back');

  // ------------------------------------------------------------ the watch (signed out)
  const store = win.localStorage;
  const SESSION_KEY = 'sb-fixture-auth-token';
  const owner = { id: 'p-1', email: 'owner@example.com', tenant_id: 't-1' };
  const buyer = { id: 'p-9', email: 'buyer@example.com', tenant_id: null };
  let clock = 1_800_000_000_000;
  function fakeClient() {
    const subs = [];
    const client = {
      auth: {
        storageKey: SESSION_KEY,
        calls: [],
        async signOut(options = { scope: 'global' }) {
          this.calls.push(options.scope);
          if (options.scope === 'others') return { error: null };
          store.removeItem(SESSION_KEY);
          subs.forEach((fn) => fn('SIGNED_OUT', null));
          return { error: null };
        },
        onAuthStateChange(fn) { subs.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      },
      emit: (event, session) => subs.forEach((fn) => fn(event, session)),
    };
    return client;
  }
  const announced = [];
  win.addEventListener(ui.SIGNED_OUT_EVENT, () => announced.push(clock));
  async function start({ record = owner, sessionKept = true, purposeAt = null } = {}) {
    ui.resetSignOutWatchForTests();
    store.removeItem('sellio.signedOut');
    store.removeItem('sellio.signOutOnPurpose');
    if (sessionKept) store.setItem(SESSION_KEY, '{"access_token":"x"}'); else store.removeItem(SESSION_KEY);
    if (purposeAt != null) store.setItem('sellio.signOutOnPurpose', String(purposeAt));
    let current = record;
    const client = fakeClient();
    globalThis.fakeClient = client;
    await ui.startSignOutWatch({ readRecord: () => current, now: () => clock });
    return { client, setRecord: (r) => { current = r; } };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const signedIn = { user: { email: owner.email } };

  let w = await start();
  w.client.emit('INITIAL_SESSION', signedIn);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null, 'signed in: nothing to tell');
  w.client.emit('SIGNED_OUT', null);
  await settle();
  assert.deepEqual(ui.readSignedOutNotice(), { at: clock, email: owner.email, id: 'p-1', shop: true, seen: false });
  assert.ok(announced.length > 0, 'the notice is told it changed');
  passed('Signed out by Supabase while using Sellio: noted (a shop person: shop)');

  w = await start();
  w.client.emit('INITIAL_SESSION', signedIn);
  await settle();
  await w.client.auth.signOut({ scope: 'local' });
  await settle();
  assert.equal(ui.readSignedOutNotice(), null, 'Sign out tapped: nothing to tell');
  assert.equal(store.getItem('sellio.signOutOnPurpose'), String(clock));
  assert.deepEqual(w.client.auth.calls, ['local'], 'the sign-out itself still runs, with its scope');
  // Then Sellio opens again with the record still there (a sign-out that left it): still nothing.
  w = await start({ sessionKept: false, purposeAt: clock - 2 * 864e5 });
  w.client.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null);
  // Signing out the other devices only keeps this one signed in: not noted as a sign-out.
  w = await start();
  await w.client.auth.signOut({ scope: 'others' });
  await settle();
  assert.equal(store.getItem('sellio.signOutOnPurpose'), null);
  passed('A Sign out someone tapped (here, or before Sellio closed): nothing; signing out other devices is not one');

  w = await start({ sessionKept: false });
  w.client.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(ui.readSignedOutNotice()?.email, owner.email, 'signed out while Sellio was closed: noted');
  w = await start({ sessionKept: true });
  w.client.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null, 'offline with the sign-in still kept: nothing');
  w = await start({ record: null, sessionKept: false });
  w.client.emit('INITIAL_SESSION', null);
  w.client.emit('SIGNED_OUT', null);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null, 'nobody was signed in: nothing');
  passed('Sellio opens signed out: told only when the record says someone was and their sign-in is gone');

  // Another tab's Sign out (this tab hears it as SIGNED_OUT): on purpose within a minute.
  w = await start({ purposeAt: clock - 20 * 1000 });
  w.client.emit('SIGNED_OUT', null);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null);
  w = await start({ purposeAt: clock - 61 * 1000 });
  w.client.emit('SIGNED_OUT', null);
  await settle();
  assert.equal(ui.readSignedOutNotice()?.email, owner.email, 'a Sign out long before is not this one');
  // Signing in again ends it, and the Sign out note.
  w.client.emit('SIGNED_IN', signedIn);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null);
  assert.equal(store.getItem('sellio.signOutOnPurpose'), null);
  passed("Another tab's Sign out counts for a minute; signing in again ends the notice");

  // Next start: told and dismissed (seen) goes; never dismissed shows again.
  w = await start({ sessionKept: false });
  ui.saveSignedOutNotice({ at: clock, email: owner.email, id: 'p-1', shop: true, seen: true });
  w.client.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(ui.readSignedOutNotice(), null, 'Not now before: Sellio shows the signed-out pages as usual');
  w = await start({ sessionKept: false });
  ui.saveSignedOutNotice({ at: clock - 1000, email: owner.email, id: 'p-1', shop: true, seen: false });
  w.client.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(ui.readSignedOutNotice()?.at, clock - 1000, 'never dismissed: still there to show');
  passed('The next start: a dismissed notice goes, one never seen stays');

  // ------------------------------------------------------------- the notice on screen
  website();
  win.sessionStorage.clear();
  win.sessionStorage.setItem('sellio_counter_drafts:t-1:p-1', JSON.stringify({ takeaway: [{ qty: 3 }], 'table:2': [{ qty: 2 }] }));
  win.sessionStorage.setItem('sellio_counter_drafts:t-1:p-2', JSON.stringify({ takeaway: [{ qty: 9 }] }));
  store.setItem('sf_cart_kopi-corner', JSON.stringify([{ key: 'a', product_id: 'a', quantity: 2 }, { key: 'b', product_id: 'b', quantity: 1 }]));
  store.setItem('sellio_cart_shops', JSON.stringify({ 'kopi-corner': { name: 'Kopi Corner', touched: 1 } }));
  ui.saveSignedOutNotice({ at: clock, email: owner.email, id: 'p-1', shop: true, seen: false });
  win.document.cookie = `app_session=${encodeURIComponent(JSON.stringify(owner))}; path=/`;
  await mount(h(MemoryRouter, { initialEntries: ['/store/kopi-corner'] }, h(ui.SignedOutNotice)));
  let notice = sheet('signed-out-notice');
  assert.ok(notice, 'the sheet shows');
  assert.match(notice.textContent, /You’ve been signed out/);
  assert.match(notice.textContent, /Sellio signed you out in this browser\. Sign in again to carry on\./);
  assert.doesNotMatch(notice.textContent, /password/, 'no guess at why');
  assert.match(sheet('signed-out-kept').textContent, /Still in this browser/);
  assert.match(sheet('signed-out-kept').textContent, /5 items not sent from the Counter/, "the person's own Counter items only");
  assert.match(sheet('signed-out-kept').textContent, /Your cart at Kopi Corner \(3 items\)/);
  assert.match(sheet('signed-out-orders').textContent, /New orders won’t show or ring in this browser until you sign in again\./);
  await click(sheet('signed-out-not-now'));
  assert.equal(sheet('signed-out-notice'), null);
  assert.equal(ui.readSignedOutNotice()?.seen, true);
  const pill = sheet('signed-out-pill');
  assert.ok(pill, 'Not now: the pill');
  assert.match(pill.textContent, /Signed out · Sign in/);
  await click(pill);
  assert.equal(JSON.parse(store.getItem('sellio_return_to') || '{}').path, '/store/kopi-corner', 'back to this shop after signing in');
  assert.equal(ui.readSignedOutNotice(), null);
  assert.doesNotMatch(win.document.cookie, /app_session=%7B/, "Sellio's sign-in record goes (Supabase's is gone already)");
  assert.ok(navigations.length >= 1, 'off to the sign-in page');
  await unmountAll();
  passed('On screen: what is kept (Counter, the cart here), orders warning, Not now leaves a pill, Sign in comes back here');

  app('android');
  win.sessionStorage.clear();
  store.removeItem('sf_cart_kopi-corner');
  store.setItem('sf_cart_nasi-place', JSON.stringify([{ key: 'x', product_id: 'x', quantity: 1 }]));
  store.setItem('sellio_cart_shops', JSON.stringify({ 'nasi-place': { name: 'Nasi Place', touched: 1 } }));
  ui.saveSignedOutNotice({ at: clock, email: buyer.email, id: 'p-9', shop: false, seen: false });
  await mount(h(MemoryRouter, { initialEntries: ['/explore'] }, h(ui.SignedOutNotice)));
  notice = sheet('signed-out-notice');
  assert.match(notice.textContent, /Sellio signed you out on this phone\. Sign in again to carry on\./);
  assert.match(sheet('signed-out-kept').textContent, /Still on this phone/);
  assert.match(sheet('signed-out-kept').textContent, /Your cart at Nasi Place \(1 item\)/);
  assert.doesNotMatch(notice.textContent, /Counter/);
  assert.equal(sheet('signed-out-orders'), null, 'a buyer: no orders warning');
  await unmountAll();
  store.removeItem('sf_cart_nasi-place');
  ui.saveSignedOutNotice({ at: clock, email: buyer.email, id: 'p-9', shop: false, seen: false });
  await mount(h(MemoryRouter, { initialEntries: ['/explore'] }, h(ui.SignedOutNotice)));
  assert.equal(sheet('signed-out-kept'), null, 'nothing kept: no list');
  await unmountAll();
  await mount(h(MemoryRouter, { initialEntries: ['/Auth'] }, h(ui.SignedOutNotice)));
  assert.equal(sheet('signed-out-notice'), null, 'the sign-in page: it waits');
  await unmountAll();
  passed('In the app: on this phone; a buyer gets no orders warning; nothing kept, no list; the sign-in page shows none');

  console.log(`${passes} permission and signed-out checks passed`);
} finally {
  await unmountAll().catch(() => {});
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
