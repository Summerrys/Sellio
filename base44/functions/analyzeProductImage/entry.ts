import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { image_data, image_mime_type, tenant_id, currency = 'SGD', business_type } = await req.json();
    if (!image_data) {
      return Response.json({ error: 'image_data is required' }, { status: 400, headers: corsHeaders });
    }

    // Upload to Supabase using service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ext = image_mime_type?.split('/')[1] || 'jpg';
    const folder = tenant_id ? `${tenant_id}/ai-temp` : 'ai-temp';
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Decode base64 to bytes
    const base64 = image_data.includes(',') ? image_data.split(',')[1] : image_data;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, bytes, { contentType: image_mime_type || 'image/jpeg', upsert: true });

    if (uploadError) {
      return Response.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500, headers: corsHeaders });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    const image_url = publicUrl;

    const businessContext = business_type
      ? `The merchant runs a ${business_type} business.`
      : 'The merchant may run a restaurant, café, retail shop, or service business.';

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a product catalog assistant for a point-of-sale system.
${businessContext}

Analyze this product/menu item image and extract structured information.

Return a JSON object with:
- name: concise product name (string, max 60 chars)
- description: appetizing/compelling product description (string, 1-2 sentences, max 150 chars)
- suggested_category: best category name for this item (string, max 30 chars, e.g. "Beverages", "Mains", "Desserts", "Clothing", "Electronics")
- suggested_tags: array of 3-5 relevant tags (strings, lowercase)
- estimated_price: a realistic estimated price as a number in ${currency} (number, no currency symbol)
- confidence: how confident you are this is a product image (number 0-1)

If this is not a product image, set confidence below 0.3 and return generic defaults.
Be concise and practical — merchants will use this to fill their catalog quickly.`,
      file_urls: [image_url],
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          suggested_category: { type: 'string' },
          suggested_tags: { type: 'array', items: { type: 'string' } },
          estimated_price: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    });

    return Response.json({ success: true, product: result, image_url: publicUrl }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});