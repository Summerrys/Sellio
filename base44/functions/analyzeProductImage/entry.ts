import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const rawBase64 = body.imageBase64 || body.image_data || '';
    if (!rawBase64) {
      return Response.json({ error: 'imageBase64 is required' }, { status: 400, headers: corsHeaders });
    }

    // Strip data URL prefix if present, detect mime type
    let mimeType = 'image/jpeg';
    let base64Data = rawBase64;
    if (rawBase64.includes(',')) {
      const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = rawBase64.split(',')[1];
      }
    }

    // Convert base64 to binary
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Upload to Supabase storage to get a real URL
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );
    const ext = mimeType.split('/')[1] || 'jpg';
    const tempPath = `temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(tempPath, bytes, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return Response.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500, headers: corsHeaders });
    }

    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(tempPath);

    // Now call InvokeLLM with a real URL
    const base44 = createClientFromRequest(req);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a product catalog assistant for a point-of-sale system.

Analyze this product/menu item image and extract structured information.

Return a JSON object with:
- name: concise product name (string, max 60 chars)
- description: appetizing/compelling product description (string, 1-2 sentences, max 150 chars)
- category: best category name for this item (string, max 30 chars, e.g. "Beverages", "Mains", "Desserts", "Clothing", "Electronics")
- tags: array of 3-5 relevant tags (strings, lowercase)
- price: a realistic estimated price as a number in SGD (number, no currency symbol)
- confidence: how confident you are this is a product image (number 0-1)

If this is not a product image, set confidence below 0.3 and return generic defaults.
Be concise and practical — merchants will use this to fill their catalog quickly.`,
      file_urls: [publicUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          price: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    });

    // Clean up the temp file immediately after getting the result
    await supabase.storage.from('product-images').remove([tempPath]).catch(() => {});

    return Response.json(
      { success: true, name: result.name, price: result.price, category: result.category, description: result.description, tags: result.tags, confidence: result.confidence },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});