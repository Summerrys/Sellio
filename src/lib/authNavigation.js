const RETURN_KEY = 'sellio_return_to';
const RETURN_TTL_MS = 30 * 60 * 1000;
// Where a sign-in would normally land; a page waiting for the person (a store, a listing,
// one of Explore's tabs) wins over these.
const DEFAULT_LANDINGS = ['/explore', '/Dashboard', '/Account', '/Onboarding', '/Join'];

// A store page sends a signed-out buyer to sign in (checkout in the Android app);
// so do a listing's Chat button and Explore's tabs.
export function rememberReturnPath(path, storage = window.localStorage, now = Date.now()) {
  try { storage.setItem(RETURN_KEY, JSON.stringify({ path, at: now })); } catch { /* storage unavailable */ }
}

// The page to go back to (used once), if it was saved in the last 30 minutes.
export function takeReturnPath(storage = window.localStorage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(RETURN_KEY) || 'null');
    storage.removeItem(RETURN_KEY);
    if (!saved || typeof saved.path !== 'string' || !(now - saved.at < RETURN_TTL_MS)) return null;
    return /^\/(store\/[^/?#]+|order\/[^/?#]+\/[^/?#]+|listing\/[^/?#]+|explore(\/(listings|me|chats(\/[^/?#]+)?))?)(\?[^#]*)?$/.test(saved.path) ? saved.path : null;
  } catch { return null; }
}

// Keep completed sign-in out of Back history on every device (the app, iPhone, any
// browser): Back to the sign-in page while signed in would send the person straight
// forward again, so Back would look dead.
export function completeAuthNavigation(destination, browser = window) {
  if (DEFAULT_LANDINGS.includes(destination)) {
    destination = takeReturnPath(browser.localStorage) || destination;
  }
  browser.location.replace(destination);
}
