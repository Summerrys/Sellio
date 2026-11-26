import React, { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, Handshake, Loader2, SlidersHorizontal, Truck, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppText } from '@/lib/appText';
import { currencyDecimals, currencyPrefix } from '@/lib/money';
import {
  DEAL_METHODS, SEARCH_COUNTRIES, SEARCH_CURRENCIES, SEARCH_SORTS,
  activeFilterCount, priceCurrency, priceRange, searchArgs, searchFilters, shortPrice,
} from '@/lib/exploreSearch';
import BottomSheet from './BottomSheet';

// Explore search's sort and filters (step 1, Alvin 26 Nov 2026; the mockup:
// https://claude.ai/artifact/Ra93zmtkC1YeFb8Z1d6PAV). A row of chips under the search box, shown
// from the moment the box is tapped: Filters (all of them in one sheet, in Alvin's order: sort,
// category, deal method, location, price) and one chip for each, which opens just that part.
// Sort and Category apply as soon as one is picked; the others wait for "Show 12 results", which
// counts the matches as they change (explore_search, one row).

const GRADIENT = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
const hideScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none' };
const nameOf = (list, key) => list.find((item) => item.key === key)?.label || '';

function priceText(filters, t) {
  const { min, max, currency } = priceRange(filters);
  if (min != null && max != null) return `${shortPrice(min, currency)} – ${shortPrice(max, currency)}`;
  if (max != null) return t('Up to {price}', { price: shortPrice(max, currency) });
  if (min != null) return t('From {price}', { price: shortPrice(min, currency) });
  return t('Price');
}

