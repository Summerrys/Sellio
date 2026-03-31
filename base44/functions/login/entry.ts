import bcrypt from 'npm:bcryptjs@2.4.3';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { phone, password } = await req.json();

    if (!phone || !password) {
      return Response.json({ error: 'Phone and password required' }, { status: 400 });
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
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = users[0];

    if (user.is_active === false) {
      return Response.json({ error: 'Account is inactive' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        onboarding_completed: user.onboarding_completed,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});