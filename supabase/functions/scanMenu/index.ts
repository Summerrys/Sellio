// scanMenu — v21 (reads more menus). Deploy with verify_jwt: true.
//
// v21 (16 Nov 2026), after a clear menu photo at Cafelicious came back "No items found": the
// v20 prompt kept only items with a price printed right next to them and then dropped every
// item without a price, so a menu with section prices, a picture menu or a drinks board came
// back nearly empty (AI answers of 40 tokens, 15 Nov). Now:
//  • Every item the AI can read is kept. An item with no price shown has price null: the
//    review screen asks for one before it can be saved (a scan never saves a $0 item). A price
//    printed for a whole section ("All drinks $3.50", or beside the section title) is used for
//    each item in it. Picture menus and drink boards are read too.
//  • The AI answers in a fixed format (forced tool use, MENU_TOOL) with room for long menus
//    (max_tokens 16000, was 4096). Options (sizes, hot or iced, add-ons) come in the product
//    editor's own format, prices as numbers. Should the AI service ever refuse that format
//    (400), it is asked once more for the same answer as JSON text, read as v20 read it.
//  • An item with its own picture on the menu gets that picture's box ([x1, y1, x2, y2],
//    pixels of the photo as sent): the app sends the photo at the size the model reads it, so
//    the box needs no conversion, and cuts the picture out as the item's photo.
//  • When nothing is found, the answer says why: not_a_menu, too_blurry, cut_off or no_items
//    (too_long and unavailable when the AI couldn't finish). A scan that finds nothing logs
//    what the AI answered.
//  • The reply starts at once and a space is sent every 10 s until the answer: a long menu
//    can take minutes, and a function that hasn't started its reply by 150 s is cut off (the
//    worker itself may run 400 s on Sellio's plan; the AI gets 330 s).
// Apps from before v21 don't send `version: 2`: they get only items with a price (as v20),
// because they would save an item without one at $0.
// Everything before the AI call (sign-in, store access, plan, size, 40 scans a store a day)
// is v20.
//
// v16: the store's plan must include menu scanning (entitlement can_scan_menu, via
// ai_plan_allows). Business plans do; a free personal shop doesn't.
// v15: caller must be signed in and an active member, with 'products.create', of the open
// store being scanned for; max 40 scans per store per day; image size capped; imageUrl must
// be https.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCANS_PER_STORE_PER_DAY = 40;
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ≈ 5 MB image
const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16_000;
const AI_TIMEOUT_MS = 330_000;
const KEEPALIVE_MS = 10_000;
const MAX_ITEMS = 300;
export const REASONS = ['not_a_menu', 'too_blurry', 'cut_off', 'no_items'];

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

// The fixed format the AI answers in.
export const MENU_TOOL = {
  name: 'save_menu',
  description: 'Save the items read from the menu photo.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'The menu\'s sections in the order shown. A menu without sections is one section.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The section title as printed, e.g. "Coffee & Tea"; a short, plain one when the menu has none, e.g. "Drinks".' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  price: { type: ['number', 'null'], description: 'The price for one, without the currency. null when no price is printed for the item or its section.' },
                  description: { type: 'string' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        group: { type: 'string' },
                        addon: { type: 'boolean', description: 'true for add-ons a customer may pick several of; false for a choice of one (size, hot or iced).' },
                        choices: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: { label: { type: 'string' }, extra: { type: 'number', description: 'The price added to the item\'s price; 0 for the cheapest choice.' } },
                            required: ['label', 'extra'],
                          },
                        },
                      },
                      required: ['group', 'choices'],
                    },
                  },
                  photo: {
                    type: ['array', 'null'],
                    items: { type: 'number' },
                    description: '[x1, y1, x2, y2]: the pixel box of this item\'s own picture on the menu, or null.',
                  },
                },
                required: ['name', 'price'],
              },
            },
          },
          required: ['title', 'items'],
        },
      },
      nothing_found: { type: ['string', 'null'], enum: [...REASONS, null] },
      note: { type: 'string' },
    },
    required: ['sections'],
  },
};

