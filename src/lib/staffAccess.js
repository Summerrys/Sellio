// Staff logins (the cashier, kitchen and manager accounts an owner makes for the shop)
// work in the shop only: they start on the Dashboard and have no Explore. Owners and
// buyers start on Explore.
const OWNER_OR_BUYER_ROLES = ['admin', 'owner', 'user', 'buyer'];

export function isStaffAccount(appUser, tenantUser = null) {
  const role = appUser?.role;
  if (role === 'staff') return true;
  if (OWNER_OR_BUYER_ROLES.includes(role)) return false;
  if (tenantUser) return tenantUser.is_owner === false; // no role to go on: the shop membership
  return !!role; // any other role name is a shop role: staff
}

// Where a signed-in person starts.
export function homeFor(appUser, tenantUser = null) {
  return isStaffAccount(appUser, tenantUser) ? '/Dashboard' : '/explore';
}
