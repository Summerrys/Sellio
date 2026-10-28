// TEMPORARY — remove once Back in the Android app is confirmed working.
// A short record of what happens around Back (and of errors) in Base44's Android app, for Alvin's account only:
// kept on the phone (never sent anywhere), with a small "Back log" button at the top centre that
// copies it to paste to Claude (away from the screen's side edges, where the Back swipe starts).
// Nothing is recorded or shown anywhere else.
// Alvin's account, by a hash of its email: this code is public, the email needn't be.
const OWNER_HASH = 'ff948dec1bdf0';
const STORE_KEY = 'sellio-back-log';
const MAX_LINES = 400;
// The chat keeps only the first 20,000 characters of a paste: the copy takes the newest lines
// that fit.
const MAX_COPY_CHARS = 18000;

const browser = typeof window !== 'undefined' ? window : null;
const inAndroidApp = () => !!browser && /Android/i.test(browser.navigator?.userAgent || '') && (
  typeof browser.ReactNativeWebView?.postMessage === 'function' ||
  typeof browser.__hybrid_bridge?.sendMessage === 'function');

// A short, stable hash of a text (cyrb53): enough to recognise one email without writing it here.
function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// The app's own record of who is signed in on this device (see AppUserContext).
let ownerCheckedAt = 0;
let ownerSignedIn = false;
function isOwner() {
  if (Date.now() - ownerCheckedAt < 3000) return ownerSignedIn;
  ownerCheckedAt = Date.now();
  try {
    const match = browser.document.cookie.match(/(?:^|;\s*)app_session=([^;]+)/);
    const user = match ? JSON.parse(decodeURIComponent(match[1])) : null;
    ownerSignedIn = !!user?.email && hashText(String(user.email).toLowerCase()) === OWNER_HASH;
  } catch { ownerSignedIn = false; }
  return ownerSignedIn;
}
const recording = () => inAndroidApp() && isOwner();

let lines = null;
function stored() {
  if (lines) return lines;
  try { lines = JSON.parse(browser.localStorage.getItem(STORE_KEY) || '[]'); } catch { lines = []; }
  if (!Array.isArray(lines)) lines = [];
  return lines;
}
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!lines) return; // nothing recorded on this page
  try { browser.localStorage.setItem(STORE_KEY, JSON.stringify(lines)); } catch { /* full or blocked */ }
}
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 400);
}

// Where the page is in its history: entry number / entries, our Back step, the page.
function where() {
  try {
    const current = browser.navigation?.currentEntry;
    const step = browser.history.state?.sellioOverlay ? ' step' : '';
    return `@${current ? current.index : '?'}/${browser.history.length}${step} ${browser.location.pathname}`;
  } catch { return '@?'; }
}

export function backLog(message) {
  if (!recording()) return;
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const list = stored();
  list.push(`${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')} ${message}  ${where()}`);
  if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES);
  saveSoon();
}

