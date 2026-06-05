/**
 * AppLoader — branded full-screen loading screen for app initialisation
 * BrandedSpinner — inline button spinner
 * SkeletonCard — shimmer skeleton placeholder
 */
import { useState, useEffect } from 'react';

const CSS = `
@keyframes sellio-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}
@keyframes sellio-pulse-logo {
  0%, 100% { transform: scale(1.0); }
  50% { transform: scale(1.05); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes sellio-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.sellio-dot-1 { animation: sellio-bounce 1.2s ease-in-out infinite 0ms; background: #fb923c; }
.sellio-dot-2 { animation: sellio-bounce 1.2s ease-in-out infinite 200ms; background: #e0449a; }
.sellio-dot-3 { animation: sellio-bounce 1.2s ease-in-out infinite 400ms; background: #8b2fc9; }
.sellio-logo-pulse { animation: sellio-pulse-logo 1.5s ease-in-out infinite; }
.sellio-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: sellio-shimmer 1.5s infinite;
}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ── Full-screen app loading screen ──────────────────────────────────────────
export default function AppLoader({ visible = true }) {
  injectCSS();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setShow(true), 30);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [visible]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: '#ffffff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        opacity: show ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Logo */}
      <img
        src="https://assets.apptelier.sg/sellio/Logo_Sellio.png"
        alt="Sellio"
        className="sellio-logo-pulse"
        style={{ width: 80, objectFit: 'contain', marginBottom: 24 }}
      />

      {/* Bouncing dots */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
        <span className="sellio-dot-1" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
        <span className="sellio-dot-2" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
        <span className="sellio-dot-3" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
      </div>

      {/* Text */}
      <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Loading...</p>
    </div>
  );
}

// ── Button inline spinner (white, 16px) ─────────────────────────────────────
export function BtnSpinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 16, height: 16,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      borderTop: '2px solid white',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ── Shimmer skeleton card ────────────────────────────────────────────────────
export function SkeletonCard({ lines = 2, imageSize = 64, className = '' }) {
  injectCSS();
  return (
    <div
      className={className}
      style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}
    >
      {imageSize > 0 && (
        <div
          className="sellio-shimmer"
          style={{ width: imageSize, height: imageSize, borderRadius: 10, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="sellio-shimmer" style={{ height: 13, borderRadius: 6, width: '70%' }} />
        {lines >= 2 && <div className="sellio-shimmer" style={{ height: 11, borderRadius: 6, width: '50%' }} />}
        {lines >= 3 && <div className="sellio-shimmer" style={{ height: 11, borderRadius: 6, width: '35%' }} />}
      </div>
    </div>
  );
}

// ── Skeleton stat card ────────────────────────────────────────────────────────
export function SkeletonStatCard() {
  injectCSS();
  return (
    <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div className="sellio-shimmer" style={{ width: 28, height: 28, borderRadius: 8 }} />
      <div className="sellio-shimmer" style={{ width: '60%', height: 18, borderRadius: 6 }} />
      <div className="sellio-shimmer" style={{ width: '80%', height: 10, borderRadius: 5 }} />
    </div>
  );
}

// ── N skeleton cards stacked ─────────────────────────────────────────────────
export function SkeletonList({ count = 4, lines = 2, imageSize = 64 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} imageSize={imageSize} />
      ))}
    </div>
  );
}