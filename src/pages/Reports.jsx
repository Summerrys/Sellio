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
import { BarChart3, Lock, TrendingUp, Package, Users, Sparkles } from 'lucide-react';
import { subDays, isWithinInterval } from 'date-fns';

const TIER_LABELS = { starter: 'Basic Reports', growth: 'Advanced Reports', pro: 'Custom Reports' };

// Small reusable "this needs a higher plan" panel — used for both locked tabs and
// the locked export action, so the upsell always looks and behaves the same way.
function UpgradePanel({ icon: Icon, title, description, onUpgrade }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
      <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lock className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      <p className="text-sm text-slate-500 max-w-xs mb-5">{description}</p>
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
  const canExport = hasPermission('reports.export') && !isStarter;
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [showPricing, setShowPricing] = useState(false);

  // FIX: previously fetched via the legacy base44.entities.*.filter() SDK layer,
  // the same pre-migration pattern that turned out to be broken for table deletes
  // elsewhere in the app. Moved to a direct Supabase query, matching every other
  // page, so this doesn't become the next hidden "Network Error" waiting to happen.
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['reportsOrders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
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

  // CSS variables for charts
  const chartStyles = `
    :root {
      --chart-primary: ${themeColors.primary};
      --chart-accent: ${themeColors.accent};
    }
  `;

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
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title="Reports & Analytics"
            description="View detailed insights and performance metrics"
          />
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: 'var(--color-primary-gradient)', color: 'white' }}
          >
            {TIER_LABELS[tier] || TIER_LABELS.starter}
          </span>
        </div>

        {/* Date Range + Export row */}
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker dateRange={dateRange} onChange={setDateRange} />
          <span className="text-sm text-slate-400">{orders.length} order{orders.length === 1 ? '' : 's'} in range</span>
          <div className="ml-auto">
            {canExport ? (
              <ExportButton
                data={orders}
                filename="sales_report"
                type="sales"
              />
            ) : hasPermission('reports.export') ? (
              // Has the role-level permission, just not the plan tier for it.
              <Button variant="outline" size="sm" className="gap-1.5 text-slate-400 border-slate-200" onClick={() => setShowPricing(true)}>
                <Lock className="w-3.5 h-3.5" /> Export
              </Button>
            ) : null}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No data for selected period</p>
            <p className="text-slate-400 text-sm mt-2">Try selecting a different date range</p>
          </div>
        ) : (
          <Tabs defaultValue="sales" className="space-y-6">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="sales">Sales Report</TabsTrigger>
              <TabsTrigger value="products">Product Performance</TabsTrigger>
              <TabsTrigger value="inventory" className="gap-1.5">
                {isStarter && <Lock className="w-3 h-3" />} Inventory
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5">
                {isStarter && <Lock className="w-3 h-3" />} Customer Insights
              </TabsTrigger>
              <TabsTrigger value="staff">Staff Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="sales">
              <SalesReport
                orders={orders}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
              />
            </TabsContent>

            <TabsContent value="products">
              <ProductPerformance
                orders={orders}
                products={products}
                currency={tenant?.currency || 'SGD'}
                themeColors={themeColors}
              />
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
                <div className="text-center py-12 text-slate-400">
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
                <div className="text-center py-12 text-slate-400">
                  Customer insights coming soon
                </div>
              )}
            </TabsContent>

            <TabsContent value="staff">
              {/* Staying "coming soon" regardless of plan — not tier-gated, genuinely
                  not built yet. Staff performance is hard to differentiate for most
                  F&B teams; ordering-frequency-based tracking may come later. */}
              <div className="text-center py-12 text-slate-400">
                Staff performance reports coming soon
              </div>
            </TabsContent>
          </Tabs>
        )}
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