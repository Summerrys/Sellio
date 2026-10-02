import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import { useSubscription } from '@/hooks/useSubscription';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import DateRangePicker from '../components/reports/DateRangePicker';
import SalesReport from '../components/reports/SalesReport';
import ProductPerformance from '../components/reports/ProductPerformance';
import InventoryReport from '../components/reports/InventoryReport';
import CustomerInsights from '../components/reports/CustomerInsights';
import ExportButton from '../components/reports/ExportButton';
import PricingModal from '../components/subscription/PricingModal';
import { BarChart3, Lock, Package, Users, Sparkles } from 'lucide-react';
import { subDays } from 'date-fns';
import { toast } from 'sonner';
import { periodOf, inPeriod, dayKey, buildReport } from '@/lib/reportData';

const TIER_LABELS = { starter: 'Basic', growth: 'Advanced', pro: 'Custom' };

// Orders are loaded for the selected period and for the period before it (for
// the "vs previous period" comparisons in the exports), 1,000 rows per request.
const ORDER_PAGE_SIZE = 1000;
const MAX_ORDER_PAGES = 20; // up to 20,000 orders per period

async function fetchOrdersBetween(tenantId, from, to) {
  const supabase = await getSupabase();
  const seen = new Set();
  const orders = [];
  for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('created_date', from.toISOString())
      .lte('created_date', to.toISOString())
      .order('created_date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * ORDER_PAGE_SIZE, page * ORDER_PAGE_SIZE + ORDER_PAGE_SIZE - 1);
    if (error) throw error;
    for (const o of data || []) {
      if (!seen.has(o.id)) { seen.add(o.id); orders.push(o); }
    }
    if (!data || data.length < ORDER_PAGE_SIZE) return { orders, capped: false };
  }
  return { orders, capped: true };
}

// Small reusable "this needs a higher plan" panel — used for locked tabs, where a
// deliberate "here's what you're missing" moment makes sense (unlike the export
// button, which is a small in-context action and just gets a toast instead).
function UpgradePanel({ icon: Icon, title, description, onUpgrade }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
      <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lock className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      <p className="text-xs sm:text-sm text-slate-500 max-w-xs mb-5">{description}</p>
      <Button
        onClick={onUpgrade}
        size="sm"
        className="text-white gap-1.5"
        style={{ background: 'var(--color-primary-gradient)' }}
      >
        <Sparkles className="w-3.5 h-3.5" /> Upgrade Plan
      </Button>
    </div>
  );
}

