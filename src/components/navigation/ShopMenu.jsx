import React, { createContext, useContext } from 'react';
import { Menu } from 'lucide-react';

// The shop's side menu on Explore's pages (Alvin, 10 Nov 2026: a home seller's Listings and Chat
// "should also show the side menu hamburger so users can navigate using it"). Layout gives the
// opener to a free home shop's owner on Explore; anyone else gets none, so no button shows.
export const ShopMenuContext = createContext(null);

export function ShopMenuButton() {
  const open = useContext(ShopMenuContext);
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open menu"
      data-testid="shop-menu-button"
      className="-ml-2 w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:opacity-70 transition-opacity"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
}
