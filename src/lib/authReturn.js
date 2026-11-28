// Sign-in results that land on the start page instead of /Auth (Alvin, 29 Nov 2026: a closed
// account "was not able to reinstate"). Supabase sends Google sign-ins back to the address the app
// asks for (redirectTo, e.g. https://sellio.sg/Auth?join=1) only when that address is on its
// Redirect URLs list. When it isn't, Supabase uses its Site URL instead, with no path or query:
// https://sellio.apptelier.sg, which the worker moves to https://sellio.sg/. The start page knew
// nothing about sign-ins, so a closed account's "User is banned" was never shown as the
// closed-account screen, and a new Google sign-up lost its join=1.
//
// So, before the app starts: on the website, an address at / that carries a sign-in result
// (#access_token=…, or an error from Supabase) moves to /Auth with that result, and with the
// query the sign-in started with (join=1, an invite's token), which startGoogleSignIn keeps for
// the trip in this tab (rememberAuthReturn). A password-reset link goes to /Auth?type=recovery.
// Sellio's app does the same in App.jsx (RootRoute).

const INTENT_KEY = 'sellio:auth-return';
const INTENT_MS = 30 * 60 * 1000;
const ERROR_KEYS = ['error', 'error_code', 'error_description'];

export function rememberAuthReturn(redirectTo, browser = window) {
  try {
    const search = new URL(redirectTo, browser.location.origin).search;
    browser.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ search, at: Date.now() }));
  } catch { /* storage switched off: the sign-in still works, without join=1 */ }
}

function takeIntent(browser, now) {
  try {
    const raw = browser.sessionStorage.getItem(INTENT_KEY);
    browser.sessionStorage.removeItem(INTENT_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    const at = Number(saved?.at);
    if (typeof saved?.search === 'string' && Number.isFinite(at) && now - at >= 0 && now - at < INTENT_MS) {
      const query = new URLSearchParams(saved.search);
      const kept = new URLSearchParams();
      for (const key of ['join', 'token']) if (query.get(key)) kept.set(key, query.get(key));
      const text = kept.toString();
      return text ? `?${text}` : '';
    }
  } catch { /* nothing kept */ }
  return '';
}

// Moves the address (history.replaceState) and returns where to, or returns null.
export function sendSignInResultToAuth(browser = window, now = Date.now()) {
  const { pathname, search, hash } = browser.location;
  if (pathname !== '/') return null;
  const fragment = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(search || '');
  const tokens = fragment.has('access_token');
  const fragmentError = fragment.has('error') || fragment.has('error_code') || fragment.has('error_description');
  const queryError = query.has('error_code') || (query.has('error') && query.has('error_description'));
  if (!tokens && !fragmentError && !queryError) return null;

  const recovery = fragment.get('type') === 'recovery' || query.get('type') === 'recovery';
  const target = recovery ? '/Auth?type=recovery' : `/Auth${takeIntent(browser, now)}`;
  let fragmentOut = String(hash || '');
  if (!tokens && !fragmentError) {
    // Only the query carries the error: /Auth reads it from after the #.
    const moved = new URLSearchParams();
    for (const key of ERROR_KEYS) if (query.get(key)) moved.set(key, query.get(key));
    fragmentOut = `#${moved.toString()}`;
  }
  const to = target + fragmentOut;
  browser.history.replaceState(browser.history.state, '', to);
  return to;
}
