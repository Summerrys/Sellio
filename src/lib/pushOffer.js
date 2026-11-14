import { alertsKind } from './pushAlerts.js';

// Offering Sellio's alerts: in the Android app (pushNotifications.js) and in browsers that can
// show them (webPush.js; pushAlerts.js tells which). Layout offers them to a shop's people who
// can see orders ("shop": alerts for new orders), the storefront to a signed-in buyer after an
// order ("order": alerts as the shop accepts and readies it), a chat to whoever has just sent a
// message ("chat": alerts when the other side replies). PushPrompt (App.jsx) decides whether to
// ask: not when they're on already, when the phone or browser has been told no for good, where
// alerts can't work (a browser without them, a website not set up for them), or for a while
// after "Not now". Each kind is offered at most once while Sellio is open. Safe to call
// anywhere: where there are no alerts it does nothing.
export const OFFER_PUSH_EVENT = 'sellio:offer-push';

const offered = new Set();

export function offerPushAlerts(kind) {
  if (!alertsKind() || offered.has(kind)) return;
  offered.add(kind);
  window.dispatchEvent(new CustomEvent(OFFER_PUSH_EVENT, { detail: { kind } }));
}
