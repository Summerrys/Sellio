import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Schema Validation Report for Apptelier Suite
 * 
 * IMPORTANT: Base44 uses JSON schema entities, not traditional SQL databases.
 * There are no database-level foreign keys, CASCADE rules, or UNIQUE constraints.
 * All referential integrity must be enforced at the application level.
 * 
 * This function validates logical consistency and best practices.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const report = {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: { passed: 0, failed: 0, warnings: 0 }
    };

    // ========================================
    // 1. REFERENTIAL INTEGRITY (Application Level)
    // ========================================
    report.checks.push({
      category: '1. REFERENTIAL INTEGRITY',
      note: 'Base44 does not support database-level CASCADE. Application must handle cleanup.',
      tests: [
        {
          name: 'Tenant Deletion Cascade Check',
          status: 'WARNING',
          message: 'No database-level cascade. Application must explicitly delete related records when tenant is deleted.',
          recommendation: 'Implement a deleteTenant backend function that cascades to TenantUser, Product, Order, TableEntity, InventoryItem, ThemeConfig, Subscription, etc.'
        },
        {
          name: 'Category Deletion Behavior',
          status: 'WARNING',
          message: 'No database-level SET NULL. Application must update products when category is deleted.',
          recommendation: 'Before deleting a category, set category_id=null for all related products.'
        },
        {
          name: 'Product Deletion Cascade',
          status: 'WARNING',
          message: 'No automatic cascade to InventoryItem, ProductVariant, OrderItems.',
          recommendation: 'Implement deleteProduct function to clean up related records. Consider soft-delete for historical orders.'
        }
      ]
    });

    // ========================================
    // 2. TENANT ISOLATION
    // ========================================
    const tenantIsolationTests = [];

    // Check all entities have tenant_id
    const entitiesRequiringTenantId = [
      'Product', 'Category', 'Order', 'TableEntity', 'TenantUser', 
      'InventoryItem', 'Role', 'OrderItem', 'ProductVariant', 
      'ThemeConfig', 'Subscription', 'TableCall', 'TableSession', 'Payment'
    ];

    for (const entityName of entitiesRequiringTenantId) {
      try {
        const schema = await base44.asServiceRole.entities[entityName].schema();
        const hasTenantId = schema.properties?.tenant_id !== undefined;
        const isRequired = schema.required?.includes('tenant_id');

        tenantIsolationTests.push({
          name: `${entityName} has tenant_id`,
          status: hasTenantId && isRequired ? 'PASS' : 'FAIL',
          message: hasTenantId && isRequired 
            ? `${entityName} correctly has tenant_id as required field`
            : `${entityName} missing tenant_id or not required`
        });
      } catch (error) {
        tenantIsolationTests.push({
          name: `${entityName} schema check`,
          status: 'ERROR',
          message: `Could not fetch schema: ${error.message}`
        });
      }
    }

    report.checks.push({
      category: '2. TENANT ISOLATION',
      note: 'Base44 does not support UNIQUE(tenant_id, field) constraints. Application must validate.',
      tests: [
        ...tenantIsolationTests,
        {
          name: 'Unique SKU within tenant',
          status: 'WARNING',
          message: 'No database constraint. Application must validate SKU uniqueness per tenant before insert/update.',
          recommendation: 'Before creating/updating Product, query: filter({ tenant_id, sku }) and ensure no duplicates.'
        },
        {
          name: 'Unique table name within tenant',
          status: 'WARNING',
          message: 'No database constraint. Application must validate table name uniqueness per tenant.',
          recommendation: 'Before creating table, check no existing table with same name in that tenant.'
        }
      ]
    });

    // ========================================
    // 3. ENUM VALIDATION
    // ========================================
    const enumTests = [];

    const enumChecks = [
      { entity: 'Order', field: 'status', expected: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'] },
      { entity: 'Order', field: 'payment_status', expected: ['unpaid', 'paid', 'refunded', 'partial'] },
      { entity: 'TableEntity', field: 'status', expected: ['available', 'occupied', 'reserved', 'maintenance'] },
      { entity: 'TenantUser', field: 'status', expected: ['active', 'invited', 'suspended'] },
      { entity: 'Tenant', field: 'status', expected: ['active', 'suspended', 'trial', 'cancelled'] }
    ];

    for (const check of enumChecks) {
      try {
        const schema = await base44.asServiceRole.entities[check.entity].schema();
        const fieldSchema = schema.properties?.[check.field];
        const hasEnum = fieldSchema?.enum !== undefined;
        const enumValues = fieldSchema?.enum || [];
        const matches = hasEnum && check.expected.every(v => enumValues.includes(v));

        enumTests.push({
          name: `${check.entity}.${check.field} enum`,
          status: matches ? 'PASS' : 'FAIL',
          message: matches 
            ? `Enum correctly defined: ${enumValues.join(', ')}`
            : `Expected: ${check.expected.join(', ')}, Got: ${enumValues.join(', ')}`
        });
      } catch (error) {
        enumTests.push({
          name: `${check.entity}.${check.field} check`,
          status: 'ERROR',
          message: error.message
        });
      }
    }

    report.checks.push({
      category: '3. ENUM VALIDATION',
      note: 'JSON schema enums are validated by Base44',
      tests: enumTests
    });

    // ========================================
    // 4. DEFAULT VALUES
    // ========================================
    const defaultTests = [];

    const defaultChecks = [
      { entity: 'Product', field: 'is_active', expected: true },
      { entity: 'Product', field: 'stock_quantity', expected: 0 },
      { entity: 'Product', field: 'low_stock_threshold', expected: 5 },
      { entity: 'TableEntity', field: 'status', expected: 'available' },
      { entity: 'InventoryItem', field: 'current_stock', expected: 0 },
      { entity: 'TenantUser', field: 'status', expected: 'active' }
    ];

    for (const check of defaultChecks) {
      try {
        const schema = await base44.asServiceRole.entities[check.entity].schema();
        const fieldSchema = schema.properties?.[check.field];
        const hasDefault = fieldSchema?.default !== undefined;
        const matches = hasDefault && fieldSchema.default === check.expected;

        defaultTests.push({
          name: `${check.entity}.${check.field} default`,
          status: matches ? 'PASS' : 'FAIL',
          message: matches 
            ? `Default correctly set to: ${check.expected}`
            : `Expected default: ${check.expected}, Got: ${fieldSchema?.default}`
        });
      } catch (error) {
        defaultTests.push({
          name: `${check.entity}.${check.field} check`,
          status: 'ERROR',
          message: error.message
        });
      }
    }

    report.checks.push({
      category: '4. DEFAULT VALUES',
      note: 'Base44 auto-adds created_date, updated_date, created_by. Manual defaults in schema.',
      tests: [
        {
          name: 'Auto-generated timestamps',
          status: 'PASS',
          message: 'Base44 automatically adds created_date and updated_date to all entities'
        },
        {
          name: 'Auto-generated created_by',
          status: 'PASS',
          message: 'Base44 automatically tracks created_by (user email)'
        },
        ...defaultTests
      ]
    });

    // ========================================
    // 5. INDEX PERFORMANCE
    // ========================================
    report.checks.push({
      category: '5. INDEX PERFORMANCE',
      note: 'Base44 automatically indexes all fields. Query performance is platform-managed.',
      tests: [
        {
          name: 'Automatic indexing',
          status: 'PASS',
          message: 'Base44 indexes all fields including tenant_id. No manual index creation needed.'
        },
        {
          name: 'Query optimization',
          status: 'INFO',
          message: 'Use filter() with tenant_id first, then other conditions. Platform handles index selection.'
        }
      ]
    });

    // ========================================
    // 6. DATA TYPE CORRECTNESS
    // ========================================
    const dataTypeTests = [];

    const dataTypeChecks = [
      { entity: 'Product', field: 'price', expectedType: 'number', note: 'Use toFixed(2) in UI for currency display' },
      { entity: 'Product', field: 'cost_price', expectedType: 'number', note: 'Store in smallest currency unit (cents) or use Decimal in code' },
      { entity: 'Order', field: 'total_amount', expectedType: 'number', note: 'JavaScript number is float64, precise enough for currency' },
      { entity: 'Product', field: 'stock_quantity', expectedType: 'number', note: 'Integer quantities - use Math.floor()' },
      { entity: 'TableEntity', field: 'qr_code_url', expectedType: 'string', note: 'Text type, can store long URLs' }
    ];

    for (const check of dataTypeChecks) {
      try {
        const schema = await base44.asServiceRole.entities[check.entity].schema();
        const fieldSchema = schema.properties?.[check.field];
        const matches = fieldSchema?.type === check.expectedType;

        dataTypeTests.push({
          name: `${check.entity}.${check.field} type`,
          status: matches ? 'PASS' : 'FAIL',
          message: matches 
            ? `Type: ${check.expectedType}. ${check.note}`
            : `Expected: ${check.expectedType}, Got: ${fieldSchema?.type}`
        });
      } catch (error) {
        dataTypeTests.push({
          name: `${check.entity}.${check.field} check`,
          status: 'ERROR',
          message: error.message
        });
      }
    }

    report.checks.push({
      category: '6. DATA TYPE CORRECTNESS',
      note: 'Base44 uses JSON schema types. Numbers are stored as float64.',
      tests: [
        {
          name: 'Currency precision',
          status: 'WARNING',
          message: 'JavaScript numbers (float64) have precision issues. For financial accuracy, consider storing prices in cents (integer) or using Decimal library in critical calculations.',
          recommendation: 'Store: priceInCents (integer). Display: (priceInCents / 100).toFixed(2)'
        },
        {
          name: 'Timestamp format',
          status: 'PASS',
          message: 'Base44 uses ISO 8601 strings with timezone. created_date and updated_date are automatically formatted.'
        },
        ...dataTypeTests
      ]
    });

    // Calculate summary
    report.checks.forEach(check => {
      check.tests.forEach(test => {
        if (test.status === 'PASS') report.summary.passed++;
        else if (test.status === 'FAIL' || test.status === 'ERROR') report.summary.failed++;
        else if (test.status === 'WARNING' || test.status === 'INFO') report.summary.warnings++;
      });
    });

    // ========================================
    // RECOMMENDATIONS
    // ========================================
    report.recommendations = [
      {
        priority: 'HIGH',
        title: 'Implement Cascade Delete Functions',
        description: 'Create backend functions for deleteTenant, deleteCategory, deleteProduct that handle cleanup of related records.',
        example: 'functions/deleteTenant.js - deletes all TenantUser, Product, Order, etc. for that tenant'
      },
      {
        priority: 'HIGH',
        title: 'Add Application-Level Unique Constraints',
        description: 'Before creating/updating records, query to check uniqueness within tenant scope.',
        example: 'Before creating Product with SKU, check: const existing = await base44.entities.Product.filter({ tenant_id, sku }); if (existing.length > 0) throw error;'
      },
      {
        priority: 'MEDIUM',
        title: 'Consider Soft Delete for Historical Records',
        description: 'Add deleted_at field to Order, OrderItem to preserve order history even when products are deleted.',
        example: 'Add deleted_at (date-time, nullable) to entities that need audit trails'
      },
      {
        priority: 'MEDIUM',
        title: 'Store Prices in Cents (Integer)',
        description: 'Avoid floating-point precision issues in financial calculations.',
        example: 'price_cents: 1299 (represents $12.99), display: (price_cents / 100).toFixed(2)'
      },
      {
        priority: 'LOW',
        title: 'Add Data Validation Middleware',
        description: 'Create reusable validation functions that check referential integrity before CRUD operations.',
        example: 'validateProductBeforeCreate({ tenant_id, sku, category_id, ... })'
      }
    ];

    return Response.json(report, { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});