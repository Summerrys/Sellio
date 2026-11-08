import { isNetworkError, isOffline } from '@/lib/network';
import { keepSnapshot, listSnapshots, loadSnapshot } from '@/lib/offlineStore';

// The app's own records, kept on the phone (lib/offlineStore.js) so the app can open with no
// internet (UX states, 4): who you are, your shop, your role and plan (TenantContext), and
// your products and categories. They're used only when the app opens offline, or when a
// first load fails for want of a connection; online, everything loads fresh as before.
export const KEPT_QUERIES = new Set([
  'currentUser', 'tenantUser', 'currentTenant', 'userRole', 'tenantSubscription', 'tenantDirect', 'entitlements',
  'products', 'categories',
]);

const keyOf = (queryKey) => `q:${JSON.stringify(queryKey)}`;
const kept = (query) => KEPT_QUERIES.has(query?.queryKey?.[0]);

// Whether this phone is signed in to Supabase (its session is in storage): copies are used
// only then, as the person they belong to.
export function hasSession(store = globalThis.localStorage) {
  try {
    for (let i = 0; i < store.length; i += 1) {
      if (/^sb-[a-z0-9]+-auth-token$/.test(store.key(i) || '')) return true;
    }
  } catch { /* storage unavailable */ }
  return false;
}

// Puts owner's copies into the app's cache (with the time each was loaded, so each is
// refreshed as soon as there's a connection). Returns how many.
export function restoreKeptQueries(queryClient, owner) {
  if (!owner || !hasSession()) return 0;
  let count = 0;
  for (const { data } of listSnapshots('q:', owner)) {
    if (!Array.isArray(data?.queryKey) || !KEPT_QUERIES.has(data.queryKey[0])) continue;
    if (queryClient.getQueryData(data.queryKey) !== undefined) continue;
    queryClient.setQueryData(data.queryKey, data.data, { updatedAt: data.updatedAt });
    count += 1;
  }
  return count;
}

// From now on: each successful load of a kept query is copied to the phone; a first load
// that fails for want of a connection uses the copy instead. getOwner: who is signed in.
export function keepQueriesOffline(queryClient, getOwner) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event?.type !== 'updated' || !kept(event.query)) return;
    const owner = getOwner();
    if (!owner) return;
    const { query } = event;
    if (event.action?.type === 'success' && !event.action.manual) {
      keepSnapshot(keyOf(query.queryKey), { queryKey: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt }, owner);
    } else if (event.action?.type === 'error' && query.state.data === undefined && (isOffline() || isNetworkError(event.action.error)) && hasSession()) {
      const copy = loadSnapshot(keyOf(query.queryKey), owner)?.data;
      if (copy) queryClient.setQueryData(query.queryKey, copy.data, { updatedAt: copy.updatedAt });
    }
  });
}
