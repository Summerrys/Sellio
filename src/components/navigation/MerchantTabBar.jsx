import React, { useEffect } from 'react';
import { House, ShoppingBag, ClipboardList, CircleUserRound, Monitor } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useTenant } from '@/components/tenant/TenantContext';
import { itemWords } from '@/lib/planFeatures';
import { isShopTenant } from '@/lib/shopSelling';
import BottomTabBar from './BottomTabBar';

// A business's phone bottom bar, the same on its workspace pages and on Explore:
// Home (Explore) · Products · Counter · Orders · Me. Everyone on the team sees all five;
// the Counter page tells staff without Counter access that they don't have it (as other
// pages do). The Dashboard opens from "My shop" (Explore's header and Me),
// Settings from Me, and chats from the chat button at the top of the workspace.
//   active: 'home' | 'Products' | 'Counter' | 'Orders' | 'me' (or null)
//   onTab(key, isActive): runs on every tab (the workspace keeps each tab's scroll)
//   homeClick / meClick: Explore's own Home and Me steps (Back returns to Home)
export default function MerchantTabBar({ active = null, onTab, homeClick, meClick, hideFrom = 'lg', bottomInset, zIndex = 'z-30' }) {
  const { user, tenant, isOwner } = useTenant();
  // The getting-started tour: each page still to visit pulses (Settings is under Me).
  const tour = user?.tour_progress || {};
  const tourActive = isOwner && !user?.has_seen_tour && !!tour.dashboard;

  const tab = (key, label, icon, to, { click, pulse } = {}) => ({
    key,
    label,
    icon,
    to,
    active: active === key,
    pulse: !!pulse,
    onClick: (event) => {
      click?.(event);
      onTab?.(key, active === key);
    },
  });

  const center = {
    to: createPageUrl('Counter'),
    onClick: () => onTab?.('Counter', active === 'Counter'),
    label: 'Counter',
    icon: Monitor,
    iconClassName: 'w-8 h-8',
    ariaLabel: 'Counter — take orders',
    dataTour: 'counter-shortcut',
    active: active === 'Counter',
  };

  return (
    <BottomTabBar
      hideFrom={hideFrom}
      zIndex={zIndex}
      bottomInset={bottomInset}
      center={center}
      tabs={[
        tab('home', 'Home', House, '/explore', { click: homeClick }),
        tab('Products', itemWords(tenant?.seller_type).Products, ShoppingBag, createPageUrl('Products'), { pulse: tourActive && !tour.products }),
        tab('Orders', 'Orders', ClipboardList, createPageUrl('Orders'), { pulse: tourActive && !tour.orders }),
        tab('me', 'Me', CircleUserRound, '/explore/me', { click: meClick, pulse: tourActive && !tour.settings }),
      ]}
    />
  );
}

// Explore shows a business's bar to its owner and staff. Until the store has loaded, the
// bar this phone showed last time stands in, so a business doesn't see the shop bar flash.
const LAST_BAR = 'sellio_business_bar';
export function useBusinessBar(hasShop) {
  const { tenant } = useTenant();
  const known = tenant ? !isShopTenant(tenant) : null;
  useEffect(() => {
    if (known === null) return;
    try { localStorage.setItem(LAST_BAR, known ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [known]);
  if (!hasShop) return false;
  if (known !== null) return known;
  try { return localStorage.getItem(LAST_BAR) === '1'; } catch { return false; }
}
