/**
 * AppLoader — branded full-screen loading screen for app initialisation
 * BrandedSpinner — inline button spinner
 * SkeletonCard — shimmer skeleton placeholder
 */

const CSS = `
@keyframes sellio-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
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
@media (prefers-reduced-motion: reduce) {
  .sellio-dot-1, .sellio-dot-2, .sellio-dot-3 { animation: none; }
}
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
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Loading Sellio"
      data-sellio-startup
      style={{
        position: 'fixed', inset: 0,
        background: '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', zIndex: 9999,
      }}
    >
      <div aria-hidden="true" style={{
        position: 'absolute', width: 480, height: 480, top: -80, left: -100,
        borderRadius: '50%', filter: 'blur(64px)', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(254,120,36,0.08) 0%, transparent 70%)',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', width: 400, height: 400, bottom: -60, right: -80,
        borderRadius: '50%', filter: 'blur(64px)', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(254,120,36,0.06) 0%, transparent 70%)',
      }} />
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', padding: '0 32px', boxSizing: 'border-box',
        position: 'relative',
      }}>
        <img
          src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
          alt="Sellio"
          style={{
            height: 'clamp(100px, 25dvh, 200px)', maxWidth: '100%',
            objectFit: 'contain', marginBottom: 40, flexShrink: 0,
          }}
        />
        {/* Outlined lettering preserves the splash at every Android font size. */}
        <img
          src="/branding/sellio-splash-tagline.svg"
          alt="Your business, beautifully online."
          style={{
            display: 'block', width: 256.98, maxWidth: '100%', height: 'auto',
            aspectRatio: '256.98 / 86.5', marginBottom: 48, flexShrink: 0,
          }}
        />
        <div aria-hidden="true" style={{ display: 'flex', gap: 8 }}>
          <span className="sellio-dot-1" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
          <span className="sellio-dot-2" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
          <span className="sellio-dot-3" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
        </div>
      </div>
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