import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { DidYouMean } from '@/components/ui-custom/NoMatches';
import { BRAND_GRADIENT } from '@/components/explore/shared';

// A search on Explore that found nothing (UX states, 6; Alvin approved it, 9 Nov 2026). The
// listings live on Sellio's server, so explore_suggest finds there the likely spelling ("Did you
// mean nasi lemak?": one tap searches for it) and popular listings to try. kind: the chip that's
// on (Food, Home, Merchants…), or null for everything.
export async function exploreSuggest(search, kind = null) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('explore_suggest', { p_search: search, p_kind: kind });
  if (error) throw error;
  const suggestion = typeof data?.suggestion === 'string' && data.suggestion.trim() ? data.suggestion.trim() : null;
  const popular = Array.isArray(data?.popular)
    ? data.popular.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
    : [];
  return { suggestion, popular };
}

export default function ExploreNoResults({ search, kind = null, onSearch, onShowAll }) {
  const [hint, setHint] = useState({ for: null, suggestion: null, popular: [] });

  useEffect(() => {
    let alive = true;
    exploreSuggest(search, kind)
      .then((found) => { if (alive) setHint({ for: `${kind}|${search}`, ...found }); })
      .catch(() => { if (alive) setHint({ for: `${kind}|${search}`, suggestion: null, popular: [] }); });
    return () => { alive = false; };
  }, [search, kind]);

  const ready = hint.for === `${kind}|${search}`;
  const suggestion = ready ? hint.suggestion : null;
  const popular = ready ? hint.popular.filter((name) => name.toLowerCase() !== search.toLowerCase()).slice(0, 5) : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 px-4 py-8 text-center" data-testid="explore-no-results">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
        <Search className="w-6 h-6" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900 break-words">No results for “{search}”</p>
      <p className="mt-1 text-sm text-slate-500 min-h-[20px]" aria-live="polite">
        {!ready ? ' ' : suggestion
          ? <DidYouMean suggestion={suggestion} onPick={onSearch} />
          : 'Check the spelling, or try fewer words.'}
      </p>

      {popular.length > 0 && (
        <div className="mt-5" data-testid="explore-popular">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Popular on Sellio</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {popular.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSearch(name)}
                className="h-8 max-w-[220px] truncate px-3 rounded-full border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        {suggestion && (
          <button
            type="button"
            onClick={() => onSearch(suggestion)}
            data-testid="explore-search-suggestion"
            className="h-11 max-w-full truncate px-6 rounded-full text-sm font-semibold text-white active:scale-95 transition-transform"
            style={{ background: BRAND_GRADIENT }}
          >
            Search “{suggestion}”
          </button>
        )}
        <button
          type="button"
          onClick={onShowAll}
          className="h-10 px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Show everything
        </button>
      </div>
    </div>
  );
}
