import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // Accept both imageBase64 (new) and image_data (legacy)
    const rawBase64 = body.imageBase64 || body.image_data || '';
    const mimeType = body.image_mime_type || 'image/jpeg';
    const currency = body.currency || 'SGD';
    const businessType = body.business_type || '';

    if (!rawBase64) {
      return Response.json({ error: 'imageBase64 is required' }, { status: 400, headers: corsHeaders });
    }

    // Strip data URL prefix if present
    const base64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const base44 = createClientFromRequest(req);

    const businessContext = businessType
      ? `The merchant runs a ${businessType} business.`
      : 'The merchant may run a restaurant, café, retail shop, or service business.';

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a product catalog assistant for a point-of-sale system.
${businessContext}

Analyze this product/menu item image and extract structured information.

Return a JSON object with:
- name: concise product name (string, max 60 chars)
- description: appetizing/compelling product description (string, 1-2 sentences, max 150 chars)
- category: best category name for this item (string, max 30 chars, e.g. "Beverages", "Mains", "Desserts", "Clothing", "Electronics")
- tags: array of 3-5 relevant tags (strings, lowercase)
- price: a realistic estimated price as a number in ${currency} (number, no currency symbol)
- confidence: how confident you are this is a product image (number 0-1)

If this is not a product image, set confidence below 0.3 and return generic defaults.
Be concise and practical — merchants will use this to fill their catalog quickly.`,
      file_urls: [`data:${mimeType};base64,${base64}`],
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

    return Response.json(
      { success: true, name: result.name, price: result.price, category: result.category, description: result.description, tags: result.tags, confidence: result.confidence },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});