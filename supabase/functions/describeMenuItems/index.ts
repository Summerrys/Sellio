// describeMenuItems — v1 (20 Nov 2026). Deploy with verify_jwt: true.
//
// Short descriptions for the items read from a menu (Scan Menu's review, Alvin 20 Nov 2026):
// the app asks for a few items at a time (at most MAX_ITEMS) and fills them in one by one, each
// marked "AI draft" for the shop to check; Rewrite in an item's editor asks for one again, in
// other words. Words printed on the menu for an item are tidied rather than replaced.
//
// Who may ask is as for scanMenu: signed in; an active member, with products.create, of the
// open store (ai_authorized_store); the store's plan includes menu scanning (ai_plan_allows
// can_scan_menu); at most CALLS_PER_STORE_PER_DAY asks a store a day (ai_quota_take).
// Answer: { descriptions: [text or null, …] }, one per item asked for, in the same order.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const MODEL = 'claude-haiku-5-5';
export const MAX_ITEMS = 8;
export const CALLS_PER_STORE_PER_DAY = 300;
const MAX_TOKENS = 1_500;
const AI_TIMEOUT_MS = 45_000;
export const MAX_DESCRIPTION = 160;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Email of the signed-in caller, or null (no header, public key, expired token).
async function callerEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return null;
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await callerClient.auth.getUser();
  return error || !user?.email ? null : user.email;
}

export function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// The items as asked for: a name each (others are dropped), and what's known about it.
export function askedItems(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  return raw.map((item) => ({
    name: cleanText(item?.name, 120),
    section: cleanText(item?.section, 60),
    printed: cleanText(item?.printed, 300),
    options: cleanText(item?.options, 200),
    now: cleanText(item?.now, 300),
  }));
}

// The fixed format the AI answers in.
export const DESCRIBE_TOOL = {
  name: 'save_descriptions',
  description: 'Save one description for each menu item, numbered as in the list.',
  input_schema: {
    type: 'object',
    properties: {
      descriptions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            item: { type: 'integer', description: 'The item\'s number in the list (1 for the first).' },
            text: { type: 'string', description: 'The description: one sentence.' },
          },
          required: ['item', 'text'],
        },
      },
    },
    required: ['descriptions'],
  },
};

export function describePrompt({ items, country, rewrite }: { items: ReturnType<typeof askedItems> & unknown[]; country?: string | null; rewrite?: boolean }) {
  const list = (items ?? []).map((item, i) => {
    const parts = [`${i + 1}. ${item.name}`];
    if (item.section) parts.push(`section: ${item.section}`);
    if (item.options) parts.push(`options: ${item.options}`);
    if (item.printed) parts.push(`printed on the menu: "${item.printed}"`);
    if (rewrite && item.now) parts.push(`now: "${item.now}"`);
    return parts.join(' — ');
  }).join('\n');
  return `You write the short description shown under each item on a shop's online menu and till, for a shop in ${country || 'Singapore'}. For each item below, write one plain sentence of at most 14 words saying what it is: what's in it, or how it's made or served, as its name and section make clear.

- Write in the language the item's name is in (a name in two languages: the first one).
- Only say what the name, section and printed words make clear or nearly certain. When unsure, keep it general ("A pot of hot tea."). Never invent sizes, amounts, prices, places of origin, awards or health claims.
- No prices, emojis or exclamation marks, and no words like delicious, mouth-watering, perfect or best.
- Not just the name again.
- Words printed on the menu for an item come first: tidy them into the sentence.${rewrite ? '\n- Each item has a description now: write a different one, in other words.' : ''}

Call save_descriptions with one description for each item, numbered as below.

Items:
${list}`;
}

// The AI's answer as one text (or null) per item, in the order asked.
export function descriptionsFrom(answer: any, count: number) {
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  for (const entry of Array.isArray(answer?.descriptions) ? answer.descriptions : []) {
    const i = Number(entry?.item) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= count || out[i]) continue;
    const text = cleanText(entry?.text, MAX_DESCRIPTION).replace(/^["“'‘]+|["”'’]+$/g, '').trim();
    if (text) out[i] = text;
  }
  return out;
}

export async function writeDescriptions({ items, country, rewrite }: { items: any[]; country: string | null; rewrite: boolean }) {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools: [DESCRIBE_TOOL],
        tool_choice: { type: 'tool', name: DESCRIBE_TOOL.name },
        messages: [{ role: 'user', content: describePrompt({ items, country, rewrite }) }],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`describeMenuItems: no answer (${(error as Error)?.name}) after ${Date.now() - started} ms`);
    return null;
  }
  const aiData = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('describeMenuItems: AI service answered', res.status, JSON.stringify(aiData?.error ?? aiData).slice(0, 300));
    return null;
  }
  const blocks = Array.isArray(aiData?.content) ? aiData.content : [];
  const answer = blocks.find((block: any) => block?.type === 'tool_use' && block?.name === DESCRIBE_TOOL.name)?.input;
  const descriptions = descriptionsFrom(answer, items.length);
  console.log(`describeMenuItems v1: ${descriptions.filter(Boolean).length} of ${items.length}${rewrite ? ' (rewrite)' : ''}, `
    + `tokens ${aiData?.usage?.input_tokens ?? 0}+${aiData?.usage?.output_tokens ?? 0}, ${Date.now() - started} ms`);
  return descriptions;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const tenantId = body?.tenantId;
    const items = askedItems(body?.items);
    const rewrite = body?.rewrite === true;
    if (!tenantId) return json({ error: 'tenantId required' }, 400);
    if (!items || !items.length || items.length > MAX_ITEMS || items.some((item) => !item.name)) {
      return json({ error: `Send 1 to ${MAX_ITEMS} items, each with a name.` }, 400);
    }

    const email = await callerEmail(req);
    if (!email) return json({ error: 'Please sign in again.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: storeId, error: authError } = await supabase.rpc('ai_authorized_store', {
      p_email: email, p_tenant_id: String(tenantId), p_permissions: ['products.create'],
    });
    if (authError) throw authError;
    if (!storeId) return json({ error: 'You do not have access to this store’s products.' }, 403);

    const { data: allowed, error: planError } = await supabase.rpc('ai_plan_allows', { p_tenant_id: storeId, p_key: 'can_scan_menu' });
    if (planError) throw planError;
    if (allowed !== true) return json({ error: 'Menu scan isn’t included in this shop’s plan.' }, 403);

    const { data: withinQuota, error: quotaError } = await supabase.rpc('ai_quota_take', {
      p_feature: 'describeMenuItems', p_scope: `store:${storeId}`, p_window_seconds: 86400, p_limit: CALLS_PER_STORE_PER_DAY,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) return json({ error: 'This store has written as many descriptions as it can today. Please try again tomorrow.' }, 429);

    const { data: tenant } = await supabase.from('tenants').select('country').eq('id', storeId).single();
    const descriptions = await writeDescriptions({ items, country: tenant?.country || null, rewrite });
    if (!descriptions) return json({ error: 'Descriptions can’t be written right now. Please try again.', reason: 'unavailable' }, 502);
    return json({ descriptions });
  } catch (error) {
    console.error('describeMenuItems error:', (error as Error)?.message);
    return json({ error: 'Descriptions can’t be written right now. Please try again.' }, 500);
  }
});