// The answer as text, for when the fixed format can't be used (see readMenu).
const TEXT_ANSWER = `Answer with only a JSON object in this shape, and no other words:
{"sections": [{"title": "Coffee & Tea", "items": [{"name": "Kopi", "price": 1.8, "description": "", "options": [{"group": "Hot or iced", "addon": false, "choices": [{"label": "Hot", "extra": 0}, {"label": "Iced", "extra": 0.4}]}], "photo": [120, 340, 410, 600]}]}], "nothing_found": null, "note": ""}`;

export function menuPrompt({ currency, country, width, height, asText = false }: { currency: string; country?: string | null; width?: number | null; height?: number | null; asText?: boolean }) {
  const size = width && height
    ? `The photo is ${width} × ${height} pixels. A box is [x1, y1, x2, y2] in pixels of this photo: its top-left and bottom-right corners, counted from the photo's top-left corner.`
    : 'A box is [x1, y1, x2, y2] in pixels of the photo: its top-left and bottom-right corners, counted from the photo\'s top-left corner.';
  const task = asText ? 'List every item a customer can order.' : 'Call save_menu with every item a customer can order.';
  return `You read a photo of a menu for a shop in ${country || 'Singapore'} whose prices are in ${currency}. It may be a printed menu, a menu board, a drinks board, a picture menu or a leaflet. ${task}

${size}

Items:
- Every dish, drink or product a customer can order, in the order shown, in the section it's printed under. Not section titles, the shop's name, address, phone number or opening hours, and not notes such as "Prices subject to service charge".
- name: as printed. Keep both languages when two are printed (e.g. "Chicken Rice 鸡饭"). A name printed in capitals is written with normal capitals ("KOPI O" → "Kopi O").
- price: the price for one, as a number without the currency: S$4.50 → 4.5, RM12 → 12, Rp 38.000 or 38K → 38000. When a price is printed for a whole section ("All drinks $3.50", or a price beside the section title), use it for each item in that section. When no price is printed for an item or its section, null. Never guess a price.
- An item with a price for each size or kind ("Hot 1.80 / Iced 2.20", S / M / L): list it once, with the lowest price as price and one option group (e.g. "Size", "Hot or iced") whose choices have their extra over the lowest (Hot 0, Iced 0.4). Add-ons with their own price ("Add egg +1.00") are a group with addon true.
- description: words printed under or beside the item (what's in it, how many pieces, how spicy); otherwise "".
- photo: the box around this item's own picture on the menu: a food or drink photo that clearly belongs to this item (printed next to it or above it, or with its name or number). Only the picture, without its name or price. null when the item has no picture of its own. Never give two items the same picture, and never box decorations, logos or the background.

When there is nothing to list, sections is [] and nothing_found is:
- "not_a_menu": the photo isn't a menu or a price list.
- "too_blurry": it is a menu, but its words can't be read (blurred, too dark, glare, too far away).
- "cut_off": only part of the menu is in the photo, and no whole item can be read.
- "no_items": a menu with nothing a customer can order.
note: one short sentence for the shop owner about anything to check (e.g. "The drinks board had no prices"), or "".${asText ? `\n\n${TEXT_ANSWER}` : ''}`;
}

// An answer given as text: the object above, or v20's list of items (each with its category).
export function answerFromText(text: unknown) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']')) + 1));
    if (!Array.isArray(parsed)) return parsed && typeof parsed === 'object' ? parsed : null;
    const sections: { title: string; items: unknown[] }[] = [];
    for (const item of parsed) {
      const title = typeof item?.category === 'string' ? item.category : '';
      let section = sections.find((s) => s.title === title);
      if (!section) sections.push(section = { title, items: [] });
      section.items.push(item);
    }
    return { sections };
  } catch {
    return null;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);

export function cleanPrice(value: unknown): number | null {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /[0-9]/.test(value)) n = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? round2(n) : null;
}

export function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// Option groups in the product editor's format: { name, type: 'other' (pick one) or 'addon'
// (pick any), options: [{ label, price_modifier }] }, prices as numbers (checkout reads them
// as numbers: anything else would stop every order of the item).
export function cleanOptions(groups: unknown) {
  if (!Array.isArray(groups)) return [];
  return groups.slice(0, 6).map((group) => {
    const name = cleanText(group?.group, 40);
    const addon = group?.addon === true;
    const seen = new Set<string>();
    const options = (Array.isArray(group?.choices) ? group.choices : []).slice(0, 20)
      .map((choice) => ({ label: cleanText(choice?.label, 40), price_modifier: cleanPrice(choice?.extra) ?? 0 }))
      .filter((choice) => choice.label && !seen.has(choice.label.toLowerCase()) && seen.add(choice.label.toLowerCase()));
    if (!name || options.length < (addon ? 1 : 2)) return null;
    return { name, type: addon ? 'addon' : 'other', options };
  }).filter(Boolean);
}

