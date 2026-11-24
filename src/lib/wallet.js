import { getSupabase } from '@/lib/supabaseClient';

// Sellio Coins: the signed-in person's wallet (25 Nov 2026; world_wallet). One wallet per person,
// buyers too, not per shop. {balance, earned, spent, today: {earned, cap, left, drops, visits},
// dropMax, visitReward, referralCoins: {free, merchant}, history: [{at, delta, reason, shop?,
// item?, badge?, kind?}]}, newest first. Coins have no cash value.
export async function getWallet({ limit = 40, before = null } = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('world_wallet', { p_limit: limit, p_before: before });
  if (error) throw error;
  return data;
}

// The day's progress as a share of its limit (0 to 1), or null when there's no limit.
export function todayShare(today) {
  const cap = Number(today?.cap);
  if (!cap) return null;
  return Math.max(0, Math.min(1, Number(today?.earned || 0) / cap));
}
