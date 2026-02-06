import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function SuperAdminAnalytics() {
  const { isSuperAdmin } = useTenant();

  const { data: tenants = [] } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: () => base44.asServiceRole.entities.Tenant.list('-created_date'),
    enabled: isSuperAdmin,
  });

  const { data: themeConfigs = [] } = useQuery({
    queryKey: ['all-theme-configs'],
    queryFn: () => base44.asServiceRole.entities.ThemeConfig.list(),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return <div className="text-center py-8">Access Denied</div>;
  }

  // Tenant growth over last 12 months
  const growthData = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const count = tenants.filter(t => new Date(t.created_date) <= date).length;
    growthData.push({ month: monthStr, tenants: count });
  }

  // Business type distribution
  const businessTypes = tenants.reduce((acc, t) => {
    acc[t.industry] = (acc[t.industry] || 0) + 1;
    return acc;
  }, {});
  const businessTypeData = Object.entries(businessTypes).map(([name, value]) => ({ name, value }));

  // Theme color popularity
  const themeColors = themeConfigs.reduce((acc, t) => {
    const colorSet = t.color_set_name || 'default';
    acc[colorSet] = (acc[colorSet] || 0) + 1;
    return acc;
  }, {});
  const themeData = Object.entries(themeColors).map(([name, value]) => ({ name, value }));

  // Plan distribution
  const planDist = tenants.reduce((acc, t) => {
    acc[t.plan] = (acc[t.plan] || 0) + 1;
    return acc;
  }, {});
  const planData = Object.entries(planDist).map(([name, value]) => ({ name, value }));

  // Churn calculation (cancelled in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const churnedCount = tenants.filter(t => 
    t.status === 'cancelled' && new Date(t.updated_date) >= thirtyDaysAgo
  ).length;
  const churnRate = tenants.length > 0 ? (churnedCount / tenants.length * 100).toFixed(1) : 0;

  // Growth rate (new in last 30 days)
  const newCount = tenants.filter(t => new Date(t.created_date) >= thirtyDaysAgo).length;
  const growthRate = tenants.length > 0 ? (newCount / tenants.length * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Insights"
        description="Deep dive into Apptelier Suite metrics"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Growth Rate (30d)</p>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-3xl font-bold">{growthRate}%</p>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-xs text-slate-500 mt-1">{newCount} new tenants</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Churn Rate (30d)</p>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-3xl font-bold">{churnRate}%</p>
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-xs text-slate-500 mt-1">{churnedCount} cancelled</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Avg Tenant Age</p>
            <p className="text-3xl font-bold mt-2">
              {Math.floor(tenants.reduce((sum, t) => {
                const age = (new Date() - new Date(t.created_date)) / (1000 * 60 * 60 * 24);
                return sum + age;
              }, 0) / tenants.length)} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Active Conversion</p>
            <p className="text-3xl font-bold mt-2">
              {((tenants.filter(t => t.status === 'active').length / tenants.length) * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Trial to Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Growth Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Tenant Growth (12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tenants" stroke="#3b82f6" strokeWidth={2} name="Total Tenants" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Business Types */}
        <Card>
          <CardHeader>
            <CardTitle>Business Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={businessTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {businessTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Theme Popularity */}
        <Card>
          <CardHeader>
            <CardTitle>Theme Color Popularity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={themeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" name="Tenants" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={planData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" name="Tenants" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Feature Usage (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Usage Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {['QR Ordering', 'Table Management', 'Inventory', 'Reports', 'Staff Management', 'Theme Customization', 'Notifications', 'Multi-location'].map((feature, idx) => (
              <div key={feature} className="p-4 border rounded-lg text-center">
                <p className="text-sm font-medium mb-2">{feature}</p>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600" 
                    style={{ width: `${Math.random() * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}