// A picture's box in pixels of the photo as sent, or null (not four numbers, too small, or
// most of the photo: no item's picture is the whole menu).
export function cleanBox(box: unknown, width?: number | null, height?: number | null) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  let [x1, y1, x2, y2] = box.map((n) => Math.round(n));
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  if (width && height) {
    x1 = clamp(x1, 0, width); x2 = clamp(x2, 0, width);
    y1 = clamp(y1, 0, height); y2 = clamp(y2, 0, height);
    if ((x2 - x1) * (y2 - y1) > 0.6 * width * height) return null;
  }
  if (x2 - x1 < 24 || y2 - y1 < 24) return null;
  return [x1, y1, x2, y2];
}

// The AI's answer as items for the review screen.
export function menuItems(answer: any, width?: number | null, height?: number | null) {
  const items: any[] = [];
  const boxes = new Set<string>();
  for (const section of Array.isArray(answer?.sections) ? answer.sections : []) {
    const category = cleanText(section?.title, 60);
    for (const raw of Array.isArray(section?.items) ? section.items : []) {
      const name = cleanText(raw?.name, 120);
      if (!name || items.length >= MAX_ITEMS) continue;
      let photo = cleanBox(raw?.photo, width, height);
      if (photo) {
        const key = photo.join(',');
        if (boxes.has(key)) photo = null; // one picture, one item
        else boxes.add(key);
      }
      items.push({
        name,
        price: cleanPrice(raw?.price),
        description: cleanText(raw?.description, 500),
        category,
        variants: cleanOptions(raw?.options),
        photo,
      });
    }
  }
  return items;
}

