import React, { useId } from 'react';
import { Check, Globe, MapPin, X } from 'lucide-react';
import { useAppText } from '@/lib/appText';
import { countryNamed } from '@/lib/countries';
import { SEARCH_COUNTRIES } from '@/lib/exploreSearch';
import BottomSheet from './BottomSheet';
import { BRAND_COLOR } from './shared';

// Explore's location pin (Alvin, 28 Nov 2026, after Taobao's: "a location icon that you can click
// and immediately choose a country"; "the location icon can place it at the left side of the
// searchbar"; "The pin should be outside of the search bar but at the left side"). It sits just
// left of the search bar, as the cart sits right of it. A tap opens the countries, and a tap on
// one shows Explore in it at once: the
// listings, the shops and the merchants of that country, and searches start there
// (lib/exploreSearch.js keeps the pick on the device). Every country is the default. With one
// picked, its code (SG, MY, ID) shows beside the pin.

const countryLabel = (key) => SEARCH_COUNTRIES.find((c) => c.key === key)?.label || SEARCH_COUNTRIES[0].label;

export function LocationPin({ country, onOpen }) {
  const { t } = useAppText('explore');
  const code = countryNamed(country)?.code;
  // A 44px tap area, overhanging the row's padding as the cart's does, so the row keeps its height.
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t('Location: {place}', { place: t(countryLabel(country)) })}
      data-testid="explore-location"
      className="flex-shrink-0 h-11 min-w-[36px] -my-[3px] -ml-1.5 px-1 rounded-md inline-flex items-center justify-center gap-[2px] text-[13px] font-bold text-slate-800 hover:bg-white/60 active:opacity-70"
    >
      <MapPin className="w-[22px] h-[22px]" style={{ color: BRAND_COLOR }} strokeWidth={2.3} aria-hidden="true" />
      {code && <span data-testid="explore-location-code">{code}</span>}
    </button>
  );
}

export function LocationSheet({ open, country, onPick, onClose }) {
  const { t } = useAppText('explore');
  const titleId = useId();
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex items-center">
        <h2 id={titleId} className="flex-1 text-[17px] font-bold text-slate-900">{t('Location')}</h2>
        <button type="button" onClick={onClose} aria-label={t('Close')} className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-50">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div role="radiogroup" aria-labelledby={titleId} data-testid="explore-location-sheet">
        {SEARCH_COUNTRIES.map(({ key, label }) => {
          const on = country === key;
          const code = countryNamed(key)?.code;
          return (
            <button
              key={key || 'all'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { onPick(key); onClose(); }}
              className="w-full min-h-[52px] flex items-center gap-3 border-b border-slate-100 last:border-b-0 text-left text-[15px] text-slate-900"
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                style={on ? { background: 'rgb(var(--color-primary, 59 130 246) / 0.12)', color: BRAND_COLOR } : { background: '#f1f5f9', color: '#475569' }}
              >
                {code || <Globe className="w-[18px] h-[18px]" />}
              </span>
              <span className={`flex-1 ${on ? 'font-semibold' : ''}`}>{t(label)}</span>
              {on && <Check className="w-5 h-5 flex-shrink-0" style={{ color: BRAND_COLOR }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{t('Explore shows listings from shops in the country you pick, and your searches start there.')}</p>
    </BottomSheet>
  );
}
