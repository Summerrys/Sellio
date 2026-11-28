import { getSupabase } from './supabaseClient';

// Admin → Deletion requests (/admin/deletions; Alvin, 29 Nov 2026). The list comes from
// admin_account_deletions (Sellio's admins only); Delete now, Restore and Remove files go through
// the admin-deletions edge function, which checks the admin again before doing anything.

export async function deletionRequests() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('admin_account_deletions');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Resolves the function's answer: { ok: true, kind, ... } or { ok: false, code }. A refusal the
// function didn't write itself (no session, not an admin, the network) comes back as
// { ok: false, code: 'unavailable' | 'forbidden' | 'auth_required' }.
export async function deletionAction(action, requestId, extra = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('admin-deletions', { body: { action, requestId, ...extra } });
  if (!error) return data && typeof data === 'object' ? data : { ok: false, code: 'unavailable' };
  try {
    const answer = await error.context?.json?.();
    if (answer && typeof answer === 'object' && answer.code) return answer;
  } catch { /* not JSON */ }
  return { ok: false, code: 'unavailable' };
}

// Whole days left until a time (0 in its last day; negative once it has passed).
export function daysUntil(when, now = Date.now()) {
  const at = Date.parse(when || '');
  if (!Number.isFinite(at)) return null;
  return Math.floor((at - now) / 86400000);
}

export const ACTION_ERRORS = {
  confirm: 'Type DELETE to confirm.',
  not_pending: 'This request isn’t waiting any more. It was restored or deleted a moment ago.',
  not_found: 'This request no longer exists.',
  forbidden: 'This is for Sellio’s admins.',
  auth_required: 'Sign in again, then try once more.',
  failed: 'It stopped part-way, so nothing more was done. Try again; the request’s log shows where it stopped.',
  unavailable: 'Couldn’t reach Sellio. Check your connection and try again.',
};
