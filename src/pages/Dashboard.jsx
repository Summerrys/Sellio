import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import RecentOrders from '../components/dashboard/RecentOrders';
import RevenueChart from '../components/dashboard/RevenueChart';
import {
  DollarSign, ShoppingCart, Package, Users,
  ClipboardList, ShoppingBag, Grid3X3, QrCode,
  Shield, Settings, BarChart2, ChevronRight, AlertTriangle, Paintbrush
} from 'lucide-react';
import StorefrontDesigner from '../components/storefront/StorefrontDesigner';
import MerchantAssistantWidget from '../components/merchant/MerchantAssistantWidget';
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

function StatCard({ icon: Icon, label, value, subtext, color, onClick, transparent, compact }) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl active:scale-95 transition-transform',
          transparent ? 'bg-transparent border-none' : 'bg-white border border-slate-100 shadow-sm',
          onClick && 'cursor-pointer'
        )}
      >
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mb-0.5', color)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-sm font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-[10px] text-slate-400 font-medium text-center leading-tight">{label}</p>
        {subtext && <p className="text-[9px] text-slate-300 leading-tight">{subtext}</p>}
      </button>
    );
  }
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
  const queryClient = useQueryClient();
  const [showDesigner, setShowDesigner] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      toast.success('Your plan has been upgraded successfully.');
      window.history.replaceState(null, '', window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    }
  }, []);

  const { data: todayStats = { count: 0, revenue: 0, pending: 0 } } = useQuery({
    queryKey: ['todayOrders', tenantId],
    queryFn: async () => {
      const supabaseClient = await getSupabase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count ALL orders today (all statuses)
      const { count } = await supabaseClient
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_date', today.toISOString());

      // Revenue (paid orders today)
      const { data: paidOrders } = await supabaseClient
        .from('orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'paid')
        .gte('created_date', today.toISOString());

      const revenue = (paidOrders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);

      // Pending count
      const { count: pending } = await supabaseClient
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'confirmed'])
        .gte('created_date', today.toISOString());

      return { count: count || 0, revenue, pending: pending || 0 };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const todayRevenue = todayStats.revenue;
  const pendingOrders = todayStats.pending;

  const { data: products = [] } = useQuery({
    queryKey: ['dashboardProducts', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('products').select('id,track_inventory').eq('tenant_id', tenantId);
      return data || [];
    },
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
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('tenant_users').select('id,status').eq('tenant_id', tenantId);
      return data || [];
    },
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {getGreeting()}, {tenant?.name || 'there'}{' '}
              <button
                onClick={() => setAiOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', marginLeft: 4 }}
                title="Ask Sellio AI"
              >
                <img
                  src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png"
                  alt="Sellio AI"
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))' }}
                />
              </button>
              !
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Today's overview</p>
          <p className="text-xs text-slate-400 mt-0.5">{todayLabel}</p>
        </div>
        {tenant?.slug && (
          <button
            onClick={() => setShowDesigner(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: window.innerWidth < 480 ? '6px 11px' : '7px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #fb923c, #e0449a, #8b5cf6)',
              color: 'white',
              fontSize: window.innerWidth < 480 ? 12 : 13,
              fontWeight: 600,
              boxShadow: '0 2px 12px rgba(224, 68, 154, 0.4)',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.15s, transform 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'scale(1.03)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Paintbrush size={14} color="white" />
            Design Store
          </button>
        )}
      </div>

      <StorefrontDesigner
        open={showDesigner}
        onClose={() => setShowDesigner(false)}
        tenantId={tenantId}
        tenantSlug={tenant?.slug}
      />
      <MerchantAssistantWidget externalOpen={aiOpen} onExternalClose={() => setAiOpen(false)} />

      {/* Stats Row — 4 compact cards always in a row */}
      <div className="grid grid-cols-4 gap-2">
        <RequirePermission permission="orders.view" silent>
          <StatCard
            compact
            icon={DollarSign}
            label="Today's Revenue"
            value={`${currency}${todayRevenue.toFixed(2)}`}
            color="bg-blue-50 text-blue-600"
            onClick={() => navigate(createPageUrl('Reports'))}
          />
        </RequirePermission>

        <RequirePermission permission="orders.view" silent>
          <StatCard
            compact
            icon={ShoppingCart}
            label="Orders Today"
            value={todayStats.count}
            subtext={pendingOrders > 0 ? `${pendingOrders} pending` : undefined}
            color="bg-purple-50 text-purple-600"
            onClick={() => navigate(createPageUrl('Orders'))}
          />
        </RequirePermission>

        <RequirePermission permission="inventory.view" silent>
          <StatCard
            compact
            icon={stockStatus.icon}
            label="Stock"
            value={stockStatus.value}
            subtext={stockStatus.subtext}
            color={stockStatus.iconColor}
            onClick={() => navigate(createPageUrl('Inventory'))}
          />
        </RequirePermission>

        <RequirePermission permission="staff.view" silent>
          <StatCard
            compact
            icon={Users}
            label="Active Staff"
            value={staff.length}
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