import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/components/tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';

/**
 * The store's plan, entitlements (plan defaults + per-store overrides) and usage,
 * read from the database: { plan, entitlements, usage }.
 * data is null when they can't be read (for example someone who isn't a member of
 * this store); useSubscription then falls back to the subscription row.
 */
export function useEntitlements() {
  const { tenantId } = useTenant();

  return useQuery({
    queryKey: ['entitlements', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('get_tenant_entitlements', { p_tenant_id: tenantId });
      if (error) {
        console.warn('Entitlements unavailable, using the subscription instead:', error.message);
        return null;
      }
      return data && typeof data === 'object' && data.entitlements ? data : null;
    },
    enabled: !!tenantId,
    refetchInterval: 60 * 1000,
    retry: false,
  });
}
