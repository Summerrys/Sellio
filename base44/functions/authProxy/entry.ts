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
    const { action, phone, password, full_name, email } = await req.json();

    if (!action) {
      return Response.json(
        { error: 'Action required (login or signup)' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    );

    if (action === 'login') {
      if (!phone || !password) {
        return Response.json(
          { error: 'Phone and password required' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const { data: users, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('phone', phone.trim());

      if (error) throw error;

      if (!users || users.length === 0) {
        return Response.json(
          { error: 'Invalid credentials' },
          { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const user = users[0];

      if (user.is_active === false) {
        return Response.json(
          { error: 'Account is inactive' },
          { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
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

      // Re-fetch to get the most up-to-date row
      const { data: refreshed } = await supabase.from('app_users').select('*').eq('id', user.id).single();
      const finalUser = refreshed || user;

      return Response.json(
        {
          success: true,
          user: {
            id: finalUser.id,
            email: finalUser.email,
            full_name: finalUser.full_name,
            phone: finalUser.phone,
            role: finalUser.role,
            onboarding_completed: finalUser.onboarding_completed,
            tenant_id: finalUser.tenant_id || null,
            created_date: finalUser.created_date,
            last_login_at: sgNow(),
          },
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
        }
      );
    } else if (action === 'signup') {
      if (!phone || !password || !full_name) {
        return Response.json(
          { error: 'Name, phone and password are required' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

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

      const password_hash = await bcrypt.hash(password, 10);

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
          },
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
        }
      );
    } else {
      return Response.json(
        { error: 'Invalid action' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
  } catch (error) {
    console.error('Auth error:', error);
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