import bcrypt from 'npm:bcryptjs@2.4.3';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sgNow = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '').replace('T', ' ').substring(0, 23);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const { phone, password, full_name, email } = await req.json();

    if (!phone || !password || !full_name) {
      return Response.json(
        { error: 'Name, phone and password are required' },
        {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    );

    // Check if phone already exists
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('phone', phone.trim());

    if (existing && existing.length > 0) {
      return Response.json(
        { error: 'Phone number already registered' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Check if email is already used (phone/password or social login)
    if (email) {
      const { data: emailExists } = await supabase
        .from('app_users')
        .select('id, auth_provider')
        .eq('email', email.toLowerCase().trim())
        .limit(1);
      if (emailExists && emailExists.length > 0) {
        const provider = emailExists[0].auth_provider || 'email';
        const msg = provider === 'google'
          ? 'This email is already registered via Google. Please sign in with Google.'
          : 'This email is already registered. Please log in instead.';
        return Response.json({ error: msg }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user — new sign-ups are 'admin' role (tenant owners)
    const { data: newUser, error } = await supabase
      .from('app_users')
      .insert({
        phone: phone.trim(),
        email: email ? email.toLowerCase().trim() : null,
        full_name: full_name.trim(),
        password_hash,
        role: 'admin',
        is_active: true,
        onboarding_completed: false,
        auth_provider: 'phone',
        created_date: sgNow(),
        last_login_at: sgNow(),
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json(
      {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          full_name: newUser.full_name,
          phone: newUser.phone,
          role: newUser.role,
          onboarding_completed: newUser.onboarding_completed,
          created_date: newUser.created_date,
          last_login_at: newUser.last_login_at,
        }
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    );
  }
});