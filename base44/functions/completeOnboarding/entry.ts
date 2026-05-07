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
    const { user_id, tenant_id } = await req.json();
    if (!user_id || !tenant_id) {
      return Response.json({ error: 'user_id and tenant_id are required' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase
      .from('app_users')
      .update({ onboarding_completed: true, tenant_id })
      .eq('id', user_id)
      .select()
      .single();

    if (error) throw error;

    return Response.json({ success: true, user: data }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});