// Live updates in Sellio's apps: new web code without a store release. scripts/app-update.mjs
// publishes each build's app files at https://sellio.sg/app-updates/ (a zip and a manifest);
// the Capgo updater plugin downloads a zip and switches the app to it.
//
// On every start (capacitorApp.js runs this first):
// 1. An update downloaded earlier is switched to straight away, under the splash, keeping the
//    page the app was opening.
// 2. Once the first screen is up, and isn't the crash screen, the updater is told these files
//    work. If they never get that far within 15 seconds, it goes back to the files that did,
//    and this phone never downloads that version again (the next start notices it is back in
//    the old files).
// 3. The manifest is checked: a few seconds after starting, on coming back to the app after a
//    few hours, and on pull to refresh. A newer version made for this app's native code (the
//    manifest says which) downloads in the background and is used from the next start, or at
//    once from "Update available → Reload" (AppRefreshProvider). A version that needs newer
//    native code waits for the store update.
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { SELLIO_SITE } from './accountFlow';
import { appPlatform } from './nativeApp';

export const LIVE_UPDATE_EVENT = 'sellio:live-update'; // detail: { id, version }, an update is ready
export const MANIFEST_URL = `${SELLIO_SITE}/app-updates/manifest.json`;
export const READY_KEY = 'sellio.update.ready'; // { id, version }: downloaded, used at the next start
export const CHECKED_KEY = 'sellio.update.checked'; // when the manifest was last read
export const TRYING_KEY = 'sellio.update.trying'; // { version }: being switched to just now
export const FAILED_KEY = 'sellio.update.failed'; // versions that never started here: not downloaded again
export const TEST_MANIFEST_KEY = 'sellio.update.manifest'; // debug builds only: another manifest
export const TEST_MANIFEST_PARAM = 'sellio_update_manifest';
export const CHECK_AT_START = 10 * 60 * 1000;
export const CHECK_ON_RETURN = 3 * 60 * 60 * 1000;
export const CHECK_ON_PULL = 60 * 1000;
const FIRST_CHECK_AFTER = 8000;
const CONFIRM_WITHIN = 12000; // the updater waits 15 s (appReadyTimeout, capacitor.config.json)

const log = (message) => console.info(`Sellio update: ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable: this visit only */ }
}

// This copy's own stamp (scripts/app-update.mjs): { version, native: { android, ios } }.
let own = null;
export async function ownVersion() {
  if (own) return own;
  try {
    const response = await fetch('/sellio-bundle.json', { cache: 'no-store' });
    if (response.ok) own = await response.json();
  } catch { /* no stamp: a development copy */ }
  if (!own || typeof own.version !== 'string') own = { version: '', native: {} };
  return own;
}

// Debug builds only (the emulator check): ?sellio_update_manifest=<address> on any page sets
// another manifest to test with; an empty value goes back to sellio.sg. Release builds ignore it.
const debugBuild = () => typeof window !== 'undefined' && window.Capacitor?.DEBUG === true;
const TESTABLE = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/;
export function takeTestManifest() {
  if (!debugBuild()) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(TEST_MANIFEST_PARAM)) return;
  const value = url.searchParams.get(TEST_MANIFEST_PARAM) || '';
  if (!value) write(TEST_MANIFEST_KEY, null);
  else if (TESTABLE.test(value)) write(TEST_MANIFEST_KEY, value);
  write(CHECKED_KEY, null); // check this start, whenever the last check was
  url.searchParams.delete(TEST_MANIFEST_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
export function manifestUrl() {
  const test = debugBuild() ? read(TEST_MANIFEST_KEY) : null;
  return typeof test === 'string' && TESTABLE.test(test) ? test : MANIFEST_URL;
}

export const waitingUpdate = () => {
  const waiting = read(READY_KEY);
  return waiting?.id && waiting?.version ? waiting : null;
};

// Switches to the downloaded update now: the updater restarts the page in the new files, so
// nothing after this normally runs. False if it refused, or the page is still here after 2 s
// (then the caller carries on in these files).
async function switchTo(waiting) {
  write(READY_KEY, null);
  write(TRYING_KEY, { version: waiting.version }); // noteLastSwitch reads it at the next start
  try {
    log(`switching to ${waiting.version}`);
    await CapacitorUpdater.set({ id: waiting.id });
    await sleep(2000);
    log(`still in the old files after switching to ${waiting.version}: carrying on`);
  } catch (error) {
    write(TRYING_KEY, null); // never switched: nothing to learn at the next start
    log(`could not switch to ${waiting.version} (${error?.message || error})`);
  }
  return false;
}

const failedVersions = () => {
  const list = read(FAILED_KEY);
  return Array.isArray(list) ? list.filter((version) => typeof version === 'string') : [];
};

// At the start after a switch: these files are either the version switched to (it worked) or
// the ones the updater went back to because that version never got its first screen up. Then
// it is kept off this phone: a later check doesn't download it again, so a broken update costs
// one slow start, not one at every start.
export async function noteLastSwitch() {
  const trying = read(TRYING_KEY);
  if (!trying) return;
  write(TRYING_KEY, null);
  if (typeof trying.version !== 'string' || !trying.version) return;
  const mine = await ownVersion();
  if (trying.version === mine.version) return;
  write(FAILED_KEY, [...failedVersions().filter((version) => version !== trying.version), trying.version].slice(-10));
  log(`${trying.version} did not start: back in ${mine.version || 'the files the app came with'}; it won't be downloaded again`);
}

