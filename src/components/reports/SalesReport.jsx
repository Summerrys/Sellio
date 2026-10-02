import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, DollarSign, ShoppingCart } from 'lucide-react';
import {
  periodOf, summarize, isSale, dailySeries, chartSeries, productStats, categoryStats, paymentStats, fmtMoney,
} from '@/lib/reportData';

// Compact stat card built for a 3-across mobile grid — icon badge instead of a
// bare floating icon, tighter type scale so three of these comfortably fit a
// phone width without wrapping or truncating awkwardly.
function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-2.5 sm:p-4">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1.5 sm:mb-2 ${iconBg}`}>
          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${iconColor}`} />
        </div>
        <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</p>
        <p className="text-sm sm:text-xl font-bold text-slate-900 leading-tight mt-0.5 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

// orders: every order in the selected period (all statuses). Sales count paid
// orders that are not cancelled (lib/reportData.js, shared with the exports);
// unpaid and cancelled orders are listed under the cards instead.
export default function SalesReport({ orders, products = [], categories = [], currency, themeColors, isStarter = true, dateRange }) {
  const period = periodOf(dateRange);
  const sales = orders.filter(isSale);
  const summary = summarize(orders);

  // Revenue over time: every day of the period, oldest first (by week or month
  // for long ranges), so days without sales show as zero.
  const revenueData = chartSeries(dailySeries(sales, period.start, period.end))
    .map((d) => ({ date: d.label, revenue: d.sales }));

  // Revenue by category: category lives on the product (item.product_id ->
  // product.category_id); lines whose product is gone count as "Uncategorized".
  const categoryData = categoryStats(productStats(sales, products, categories))
    .map((c) => ({ category: c.category, revenue: c.sales }));

  const paymentData = paymentStats(sales).map((p) => ({ method: p.label, count: p.orders }));

  const COLORS = [themeColors.primary, themeColors.accent, '#64748b', '#f59e0b', '#10b981'];

  const notCounted = [];
  if (summary.openCount > 0) notCounted.push(`${summary.openCount} unpaid (${fmtMoney(summary.openTotal, currency)})`);
  if (summary.cancelledCount > 0) notCounted.push(`${summary.cancelledCount} cancelled (${fmtMoney(summary.cancelledTotal, currency)})`);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Key Metrics — always 3 across, even on mobile */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        <StatCard
          label="Sales"
          value={`${currency} ${summary.salesTotal.toFixed(2)}`}
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Paid Orders"
          value={summary.salesCount}
          icon={ShoppingCart}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Avg Order"
          value={`${currency} ${summary.avgOrder.toFixed(2)}`}
          icon={TrendingUp}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>
      <p className="text-[10px] sm:text-xs text-slate-400 -mt-2 sm:-mt-3" data-testid="sales-rule-note">
        Sales count paid orders that are not cancelled.
        {notCounted.length > 0 && <> Not counted: {notCounted.join(' · ')}.</>}
      </p>

      {sales.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No paid orders in this period
        </div>
      ) : (
        <>
          {/* Revenue Over Time — plain line for Starter, gradient-filled area for
              Growth and above. Same data, just a richer render at higher tiers. */}
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">Sales Over Time</CardTitle>
            </CardHeader>
            <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
              <ResponsiveContainer width="100%" height={220}>
                {isStarter ? (
                  <LineChart data={revenueData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip formatter={(value) => [`${currency} ${value}`, 'Sales']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={themeColors.primary}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: themeColors.primary }}
                      activeDot={{ r: 5 }}
                      name="Sales"
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={revenueData} margin={{ left: -20, right: 8 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={themeColors.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={themeColors.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip formatter={(value) => [`${currency} ${value}`, 'Sales']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={themeColors.primary}
                      strokeWidth={2.5}
                      fill="url(#revenueFill)"
                      dot={{ r: 3, fill: themeColors.primary }}
                      activeDot={{ r: 5 }}
                      name="Sales"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Revenue by Category */}
            <Card className="border-slate-100 shadow-sm">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-base">Item Sales by Category</CardTitle>
              </CardHeader>
              <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={categoryData} layout="vertical" margin={{ left: -10, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="category" type="category" width={80} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => [`${currency} ${value}`, 'Item sales']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                    <Bar dataKey="revenue" fill={themeColors.primary} radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment Methods — flat solid slices for Starter, soft radial shading
                plus a donut cut-out for Growth and above. */}
            <Card className="border-slate-100 shadow-sm">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    {!isStarter && (
                      <defs>
                        {paymentData.map((_, index) => (
                          <radialGradient key={index} id={`pieGrad${index}`} cx="35%" cy="35%" r="70%">
                            <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={1} />
                            <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.75} />
                          </radialGradient>
                        ))}
                      </defs>
                    )}
                    <Pie
                      data={paymentData}
                      dataKey="count"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      innerRadius={isStarter ? 0 : 45}
                      outerRadius={75}
                      paddingAngle={isStarter ? 0 : 2}
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {paymentData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={isStarter ? COLORS[index % COLORS.length] : `url(#pieGrad${index})`}
                          stroke="white"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
