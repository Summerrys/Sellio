import React from 'react';
import { ClipboardList, Search, WifiOff } from 'lucide-react';
import ShareShopLinkButton from '@/components/shop/ShareShopLink';

// What the Orders list says when it has nothing to show (Alvin, 7 Nov 2026: say why it's
// empty, then give one next step).
//   offline — no connection, and no orders kept on the phone to show
//   failed  — the orders couldn't be loaded, so the list isn't really empty
//   search  — nothing matches what was typed
//   tab     — there are orders, just none with the chosen status
//   none    — no orders yet
export function ordersEmptyKind({ failed, total, query, offline = false }) {
  if (failed && !total && offline) return 'offline';
  if (failed && !total) return 'failed';
  if (!total) return 'none';
  if (query.trim()) return 'search';
  return 'tab';
}

const GHOST = 'h-10 px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform';

// Each status tab: what's missing and why (shopTitle, shopText: a free shop's words).
const TAB_COPY = {
  pending: { title: 'No new orders', text: 'New orders wait here until you accept them.' },
  confirmed: { title: 'Nothing confirmed', shopTitle: 'Nothing accepted', text: 'Orders you’ve confirmed wait here until you start preparing them.', shopText: 'Orders you’ve accepted wait here until you start preparing them.' },
  preparing: { title: 'Nothing being prepared', text: 'Orders show up here while you prepare them.' },
  ready: { title: 'Nothing ready', text: 'Orders show up here once they’re ready.', shopText: 'Orders show up here once they’re ready to collect or out for delivery.' },
  completed: { title: 'Nothing done yet', text: 'Orders you’ve finished show up here.' },
};

// "your shop page, table QR codes and the Counter"
function sourcesText(parts) {
  if (parts.length < 2) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export default function OrdersEmpty({
  kind, query = '', tab = 'all', isShop = false, tableOrdering = false, counter = false,
  onSeeAll, onClearSearch, onRetry,
}) {
  let icon = ClipboardList;
  let title;
  let text;
  let action = null;

  if (kind === 'offline') {
    icon = WifiOff;
    title = 'You’re offline';
    text = 'Your orders show here once you’re back online. Sellio reconnects by itself.';
  } else if (kind === 'failed') {
    icon = WifiOff;
    title = 'Couldn’t load your orders';
    text = 'Sellio couldn’t reach the server. Check your connection, then try again.';
    action = <button type="button" onClick={onRetry} className={GHOST}>Try again</button>;
  } else if (kind === 'search') {
    icon = Search;
    title = `No orders match “${query.trim()}”`;
    text = isShop
      ? 'Search looks at order numbers, buyers’ names and phone numbers, and items.'
      : 'Search looks at order numbers, tables, customers’ names and items.';
    action = <button type="button" onClick={onClearSearch} className={GHOST}>Clear search</button>;
  } else if (kind === 'tab') {
    const copy = TAB_COPY[tab] || { title: 'No orders here', text: 'Orders with this status show up here.' };
    title = (isShop && copy.shopTitle) || copy.title;
    text = (isShop && copy.shopText) || copy.text;
    action = <button type="button" onClick={onSeeAll} className={GHOST}>See all orders</button>;
  } else {
    title = 'No orders yet';
    const sources = ['your shop page'];
    if (!isShop && tableOrdering) sources.push('table QR codes');
    if (!isShop && counter) sources.push('the Counter');
    text = `Orders from ${sourcesText(sources)} show up here.`;
    action = <ShareShopLinkButton />;
  }

  const Icon = icon;
  return (
    <div className="text-center py-12 px-4" data-testid="orders-empty" data-kind={kind}>
      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
