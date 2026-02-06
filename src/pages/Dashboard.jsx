import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import StatCard from '../components/ui-custom/StatCard';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { DollarSign, ShoppingBag, ClipboardList, Users, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';

export default function Dashboard() {
  const { tenantId, tenant } = useTenant();

  const { data: orders = [] } = useQuery({
    queryKey: ['dashboardOrders', tenantId],
    queryFn: () => base44.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 50),
    enabled: !!tenantId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['dashboardProducts', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayOrders = orders.filter(o => o.created_date?.startsWith(todayStr));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const lowStockProducts = products.filter(p => p.stock_quantity <= (p.low_stock_threshold || 5));

  const recentOrders = orders.slice(0, 8);

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={Users}
          title="No Business Found"
          description="You haven't been assigned to any business yet. Contact your administrator or create a new business."
          actionLabel="Create Business"
          onAction={() => {}}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Welcome back`}
        description={tenant?.name ? `Here's what's happening at ${tenant.name} today` : "Here's your overview for today"}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Today's Revenue" value={`$${todayRevenue.toFixed(2)}`} icon={DollarSign} color="green" />
        <StatCard title="Today's Orders" value={todayOrders.length} icon={ClipboardList} color="blue" />
        <StatCard title="Active Orders" value={activeOrders.length} icon={Clock} color="amber" />
        <StatCard title="Products" value={products.length} icon={ShoppingBag} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2 border-0 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Recent Orders</h2>
            <Link to={createPageUrl('Orders')} className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">No orders yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-25 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">#{order.order_number}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {order.table_name ? `${order.table_name} · ` : ''}{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-semibold text-slate-900 w-20 text-right">${(order.total_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Low Stock Alert */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Low Stock Alert</h2>
            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
              {lowStockProducts.length} items
            </span>
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">All products in stock</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {lowStockProducts.slice(0, 6).map(product => (
                <div key={product.id} className="flex items-center justify-between px-6 py-3.5">
                  <p className="text-sm text-slate-700 truncate flex-1">{product.name}</p>
                  <span className={`text-sm font-semibold ${product.stock_quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {product.stock_quantity} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}