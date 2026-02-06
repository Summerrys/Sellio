import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PermissionGate from '../components/tenant/PermissionGate';
import { ALL_PERMISSIONS } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Shield, Plus, Pencil, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function TenantSettings() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();

  const [businessForm, setBusinessForm] = useState({ name: '', phone: '', address: '', currency: 'SGD', timezone: 'Asia/Singapore' });
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });

  useEffect(() => {
    if (tenant) {
      setBusinessForm({ name: tenant.name || '', phone: tenant.phone || '', address: tenant.address || '', currency: tenant.currency || 'SGD', timezone: tenant.timezone || 'Asia/Singapore' });
    }
  }, [tenant]);

  const { data: roles = [] } = useQuery({
    queryKey: ['settingsRoles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const updateBusinessMutation = useMutation({
    mutationFn: () => base44.entities.Tenant.update(tenantId, businessForm),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['currentTenant'] }); toast.success('Settings saved'); },
  });

  const saveRoleMutation = useMutation({
    mutationFn: (data) => editingRole
      ? base44.entities.Role.update(editingRole.id, data)
      : base44.entities.Role.create({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settingsRoles'] }); closeRoleForm(); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id) => base44.entities.Role.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settingsRoles'] }),
  });

  const openRoleForm = (role) => {
    setEditingRole(role || null);
    setRoleForm(role ? { name: role.name, description: role.description || '', permissions: role.permissions || [] } : { name: '', description: '', permissions: [] });
    setShowRoleForm(true);
  };
  const closeRoleForm = () => { setShowRoleForm(false); setEditingRole(null); };

  const togglePermission = (perm) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const permGroups = {};
  Object.entries(ALL_PERMISSIONS).forEach(([key, label]) => {
    const [group] = key.split('.');
    if (!permGroups[group]) permGroups[group] = [];
    permGroups[group].push({ key, label });
  });

  return (
    <PermissionGate permission="settings.read">
      <PageHeader title="Settings" description="Configure your business and manage roles" />

      <Tabs defaultValue="business">
        <TabsList className="bg-white border border-slate-100 shadow-sm mb-6">
          <TabsTrigger value="business" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg gap-2">
            <Building2 className="w-4 h-4" /> Business
          </TabsTrigger>
          <TabsTrigger value="roles" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg gap-2">
            <Shield className="w-4 h-4" /> Roles & Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card className="border-0 shadow-sm p-6 max-w-2xl">
            <div className="space-y-4">
              <div><Label>Business Name</Label><Input value={businessForm.name} onChange={e => setBusinessForm({ ...businessForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={businessForm.phone} onChange={e => setBusinessForm({ ...businessForm, phone: e.target.value })} /></div>
                <div><Label>Currency</Label>
                  <Select value={businessForm.currency} onValueChange={v => setBusinessForm({ ...businessForm, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'THB', 'IDR', 'PHP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Address</Label><Input value={businessForm.address} onChange={e => setBusinessForm({ ...businessForm, address: e.target.value })} /></div>
              <Button onClick={() => updateBusinessMutation.mutate()} disabled={updateBusinessMutation.isPending} className="bg-slate-900 hover:bg-slate-800 gap-2">
                <Save className="w-4 h-4" /> {updateBusinessMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Roles</h3>
            <Button onClick={() => openRoleForm(null)} size="sm" className="bg-slate-900 hover:bg-slate-800 gap-1"><Plus className="w-3.5 h-3.5" /> New Role</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map(role => (
              <Card key={role.id} className="border-0 shadow-sm p-5 group">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{role.name}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">{role.permissions?.length || 0} permissions</p>
                    {role.description && <p className="text-xs text-slate-500 mt-2">{role.description}</p>}
                  </div>
                  {!role.is_system && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openRoleForm(role)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteRoleMutation.mutate(role.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Role Form Dialog */}
      <Dialog open={showRoleForm} onOpenChange={setShowRoleForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRole ? 'Edit Role' : 'New Role'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} /></div>
            <div>
              <Label className="mb-3 block">Permissions</Label>
              <div className="space-y-4">
                {Object.entries(permGroups).map(([group, perms]) => (
                  <div key={group}>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 capitalize">{group}</h5>
                    <div className="grid grid-cols-2 gap-2">
                      {perms.map(p => (
                        <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={roleForm.permissions.includes(p.key)} onCheckedChange={() => togglePermission(p.key)} />
                          <span className="text-xs text-slate-600">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRoleForm}>Cancel</Button>
            <Button onClick={() => saveRoleMutation.mutate(roleForm)} disabled={!roleForm.name || saveRoleMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {saveRoleMutation.isPending ? 'Saving...' : editingRole ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}