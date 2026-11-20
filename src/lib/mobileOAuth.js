// Google sign-in in Sellio's Android app (googleSignIn.js, with Android's own account picker in
// nativeGoogle.js) signs in first, then loads the Auth page to finish there like the website's
// Google sign-in does (invites, free sign-up, onboarding). Before loading it, it leaves this note
// in sessionStorage; Auth.jsx finishes the sign-in when it finds a fresh note from this address.
export const COMPLETE_KEY = 'sellio-mobile-google-complete';

export function hasMobileGoogleCompletion(browser = window) {
  try {
    const value = JSON.parse(browser.sessionStorage.getItem(COMPLETE_KEY));
    const age = Date.now() - value?.createdAt;
    return value?.origin === browser.location.origin && age >= 0 && age < 30000;
  } catch { return false; }
}
