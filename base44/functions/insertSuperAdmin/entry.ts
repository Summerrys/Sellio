import bcrypt from 'npm:bcryptjs@2.4.3';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { phone, password, full_name } = await req.json();

    if (!phone || !password) {
      return Response.json({ error: 'Phone and password required' }, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    );

    // Check if phone already exists
    const { data: existingUsers } = await supabase
      .from('app_users')
      .select('id')
      .eq('phone', phone.trim());

    if (existingUsers && existingUsers.length > 0) {
      return Response.json({ error: 'Phone number already exists' }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert superadmin
    const { data: newUser, error } = await supabase
      .from('app_users')
      .insert({
        phone: phone.trim(),
        password_hash: passwordHash,
        full_name: full_name || 'SuperAdmin',
        email: `superadmin-${Date.now()}@system.local`,
        role: 'superadmin',
        is_active: true,
        onboarding_completed: true,
      })
      .select();

    if (error) throw error;

    return Response.json({
      success: true,
      message: 'SuperAdmin account created successfully',
      user: {
        id: newUser[0].id,
        phone: newUser[0].phone,
        role: newUser[0].role,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});