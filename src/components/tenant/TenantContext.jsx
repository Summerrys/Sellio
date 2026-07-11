import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';

const TenantContext = createContext(null);

export const ALL_PERMISSIONS = {
  // Orders
  'orders.view': 'View orders',
  'orders.create': 'Create orders',
  'orders.edit': 'Edit orders',
  'orders.cancel': 'Cancel orders',
  // Products
  'products.view': 'View products',
  'products.create': 'Create products',
  'products.edit': 'Edit products',
  'products.delete': 'Delete products',
  // Categories
  'categories.view': 'View categories',
  'categories.create': 'Create categories',
  'categories.edit': 'Edit categories',
  'categories.delete': 'Delete categories',
  // Inventory
  'inventory.view': 'View inventory',
  'inventory.adjust': 'Adjust stock',
  // Tables
  'tables.view': 'View tables',
  'tables.create': 'Create tables',
  'tables.edit': 'Edit tables',
  'tables.delete': 'Delete tables',
  // Staff
  'staff.view': 'View staff',
  'staff.create': 'Create staff',
  'staff.edit': 'Edit staff',
  'staff.delete': 'Delete staff',
  // Roles
  'roles.view': 'View roles',
  'roles.create': 'Create roles',
  'roles.edit': 'Edit roles',
  'roles.delete': 'Delete roles',
  // Reports
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  // Settings
  'settings.view': 'View settings',
  'settings.edit': 'Edit settings',
  'theme.edit': 'Modify Theme',
  // Payments — view + edit only. Actual charge/refund handling lives on
  // Stripe's side, not in-app, so there's nothing here to "process" or "refund".
  'payments.view': 'View payments',
  'payments.edit': 'Modify payments',
};

const PERMISSIONS = ALL_PERMISSIONS;

// Permission groups for UI organization
export const PERMISSION_GROUPS = {
  orders: {
    label: 'Orders',
    permissions: ['orders.view','orders.create','orders.edit','orders.cancel'],
  },
  products: {
    label: 'Products',
    permissions: ['products.view','products.create','products.edit','products.delete'],
  },
  categories: {
    label: 'Categories',
    permissions: ['categories.view','categories.create','categories.edit','categories.delete'],
  },
  inventory: {
    label: 'Inventory',
    permissions: ['inventory.view','inventory.adjust'],
  },
  tables: {
    label: 'Tables & QR',
    permissions: ['tables.view','tables.create','tables.edit','tables.delete'],
  },
  staff: {
    label: 'Staff Management',
    permissions: ['staff.view','staff.create','staff.edit','staff.delete'],
  },
  roles: {
    label: 'Role Management',
    permissions: ['roles.view','roles.create','roles.edit','roles.delete'],
  },
  reports: {
    label: 'Reports & Analytics',
    permissions: ['reports.view','reports.export'],
  },
  settings: {
    label: 'Settings & Configuration',
    // Payments now lives here too — the Payment QR is configured from within
    // Settings, so it makes more sense as part of "can this person manage
    // Settings" rather than its own separate top-level permission group.
    permissions: ['settings.view','settings.edit','theme.edit','payments.view','payments.edit'],
  },
};

