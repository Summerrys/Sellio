import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const { messages, systemPrompt } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let orderAction = null;
    const match = text.match(/<order_action>([\s\S]*?)<\/order_action>/);
    if (match) {
      try { orderAction = JSON.parse(match[1].trim()); } catch {}
    }
    const cleanText = text.replace(/<order_action>[\s\S]*?<\/order_action>/, '').trim();

    return Response.json({ message: cleanText, orderAction });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});