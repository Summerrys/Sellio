// Sellio's alerts in a browser: the website on a computer or phone, or Sellio added to an
// iPhone's Home Screen (pushAlerts.js picks this module; the Android app has
// pushNotifications.js). Web Push through Firebase Cloud Messaging, so the database sends them
// as it does to Android phones: supabase/functions/send-push, to the person's push_devices
// (platform 'web').
// - The site's settings are /web-push.json (scripts/web-push-config.mjs writes it on Cloudflare
//   Pages, HOSTING.md). Without it no browser is offered alerts, and nothing else changes.
// - The site's service worker (public/sw.js) shows them. It leaves one out while Sellio is on
//   screen and in use: the page shows it then (NotificationProvider).
// - Once the person allows notifications for the site, this browser is registered for the
//   signed-in account (register_push_device): at each start and after signing in. Signing out
//   takes it off again (unregister_push_device).
// - Sellio asks with its own banner first (PushPrompt). ask() asks the browser before anything
//   else, because browsers only ask during a click.
// - An alert opened from the browser opens its page, and the notification is marked read
//   (markAlertRead, as tapping one in the Android app does).
import { getSupabase } from './supabaseClient';

const DEVICE_KEY = 'sellio.webpush.device'; // { token, userId }: this browser, as registered last
const FORGET_KEY = 'sellio.webpush.forget'; // a token signing out couldn't take off (offline)
const ASK_KEY = 'sellio.webpush.askAfter';  // Sellio's banner waits until then (ms)
export const PUSH_CHANGED_EVENT = 'sellio:push-changed';
const SETTINGS_URL = '/web-push.json';
const FIREBASE_APP = 'sellio-web-push';
const REREGISTER_MS = 6 * 60 * 60 * 1000;
const WORKER_WAIT_MS = 10000;

let settings;            // the site's settings: undefined until read, null when there are none
let settingsPromise = null;
let messagingPromise = null;
let started = false;
let token = null;
let registering = null;
let registerAgain = false;
let forgetting = Promise.resolve();
let registered = null;   // { userId, token, at }

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
};
const changed = () => window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));
const word = (value) => (typeof value === 'string' && /^\S+$/.test(value.trim()) ? value.trim() : '');

// What Firebase's web SDK needs (its isSupported() checks the same), without loading it.
export function browserCanGetAlerts() {
  try {
    return window.isSecureContext !== false &&
      'Notification' in window && 'PushManager' in window && 'indexedDB' in window &&
      'serviceWorker' in navigator && navigator.cookieEnabled !== false &&
      'showNotification' in ServiceWorkerRegistration.prototype &&
      'getKey' in PushSubscription.prototype;
  } catch {
    return false;
  }
}

// The site's settings ({ apiKey, projectId, messagingSenderId, appId, vapidKey }), or null.
// Read once per page; read again after a failure to reach the site.
export function siteSettings() {
  if (settings !== undefined) return Promise.resolve(settings);
  if (!settingsPromise) {
    settingsPromise = (async () => {
      let res;
      try {
        res = await fetch(SETTINGS_URL, { cache: 'no-cache', credentials: 'same-origin' });
      } catch {
        return null;
      }
      const value = res.ok ? await res.json().catch(() => null) : null;
      const found = value && typeof value === 'object' ? {
        apiKey: word(value.apiKey),
        projectId: word(value.projectId),
        messagingSenderId: word(value.messagingSenderId),
        appId: word(value.appId),
        vapidKey: word(value.vapidKey),
      } : null;
      settings = found && Object.values(found).every(Boolean) ? found : null;
      return settings;
    })().finally(() => { settingsPromise = null; });
  }
  return settingsPromise;
}

// Firebase's messaging for the site's settings; null when this browser can't have it.
function firebaseMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const found = await siteSettings();
      if (!found || !browserCanGetAlerts()) return null;
      const [{ initializeApp, getApps }, fm] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
      if (!(await fm.isSupported().catch(() => false))) return null;
      const { vapidKey, ...firebaseConfig } = found;
      const app = getApps().find((a) => a.name === FIREBASE_APP) || initializeApp(firebaseConfig, FIREBASE_APP);
      return { fm, messaging: fm.getMessaging(app), vapidKey };
    })().catch(() => null);
    messagingPromise.then((found) => { if (!found) messagingPromise = null; });
  }
  return messagingPromise;
}

// The site's own service worker (public/sw.js), running: Firebase subscribes it to pushes.
async function serviceWorker() {
  const registration = await navigator.serviceWorker.register('/sw.js');
  if (registration.active) return registration;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The service worker did not start')), WORKER_WAIT_MS)),
  ]);
}

// This browser's FCM token. Only once notifications are allowed: Firebase would ask otherwise.
async function browserToken() {
  if (token) return token;
  const found = await firebaseMessaging();
  if (!found) return null;
  try {
    token = (await found.fm.getToken(found.messaging, {
      vapidKey: found.vapidKey,
      serviceWorkerRegistration: await serviceWorker(),
    })) || null;
  } catch (error) {
    console.warn('Sellio browser alerts: no token from Firebase', error?.code || error?.message || error);
    token = null;
  }
  return token;
}

