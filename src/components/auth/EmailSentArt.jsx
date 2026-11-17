import React, { useId } from 'react';

// "Check your email" (Alvin, 17 Nov 2026): an envelope with the letter peeking out, its orange
// "Verify my email" button (the email's own button, which is in English), and a green tick that
// pops onto the envelope's corner: the email is sent. Styles and motion: index.css
// (.email-sent-art); still for a phone set to reduce motion.
export default function EmailSentArt({ button = 'Verify my email' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className="email-sent-art" viewBox="0 0 220 128" aria-hidden="true" focusable="false" data-testid="email-sent-art">
      <defs>
        <linearGradient id={`${id}-brand`} x1="0" x2="1">
          <stop offset="0" stopColor="#fb923c" /><stop offset=".5" stopColor="#e0449a" /><stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`${id}-button`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffaa6e" /><stop offset=".5" stopColor="#fe7824" /><stop offset="1" stopColor="#e86a1a" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#4c1d95" floodOpacity=".18" />
        </filter>
      </defs>
      <circle cx="110" cy="70" r="58" fill="#fff7ed" />
      <rect x="48" y="52" width="124" height="70" rx="10" fill="#ede9fe" />
      <path d="M48 58 L110 20 L172 58 Z" fill="#f5d0fe" />
      <g className="email-sent-letter">
        <rect x="63" y="30" width="94" height="72" rx="8" fill="#fff" filter={`url(#${id}-shadow)`} />
        <rect x="75" y="42" width="52" height="5" rx="2.5" fill="#e2e8f0" />
        <rect x="75" y="52" width="70" height="4" rx="2" fill="#f1f5f9" />
        <rect x="75" y="62" width="70" height="17" rx="8.5" fill={`url(#${id}-button)`} />
        <text x="110" y="73.5" textAnchor="middle" fontSize="7.6" fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">{button}</text>
      </g>
      <path d="M48 64 L110 100 L172 64 V112 a10 10 0 0 1 -10 10 H58 a10 10 0 0 1 -10 -10 Z" fill={`url(#${id}-brand)`} />
      <path d="M48 112 L92 88 M172 112 L128 88" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <g className="email-sent-tick" data-testid="email-sent-tick">
        <circle cx="168" cy="58" r="15" fill="#10b981" stroke="#fff" strokeWidth="3" />
        <path className="email-sent-tick-mark" d="M161 58.5 l5 5 l9 -10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M36 40 L38 34 L40 40 L46 42 L40 44 L38 50 L36 44 L30 42 Z" fill="#fbbf24" />
      <path d="M186 98 L187.5 94 L189 98 L193 99.5 L189 101 L187.5 105 L186 101 L182 99.5 Z" fill="#a78bfa" />
    </svg>
  );
}
