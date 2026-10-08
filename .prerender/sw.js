// Minimal service worker — exists primarily to satisfy Chrome's PWA installability
// criteria (a registered SW with a fetch handler). No offline caching is implemented
// intentionally, since Sellio is a live data app; we don't want to risk serving stale
// cached responses for orders, inventory, or prices.

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
