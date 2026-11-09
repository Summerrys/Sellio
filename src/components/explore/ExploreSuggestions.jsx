import React, { useEffect, useState } from 'react';
import { Search, Store } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

// Suggestions while typing in Explore's search (Alvin, 10 Nov 2026: "Dum > words that have dum
// will be suggested, nas > nasi lemak"). From the second letter, Sellio's server
// (explore_complete) offers up to six: searches ("dumplings", "pork prawn dumplings") and shops
// ("Beijing Dumplings", which open the shop). The chosen kind (Food, Home…) goes along.

export const SUGGEST_FROM = 2; // letters typed
const WAIT_MS = 120; // after the last key, before asking

export async function exploreComplete(search, kind) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('explore_complete', { p_search: search, p_kind: kind });
  if (error) throw error;
  return Array.isArray(data) ? data.filter((s) => s && typeof s.text === 'string' && (s.type === 'search' || (s.type === 'shop' && s.slug))) : [];
}

const fold = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Where what's typed sits in a suggestion: at its start, or at the start of a later word.
export function typedAt(text, typed) {
  const t = fold(typed);
  if (!t) return -1;
  const lower = String(text || '').toLowerCase();
  if (lower.startsWith(t)) return 0;
  const later = lower.indexOf(` ${t}`);
  return later === -1 ? -1 : later + 1;
}

// The suggestions for what's typed now. While the next answer is on its way, the last ones that
// still fit what's typed stay (so the list narrows as you type instead of flickering).
export function useExploreSuggestions(query, kind, enabled) {
  const [answer, setAnswer] = useState({ for: '', kind: null, items: [] });
  const typed = fold(query);
  useEffect(() => {
    if (!enabled || typed.length < SUGGEST_FROM) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      exploreComplete(typed, kind)
        .then((items) => { if (alive) setAnswer({ for: typed, kind, items }); })
        .catch(() => { if (alive) setAnswer({ for: typed, kind, items: [] }); });
    }, WAIT_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [typed, kind, enabled]);
  if (!enabled || typed.length < SUGGEST_FROM || answer.kind !== kind) return [];
  if (answer.for === typed) return answer.items;
  return typed.startsWith(answer.for) ? answer.items.filter((s) => typedAt(s.text, typed) !== -1) : [];
}

function Marked({ text, typed }) {
  const at = typedAt(text, typed);
  if (at === -1) return <b className="font-extrabold">{text}</b>;
  const end = at + fold(typed).length;
  return (
    <>
      {at > 0 && <b className="font-extrabold">{text.slice(0, at)}</b>}
      <span className="font-normal text-slate-600">{text.slice(at, end)}</span>
      {end < text.length && <b className="font-extrabold">{text.slice(end)}</b>}
    </>
  );
}

// The list under the search box. Taps don't take the focus from the box (onMouseDown), so the
// keyboard stays up until something is picked.
export function SuggestionList({ id, items, typed, active, onPick, onHover }) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Suggestions"
      data-testid="explore-suggestions"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-3 right-3 sm:left-4 sm:right-4 top-full -mt-1 z-[3] bg-white rounded-[14px] overflow-hidden"
      style={{ boxShadow: '0 16px 36px -10px rgba(15,23,42,0.3), 0 0 0 1px #eef1f5' }}
    >
      {items.map((s, i) => (
        <button
          key={`${s.type}:${s.slug || s.text}`}
          id={`${id}-${i}`}
          type="button"
          role="option"
          aria-selected={i === active}
          onClick={() => onPick(s)}
          onMouseEnter={() => onHover?.(i)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[14.5px] text-slate-900 border-b border-slate-50 last:border-b-0 ${i === active ? 'bg-slate-50' : 'bg-white'}`}
        >
          <span
            aria-hidden="true"
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${s.type === 'shop' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}
          >
            {s.type === 'shop' ? <Store className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
          </span>
          <span className="min-w-0 flex-1 truncate"><Marked text={s.text} typed={typed} /></span>
          {s.type === 'shop' && <span className="text-[11px] font-semibold text-slate-400 flex-shrink-0">{' '}Shop</span>}
        </button>
      ))}
    </div>
  );
}

// The keys in the search box: ↓/↑ move through the list, Enter picks (or searches what's typed),
// Escape closes the list.
export function useSuggestionKeys(items, { onPick, onSubmit, onClose }) {
  const [active, setActive] = useState(-1);
  // A different list: nothing picked. (The same list again, as a new array: as it was.)
  const list = items.map((s) => `${s.type}:${s.slug || s.text}`).join('|');
  useEffect(() => { setActive(-1); }, [list]);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) onPick(items[active]);
      else onSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };
  return { active, setActive, onKeyDown };
}
