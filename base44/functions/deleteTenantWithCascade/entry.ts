import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Cascade Delete for Tenant
 * 
 * Deletes a tenant and ALL related data across all entities.
 * This implements application-level cascade delete since Base44 
 * does not support database-level CASCADE rules.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Verify tenant exists
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const deletionLog = {
      tenant_id,
      tenant_name: tenants[0].name,
      started_at: new Date().toISOString(),
      deleted_counts: {},
      errors: []
    };

    // Define cascade order (delete children before parents)
    const cascadeEntities = [
      'TableCall',
      'TableSession',
      'Payment',
      'OrderItem',
      'Order',
      'InventoryLog',
      'InventoryItem',
      'ProductVariant',
      'Product',
      'Category',
      'TableEntity',
      'TenantUser',
      'Role',
      'Notification',
      'NotificationPreference',
      'ThemeConfig',
      'Subscription',
      'BusinessHours',
      'TaxConfig'
    ];

    // Delete all related records
    for (const entityName of cascadeEntities) {
      try {
        const records = await base44.asServiceRole.entities[entityName].filter({ tenant_id });
        
        let deletedCount = 0;
        for (const record of records) {
          try {
            await base44.asServiceRole.entities[entityName].delete(record.id);
            deletedCount++;
          } catch (deleteError) {
            deletionLog.errors.push({
              entity: entityName,
              record_id: record.id,
              error: deleteError.message
            });
          }
        }

        deletionLog.deleted_counts[entityName] = deletedCount;
      } catch (error) {
        deletionLog.errors.push({
          entity: entityName,
          error: `Failed to fetch/delete: ${error.message}`
        });
      }
    }

    // Finally, delete the tenant itself
    try {
      await base44.asServiceRole.entities.Tenant.delete(tenant_id);
      deletionLog.deleted_counts['Tenant'] = 1;
    } catch (error) {
      deletionLog.errors.push({
        entity: 'Tenant',
        error: error.message
      });
      return Response.json({
        success: false,
        message: 'Failed to delete tenant',
        log: deletionLog
      }, { status: 500 });
    }

    deletionLog.completed_at = new Date().toISOString();
    deletionLog.duration_seconds = Math.round(
      (new Date(deletionLog.completed_at) - new Date(deletionLog.started_at)) / 1000
    );

    return Response.json({
      success: true,
      message: `Tenant "${deletionLog.tenant_name}" and all related data deleted successfully`,
      log: deletionLog
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});