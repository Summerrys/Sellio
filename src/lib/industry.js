import { UtensilsCrossed, ShoppingBag, Wrench } from 'lucide-react';

// Single source of truth for industry selection — used by onboarding (Step1Combined)
// and Settings > Business (BusinessProfileTab) so both render the exact same options,
// labels, and "Coming Soon" locks instead of two independently-maintained lists.
// 'f&b' is the canonical stored value going forward (see normalizeIndustry below for
// why older tenants may still have 'food' stored, and how that's reconciled).
export const INDUSTRY_OPTIONS = [
  { value: 'f&b', label: 'F&B / Cafe / Restaurant', Icon: UtensilsCrossed, color: 'text-orange-500' },
  { value: 'retail', label: 'Retail', Icon: ShoppingBag, color: 'text-blue-500', disabled: true },
  { value: 'service', label: 'Service', Icon: Wrench, color: 'text-green-500', disabled: true },
];

// Normalizes any historical/free-text industry value into one of our 3 canonical
// keys ('f&b' | 'retail' | 'service'). Needed because:
//  - Onboarding used to store the raw value 'food' (now fixed to store 'f&b'
//    directly), so existing tenants created before this fix still have 'food'.
//  - The industry field has at various points accepted loosely-related keywords
//    (cafe, restaurant, beverage, bar, fashion, electronics, beauty, etc.) rather
//    than only the 3 canonical values.
// Returns '' for empty input, or the original raw value unchanged if nothing matches
// (so an unrecognized value doesn't just silently disappear).
export function normalizeIndustry(raw) {
  if (!raw) return '';
  const lower = String(raw).toLowerCase();
  if (/f.?b|cafe|restaurant|food|beverage|bar/.test(lower)) return 'f&b';
  if (/retail|fashion|electronics/.test(lower)) return 'retail';
  if (/service|beauty|wellness|health|education/.test(lower)) return 'service';
  if (['f&b', 'retail', 'service'].includes(lower)) return lower;
  return raw;
}

// Single canonical "is this tenant an F&B business" check — replaces 4 previously
// separate, slightly-different regexes (Onboarding.jsx, Storefront.jsx,
// UserManagement.jsx, Layout.jsx) that could drift out of sync with each other.
export function isFnBIndustry(raw) {
  return normalizeIndustry(raw) === 'f&b';
}
