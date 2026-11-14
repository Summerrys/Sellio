import React from 'react';
import { ClipboardList, Search, WifiOff } from 'lucide-react';
import ShareShopLinkButton from '@/components/shop/ShareShopLink';
import { DidYouMean } from '@/components/ui-custom/NoMatches';
import { useAppText, N_ } from '@/lib/appText';

// What the Orders list says when it has nothing to show (Alvin, 7 Nov 2026: say why it's
// empty, then give one next step).
//   offline — no connection, and no orders kept on the phone to show
//   failed  — the orders couldn't be loaded, so the list isn't really empty
//   search  — nothing matches what was typed: where it does match (other statuses), else
//             the likely spelling (UX state 6), else what search looks at
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
  pending: { title: N_('No new orders'), text: N_('New orders wait here until you accept them.') },
  confirmed: { title: N_('Nothing confirmed'), shopTitle: N_('Nothing accepted'), text: N_('Orders you’ve confirmed wait here until you start preparing them.'), shopText: N_('Orders you’ve accepted wait here until you start preparing them.') },
  preparing: { title: N_('Nothing being prepared'), text: N_('Orders show up here while you prepare them.') },
  ready: { title: N_('Nothing ready'), text: N_('Orders show up here once they’re ready.'), shopText: N_('Orders show up here once they’re ready to collect or out for delivery.') },
  completed: { title: N_('Nothing done yet'), text: N_('Orders you’ve finished show up here.') },
};

// "your shop page, table QR codes and the Counter"
function sourcesText(parts, t) {
  const shown = parts.map((part) => t(part));
  if (shown.length < 2) return shown[0] || '';
  return t('{list} and {last}', { list: shown.slice(0, -1).join(', '), last: shown[shown.length - 1] });
}

export default function OrdersEmpty({
  kind, query = '', tab = 'all', isShop = false, tableOrdering = false, counter = false,
  onSeeAll, onClearSearch, onRetry, foundElsewhere = 0, suggestion = null, onSearch,
}) {
  const { t } = useAppText();
  let icon = ClipboardList;
  let title;
  let text;
  let action = null;

  if (kind === 'offline') {
    icon = WifiOff;
    title = t('You’re offline');
    text = t('Your orders show here once you’re back online. Sellio reconnects by itself.');
  } else if (kind === 'failed') {
    icon = WifiOff;
    title = t('Couldn’t load your orders');
    text = t('Sellio couldn’t reach the server. Check your connection, then try again.');
    action = <button type="button" onClick={onRetry} className={GHOST}>{t('Try again')}</button>;
  } else if (kind === 'search') {
    icon = Search;
    title = t('No orders match “{query}”', { query: query.trim() });
    if (foundElsewhere > 0) {
      text = foundElsewhere === 1 ? t('One order with another status matches.') : t('{count} orders with other statuses match.', { count: foundElsewhere });
      action = <button type="button" onClick={onSeeAll} className={GHOST}>{t('Search all orders')}</button>;
    } else if (suggestion) {
      text = <DidYouMean suggestion={suggestion} onPick={onSearch} />;
      action = <button type="button" onClick={() => onSearch(suggestion)} className={`${GHOST} max-w-full truncate`}>{t('Search “{suggestion}”', { suggestion })}</button>;
    } else {
      text = isShop
        ? t('Search looks at order numbers, buyers’ names and phone numbers, and items.')
        : t('Search looks at order numbers, tables, customers’ names and items.');
      action = <button type="button" onClick={onClearSearch} className={GHOST}>{t('Clear search')}</button>;
    }
  } else if (kind === 'tab') {
    const copy = TAB_COPY[tab] || { title: N_('No orders here'), text: N_('Orders with this status show up here.') };
    title = t((isShop && copy.shopTitle) || copy.title);
    text = t((isShop && copy.shopText) || copy.text);
    action = <button type="button" onClick={onSeeAll} className={GHOST}>{t('See all orders')}</button>;
  } else {
    title = t('No orders yet');
    const sources = [N_('your shop page')];
    if (!isShop && tableOrdering) sources.push(N_('table QR codes'));
    if (!isShop && counter) sources.push(N_('the Counter'));
    text = t('Orders from {sources} show up here.', { sources: sourcesText(sources, t) });
    action = <ShareShopLinkButton />;
  }

  const Icon = icon;
  return (
    <div className="text-center py-12 px-4" data-testid="orders-empty" data-kind={kind}>
      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900 break-words">{title}</p>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
