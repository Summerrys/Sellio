import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { unauthorized, forbidden } from './apiResponse.js';

/**
 * Authenticate user and get tenant context
 */
export async function authenticate(req) {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return { error: unauthorized() };
    }

    // Get tenant context
    const tenantUsers = await base44.entities.TenantUser.filter({ user_email: user.email });
    const tenantUser = tenantUsers[0];
    
    if (!tenantUser) {
      return { error: forbidden('User not associated with any tenant') };
    }

    const tenant = await base44.entities.Tenant.filter({ id: tenantUser.tenant_id });
    
    return {
      user,
      tenantUser,
      tenant: tenant[0],
      base44,
    };
  } catch (error) {
    return { error: unauthorized(error.message) };
  }
}

/**
 * Check if user has permission
 */
export async function checkPermission(base44, tenantUser, permission) {
  if (!tenantUser.role_id) {
    return false;
  }

  const role = await base44.entities.Role.filter({ id: tenantUser.role_id });
  if (!role[0]) {
    return false;
  }

  return role[0].permissions.includes(permission);
}

/**
 * Require specific permission
 */
export async function requirePermission(base44, tenantUser, permission) {
  const hasPermission = await checkPermission(base44, tenantUser, permission);
  if (!hasPermission) {
    return forbidden(`Permission required: ${permission}`);
  }
  return null;
}

/**
 * Require admin role
 */
export function requireAdmin(tenantUser) {
  if (!tenantUser.is_owner && tenantUser.role_name !== 'Admin') {
    return forbidden('Admin access required');
  }
  return null;
}