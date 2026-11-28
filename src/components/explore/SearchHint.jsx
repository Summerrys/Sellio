import React, { useEffect, useState } from 'react';

// Explore's search bar shows the visitor's past searches (lib/recentSearches.js), newest first,
// rolling up to the next one every 3 seconds, as Taobao's bar does (Alvin, 28 Nov 2026: "the
// searchbar with flipping of past searches"). The search button then searches the words showing
// (pages/Explore.jsx); tapping the bar opens the search as before. With nothing searched yet the
// bar reads "Search for an item or shop". With the phone set to reduce motion the words still
// change, without the roll.
export const HINT_EVERY = 3000;

const reduceMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

// The past search showing: the newest, then the next every HINT_EVERY ms while `running`, back to
// the newest whenever the list changes (a search just made comes first). It waits while the page
// is hidden (another tab, the app in the background).
export function useFlippingHint(items, running) {
  const list = Array.isArray(items) ? items : [];
  const key = list.join('\u0000');
  const [at, setAt] = useState({ key, index: 0 });
  const index = at.key === key ? at.index : 0;
  useEffect(() => {
    if (!running || list.length < 2) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setAt((was) => ({ key, index: ((was.key === key ? was.index : 0) + 1) % list.length }));
    }, HINT_EVERY);
    return () => clearInterval(timer);
  }, [running, key, list.length]);
  return running ? (list[index % Math.max(list.length, 1)] || '') : '';
}

// The words over the empty search box (the box's own placeholder is blank meanwhile). Each new one
// rolls up from below as the last rolls away above. Only for the eye: the search button's label
// says what it will search.
export function FlippingHint({ text }) {
  const [shown, setShown] = useState({ text, prev: null, n: 0 });
  if (shown.text !== text) setShown({ text, prev: shown.text, n: shown.n + 1 });
  const rolling = shown.n > 0 && !reduceMotion();
  return (
    <span aria-hidden="true" data-testid="explore-search-hint" className="pointer-events-none absolute inset-y-0 left-4 right-1 overflow-hidden text-[15px] text-slate-600">
      {rolling && shown.prev != null && (
        <span key={`out-${shown.n}`} className="sellio-hint-out absolute inset-0 truncate leading-[38px]">{shown.prev}</span>
      )}
      <span key={`in-${shown.n}`} data-testid="explore-search-hint-text" className={`${rolling ? 'sellio-hint-in ' : ''}absolute inset-0 truncate leading-[38px]`}>{shown.text}</span>
    </span>
  );
}
