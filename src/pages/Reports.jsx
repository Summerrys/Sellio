import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DateRangePicker from '../components/reports/DateRangePicker';
import SalesReport from '../components/reports/SalesReport';
import ProductPerformance from '../components/reports/ProductPerformance';
import ExportButton from '../components/reports/ExportButton';
import { BarChart3 } from 'lucide-react';
import { subDays, isWithinInterval } from 'date-fns';

export default function Reports() {
  const { tenantId, tenant } = useTenant();
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Fetch orders
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: async () => {
      return base44.entities.Order.filter(
        { tenant_id: tenantId },
        '-created_date',
        1000
      );
    },
    enabled: !!tenantId,
  });

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: async () => {
      return base44.entities.Product.filter({ tenant_id: tenantId });
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
        <PageHeader
          title="Reports & Analytics"
          description="View detailed insights and performance metrics"
          actions={
            <ExportButton 
              data={orders} 
              filename="sales_report"
              type="sales"
            />
          }
        />

        {/* Date Range Picker */}
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker dateRange={dateRange} onChange={setDateRange} />
          <div className="ml-auto">
            <p className="text-sm text-slate-500">
              Showing {orders.length} orders
            </p>
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
            <TabsList>
              <TabsTrigger value="sales">Sales Report</TabsTrigger>
              <TabsTrigger value="products">Product Performance</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="staff">Staff Performance</TabsTrigger>
              <TabsTrigger value="customers">Customer Insights</TabsTrigger>
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
              <div className="text-center py-12 text-slate-400">
                Inventory reports coming soon
              </div>
            </TabsContent>

            <TabsContent value="staff">
              <div className="text-center py-12 text-slate-400">
                Staff performance reports coming soon
              </div>
            </TabsContent>

            <TabsContent value="customers">
              <div className="text-center py-12 text-slate-400">
                Customer insights coming soon
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </RequirePermission>
  );
}