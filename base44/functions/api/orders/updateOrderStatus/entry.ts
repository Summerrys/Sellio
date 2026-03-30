import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error, notFound, validationError } from '../../lib/apiResponse.js';
import { authenticate } from '../../lib/apiAuth.js';

/**
 * PATCH /api/v1/orders/:id/status
 * Update order status
 */
Deno.serve(async (req) => {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    
    const { base44, tenant, user } = auth;
    const url = new URL(req.url);
    const orderId = url.searchParams.get('id');
    
    if (!orderId) {
      return validationError('Order ID is required');
    }

    const body = await req.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return validationError('Invalid status', [
        { field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}` }
      ]);
    }

    // Fetch order
    const orders = await base44.entities.Order.filter({ id: orderId, tenant_id: tenant.id });
    const order = orders[0];
    
    if (!order) {
      return notFound('Order not found');
    }

    // Update order
    const updatedOrder = await base44.entities.Order.update(orderId, {
      status,
      served_by: status === 'served' ? user.email : order.served_by,
    });

    // Create notification for status change
    if (order.status !== status && (status === 'ready' || status === 'completed')) {
      await base44.asServiceRole.functions.invoke('createNotification', {
        tenant_id: tenant.id,
        type: 'order_status_changed',
        title: `Order ${order.order_number} ${status}`,
        message: `Order status updated to ${status}`,
        data: { order_id: orderId, order_number: order.order_number },
        link: `/orders?id=${orderId}`,
        priority: 'normal',
      });
    }

    return success(updatedOrder);
  } catch (err) {
    console.error('Update order status error:', err);
    return error(err.message || 'Failed to update order status');
  }
});