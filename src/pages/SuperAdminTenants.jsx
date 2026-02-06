import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Plus, Search, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

export default function SuperAdminTenants() {
  const { isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [newTenant, setNewTenant] = useState({ name: '', slug: '', owner_email: '', industry: 'restaurant', plan: 'free' });

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['allTenantsAdmin'],
    queryFn: () => base44.entities.Tenant.list('-created_date'),
    enabled: isSuperAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const tenant = await base44.entities.Tenant.create({ ...data, status: 'active' });
      // Create default admin role for the new tenant
      const role = await base44.entities.Role.create({
        tenant_id: tenant.id,
        name: 'Admin',
        slug: 'admin',
        is_system: true,
        permissions: [
          'products.read', 'products.create', 'products.update', 'products.delete',
          'categories.read', 'categories.create', 'categories.update', 'categories.delete',
          'orders.read', 'orders.create', 'orders.update', 'orders.delete',
          'tables.read', 'tables.create', 'tables.update', 'tables.delete',
          'inventory.read', 'inventory.update',
          'staff.read', 'staff.create', 'staff.update', 'staff.delete',
          'roles.read', 'roles.create', 'roles.update', 'roles.delete',
          'reports.read', 'settings.read', 'settings.update',
        ],
      });
      // Create tenant-user link for the owner
      await base44.entities.TenantUser.create({
        tenant_id: tenant.id,
        user_email: data.owner_email,
        role_id: role.id,
        role_name: 'Admin',
        status: 'active',
        is_owner: true,
      });
      return tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTenantsAdmin'] });
      setShowCreate(false);
      setNewTenant({ name: '', slug: '', owner_email: '', industry: 'restaurant', plan: 'free' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Tenant.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allTenantsAdmin'] }),
  });

  if (!isSuperAdmin) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-slate-400">Access denied.</p></div>;
  }

  const filtered = tenants.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.owner_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="All Tenants"
        description="Manage all businesses on the platform"
        actions={
          <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2">
            <Plus className="w-4 h-4" /> Add Tenant
          </Button>
        }
      />

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 border-slate-200"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Building2} title="No tenants found" description="Create the first tenant to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Business</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Industry</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Plan</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => (
                <TableRow key={t.id} className="hover:bg-slate-25">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.owner_email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 capitalize">{t.industry?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-sm text-slate-600 capitalize">{t.plan}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-sm text-slate-400">{t.created_date ? format(new Date(t.created_date), 'MMM d, yyyy') : '-'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'active' })}>Activate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'suspended' })} className="text-red-600">Suspend</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create Tenant Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Business Name</Label><Input value={newTenant.name} onChange={e => setNewTenant({ ...newTenant, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} placeholder="My Restaurant" /></div>
            <div><Label>Slug</Label><Input value={newTenant.slug} onChange={e => setNewTenant({ ...newTenant, slug: e.target.value })} placeholder="my-restaurant" /></div>
            <div><Label>Owner Email</Label><Input type="email" value={newTenant.owner_email} onChange={e => setNewTenant({ ...newTenant, owner_email: e.target.value })} placeholder="owner@example.com" /></div>
            <div><Label>Industry</Label>
              <Select value={newTenant.industry} onValueChange={v => setNewTenant({ ...newTenant, industry: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['restaurant', 'cafe', 'bar', 'retail', 'salon', 'other'].map(i => (
                    <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Plan</Label>
              <Select value={newTenant.plan} onValueChange={v => setNewTenant({ ...newTenant, plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['free', 'starter', 'professional', 'enterprise'].map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newTenant)}
              disabled={!newTenant.name || !newTenant.slug || !newTenant.owner_email || createMutation.isPending}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}