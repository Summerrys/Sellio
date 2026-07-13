import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';

const STAGES = ['dashboard', 'products', 'orders', 'settings'];

// Central state/logic for the onboarding product tour, shared by every stage
// (Dashboard/Products/Orders/Settings) so each page just asks "should my stage
// run right now?" and "mark my stage done" without duplicating the eligibility
// or persistence logic four times.
export function useProductTour(stageName) {
  const { user, isOwner } = useTenant();
  const queryClient = useQueryClient();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const progress = user?.tour_progress || {};
  const hasSeenTour = !!user?.has_seen_tour;

  // Only ever eligible for the account that actually owns the tenant — staff
  // accounts created by the Owner never see this, regardless of role.
  const eligible = isOwner && !hasSeenTour && !progress[stageName];

  const persistProgress = useCallback(async (nextProgress, completeTour) => {
    if (!user?.id) return;
    const supabase = await getSupabase();
    await supabase
      .from('app_users')
      .update({
        tour_progress: nextProgress,
        ...(completeTour ? { has_seen_tour: true } : {}),
      })
      .eq('id', user.id);
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
  }, [user?.id, queryClient]);

  // Called when a stage's steps run to completion naturally (not skipped).
  const completeStage = useCallback(() => {
    const nextProgress = { ...progress, [stageName]: true };
    const allDone = STAGES.every(s => nextProgress[s]);
    persistProgress(nextProgress, allDone);
  }, [progress, stageName, persistProgress]);

  // Skip ends the ENTIRE remaining tour (not just this stage) — that's the
  // point of the confirm step, since it's a bigger decision than dismissing
  // one stage.
  const confirmSkip = useCallback(() => {
    const nextProgress = STAGES.reduce((acc, s) => ({ ...acc, [s]: true }), {});
    persistProgress(nextProgress, true);
    setShowSkipConfirm(false);
  }, [persistProgress]);

  // Manually restarts the whole sequence from Stage 1, regardless of progress —
  // used by the "Replay Tour" entry in Settings.
  const replayTour = useCallback(async () => {
    if (!user?.id) return;
    const supabase = await getSupabase();
    await supabase
      .from('app_users')
      .update({
        has_seen_tour: false,
        tour_progress: { dashboard: false, products: false, orders: false, settings: false },
      })
      .eq('id', user.id);
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
  }, [user?.id, queryClient]);

  return {
    eligible,
    showSkipConfirm,
    requestSkip: () => setShowSkipConfirm(true),
    cancelSkip: () => setShowSkipConfirm(false),
    confirmSkip,
    completeStage,
    replayTour,
    isOwner,
  };
}
