import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 2048;
const DAILY_ANALYSES = 40;
const ONBOARDING_BYPASS_EMAILS = ['alvin.leeyq@gmail.com', 'alvin_y_q_lee@ite.edu.sg'];
const json = (body, status = 200) => Response.json(body, { status, headers: corsHeaders });

function parseImage(raw) {
  if (typeof raw !== 'string' || !raw) return { error: 'Choose a product photo.', status: 400 };
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/);
  const mimeType = match?.[1] || 'image/jpeg';
  const data = (match?.[2] || raw).replace(/[\r\n]/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    return { error: 'Use a JPEG, PNG, WebP or GIF photo.', status: 400 };
  }
  if (data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return { error: 'Use a photo under 5 MB.', status: 413 };
  let binary;
  try { binary = atob(data); } catch { return { error: 'The photo could not be read.', status: 400 }; }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) return { error: 'Use a photo under 5 MB.', status: 413 };
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const webp = binary.slice(0,4) === 'RIFF' && binary.slice(8,12) === 'WEBP';
  const gif = ['GIF87a','GIF89a'].includes(binary.slice(0,6));
  if (!({ 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp, 'image/gif': gif })[mimeType]) {
    return { error: 'Use a JPEG, PNG, WebP or GIF photo.', status: 400 };
  }
  return { bytes, mimeType, extension: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: 'Please sign in again.' }, 401);

  let supabase;
  let tempPath;
  try {
    supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // A profile cookie, public API key, or caller-supplied email is never identity.
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user?.email || (user.banned_until && Date.parse(user.banned_until) > Date.now())) {
      return json({ error: 'Please sign in again.' }, 401);
    }
    const email = user.email.toLowerCase();
    const { data: profile, error: profileError } = await supabase.from('app_users')
      .select('is_active, onboarding_completed, tenant_id').in('email', [...new Set([user.email, email])]).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.is_active !== true) return json({ error: 'Your account cannot use product analysis.' }, 403);

    if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY_CHARS) return json({ error: 'Use a photo under 5 MB.' }, 413);
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return json({ error: 'Use a photo under 5 MB.' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
    const tenantId = body.tenantId;
    if (tenantId != null && (typeof tenantId !== 'string' || !tenantId || tenantId.length > 200)) return json({ error: 'Invalid store' }, 400);

    const { data: storeId, error: storeError } = await supabase.rpc('ai_authorized_store', {
      p_email: email, p_tenant_id: tenantId || null, p_permissions: ['products.create', 'products.edit'],
    });
    if (storeError) throw storeError;
    let scope;
    if (storeId) {
      scope = 'store:' + storeId;
    } else {
      // Supplying another store's ID must never fall back to onboarding access.
      if (tenantId || profile.onboarding_completed || profile.tenant_id) return json({ error: 'You do not have access to product analysis for this store.' }, 403);
      const { data: invite, error: inviteError } = await supabase.from('merchant_invites')
        .select('status, stripe_subscription_id').in('email', [...new Set([user.email, email])])
        .order('created_date', { ascending: false }).limit(1).maybeSingle();
      if (inviteError) throw inviteError;
      const eligible = ONBOARDING_BYPASS_EMAILS.includes(email) ||
        (!!invite?.stripe_subscription_id && ['pending', 'registered'].includes(invite.status));
      if (!eligible) return json({ error: 'Choose a business plan before using product analysis.' }, 403);
      scope = 'onboarding:' + user.id;
    }

    const image = parseImage(body.imageBase64 || body.image_data);
    if (image.error) return json({ error: image.error }, image.status);
    const { data: withinQuota, error: quotaError } = await supabase.rpc('ai_quota_take', {
      p_feature: 'analyzeProductImage', p_scope: scope, p_window_seconds: 86400, p_limit: DAILY_ANALYSES,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) return json({ error: "Today's product photo analysis limit has been reached. Try again tomorrow." }, 429);

    tempPath = 'temp/ai-analysis/' + user.id + '/' + crypto.randomUUID() + '.' + image.extension;
    const { error: uploadError } = await supabase.storage.from('product-images')
      .upload(tempPath, image.bytes, { contentType: image.mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(tempPath);
    const base44 = createClientFromRequest(req);
    // Supabase verified the caller above; use the backend integration credentials.
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a product catalog assistant for a point-of-sale system.
Analyze this product/menu item image and extract structured information.
Return a JSON object with:
- name: concise product name (string, max 60 chars)
- description: compelling product description (string, max 150 chars)
- category: best category name (string, max 30 chars)
- tags: array of 3-5 lowercase strings
- price: a realistic estimated price as a number in SGD
- confidence: confidence this is a product image (number 0-1)
If this is not a product image, set confidence below 0.3 and return generic defaults.`,
      file_urls: [urlData.publicUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }, price: { type: 'number' }, confidence: { type: 'number' },
        },
      },
    });
    return json({ success: true, name: result.name, price: result.price, category: result.category,
      description: result.description, tags: result.tags, confidence: result.confidence });
  } catch (error) {
    console.error('Product photo analysis failed:', error?.message);
    return json({ error: 'Product analysis is unavailable. Please try again later.' }, 500);
  } finally {
    if (supabase && tempPath) {
      try {
        const { error } = await supabase.storage.from('product-images').remove([tempPath]);
        if (error) console.warn('Product analysis temporary file cleanup failed');
      } catch { console.warn('Product analysis temporary file cleanup failed'); }
    }
  }
});
