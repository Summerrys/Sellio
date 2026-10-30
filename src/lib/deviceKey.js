import { getSupabase } from '@/lib/supabaseClient';

// This phone's own key for rating checks (Supabase: remember_my_device, rate_order_v3):
// random, made here and kept only here. Sellio stores just a fingerprint of it, so it can
// tell which phones a shop's owner and staff use (those phones can't rate the shop),
// and no one can pass off another person's phone as theirs.
const KEY = 'sellio_device_key';
const SEEN = 'sellio_device_seen'; // { [account]: when this phone was last noted for it }
const EVERY = 12 * 60 * 60 * 1000;

export function deviceKey() {
  try {
    let key = localStorage.getItem(KEY);
    if (!key || !/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(KEY, key);
    }
    return key;
  } catch {
    return null; // no storage: rating still works, without the phone check
  }
}

// The signed-in account (its email) uses this phone: tell Sellio, at most twice a day.
export async function rememberThisPhone(account) {
  const who = String(account || '').trim().toLowerCase();
  if (!who) return;
  const key = deviceKey();
  if (!key) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch { seen = {}; }
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) seen = {};
  if (Date.now() - (Number(seen[who]) || 0) < EVERY) return;
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('remember_my_device', { p_device_key: key });
    if (error) return; // asked again next time
    seen[who] = Date.now();
    const newest = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 5);
    localStorage.setItem(SEEN, JSON.stringify(Object.fromEntries(newest)));
  } catch { /* best effort */ }
}
