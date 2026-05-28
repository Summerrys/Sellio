import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  { label: 'Orders', icon: ClipboardList, page: 'Orders', permission: 'orders.view' },
  { label: 'Tables & QR', icon: QrCode, page: 'Tables', permission: 'tables.view' },
  { label: 'Products', icon: ShoppingBag, page: 'Products', permission: 'products.view' },
  { label: 'Inventory', icon: Package, page: 'Inventory', permission: 'inventory.view' },
  { label: 'Categories', icon: Grid3X3, page: 'Categories', permission: 'categories.view' },
  { label: 'Reports', icon: BarChart2, page: 'Reports', permission: 'reports.view' },
  { label: 'Staff', icon: Users, page: 'Staff', permission: 'staff.view' },
  { label: 'Roles', icon: Shield, page: 'RoleManagement', permission: 'roles.view' },
  { label: 'Settings', icon: Settings, page: 'TenantSettings', permission: 'settings.view' },
];

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ icon: Icon, label, value, subtext, color, onClick, urgentCard }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-2xl border shadow-sm flex items-center gap-3 active:scale-95 transition-transform',
        urgentCard ? 'bg-amber-50 border-amber-200' : 'bg-white',
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

function FeatureCard({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
      style={{ width: '72px', height: '80px', flexShrink: 0 }}
    >
      <div
        className="flex items-center justify-center rounded-[12px]"
        style={{
          width: '44px',
          height: '44px',
          background: 'rgba(var(--color-primary), 0.10)',
        }}
      >
        <Icon className="w-5 h-5" style={{ color: 'rgb(var(--color-primary))' }} />
      </div>
      <span
        className="truncate text-center leading-tight"
        style={{
          fontSize: '10px',
          fontWeight: 500,
          color: '#475569',
          width: '72px',
        }}
      >
        {label}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const { tenantId, tenant, hasPermission } = useTenant();
  const navigate = useNavigate();

  const { data: todayOrders = [] } = useQuery({
    queryKey: ['todayOrders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('orders').select('*').eq('tenant_id', tenantId);
      return data || [];
    },
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
    queryFn: async () => {
      const supabase = await getSupabase();
      const [{ data: prods }, { data: invItems }] = await Promise.all([
        supabase.from('products').select('id, track_inventory').eq('tenant_id', tenantId),
        supabase.from('inventory_items').select('product_id, current_stock, low_stock_threshold').eq('tenant_id', tenantId),
      ]);
      const invMap = Object.fromEntries((invItems || []).map(i => [i.product_id, i]));
      return (prods || []).map(p => ({
        ...p,
        stock_quantity: invMap[p.id]?.current_stock ?? 0,
        low_stock_threshold: invMap[p.id]?.low_stock_threshold ?? 5,
      }));
    },
    enabled: !!tenantId,
  });

  const lowStockCount = products.filter(p => {
    const stock = p.stock_quantity || 0;
    const threshold = p.low_stock_threshold || 5;
    return stock > 0 && stock < threshold;
  }).length;

  const { data: staff = [] } = useQuery({
    queryKey: ['dashboardStaff', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('tenant_users').select('id').eq('tenant_id', tenantId).eq('status', 'active');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const currency = tenant?.settings?.currency || '$';

  const visibleFeatures = featureCards.filter(f =>
    !f.permission || hasPermission(f.permission)
  );

  const greeting = getTimeGreeting();
  const todayLabel = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {greeting}, {tenant?.name || 'there'} 👋!
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Today's overview · <span className="text-slate-400">{todayLabel}</span></p>
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
          <StatCard
            icon={lowStockCount > 0 ? AlertTriangle : Package}
            label="Low Stock"
            value={lowStockCount}
            subtext={lowStockCount > 0 ? 'Need restock' : 'Well stocked'}
            color={lowStockCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-50 text-green-600'}
            urgentCard={lowStockCount > 0}
            onClick={() => navigate(createPageUrl('Inventory'))}
          />
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
        <div className="overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`
            div:has(> button:first-child) {
              -webkit-overflow-scrolling: touch;
            }
            div:has(> button:first-child)::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          <div className="flex gap-[10px] p-[4px_0]" style={{ width: 'fit-content' }}>
            {visibleFeatures.map(f => (
              <FeatureCard
                key={f.page}
                icon={f.icon}
                label={f.label}
                onClick={() => navigate(createPageUrl(f.page))}
              />
            ))}
          </div>
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