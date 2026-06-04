import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error, validationError, notFound } from '../../lib/apiResponse.js';

/**
 * POST /api/v1/public/:tenantSlug/orders
 * Public endpoint - place order (customer ordering)
 * No authentication required
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get('tenantSlug');

    if (!tenantSlug) {
      return error('Tenant slug is required', 'INVALID_REQUEST', 400);
    }

    // Find tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ slug: tenantSlug });
    const tenant = tenants[0];
    
    if (!tenant || tenant.status !== 'active') {
      return notFound('Restaurant not found or inactive');
    }

    // Parse order data
    const body = await req.json();
    const { items, table_id, customer_name, notes, type = 'dine_in' } = body;

    // Validation
    const errors = [];
    if (!items || !Array.isArray(items) || items.length === 0) {
      errors.push({ field: 'items', message: 'At least one item is required' });
    }
    if (type === 'dine_in' && !table_id) {
      errors.push({ field: 'table_id', message: 'Table is required for dine-in orders' });
    }
    
    if (errors.length > 0) {
      return validationError('Validation failed', errors);
    }

    // Get table info
    let tableName = null;
    if (table_id) {
      const tables = await base44.asServiceRole.entities.TableEntity.filter({ id: table_id });
      tableName = tables[0]?.name;
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    
    // Get tax config
    const taxConfigs = await base44.asServiceRole.entities.TaxConfig.filter({
      tenant_id: tenant.id,
      is_active: true,
    });
    const taxRate = taxConfigs[0]?.rate || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount;

    // Generate order number using tenant sequence
    let orderNumber;
    try {
      const supabase = await (await import('npm:@supabase/supabase-js@2')).createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      );
      const { data: seqNum } = await supabase.rpc('get_next_order_number', { p_tenant_id: tenant.id });
      const prefix = tenant.order_id_prefix || 'ORD';
      orderNumber = `${prefix}-${String(seqNum || 1).padStart(6, '0')}`;
    } catch {
      orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
    }

    // Create order
    const order = await base44.asServiceRole.entities.Order.create({
      tenant_id: tenant.id,
      order_number: orderNumber,
      status: 'pending',
      type,
      table_id,
      table_name: tableName,
      customer_name,
      items,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes,
      payment_status: 'unpaid',
    });

    // Send notification to staff
    await base44.asServiceRole.functions.invoke('createNotification', {
      tenant_id: tenant.id,
      type: 'new_order',
      title: 'New Order Received',
      message: `Order ${orderNumber} from ${tableName || 'Customer'}`,
      data: { order_id: order.id, order_number: orderNumber },
      link: `/orders?id=${order.id}`,
      priority: 'high',
    });

    return success({
      order_id: order.id,
      order_number: orderNumber,
      total_amount: totalAmount,
      tracking_url: `/order-tracking?id=${order.id}`,
    });
  } catch (err) {
    console.error('Place order error:', err);
    return error(err.message || 'Failed to place order');
  }
});