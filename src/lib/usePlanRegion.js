import { useState } from 'react';
import { visitorCountry } from './countries';
import { planRegionFor } from './plans';

// Which plan prices a screen shows (lib/plans.js): a shop's own country decides; with no shop
// (the landing page, sign-up, an account without a business yet) the visitor's phone or computer
// does (visitorCountry). The landing page's built HTML has no visitor, so it shows the Singapore
// prices; the browser's first render shows the visitor's.
export function usePlanRegion(shop = null) {
  const [visitor] = useState(() => (typeof window === 'undefined' ? null : visitorCountry()));
  return planRegionFor(shop || { country: visitor });
}
