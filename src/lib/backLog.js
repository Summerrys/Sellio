// TEMPORARY — remove once Back in the Android app is confirmed working.
// A short record of what happens around Back in Base44's Android app, for Alvin's account only:
// kept on the phone (never sent anywhere), with a small "Back log" tab on the left edge that
// copies it to paste to Claude. Nothing is recorded or shown anywhere else.
const OWNER = 'summerriez@gmail.com';
const STORE_KEY = 'sellio-back-log';
const MAX_LINES = 400;

const browser = typeof window !== 'undefined' ? window : null;
const inAndroidApp = () => !!browser && /Android/i.test(browser.navigator?.userAgent || '') && (
  typeof browser.ReactNativeWebView?.postMessage === 'function' ||
  typeof browser.__hybrid_bridge?.sendMessage === 'function');

// The app's own record of who is signed in on this device (see AppUserContext).
let ownerCheckedAt = 0;
let ownerSignedIn = false;
function isOwner() {
  if (Date.now() - ownerCheckedAt < 3000) return ownerSignedIn;
  ownerCheckedAt = Date.now();
  try {
    const match = browser.document.cookie.match(/(?:^|;\s*)app_session=([^;]+)/);
    const user = match ? JSON.parse(decodeURIComponent(match[1])) : null;
    ownerSignedIn = String(user?.email || '').toLowerCase() === OWNER;
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
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { browser.localStorage.setItem(STORE_KEY, JSON.stringify(stored())); } catch { /* full or blocked */ }
  }, 400);
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
  const text = [`Sellio Back log, copied ${new Date().toString()}`, browser.navigator.userAgent, ...stored()].join('\n');
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
  tab.textContent = 'Back log';
  tab.setAttribute('aria-label', 'Copy the Back log');
  tab.style.cssText = 'position:fixed;left:0;top:42%;z-index:2147483000;writing-mode:vertical-rl;padding:10px 5px;'
    + 'font:600 11px/1 system-ui,sans-serif;color:#fff;background:rgba(15,23,42,0.55);border:0;border-radius:0 8px 8px 0;';
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
  browser.document.addEventListener('visibilitychange', () => backLog(`screen: ${browser.document.visibilityState}`), true);
  browser.addEventListener('focus', (event) => { if (event.target === browser) backLog('app window focused'); }, true);
  browser.addEventListener('blur', (event) => { if (event.target === browser) backLog('app window lost focus'); }, true);
  browser.addEventListener('pageshow', (event) => backLog(`pageshow${event.persisted ? ' (from memory)' : ''}`), true);
  browser.addEventListener('pagehide', () => backLog('pagehide'), true);
  browser.addEventListener('popstate', (event) => backLog(`popstate${event.state?.sellioOverlay ? ' (onto a step)' : ''}`), true);
  browser.addEventListener('pointerup', (event) => backLog(`tap ${label(event.target)}`), true);
  // The tab for Alvin's account: checked now and then (signing in can come later).
  const timer = setInterval(() => {
    if (!isOwner()) return;
    if (showTab()) clearInterval(timer);
  }, 3000);
}
