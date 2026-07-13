import Joyride, { STATUS } from 'react-joyride';
import { AlertTriangle } from 'lucide-react';

// Shared wrapper around react-joyride, used identically by all 4 stages
// (Dashboard/Products/Orders/Settings). Every step gets a Skip button; tapping
// it opens a confirm modal before actually ending the tour, so a stray tap
// doesn't silently lose someone's place.
export default function TourGuide({ steps, run, onFinish, tour }) {
  const handleCallback = (data) => {
    const { status, action } = data;
    if (status === STATUS.FINISHED) {
      onFinish();
    } else if (action === 'skip') {
      tour.requestSkip();
    }
  };

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        showSkipButton
        showProgress
        disableScrolling={false}
        callback={handleCallback}
        locale={{ back: 'Back', close: 'Close', last: 'Done', next: 'Next', skip: 'Skip' }}
        styles={{
          options: {
            primaryColor: '#8b5cf6',
            zIndex: 10000,
            arrowColor: '#fff',
            backgroundColor: '#fff',
            textColor: '#0f172a',
          },
          tooltip: { borderRadius: 16, padding: 18 },
          tooltipContent: { padding: '8px 0', fontSize: 14, lineHeight: 1.5 },
          buttonNext: { borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700 },
          buttonBack: { fontSize: 13, color: '#64748b' },
          buttonSkip: { fontSize: 13, color: '#94a3b8' },
        }}
      />

      {tour.showSkipConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 22px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: '#d97706' }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 6px', color: '#0f172a' }}>Skip the tour?</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px', lineHeight: 1.5 }}>
              You can replay it anytime from Settings.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={tour.cancelSkip}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={tour.confirmSkip}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0f172a', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Skip Tour
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
