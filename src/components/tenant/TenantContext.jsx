import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import db from '@/lib/db';

const TenantContext = createContext(null);

const PERMISSIONS = {
  // Staff Management
  'staff.view': 'View staff members',
  'staff.create': 'Invite new staff',
  'staff.edit': 'Edit staff details',
  'staff.delete': 'Remove staff members',
  
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
  'inventory.view': 'View inventory levels',
  'inventory.adjust': 'Adjust stock quantities',
  'inventory.restock': 'Restock products',
  
  // Orders
  'orders.view': 'View orders',
  'orders.create': 'Create new orders',
  'orders.update': 'Update order status',
  'orders.cancel': 'Cancel orders',
  
  // Tables
  'tables.view': 'View tables',
  'tables.manage': 'Manage tables and QR codes',
  
  // Payments
  'payments.view': 'View payments',
  'payments.process': 'Process payments',
  'payments.refund': 'Issue refunds',
  
  // Reports
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  
  // Settings
  'settings.view': 'View settings',
  'settings.edit': 'Edit business settings',
  
  // Roles
  'roles.view': 'View roles',
  'roles.create': 'Create roles',
  'roles.edit': 'Edit roles',
  'roles.delete': 'Delete roles',
  
  // Theme
  'theme.edit': 'Customize theme and branding',
  
  // Suppliers
  'suppliers.view': 'View suppliers',
  'suppliers.manage': 'Manage suppliers',
};

export const ALL_PERMISSIONS = PERMISSIONS;

// Permission groups for UI organization
export const PERMISSION_GROUPS = {
  staff: {
    label: 'Staff Management',
    permissions: ['staff.view', 'staff.create', 'staff.edit', 'staff.delete'],
  },
  products: {
    label: 'Products & Categories',
    permissions: ['products.view', 'products.create', 'products.edit', 'products.delete', 'categories.view', 'categories.create', 'categories.edit', 'categories.delete'],
  },
  inventory: {
    label: 'Inventory Management',
    permissions: ['inventory.view', 'inventory.adjust', 'inventory.restock'],
  },
  orders: {
    label: 'Orders & Tables',
    permissions: ['orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'tables.view', 'tables.manage'],
  },
  payments: {
    label: 'Payments',
    permissions: ['payments.view', 'payments.process', 'payments.refund'],
  },
  reports: {
    label: 'Reports & Analytics',
    permissions: ['reports.view', 'reports.export'],
  },
  settings: {
    label: 'Settings & Configuration',
    permissions: ['settings.view', 'settings.edit', 'theme.edit', 'suppliers.view', 'suppliers.manage'],
  },
  roles: {
    label: 'Role Management',
    permissions: ['roles.view', 'roles.create', 'roles.edit', 'roles.delete'],
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
      'orders.view', 'orders.create', 'orders.update',
      'tables.view', 'tables.manage',
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
      'orders.view', 'orders.create', 'orders.update',
      'tables.view',
      'payments.view', 'payments.process',
    ],
  },
  waiter: {
    name: 'Waiter',
    description: 'Take orders and manage tables',
    permissions: [
      'products.view',
      'categories.view',
      'orders.view', 'orders.create', 'orders.update',
      'tables.view', 'tables.manage',
    ],
  },
  chef: {
    name: 'Chef',
    description: 'View and update order preparation status',
    permissions: [
      'products.view',
      'orders.view', 'orders.update',
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
export const INDUSTRY_ROLES = {
  restaurant: ['owner', 'admin', 'manager', 'cashier', 'waiter', 'chef', 'staff'],
  cafe: ['owner', 'admin', 'manager', 'cashier', 'waiter', 'chef', 'staff'],
  bar: ['owner', 'admin', 'manager', 'cashier', 'waiter', 'chef', 'staff'],
  retail: ['owner', 'admin', 'manager', 'cashier', 'staff'],
  salon: ['owner', 'admin', 'manager', 'staff'],
  other: ['owner', 'admin', 'manager', 'staff'],
};

export function TenantProvider({ children }) {
  const [currentTenantId, setCurrentTenantId] = useState(null);
  const [devRoleOverride, setDevRoleOverride] = useState(null);

  // Check for simulate_role (dev tool for alvin.leeyq@gmail.com)
  useEffect(() => {
    const override = localStorage.getItem('simulate_role');
    if (override) setDevRoleOverride(override);
  }, []);
  const [userPermissions, setUserPermissions] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => db.auth.me(),
  });

  const { data: tenantUser, isLoading: tenantUserLoading } = useQuery({
    queryKey: ['tenantUser', user?.email],
    queryFn: () => db.entities.TenantUser.filter({ user_email: user.email, status: 'active' }),
    enabled: !!user?.email,
  });

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ['currentTenant', currentTenantId],
    queryFn: () => db.entities.Tenant.filter({ id: currentTenantId }),
    enabled: !!currentTenantId,
  });

  const { data: role } = useQuery({
    queryKey: ['userRole', tenantUser?.[0]?.role_id],
    queryFn: () => db.entities.Role.filter({ id: tenantUser[0].role_id }),
    enabled: !!tenantUser?.[0]?.role_id,
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

  useEffect(() => {
    if (tenantUser?.length > 0) {
      setCurrentTenantId(tenantUser[0].tenant_id);
    } else if (user?.tenant_id) {
      // Fallback: use tenant_id from session (e.g. right after onboarding)
      setCurrentTenantId(user.tenant_id);
    }
  }, [tenantUser, user]);

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
        db.entities.Role.filter({ tenant_id: currentTenantId }).then(roles => {
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

  const hasPermission = (permission) => {
    // When simulating a role, ONLY check the simulated permissions — no owner/superadmin bypass
    if (devRoleOverride) {
      return userPermissions.includes(permission);
    }
    if (isSuperAdmin) return true;
    if (tenantUser?.[0]?.is_owner) return true;
    return userPermissions.includes(permission);
  };

  const hasAnyPermission = (permissions) => permissions.some(p => hasPermission(p));

  const switchTenant = (tenantId) => setCurrentTenantId(tenantId);

  const value = {
    user,
    tenant: tenant?.[0] || null,
    tenantId: currentTenantId,
    tenantUser: tenantUser?.[0] || null,
    isSuperAdmin,
    isOwner: devRoleOverride
      ? devRoleOverride === 'owner'
      : (tenantUser?.[0]?.is_owner || !!user?.tenant_id || false),
    permissions: userPermissions,
    hasPermission,
    hasAnyPermission,
    switchTenant,
    isLoading: tenantUserLoading || tenantLoading,
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