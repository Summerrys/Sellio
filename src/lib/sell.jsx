import React, { Suspense, createContext, lazy, useCallback, useContext, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import { planInfo } from '@/lib/entitlements';
import { useTenant } from '@/components/tenant/TenantContext';
import PricingModal from '@/components/subscription/PricingModal';

const ProductFormDialog = lazy(() => import('@/components/products/ProductFormDialog.jsx'));

// Sell (the middle of the bottom bar, and Explore's Sell button on wider screens) opens
// a new listing over the page you're on. Cancel, ✕ or phone Back leaves you on that
// page; saving takes you to My listings, where the new listing is first.
// The open form is its own step in the page's history (same address, marked in its
// state), so phone Back closes it like any other screen.

export const MY_LISTINGS = '/explore/listings';

const SellContext = createContext({ openSell: () => {} });
export const useSell = () => useContext(SellContext);

export function SellProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { tenantId, tenant, subscription, hasPermission } = useTenant();
  const [limitOpen, setLimitOpen] = useState(false);
  const savedRef = useRef(false);
  const open = !!tenantId && !!location.state?.sellForm;

  // The plan's listing limit, from what the workspace already loads (no extra polling).
  // The database checks it again when the listing is saved.
  const maxProducts = (() => {
    const fromPlan = planInfo(subscription, queryClient.getQueryData(['entitlements', tenantId])).maxProducts;
    return fromPlan !== undefined ? fromPlan : (subscription?.max_products ?? null);
  })();
  const { data: productCount } = useQuery({
    queryKey: ['productCount', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!tenantId && maxProducts != null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const openSell = useCallback(() => {
    if (!tenantId) { navigate('/join'); return; }
    if (!hasPermission('products.create')) { toast.error("You don't have access to add listings."); return; }
    if (maxProducts != null && productCount != null && productCount >= maxProducts) { setLimitOpen(true); return; }
    if (location.state?.sellForm) return;
    savedRef.current = false;
    // Added straight from the tap, so the phone's Back always has this step to undo.
    navigate(`${location.pathname}${location.search}${location.hash}`, { state: { ...(location.state || {}), sellForm: true } });
  }, [tenantId, hasPermission, maxProducts, productCount, location, navigate]);

  const close = useCallback(() => {
    const saved = savedRef.current;
    savedRef.current = false;
    if (saved && location.pathname.toLowerCase() !== MY_LISTINGS) {
      // The form's step becomes My listings, so Back there returns to where Sell was tapped.
      navigate(MY_LISTINGS, { replace: true });
    } else if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      // Opened from a reload with the form up: nothing behind it, so just close it.
      const { sellForm: _sellForm, ...rest } = location.state || {};
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: Object.keys(rest).length ? rest : null });
    }
  }, [location, navigate]);

  return (
    <SellContext.Provider value={{ openSell }}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <ProductFormDialog
            open
            product={null}
            tenantId={tenantId}
            onSaved={() => { savedRef.current = true; }}
            onOpenChange={(next) => { if (!next) close(); }}
          />
        </Suspense>
      )}
      {limitOpen && (
        <PricingModal
          open
          onOpenChange={setLimitOpen}
          tenantId={tenantId}
          currentTier={subscription?.tier ?? null}
          hasUsedTrial={tenant?.has_used_trial ?? false}
        />
      )}
    </SellContext.Provider>
  );
}
