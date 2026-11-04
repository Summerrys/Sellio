// src/lib/liveUpdates.js with stand-ins for the updater plugin, the App plugin and the network:
// when an app downloads, switches to, confirms or refuses an update. No phone.
// Run: node verification/live-updates.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/Orders', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Event', 'CustomEvent', 'localStorage', 'navigator', 'history']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}

// The app: Android, a release build unless a check says otherwise.
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', DEBUG: false };
const OWN = { version: 'aaaaaaaaaaaa', native: { android: 'nat-android-1', ios: 'nat-ios-1' } };
const NEW = { version: 'bbbbbbbbbbbb', native: { android: 'nat-android-1', ios: 'nat-ios-1' }, url: '/app-updates/bbbbbbbbbbbb.zip', sha256: 'f'.repeat(64), size: 2000000 };
let manifest = NEW;
let manifestStatus = 200;
const requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  if (String(url) === '/sellio-bundle.json') return { ok: true, status: 200, json: async () => OWN };
  if (manifestStatus === 'offline') throw new TypeError('Failed to fetch');
  return { ok: manifestStatus === 200, status: manifestStatus, json: async () => structuredClone(manifest) };
};

const calls = [];
let nextId = 1;
let downloadFails = false;
let setRefuses = false;
globalThis.__updater = {
  notifyAppReady: async () => { calls.push(['ready']); return { bundle: { id: 'builtin' } }; },
  download: async (options) => {
    calls.push(['download', options]);
    if (downloadFails) throw new Error('Checksum mismatch');
    return { id: `b${nextId++}`, version: options.version, status: 'pending' };
  },
  set: async ({ id }) => { calls.push(['set', id]); if (setRefuses) throw new Error('Bundle not found'); },
  delete: async ({ id }) => { calls.push(['delete', id]); },
};
const appListeners = {};
globalThis.__app = { addListener: async (name, fn) => { appListeners[name] = fn; return { remove() {} }; } };

