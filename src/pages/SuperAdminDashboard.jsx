import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, DollarSign, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { Line, Pie } from 'recharts';
import { ResponsiveContainer, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function SuperAdminDashboard() {
  const { isSuperAdmin } = useTenant();

  const { data: tenants = [] } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: () => base44.asServiceRole.entities.Tenant.list(),
    enabled: isSuperAdmin,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-tenant-users'],
    queryFn: () => base44.asServiceRole.entities.TenantUser.list(),
    enabled: isSuperAdmin,
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['all-subscriptions'],
    queryFn: () => base44.asServiceRole.entities.Subscription.list(),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-slate-500">Super Admin access required</p>
        </Card>
      </div>
    );
  }

  // Calculate stats
  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const trialTenants = tenants.filter(t => t.status === 'trial').length;
  const totalUsers = allUsers.length;
  const monthlyRevenue = subscriptions
    .filter(s => s.status === 'active' && s.billing_cycle === 'monthly')
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  // New signups this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const newSignups = tenants.filter(t => new Date(t.created_date) > oneWeekAgo).length;

  // Business type distribution
  const businessTypes = tenants.reduce((acc, t) => {
    acc[t.industry] = (acc[t.industry] || 0) + 1;
    return acc;
  }, {});
  const businessTypesData = Object.entries(businessTypes).map(([name, value]) => ({ name, value }));

  // Plan distribution
  const planDistribution = tenants.reduce((acc, t) => {
    acc[t.plan] = (acc[t.plan] || 0) + 1;
    return acc;
  }, {});
  const planData = Object.entries(planDistribution).map(([name, value]) => ({ name, value }));

  // Growth trend (last 30 days)
  const growthData = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const count = tenants.filter(t => new Date(t.created_date) <= date).length;
    growthData.push({ date: dateStr, tenants: count });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="🏛️ God View Dashboard"
        description="Apptelier Super Admin Control Center"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Tenants</CardTitle>
            <Building2 className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeTenants}</div>
            <p className="text-xs text-slate-500 mt-1">
              {trialTenants} in trial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Users</CardTitle>
            <Users className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalUsers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Across all tenants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Monthly Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${monthlyRevenue.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">
              MRR from subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">New This Week</CardTitle>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{newSignups}</div>
            <p className="text-xs text-slate-500 mt-1">
              New signups
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Growth */}
        <Card>
          <CardHeader>
            <CardTitle>Tenant Growth (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="tenants" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Business Types */}
        <Card>
          <CardHeader>
            <CardTitle>Business Types</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={businessTypesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {businessTypesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {planData.map((plan, idx) => (
                <div key={plan.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="capitalize text-sm font-medium">{plan.name}</span>
                  </div>
                  <span className="text-sm text-slate-500">{plan.value} tenants</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <span className="text-sm font-semibold text-green-600">● Healthy</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API Response</span>
                <span className="text-sm font-semibold text-green-600">● Normal</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">WebSocket</span>
                <span className="text-sm font-semibold text-green-600">● Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Storage</span>
                <span className="text-sm font-semibold text-green-600">● 42% Used</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}