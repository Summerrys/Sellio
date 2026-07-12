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
import ExportButton from '../components/reports/ExportButton';
import PricingModal from '../components/subscription/PricingModal';
import { BarChart3, Lock, Package, Users, Sparkles } from 'lucide-react';
import { subDays, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';

const TIER_LABELS = { starter: 'Basic', growth: 'Advanced', pro: 'Custom' };

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
  const { tier, isStarter } = useSubscription();
  const hasExportPermission = hasPermission('reports.export');
  const canExport = hasExportPermission && !isStarter;
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [showPricing, setShowPricing] = useState(false);

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['reportsOrders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false)
        .order('created_date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

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

  // Filter orders by date range
  const orders = allOrders.filter(order => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const orderDate = new Date(order.created_date);
    return isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to });
  });

  // Get theme colors
  const themeColors = {
    primary: tenant?.settings?.theme?.primary_color || '#1e293b',
    accent: tenant?.settings?.theme?.accent_color || '#f59e0b',
  };

  const chartStyles = `
    :root {
      --chart-primary: ${themeColors.primary};
      --chart-accent: ${themeColors.accent};
    }
  `;

  const handleBlockedExport = () => {
    toast.error("You don't have access to export reports on the Starter plan.");
  };

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
          <DateRangePicker dateRange={dateRange} onChange={setDateRange} />
          <span className="text-xs text-slate-400 flex-shrink-0">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
          <div className="ml-auto">
            {canExport ? (
              <ExportButton
                data={orders}
                filename="sales_report"
                type="sales"
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
                categories={categories}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
                isStarter={isStarter}
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
              <div className="text-center py-12 text-slate-400 text-sm">
                Inventory reports coming soon
              </div>
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
              <div className="text-center py-12 text-slate-400 text-sm">
                Customer insights coming soon
              </div>
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