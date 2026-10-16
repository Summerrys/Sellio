import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// The phone bottom bar shared by a free shop and Explore: Home · Listings · Sell · Chat · Me.
// tabs: [{ key, label, icon, to, active, pulse, badge, onClick }] (four of them; Sell sits
// in the middle). sell: { to, pulse }. hideFrom: 'lg' (the shop) or 'md' (Explore).
// Same look as the workspace's bottom bar for stores that take orders at a counter.

function Tab({ tab }) {
  const Icon = tab.icon;
  const badge = Number(tab.badge) > 0 ? (tab.badge > 99 ? '99+' : String(tab.badge)) : null;
  return (
    <Link
      to={tab.to}
      onClick={tab.onClick}
      aria-current={tab.active ? 'page' : undefined}
      aria-label={badge ? `${tab.label}, ${badge} unread` : tab.label}
      className={cn(
        'relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[60px]',
        tab.active ? 'text-[rgb(var(--color-primary))]' : 'text-slate-400',
      )}
    >
      <span className="relative">
        <Icon className="w-5 h-5" />
        {badge ? (
          <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center">
            {badge}
          </span>
        ) : tab.pulse ? (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--color-primary-gradient)' }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--color-primary-gradient)' }} />
          </span>
        ) : null}
      </span>
      <span>{tab.label}</span>
    </Link>
  );
}

export default function BottomTabBar({ tabs, sell, hideFrom = 'lg', bottomInset, zIndex = 'z-30' }) {
  const [first, second, third, fourth] = tabs;
  return (
    <nav
      data-tour="bottom-nav"
      aria-label="Main"
      className={cn(
        hideFrom === 'md' ? 'md:hidden' : 'lg:hidden',
        'fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex items-stretch',
        zIndex,
      )}
      style={{ paddingBottom: bottomInset }}
    >
      <Tab tab={first} />
      <Tab tab={second} />
      <div className="flex-1 flex flex-col items-center justify-end pb-1" style={{ minHeight: 60 }}>
        <Link
          to={sell.to}
          data-tour="sell-shortcut"
          aria-label="Sell — add a listing"
          className="relative flex min-h-11 min-w-11 flex-col items-center gap-0.5 -mt-5 rounded-xl transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--color-primary))]"
        >
          <span
            className="relative w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'var(--color-primary-gradient)' }}
          >
            <Plus className="w-7 h-7 text-white" aria-hidden="true" />
            {sell.pulse && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-white" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white ring-2 ring-[rgb(var(--color-primary))]" />
              </span>
            )}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'rgb(var(--color-primary))' }}>Sell</span>
        </Link>
      </div>
      <Tab tab={third} />
      <Tab tab={fourth} />
    </nav>
  );
}