// kinds: Explore's categories ({ key, label }), the same list as its chips.
export function FilterChips({ filters, kinds, onOpen }) {
  const { t } = useAppText('explore');
  const count = activeFilterCount(filters);
  const { min, max } = priceRange(filters);
  const deal = filters.deal;
  const chips = [
    { key: 'all', icon: SlidersHorizontal, label: count ? t('Filters · {count}', { count }) : t('Filters'), on: count > 0 },
    { key: 'sort', label: t('Sort: {sort}', { sort: t(nameOf(SEARCH_SORTS, filters.sort)) }), on: filters.sort !== 'best' },
    { key: 'kind', label: filters.kind === 'all' ? t('All categories') : t(nameOf(kinds, filters.kind)), on: filters.kind !== 'all' },
    { key: 'deal', label: deal.length > 1 ? t('Meet-up or delivery') : deal.length ? t(nameOf(DEAL_METHODS, deal[0])) : t('Deal method'), on: deal.length > 0 },
    { key: 'location', label: filters.country ? t(nameOf(SEARCH_COUNTRIES, filters.country)) : t('Location'), on: !!filters.country },
    { key: 'price', label: priceText(filters, t), on: min != null || max != null },
  ];
  return (
    <div role="toolbar" aria-label={t('Sort and filter')} data-testid="explore-filter-chips" className="flex gap-2 overflow-x-auto px-3 sm:px-4 pb-2.5" style={hideScrollbar}>
      {chips.map(({ key, icon: Icon, label, on }) => (
        <button
          key={key}
          type="button"
          aria-haspopup="dialog"
          data-chip={key}
          onClick={() => onOpen(key)}
          className={`h-8 pl-3 ${Icon ? 'pr-3' : 'pr-2'} rounded-full text-[13.5px] font-semibold whitespace-nowrap border inline-flex items-center gap-1 flex-shrink-0 transition-colors ${on ? 'text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          style={on ? { background: GRADIENT } : undefined}
        >
          {Icon && <Icon className="w-[15px] h-[15px]" aria-hidden="true" />}
          {label}
          {!Icon && <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

function Pill({ on, onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[34px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap border inline-flex items-center gap-1.5 transition-colors ${on ? 'text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
      style={on ? { background: GRADIENT } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

function Section({ title, children, first = false }) {
  return (
    <section className={first ? 'pt-1' : 'pt-5'}>
      {title && <h3 className="text-[15px] font-bold text-slate-900 mb-2.5">{title}</h3>}
      {children}
    </section>
  );
}

// How many listings a set of filters finds, asked a moment after it last changed.
function useMatchCount(args) {
  const key = args ? JSON.stringify(args) : '';
  const [answer, setAnswer] = useState({ key: '', count: null, failed: false });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('explore_search', { ...JSON.parse(key), p_limit: 1, p_offset: 0 });
        if (error) throw error;
        if (alive) setAnswer({ key, count: Number(data?.[0]?.total_count) || 0, failed: false });
      } catch (err) {
        console.warn('Explore filter count failed:', err);
        if (alive) setAnswer({ key, count: null, failed: true });
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [key]);
  const known = answer.key === key;
  return { count: known ? answer.count : null, waiting: !!key && !known, failed: known && answer.failed };
}

function PriceBox({ label, placeholder, value, currency, onChange }) {
  const prefix = currencyPrefix(currency);
  return (
    <label className="relative block flex-1 min-w-0">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">{prefix}</span>
      <input
        type="text"
        inputMode={currencyDecimals(currency) === 0 ? 'numeric' : 'decimal'}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
        placeholder={placeholder}
        className="w-full h-11 pr-3 rounded-xl border border-slate-200 bg-white text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-pink-200"
        style={{ paddingLeft: prefix.length > 2 ? 48 : 38 }}
      />
    </label>
  );
}

// section: 'all' (every part), 'sort', 'kind', 'deal', 'location' or 'price'. The parent keys it by
// each opening, so the draft starts from the filters in use every time.
export function FilterSheet({ section, filters, kinds, search, onApply, onClose }) {
  const { t } = useAppText('explore');
  const titleId = useId();
  const [draft, setDraft] = useState(filters);
  const open = !!section;
  const all = section === 'all';
  const instant = section === 'sort' || section === 'kind';
  const { count, waiting, failed } = useMatchCount(open && !instant ? searchArgs(search, draft) : null);
  const cur = priceCurrency(draft);

  const change = (patch) => setDraft((d) => {
    const next = { ...d, ...patch };
    // Another currency: the amounts typed were in the old one.
    if (priceCurrency(next) !== priceCurrency(d)) Object.assign(next, { min: '', max: '' });
    return next;
  });
  const pick = (patch) => {
    if (instant) { onApply({ ...filters, ...patch }); onClose(); } else change(patch);
  };
  const toggleDeal = (key) => change({ deal: draft.deal.includes(key) ? draft.deal.filter((d) => d !== key) : [...draft.deal, key] });
  const reset = () => {
    if (all) setDraft(searchFilters('all', draft.currency));
    else if (section === 'deal') change({ deal: [] });
    else if (section === 'location') change({ country: null });
    else change({ min: '', max: '' });
  };
  const apply = () => { onApply(draft); onClose(); };

  const title = { all: t('Filters'), sort: t('Sort by'), kind: t('Category'), deal: t('Deal method'), location: t('Location'), price: t('Price') }[section] || '';
  const show = (part) => all || section === part;
  const showLabel = failed ? t('Show results')
    : count == null ? t('Show results')
      : count === 0 ? t('No matches')
        : count === 1 ? t('Show 1 result') : t('Show {count} results', { count });

  const footer = instant ? null : (
    <div className="flex gap-2.5">
      <button type="button" onClick={reset} className="h-12 px-5 rounded-full border border-slate-200 text-[15px] font-semibold text-slate-700 hover:bg-slate-50">
        {all ? t('Reset') : t('Clear')}
      </button>
      <button
        type="button"
        onClick={apply}
        data-testid="explore-filter-apply"
        className={`flex-1 h-12 rounded-full text-[15px] font-bold inline-flex items-center justify-center gap-2 ${count === 0 && !waiting ? 'bg-slate-200 text-slate-600' : 'text-white'}`}
        style={count === 0 && !waiting ? undefined : { background: GRADIENT }}
      >
        {waiting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {showLabel}
      </button>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy={titleId} footer={footer}>
      <div className="flex items-center">
        <h2 id={titleId} className="flex-1 text-[17px] font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label={t('Close')} className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-50">
          <X className="w-5 h-5" />
        </button>
      </div>

      {show('sort') && (
        <Section title={all ? t('Sort by') : null} first>
          <div role="radiogroup" aria-label={t('Sort by')}>
            {SEARCH_SORTS.map(({ key, label }) => {
              const on = draft.sort === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick({ sort: key })}
                  className="w-full min-h-[46px] flex items-center justify-between gap-3 border-b border-slate-100 text-left text-[15px] text-slate-900"
                >
                  <span>{t(label)}</span>
                  <span aria-hidden="true" className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'border-[rgb(var(--color-primary,59_130_246))]' : 'border-slate-300'}`}>
                    {on && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--color-primary, 59 130 246))' }} />}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {show('kind') && (
        <Section title={all ? t('Category') : null} first={!all}>
          <div role="radiogroup" aria-label={t('Category')} className="flex flex-wrap gap-2">
            {kinds.map(({ key, label }) => (
              <Pill key={key} role="radio" aria-checked={draft.kind === key} on={draft.kind === key} onClick={() => pick({ kind: key })}>{t(label)}</Pill>
            ))}
          </div>
        </Section>
      )}

      {show('deal') && (
        <Section title={all ? t('Deal method') : null} first={!all}>
          <div className="flex flex-wrap gap-2">
            {DEAL_METHODS.map(({ key, label }) => {
              const on = draft.deal.includes(key);
              const Icon = key === 'meetup' ? Handshake : Truck;
              return (
                <Pill key={key} aria-pressed={on} on={on} onClick={() => toggleDeal(key)}>
                  {on ? <Check className="w-4 h-4" aria-hidden="true" /> : <Icon className="w-4 h-4" aria-hidden="true" />}
                  {t(label)}
                </Pill>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{t('Meet-up: you collect it from the seller. Delivery: the seller sends it to you.')}</p>
        </Section>
      )}

      {show('location') && (
        <Section title={all ? t('Location') : null} first={!all}>
          <div role="radiogroup" aria-label={t('Location')} className="flex flex-wrap gap-2">
            {SEARCH_COUNTRIES.map(({ key, label }) => (
              <Pill key={key || 'all'} role="radio" aria-checked={draft.country === key} on={draft.country === key} onClick={() => change({ country: key })}>{t(label)}</Pill>
            ))}
          </div>
        </Section>
      )}

      {show('price') && (
        <Section title={all ? t('Price') : null} first={!all}>
          <div className="flex items-center gap-2.5">
            <PriceBox label={t('Lowest price')} placeholder={t('Min')} value={draft.min} currency={cur} onChange={(min) => change({ min })} />
            <span aria-hidden="true" className="text-slate-400">–</span>
            <PriceBox label={t('Highest price')} placeholder={t('Max')} value={draft.max} currency={cur} onChange={(max) => change({ max })} />
          </div>
          {!draft.country && (
            <div role="radiogroup" aria-label={t('Currency')} className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-slate-600 mr-0.5">{t('Currency')}</span>
              {SEARCH_CURRENCIES.map((c) => (
                <Pill key={c} role="radio" aria-checked={draft.currency === c} on={draft.currency === c} onClick={() => change({ currency: c })}>{currencyPrefix(c)}</Pill>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{t('With a price set, only listings priced in {currency} show.', { currency: currencyPrefix(cur) })}</p>
        </Section>
      )}
    </BottomSheet>
  );
}
