import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Plus, Trash2, Crown } from 'lucide-react';

export default function Staff() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role_id: '' });

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff', tenantId],
    queryFn: () => base44.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      const role = roles.find(r => r.id === data.role_id);
      await base44.entities.TenantUser.create({
        tenant_id: tenantId,
        user_email: data.email,
        role_id: data.role_id,
        role_name: role?.name || '',
        status: 'invited',
        is_owner: false,
      });
      await base44.users.inviteUser(data.email, 'user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowInvite(false);
      setInviteForm({ email: '', role_id: '' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id) => base44.entities.TenantUser.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  return (
    <PermissionGate permission="staff.read">
      <PageHeader title="Staff" description="Manage your team members and their access"
        actions={
          <PermissionGate permission="staff.create" fallback={null}>
            <Button onClick={() => setShowInvite(true)} className="bg-slate-900 hover:bg-slate-800 gap-2"><Plus className="w-4 h-4" /> Invite Staff</Button>
          </PermissionGate>
        }
      />

      {staffList.length === 0 ? (
        <Card className="border-0 shadow-sm"><EmptyState icon={Users} title="No staff members" description="Invite team members to help manage your business." actionLabel="Invite Staff" onAction={() => setShowInvite(true)} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffList.map(s => (
            <Card key={s.id} className="border-0 shadow-sm p-5 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-slate-100 text-slate-600 text-sm font-medium">
                      {s.user_email?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-900">{s.user_email}</p>
                      {s.is_owner && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <p className="text-xs text-slate-400">{s.role_name || 'No role'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {!s.is_owner && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => removeMutation.mutate(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Invite Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Email</Label><Input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="staff@example.com" /></div>
            <div><Label>Role</Label>
              <Select value={inviteForm.role_id} onValueChange={v => setInviteForm({ ...inviteForm, role_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={() => inviteMutation.mutate(inviteForm)} disabled={!inviteForm.email || !inviteForm.role_id || inviteMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {inviteMutation.isPending ? 'Inviting...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}