function label(target) {
  const el = target?.closest?.('button, a, [role="button"], [role="tab"], input, label') || target;
  if (!el?.tagName) return '?';
  const text = (el.getAttribute?.('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ''}`;
}

async function copyLog() {
  const head = [`Sellio Back log, copied ${new Date().toString()}`, browser.navigator.userAgent];
  const all = stored();
  const kept = [];
  let size = head.join('\n').length + 60;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    size += all[i].length + 1;
    if (size > MAX_COPY_CHARS) break;
    kept.unshift(all[i]);
  }
  if (kept.length < all.length) head.push(`(the oldest ${all.length - kept.length} lines left out)`);
  const text = [...head, ...kept].join('\n');
  let copied = false;
  try { await browser.navigator.clipboard.writeText(text); copied = true; } catch { /* try the older way */ }
  if (!copied) {
    try {
      const area = browser.document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      browser.document.body.appendChild(area);
      area.select();
      copied = browser.document.execCommand('copy');
      area.remove();
    } catch { /* not copied */ }
  }
  const note = browser.document.createElement('div');
  note.textContent = copied ? 'Back log copied. Paste it to Claude.' : 'Could not copy the Back log.';
  note.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);'
    + 'z-index:2147483001;background:#0f172a;color:#fff;font:600 13px/1.3 system-ui,sans-serif;padding:10px 14px;border-radius:12px;';
  browser.document.body.appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

function showTab() {
  if (browser.document.getElementById('sellio-back-log-tab')) return true;
  if (!browser.document.body) return false;
  const tab = browser.document.createElement('button');
  tab.id = 'sellio-back-log-tab';
  tab.type = 'button';
  tab.setAttribute('aria-label', 'Copy the Back log');
  // A small pill at the top centre, inside a larger see-through area that is easy to hit.
  tab.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top, 0px) + 2px);transform:translateX(-50%);'
    + 'z-index:2147483000;padding:8px 10px;background:transparent;border:0;';
  const pill = browser.document.createElement('span');
  pill.textContent = 'Back log';
  pill.style.cssText = 'display:block;padding:6px 14px;font:600 12px/1 system-ui,sans-serif;color:#fff;'
    + 'background:rgba(15,23,42,0.6);border-radius:999px;';
  tab.appendChild(pill);
  tab.addEventListener('click', () => { void copyLog(); });
  browser.document.body.appendChild(tab);
  return true;
}

if (browser && inAndroidApp()) {
  try {
    const nav = browser.navigation;
    const entries = nav?.entries?.() || [];
    const ua = (browser.navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0];
    backLog(`page loaded: ${entries.length} entries in this page's run of history, first is ${entries[0]?.sameDocument ? 'this page' : 'another page'}, ${ua}`);
  } catch { /* nothing to note */ }
  // Registered before Sellio's own listeners (this file loads first), so these see every event.
  // Saved at once when the app goes off screen (it may be closed there) and when the page goes
  // (a reload), so the last lines before either aren't lost.
  browser.document.addEventListener('visibilitychange', () => {
    backLog(`screen: ${browser.document.visibilityState}`);
    if (browser.document.visibilityState === 'hidden') saveNow();
  }, true);
  browser.addEventListener('focus', (event) => { if (event.target === browser) backLog('app window focused'); }, true);
  browser.addEventListener('blur', (event) => { if (event.target === browser) backLog('app window lost focus'); }, true);
  browser.addEventListener('pageshow', (event) => backLog(`pageshow${event.persisted ? ' (from memory)' : ''}`), true);
  browser.addEventListener('pagehide', () => { backLog('pagehide'); saveNow(); }, true);
  browser.addEventListener('popstate', (event) => backLog(`popstate${event.state?.sellioOverlay ? ' (onto a step)' : ''}`), true);
  browser.addEventListener('pointerup', (event) => backLog(`tap ${label(event.target)}`), true);
  // Errors: the page's own (uncaught), and Sellio's own code or styles failing to download (not
  // photos, fonts or the extra files a page fetches ahead). The same one again within 5 seconds
  // is noted once.
  let lastError = '';
  let lastErrorAt = 0;
  const logError = (message) => {
    if (message === lastError && Date.now() - lastErrorAt < 5000) return;
    lastError = message;
    lastErrorAt = Date.now();
    backLog(message);
  };
  browser.addEventListener('error', (event) => {
    const el = event.target;
    if (el && el !== browser && el.tagName) {
      const url = String(el.src || el.href || '');
      const own = url.startsWith(`${browser.location.origin}/`);
      if (own && (el.tagName === 'SCRIPT' || (el.tagName === 'LINK' && el.rel === 'stylesheet'))) {
        logError(`not downloaded: ${url.split('/').pop()}`);
      }
      return;
    }
    logError(`error: ${String(event.message || event.error?.message || '?').slice(0, 200)}`);
  }, true);
  browser.addEventListener('unhandledrejection', (event) => {
    logError(`failed: ${String(event.reason?.message || event.reason || '?').slice(0, 200)}`);
  });
  // The tab for Alvin's account: checked now and then (signing in can come later).
  const timer = setInterval(() => {
    if (!isOwner()) return;
    if (showTab()) clearInterval(timer);
  }, 3000);
}
