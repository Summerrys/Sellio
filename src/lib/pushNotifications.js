// Sellio's push alerts in the Android app: Firebase Cloud Messaging through
// @capacitor-firebase/messaging. capacitorApp.js starts this on Android only; the website and
// the iPhone app never load it. The database sends the alerts (supabase/functions/send-push)
// for each notification saved for someone whose phone is registered here.
// - Once the person allows notifications, this phone is registered for the signed-in account
//   (register_push_device): at each start, after signing in, and when Firebase gives the
//   phone a new token. Signing out takes it off again (unregister_push_device).
// - Alerts come on three channels (send-push picks one), which people can switch off one by
//   one in Android's settings for Sellio: Orders, Messages, Other updates.
// - Tapping an alert opens its page and marks it read. While Sellio is open, Android doesn't
//   show an alert: the page shows it (NotificationProvider).
// - Sellio asks with its own banner first (PushPrompt), then Android asks.
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { App } from '@capacitor/app';
import { getSupabase } from './supabaseClient';

const DEVICE_KEY = 'sellio.push.device';   // { token, userId }: this phone, as registered last
const FORGET_KEY = 'sellio.push.forget';   // a token signing out couldn't take off (offline)
const ASK_KEY = 'sellio.push.askAfter';    // Sellio's banner waits until then (ms)
export const PUSH_CHANGED_EVENT = 'sellio:push-changed';

const CHANNELS = [
  { id: 'orders', name: 'Orders', description: 'New orders for your shop, and updates on orders you placed', importance: 4 },
  { id: 'messages', name: 'Messages', description: 'Buyers writing to your shop', importance: 4 },
  { id: 'updates', name: 'Other updates', description: 'Ratings and other news from Sellio', importance: 3 },
];
const REREGISTER_MS = 6 * 60 * 60 * 1000;

let started = false;
let token = null;
let tokenPromise = null;
let registering = null;
let registerAgain = false;
let forgetting = Promise.resolve();
let registered = null; // { userId, token, at }

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

// 'granted', 'denied' (Android won't ask again), or 'prompt' / 'prompt-with-rationale'.
export async function permission() {
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive;
  } catch {
    return 'denied';
  }
}

