import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Package } from 'lucide-react';
import { isSale, productStats, notSold } from '@/lib/reportData';

function StatCard({ label, value, sublabel, icon: Icon, iconBg, iconColor }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-2.5 sm:p-4">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1.5 sm:mb-2 ${iconBg}`}>
          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${iconColor}`} />
        </div>
        <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</p>
        <p className="text-sm sm:text-xl font-bold text-slate-900 leading-tight mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-[9px] sm:text-xs text-slate-400 truncate mt-0.5">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

// orders: every order in the selected period. Only paid, not cancelled orders
// count (lib/reportData.js, shared with the exports). Item sales are line price ×
// quantity (before order discounts), all options of a product together.
export default function ProductPerformance({ orders, products, categories = [], currency, themeColors }) {
  const productArray = productStats(orders.filter(isSale), products, categories);
  const short = (name) => (name.length > 18 ? `${name.substring(0, 18)}...` : name);

  // Best sellers by revenue
  const bestSellersByRevenue = productArray.slice(0, 10).map((p) => ({ name: short(p.name), revenue: p.sales }));

  // Best sellers by quantity
  const bestSellersByQty = [...productArray]
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
    .slice(0, 10);

  // Worst performers (of the items that sold)
  const worstPerformers = [...productArray]
    .sort((a, b) => a.sales - b.sales || a.qty - b.qty)
    .slice(0, 5);

  // Items on sale (switched on) with no sales in this period
  const neverOrdered = notSold(products || [], productArray, categories);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Summary Cards — always 3 across, even on mobile */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        <StatCard
          label="Products Sold"
          value={productArray.length}
          icon={Package}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Top Revenue"
          value={`${currency} ${(productArray[0]?.sales || 0).toFixed(2)}`}
          sublabel={productArray[0] ? short(productArray[0].name) : undefined}
          icon={TrendingUp}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Not Sold"
          value={neverOrdered.length}
          icon={TrendingDown}
          iconBg="bg-red-50"
          iconColor="text-red-500"
        />
      </div>

      {productArray.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No product sales in this period yet
        </div>
      ) : (
        <>
          {/* Best Sellers by Revenue */}
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">Top 10 by Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bestSellersByRevenue} layout="vertical" margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                  <Bar dataKey="revenue" fill={themeColors.primary} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Best Sellers by Quantity */}
            <Card className="border-slate-100 shadow-sm">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-base">Top 10 by Quantity Sold</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="space-y-1">
                  {bestSellersByQty.map((product, idx) => (
                    <div key={product.key} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base sm:text-lg font-bold text-slate-200 w-5 flex-shrink-0">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-xs sm:text-sm truncate">{product.name}</p>
                          <p className="text-[10px] sm:text-xs text-slate-400">{product.orders} {product.orders === 1 ? 'order' : 'orders'}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-xs sm:text-sm font-bold" style={{ color: themeColors.primary }}>
                          {product.qty}
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-400">units</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Worst Performers */}
            <Card className="border-slate-100 shadow-sm">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-base">Worst Performers</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="space-y-1">
                  {worstPerformers.map((product) => (
                    <div key={product.key} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 text-xs sm:text-sm truncate">{product.name}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400">{product.qty} units sold</p>
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-slate-500 flex-shrink-0 ml-2">
                        {currency} {product.sales.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* On sale, not sold in this period */}
      {neverOrdered.length > 0 && (
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-sm sm:text-base text-red-600">On Sale, Not Sold in This Period ({neverOrdered.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
              {neverOrdered.slice(0, 12).map((product) => (
                <div key={product.product_id} className="p-2.5 sm:p-3 bg-red-50/60 rounded-xl border border-red-100">
                  <p className="font-medium text-slate-800 text-xs sm:text-sm truncate">{product.name}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500">{currency} {product.price.toFixed(2)}</p>
                </div>
              ))}
              {neverOrdered.length > 12 && (
                <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl flex items-center justify-center">
                  <p className="text-slate-500 text-xs sm:text-sm">+{neverOrdered.length - 12} more</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
