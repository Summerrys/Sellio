import React, { useEffect, useRef } from 'react';

// A tick that draws itself in a ring, with one burst of confetti (Alvin, 20 Nov 2026: a menu
// scanned and saved). Web Animations, played once. Nothing moves for people who ask their phone
// for less motion, or where the browser can't animate: the tick is simply there.
const COLORS = ['#fb923c', '#e0449a', '#8b2fc9', 'rgb(var(--color-primary))', '#10b981', '#facc15'];
export const CONFETTI_PIECES = 26;

const canAnimate = () => typeof document !== 'undefined' && typeof document.documentElement?.animate === 'function';
const lessMotion = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

// A piece's flight: up and out from the tick, then down, spinning. The same each time (no
// randomness), spread around straight up.
export function confettiPiece(i) {
  const spread = (i / (CONFETTI_PIECES - 1) - 0.5) * Math.PI * 1.5;
  const wobble = ((i * 37) % 11) / 11 - 0.5;
  const angle = -Math.PI / 2 + spread + wobble * 0.2;
  const reach = 80 + ((i * 53) % 70);
  const dx = Math.cos(angle) * reach * 1.25;
  const peak = Math.sin(angle) * reach;
  const fall = peak + 150 + ((i * 29) % 80);
  const turn = (i % 2 ? 1 : -1) * (260 + ((i * 71) % 460));
  const [width, height] = [[7, 11], [6, 6], [9, 5], [5, 10]][i % 4];
  return { dx, peak, fall, turn, width, height, round: width === height, color: COLORS[i % COLORS.length], delay: (i % 5) * 18 };
}

export default function Celebrate({ size = 76, height = 150 }) {
  const ring = useRef(null);
  const tick = useRef(null);
  const pieces = useRef([]);
  const still = useRef(!canAnimate() || lessMotion());

  useEffect(() => {
    if (still.current) return undefined;
    const running = [];
    const play = (el, frames, options) => {
      if (el && typeof el.animate === 'function') running.push(el.animate(frames, options));
    };
    play(ring.current, [{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'both' });
    play(tick.current, [{ strokeDashoffset: 30 }, { strokeDashoffset: 0 }], { duration: 420, delay: 260, easing: 'ease-out', fill: 'both' });
    pieces.current.forEach((el, i) => {
      const p = confettiPiece(i);
      play(el, [
        { transform: 'translate(0px, 0px) rotate(0deg) scale(0.4)', opacity: 0 },
        { transform: 'translate(0px, 0px) rotate(0deg) scale(0.6)', opacity: 1, offset: 0.06 },
        { transform: `translate(${p.dx * 0.85}px, ${p.peak}px) rotate(${p.turn * 0.45}deg) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${p.dx}px, ${p.fall}px) rotate(${p.turn}deg) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${p.dx}px, ${p.fall + 24}px) rotate(${p.turn}deg) scale(1)`, opacity: 0 },
      ], { duration: 1900, delay: 180 + p.delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
    });
    return () => running.forEach((animation) => animation.cancel());
  }, []);

  return (
    <div data-testid="celebrate" style={{ position: 'relative', width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!still.current && Array.from({ length: CONFETTI_PIECES }, (_, i) => {
        const p = confettiPiece(i);
        return (
          <span
            key={i}
            ref={(el) => { pieces.current[i] = el; }}
            data-testid="confetti"
            aria-hidden="true"
            style={{ position: 'absolute', left: '50%', top: '50%', width: p.width, height: p.height, marginLeft: -p.width / 2, marginTop: -p.height / 2, borderRadius: p.round ? 999 : 2, background: p.color, opacity: 0, pointerEvents: 'none' }}
          />
        );
      })}
      <div ref={ring} style={{ position: 'relative', width: size, height: size, borderRadius: 999, border: '6px solid #10b981', boxSizing: 'border-box', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path ref={tick} d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 30, strokeDashoffset: still.current ? 0 : 30 }} />
        </svg>
      </div>
    </div>
  );
}
