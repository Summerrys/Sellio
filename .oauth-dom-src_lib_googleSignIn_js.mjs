// mock:clients
var getSupabase = async () => {
  globalThis.clientReads++;
  return globalThis.appClient;
};
var getMobileOAuthClient = () => {
  globalThis.mobileReads++;
  return globalThis.oauthClient;
};

// src/lib/mobileOAuth.js
var MOBILE_AUTH_KEY = "sellio-mobile-google";
var VERIFIER_KEY = MOBILE_AUTH_KEY + "-code-verifier";
var PENDING_KEY = "sellio-mobile-google-pending";
var CALLBACK_PARAM = "sellio_mobile_oauth";
var ALLOWED_ORIGINS = ["https://sellio.apptelier.sg", "https://selliosg.base44.app", "https://sellio.sg"];
var ATTEMPT_TTL = 10 * 60 * 1e3;
function isNativeAndroid(browser = window) {
  return /Android/i.test(browser.navigator.userAgent) && (typeof browser.ReactNativeWebView?.postMessage === "function" || typeof browser.__hybrid_bridge?.sendMessage === "function");
}
function clearMobileAuth(storage) {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(VERIFIER_KEY);
}
function createMobileAuthAttempt(browser, { join = false, inviteToken = "" } = {}) {
  const origin = browser.location.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    throw new Error("Google sign-in in the Android app requires the published Sellio address.");
  }
  const probe = PENDING_KEY + "-probe";
  for (const storage of [browser.localStorage, browser.sessionStorage]) {
    storage.setItem(probe, "1");
    if (storage.getItem(probe) !== "1") throw new Error("Enable app storage and try signing in again.");
    storage.removeItem(probe);
  }
  const bytes = new Uint8Array(32);
  browser.crypto.getRandomValues(bytes);
  const pending = {
    attempt: Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""),
    origin,
    createdAt: Date.now(),
    join: Boolean(join),
    inviteToken
  };
  clearMobileAuth(browser.localStorage);
  browser.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const callback = new URL("/Auth", origin);
  callback.searchParams.set(CALLBACK_PARAM, "1");
  callback.searchParams.set("attempt", pending.attempt);
  return { pending, redirectTo: callback.href };
}

// src/lib/googleRelay.js
var GOOGLE_RELAY_PATH = "/google-signin";
var GOOGLE_RELAY_ORIGIN = "https://sellio.apptelier.sg";
function googleRelayUrl(authorizeHref) {
  const url = new URL(GOOGLE_RELAY_PATH, GOOGLE_RELAY_ORIGIN);
  url.searchParams.set("to", authorizeHref);
  return url.href;
}

// src/lib/googleSignIn.js
async function startGoogleSignIn(options, browser = window) {
  if (!isNativeAndroid(browser)) {
    const client = await getSupabase();
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options });
    if (error) throw error;
    return { mobile: false };
  }
  const destination = new URL(options.redirectTo);
  const { redirectTo } = createMobileAuthAttempt(browser, {
    join: destination.searchParams.get("join") === "1",
    inviteToken: destination.searchParams.get("token") || ""
  });
  try {
    const client = getMobileOAuthClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { ...options, redirectTo, skipBrowserRedirect: true }
    });
    if (error || !data?.url) throw error || new Error("Could not open Google sign-in.");
    const url = new URL(data.url);
    if (url.protocol !== "https:" || url.pathname !== "/auth/v1/authorize" || !url.searchParams.get("code_challenge") || url.searchParams.get("code_challenge_method") !== "s256") {
      throw new Error("Secure Google sign-in could not be started. Please try again.");
    }
    browser.location.assign(googleRelayUrl(url.href));
    return { mobile: true };
  } catch (error) {
    clearMobileAuth(browser.localStorage);
    throw error;
  }
}
export {
  startGoogleSignIn
};
