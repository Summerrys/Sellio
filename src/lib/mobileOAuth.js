// Supabase PKCE state belongs to the originating Android WebView. Browser
// callbacks may carry a one-use code, but never access/refresh tokens or a verifier.
export const ANDROID_PACKAGE = 'com.base6985959ce9aaceadb8b7cc41.app';
export const MOBILE_AUTH_KEY = 'sellio-mobile-google';
export const VERIFIER_KEY = MOBILE_AUTH_KEY + '-code-verifier';
export const PENDING_KEY = 'sellio-mobile-google-pending';
export const COMPLETE_KEY = 'sellio-mobile-google-complete';
export const CALLBACK_PARAM = 'sellio_mobile_oauth';
export const ALLOWED_ORIGINS = ['https://sellio.apptelier.sg', 'https://selliosg.base44.app'];
const ATTEMPT_TTL = 10 * 60 * 1000;
const NONCE = /^[a-f0-9]{64}$/;
const CODE = /^[A-Za-z0-9._~-]{1,512}$/;

export function isNativeAndroid(browser = window) {
  return /Android/i.test(browser.navigator.userAgent) && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
}

// Persist only the verifier. The temporary client's session stays in memory;
// the established app client remains the single persistent session authority.
export function createMobileOAuthStorage(storage) {
  const memory = new Map();
  return {
    getItem: key => key === VERIFIER_KEY ? storage.getItem(key) : memory.get(key) ?? null,
    setItem: (key, value) => key === VERIFIER_KEY ? storage.setItem(key, value) : memory.set(key, value),
    removeItem: key => key === VERIFIER_KEY ? storage.removeItem(key) : memory.delete(key),
  };
}

export function readPendingMobileAuth(storage, now = Date.now()) {
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY));
    if (!pending || !NONCE.test(pending.attempt) ||
        !ALLOWED_ORIGINS.includes(pending.origin) ||
        !Number.isFinite(pending.createdAt) || now < pending.createdAt ||
        now - pending.createdAt > ATTEMPT_TTL) return null;
    return pending;
  } catch { return null; }
}

export function clearMobileAuth(storage) {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(VERIFIER_KEY);
}

export function createMobileAuthAttempt(browser, { join = false, inviteToken = '' } = {}) {
  const origin = browser.location.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    throw new Error('Google sign-in in the Android app requires the published Sellio address.');
  }
  // Fail before leaving the app if the callback cannot survive a cold restart.
  const probe = PENDING_KEY + '-probe';
  for (const storage of [browser.localStorage, browser.sessionStorage]) {
    storage.setItem(probe, '1');
    if (storage.getItem(probe) !== '1') throw new Error('Enable app storage and try signing in again.');
    storage.removeItem(probe);
  }
  const bytes = new Uint8Array(32);
  browser.crypto.getRandomValues(bytes);
  const pending = {
    attempt: Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''),
    origin, createdAt: Date.now(), join: Boolean(join), inviteToken,
  };
  clearMobileAuth(browser.localStorage);
  browser.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const callback = new URL('/Auth', origin);
  callback.searchParams.set(CALLBACK_PARAM, '1');
  callback.searchParams.set('attempt', pending.attempt);
  return { pending, redirectTo: callback.href };
}

export function isMobileOAuthCallback(input) {
  try { return new URL(input).searchParams.get(CALLBACK_PARAM) === '1'; }
  catch { return false; }
}

export function parseMobileOAuthCallback(input) {
  const url = new URL(input);
  const params = url.searchParams;
  if (!ALLOWED_ORIGINS.includes(url.origin) || !['/Auth', '/'].includes(url.pathname) ||
      params.get(CALLBACK_PARAM) !== '1' || !NONCE.test(params.get('attempt') || '') ||
      ['attempt', 'code', 'error'].some(key => params.getAll(key).length > 1)) {
    throw new Error('This sign-in link is invalid. Start Google sign-in again in Sellio.');
  }
  // Supabase can report provider cancellation in a fragment, including for
  // PKCE. Normalize only those error fields; never forward a token fragment.
  const fragment = new URLSearchParams(url.hash.slice(1));
  const fragmentError = fragment.get('error');
  const safeErrorFragment = fragmentError && [...fragment.keys()].every(key =>
    ['error', 'error_code', 'error_description'].includes(key));
  if ((url.hash && !safeErrorFragment) || params.has('access_token') || params.has('refresh_token') ||
      fragment.getAll('error').length > 1 || (params.has('error') && fragmentError)) {
    throw new Error('This sign-in link uses an unsupported return format.');
  }
  const code = params.get('code');
  const error = params.get('error') || fragmentError;
  if ((!code || !CODE.test(code)) && !error) {
    throw new Error('This sign-in link is incomplete. Start Google sign-in again.');
  }
  if (code && error) throw new Error('This sign-in link is invalid.');
  return { origin: url.origin, attempt: params.get('attempt'), code, error: error ? 'access_denied' : null };
}

