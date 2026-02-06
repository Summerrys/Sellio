import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Package } from 'lucide-react';

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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Products Sold</p>
                <p className="text-2xl font-bold">{productArray.length}</p>
              </div>
              <Package className="w-8 h-8" style={{ color: themeColors.primary }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Top Product Revenue</p>
                <p className="text-2xl font-bold">
                  {currency} {bestSellersByRevenue[0]?.revenue.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{bestSellersByRevenue[0]?.name}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Dead Stock</p>
                <p className="text-2xl font-bold">{neverOrdered.length}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Sellers by Revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Products by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={bestSellersByRevenue} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip formatter={(value) => `${currency} ${value}`} />
              <Bar dataKey="revenue" fill={themeColors.primary} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Sellers by Quantity */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 by Quantity Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bestSellersByQty.map((product, idx) => (
                <div key={product.product_id} className="flex items-center justify-between pb-3 border-b">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-slate-300">#{idx + 1}</span>
                    <div>
                      <p className="font-medium text-slate-900">{product.product_name}</p>
                      <p className="text-sm text-slate-500">{product.orders_count} orders</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold" style={{ color: themeColors.primary }}>
                      {product.quantity_sold}
                    </p>
                    <p className="text-xs text-slate-500">units</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Worst Performers */}
        <Card>
          <CardHeader>
            <CardTitle>Worst Performers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {worstPerformers.map((product) => (
                <div key={product.product_id} className="flex items-center justify-between pb-3 border-b">
                  <div>
                    <p className="font-medium text-slate-900">{product.product_name}</p>
                    <p className="text-sm text-slate-500">{product.quantity_sold} units sold</p>
                  </div>
                  <p className="font-medium text-slate-600">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Products Never Ordered ({neverOrdered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {neverOrdered.slice(0, 12).map((product) => (
                <div key={product.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{currency} {product.price.toFixed(2)}</p>
                </div>
              ))}
              {neverOrdered.length > 12 && (
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-center">
                  <p className="text-slate-500">+{neverOrdered.length - 12} more</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}