import React, { useId, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { House, ShoppingBag, Store } from 'lucide-react';
import { isNativeApp } from '@/lib/nativeApp';
import { useAppText } from '@/lib/appText';

// The logo without the empty space around it (public/branding/sellio-logo.webp, trimmed), so it
// fills the sign.
const SIGN_LOGO = '/branding/sellio-logo-sign.webp';

// The top of the free sign-up's first screen (Alvin, 17 Nov 2026, the mockup's "J"): a striped
// awning across the card; under it a little stall with a steaming bowl, a cupcake and a jar on a
// centred counter, "Sell from home" and "Run your business" stuck on the counter's front; the
// Sellio sign swinging on the left (it goes home, as the logo did); a phone ticking off an order
// beside the stall; and "Open your shop on Sellio" with a FREE! sticker. No emoji: drawn icons.
// The styles and motion are in index.css (.join-stall); a phone set to reduce motion keeps it
// still. The card around it has no top padding, so the awning sits on its top edge.
// The login page has the same stall (Alvin, 17 Nov 2026): without the two stickers
// (stickers={false}), and its own heading in place of "Open your shop on Sellio" (children).
export default function JoinStall({ stickers: showStickers = true, children = null }) {
  const { t, language } = useAppText();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const stickers = useRef(null);

  // The two stickers stay on the counter in every language: longer words make them a little
  // smaller rather than spill past its ends.
  useLayoutEffect(() => {
    const row = stickers.current;
    if (!row || !showStickers) return undefined;
    const fit = () => {
      row.style.setProperty('--fit', '1');
      const items = [...row.children];
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const need = items.reduce((width, item) => width + item.offsetWidth, 0) + gap * Math.max(0, items.length - 1);
      const room = row.clientWidth;
      if (need > room && room > 0) row.style.setProperty('--fit', String(Math.max(0.7, (room / need) * 0.98)));
    };
    fit();
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    watch?.observe(row);
    return () => watch?.disconnect();
  }, [language, showStickers]);

  const free = t('FREE!');
  const sign = (
    <>
      <svg viewBox="0 0 64 16" aria-hidden="true">
        <path d="M12 16 L32 4 L52 16" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="4" r="3.2" fill="#94a3b8" />
      </svg>
      <img src={SIGN_LOGO} alt="" draggable="false" />
    </>
  );
  const signClass = 'join-stall-sign focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';

  return (
    <div className="join-stall -mx-8 mb-[18px]" data-testid="join-stall">
      <div className="join-stall-awning" aria-hidden="true" />
      <div className="join-stall-scene">
        <svg viewBox="0 0 358 142" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-brand`} gradientUnits="userSpaceOnUse" x1="54" y1="0" x2="304" y2="0">
              <stop offset="0" stopColor="#fb923c" /><stop offset=".5" stopColor="#e0449a" /><stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id={`${id}-inside`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1e6" /><stop offset="1" stopColor="#fff7f0" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${id}-counter`}><rect x="54" y="100" width="250" height="34" rx="9" /></clipPath>
            <filter id={`${id}-shadow`} x="-20%" y="-30%" width="140%" height="170%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity=".16" />
            </filter>
          </defs>
          <rect x="67" y="0" width="224" height="102" fill={`url(#${id}-inside)`} />
          <rect x="60" y="0" width="7" height="104" rx="2" fill="#e2e8f0" />
          <rect x="291" y="0" width="7" height="104" rx="2" fill="#e2e8f0" />
          <ellipse cx="200" cy="138" rx="152" ry="3.5" fill="#0f172a" opacity=".07" />
          <rect x="54" y="100" width="250" height="34" rx="9" fill="#fff" stroke="#eef2f6" strokeWidth="2" />
          <rect x="54" y="122" width="250" height="12" fill={`url(#${id}-brand)`} clipPath={`url(#${id}-counter)`} opacity=".92" />
          {/* A steaming bowl, a cupcake and a jar, in the middle of the counter. */}
          <path d="M114 82 a23 18 0 0 0 46 0 z" fill="#fb923c" />
          <ellipse cx="137" cy="82" rx="23" ry="4.5" fill="#fed7aa" />
          <path className="join-stall-steam" d="M128 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <path className="join-stall-steam s2" d="M137 72 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <path className="join-stall-steam s3" d="M146 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <path d="M170 100 L175 81 L196 81 L201 100 Z" fill="#f472b6" />
          <path d="M179 82 V99 M185.5 82 V99 M192 82 V99" stroke="#fff" strokeOpacity=".5" strokeWidth="1.8" />
          <circle cx="178" cy="77" r="7.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <circle cx="193" cy="77" r="7.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <circle cx="185.5" cy="72" r="9.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <path d="M185.5 60 q1.3 -6 6.5 -7.5" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="185.5" cy="62.5" r="4" fill="#ef4444" />
          <rect x="213.5" y="72" width="28" height="28" rx="6" fill="#ddd6fe" />
          <rect x="211" y="66" width="33" height="8.5" rx="3" fill="#8b5cf6" />
          <rect x="218.5" y="81" width="18" height="10" rx="2.5" fill="#fff" />
          {/* The phone beside the stall, ticking off an order, and its "+1". */}
          <g transform="rotate(8 330 98)">
            <rect x="310" y="62" width="40" height="72" rx="8.5" fill="#1e293b" />
            <rect x="313.5" y="67.5" width="33" height="61" rx="5.5" fill="#fff" />
            <rect x="317" y="73" width="19" height="4" rx="2" fill="#e2e8f0" />
            <rect x="317" y="81" width="26" height="3" rx="1.5" fill="#f1f5f9" />
            <circle cx="330" cy="106" r="10" fill="#10b981" />
            <path className="join-stall-tick" d="M324.8 106 l4 4 l7.5 -7.5" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className="join-stall-bubble">
            <rect x="262" y="30" width="58" height="23" rx="11.5" fill="#fff" filter={`url(#${id}-shadow)`} />
            <ShoppingBag x={273} y={35.5} width={12.5} height={12.5} color="#ea580c" strokeWidth={2.4} />
            <text x="299" y="45.8" textAnchor="middle" fontSize="12" fontWeight="800" fill="#ea580c" fontFamily="Inter, system-ui, sans-serif">+1</text>
          </g>
          <g transform="translate(110 30)"><path className="join-stall-spark" d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" fill="#fbbf24" /></g>
          <g transform="translate(346 28)"><path className="join-stall-spark k2" d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill="#f472b6" /></g>
          <g transform="translate(24 98)"><path className="join-stall-spark k3" d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" fill="#a78bfa" /></g>
          <g transform="translate(232 46)"><path className="join-stall-spark k4" d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" fill="#fbbf24" /></g>
        </svg>
        {/* The Sellio sign: in the app it opens Explore without reloading the app; websites go
            to the home page (as the logo above the form did). */}
        <div className="join-stall-sign-wrap">
          {isNativeApp() ? (
            <Link to="/explore" className={signClass} aria-label={t('Sellio home')}>{sign}</Link>
          ) : (
            <a href="/" className={signClass} aria-label={t('Sellio home')}>{sign}</a>
          )}
        </div>
        {showStickers && (
          <div ref={stickers} className="join-stall-stickers" data-testid="join-stall-stickers">
            <span className="join-stall-sticker home"><House aria-hidden="true" strokeWidth={2.5} />{t('Sell from home')}</span>
            <span className="join-stall-sticker business"><Store aria-hidden="true" strokeWidth={2.5} />{t('Run your business')}</span>
          </div>
        )}
      </div>
      {children || (
        <div className="join-stall-headline px-8">
          <div className="join-stall-hl">
            <span className="join-stall-free"><span className={`join-stall-burst${free.length > 5 ? ' long' : ''}`}>{free}</span></span>
            <h1>{t('Open your shop on {name}', { name: <span className="join-stall-brand">Sellio</span> })}</h1>
          </div>
        </div>
      )}
    </div>
  );
}