// 1. At the very start: an update downloaded earlier is used now.
export async function useWaitingUpdate() {
  const waiting = waitingUpdate();
  if (!waiting) return false;
  const mine = await ownVersion();
  if (waiting.version === mine.version) {
    write(READY_KEY, null);
    return false;
  }
  return switchTo(waiting);
}

// "Update available → Reload". False when there is none to use (or switching didn't happen).
export async function applyUpdateNow() {
  const waiting = waitingUpdate();
  return waiting ? switchTo(waiting) : false;
}

// 2. The first screen is up and isn't the crash screen (AppErrorBoundary's role="alert").
export function confirmWhenShown({ within = CONFIRM_WITHIN, every = 200 } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const look = () => {
      const root = document.getElementById('root');
      const crashed = !!root?.querySelector(':scope > [role="alert"]');
      if (root && root.childElementCount > 0 && !crashed) {
        CapacitorUpdater.notifyAppReady()
          .then(() => ownVersion())
          .then((mine) => log(`running ${mine.version || 'the files the app came with'}`))
          .catch(() => {})
          .finally(() => resolve(true));
        return;
      }
      if (Date.now() - started >= within) {
        log(crashed ? 'the first screen crashed: the updater goes back to the files that worked'
          : 'the first screen did not show: the updater goes back to the files that worked');
        resolve(false);
        return;
      }
      setTimeout(look, every);
    };
    look();
  });
}

const VERSION = /^[\w.-]{1,64}$/;
const HASH = /^[0-9a-f]{64}$/;
function readable(manifest) {
  return manifest && typeof manifest === 'object' && VERSION.test(manifest.version || '')
    && typeof manifest.url === 'string' && HASH.test(manifest.sha256 || '')
    && manifest.native && typeof manifest.native === 'object';
}

// 3. A newer version for this app? Resolves to the update waiting to be used (or null).
let checking = null;
export function checkForUpdate({ minAgeMs = CHECK_ON_RETURN } = {}) {
  if (checking) return checking;
  checking = (async () => {
    const last = Number(read(CHECKED_KEY)) || 0;
    if (Date.now() - last < minAgeMs) return waitingUpdate();
    write(CHECKED_KEY, Date.now());
    const mine = await ownVersion();
    const platform = appPlatform();
    if (!mine.version || !platform) return null;
    const source = manifestUrl();
    let manifest;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${source}${source.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        cache: 'no-store', signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!response.ok) {
        log(`no update information (${response.status})`);
        return waitingUpdate();
      }
      manifest = await response.json();
    } catch (error) {
      log(`could not check (${error?.message || error})`);
      return waitingUpdate();
    }
    if (!readable(manifest)) {
      log('update information unreadable');
      return waitingUpdate();
    }
    const waiting = waitingUpdate();
    if (manifest.native[platform] !== mine.native?.[platform]) {
      log(`${manifest.version} needs a newer ${platform === 'ios' ? 'App Store' : 'Play Store'} version of the app`);
      return waiting;
    }
    if (manifest.version === mine.version) {
      if (waiting) { // an update from before, now behind: not used
        write(READY_KEY, null);
        CapacitorUpdater.delete({ id: waiting.id }).catch(() => {});
      }
      log('up to date');
      return null;
    }
    if (waiting?.version === manifest.version) return waiting;
    if (failedVersions().includes(manifest.version)) {
      log(`${manifest.version} did not start on this phone before: not downloaded again`);
      return waiting;
    }
    const zip = new URL(manifest.url, source);
    if (zip.origin !== new URL(source).origin) {
      log('update information names another site: not used');
      return waiting;
    }
    log(`downloading ${manifest.version}`);
    const bundle = await CapacitorUpdater.download({
      url: zip.href,
      version: manifest.version,
      checksum: manifest.sha256,
    });
    if (waiting?.id && waiting.id !== bundle.id) CapacitorUpdater.delete({ id: waiting.id }).catch(() => {});
    const next = { id: bundle.id, version: manifest.version };
    write(READY_KEY, next);
    log(`${manifest.version} is ready: used from the next start`);
    window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: next }));
    return next;
  })()
    .catch((error) => {
      log(`download failed (${error?.message || error})`);
      return waitingUpdate();
    })
    .finally(() => { checking = null; });
  return checking;
}

// capacitorApp.js, first thing, before anything else starts in these files.
export async function startLiveUpdates() {
  takeTestManifest();
  await noteLastSwitch();
  await useWaitingUpdate();
  confirmWhenShown();
  setTimeout(() => { checkForUpdate({ minAgeMs: CHECK_AT_START }); }, FIRST_CHECK_AFTER);
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) checkForUpdate({ minAgeMs: CHECK_ON_RETURN });
  }).catch(() => {});
}

// Tests only.
export function _resetLiveUpdatesForTests() { own = null; checking = null; }
