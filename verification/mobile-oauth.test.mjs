import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  ALLOWED_ORIGINS, ANDROID_PACKAGE, CALLBACK_PARAM, COMPLETE_KEY, MOBILE_AUTH_KEY,
  PENDING_KEY, VERIFIER_KEY, buildAndroidReturnIntent, buildMobileReturnUrl,
  clearMobileAuth, completeMobileGoogleAuth, createMobileAuthAttempt,
  createMobileOAuthStorage, hasMobileGoogleCompletion, isNativeAndroid,
  parseMobileOAuthCallback, readPendingMobileAuth,
} from '../src/lib/mobileOAuth.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key), data };
};
const makeBrowser = (origin = ALLOWED_ORIGINS[0]) => ({
  location: { origin }, crypto: webcrypto, localStorage: memoryStorage(), sessionStorage: memoryStorage(),
  navigator: { userAgent: 'Android WebView' }, ReactNativeWebView: { postMessage() {} },
  history: { state: null, replaceState(_state, _title, value) { this.replaced = value; } },
});
let passes = 0;
const passed = message => { passes++; console.log('PASS ' + message); };

assert.equal(isNativeAndroid(makeBrowser()), true);
assert.equal(isNativeAndroid({ ...makeBrowser(), ReactNativeWebView: undefined }), false);
assert.equal(isNativeAndroid({ ...makeBrowser(), navigator: { userAgent: 'iPhone' } }), false);
passed('Only an Android native wrapper takes the new transport');

const browser = makeBrowser();
const { pending, redirectTo } = createMobileAuthAttempt(browser, { join: true, inviteToken: 'invite/with?characters&' });
assert.equal(new URL(redirectTo).pathname, '/Auth');
assert.equal(new URL(redirectTo).searchParams.get(CALLBACK_PARAM), '1');
assert.equal(new URL(redirectTo).searchParams.has('token'), false);
assert.equal(new URL(redirectTo).searchParams.has('join'), false);
assert.equal(pending.attempt.length, 64);
assert.equal(readPendingMobileAuth(browser.localStorage).attempt, pending.attempt);
assert.throws(() => createMobileAuthAttempt(makeBrowser('https://untrusted.example')), /published Sellio/);
passed('Nonce is random and onboarding/invite details stay inside the originating app');

assert.equal(readPendingMobileAuth(browser.localStorage, pending.createdAt + 600001), null);
assert.equal(readPendingMobileAuth(browser.localStorage, pending.createdAt - 1), null);
const blocked = makeBrowser();
blocked.localStorage.setItem = () => { throw new Error('Storage blocked'); };
assert.throws(() => createMobileAuthAttempt(blocked), /Storage blocked/);
passed('Expired state and unavailable persistent storage fail before authorization');

const storage = createMobileOAuthStorage(browser.localStorage);
storage.setItem(VERIFIER_KEY, '"only-local-verifier"');
storage.setItem(MOBILE_AUTH_KEY, 'temporary-token-fixture');
assert.equal(browser.localStorage.getItem(MOBILE_AUTH_KEY), null);
assert.equal(storage.getItem(MOBILE_AUTH_KEY), 'temporary-token-fixture');
assert.equal(createMobileOAuthStorage(browser.localStorage).getItem(VERIFIER_KEY), '"only-local-verifier"');
assert.equal(createMobileOAuthStorage(browser.localStorage).getItem(MOBILE_AUTH_KEY), null);
passed('Only the PKCE verifier persists; temporary OAuth sessions never persist');

const callback = parseMobileOAuthCallback(redirectTo + '&code=one-use-code');
const intent = buildAndroidReturnIntent(callback);
assert.ok(intent.includes('package=' + ANDROID_PACKAGE));
assert.ok(intent.startsWith('intent://sellio.apptelier.sg/Auth?'));
const fallback = decodeURIComponent(intent.match(/S.browser_fallback_url=([^;]+)/)[1]);
assert.equal(new URL(fallback).searchParams.get('app_link_failed'), '1');
assert.equal(new URL(fallback).searchParams.get('code'), 'one-use-code');
assert.equal(buildMobileReturnUrl(callback).hash, '');
for (const invalid of [
  redirectTo.replace('sellio.apptelier.sg', 'evil.example') + '&code=x',
  redirectTo.replace('/Auth?', '/Products?') + '&code=x',
  redirectTo + '&code=x&code=y',
  redirectTo + '&code=x&access_token=bearer',
  redirectTo + '&code=x#refresh_token=bearer',
  redirectTo + '&code=x&error=access_denied',
  redirectTo,
]) assert.throws(() => parseMobileOAuthCallback(invalid));
passed('Return links have a fixed package and reject token, duplicate, foreign and malformed callbacks');

