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
    const { tenant_id, color_set_name, primary_color, accent_color } = await req.json();
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    // Upsert theme config
    const { data, error } = await supabase
      .from('theme_configs')
      .upsert({
        tenant_id,
        color_set_name: color_set_name || 'Custom',
        primary_color: primary_color || '#0369A1',
        accent_color: accent_color || '#E0F2FE',
      }, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) throw error;

    return Response.json({ theme: data }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});