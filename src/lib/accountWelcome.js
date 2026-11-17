// Right after "Set up your account" (Alvin, 17 Nov 2026), the account page's first visit says
// "welcome", shows step 3 of 3 and a little confetti. Join leaves a flag for this tab (the page
// is opened with a full load, and a stored return path still wins); the account page reads it,
// then clears it so a reload or a later visit is the usual page.
const KEY = 'sellio_account_welcome';

export function markAccountWelcome(storage = globalThis.sessionStorage) {
  try { storage?.setItem(KEY, '1'); } catch { /* private mode: no welcome, no harm */ }
}

export function readAccountWelcome(storage = globalThis.sessionStorage) {
  try { return storage?.getItem(KEY) === '1'; } catch { return false; }
}

export function clearAccountWelcome(storage = globalThis.sessionStorage) {
  try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}
