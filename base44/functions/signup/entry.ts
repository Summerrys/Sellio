import bcrypt from 'npm:bcryptjs@2.4.3';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { phone, password, full_name, email } = await req.json();

    if (!phone || !password || !full_name) {
      return Response.json({ error: 'Name, phone and password are required' }, { status: 400 });
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
      return Response.json({ error: 'Phone number already registered' }, { status: 400 });
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
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone: newUser.phone,
        role: newUser.role,
        onboarding_completed: newUser.onboarding_completed,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});