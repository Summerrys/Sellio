// Google sign-in from the Android app opens this Sellio page in the browser (so the
// app's "Open External Link?" box names sellio.apptelier.sg), which forwards straight
// to Sellio's own Supabase Google sign-in. Nothing else is ever forwarded to.
// index.html does the forwarding before the app's code loads; it repeats these rules
// in plain JavaScript, so keep the two in step (tests/20 checks both).
export const GOOGLE_RELAY_PATH = '/google-signin';
export const GOOGLE_RELAY_ORIGIN = 'https://sellio.apptelier.sg';
export const RETURN_ORIGINS = ['https://sellio.apptelier.sg', 'https://selliosg.base44.app'];
const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

// True only for <supabase>/auth/v1/authorize?provider=google with a PKCE challenge,
// returning to Sellio's Android sign-in page.
export function isSellioGoogleAuthorize(href, supabaseUrl) {
  try {
    const to = new URL(href);
    const q = to.searchParams;
    const back = new URL(q.get('redirect_to') || '');
    return to.origin === new URL(supabaseUrl).origin && to.pathname === '/auth/v1/authorize' &&
      q.get('provider') === 'google' && CHALLENGE.test(q.get('code_challenge') || '') &&
      q.get('code_challenge_method') === 's256' &&
      RETURN_ORIGINS.includes(back.origin) && back.searchParams.get('sellio_mobile_oauth') === '1';
  } catch { return false; }
}

export function googleRelayUrl(authorizeHref) {
  const url = new URL(GOOGLE_RELAY_PATH, GOOGLE_RELAY_ORIGIN);
  url.searchParams.set('to', authorizeHref);
  return url.href;
}
