import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';
import TourTooltip from './TourTooltip';

const STAGES = ['dashboard', 'products', 'orders', 'settings'];

// Drives one stage of the onboarding product tour. Handles: only running for real
// account owners (never staff/Manager accounts, even ones created by the Owner),
// only auto-triggering a stage once, the Skip -> confirm-modal -> persist flow, and
// marking has_seen_tour once every stage is done (or skipped early).
export default function useProductTour(stageName) {
  const { user, isOwner, isLoading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [runTour, setRunTour] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const { data: appUser } = useQuery({
    queryKey: ['tourProgress', user?.email],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('app_users')
        .select('has_seen_tour, tour_progress')
        .eq('email', user.email)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.email && isOwner === true,
  });

  useEffect(() => {
    if (tenantLoading || !appUser || isOwner !== true) return;
    if (appUser.has_seen_tour) return;
    if (appUser.tour_progress?.[stageName]) return;
    // Small delay so the page has actually painted before Joyride measures its
    // target elements — running immediately on mount can miss elements that
    // render slightly after (e.g. once a query resolves).
    const t = setTimeout(() => setRunTour(true), 700);
    return () => clearTimeout(t);
  }, [appUser, isOwner, tenantLoading, stageName]);

  const persistProgress = useMutation({
    mutationFn: async ({ skippedEarly }) => {
      const supabase = await getSupabase();
      const currentProgress = appUser?.tour_progress || {};
      const newProgress = skippedEarly
        ? currentProgress
        : { ...currentProgress, [stageName]: true };
      const allStagesDone = STAGES.every(s => newProgress[s]);
      await supabase.from('app_users').update({
        tour_progress: newProgress,
        has_seen_tour: skippedEarly ? true : allStagesDone,
      }).eq('email', user.email);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tourProgress', user?.email] }),
  });

  const handleJoyrideCallback = useCallback((data) => {
    if (data.status === 'finished') {
      setRunTour(false);
      persistProgress.mutate({ skippedEarly: false });
    }
  }, [persistProgress]);

  const requestSkip = useCallback(() => {
    setRunTour(false);
    setShowSkipConfirm(true);
  }, []);

  const cancelSkip = useCallback(() => {
    setShowSkipConfirm(false);
    setRunTour(true);
  }, []);

  const confirmSkip = useCallback(() => {
    setShowSkipConfirm(false);
    persistProgress.mutate({ skippedEarly: true });
  }, [persistProgress]);

  // Bound once per render so Joyride's tooltipComponent gets our skip handler
  // without needing a separate context provider.
  const BoundTooltip = useMemo(
    () => (props) => <TourTooltip {...props} onRequestSkip={requestSkip} />,
    [requestSkip]
  );

  return {
    runTour,
    handleJoyrideCallback,
    tooltipComponent: BoundTooltip,
    showSkipConfirm,
    cancelSkip,
    confirmSkip,
  };
}
