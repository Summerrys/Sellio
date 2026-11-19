import React, { useId, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { House, ShoppingBag, Store } from 'lucide-react';
import { isNativeApp } from '@/lib/nativeApp';
import { useAppText } from '@/lib/appText';

// The logo without the empty space around it (public/branding/sellio-logo.webp, trimmed), so it
// fills the sign.
const SIGN_LOGO = '/branding/sellio-logo-sign.webp';

// What's on the counter. Each thing is drawn in the stall's flat style and pops up on its own
// (.join-stall-pop) when its set comes round. The first set: a steaming bowl with chopsticks
// (Alvin, 19 Nov 2026), a cupcake and a jar.
const NOW = [
  <g key="bowl" className="join-stall-pop">
    <path d="M114 82 a23 18 0 0 0 46 0 z" fill="#fb923c" />
    <ellipse cx="137" cy="82" rx="23" ry="4.5" fill="#fed7aa" />
    <path className="join-stall-steam" d="M128 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
    <path className="join-stall-steam s2" d="M137 72 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
    <path className="join-stall-steam s3" d="M146 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
    <g className="join-stall-chopsticks" strokeWidth="2.6" strokeLinecap="round">
      <path d="M141 83 L163 58" stroke="#b45309" />
      <path d="M145.5 83.5 L166.5 61.5" stroke="#d97706" />
    </g>
  </g>,
  <g key="cupcake" className="join-stall-pop p2">
    <path d="M170 100 L175 81 L196 81 L201 100 Z" fill="#f472b6" />
    <path d="M179 82 V99 M185.5 82 V99 M192 82 V99" stroke="#fff" strokeOpacity=".5" strokeWidth="1.8" />
    <circle cx="178" cy="77" r="7.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
    <circle cx="193" cy="77" r="7.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
    <circle cx="185.5" cy="72" r="9.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
    <path d="M185.5 60 q1.3 -6 6.5 -7.5" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <circle cx="185.5" cy="62.5" r="4" fill="#ef4444" />
  </g>,
  <g key="jar" className="join-stall-pop p3">
    <rect x="213.5" y="72" width="28" height="28" rx="6" fill="#ddd6fe" />
    <rect x="211" y="66" width="33" height="8.5" rx="3" fill="#8b5cf6" />
    <rect x="218.5" y="81" width="18" height="10" rx="2.5" fill="#fff" />
  </g>,
];

// Each of these is drawn around its own foot (0, 0) and stands on the counter (y 100) at x. The pop
// is on an inner group: a CSS transform would replace the SVG transform on the same element.
function OnCounter({ x, scale = 1, order = 1, children }) {
  return (
    <g transform={scale === 1 ? `translate(${x} 100)` : `translate(${x} 100) scale(${scale})`}>
      <g className={order > 1 ? `join-stall-pop p${order}` : 'join-stall-pop'}>{children}</g>
    </g>
  );
}

// The counter changes every 4 seconds, in step with the phone's order (Alvin, 19 Nov 2026:
// "proceed with the rotating counter"; on Login too, 20 Nov): the bowl's set, home bakes, then handmade things,
// so sellers who don't cook see themselves too. Each set spans the counter as the first does (x 114
// to 244), clear of the sign's swing on a small phone: the loaf is drawn a touch smaller for that.
const BAKES = [
  <OnCounter key="bread" x={134.5} scale={0.9}>
    <path d="M-23 0 V-13 q0 -13 23 -13 q23 0 23 13 V0 z" fill="#f59e0b" />
    <path d="M-20 -14 q0 -9.5 20 -9.5 q20 0 20 9.5" fill="none" stroke="#fcd34d" strokeWidth="3" strokeLinecap="round" />
    <path d="M-11 -20.5 l4.5 4.5 M-1 -22.5 l4.5 4.5 M9 -20.5 l4.5 4.5" stroke="#fde68a" strokeWidth="2.2" strokeLinecap="round" />
    <rect x="-23" y="-4" width="46" height="4" rx="2" fill="#d97706" opacity=".35" />
  </OnCounter>,
  <OnCounter key="cookies" x={178.7} order={2}>
    <rect x="-15" y="-34" width="30" height="34" rx="7" fill="#e0f2fe" />
    <circle cx="-5" cy="-7.5" r="6.4" fill="#d97706" />
    <circle cx="6" cy="-8" r="6.4" fill="#f59e0b" />
    <circle cx="0" cy="-19" r="6.4" fill="#d97706" />
    <circle cx="-6" cy="-28" r="5" fill="#f59e0b" />
    <circle cx="6" cy="-27.5" r="5" fill="#d97706" />
    <g fill="#78350f">
      <circle cx="-6.5" cy="-8.5" r="1.1" /><circle cx="-3" cy="-5.5" r="1.1" /><circle cx="5" cy="-9.5" r="1.1" />
      <circle cx="8" cy="-6.5" r="1.1" /><circle cx="-1.5" cy="-20.5" r="1.1" /><circle cx="2" cy="-17" r="1.1" />
    </g>
    <rect x="-12" y="-30" width="2.6" height="22" rx="1.3" fill="#fff" opacity=".75" />
    <rect x="-13" y="-40.5" width="26" height="7.5" rx="3" fill="#a16207" />
    <rect x="-4" y="-45" width="8" height="5.5" rx="2" fill="#854d0e" />
  </OnCounter>,
  <OnCounter key="cake" x={223.2} order={3}>
    <path d="M-21 0 H21 V-19 L-21 -10 Z" fill="#fde68a" />
    <path d="M-21 -5.5 H21 M-21 -10 L21 -13.5" stroke="#fff" strokeWidth="2.4" />
    <path d="M-21 -10 L21 -19 V-23 L-21 -14 Z" fill="#f9a8d4" />
    <path d="M-21 -14 L21 -23" stroke="#f472b6" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M12 -27 q4 -1 5.5 3 q-1.5 4.5 -5.5 5 q-4 -.5 -5.5 -5 q1.5 -4 5.5 -3 z" fill="#ef4444" />
    <path d="M12 -27.4 l-2 -2.6 M12 -27.4 l2 -2.6" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
  </OnCounter>,
];
const HANDMADE = [
  <OnCounter key="plant" x={139}>
    <path d="M0 -17 C-3 -27 -14 -30 -15 -40 C-6 -38 -1 -30 0 -17 Z" fill="#16a34a" />
    <path d="M0 -17 C3 -28 13 -33 16 -42 C6 -40 1 -31 0 -17 Z" fill="#22c55e" />
    <path d="M0 -17 C-1.5 -30 2 -40 0 -48 C-4 -40 -4 -29 0 -17 Z" fill="#4ade80" />
    <path d="M-12 -14 h24 l-2.6 14 h-18.8 z" fill="#ea580c" />
    <rect x="-14" y="-18" width="28" height="5.5" rx="2" fill="#fb923c" />
  </OnCounter>,
  <OnCounter key="candle" x={178} order={2}>
    <rect x="-12.5" y="-25" width="25" height="25" rx="5" fill="#fde68a" />
    <rect x="-12.5" y="-17" width="25" height="9" fill="#fff" opacity=".9" />
    <path d="M-4 -12.5 h8" stroke="#f472b6" strokeWidth="1.6" strokeLinecap="round" />
    <ellipse cx="0" cy="-25" rx="12.5" ry="2.4" fill="#fef3c7" />
    <path d="M0 -25 v-3.5" stroke="#1e293b" strokeWidth="1.2" />
    <g className="join-stall-flame">
      <path d="M0 -38.5 q5.5 6 0 10 q-5.5 -4 0 -10 z" fill="#fb923c" />
      <path d="M0 -34.5 q2.6 3.2 0 5.4 q-2.6 -2.2 0 -5.4 z" fill="#fde047" />
    </g>
  </OnCounter>,
  <OnCounter key="tote" x={218} order={3}>
    <path d="M-8 -24 q0 -12 8 -12 q8 0 8 12" fill="none" stroke="#c4a27a" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M-17 0 l2 -25 h30 l2 25 z" fill="#f5e6c8" />
    <path d="M-5 -15 a3 3 0 0 1 5 -2 a3 3 0 0 1 5 2 q0 4 -5 7 q-5 -3 -5 -7 z" fill="#f472b6" />
    <path d="M-15 -25 h30" stroke="#e8d3ad" strokeWidth="2" />
  </OnCounter>,
];
const SETS = [['now', NOW], ['bakes', BAKES], ['handmade', HANDMADE]];

// The top of the free sign-up's first screen (Alvin, 17 Nov 2026, the mockup's "J"): a striped
// awning across the card; under it a little stall with a steaming bowl, a cupcake and a jar on a
// centred counter, "Sell from home" and "Run your business" stuck on the counter's front; the
// Sellio sign swinging on the left (it goes home, as the logo did); a phone ticking off an order
// beside the stall; and "Open your shop on Sellio" with a FREE! sticker. No emoji: drawn icons.
// The styles and motion are in index.css (.join-stall); a phone set to reduce motion keeps it
// still. The card around it has no top padding, so the awning sits on its top edge.
// The login page has the same stall (Alvin, 17 Nov 2026): without the two stickers
// (stickers={false}), and its own heading in place of "Open your shop on Sellio" (children). Its
// counter changes every 4 seconds as Sign Up's does (rotate; Alvin, 20 Nov 2026: "Login is not
// rotating"); without rotate the counter keeps the first set.
export default function JoinStall({ stickers: showStickers = true, rotate = false, children = null }) {
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
          {/* What's on the counter, in the middle of it: the first set, or on Sign Up the three in turn. */}
          {rotate
            ? SETS.map(([name, things], i) => (
              <g key={name} className={`join-stall-set n${i + 1}`} data-set={name}>{things}</g>
            ))
            : NOW}
          {/* The phone beside the stall, ticking off an order, and its "+1". */}
          <g className="join-stall-phone" transform="rotate(8 330 98)">
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
