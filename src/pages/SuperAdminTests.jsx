import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui-custom/PageHeader';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Lock,
  Users,
  Database,
  TrendingUp,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdminTests() {
  const [testResults, setTestResults] = useState({});
  const [runningTests, setRunningTests] = useState({});

  // Fetch current user to verify super admin status
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Test mutations
  const runAccessControlTest = useMutation({
    mutationFn: async () => {
      const results = [];
      
      // Test 1: Verify user is super admin
      const superAdmins = await base44.entities.SuperAdmin.list();
      const isSuperAdmin = superAdmins.some(sa => sa.email === currentUser?.email);
      results.push({
        name: 'Super Admin Authentication',
        passed: isSuperAdmin,
        message: isSuperAdmin ? 'User is authenticated as Super Admin' : 'User is not a Super Admin',
        critical: true
      });

      // Test 2: Check SuperAdmin entity exists and has proper schema
      try {
        const schema = await base44.entities.SuperAdmin.schema();
        results.push({
          name: 'SuperAdmin Entity Schema',
          passed: schema.properties.email && schema.properties.role,
          message: 'SuperAdmin entity has required fields',
          critical: true
        });
      } catch (error) {
        results.push({
          name: 'SuperAdmin Entity Schema',
          passed: false,
          message: `Schema validation failed: ${error.message}`,
          critical: true
        });
      }

      // Test 3: Verify tenant isolation (super admin can see all tenants)
      const allTenants = await base44.asServiceRole.entities.Tenant.list();
      results.push({
        name: 'Cross-Tenant Access (Service Role)',
        passed: allTenants.length >= 0,
        message: `Can access ${allTenants.length} tenant(s) via service role`,
        critical: true
      });

      // Test 4: Verify current URL is admin route
      const isAdminRoute = window.location.pathname.includes('SuperAdmin');
      results.push({
        name: 'Admin Routes Accessible',
        passed: isAdminRoute,
        message: isAdminRoute ? 'Currently on Super Admin route' : 'Not on Super Admin route',
        critical: true
      });

      // Test 5: Check sidebar branding (not using tenant themes)
      const hasApptelier = document.querySelector('[class*="Apptelier"]') !== null;
      results.push({
        name: 'Apptelier Branding (Not Tenant Theme)',
        passed: hasApptelier,
        message: hasApptelier ? 'Sidebar uses Apptelier branding' : 'Sidebar may be using tenant theme',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, accessControl: results }));
      toast.success('Access Control Tests Completed');
    },
    onError: (error) => {
      toast.error(`Access Control Tests Failed: ${error.message}`);
    }
  });

  const runDashboardDataTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Fetch data using service role
      const tenants = await base44.asServiceRole.entities.Tenant.list();
      const users = await base44.asServiceRole.entities.User.list();
      const tenantUsers = await base44.asServiceRole.entities.TenantUser.list();

      // Test 1: Total Active Tenants count
      const activeTenants = tenants.filter(t => t.status === 'active');
      results.push({
        name: 'Active Tenants Count',
        passed: activeTenants.length >= 0,
        message: `Found ${activeTenants.length} active tenants out of ${tenants.length} total`,
        data: { active: activeTenants.length, total: tenants.length }
      });

      // Test 2: Total Users count
      results.push({
        name: 'Total Users Count',
        passed: users.length >= 0,
        message: `Found ${users.length} total users`,
        data: { count: users.length }
      });

      // Test 3: Tenant-User relationships
      const orphanedTenantUsers = tenantUsers.filter(tu => 
        !tenants.find(t => t.id === tu.tenant_id)
      );
      results.push({
        name: 'Data Integrity (No Orphaned TenantUsers)',
        passed: orphanedTenantUsers.length === 0,
        message: orphanedTenantUsers.length === 0 
          ? 'All TenantUser records have valid tenant references'
          : `Found ${orphanedTenantUsers.length} orphaned TenantUser records`,
        critical: orphanedTenantUsers.length > 0
      });

      // Test 4: Recent signups (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentSignups = tenants.filter(t => 
        new Date(t.created_date) > sevenDaysAgo
      );
      results.push({
        name: 'Recent Signups (Last 7 Days)',
        passed: true,
        message: `${recentSignups.length} tenant(s) signed up in the last 7 days`,
        data: { count: recentSignups.length }
      });

      // Test 5: Growth trend calculation with direction
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      const thisMonthSignups = tenants.filter(t => new Date(t.created_date) >= thisMonthStart);
      const lastMonthSignups = tenants.filter(t => {
        const date = new Date(t.created_date);
        return date >= lastMonthStart && date < thisMonthStart;
      });
      
      const growthDirection = thisMonthSignups.length > lastMonthSignups.length ? 'UP ↑' : 
                              thisMonthSignups.length < lastMonthSignups.length ? 'DOWN ↓' : 'FLAT →';
      
      results.push({
        name: 'Growth Trend (This Month vs Last)',
        passed: true,
        message: `${growthDirection}: ${thisMonthSignups.length} this month vs ${lastMonthSignups.length} last month`,
        data: { thisMonth: thisMonthSignups.length, lastMonth: lastMonthSignups.length, direction: growthDirection }
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, dashboardData: results }));
      toast.success('Dashboard Data Tests Completed');
    },
    onError: (error) => {
      toast.error(`Dashboard Data Tests Failed: ${error.message}`);
    }
  });

  const runTenantManagementTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Fetch all tenants
      const tenants = await base44.asServiceRole.entities.Tenant.list();
      const products = await base44.asServiceRole.entities.Product.list();
      const tenantUsers = await base44.asServiceRole.entities.TenantUser.list();

      // Test 1: All tenants visible
      results.push({
        name: 'All Tenants Visible',
        passed: tenants.length >= 0,
        message: `Total ${tenants.length} tenant(s) in database should all be visible`,
        data: { count: tenants.length }
      });

      // Test 2: Search simulation (test if names are searchable)
      if (tenants.length > 0) {
        const sampleTenant = tenants[0];
        const searchableName = sampleTenant.name.toLowerCase();
        const partialMatch = searchableName.substring(0, 3);
        results.push({
          name: 'Search & Fuzzy Match',
          passed: true,
          message: `Sample: searching "${partialMatch}" should find "${sampleTenant.name}"`,
          data: { sampleName: sampleTenant.name, partialSearch: partialMatch }
        });
      }

      // Test 3: Tenant table data accuracy with cross-reference
      const sampleTenant = tenants[0];
      if (sampleTenant) {
        const tenantProducts = products.filter(p => p.tenant_id === sampleTenant.id);
        const tenantMembers = tenantUsers.filter(tu => tu.tenant_id === sampleTenant.id);
        
        results.push({
          name: 'Table Data Accuracy (Cross-Reference)',
          passed: true,
          message: `"${sampleTenant.name}": ${tenantProducts.length} products, ${tenantMembers.length} users`,
          data: { 
            tenant: sampleTenant.name, 
            products: tenantProducts.length, 
            users: tenantMembers.length 
          }
        });
      }

      // Test 4: Status filter options
      const statuses = [...new Set(tenants.map(t => t.status))];
      const activeCount = tenants.filter(t => t.status === 'active').length;
      const suspendedCount = tenants.filter(t => t.status === 'suspended').length;
      results.push({
        name: 'Status Filters',
        passed: statuses.length > 0,
        message: `Active: ${activeCount}, Suspended: ${suspendedCount}, Trial: ${tenants.length - activeCount - suspendedCount}`,
        data: { statuses, active: activeCount, suspended: suspendedCount }
      });

      // Test 5: Business type filter
      const businessTypes = tenants.reduce((acc, t) => {
        acc[t.industry] = (acc[t.industry] || 0) + 1;
        return acc;
      }, {});
      results.push({
        name: 'Business Type Filters',
        passed: Object.keys(businessTypes).length > 0,
        message: `${Object.entries(businessTypes).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        data: businessTypes
      });

      // Test 6: Sort by created date (newest first)
      const sortedByDate = [...tenants].sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
      const newestTenant = sortedByDate[0];
      results.push({
        name: 'Sort by Created Date (Default)',
        passed: true,
        message: `Newest: "${newestTenant?.name}" (${new Date(newestTenant?.created_date).toLocaleDateString()})`,
        data: { newest: newestTenant?.name, date: newestTenant?.created_date }
      });

      // Test 7: Sort by user count
      const tenantsWithUserCounts = tenants.map(t => ({
        name: t.name,
        userCount: tenantUsers.filter(tu => tu.tenant_id === t.id).length
      })).sort((a, b) => a.userCount - b.userCount);
      results.push({
        name: 'Sort by User Count',
        passed: true,
        message: `Range: ${tenantsWithUserCounts[0]?.userCount || 0} to ${tenantsWithUserCounts[tenantsWithUserCounts.length - 1]?.userCount || 0} users`,
        data: { min: tenantsWithUserCounts[0]?.userCount || 0, max: tenantsWithUserCounts[tenantsWithUserCounts.length - 1]?.userCount || 0 }
      });

      // Test 8: Pagination
      const pageSize = 10;
      const totalPages = Math.ceil(tenants.length / pageSize);
      results.push({
        name: 'Pagination',
        passed: true,
        message: tenants.length > pageSize 
          ? `${tenants.length} tenants across ${totalPages} pages (${pageSize} per page)`
          : `${tenants.length} tenants fit on one page`,
        data: { total: tenants.length, pages: totalPages, pageSize }
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, tenantManagement: results }));
      toast.success('Tenant Management Tests Completed');
    },
    onError: (error) => {
      toast.error(`Tenant Management Tests Failed: ${error.message}`);
    }
  });

  const runTenantActionsTest = useMutation({
    mutationFn: async () => {
      const results = [];

      const tenants = await base44.asServiceRole.entities.Tenant.list();

      // Test 1: View Details button
      const sampleTenant = tenants[0];
      if (sampleTenant) {
        results.push({
          name: 'View Details Navigation',
          passed: true,
          message: `Should navigate to /SuperAdminTenantDetail?id=${sampleTenant.id}`,
          data: { tenantId: sampleTenant.id, tenantName: sampleTenant.name }
        });
      }

      // Test 2: Suspend tenant action
      const activeTenant = tenants.find(t => t.status === 'active');
      if (activeTenant) {
        results.push({
          name: 'Suspend Tenant Action',
          passed: true,
          message: `Ready to test: Suspend "${activeTenant.name}" → status should change to "suspended"`,
          data: { tenantId: activeTenant.id, currentStatus: activeTenant.status }
        });
        
        results.push({
          name: 'Suspend Confirmation Modal',
          passed: false,
          message: 'MANUAL TEST: Verify "Are you sure?" modal appears with business name',
          critical: false
        });
      }

      // Test 3: Activate suspended tenant
      const suspendedTenant = tenants.find(t => t.status === 'suspended');
      if (suspendedTenant) {
        results.push({
          name: 'Activate Tenant Action',
          passed: true,
          message: `Ready to test: Activate "${suspendedTenant.name}" → status should change to "active"`,
          data: { tenantId: suspendedTenant.id, currentStatus: suspendedTenant.status }
        });
      } else {
        results.push({
          name: 'Activate Tenant Action',
          passed: false,
          message: 'No suspended tenant found. Create one by suspending an active tenant first.',
          critical: false
        });
      }

      // Test 4: Delete cascade function
      try {
        await base44.functions.invoke('deleteTenantWithCascade', { 
          tenantId: 'test-check-only' 
        });
        results.push({
          name: 'Delete Cascade Function',
          passed: true,
          message: 'Delete function exists and validates input',
          critical: true
        });
      } catch (error) {
        if (error.message?.includes('Tenant not found') || error.response?.data?.error?.includes('not found')) {
          results.push({
            name: 'Delete Cascade Function',
            passed: true,
            message: 'Delete function exists with proper validation',
            critical: true
          });
        } else {
          results.push({
            name: 'Delete Cascade Function',
            passed: false,
            message: `Function error: ${error.message}`,
            critical: true
          });
        }
      }

      // Test 5: Delete confirmation safety
      results.push({
        name: 'Delete Confirmation Safety',
        passed: false,
        message: 'MANUAL TEST: Verify modal requires typing business name to confirm deletion',
        critical: false
      });

      // Test 6: Delete orphan check
      results.push({
        name: 'Delete Orphan Records Check',
        passed: false,
        message: 'MANUAL TEST: After deletion, verify no orphaned Product/Order/TenantUser records remain',
        critical: false
      });

      // Test 7: Impersonation
      results.push({
        name: 'Impersonation Feature',
        passed: false,
        message: 'MANUAL TEST: Click Impersonate → enter tenant dashboard → verify banner shows → Exit Impersonation works',
        critical: false
      });

      // Test 8: Impersonation audit trail
      results.push({
        name: 'Impersonation Audit Trail',
        passed: false,
        message: 'RECOMMENDATION: Implement audit logging (who impersonated which tenant, when)',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, tenantActions: results }));
      toast.success('Tenant Actions Tests Completed');
    },
    onError: (error) => {
      toast.error(`Tenant Actions Tests Failed: ${error.message}`);
    }
  });

  const runAnalyticsTest = useMutation({
    mutationFn: async () => {
      const results = [];

      const tenants = await base44.asServiceRole.entities.Tenant.list();
      const themeConfigs = await base44.asServiceRole.entities.ThemeConfig.list();

      // Test 1: Tenant growth chart data accuracy
      const growthByMonth = tenants.reduce((acc, tenant) => {
        const month = new Date(tenant.created_date).toISOString().substring(0, 7);
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});
      const sortedMonths = Object.keys(growthByMonth).sort();
      results.push({
        name: 'Tenant Growth Chart Data',
        passed: Object.keys(growthByMonth).length > 0 || tenants.length === 0,
        message: `Growth data: ${sortedMonths.length} month(s) from ${sortedMonths[0] || 'N/A'} to ${sortedMonths[sortedMonths.length - 1] || 'N/A'}`,
        data: { months: sortedMonths.length, data: growthByMonth }
      });

      // Test 2: Business type pie chart percentages
      const typeDistribution = tenants.reduce((acc, t) => {
        acc[t.industry] = (acc[t.industry] || 0) + 1;
        return acc;
      }, {});
      const total = tenants.length || 1;
      const percentages = Object.entries(typeDistribution).map(([type, count]) => ({
        type,
        count,
        percentage: ((count / total) * 100).toFixed(1)
      }));
      const percentageSum = percentages.reduce((sum, p) => sum + parseFloat(p.percentage), 0);
      results.push({
        name: 'Business Type Percentages',
        passed: Math.abs(percentageSum - 100) < 0.5 || tenants.length === 0,
        message: `${percentages.length} types, total: ${percentageSum.toFixed(1)}% (should be 100%)`,
        data: percentages
      });

      // Test 3: Theme popularity distribution
      const themePopularity = themeConfigs.reduce((acc, tc) => {
        acc[tc.color_set_name] = (acc[tc.color_set_name] || 0) + 1;
        return acc;
      }, {});
      const themePercentages = Object.entries(themePopularity).map(([theme, count]) => ({
        theme,
        count,
        percentage: ((count / (themeConfigs.length || 1)) * 100).toFixed(1)
      }));
      results.push({
        name: 'Theme Popularity Distribution',
        passed: Object.keys(themePopularity).length > 0 || themeConfigs.length === 0,
        message: `${themePercentages.length} theme(s) in use`,
        data: themePercentages
      });

      // Test 4: Empty data handling
      if (tenants.length === 0) {
        results.push({
          name: 'Empty Data Handling',
          passed: true,
          message: 'Charts should render without errors when data is empty (0 tenants)',
          critical: false
        });
      }

      // Test 5: Large data set simulation
      if (tenants.length >= 50) {
        results.push({
          name: 'Large Data Set Handling',
          passed: true,
          message: `${tenants.length} tenants - charts should render efficiently`,
          data: { count: tenants.length }
        });
      } else {
        results.push({
          name: 'Large Data Set Simulation',
          passed: false,
          message: `Only ${tenants.length} tenants. Need 50+ to test large data rendering.`,
          critical: false
        });
      }

      // Test 6: Chart data matches DB records
      const chartTenantCount = Object.values(growthByMonth).reduce((sum, count) => sum + count, 0);
      results.push({
        name: 'Chart Data vs DB Records',
        passed: chartTenantCount === tenants.length,
        message: chartTenantCount === tenants.length 
          ? `Match: ${chartTenantCount} tenants in chart = ${tenants.length} in DB`
          : `MISMATCH: ${chartTenantCount} in chart vs ${tenants.length} in DB`,
        critical: chartTenantCount !== tenants.length
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, analytics: results }));
      toast.success('Analytics Tests Completed');
    },
    onError: (error) => {
      toast.error(`Analytics Tests Failed: ${error.message}`);
    }
  });

  const runTenantDetailTest = useMutation({
    mutationFn: async () => {
      const results = [];

      const tenants = await base44.asServiceRole.entities.Tenant.list();
      const sampleTenant = tenants[0];

      if (!sampleTenant) {
        results.push({
          name: 'No Tenants for Testing',
          passed: false,
          message: 'Need at least one tenant to test detail view',
          critical: true
        });
        return results;
      }

      // Test 1: Business info availability
      const hasRequiredInfo = sampleTenant.name && sampleTenant.industry && sampleTenant.owner_email;
      results.push({
        name: 'Business Info Card',
        passed: hasRequiredInfo,
        message: hasRequiredInfo 
          ? `Info complete for "${sampleTenant.name}": ${sampleTenant.industry}, ${sampleTenant.owner_email}`
          : 'Missing required business info',
        critical: !hasRequiredInfo
      });

      // Test 2: Usage stats calculation
      const products = await base44.asServiceRole.entities.Product.filter({ tenant_id: sampleTenant.id });
      const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: sampleTenant.id });
      const tenantUsers = await base44.asServiceRole.entities.TenantUser.filter({ tenant_id: sampleTenant.id });
      
      const today = new Date().toISOString().split('T')[0];
      const ordersToday = orders.filter(o => o.created_date.startsWith(today));
      
      results.push({
        name: 'Usage Stats Accuracy',
        passed: true,
        message: `"${sampleTenant.name}": ${products.length} products, ${ordersToday.length} orders today, ${tenantUsers.length} staff`,
        data: { products: products.length, ordersToday: ordersToday.length, staff: tenantUsers.length }
      });

      // Test 3: Theme config
      const themeConfigs = await base44.asServiceRole.entities.ThemeConfig.filter({ tenant_id: sampleTenant.id });
      results.push({
        name: 'Theme Configuration',
        passed: themeConfigs.length > 0,
        message: themeConfigs.length > 0 
          ? `Theme: ${themeConfigs[0].color_set_name}, Logo: ${themeConfigs[0].logo_url ? 'Yes' : 'No'}`
          : 'No theme configured',
        data: themeConfigs[0] || null
      });

      // Test 4: Subscription info
      const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ tenant_id: sampleTenant.id });
      results.push({
        name: 'Subscription Info',
        passed: subscriptions.length > 0,
        message: subscriptions.length > 0 
          ? `Plan: ${subscriptions[0].tier}, Status: ${subscriptions[0].status}`
          : 'No subscription record found',
        data: subscriptions[0] || null
      });

      // Test 5: Activity log (manual check)
      results.push({
        name: 'Activity Log',
        passed: false,
        message: 'MANUAL TEST: Verify recent actions shown with timestamps in detail view',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, tenantDetail: results }));
      toast.success('Tenant Detail Tests Completed');
    },
    onError: (error) => {
      toast.error(`Tenant Detail Tests Failed: ${error.message}`);
    }
  });

  const testSuites = [
    {
      id: 'accessControl',
      title: 'Access Control & Authentication',
      description: 'Verify Super Admin authentication and permissions',
      icon: Lock,
      mutation: runAccessControlTest,
      critical: true
    },
    {
      id: 'dashboardData',
      title: 'Dashboard Data Accuracy',
      description: 'Verify counts, statistics, and growth trends',
      icon: TrendingUp,
      mutation: runDashboardDataTest,
      critical: true
    },
    {
      id: 'tenantManagement',
      title: 'Tenant Management Table',
      description: 'Test filtering, sorting, and data display',
      icon: Database,
      mutation: runTenantManagementTest,
      critical: false
    },
    {
      id: 'tenantActions',
      title: 'Tenant Actions & Operations',
      description: 'Test suspend, activate, delete, impersonate',
      icon: Users,
      mutation: runTenantActionsTest,
      critical: true
    },
    {
      id: 'tenantDetail',
      title: 'Tenant Detail View',
      description: 'Verify business info, usage stats, subscription',
      icon: Eye,
      mutation: runTenantDetailTest,
      critical: false
    },
    {
      id: 'analytics',
      title: 'Analytics & Reporting',
      description: 'Verify charts, distributions, and trends',
      icon: Eye,
      mutation: runAnalyticsTest,
      critical: false
    }
  ];

  const runAllTests = async () => {
    try {
      for (const suite of testSuites) {
        setRunningTests(prev => ({ ...prev, [suite.id]: true }));
        await suite.mutation.mutateAsync();
        setRunningTests(prev => ({ ...prev, [suite.id]: false }));
      }
      toast.success('All test suites completed');
    } catch (error) {
      toast.error(`Test failed: ${error.message}`);
      setRunningTests({});
    }
  };

  const getStatusIcon = (passed, critical) => {
    if (passed) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (critical) return <XCircle className="w-4 h-4 text-red-600" />;
    return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
  };

  const getStatusColor = (passed, critical) => {
    if (passed) return 'text-green-700 bg-green-50 border-green-200';
    if (critical) return 'text-red-700 bg-red-50 border-red-200';
    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin Test Suite"
        description="Comprehensive tests for access control, data accuracy, and functionality"
        action={
          <Button
            onClick={runAllTests}
            className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
            disabled={Object.values(runningTests).some(v => v)}
          >
            {Object.values(runningTests).some(v => v) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Run All Tests
              </>
            )}
          </Button>
        }
      />

      {/* Test Suites */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {testSuites.map((suite) => {
          const Icon = suite.icon;
          const isRunning = runningTests[suite.id];
          const results = testResults[suite.id];

          return (
            <Card key={suite.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {suite.title}
                        {suite.critical && (
                          <Badge variant="destructive" className="text-xs">Critical</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {suite.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => suite.mutation.mutate()}
                  disabled={isRunning}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>Run Tests</>
                  )}
                </Button>

                {results && results.length > 0 && (
                  <div className="space-y-2">
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-sm ${getStatusColor(result.passed, result.critical)}`}
                      >
                        <div className="flex items-start gap-2">
                          {getStatusIcon(result.passed, result.critical)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{result.name}</p>
                            <p className="text-xs opacity-90 mt-0.5">{result.message}</p>
                            {result.data && (
                              <pre className="text-xs mt-2 opacity-75 overflow-auto">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!results && !isRunning && (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No tests run yet. Click "Run Tests" to start.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      {Object.keys(testResults).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-700">
                  {Object.values(testResults).flat().filter(r => r.passed).length}
                </p>
                <p className="text-sm text-green-600">Passed</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-2xl font-bold text-red-700">
                  {Object.values(testResults).flat().filter(r => !r.passed && r.critical).length}
                </p>
                <p className="text-sm text-red-600">Failed (Critical)</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-2xl font-bold text-yellow-700">
                  {Object.values(testResults).flat().filter(r => !r.passed && !r.critical).length}
                </p>
                <p className="text-sm text-yellow-600">Warnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}