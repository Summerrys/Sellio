import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import InviteStaffDialog from '../components/staff/InviteStaffDialog';
import CreateStaffDialog from '../components/staff/CreateStaffDialog';
import EditStaffDialog from '../components/staff/EditStaffDialog';
import StaffTable from '../components/staff/StaffTable';
import StaffCards from '../components/staff/StaffCards';
import { UserPlus, Search, LayoutGrid, List, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Staff() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', tenantId],
    queryFn: () => base44.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  // Filter staff
  const filteredStaff = staff.filter(member => {
    const matchesSearch = !searchQuery || 
      member.user_email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter;
    
    const matchesRole = roleFilter === 'all' || member.role_id === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  return (
    <RequirePermission permission="staff.view">
      <div className="space-y-6">
        <PageHeader
          title="Staff Management"
          description="Manage your team members and their roles"
          actions={
            <RequirePermission permission="staff.create" silent>
              <Button
                onClick={() => setInviteDialogOpen(true)}
                className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Staff
              </Button>
            </RequirePermission>
          }
        />

        {/* Filters and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            {/* Role Filter */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View Toggle */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('table')}
              className={cn(
                "h-8 px-3",
                viewMode === 'table' && "bg-white shadow-sm"
              )}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('cards')}
              className={cn(
                "h-8 px-3",
                viewMode === 'cards' && "bg-white shadow-sm"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Staff List */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading staff...</div>
        ) : filteredStaff.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchQuery || statusFilter !== 'all' || roleFilter !== 'all' 
              ? "No staff found" 
              : "No staff members yet"}
            description={searchQuery || statusFilter !== 'all' || roleFilter !== 'all'
              ? "Try adjusting your filters"
              : "Invite your first team member to get started"}
            actionLabel="Add Staff"
            onAction={() => setInviteDialogOpen(true)}
          />
        ) : viewMode === 'table' ? (
          <StaffTable staff={filteredStaff} onEdit={setEditingStaff} />
        ) : (
          <StaffCards staff={filteredStaff} onEdit={setEditingStaff} />
        )}

        {/* Dialogs */}
        <CreateStaffDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['staff'] });
          }}
        />

        <InviteStaffDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          tenantId={tenantId}
        />

        <EditStaffDialog
          open={!!editingStaff}
          onOpenChange={(open) => !open && setEditingStaff(null)}
          staff={editingStaff}
          tenantId={tenantId}
        />
      </div>
    </RequirePermission>
  );
}