import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import bcrypt from 'npm:bcryptjs@2.4.3';

Deno.serve(async (req) => {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Find user
    const users = await base44.asServiceRole.entities.AppUser.filter({ email });
    if (users.length === 0) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = users[0];

    // Check if active
    if (!user.is_active) {
      return Response.json({ error: 'Account is inactive' }, { status: 401 });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Return user data (without password_hash)
    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});