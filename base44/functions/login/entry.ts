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
    const { phone, password } = await req.json();

    if (!phone || !password) {
      return Response.json(
        { error: 'Phone and password required' },
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

    const { data: users, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('phone', phone.trim());

    if (error) throw error;

    if (!users || users.length === 0) {
      return Response.json(
        { error: 'Invalid credentials' },
        {
          status: 401,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const user = users[0];

    if (user.is_active === false) {
      return Response.json(
        { error: 'Account is inactive' },
        {
          status: 401,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Track last login
    await supabase.from('app_users').update({ last_login_at: sgNow() }).eq('id', user.id);

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          onboarding_completed: user.onboarding_completed,
          created_date: user.created_date,
          last_login_at: sgNow(),
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