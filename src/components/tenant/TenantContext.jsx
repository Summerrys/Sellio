import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

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
  admin: {
    name: 'Admin',
    description: 'Full control within the tenant',
    permissions: Object.keys(PERMISSIONS),
  },
  owner: {
    name: 'Owner',
    description: 'Near-admin access, manage operations',
    permissions: [
      'staff.view', 'staff.create', 'staff.edit', 'staff.delete',
      'products.view', 'products.create', 'products.edit', 'products.delete',
      'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
      'inventory.view', 'inventory.adjust', 'inventory.restock',
      'orders.view', 'orders.create', 'orders.update', 'orders.cancel',
      'tables.view', 'tables.manage',
      'payments.view', 'payments.process',
      'reports.view', 'reports.export',
      'settings.view',
      'suppliers.view', 'suppliers.manage',
    ],
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
};

export function TenantProvider({ children }) {
  const [currentTenantId, setCurrentTenantId] = useState(null);
  const [devRoleOverride, setDevRoleOverride] = useState(null);

  // Check for dev role override
  useEffect(() => {
    const override = localStorage.getItem('dev_role_override');
    if (override) setDevRoleOverride(override);
  }, []);
  const [userPermissions, setUserPermissions] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: tenantUser, isLoading: tenantUserLoading } = useQuery({
    queryKey: ['tenantUser', user?.email],
    queryFn: () => base44.entities.TenantUser.filter({ user_email: user.email, status: 'active' }),
    enabled: !!user?.email,
  });

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ['currentTenant', currentTenantId],
    queryFn: () => base44.entities.Tenant.filter({ id: currentTenantId }),
    enabled: !!currentTenantId,
  });

  const { data: role } = useQuery({
    queryKey: ['userRole', tenantUser?.[0]?.role_id],
    queryFn: () => base44.entities.Role.filter({ id: tenantUser[0].role_id }),
    enabled: !!tenantUser?.[0]?.role_id,
  });

  useEffect(() => {
    if (user?.role === 'admin') {
      setIsSuperAdmin(true);
    }
  }, [user]);

  useEffect(() => {
    if (tenantUser?.length > 0) {
      setCurrentTenantId(tenantUser[0].tenant_id);
    }
  }, [tenantUser]);

  useEffect(() => {
    if (role?.[0]?.permissions) {
      setUserPermissions(role[0].permissions);
    }
    if (tenantUser?.[0]?.is_owner) {
      setUserPermissions(Object.keys(PERMISSIONS));
    }
  }, [role, tenantUser]);

  const hasPermission = (permission) => {
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
    isOwner: tenantUser?.[0]?.is_owner || false,
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