export function buildMobileReturnUrl(callback, failed = false) {
  const url = new URL('/Auth', callback.origin);
  if (!ALLOWED_ORIGINS.includes(url.origin) || !NONCE.test(callback.attempt)) {
    throw new Error('Invalid Sellio return address.');
  }
  url.searchParams.set(CALLBACK_PARAM, '1');
  url.searchParams.set('attempt', callback.attempt);
  if (callback.error) url.searchParams.set('error', 'access_denied');
  else {
    if (!CODE.test(callback.code || '')) throw new Error('Invalid sign-in code.');
    url.searchParams.set('code', callback.code);
  }
  if (failed) url.searchParams.set('app_link_failed', '1');
  return url;
}

export function buildAndroidReturnIntent(callback) {
  const url = buildMobileReturnUrl(callback);
  const fallback = buildMobileReturnUrl(callback, true);
  return 'intent://' + url.host + url.pathname + url.search +
    '#Intent;scheme=https;package=' + ANDROID_PACKAGE +
    ';S.browser_fallback_url=' + encodeURIComponent(fallback.href) + ';end';
}

export function hasMobileGoogleCompletion(browser = window) {
  try {
    const value = JSON.parse(browser.sessionStorage.getItem(COMPLETE_KEY));
    const age = Date.now() - value?.createdAt;
    return value?.origin === browser.location.origin && age >= 0 && age < 30000;
  } catch { return false; }
}

const exchangesByStorage = new WeakMap();
export function completeMobileGoogleAuth({ browser, callback, oauthClient, appClient, getAppClient }) {
  const key = callback.attempt + ':' + callback.code;
  let exchanges = exchangesByStorage.get(browser.localStorage);
  if (!exchanges) { exchanges = new Map(); exchangesByStorage.set(browser.localStorage, exchanges); }
  if (exchanges.has(key)) return exchanges.get(key);
  const task = (async () => {
    const pending = readPendingMobileAuth(browser.localStorage);
    if (!pending || pending.attempt !== callback.attempt || pending.origin !== callback.origin ||
        browser.location.origin !== pending.origin || !browser.localStorage.getItem(VERIFIER_KEY)) {
      throw new Error('This sign-in was not started in this app, or it expired. Start again in Sellio.');
    }
    // Remove callback data from the address/history before accessing any session.
    browser.history.replaceState(browser.history.state, '', '/Auth');
    try {
      if (callback.error) throw new Error('Google sign-in was cancelled. You can try again.');
      const { data, error } = await oauthClient.auth.exchangeCodeForSession(callback.code);
      if (error || !data?.session) throw new Error('Google sign-in expired or could not be completed. Please try again.');
      const session = data.session;
      if (!session.user?.identities?.some(identity => identity.provider === 'google')) {
        throw new Error('Google did not return a valid sign-in.');
      }
      // Initialize the existing client only after the callback was scrubbed.
      // It must not attempt its own automatic URL-session detection first.
      const client = appClient || await getAppClient();
      const { error: sessionError } = await client.auth.setSession({
        access_token: session.access_token, refresh_token: session.refresh_token,
      });
      if (sessionError) throw new Error('Could not finish signing in. Please try again.');
      browser.sessionStorage.setItem(COMPLETE_KEY, JSON.stringify({
        origin: pending.origin, createdAt: Date.now(),
      }));
      const destination = new URL('/Auth', pending.origin);
      if (pending.join) destination.searchParams.set('join', '1');
      if (pending.inviteToken) destination.searchParams.set('token', pending.inviteToken);
      clearMobileAuth(browser.localStorage);
      return destination.pathname + destination.search;
    } catch (error) {
      clearMobileAuth(browser.localStorage);
      throw error;
    }
  })();
  const tracked = task.finally(() => exchanges.delete(key));
  exchanges.set(key, tracked);
  return tracked;
}
