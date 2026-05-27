import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PermissionGate from '../components/tenant/PermissionGate';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_TEMPLATES } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ThemeSelector from '../components/theme/ThemeSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Shield, Plus, Pencil, Trash2, Save, Palette, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TenantSettings() {
  return (
    <RequirePermission permission="settings.view">
      <TenantSettingsContent />
    </RequirePermission>
  );
}

function TenantSettingsContent() {
  const { tenantId, tenant } = useTenant();
  const primaryColor = tenant?.theme_config?.primary_color || null;
  const primaryBtnStyle = primaryColor
    ? { background: primaryColor, color: '#fff' }
    : { background: 'var(--color-primary-gradient)', color: '#fff' };
  const queryClient = useQueryClient();

  const [businessForm, setBusinessForm] = useState({ name: '', phone: '', address: '', currency: 'SGD', timezone: 'Asia/Singapore' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
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
    queryFn: () => db.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async () => {
      const supabase = await getSupabase();
      const { error } = await supabase.from('tenants').update(businessForm).eq('id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['currentTenant'] }); toast.success('Settings saved'); },
  });

  const saveRoleMutation = useMutation({
    mutationFn: async (data) => {
      const supabase = await getSupabase();
      if (editingRole) {
        const { error } = await supabase.from('roles').update({ name: data.name, slug: data.name.toLowerCase().replace(/\s+/g, '-'), permissions: data.permissions, description: data.description }).eq('id', editingRole.id).eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settingsRoles'] }); closeRoleForm(); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id) => db.entities.Role.delete(id),
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

  const applyTemplate = (templateKey) => {
    const template = ROLE_TEMPLATES[templateKey];
    if (template) {
      setRoleForm({
        ...roleForm,
        name: roleForm.name || template.name,
        description: roleForm.description || template.description,
        permissions: template.permissions,
      });
    }
  };

  return (
    <PermissionGate permission="settings.read">
      <PageHeader title="Settings" description="Configure your business and manage roles" />

      <Tabs defaultValue="business">
        <style>{`
          .settings-tabs [data-state=active] {
            background: ${primaryColor ? primaryColor : 'var(--color-primary-gradient, rgb(var(--color-primary)))'} !important;
            color: white !important;
          }
        `}</style>
        <TabsList className="settings-tabs bg-white border border-slate-100 shadow-sm mb-6 w-full sm:w-auto">
          <TabsTrigger value="business" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Building2 className="w-4 h-4" /> <span className="hidden xs:inline">Business</span><span className="xs:hidden text-xs">Biz</span>
          </TabsTrigger>
          <TabsTrigger value="theme" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Palette className="w-4 h-4" /> Theme
          </TabsTrigger>
          <TabsTrigger value="roles" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Shield className="w-4 h-4" /> <span className="hidden xs:inline">Roles & Permissions</span><span className="xs:hidden text-xs">Roles</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card className="border-0 shadow-sm p-6 max-w-2xl">
            <div className="space-y-4">
              <div><Label>Business Name</Label><Input className="h-11" value={businessForm.name} onChange={e => setBusinessForm({ ...businessForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input className="h-11" value={businessForm.phone} onChange={e => setBusinessForm({ ...businessForm, phone: e.target.value })} /></div>
                <div><Label>Currency</Label>
                  <Select value={businessForm.currency} onValueChange={v => setBusinessForm({ ...businessForm, currency: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'THB', 'IDR', 'PHP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Address</Label><Input className="h-11" value={businessForm.address} onChange={e => setBusinessForm({ ...businessForm, address: e.target.value })} /></div>
              <Button onClick={() => updateBusinessMutation.mutate()} disabled={updateBusinessMutation.isPending} className="h-11 gap-2" style={primaryBtnStyle}>
                <Save className="w-4 h-4" /> {updateBusinessMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </Card>

          {/* Account Deletion */}
          <Card className="border border-red-100 shadow-sm p-6 max-w-2xl mt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-700">Delete Account</h3>
                <p className="text-xs text-slate-500 mt-1">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Button
                  variant="outline"
                  className="mt-3 h-11 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="theme">
          <div className="max-w-3xl">
            <ThemeSelector variant="full" />
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Roles</h3>
            <Button onClick={() => openRoleForm(null)} size="sm" className="gap-1" style={primaryBtnStyle}><Plus className="w-3.5 h-3.5" /> New Role</Button>
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

      {/* Account Deletion Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!isDeleting) setShowDeleteConfirm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              This will <strong>permanently delete</strong> your business account, all products, orders, staff, and settings. This cannot be undone.
            </p>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700 space-y-1">
              <p>• All products and categories will be removed</p>
              <p>• All order history will be erased</p>
              <p>• All staff accounts will be revoked</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">
                Type <span className="font-mono font-semibold text-slate-800">DELETE</span> to confirm
              </Label>
              <Input
                className="mt-1 h-11"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                disabled={isDeleting}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              className="h-11 bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={async () => {
                setIsDeleting(true);
                try {
                  const res = await base44.functions.invoke('deleteTenantWithCascade', { tenant_id: tenantId });
                  if (res.data?.success) {
                    toast.success('Account deleted. Redirecting...');
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                  } else {
                    throw new Error(res.data?.error || 'Deletion failed');
                  }
                } catch (err) {
                  toast.error(err.message || 'Failed to delete account. Please contact support.');
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Form Dialog */}
      <Dialog open={showRoleForm} onOpenChange={setShowRoleForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRole ? 'Edit Role' : 'New Role'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Permissions</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder="Use template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_TEMPLATES).map(([key, template]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto border border-slate-100 rounded-xl p-4">
                {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                  <div key={groupKey} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-white py-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{group.label}</h5>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            const allSelected = group.permissions.every(p => roleForm.permissions.includes(p));
                            setRoleForm(prev => ({
                              ...prev,
                              permissions: allSelected
                                ? prev.permissions.filter(p => !group.permissions.includes(p))
                                : [...new Set([...prev.permissions, ...group.permissions])]
                            }));
                          }}
                        >
                          {group.permissions.every(p => roleForm.permissions.includes(p)) ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-2">
                      {group.permissions.map(permKey => (
                        <label key={permKey} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded">
                          <Checkbox 
                            checked={roleForm.permissions.includes(permKey)} 
                            onCheckedChange={() => togglePermission(permKey)} 
                          />
                          <span className="text-xs text-slate-600">{ALL_PERMISSIONS[permKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-3 text-xs text-slate-400">
                {roleForm.permissions.length} permission{roleForm.permissions.length !== 1 ? 's' : ''} selected
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRoleForm}>Cancel</Button>
            <Button onClick={() => saveRoleMutation.mutate(roleForm)} disabled={!roleForm.name || saveRoleMutation.isPending} style={primaryBtnStyle}>
              {saveRoleMutation.isPending ? 'Saving...' : editingRole ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}