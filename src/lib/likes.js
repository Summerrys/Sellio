// Liking Explore listings: the heart on a listing, on Explore's cards, and Me → My likes.
// The database decides who may like what (set_listing_like): signed in, a listing that
// shows on Explore, not your own shop's, at most 300 new likes a day. Unliking always works.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

async function call(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// ── What this page knows about listings' likes ──
// { likes, liked, own } per listing: from the cards' lookup (listing_likes_for), the
// listing page, and every like or unlike made here, so a heart tapped anywhere shows the
// same on every card.
const known = new Map();
const listeners = new Set();
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function noteLikes(productId, value) {
  if (!productId || !value) return;
  const id = String(productId);
  const before = known.get(id) || { likes: 0, liked: false, own: false };
  const next = {
    likes: value.likes === undefined ? before.likes : Math.max(0, Number(value.likes) || 0),
    liked: value.liked === undefined ? before.liked : !!value.liked,
    own: value.own === undefined ? before.own : !!value.own,
  };
  if (known.has(id) && next.likes === before.likes && next.liked === before.liked && next.own === before.own) return;
  known.set(id, next);
  listeners.forEach((listener) => listener());
}

// The listing's { likes, liked, own } as this page knows it, or null before it's known.
export function useKnownLike(productId) {
  const id = productId == null ? '' : String(productId);
  return useSyncExternalStore(subscribe, () => known.get(id) || null, () => null);
}

// → { liked, likes }: the listing's like count after the change.
export async function setListingLike(productId, liked) {
  const result = await call('set_listing_like', { p_product_id: productId, p_liked: !!liked });
  noteLikes(productId, { liked: !!result?.liked, likes: Number(result?.likes) || 0 });
  return result;
}

// The cards' likes, up to 100 listings a question.
export async function loadLikesFor(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean).map(String))];
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await call('listing_likes_for', { p_product_ids: ids.slice(i, i + 100) });
    (rows || []).forEach((row) => noteLikes(row.product_id, { likes: row.likes, liked: row.liked, own: row.own }));
  }
}

// Explore: the likes of the cards on screen, asked for once per card while the page is
// open (and again for every card when the person signing in changes).
export function useLikesFor(productIds, viewer) {
  const asked = useRef(new Set());
  const viewerRef = useRef(viewer);
  const key = [...new Set((productIds || []).filter(Boolean).map(String))].join(',');
  useEffect(() => {
    if (viewerRef.current !== viewer) {
      viewerRef.current = viewer;
      asked.current = new Set();
    }
    const need = key ? key.split(',').filter((id) => !asked.current.has(id)) : [];
    if (!need.length) return;
    need.forEach((id) => asked.current.add(id));
    loadLikesFor(need).catch((e) => {
      // Likes are extra: when they can't load, the hearts wait (and are asked again next time).
      need.forEach((id) => asked.current.delete(id));
      console.warn('Likes unavailable:', e?.message || e);
    });
  }, [key, viewer]);
}

// A card's heart: like or unlike at once, and put it back if the database says no.
const changing = new Set();
export async function toggleKnownLike(productId) {
  const id = String(productId);
  const before = known.get(id) || { likes: 0, liked: false, own: false };
  if (changing.has(id) || before.own) return null;
  const liked = !before.liked;
  changing.add(id);
  noteLikes(id, { liked, likes: before.likes + (liked ? 1 : -1) });
  try {
    return await setListingLike(id, liked);
  } catch (e) {
    noteLikes(id, { liked: before.liked, likes: before.likes });
    throw e;
  } finally {
    changing.delete(id);
  }
}

// The signed-in buyer's liked listings, newest first.
export const myLikedListings = (offset = 0, limit = 40) =>
  call('my_liked_listings', { p_limit: limit, p_offset: offset });

export const needsSignIn = (error) => error?.hint === 'sign_in';

// The database's own wording for problems people can act on; a plain fallback otherwise.
const FRIENDLY = new Set(['not_found', 'own_listing', 'rate_limited']);
export function likeErrorMessage(error, fallback = 'Couldn’t update your like. Check your connection and try again.') {
  if (FRIENDLY.has(error?.hint) && error?.message) return error.message;
  return fallback;
}

export const likesText = (n) => {
  const count = Number(n) || 0;
  return `${count} ${count === 1 ? 'like' : 'likes'}`;
};
