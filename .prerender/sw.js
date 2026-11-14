// Minimal service worker — exists primarily to satisfy Chrome's PWA installability
// criteria (a registered SW with a fetch handler). No offline caching is implemented
// intentionally, since Sellio is a live data app; we don't want to risk serving stale
// cached responses for orders, inventory, or prices.
//
// It also shows Sellio's alerts in the browser (src/lib/webPush.js): send-push sends each one
// through Firebase Cloud Messaging as data (title, body, link, tag, notification_id).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through — always hit the network, never cache.
  event.respondWith(fetch(event.request));
});

// ── Alerts ─────────────────────────────────────────────────────────────────────────────

const ALERT_ICON = '/icons/sellio-pwa-192.png';
const OPENED_ALERT_PARAM = 'sellio_alert'; // src/lib/pushAlerts.js takes it off the address

const isObject = (value) => !!value && typeof value === 'object';
const clip = (value, max) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);

// Sellio's own pages only.
function pageLink(link) {
  const value = typeof link === 'string' ? link.trim() : '';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.length > 300) return '/Notifications';
  return value;
}

function alertFrom(payload) {
  const data = isObject(payload) && isObject(payload.data) ? payload.data : isObject(payload) ? payload : {};
  const shown = isObject(payload) && isObject(payload.notification) ? payload.notification : {};
  const id = clip(data.notification_id, 100);
  return {
    title: clip(data.title || shown.title, 100) || 'Sellio',
    body: clip(data.body || shown.body, 300),
    link: pageLink(data.link),
    tag: clip(data.tag, 120),
    id: /^[\w-]+$/.test(id) ? id : '',
  };
}

// Every alert is shown, straight away: Safari stops a site's alerts after three pushes it
// doesn't show. send-push leaves browsers out while the person is on Sellio (the page they
// have open shows the alert then), and a newer alert about the same order or chat replaces
// the older one (tag).
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  const alert = alertFrom(payload);
  event.waitUntil(self.registration.showNotification(alert.title, {
    body: alert.body,
    icon: ALERT_ICON,
    ...(alert.tag ? { tag: alert.tag, renotify: true } : {}),
    data: { link: alert.link, id: alert.id },
  }));
});

// Opening an alert: a Sellio window already on that page comes to the front (and is told to
// mark the alert read), otherwise the page opens in a new one. A window on another page is
// left as it is: it may be busy (a kitchen screen, a message being written).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { link, id } = isObject(event.notification.data) ? event.notification.data : {};
  const target = new URL(pageLink(link), self.location.origin);
  event.waitUntil(openAlertPage(target, typeof id === 'string' ? id : ''));
});

async function openAlertPage(target, id) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const here = windows.find((client) => {
    try {
      const at = new URL(client.url);
      return at.origin === target.origin && at.pathname === target.pathname && at.search === target.search;
    } catch {
      return false;
    }
  });
  if (here) {
    try {
      const shown = await here.focus();
      if (id) (shown || here).postMessage({ type: 'sellio:alert-opened', id });
      return;
    } catch {
      // opened below instead
    }
  }
  if (id) target.searchParams.set(OPENED_ALERT_PARAM, id);
  await self.clients.openWindow(target.href);
}
