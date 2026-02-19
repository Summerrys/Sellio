import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant, ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_TEMPLATES } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Pencil, Trash2, Copy, Users, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RoleManagement() {
  const { tenantId, isSuperAdmin, isOwner } = useTenant();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] });
  const [selectedRole, setSelectedRole] = useState(null);

  const { data: roles = [] } = useQuery({
    queryKey: ['allRoles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: tenantUsers = [] } = useQuery({
    queryKey: ['roleUsers', tenantId],
    queryFn: () => base44.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Role.update(editing.id, data)
      : base44.entities.Role.create({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoles'] });
      close();
      toast.success(editing ? 'Role updated' : 'Role created');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Role.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoles'] });
      toast.success('Role deleted');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (role) => base44.entities.Role.create({
      tenant_id: tenantId,
      name: `${role.name} (Copy)`,
      slug: `${role.slug}-copy-${Date.now()}`,
      description: role.description,
      permissions: role.permissions || [],
      is_system: false,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoles'] });
      toast.success('Role duplicated');
    },
  });

  const open = (role) => {
    setEditing(role || null);
    setForm(role ? {
      name: role.name,
      description: role.description || '',
      permissions: role.permissions || []
    } : {
      name: '',
      description: '',
      permissions: []
    });
    setShowForm(true);
  };

  const close = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', description: '', permissions: [] });
  };

  const togglePermission = (perm) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const applyTemplate = (templateKey) => {
    const template = ROLE_TEMPLATES[templateKey];
    if (template) {
      setForm({
        name: form.name || template.name,
        description: form.description || template.description,
        permissions: template.permissions,
      });
    }
  };

  const getUserCount = (roleId) => tenantUsers.filter(u => u.role_id === roleId).length;

  return (
    <RequirePermission permission="roles.view">
      <PageHeader
        title="Role Management"
        description="Create and manage roles with granular permissions"
        actions={
          <RequirePermission permission="roles.create" silent>
            <Button onClick={() => open(null)} className="bg-slate-900 hover:bg-slate-800 gap-2">
              <Plus className="w-4 h-4" /> Create Role
            </Button>
          </RequirePermission>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-2 space-y-3">
          {roles.map(role => {
            const userCount = getUserCount(role.id);
            return (
              <Card key={role.id} className="border-0 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedRole(role)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{role.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">{role.permissions?.length || 0} permissions</span>
                          <span className="text-xs text-slate-300">•</span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {userCount} user{userCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    {role.description && <p className="text-xs text-slate-500 ml-13">{role.description}</p>}
                    {role.is_system && <Badge className="mt-2 text-xs bg-blue-50 text-blue-700 border-blue-200">Default Role</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <RequirePermission permission="roles.create" silent>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(role); }} title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </RequirePermission>
                    <RequirePermission permission="roles.edit" silent>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); open(role); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </RequirePermission>
                    {!role.is_system && (
                      <RequirePermission permission="roles.delete" silent>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this role?')) deleteMutation.mutate(role.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </RequirePermission>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Role Details Sidebar */}
        <Card className="border-0 shadow-sm p-5 lg:sticky lg:top-6 h-fit">
          {selectedRole ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4">{selectedRole.name}</h3>
              <div className="space-y-3">
                {Object.entries(PERMISSION_GROUPS).map(([key, group]) => {
                  const rolePerms = selectedRole.permissions || [];
                  const groupPerms = group.permissions.filter(p => rolePerms.includes(p));
                  if (groupPerms.length === 0) return null;
                  return (
                    <div key={key}>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{group.label}</p>
                      <div className="space-y-1">
                        {groupPerms.map(perm => (
                          <div key={perm} className="flex items-center gap-2 text-xs text-slate-600">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            {ALL_PERMISSIONS[perm]}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-slate-400">
              Select a role to view permissions
            </div>
          )}
        </Card>
      </div>

      {/* Create/Edit Role Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Role' : 'Create New Role'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Kitchen Staff" />
              </div>
              <div>
                <Label>Template</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Start from template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_TEMPLATES).map(([key, template]) => (
                      <SelectItem key={key} value={key}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this role can do" rows={2} />
            </div>

            <div>
              <Label className="mb-3 block">Permissions ({form.permissions.length} selected)</Label>
              <div className="space-y-4 max-h-96 overflow-y-auto border border-slate-100 rounded-xl p-4">
                {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                  <div key={groupKey} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-white py-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{group.label}</h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          const allSelected = group.permissions.every(p => form.permissions.includes(p));
                          setForm(prev => ({
                            ...prev,
                            permissions: allSelected
                              ? prev.permissions.filter(p => !group.permissions.includes(p))
                              : [...new Set([...prev.permissions, ...group.permissions])]
                          }));
                        }}
                      >
                        {group.permissions.every(p => form.permissions.includes(p)) ? 'Deselect' : 'Select All'}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-2">
                      {group.permissions.map(permKey => (
                        <label key={permKey} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded">
                          <Checkbox checked={form.permissions.includes(permKey)} onCheckedChange={() => togglePermission(permKey)} />
                          <span className="text-xs text-slate-600">{ALL_PERMISSIONS[permKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update Role' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  );
}