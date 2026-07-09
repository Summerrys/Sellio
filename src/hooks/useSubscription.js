import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/components/tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';

/**
 * Returns { tier, isStarter, isGrowth, isPro, staffCap, roleCap }
 * tier: 'starter' | 'growth' | 'pro'
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
  });

  const plan = subscription?.tier || 'starter';

  // Normalise to base tier
  const tier = plan.includes('pro') ? 'pro' : plan.includes('growth') ? 'growth' : 'starter';

  // FIX: previously these were hardcoded purely from the tier name, completely
  // ignoring subscription.max_users/max_roles — the actual columns completeOnboarding
  // and stripe-webhook write. That meant this hook could silently drift out of sync
  // with the real plan limits (e.g. if a plan's cap ever changes) despite the DB
  // being the source of truth everywhere else. Pro stores these as null (unlimited),
  // so the tier-based fallback still applies correctly in that case.
  const staffCap = subscription?.max_users ?? (tier === 'pro' ? Infinity : tier === 'growth' ? 5 : 3);
  const roleCap  = subscription?.max_roles ?? (tier === 'pro' ? Infinity : tier === 'growth' ? 5 : 3);

  return {
    subscription,
    tier,
    isStarter: tier === 'starter',
    isGrowth:  tier === 'growth',
    isPro:     tier === 'pro',
    staffCap,
    roleCap,
  };
}