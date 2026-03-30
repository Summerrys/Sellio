import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { userId, is_active } = await req.json();

    if (!userId || typeof is_active !== 'boolean') {
      return Response.json({ error: 'User ID and status required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const updatedUser = await base44.asServiceRole.entities.AppUser.update(userId, { is_active });

    return Response.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        is_active: updatedUser.is_active
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});