// The reply starts at once and a space goes out every KEEPALIVE_MS until `work` gives the
// answer (JSON may start with spaces): see the top.
function streamedJson(work: Promise<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  let timer: number | undefined;
  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(' '));
      timer = setInterval(() => {
        try { controller.enqueue(encoder.encode(' ')); } catch { /* closed */ }
      }, KEEPALIVE_MS);
      let answer: Record<string, unknown>;
      try {
        answer = await work;
      } catch (error) {
        console.error('scanMenu error:', (error as Error)?.message);
        answer = { error: 'The AI menu scanner is unavailable right now. Please try again.', reason: 'unavailable' };
      }
      clearInterval(timer);
      try {
        controller.enqueue(encoder.encode(JSON.stringify(answer)));
        controller.close();
      } catch { /* the app has gone */ }
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function readMenu({ imageContent, currency, country, width, height, newApp }: {
  imageContent: Record<string, unknown>; currency: string; country: string | null; width: number | null; height: number | null; newApp: boolean;
}) {
  const started = Date.now();
  const ask = (asText: boolean) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(asText ? {} : { tools: [MENU_TOOL], tool_choice: { type: 'tool', name: MENU_TOOL.name } }),
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: menuPrompt({ currency, country, width, height, asText }) }] }],
    }),
    signal: AbortSignal.timeout(Math.max(5_000, started + AI_TIMEOUT_MS - Date.now())),
  });
  let res: Response;
  let aiData: any;
  let asText = false;
  try {
    res = await ask(false);
    aiData = await res.json().catch(() => null);
    // The fixed format refused (the request itself is wrong, not the photo): asked once
    // more for the answer as text, so a change on the AI service's side never stops scans.
    if (res.status === 400) {
      console.error('scanMenu v21: the fixed format was refused:', JSON.stringify(aiData?.error ?? aiData).slice(0, 300));
      asText = true;
      res = await ask(true);
      aiData = await res.json().catch(() => null);
    }
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError') {
      console.error(`scanMenu v21: no answer after ${Date.now() - started} ms`);
      return { error: 'This menu is taking too long to read. Please scan half of it at a time.', reason: 'too_long' };
    }
    throw error;
  }
  if (!res.ok) {
    console.error('scanMenu: AI service answered', res.status, JSON.stringify(aiData?.error ?? aiData).slice(0, 300));
    return { error: 'The AI menu scanner is unavailable right now. Please try again.', reason: 'unavailable' };
  }
  const blocks = Array.isArray(aiData?.content) ? aiData.content : [];
  const answer = blocks.find((block: any) => block?.type === 'tool_use' && block?.name === MENU_TOOL.name)?.input
    ?? answerFromText(blocks.filter((block: any) => block?.type === 'text').map((block: any) => block.text ?? '').join(''));
  const items = menuItems(answer, width, height);
  const cutShort = aiData?.stop_reason === 'max_tokens';
  const reason = items.length ? null
    : cutShort ? 'too_long'
    : REASONS.includes(answer?.nothing_found) ? answer.nothing_found : 'no_items';
  const priced = items.filter((item) => item.price != null && item.price > 0);
  console.log(`scanMenu v21: ${items.length} items (${priced.length} with a price, ${items.filter((i) => i.photo).length} with a picture), `
    + `tokens ${aiData?.usage?.input_tokens ?? 0}+${aiData?.usage?.output_tokens ?? 0}, stop ${aiData?.stop_reason}, ${Date.now() - started} ms${asText ? ', as text' : ''}`);
  if (!items.length) {
    console.log('scanMenu v21: nothing found:', reason, '| note:', cleanText(answer?.note, 200), '| answer:', JSON.stringify(answer ?? aiData?.content ?? null).slice(0, 600));
  }
  if (!newApp) {
    // An app from before v21 saves an item without a price at $0: it gets only priced items.
    return { items: priced, count: priced.length };
  }
  return {
    items,
    count: items.length,
    ...(reason ? { reason } : {}),
    ...(cutShort && items.length ? { partial: true } : {}),
    imageWidth: width,
    imageHeight: height,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64, imageUrl, mediaType, tenantId, imageWidth, imageHeight, version } = await req.json();

    if (!tenantId) return new Response(JSON.stringify({ error: 'tenantId required' }), { status: 400, headers: corsHeaders });
    if (!imageBase64 && !imageUrl) return new Response(JSON.stringify({ error: 'imageBase64 or imageUrl required' }), { status: 400, headers: corsHeaders });

    const email = await callerEmail(req);
    if (!email) return json({ error: 'Please sign in again.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: storeId, error: authError } = await supabase.rpc('ai_authorized_store', {
      p_email: email, p_tenant_id: String(tenantId), p_permissions: ['products.create'],
    });
    if (authError) throw authError;
    if (!storeId) return json({ error: 'You do not have access to menu scanning for this store.' }, 403);

    const { data: scanAllowed, error: planError } = await supabase.rpc('ai_plan_allows', {
      p_tenant_id: storeId, p_key: 'can_scan_menu',
    });
    if (planError) throw planError;
    if (scanAllowed !== true) {
      return json({ error: "Menu scan isn't included in this shop's plan. Add items one at a time instead." }, 403);
    }

    if (typeof imageBase64 === 'string' && imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return json({ error: 'This photo is too large. Please use one under 5 MB.' }, 413);
    }
    if (!imageBase64 && !/^https:\/\//i.test(String(imageUrl))) {
      return json({ error: 'imageUrl must start with https://' }, 400);
    }

    const { data: withinQuota, error: quotaError } = await supabase.rpc('ai_quota_take', {
      p_feature: 'scanMenu', p_scope: `store:${storeId}`, p_window_seconds: 86400, p_limit: SCANS_PER_STORE_PER_DAY,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) {
      return json({ error: `This store has used today's ${SCANS_PER_STORE_PER_DAY} menu scans. Please try again tomorrow.` }, 429);
    }

    const { data: tenant } = await supabase.from('tenants').select('currency, country').eq('id', tenantId).single();
    const currency = tenant?.currency || 'SGD';
    const country = tenant?.country || null;
    const size = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 && (n as number) <= 10_000 ? (n as number) : null);
    const width = size(imageWidth);
    const height = width ? size(imageHeight) : null;

    const imageContent = imageBase64
      ? { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } }
      : { type: 'image', source: { type: 'url', url: imageUrl } };

    return streamedJson(readMenu({
      imageContent, currency, country,
      width: imageBase64 ? width : null, height: imageBase64 && width ? height : null,
      newApp: Number(version) >= 2,
    }));
  } catch (error) {
    console.error('scanMenu error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
