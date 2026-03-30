import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error, validationError } from '../../lib/apiResponse.js';
import { authenticate, requirePermission } from '../../lib/apiAuth.js';

/**
 * POST /api/v1/products
 * Create a new product
 */
Deno.serve(async (req) => {
  try {
    // Authenticate
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    
    const { base44, tenant, tenantUser } = auth;

    // Check permission
    const permError = await requirePermission(base44, tenantUser, 'products.create');
    if (permError) return permError;

    // Parse request body
    const body = await req.json();
    const { name, description, price, category_id, sku, stock_quantity, variants } = body;

    // Validation
    const errors = [];
    if (!name) errors.push({ field: 'name', message: 'Name is required' });
    if (!price || price < 0) errors.push({ field: 'price', message: 'Valid price is required' });
    
    if (errors.length > 0) {
      return validationError('Validation failed', errors);
    }

    // Create product
    const product = await base44.entities.Product.create({
      tenant_id: tenant.id,
      name,
      description,
      price,
      category_id,
      sku,
      stock_quantity: stock_quantity || 0,
      variants: variants || [],
      is_active: true,
    });

    return success(product);
  } catch (err) {
    console.error('Create product error:', err);
    return error(err.message || 'Failed to create product');
  }
});