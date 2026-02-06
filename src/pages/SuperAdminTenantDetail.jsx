import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, Users, Package, ShoppingBag, DollarSign, Calendar, 
  UserCog, ArrowLeft, Activity, HardDrive 
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function SuperAdminTenantDetail() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useTenant();
  const urlParams = new URLSearchParams(window.location.search);
  const tenantId = urlParams.get('id');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-detail', tenantId],
    queryFn: async () => {
      const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
      return tenants[0];
    },
    enabled: isSuperAdmin && !!tenantId,
  });

  const { data: tenantUsers = [] } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => base44.asServiceRole.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: isSuperAdmin && !!tenantId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['tenant-products', tenantId],
    queryFn: () => base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId }),
    enabled: isSuperAdmin && !!tenantId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['tenant-orders', tenantId],
    queryFn: () => base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 100),
    enabled: isSuperAdmin && !!tenantId,
  });

  const { data: subscription } = useQuery({
    queryKey: ['tenant-subscription', tenantId],
    queryFn: async () => {
      const subs = await base44.asServiceRole.entities.Subscription.filter({ tenant_id: tenantId });
      return subs[0];
    },
    enabled: isSuperAdmin && !!tenantId,
  });

  if (!isSuperAdmin || !tenant) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ordersToday = orders.filter(o => new Date(o.created_date) >= today).length;
  const revenueToday = orders
    .filter(o => new Date(o.created_date) >= today && o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const handleImpersonate = () => {
    localStorage.setItem('superAdminImpersonating', 'true');
    localStorage.setItem('superAdminImpersonatingTenant', tenant.id);
    toast.success(`Impersonating ${tenant.name}`);
    window.location.href = createPageUrl('Dashboard');
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl('SuperAdminTenants'))}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tenants
        </Button>
        <PageHeader
          title={tenant.name}
          description={`Detailed view of ${tenant.name}'s account`}
          actions={
            <Button onClick={handleImpersonate} className="gap-2">
              <UserCog className="w-4 h-4" />
              Impersonate Admin
            </Button>
          }
        />
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt="" className="w-20 h-20 rounded-lg object-cover border" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-slate-600">{tenant.name.charAt(0)}</span>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-lg">{tenant.name}</h3>
                <p className="text-sm text-slate-500">{tenant.slug}</p>
                <Badge className="mt-1 capitalize">{tenant.industry}</Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Owner Email:</span>
                <span className="font-medium">{tenant.owner_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <Badge className={
                  tenant.status === 'active' ? 'bg-green-100 text-green-700' :
                  tenant.status === 'trial' ? 'bg-blue-100 text-blue-700' :
                  'bg-red-100 text-red-700'
                }>
                  {tenant.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Plan:</span>
                <span className="font-medium capitalize">{tenant.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="font-medium">{tenant.country || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created:</span>
                <span className="font-medium">{format(new Date(tenant.created_date), 'MMM dd, yyyy')}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Active Staff</p>
                <p className="text-2xl font-bold mt-1">{tenantUsers.length}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Products</p>
                <p className="text-2xl font-bold mt-1">{products.length}</p>
              </div>
              <Package className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Orders Today</p>
                <p className="text-2xl font-bold mt-1">{ordersToday}</p>
              </div>
              <ShoppingBag className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Revenue Today</p>
                <p className="text-2xl font-bold mt-1">${revenueToday.toFixed(2)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription & Billing */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Subscription & Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Tier</p>
                <p className="font-semibold capitalize">{subscription.tier}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Billing Cycle</p>
                <p className="font-semibold capitalize">{subscription.billing_cycle}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Amount</p>
                <p className="font-semibold">${subscription.amount} {subscription.currency}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Status</p>
                <Badge>{subscription.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Current Period</p>
                <p className="text-sm">
                  {subscription.current_period_start && format(new Date(subscription.current_period_start), 'MMM dd')} - 
                  {subscription.current_period_end && format(new Date(subscription.current_period_end), 'MMM dd')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {orders.slice(0, 10).map((order) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{order.order_number}</p>
                  <p className="text-sm text-slate-500">{order.table_name || 'Takeaway'}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${order.total_amount?.toFixed(2)}</p>
                  <Badge variant="outline" className="text-xs">{order.status}</Badge>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <p className="text-center text-slate-500 py-4">No orders yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}