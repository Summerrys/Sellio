// Explore's recent searches (Alvin, 28 Nov 2026, after Taobao's search page: "it should also show
// the recent searches previously stored together with recommended items"). The last searches made
// on this phone or computer, newest first, shown under the search box while it is empty
// (components/explore/ExploreRecent.jsx). A search counts once it is sent (Enter, the search
// button, a suggestion, a recent search) or once a listing is opened from its results.
//
// They stay on the device, kept apart per account (a guest's apart too), so someone else signing
// in here doesn't see them. Nothing goes to Sellio's server.
import { useCallback, useEffect, useRef, useState } from 'react';

export const RECENT_MAX = 8;
const KEY = 'sellio:explore:recent';
const keyFor = (userId) => `${KEY}:${userId || 'guest'}`;

// A search as it is kept: spaces tidied, at most 60 characters.
export function tidySearch(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function loadRecentSearches(userId) {
  try {
    const list = JSON.parse(window.localStorage.getItem(keyFor(userId)) || '[]');
    return Array.isArray(list) ? list.map(tidySearch).filter(Boolean).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

// The list with this search first: once only (the same words in any case), at most RECENT_MAX.
export function withRecentSearch(list, text) {
  const search = tidySearch(text);
  if (!search) return list;
  const same = search.toLowerCase();
  return [search, ...list.filter((s) => s.toLowerCase() !== same)].slice(0, RECENT_MAX);
}

function saveRecentSearches(userId, list) {
  try {
    if (list.length) window.localStorage.setItem(keyFor(userId), JSON.stringify(list));
    else window.localStorage.removeItem(keyFor(userId));
  } catch { /* no storage: they last until the page is closed */ }
}

export function useRecentSearches(userId) {
  const [recent, setRecent] = useState(() => loadRecentSearches(userId));
  const current = useRef(recent);
  current.current = recent;
  // Another account on this device: its own list.
  useEffect(() => { setRecent(loadRecentSearches(userId)); }, [userId]);
  const remember = useCallback((text) => {
    const next = withRecentSearch(current.current, text);
    if (next === current.current || next.join('\n') === current.current.join('\n')) return;
    current.current = next;
    saveRecentSearches(userId, next);
    setRecent(next);
  }, [userId]);
  const clear = useCallback(() => {
    current.current = [];
    saveRecentSearches(userId, []);
    setRecent([]);
  }, [userId]);
  return { recent, remember, clear };
}
