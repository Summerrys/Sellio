import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import bcrypt from 'npm:bcryptjs@2.4.3';

Deno.serve(async (req) => {
  try {
    const { email, password, full_name } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const base44 = createClientFromRequest(req);

    // Check if user exists
    const existingUsers = await base44.asServiceRole.entities.AppUser.filter({ email: normalizedEmail });
    if (existingUsers.length > 0) {
      return Response.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await base44.asServiceRole.entities.AppUser.create({
      email: normalizedEmail,
      password_hash,
      full_name: full_name || normalizedEmail.split('@')[0],
      role: 'admin'
    });

    return Response.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});