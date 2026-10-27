// src/pages/Auth.jsx
import React3, { useState as useState4, useEffect as useEffect3 } from "react";
import { Phone, Lock, User, Mail, ChevronDown, Check as Check2, AlertCircle } from "lucide-react";

// mock:clients
var getSupabase = async () => {
  globalThis.clientReads++;
  return globalThis.appClient;
};
var getMobileOAuthClient = () => {
  globalThis.mobileReads++;
  return globalThis.oauthClient;
};
var SUPABASE_URL = "https://project.example.invalid";

// mock:toast
var toast = { error: (value) => {
  globalThis.toastError = value;
}, success() {
}, custom() {
} };

// src/utils/index.ts
function createPageUrl(pageName) {
  return "/" + pageName.replace(/ /g, "-");
}

// mock:profile
var useAppUser = () => ({ setAppUser: (user) => {
  globalThis.profile = user;
} });

// src/components/auth/AuthPricingModal.jsx
import React2, { useState } from "react";
import { X, Check } from "lucide-react";

// src/lib/accountFlow.js
var BYPASS_EMAILS = ["alvin.leeyq@gmail.com", "alvin_y_q_lee@ite.edu.sg"];
var SELLIO_SITE = "https://sellio.apptelier.sg";
var SELLIO_WEB_ORIGINS = [SELLIO_SITE, "https://sellio.sg"];
function decideOnboardingAccess(status, error) {
  if (error) return error.hint === "not_signed_in" ? "signin" : "allowed";
  if (!status) return "allowed";
  if (status.store) return "dashboard";
  if (BYPASS_EMAILS.includes(String(status.email || "").toLowerCase())) return "allowed";
  if (status.business_invite) return "allowed";
  return "account";
}
function paymentLinkFor(link, email) {
  if (!email) return link;
  const separator = link.includes("?") ? "&" : "?";
  return `${link}${separator}locked_prefilled_email=${encodeURIComponent(email)}`;
}

