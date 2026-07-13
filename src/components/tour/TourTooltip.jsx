import { X } from 'lucide-react';

// Custom Joyride tooltip \u2014 replaces the library's default look with something that
// matches the app's own visual language (brand gradient, rounded cards), and gives
// us full control over the Skip button so it can trigger a confirm step instead of
// immediately closing the tour (Joyride's built-in skip button can't do that).
export default function TourTooltip({
  index,
  step,
  size,
  backProps,
  primaryProps,
  skipProps,
  isLastStep,
  tooltipProps,
}) {
  return (
    <div
      {...tooltipProps}
      style={{
        background: 'white',
        borderRadius: 20,
        padding: '20px 20px 16px',
        maxWidth: 320,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
        border: '1px solid #f1f5f9',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        {step.title && (
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', paddingRight: 8 }}>{step.title}</p>
        )}
        <button
          {...skipProps}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          title="Skip tour"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 18 }}>
        {step.content}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
          {index + 1} of {size}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {index > 0 && (
            <button
              {...backProps}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--color-primary-gradient)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {isLastStep ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
