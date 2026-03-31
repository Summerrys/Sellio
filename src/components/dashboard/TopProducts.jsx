import React from 'react';
import { useQuery } from '@tanstack/react-query';
import db from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Trophy, ShoppingBag } from 'lucide-react';

export default function TopProducts({ tenantId }) {
  const { data: orders = [] } = useQuery({
    queryKey: ['topProductsOrders', tenantId],
    queryFn: () => db.entities.Order.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  // Aggregate product sales
  const productSales = {};
  orders.forEach(order => {
    order.items?.forEach(item => {
      const key = item.product_id || item.product_name;
      if (!productSales[key]) {
        productSales[key] = {
          name: item.product_name,
          quantity: 0,
          revenue: 0,
        };
      }
      productSales[key].quantity += item.quantity || 0;
      productSales[key].revenue += item.total || 0;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <Card className="p-6 border-0 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-slate-900">Top Selling Products</h3>
      </div>

      {topProducts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No sales data yet</p>
      ) : (
        <div className="space-y-4">
          {topProducts.map((product, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{product.name}</p>
                <p className="text-sm text-slate-500">{product.quantity} sold</p>
              </div>
              <p className="font-semibold text-[rgb(var(--color-primary))]">
                ${product.revenue.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}