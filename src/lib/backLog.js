// TEMPORARY — remove once Back in the Android app is confirmed working.
// A short record of what happens around Back (and of errors) in Sellio's Android apps (Base44's old one and
// the Capacitor one), for Alvin's account only:
// kept on the phone (never sent anywhere), with a small "Back log" button that copies it to paste
// to Claude. It starts low on the left, above the bottom bar, and can be dragged anywhere on the
// screen; it stays where it's left.
// Also while signed out on a phone where Alvin's account has been signed in (so a sign-out and
// the next sign-in show up); never while another account is signed in.
// Nothing is recorded or shown anywhere else.
import { isNativeApp } from './nativeApp.js';

// Alvin's account, by a hash of its email: this code is public, the email needn't be.
const OWNER_HASH = 'ff948dec1bdf0';
const STORE_KEY = 'sellio-back-log';
const PLACE_KEY = 'sellio-back-log-place'; // where the button was dragged to (see showTab)
const OWNER_PHONE_KEY = 'sellio-back-log-phone'; // Alvin's account has been signed in on this phone
const MAX_LINES = 400;
// The chat keeps only the first 20,000 characters of a paste: the copy takes the newest lines
// that fit.
const MAX_COPY_CHARS = 18000;

const browser = typeof window !== 'undefined' ? window : null;
// Sellio's Android apps: the Capacitor app, and Base44's old one.
const inAndroidApp = () => !!browser && /Android/i.test(browser.navigator?.userAgent || '') && isNativeApp(browser);

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
  let email = '';
  try {
    const match = browser.document.cookie.match(/(?:^|;\s*)app_session=([^;]+)/);
    const user = match ? JSON.parse(decodeURIComponent(match[1])) : null;
    email = user?.email ? String(user.email).toLowerCase() : '';
  } catch { email = ''; }
  if (email) {
    ownerSignedIn = hashText(email) === OWNER_HASH;
    if (ownerSignedIn) { try { browser.localStorage.setItem(OWNER_PHONE_KEY, '1'); } catch { /* not remembered */ } }
  } else {
    // Signed out: still Alvin's phone if his account has been signed in on it.
    try { ownerSignedIn = browser.localStorage.getItem(OWNER_PHONE_KEY) === '1'; } catch { ownerSignedIn = false; }
  }
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
  // The page's background: its text would be the whole page (scripts included).
  if (el === browser.document.documentElement || el === browser.document.body) return el.tagName.toLowerCase();
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

// The button can be dragged anywhere on the screen (Alvin, 11 Nov 2026: "Make the 'Back log'
// pill draggable so I can move anywhere I want"). Where it's left is kept on the phone as the
// middle of the button, in parts of the screen's width and height, so it comes back there when
// the app is opened again or the phone is turned; it's always kept whole on the screen. A finger
// that moves less than DRAG_FROM is a tap, which copies the log.
const DRAG_FROM = 8;
let movingTab = false; // a drag of the button is on: its taps aren't logged

function placeSaved() {
  try {
    const place = JSON.parse(browser.localStorage.getItem(PLACE_KEY) || 'null');
    return place && Number.isFinite(place.x) && Number.isFinite(place.y) ? place : null;
  } catch { return null; }
}

// Puts the button's top-left corner at (left, top), kept whole on the screen.
function moveTab(tab, left, top) {
  const width = tab.offsetWidth;
  const height = tab.offsetHeight;
  const x = Math.min(Math.max(left, 0), Math.max(browser.innerWidth - width, 0));
  const y = Math.min(Math.max(top, 0), Math.max(browser.innerHeight - height, 0));
  tab.style.left = `${Math.round(x)}px`;
  tab.style.top = `${Math.round(y)}px`;
  tab.style.bottom = 'auto';
}

function putTabWhereLeft(tab) {
  const place = placeSaved();
  if (!place) return;
  moveTab(tab, place.x * browser.innerWidth - tab.offsetWidth / 2, place.y * browser.innerHeight - tab.offsetHeight / 2);
}

