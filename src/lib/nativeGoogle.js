// Google sign-in inside Sellio's Android app (Capacitor). Google refuses its sign-in page in
// an app's web view, so the app uses Android's own Google account picker (Credential Manager,
// through @capgo/capacitor-social-login) and gives the ID token to Supabase. The sign-in then
// finishes on the Auth page exactly as the website's Google sign-in does (googleSignIn.js).
// Loaded only inside the app (a separate chunk the website never downloads).
import { SocialLogin } from '@capgo/capacitor-social-login';
import { getSupabase } from './supabaseClient';
import { GOOGLE_WEB_CLIENT_ID } from './googleSignIn';

export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'GoogleSignInCancelled';
  }
}

let ready = null;
function initialize() {
  if (!ready) {
    ready = SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } })
      .catch((error) => { ready = null; throw error; });
  }
  return ready;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// Signs the person in to Supabase with their Google account. Resolves with the session;
// rejects with GoogleSignInCancelled when they close Google's account picker.
export async function signInWithNativeGoogle() {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google sign-in is not set up in this app yet.');
  await initialize();

  // A one-use nonce: Google writes its SHA-256 into the ID token, and Supabase checks the
  // token against the nonce itself, so a token can't be replayed.
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const rawNonce = hex(raw);
  const hashedNonce = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce))));

  let response;
  try {
    response = await SocialLogin.login({ provider: 'google', options: { nonce: hashedNonce } });
  } catch (error) {
    if (error?.code === 'USER_CANCELLED' || /cancel/i.test(error?.message || '')) throw new GoogleSignInCancelled();
    console.error('Google sign-in (app) failed:', error);
    throw new Error('Google sign-in could not start. Please try again, or sign in with your email or phone.');
  }
  const idToken = response?.result?.idToken;
  if (!idToken) throw new Error('Google did not return a sign-in. Please try again.');

  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
  if (error || !data?.session) {
    console.error('Supabase Google sign-in (app) failed:', error);
    throw new Error('Google sign-in could not be completed. Please try again.');
  }
  return data.session;
}

// Signing out of Sellio in the app also forgets the Google account chosen in the picker, so
// the next Google sign-in asks which account again.
export async function signOutNativeGoogle() {
  if (!GOOGLE_WEB_CLIENT_ID) return;
  try {
    await initialize();
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    // Nothing signed in with Google on this phone.
  }
}
