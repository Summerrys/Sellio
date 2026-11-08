import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SellioLoadingMark } from './AppLoader';

// A page's loading state (Alvin, 7 Nov 2026): grey placeholder shapes in the page's own
// layout, with Sellio's small logo and bouncing dots over them (the full-screen loader's
// mark, AppLoader; 8 Nov), on their own with no card behind them, in the middle of the
// screen whatever the shapes (8 Nov; drawn on the page's body, so nothing on the page can
// move it). One component draws both, so they appear in the same moment and go in the same
// moment the page shows its content. Everything moves to the dots' 1.2-second beat: the
// shapes' sweep, the logo's pulse, and the older skeletons a page wraps in it (AppLoader's
// .sellio-shimmer, Tailwind's animate-pulse). Still loading after 12 seconds: a Reload offer
// under the mark, as on the full-screen loader.
const STYLE_ID = 'sellio-loading-shapes-css';

const CSS = `
@keyframes sellio-loading-sweep { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.sellio-loading .sellio-shape {
  background: linear-gradient(90deg, #f0f0f0 25%, #e6e8eb 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: sellio-loading-sweep 1.2s linear infinite;
}
.sellio-loading .sellio-shimmer, .sellio-loading .animate-pulse { animation-duration: 1.2s !important; }
.sellio-loading-centre .sellio-logo-pulse { animation-duration: 1.2s; }
.sellio-loading-centre {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 25;
  display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none;
}
.sellio-loading-mark { display: flex; }
.sellio-loading-slow {
  pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 260px;
  padding: 10px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.97); text-align: center;
  font-size: 13px; line-height: 1.4; color: #475569; box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.35);
}
.sellio-loading-slow button {
  min-height: 40px; padding: 0 18px; border: 0; border-radius: 12px; cursor: pointer;
  font-size: 14px; font-weight: 600; color: #fff;
  background: var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%));
}
@media (prefers-reduced-motion: reduce) {
  .sellio-loading .sellio-shape, .sellio-loading-centre .sellio-logo-pulse,
  .sellio-loading-centre .sellio-dot-1, .sellio-loading-centre .sellio-dot-2, .sellio-loading-centre .sellio-dot-3 { animation: none; }
}
`;

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// One grey placeholder shape (inside LoadingShapes).
export function Shape({ w = '100%', h = 12, r = 8, className = '', style }) {
  return <div className={`sellio-shape ${className}`} style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

export default function LoadingShapes({ children, label = 'Loading', className = '', style, slowAfterMs = 12000 }) {
  injectCss();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowAfterMs) return undefined;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid="loading-shapes"
      className={`sellio-loading ${className}`}
      style={{ position: 'relative', ...style }}
    >
      <div aria-hidden="true">{children}</div>
      {typeof document === 'undefined' ? null : createPortal(
        <div className="sellio-loading-centre" data-testid="loading-centre">
          <span className="sellio-loading-mark" data-testid="loading-mark"><SellioLoadingMark /></span>
          {slow && (
            <span className="sellio-loading-slow">
              <span>This is taking longer than usual.</span>
              <button type="button" onClick={() => window.location.reload()}>Reload</button>
            </span>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Shapes for the pages that have no skeleton of their own ─────────────────────────────

const card = 'rounded-2xl bg-white border border-slate-100';

// Rows of a list: an optional square or round picture, two lines, something on the right.
export function ListShapes({ rows = 5, picture = 'square', side = true, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${card} p-3 flex items-center gap-3`}>
          {picture && <Shape w={44} h={44} r={picture === 'round' ? 22 : 12} />}
          <div className="flex-1 min-w-0 space-y-2">
            <Shape w={`${62 - (i % 3) * 8}%`} h={12} />
            <Shape w={`${40 - (i % 2) * 8}%`} h={10} />
          </div>
          {side && <Shape w={52} h={12} />}
        </div>
      ))}
    </div>
  );
}

// The Dashboard: the four numbers, the order meter, Quick Access, Recent Orders, the chart.
export function DashboardShapes() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-slate-100 shadow-sm py-2.5 px-1 flex flex-col items-center gap-1.5">
            <Shape w={28} h={28} r={8} />
            <Shape w="62%" h={13} />
            <Shape w="78%" h={8} />
          </div>
        ))}
      </div>
      <div className={`${card} px-4 py-3 space-y-2.5`}>
        <Shape w="45%" h={10} />
        <Shape h={8} r={8} />
      </div>
      <div>
        <Shape w={110} h={12} />
        <div className="flex gap-2.5 mt-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => <Shape key={i} w={80} h={88} r={16} />)}
        </div>
      </div>
      <div className="rounded-xl bg-white shadow-sm p-6">
        <Shape w={140} h={16} />
        <div className="mt-5 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Shape w={40} h={40} r={12} />
              <div className="flex-1 space-y-2"><Shape w={`${58 - i * 6}%`} h={11} /><Shape w="34%" h={9} /></div>
              <Shape w={48} h={12} />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white shadow-sm p-6">
        <Shape w={150} h={16} />
        <Shape h={200} r={12} style={{ marginTop: 20 }} />
      </div>
    </div>
  );
}

// A shop's page before its look is known: banner, logo and name, categories, items.
export function StoreShapes() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Shape h={150} r={0} />
      <div className="px-4">
        <div className="flex items-end gap-3 -mt-7">
          <Shape w={64} h={64} r={32} style={{ boxShadow: '0 0 0 4px #fff' }} />
          <div className="flex-1 space-y-2 pb-1"><Shape w="55%" h={16} /><Shape w="35%" h={10} /></div>
        </div>
        <div className="flex gap-2 mt-6 overflow-hidden">
          {[72, 64, 88, 70].map((w, i) => <Shape key={i} w={w} h={32} r={999} />)}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-100 overflow-hidden">
              <Shape h={130} r={0} />
              <div className="p-3 space-y-2"><Shape w="70%" h={12} /><Shape w="35%" h={11} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tables & QR: a zone's name, then table cards.
export function TableShapes() {
  return (
    <div>
      <Shape w={90} h={12} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${card} p-4 space-y-3`}>
            <div className="flex items-center justify-between"><Shape w="50%" h={14} /><Shape w={22} h={22} r={6} /></div>
            <Shape w="35%" h={10} />
            <div className="flex gap-1.5">{[0, 1, 2, 3].map((j) => <Shape key={j} w="auto" h={26} r={8} style={{ flex: '1 1 0' }} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reports: the date and tabs, four numbers, a chart.
export function ReportShapes() {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><Shape w={210} h={22} /><Shape w={260} h={12} /></div>
      <Shape w={230} h={40} r={12} />
      <div className="flex gap-2 overflow-hidden">{[60, 66, 70, 76, 48].map((w, i) => <Shape key={i} w={w} h={30} r={8} />)}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${card} p-4 space-y-2.5`}><Shape w="55%" h={10} /><Shape w="70%" h={20} /></div>
        ))}
      </div>
      <div className={`${card} p-5`}><Shape w={160} h={14} /><Shape h={220} r={12} style={{ marginTop: 16 }} /></div>
    </div>
  );
}
