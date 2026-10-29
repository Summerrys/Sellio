import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { mapLinkProps, placeWithCountry } from '@/lib/nativeApp';

// An address on Google's map, so its owner can check the pin (Settings: the store address,
// and a home seller's collection address). It follows the address as it's typed (a moment
// after typing stops), once it's long enough to find; the country is added when the
// address doesn't say it. Open in Maps opens the same place (the phone's Maps app in
// Sellio's Android app).
export default function AddressMap({ address, country, title, hint, testId }) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const text = String(address || '').trim();
    const timer = setTimeout(() => setQuery(text.length >= 6 ? text : ''), 700);
    return () => clearTimeout(timer);
  }, [address]);
  if (!query) return null;
  const place = placeWithCountry(query, country);
  return (
    <div className="space-y-1.5" data-testid={testId}>
      {/* A new frame for each place (key): changing a frame's address adds a history entry, so
          Back would step through old maps on this screen, and the Android app's Back couldn't be
          re-armed; a new frame's first page adds none. */}
      <iframe
        key={place}
        title={title}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=16&output=embed`}
        loading="lazy"
        className="block w-full h-44 rounded-lg border border-slate-200 bg-slate-100"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-slate-500 leading-snug">{hint}</p>
        <a {...mapLinkProps(place)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap inline-flex items-center gap-1" data-testid={`${testId}-open`}>
          Open in Maps <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