// Toggle-based permission editor metadata. Each group has a single "master"
// toggle (masterLabel) that implicitly grants its viewKeys — there's no separate
// "View X" checkbox to configure, since every sub-permission already requires
// being able to see the thing before creating/editing/deleting it. Sub-toggles
// only make sense (and only render, in the editor UI) once the master is on.
// This is purely a presentation-layer addition — it still reads/writes the same
// flat permission-key strings as PERMISSION_GROUPS above, so nothing about how
// hasPermission() checks permissions changes.
export const PERMISSION_GROUP_META = {
  orders: {
    label: 'Orders',
    masterLabel: 'Manage Orders',
    viewKeys: ['orders.view'],
    subPermissions: [
      { key: 'orders.create', label: 'Create Orders' },
      { key: 'orders.edit', label: 'Update Orders' },
      { key: 'orders.cancel', label: 'Cancel Orders' },
    ],
  },
  products: {
    label: 'Products',
    masterLabel: 'Manage Products',
    viewKeys: ['products.view'],
    subPermissions: [
      { key: 'products.create', label: 'Add Products' },
      { key: 'products.edit', label: 'Update Products' },
      { key: 'products.delete', label: 'Remove Products' },
    ],
  },
  categories: {
    label: 'Categories',
    masterLabel: 'Manage Categories',
    viewKeys: ['categories.view'],
    subPermissions: [
      { key: 'categories.create', label: 'Add Categories' },
      { key: 'categories.edit', label: 'Update Categories' },
      { key: 'categories.delete', label: 'Remove Categories' },
    ],
  },
  inventory: {
    label: 'Inventory',
    masterLabel: 'Manage Inventory',
    viewKeys: ['inventory.view'],
    subPermissions: [
      { key: 'inventory.adjust', label: 'Adjust Stock' },
    ],
  },
  tables: {
    label: 'Tables & QR',
    masterLabel: 'Manage Tables & QR',
    viewKeys: ['tables.view'],
    subPermissions: [
      { key: 'tables.create', label: 'Add Tables' },
      { key: 'tables.edit', label: 'Update Tables' },
      { key: 'tables.delete', label: 'Remove Tables' },
    ],
  },
  staff: {
    label: 'Staff Management',
    masterLabel: 'Manage Staff',
    viewKeys: ['staff.view'],
    subPermissions: [
      { key: 'staff.create', label: 'Add Staff' },
      { key: 'staff.edit', label: 'Update Staff' },
      { key: 'staff.delete', label: 'Remove Staff' },
    ],
  },
  roles: {
    label: 'Role Management',
    masterLabel: 'Manage Roles',
    viewKeys: ['roles.view'],
    subPermissions: [
      { key: 'roles.create', label: 'Add Roles' },
      { key: 'roles.edit', label: 'Update Roles' },
      { key: 'roles.delete', label: 'Remove Roles' },
    ],
  },
  reports: {
    label: 'Reports & Analytics',
    masterLabel: 'Access Reports',
    viewKeys: ['reports.view'],
    subPermissions: [
      { key: 'reports.export', label: 'Export Reports' },
    ],
  },
  settings: {
    label: 'Settings & Configuration',
    masterLabel: 'Manage Settings',
    // Payments view is bundled in here too — the Payment QR lives inside the
    // Settings page itself, so "can see Settings" naturally includes "can see
    // the payment QR that's configured there". Modify Payments is still its
    // own separate sub-toggle, same as Edit Business Settings and Modify Theme.
    viewKeys: ['settings.view', 'payments.view'],
    subPermissions: [
      { key: 'settings.edit', label: 'Edit Business Settings' },
      { key: 'payments.edit', label: 'Modify Payments' },
      { key: 'theme.edit', label: 'Modify Theme' },
    ],
  },
  },
};

// Predefined role templates
export const ROLE_TEMPLATES = {
  superadmin: {
    name: 'SuperAdmin',
    description: 'Apptelier admin with god view',
    permissions: Object.keys(PERMISSIONS),
  },
  owner: {
    name: 'Owner',
    description: 'Tenant owner with full control',
    permissions: Object.keys(PERMISSIONS),
  },
  admin: {
    name: 'Admin',
    description: 'Full control within the tenant',
    permissions: Object.keys(PERMISSIONS),
  },
  manager: {
    name: 'Manager',
    description: 'Manage products, inventory, and staff',
    permissions: [
      'staff.view', 'staff.edit',
      'products.view', 'products.create', 'products.edit',
      'categories.view', 'categories.create', 'categories.edit',
      'inventory.view', 'inventory.adjust', 'inventory.restock',
      'orders.view', 'orders.create', 'orders.edit',
      'tables.view', 'tables.edit',
      'payments.view',
      'reports.view',
      'suppliers.view',
    ],
  },
  cashier: {
    name: 'Cashier',
    description: 'Process orders and payments',
    permissions: [
      'products.view',
      'categories.view',
      'orders.view', 'orders.create', 'orders.edit',
      'tables.view',
      'payments.view',
    ],
  },
  waiter: {
    name: 'Waiter',
    description: 'Take orders and manage tables',
    permissions: [
      'products.view',
      'categories.view',
      'orders.view', 'orders.create', 'orders.edit',
      'tables.view', 'tables.edit',
    ],
  },
  chef: {
    name: 'Chef',
    description: 'View and update order preparation status',
    permissions: [
      'products.view',
      'orders.view', 'orders.edit',
      'inventory.view',
    ],
  },
  staff: {
    name: 'Staff',
    description: 'Basic staff access',
    permissions: [
      'products.view',
      'orders.view', 'orders.create',
      'tables.view',
    ],
  },
};

