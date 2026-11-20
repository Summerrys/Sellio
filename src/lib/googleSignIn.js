import { getSupabase } from './supabaseClient';
import { COMPLETE_KEY } from './mobileOAuth';
import { appPlatform } from './nativeApp';

// The Web client ID of the Google Cloud project behind Supabase's Google provider
// (Supabase → Authentication → Sign In / Providers → Google). Not a secret: Google shows it
// to everyone who signs in with Google on the website. A build can override it with
// VITE_GOOGLE_WEB_CLIENT_ID.
export const GOOGLE_WEB_CLIENT_ID = import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID ||
  '390618701573-0n3emgl2e2v8redsf2d5dl28fikknl1h.apps.googleusercontent.com';

// Whether to offer "Continue with Google": on the website; in Sellio's Android app once its
// Web client ID is set; not yet in the iPhone app.
export function googleSignInAvailable(browser = window) {
  const platform = appPlatform(browser);
  if (platform === 'ios') return false;
  if (platform === 'android') return !!GOOGLE_WEB_CLIENT_ID;
  return true;
}

// Google asks which account every time (prompt=select_account), so someone signed in to Google
// in this browser can still pick another account, or add one (Alvin, 20 Nov 2026: after Google,
// "it stays as that account"). Sellio's own app uses Android's account picker instead, which
// forgets the account picked when they sign out (nativeGoogle.js).
const askWhichAccount = (options) => ({ ...options, queryParams: { prompt: 'select_account', ...options.queryParams } });

// Resolves { cancelled: true } when the person closes Google's account picker in the app
// (the page stays as it was); otherwise the page moves on to finish the sign-in.
export async function startGoogleSignIn(options, browser = window) {
  // Sellio's Android app: Android's own Google account picker (src/lib/nativeGoogle.js). The
  // sign-in then finishes on the Auth page like the website's (Auth.jsx, "Google OAuth
  // callback"): the same invite, free sign-up (join=1) and onboarding handling.
  if (appPlatform(browser) === 'android') {
    const { signInWithNativeGoogle, GoogleSignInCancelled } = await import('./nativeGoogle');
    try {
      await signInWithNativeGoogle();
    } catch (error) {
      if (error instanceof GoogleSignInCancelled) return { cancelled: true };
      throw error;
    }
    browser.sessionStorage.setItem(COMPLETE_KEY, JSON.stringify({ origin: browser.location.origin, createdAt: Date.now() }));
    browser.location.replace('/Auth' + new URL(options.redirectTo).search);
    return { mobile: true };
  }
  // A browser: Supabase's usual Google redirect.
  const client = await getSupabase();
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: askWhichAccount(options) });
  if (error) throw error;
  return { mobile: false };
}
