import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
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
  { label: 'Orders', icon: ClipboardList, page: 'Orders', permission: 'orders.view', color: 'bg-blue-50 text-blue-600 border-blue-100' },
  { label: 'Tables & QR', icon: QrCode, page: 'Tables', permission: 'tables.view', color: 'bg-teal-50 text-teal-600 border-teal-100' },
  { label: 'Products', icon: ShoppingBag, page: 'Products', permission: 'products.view', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  { label: 'Categories', icon: Grid3X3, page: 'Categories', permission: 'categories.view', color: 'bg-pink-50 text-pink-600 border-pink-100' },
  { label: 'Inventory', icon: Package, page: 'Inventory', permission: 'inventory.view', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { label: 'Staff', icon: Users, page: 'UserManagement', permission: 'staff.view', color: 'bg-green-50 text-green-600 border-green-100' },
  { label: 'Roles', icon: Shield, page: 'UserManagement', permission: 'roles.view', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { label: 'Reports', icon: BarChart2, page: 'Reports', permission: 'reports.view', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  { label: 'Settings', icon: Settings, page: 'TenantSettings', permission: 'settings.view', color: 'bg-slate-50 text-slate-600 border-slate-200' },
];

function StatCard({ icon: Icon, label, value, subtext, color, onClick, transparent }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full h-full text-left p-4 rounded-2xl flex items-center gap-3 active:scale-95 transition-transform',
        transparent ? 'bg-transparent border-none shadow-none' : 'border bg-white shadow-sm',
        !transparent && onClick && 'hover:shadow-md cursor-pointer',
        transparent && onClick && 'cursor-pointer'
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

function FeatureCard({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 80, height: 88, flexShrink: 0 }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-3 rounded-2xl active:scale-95 transition-transform',
        color
      )}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
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

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['dashboardInventoryItems', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tenant_id', tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const lowStockCount = products.filter(p => {
    if (!p.track_inventory) return false;
    const inv = inventoryItems.find(i => i.product_id === p.id);
    if (!inv) return false;
    return inv.current_stock > 0 && inv.current_stock < inv.low_stock_threshold;
  }).length;

  const outOfStockCount = products.filter(p => {
    if (!p.track_inventory) return false;
    const inv = inventoryItems.find(i => i.product_id === p.id);
    if (!inv) return false;
    return inv.current_stock === 0;
  }).length;

  const trackedCount = products.filter(p => p.track_inventory).length;

  const stockStatus = outOfStockCount > 0
    ? { value: outOfStockCount, subtext: 'Out of stock', cardClass: 'rounded-2xl border border-red-200 bg-red-50', iconColor: 'bg-red-100 text-red-600', icon: AlertTriangle }
    : lowStockCount > 0
    ? { value: lowStockCount, subtext: 'Low stock', cardClass: 'rounded-2xl border border-amber-200 bg-amber-50', iconColor: 'bg-amber-100 text-amber-600', icon: AlertTriangle }
    : { value: trackedCount, subtext: 'Well stocked', cardClass: 'rounded-2xl border border-green-200 bg-green-50', iconColor: 'bg-green-100 text-green-600', icon: Package };

  const { data: allStaff = [] } = useQuery({
    queryKey: ['dashboardStaff', tenantId],
    queryFn: () => db.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });
  const staff = allStaff.filter(m => m.status === 'active');

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
      <div className="grid grid-cols-2 gap-3" style={{ alignItems: 'stretch' }}>
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
          <div className={cn('h-full', stockStatus.cardClass)}>
            <StatCard
              icon={stockStatus.icon}
              label="Stock Level"
              value={stockStatus.value}
              subtext={stockStatus.subtext}
              color={stockStatus.iconColor}
              onClick={() => navigate(createPageUrl('Inventory'))}
              transparent
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
            onClick={() => navigate(createPageUrl('UserManagement'))}
          />
        </RequirePermission>
      </div>

      {/* Feature Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Quick Access</h2>
        <div
          className="no-scrollbar"
          style={{ display: 'flex', flexDirection: 'row', gap: 10, overflowX: 'auto', overflowY: 'hidden', padding: '4px 2px' }}
        >
          {visibleFeatures.map(f => (
            <FeatureCard
              key={f.page}
              icon={f.icon}
              label={f.label}
              color={f.color}
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