async function signedInUser() {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch {
    return null;
  }
}

// 'web Chrome Windows', 'web Safari iOS', ... (push_devices.app_version, at most 40 letters).
function browserName() {
  const ua = String(navigator.userAgent || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /SamsungBrowser\//.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `web ${browser}${system ? ` ${system}` : ''}`.slice(0, 40);
}

// 'granted', 'denied' (only the browser's settings can change it) or 'prompt'.
export async function permission() {
  try {
    const state = Notification.permission;
    return state === 'granted' || state === 'denied' ? state : 'prompt';
  } catch {
    return 'denied';
  }
}

// Registers this browser for the signed-in account, when notifications are allowed.
// force: register even if it was a moment ago; asked while a registration is on its way, it
// runs again after it.
export function register({ force = false } = {}) {
  if (registering) {
    if (force) registerAgain = true;
    return registering;
  }
  registering = (async () => {
    await forgetting;
    const user = await signedInUser();
    if (!user || (await permission()) !== 'granted') return false;
    const browser = await browserToken();
    if (!browser) return false;
    if (!force && registered && registered.userId === user.id && registered.token === browser &&
        Date.now() - registered.at < REREGISTER_MS) {
      return true;
    }
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('register_push_device', {
      p_token: browser,
      p_platform: 'web',
      p_app_version: browserName(),
    });
    if (error) return false;
    registered = { userId: user.id, token: browser, at: Date.now() };
    write(DEVICE_KEY, { token: browser, userId: user.id });
    write(FORGET_KEY, null); // the browser now belongs to this account
    changed();
    return true;
  })().catch(() => false).finally(() => {
    registering = null;
    if (registerAgain) {
      registerAgain = false;
      register({ force: true });
    }
  });
  return registering;
}

async function unregister(browser) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('unregister_push_device', { p_token: browser });
  if (error) throw error;
}

// Signed out: this browser stops getting that account's alerts.
function forget() {
  const saved = read(DEVICE_KEY);
  registered = null;
  write(DEVICE_KEY, null);
  changed();
  if (!saved?.token) return;
  forgetting = unregister(saved.token).catch(() => write(FORGET_KEY, saved.token));
}

// Started signed out after a sign-out that couldn't reach Sellio: take the browser off now.
function retryForget() {
  const browser = read(FORGET_KEY);
  if (typeof browser !== 'string' || !browser) return;
  forgetting = unregister(browser).then(() => write(FORGET_KEY, null)).catch(() => {});
}

// Follows sign-in and sign-out. main.jsx starts it when notifications are allowed for the site
// already; ask() starts it once they are.
export function startWebPush() {
  if (started) return;
  started = true;
  getSupabase().then((supabase) => {
    supabase.auth.onAuthStateChange((event, session) => {
      // After the callback returns: Supabase calls from inside it can wait on each other.
      setTimeout(() => {
        if (event === 'SIGNED_OUT') forget();
        else if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) register();
        else if (!session && event === 'INITIAL_SESSION') retryForget();
      }, 0);
    });
  }).catch(() => {});
}

// An alert opened from the browser (pushAlerts.takeOpenedAlert): marked read.
export async function markAlertRead(id) {
  if (typeof id !== 'string' || !id) return false;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return false;
    const { error } = await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

// --- Asking (PushPrompt), the account panel and the empty notifications list ---

export function askLater(days) {
  write(ASK_KEY, Date.now() + days * 24 * 60 * 60 * 1000);
}

// Whether Sellio's banner should ask now. When notifications are allowed already, the browser
// is registered instead.
export async function shouldAsk() {
  if (!browserCanGetAlerts() || !(await signedInUser())) return false;
  const state = await permission();
  if (state === 'granted') {
    startWebPush();
    register();
    return false;
  }
  if (state !== 'prompt') return false;
  if (Date.now() < (Number(read(ASK_KEY)) || 0)) return false;
  return !!(await siteSettings());
}

// The browser's own question. Call it straight from a click: it asks before anything else.
// true when allowed and this browser is registered.
export async function ask() {
  let state = 'denied';
  try {
    state = await Notification.requestPermission();
  } catch {
    state = 'denied';
  }
  if (state !== 'granted') {
    changed();
    return false;
  }
  startWebPush();
  return register({ force: true });
}

// 'on', 'off' (Sellio can ask), 'blocked' (only the browser's settings can allow them), or
// 'unavailable' (this browser can't, or the site isn't set up for them).
export async function pushStatus() {
  if (!browserCanGetAlerts() || !(await siteSettings())) return 'unavailable';
  const state = await permission();
  if (state === 'granted') return 'on';
  if (state === 'denied') return 'blocked';
  return 'off';
}
