import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error, paginated } from '../../lib/apiResponse.js';
import { authenticate } from '../../lib/apiAuth.js';

/**
 * GET /api/v1/products
 * List products with filtering and pagination
 */
Deno.serve(async (req) => {
  try {
    // Authenticate
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    
    const { base44, tenant } = auth;
    const url = new URL(req.url);
    
    // Parse query params
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const sort = url.searchParams.get('sort') || '-created_date';

    // Build filter
    const filter = { tenant_id: tenant.id };
    if (category) filter.category_id = category;
    if (status === 'active') filter.is_active = true;
    if (status === 'inactive') filter.is_active = false;

    // Fetch products
    let products = await base44.entities.Product.filter(filter, sort, limit + 1);

    // Apply search filter (client-side as Base44 doesn't support text search)
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p => 
        p.name?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const hasMore = products.length > limit;
    if (hasMore) products = products.slice(0, limit);

    return paginated(products, {
      limit,
      cursor: hasMore ? products[products.length - 1]?.id : null,
      hasMore,
    });
  } catch (err) {
    console.error('List products error:', err);
    return error(err.message || 'Failed to fetch products');
  }
});