// Shown when the tour's Skip (X) button is tapped \u2014 requires an explicit second
// confirmation before actually marking the tour as seen, so an accidental tap
// doesn't permanently dismiss onboarding guidance.
export default function SkipConfirmModal({ onCancel, onConfirm }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'white', borderRadius: 20, padding: '24px', maxWidth: 320, width: '100%', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontWeight: 800, fontSize: 17, margin: '0 0 8px', color: '#0f172a' }}>Skip the tour?</p>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
          You can replay it anytime from Settings.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#334155', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#ef4444', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Skip Tour
          </button>
        </div>
      </div>
    </div>
  );
}
