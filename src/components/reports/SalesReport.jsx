import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, DollarSign, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';

// Compact stat card built for a 3-across mobile grid \u2014 icon badge instead of a
// bare floating icon, tighter type scale so three of these comfortably fit a
// phone width without wrapping or truncating awkwardly.
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

export default function SalesReport({ orders, currency, themeColors, isStarter = true }) {
  // Revenue over time
  const revenueByDate = orders.reduce((acc, order) => {
    const date = format(new Date(order.created_date), 'MMM dd');
    acc[date] = (acc[date] || 0) + order.total_amount;
    return acc;
  }, {});

  const revenueData = Object.entries(revenueByDate).map(([date, revenue]) => ({
    date,
    revenue: parseFloat(revenue.toFixed(2)),
  }));

  // Revenue by category
  const revenueByCategory = orders.reduce((acc, order) => {
    order.items?.forEach(item => {
      const category = item.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + item.total;
    });
    return acc;
  }, {});

  const categoryData = Object.entries(revenueByCategory)
    .map(([category, revenue]) => ({
      category,
      revenue: parseFloat(revenue.toFixed(2)),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Payment method breakdown
  const paymentMethods = orders.reduce((acc, order) => {
    const method = order.payment_method || 'pending';
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});

  const paymentData = Object.entries(paymentMethods).map(([method, count]) => ({
    method: method.replace('_', ' ').toUpperCase(),
    count,
  }));

  // Key metrics
  const totalRevenue = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const COLORS = [themeColors.primary, themeColors.accent, '#64748b', '#f59e0b', '#10b981'];

  return (
    <div className="space-y-5">
      {/* Key Metrics — always 3 across, even on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          label="Total Revenue"
          value={`${currency} ${totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Total Orders"
          value={totalOrders}
          icon={ShoppingCart}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Avg Order Value"
          value={`${currency} ${avgOrderValue.toFixed(2)}`}
          icon={TrendingUp}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* Revenue Over Time — plain line for Starter, gradient-filled area for
          Growth and above. Same data, just a richer render at higher tiers. */}
      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            {isStarter ? (
              <LineChart data={revenueData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 13 }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={themeColors.primary}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: themeColors.primary }}
                  activeDot={{ r: 5 }}
                  name="Revenue"
                />
              </LineChart>
            ) : (
              <AreaChart data={revenueData} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={themeColors.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={themeColors.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 13 }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={themeColors.primary}
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                  dot={{ r: 3, fill: themeColors.primary }}
                  activeDot={{ r: 5 }}
                  name="Revenue"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue by Category */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="category" type="category" width={90} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 13 }} />
                <Bar dataKey="revenue" fill={themeColors.primary} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods — flat solid slices for Starter, soft radial shading
            plus a donut cut-out for Growth and above. */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
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
                  innerRadius={isStarter ? 0 : 55}
                  outerRadius={95}
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
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
