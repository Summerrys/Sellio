// What was last loaded, kept on the phone for when there's no connection (UX states, 4):
// the shop's latest orders, Explore's listings and the app's own records (who you are, your
// shop, your role), so the app can open and show them with no internet. Each copy belongs
// to the person signed in when it was made (owner; "_" for what anyone may see) and goes
// when someone else is signed in, or nobody (pruneSnapshots).

const PREFIX = 'sellio_offline:v1:';
// The phone's storage is small and shared with the sign-in, carts and settings, so each copy
// has a ceiling (in characters) and a larger one isn't kept: all of them together stay well
// within it.
export const MAX_CHARS = { orders: 400000, products: 400000, feed: 150000, other: 60000 };
const ceilingFor = (key) => (
  key.startsWith('orders:') || key.startsWith('q:["orders"') ? MAX_CHARS.orders
    : key.startsWith('q:["products"') ? MAX_CHARS.products
      : key === 'explore:feed' ? MAX_CHARS.feed
        : MAX_CHARS.other
);
const WRITE_DELAY = 2000; // copies are written at most every 2 seconds per kind

const fullKey = (owner, key) => `${PREFIX}${owner || '_'}:${key}`;
const storage = () => {
  try { return globalThis.localStorage || null; } catch { return null; }
};

// Keeps data under key now. Returns whether it was kept (too large, or storage full: not).
export function saveSnapshot(key, data, owner = null, now = Date.now()) {
  const store = storage();
  if (!store) return false;
  try {
    const value = JSON.stringify({ savedAt: now, data });
    if (value.length > ceilingFor(key)) {
      store.removeItem(fullKey(owner, key)); // an older, smaller copy would show an out-of-date list as current
      return false;
    }
    store.setItem(fullKey(owner, key), value);
    return true;
  } catch {
    return false;
  }
}

// { data, savedAt } kept under key for owner, or null.
export function loadSnapshot(key, owner = null) {
  const store = storage();
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(fullKey(owner, key)) || 'null');
    return parsed && 'data' in parsed && Number.isFinite(parsed.savedAt) ? { data: parsed.data, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

// Every copy owner has whose key starts with prefix: [{ key, data, savedAt }].
export function listSnapshots(prefix, owner = null) {
  const store = storage();
  if (!store) return [];
  const start = fullKey(owner, prefix);
  const found = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const name = store.key(i);
      if (!name?.startsWith(start)) continue;
      const key = name.slice(fullKey(owner, '').length);
      const snapshot = loadSnapshot(key, owner);
      if (snapshot) found.push({ key, ...snapshot });
    }
  } catch { /* storage unavailable */ }
  return found;
}

// Removes the copies of anyone but owner (owner null: every personal copy). What anyone may
// see ("_") stays.
export function pruneSnapshots(owner = null) {
  const store = storage();
  if (!store) return;
  const keep = owner ? `${PREFIX}${owner}:` : null;
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const name = store.key(i);
      if (!name?.startsWith(PREFIX) || name.startsWith(`${PREFIX}_:`) || (keep && name.startsWith(keep))) continue;
      store.removeItem(name);
    }
  } catch { /* storage unavailable */ }
}

// Keeps data under key soon (a busy Orders page changes often): the latest copy is written
// WRITE_DELAY after the last change, or straight away when the phone goes offline or the app
// goes to the background.
const waiting = new Map();
export function keepSnapshot(key, data, owner = null) {
  const name = fullKey(owner, key);
  const previous = waiting.get(name);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => { waiting.delete(name); saveSnapshot(key, data, owner); }, WRITE_DELAY);
  waiting.set(name, { timer, key, data, owner });
}
export function flushSnapshots() {
  for (const [name, entry] of waiting) {
    clearTimeout(entry.timer);
    waiting.delete(name);
    saveSnapshot(entry.key, entry.data, entry.owner);
  }
}
if (typeof window !== 'undefined' && !window.__sellioSnapshotFlush) {
  window.__sellioSnapshotFlush = true;
  window.addEventListener('offline', flushSnapshots);
  window.addEventListener('pagehide', flushSnapshots);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSnapshots(); });
}

// "3:42 pm" today, "8 Nov, 3:42 pm" another day: when what's on screen was loaded.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function loadedAtText(time, now = Date.now()) {
  const at = new Date(time);
  const today = new Date(now);
  const clock = `${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'am' : 'pm'}`;
  const sameDay = at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
  return sameDay ? clock : `${at.getDate()} ${MONTHS[at.getMonth()]}, ${clock}`;
}
