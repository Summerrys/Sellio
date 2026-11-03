import { getSupabase, getMobileOAuthClient } from './supabaseClient';
import { COMPLETE_KEY, createMobileAuthAttempt, clearMobileAuth, isNativeAndroid } from './mobileOAuth';
import { googleRelayUrl } from './googleRelay';
import { appPlatform } from './nativeApp';

// The Web client ID of the Google Cloud project behind Supabase's Google provider
// (Supabase → Authentication → Sign In / Providers → Google). Not a secret: Google shows it
// to everyone who signs in with Google on the website. A build can override it with
// VITE_GOOGLE_WEB_CLIENT_ID.
export const GOOGLE_WEB_CLIENT_ID = import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID ||
  '390618701573-0n3emgl2e2v8redsf2d5dl28fikknl1h.apps.googleusercontent.com';

// Whether to offer "Continue with Google": on the website and in Base44's old app; in
// Sellio's Android app once its Web client ID is set; not yet in the iPhone app.
export function googleSignInAvailable(browser = window) {
  const platform = appPlatform(browser);
  if (platform === 'ios') return false;
  if (platform === 'android') return !!GOOGLE_WEB_CLIENT_ID;
  return true;
}

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
  if (!isNativeAndroid(browser)) {
    const client = await getSupabase();
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options });
    if (error) throw error;
    return { mobile: false };
  }
  // Base44's old Android app: Google in the phone's browser, back through an App Link. Use the
  // wrapper's observed external-navigation behaviour. Do not invent a native bridge command
  // or embed Google's authorization page in the WebView.
  const destination = new URL(options.redirectTo);
  const { redirectTo } = createMobileAuthAttempt(browser, {
    join: destination.searchParams.get('join') === '1',
    inviteToken: destination.searchParams.get('token') || '',
  });
  try {
    const client = getMobileOAuthClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { ...options, redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw error || new Error('Could not open Google sign-in.');
    const url = new URL(data.url);
    if (url.protocol !== 'https:' || url.pathname !== '/auth/v1/authorize' ||
        !url.searchParams.get('code_challenge') ||
        url.searchParams.get('code_challenge_method') !== 's256') {
      throw new Error('Secure Google sign-in could not be started. Please try again.');
    }
    // Through sellio.apptelier.sg/google-signin, so the app's "Open External Link?"
    // box names Sellio; that page forwards to this same address (lib/googleRelay.js).
    browser.location.assign(googleRelayUrl(url.href));
    return { mobile: true };
  } catch (error) {
    clearMobileAuth(browser.localStorage);
    throw error;
  }
}
