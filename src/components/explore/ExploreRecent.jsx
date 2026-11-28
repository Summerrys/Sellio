import React from 'react';
import { Trash2 } from 'lucide-react';
import { useAppText } from '@/lib/appText';

// Recent searches, at the top of Explore's search while the search box is empty (Alvin, 28 Nov
// 2026, after Taobao's search page), above the recommended listings. A tap searches again; the bin
// clears them all. They are kept on the device (lib/recentSearches.js).
export default function ExploreRecent({ searches, onPick, onClear }) {
  const { t } = useAppText('explore');
  if (!searches.length) return null;
  return (
    <section aria-labelledby="explore-recent-heading" data-testid="explore-recent" className="pt-3 mb-4">
      <div className="flex items-center justify-between gap-2 px-1 sm:px-0">
        <h2 id="explore-recent-heading" className="text-[15px] font-bold text-slate-900">{t('Recent searches')}</h2>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('Clear recent searches')}
          title={t('Clear recent searches')}
          data-testid="explore-recent-clear"
          className="w-10 h-10 -my-2 -mr-2 rounded-full inline-flex items-center justify-center text-slate-500 hover:bg-black/5"
        >
          <Trash2 className="w-[18px] h-[18px]" />
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 px-1 sm:px-0">
        {searches.map((text) => (
          <li key={text} className="max-w-full">
            <button
              type="button"
              onClick={() => onPick(text)}
              className="max-w-full h-8 px-3.5 rounded-full bg-white text-[13.5px] text-slate-700 truncate hover:bg-slate-50"
              style={{ boxShadow: '0 0 0 1px rgba(15,23,42,0.06)' }}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
