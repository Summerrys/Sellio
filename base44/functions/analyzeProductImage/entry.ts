import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    const { image_url, currency = 'SGD', business_type } = await req.json();
    if (!image_url) {
      return Response.json({ error: 'image_url is required' }, { status: 400, headers: corsHeaders });
    }

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

    return Response.json({ success: true, product: result }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});