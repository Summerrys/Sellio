// Account-first sign-up (Join → Account → free shop or business plan).
// Plain functions with no imports, so they can be tested without a browser.

// Same accounts as Auth.jsx and complete-onboarding (owner test accounts).
export const BYPASS_EMAILS = ['alvin.leeyq@gmail.com', 'alvin_y_q_lee@ite.edu.sg'];

// Same rules as Auth.jsx and the database (complete_account_setup).
export const PHONE_COUNTRIES = [
  { code: '+65', flag: '🇸🇬', name: 'SG', placeholder: '91234567', pattern: /^[89]\d{7}$/, hint: '8 digits, starting with 8 or 9' },
  { code: '+60', flag: '🇲🇾', name: 'MY', placeholder: '112345678', pattern: /^1\d{8,9}$/, hint: '9–10 digits, starting with 1' },
];

// "+6591234567", or null when the number doesn't fit the country.
export function fullPhone(country, local) {
  if (!country || typeof local !== 'string') return null;
  const digits = local.replace(/[\s-]/g, '').replace(/^0+/, '');
  return country.pattern.test(digits) ? country.code + digits : null;
}

export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Staff logins use a made-up address on this domain; nothing can be emailed there.
export function isStaffLoginEmail(value) {
  return typeof value === 'string' && value.trim().toLowerCase().endsWith('@sellio.app');
}

// Where emailed links and Google send people back to. Same rule as Auth.jsx.
export function appBaseUrl(location) {
  const host = location.hostname;
  if (host === 'localhost' || host.includes('base44.app') || host.includes('base44.com')) {
    return location.origin;
  }
  return 'https://sellio.apptelier.sg';
}

// Links a shop shares with its customers (store link, WhatsApp, QR code). The Android
// app runs on selliosg.base44.app, but customers should always see Sellio's own
// address. Test hosts keep their own address so links can be tried there.
export const SELLIO_SITE = 'https://sellio.apptelier.sg';
export function publicSiteUrl(location) {
  if (location.hostname === 'selliosg.base44.app') return SELLIO_SITE;
  return appBaseUrl(location);
}

// What an emailed link left in the address bar:
//   ?token_hash=…&type=magiclink   (email templates that link straight to Sellio)
//   #access_token=…                (links that go through Supabase first)
//   ?error=… / #error=…            (expired or already used)
export function readEmailLink(search, hash) {
  const query = new URLSearchParams(search || '');
  const fragment = new URLSearchParams((hash || '').replace(/^#/, ''));
  const error = query.get('error') || fragment.get('error');
  return {
    tokenHash: query.get('token_hash'),
    type: query.get('type') || 'magiclink',
    hasAccessToken: fragment.has('access_token'),
    error,
    errorCode: query.get('error_code') || fragment.get('error_code'),
    errorDescription: query.get('error_description') || fragment.get('error_description'),
  };
}

// Email link types Join accepts with a token_hash (never "recovery": that one
// belongs to the reset-password screen on /Auth).
export const JOIN_LINK_TYPES = ['magiclink', 'email', 'signup', 'invite'];

// Where a signed-in person goes next, from my_account_status().
//   dashboard: they already work in a store
//   staff:     a staff login (made-up email) without an active store
//   finish:    hasn't finished their account (name, phone, password)
//   account:   choose what to do (free shop, business plan, explore)
export function nextStepFor(status) {
  if (!status) return 'finish';
  if (status.store) return 'dashboard';
  if (status.placeholder_email) return 'staff';
  if (!status.setup_done && !status.business_invite) return 'finish';
  return 'account';
}

// Onboarding (the paid business setup) is for accounts with a paid plan waiting.
// If the account status can't be read at all, keep today's behaviour and let the
// server decide (complete-onboarding refuses a store without a paid plan).
export function decideOnboardingAccess(status, error) {
  if (error) return error.hint === 'not_signed_in' ? 'signin' : 'allowed';
  if (!status) return 'allowed';
  if (status.store) return 'dashboard';
  if (BYPASS_EMAILS.includes(String(status.email || '').toLowerCase())) return 'allowed';
  if (status.business_invite) return 'allowed';
  return 'account';
}

// Stripe Payment Links: fill in (and lock) the account's email so the payment,
// and the business plan it unlocks, belong to this account.
export function paymentLinkFor(link, email) {
  if (!email) return link;
  const separator = link.includes('?') ? '&' : '?';
  return `${link}${separator}locked_prefilled_email=${encodeURIComponent(email)}`;
}

const MESSAGES = {
  not_signed_in: 'Please sign in again.',
  staff_account: 'This is a staff login. Staff sign in with their phone number on the login page.',
  email_link_required: 'Please open the sign-in link we emailed you, then try again.',
  name_invalid: 'Please enter your name.',
  phone_invalid: 'Please enter a valid Singapore or Malaysia mobile number.',
  phone_taken: 'This phone number is already used by another Sellio account (it may be a staff login). Use a different number, or contact sellio@apptelier.sg.',
  account_setup_required: 'Please finish setting up your account first.',
  store_exists: 'This account already has a store. Sign in to manage it, or contact sellio@apptelier.sg to open another one.',
  slug_unavailable: 'We couldn’t create a web address for this name. Please try a different shop name.',
};

// A friendly message for errors from the account functions and Supabase Auth.
export function accountErrorMessage(error) {
  if (!error) return '';
  if (error.hint && MESSAGES[error.hint]) return MESSAGES[error.hint];
  const text = String(error.message || '');
  if (error.code === '23505' && /phone/i.test(`${text} ${error.details || ''}`)) return MESSAGES.phone_taken;
  if (/rate limit/i.test(text)) return 'We’re sending a lot of emails right now. Please try again in a few minutes.';
  const wait = text.match(/after (\d+) seconds?/i);
  if (wait) return `Please wait ${wait[1]} seconds before asking for another link.`;
  if (/password should be at least|weak password/i.test(text)) return 'Please choose a longer password (at least 6 characters).';
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return 'Can’t reach Sellio. Check your connection and try again.';
  return text || 'Something went wrong. Please try again.';
}
