import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import StatCard from '../components/ui-custom/StatCard';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, ShoppingBag, Building2 } from 'lucide-react';

const COLORS = ['#334155', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export default function SuperAdminAnalytics() {
  const { isSuperAdmin } = useTenant();

  const { data: tenants = [] } = useQuery({
    queryKey: ['analyticsTenants'],
    queryFn: () => base44.entities.Tenant.list(),
    enabled: isSuperAdmin,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['analyticsOrders'],
    queryFn: () => base44.entities.Order.list('-created_date', 200),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-slate-400">Access denied.</p></div>;
  }

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const completedOrders = orders.filter(o => o.status === 'completed');
  const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

  // Revenue by tenant
  const tenantRevenue = {};
  orders.forEach(o => {
    tenantRevenue[o.tenant_id] = (tenantRevenue[o.tenant_id] || 0) + (o.total_amount || 0);
  });
  const revenueByTenant = Object.entries(tenantRevenue).map(([tid, rev]) => {
    const t = tenants.find(x => x.id === tid);
    return { name: t?.name || 'Unknown', revenue: Number(rev.toFixed(2)) };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // Industry distribution
  const industryCount = {};
  tenants.forEach(t => { industryCount[t.industry || 'other'] = (industryCount[t.industry || 'other'] || 0) + 1; });
  const industryData = Object.entries(industryCount).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <PageHeader title="Platform Analytics" description="Cross-tenant performance metrics" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} icon={DollarSign} color="green" />
        <StatCard title="Total Orders" value={orders.length} icon={ShoppingBag} color="blue" />
        <StatCard title="Avg Order Value" value={`$${avgOrderValue.toFixed(2)}`} icon={TrendingUp} color="purple" />
        <StatCard title="Total Tenants" value={tenants.length} icon={Building2} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-6">Revenue by Tenant</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByTenant} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.08)', fontSize: 12 }}
                  formatter={(value) => [`$${value}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#334155" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-6">Industry Mix</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={industryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                  {industryData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.08)', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {industryData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-slate-500 capitalize">{d.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}