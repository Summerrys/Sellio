import { N_ } from './appText';
// Which parts of the merchant app a store's plan includes, from its entitlements
// (get_tenant_entitlements). Business plans (Starter, Growth, Pro) include all of
// these; a free Personal Seller shop does not. Plain functions with no imports,
// so they can be tested without a browser.

// Permission → the plan feature it needs (on top of the person's role).
const PERMISSION_FEATURES = {
  'dashboard.ai_assistant': 'can_use_ai_assistant',
  'dashboard.design_store': 'can_customize_storefront',
  'orders.create': 'can_use_pos',          // the Counter (staff ring up orders)
  'orders.print_chit': 'can_print',
};
// Every permission in these groups (inventory.view, tables.edit, staff.create …).
const GROUP_FEATURES = {
  inventory: 'can_use_inventory',
  tables: 'can_use_table_ordering',
  staff: 'can_manage_staff',
  roles: 'can_manage_staff',
};

// Pages that are a plan feature as a whole (opened by link or address bar).
export const PAGE_FEATURES = {
  Counter: 'can_use_pos',
  Inventory: 'can_use_inventory',
  Tables: 'can_use_table_ordering',
  KitchenDisplay: 'can_use_kitchen_display',
  UserManagement: 'can_manage_staff',
};

export const FEATURE_LABELS = {
  can_use_pos: N_('The Counter'),
  can_use_inventory: N_('Inventory and stock takes'),
  can_use_table_ordering: N_('Tables & QR ordering'),
  can_use_kitchen_display: N_('The kitchen display'),
  can_manage_staff: N_('Staff logins and roles'),
  can_use_ai_assistant: N_('The Sellio AI assistant'),
  can_customize_storefront: N_('Store design'),
  can_print: N_('Printing'),
};

export function featureForPermission(permission) {
  if (typeof permission !== 'string') return null;
  if (PERMISSION_FEATURES[permission]) return PERMISSION_FEATURES[permission];
  return GROUP_FEATURES[permission.split('.')[0]] || null;
}

// Is this plan feature on?
//   ent:        get_tenant_entitlements result { plan, entitlements } (or null)
//   sellerType: tenants.seller_type ('merchant' | 'individual'), used until the
//               entitlements load: a personal shop starts with the features off,
//               a business store with them on (as before entitlements existed).
// A lapsed store's entitlements are ignored here: its dashboard is locked anyway.
export function featureOn(key, ent, sellerType) {
  const ents = ent && ent.plan !== 'lapsed' && ent.entitlements && typeof ent.entitlements === 'object'
    ? ent.entitlements
    : null;
  if (ents && Object.prototype.hasOwnProperty.call(ents, key)) return ents[key] === true;
  return sellerType !== 'individual';
}

export function planAllowsPermission(permission, ent, sellerType) {
  const key = featureForPermission(permission);
  return !key || featureOn(key, ent, sellerType);
}

// Words for what a store sells: a free personal shop has "listings", a business
// store "products".
// t: a translated screen's own (lib/appText.js); without it the words are English.
export function itemWords(sellerType, t) {
  const words = sellerType === 'individual'
    ? { Products: N_('Listings'), products: N_('listings'), Product: N_('Listing'), product: N_('listing') }
    : { Products: N_('Products'), products: N_('products'), Product: N_('Product'), product: N_('product') };
  return t ? Object.fromEntries(Object.entries(words).map(([key, word]) => [key, t(word)])) : words;
}
