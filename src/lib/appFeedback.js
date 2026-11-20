import { getSupabase } from '@/lib/supabaseClient';
import { appPlatform } from '@/lib/nativeApp';
import { N_ } from '@/lib/appText';

// The Sellio app's own rating (Alvin, 20 Nov 2026; Supabase: app.app_feedback and its functions,
// supabase/migrations/20261120084739_app_feedback.sql). Everyone who uses the Android app is
// asked, buyers, home sellers, a shop's people and people not signed in alike: "How's Sellio
// working for you?", on the third separate day they open Sellio (components/feedback/AppRatingPrompt).
// 1–4 stars: what could be better, an optional note and "You can contact me about this", for the
// Sellio team only (no Google Play link). 5 stars: would they rate Sellio on Google Play too.
// Once someone answers (Send feedback, Skip, Rate on Google Play, Maybe later, or closing it), it
// isn't shown to them again: per account when signed in, per phone when not. Sellio's admins read
// it in Admin → Feedback (/admin/feedback), and each 1–3 star rating alerts their phones.

export const PLAY_LISTING = 'https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app';

// What could be better, as Sellio's database names them.
export const FEEDBACK_TOPICS = [
  ['ease_of_use', N_('Ease of use')],
  ['speed', N_('Speed')],
  ['ordering', N_('Ordering')],
  ['design', N_('Design')],
  ['broken', N_('Something’s broken')],
  ['other', N_('Something else')],
];
export const COMMENT_MAX = 2000;

// ── The separate days this phone opened Sellio (the first three are all it needs) ──────────
export const ASK_ON_DAY = 3;
const DAYS_KEY = 'sellio_app_days';

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// The phone's own date, so a day starts at midnight where the person is.
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Today counts as a day Sellio was opened (started, or back on screen). Returns the days so far.
export function noteAppDay(now = new Date()) {
  const days = readList(DAYS_KEY).slice(0, ASK_ON_DAY);
  const today = localDay(now);
  if (!days.includes(today) && days.length < ASK_ON_DAY) {
    days.push(today);
    try { localStorage.setItem(DAYS_KEY, JSON.stringify(days)); } catch { /* no storage: never asked */ }
  }
  return days.length;
}

export function appDaysSoFar() {
  return Math.min(readList(DAYS_KEY).length, ASK_ON_DAY);
}

// ── Who has answered on this phone: { accounts: [email…], phone: true when signed out } ───────
const DONE_KEY = 'sellio_app_feedback_done';

function readDone() {
  try {
    const value = JSON.parse(localStorage.getItem(DONE_KEY) || '{}');
    const accounts = Array.isArray(value?.accounts) ? value.accounts.filter((a) => typeof a === 'string') : [];
    return { accounts, phone: value?.phone === true };
  } catch {
    return { accounts: [], phone: false };
  }
}

const accountKey = (account) => String(account || '').trim().toLowerCase();

export function answeredOnThisPhone(account) {
  const done = readDone();
  const who = accountKey(account);
  return who ? done.accounts.includes(who) : done.phone;
}

export function noteAnswered(account) {
  const done = readDone();
  const who = accountKey(account);
  if (who) {
    if (!done.accounts.includes(who)) done.accounts = [...done.accounts, who].slice(-20);
  } else {
    done.phone = true;
  }
  try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* asked Sellio again next time */ }
}

// The phone's random id (the same one store pages keep), so someone signed out is asked once.
const DEVICE_KEY = 'sellio_device_id';
export function feedbackDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id.slice(0, 100);
  } catch {
    return null;
  }
}

// "2.0 (206)": the app's version and build, as the phone reports them.
let versionAsked = null;
export function appVersion() {
  if (!versionAsked) {
    versionAsked = (async () => {
      if (!appPlatform()) return null;
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        return `${info.version} (${info.build})`.slice(0, 40);
      } catch {
        return null;
      }
    })();
  }
  return versionAsked;
}

// Whether this account (signed out: this phone) has answered already: what this phone knows
// first, then Sellio. When Sellio can't be asked, it counts as answered for now (asked another day).
export async function alreadyAnswered(account) {
  if (answeredOnThisPhone(account)) return true;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('app_feedback_status', { p_device_id: feedbackDeviceId() });
    if (error) return true;
    if (data?.done === true) {
      noteAnswered(account);
      return true;
    }
    return data?.done === false ? false : true;
  } catch {
    return true;
  }
}

// Sends the answer: { status: 'saved', id } (or 'already' when this account or phone answered
// before, 'no_device', 'busy'). outcome: 'rated' (with stars) or 'dismissed' (Maybe later).
export async function sendAppFeedback({ outcome, stars = null, topics = [], comment = '', contactOk = false, openedPlay = false, language = 'en' }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('submit_app_feedback', {
    p_outcome: outcome,
    p_stars: outcome === 'rated' ? stars : null,
    p_topics: topics,
    p_comment: String(comment || '').trim().slice(0, COMMENT_MAX) || null,
    p_contact_ok: !!contactOk,
    p_opened_play: !!openedPlay,
    p_device_id: feedbackDeviceId(),
    p_language: ['en', 'zh', 'ms', 'id'].includes(language) ? language : 'en',
    p_platform: appPlatform() || 'web',
    p_app_version: await appVersion(),
  });
  if (error) throw error;
  return data || {};
}

// ── Admin → Feedback (Sellio's admins only; the database checks the account) ─────────────────
async function rpc(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function amISellioAdmin() {
  try {
    return (await rpc('am_i_sellio_admin')) === true;
  } catch {
    return false;
  }
}

// { ratings, average, by_stars: { 5: n … 1: n }, low_open, dismissed, opened_play, tests }
export const feedbackSummary = ({ includeTest = false } = {}) => rpc('app_feedback_admin_summary', { p_include_test: includeTest });

// filter: all | low (1–3★) | four | five | open (1–3★ not marked done). Newest first; `before`
// (a created_at) for the next page.
export async function feedbackList({ filter = 'all', includeTest = false, before = null, limit = 50 } = {}) {
  const list = await rpc('app_feedback_admin_list', { p_filter: filter, p_include_test: includeTest, p_before: before, p_limit: limit });
  return Array.isArray(list) ? list : [];
}

export const markFeedback = (id, done = true) => rpc('app_feedback_admin_mark', { p_id: id, p_done: done });

// An admin's phone: what's sent from it is tagged as a test (theirs, or test accounts on it).
export async function noteTestPhone() {
  const id = feedbackDeviceId();
  if (!id) return;
  try { await rpc('app_feedback_admin_note_device', { p_device_id: id }); } catch { /* tagged next time */ }
}
