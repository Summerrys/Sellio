import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error, notFound } from '../../lib/apiResponse.js';

/**
 * GET /api/v1/public/:tenantSlug/menu
 * Public endpoint - get menu for customer ordering
 * No authentication required
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get('tenantSlug');
    const categoryId = url.searchParams.get('categoryId');

    if (!tenantSlug) {
      return error('Tenant slug is required', 'INVALID_REQUEST', 400);
    }

    // Find tenant by slug
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ slug: tenantSlug });
    const tenant = tenants[0];
    
    if (!tenant || tenant.status !== 'active') {
      return notFound('Restaurant not found or inactive');
    }

    // Get categories
    const categories = await base44.asServiceRole.entities.Category.filter(
      { tenant_id: tenant.id, is_active: true },
      'sort_order'
    );

    // Get products
    const productFilter = { 
      tenant_id: tenant.id, 
      is_active: true 
    };
    if (categoryId) {
      productFilter.category_id = categoryId;
    }

    const products = await base44.asServiceRole.entities.Product.filter(
      productFilter,
      'name'
    );

    // Group products by category
    const menu = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        logo_url: tenant.logo_url,
        currency: tenant.currency,
      },
      categories: categories.map(cat => ({
        ...cat,
        products: products.filter(p => p.category_id === cat.id),
      })),
    };

    return success(menu);
  } catch (err) {
    console.error('Get menu error:', err);
    return error(err.message || 'Failed to fetch menu');
  }
});