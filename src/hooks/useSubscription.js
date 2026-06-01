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

  const staffCap  = tier === 'pro' ? Infinity : tier === 'growth' ? 5 : 3;
  const roleCap   = tier === 'pro' ? Infinity : tier === 'growth' ? 5 : 3;

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