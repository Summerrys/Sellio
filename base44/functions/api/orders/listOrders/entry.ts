import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { paginated, error } from '../../lib/apiResponse.js';
import { authenticate } from '../../lib/apiAuth.js';

/**
 * GET /api/v1/orders
 * List orders with filtering
 */
Deno.serve(async (req) => {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    
    const { base44, tenant } = auth;
    const url = new URL(req.url);
    
    // Parse filters
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    // Build filter
    const filter = { tenant_id: tenant.id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    // Fetch orders
    let orders = await base44.entities.Order.filter(filter, '-created_date', limit + 1);

    // Date range filter (client-side)
    if (from || to) {
      orders = orders.filter(order => {
        const orderDate = new Date(order.created_date);
        if (from && orderDate < new Date(from)) return false;
        if (to && orderDate > new Date(to)) return false;
        return true;
      });
    }

    // Pagination
    const hasMore = orders.length > limit;
    if (hasMore) orders = orders.slice(0, limit);

    return paginated(orders, {
      limit,
      cursor: hasMore ? orders[orders.length - 1]?.id : null,
      hasMore,
    });
  } catch (err) {
    console.error('List orders error:', err);
    return error(err.message || 'Failed to fetch orders');
  }
});