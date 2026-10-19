import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// Shop ratings (Supabase: shop_ratings and its functions). Buyers rate a shop after a
// completed order: 1–5 stars and an optional comment, shown on the shop's page as
// "Alicia T." when the buyer chooses (checked by the server first: no contact details,
// addresses, ID numbers or rude words), or kept for the shop only. Everyone sees a shop's
// average, count and public comments once 3 buyers have rated it (each buyer counts once).
// Anyone logged in can report a public comment; Sellio's moderators keep or remove it.

export const STAR_WORDS = ['', 'Terrible', 'Not good', 'Okay', 'Good', 'Great'];
export const STAR_COLOR = '#f59e0b';
export const NOTE_MAX = 300;

// ── Public averages (shop_rating_summary), cached for a few minutes ──
const TTL = 5 * 60 * 1000;
const cache = new Map(); // shop id → { at, value }
const waiting = new Map(); // shop id → promise

async function loadSummaries(ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('shop_rating_summary', { p_tenant_ids: chunk });
      if (error) throw error;
      const byId = new Map((data || []).map((row) => [row.tenant_id, row]));
      chunk.forEach((id) => cache.set(id, { at: Date.now(), value: byId.get(id) || null }));
    } catch (e) {
      // Ratings are extra: when they can't load, none show (and they're asked again later).
      console.warn('Ratings unavailable:', e?.message || e);
    }
  }
}

// { [shopId]: { rating, rating_count, stars_5 … stars_1 } } for shops with 3+ ratings.
export async function fetchRatingSummaries(shopIds) {
  const ids = [...new Set((shopIds || []).filter(Boolean).map(String))];
  const now = Date.now();
  const need = ids.filter((id) => !waiting.has(id) && !(cache.has(id) && now - cache.get(id).at < TTL));
  if (need.length) {
    const p = loadSummaries(need).finally(() => need.forEach((id) => waiting.delete(id)));
    need.forEach((id) => waiting.set(id, p));
  }
  await Promise.all([...new Set(ids.map((id) => waiting.get(id)).filter(Boolean))]);
  const out = {};
  ids.forEach((id) => { const hit = cache.get(id); if (hit?.value) out[id] = hit.value; });
  return out;
}

export function forgetRatingSummary(shopId) {
  cache.delete(String(shopId));
}

export function useRatingSummaries(shopIds) {
  const key = [...new Set((shopIds || []).filter(Boolean).map(String))].sort().join(',');
  const [map, setMap] = useState({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchRatingSummaries(key.split(',')).then((found) => { if (!cancelled) setMap(found); });
    return () => { cancelled = true; };
  }, [key, version]);
  return [map, () => { key.split(',').forEach(forgetRatingSummary); setVersion((v) => v + 1); }];
}

// ── Signed in? (the session, not the saved profile) ──
export async function isSignedIn() {
  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return !!session?.user;
  } catch {
    return false;
  }
}

// ── A buyer rating an order ──
export class RatingError extends Error {
  constructor(message, hint) { super(message); this.hint = hint || null; }
}

// notePublic: show the comment on the shop's page (with the buyer's first name and initial).
export async function rateOrder(orderId, stars, note, notePublic = false) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('rate_order_v2', { p_order_id: orderId, p_stars: stars, p_note: note || null, p_note_public: !!(note && notePublic) });
  if (error) {
    const signIn = error.hint === 'sign_in' || (error.code === '42501' && /permission denied/i.test(error.message || ''));
    throw new RatingError(signIn ? 'Log in to rate your order.' : (error.message || 'Your rating couldn\'t be saved. Please try again.'), signIn ? 'sign_in' : error.hint);
  }
  return data;
}

// { [orderId]: { stars, note, can_change, note_public, note_state } } — the signed-in
// buyer's own ratings. note_state: 'visible' | 'reported' (hidden while it's reviewed) |
// 'removed' (by Sellio).
export async function myOrderRatings(orderIds) {
  const ids = (orderIds || []).filter(Boolean);
  if (!ids.length) return {};
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('my_order_ratings_v2', { p_order_ids: ids.slice(0, 100) });
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.order_id, row]));
  } catch {
    return {};
  }
}

// ── The shop's own view ──
export async function shopRatingOverview(shopId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('shop_rating_overview', { p_tenant_id: shopId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function shopRatings(shopId, offset = 0, limit = 30) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_shop_ratings_v2', { p_tenant_id: shopId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  return data || [];
}

// The buyer takes their comment down (any time; the stars stay).
export async function removeMyComment(orderId) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('remove_my_rating_comment', { p_order_id: orderId });
  if (error) throw new RatingError(error.message || 'Couldn’t remove it. Please try again.', error.hint);
}

// "Alicia T.": how a buyer's name shows with a public comment (the server's rule).
export function publicName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0].slice(0, 40)} ${parts[1].charAt(0).toUpperCase()}.` : parts[0].slice(0, 40);
}

// ── Public comments ──
export async function shopComments(shopId, offset = 0, limit = 10) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('shop_rating_comments', { p_tenant_id: shopId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  return data || [];
}

export const REPORT_REASONS = [
  ['abuse', 'Rude, hateful or harassing'],
  ['personal_info', 'Shares someone’s personal details'],
  ['spam', 'Spam or advertising'],
  ['not_genuine', 'Not a real experience with this shop'],
  ['other', 'Something else'],
];

// { hidden } — whether the comment is now hidden while Sellio reviews it.
export async function reportComment(ratingId, reason, details) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('report_rating_comment', { p_rating_id: ratingId, p_reason: reason, p_details: details || null });
  if (error) {
    const signIn = error.hint === 'sign_in' || (error.code === '42501' && /permission denied/i.test(error.message || ''));
    throw new RatingError(signIn ? 'Log in to report a comment.' : (error.message || 'Couldn’t send the report. Please try again.'), signIn ? 'sign_in' : error.hint);
  }
  return data || {};
}

// ── Sellio's moderators ──
export async function amIModerator() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('am_i_moderator');
    if (error) throw error;
    return data === true;
  } catch {
    return false;
  }
}

export async function moderationQueue(offset = 0, limit = 30) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('moderation_queue', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return data || [];
}

// action: 'keep' | 'remove'
export async function moderateComment(ratingId, action) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('moderate_rating_comment', { p_rating_id: ratingId, p_action: action });
  if (error) throw error;
  return data;
}

// "4.8" for a rating number.
export const ratingText = (value) => (value == null || Number.isNaN(Number(value)) ? '' : Number(value).toFixed(1));