export default function Reports() {
  const { tenantId, tenant, hasPermission } = useTenant();
  const { tier, can } = useSubscription();
  // Plan features come from the store's entitlements. isStarter here means "this
  // plan has no advanced reports" (Starter today): it locks the Inventory and
  // Customers tabs and the richer sales charts.
  const isStarter = !can('can_use_advanced_reports');
  const hasExportPermission = hasPermission('reports.export');
  const canExport = hasExportPermission && can('can_export_reports');
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [showPricing, setShowPricing] = useState(false);

  // The selected days (whole local days) and the same number of days before them.
  const period = periodOf(dateRange);
  const loadOrders = async () => {
    const current = await fetchOrdersBetween(tenantId, period.start, period.end);
    const previous = await fetchOrdersBetween(tenantId, period.prevStart, period.prevEnd);
    return { orders: [...previous.orders, ...current.orders], capped: current.capped || previous.capped };
  };

  const {
    data: orderData,
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    isPlaceholderData: ordersStale,
  } = useQuery({
    queryKey: ['reportsOrders', tenantId, dayKey(period.prevStart), dayKey(period.end)],
    queryFn: loadOrders,
    enabled: !!tenantId,
    placeholderData: (previous) => previous,
  });
  const allOrders = orderData?.orders || [];

  const { data: products = [] } = useQuery({
    queryKey: ['reportsProducts', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('products').select('*').eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // FIX: "Product Performance" was reading item.product_name/item.total/item.category
  // on order line items — none of which actually exist on a stored order (real fields
  // are name/price/quantity/product_id; category lives on the *product*, not the
  // item). That produced "undefined" names and NaN revenue throughout, which is what
  // showed up as the tab "not loading properly". Fetching categories here so both
  // report components can resolve a product's category by id correctly.
  const { data: categories = [] } = useQuery({
    queryKey: ['reportsCategories', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('categories').select('id, name').eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Growth+ only — fetched regardless of tier (cheap, avoids a loading flicker if
  // someone upgrades mid-session), the tab itself decides whether to render them.
  const { data: stockHistory = [] } = useQuery({
    queryKey: ['reportsStockHistory', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('stock_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['reportsInventoryItems', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['reportsCustomers', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Orders in the selected period. 'Today'/'Yesterday' presets (and a single-day
  // custom pick) set from/to to the same moment, so the period is normalized to
  // whole local days once (periodOf), covering every source of a range.
  const orders = allOrders.filter((order) => inPeriod(order, period.start, period.end));

  const filteredStockHistory = stockHistory.filter((h) => inPeriod(h, period.start, period.end));

  const { data: themeConfig } = useQuery({
    queryKey: ['reportsThemeConfig', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('theme_configs').select('*').eq('tenant_id', tenantId).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!tenantId,
  });

  // FIX: was reading tenant?.settings?.theme?.primary_color, a path that doesn't
  // exist anywhere in the schema — theme colors live in their own theme_configs
  // table (same one ThemeProvider reads from for the rest of the app's UI). That
  // meant every chart silently fell back to the dark navy/grey default regardless
  // of the merchant's actual brand colors.
  const themeColors = {
    primary: themeConfig?.primary_color || '#1e293b',
    accent: themeConfig?.accent_color || '#f59e0b',
  };

  const chartStyles = `
    :root {
      --chart-primary: ${themeColors.primary};
      --chart-accent: ${themeColors.accent};
    }
  `;

  const handleBlockedExport = () => {
    toast.error("Exporting reports isn't included in your plan.");
  };

  // The exports use the same rules and data as the screen (lib/reportData.js).
  const getReport = () => buildReport({
    orders: allOrders,
    products,
    categories,
    inventoryItems,
    customers: isStarter ? null : customers,
    range: dateRange,
    currency: tenant?.currency || 'SGD',
    storeName: tenant?.name || '',
    includeAdvanced: !isStarter,
  });

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Loading reports...</p>
      </div>
    );
  }

  return (
    <RequirePermission permission="reports.view">
      <style>{chartStyles}</style>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-start justify-between gap-2">
          <PageHeader
            title="Reports & Analytics"
            description="View detailed insights and performance metrics"
          />
          {/* Compact on mobile — was a wide pill competing with the title for space;
              now just a small tag that wraps under the title if needed. */}
          <span
            className="text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 whitespace-nowrap mt-1"
            style={{ background: 'var(--color-primary-gradient)', color: 'white' }}
          >
            {TIER_LABELS[tier] || TIER_LABELS.starter}
          </span>
        </div>

        {/* Date Range + Export row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* A cleared calendar selection keeps the previous range (avoids an empty range). */}
          <DateRangePicker dateRange={dateRange} onChange={(range) => { if (range?.from) setDateRange(range); }} />
          <span className="text-xs text-slate-400 flex-shrink-0">
            {ordersStale ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
          </span>
          <div className="ml-auto">
            {canExport ? (
              <ExportButton
                getReport={getReport}
                disabled={ordersFetching || ordersStale}
                accent={themeColors.primary}
                logoUrl={tenant?.logo_url || null}
              />
            ) : hasExportPermission ? (
              // Has the role-level permission, just not the plan tier for it — a small
              // toast is enough here, no need to launch the pricing modal for a click
              // on what's otherwise a minor, in-context action.
              <Button variant="outline" size="sm" className="gap-1.5 text-slate-400 border-slate-200" onClick={handleBlockedExport}>
                <Lock className="w-3.5 h-3.5" /> Export
              </Button>
            ) : null}
          </div>
        </div>
        {orderData?.capped && (
          <p className="text-xs text-amber-600" data-testid="orders-capped">
            This range has more than 20,000 orders, so only the first 20,000 are included (the comparison period is limited the same way). Choose a shorter range for complete figures.
          </p>
        )}

        <Tabs defaultValue="sales" className="space-y-4 sm:space-y-6">
          {/* Horizontally scrollable on mobile instead of wrapping — 5 tabs (2 with
              lock icons) wrapped into a cramped, uneven grid at phone width. */}
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-max">
              <TabsTrigger value="sales" className="whitespace-nowrap">Sales</TabsTrigger>
              <TabsTrigger value="products" className="whitespace-nowrap">Products</TabsTrigger>
              <TabsTrigger value="inventory" className="gap-1.5 whitespace-nowrap">
                {isStarter && <Lock className="w-3 h-3" />} Inventory
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5 whitespace-nowrap">
                {isStarter && <Lock className="w-3 h-3" />} Customers
              </TabsTrigger>
              <TabsTrigger value="staff" className="whitespace-nowrap">Staff</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales">
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No data for selected period</p>
                <p className="text-slate-400 text-sm mt-1">Try a different date range</p>
              </div>
            ) : (
              <SalesReport
                orders={orders}
                products={products}
                categories={categories}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
                isStarter={isStarter}
                dateRange={dateRange}
              />
            )}
          </TabsContent>

          <TabsContent value="products">
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No data for selected period</p>
                <p className="text-slate-400 text-sm mt-1">Try a different date range</p>
              </div>
            ) : (
              <ProductPerformance
                orders={orders}
                products={products}
                categories={categories}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
              />
            )}
          </TabsContent>

          <TabsContent value="inventory">
            {isStarter ? (
              <UpgradePanel
                icon={Package}
                title="Inventory Reports — Growth plan and above"
                description="See stock movement, low-stock trends, and restock frequency over time."
                onUpgrade={() => setShowPricing(true)}
              />
            ) : (
              <InventoryReport
                stockHistory={filteredStockHistory}
                inventoryItems={inventoryItems}
                products={products}
                themeColors={themeColors}
              />
            )}
          </TabsContent>

          <TabsContent value="customers">
            {isStarter ? (
              <UpgradePanel
                icon={Users}
                title="Customer Insights — Growth plan and above"
                description="See repeat vs. new customers and your top spenders."
                onUpgrade={() => setShowPricing(true)}
              />
            ) : (
              <CustomerInsights
                customers={customers}
                dateRange={{ from: period.start, to: period.end }}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
              />
            )}
          </TabsContent>

          <TabsContent value="staff">
            {/* Staying "coming soon" regardless of plan — not tier-gated, genuinely
                not built yet. */}
            <div className="text-center py-12 text-slate-400 text-sm">
              Staff performance reports coming soon
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <PricingModal
        open={showPricing}
        onOpenChange={setShowPricing}
        tenantId={tenantId}
        currentTier={tier}
        hasUsedTrial={tenant?.has_used_trial}
      />
    </RequirePermission>
  );
}
