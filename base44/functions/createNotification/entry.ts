import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const {
      tenant_id,
      user_email,
      type,
      title,
      message,
      data = {},
      link = null,
      priority = 'normal'
    } = payload;

    // Validate required fields
    if (!type || !title || !message) {
      return Response.json(
        { error: 'Missing required fields: type, title, message' },
        { status: 400 }
      );
    }

    // Create notification
    const notification = await base44.asServiceRole.entities.Notification.create({
      tenant_id,
      user_email,
      type,
      title,
      message,
      data,
      link,
      priority,
      is_read: false,
    });

    return Response.json({ success: true, notification });
  } catch (error) {
    console.error('Create notification error:', error);
    return Response.json(
      { error: error.message || 'Failed to create notification' },
      { status: 500 }
    );
  }
});