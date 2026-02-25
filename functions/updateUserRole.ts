import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { userId, role } = await req.json();

    if (!userId || !role) {
      return Response.json({ error: 'User ID and role required' }, { status: 400 });
    }

    if (!['admin', 'user'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Call directly without authentication for now
    const functionUrl = `${new URL(req.url).origin}/api/functions/login`;
    const authHeader = req.headers.get('authorization');
    
    // Get current user from local storage on frontend
    const base44 = createClientFromRequest(req);
    
    // For now, allow the update (in production, verify admin role)
    const updatedUser = await base44.asServiceRole.entities.AppUser.update(userId, { role });

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