// src/lib/plans.js
var SELLIO_WHATSAPP = "6582228103";
function sellioWhatsAppUrl(text = "") {
  return `https://wa.me/${SELLIO_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
var MULTI_OUTLET_URL = sellioWhatsAppUrl("Hi, I run more than one outlet and would like to talk about Sellio.");
var SETUP_OFFER = {
  price: 149,
  includes: "menu scan, storefront build, printer setup and on-site staff training",
  url: sellioWhatsAppUrl("Hi, I would like to book the Sellio done-for-you setup (SGD 149).")
};
var BUSINESS_PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthly: 39,
    yearly: 390,
    features: [
      "10 products",
      "Up to 100 orders/month",
      "3 staff accounts",
      "5 tables and QR codes",
      "POS counter, QR ordering and storefront",
      "Kitchen display and receipt printing",
      "Basic reports",
      "Sellio AI tools"
    ],
    links: {
      monthly: "https://buy.stripe.com/14A28t1Qd2or6i72t27bW0r",
      yearly: "https://buy.stripe.com/9B6dRb1Qdgfh8qf7Nm7bW0s"
    },
    noTrialLinks: {
      monthly: "https://buy.stripe.com/00w9AVfH30gj6i7d7G7bW0k",
      yearly: "https://buy.stripe.com/cNicN7bqN5ADcGv4Ba7bW0l"
    }
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 79,
    yearly: 790,
    features: [
      "Everything in Starter",
      "50 products",
      "Up to 1,000 orders/month",
      "5 staff accounts",
      "Advanced reports",
      "Custom editable roles",
      "Email and chat support"
    ],
    links: {
      monthly: "https://buy.stripe.com/6oU8wRgL77ILbCr7Nm7bW0t",
      yearly: "https://buy.stripe.com/fZudRbgL7e79ayn5Fe7bW0u"
    },
    noTrialLinks: {
      monthly: "https://buy.stripe.com/4gM14p2Uhe79fSH3x67bW0m",
      yearly: "https://buy.stripe.com/7sY00lfH39QT49Z3x67bW0n"
    }
  },
  {
    key: "pro",
    name: "Professional",
    monthly: 119,
    yearly: 1190,
    features: [
      "Everything in Growth",
      "Unlimited products and orders",
      "Unlimited staff accounts",
      "Unlimited tables and QR codes",
      "Custom real-time reports",
      "Unlimited custom roles",
      "Priority support"
    ],
    links: {
      monthly: "https://buy.stripe.com/dRm3cxeCZ0gj9uj9Vu7bW0v",
      yearly: "https://buy.stripe.com/28EaEZ1QdaUXfSH2t27bW0w"
    },
    noTrialLinks: {
      monthly: "https://buy.stripe.com/4gM4gBcuR5ADayn0kU7bW0o",
      yearly: "https://buy.stripe.com/4gM14pbqN2or21RffO7bW0p"
    }
  }
];
var NO_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.noTrialLinks]));

// src/components/subscription/PlanFootnotes.jsx
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function PlanFootnotes({ showSetup = true }) {
  const link = { fontWeight: 600, color: "#0f172a", textDecoration: "underline" };
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, lineHeight: 1.5, color: "#64748b", textAlign: "center" }, children: [
    /* @__PURE__ */ jsxs("p", { style: { margin: 0 }, children: [
      "Multi-outlet?",
      " ",
      /* @__PURE__ */ jsx("a", { href: MULTI_OUTLET_URL, target: "_blank", rel: "noopener noreferrer", style: link, children: "Talk to us on WhatsApp" })
    ] }),
    showSetup && /* @__PURE__ */ jsxs("p", { style: { margin: 0 }, children: [
      "Want us to set it up for you? Done-for-you setup is SGD ",
      SETUP_OFFER.price,
      " one-time: ",
      SETUP_OFFER.includes,
      ".",
      " ",
      /* @__PURE__ */ jsx("a", { href: SETUP_OFFER.url, target: "_blank", rel: "noopener noreferrer", style: link, children: "Book on WhatsApp" })
    ] })
  ] });
}

// src/components/auth/AuthPricingModal.jsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PLAN_STYLE = {
  starter: { description: "Perfect for small businesses just getting started" },
  growth: { description: "For growing businesses with higher demands", badge: "Most Popular" },
  pro: { description: "Enterprise-grade solution for maximum scalability" }
};
var PLANS = BUSINESS_PLANS.map((plan) => ({ ...plan, ...PLAN_STYLE[plan.key] }));
function AuthPricingModal({ onClose, prefilledEmail = "" }) {
  const [annual, setAnnual] = useState(false);
  return /* @__PURE__ */ jsx2(
    "div",
    {
      style: { position: "fixed", inset: 0, zIndex: 1e3, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px" },
      onClick: onClose,
      children: /* @__PURE__ */ jsxs2(
        "div",
        {
          style: { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 780, position: "relative", padding: "32px 24px 28px" },
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                onClick: onClose,
                style: { position: "absolute", top: 16, right: 16, background: "#f1f5f9", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
                children: /* @__PURE__ */ jsx2(X, { style: { width: 16, height: 16, color: "#64748b" } })
              }
            ),
            /* @__PURE__ */ jsx2("h2", { style: { fontSize: 20, fontWeight: 700, color: "#0f172a", textAlign: "center", marginBottom: 4 }, children: "Choose a plan to get started" }),
            /* @__PURE__ */ jsx2("p", { style: { fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 20 }, children: "Start your 7-day free trial. No charge until trial ends." }),
            /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }, children: [
              /* @__PURE__ */ jsx2("span", { onClick: () => setAnnual(false), style: { fontSize: 13, fontWeight: 500, color: !annual ? "#0f172a" : "#94a3b8", cursor: "pointer" }, children: "Monthly" }),
              /* @__PURE__ */ jsx2(
                "button",
                {
                  onClick: () => setAnnual((v) => !v),
                  style: { position: "relative", width: 44, height: 24, borderRadius: 12, background: annual ? "#16a34a" : "#cbd5e1", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" },
                  children: /* @__PURE__ */ jsx2("span", { style: { position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", left: annual ? 22 : 2 } })
                }
              ),
              /* @__PURE__ */ jsx2("span", { onClick: () => setAnnual(true), style: { fontSize: 13, fontWeight: 500, color: annual ? "#0f172a" : "#94a3b8", cursor: "pointer" }, children: "Annual" }),
              annual && /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#dcfce7", color: "#15803d" }, children: "2 months free" })
            ] }),
            /* @__PURE__ */ jsx2("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }, children: PLANS.map((plan) => {
              const isGrowth = plan.key === "growth";
              const price = annual ? plan.yearly : plan.monthly;
              const saving = plan.monthly * 12 - plan.yearly;
              const link = paymentLinkFor(annual ? plan.links.yearly : plan.links.monthly, prefilledEmail);
              return /* @__PURE__ */ jsxs2(
                "div",
                {
                  style: {
                    position: "relative",
                    background: "#fff",
                    borderRadius: 16,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    boxShadow: isGrowth ? "0 4px 24px rgba(139,92,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
                    border: isGrowth ? "2px solid #a78bfa" : "1px solid #e2e8f0"
                  },
                  children: [
                    isGrowth && /* @__PURE__ */ jsx2("div", { style: { position: "absolute", top: -1, left: 0, right: 0, height: 4, borderRadius: "16px 16px 0 0", background: "linear-gradient(90deg, #8b5cf6, #6366f1)" } }),
                    /* @__PURE__ */ jsxs2("div", { style: { padding: "20px 20px 16px", flex: 1, display: "flex", flexDirection: "column" }, children: [
                      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }, children: [
                        /* @__PURE__ */ jsx2("span", { style: { fontSize: 15, fontWeight: 700, color: "#0f172a" }, children: plan.name }),
                        plan.badge && /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#ede9fe", color: "#7c3aed" }, children: plan.badge })
                      ] }),
                      /* @__PURE__ */ jsxs2("div", { style: { margin: "10px 0 2px" }, children: [
                        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 26, fontWeight: 800, color: "#0f172a" }, children: [
                          "SGD ",
                          price
                        ] }),
                        /* @__PURE__ */ jsxs2("span", { style: { fontSize: 12, color: "#94a3b8", marginLeft: 4 }, children: [
                          "/",
                          annual ? "year" : "month"
                        ] })
                      ] }),
                      annual && /* @__PURE__ */ jsxs2("p", { style: { fontSize: 11, color: "#16a34a", fontWeight: 500, marginBottom: 4 }, children: [
                        "Save SGD ",
                        saving
                      ] }),
                      /* @__PURE__ */ jsx2("p", { style: { fontSize: 11, color: "#64748b", marginBottom: 12 }, children: plan.description }),
                      /* @__PURE__ */ jsx2("ul", { style: { flex: 1, marginBottom: 16, listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }, children: plan.features.map((f) => /* @__PURE__ */ jsxs2("li", { style: { display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: "#475569" }, children: [
                        /* @__PURE__ */ jsx2(Check, { style: { width: 13, height: 13, color: "#22c55e", marginTop: 1, flexShrink: 0 } }),
                        f
                      ] }, f)) }),
                      /* @__PURE__ */ jsx2("a", { href: link, target: "_blank", rel: "noopener noreferrer", style: { display: "block" }, children: /* @__PURE__ */ jsx2(
                        "button",
                        {
                          style: {
                            width: "100%",
                            padding: "10px 0",
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            background: isGrowth ? "linear-gradient(90deg, #8b5cf6, #6366f1)" : "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)"
                          },
                          children: "Start Free Trial"
                        }
                      ) })
                    ] })
                  ]
                },
                plan.key
              );
            }) }),
            /* @__PURE__ */ jsx2(PlanFootnotes, {})
          ]
        }
      )
    }
  );
}

// src/components/ui-custom/AppLoader.jsx
import { useState as useState2, useEffect } from "react";

// src/lib/appLaunch.js
var loaders = 0;
var lastBusy = 0;
function holdLaunch(now2 = Date.now()) {
  loaders += 1;
  lastBusy = now2;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    loaders -= 1;
    lastBusy = Date.now();
  };
}

// src/components/ui-custom/AppLoader.jsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
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
  const [show, setShow] = useState2(false);
  const [slow, setSlow] = useState2(false);
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
  return /* @__PURE__ */ jsxs3(
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
        /* @__PURE__ */ jsx3(
          "img",
          {
            src: "/branding/sellio-logo.webp",
            alt: "Sellio",
            className: "sellio-logo-pulse",
            style: { width: 80, objectFit: "contain", marginBottom: 24 }
          }
        ),
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 7, marginBottom: 16 }, children: [
          /* @__PURE__ */ jsx3("span", { className: "sellio-dot-1", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
          /* @__PURE__ */ jsx3("span", { className: "sellio-dot-2", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
          /* @__PURE__ */ jsx3("span", { className: "sellio-dot-3", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } })
        ] }),
        /* @__PURE__ */ jsx3("p", { style: { color: "#9ca3af", fontSize: 13, margin: 0 }, children: "Loading..." }),
        slow && /* @__PURE__ */ jsxs3("div", { style: { marginTop: 20, textAlign: "center" }, children: [
          /* @__PURE__ */ jsx3("p", { style: { color: "#64748b", fontSize: 13, margin: "0 0 10px" }, children: "This is taking longer than usual." }),
          /* @__PURE__ */ jsx3(
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

// mock:deletion
var accountDeletionDestination = (value) => value;

// mock:navigation
var completeAuthNavigation = (value) => {
  globalThis.authDestination = value;
};

// src/lib/mobileOAuth.js
var MOBILE_AUTH_KEY = "sellio-mobile-google";
var VERIFIER_KEY = MOBILE_AUTH_KEY + "-code-verifier";
var PENDING_KEY = "sellio-mobile-google-pending";
var COMPLETE_KEY = "sellio-mobile-google-complete";
var CALLBACK_PARAM = "sellio_mobile_oauth";
var ALLOWED_ORIGINS = ["https://sellio.apptelier.sg", "https://selliosg.base44.app", "https://sellio.sg"];
var ATTEMPT_TTL = 10 * 60 * 1e3;
function isNativeAndroid(browser2 = window) {
  return /Android/i.test(browser2.navigator.userAgent) && (typeof browser2.ReactNativeWebView?.postMessage === "function" || typeof browser2.__hybrid_bridge?.sendMessage === "function");
}
function clearMobileAuth(storage) {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(VERIFIER_KEY);
}
function createMobileAuthAttempt(browser2, { join = false, inviteToken = "" } = {}) {
  const origin = browser2.location.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    throw new Error("Google sign-in in the Android app requires the published Sellio address.");
  }
  const probe = PENDING_KEY + "-probe";
  for (const storage of [browser2.localStorage, browser2.sessionStorage]) {
    storage.setItem(probe, "1");
    if (storage.getItem(probe) !== "1") throw new Error("Enable app storage and try signing in again.");
    storage.removeItem(probe);
  }
  const bytes = new Uint8Array(32);
  browser2.crypto.getRandomValues(bytes);
  const pending = {
    attempt: Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""),
    origin,
    createdAt: Date.now(),
    join: Boolean(join),
    inviteToken
  };
  clearMobileAuth(browser2.localStorage);
  browser2.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const callback = new URL("/Auth", origin);
  callback.searchParams.set(CALLBACK_PARAM, "1");
  callback.searchParams.set("attempt", pending.attempt);
  return { pending, redirectTo: callback.href };
}
function hasMobileGoogleCompletion(browser2 = window) {
  try {
    const value = JSON.parse(browser2.sessionStorage.getItem(COMPLETE_KEY));
    const age = Date.now() - value?.createdAt;
    return value?.origin === browser2.location.origin && age >= 0 && age < 3e4;
  } catch {
    return false;
  }
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
async function startGoogleSignIn(options, browser2 = window) {
  if (!isNativeAndroid(browser2)) {
    const client = await getSupabase();
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options });
    if (error) throw error;
    return { mobile: false };
  }
  const destination = new URL(options.redirectTo);
  const { redirectTo } = createMobileAuthAttempt(browser2, {
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
    browser2.location.assign(googleRelayUrl(url.href));
    return { mobile: true };
  } catch (error) {
    clearMobileAuth(browser2.localStorage);
    throw error;
  }
}

// src/components/auth/GoogleBrowserHint.jsx
import { jsx as jsx4 } from "react/jsx-runtime";
function GoogleBrowserHint() {
  if (!isNativeAndroid()) return null;
  return /* @__PURE__ */ jsx4("p", { className: "mt-2 text-center text-xs leading-snug text-slate-400", "data-testid": "google-browser-hint", children: "Google sign-in opens in your browser, then brings you back here." });
}

// src/lib/staffAccess.js
var OWNER_OR_BUYER_ROLES = ["admin", "owner", "user", "buyer"];
function isStaffAccount(appUser, tenantUser = null) {
  const role = appUser?.role;
  if (role === "staff") return true;
  if (OWNER_OR_BUYER_ROLES.includes(role)) return false;
  if (tenantUser) return tenantUser.is_owner === false;
  return !!role;
}
function homeFor(appUser, tenantUser = null) {
  return isStaffAccount(appUser, tenantUser) ? "/Dashboard" : "/explore";
}

// src/lib/phoneAuth.js
var PHONE_AUTH_REGION = "ap-southeast-2";
async function callPhoneAuth(body, fetchImpl = globalThis.fetch) {
  const url = `${SUPABASE_URL}/functions/v1/phone-auth?forceFunctionRegion=${PHONE_AUTH_REGION}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body)
    });
    const reply = await response.json();
    return reply && typeof reply === "object" ? reply : null;
  } catch {
    return null;
  }
}

