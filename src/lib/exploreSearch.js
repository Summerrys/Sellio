// Explore's search filters, step 1 (Alvin, 26 Nov 2026: "two steps … Meet-up. Search can be all."):
// sort, category, deal method, country and price, as explore_search takes them
// (supabase/migrations/20261127231518_explore_search.sql). Step 2 adds item condition and Nearby
// (from a list of towns), once listings carry them.
//
// A search covers every country unless one is picked. A price range is in one currency (the
// picked country's, else the buyer's) and matches only listings priced in it: S$10 and RM10 are
// not the same money, and nothing converts between them.
import { N_ } from './appText';
import { currencyPrefix, currencyDecimals } from './money';
import { COUNTRIES, countryNamed, visitorCountry } from './countries';
import { isNativeApp } from './nativeApp';
import { SELLIO_SITE } from './accountFlow';

export const SEARCH_SORTS = [
  { key: 'best', label: N_('Best match') },
  { key: 'recent', label: N_('Recent') },
  { key: 'price_desc', label: N_('Price: high to low') },
  { key: 'price_asc', label: N_('Price: low to high') },
];

// Meet-up is a home shop's self-collection and a business's takeaway; delivery, a home shop's.
export const DEAL_METHODS = [
  { key: 'meetup', label: N_('Meet-up') },
  { key: 'delivery', label: N_('Delivery') },
];

// The countries' names as tenants.country has them.
export const SEARCH_COUNTRIES = [
  { key: null, label: N_('All countries') },
  { key: 'Singapore', label: N_('Singapore') },
  { key: 'Malaysia', label: N_('Malaysia') },
  { key: 'Indonesia', label: N_('Indonesia') },
];

export const SEARCH_CURRENCIES = ['SGD', 'MYR', 'IDR'];

// The buyer's currency until they pick another: where the phone is (its time zone), else S$.
export function defaultSearchCurrency() {
  return countryNamed(visitorCountry())?.currency || 'SGD';
}

// kind: the category picked on Explore before searching (it carries over, and can be cleared);
// country: the country Explore shows (its location pin), which a search starts in.
export function searchFilters(kind = 'all', currency = defaultSearchCurrency(), country = null) {
  return { sort: 'best', kind, deal: [], country, currency, min: '', max: '' };
}

// The country Explore shows (its location pin; Alvin, 28 Nov 2026, after Taobao's: "a location
// icon that you can click and immediately choose a country"; later that day: "make it detect where
// the location is and immediately show that location items"). Kept on this phone or computer:
//   nothing kept   'auto'   where the visitor is (detectExploreCountry), the default; every
//                           country when that isn't one of Sellio's or can't be told
//   'all'                   every country
//   'Malaysia', …           that country (SEARCH_COUNTRIES' names)
const COUNTRY_KEY = 'sellio:explore:country';

export function loadExploreCountry() {
  try {
    const saved = window.localStorage.getItem(COUNTRY_KEY);
    if (saved === 'all') return 'all';
    return SEARCH_COUNTRIES.some((country) => country.key && country.key === saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveExploreCountry(choice) {
  try {
    if (choice && choice !== 'auto') window.localStorage.setItem(COUNTRY_KEY, choice);
    else window.localStorage.removeItem(COUNTRY_KEY);
  } catch { /* no storage: the pick lasts until the page is closed */ }
}

// Where the visitor is: the country their internet connection comes from, as Sellio's website
// sees it (public/_worker.js answers /api/country from Cloudflare; no location permission is
// asked, and a VPN shows the VPN's country). One of SEARCH_COUNTRIES' names; null for anywhere
// else; undefined when it couldn't be asked (offline, no answer within the time). Each answer is
// kept on the device (keptDetectedCountry), so Explore opens in it at once next time while it asks
// again.
const DETECTED_KEY = 'sellio:explore:detected';
const ourCountry = (name) => (SEARCH_COUNTRIES.some((country) => country.key && country.key === name) ? name : null);

export function keptDetectedCountry() {
  try {
    const kept = JSON.parse(window.localStorage.getItem(DETECTED_KEY) || 'null');
    return kept && typeof kept === 'object' && 'country' in kept ? ourCountry(kept.country) : undefined;
  } catch {
    return undefined;
  }
}

export async function detectExploreCountry({ timeoutMs = 3000 } = {}) {
  const stop = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => stop?.abort(), timeoutMs);
  try {
    const address = isNativeApp() ? `${SELLIO_SITE}/api/country` : '/api/country';
    const response = await fetch(address, { cache: 'no-store', signal: stop?.signal });
    if (!response.ok) return undefined;
    const { country: code } = await response.json();
    const country = ourCountry(COUNTRIES.find((c) => c.code === code)?.name);
    try {
      window.localStorage.setItem(DETECTED_KEY, JSON.stringify({ country, at: Date.now() }));
    } catch { /* no storage: asked again next time */ }
    return country;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// The currency a price range is in: the picked country's, else the buyer's.
export function priceCurrency(filters) {
  return countryNamed(filters.country)?.currency || filters.currency || 'SGD';
}

// What was typed in a price box, as a number (null: nothing, or not a price). Rupiah has no
// cents, so "15.000" is fifteen thousand; S$ and RM take "5.50", and "1,000" is a thousand.
export function readPrice(text, currency) {
  const raw = String(text ?? '').trim();
  if (!/\d/.test(raw)) return null;
  const value = currencyDecimals(currency) === 0
    ? Number(raw.replace(/[^\d]/g, ''))
    : Number(raw.replace(/,/g, '').replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// A price for a chip: S$10, S$5.50, RM12, Rp15.000.
export function shortPrice(value, currency) {
  if (value == null) return '';
  const prefix = currencyPrefix(currency);
  if (currencyDecimals(currency) === 0) return `${prefix}${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  return `${prefix}${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

// The price range as numbers, lowest first (someone who types them the wrong way round means
// the same range).
export function priceRange(filters) {
  const currency = priceCurrency(filters);
  let min = readPrice(filters.min, currency);
  let max = readPrice(filters.max, currency);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min, max, currency };
}

// How many filters are on (the Filters chip's number). The sort isn't a filter.
export function activeFilterCount(filters) {
  const { min, max } = priceRange(filters);
  return (filters.kind !== 'all' ? 1 : 0) + (filters.deal.length ? 1 : 0) + (filters.country ? 1 : 0) + (min != null || max != null ? 1 : 0);
}

// explore_search's arguments for a search and its filters.
export function searchArgs(search, filters) {
  const { min, max, currency } = priceRange(filters);
  return {
    p_search: search || null,
    p_kind: filters.kind === 'all' ? null : filters.kind,
    p_sort: filters.sort,
    p_deal: filters.deal.length ? filters.deal : null,
    p_country: filters.country || null,
    p_currency: currency,
    p_min: min,
    p_max: max,
  };
}
