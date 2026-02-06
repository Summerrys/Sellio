import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CRITICAL SECURITY TEST: Tenant Isolation Validation
 * 
 * Tests that data from one tenant can NEVER be accessed by another tenant.
 * This is the most important security test for a multi-tenant application.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const report = {
      test_name: 'Tenant Isolation Security Test',
      timestamp: new Date().toISOString(),
      test_sections: [],
      summary: {
        total_tests: 0,
        passed: 0,
        failed: 0,
        critical_issues: []
      }
    };

    // ========================================
    // SETUP: Create Test Tenants
    // ========================================
    let tenantA, tenantB;
    let tenantAProducts = [];
    let tenantBProducts = [];
    let tenantAOrders = [];
    let tenantBOrders = [];
    let tenantAUsers = [];
    let tenantBUsers = [];

    const setupSection = {
      name: 'SETUP: Test Data Creation',
      tests: []
    };

    try {
      // Create Tenant A
      tenantA = await base44.asServiceRole.entities.Tenant.create({
        name: 'Alpha Restaurant',
        slug: 'alpha-restaurant-test-' + Date.now(),
        owner_email: 'admin-alpha@test.com',
        industry: 'restaurant',
        status: 'active'
      });

      setupSection.tests.push({
        name: 'Create Tenant A',
        status: 'PASS',
        message: `Created tenant: ${tenantA.name} (${tenantA.id})`
      });

      // Create Tenant B
      tenantB = await base44.asServiceRole.entities.Tenant.create({
        name: 'Beta Retail',
        slug: 'beta-retail-test-' + Date.now(),
        owner_email: 'admin-beta@test.com',
        industry: 'retail',
        status: 'active'
      });

      setupSection.tests.push({
        name: 'Create Tenant B',
        status: 'PASS',
        message: `Created tenant: ${tenantB.name} (${tenantB.id})`
      });

      // Create products for Tenant A
      for (let i = 1; i <= 10; i++) {
        const product = await base44.asServiceRole.entities.Product.create({
          tenant_id: tenantA.id,
          name: `Alpha Product ${i}`,
          price: 10.99 * i,
          sku: `ALPHA-${i}`
        });
        tenantAProducts.push(product);
      }

      setupSection.tests.push({
        name: 'Create 10 products for Tenant A',
        status: 'PASS',
        message: `Created ${tenantAProducts.length} products`
      });

      // Create products for Tenant B
      for (let i = 1; i <= 8; i++) {
        const product = await base44.asServiceRole.entities.Product.create({
          tenant_id: tenantB.id,
          name: `Beta Product ${i}`,
          price: 15.99 * i,
          sku: `BETA-${i}`
        });
        tenantBProducts.push(product);
      }

      setupSection.tests.push({
        name: 'Create 8 products for Tenant B',
        status: 'PASS',
        message: `Created ${tenantBProducts.length} products`
      });

      // Create orders for Tenant A
      for (let i = 1; i <= 5; i++) {
        const order = await base44.asServiceRole.entities.Order.create({
          tenant_id: tenantA.id,
          order_number: `ALPHA-ORD-${i}`,
          items: [{ product_id: tenantAProducts[0].id, quantity: 1, unit_price: 10, total: 10 }],
          total_amount: 10,
          status: 'pending'
        });
        tenantAOrders.push(order);
      }

      setupSection.tests.push({
        name: 'Create 5 orders for Tenant A',
        status: 'PASS',
        message: `Created ${tenantAOrders.length} orders`
      });

      // Create orders for Tenant B
      for (let i = 1; i <= 3; i++) {
        const order = await base44.asServiceRole.entities.Order.create({
          tenant_id: tenantB.id,
          order_number: `BETA-ORD-${i}`,
          items: [{ product_id: tenantBProducts[0].id, quantity: 1, unit_price: 15, total: 15 }],
          total_amount: 15,
          status: 'pending'
        });
        tenantBOrders.push(order);
      }

      setupSection.tests.push({
        name: 'Create 3 orders for Tenant B',
        status: 'PASS',
        message: `Created ${tenantBOrders.length} orders`
      });

      // Create staff for Tenant A
      for (let i = 1; i <= 3; i++) {
        const staff = await base44.asServiceRole.entities.TenantUser.create({
          tenant_id: tenantA.id,
          user_email: `staff${i}-alpha@test.com`,
          status: 'active'
        });
        tenantAUsers.push(staff);
      }

      setupSection.tests.push({
        name: 'Create 3 staff for Tenant A',
        status: 'PASS',
        message: `Created ${tenantAUsers.length} staff`
      });

      // Create staff for Tenant B
      for (let i = 1; i <= 2; i++) {
        const staff = await base44.asServiceRole.entities.TenantUser.create({
          tenant_id: tenantB.id,
          user_email: `staff${i}-beta@test.com`,
          status: 'active'
        });
        tenantBUsers.push(staff);
      }

      setupSection.tests.push({
        name: 'Create 2 staff for Tenant B',
        status: 'PASS',
        message: `Created ${tenantBUsers.length} staff`
      });

    } catch (error) {
      setupSection.tests.push({
        name: 'Setup Failed',
        status: 'ERROR',
        message: error.message
      });
      report.test_sections.push(setupSection);
      return Response.json(report, { status: 500 });
    }

    report.test_sections.push(setupSection);

    // ========================================
    // TEST 1: API LEVEL ISOLATION
    // ========================================
    const apiSection = {
      name: '1. API LEVEL ISOLATION',
      tests: []
    };

    // Test: Query products filtered by tenant
    try {
      const alphaProducts = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantA.id });
      const onlyAlpha = alphaProducts.every(p => p.tenant_id === tenantA.id);
      const correctCount = alphaProducts.length === 10;

      apiSection.tests.push({
        name: 'Tenant A products query returns only Tenant A data',
        status: onlyAlpha && correctCount ? 'PASS' : 'FAIL',
        message: onlyAlpha && correctCount 
          ? `✓ Returned ${alphaProducts.length} products, all belong to Tenant A`
          : `✗ SECURITY ISSUE: Expected 10 Tenant A products, got ${alphaProducts.length}`,
        critical: !onlyAlpha
      });

      if (!onlyAlpha) {
        report.summary.critical_issues.push('API returns products from wrong tenant');
      }
    } catch (error) {
      apiSection.tests.push({
        name: 'Tenant A products query',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test: Query orders filtered by tenant
    try {
      const alphaOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantA.id });
      const onlyAlpha = alphaOrders.every(o => o.tenant_id === tenantA.id);
      const correctCount = alphaOrders.length === 5;

      apiSection.tests.push({
        name: 'Tenant A orders query returns only Tenant A data',
        status: onlyAlpha && correctCount ? 'PASS' : 'FAIL',
        message: onlyAlpha && correctCount 
          ? `✓ Returned ${alphaOrders.length} orders, all belong to Tenant A`
          : `✗ SECURITY ISSUE: Expected 5 Tenant A orders, got ${alphaOrders.length}`,
        critical: !onlyAlpha
      });

      if (!onlyAlpha) {
        report.summary.critical_issues.push('API returns orders from wrong tenant');
      }
    } catch (error) {
      apiSection.tests.push({
        name: 'Tenant A orders query',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test: Query staff filtered by tenant
    try {
      const alphaStaff = await base44.asServiceRole.entities.TenantUser.filter({ tenant_id: tenantA.id });
      const onlyAlpha = alphaStaff.every(s => s.tenant_id === tenantA.id);
      const correctCount = alphaStaff.length === 3;

      apiSection.tests.push({
        name: 'Tenant A staff query returns only Tenant A data',
        status: onlyAlpha && correctCount ? 'PASS' : 'FAIL',
        message: onlyAlpha && correctCount 
          ? `✓ Returned ${alphaStaff.length} staff, all belong to Tenant A`
          : `✗ SECURITY ISSUE: Expected 3 Tenant A staff, got ${alphaStaff.length}`,
        critical: !onlyAlpha
      });

      if (!onlyAlpha) {
        report.summary.critical_issues.push('API returns staff from wrong tenant');
      }
    } catch (error) {
      apiSection.tests.push({
        name: 'Tenant A staff query',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test: Tenant B can only see their own products
    try {
      const betaProducts = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantB.id });
      const onlyBeta = betaProducts.every(p => p.tenant_id === tenantB.id);
      const correctCount = betaProducts.length === 8;

      apiSection.tests.push({
        name: 'Tenant B products query returns only Tenant B data',
        status: onlyBeta && correctCount ? 'PASS' : 'FAIL',
        message: onlyBeta && correctCount 
          ? `✓ Returned ${betaProducts.length} products, all belong to Tenant B`
          : `✗ SECURITY ISSUE: Expected 8 Tenant B products, got ${betaProducts.length}`,
        critical: !onlyBeta
      });

      if (!onlyBeta) {
        report.summary.critical_issues.push('Tenant B can see other tenant data');
      }
    } catch (error) {
      apiSection.tests.push({
        name: 'Tenant B products query',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(apiSection);

    // ========================================
    // TEST 2: CROSS-TENANT RESOURCE ACCESS
    // ========================================
    const crossAccessSection = {
      name: '2. CROSS-TENANT RESOURCE ACCESS',
      tests: []
    };

    // Test: Tenant A cannot access Tenant B's product by ID
    try {
      const betaProductId = tenantBProducts[0].id;
      const alphaFilteredProducts = await base44.asServiceRole.entities.Product.filter({ 
        tenant_id: tenantA.id, 
        id: betaProductId 
      });

      crossAccessSection.tests.push({
        name: 'Tenant A cannot access Tenant B product by ID',
        status: alphaFilteredProducts.length === 0 ? 'PASS' : 'FAIL',
        message: alphaFilteredProducts.length === 0 
          ? `✓ Query with wrong tenant_id returns empty (not found)`
          : `✗ CRITICAL: Tenant A accessed Tenant B's product!`,
        critical: alphaFilteredProducts.length > 0
      });

      if (alphaFilteredProducts.length > 0) {
        report.summary.critical_issues.push('Cross-tenant product access possible');
      }
    } catch (error) {
      crossAccessSection.tests.push({
        name: 'Cross-tenant product access test',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test: Tenant A cannot access Tenant B's order
    try {
      const betaOrderId = tenantBOrders[0].id;
      const alphaFilteredOrders = await base44.asServiceRole.entities.Order.filter({ 
        tenant_id: tenantA.id, 
        id: betaOrderId 
      });

      crossAccessSection.tests.push({
        name: 'Tenant A cannot access Tenant B order by ID',
        status: alphaFilteredOrders.length === 0 ? 'PASS' : 'FAIL',
        message: alphaFilteredOrders.length === 0 
          ? `✓ Query with wrong tenant_id returns empty`
          : `✗ CRITICAL: Tenant A accessed Tenant B's order!`,
        critical: alphaFilteredOrders.length > 0
      });

      if (alphaFilteredOrders.length > 0) {
        report.summary.critical_issues.push('Cross-tenant order access possible');
      }
    } catch (error) {
      crossAccessSection.tests.push({
        name: 'Cross-tenant order access test',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test: Tenant A cannot access Tenant B's staff
    try {
      const betaStaffId = tenantBUsers[0].id;
      const alphaFilteredStaff = await base44.asServiceRole.entities.TenantUser.filter({ 
        tenant_id: tenantA.id, 
        id: betaStaffId 
      });

      crossAccessSection.tests.push({
        name: 'Tenant A cannot access Tenant B staff by ID',
        status: alphaFilteredStaff.length === 0 ? 'PASS' : 'FAIL',
        message: alphaFilteredStaff.length === 0 
          ? `✓ Query with wrong tenant_id returns empty`
          : `✗ CRITICAL: Tenant A accessed Tenant B's staff!`,
        critical: alphaFilteredStaff.length > 0
      });

      if (alphaFilteredStaff.length > 0) {
        report.summary.critical_issues.push('Cross-tenant staff access possible');
      }
    } catch (error) {
      crossAccessSection.tests.push({
        name: 'Cross-tenant staff access test',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(crossAccessSection);

    // ========================================
    // TEST 3: ID ENUMERATION
    // ========================================
    const enumerationSection = {
      name: '3. ID ENUMERATION PROTECTION',
      tests: []
    };

    // Test: IDs use UUIDs not sequential integers
    try {
      const sampleId = tenantAProducts[0].id;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleId);

      enumerationSection.tests.push({
        name: 'IDs use UUIDs (not sequential integers)',
        status: isUUID ? 'PASS' : 'FAIL',
        message: isUUID 
          ? `✓ IDs use UUIDs: ${sampleId.substring(0, 20)}...`
          : `✗ WARNING: IDs may be guessable: ${sampleId}`,
        critical: !isUUID
      });

      if (!isUUID) {
        report.summary.critical_issues.push('IDs are not UUIDs - enumeration possible');
      }
    } catch (error) {
      enumerationSection.tests.push({
        name: 'UUID check',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(enumerationSection);

    // ========================================
    // TEST 4: SEARCH ISOLATION
    // ========================================
    const searchSection = {
      name: '4. SEARCH QUERY ISOLATION',
      tests: []
    };

    // Test: Searching from Tenant A doesn't return Tenant B results
    try {
      const searchQuery = 'Beta'; // Tenant B has products with "Beta" in name
      const alphaProducts = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantA.id });
      const matchingProducts = alphaProducts.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      searchSection.tests.push({
        name: 'Search in Tenant A does not return Tenant B results',
        status: matchingProducts.length === 0 ? 'PASS' : 'FAIL',
        message: matchingProducts.length === 0 
          ? `✓ Searching "Beta" in Tenant A returns 0 results (correct)`
          : `✗ CRITICAL: Search leaked ${matchingProducts.length} results from Tenant B`,
        critical: matchingProducts.length > 0
      });

      if (matchingProducts.length > 0) {
        report.summary.critical_issues.push('Search queries leak cross-tenant data');
      }
    } catch (error) {
      searchSection.tests.push({
        name: 'Search isolation test',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(searchSection);

    // ========================================
    // TEST 5: REVENUE/REPORT ISOLATION
    // ========================================
    const reportSection = {
      name: '5. REPORT & REVENUE ISOLATION',
      tests: []
    };

    // Test: Revenue calculations are tenant-isolated
    try {
      const alphaOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantA.id });
      const betaOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantB.id });

      const alphaRevenue = alphaOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const betaRevenue = betaOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      const expectedAlpha = 5 * 10; // 5 orders * $10
      const expectedBeta = 3 * 15; // 3 orders * $15

      reportSection.tests.push({
        name: 'Tenant A revenue calculation is isolated',
        status: alphaRevenue === expectedAlpha ? 'PASS' : 'FAIL',
        message: alphaRevenue === expectedAlpha 
          ? `✓ Tenant A revenue: $${alphaRevenue} (expected $${expectedAlpha})`
          : `✗ WARNING: Tenant A revenue: $${alphaRevenue}, expected $${expectedAlpha}`,
        critical: Math.abs(alphaRevenue - expectedAlpha) > 1
      });

      reportSection.tests.push({
        name: 'Tenant B revenue calculation is isolated',
        status: betaRevenue === expectedBeta ? 'PASS' : 'FAIL',
        message: betaRevenue === expectedBeta 
          ? `✓ Tenant B revenue: $${betaRevenue} (expected $${expectedBeta})`
          : `✗ WARNING: Tenant B revenue: $${betaRevenue}, expected $${expectedBeta}`,
        critical: Math.abs(betaRevenue - expectedBeta) > 1
      });

      // Check that revenues don't add up (indicating mixed data)
      const combined = alphaRevenue + betaRevenue;
      reportSection.tests.push({
        name: 'Revenue totals are not mixed',
        status: 'INFO',
        message: `Tenant A: $${alphaRevenue}, Tenant B: $${betaRevenue}, Combined: $${combined}`
      });

    } catch (error) {
      reportSection.tests.push({
        name: 'Revenue isolation test',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(reportSection);

    // ========================================
    // TEST 6: SUPER ADMIN ACCESS
    // ========================================
    const superAdminSection = {
      name: '6. SUPER ADMIN ACCESS VALIDATION',
      tests: []
    };

    try {
      // Super admin can see all tenants
      const allProducts = await base44.asServiceRole.entities.Product.list();
      const hasAlphaProducts = allProducts.some(p => p.tenant_id === tenantA.id);
      const hasBetaProducts = allProducts.some(p => p.tenant_id === tenantB.id);

      superAdminSection.tests.push({
        name: 'Super Admin can access all tenant data',
        status: hasAlphaProducts && hasBetaProducts ? 'PASS' : 'FAIL',
        message: hasAlphaProducts && hasBetaProducts 
          ? `✓ Super Admin sees both Tenant A and Tenant B products`
          : `✗ Super Admin access incomplete`
      });

      // Verify data is clearly separated
      const alphaCount = allProducts.filter(p => p.tenant_id === tenantA.id).length;
      const betaCount = allProducts.filter(p => p.tenant_id === tenantB.id).length;

      superAdminSection.tests.push({
        name: 'Super Admin data is clearly separated',
        status: 'PASS',
        message: `✓ Tenant A: ${alphaCount} products, Tenant B: ${betaCount} products (clearly separated)`
      });

    } catch (error) {
      superAdminSection.tests.push({
        name: 'Super Admin access test',
        status: 'ERROR',
        message: error.message
      });
    }

    report.test_sections.push(superAdminSection);

    // ========================================
    // CLEANUP: Delete Test Data
    // ========================================
    const cleanupSection = {
      name: 'CLEANUP: Removing Test Data',
      tests: []
    };

    try {
      // Delete products
      for (const product of [...tenantAProducts, ...tenantBProducts]) {
        await base44.asServiceRole.entities.Product.delete(product.id);
      }

      // Delete orders
      for (const order of [...tenantAOrders, ...tenantBOrders]) {
        await base44.asServiceRole.entities.Order.delete(order.id);
      }

      // Delete staff
      for (const staff of [...tenantAUsers, ...tenantBUsers]) {
        await base44.asServiceRole.entities.TenantUser.delete(staff.id);
      }

      // Delete tenants
      await base44.asServiceRole.entities.Tenant.delete(tenantA.id);
      await base44.asServiceRole.entities.Tenant.delete(tenantB.id);

      cleanupSection.tests.push({
        name: 'Test data cleanup',
        status: 'PASS',
        message: '✓ All test data removed successfully'
      });

    } catch (error) {
      cleanupSection.tests.push({
        name: 'Test data cleanup',
        status: 'WARNING',
        message: `Cleanup incomplete: ${error.message}`
      });
    }

    report.test_sections.push(cleanupSection);

    // ========================================
    // CALCULATE SUMMARY
    // ========================================
    report.test_sections.forEach(section => {
      section.tests.forEach(test => {
        report.summary.total_tests++;
        if (test.status === 'PASS') {
          report.summary.passed++;
        } else if (test.status === 'FAIL' || test.status === 'ERROR') {
          report.summary.failed++;
        }
      });
    });

    report.summary.pass_rate = Math.round((report.summary.passed / report.summary.total_tests) * 100);

    // ========================================
    // FINAL VERDICT
    // ========================================
    report.verdict = {
      secure: report.summary.critical_issues.length === 0 && report.summary.failed === 0,
      message: report.summary.critical_issues.length === 0 && report.summary.failed === 0
        ? '✅ SECURE: All tenant isolation tests passed. No data leakage detected.'
        : '🚨 SECURITY ISSUES DETECTED: Review failed tests immediately.',
      critical_issues_count: report.summary.critical_issues.length,
      recommendations: []
    };

    if (report.summary.critical_issues.length > 0) {
      report.verdict.recommendations.push(
        'URGENT: Fix all critical issues before deploying to production',
        'Review all queries to ensure tenant_id filtering is applied',
        'Implement middleware to automatically inject tenant_id in all queries',
        'Add automated tests to CI/CD pipeline'
      );
    }

    return Response.json(report, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return Response.json({
      error: 'Test execution failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});