// src/lib/useBackToClose.js
import { useCallback, useEffect as useEffect2, useRef, useState as useState3 } from "react";
var STILL_OPEN_CHECK_MS = 500;
var OWN_TRAVERSAL_MS = 1500;
var TAP_EVENTS = ["pointerup", "mousedown", "keydown", "click"];
var browser = typeof window !== "undefined" ? window : null;
var stack = [];
var armed = false;
var settleTimer = null;
var nextSeq = 0;
var holdUntilEmpty = false;
var ownTraversal = null;
var stepAhead = null;
var historyEpoch = 0;
var lastTapAt = 0;
var lastTraversalAt = 0;
var lastUserTraversalAt = 0;
var scriptTraversals = 0;
var scriptTraversalsUntil = 0;
var waitingForTap = false;
var now = () => Date.now();
var historyState = () => {
  try {
    return browser.history.state;
  } catch {
    return null;
  }
};
var onOurStep = () => !!historyState()?.sellioOverlay;
var pageKey = () => historyState()?.key ?? null;
function canAddStep() {
  const activation = browser.navigator?.userActivation;
  if (activation && !activation.isActive) return false;
  return lastTapAt > 0 && lastTapAt >= lastTraversalAt;
}
function tappedSincePersonsBack() {
  return lastTapAt > 0 && lastTapAt >= lastUserTraversalAt;
}
function addStep() {
  browser.history.pushState({ ...browser.history.state || {}, sellioOverlay: true }, "");
  armed = true;
}
function traverse(direction) {
  ownTraversal = { direction, until: now() + OWN_TRAVERSAL_MS };
  setTimeout(() => {
    if (ownTraversal && now() >= ownTraversal.until) {
      ownTraversal = null;
      scheduleSettle();
    }
  }, OWN_TRAVERSAL_MS + 20);
  if (direction < 0) browser.history.back();
  else browser.history.forward();
}
function armAtNextTap() {
  if (waitingForTap) return;
  waitingForTap = true;
  const onTap = () => {
    TAP_EVENTS.forEach((type) => browser.removeEventListener(type, onTap, true));
    waitingForTap = false;
    scheduleSettle();
  };
  TAP_EVENTS.forEach((type) => browser.addEventListener(type, onTap, true));
}
function settle() {
  settleTimer = null;
  if (ownTraversal) return;
  if (stack.length > 0) {
    if (armed || holdUntilEmpty) return;
    if (onOurStep()) {
      armed = true;
      return;
    }
    if (stepAhead && stepAhead.key === pageKey() && stepAhead.epoch === historyEpoch) {
      traverse(1);
      return;
    }
    if (canAddStep()) addStep();
    else armAtNextTap();
    return;
  }
  holdUntilEmpty = false;
  armed = false;
  if (onOurStep()) {
    stepAhead = { key: pageKey(), epoch: historyEpoch };
    traverse(-1);
  }
}
function putBack(entry) {
  const i = stack.findIndex((other) => other.seq > entry.seq);
  if (i === -1) stack.push(entry);
  else stack.splice(i, 0, entry);
}
function scheduleSettle() {
  if (!browser) return;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 0);
}
function onPopState() {
  lastTraversalAt = now();
  if (scriptTraversals > 0 && now() < scriptTraversalsUntil) scriptTraversals -= 1;
  else {
    scriptTraversals = 0;
    lastUserTraversalAt = now();
  }
  if (ownTraversal && now() < ownTraversal.until) {
    const { direction } = ownTraversal;
    ownTraversal = null;
    if (direction > 0) {
      armed = onOurStep();
      if (!armed) {
        stepAhead = null;
        traverse(-1);
        return;
      }
    }
    scheduleSettle();
    return;
  }
  ownTraversal = null;
  if (armed && !onOurStep()) {
    armed = false;
    stepAhead = { key: pageKey(), epoch: historyEpoch };
    const top = stack.pop();
    if (top) {
      const result = top.close();
      if (!top.isOpen()) {
      } else if (result === false || stack.length > 0) {
        putBack(top);
      } else {
        setTimeout(() => {
          if (top.isOpen() && !stack.includes(top)) {
            putBack(top);
            scheduleSettle();
          }
        }, STILL_OPEN_CHECK_MS);
      }
    }
  }
  scheduleSettle();
}
if (browser) {
  try {
    const { history } = browser;
    const push = history.pushState;
    const replace = history.replaceState;
    if (!push.sellioCounted) {
      const countedPush = function pushState(state, ...rest) {
        historyEpoch += 1;
        if (!tappedSincePersonsBack()) {
          if (onOurStep()) armed = false;
          return replace.call(this, state, ...rest);
        }
        return push.call(this, state, ...rest);
      };
      countedPush.sellioCounted = true;
      history.pushState = countedPush;
      history.replaceState = function replaceState(state, ...rest) {
        if (browser.history.state?.sellioOverlay && !state?.sellioOverlay) historyEpoch += 1;
        return replace.call(this, state, ...rest);
      };
      for (const name of ["back", "forward", "go"]) {
        const original = history[name];
        history[name] = function traverseHistory(...args) {
          if (name !== "go" || args[0] && args[0] !== 0) {
            scriptTraversals += 1;
            scriptTraversalsUntil = now() + OWN_TRAVERSAL_MS;
          }
          return original.apply(this, args);
        };
      }
    }
  } catch {
  }
  TAP_EVENTS.forEach((type) => browser.addEventListener(type, (event) => {
    if (event?.type === "keydown" && event.key === "Escape") return;
    lastTapAt = now();
  }, true));
  browser.addEventListener("popstate", onPopState);
  try {
    if (onOurStep()) setTimeout(scheduleSettle, 400);
  } catch {
  }
}
function useBackToClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect2(() => {
    if (!isOpen || !browser) return void 0;
    let open = true;
    const entry = { seq: ++nextSeq, close: () => closeRef.current?.(), isOpen: () => open };
    stack.push(entry);
    scheduleSettle();
    return () => {
      open = false;
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      scheduleSettle();
    };
  }, [isOpen]);
}

