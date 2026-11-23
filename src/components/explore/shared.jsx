import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ShopMenuButton } from '@/components/navigation/ShopMenu';
import { formatMoney } from '@/lib/money';
import { N_, englishText, useAppText } from '@/lib/appText';
import ExploreChatCount from './ExploreChatCount';

// Shared by Explore, its listing pages and chats.

export const LOGO_URL = '/branding/sellio-logo.webp';
// The visitor's colour: the default gradient, or a seller's own theme once chosen.
export const BRAND_GRADIENT = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
// The theme's main colour (outlines, active tabs, links).
export const BRAND_COLOR = 'rgb(var(--color-primary, 59 130 246))';
// The phone's own bottom area (the gesture bar). In Sellio's Android app, Capacitor keeps the page
// clear of it and the inset is 0.
export const BOTTOM_INSET = 'env(safe-area-inset-bottom, 0px)';
// Shared links always use the public site address.
export const PUBLIC_ORIGIN = 'https://sellio.sg';

export const hideScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

export const storeUrl = (slug) => `/store/${encodeURIComponent(slug)}`;
export const listingUrl = (productId) => `/listing/${encodeURIComponent(productId)}`;
export const chatUrl = (conversationId) => `/explore/chats/${encodeURIComponent(conversationId)}`;
export const newChatUrl = (productId) => `/explore/chats/new?listing=${encodeURIComponent(productId)}`;

// A listing's price in its shop's currency (lib/money.js): S$4.50, RM4.50, Rp15.000.
export function formatPrice(amount, currency) {
  const value = Number(amount);
  if (amount == null || Number.isNaN(value)) return '';
  return formatMoney(value, currency);
}

// t: a translated screen's own (lib/appText.js); without it the words are English.
export function timeAgo(iso, t) {
  if (!iso) return '';
  const say = t || englishText;
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return say(N_('Just now'));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return say(N_('{minutes} min ago'), { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return say(N_('{hours}h ago'), { hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? say(N_('1 day ago')) : say(N_('{days} days ago'), { days });
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? say(N_('1 week ago')) : say(N_('{weeks} weeks ago'), { weeks });
  const months = Math.floor(days / 30);
  if (days < 365) return months === 1 ? say(N_('1 month ago')) : say(N_('{months} months ago'), { months });
  const years = Math.floor(days / 365);
  return years === 1 ? say(N_('1 year ago')) : say(N_('{years} years ago'), { years });
}

// Back within the app when there's somewhere to go back to, otherwise a sensible page.
export { goBack } from '@/lib/goBack';

export function ShopAvatar({ name, logo, size = 24 }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="sellio-photo rounded-full object-cover bg-white border border-slate-100 flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: BRAND_GRADIENT, fontSize: Math.max(10, size * 0.42) }}
    >
      {initial}
    </span>
  );
}

// A listing photo, or the item's first letter when there's none (or it fails).
export function ItemImage({ src, name, className = '', rounded = '' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={`sellio-photo object-cover bg-slate-100 ${rounded} ${className}`} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center ${rounded} ${className}`}
      style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.18), rgba(224,68,154,0.16), rgba(139,47,201,0.18))' }}
    >
      <span className="font-bold text-white/90" style={{ textShadow: '0 2px 12px rgba(139,47,201,0.35)' }}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// Explore's four tabs as header links on wider screens, where the bottom bar is hidden.
// Chat carries the unread count, as the bottom bar's Chat does on phones (ExploreChatCount).
const DESKTOP_TABS = [['/explore', N_('Home')], ['/explore/listings', N_('Listings')], ['/explore/chats', N_('Chat')], ['/explore/me', N_('Me')]];
export function ExploreDesktopTabs() {
  const { t } = useAppText('explore');
  return (
    <nav aria-label={t('Explore')} className="hidden md:flex items-center gap-1">
      {DESKTOP_TABS.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/explore'}
          className={({ isActive }) => `h-9 px-3 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {t(label)}
          {to === '/explore/chats' && <ExploreChatCount />}
        </NavLink>
      ))}
    </nav>
  );
}

// A compact page header for Explore's tabs: clear of the phone's status bar.
// shopMenu: the shop's side menu button before the title, for a free home shop's owner (Listings
// and Chat: ShopMenuButton shows only where Layout offers the menu).
export function ExploreTabHeader({ title, right = null, children = null, shopMenu = false }) {
  return (
    <header data-app-header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        {shopMenu && <ShopMenuButton />}
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <ExploreDesktopTabs />
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      {children}
    </header>
  );
}
