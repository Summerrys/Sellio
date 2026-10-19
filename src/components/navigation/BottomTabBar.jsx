import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// The phone bottom bar: Home · Listings · Sell · Chat · Me for Explore and a free shop,
// Home · Products · Counter · Orders · Me for a business (see MerchantTabBar).
// tabs: [{ key, label, icon, to, active, pulse, badge, onClick }] (four of them; the
// middle button sits between the second and third). sell: { to, onClick, pulse } (onClick
// opens the new-listing form), or center: { … } for another middle button.
// hideFrom: 'lg' (the workspace) or 'md' (Explore).

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

// The raised middle button: Sell (a new listing) or, for a business, the Counter.
// center: { to, onClick, label, icon, iconClassName, ariaLabel, dataTour, active, pulse }
function CenterButton({ center }) {
  const Icon = center.icon;
  return (
    <div className="flex-1 flex flex-col items-center justify-end pb-1" style={{ minHeight: 60 }}>
      <Link
        to={center.to}
        onClick={center.onClick}
        data-tour={center.dataTour}
        aria-label={center.ariaLabel}
        aria-current={center.active ? 'page' : undefined}
        className="relative flex min-h-11 min-w-11 flex-col items-center gap-0.5 -mt-5 rounded-xl transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--color-primary))]"
      >
        <span
          className="relative w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
          style={{ background: 'var(--color-primary-gradient)' }}
        >
          <Icon className={cn(center.iconClassName || 'w-7 h-7', 'text-white')} aria-hidden="true" />
          {center.pulse && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-white" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white ring-2 ring-[rgb(var(--color-primary))]" />
            </span>
          )}
        </span>
        <span className="text-xs font-semibold" style={{ color: 'rgb(var(--color-primary))' }}>{center.label}</span>
      </Link>
    </div>
  );
}

// sell: the Sell button in the middle. center: any other middle button (the Counter).
// With neither, the four tabs share the bar.
export default function BottomTabBar({ tabs, sell, center, hideFrom = 'lg', bottomInset, zIndex = 'z-30' }) {
  const [first, second, third, fourth] = tabs;
  const middle = sell
    ? { ...sell, label: 'Sell', icon: Plus, ariaLabel: 'Sell — add a listing', dataTour: 'sell-shortcut' }
    : center || null;
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
      {middle && <CenterButton center={middle} />}
      <Tab tab={third} />
      <Tab tab={fourth} />
    </nav>
  );
}
