// Plan features and limits for the merchant app, from the store's entitlements
// (database function get_tenant_entitlements: plan defaults + per-store overrides).
// Plain functions with no imports, so they can be tested without a browser.

// The tier name the app has always used, read from the subscription row.
export function tierFromSubscription(subscription) {
  const plan = subscription?.tier || 'starter';
  return plan.includes('pro') ? 'pro' : plan.includes('growth') ? 'growth' : 'starter';
}

// What each plan feature was before entitlements. Used until the entitlements load,
// if they can't be read, and for lapsed stores (their dashboard is locked anyway).
const LEGACY_FEATURES = {
  can_export_reports: (tier) => tier !== 'starter',
  can_use_advanced_reports: (tier) => tier !== 'starter',
};

// Everything the app needs to know about the store's plan.
//   subscription: the store's subscriptions row (or null)
//   ent: get_tenant_entitlements result { plan, entitlements, usage } (or null)
export function planInfo(subscription, ent) {
  const tier = tierFromSubscription(subscription);
  const active = !!(ent && ent.entitlements && typeof ent.entitlements === 'object' && ent.plan !== 'lapsed');
  const has = (key) => active && Object.prototype.hasOwnProperty.call(ent.entitlements, key);
  // A limit: a number, or null for unlimited; undefined when not available.
  const limitOf = (key) => {
    if (!has(key)) return undefined;
    const value = ent.entitlements[key];
    return value == null ? null : Number(value);
  };
  // Caps compared with counts: unlimited is Infinity (as before).
  const capOf = (key, fallback) => (has(key) ? (limitOf(key) ?? Infinity) : fallback);
  const legacyCap = tier === 'pro' ? Infinity : tier === 'growth' ? 5 : 3;

  return {
    tier,
    plan: active ? ent.plan : null,
    entitlementsLoaded: active,
    entitlements: active ? ent.entitlements : null,
    usage: active ? (ent.usage || null) : null,
    staffCap: capOf('max_staff', subscription?.max_users ?? legacyCap),
    roleCap: capOf('max_roles', subscription?.max_roles ?? legacyCap),
    // A plan feature (can_export_reports, can_use_advanced_reports, …).
    can: (key) => (has(key)
      ? ent.entitlements[key] === true
      : (LEGACY_FEATURES[key] ? LEGACY_FEATURES[key](tier) : true)),
    // Product limit: null = unlimited; undefined = not loaded (callers keep their own value).
    maxProducts: limitOf('max_products'),
    orderUsage: orderUsage(subscription, limitOf('max_orders_per_month')),
  };
}

// The "orders this month" meter. The database (check_order_limit) counts orders in
// subscriptions.orders_this_period and starts a new count with the first order placed
// a month or more after orders_period_reset_at. null when the plan has no cap, the
// entitlements aren't loaded, or there's no subscription row.
export function orderUsage(subscription, cap, now = new Date()) {
  if (cap == null || !subscription) return null;
  const resetAt = subscription.orders_period_reset_at ? new Date(subscription.orders_period_reset_at) : null;
  const nextReset = resetAt && !Number.isNaN(resetAt.getTime()) ? addOneMonth(resetAt) : null;
  const current = !!nextReset && now.getTime() < nextReset.getTime();
  return {
    used: current ? Math.max(0, Number(subscription.orders_this_period) || 0) : 0,
    limit: cap,
    resetsAt: current ? nextReset : null,
  };
}

// Same as Postgres "+ interval '1 month'" in UTC: same day next month, or the last
// day of next month when it's shorter.
function addOneMonth(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const lastDayNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m + 1, Math.min(date.getUTCDate(), lastDayNextMonth),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds(),
  ));
}
