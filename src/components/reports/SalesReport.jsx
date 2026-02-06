import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, ShoppingCart, CreditCard } from 'lucide-react';
import { format } from 'date-fns';

export default function SalesReport({ orders, currency, themeColors }) {
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
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Revenue</p>
                <p className="text-2xl font-bold">{currency} {totalRevenue.toFixed(2)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Orders</p>
                <p className="text-2xl font-bold">{totalOrders}</p>
              </div>
              <ShoppingCart className="w-8 h-8" style={{ color: themeColors.primary }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Avg Order Value</p>
                <p className="text-2xl font-bold">{currency} {avgOrderValue.toFixed(2)}</p>
              </div>
              <TrendingUp className="w-8 h-8" style={{ color: themeColors.accent }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => `${currency} ${value}`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke={themeColors.primary}
                strokeWidth={2}
                name="Revenue"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="category" type="category" width={100} />
                <Tooltip formatter={(value) => `${currency} ${value}`} />
                <Bar dataKey="revenue" fill={themeColors.primary} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="count"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}