// This phone's FCM token (Android gives one before notifications are allowed). null when push
// can't work in this build (no google-services.json) or on this phone (no Google Play
// services), or while offline (tried again next time).
function phoneToken() {
  if (token) return Promise.resolve(token);
  if (!tokenPromise) {
    tokenPromise = FirebaseMessaging.getToken()
      .then((result) => {
        token = result?.token || null;
        return token;
      })
      .catch(() => null)
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function appVersion() {
  try {
    const info = await App.getInfo();
    return `${info.version} (${info.build})`;
  } catch {
    return null;
  }
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

// Registers this phone for the signed-in account, when notifications are allowed.
// force: register even if it was a moment ago (a new token, or just allowed); asked while a
// registration is on its way, it runs again after it.
export function registerPhone({ force = false } = {}) {
  if (registering) {
    if (force) registerAgain = true;
    return registering;
  }
  registering = (async () => {
    await forgetting;
    const user = await signedInUser();
    if (!user || (await permission()) !== 'granted') return false;
    const phone = await phoneToken();
    if (!phone) return false;
    if (!force && registered && registered.userId === user.id && registered.token === phone &&
        Date.now() - registered.at < REREGISTER_MS) {
      return true;
    }
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('register_push_device', {
      p_token: phone,
      p_platform: 'android',
      p_app_version: await appVersion(),
    });
    if (error) return false;
    registered = { userId: user.id, token: phone, at: Date.now() };
    write(DEVICE_KEY, { token: phone, userId: user.id });
    write(FORGET_KEY, null); // the phone now belongs to this account
    changed();
    return true;
  })().catch(() => false).finally(() => {
    registering = null;
    if (registerAgain) {
      registerAgain = false;
      registerPhone({ force: true });
    }
  });
  return registering;
}

async function unregister(phone) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('unregister_push_device', { p_token: phone });
  if (error) throw error;
}

// Signed out: this phone stops getting that account's alerts.
function forgetPhone() {
  const saved = read(DEVICE_KEY);
  registered = null;
  write(DEVICE_KEY, null);
  changed();
  if (!saved?.token) return;
  forgetting = unregister(saved.token).catch(() => write(FORGET_KEY, saved.token));
}

// Started signed out after a sign-out that couldn't reach Sellio: take the phone off now.
function retryForget() {
  const phone = read(FORGET_KEY);
  if (typeof phone !== 'string' || !phone) return;
  forgetting = unregister(phone).then(() => write(FORGET_KEY, null)).catch(() => {});
}

// A tapped alert: its page (Sellio's own pages only), with the notification marked read.
async function openAlert(data = {}) {
  const raw = typeof data.link === 'string' ? data.link.trim() : '';
  const link = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/Notifications';
  const id = typeof data.notification_id === 'string' ? data.notification_id : '';
  console.info(`Sellio push: opening ${link}`);
  if (id) {
    try {
      const supabase = await getSupabase();
      await Promise.race([
        supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch { /* the page opens anyway */ }
  }
  if (window.location.pathname + window.location.search !== link) window.location.assign(link);
}

export function startPushNotifications() {
  if (started) return;
  started = true;

  for (const channel of CHANNELS) {
    FirebaseMessaging.createChannel({ ...channel, vibration: true }).catch(() => {});
  }
  FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    openAlert(event?.notification?.data || {});
  }).catch(() => {});
  FirebaseMessaging.addListener('tokenReceived', (event) => {
    if (event?.token && event.token !== token) {
      token = event.token;
      registerPhone({ force: true });
    }
  }).catch(() => {});

  getSupabase().then((supabase) => {
    supabase.auth.onAuthStateChange((event, session) => {
      // After the callback returns: Supabase calls from inside it can wait on each other.
      setTimeout(() => {
        if (event === 'SIGNED_OUT') forgetPhone();
        else if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) registerPhone();
        else if (!session && event === 'INITIAL_SESSION') retryForget();
      }, 0);
    });
  }).catch(() => {});

  // Whether push works in this build (logged for the build's emulator check; no token shown).
  phoneToken().then((phone) => {
    console.info(phone ? 'Sellio push: ready' : 'Sellio push: not available in this build');
  });
}

// --- Asking (PushPrompt) and the account panel (AccountProfileModal) ---

export function askLater(days) {
  write(ASK_KEY, Date.now() + days * 24 * 60 * 60 * 1000);
}

// Whether Sellio's banner should ask now. When notifications are allowed already, the phone
// is registered instead.
export async function shouldAsk() {
  if (!(await signedInUser())) return false;
  const state = await permission();
  if (state === 'granted') {
    registerPhone();
    return false;
  }
  if (state !== 'prompt' && state !== 'prompt-with-rationale') return false;
  if (Date.now() < (Number(read(ASK_KEY)) || 0)) return false;
  return !!(await phoneToken());
}

// Android's own question. true when allowed; the phone is then registered.
export async function askAndroid() {
  let state = 'denied';
  try {
    ({ receive: state } = await FirebaseMessaging.requestPermissions());
  } catch { /* stays denied */ }
  if (state !== 'granted') {
    changed();
    return false;
  }
  await registerPhone({ force: true });
  return true;
}

// 'on', 'off' (Sellio can ask), 'blocked' (only Android's settings can turn them on), or
// 'unavailable' (push doesn't work in this build or on this phone).
export async function pushStatus() {
  if (!(await phoneToken())) return 'unavailable';
  const state = await permission();
  if (state === 'granted') return 'on';
  if (state === 'denied') return 'blocked';
  return 'off';
}
