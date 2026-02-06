import React from 'react';
import { useTenant } from '../tenant/TenantContext';
import { ShieldAlert, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * RequirePermission - React Component for permission-based rendering
 * 
 * Usage:
 * <RequirePermission permission="products.create">
 *   <CreateProductButton />
 * </RequirePermission>
 * 
 * Or with multiple permissions (any):
 * <RequirePermission permissions={["products.edit", "products.create"]}>
 *   <ProductForm />
 * </RequirePermission>
 * 
 * With custom fallback:
 * <RequirePermission permission="reports.view" fallback={<div>Contact admin</div>}>
 *   <ReportsPage />
 * </RequirePermission>
 */
export default function RequirePermission({ 
  permission, 
  permissions, 
  fallback, 
  silent = false,
  children 
}) {
  const { hasPermission, hasAnyPermission, isSuperAdmin, isOwner } = useTenant();

  // Super admins and owners have all permissions
  if (isSuperAdmin || isOwner) {
    return children;
  }

  // Check single permission
  if (permission) {
    if (!hasPermission(permission)) {
      if (silent) return null;
      if (fallback) return fallback;
      return (
        <Card className="border-0 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Restricted</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            You don't have permission to view this section. Contact your administrator to request access.
          </p>
        </Card>
      );
    }
    return children;
  }

  // Check multiple permissions (any match)
  if (permissions && Array.isArray(permissions)) {
    if (!hasAnyPermission(permissions)) {
      if (silent) return null;
      if (fallback) return fallback;
      return (
        <Card className="border-0 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Permission Required</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            This feature requires special permissions. Please contact your administrator.
          </p>
        </Card>
      );
    }
    return children;
  }

  // No permission specified, render children
  return children;
}