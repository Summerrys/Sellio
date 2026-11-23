import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// Whether each item's seller counts its stock, and how many are left, for the carts that
// live away from the shop's own page (an Explore listing, Explore's Cart page). The shop's
// page has its items already (storefrontCatalog.js). Anyone can read an active item's stock
// (the products table's storefront_public_read policy), the same as on the shop's page.
// Until it arrives, or if it can't be read, there's no limit below the usual 99
// (shopCart.js stockLimit). Checkout prices the order itself but doesn't check stock yet.
export function useStockInfo(productIds) {
  const key = [...new Set((productIds || []).filter(Boolean).map(String))].sort().join('\n');
  const [info, setInfo] = useState({});
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('products')
          .select('id, track_inventory, stock_quantity')
          .in('id', key.split('\n'));
        if (error) throw error;
        if (!cancelled) setInfo(Object.fromEntries((data || []).map((p) => [p.id, p])));
      } catch (err) {
        console.warn('Sellio: stock not loaded', err);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);
  return info;
}
