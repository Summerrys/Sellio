import React, { useState } from 'react';
import { isNativeApp } from '@/lib/nativeApp';

// Shared by Explore, its listing pages and chats.

export const LOGO_URL = '/branding/sellio-logo.webp';
// The visitor's colour: the default gradient, or a seller's own theme once chosen.
export const BRAND_GRADIENT = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
// The theme's main colour (outlines, active tabs, links).
export const BRAND_COLOR = 'rgb(var(--color-primary, 59 130 246))';
// Base44's Android app already keeps pages clear of the system navigation bar.
export const NATIVE_ANDROID = typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent) && isNativeApp();
export const BOTTOM_INSET = NATIVE_ANDROID ? '0px' : 'env(safe-area-inset-bottom, 0px)';
// Shared links always use the public site address.
export const PUBLIC_ORIGIN = 'https://sellio.apptelier.sg';

export const hideScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

export const storeUrl = (slug) => `/store/${encodeURIComponent(slug)}`;
export const listingUrl = (productId) => `/listing/${encodeURIComponent(productId)}`;
export const chatUrl = (conversationId) => `/explore/chats/${encodeURIComponent(conversationId)}`;
export const newChatUrl = (productId) => `/explore/chats/new?listing=${encodeURIComponent(productId)}`;

export function formatPrice(amount, currency) {
  const value = Number(amount);
  if (amount == null || Number.isNaN(value)) return '';
  return `${currency === 'MYR' ? 'RM' : 'S$'}${value.toFixed(2)}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// Back within the app when there's somewhere to go back to, otherwise a sensible page.
export function goBack(navigate, fallback = '/explore') {
  if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
  else navigate(fallback, { replace: true });
}

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

// A compact page header for Explore's tabs: clear of the phone's status bar.
export function ExploreTabHeader({ title, right = null, children = null }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      {children}
    </header>
  );
}
