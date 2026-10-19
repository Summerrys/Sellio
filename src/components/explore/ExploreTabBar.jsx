import React from 'react';
import { useNavigate } from 'react-router-dom';
import { House, LayoutGrid, MessageCircle, CircleUserRound } from 'lucide-react';
import { useAppUser } from '@/lib/AppUserContext';
import { useChatUnread } from '@/lib/chat';
import { useSell } from '@/lib/sell';
import BottomTabBar from '@/components/navigation/BottomTabBar';
import MerchantTabBar, { useBusinessBar } from '@/components/navigation/MerchantTabBar';
import { BOTTOM_INSET } from './shared';

// Explore's bottom bar on phones: Home · Listings · Sell · Chat · Me — the same bar
// (and look) a free shop has in its workspace. A business sees its own workspace bar
// (Home · Products · Counter · Orders · Me) here too. Wider screens keep the header
// links and the Sell button.

// Room to leave at the bottom of a page that shows the bar (phones only).
export const TAB_BAR_SPACE = `calc(80px + ${BOTTOM_INSET})`;

// Back works like other shopping apps: the other tabs sit one step above Home, so
// Back from any of them returns to Home (where it was left), and Back on Home leaves.
let homeIndex = null;
export function markExploreHome() {
  homeIndex = window.history.state?.idx ?? null;
}

export default function ExploreTabBar({ active }) {
  const navigate = useNavigate();
  const { appUser } = useAppUser() || {};
  const hasShop = !!appUser?.tenant_id;
  // A business (its owner and staff) keeps its own bar here: Home · Products · Counter · Orders · Me.
  const business = useBusinessBar(hasShop);
  const unread = useChatUnread(!!appUser && !business);
  const chatCount = (Number(unread.buying) || 0) + (Number(unread.selling) || 0);
  const { openSell } = useSell();

  const open = (key, to) => (event) => {
    event.preventDefault();
    if (key === active) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const idx = window.history.state?.idx ?? 0;
    if (key === 'home') {
      if (homeIndex != null && idx === homeIndex + 1) navigate(-1);
      else navigate(to, { replace: true });
      return;
    }
    navigate(to, { replace: active !== 'home' });
  };
  const tab = (key, label, icon, to, extra = {}) => ({ key, label, icon, to, active: key === active, onClick: open(key, to), ...extra });

  if (business) {
    return (
      <MerchantTabBar
        active={active === 'home' || active === 'me' ? active : null}
        homeClick={open('home', '/explore')}
        meClick={open('me', '/explore/me')}
        hideFrom="md"
        zIndex="z-40"
        bottomInset={BOTTOM_INSET}
      />
    );
  }

  return (
    <BottomTabBar
      hideFrom="md"
      zIndex="z-40"
      bottomInset={BOTTOM_INSET}
      sell={hasShop ? { to: '/explore/listings?new=1', onClick: (event) => { event.preventDefault(); openSell(); } } : { to: '/join' }}
      tabs={[
        tab('home', 'Home', House, '/explore'),
        tab('listings', 'Listings', LayoutGrid, '/explore/listings'),
        tab('chats', 'Chat', MessageCircle, '/explore/chats', { badge: chatCount }),
        tab('me', 'Me', CircleUserRound, '/explore/me'),
      ]}
    />
  );
}
