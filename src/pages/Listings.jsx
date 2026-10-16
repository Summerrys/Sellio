import React, { useEffect } from 'react';
import { useTenant } from '@/components/tenant/TenantContext';
import { MyListingsContent, OrdersButton } from '@/components/explore/ExploreListings';

// A free shop's Listings tab: everything it sells, as buyers see it on Explore, with
// Orders at the top (Orders no longer has its own tab).
export default function Listings() {
  const { tenantId, hasPermission } = useTenant();

  useEffect(() => {
    const previous = document.title;
    document.title = 'Listings · Sellio';
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-0">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Listings</h1>
          <p className="text-sm text-slate-500">Everything you sell, as buyers see it on Explore.</p>
        </div>
        {hasPermission('orders.view') && <OrdersButton />}
      </div>
      <MyListingsContent tenantId={tenantId} signedIn returnPath="/Listings" />
    </div>
  );
}
