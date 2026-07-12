import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Package } from 'lucide-react';

function StatCard({ label, value, sublabel, icon: Icon, iconBg, iconColor }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-3 sm:p-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <p className="text-[11px] sm:text-xs text-slate-500 leading-tight">{label}</p>
        <p className="text-base sm:text-xl font-bold text-slate-900 leading-tight mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

export default function ProductPerformance({ orders, products, currency, themeColors }) {
  // Calculate product metrics
  const productMetrics = {};

  orders.forEach(order => {
    order.items?.forEach(item => {
      if (!productMetrics[item.product_id]) {
        productMetrics[item.product_id] = {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_sold: 0,
          revenue: 0,
          orders_count: 0,
        };
      }
      productMetrics[item.product_id].quantity_sold += item.quantity;
      productMetrics[item.product_id].revenue += item.total;
      productMetrics[item.product_id].orders_count += 1;
    });
  });

  const productArray = Object.values(productMetrics);

  // Best sellers by revenue
  const bestSellersByRevenue = [...productArray]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(p => ({
      name: p.product_name.length > 20 ? p.product_name.substring(0, 20) + '...' : p.product_name,
      revenue: parseFloat(p.revenue.toFixed(2)),
    }));

  // Best sellers by quantity
  const bestSellersByQty = [...productArray]
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .slice(0, 10);

  // Worst performers
  const worstPerformers = [...productArray]
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5);

  // Products never ordered
  const orderedProductIds = new Set(Object.keys(productMetrics));
  const neverOrdered = products.filter(p => !orderedProductIds.has(p.id));

  return (
    <div className="space-y-5">
      {/* Summary Cards — always 3 across, even on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          label="Products Sold"
          value={productArray.length}
          icon={Package}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Top Revenue"
          value={`${currency} ${bestSellersByRevenue[0]?.revenue.toFixed(2) || '0.00'}`}
          sublabel={bestSellersByRevenue[0]?.name}
          icon={TrendingUp}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Dead Stock"
          value={neverOrdered.length}
          icon={TrendingDown}
          iconBg="bg-red-50"
          iconColor="text-red-500"
        />
      </div>

      {/* Best Sellers by Revenue */}
      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 Products by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={bestSellersByRevenue} layout="vertical" margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 13 }} />
              <Bar dataKey="revenue" fill={themeColors.primary} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Best Sellers by Quantity */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 by Quantity Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {bestSellersByQty.map((product, idx) => (
                <div key={product.product_id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg font-bold text-slate-200 w-6 flex-shrink-0">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{product.product_name}</p>
                      <p className="text-xs text-slate-400">{product.orders_count} orders</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-bold" style={{ color: themeColors.primary }}>
                      {product.quantity_sold}
                    </p>
                    <p className="text-[10px] text-slate-400">units</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Worst Performers */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Worst Performers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {worstPerformers.map((product) => (
                <div key={product.product_id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{product.product_name}</p>
                    <p className="text-xs text-slate-400">{product.quantity_sold} units sold</p>
                  </div>
                  <p className="text-sm font-medium text-slate-500 flex-shrink-0 ml-2">
                    {currency} {product.revenue.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Never Ordered */}
      {neverOrdered.length > 0 && (
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-600">Products Never Ordered ({neverOrdered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {neverOrdered.slice(0, 12).map((product) => (
                <div key={product.id} className="p-3 bg-red-50/60 rounded-xl border border-red-100">
                  <p className="font-medium text-slate-800 text-sm truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">{currency} {product.price.toFixed(2)}</p>
                </div>
              ))}
              {neverOrdered.length > 12 && (
                <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-center">
                  <p className="text-slate-500 text-sm">+{neverOrdered.length - 12} more</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
