// src/components/auth/MobileOAuthReturn.jsx
import { useEffect as useEffect2, useState as useState2 } from "react";

// mock:clients
var getSupabase = async () => {
  globalThis.clientReads++;
  return globalThis.appClient;
};
var getMobileOAuthClient = () => {
  globalThis.mobileReads++;
  return globalThis.oauthClient;
};

// src/lib/appLaunch.js
var LAUNCH_KEY = "sellio-launch";
var MIN_MS = 0;
var MAX_MS = 1e4;
var SETTLE_MS = 300;
var listeners = /* @__PURE__ */ new Set();
var snapshot = null;
var loaders = 0;
var lastBusy = 0;
var notify = () => listeners.forEach((fn) => fn());
function readLaunch(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(LAUNCH_KEY) || "null");
    if (!value || value.done || !Number.isFinite(value.start)) return null;
    const age = now - value.start;
    return age >= 0 && age < MAX_MS ? value : null;
  } catch {
    return null;
  }
}
function startLaunch(storage = globalThis.sessionStorage, now = Date.now()) {
  if (readLaunch(storage, now)) return;
  try {
    storage.setItem(LAUNCH_KEY, JSON.stringify({ start: now, done: false }));
  } catch {
    return;
  }
  lastBusy = now;
  snapshot = null;
  notify();
}
function finishLaunch(storage = globalThis.sessionStorage) {
  try {
    const value = JSON.parse(storage.getItem(LAUNCH_KEY) || "null");
    if (value && !value.done) storage.setItem(LAUNCH_KEY, JSON.stringify({ ...value, done: true }));
  } catch {
  }
  snapshot = null;
  notify();
}
function subscribeLaunch(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function getLaunchSnapshot() {
  const value = readLaunch();
  const key = value ? value.start : null;
  if (!snapshot || snapshot.key !== key) snapshot = { key, value };
  return snapshot.value;
}
function holdLaunch(now = Date.now()) {
  loaders += 1;
  lastBusy = now;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    loaders -= 1;
    lastBusy = Date.now();
  };
}
function launchCanEnd(launch, now = Date.now()) {
  if (!launch) return true;
  const age = now - launch.start;
  if (age >= MAX_MS) return true;
  if (age < MIN_MS) return false;
  if (loaders > 0) return false;
  return now - Math.max(lastBusy, launch.start) >= SETTLE_MS;
}

