import { appPlatform, isNativeApp } from './nativeApp.js'; // with .js, as pushOffer.js

// Sellio's alerts outside the page (a phone or browser notification): which kind this device
// can get, and the module that handles them. Both modules have the same functions:
// pushStatus(), shouldAsk(), ask(), askLater(days) and permission().
// - 'android': the Android app (pushNotifications.js, Firebase through Android).
// - 'web': a browser that can show notifications (webPush.js): the website on a computer or an
//   Android phone, or Sellio added to an iPhone's or iPad's Home Screen (iOS 16.4 and later;
//   Apple gives Safari tabs none).
// - '': the iPhone app (no alerts yet), Base44's old app, and browsers that can't.
// Whether they can work here as well (the site set up for them, the browser good enough) is up
// to the module's pushStatus() and shouldAsk().
export function alertsKind(browser = typeof window !== 'undefined' ? window : undefined) {
  if (!browser) return '';
  if (appPlatform(browser) === 'android') return 'android';
  if (isNativeApp(browser)) return '';
  try {
    if ('Notification' in browser && 'PushManager' in browser && 'serviceWorker' in browser.navigator) return 'web';
  } catch {
    // an older browser
  }
  return '';
}

export function loadAlerts(kind = alertsKind()) {
  if (kind === 'android') return import('@/lib/pushNotifications');
  if (kind === 'web') return import('@/lib/webPush');
  return Promise.reject(new Error('No alerts on this device'));
}

// The words for this phone or this browser (PushPrompt and the empty notifications list).
export function alertWords(kind = alertsKind()) {
  return kind === 'web'
    ? {
      on: 'Alerts are on for this browser',
      settings: "You can allow them later in your browser's settings for this site.",
      failed: "Alerts couldn't be turned on just now. Sellio tries again next time you open it.",
      button: 'Turn on browser alerts',
    }
    : {
      on: 'Alerts are on for this phone',
      settings: "You can turn them on later in your phone's Settings: Apps → Sellio → Notifications.",
      failed: "Alerts couldn't be turned on just now. Sellio tries again next time you open it.",
      button: 'Turn on phone alerts',
    };
}

// A browser alert that was opened (public/sw.js adds ?sellio_alert=<notification id> to its
// page): the id is taken off the address before the app reads it, so the page's links and Back
// stay as they were. main.jsx then has webPush.js mark that notification read.
export const OPENED_ALERT_PARAM = 'sellio_alert';

export function takeOpenedAlert(browser = typeof window !== 'undefined' ? window : undefined) {
  try {
    const url = new URL(browser.location.href);
    if (!url.searchParams.has(OPENED_ALERT_PARAM)) return null;
    const id = url.searchParams.get(OPENED_ALERT_PARAM);
    url.searchParams.delete(OPENED_ALERT_PARAM);
    browser.history.replaceState(browser.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return /^[\w-]{1,100}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
