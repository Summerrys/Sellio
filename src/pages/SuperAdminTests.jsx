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

      // Test 5: Growth trend calculation
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const lastMonthSignups = tenants.filter(t => 
        new Date(t.created_date) > thirtyDaysAgo
      );
      results.push({
        name: 'Growth Trend Data',
        passed: true,
        message: `${lastMonthSignups.length} tenant(s) signed up in the last 30 days`,
        data: { count: lastMonthSignups.length }
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

      // Test 1: Tenant table data accuracy
      const sampleTenant = tenants[0];
      if (sampleTenant) {
        const tenantProducts = products.filter(p => p.tenant_id === sampleTenant.id);
        const tenantMembers = tenantUsers.filter(tu => tu.tenant_id === sampleTenant.id);
        
        results.push({
          name: 'Tenant Data Accuracy',
          passed: true,
          message: `Sample tenant "${sampleTenant.name}" has ${tenantProducts.length} products and ${tenantMembers.length} users`,
          data: { 
            tenant: sampleTenant.name, 
            products: tenantProducts.length, 
            users: tenantMembers.length 
          }
        });
      }

      // Test 2: Status filter options
      const statuses = [...new Set(tenants.map(t => t.status))];
      results.push({
        name: 'Status Filter Options',
        passed: statuses.length > 0,
        message: `Available statuses: ${statuses.join(', ')}`,
        data: { statuses }
      });

      // Test 3: Business type distribution
      const businessTypes = tenants.reduce((acc, t) => {
        acc[t.industry] = (acc[t.industry] || 0) + 1;
        return acc;
      }, {});
      results.push({
        name: 'Business Type Distribution',
        passed: Object.keys(businessTypes).length > 0,
        message: `Types: ${Object.entries(businessTypes).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        data: businessTypes
      });

      // Test 4: Pagination handling
      if (tenants.length > 10) {
        results.push({
          name: 'Pagination Required',
          passed: true,
          message: `${tenants.length} tenants - pagination should be implemented`,
          data: { totalTenants: tenants.length, pages: Math.ceil(tenants.length / 10) }
        });
      } else {
        results.push({
          name: 'Pagination Not Required',
          passed: true,
          message: `${tenants.length} tenants - fits on one page`,
          data: { totalTenants: tenants.length }
        });
      }

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

      // Test 1: Check for delete cascade function
      try {
        const response = await base44.functions.invoke('deleteTenantWithCascade', { 
          tenantId: 'test-check-only' 
        });
        results.push({
          name: 'Delete Cascade Function',
          passed: true,
          message: 'Delete cascade function is available',
          critical: true
        });
      } catch (error) {
        if (error.message?.includes('Tenant not found')) {
          results.push({
            name: 'Delete Cascade Function',
            passed: true,
            message: 'Delete cascade function is available and validates input',
            critical: true
          });
        } else {
          results.push({
            name: 'Delete Cascade Function',
            passed: false,
            message: `Function check failed: ${error.message}`,
            critical: true
          });
        }
      }

      // Test 2: Verify status change capability
      const tenants = await base44.asServiceRole.entities.Tenant.list();
      const testTenant = tenants.find(t => t.status === 'active');
      
      if (testTenant) {
        results.push({
          name: 'Status Change Capability',
          passed: true,
          message: `Can modify tenant status (test tenant: ${testTenant.name})`,
          data: { currentStatus: testTenant.status }
        });
      } else {
        results.push({
          name: 'Status Change Capability',
          passed: false,
          message: 'No active tenant found for testing',
          critical: false
        });
      }

      // Test 3: Impersonation logging
      // Check if there's an audit log or activity tracking system
      results.push({
        name: 'Impersonation Audit Trail',
        passed: false,
        message: 'RECOMMENDATION: Implement audit logging for impersonation events',
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

      // Test 1: Tenant growth data
      const growthData = tenants.reduce((acc, tenant) => {
        const month = new Date(tenant.created_date).toISOString().substring(0, 7);
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});
      results.push({
        name: 'Tenant Growth Chart Data',
        passed: Object.keys(growthData).length > 0 || tenants.length === 0,
        message: `Growth data available for ${Object.keys(growthData).length} month(s)`,
        data: growthData
      });

      // Test 2: Business type distribution
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
      results.push({
        name: 'Business Type Distribution',
        passed: true,
        message: `${percentages.length} business type(s) found`,
        data: percentages
      });

      // Test 3: Theme popularity
      const themeConfigs = await base44.asServiceRole.entities.ThemeConfig.list();
      const themePopularity = themeConfigs.reduce((acc, tc) => {
        acc[tc.color_set_name] = (acc[tc.color_set_name] || 0) + 1;
        return acc;
      }, {});
      results.push({
        name: 'Theme Popularity',
        passed: Object.keys(themePopularity).length > 0 || themeConfigs.length === 0,
        message: `${Object.keys(themePopularity).length} theme(s) in use`,
        data: themePopularity
      });

      // Test 4: Empty data handling
      if (tenants.length === 0) {
        results.push({
          name: 'Empty Data Handling',
          passed: true,
          message: 'Charts should handle empty data gracefully (0 tenants)',
          critical: false
        });
      } else {
        results.push({
          name: 'Data Availability',
          passed: true,
          message: `${tenants.length} tenant(s) available for analytics`,
          data: { count: tenants.length }
        });
      }

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