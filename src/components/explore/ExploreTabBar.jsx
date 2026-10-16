import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { House, LayoutGrid, MessageCircle, CircleUserRound, Plus } from 'lucide-react';
import { useAppUser } from '@/lib/AppUserContext';
import { useChatUnread } from '@/lib/chat';
import { BRAND_COLOR, BRAND_GRADIENT, BOTTOM_INSET } from './shared';

// Explore's bottom bar on phones: Home · Listings · Sell · Chat · Me.
// (Wider screens keep the header links and the Sell button.)
const TABS = [
  { key: 'home', label: 'Home', icon: House, to: '/explore' },
  { key: 'listings', label: 'Listings', icon: LayoutGrid, to: '/explore/listings' },
  { key: 'sell' },
  { key: 'chats', label: 'Chat', icon: MessageCircle, to: '/explore/chats' },
  { key: 'me', label: 'Me', icon: CircleUserRound, to: '/explore/me' },
];

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
  const unread = useChatUnread(!!appUser);
  const chatCount = (Number(unread.buying) || 0) + (Number(unread.selling) || 0);
  const sellHref = hasShop ? '/Products?new=1' : '/join';

  const open = (event, tab) => {
    event.preventDefault();
    if (tab.key === active) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const idx = window.history.state?.idx ?? 0;
    if (tab.key === 'home') {
      if (homeIndex != null && idx === homeIndex + 1) navigate(-1);
      else navigate(tab.to, { replace: true });
      return;
    }
    navigate(tab.to, { replace: active !== 'home' });
  };

  return (
    <nav
      aria-label="Explore"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200"
      style={{ paddingBottom: BOTTOM_INSET }}
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
        {TABS.map((tab) => {
          if (tab.key === 'sell') {
            return (
              <Link key="sell" to={sellHref} aria-label="Sell — add a listing" className="flex flex-col items-center justify-start">
                <span
                  className="-mt-4 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shadow-lg shadow-black/15 ring-4 ring-white active:scale-95 transition-transform"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Plus className="w-6 h-6" strokeWidth={2.5} />
                </span>
                <span className="mt-0.5 text-[11px] font-semibold text-slate-700">Sell</span>
              </Link>
            );
          }
          const Icon = tab.icon;
          const isActive = tab.key === active;
          const badge = tab.key === 'chats' && chatCount > 0 ? (chatCount > 99 ? '99+' : String(chatCount)) : null;
          return (
            <Link
              key={tab.key}
              to={tab.to}
              onClick={(event) => open(event, tab)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={badge ? `${tab.label}, ${badge} unread` : tab.label}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{ color: isActive ? BRAND_COLOR : '#64748b' }}
            >
              <span className="relative">
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.4 : 2} />
                {badge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-white">
                    {badge}
                  </span>
                )}
              </span>
              <span className={`text-[11px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
