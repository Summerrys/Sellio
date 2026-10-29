// Liking Explore listings: the heart on a listing, and Me → My likes.
// The database decides who may like what (set_listing_like): signed in, a listing that
// shows on Explore, not your own shop's, at most 300 new likes a day. Unliking always works.
import { getSupabase } from '@/lib/supabaseClient';

async function call(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// → { liked, likes }: the listing's like count after the change.
export const setListingLike = (productId, liked) =>
  call('set_listing_like', { p_product_id: productId, p_liked: !!liked });

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
