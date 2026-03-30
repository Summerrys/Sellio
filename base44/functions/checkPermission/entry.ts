/**
 * Backend Function Middleware: Permission Checking
 * 
 * This function demonstrates how to check user permissions server-side
 * Use this pattern in any backend function that requires authorization
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Checks if the authenticated user has the required permission
 * @param {Request} req - The incoming request
 * @param {string} requiredPermission - Permission key (e.g., "products.create")
 * @returns {Promise<{authorized: boolean, user: object, tenantUser: object, error?: string}>}
 */
async function checkUserPermission(req, requiredPermission) {
  try {
    const base44 = createClientFromRequest(req);
    
    // 1. Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return { authorized: false, error: 'Unauthorized: Not logged in' };
    }

    // 2. Check if super admin (has god-mode access)
    if (user.role === 'admin') {
      return { authorized: true, user, isSuperAdmin: true };
    }

    // 3. Get tenant-user relationship
    const tenantUsers = await base44.asServiceRole.entities.TenantUser.filter({
      user_email: user.email,
      status: 'active'
    });

    if (!tenantUsers || tenantUsers.length === 0) {
      return { authorized: false, error: 'User not assigned to any tenant' };
    }

    const tenantUser = tenantUsers[0];

    // 4. Check if owner (has full permissions)
    if (tenantUser.is_owner) {
      return { authorized: true, user, tenantUser };
    }

    // 5. Get user's role and permissions
    const roles = await base44.asServiceRole.entities.Role.filter({
      id: tenantUser.role_id
    });

    if (!roles || roles.length === 0) {
      return { authorized: false, error: 'User role not found' };
    }

    const role = roles[0];
    const userPermissions = role.permissions || [];

    // 6. Check if user has the required permission
    if (!userPermissions.includes(requiredPermission)) {
      return {
        authorized: false,
        error: `Permission denied: User lacks '${requiredPermission}' permission`
      };
    }

    return { authorized: true, user, tenantUser, role };
  } catch (error) {
    return { authorized: false, error: error.message };
  }
}

/**
 * Example backend function with permission checking
 */
Deno.serve(async (req) => {
  try {
    // Check if user has permission to create products
    const authCheck = await checkUserPermission(req, 'products.create');

    if (!authCheck.authorized) {
      return Response.json(
        { error: authCheck.error },
        { status: 403 }
      );
    }

    const { user, tenantUser } = authCheck;

    // Parse request body
    const body = await req.json();
    const { name, price, description } = body;

    // Validate input
    if (!name || !price) {
      return Response.json(
        { error: 'Name and price are required' },
        { status: 400 }
      );
    }

    // Create product using service role (admin privileges)
    const base44 = createClientFromRequest(req);
    const product = await base44.asServiceRole.entities.Product.create({
      tenant_id: tenantUser.tenant_id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      price: parseFloat(price),
      description: description || '',
      is_active: true,
    });

    return Response.json({
      success: true,
      product,
      created_by: user.email
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});