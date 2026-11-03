import { appPlatform } from './nativeApp.js';

// Offering Sellio's push alerts, which are in the Android app only (pushNotifications.js).
// Layout offers them to a shop's people who can see orders ("shop": alerts for new orders),
// the storefront to a signed-in buyer after an order ("order": alerts as the shop accepts and
// readies it). PushPrompt (App.jsx) decides whether to ask: not when they're on already, when
// Android has been told no for good, in a build without push, or for a while after "Not now".
// Each kind is offered at most once while the app is open. Safe to call anywhere: elsewhere
// than in the Android app it does nothing.
export const OFFER_PUSH_EVENT = 'sellio:offer-push';

const offered = new Set();

export function offerPushAlerts(kind) {
  if (appPlatform() !== 'android' || offered.has(kind)) return;
  offered.add(kind);
  window.dispatchEvent(new CustomEvent(OFFER_PUSH_EVENT, { detail: { kind } }));
}
