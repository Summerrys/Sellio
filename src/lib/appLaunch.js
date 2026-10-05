// The Android app's start: one Sellio splash from the moment Sellio's code decides
// it is in the app until the first screen is ready. It stays at least MIN_MS, keeps
// covering while any loader is up (and across the reload on the way to the
// Dashboard), and never longer than MAX_MS. Websites never start it.
// index.html uses the same sessionStorage entry: it starts the launch itself when the
// app opens at "/" with its bridge already there (so the splash is up from the first
// paint), and shows the splash before the code loads after a reload. Keep the key,
// MAX_MS and the bridge test in step with it.
export const LAUNCH_KEY = 'sellio-launch';
export const MIN_MS = 1500;
export const MAX_MS = 10000;
export const SETTLE_MS = 300; // a page swapping one loader for the next stays covered

const listeners = new Set();
let snapshot = null;
let loaders = 0;
let lastBusy = 0;

const notify = () => listeners.forEach((fn) => fn());

export function readLaunch(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(LAUNCH_KEY) || 'null');
    if (!value || value.done || !Number.isFinite(value.start)) return null;
    const age = now - value.start;
    return age >= 0 && age < MAX_MS ? value : null;
  } catch { return null; }
}

// Called when the app (not a website) opens at its start page; keeps a launch that
// index.html already started.
export function startLaunch(storage = globalThis.sessionStorage, now = Date.now()) {
  if (readLaunch(storage, now)) return; // already running (e.g. a second render)
  try { storage.setItem(LAUNCH_KEY, JSON.stringify({ start: now, done: false })); } catch { return; }
  lastBusy = now;
  snapshot = null;
  notify();
}

export function finishLaunch(storage = globalThis.sessionStorage) {
  try {
    const value = JSON.parse(storage.getItem(LAUNCH_KEY) || 'null');
    if (value && !value.done) storage.setItem(LAUNCH_KEY, JSON.stringify({ ...value, done: true }));
  } catch { /* storage unavailable: nothing to finish */ }
  snapshot = null;
  notify();
}

// For useSyncExternalStore: the current launch (or null), stable between changes.
export function subscribeLaunch(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getLaunchSnapshot() {
  const value = readLaunch();
  const key = value ? value.start : null;
  if (!snapshot || snapshot.key !== key) snapshot = { key, value };
  return snapshot.value;
}

// Every full-screen loader holds the splash while it is mounted.
export function holdLaunch(now = Date.now()) {
  loaders += 1;
  lastBusy = now;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    loaders -= 1;
    lastBusy = Date.now();
  };
}

// Whether the splash can go: shown long enough, and no loader for SETTLE_MS.
export function launchCanEnd(launch, now = Date.now()) {
  if (!launch) return true;
  const age = now - launch.start;
  if (age >= MAX_MS) return true;
  if (age < MIN_MS) return false;
  if (loaders > 0) return false;
  return now - Math.max(lastBusy, launch.start) >= SETTLE_MS;
}

// Tests only.
export function _resetLaunchForTests() { loaders = 0; lastBusy = 0; snapshot = null; listeners.clear(); }
