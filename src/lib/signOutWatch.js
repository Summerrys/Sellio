// Signed out without asking (UX state 8, 14 Nov 2026). Supabase can end a sign-in by itself: a
// password reset signs every other phone out, a closed account's sessions end, a refresh that
// fails for good. Sellio used to say nothing: lists emptied on their next refresh, saves failed,
// new orders stopped ringing, and the next start just showed the signed-out pages. This notes
// when that happens, for SignedOutNotice.jsx to tell the person once, with what's still kept on
// the device.
//
// Sign-outs someone asked for say nothing: every Sign out in Sellio calls supabase.auth.signOut,
// which is wrapped here to note it first (on purpose, kept until the next sign-in). The sign-in
// pages and AppUserContext.jsx are left as they are; this only reads Sellio's sign-in record
// (the app_session cookie, cookieUtils) and Supabase's events:
// - SIGNED_OUT while someone was signed in, not on purpose: signed out now.
// - Sellio opens with nobody signed in although the record says someone was, nobody signed out
//   on purpose, and Supabase's sign-in is gone from this device (not just unreachable offline):
//   signed out while Sellio was closed.
// - Any sign-in (or a session that's still there) ends it.
import { getSupabase } from './supabaseClient';
import { cookieUtils } from './AppUserContext';

const PURPOSE_KEY = 'sellio.signOutOnPurpose'; // when Sign out was tapped on this device (ms)
const NOTICE_KEY = 'sellio.signedOut';         // { at, email, id, shop, seen }
export const SIGNED_OUT_EVENT = 'sellio:signed-out';
// A SIGNED_OUT this soon after a Sign out is that sign-out (in this tab or another).
const PURPOSE_MS = 60 * 1000;

const defaultStorage = () => {
  try { return window.localStorage; } catch { return null; }
};
function read(storage, key) {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}
function write(storage, key, value) {
  try {
    if (!storage) return;
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* storage unavailable: nothing is noted */ }
}
function announce() {
  try { window.dispatchEvent(new Event(SIGNED_OUT_EVENT)); } catch { /* no window */ }
}

// The notice to show, if any: { at, email, id (app_users), shop (true for a shop's people),
// seen (Not now was tapped: the small "Signed out · Sign in" pill instead) }.
export function readSignedOutNotice(storage = defaultStorage()) {
  try {
    const notice = JSON.parse(read(storage, NOTICE_KEY) || 'null');
    return notice && typeof notice === 'object' && typeof notice.at === 'number' ? notice : null;
  } catch {
    return null;
  }
}

export function saveSignedOutNotice(notice, storage = defaultStorage()) {
  write(storage, NOTICE_KEY, notice ? JSON.stringify(notice) : null);
  announce();
}

let watching = null;

// Once, at the start (main.jsx, before the first screen: AppUserContext may drop the record
// as soon as it has looked). The parameters are for the tests.
export function startSignOutWatch({
  loadClient = getSupabase,
  readRecord = () => cookieUtils.get(),
  storage = defaultStorage(),
  now = () => Date.now(),
} = {}) {
  if (watching) return watching;
  let recordAtStart = null;
  try { recordAtStart = readRecord(); } catch { recordAtStart = null; }

  watching = Promise.resolve().then(loadClient).then((client) => {
    const auth = client.auth;
    if (!auth.__sellioSignOutWatched) {
      const signOut = auth.signOut.bind(auth);
      auth.signOut = (options) => {
        // 'others' signs out the other devices only: this one stays signed in.
        if (options?.scope !== 'others') {
          write(storage, PURPOSE_KEY, String(now()));
          if (readSignedOutNotice(storage)) saveSignedOutNotice(null, storage);
        }
        return signOut(options);
      };
      auth.__sellioSignOutWatched = true;
    }

    const onPurpose = (within) => {
      const at = Number(read(storage, PURPOSE_KEY));
      return Number.isFinite(at) && at > 0 && (within == null || now() - at < within);
    };
    // Supabase keeps its sign-in in storage until it ends it; offline, it's still there.
    const signInKept = () => !auth.storageKey || !!read(storage, auth.storageKey);
    const note = (record) => {
      const existing = readSignedOutNotice(storage);
      if (existing && existing.email === String(record.email || '')) { announce(); return; }
      saveSignedOutNotice({
        at: now(),
        email: String(record.email || ''),
        id: String(record.id || ''),
        shop: !!record.tenant_id,
        seen: false,
      }, storage);
    };

    const { data } = auth.onAuthStateChange((event, session) => {
      // After the callback returns (Supabase's advice for its callbacks).
      setTimeout(() => {
        if (session) {
          write(storage, PURPOSE_KEY, null);
          if (readSignedOutNotice(storage)) saveSignedOutNotice(null, storage);
          return;
        }
        if (event === 'SIGNED_OUT') {
          if (onPurpose(PURPOSE_MS)) return;
          let record = null;
          try { record = readRecord(); } catch { record = null; }
          record = record || recordAtStart;
          if (record) note(record);
          return;
        }
        if (event !== 'INITIAL_SESSION') return;
        // Sellio has just opened, with nobody signed in.
        const existing = readSignedOutNotice(storage);
        if (existing) {
          // Told already (Not now): from now on Sellio shows the signed-out pages as usual.
          if (existing.seen) saveSignedOutNotice(null, storage);
          else announce();
          return;
        }
        if (!recordAtStart || onPurpose() || signInKept()) return;
        note(recordAtStart);
      }, 0);
    });
    return data?.subscription || null;
  }).catch(() => null);
  return watching;
}

// For the tests: a fresh start.
export function resetSignOutWatchForTests() {
  watching = null;
}
