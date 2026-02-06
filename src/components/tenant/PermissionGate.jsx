import React from 'react';
import { useTenant } from './TenantContext';
import { ShieldAlert } from 'lucide-react';

export default function PermissionGate({ permission, permissions, fallback, children }) {
  const { hasPermission, hasAnyPermission } = useTenant();

  const hasAccess = permission
    ? hasPermission(permission)
    : permissions
    ? hasAnyPermission(permissions)
    : true;

  if (!hasAccess) {
    if (fallback) return fallback;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Access Restricted</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          You don't have permission to view this section. Contact your administrator to request access.
        </p>
      </div>
    );
  }

  return children;
}