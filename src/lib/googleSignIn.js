import { getSupabase, getMobileOAuthClient } from './supabaseClient';
import { createMobileAuthAttempt, clearMobileAuth, isNativeAndroid } from './mobileOAuth';
import { googleRelayUrl } from './googleRelay';

// Use the wrapper's observed external-navigation behaviour. Do not invent a
// native bridge command or embed Google's authorization page in the WebView.
export async function startGoogleSignIn(options, browser = window) {
  if (!isNativeAndroid(browser)) {
    const client = await getSupabase();
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options });
    if (error) throw error;
    return { mobile: false };
  }
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
