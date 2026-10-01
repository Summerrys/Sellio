import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/components/tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';
import { useEntitlements } from '@/hooks/useEntitlements';
import { planInfo } from '@/lib/entitlements';

/**
 * Returns { subscription, tier, isStarter, isGrowth, isPro, staffCap, roleCap,
 *           plan, entitlementsLoaded, entitlements, usage, can, maxProducts, orderUsage }
 * tier: 'starter' | 'growth' | 'pro' (from the subscription row, as before)
 *
 * Caps and plan features come from the store's entitlements (plan defaults +
 * per-store overrides; see lib/entitlements.js). Until they load, if they can't be
 * read, or for a lapsed store, the subscription row is used exactly as before
 * (max_users/max_roles, with the tier as the last fallback; Pro = unlimited).
 */
export function useSubscription() {
  const { tenantId } = useTenant();

  const { data: subscription } = useQuery({
    queryKey: ['subscription', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
    refetchInterval: 60 * 1000,
  });

  const { data: entitlements } = useEntitlements();
  const info = planInfo(subscription, entitlements);

  return {
    subscription,
    ...info,
    isStarter: info.tier === 'starter',
    isGrowth:  info.tier === 'growth',
    isPro:     info.tier === 'pro',
  };
}
