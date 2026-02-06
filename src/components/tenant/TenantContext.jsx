import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const TenantContext = createContext(null);

const PERMISSIONS = {
  // Products
  'products.read': 'View products',
  'products.create': 'Create products',
  'products.update': 'Edit products',
  'products.delete': 'Delete products',
  // Categories
  'categories.read': 'View categories',
  'categories.create': 'Create categories',
  'categories.update': 'Edit categories',
  'categories.delete': 'Delete categories',
  // Orders
  'orders.read': 'View orders',
  'orders.create': 'Create orders',
  'orders.update': 'Update orders',
  'orders.delete': 'Delete orders',
  // Tables
  'tables.read': 'View tables',
  'tables.create': 'Create tables',
  'tables.update': 'Update tables',
  'tables.delete': 'Delete tables',
  // Inventory
  'inventory.read': 'View inventory',
  'inventory.update': 'Update inventory',
  // Staff / Users
  'staff.read': 'View staff',
  'staff.create': 'Invite staff',
  'staff.update': 'Update staff roles',
  'staff.delete': 'Remove staff',
  // Roles
  'roles.read': 'View roles',
  'roles.create': 'Create roles',
  'roles.update': 'Edit roles',
  'roles.delete': 'Delete roles',
  // Reports
  'reports.read': 'View reports',
  // Settings
  'settings.read': 'View settings',
  'settings.update': 'Update settings',
};

export const ALL_PERMISSIONS = PERMISSIONS;

export function TenantProvider({ children }) {
  const [currentTenantId, setCurrentTenantId] = useState(null);
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

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export default TenantContext;