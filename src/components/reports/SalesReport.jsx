import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, DollarSign, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';

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

export default function SalesReport({ orders, categories = [], currency, themeColors, isStarter = true }) {
  // FIX: order line items only ever carry {name, price, quantity, product_id, variant}
  // — there's no item.total (needs price*quantity) and no item.category (category
  // lives on the product, resolved here via category_id -> name, not on the item
  // itself). Reading the old, nonexistent field names silently produced NaN/undefined
  // throughout this whole report.
  const categoryNameById = categories.reduce((acc, c) => { acc[c.id] = c.name; return acc; }, {});

  // Revenue over time
  const revenueByDate = orders.reduce((acc, order) => {
    const date = format(new Date(order.created_date), 'MMM dd');
    acc[date] = (acc[date] || 0) + (order.total_amount || 0);
    return acc;
  }, {});

  const revenueData = Object.entries(revenueByDate).map(([date, revenue]) => ({
    date,
    revenue: parseFloat(revenue.toFixed(2)),
  }));

  // Revenue by category — category isn't on the item, so we can only attribute it
  // when the order actually stored a product's category_id; anything else (or a
  // product whose category was later deleted) falls into "Uncategorized".
  const revenueByCategory = orders.reduce((acc, order) => {
    order.items?.forEach(item => {
      const category = (item.category_id && categoryNameById[item.category_id]) || 'Uncategorized';
      const lineTotal = (item.price || 0) * (item.quantity || 0);
      acc[category] = (acc[category] || 0) + lineTotal;
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
    method: method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    count,
  }));

  // Key metrics
  const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const COLORS = [themeColors.primary, themeColors.accent, '#64748b', '#f59e0b', '#10b981'];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Key Metrics — always 3 across, even on mobile */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
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
          label="Avg Order"
          value={`${currency} ${avgOrderValue.toFixed(2)}`}
          icon={TrendingUp}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* Revenue Over Time — plain line for Starter, gradient-filled area for
          Growth and above. Same data, just a richer render at higher tiers. */}
      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-sm sm:text-base">Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
          <ResponsiveContainer width="100%" height={220}>
            {isStarter ? (
              <LineChart data={revenueData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
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
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Revenue by Category */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-sm sm:text-base">Revenue by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="category" type="category" width={80} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`${currency} ${value}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
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
    </div>
  );
}
