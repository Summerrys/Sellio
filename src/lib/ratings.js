import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// Shop ratings (Supabase: shop_ratings and its functions). Buyers rate a shop after a
// completed order: 1–5 stars and an optional note only the shop sees. Everyone sees a
// shop's average and count once 3 buyers have rated it (each buyer counts once).

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

export async function rateOrder(orderId, stars, note) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('rate_order', { p_order_id: orderId, p_stars: stars, p_note: note || null });
  if (error) {
    const signIn = error.hint === 'sign_in' || (error.code === '42501' && /permission denied/i.test(error.message || ''));
    throw new RatingError(signIn ? 'Log in to rate your order.' : (error.message || 'Your rating couldn\'t be saved. Please try again.'), signIn ? 'sign_in' : error.hint);
  }
  return data;
}

// { [orderId]: { stars, note, can_change } } — the signed-in buyer's own ratings.
export async function myOrderRatings(orderIds) {
  const ids = (orderIds || []).filter(Boolean);
  if (!ids.length) return {};
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('my_order_ratings', { p_order_ids: ids.slice(0, 100) });
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
  const { data, error } = await supabase.rpc('get_shop_ratings', { p_tenant_id: shopId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  return data || [];
}

// "4.8" for a rating number.
export const ratingText = (value) => (value == null || Number.isNaN(Number(value)) ? '' : Number(value).toFixed(1));