// src/components/ui-custom/AppLoader.jsx
import { useState, useEffect } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var CSS = `
@keyframes sellio-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}
@keyframes sellio-pulse-logo {
  0%, 100% { transform: scale(1.0); }
  50% { transform: scale(1.05); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes sellio-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.sellio-dot-1 { animation: sellio-bounce 1.2s ease-in-out infinite 0ms; background: #fb923c; }
.sellio-dot-2 { animation: sellio-bounce 1.2s ease-in-out infinite 200ms; background: #e0449a; }
.sellio-dot-3 { animation: sellio-bounce 1.2s ease-in-out infinite 400ms; background: #8b2fc9; }
.sellio-logo-pulse { animation: sellio-pulse-logo 1.5s ease-in-out infinite; }
.sellio-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: sellio-shimmer 1.5s infinite;
}
`;
var cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}
function AppLoader({ visible = true }) {
  injectCSS();
  const [show, setShow] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => visible ? holdLaunch() : void 0, [visible]);
  useEffect(() => {
    if (!visible) {
      setSlow(false);
      return void 0;
    }
    const t = setTimeout(() => setSlow(true), 12e3);
    return () => clearTimeout(t);
  }, [visible]);
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setShow(true), 30);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [visible]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "status",
      "aria-label": "Loading Sellio",
      style: {
        position: "fixed",
        inset: 0,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: show ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: visible ? "auto" : "none"
      },
      children: [
        /* @__PURE__ */ jsx(
          "img",
          {
            src: "/branding/sellio-logo.webp",
            alt: "Sellio",
            className: "sellio-logo-pulse",
            style: { width: 80, objectFit: "contain", marginBottom: 24 }
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 7, marginBottom: 16 }, children: [
          /* @__PURE__ */ jsx("span", { className: "sellio-dot-1", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
          /* @__PURE__ */ jsx("span", { className: "sellio-dot-2", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
          /* @__PURE__ */ jsx("span", { className: "sellio-dot-3", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { color: "#9ca3af", fontSize: 13, margin: 0 }, children: "Loading..." }),
        slow && /* @__PURE__ */ jsxs("div", { style: { marginTop: 20, textAlign: "center" }, children: [
          /* @__PURE__ */ jsx("p", { style: { color: "#64748b", fontSize: 13, margin: "0 0 10px" }, children: "This is taking longer than usual." }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => window.location.reload(),
              style: { minHeight: 44, padding: "0 20px", borderRadius: 12, border: "none", background: "var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
              children: "Reload"
            }
          )
        ] })
      ]
    }
  );
}

// src/components/ui-custom/LaunchSplash.jsx
import { useLayoutEffect, useSyncExternalStore } from "react";
var FADE_MS = 200;
var SHOWN = "data-sellio-launch";
var LEAVING = "sellio-launch--leaving";
function LaunchSplash() {
  const launch = useSyncExternalStore(subscribeLaunch, getLaunchSnapshot, () => null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const splash = document.getElementById("sellio-launch-splash");
    if (!launch || !splash) return void 0;
    splash.classList.remove(LEAVING);
    root.setAttribute(SHOWN, "");
    const timer = setInterval(() => {
      if (!launchCanEnd(launch)) return;
      clearInterval(timer);
      splash.classList.add(LEAVING);
      finishLaunch();
      setTimeout(() => {
        if (readLaunch()) return;
        root.removeAttribute(SHOWN);
        splash.classList.remove(LEAVING);
      }, FADE_MS);
    }, 100);
    return () => clearInterval(timer);
  }, [launch]);
  return null;
}

// src/lib/mobileOAuth.js
var ANDROID_PACKAGE = "com.base6985959ce9aaceadb8b7cc41.app";
var MOBILE_AUTH_KEY = "sellio-mobile-google";
var VERIFIER_KEY = MOBILE_AUTH_KEY + "-code-verifier";
var PENDING_KEY = "sellio-mobile-google-pending";
var COMPLETE_KEY = "sellio-mobile-google-complete";
var CALLBACK_PARAM = "sellio_mobile_oauth";
var ALLOWED_ORIGINS = ["https://sellio.apptelier.sg", "https://selliosg.base44.app", "https://sellio.sg"];
var ATTEMPT_TTL = 10 * 60 * 1e3;
var NONCE = /^[a-f0-9]{64}$/;
var CODE = /^[A-Za-z0-9._~-]{1,512}$/;
function isNativeAndroid(browser = window) {
  return /Android/i.test(browser.navigator.userAgent) && (typeof browser.ReactNativeWebView?.postMessage === "function" || typeof browser.__hybrid_bridge?.sendMessage === "function");
}
function readPendingMobileAuth(storage, now = Date.now()) {
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY));
    if (!pending || !NONCE.test(pending.attempt) || !ALLOWED_ORIGINS.includes(pending.origin) || !Number.isFinite(pending.createdAt) || now < pending.createdAt || now - pending.createdAt > ATTEMPT_TTL) return null;
    return pending;
  } catch {
    return null;
  }
}
function clearMobileAuth(storage) {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(VERIFIER_KEY);
}
function parseMobileOAuthCallback(input) {
  const url = new URL(input);
  const params = url.searchParams;
  if (!ALLOWED_ORIGINS.includes(url.origin) || !["/Auth", "/"].includes(url.pathname) || params.get(CALLBACK_PARAM) !== "1" || !NONCE.test(params.get("attempt") || "") || ["attempt", "code", "error"].some((key) => params.getAll(key).length > 1)) {
    throw new Error("This sign-in link is invalid. Start Google sign-in again in Sellio.");
  }
  const fragment = new URLSearchParams(url.hash.slice(1));
  const fragmentError = fragment.get("error");
  const safeErrorFragment = fragmentError && [...fragment.keys()].every((key) => ["error", "error_code", "error_description"].includes(key));
  if (url.hash && !safeErrorFragment || params.has("access_token") || params.has("refresh_token") || fragment.getAll("error").length > 1 || params.has("error") && fragmentError) {
    throw new Error("This sign-in link uses an unsupported return format.");
  }
  const code = params.get("code");
  const error = params.get("error") || fragmentError;
  if ((!code || !CODE.test(code)) && !error) {
    throw new Error("This sign-in link is incomplete. Start Google sign-in again.");
  }
  if (code && error) throw new Error("This sign-in link is invalid.");
  return { origin: url.origin, attempt: params.get("attempt"), code, error: error ? "access_denied" : null };
}
function buildMobileReturnUrl(callback, failed = false) {
  const url = new URL("/Auth", callback.origin);
  if (!ALLOWED_ORIGINS.includes(url.origin) || !NONCE.test(callback.attempt)) {
    throw new Error("Invalid Sellio return address.");
  }
  url.searchParams.set(CALLBACK_PARAM, "1");
  url.searchParams.set("attempt", callback.attempt);
  if (callback.error) url.searchParams.set("error", "access_denied");
  else {
    if (!CODE.test(callback.code || "")) throw new Error("Invalid sign-in code.");
    url.searchParams.set("code", callback.code);
  }
  if (failed) url.searchParams.set("app_link_failed", "1");
  return url;
}
function buildAndroidReturnIntent(callback) {
  const url = buildMobileReturnUrl(callback);
  const fallback = buildMobileReturnUrl(callback, true);
  return "intent://" + url.host + url.pathname + url.search + "#Intent;scheme=https;package=" + ANDROID_PACKAGE + ";S.browser_fallback_url=" + encodeURIComponent(fallback.href) + ";end";
}
var exchangesByStorage = /* @__PURE__ */ new WeakMap();
function completeMobileGoogleAuth({ browser, callback, oauthClient, appClient, getAppClient }) {
  const key = callback.attempt + ":" + callback.code;
  let exchanges = exchangesByStorage.get(browser.localStorage);
  if (!exchanges) {
    exchanges = /* @__PURE__ */ new Map();
    exchangesByStorage.set(browser.localStorage, exchanges);
  }
  if (exchanges.has(key)) return exchanges.get(key);
  const task = (async () => {
    const pending = readPendingMobileAuth(browser.localStorage);
    if (!pending || pending.attempt !== callback.attempt || pending.origin !== callback.origin || browser.location.origin !== pending.origin || !browser.localStorage.getItem(VERIFIER_KEY)) {
      throw new Error("This sign-in was not started in this app, or it expired. Start again in Sellio.");
    }
    browser.history.replaceState(browser.history.state, "", "/Auth");
    try {
      if (callback.error) throw new Error("Google sign-in was cancelled. You can try again.");
      const { data, error } = await oauthClient.auth.exchangeCodeForSession(callback.code);
      if (error || !data?.session) throw new Error("Google sign-in expired or could not be completed. Please try again.");
      const session = data.session;
      if (!session.user?.identities?.some((identity) => identity.provider === "google")) {
        throw new Error("Google did not return a valid sign-in.");
      }
      const client = appClient || await getAppClient();
      const { error: sessionError } = await client.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });
      if (sessionError) throw new Error("Could not finish signing in. Please try again.");
      browser.sessionStorage.setItem(COMPLETE_KEY, JSON.stringify({
        origin: pending.origin,
        createdAt: Date.now()
      }));
      const destination = new URL("/Auth", pending.origin);
      if (pending.join) destination.searchParams.set("join", "1");
      if (pending.inviteToken) destination.searchParams.set("token", pending.inviteToken);
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

// src/components/auth/MobileOAuthReturn.jsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function MobileOAuthReturn() {
  const [result] = useState2(() => {
    try {
      return { callback: parseMobileOAuthCallback(window.location.href) };
    } catch (error2) {
      return { error: error2.message };
    }
  });
  const [status, setStatus] = useState2("checking");
  const [error, setError] = useState2(result.error || "");
  const callback = result.callback;
  useEffect2(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    let alive = true;
    let timer;
    let checks = 0;
    const check = async () => {
      if (!callback) {
        setStatus("error");
        window.history.replaceState(window.history.state, "", "/Auth");
        return;
      }
      const pending = readPendingMobileAuth(window.localStorage);
      if (pending?.attempt === callback.attempt && pending.origin === callback.origin) {
        startLaunch();
        try {
          const destination = await completeMobileGoogleAuth({
            browser: window,
            callback,
            oauthClient: getMobileOAuthClient(),
            getAppClient: getSupabase
          });
          if (alive) window.location.replace(destination);
        } catch (failure) {
          if (alive) {
            setError(failure.message);
            setStatus("error");
          }
        }
        return;
      }
      if (isNativeAndroid()) {
        setError("This sign-in expired or was started in another app window. Please start again.");
        setStatus("error");
        window.history.replaceState(window.history.state, "", "/Auth");
        return;
      }
      if (++checks < 10) {
        timer = window.setTimeout(check, 100);
        return;
      }
      setStatus("browser");
    };
    check();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      meta.remove();
    };
  }, [callback]);
  const failed = new URLSearchParams(window.location.search).get("app_link_failed") === "1";
  if (status === "checking") return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx2(AppLoader, { visible: true }),
    /* @__PURE__ */ jsx2(LaunchSplash, {})
  ] });
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx2(LaunchSplash, {}),
    /* @__PURE__ */ jsx2("main", { className: "min-h-[100dvh] bg-white flex items-center justify-center p-6", "data-pull-refresh-block": true, children: /* @__PURE__ */ jsxs2("div", { className: "w-full max-w-sm text-center", children: [
      /* @__PURE__ */ jsx2(
        "img",
        {
          src: "/branding/sellio-logo.webp",
          alt: "Sellio",
          className: "w-24 h-24 object-contain mx-auto mb-8"
        }
      ),
      /* @__PURE__ */ jsx2("h1", { className: "text-2xl font-semibold text-slate-900", children: status === "checking" ? "Finishing sign-in\u2026" : status === "error" ? "Sign-in could not finish" : "Return to Sellio" }),
      /* @__PURE__ */ jsx2("p", { className: "mt-3 text-base text-slate-600", children: status === "checking" ? "Please wait while Sellio completes your Google sign-in." : status === "error" ? error : callback?.error ? "Return to the app to try Google sign-in again." : "Continue in the Sellio app to finish signing in." }),
      status === "browser" && callback && /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsx2(
          "a",
          {
            href: buildAndroidReturnIntent(callback),
            rel: "noreferrer",
            className: "mt-6 flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white",
            children: "Return to Sellio"
          }
        ),
        /* @__PURE__ */ jsx2(
          "a",
          {
            href: buildMobileReturnUrl(callback).href,
            rel: "noreferrer",
            className: "mt-4 inline-flex min-h-11 items-center text-orange-700 underline",
            children: "Open with app link"
          }
        ),
        failed && /* @__PURE__ */ jsx2("p", { className: "mt-4 text-sm text-slate-600", children: "Android could not open this link in Sellio. Enable \u201COpen supported links\u201D in Sellio\u2019s app settings, then try again. If it still fails, this app version needs an update." })
      ] }),
      status === "error" && /* @__PURE__ */ jsx2("a", { href: "/Auth", className: "mt-6 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white", children: "Back to sign-in" })
    ] }) })
  ] });
}
export {
  MobileOAuthReturn as default
};
