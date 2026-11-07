// The "Welcome back!" message after signing in. A sign-in ends with a full page load of
// the page it opens (completeAuthNavigation), and that load wipes any message shown on the
// sign-in page first: in the app it was gone before it could be seen. So the sign-in page
// leaves the message here, and the page it opens shows it once that page is on screen
// (components/auth/SignInWelcome.jsx, after the app's launch splash).
const WELCOME_KEY = 'sellio-sign-in-welcome';
// Long enough for the page load (and the app's splash, at most 10 seconds) after the
// sign-in; a message older than this belongs to no page load and is dropped.
const WELCOME_TTL_MS = 30 * 1000;

const readSaved = (storage, now) => {
  const saved = JSON.parse(storage.getItem(WELCOME_KEY) || 'null');
  if (!saved || typeof saved.message !== 'string' || !saved.message) return null;
  const age = now - saved.at;
  return age >= 0 && age < WELCOME_TTL_MS ? saved.message : null;
};

// The sign-in page, just before it opens the next page.
export function noteSignInWelcome(message, storage = globalThis.sessionStorage, now = Date.now()) {
  try { storage.setItem(WELCOME_KEY, JSON.stringify({ message, at: now })); } catch { /* no message then */ }
}

// Whether a message is waiting for this page (it stays until it is shown).
export function hasSignInWelcome(storage = globalThis.sessionStorage, now = Date.now()) {
  try { return readSaved(storage, now) !== null; } catch { return false; }
}

// The waiting message, used once (an old one is dropped).
export function takeSignInWelcome(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const message = readSaved(storage, now);
    storage.removeItem(WELCOME_KEY);
    return message;
  } catch { return null; }
}
