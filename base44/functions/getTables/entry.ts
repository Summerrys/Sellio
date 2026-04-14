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
    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabase = createClient(supabaseUrl, anonKey);

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return Response.json({ tables: data || [] }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});