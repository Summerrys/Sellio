// Descriptions for the items of a scanned menu, written by AI (describeMenuItems v1, Alvin 20 Nov
// 2026). Scan Menu's review asks for the items without words printed on the menu, a few at a
// time and in the menu's order, and fills them in one by one, marked "AI draft"; Rewrite in an
// item's editor asks for one again. See src/lib/useDescriptionWriter.js.
import { getSupabase } from '@/lib/supabaseClient';
import { appT, N_ } from '@/lib/appText';

const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
// Items asked for at once (describeMenuItems takes up to 8).
export const DESCRIBE_BATCH = 6;
export const CANT_WRITE = N_('Descriptions can’t be written right now. Please try again.');

// An item's options in a few words for the AI: "Size: S / M +0.50 / L +1".
export function optionsSummary(variants) {
  return (Array.isArray(variants) ? variants : [])
    .map((group) => `${group?.name || ''}: ${(group?.options || []).map((o) => (Number(o?.price_modifier) > 0 ? `${o.label} +${Number(o.price_modifier)}` : o?.label)).filter(Boolean).join(' / ')}`)
    .join('; ')
    .slice(0, 200);
}

// What describeMenuItems is told about a scanned item.
export function describeAsk(item, { rewrite = false } = {}) {
  return {
    name: String(item?.name || '').trim(),
    section: String(item?.category || '').trim(),
    options: optionsSummary(item?.variants),
    ...(rewrite ? { now: String(item?.description || '').trim() } : {}),
  };
}

// The descriptions for `items` (text or null each, in order). Throws an Error to show the shop.
export async function describeItems({ tenantId, items, rewrite = false, signal }) {
  const { data: { session } } = await (await getSupabase()).auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/describeMenuItems`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ tenantId, rewrite, items: items.map((item) => describeAsk(item, { rewrite })) }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok || !Array.isArray(data?.descriptions)) throw new Error(data?.error || appT(CANT_WRITE));
  return items.map((_, i) => (typeof data.descriptions[i] === 'string' && data.descriptions[i].trim() ? data.descriptions[i].trim() : null));
}

// Characters typed per step so a description takes at most about STEPS steps.
export const TYPE_STEP_MS = 40;
const STEPS = 16;
export const typeStep = (text) => Math.max(2, Math.ceil(String(text || '').length / STEPS));
