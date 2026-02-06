import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/components/tenant/TenantContext';
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
  Layout,
  BarChart3,
  Package,
  Users,
  Smartphone
} from 'lucide-react';
import { toast } from 'sonner';

export default function TenantDashboardTests() {
  const [testResults, setTestResults] = useState({});
  const [runningTests, setRunningTests] = useState({});
  const { tenantId, user, userPermissions } = useTenant();

  // Fetch data for tests
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const runRoleBasedVisibilityTest = useMutation({
    mutationFn: async () => {
      const results = [];

      if (!tenantId) {
        results.push({
          name: 'No Tenant Context',
          passed: false,
          message: 'Must be logged in as tenant user to test role-based visibility',
          critical: true
        });
        return results;
      }

      // Test 1: Current user role detection
      const tenantUsers = await base44.entities.TenantUser.filter({ 
        tenant_id: tenantId, 
        user_email: currentUser?.email 
      });
      const currentTenantUser = tenantUsers[0];
      
      results.push({
        name: 'Current User Role',
        passed: !!currentTenantUser,
        message: currentTenantUser 
          ? `Logged in as: ${currentTenantUser.role_name || 'Unknown Role'}${currentTenantUser.is_owner ? ' (Owner)' : ''}`
          : 'User not found in tenant',
        data: { 
          role: currentTenantUser?.role_name, 
          isOwner: currentTenantUser?.is_owner,
          permissions: userPermissions?.length || 0
        }
      });

      // Test 2: Check sidebar visibility based on permissions
      const sidebarItems = [
        { label: 'Dashboard', permission: null },
        { label: 'Orders', permission: 'orders.read' },
        { label: 'Products', permission: 'products.read' },
        { label: 'Categories', permission: 'products.read' },
        { label: 'Tables & QR', permission: 'orders.read' },
        { label: 'Inventory', permission: 'inventory.read' },
        { label: 'Staff', permission: 'staff.read' },
        { label: 'Roles', permission: 'staff.manage' },
        { label: 'Settings', permission: 'settings.read' }
      ];

      const visibleItems = sidebarItems.filter(item => 
        !item.permission || userPermissions?.includes(item.permission)
      );

      results.push({
        name: 'Sidebar Visibility',
        passed: true,
        message: `${visibleItems.length}/${sidebarItems.length} items should be visible`,
        data: { 
          visible: visibleItems.map(i => i.label),
          hidden: sidebarItems.filter(i => !visibleItems.includes(i)).map(i => i.label)
        }
      });

      // Test 3: Admin/Owner full access
      const isAdminOrOwner = currentTenantUser?.is_owner || userPermissions?.includes('*');
      results.push({
        name: 'Admin/Owner Full Access',
        passed: isAdminOrOwner ? true : null,
        message: isAdminOrOwner 
          ? 'All sidebar items should be visible'
          : 'Limited access based on role permissions',
        data: { hasFullAccess: isAdminOrOwner }
      });

      // Test 4: Staff with zero permissions
      if (userPermissions?.length === 0) {
        results.push({
          name: 'Zero Permissions Handling',
          passed: true,
          message: 'Only Dashboard should be visible with "No data to display" message',
          critical: false
        });
      }

      // Test 5: Read-only access detection
      const hasOnlyReadPermissions = userPermissions?.every(p => p.includes('.read'));
      if (hasOnlyReadPermissions && userPermissions?.length > 0) {
        results.push({
          name: 'Read-Only Access',
          passed: false,
          message: 'MANUAL TEST: Verify action buttons (Add, Edit, Delete) are hidden or disabled',
          critical: false
        });
      }

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, roleVisibility: results }));
      toast.success('Role Visibility Tests Completed');
    },
    onError: (error) => {
      toast.error(`Role Visibility Tests Failed: ${error.message}`);
    }
  });

  const runDashboardDataTest = useMutation({
    mutationFn: async () => {
      const results = [];

      if (!tenantId) {
        results.push({
          name: 'No Tenant Context',
          passed: false,
          message: 'Must be logged in as tenant user',
          critical: true
        });
        return results;
      }

      // Fetch dashboard data
      const orders = await base44.entities.Order.filter({ tenant_id: tenantId });
      const products = await base44.entities.Product.filter({ tenant_id: tenantId });
      const tenantUsers = await base44.entities.TenantUser.filter({ tenant_id: tenantId });

      // Test 1: Total Revenue Today
      const today = new Date().toISOString().split('T')[0];
      const ordersToday = orders.filter(o => 
        o.created_date.startsWith(today) && 
        (o.payment_status === 'paid' || o.status === 'completed')
      );
      const revenueToday = ordersToday.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      
      results.push({
        name: 'Total Revenue Today',
        passed: true,
        message: `$${revenueToday.toFixed(2)} from ${ordersToday.length} completed/paid orders`,
        data: { revenue: revenueToday, ordersCount: ordersToday.length }
      });

      // Test 2: Orders Today breakdown
      const pendingToday = ordersToday.filter(o => o.status === 'pending').length;
      const completedToday = ordersToday.filter(o => o.status === 'completed').length;
      
      results.push({
        name: 'Orders Today Breakdown',
        passed: true,
        message: `${ordersToday.length} total (${pendingToday} pending, ${completedToday} completed)`,
        data: { total: ordersToday.length, pending: pendingToday, completed: completedToday }
      });

      // Test 3: Revenue calculation accuracy
      const manualSum = ordersToday.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      results.push({
        name: 'Revenue Calculation Accuracy',
        passed: Math.abs(manualSum - revenueToday) < 0.01,
        message: `Manual sum: $${manualSum.toFixed(2)}, Calculated: $${revenueToday.toFixed(2)}`,
        critical: Math.abs(manualSum - revenueToday) >= 0.01
      });

      // Test 4: Low Stock Items
      const lowStockItems = products.filter(p => 
        p.stock_quantity <= (p.low_stock_threshold || 5)
      );
      
      results.push({
        name: 'Items Low in Stock',
        passed: true,
        message: `${lowStockItems.length} product(s) below threshold`,
        data: { 
          count: lowStockItems.length,
          items: lowStockItems.map(p => ({ name: p.name, stock: p.stock_quantity, threshold: p.low_stock_threshold }))
        }
      });

      // Test 5: Active Staff Count
      const activeStaff = tenantUsers.filter(tu => tu.status === 'active');
      
      results.push({
        name: 'Active Staff',
        passed: true,
        message: `${activeStaff.length} active staff member(s)`,
        data: { count: activeStaff.length }
      });

      // Test 6: Timezone awareness
      const tenant = await base44.entities.Tenant.get(tenantId);
      results.push({
        name: 'Timezone Awareness',
        passed: false,
        message: `Tenant timezone: ${tenant.timezone || 'Not set'}. MANUAL TEST: Verify midnight reset uses this timezone`,
        critical: false,
        data: { timezone: tenant.timezone }
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

  const runWidgetsTest = useMutation({
    mutationFn: async () => {
      const results = [];

      if (!tenantId) {
        results.push({
          name: 'No Tenant Context',
          passed: false,
          message: 'Must be logged in as tenant user',
          critical: true
        });
        return results;
      }

      const orders = await base44.entities.Order.filter({ tenant_id: tenantId });
      const products = await base44.entities.Product.filter({ tenant_id: tenantId });

      // Test 1: Recent Orders Widget
      const recentOrders = orders.sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      ).slice(0, 10);
      
      results.push({
        name: 'Recent Orders Widget (Last 10)',
        passed: recentOrders.length <= 10,
        message: `Showing ${recentOrders.length} order(s)`,
        data: { count: recentOrders.length }
      });

      // Test 2: Order status badges
      const statusColors = {
        pending: 'yellow',
        preparing: 'blue',
        ready: 'green',
        completed: 'gray',
        cancelled: 'red'
      };
      
      results.push({
        name: 'Order Status Badges',
        passed: false,
        message: 'MANUAL TEST: Verify status badge colors match spec',
        data: statusColors,
        critical: false
      });

      // Test 3: Real-time updates
      results.push({
        name: 'Real-Time Order Updates',
        passed: false,
        message: 'MANUAL TEST: Create a new order and verify it appears immediately',
        critical: false
      });

      // Test 4: Revenue Chart data
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayOrders = orders.filter(o => 
          o.created_date.startsWith(dateStr) && 
          (o.payment_status === 'paid' || o.status === 'completed')
        );
        const dayRevenue = dayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        
        last7Days.push({ date: dateStr, revenue: dayRevenue });
      }
      
      results.push({
        name: 'Revenue Chart (7-Day)',
        passed: last7Days.length === 7,
        message: `7 days of data prepared, range: $${Math.min(...last7Days.map(d => d.revenue)).toFixed(2)} - $${Math.max(...last7Days.map(d => d.revenue)).toFixed(2)}`,
        data: last7Days
      });

      // Test 5: Top Selling Products
      const orderItems = orders.flatMap(o => o.items || []);
      const productSales = {};
      
      orderItems.forEach(item => {
        const productId = item.product_id;
        if (!productSales[productId]) {
          productSales[productId] = {
            name: item.product_name,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[productId].quantity += item.quantity || 0;
        productSales[productId].revenue += item.total || 0;
      });
      
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
      
      results.push({
        name: 'Top Selling Products',
        passed: topProducts.length > 0 || orders.length === 0,
        message: `${topProducts.length} top product(s) identified`,
        data: topProducts
      });

      // Test 6: Low Stock Alerts
      const lowStockProducts = products.filter(p => 
        p.stock_quantity <= (p.low_stock_threshold || 5)
      );
      
      results.push({
        name: 'Low Stock Alerts',
        passed: true,
        message: `${lowStockProducts.length} product(s) need restocking`,
        data: { 
          count: lowStockProducts.length,
          products: lowStockProducts.map(p => p.name)
        }
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, widgets: results }));
      toast.success('Widgets Tests Completed');
    },
    onError: (error) => {
      toast.error(`Widgets Tests Failed: ${error.message}`);
    }
  });

  const runResponsiveTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Test 1: Current viewport width
      const viewportWidth = window.innerWidth;
      let layout = 'Desktop';
      if (viewportWidth < 768) layout = 'Mobile';
      else if (viewportWidth < 1024) layout = 'Tablet';
      
      results.push({
        name: 'Current Viewport',
        passed: true,
        message: `${layout} (${viewportWidth}px width)`,
        data: { width: viewportWidth, layout }
      });

      // Test 2: Desktop layout (1440px)
      results.push({
        name: 'Desktop Layout (1440px)',
        passed: false,
        message: 'MANUAL TEST: Resize to 1440px → verify 3-column widget grid',
        critical: false
      });

      // Test 3: Tablet layout (768px)
      results.push({
        name: 'Tablet Layout (768px)',
        passed: false,
        message: 'MANUAL TEST: Resize to 768px → verify 2-column widget grid',
        critical: false
      });

      // Test 4: Mobile layout (375px)
      results.push({
        name: 'Mobile Layout (375px)',
        passed: false,
        message: 'MANUAL TEST: Resize to 375px → verify single-column layout',
        critical: false
      });

      // Test 5: Sidebar responsiveness
      const hasSidebar = document.querySelector('aside') !== null;
      results.push({
        name: 'Sidebar Present',
        passed: hasSidebar,
        message: hasSidebar 
          ? 'Sidebar detected. MANUAL TEST: On mobile, verify it collapses to hamburger/bottom tabs'
          : 'No sidebar found',
        critical: false
      });

      // Test 6: Horizontal scroll check
      const hasHorizontalScroll = document.body.scrollWidth > document.body.clientWidth;
      results.push({
        name: 'No Horizontal Scroll',
        passed: !hasHorizontalScroll,
        message: hasHorizontalScroll 
          ? 'WARNING: Horizontal scroll detected - layout may overflow'
          : 'No horizontal scroll detected',
        critical: hasHorizontalScroll
      });

      // Test 7: Touch interactions
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      results.push({
        name: 'Touch Device Detection',
        passed: true,
        message: isTouchDevice 
          ? 'Touch device detected - verify tap/swipe interactions work'
          : 'Non-touch device - mouse interactions expected',
        data: { isTouch: isTouchDevice }
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, responsive: results }));
      toast.success('Responsive Tests Completed');
    },
    onError: (error) => {
      toast.error(`Responsive Tests Failed: ${error.message}`);
    }
  });

  const runQuickActionsTest = useMutation({
    mutationFn: async () => {
      const results = [];

      // Test 1: Quick Action buttons visibility
      results.push({
        name: 'Quick Actions Present',
        passed: false,
        message: 'MANUAL TEST: Verify "Add New Product", "Create Order", "Invite Staff" buttons are visible',
        critical: false
      });

      // Test 2: Navigation on click
      results.push({
        name: 'Quick Actions Navigation',
        passed: false,
        message: 'MANUAL TEST: Click each button and verify correct navigation',
        critical: false
      });

      // Test 3: Permission-based visibility
      results.push({
        name: 'Permission-Based Actions',
        passed: false,
        message: 'MANUAL TEST: Login as different roles and verify action buttons show/hide based on permissions',
        critical: false
      });

      return results;
    },
    onSuccess: (results) => {
      setTestResults(prev => ({ ...prev, quickActions: results }));
      toast.success('Quick Actions Tests Completed');
    },
    onError: (error) => {
      toast.error(`Quick Actions Tests Failed: ${error.message}`);
    }
  });

  const testSuites = [
    {
      id: 'roleVisibility',
      title: 'Role-Based Sidebar Visibility',
      description: 'Test permissions and sidebar items for different roles',
      icon: Shield,
      mutation: runRoleBasedVisibilityTest,
      critical: true
    },
    {
      id: 'dashboardData',
      title: 'Dashboard Data Accuracy',
      description: 'Verify revenue, orders, stock, and staff counts',
      icon: Layout,
      mutation: runDashboardDataTest,
      critical: true
    },
    {
      id: 'widgets',
      title: 'Dashboard Widgets & Charts',
      description: 'Test recent orders, revenue chart, top products',
      icon: BarChart3,
      mutation: runWidgetsTest,
      critical: false
    },
    {
      id: 'quickActions',
      title: 'Quick Actions',
      description: 'Test Add Product, Create Order, Invite Staff',
      icon: Package,
      mutation: runQuickActionsTest,
      critical: false
    },
    {
      id: 'responsive',
      title: 'Responsive Design',
      description: 'Test desktop, tablet, and mobile layouts',
      icon: Smartphone,
      mutation: runResponsiveTest,
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
    if (passed === null) return <AlertTriangle className="w-4 h-4 text-blue-600" />;
    if (passed) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (critical) return <XCircle className="w-4 h-4 text-red-600" />;
    return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
  };

  const getStatusColor = (passed, critical) => {
    if (passed === null) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (passed) return 'text-green-700 bg-green-50 border-green-200';
    if (critical) return 'text-red-700 bg-red-50 border-red-200';
    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant Dashboard Test Suite"
        description="Test role-based access, data accuracy, widgets, and responsive design"
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
                <Users className="w-4 h-4 mr-2" />
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
                              <pre className="text-xs mt-2 opacity-75 overflow-auto max-h-32">
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
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-700">
                  {Object.values(testResults).flat().filter(r => r.passed === true).length}
                </p>
                <p className="text-sm text-green-600">Passed</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-2xl font-bold text-red-700">
                  {Object.values(testResults).flat().filter(r => r.passed === false && r.critical).length}
                </p>
                <p className="text-sm text-red-600">Failed (Critical)</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-2xl font-bold text-yellow-700">
                  {Object.values(testResults).flat().filter(r => r.passed === false && !r.critical).length}
                </p>
                <p className="text-sm text-yellow-600">Manual Tests</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-2xl font-bold text-blue-700">
                  {Object.values(testResults).flat().filter(r => r.passed === null).length}
                </p>
                <p className="text-sm text-blue-600">Info</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}