// Industry-specific role visibility
// FIX: previously keyed by 'restaurant'/'cafe'/'bar'/'salon'/'other' — none of
// which ever matched tenant.industry (which is 'f&b' | 'retail' | 'service'), so
// this always silently fell back to the generic list below, even for F&B tenants
// who should see Cashier/Waiter/Chef template options too. Now keyed by the same
// canonical values as src/lib/industry.js's normalizeIndustry().
export const INDUSTRY_ROLES = {
  'f&b': ['owner', 'admin', 'manager', 'cashier', 'waiter', 'chef', 'staff'],
  retail: ['owner', 'admin', 'manager', 'cashier', 'staff'],
  service: ['owner', 'admin', 'manager', 'staff'],
};

export function TenantProvider({ children }) {
  const [currentTenantId, setCurrentTenantId] = useState(null);
  const [devRoleOverride, setDevRoleOverride] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Get user from Supabase auth session, then look up app_users by email
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) return null;
      const { data: appUsers } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', authUser.email)
        .limit(1);
      return appUsers?.[0] || { email: authUser.email };
    },
  });

  // Set currentTenantId immediately from app_users row for a fast initial render —
  // don't wait for tenant_users.
  useEffect(() => {
    if (user?.tenant_id) {
      setCurrentTenantId(user.tenant_id);
    }
  }, [user?.tenant_id]);

  // Check for simulate_role — only apply for superadmin users
  useEffect(() => {
    if (!user?.email) return;
    if (user?.role !== 'admin') {
      localStorage.removeItem('simulate_role');
      setDevRoleOverride(null);
      return;
    }
    const override = localStorage.getItem('simulate_role');
    setDevRoleOverride(override || null);
  }, [user?.email, user?.role]);

  const { data: tenantUser, isLoading: tenantUserLoading } = useQuery({
    queryKey: ['tenantUser', user?.email],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('user_email', user.email)
        .eq('status', 'active')
        .limit(10);
      return data || [];
    },
    enabled: !!user?.email,
  });

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ['currentTenant', currentTenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', currentTenantId)
        .limit(1);
      return data || [];
    },
    enabled: !!currentTenantId,
  });

  const { data: role } = useQuery({
    queryKey: ['userRole', tenantUser?.[0]?.role_id],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('roles')
        .select('*')
        .eq('id', tenantUser[0].role_id)
        .limit(1);
      return data || [];
    },
    enabled: !!tenantUser?.[0]?.role_id,
  });

  const { data: subscriptionData } = useQuery({
    queryKey: ['tenantSubscription', currentTenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .order('created_date', { ascending: false })
        .limit(1);
      return data;
    },
    enabled: !!currentTenantId,
  });

  const { data: tenantDirectData } = useQuery({
    queryKey: ['tenantDirect', currentTenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('tenants')
        .select('has_used_trial')
        .eq('id', currentTenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenantId,
  });

  useEffect(() => {
    // When simulating a role, never treat the user as superadmin
    if (devRoleOverride) {
      setIsSuperAdmin(false);
    } else if (user?.role === 'admin') {
      setIsSuperAdmin(true);
    } else {
      setIsSuperAdmin(false);
    }
  }, [user, devRoleOverride]);

  // Secondary: tenant_users is the actual source of truth for "which tenant(s)
  // can this person access" (it's what createStaffUser and onboarding write when
  // granting access) — app_users.tenant_id is just a denormalized convenience
  // field and can go stale (e.g. still pointing at a tenant that was later
  // deleted, or never synced after an invite). If the resolved tenantId isn't
  // among this person's active memberships, switch to their real one. This is
  // what caused newly-created Manager/Staff logins (or any account whose
  // app_users.tenant_id had drifted) to land on a blank, unlinked workspace
  // instead of the tenant they were actually invited to.
  useEffect(() => {
    if (!tenantUser || tenantUser.length === 0) return;
    const alreadyMatches = tenantUser.some(tu => tu.tenant_id === currentTenantId);
    if (alreadyMatches) return;
    const correctTenantId = tenantUser[0].tenant_id;
    console.warn('app_users.tenant_id was stale/mismatched for', user?.email, '— correcting to', correctTenantId);
    setCurrentTenantId(correctTenantId);
    // Best-effort self-heal so future logins don't hit the same stale-pointer issue.
    if (user?.email) {
      getSupabase().then(supabase =>
        supabase.from('app_users').update({ tenant_id: correctTenantId }).eq('email', user.email)
      );
    }
  }, [tenantUser, currentTenantId, user?.email]);

  useEffect(() => {
    // Dev simulate_role override
    if (devRoleOverride) {
      // Try ROLE_TEMPLATES first (exact key match)
      const template = ROLE_TEMPLATES[devRoleOverride];
      if (template) {
        setUserPermissions(template.permissions);
        return;
      }
      // Try case-insensitive template match (e.g. "kitchen staff")
      const templateKey = Object.keys(ROLE_TEMPLATES).find(
        k => k.toLowerCase() === devRoleOverride.toLowerCase()
      );
      if (templateKey) {
        setUserPermissions(ROLE_TEMPLATES[templateKey].permissions);
        return;
      }
      // Fall back to fetching from tenant's custom roles by name
      if (currentTenantId) {
        getSupabase().then(supabase => supabase.from('roles').select('*').eq('tenant_id', currentTenantId)).then(({ data: roles }) => {
          const matched = roles?.find(r => r.name?.toLowerCase() === devRoleOverride.toLowerCase());
          if (matched?.permissions) setUserPermissions(matched.permissions);
          else setUserPermissions([]);
        });
        return;
      }
      setUserPermissions([]);
      return;
    }

    if (tenantUser?.[0]?.is_owner) {
      setUserPermissions(Object.keys(PERMISSIONS));
    } else if (role?.[0]?.permissions) {
      setUserPermissions(role[0].permissions);
    } else if (user?.tenant_id) {
      // Fallback: user has a tenant (e.g. just completed onboarding) — grant full permissions
      setUserPermissions(Object.keys(PERMISSIONS));
    }
  }, [role, tenantUser, devRoleOverride, user, currentTenantId]);

  const PERMISSION_ALIASES = {
    'inventory.edit': 'inventory.adjust',
    'inventory.adjust': 'inventory.edit',
  };

  const hasPermission = (permission) => {
    const checkInList = (perms) => {
      if (!perms) return false;
      if (perms.includes('*')) return true;
      if (perms.includes(permission)) return true;
      const alias = PERMISSION_ALIASES[permission];
      if (alias && perms.includes(alias)) return true;
      return false;
    };

    // When simulating a role, ONLY check the simulated permissions — no owner/superadmin bypass
    if (devRoleOverride) {
      return checkInList(userPermissions);
    }
    if (isSuperAdmin) return true;
    if (tenantUser?.[0]?.is_owner) return true;
    return checkInList(userPermissions);
  };

  const hasAnyPermission = (permissions) => permissions.some(p => hasPermission(p));

  const switchTenant = (tenantId) => setCurrentTenantId(tenantId);

  const value = {
    user,
    tenant: tenant?.[0] ? { ...tenant[0], has_used_trial: tenantDirectData?.has_used_trial ?? false } : null,
    tenantId: currentTenantId,
    tenantUser: tenantUser?.[0] || null,
    isSuperAdmin,
    // FIX: previously fell back to `!!user?.tenant_id` when tenantUser hadn't loaded
    // is_owner yet. That fallback was too broad — app_users.tenant_id is set for EVERY
    // staff member (owner, Manager, Cashier, all of them), not just the actual owner.
    // That made isOwner silently evaluate to true for any logged-in staff account,
    // which meant RequirePermission's "owners bypass all permission checks" branch fired
    // for non-owners too — e.g. a Manager with products.create/edit/delete explicitly
    // removed could still see and use the Download/Upload/Scan/Add buttons, since
    // RequirePermission short-circuited on isOwner before ever checking the actual
    // permission. hasPermission() itself never had this bug (it reads tenantUser's real
    // is_owner flag directly), which is why permission checks done inline in click
    // handlers worked correctly while RequirePermission-wrapped buttons didn't — now
    // both use the same, correct source of truth.
    isOwner: devRoleOverride
      ? devRoleOverride === 'owner'
      : (tenantUser?.[0]?.is_owner || false),
    permissions: userPermissions,
    hasPermission,
    hasAnyPermission,
    switchTenant,
    isLoading: tenantUserLoading || tenantLoading,
    subscription: subscriptionData?.[0] || null,
  };

  return (
    <TenantContext.Provider value={value}>
      {typeof children === 'function' ? children(value) : children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export default TenantContext;