import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Eye, UserCog, Ban, CheckCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function SuperAdminTenants() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useTenant();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: tenants = [] } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: () => base44.asServiceRole.entities.Tenant.list('-created_date'),
    enabled: isSuperAdmin,
  });

  const { data: tenantUsers = [] } = useQuery({
    queryKey: ['all-tenant-users'],
    queryFn: () => base44.asServiceRole.entities.TenantUser.list(),
    enabled: isSuperAdmin,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['all-products'],
    queryFn: () => base44.asServiceRole.entities.Product.list(),
    enabled: isSuperAdmin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ tenantId, status }) => {
      return base44.asServiceRole.entities.Tenant.update(tenantId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
      toast.success('Tenant status updated');
    },
    onError: () => {
      toast.error('Failed to update tenant status');
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (tenantId) => {
      return base44.asServiceRole.entities.Tenant.delete(tenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
      toast.success('Tenant deleted');
    },
    onError: () => {
      toast.error('Failed to delete tenant');
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  // Filter tenants
  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = tenant.name.toLowerCase().includes(search.toLowerCase()) ||
                         tenant.owner_email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    const matchesType = typeFilter === 'all' || tenant.industry === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const getUserCount = (tenantId) => {
    return tenantUsers.filter(tu => tu.tenant_id === tenantId).length;
  };

  const getProductCount = (tenantId) => {
    return products.filter(p => p.tenant_id === tenantId).length;
  };

  const handleImpersonate = (tenant) => {
    // Store super admin context
    localStorage.setItem('superAdminImpersonating', 'true');
    localStorage.setItem('superAdminImpersonatingTenant', tenant.id);
    toast.success(`Impersonating ${tenant.name}`);
    window.location.href = createPageUrl('Dashboard');
  };

  const handleStatusChange = (tenantId, status) => {
    if (confirm(`Are you sure you want to ${status} this tenant?`)) {
      updateStatusMutation.mutate({ tenantId, status });
    }
  };

  const handleDelete = (tenantId, tenantName) => {
    if (confirm(`Are you sure you want to DELETE ${tenantName}? This action cannot be undone.`)) {
      deleteTenantMutation.mutate(tenantId);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Tenants"
        description="Manage all Apptelier Suite customers"
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="restaurant">Restaurant</SelectItem>
              <SelectItem value="cafe">Cafe</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tenants Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Business</th>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Type</th>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Admin</th>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Plan</th>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Status</th>
                <th className="text-center p-4 text-sm font-semibold text-slate-700">Users</th>
                <th className="text-center p-4 text-sm font-semibold text-slate-700">Products</th>
                <th className="text-left p-4 text-sm font-semibold text-slate-700">Created</th>
                <th className="text-right p-4 text-sm font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="border-b hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <span className="text-sm font-semibold text-slate-600">
                            {tenant.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{tenant.name}</p>
                        <p className="text-xs text-slate-500">{tenant.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="capitalize text-sm text-slate-600">{tenant.industry}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-600">{tenant.owner_email}</span>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className="capitalize">{tenant.plan}</Badge>
                  </td>
                  <td className="p-4">
                    <Badge
                      className={
                        tenant.status === 'active' ? 'bg-green-100 text-green-700' :
                        tenant.status === 'trial' ? 'bg-blue-100 text-blue-700' :
                        tenant.status === 'suspended' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }
                    >
                      {tenant.status}
                    </Badge>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-sm font-medium">{getUserCount(tenant.id)}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-sm font-medium">{getProductCount(tenant.id)}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-600">
                      {format(new Date(tenant.created_date), 'MMM dd, yyyy')}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(createPageUrl(`SuperAdminTenantDetail?id=${tenant.id}`))}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleImpersonate(tenant)}>
                          <UserCog className="w-4 h-4 mr-2" />
                          Impersonate
                        </DropdownMenuItem>
                        {tenant.status === 'active' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, 'suspended')}>
                            <Ban className="w-4 h-4 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                        {tenant.status === 'suspended' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, 'active')}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDelete(tenant.id, tenant.name)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}