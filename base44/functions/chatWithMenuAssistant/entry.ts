import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, products, tenant } = await req.json();

    if (!message) {
      return Response.json({ error: 'Message required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 500 });
    }

    const menuData = products.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category?.name || (p.category_id ? `Category ${p.category_id}` : 'Uncategorized'),
      is_featured: p.is_featured || false,
      in_stock: !p.track_inventory || p.stock_quantity > 0,
      compare_at_price: p.compare_at_price || null,
    }));

    const messages = [
      ...(conversationHistory || []),
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a friendly menu assistant for ${tenant?.name || 'our restaurant'}, a ${tenant?.industry || 'food and beverage'} business.

Here is the current menu:
${JSON.stringify(menuData, null, 2)}

Rules:
- Recommend only products from the menu above
- Keep responses concise (2-3 sentences max)
- If recommending products, end your response with a JSON block:
  <products>["product_id_1","product_id_2"]</products>
- Only recommend in-stock items (in_stock: true)
- Featured items (is_featured: true) are today's highlights
- Items with compare_at_price are on sale
- Be warm, friendly and conversational
- If asked something unrelated to the menu, politely redirect`,
        messages: messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return Response.json({ error: data.error?.message || 'API error' }, { status: response.status });
    }

    const text = data.content?.[0]?.text || '';
    const productMatch = text.match(/<products>(.*?)<\/products>/s);
    let recommendedProductIds = [];
    
    if (productMatch) {
      try {
        recommendedProductIds = JSON.parse(productMatch[1]);
      } catch (e) {
        // If parsing fails, just ignore product recommendations
      }
    }

    const cleanText = text.replace(/<products>.*?<\/products>/s, '').trim();
    const recommendedProducts = recommendedProductIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);

    return Response.json({
      text: cleanText,
      recommendedProducts,
      newMessage: {
        role: 'assistant',
        content: cleanText
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});