const tmp = await mkdtemp(path.join(app, '.live-updates-verification-'));
const mocks = { name: 'live-update-fixtures', setup(b) {
  b.onResolve({ filter: /^@capgo\/capacitor-updater$/ }, () => ({ path: 'updater', namespace: 'mock' }));
  b.onResolve({ filter: /^@capacitor\/app$/ }, () => ({ path: 'app', namespace: 'mock' }));
  b.onLoad({ filter: /^updater$/, namespace: 'mock' }, () => ({ contents: 'export const CapacitorUpdater = globalThis.__updater;', loader: 'js' }));
  b.onLoad({ filter: /^app$/, namespace: 'mock' }, () => ({ contents: 'export const App = globalThis.__app;', loader: 'js' }));
} };
const outfile = path.join(tmp, 'liveUpdates.mjs');
await build({ entryPoints: [path.join(app, 'src/lib/liveUpdates.js')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, plugins: [mocks], logLevel: 'silent' });
const live = await import(pathToFileURL(outfile).href);

const events = [];
window.addEventListener(live.LIVE_UPDATE_EVENT, (e) => events.push(e.detail));
const logs = [];
const realInfo = console.info;
console.info = (...args) => { logs.push(args.join(' ')); };
const fresh = () => {
  live._resetLiveUpdatesForTests();
  localStorage.clear();
  calls.length = 0; requests.length = 0; events.length = 0; logs.length = 0;
  manifest = NEW; manifestStatus = 200; downloadFails = false; setRefuses = false; nextId = 1;
};
const manifestReads = () => requests.filter((r) => r.includes('manifest.json')).length;
let passed = 0;
const check = async (name, fn) => { fresh(); await fn(); passed += 1; realInfo(`PASS ${name}`); };

try {
  await check('A newer version for this app downloads (address, version and checksum from the manifest) and waits for the next start', async () => {
    const waiting = await live.checkForUpdate({ minAgeMs: 0 });
    const download = calls.find((c) => c[0] === 'download')[1];
    assert.deepEqual(download, { url: 'https://sellio.sg/app-updates/bbbbbbbbbbbb.zip', version: 'bbbbbbbbbbbb', checksum: 'f'.repeat(64) });
    assert.deepEqual(waiting, { id: 'b1', version: 'bbbbbbbbbbbb' });
    assert.deepEqual(JSON.parse(localStorage.getItem(live.READY_KEY)), waiting);
    assert.deepEqual(events, [waiting], 'the Update available banner hears of it');
    assert.ok(requests.some((r) => r.startsWith('https://sellio.sg/app-updates/manifest.json?t=')));
    assert.ok(!calls.some((c) => c[0] === 'set'), 'nothing switches mid-session');
  });

  await check('A version that needs newer native code (a store update) is not downloaded', async () => {
    manifest = { ...NEW, native: { android: 'nat-android-2', ios: 'nat-ios-1' } };
    assert.equal(await live.checkForUpdate({ minAgeMs: 0 }), null);
    assert.ok(!calls.some((c) => c[0] === 'download'));
    assert.ok(logs.some((l) => l.includes('needs a newer Play Store version')));
  });

  await check('The same version as running: up to date, and an older downloaded update is dropped', async () => {
    localStorage.setItem(live.READY_KEY, JSON.stringify({ id: 'old1', version: 'cccccccccccc' }));
    manifest = { ...NEW, version: OWN.version, url: `/app-updates/${OWN.version}.zip` };
    assert.equal(await live.checkForUpdate({ minAgeMs: 0 }), null);
    assert.equal(localStorage.getItem(live.READY_KEY), null);
    assert.deepEqual(calls.filter((c) => c[0] !== 'ready'), [['delete', 'old1']]);
  });

  await check('Already downloaded: not downloaded again; a newer one replaces it (the old one deleted)', async () => {
    await live.checkForUpdate({ minAgeMs: 0 });
    calls.length = 0;
    assert.deepEqual(await live.checkForUpdate({ minAgeMs: 0 }), { id: 'b1', version: 'bbbbbbbbbbbb' });
    assert.ok(!calls.some((c) => c[0] === 'download'));
    manifest = { ...NEW, version: 'dddddddddddd', url: '/app-updates/dddddddddddd.zip' };
    const next = await live.checkForUpdate({ minAgeMs: 0 });
    assert.equal(next.version, 'dddddddddddd');
    assert.ok(calls.some((c) => c[0] === 'delete' && c[1] === 'b1'));
  });

  await check('Checks are spaced out: within the wait no request; pull to refresh after a minute', async () => {
    await live.checkForUpdate({ minAgeMs: 0 });
    await live.checkForUpdate({ minAgeMs: live.CHECK_ON_RETURN });
    await live.checkForUpdate({ minAgeMs: live.CHECK_ON_PULL });
    assert.equal(manifestReads(), 1);
    localStorage.setItem(live.CHECKED_KEY, JSON.stringify(Date.now() - 61000));
    await live.checkForUpdate({ minAgeMs: live.CHECK_ON_PULL });
    assert.equal(manifestReads(), 2);
  });

  await check('No manifest, no connection, an unreadable or foreign one: nothing downloads', async () => {
    for (const [status, body] of [[404, NEW], ['offline', NEW], [200, { version: 'x' }], [200, { ...NEW, sha256: 'nope' }],
      [200, { ...NEW, url: 'https://evil.example/x.zip' }], [200, { ...NEW, version: '../../x' }]]) {
      manifestStatus = status; manifest = body;
      localStorage.removeItem(live.CHECKED_KEY);
      await live.checkForUpdate({ minAgeMs: 0 });
    }
    assert.ok(!calls.some((c) => c[0] === 'download'));
    assert.ok(logs.some((l) => l.includes('names another site')));
  });

  await check('A failed download (a bad checksum) leaves things as they were', async () => {
    downloadFails = true;
    assert.equal(await live.checkForUpdate({ minAgeMs: 0 }), null);
    assert.equal(localStorage.getItem(live.READY_KEY), null);
    assert.ok(logs.some((l) => l.includes('download failed')));
  });

  await check('At the next start, the downloaded update is switched to before anything else', async () => {
    localStorage.setItem(live.READY_KEY, JSON.stringify({ id: 'b7', version: 'bbbbbbbbbbbb' }));
    const started = Date.now();
    await live.useWaitingUpdate();
    assert.deepEqual(calls, [['set', 'b7']]);
    assert.equal(localStorage.getItem(live.READY_KEY), null, 'cleared first: a broken one is never retried');
    assert.deepEqual(JSON.parse(localStorage.getItem(live.TRYING_KEY)), { version: 'bbbbbbbbbbbb' }, 'the next start learns whether it worked');
    assert.ok(Date.now() - started >= 1900, 'waits for the restart before carrying on');
  });

  await check('An update the updater refuses (gone) is dropped and the app carries on', async () => {
    localStorage.setItem(live.READY_KEY, JSON.stringify({ id: 'gone', version: 'bbbbbbbbbbbb' }));
    setRefuses = true;
    await live.useWaitingUpdate();
    assert.equal(localStorage.getItem(live.READY_KEY), null);
    assert.equal(localStorage.getItem(live.TRYING_KEY), null, 'never switched: not counted as broken');
    assert.ok(logs.some((l) => l.includes('could not switch')));
  });

  await check('The start after a switch: the new version running is fine; back in the old files, that version never downloads again', async () => {
    localStorage.setItem(live.TRYING_KEY, JSON.stringify({ version: OWN.version }));
    await live.noteLastSwitch();
    assert.equal(localStorage.getItem(live.TRYING_KEY), null);
    assert.equal(localStorage.getItem(live.FAILED_KEY), null, 'it worked');
    localStorage.setItem(live.TRYING_KEY, JSON.stringify({ version: NEW.version }));
    await live.noteLastSwitch();
    assert.equal(localStorage.getItem(live.TRYING_KEY), null);
    assert.deepEqual(JSON.parse(localStorage.getItem(live.FAILED_KEY)), [NEW.version]);
    assert.ok(logs.some((l) => l.includes(`${NEW.version} did not start: back in ${OWN.version}`)));
    assert.equal(await live.checkForUpdate({ minAgeMs: 0 }), null);
    assert.ok(!calls.some((c) => c[0] === 'download'), 'not downloaded again');
    assert.ok(logs.some((l) => l.includes('did not start on this phone before')));
    manifest = { ...NEW, version: 'dddddddddddd', url: '/app-updates/dddddddddddd.zip' };
    assert.equal((await live.checkForUpdate({ minAgeMs: 0 })).version, 'dddddddddddd', 'a later version still comes');
  });

  await check('The update already running is not switched to again', async () => {
    localStorage.setItem(live.READY_KEY, JSON.stringify({ id: 'b9', version: OWN.version }));
    await live.useWaitingUpdate();
    assert.ok(!calls.some((c) => c[0] === 'set'));
    assert.equal(localStorage.getItem(live.READY_KEY), null);
  });

  await check('"Update available → Reload" switches to it; with none waiting, nothing happens', async () => {
    assert.equal(await live.applyUpdateNow(), false);
    localStorage.setItem(live.READY_KEY, JSON.stringify({ id: 'b3', version: 'bbbbbbbbbbbb' }));
    await live.applyUpdateNow();
    assert.deepEqual(calls, [['set', 'b3']]);
  });

  await check('These files are confirmed only once the first screen is up', async () => {
    const root = document.getElementById('root');
    root.innerHTML = '';
    const confirmed = live.confirmWhenShown({ within: 2000, every: 20 });
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(!calls.some((c) => c[0] === 'ready'), 'not before the screen shows');
    root.innerHTML = '<main>Orders</main>';
    assert.equal(await confirmed, true);
    assert.deepEqual(calls, [['ready']]);
    assert.ok(logs.some((l) => l.includes(`running ${OWN.version}`)));
  });

  await check('The crash screen is never confirmed: the updater goes back to the files that worked', async () => {
    document.getElementById('root').innerHTML = '<div role="alert">Something went wrong</div>';
    assert.equal(await live.confirmWhenShown({ within: 300, every: 20 }), false);
    assert.ok(!calls.some((c) => c[0] === 'ready'));
    assert.ok(logs.some((l) => l.includes('first screen crashed')));
  });

  await check('Release builds ignore a test manifest; debug builds take one (localhost or https) and check at once', async () => {
    const at = (search) => window.history.replaceState(null, '', `/Auth${search}`);
    localStorage.setItem(live.CHECKED_KEY, JSON.stringify(Date.now()));
    at('?sellio_update_manifest=http%3A%2F%2Flocalhost%3A8099%2Fmanifest.json');
    live.takeTestManifest();
    assert.equal(live.manifestUrl(), live.MANIFEST_URL, 'release: ignored');
    assert.equal(localStorage.getItem(live.TEST_MANIFEST_KEY), null, 'release: nothing kept');
    assert.notEqual(localStorage.getItem(live.CHECKED_KEY), null, 'release: no extra check');
    localStorage.setItem(live.TEST_MANIFEST_KEY, JSON.stringify('http://localhost:8099/manifest.json'));
    assert.equal(live.manifestUrl(), live.MANIFEST_URL, 'release: a stored test manifest is ignored too');
    localStorage.removeItem(live.TEST_MANIFEST_KEY);
    window.Capacitor.DEBUG = true;
    live.takeTestManifest();
    assert.equal(live.manifestUrl(), 'http://localhost:8099/manifest.json');
    assert.equal(window.location.search, '', 'the address is tidied');
    assert.equal(localStorage.getItem(live.CHECKED_KEY), null);
    at('?sellio_update_manifest=http%3A%2F%2F10.0.0.5%2Fm.json');
    live.takeTestManifest();
    assert.equal(live.manifestUrl(), 'http://localhost:8099/manifest.json', 'other plain-http addresses refused');
    manifest = { ...NEW, url: '/b.zip' };
    await live.checkForUpdate({ minAgeMs: 0 });
    assert.equal(calls.find((c) => c[0] === 'download')[1].url, 'http://localhost:8099/b.zip');
    at('?sellio_update_manifest=');
    live.takeTestManifest();
    assert.equal(live.manifestUrl(), live.MANIFEST_URL, 'an empty value goes back to sellio.sg');
    window.Capacitor.DEBUG = false;
  });

  await check('Start: notes a failed switch, switches first, confirms when shown, checks a few seconds later and on coming back', async () => {
    document.getElementById('root').innerHTML = '<main>Home</main>';
    localStorage.setItem(live.TRYING_KEY, JSON.stringify({ version: 'eeeeeeeeeeee' }));
    await live.startLiveUpdates();
    assert.deepEqual(JSON.parse(localStorage.getItem(live.FAILED_KEY)), ['eeeeeeeeeeee']);
    assert.equal(typeof appListeners.appStateChange, 'function');
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(calls.some((c) => c[0] === 'ready'));
    assert.equal(manifestReads(), 0, 'no check straight away');
    await new Promise((r) => setTimeout(r, 8300));
    assert.equal(manifestReads(), 1, 'checked after a few seconds');
    appListeners.appStateChange({ isActive: true });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(manifestReads(), 1, 'coming back soon after: no second check');
    localStorage.setItem(live.CHECKED_KEY, JSON.stringify(Date.now() - live.CHECK_ON_RETURN - 1000));
    appListeners.appStateChange({ isActive: true });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(manifestReads(), 2, 'back after a few hours: checked');
  });
} finally {
  console.info = realInfo;
  await rm(tmp, { recursive: true, force: true });
}
console.log(`${passed} live update checks passed (no phone).`);
