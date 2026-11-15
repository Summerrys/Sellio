import React, { useEffect, useRef } from 'react';

// The "Order placed!" moment (UX state 10, Alvin's reference clip, 15 Nov 2026): a green dot
// pops into the check inside a soft ring, the tick draws in, and a burst of confetti flies out
// from it, drifts down and fades within about two seconds. Once, when the screen opens. People
// who turn motion off get the finished check and no confetti (index.css has the keyframes).
const COLOURS = ['#22c55e', '#3b82f6', '#f97316', '#f472b6', '#facc15', '#8b5cf6'];
const PIECES = 36;

function motionOff() {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
}

export function launchConfetti(host, random = Math.random) {
  if (!host || typeof host.animate !== 'function' || motionOff()) return () => {};
  const pieces = [];
  for (let i = 0; i < PIECES; i += 1) {
    const piece = document.createElement('span');
    const width = 6 + random() * 5;
    const height = 3 + random() * 4;
    piece.setAttribute('data-confetti', '');
    piece.style.cssText = `position:absolute;left:50%;top:50%;width:${width}px;height:${height}px;margin:${-height / 2}px 0 0 ${-width / 2}px;border-radius:1.5px;background:${COLOURS[i % COLOURS.length]};opacity:0;pointer-events:none;`;
    host.appendChild(piece);
    pieces.push(piece);
    // Out in every direction, a little further for some, then down as if falling.
    const angle = (Math.PI * 2 * i) / PIECES + (random() - 0.5) * 0.5;
    const distance = 70 + random() * 95;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const spin = (random() - 0.5) * 760;
    piece.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(0.5)', opacity: 0 },
      { transform: `translate(${x * 0.55}px, ${y * 0.55}px) rotate(${spin * 0.25}deg) scale(1)`, opacity: 1, offset: 0.14 },
      { transform: `translate(${x}px, ${y + 36}px) rotate(${spin * 0.65}deg) scale(1)`, opacity: 0.95, offset: 0.55 },
      { transform: `translate(${x * 1.08}px, ${y + 120 + random() * 50}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
    ], { duration: 1500 + random() * 600, delay: 360 + random() * 90, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
  }
  const timer = setTimeout(() => pieces.forEach((piece) => piece.remove()), 2800);
  return () => {
    clearTimeout(timer);
    pieces.forEach((piece) => piece.remove());
  };
}

export default function OrderPlacedCheck({ size = 76 }) {
  const confetti = useRef(null);
  useEffect(() => launchConfetti(confetti.current), []);
  const ring = size + 30;
  return (
    <div data-testid="order-placed-check" style={{ position: 'relative', width: ring, height: ring, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, flexShrink: 0 }}>
      <span aria-hidden="true" className="sellio-check-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#dcfce7' }} />
      <span aria-hidden="true" className="sellio-check-pop" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px -6px rgba(22,163,74,.6)' }}>
        <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline className="sellio-check-tick" points="20 6 9 17 4 12" />
        </svg>
      </span>
      <div ref={confetti} aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, overflow: 'visible', pointerEvents: 'none' }} />
    </div>
  );
}
