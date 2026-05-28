import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
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
import StaffImportDialog from '../components/staff/StaffImportDialog';
import StaffTable from '../components/staff/StaffTable';
import StaffCards from '../components/staff/StaffCards';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserPlus, Search, LayoutGrid, List, Users, Download, Upload, FileDown, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [importOpen, setImportOpen] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', tenantId],
    queryFn: () => db.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => db.entities.Role.filter({ tenant_id: tenantId }),
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

  const csvEscape = (val) => {
    const s = val == null ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleDownloadTemplate = () => {
    const csv = 'name,email,role,status\nJohn Doe,john@example.com,staff,active';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'staff_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const rows = staff.map(m => [m.user_name || '', m.user_email || '', m.role_name || '', m.status || ''].map(csvEscape).join(','));
    const csv = ['name,email,role,status', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `staff_export_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (rows) => {
    for (const row of rows) {
      await db.entities.TenantUser.create({
        tenant_id: tenantId,
        user_email: row.email,
        user_name: row.name,
        role_name: row.role || 'staff',
        status: row.status || 'active',
      });
    }
    queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
  };

  return (
    <RequirePermission permission="staff.view">
      <div className="space-y-6">
        <PageHeader
          title="Staff Management"
          description="Manage your team members and their roles"
          actions={
            <RequirePermission permission="staff.create" silent>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDownloadTemplate}>
                      <FileDown className="w-4 h-4 mr-2" />
                      Download Template
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExport}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export All Staff
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button
                  onClick={() => setInviteDialogOpen(true)}
                  size="sm"
                  className="text-white gap-1.5 whitespace-nowrap"
                  style={{ background: 'var(--color-primary-gradient)' }}
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Staff</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </div>
            </RequirePermission>
          }
        />

        {/* Search */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11"
          />
        </div>

        {/* Filters + View Toggle */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger style={{ flex: 1 }} className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger style={{ flex: 1 }} className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1" style={{ flexShrink: 0 }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'rgba(var(--color-primary), 0.08)' : 'transparent',
                color: viewMode === 'table' ? 'rgb(var(--color-primary))' : '#9ca3af',
                border: '0.5px solid #e5e7eb',
                borderRadius: '8px',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                background: viewMode === 'cards' ? 'rgba(var(--color-primary), 0.08)' : 'transparent',
                color: viewMode === 'cards' ? 'rgb(var(--color-primary))' : '#9ca3af',
                border: '0.5px solid #e5e7eb',
                borderRadius: '8px',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={18} />
            </button>
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

        <StaffImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={handleImport}
        />
      </div>
    </RequirePermission>
  );
}