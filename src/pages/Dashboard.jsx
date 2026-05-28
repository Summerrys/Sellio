import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import db from '@/lib/db';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import RecentOrders from '../components/dashboard/RecentOrders';
import RevenueChart from '../components/dashboard/RevenueChart';
import {
  DollarSign, ShoppingCart, Package, Users,
  ClipboardList, ShoppingBag, Grid3X3, QrCode,
  Shield, Settings, BarChart2, ChevronRight, AlertTriangle
} from 'lucide-react';
import { startOfDay, endOfDay } from 'date-fns';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

const featureCards = [
  { label: 'Orders', icon: ClipboardList, page: 'Orders', permission: 'orders.view', bg: '#3b82f6' },
  { label: 'Tables & QR', icon: QrCode, page: 'Tables', permission: 'tables.view', bg: '#14b8a6' },
  { label: 'Products', icon: ShoppingBag, page: 'Products', permission: 'products.view', bg: '#a855f7' },
  { label: 'Categories', icon: Grid3X3, page: 'Categories', permission: 'categories.view', bg: '#ec4899' },
  { label: 'Inventory', icon: Package, page: 'Inventory', permission: 'inventory.view', bg: '#f59e0b' },
  { label: 'Staff', icon: Users, page: 'Staff', permission: 'staff.view', bg: '#22c55e' },
  { label: 'Roles', icon: Shield, page: 'RoleManagement', permission: 'roles.view', bg: '#6366f1' },
  { label: 'Reports', icon: BarChart2, page: 'Reports', permission: 'reports.view', bg: '#f43f5e' },
  { label: 'Settings', icon: Settings, page: 'TenantSettings', permission: 'settings.view', bg: '#64748b' },
];

function StatCard({ icon: Icon, label, value, subtext, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-2xl border bg-white shadow-sm flex items-center gap-3 active:scale-95 transition-transform',
        onClick && 'hover:shadow-md cursor-pointer'
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
        {subtext && <p className="text-xs text-slate-400 leading-tight">{subtext}</p>}
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
    </button>
  );
}

function FeatureCard({ icon: Icon, label, bg, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center active:scale-95 transition-transform"
      style={{ width: 80, height: 90, borderRadius: 14, backgroundColor: bg, gap: 6 }}
    >
      <Icon className="text-white" style={{ width: 28, height: 28 }} />
      <span className="text-white text-center leading-tight" style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const { tenantId, tenant, hasPermission } = useTenant();
  const navigate = useNavigate();

  const { data: todayOrders = [] } = useQuery({
    queryKey: ['todayOrders', tenantId],
    queryFn: () => db.entities.Order.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const todayOrdersFiltered = todayOrders.filter(o => {
    const orderDate = new Date(o.created_date);
    return orderDate >= startOfDay(new Date()) && orderDate <= endOfDay(new Date());
  });

  const todayRevenue = todayOrdersFiltered
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const pendingOrders = todayOrdersFiltered.filter(o => o.status === 'pending' || o.status === 'confirmed').length;

  const { data: products = [] } = useQuery({
    queryKey: ['dashboardProducts', tenantId],
    queryFn: () => db.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const lowStockCount = products.filter(p =>
    (p.stock_quantity || 0) <= (p.low_stock_threshold || 5)
  ).length;

  const { data: staff = [] } = useQuery({
    queryKey: ['dashboardStaff', tenantId],
    queryFn: () => db.entities.TenantUser.filter({ tenant_id: tenantId, status: 'active' }),
    enabled: !!tenantId,
  });

  const currency = tenant?.settings?.currency || '$';

  const visibleFeatures = featureCards.filter(f =>
    !f.permission || hasPermission(f.permission)
  );

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {getGreeting()}, {tenant?.name || 'there'} 👋!
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Today's overview</p>
        <p className="text-xs text-slate-400 mt-0.5">{todayLabel}</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <RequirePermission permission="orders.view" silent>
          <StatCard
            icon={DollarSign}
            label="Revenue Today"
            value={`${currency}${todayRevenue.toFixed(2)}`}
            color="bg-blue-50 text-blue-600"
            onClick={() => navigate(createPageUrl('Reports'))}
          />
        </RequirePermission>

        <RequirePermission permission="orders.view" silent>
          <StatCard
            icon={ShoppingCart}
            label="Orders Today"
            value={todayOrdersFiltered.length}
            subtext={pendingOrders > 0 ? `${pendingOrders} pending` : 'All clear'}
            color="bg-purple-50 text-purple-600"
            onClick={() => navigate(createPageUrl('Orders'))}
          />
        </RequirePermission>

        <RequirePermission permission="inventory.view" silent>
          <div className={cn(lowStockCount > 0 ? 'rounded-2xl border border-amber-200 bg-amber-50' : '')}>
            <StatCard
              icon={lowStockCount > 0 ? AlertTriangle : Package}
              label="Low Stock"
              value={lowStockCount}
              subtext={lowStockCount > 0 ? 'Need restocking' : 'Well stocked'}
              color={lowStockCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-50 text-green-600'}
              onClick={() => navigate(createPageUrl('Inventory'))}
            />
          </div>
        </RequirePermission>

        <RequirePermission permission="staff.view" silent>
          <StatCard
            icon={Users}
            label="Active Staff"
            value={staff.length}
            subtext="Team members"
            color="bg-teal-50 text-teal-600"
            onClick={() => navigate(createPageUrl('Staff'))}
          />
        </RequirePermission>
      </div>

      {/* Feature Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Quick Access</h2>
        <div className="flex flex-wrap gap-3">
          {visibleFeatures.map(f => (
            <FeatureCard
              key={f.page}
              icon={f.icon}
              label={f.label}
              bg={f.bg}
              onClick={() => navigate(createPageUrl(f.page))}
            />
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <RequirePermission permission="orders.view" silent>
        <RecentOrders tenantId={tenantId} />
      </RequirePermission>

      {/* Revenue Chart */}
      <RequirePermission permission="reports.view" silent>
        <RevenueChart tenantId={tenantId} />
      </RequirePermission>
    </div>
  );
}