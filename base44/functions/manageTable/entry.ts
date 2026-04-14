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
    const { action, tenant_id, table_id, table_data } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabase = createClient(supabaseUrl, anonKey);

    if (action === 'create') {
      const { data, error } = await supabase
        .from('tables')
        .insert({ ...table_data, tenant_id })
        .select()
        .single();
      if (error) throw error;
      return Response.json({ table: data }, { headers: corsHeaders });
    }

    if (action === 'update') {
      const { data, error } = await supabase
        .from('tables')
        .update(table_data)
        .eq('id', table_id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();
      if (error) throw error;
      return Response.json({ table: data }, { headers: corsHeaders });
    }

    if (action === 'delete') {
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', table_id)
        .eq('tenant_id', tenant_id);
      if (error) throw error;
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});