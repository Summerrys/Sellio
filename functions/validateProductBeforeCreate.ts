import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Validate Product Before Create/Update
 * 
 * Enforces application-level constraints:
 * - SKU must be unique within tenant
 * - Category must exist if provided
 * - Price must be positive
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenant_id, sku, category_id, price, product_id } = await req.json();

    const validationErrors = [];

    // Check SKU uniqueness within tenant
    if (sku) {
      const existing = await base44.entities.Product.filter({ tenant_id, sku });
      const duplicate = existing.find(p => p.id !== product_id);
      
      if (duplicate) {
        validationErrors.push({
          field: 'sku',
          message: `SKU "${sku}" already exists in this tenant`,
          code: 'DUPLICATE_SKU'
        });
      }
    }

    // Validate category exists
    if (category_id) {
      const categories = await base44.entities.Category.filter({ tenant_id, id: category_id });
      if (categories.length === 0) {
        validationErrors.push({
          field: 'category_id',
          message: 'Category not found',
          code: 'INVALID_CATEGORY'
        });
      }
    }

    // Validate price
    if (price !== undefined && (price < 0 || isNaN(price))) {
      validationErrors.push({
        field: 'price',
        message: 'Price must be a positive number',
        code: 'INVALID_PRICE'
      });
    }

    if (validationErrors.length > 0) {
      return Response.json({
        valid: false,
        errors: validationErrors
      }, { status: 400 });
    }

    return Response.json({
      valid: true,
      message: 'Product validation passed'
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});