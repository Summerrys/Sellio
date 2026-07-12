import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant, ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_GROUP_META, ROLE_TEMPLATES, INDUSTRY_ROLES } from '../components/tenant/TenantContext';
import { isFnBIndustry, normalizeIndustry } from '@/lib/industry';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import CreateStaffDialog from '../components/staff/CreateStaffDialog';
import EditStaffDialog from '../components/staff/EditStaffDialog';
import StaffImportDialog from '../components/staff/StaffImportDialog';
import StaffTable from '../components/staff/StaffTable';
import StaffCards from '../components/staff/StaffCards';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Shield, Plus, Pencil, Trash2, Copy, Users, CheckCircle2, UserPlus, Search, LayoutGrid, List, Download, Upload, FileDown, FileSpreadsheet, X, Info, ClipboardList, ShoppingBag, Grid3X3, Package, QrCode, BarChart3, Settings2, CreditCard, Check, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';
import { Link } from 'react-router-dom';

// Visual identity per permission group in the toggle-based Roles editor — reuses
// the exact same color language as Dashboard's Quick Access cards (Orders=blue,
// Products=purple, Categories=pink, Tables=teal) so the palette feels like one
// consistent product rather than a one-off for this screen. Hex values are used
// (rather than dynamic Tailwind classes like `bg-${color}-600`) for the Switch/
// checkbox checked-states specifically, since Tailwind's build-time class
// scanner can't see interpolated class names and would silently drop them.
const GROUP_VISUALS = {
  dashboard:  { icon: LayoutDashboard, iconBg: 'bg-orange-50',  iconColor: 'text-orange-600',  accent: '#f97316' },
  orders:     { icon: ClipboardList, iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    accent: '#3b82f6' },
  products:   { icon: ShoppingBag,   iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  accent: '#8b5cf6' },
  categories: { icon: Grid3X3,       iconBg: 'bg-pink-50',    iconColor: 'text-pink-600',    accent: '#ec4899' },
  inventory:  { icon: Package,       iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', accent: '#10b981' },
  tables:     { icon: QrCode,        iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    accent: '#0d9488' },
  staff:      { icon: Users,         iconBg: 'bg-indigo-50',  iconColor: 'text-indigo-600',  accent: '#6366f1' },
  roles:      { icon: Shield,        iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   accent: '#d97706' },
  reports:    { icon: BarChart3,     iconBg: 'bg-cyan-50',    iconColor: 'text-cyan-600',    accent: '#0891b2' },
  settings:   { icon: Settings2,     iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   accent: '#64748b' },
};

// Read-only, color-coded summary of a role's permissions — mirrors the same icon
// badges/colors/chip language used in the editable Roles form (GROUP_VISUALS +
// PERMISSION_GROUP_META), just rendered as a static list instead of toggles.
// Shared between the desktop sidebar preview and the mobile preview modal so
// they can never visually drift apart from each other.
function RolePermissionSummary({ role }) {
  const rolePerms = role?.permissions || [];
  const groups = Object.entries(PERMISSION_GROUP_META).map(([groupKey, meta]) => {
    const visual = GROUP_VISUALS[groupKey];
    const hasMaster = !!meta.masterLabel;
    const grantedView = meta.viewKeys.some(k => rolePerms.includes(k));
    const grantedSubs = meta.subPermissions.filter(sp => rolePerms.includes(sp.key));
    const granted = hasMaster ? (grantedView || grantedSubs.length > 0) : grantedSubs.length > 0;
    return { groupKey, meta, visual, grantedSubs, granted };
  }).filter(g => g.granted);

  if (groups.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">No permissions granted</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map(({ groupKey, meta, visual, grantedSubs }) => {
        const Icon = visual.icon;
        return (
          <div key={groupKey} className="rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0", visual.iconBg)}>
                <Icon className={cn("w-3 h-3", visual.iconColor)} />
              </div>
              <span className="text-xs font-semibold text-slate-800">{meta.masterLabel || meta.label}</span>
            </div>
            <div className="flex flex-wrap gap-1 pl-8">
              {grantedSubs.length === 0 ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  View only
                </span>
              ) : (
                grantedSubs.map(sp => (
                  <span
                    key={sp.key}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ background: visual.accent }}
                  >
                    {sp.label}
                  </span>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function UserManagement({ embedded = false, onUpgrade }) {
  const [activeTab, setActiveTab] = useState('staff');

  return (
    <div className="space-y-6">
      {!embedded && <PageHeader title="User Management" description="Manage your staff and roles" />}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('staff')}
          className="flex-1 h-9 rounded-lg text-sm font-medium transition-all"
          style={activeTab === 'staff'
            ? { background: 'var(--color-primary-gradient)', color: '#fff' }
            : { background: 'transparent', color: '#64748b' }
          }
        >
          Staff
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className="flex-1 h-9 rounded-lg text-sm font-medium transition-all"
          style={activeTab === 'roles'
            ? { background: 'var(--color-primary-gradient)', color: '#fff' }
            : { background: 'transparent', color: '#64748b' }
          }
        >
          Roles
        </button>
      </div>
      {activeTab === 'staff' && <StaffContent onUpgrade={onUpgrade} />}
      {activeTab === 'roles' && <RolesContent onUpgrade={onUpgrade} />}
    </div>
  );
}

function StaffContent({ onUpgrade }) {
  const { tenantId, hasPermission } = useTenant();
  const canCreateStaff = hasPermission('staff.create');
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const { staffCap, isPro } = useSubscription();

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

  const filteredStaff = staff.filter(member => {
    const matchesSearch = !searchQuery || member.user_email?.toLowerCase().includes(searchQuery.toLowerCase());
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
      await db.entities.TenantUser.create({ tenant_id: tenantId, user_email: row.email, user_name: row.name, role_name: row.role || 'staff', status: row.status || 'active' });
    }
    queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
  };

  const staffCapReached = !isPro && staff.length >= staffCap;

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.user_name || member.user_email} from your team?`)) return;
    await db.entities.TenantUser.delete(member.id);
    queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
    toast.success('Staff member removed');
  };

  return (
    <RequirePermission permission="staff.view">
      <div className="space-y-4">
        {/* Action Buttons Row */}
        <RequirePermission permission="staff.create" silent>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadTemplate}><FileDown className="w-4 h-4 mr-2" />Download Template</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export All Staff</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div title={staffCapReached ? 'Upgrade your plan to add more staff' : undefined}>
              <Button onClick={() => setImportOpen(true)} variant="outline" size="sm" disabled={staffCapReached}>
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Import</span>
              </Button>
            </div>
            <div title={staffCapReached ? 'Upgrade your plan to add more staff' : undefined}>
              <Button onClick={() => setCreateOpen(true)} size="sm" className="text-white gap-1.5" style={{ background: 'var(--color-primary-gradient)' }} disabled={staffCapReached}>
                <UserPlus className="w-4 h-4" />Add Staff
              </Button>
            </div>
          </div>
        </RequirePermission>

        {/* Staff cap banner */}
        {staffCapReached && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <span>You've reached the {staffCap}-staff limit on your current plan.</span>
            {onUpgrade ? (
              <button onClick={onUpgrade} className="ml-auto font-medium text-slate-700 underline underline-offset-2 whitespace-nowrap">Upgrade</button>
            ) : (
              <Link to="/TenantSettings" className="ml-auto font-medium text-slate-700 underline underline-offset-2 whitespace-nowrap">Upgrade</Link>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11" />
        </div>

        {/* Filter Row */}
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="flex-1" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3, flexShrink: 0, marginLeft: 'auto' }}>
            <button onClick={() => setViewMode('cards')} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'cards' ? 'white' : 'transparent', boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'cards' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('table')} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'table' ? 'white' : 'transparent', boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'table' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><List size={16} /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading staff...</div>
        ) : filteredStaff.length === 0 ? (
          <EmptyState icon={Users} title={searchQuery || statusFilter !== 'all' || roleFilter !== 'all' ? "No staff found" : "No staff members yet"} description={searchQuery || statusFilter !== 'all' || roleFilter !== 'all' ? "Try adjusting your filters" : "Add your first team member to get started"} actionLabel={canCreateStaff ? 'Add Staff' : undefined} onAction={canCreateStaff ? () => setCreateOpen(true) : undefined} />
        ) : viewMode === 'table' ? (
          <StaffTable staff={filteredStaff} onEdit={setEditingStaff} />
        ) : (
          <StaffCards staff={filteredStaff} onEdit={setEditingStaff} onDelete={handleDelete} />
        )}

        <CreateStaffDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }); }} />
        <EditStaffDialog open={!!editingStaff} onOpenChange={(open) => !open && setEditingStaff(null)} staff={editingStaff} tenantId={tenantId} />
        <StaffImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} roles={roles} />
      </div>
    </RequirePermission>
  );
}

function RolesContent({ onUpgrade }) {
  const { tenantId, tenant } = useTenant();
  const { tier, isPro, roleCap } = useSubscription();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] });
  const [originalForm, setOriginalForm] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [mobilePreviewRole, setMobilePreviewRole] = useState(null);

  const { data: roles = [] } = useQuery({
    queryKey: ['allRoles', tenantId],
    queryFn: async () => {
      // FIX: db.entities.Role.filter() had no order() clause at all, so Postgres
      // returned rows in whatever physical order it felt like — stable-ish on first
      // load, but an UPDATE rewrites that row's physical tuple, which could (and did)
      // reshuffle where it appeared in the list. Same root cause as the earlier
      // Products-page reordering bug; same fix, a deterministic tiebreak.
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: tenantUsers = [] } = useQuery({
    queryKey: ['roleUsers', tenantId],
    queryFn: () => db.entities.TenantUser.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const supabase = await getSupabase();
      if (editing) {
        const { error } = await supabase.from('roles').update({ name: data.name, slug: data.name.toLowerCase().replace(/\s+/g, '-'), permissions: data.permissions, description: data.description }).eq('id', editing.id).eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allRoles'] }); close(); toast.success(editing ? 'Role updated' : 'Role created'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.entities.Role.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allRoles'] }); toast.success('Role deleted'); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (role) => db.entities.Role.create({ tenant_id: tenantId, name: `${role.name} (Copy)`, slug: `${role.slug}-copy-${Date.now()}`, description: role.description, permissions: role.permissions || [], is_system: false }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allRoles'] }); toast.success('Role duplicated'); },
  });

  const open = (role) => {
    const initial = role ? { name: role.name, description: role.description || '', permissions: role.permissions || [] } : { name: '', description: '', permissions: [] };
    setEditing(role || null);
    setForm(initial);
    setOriginalForm(initial);
    setShowForm(true);
  };

  const close = () => { setShowForm(false); setEditing(null); setForm({ name: '', description: '', permissions: [] }); setOriginalForm(null); };

  // Drives the sticky/highlighted save button below — previously "Update Role" only
  // lived at the very bottom of a long, independently-scrolling permissions list, so
  // toggling a permission gave no feedback that there was now something to save unless
  // you scrolled all the way down to notice the button. Comparing against a snapshot
  // taken when the dialog opened means this also correctly resets after a save.
  const isDirty = !!originalForm && (
    form.name !== originalForm.name ||
    form.description !== originalForm.description ||
    JSON.stringify([...form.permissions].sort()) !== JSON.stringify([...originalForm.permissions].sort())
  );

  const togglePermission = (perm) => {
    setForm(prev => ({ ...prev, permissions: prev.permissions.includes(perm) ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm] }));
  };

  // Toggle-based permission editor helpers. A group's master toggle is "on" if
  // its view permission(s) OR any of its sub-permissions are present — this
  // matters when opening an existing role that predates this UI (or was edited
  // via the old flat-checkbox editor) and might have an unusual combination like
  // a delete permission without the matching view permission. The first save
  // through this editor normalizes that: turning the master off always strips
  // the whole group, and turning it on always includes view.
  const isGroupMasterOn = (groupKey) => {
    const meta = PERMISSION_GROUP_META[groupKey];
    return meta.viewKeys.some(k => form.permissions.includes(k))
      || meta.subPermissions.some(sp => form.permissions.includes(sp.key));
  };

  const toggleGroupMaster = (groupKey) => {
    const meta = PERMISSION_GROUP_META[groupKey];
    const allGroupKeys = [...meta.viewKeys, ...meta.subPermissions.map(sp => sp.key)];
    const currentlyOn = isGroupMasterOn(groupKey);
    setForm(prev => ({
      ...prev,
      permissions: currentlyOn
        ? prev.permissions.filter(p => !allGroupKeys.includes(p))
        : [...new Set([...prev.permissions, ...meta.viewKeys])],
    }));
  };

  const applyTemplate = (templateKey) => {
    const template = ROLE_TEMPLATES[templateKey];
    if (template) setForm({ name: form.name || template.name, description: form.description || template.description, permissions: template.permissions });
  };

  const getUserCount = (roleId) => tenantUsers.filter(u => u.role_id === roleId).length;

  const [seedingRoles, setSeedingRoles] = useState(false);

  // Role cap logic
  const isFnB = isFnBIndustry(tenant?.industry);
  const planCap = isPro ? Infinity : roleCap;
  const roleCapReached = roles.length >= planCap;
  const slotsAvailable = planCap === Infinity ? Infinity : planCap - roles.length;

  // Duplicate detection (case-insensitive)
  const lowerNames = roles.map(r => r.name?.toLowerCase());
  const hasDuplicates = lowerNames.length !== new Set(lowerNames).size;

  // Full default role definitions (capitalised names, matching completeOnboarding)
  const ALL_DEFAULT_ROLES = [
    { name: 'Owner',          slug: 'owner',           is_system: true,  permissions: ['dashboard.ai_assistant','dashboard.design_store','orders.view','orders.create','orders.edit','orders.cancel','products.view','products.create','products.edit','products.delete','categories.view','categories.create','categories.edit','categories.delete','inventory.view','inventory.adjust','tables.view','tables.create','tables.edit','tables.delete','staff.view','staff.create','staff.edit','staff.delete','roles.view','roles.create','roles.edit','roles.delete','reports.view','reports.export','settings.view','settings.edit','theme.edit','payments.view','payments.edit'] },
    { name: 'Manager',        slug: 'manager',         is_system: false, permissions: ['staff.view','staff.edit','products.view','products.create','products.edit','categories.view','categories.create','categories.edit','inventory.view','inventory.adjust','orders.view','orders.create','orders.edit','tables.view','tables.edit','payments.view','reports.view'] },
    { name: 'Staff',          slug: 'staff',           is_system: false, permissions: ['products.view','orders.view','orders.create','tables.view'] },
    { name: 'Cashier',        slug: 'cashier',         is_system: false, permissions: ['products.view','categories.view','orders.view','orders.create','orders.edit','tables.view','payments.view'] },
    ...(isFnB
      ? [{ name: 'Kitchen Staff',   slug: 'kitchen_staff',   is_system: false, permissions: ['products.view','orders.view','orders.edit','inventory.view'] }]
      : [{ name: 'Inventory Staff', slug: 'inventory_staff', is_system: false, permissions: ['products.view','inventory.view','inventory.adjust','categories.view'] }]
    ),
  ];

  // Plan-appropriate ordered list
  const defaultsForPlan = tier?.startsWith('starter')
    ? ALL_DEFAULT_ROLES.filter(r => ['Owner','Manager','Staff'].includes(r.name))
    : tier?.startsWith('growth')
    ? ALL_DEFAULT_ROLES.filter(r => ['Owner','Manager','Staff','Cashier', isFnB ? 'Kitchen Staff' : 'Inventory Staff'].includes(r.name))
    : ALL_DEFAULT_ROLES;

  const existingSlugs = roles.map(r => (r.slug || r.name)?.toLowerCase());
  const toInsertDefaults = defaultsForPlan
    .filter(r => !existingSlugs.includes(r.slug.toLowerCase()) && !existingSlugs.includes(r.name.toLowerCase()))
    .slice(0, slotsAvailable === Infinity ? undefined : slotsAvailable);

  const allDefaultsExist = toInsertDefaults.length === 0;

  const handleSetupDefaultRoles = async () => {
    if (slotsAvailable <= 0) {
      toast.error('You have reached the maximum number of roles for your plan.');
      return;
    }
    if (toInsertDefaults.length === 0) {
      toast.info('All default roles for your plan are already set up.');
      return;
    }
    setSeedingRoles(true);
    try {
      const supabase = await getSupabase();
      const rows = toInsertDefaults.map(r => ({ ...r, tenant_id: tenantId }));
      const { error } = await supabase.from('roles').insert(rows);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['allRoles', tenantId] });
      toast.success('Default roles created successfully');
    } catch {
      toast.error('Failed to create default roles');
    } finally {
      setSeedingRoles(false);
    }
  };

  const roleBannerText = tier === 'starter'
    ? `Your plan includes up to ${roleCap} roles. Upgrade to Pro for unlimited roles.`
    : tier === 'growth'
    ? `Your plan includes up to ${roleCap} roles. Upgrade to Pro for unlimited roles.`
    : null;

  return (
    <RequirePermission permission="roles.view">
      <div className="space-y-4">
        {/* Role plan banner */}
        {roleBannerText && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <span>{roleBannerText}</span>
            {onUpgrade ? (
              <button onClick={onUpgrade} className="ml-auto font-medium text-slate-700 underline underline-offset-2 whitespace-nowrap">Upgrade</button>
            ) : (
              <Link to="/TenantSettings" className="ml-auto font-medium text-slate-700 underline underline-offset-2 whitespace-nowrap">Upgrade</Link>
            )}
          </div>
        )}

        {hasDuplicates && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
            <span>Duplicate roles detected. Please delete the duplicates to ensure correct behaviour.</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <RequirePermission permission="roles.create" silent>
            {!allDefaultsExist && (
              <Button onClick={handleSetupDefaultRoles} disabled={seedingRoles} variant="outline" size="sm" className="gap-1.5">
                <Shield className="w-4 h-4" /> {seedingRoles ? 'Setting up...' : 'Setup Default Roles'}
              </Button>
            )}
            {!roleCapReached && (
              <Button onClick={() => open(null)} size="sm" className="text-white gap-1.5" style={{ background: 'var(--color-primary-gradient)' }}>
                <Plus className="w-4 h-4" /> Create Role
              </Button>
            )}
          </RequirePermission>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {roles.map(role => {
              const userCount = getUserCount(role.id);
              return (
                <Card key={role.id} className="border-0 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedRole(role); setMobilePreviewRole(role); }}>
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
                            <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" /> {userCount} user{userCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>
                      {role.description && <p className="text-xs text-slate-500 ml-13">{role.description}</p>}
                      {role.is_system && (
                        <Badge className="mt-2 text-xs bg-white border" style={{ borderColor: 'rgb(var(--color-primary))', color: 'rgb(var(--color-primary))' }}>Default Role</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <RequirePermission permission="roles.create" silent>
                        <Button size="icon" variant="ghost" className="h-8 w-8" style={{ color: 'rgb(var(--color-primary))' }} onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(role); }} title="Duplicate">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </RequirePermission>
                      <RequirePermission permission="roles.edit" silent>
                        <Button size="icon" variant="ghost" className="h-8 w-8" style={{ color: 'rgb(var(--color-primary))' }} onClick={(e) => { e.stopPropagation(); open(role); }}>
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

          {/* Desktop permissions panel — hidden on mobile */}
                    <Card className="hidden lg:block border-0 shadow-sm p-5 lg:sticky lg:top-6 h-fit">
            {selectedRole ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-4">{selectedRole.name}</h3>
                <RolePermissionSummary role={selectedRole} />
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-slate-400">Select a role to view permissions</div>
            )}
          </Card>
        </div>

        {/* Mobile permissions modal */}
        {mobilePreviewRole && (
          <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center px-5" onClick={() => setMobilePreviewRole(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative w-full max-w-[90vw] bg-white rounded-2xl shadow-xl max-h-[75vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">{mobilePreviewRole.name}</h3>
                <button onClick={() => setMobilePreviewRole(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              {/* Permissions list */}
              <div className="overflow-y-auto px-5 py-4">
                <RolePermissionSummary role={mobilePreviewRole} />
              </div>
            </div>
          </div>
        )}

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Edit Role' : 'Create New Role'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Role Name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Kitchen Staff" />
                </div>
                <div>
                  <Label>Template</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Start from template" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_TEMPLATES).filter(([key]) => {
                        const industry = normalizeIndustry(tenant?.industry) || 'service';
                        const availableRoles = INDUSTRY_ROLES[industry] || INDUSTRY_ROLES.service;
                        return key !== 'superadmin' && availableRoles.includes(key);
                      }).map(([key, template]) => (
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
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-semibold text-slate-800">Permissions</Label>
                  <span className="text-xs font-medium text-slate-400">{form.permissions.length} selected</span>
                </div>
                <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1 -mr-1">
                  {Object.entries(PERMISSION_GROUP_META).map(([groupKey, meta]) => {
                    const visual = GROUP_VISUALS[groupKey];
                    const Icon = visual.icon;
                    // Groups with no masterLabel (currently just "dashboard") have no
                    // master switch at all — they're always expanded, since there's no
                    // "view" concept for a page that's permanently visible to everyone.
                    const hasMaster = !!meta.masterLabel;
                    const masterOn = hasMaster ? isGroupMasterOn(groupKey) : true;
                    const activeSubCount = meta.subPermissions.filter(sp => form.permissions.includes(sp.key)).length;
                    const viewOnly = hasMaster && masterOn && activeSubCount === 0;
                    return (
                      <div
                        key={groupKey}
                        className="rounded-2xl border bg-white transition-all duration-200"
                        style={{ borderColor: masterOn ? `${visual.accent}33` : '#f1f5f9', boxShadow: masterOn ? '0 1px 3px rgba(15, 23, 42, 0.04)' : 'none' }}
                      >
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-opacity", visual.iconBg, !masterOn && "opacity-40 grayscale")}>
                            <Icon className={cn("w-4.5 h-4.5", visual.iconColor)} style={{ width: 18, height: 18 }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-semibold truncate", masterOn ? "text-slate-800" : "text-slate-400")}>{meta.masterLabel || meta.label}</span>
                              {viewOnly && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">
                                  View only
                                </span>
                              )}
                            </div>
                            {hasMaster && masterOn && activeSubCount > 0 && (
                              <span className="text-[11px] text-slate-400">{activeSubCount} of {meta.subPermissions.length} extra {activeSubCount === 1 ? 'permission' : 'permissions'} on</span>
                            )}
                          </div>
                          {hasMaster && (
                            <Switch
                              checked={masterOn}
                              onCheckedChange={() => toggleGroupMaster(groupKey)}
                              className="flex-shrink-0 data-[state=unchecked]:bg-slate-200"
                              style={masterOn ? { backgroundColor: visual.accent } : undefined}
                            />
                          )}
                        </div>
                        {masterOn && meta.subPermissions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 px-3.5 pb-3.5 pt-0.5">
                            {meta.subPermissions.map(sp => {
                              const checked = form.permissions.includes(sp.key);
                              return (
                                <button
                                  key={sp.key}
                                  type="button"
                                  onClick={() => togglePermission(sp.key)}
                                  className={cn(
                                    "flex items-center gap-1 pl-2 pr-2.5 py-1.5 rounded-full text-xs font-medium border transition-all",
                                    checked ? "text-white border-transparent shadow-sm" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                  )}
                                  style={checked ? { backgroundColor: visual.accent } : undefined}
                                >
                                  <Check className={cn("w-3 h-3 transition-opacity", checked ? "opacity-100" : "opacity-0 w-0")} />
                                  {sp.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter
              className={cn(
                "sticky bottom-0 -mx-6 px-6 py-3 mt-2 bg-white border-t transition-colors",
                isDirty ? "border-slate-200" : "border-transparent"
              )}
              style={{ boxShadow: isDirty ? '0 -4px 12px rgba(15, 23, 42, 0.06)' : 'none' }}
            >
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.name || saveMutation.isPending}
                className="text-white gap-1.5 relative"
                style={{ background: 'var(--color-primary-gradient)' }}
              >
                {isDirty && !saveMutation.isPending && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
                )}
                {saveMutation.isPending ? 'Saving...' : editing ? 'Update Role' : 'Create Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  );
}