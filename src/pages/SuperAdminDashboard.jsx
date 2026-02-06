import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import StatCard from '../components/ui-custom/StatCard';
import StatusBadge from '../components/ui-custom/StatusBadge';
import { Card } from '@/components/ui/card';
import { Building2, Users, ClipboardList, TrendingUp, Globe, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function SuperAdminDashboard() {
  const { isSuperAdmin } = useTenant();

  const { data: tenants = [] } = useQuery({
    queryKey: ['allTenants'],
    queryFn: () => base44.entities.Tenant.list('-created_date'),
    enabled: isSuperAdmin,
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['allOrders'],
    queryFn: () => base44.entities.Order.list('-created_date', 100),
    enabled: isSuperAdmin,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allTenantUsers'],
    queryFn: () => base44.entities.TenantUser.list(),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400">Access denied. Super Admin only.</p>
      </div>
    );
  }

  const activeTenants = tenants.filter(t => t.status === 'active');
  const totalRevenue = allOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="God View"
        description="Super Admin overview of all tenants and platform metrics"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Tenants" value={tenants.length} icon={Building2} color="blue" />
        <StatCard title="Active Tenants" value={activeTenants.length} icon={Globe} color="green" />
        <StatCard title="Total Users" value={allUsers.length} icon={Users} color="purple" />
        <StatCard title="Platform Revenue" value={`$${totalRevenue.toFixed(2)}`} icon={TrendingUp} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tenants */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Recent Tenants</h2>
            <Link to={createPageUrl('SuperAdminTenants')} className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {tenants.slice(0, 6).map(t => (
              <div key={t.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.owner_email}</p>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* Tenant Breakdown by Plan */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Plan Distribution</h2>
          </div>
          <div className="p-6">
            {['free', 'starter', 'professional', 'enterprise'].map(plan => {
              const count = tenants.filter(t => t.plan === plan).length;
              const pct = tenants.length > 0 ? (count / tenants.length) * 100 : 0;
              const colors = {
                free: 'bg-slate-400',
                starter: 'bg-blue-500',
                professional: 'bg-violet-500',
                enterprise: 'bg-amber-500',
              };
              return (
                <div key={plan} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700 capitalize">{plan}</span>
                    <span className="text-sm text-slate-500">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${colors[plan]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}