// src/pages/Auth.jsx
import { Fragment, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var BYPASS_EMAILS2 = ["alvin.leeyq@gmail.com", "alvin_y_q_lee@ite.edu.sg"];
async function landingWithoutShop(supabase, appUserRow) {
  if (isStaffAccount(appUserRow)) return "/Dashboard";
  try {
    const { data, error } = await supabase.rpc("my_account_status");
    return decideOnboardingAccess(data, error) === "allowed" ? "/Onboarding" : "/explore";
  } catch {
    return "/Onboarding";
  }
}
var COUNTRY_CODES = [
  { code: "+65", flag: "\u{1F1F8}\u{1F1EC}", name: "SG", placeholder: "91234567", validate: (p) => /^[89]\d{7}$/.test(p), hint: "8 digits, starting with 8 or 9" },
  { code: "+60", flag: "\u{1F1F2}\u{1F1FE}", name: "MY", placeholder: "112345678", validate: (p) => /^1\d{8,9}$/.test(p), hint: "9\u201310 digits, starting with 1" }
];
var getBaseUrl = () => {
  const host = window.location.hostname;
  if (host === "localhost" || host.includes("base44.app") || host.includes("base44.com") || SELLIO_WEB_ORIGINS.includes(window.location.origin)) {
    return window.location.origin;
  }
  return "https://sellio.apptelier.sg";
};
var waitText = (minutes) => {
  const n = Math.max(1, Math.round(Number(minutes) || 1));
  return n === 1 ? "1 minute" : `${n} minutes`;
};
var phoneSignInMessage = (result) => {
  switch (result?.code) {
    case "invalid":
      return "Phone number or password is incorrect.";
    case "locked":
      return `Too many wrong passwords for this number. Try again in ${waitText(result.retry_after_minutes)}, or reset your password.`;
    case "too_many":
      return `Too many sign-in attempts from this network. Try again in ${waitText(result.retry_after_minutes)}.`;
    case "busy":
      return "Sign-in is busy right now. Please try again in a minute.";
    default:
      return "Could not sign in right now. Please try again.";
  }
};
function Auth() {
  const { setAppUser } = useAppUser();
  const [mobileGoogleCompleted] = useState4(() => hasMobileGoogleCompletion());
  const urlToken = new URLSearchParams(window.location.search).get("token");
  const [isLogin, setIsLogin] = useState4(!urlToken);
  const [loading, setLoading] = useState4(false);
  const [googleLoading, setGoogleLoading] = useState4(false);
  const [checkingToken, setCheckingToken] = useState4(false);
  const [googleGateError, setGoogleGateError] = useState4("");
  const [googleSignupError, setGoogleSignupError] = useState4("");
  const [authChecking, setAuthChecking] = useState4(true);
  const [signupMode, setSignupMode] = useState4(null);
  const [inviteEmail, setInviteEmail] = useState4("");
  const [inviteName, setInviteName] = useState4("");
  const [showPricingModal, setShowPricingModal] = useState4(false);
  const [forgotMode, setForgotMode] = useState4(false);
  const [forgotStep, setForgotStep] = useState4(1);
  const [forgotPhone, setForgotPhone] = useState4("");
  const [forgotCountry, setForgotCountry] = useState4(COUNTRY_CODES[0]);
  const [forgotStaffEmail, setForgotStaffEmail] = useState4("");
  const [forgotNewPassword, setForgotNewPassword] = useState4("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState4("");
  const leaveForgotPassword = () => {
    setForgotMode(false);
    setForgotStep(1);
    setForgotPhone("");
    setForgotStaffEmail("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
  };
  useBackToClose(forgotMode && forgotStep !== 3, leaveForgotPassword);
  const [forgotLoading, setForgotLoading] = useState4(false);
  const [forgotMaskedEmail, setForgotMaskedEmail] = useState4("");
  const [forgotUserTenantId, setForgotUserTenantId] = useState4("");
  const [forgotPlan, setForgotPlan] = useState4("");
  const [forgotFullPhone, setForgotFullPhone] = useState4("");
  const [showForgotCountryDropdown, setShowForgotCountryDropdown] = useState4(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState4(false);
  const [selectedCountry, setSelectedCountry] = useState4(COUNTRY_CODES[0]);
  const [formData, setFormData] = useState4({ full_name: "", email: "", phone: "", password: "" });
  useEffect3(() => {
    const checkAuth = async () => {
      if (mobileGoogleCompleted) {
        setAuthChecking(false);
        return;
      }
      try {
        const supabase = await getSupabase();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("type") === "recovery") {
          setAuthChecking(false);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: rows } = await supabase.from("app_users").select("id, email, full_name, role, phone, onboarding_completed, tenant_id").eq("email", session.user.email).limit(1);
          const appUserRow = rows?.[0];
          if (appUserRow?.onboarding_completed === true && appUserRow?.tenant_id) {
            const { data: tuRows } = await supabase.from("tenant_users").select("is_owner").eq("tenant_id", appUserRow.tenant_id).eq("user_email", session.user.email).eq("status", "active").limit(1);
            const isActiveMember = !!tuRows?.[0];
            console.log("[Auth] session recovery for", session.user.email, "\u2192 activeMember:", isActiveMember);
            if (isActiveMember) {
              setAppUser(appUserRow);
              completeAuthNavigation(accountDeletionDestination(homeFor(appUserRow)));
              return;
            }
          }
          if (urlToken) {
            completeAuthNavigation(`/Account?token=${encodeURIComponent(urlToken)}`);
            return;
          }
        }
      } catch {
      }
      setAuthChecking(false);
    };
    checkAuth();
  }, []);
  useEffect3(() => {
    if (authChecking) return;
    if (urlToken) {
      evaluateSignupAccess();
    }
  }, [authChecking]);
  useEffect3(() => {
    if (authChecking) return;
    if (isLogin) return;
    if (urlToken && signupMode !== null) return;
    evaluateSignupAccess();
  }, [isLogin, authChecking]);
  const evaluateSignupAccess = async () => {
    if (urlToken) {
      setCheckingToken(true);
      let invite = null;
      let attempts = 0;
      const maxAttempts = 5;
      while (!invite && attempts < maxAttempts) {
        attempts++;
        try {
          const supabase = await getSupabase();
          const { data, error: fetchError } = await supabase.rpc("get_invite_by_token", { p_token: urlToken }).maybeSingle();
          console.log(`[invite lookup attempt ${attempts}]`, { data, fetchError });
          if (data && data.status === "pending" && (!data.expires_at || new Date(data.expires_at) > /* @__PURE__ */ new Date())) {
            invite = data;
          } else if (attempts < maxAttempts) {
            console.log(`Invite not found or not ready, retrying (${attempts}/${maxAttempts})...`);
            await new Promise((resolve) => setTimeout(resolve, 2e3));
          }
        } catch {
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2e3));
          }
        }
      }
      if (invite) {
        setInviteEmail(invite.email || "");
        setInviteName(invite.full_name || "");
        setFormData((prev) => ({
          ...prev,
          email: invite.email || "",
          full_name: invite.full_name || ""
        }));
        if (invite.phone) {
          let phoneNumber = invite.phone;
          let detectedCountry = COUNTRY_CODES[0];
          if (invite.phone.startsWith("+60")) {
            detectedCountry = COUNTRY_CODES.find((c) => c.code === "+60");
            phoneNumber = invite.phone.replace("+60", "");
          } else if (invite.phone.startsWith("+65")) {
            detectedCountry = COUNTRY_CODES.find((c) => c.code === "+65");
            phoneNumber = invite.phone.replace("+65", "");
          }
          setSelectedCountry(detectedCountry);
          setFormData((prev) => ({ ...prev, phone: phoneNumber }));
        }
        setSignupMode("allowed");
      } else {
        setSignupMode("invalid_token");
      }
      setCheckingToken(false);
    } else {
      setSignupMode("pricing_wall");
    }
  };
  useEffect3(() => {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("type") === "recovery") return;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.substring(1));
      toast.error(params.get("error_description") || "Google Sign-In failed");
      window.history.replaceState(window.history.state, "", window.location.pathname);
      return;
    }
    if (!hash.includes("access_token") && !mobileGoogleCompleted) return;
    if (mobileGoogleCompleted) window.sessionStorage.removeItem(COMPLETE_KEY);
    setGoogleLoading(true);
    const processSession = async () => {
      try {
        const supabase = await getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) throw error || new Error("No session found");
        const user = session.user;
        if (mobileGoogleCompleted && !user.identities?.some((identity) => identity.provider === "google")) {
          throw new Error("Google did not return a valid sign-in. Please try again.");
        }
        const now2 = new Date(Date.now() + 8 * 3600 * 1e3).toISOString().replace("Z", "").replace("T", " ").substring(0, 23);
        const createdAt = user.created_at ? new Date(user.created_at) : null;
        const isNewAuthUser = createdAt && Date.now() - createdAt.getTime() < 60 * 1e3;
        const tokenInUrl = new URLSearchParams(window.location.search).get("token");
        const isBypass = BYPASS_EMAILS2.includes((user.email || "").toLowerCase());
        const joinInUrl = new URLSearchParams(window.location.search).get("join") === "1";
        if (isNewAuthUser && !tokenInUrl && !isBypass && !joinInUrl) {
          await supabase.auth.signOut({ scope: "local" });
          setGoogleLoading(false);
          window.history.replaceState(window.history.state, "", window.location.pathname);
          setGoogleGateError("true");
          return;
        }
        if (isNewAuthUser && tokenInUrl && !isBypass) {
          const { data: inviteRow } = await supabase.rpc("get_invite_by_token", { p_token: tokenInUrl }).maybeSingle();
          const invite = inviteRow?.status === "pending" ? inviteRow : null;
          const inviteEmailForCheck = invite?.email?.toLowerCase();
          if (inviteEmailForCheck && user.email?.toLowerCase() !== inviteEmailForCheck) {
            await supabase.auth.signOut({ scope: "local" });
            setGoogleLoading(false);
            window.history.replaceState(window.history.state, "", `${window.location.pathname}?token=${tokenInUrl}`);
            setGoogleSignupError(`Please sign up with the email address used during payment (${invite.email})`);
            return;
          }
        }
        const { data: existingAppUser } = await supabase.from("app_users").select("id, created_date, onboarding_completed, tenant_id, role, phone").eq("email", user.email).limit(1);
        let existingRow = existingAppUser?.[0] || null;
        let appUsersRowId = existingRow?.id;
        if (existingRow) {
          await supabase.from("app_users").update({ last_login_at: now2 }).eq("id", appUsersRowId);
        } else {
          const { error: insertError } = await supabase.from("app_users").insert({
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
            auth_provider: "google",
            role: "admin",
            is_active: true,
            onboarding_completed: false,
            last_login_at: now2
          });
          if (insertError) throw insertError;
          if (tokenInUrl) {
            const { data: inviteData } = await supabase.rpc("get_invite_by_token", { p_token: tokenInUrl }).maybeSingle();
            if (inviteData?.phone) {
              await supabase.from("app_users").update({ phone: inviteData.phone }).eq("email", user.email);
              console.log("\u2713 Phone synced from merchant_invites:", inviteData.phone);
            }
          }
          const { data: fetchedUser, error: fetchError } = await supabase.from("app_users").select("id, created_date, onboarding_completed, tenant_id, role, phone").eq("email", user.email).single();
          if (fetchError) throw fetchError;
          existingRow = fetchedUser;
          appUsersRowId = fetchedUser?.id;
        }
        if (!appUsersRowId) throw new Error("Failed to create or find user record.");
        const appUser = {
          id: appUsersRowId,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          avatar_url: user.user_metadata?.avatar_url,
          provider: "google",
          role: existingRow?.role || "admin",
          onboarding_completed: existingRow?.onboarding_completed || false,
          tenant_id: existingRow?.tenant_id || null,
          phone: existingRow?.phone || null,
          created_date: existingRow?.created_date || now2,
          last_login_at: now2
        };
        setAppUser(appUser);
        if (tokenInUrl) {
          await supabase.from("merchant_invites").update({ status: "registered", updated_date: (/* @__PURE__ */ new Date()).toISOString() }).eq("token", tokenInUrl).eq("status", "pending");
        }
        completeAuthNavigation(accountDeletionDestination(appUser.onboarding_completed ? homeFor(appUser) : joinInUrl ? "/Join" : await landingWithoutShop(supabase, appUser)));
      } catch (err) {
        toast.error(err.message || "Google Sign-In failed");
        setGoogleLoading(false);
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    };
    processSession();
  }, []);
  useEffect3(() => {
    if (!googleLoading || !isNativeAndroid()) return;
    let wasHidden = document.visibilityState === "hidden";
    const resume = () => {
      if (document.visibilityState === "hidden") wasHidden = true;
      else if (wasHidden) setGoogleLoading(false);
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [googleLoading]);
  const handleGoogleSignIn = async () => {
    setGoogleGateError("");
    setGoogleLoading(true);
    try {
      await startGoogleSignIn({
        redirectTo: isLogin ? `${getBaseUrl()}/Auth` : `${getBaseUrl()}/Auth?join=1`
      });
    } catch (err) {
      toast.error(err.message || "Google Sign-In failed. Please try again.");
      setGoogleLoading(false);
    }
  };
  const handleForgotStart = async () => {
    if (!forgotPhone.trim()) return;
    setForgotLoading(true);
    try {
      const cleanPhone = forgotPhone.replace(/^0+/, "");
      const fullPhone = forgotCountry.code + cleanPhone;
      setForgotFullPhone(fullPhone);
      const result = await callPhoneAuth({ action: "reset", phone: fullPhone, redirect_to: `${getBaseUrl()}/Auth?type=recovery` });
      if (!result) throw new Error("Something went wrong. Please try again.");
      if (!result.ok) {
        toast.error(result.code === "not_found" ? "No account found for this phone number." : `Too many reset requests. Please try again in ${waitText(result.retry_after_minutes)}.`);
        return;
      }
      setForgotPlan(result.priority_support ? "pro" : "");
      if (result.kind === "staff") {
        toast.error("Staff passwords are reset by the shop owner. Please ask your owner to reset yours.");
        return;
      }
      setForgotMaskedEmail(result.masked_email || "");
      setForgotStep(4);
    } catch (err) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };
  const handleForgotCollectEmail = async () => {
    toast.error("This staff account needs an owner-assisted password reset. Please contact your Sellio account owner.");
  };
  const handleForgotSetPassword = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setForgotLoading(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password: forgotNewPassword });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Password updated successfully!");
      setTimeout(() => {
        window.location.href = `${getBaseUrl()}/Auth`;
      }, 800);
    } catch (err) {
      toast.error(err.message || "Failed to update password.");
    } finally {
      setForgotLoading(false);
    }
  };
  const handleGoogleSignUp = async () => {
    setGoogleSignupError("");
    setGoogleLoading(true);
    try {
      const redirectTo = urlToken ? `${getBaseUrl()}/Auth?token=${encodeURIComponent(urlToken)}` : `${getBaseUrl()}/Auth`;
      await startGoogleSignIn({
        redirectTo,
        ...inviteEmail ? { queryParams: { login_hint: inviteEmail } } : {}
      });
    } catch (err) {
      toast.error(err.message || "Google Sign-Up failed. Please try again.");
      setGoogleLoading(false);
    }
  };
  const showSuccess = (message) => {
    toast.custom(() => /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-lg", children: [
      /* @__PURE__ */ jsx5("div", { className: "flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center", children: /* @__PURE__ */ jsx5(Check2, { className: "w-5 h-5 text-white" }) }),
      /* @__PURE__ */ jsxs4("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx5("p", { className: "text-sm font-semibold text-green-900", children: message }),
        /* @__PURE__ */ jsx5("p", { className: "text-xs text-green-700", children: "You're all set. Redirecting now..." })
      ] })
    ] }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = await getSupabase();
      const cleanPhone = formData.phone.replace(/^0+/, "");
      const fullPhone = selectedCountry.code + cleanPhone;
      if (isLogin) {
        const result = await callPhoneAuth({ action: "sign_in", phone: fullPhone, password: formData.password });
        if (!result) throw new Error("Could not sign in right now. Please try again.");
        if (!result.ok || !result.session?.access_token || !result.session?.refresh_token) {
          throw new Error(phoneSignInMessage(result));
        }
        const { error } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token
        });
        if (error) throw error;
        const { data: rows, error: profileError } = await supabase.from("app_users").select("id, email, full_name, role, onboarding_completed, tenant_id, phone").eq("phone", fullPhone).limit(1);
        if (profileError) throw profileError;
        const appUserRow = rows?.[0];
        if (!appUserRow) throw new Error("Account profile not found. Please contact support.");
        let tenantId = appUserRow.tenant_id;
        if (!tenantId) {
          const { data: tuRows } = await supabase.from("tenant_users").select("tenant_id").eq("user_email", appUserRow.email).eq("status", "active").limit(1);
          tenantId = tuRows?.[0]?.tenant_id || null;
        }
        const userForCookie = { ...appUserRow, tenant_id: tenantId };
        setAppUser(userForCookie);
        showSuccess("Welcome back!");
        completeAuthNavigation(accountDeletionDestination(appUserRow.onboarding_completed ? homeFor(appUserRow) : await landingWithoutShop(supabase, appUserRow)));
      } else {
        const emailToUse = formData.email.trim();
        const isBypass = BYPASS_EMAILS2.includes(emailToUse.toLowerCase());
        if (!isBypass && signupMode !== "allowed") {
          toast.error("Please purchase a plan to register.");
          setLoading(false);
          return;
        }
        if (!selectedCountry.validate(cleanPhone)) {
          toast.error(`Invalid phone number for ${selectedCountry.name}. Expected: ${selectedCountry.hint}`);
          setLoading(false);
          return;
        }
        const authEmail = emailToUse || `${fullPhone.replace("+", "")}@sellio.app`;
        const { error: signUpError } = await supabase.auth.signUp({ email: authEmail, password: formData.password });
        if (signUpError) throw signUpError;
        const { error: insertError } = await supabase.from("app_users").insert({
          email: authEmail,
          full_name: formData.full_name,
          phone: fullPhone,
          auth_provider: "phone",
          onboarding_completed: false,
          is_active: true,
          role: "admin"
        });
        if (insertError) throw insertError;
        const { data: rows } = await supabase.from("app_users").select("id, email, full_name, role, onboarding_completed, tenant_id, phone").eq("phone", fullPhone).limit(1);
        const appUserRow = rows?.[0];
        setAppUser(appUserRow || { email: authEmail, full_name: formData.full_name, role: "admin", onboarding_completed: false });
        if (urlToken) {
          await supabase.from("merchant_invites").update({ status: "registered", updated_date: (/* @__PURE__ */ new Date()).toISOString() }).eq("token", urlToken).eq("status", "pending");
        }
        showSuccess("Account created!");
        setTimeout(() => {
          completeAuthNavigation(createPageUrl("Onboarding"));
        }, 500);
      }
    } catch (error) {
      toast.error(error.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };
  useEffect3(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "recovery") {
      setForgotMode(true);
      setForgotStep(3);
      const tokenHash = params.get("token_hash");
      if (tokenHash) {
        setForgotLoading(true);
        getSupabase().then((supabase) => supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })).then(({ error }) => {
          if (error) throw error;
          window.history.replaceState(window.history.state, "", `${window.location.pathname}?type=recovery`);
        }).catch(() => {
          window.history.replaceState(window.history.state, "", window.location.pathname);
          toast.error("This reset link has expired or was already used. Please request a new one.");
          setForgotStep(1);
        }).finally(() => setForgotLoading(false));
      }
    }
  }, []);
  const showPricingWall = !isLogin && signupMode === "pricing_wall";
  const showInvalidToken = !isLogin && signupMode === "invalid_token";
  const showForm = isLogin || signupMode === "allowed" || signupMode === "pricing_wall" && BYPASS_EMAILS2.includes(formData.email.trim().toLowerCase());
  if (authChecking || mobileGoogleCompleted && googleLoading) {
    return /* @__PURE__ */ jsx5(AppLoader, { visible: true });
  }
  return /* @__PURE__ */ jsxs4(Fragment, { children: [
    /* @__PURE__ */ jsx5("style", { children: `
        .orange-scroll::-webkit-scrollbar { width: 4px; }
        .orange-scroll::-webkit-scrollbar-track { background: transparent; }
        .orange-scroll::-webkit-scrollbar-thumb { background: #fe7824; border-radius: 4px; }
        /* The card fits the screen without scrolling: spacing and the logo shrink on
           shorter screens (phones, the Android app, 720px laptops). Each value is given
           twice so phones without dvh support keep today's sizes. */
        .auth-card { padding-top: 32px; padding-bottom: 32px; padding-top: clamp(20px, 3.5dvh, 32px); padding-bottom: clamp(20px, 3.5dvh, 32px); }
        .auth-gap-b { margin-bottom: 24px; margin-bottom: clamp(12px, 2.6dvh, 24px); }
        .auth-gap-y { margin-top: 16px; margin-bottom: 16px; margin-top: clamp(10px, 2dvh, 16px); margin-bottom: clamp(10px, 2dvh, 16px); }
        .auth-gap-t { margin-top: 20px; margin-top: clamp(12px, 2.2dvh, 20px); }
        .auth-fields > * + * { margin-top: 16px; margin-top: clamp(10px, 1.8dvh, 16px); }
        /* The logo image has empty space above (15%) and below (25%) the artwork;
           trim most of it so the visible logo stays the same size. */
        .auth-logo { height: 112px; margin-top: -15px; margin-bottom: -22px;
          height: clamp(64px, 13dvh, 112px);
          margin-top: calc(clamp(64px, 13dvh, 112px) * -0.13);
          margin-bottom: calc(clamp(64px, 13dvh, 112px) * -0.2); }
        .auth-logo-gap { margin-bottom: 12px; margin-bottom: clamp(6px, 1.2dvh, 12px); }
      ` }),
    /* @__PURE__ */ jsx5(
      "div",
      {
        className: "h-[100dvh] w-full flex flex-col items-center justify-center p-4 overflow-hidden",
        style: { background: "radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)" },
        onClick: () => setShowCountryDropdown(false),
        children: /* @__PURE__ */ jsx5("div", { className: "w-full max-w-sm sm:max-w-md max-h-full overflow-y-auto", children: /* @__PURE__ */ jsx5("div", { className: "auth-card bg-white rounded-2xl shadow-xl px-8", children: forgotMode ? /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-3 mb-6", children: [
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: leaveForgotPassword,
                className: "w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors border-none cursor-pointer",
                children: /* @__PURE__ */ jsx5("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "#475569", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx5("path", { d: "M19 12H5M12 5l-7 7 7 7" }) })
              }
            ),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsxs4("p", { className: "text-base font-semibold text-slate-800", children: [
                forgotStep === 1 && "Reset Password",
                forgotStep === 2 && "Confirm Your Email",
                forgotStep === 3 && "New Password",
                forgotStep === 4 && "Check Your Email"
              ] }),
              /* @__PURE__ */ jsxs4("p", { className: "text-xs text-slate-400", children: [
                forgotStep === 1 && "Enter your registered phone number",
                forgotStep === 2 && "We need a valid email to send your reset link",
                forgotStep === 3 && "Choose a new password",
                forgotStep === 4 && "Reset link sent"
              ] })
            ] })
          ] }),
          forgotStep === 1 && /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Phone Number" }),
              /* @__PURE__ */ jsxs4("div", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsxs4("div", { className: "relative", onClick: (e) => e.stopPropagation(), children: [
                  /* @__PURE__ */ jsxs4(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowForgotCountryDropdown(!showForgotCountryDropdown),
                      className: "flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 transition-colors whitespace-nowrap",
                      children: [
                        /* @__PURE__ */ jsx5("span", { children: forgotCountry.flag }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-700", children: forgotCountry.code }),
                        /* @__PURE__ */ jsx5(ChevronDown, { className: "w-3 h-3 text-slate-400" })
                      ]
                    }
                  ),
                  showForgotCountryDropdown && /* @__PURE__ */ jsx5("div", { className: "orange-scroll absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto min-w-[130px]", children: COUNTRY_CODES.map((c) => /* @__PURE__ */ jsxs4(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setForgotCountry(c);
                        setShowForgotCountryDropdown(false);
                      },
                      className: "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left",
                      children: [
                        /* @__PURE__ */ jsx5("span", { children: c.flag }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-600", children: c.name }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-400 ml-auto", children: c.code })
                      ]
                    },
                    c.code
                  )) })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "relative flex-1", children: [
                  /* @__PURE__ */ jsx5(Phone, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                  /* @__PURE__ */ jsx5(
                    "input",
                    {
                      type: "tel",
                      placeholder: forgotCountry.placeholder,
                      value: forgotPhone,
                      onChange: (e) => setForgotPhone(e.target.value),
                      className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                    }
                  )
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: handleForgotStart,
                disabled: forgotLoading || !forgotPhone.trim(),
                className: "w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: forgotLoading ? "Please wait..." : "Continue"
              }
            )
          ] }),
          forgotStep === 2 && /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl", children: [
              /* @__PURE__ */ jsx5(AlertCircle, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx5("p", { className: "text-xs text-amber-800", children: "We don't have a valid email on file for this account yet. Enter one below to receive your password reset link." })
            ] }),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Email Address" }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(Mail, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "email",
                    placeholder: "you@example.com",
                    value: forgotStaffEmail,
                    onChange: (e) => setForgotStaffEmail(e.target.value),
                    className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: handleForgotCollectEmail,
                disabled: forgotLoading || !forgotStaffEmail.trim(),
                className: "w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: forgotLoading ? "Sending..." : "Send Reset Link"
              }
            )
          ] }),
          forgotStep === 3 && /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "New Password" }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(Lock, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "password",
                    placeholder: "Min. 6 characters",
                    value: forgotNewPassword,
                    onChange: (e) => setForgotNewPassword(e.target.value),
                    className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Confirm Password" }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(Lock, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "password",
                    placeholder: "Re-enter password",
                    value: forgotConfirmPassword,
                    onChange: (e) => setForgotConfirmPassword(e.target.value),
                    className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: handleForgotSetPassword,
                disabled: forgotLoading || !forgotNewPassword || !forgotConfirmPassword,
                className: "w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: forgotLoading ? "Saving..." : "Set New Password"
              }
            )
          ] }),
          forgotStep === 4 && /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "flex flex-col items-center py-4 gap-3", children: [
              /* @__PURE__ */ jsx5("div", { className: "w-14 h-14 rounded-full bg-green-50 flex items-center justify-center", children: /* @__PURE__ */ jsx5(Check2, { className: "w-7 h-7 text-green-500" }) }),
              /* @__PURE__ */ jsx5("p", { className: "text-sm font-semibold text-slate-800 text-center", children: "Reset link sent!" }),
              /* @__PURE__ */ jsxs4("p", { className: "text-xs text-slate-500 text-center leading-relaxed", children: [
                forgotMaskedEmail ? /* @__PURE__ */ jsxs4(Fragment, { children: [
                  "We sent it to ",
                  /* @__PURE__ */ jsx5("span", { className: "font-semibold text-slate-700", children: forgotMaskedEmail }),
                  ". "
                ] }) : null,
                "Check your email inbox and click the reset link. It may take a minute to arrive."
              ] })
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "p-3 bg-slate-50 border border-slate-200 rounded-xl", children: [
              /* @__PURE__ */ jsx5("p", { className: "text-xs font-semibold text-slate-600 mb-2", children: "Need further help?" }),
              /* @__PURE__ */ jsxs4(
                "a",
                {
                  href: "mailto:sellio@apptelier.sg",
                  className: "flex items-center gap-2 text-xs text-slate-600 hover:text-orange-500 transition-colors mb-2",
                  children: [
                    /* @__PURE__ */ jsx5(Mail, { className: "w-3.5 h-3.5 flex-shrink-0" }),
                    "sellio@apptelier.sg"
                  ]
                }
              ),
              forgotPlan === "pro" && /* @__PURE__ */ jsxs4(
                "a",
                {
                  href: `https://wa.me/6582228103?text=Hi%2C%20I%20need%20help%20resetting%20my%20Sellio%20password.%20My%20registered%20phone%20is%3A%20${encodeURIComponent(forgotFullPhone)}`,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className: "flex items-center gap-2 text-xs font-medium text-green-700 hover:text-green-800 transition-colors",
                  children: [
                    /* @__PURE__ */ jsxs4("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", className: "flex-shrink-0", children: [
                      /* @__PURE__ */ jsx5("path", { d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" }),
                      /* @__PURE__ */ jsx5("path", { d: "M12 0C5.373 0 0 5.373 0 12c0 2.136.564 4.14 1.548 5.874L0 24l6.336-1.524A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.214-3.732.898.934-3.617-.235-.372A9.818 9.818 0 1112 21.818z" })
                    ] }),
                    "WhatsApp Priority Support"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: () => {
                  setForgotMode(false);
                  setForgotStep(1);
                },
                className: "w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors",
                children: "Back to Login"
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxs4(Fragment, { children: [
          /* @__PURE__ */ jsxs4("div", { className: "auth-gap-b text-center", children: [
            /* @__PURE__ */ jsx5("div", { className: "auth-logo-gap flex items-center justify-center", children: /* @__PURE__ */ jsx5("img", { src: "/branding/sellio-logo.webp", alt: "Sellio", className: "auth-logo w-auto object-contain" }) }),
            /* @__PURE__ */ jsx5("p", { className: "text-xl font-semibold text-slate-800 mb-0.5", children: "Welcome!" }),
            /* @__PURE__ */ jsx5("p", { className: "text-sm text-slate-500", children: "Let's get you started" })
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "auth-gap-b flex rounded-xl p-1", style: { background: "#fde8d8" }, children: [
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: () => setIsLogin(true),
                className: `flex-1 py-2 rounded-lg text-sm font-medium transition-all ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`,
                children: "Login"
              }
            ),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "button",
                onClick: () => setIsLogin(false),
                className: `flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`,
                children: "Sign Up"
              }
            )
          ] }),
          showInvalidToken && /* @__PURE__ */ jsxs4("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4", children: [
              /* @__PURE__ */ jsx5(AlertCircle, { className: "w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx5("p", { className: "text-sm text-red-700", children: "This invite link is invalid or has expired. Please purchase a plan to get started." })
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                onClick: () => {
                  setSignupMode("pricing_wall");
                  setShowPricingModal(true);
                },
                className: "w-full py-2.5 rounded-xl text-white text-sm font-semibold",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: "View Plans"
              }
            )
          ] }),
          checkingToken && /* @__PURE__ */ jsxs4("div", { className: "flex flex-col items-center justify-center py-8 gap-3", children: [
            /* @__PURE__ */ jsx5("style", { children: `
                  @keyframes sellio-bounce-inline { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
                  .sellio-dot-inline-1 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 0ms; background: #fb923c; }
                  .sellio-dot-inline-2 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 200ms; background: #e0449a; }
                  .sellio-dot-inline-3 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 400ms; background: #8b2fc9; }
                ` }),
            /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 7 }, children: [
              /* @__PURE__ */ jsx5("span", { className: "sellio-dot-inline-1", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
              /* @__PURE__ */ jsx5("span", { className: "sellio-dot-inline-2", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } }),
              /* @__PURE__ */ jsx5("span", { className: "sellio-dot-inline-3", style: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } })
            ] }),
            /* @__PURE__ */ jsx5("p", { className: "text-sm text-slate-500", children: "Verifying your payment..." })
          ] }),
          showForm && !checkingToken && /* @__PURE__ */ jsxs4("form", { onSubmit: handleSubmit, className: "auth-fields", children: [
            !isLogin && /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Name *" }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(User, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "text",
                    placeholder: "John Doe",
                    value: formData.full_name,
                    onChange: (e) => setFormData({ ...formData, full_name: e.target.value }),
                    readOnly: signupMode === "allowed" && !!inviteName,
                    required: true,
                    className: `w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 ${signupMode === "allowed" && !!inviteName ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""}`
                  }
                )
              ] }),
              signupMode === "allowed" && !!inviteName && /* @__PURE__ */ jsx5("p", { className: "text-xs text-slate-400 mt-1", children: "Name pre-filled from your registration." })
            ] }),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Phone Number *" }),
              /* @__PURE__ */ jsxs4("div", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsxs4("div", { className: "relative", onClick: (e) => e.stopPropagation(), children: [
                  /* @__PURE__ */ jsxs4(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowCountryDropdown(!showCountryDropdown),
                      className: "flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 transition-colors whitespace-nowrap",
                      children: [
                        /* @__PURE__ */ jsx5("span", { children: selectedCountry.flag }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-700", children: selectedCountry.code }),
                        /* @__PURE__ */ jsx5(ChevronDown, { className: "w-3 h-3 text-slate-400" })
                      ]
                    }
                  ),
                  showCountryDropdown && /* @__PURE__ */ jsx5("div", { className: "orange-scroll absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto min-w-[130px]", children: COUNTRY_CODES.map((c) => /* @__PURE__ */ jsxs4(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setSelectedCountry(c);
                        setShowCountryDropdown(false);
                      },
                      className: "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left",
                      children: [
                        /* @__PURE__ */ jsx5("span", { children: c.flag }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-600", children: c.name }),
                        /* @__PURE__ */ jsx5("span", { className: "text-slate-400 ml-auto", children: c.code })
                      ]
                    },
                    c.code
                  )) })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "relative flex-1", children: [
                  /* @__PURE__ */ jsx5(Phone, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                  /* @__PURE__ */ jsx5(
                    "input",
                    {
                      type: "tel",
                      placeholder: selectedCountry.placeholder,
                      value: formData.phone,
                      onChange: (e) => setFormData({ ...formData, phone: e.target.value }),
                      required: true,
                      className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                    }
                  )
                ] })
              ] })
            ] }),
            !isLogin && /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsxs4("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: [
                "Email ",
                signupMode === "allowed" && inviteEmail ? "" : /* @__PURE__ */ jsx5("span", { className: "text-slate-400 font-normal", children: "(optional)" })
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(Mail, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "email",
                    placeholder: "john@example.com",
                    value: formData.email,
                    onChange: (e) => setFormData({ ...formData, email: e.target.value }),
                    readOnly: signupMode === "allowed" && !!inviteEmail,
                    className: `w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 ${signupMode === "allowed" && inviteEmail ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""}`
                  }
                )
              ] }),
              signupMode === "allowed" && inviteEmail && /* @__PURE__ */ jsx5("p", { className: "text-xs text-slate-400 mt-1", children: "Email pre-filled from your invite." })
            ] }),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsxs4("div", { className: "flex items-center justify-between gap-3 mb-1", children: [
                /* @__PURE__ */ jsx5("label", { className: "block text-sm font-medium text-slate-700", children: "Password *" }),
                isLogin && /* @__PURE__ */ jsx5(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setForgotMode(true);
                      setForgotStep(1);
                    },
                    className: "text-xs text-orange-500 hover:text-orange-600 font-medium bg-transparent border-none cursor-pointer p-0",
                    children: "Forgot password?"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "relative", children: [
                /* @__PURE__ */ jsx5(Lock, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "password",
                    placeholder: "Enter password",
                    value: formData.password,
                    onChange: (e) => setFormData({ ...formData, password: e.target.value }),
                    required: true,
                    className: "w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx5(
              "button",
              {
                type: "submit",
                disabled: loading,
                className: "w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"
              }
            )
          ] }),
          !isLogin && signupMode === "allowed" && !checkingToken && /* @__PURE__ */ jsxs4(Fragment, { children: [
            /* @__PURE__ */ jsxs4("div", { className: "auth-gap-y flex items-center gap-3", children: [
              /* @__PURE__ */ jsx5("div", { className: "flex-1 h-px bg-slate-200" }),
              /* @__PURE__ */ jsx5("span", { className: "text-xs text-slate-400 font-medium", children: "or sign up with" }),
              /* @__PURE__ */ jsx5("div", { className: "flex-1 h-px bg-slate-200" })
            ] }),
            /* @__PURE__ */ jsxs4(
              "button",
              {
                type: "button",
                onClick: handleGoogleSignUp,
                disabled: googleLoading,
                className: "w-full flex items-center justify-center gap-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70",
                children: [
                  googleLoading ? /* @__PURE__ */ jsx5("div", { className: "w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" }) : /* @__PURE__ */ jsxs4("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", children: [
                    /* @__PURE__ */ jsx5("path", { fill: "#4285F4", d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#34A853", d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#FBBC05", d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#EA4335", d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" })
                  ] }),
                  googleLoading ? "Redirecting..." : "Sign up with Google"
                ]
              }
            ),
            /* @__PURE__ */ jsx5(GoogleBrowserHint, {}),
            googleSignupError && /* @__PURE__ */ jsxs4("div", { className: "mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl", children: [
              /* @__PURE__ */ jsx5(AlertCircle, { className: "w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx5("p", { className: "text-xs text-red-700", children: googleSignupError })
            ] })
          ] }),
          showPricingWall && !checkingToken && /* @__PURE__ */ jsxs4("div", { className: "text-center py-4", children: [
            /* @__PURE__ */ jsx5("p", { className: "text-sm text-slate-500 mb-4", children: "Create a free Sellio account: sell from home for free, or choose a business plan." }),
            /* @__PURE__ */ jsx5(
              "a",
              {
                href: "/Join",
                className: "block w-full py-2.5 rounded-xl text-white text-sm font-semibold",
                style: { background: "linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)" },
                children: "Create my free account"
              }
            ),
            /* @__PURE__ */ jsx5(
              "button",
              {
                onClick: () => setShowPricingModal(true),
                className: "w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors",
                children: "Business plans (7-day free trial)"
              }
            )
          ] }),
          googleLoading && isNativeAndroid() && /* @__PURE__ */ jsx5(
            "button",
            {
              type: "button",
              className: "w-full min-h-11 mt-3 text-sm underline",
              style: { color: "var(--primary)" },
              onClick: () => {
                clearMobileAuth(window.localStorage);
                setGoogleLoading(false);
              },
              children: "Cancel Google sign-in"
            }
          ),
          !checkingToken && (isLogin || showPricingWall) && /* @__PURE__ */ jsxs4(Fragment, { children: [
            /* @__PURE__ */ jsxs4("div", { className: "auth-gap-y flex items-center gap-3", children: [
              /* @__PURE__ */ jsx5("div", { className: "flex-1 h-px bg-slate-200" }),
              /* @__PURE__ */ jsx5("span", { className: "text-xs text-slate-400 font-medium", children: "or continue with" }),
              /* @__PURE__ */ jsx5("div", { className: "flex-1 h-px bg-slate-200" })
            ] }),
            /* @__PURE__ */ jsxs4(
              "button",
              {
                type: "button",
                onClick: handleGoogleSignIn,
                disabled: googleLoading,
                className: "w-full flex items-center justify-center gap-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70",
                children: [
                  googleLoading ? /* @__PURE__ */ jsx5("div", { className: "w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" }) : /* @__PURE__ */ jsxs4("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", children: [
                    /* @__PURE__ */ jsx5("path", { fill: "#4285F4", d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#34A853", d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#FBBC05", d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" }),
                    /* @__PURE__ */ jsx5("path", { fill: "#EA4335", d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" })
                  ] }),
                  googleLoading ? "Redirecting..." : "Sign in with Google"
                ]
              }
            ),
            /* @__PURE__ */ jsx5(GoogleBrowserHint, {}),
            googleGateError && /* @__PURE__ */ jsxs4("div", { className: "mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl", children: [
              /* @__PURE__ */ jsx5(AlertCircle, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsxs4("p", { className: "text-xs text-amber-800", children: [
                "There\u2019s no Sellio account for this Google email yet.",
                " ",
                /* @__PURE__ */ jsx5("a", { href: "/Join", style: { fontWeight: 600, color: "#d97706", textDecoration: "underline" }, children: "Create a free account" }),
                " ",
                "or",
                " ",
                /* @__PURE__ */ jsx5("span", { onClick: () => setShowPricingModal(true), style: { fontWeight: 600, color: "#d97706", textDecoration: "underline", cursor: "pointer" }, children: "see business plans" }),
                "."
              ] })
            ] })
          ] }),
          !checkingToken && /* @__PURE__ */ jsxs4("p", { className: "auth-gap-t text-center text-[11px] leading-relaxed text-slate-400", children: [
            "By continuing, you agree to Sellio's",
            " ",
            /* @__PURE__ */ jsx5("br", {}),
            /* @__PURE__ */ jsx5("a", { href: "/terms", className: "font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2", children: "Terms and Conditions" }),
            " ",
            "and ",
            " ",
            /* @__PURE__ */ jsx5("a", { href: "/privacy", className: "font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2", children: "Privacy Policy" }),
            "."
          ] })
        ] }) }) })
      }
    ),
    showPricingModal && /* @__PURE__ */ jsx5(AuthPricingModal, { onClose: () => setShowPricingModal(false) })
  ] });
}
export {
  Auth as default
};
