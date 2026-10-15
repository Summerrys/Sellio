const RETURN_KEY = 'sellio_return_to';
const RETURN_TTL_MS = 30 * 60 * 1000;
// Where a sign-in would normally land; a store page waiting for the buyer wins over these.
const DEFAULT_LANDINGS = ['/Dashboard', '/Account', '/Onboarding', '/Join'];

// A store page sends a signed-out buyer to sign in (checkout in the Android app).
export function rememberReturnPath(path, storage = window.localStorage, now = Date.now()) {
  try { storage.setItem(RETURN_KEY, JSON.stringify({ path, at: now })); } catch { /* storage unavailable */ }
}

// The store page to go back to (used once), if it was saved in the last 30 minutes.
export function takeReturnPath(storage = window.localStorage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(RETURN_KEY) || 'null');
    storage.removeItem(RETURN_KEY);
    if (!saved || typeof saved.path !== 'string' || !(now - saved.at < RETURN_TTL_MS)) return null;
    return /^\/store\/[^/?#]+(\?[^#]*)?$/.test(saved.path) ? saved.path : null;
  } catch { return null; }
}

// Keep completed authentication out of the Android WebView's Back history.
// Returning to Auth while signed in otherwise immediately opens Dashboard again.
export function completeAuthNavigation(destination, browser = window) {
  if (DEFAULT_LANDINGS.includes(destination)) {
    destination = takeReturnPath(browser.localStorage) || destination;
  }
  const nativeAndroid = /Android/i.test(browser.navigator.userAgent) && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
  if (nativeAndroid) browser.location.replace(destination);
  else browser.location.assign(destination);
}
