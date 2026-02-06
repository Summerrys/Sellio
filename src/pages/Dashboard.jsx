import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import TodayCard from '../components/dashboard/TodayCard';
import RecentOrders from '../components/dashboard/RecentOrders';
import RevenueChart from '../components/dashboard/RevenueChart';
import TopProducts from '../components/dashboard/TopProducts';
import LowStockAlerts from '../components/dashboard/LowStockAlerts';
import QuickActions from '../components/dashboard/QuickActions';
import { DollarSign, ShoppingCart, Package, Users } from 'lucide-react';
import { startOfDay, endOfDay } from 'date-fns';

export default function Dashboard() {
  const { tenantId, tenant } = useTenant();

  // Fetch today's orders
  const { data: todayOrders = [] } = useQuery({
    queryKey: ['todayOrders', tenantId],
    queryFn: () => base44.entities.Order.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const todayOrdersFiltered = todayOrders.filter(o => {
    const orderDate = new Date(o.created_date);
    return orderDate >= startOfDay(new Date()) && orderDate <= endOfDay(new Date());
  });

  const todayRevenue = todayOrdersFiltered
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const pendingOrders = todayOrdersFiltered.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
  const completedOrders = todayOrdersFiltered.filter(o => o.status === 'completed').length;

  // Fetch products for low stock count
  const { data: products = [] } = useQuery({
    queryKey: ['dashboardProducts', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const lowStockCount = products.filter(p => 
    (p.stock_quantity || 0) <= (p.low_stock_threshold || 5)
  ).length;

  // Fetch staff count
  const { data: staff = [] } = useQuery({
    queryKey: ['dashboardStaff', tenantId],
    queryFn: () => base44.entities.TenantUser.filter({ tenant_id: tenantId, status: 'active' }),
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back! 👋
        </h1>
        <p className="text-slate-500 mt-1">
          Here's what's happening with {tenant?.name || 'your business'} today
        </p>
      </div>

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RequirePermission permission="orders.view" silent>
          <TodayCard
            icon={DollarSign}
            label="Revenue Today"
            value={`$${todayRevenue.toFixed(2)}`}
            color="primary"
          />
        </RequirePermission>

        <RequirePermission permission="orders.view" silent>
          <TodayCard
            icon={ShoppingCart}
            label="Orders Today"
            value={todayOrdersFiltered.length}
            subtext={`${pendingOrders} pending • ${completedOrders} completed`}
            color="blue"
          />
        </RequirePermission>

        <RequirePermission permission="inventory.view" silent>
          <TodayCard
            icon={Package}
            label="Low Stock Items"
            value={lowStockCount}
            subtext="Need attention"
            color="amber"
          />
        </RequirePermission>

        <RequirePermission permission="staff.view" silent>
          <TodayCard
            icon={Users}
            label="Active Staff"
            value={staff.length}
            subtext="Team members"
            color="green"
          />
        </RequirePermission>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Orders & Revenue */}
        <div className="lg:col-span-2 space-y-6">
          <RequirePermission permission="orders.view" silent>
            <RecentOrders tenantId={tenantId} />
          </RequirePermission>

          <RequirePermission permission="reports.view" silent>
            <RevenueChart tenantId={tenantId} />
          </RequirePermission>

          <RequirePermission permission="reports.view" silent>
            <TopProducts tenantId={tenantId} />
          </RequirePermission>
        </div>

        {/* Right Column - Alerts & Actions */}
        <div className="space-y-6">
          <QuickActions />

          <RequirePermission permission="inventory.view" silent>
            <LowStockAlerts tenantId={tenantId} />
          </RequirePermission>
        </div>
      </div>
    </div>
  );
}