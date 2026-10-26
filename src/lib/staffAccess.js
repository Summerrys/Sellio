// Staff logins (the cashier, kitchen and manager accounts an owner makes for the shop)
// work in the shop only: they start on the Dashboard and have no Explore. Owners and
// buyers start on Explore.
export function isStaffAccount(appUser, tenantUser = null) {
  if (appUser?.role) return appUser.role === 'staff';
  return !!tenantUser && tenantUser.is_owner === false;
}

// Where a signed-in person starts.
export function homeFor(appUser, tenantUser = null) {
  return isStaffAccount(appUser, tenantUser) ? '/Dashboard' : '/explore';
}
