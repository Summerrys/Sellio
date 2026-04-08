import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    // Return public config (anon key is safe to expose to frontend)
    return Response.json({ supabaseUrl, supabaseAnonKey, googleClientId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});