function showTab() {
  if (browser.document.getElementById('sellio-back-log-tab')) return true;
  if (!browser.document.body) return false;
  const tab = browser.document.createElement('button');
  tab.id = 'sellio-back-log-tab';
  tab.type = 'button';
  tab.setAttribute('aria-label', 'Copy the Back log');
  // A small pill inside a larger see-through area that is easy to hit and to drag. It starts low
  // on the left, above the bottom bar, clear of the headers and the bar's buttons (until 10 Nov
  // 2026 it sat at the top centre, over page titles). The page doesn't scroll or select text
  // while it's dragged.
  tab.style.cssText = 'position:fixed;left:40px;bottom:calc(env(safe-area-inset-bottom, 0px) + 68px);'
    + 'z-index:2147483000;padding:8px 10px;background:transparent;border:0;touch-action:none;'
    + 'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
  const pill = browser.document.createElement('span');
  pill.textContent = 'Back log';
  pill.style.cssText = 'display:block;padding:6px 14px;font:600 12px/1 system-ui,sans-serif;color:#fff;'
    + 'background:rgba(15,23,42,0.6);border-radius:999px;pointer-events:none;';
  tab.appendChild(pill);

  // A tap is seen here, when the finger lifts without having moved: Chrome doesn't always make a
  // click of a tap just after a drag. The click that may follow is then let go; a click with no
  // finger or mouse before it (the keyboard) still copies.
  let drag = null;
  let handled = false;
  tab.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    handled = false;
    const box = tab.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
    try { tab.setPointerCapture(event.pointerId); } catch { /* moves still reach it while over it */ }
  });
  tab.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_FROM) return;
    drag.moved = true;
    movingTab = true;
    moveTab(tab, drag.left + dx, drag.top + dy);
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    handled = true;
    if (!drag.moved && event.type === 'pointerup') void copyLog();
    if (drag.moved) {
      const box = tab.getBoundingClientRect();
      try {
        browser.localStorage.setItem(PLACE_KEY, JSON.stringify({
          x: (box.left + box.width / 2) / browser.innerWidth,
          y: (box.top + box.height / 2) / browser.innerHeight,
        }));
      } catch { /* left here until the app is opened again */ }
    }
    drag = null;
    movingTab = false;
  };
  tab.addEventListener('pointerup', endDrag);
  tab.addEventListener('pointercancel', endDrag);
  tab.addEventListener('click', () => {
    if (handled) { handled = false; return; }
    void copyLog();
  });
  browser.document.body.appendChild(tab);
  putTabWhereLeft(tab);
  browser.addEventListener('resize', () => putTabWhereLeft(tab));
  return true;
}

if (browser && inAndroidApp()) {
  try {
    const nav = browser.navigation;
    const entries = nav?.entries?.() || [];
    const ua = (browser.navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0];
    // How the page came (a new entry, a replace, a reload, Back/Forward) and from which page.
    let how = '';
    try {
      const type = nav?.activation?.navigationType;
      const from = nav?.activation?.from?.url;
      how = type ? ` by ${type}${from ? ` from ${new URL(from).pathname}` : ''}` : '';
    } catch { how = ''; }
    backLog(`page loaded${how}: ${entries.length} entries in this page's run of history, first is ${entries[0]?.sameDocument ? 'this page' : 'another page'}, ${ua}`);
  } catch { /* nothing to note */ }
  // Started on the first entry by way of an older page there (index.html, goFresh in
  // useBackToClose.js).
  try {
    const arrived = JSON.parse(browser.sessionStorage.getItem('sellio-fresh-arrived') || 'null');
    browser.sessionStorage.removeItem('sellio-fresh-arrived');
    if (arrived && Date.now() - arrived.at < 15000) backLog(`fresh start: arrived on the first entry (by way of ${arrived.via})`);
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
  browser.addEventListener('pointerup', (event) => { if (!movingTab) backLog(`tap ${label(event.target)}`); }, true);
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