let exchanges = 0; let installedSessions = 0;
const oauthClient = { auth: { exchangeCodeForSession: async code => {
  exchanges++; assert.equal(code, callback.code);
  return { data: { session: { access_token: 'test-access', refresh_token: 'test-refresh',
    user: { identities: [{ provider: 'google' }] } } }, error: null };
} } };
const appClient = { auth: { setSession: async value => {
  installedSessions++; assert.deepEqual(value, { access_token: 'test-access', refresh_token: 'test-refresh' });
  return { error: null };
} } };
const finish = () => completeMobileGoogleAuth({ browser, callback, oauthClient, appClient });
const destinations = await Promise.all([finish(), finish()]);
assert.equal(exchanges, 1);
assert.equal(installedSessions, 1);
assert.deepEqual(destinations, ['/Auth?join=1&token=invite%2Fwith%3Fcharacters%26', '/Auth?join=1&token=invite%2Fwith%3Fcharacters%26']);
assert.equal(browser.history.replaced, '/Auth');
assert.equal(browser.localStorage.getItem(PENDING_KEY), null);
assert.equal(browser.localStorage.getItem(VERIFIER_KEY), null);
assert.equal(hasMobileGoogleCompletion(browser), true);
assert.equal(JSON.stringify([...browser.localStorage.data]), '[]');
assert.ok(!browser.sessionStorage.getItem(COMPLETE_KEY).includes('test-access'));
passed('Duplicate returns exchange once, install the app session, preserve signup context and clean secrets');

const wrongBrowser = makeBrowser();
const wrongAttempt = createMobileAuthAttempt(wrongBrowser);
wrongBrowser.localStorage.setItem(VERIFIER_KEY, '"verifier"');
await assert.rejects(completeMobileGoogleAuth({ browser: wrongBrowser, callback,
  oauthClient, appClient }), /not started/);
assert.equal(readPendingMobileAuth(wrongBrowser.localStorage).attempt, wrongAttempt.pending.attempt);
assert.equal(installedSessions, 1);
passed('A callback for another attempt cannot sign in or erase the current attempt');

const cancelled = makeBrowser();
const cancelledAttempt = createMobileAuthAttempt(cancelled);
cancelled.localStorage.setItem(VERIFIER_KEY, '"verifier"');
const cancelledCallback = parseMobileOAuthCallback(cancelledAttempt.redirectTo + '&error=access_denied');
await assert.rejects(completeMobileGoogleAuth({ browser: cancelled, callback: cancelledCallback,
  oauthClient, appClient }), /cancelled/);
assert.equal(cancelled.localStorage.getItem(VERIFIER_KEY), null);
assert.equal(exchanges, 1);
passed('Provider cancellation never exchanges a code and clears pending secrets');

const failedBrowser = makeBrowser();
const failedAttempt = createMobileAuthAttempt(failedBrowser);
failedBrowser.localStorage.setItem(VERIFIER_KEY, '"verifier"');
await assert.rejects(completeMobileGoogleAuth({ browser: failedBrowser,
  callback: parseMobileOAuthCallback(failedAttempt.redirectTo + '&code=expired-code'),
  oauthClient: { auth: { exchangeCodeForSession: async () => ({ error: { message: 'expired' } }) } },
  appClient }), /expired/);
assert.equal(failedBrowser.localStorage.getItem(VERIFIER_KEY), null);
passed('Expired/exchange errors recover without changing the established app session');

const untrusted = makeBrowser();
const untrustedAttempt = createMobileAuthAttempt(untrusted);
untrusted.localStorage.setItem(VERIFIER_KEY, '"verifier"');
await assert.rejects(completeMobileGoogleAuth({ browser: untrusted,
  callback: parseMobileOAuthCallback(untrustedAttempt.redirectTo + '&code=wrong-provider'),
  oauthClient: { auth: { exchangeCodeForSession: async () => ({ data: { session: {
    user: { identities: [{ provider: 'email' }] } } } }) } }, appClient }), /valid sign-in/);
assert.equal(installedSessions, 1);
passed('A non-Google session cannot enter the Google onboarding path');

// Exercise the actual installed SDK and verify the cryptographic request, not
// merely our wrapper's mocked API shape. No production account is created.
const actualStorage = memoryStorage();
const requests = [];
const client = createClient('https://oauth-fixture.example.invalid', 'fixture-publishable-key', {
  auth: { storageKey: MOBILE_AUTH_KEY, storage: createMobileOAuthStorage(actualStorage),
    flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false, persistSession: true },
  global: { fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh',
      token_type: 'bearer', expires_in: 3600,
      user: { id: 'fixture-user', identities: [{ provider: 'google' }] } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  } },
});
const actualRedirect = ALLOWED_ORIGINS[1] + '/Auth?' + CALLBACK_PARAM + '=1&attempt=' + 'a'.repeat(64);
const { data, error: startError } = await client.auth.signInWithOAuth({
  provider: 'google', options: { redirectTo: actualRedirect, skipBrowserRedirect: true },
});
assert.equal(startError, null);
const authUrl = new URL(data.url);
const verifier = JSON.parse(actualStorage.getItem(VERIFIER_KEY));
assert.equal(authUrl.searchParams.get('code_challenge_method'), 's256');
assert.equal(authUrl.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
assert.equal(authUrl.searchParams.get('redirect_to'), actualRedirect);
assert.equal(requests.length, 0, 'Creating the browser authorization URL must not consume a session');
const exchange = await client.auth.exchangeCodeForSession('fixture-auth-code');
assert.equal(exchange.error, null);
assert.equal(requests.length, 1);
assert.match(requests[0].url, /token\?grant_type=pkce$/);
assert.deepEqual(requests[0].body, { auth_code: 'fixture-auth-code', code_verifier: verifier });
assert.equal(actualStorage.getItem(VERIFIER_KEY), null);
assert.equal(actualStorage.getItem(MOBILE_AUTH_KEY), null);
passed('Installed Supabase SDK generates S256 PKCE and exchanges only with the app-held verifier');

clearMobileAuth(browser.localStorage);
console.log(passes + ' mobile OAuth checks passed');
