// Optional analytics must check this module BEFORE loading a tracker or sending an event.
// Keep authentication, cart and security storage independent of this preference.
export const CONSENT_COOKIE = 'sellio_cookie_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60;
export const CONSENT_EVENT = 'sellio:cookie-consent-change';
let sessionFallback = null;

function validConsent(value) {
  return value?.version === CONSENT_VERSION &&
    typeof value.analytics === 'boolean' &&
    Number.isFinite(value.updatedAt) && Number.isFinite(value.expiresAt) &&
    value.updatedAt <= Date.now() && value.expiresAt > Date.now() &&
    value.expiresAt <= value.updatedAt + CONSENT_MAX_AGE * 1000;
}

export function getCookieConsent() {
  if (typeof document === 'undefined') return null;
  if (validConsent(sessionFallback)) return sessionFallback;
  try {
    const value = document.cookie.split('; ').find((item) => item.startsWith(CONSENT_COOKIE + '='));
    if (value) {
      const parsed = JSON.parse(decodeURIComponent(value.slice(CONSENT_COOKIE.length + 1)));
      return validConsent(parsed) ? parsed : null;
    }
  } catch {
    // Blocked storage and malformed values never imply consent.
  }
  return validConsent(sessionFallback) ? sessionFallback : null;
}

export function saveCookieConsent(analytics) {
  if (typeof analytics !== 'boolean') throw new TypeError('Analytics consent must be a boolean');
  const updatedAt = Date.now();
  const consent = { version: CONSENT_VERSION, analytics, updatedAt, expiresAt: updatedAt + CONSENT_MAX_AGE * 1000 };
  sessionFallback = null;
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = CONSENT_COOKIE + '=' + encodeURIComponent(JSON.stringify(consent)) +
      '; Path=/; Max-Age=' + CONSENT_MAX_AGE + '; SameSite=Lax' + secure;
    if (getCookieConsent()?.updatedAt !== updatedAt || getCookieConsent()?.analytics !== analytics) sessionFallback = consent;
  } catch {
    sessionFallback = consent;
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}

export function canUseOptionalAnalytics() {
  return getCookieConsent()?.analytics === true;
}
